// ============================================================
// ActionStatusBadge — Action lifecycle status pill
// Phase 3C-3A
//
// Pure presentational. One prop: status (string).
// Variants: SUGGESTED | ACCEPTED | DISMISSED | CLOSED
// ============================================================
import React from 'react'
import { COLORS } from '../../design/tokens'

const STATUS_CONFIG = {
  SUGGESTED: {
    color:  COLORS.info,
    bg:     COLORS.infoBg,
    border: COLORS.infoBorder,
    label:  'Suggested',
  },
  ACCEPTED: {
    color:  COLORS.success,
    bg:     COLORS.successBg,
    border: COLORS.successBorder,
    label:  'Accepted',
  },
  DISMISSED: {
    color:  '#64748B',
    bg:     'rgba(100,116,139,0.10)',
    border: 'rgba(100,116,139,0.18)',
    label:  'Dismissed',
  },
  CLOSED: {
    color:  COLORS.kpiFallback,
    bg:     'rgba(148,163,184,0.10)',
    border: 'rgba(148,163,184,0.18)',
    label:  'Closed',
  },
}

const FALLBACK = {
  color:  COLORS.kpiFallback,
  bg:     'rgba(148,163,184,0.10)',
  border: 'rgba(148,163,184,0.18)',
  label:  '—',
}

export default function ActionStatusBadge({ status, className = '' }) {
  const cfg = STATUS_CONFIG[status] ?? FALLBACK
  const label = cfg.label

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${className}`}
      style={{
        fontSize:      '10px',
        padding:       '2px 8px',
        borderRadius:  '9999px',
        color:         cfg.color,
        background:    cfg.bg,
        border:        `1px solid ${cfg.border}`,
        fontFamily:    "'Inter', sans-serif",
        letterSpacing: '0.01em',
        whiteSpace:    'nowrap',
      }}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: cfg.color,
        flexShrink: 0,
        display: 'inline-block',
      }} />
      {label}
    </span>
  )
}
