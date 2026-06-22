// ============================================================
// ActionCard — Single action item with status, priority, and
// action buttons.
// Phase 3C-3A / 3C-4D
//
// Props:
//   action      — SuggestedAction object
//   onAccept    — (id) => void
//   onDismiss   — (id, reason) => void
//   onClose     — (id, recoveryPayload?) => void
//   isUpdating  — boolean — disables all buttons, shows spinner
//
// UI states: idle | dismiss_expanded | recovery_expanded | updating
// No navigation. No Firestore. Self-contained.
// ============================================================
import React, { useState } from 'react'
import { User, Calendar } from 'lucide-react'
import ActionStatusBadge   from './ActionStatusBadge'
import ActionPriorityBadge from './ActionPriorityBadge'
import { COLORS } from '../../design/tokens'

// ── Tiny CSS spinner ─────────────────────────────────────────

function Spinner() {
  return (
    <span
      style={{
        display:      'inline-block',
        width:        '10px',
        height:       '10px',
        borderRadius: '50%',
        border:       '2px solid rgba(255,255,255,0.25)',
        borderTopColor: '#fff',
        animation:    'spin 0.6s linear infinite',
        flexShrink:   0,
      }}
    />
  )
}

// ── Button base styles ───────────────────────────────────────

function actionBtn(variant, disabled) {
  const base = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           '5px',
    fontSize:      '11px',
    fontWeight:    500,
    padding:       '5px 12px',
    borderRadius:  '7px',
    cursor:        disabled ? 'not-allowed' : 'pointer',
    opacity:       disabled ? 0.5 : 1,
    fontFamily:    "'Inter', sans-serif",
    transition:    'opacity 0.15s',
    border:        '1px solid transparent',
  }
  if (variant === 'accept') {
    return { ...base, background: COLORS.successBg, border: `1px solid ${COLORS.successBorder}`, color: COLORS.success }
  }
  if (variant === 'dismiss') {
    return { ...base, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }
  }
  if (variant === 'close') {
    return { ...base, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }
  }
  if (variant === 'recovery-yes') {
    return { ...base, background: COLORS.successBg, border: `1px solid ${COLORS.successBorder}`, color: COLORS.success }
  }
  if (variant === 'recovery-no') {
    return { ...base, background: COLORS.dangerBg, border: `1px solid ${COLORS.dangerBorder}`, color: COLORS.danger }
  }
  if (variant === 'close-no-recovery') {
    return { ...base, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }
  }
  if (variant === 'submit-dismiss') {
    return { ...base, background: COLORS.dangerBg, border: `1px solid ${COLORS.dangerBorder}`, color: COLORS.danger }
  }
  if (variant === 'cancel') {
    return { ...base, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }
  }
  return base
}

// ── ActionCard ───────────────────────────────────────────────

