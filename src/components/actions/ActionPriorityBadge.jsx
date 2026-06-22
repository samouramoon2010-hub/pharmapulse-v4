// ============================================================
// ActionPriorityBadge — Action priority pill
// Phase 3C-3A
//
// Pure presentational. One prop: priority (string).
// Variants: CRITICAL | HIGH | MEDIUM | LOW
// ============================================================
import React from 'react'
import { COLORS } from '../../design/tokens'

const PRIORITY_CONFIG = {
  CRITICAL: {
    color:  COLORS.danger,
    bg:     COLORS.dangerBg,
    border: COLORS.dangerBorder,
    label:  'Critical',
  },
  HIGH: {
    color:  COLORS.warning,
    bg:     COLORS.warningBg,
    border: COLORS.warningBorder,
    label:  'High',
  },
  MEDIUM: {
    color:  '#0D9BAA',
    bg:     'rgba(13,155,170,0.10)',
    border: 'rgba(13,155,170,0.20)',
    label:  'Medium',
  },
  LOW: {
    color:  '#64748B',
    bg:     'rgba(100,116,139,0.10)',
    border: 'rgba(100,116,139,0.18)',
    label:  'Low',
  },
}

const FALLBACK = {
  color:  COLORS.kpiFallback,
  bg:     'rgba(148,163,184,0.10)',
  border: 'rgba(148,163,184,0.18)',
  label:  '—',
}

export default function ActionPriorityBadge({ priority, className = '' }) {
  const cfg = PRIORITY_CONFIG[priority] ?? FALLBACK

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
      {cfg.label}
    </span>
  )
}
