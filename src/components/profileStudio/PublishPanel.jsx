// ============================================================
// PublishPanel — Publish flow (Phase 3E)
//
// Uses ONLY the existing kernel — markPublishReady(),
// validatePublishReadiness(), exportPublishPackage(), and the
// existing createPublishPackageDocument() service call. No custom
// workflow logic, no bypassing readiness.
//
// Visible only to admin (Task 6 restricts Publish to admin even
// though the shared canPublishProfile permission also covers
// general_manager elsewhere in Profile Studio — this panel adds an
// explicit role check on top of the existing permission flag rather
// than narrowing the shared kernel matrix).
//
// Requires APPROVED status. Creates a publish package only — never
// mutates the profile document itself (the package + its automatic
// audit log entry are the durable record of publishing).
//
// NO Drag & Drop. NO AI. NO Excel import. NO Diff Viewer.
// NO Governance Dashboard. NO Evaluation Engine changes.
// NO rollback. NO restore. NO branch deployment. NO multi-profile compare.
// ============================================================
import React, { useState } from 'react'
import { Rocket, Loader2, AlertCircle, AlertTriangle } from 'lucide-react'

import PublishSummaryCard from './PublishSummaryCard'
import { useToastStore } from '../ui/Toast'

import { markPublishReady } from '../../profileStudio/workflow'
import { validatePublishReadiness } from '../../profileStudio/advancedValidation'
import { exportPublishPackage } from '../../profileStudio/exporter'
import { createPublishPackageDocument } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'

/** Reconstructs a kernel-shaped draft from the Firestore-shaped profile doc. */
function toDraftLike(profile) {
  return {
    metadata: { id: profile.id, name: profile.name, version: profile.version, status: profile.status, validFrom: profile.metadata?.validFrom },
    root: profile.hierarchy?.payload ?? {
      id: profile.hierarchy?.rootId || profile.id,
      label: profile.hierarchy?.rootLabel || profile.name,
      baskets: [],
    },
  }
}

export default function PublishPanel({ profile, actor, onSaved }) {
  const permissions = useProfileStudioPermissions({ role: actor?.role, profileStatus: profile?.status })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastPackage, setLastPackage] = useState(null)
  const toast = useToastStore()

  const isAdmin = actor?.role === 'admin'
  if (!profile || !permissions.canPublish || !isAdmin) return null

  const draftLike = toDraftLike(profile)
  const readiness = validatePublishReadiness(draftLike)
  const isApproved = profile.status === 'APPROVED'
  const canSubmit = isApproved && readiness.valid && !submitting

  const handlePublish = async () => {
    if (submitting) return
    if (!isApproved) {
      toast.error('Profile must be in APPROVED status to publish')
      return
    }
    if (!readiness.valid) {
      toast.error('Profile is not ready to publish')
      return
    }

    setSubmitting(true)
    try {
      const result = markPublishReady(draftLike, actor.uid, notes.trim() || undefined)
      if (!result.success) {
        toast.error(result.issues[0] || 'Publish readiness check failed')
        return
      }

      const pkg = exportPublishPackage(result.profile)

      await createPublishPackageDocument({
        packageId: pkg.packageId,
        profileId: pkg.profileId,
        version: pkg.profileVersion,
        hash: pkg.hash,
        validationSummary: profile.validationSummary,
        simulationSummary: profile.simulationSummary,
        exportPayload: pkg,
        publishedBy: actor.uid,
      }, actor)

      setLastPackage(pkg)
      toast.success('Publish package created')
      setNotes('')
      onSaved?.()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {!isApproved && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Publishing requires APPROVED status. Current status: {profile.status}.
        </div>
      )}

      {isApproved && readiness.issues.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {readiness.issues.map((issue, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '10px', padding: '2px 0',
              color: issue.severity === 'critical' || issue.severity === 'error' ? '#f87171' : '#fbbf24',
            }}>
              {issue.severity === 'critical' || issue.severity === 'error'
                ? <AlertCircle style={{ width: 10, height: 10 }} />
                : <AlertTriangle style={{ width: 10, height: 10 }} />}
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {isApproved && (
        <div style={{ marginBottom: '8px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Publish notes"
            style={{
              width: '100%', fontSize: '12px', color: 'var(--text-primary)',
              background: 'var(--bg-canvas)', border: '1px solid var(--border-default)',
              borderRadius: '6px', padding: '7px 10px', resize: 'vertical',
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handlePublish}
        disabled={!canSubmit}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', fontWeight: 500,
          color: canSubmit ? '#10b981' : 'var(--text-muted)',
          background: canSubmit ? 'rgba(16,185,129,0.08)' : 'var(--bg-overlay)',
          border: `1px solid ${canSubmit ? 'rgba(16,185,129,0.2)' : 'var(--border-subtle)'}`,
          borderRadius: '6px', padding: '6px 12px',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Rocket style={{ width: 11, height: 11 }} />}
        {submitting ? 'Publishing…' : 'Publish'}
      </button>

      {lastPackage && (
        <div style={{ marginTop: '10px' }}>
          <PublishSummaryCard pkg={lastPackage} />
        </div>
      )}
    </div>
  )
}
