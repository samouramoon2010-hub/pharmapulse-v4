// ============================================================
// ApprovalStatusBadge — Approval-stage status pill (Phase 3D)
//
// Pure presentational. Derives its label purely from the profile's
// current status and the kernel-computed readiness flag — never
// invents its own readiness logic.
// ============================================================
import React from 'react'

const STYLES = {
  AWAITING:   { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', color: '#94a3b8', label: 'Awaiting Simulation' },
  NOT_READY:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  color: '#fbbf24', label: 'Not Ready' },
  READY:      { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  color: '#60a5fa', label: 'Ready to Approve' },
  APPROVED:   { bg: 'rgba(45,125,90,0.08)',   border: 'rgba(45,125,90,0.2)',   color: '#34d399', label: 'Approved' },
  PUBLISHED:  { bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.2)',   color: '#10b981', label: 'Published' },
}

export default function ApprovalStatusBadge({ status, readinessValid }) {
  let style = STYLES.AWAITING

  if (status === 'PUBLISHED') {
    style = STYLES.PUBLISHED
  } else if (status === 'APPROVED') {
    style = STYLES.APPROVED
  } else if (status === 'SIMULATED') {
    style = readinessValid ? STYLES.READY : STYLES.NOT_READY
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 500,
      fontFamily: "'Inter', sans-serif",
      background: style.bg, border: `1px solid ${style.border}`, color: style.color,
    }}>
      {style.label}
    </span>
  )
}