export default function ActionCard({
  action,
  onAccept,
  onDismiss,
  onClose,
  isUpdating = false,
}) {
  const [dismissExpanded,  setDismissExpanded]  = useState(false)
  const [dismissReason,    setDismissReason]    = useState('')
  const [recoveryExpanded, setRecoveryExpanded] = useState(false)
  const [recoveryNotes,    setRecoveryNotes]    = useState('')
  const [activeBtn,        setActiveBtn]        = useState(null)

  if (!action) return null

  const {
    id,
    status,
    priority,
    actionType,
    relatedPharmacyId,
    ownerId,
    dueDate,
    signalType,
  } = action

  const title = action.title || actionType || signalType || 'Action required'
  const isBusy = isUpdating

  // Presentational only — pure string comparison against today's date,
  // mirroring the same dueDate < today check TasksPage.jsx already uses
  // for its aggregate overdue banner. No new calculation, no fabricated field.
  const isOpen = status === 'SUGGESTED' || status === 'ACCEPTED'
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = isOpen && !!dueDate && dueDate < today

  function handleAccept() {
    if (isBusy || !onAccept) return
    setActiveBtn('accept')
    onAccept(id)
  }

  function handleDismissClick() {
    if (isBusy) return
    setDismissExpanded(true)
  }

  function handleDismissCancel() {
    setDismissExpanded(false)
    setDismissReason('')
  }

  function handleDismissSubmit() {
    if (isBusy || !onDismiss) return
    setActiveBtn('dismiss')
    onDismiss(id, dismissReason)
  }

  function handleCloseClick() {
    if (isBusy || !onClose) return
    setRecoveryExpanded(true)
  }

  function handleRecoveryCancel() {
    setRecoveryExpanded(false)
    setRecoveryNotes('')
  }

  function handleCloseRecovered() {
    if (isBusy || !onClose) return
    setActiveBtn('close')
    onClose(id, { recovered: true, notes: recoveryNotes })
  }

  function handleCloseNotRecovered() {
    if (isBusy || !onClose) return
    setActiveBtn('close')
    onClose(id, { recovered: false, notes: recoveryNotes })
  }

  function handleCloseWithoutRecovery() {
    if (isBusy || !onClose) return
    setActiveBtn('close')
    onClose(id)
  }

  const canAccept  = status === 'SUGGESTED' && !!onAccept
  const canDismiss = status === 'SUGGESTED' && !!onDismiss
  const canClose   = status === 'ACCEPTED'  && !!onClose

  return (
    <div
      style={{
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding:      '12px 14px',
        display:      'flex',
        flexDirection:'column',
        gap:          '8px',
        boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Header row: badges + meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <ActionStatusBadge   status={status}   />
        <ActionPriorityBadge priority={priority} />
        {relatedPharmacyId && (
          <span style={{
            fontSize: '10px', color: 'var(--text-muted)',
            fontFamily: "'Inter', sans-serif", marginLeft: 'auto',
          }}>
            {relatedPharmacyId}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontSize:   '13px',
        fontWeight: 500,
        color:      'var(--text-primary)',
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.4,
      }}>
        {title}
      </div>

      {/* Owner + due date */}
      {(ownerId || dueDate) && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {ownerId && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif",
            }}>
              <User style={{ width: 11, height: 11 }} /> {ownerId}
            </span>
          )}
          {dueDate && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: isOverdue ? 600 : 400,
              color: isOverdue ? COLORS.warning : 'var(--text-muted)',
            }}>
              <Calendar style={{ width: 11, height: 11 }} /> Due: {dueDate}{isOverdue ? ' (overdue)' : ''}
            </span>
          )}
        </div>
      )}

      {/* Inline dismiss textarea */}
      {dismissExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <textarea
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder='Reason for dismissing (optional)'
            rows={2}
            disabled={isBusy}
            style={{
              background:   'var(--bg-elevated)',
              border:       '1px solid var(--border-default)',
              borderRadius: '7px',
              color:        'var(--text-primary)',
              fontSize:     '12px',
              fontFamily:   "'Inter', sans-serif",
              padding:      '7px 10px',
              resize:       'vertical',
              outline:      'none',
              width:        '100%',
              boxSizing:    'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleDismissSubmit}
              disabled={isBusy}
              style={actionBtn('submit-dismiss', isBusy)}
            >
              {isBusy && activeBtn === 'dismiss' ? <Spinner /> : null}
              Dismiss
            </button>
            <button
              onClick={handleDismissCancel}
              disabled={isBusy}
              style={actionBtn('cancel', isBusy)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline recovery panel — shown when closing an ACCEPTED action */}
      {recoveryExpanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px',
          padding: '10px 12px', borderRadius: '8px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>
            Recovery observed?
          </span>
          <textarea
            value={recoveryNotes}
            onChange={(e) => setRecoveryNotes(e.target.value)}
            placeholder='Notes (optional)'
            rows={2}
            disabled={isBusy}
            style={{
              background:   'var(--bg-surface)',
              border:       '1px solid var(--border-subtle)',
              borderRadius: '7px',
              color:        'var(--text-primary)',
              fontSize:     '12px',
              fontFamily:   "'Inter', sans-serif",
              padding:      '7px 10px',
              resize:       'vertical',
              outline:      'none',
              width:        '100%',
              boxSizing:    'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCloseRecovered}
              disabled={isBusy}
              style={actionBtn('recovery-yes', isBusy)}
            >
              {isBusy && activeBtn === 'close' ? <Spinner /> : null}
              Recovered
            </button>
            <button
              onClick={handleCloseNotRecovered}
              disabled={isBusy}
              style={actionBtn('recovery-no', isBusy)}
            >
              Not recovered
            </button>
            <button
              onClick={handleCloseWithoutRecovery}
              disabled={isBusy}
              style={actionBtn('close-no-recovery', isBusy)}
            >
              Close without recovery
            </button>
            <button
              onClick={handleRecoveryCancel}
              disabled={isBusy}
              style={actionBtn('cancel', isBusy)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!dismissExpanded && !recoveryExpanded && (canAccept || canDismiss || canClose) && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
          {canAccept && (
            <button
              onClick={handleAccept}
              disabled={isBusy}
              style={actionBtn('accept', isBusy)}
            >
              {isBusy && activeBtn === 'accept' ? <Spinner /> : null}
              Accept
            </button>
          )}
          {canDismiss && (
            <button
              onClick={handleDismissClick}
              disabled={isBusy}
              style={actionBtn('dismiss', isBusy)}
            >
              Dismiss
            </button>
          )}
          {canClose && (
            <button
              onClick={handleCloseClick}
              disabled={isBusy}
              style={actionBtn('close', isBusy)}
            >
              Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}
