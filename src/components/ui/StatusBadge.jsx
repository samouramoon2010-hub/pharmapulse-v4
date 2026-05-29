// ============================================================
// StatusBadge — Semantic traffic-light / KPI status badge
// Phase: Design Tokens Foundation Lite
//
// Pure presentational. Safe fallback for unknown status.
// Replaces ad-hoc inline badge styling across pages.
// ============================================================
import React from 'react'
import { KPI_TRAFFIC_COLORS, RISK_COLORS, COLORS } from '../../design/tokens'

// ── Status config maps ─────────────────────────────────────

const TRAFFIC_MAP = {
  excellent: KPI_TRAFFIC_COLORS.excellent,
  good:      KPI_TRAFFIC_COLORS.good,
  warning:   KPI_TRAFFIC_COLORS.warning,
  critical:  KPI_TRAFFIC_COLORS.critical,
}

const RISK_MAP = {
  low:      RISK_COLORS.low,
  medium:   RISK_COLORS.medium,
  high:     RISK_COLORS.high,
  critical: RISK_COLORS.critical,
}

const SEMANTIC_MAP = {
  active:   { color: '#22c55e',  bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.20)',   label: 'Active'   },
  inactive: { color: '#a1a1aa',  bg: 'rgba(161,161,170,0.10)', border: 'rgba(161,161,170,0.20)', label: 'Inactive' },
  pending:  { color: '#f59e0b',  bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.20)',  label: 'Pending'  },
  approved: { color: '#22c55e',  bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.20)',   label: 'Approved' },
  rejected: { color: '#ef4444',  bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.20)',   label: 'Rejected' },
  draft:    { color: '#6366f1',  bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.20)',  label: 'Draft'    },
  archived: { color: '#52525b',  bg: 'rgba(82,82,91,0.10)',    border: 'rgba(82,82,91,0.20)',    label: 'Archived' },
}

const FALLBACK_CFG = {
  color:  COLORS.kpiFallback,
  bg:     'rgba(161,161,170,0.10)',
  border: 'rgba(161,161,170,0.20)',
  label:  '—',
}

/**
 * StatusBadge — shows a semantic colored pill badge.
 *
 * @param {string}  status     - Key: 'excellent'|'good'|'warning'|'critical'|'low'|'medium'|'high'|'active'|'inactive'|'pending'|...
 * @param {string}  [variant]  - 'traffic'|'risk'|'semantic' (auto-detected if omitted)
 * @param {string}  [label]    - Override display text (defaults to status config label)
 * @param {boolean} [dot=true] - Show leading dot
 * @param {string}  [className]
 */
export default function StatusBadge({
  status,
  variant,
  label,
  dot = true,
  className = '',
  style = {},
}) {
  // Auto-detect variant from status key
  const resolvedVariant = variant || (
    status in TRAFFIC_MAP ? 'traffic' :
    status in RISK_MAP    ? 'risk'    :
    status in SEMANTIC_MAP? 'semantic': 'semantic'
  )

  const cfg = (
    resolvedVariant === 'traffic' ? TRAFFIC_MAP[status] :
    resolvedVariant === 'risk'    ? RISK_MAP[status]    :
    SEMANTIC_MAP[status]
  ) ?? FALLBACK_CFG

  const displayLabel = label ?? (
    resolvedVariant === 'traffic'
      ? (cfg.labelAr || cfg.label)
      : cfg.label
  ) ?? status ?? '—'

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${className}`}
      style={{
        fontSize:       '10px',
        padding:        '2px 8px',
        borderRadius:   '9999px',
        color:          cfg.color,
        background:     cfg.bg,
        border:         `1px solid ${cfg.border}`,
        fontFamily:     "'Inter', sans-serif",
        letterSpacing:  '0.01em',
        whiteSpace:     'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          display: 'inline-block',
        }} />
      )}
      {displayLabel}
    </span>
  )
}
