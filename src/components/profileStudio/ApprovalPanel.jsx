// ============================================================
// ApprovalPanel — Approval flow (Phase 3D)
//
// Uses ONLY the existing workflow kernel — approveDraft() and the
// readiness gate validateLifecycleReadiness() from advancedValidation.ts.
// No custom workflow logic, no bypassing readiness.
//
// Visible only to admin and general_manager (canApprove). Requires
// the profile to be in SIMULATED status. On approve, persists the
// transition via the existing updateProfileDocument() service call,
// which automatically appends an APPROVE audit log entry.
//
// NO Drag & Drop. NO AI. NO Excel import. NO Diff Viewer.
// NO Governance Dashboard. NO Evaluation Engine changes.
// NO rollback. NO restore.
// ============================================================
import React, { useState } from 'react'
import { CheckCircle2, Loader2, AlertCircle, AlertTriangle } from 'lucide-react'

import ApprovalStatusBadge from './ApprovalStatusBadge'
import { useToastStore } from '../ui/Toast'

import { approveDraft } from '../../profileStudio/workflow'
import { validateLifecycleReadiness } from '../../profileStudio/advancedValidation'
import { updateProfileDocument } from '../../profileStudio/profileStudioService'
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

export default function ApprovalPanel({ profile, actor, onSaved }) {
  const permissions = useProfileStudioPermissions({ role: actor?.role, profileStatus: profile?.status })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  if (!profile || !permissions.canApprove) return null

  const draftLike = toDraftLike(profile)
  const readiness = validateLifecycleReadiness(draftLike)
  const isSimulated = profile.status === 'SIMULATED'
  const canSubmit = isSimulated && readiness.valid && !submitting

  const handleApprove = async () => {
    if (submitting) return
    if (!isSimulated) {
      toast.error('Profile must be in SIMULATED status to approve')
      return
    }
    if (!readiness.valid) {
      toast.error('Profile is not ready for approval')
      return
    }

    setSubmitting(true)
    try {
      const result = approveDraft(draftLike, actor.uid, notes.trim() || undefined)
      if (!result.success) {
        toast.error(result.issues[0] || 'Approval failed readiness check')
        return
      }

      await updateProfileDocument(profile.id, {
        status: 'APPROVED',
        approvedBy: actor.uid,
        _action: 'APPROVE',
      }, actor)

      toast.success('Profile approved')
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <ApprovalStatusBadge status={profile.status} readinessValid={readiness.valid} />
      </div>

      {!isSimulated && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Approval requires SIMULATED status. Current status: {profile.status}.
        </div>
      )}

      {isSimulated && readiness.issues.length > 0 && (
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

      {isSimulated && (
        <div style={{ marginBottom: '8px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Approval notes"
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
        onClick={handleApprove}
        disabled={!canSubmit}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', fontWeight: 500,
          color: canSubmit ? '#34d399' : 'var(--text-muted)',
          background: canSubmit ? 'rgba(52,211,153,0.08)' : 'var(--bg-overlay)',
          border: `1px solid ${canSubmit ? 'rgba(52,211,153,0.2)' : 'var(--border-subtle)'}`,
          borderRadius: '6px', padding: '6px 12px',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <CheckCircle2 style={{ width: 11, height: 11 }} />}
        {submitting ? 'Approving…' : 'Approve'}
      </button>
    </div>
  )
}
