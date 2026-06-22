// ============================================================
// SnapshotDiffRestorePanel — Diff Viewer + Rollback/Restore (Phase 1
// Closure Bundle)
//
// Adds two Profile Studio Phase 1 closure features on top of the
// existing (previously unused) profileStudioSnapshots collection:
//
//   - "Take Snapshot": freezes the CURRENT profile hierarchy into an
//     immutable snapshot document, via the existing
//     createProfileSnapshotDocument() service (no new collection).
//   - Diff Viewer: pick any two snapshots and compare them with the
//     pure diffSnapshots() kernel (profileDiff.ts) — added/removed/
//     changed baskets/elements/rules/processors. No production reads.
//   - Restore: turns a chosen snapshot into a brand-new DRAFT profile
//     via the pure restoreProfileFromSnapshot() kernel (restore.ts),
//     then persists it with the EXISTING createProfileDocument()
//     service — never overwrites the snapshot or the original
//     profile, never activates the restored profile.
//
// Visible only to roles that can approve/publish (admin,
// general_manager) — same gate as VersionHistoryPanel/SnapshotViewerPanel.
//
// NO Evaluation Engine changes. NO production Firestore contract
// changes. NO auto-activation — restored profiles are always DRAFT.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { GitCompare, Camera, RotateCcw, Loader2 } from 'lucide-react'

import EmptyState, { ErrorState } from '../ui/EmptyState'
import { SkeletonWidget } from '../ui/SkeletonCard'
import { useToastStore } from '../ui/Toast'

import {
  listProfileSnapshots,
  createProfileSnapshotDocument,
  createProfileDocument,
} from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'
import { createProfileSnapshot } from '../../profileStudio/exporter'
import { diffSnapshots } from '../../profileStudio/profileDiff'
import { restoreProfileFromSnapshot } from '../../profileStudio/restore'
import { calculateProfileHash } from '../../profileStudio/integrity'

/** Reconstructs a kernel-shaped EvaluationProfileDraft from the Firestore-shaped profile doc. */
function profileDocToDraft(profile) {
  return {
    metadata: {
      id:          profile.id,
      name:        profile.name,
      description: profile.metadata?.description,
      version:     profile.version,
      status:      profile.status,
      scope:       profile.scope,
      validFrom:   profile.metadata?.validFrom,
      validTo:     profile.metadata?.validTo,
      createdBy:   profile.createdBy,
      createdAt:   profile.createdAt,
      updatedAt:   profile.updatedAt,
    },
    root: profile.hierarchy?.payload ?? {
      id:      profile.hierarchy?.rootId || profile.id,
      label:   profile.hierarchy?.rootLabel || profile.name,
      baskets: [],
    },
  }
}

/** Adapts a Firestore snapshot doc (whose payload was written as a full draft by Take Snapshot) into the pure kernel's ProfileSnapshot shape. */
function snapshotDocToKernelSnapshot(doc) {
  return {
    snapshotId: doc.snapshotId,
    profileId:  doc.profileId,
    version:    doc.version,
    status:     doc.status,
    createdAt:  doc.createdAt,
    hash:       doc.hash,
    metadata:   doc.payload?.metadata ?? {},
    profile:    doc.payload,
  }
}

function summarizeHierarchy(rootNode) {
  const baskets = rootNode.baskets ?? []
  let elementCount = 0
  let ruleCount = 0
  for (const b of baskets) {
    const elements = b.elements ?? []
    elementCount += elements.length
    for (const e of elements) ruleCount += (e.rules ?? []).length
  }
  return { rootId: rootNode.id, rootLabel: rootNode.label, basketCount: baskets.length, elementCount, ruleCount, payload: rootNode }
}

