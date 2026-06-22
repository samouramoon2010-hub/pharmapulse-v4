// ============================================================
// ProfileStatusBadge — Profile Studio status pill (Phase 2A)
// ============================================================
import React from 'react'

const STATUS_STYLE = {
  DRAFT:     { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)',  color: '#818cf8', label: 'Draft'     },
  VALIDATED: { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  color: '#60a5fa', label: 'Validated' },
  SIMULATED: { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.2)',  color: '#a78bfa', label: 'Simulated' },
  APPROVED:  { bg: 'rgba(45,125,90,0.08)',   border: 'rgba(45,125,90,0.2)',   color: '#34d399', label: 'Approved'  },
  PUBLISHED: { bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.2)',   color: '#10b981', label: 'Published' },
  ARCHIVED:  { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', color: '#94a3b8', label: 'Archived'  },
}

const FALLBACK = {
  bg: 'var(--bg-overlay)', border: 'var(--border-subtle)',
  color: 'var(--text-muted)', label: 'Unknown',
}

export default function ProfileStatusBadge({ status, size = 'sm' }) {
  const s = STATUS_STYLE[status] || FALLBACK
  const compact = size === 'xs'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: compact ? '1px 6px' : '2px 8px',
      borderRadius: '99px',
      fontSize: compact ? '10px' : '11px',
      fontWeight: 500,
      fontFamily: "'Inter', sans-serif",
      letterSpacing: '-0.01em',
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.color,
    }}>
      {s.label}
    </span>
  )
}