function summarizeProcessors(rootNode) {
  const types = new Set()
  let totalStepCount = 0
  const walkSteps = (steps) => {
    for (const s of (steps ?? [])) { types.add(s.processorType); totalStepCount++ }
  }
  for (const b of (rootNode.baskets ?? [])) {
    walkSteps(b.pipeline?.steps)
    for (const e of (b.elements ?? [])) {
      walkSteps(e.pipeline?.steps)
      for (const r of (e.rules ?? [])) walkSteps(r.pipeline?.steps)
    }
  }
  return {
    processorTypes:      [...types],
    totalStepCount,
    hasZeroTargetGuard:  types.has('ZERO_TARGET_GUARD'),
    hasBandEvaluator:    types.has('BAND_EVALUATOR'),
    hasPenaltyEvaluator: types.has('PENALTY_EVALUATOR'),
    hasNodeAggregator:   types.has('NODE_AGGREGATOR'),
  }
}

function DiffSummaryRow({ label, count }) {
  if (!count) return null
  return (
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 0' }}>
      {label}: <strong style={{ color: 'var(--text-primary)' }}>{count}</strong>
    </div>
  )
}

export default function SnapshotDiffRestorePanel({ profile, actor, onRestored }) {
  const permissions = useProfileStudioPermissions({ role: actor?.role, profileStatus: profile?.status })
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [loaded, setLoaded]       = useState(false)
  const [taking, setTaking]       = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [diffAId, setDiffAId]     = useState('')
  const [diffBId, setDiffBId]     = useState('')
  const cancelledRef = useRef(false)
  const toast = useToastStore()

  const canView = permissions.canApprove || permissions.canPublish

  const refresh = () => {
    if (!profile || !canView) return
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    listProfileSnapshots(profile.id, actor)
      .then((list) => { if (!cancelledRef.current) { setSnapshots(list); setLoaded(true) } })
      .catch((err) => { if (!cancelledRef.current) setError(normalizeError(err)) })
      .finally(() => { if (!cancelledRef.current) setLoading(false) })
  }

  useEffect(() => {
    if (!profile || !canView || loaded) return
    refresh()
    return () => { cancelledRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, canView])

  if (!profile || !canView) return null
  if (loading) return <SkeletonWidget height={120} label="Diff & Restore" />
  if (error) return <ErrorState message={error.message} />

  const handleTakeSnapshot = async () => {
    setTaking(true)
    try {
      const draft = profileDocToDraft(profile)
      const kernelSnapshot = createProfileSnapshot(draft)
      await createProfileSnapshotDocument({
        snapshotId: kernelSnapshot.snapshotId,
        profileId:  profile.id,
        version:    profile.version,
        status:     profile.status,
        hash:       kernelSnapshot.hash,
        payload:    draft,
        metadata:   {
          description: profile.metadata?.description,
          scope:       profile.scope,
          validFrom:   profile.metadata?.validFrom,
          validTo:     profile.metadata?.validTo,
        },
      }, actor)
      toast.success('Snapshot captured')
      refresh()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setTaking(false)
    }
  }

  const handleRestore = async (doc) => {
    setRestoringId(doc.snapshotId)
    try {
      const kernelSnapshot = snapshotDocToKernelSnapshot(doc)
      const { profile: restoredDraft } = restoreProfileFromSnapshot(kernelSnapshot, { restoredBy: actor?.uid })
      const root = restoredDraft.root

      await createProfileDocument({
        id:      restoredDraft.metadata.id,
        name:    restoredDraft.metadata.name,
        version: restoredDraft.metadata.version,
        status:  restoredDraft.metadata.status, // always DRAFT — set by the kernel
        scope:   restoredDraft.metadata.scope,
        metadata: {
          description: restoredDraft.metadata.description,
          scope:        restoredDraft.metadata.scope,
          validFrom:    restoredDraft.metadata.validFrom,
          validTo:      restoredDraft.metadata.validTo,
        },
        hierarchy:  summarizeHierarchy(root),
        processors: summarizeProcessors(root),
        validationSummary: { valid: false, issueCount: 0, errorCount: 0, warningCount: 0, lastValidatedAt: null },
        simulationSummary: null,
        hash: calculateProfileHash(restoredDraft),
        createdBy:   actor?.uid,
        approvedBy:  null,
        publishedBy: null,
        publishedAt: null,
      }, actor)

      toast.success(`Restored as new draft "${restoredDraft.metadata.name}"`)
      onRestored?.()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setRestoringId(null)
    }
  }

  const diffA = snapshots.find((s) => s.snapshotId === diffAId)
  const diffB = snapshots.find((s) => s.snapshotId === diffBId)
  let diffResult = null
  let diffErrorMsg = null
  if (diffA && diffB) {
    try {
      diffResult = diffSnapshots(snapshotDocToKernelSnapshot(diffA), snapshotDocToKernelSnapshot(diffB))
    } catch (err) {
      diffErrorMsg = normalizeError(err).message
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitCompare style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Diff &amp; Restore
          </span>
        </div>
        <button
          type="button"
          onClick={handleTakeSnapshot}
          disabled={taking}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500,
            color: '#818cf8', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '6px', padding: '4px 9px', cursor: taking ? 'not-allowed' : 'pointer', opacity: taking ? 0.6 : 1,
          }}
        >
          {taking ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Camera style={{ width: 11, height: 11 }} />}
          Take Snapshot
        </button>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState icon={Camera} title="No snapshots yet" description="Take a snapshot to enable diffing and restore" compact />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <select
              value={diffAId}
              onChange={(e) => setDiffAId(e.target.value)}
              style={{
                flex: 1, fontSize: '11px', padding: '5px 6px', borderRadius: '6px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
              }}
            >
              <option value="">Compare: snapshot A…</option>
              {snapshots.map((s) => <option key={s.snapshotId} value={s.snapshotId}>v{s.version} · {s.hash?.slice(0, 8)}</option>)}
            </select>
            <select
              value={diffBId}
              onChange={(e) => setDiffBId(e.target.value)}
              style={{
                flex: 1, fontSize: '11px', padding: '5px 6px', borderRadius: '6px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
              }}
            >
              <option value="">…vs. snapshot B</option>
              {snapshots.map((s) => <option key={s.snapshotId} value={s.snapshotId}>v{s.version} · {s.hash?.slice(0, 8)}</option>)}
            </select>
          </div>

          {diffErrorMsg && <ErrorState message={diffErrorMsg} />}

          {diffResult && (
            <div style={{
              padding: '8px 10px', borderRadius: '8px', marginBottom: '10px',
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
            }}>
              {diffResult.identical ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No structural differences</div>
              ) : (
                <>
                  <DiffSummaryRow label="Baskets added" count={diffResult.basketsAdded.length} />
                  <DiffSummaryRow label="Baskets removed" count={diffResult.basketsRemoved.length} />
                  <DiffSummaryRow label="Baskets changed" count={diffResult.basketsChanged.length} />
                  <DiffSummaryRow label="Elements added" count={diffResult.elementsAdded.length} />
                  <DiffSummaryRow label="Elements removed" count={diffResult.elementsRemoved.length} />
                  <DiffSummaryRow label="Elements changed" count={diffResult.elementsChanged.length} />
                  <DiffSummaryRow label="Rules added" count={diffResult.rulesAdded.length} />
                  <DiffSummaryRow label="Rules removed" count={diffResult.rulesRemoved.length} />
                  <DiffSummaryRow label="Rules changed" count={diffResult.rulesChanged.length} />
                  <DiffSummaryRow label="Processor changes" count={diffResult.processorChanges.length} />
                </>
              )}
            </div>
          )}

          {snapshots.map((s) => (
            <div key={s.snapshotId} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px', borderRadius: '8px', marginBottom: '4px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                v{s.version} · {s.status} · {s.hash?.slice(0, 8)}
              </span>
              <button
                type="button"
                onClick={() => handleRestore(s)}
                disabled={restoringId === s.snapshotId}
                title="Restore as a new Draft — never overwrites this snapshot or the current profile"
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500,
                  color: 'var(--text-secondary)', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                  borderRadius: '6px', padding: '3px 8px', cursor: restoringId === s.snapshotId ? 'not-allowed' : 'pointer',
                  opacity: restoringId === s.snapshotId ? 0.6 : 1,
                }}
              >
                {restoringId === s.snapshotId ? <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" /> : <RotateCcw style={{ width: 10, height: 10 }} />}
                Restore as Draft
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
