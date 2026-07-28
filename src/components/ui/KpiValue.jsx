// ============================================================
// KpiValue — Safe KPI metric value display primitive
// Phase: Design Tokens Foundation Lite
//
// Pure presentational. Handles:
//   - null/undefined actual → shows '—'
//   - Numeric formatting (toLocaleString with safe fallback)
//   - Tabular-nums rendering
//   - Optional unit suffix
//   - Optional color (traffic-light or custom)
//   - 3 size variants: 'lg' | 'md' | 'sm'
// ============================================================
import React from 'react'
import { COLORS } from '../../design/tokens'

/** Format a KPI number safely — never crashes */
function formatKpiNum(value, precision = 0) {
  if (value === null || value === undefined || isNaN(Number(value))) return null
  const n = Number(value)
  if (!isFinite(n)) return null
  return precision > 0
    ? n.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
    : n.toLocaleString('en-US')
}

const SIZE_STYLES = {
  lg: { fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 },
  md: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 },
  sm: { fontSize: '1rem',    fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 },
  xs: { fontSize: '0.875rem',fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1 },
}

/**
 * @param {number|null|undefined} value   - The KPI actual value
 * @param {string}   [unit]               - Unit suffix (e.g. 'وصفة', 'SAR', '%')
 * @param {number}   [precision=0]        - Decimal places
 * @param {string}   [color]              - Text color (defaults to textPrimary)
 * @param {'lg'|'md'|'sm'|'xs'} [size='lg']
 * @param {string}   [emptyText='—']      - What to show when value is null/undefined
 * @param {string}   [className]
 */
export default function KpiValue({
  value,
  unit,
  precision = 0,
  color,
  size = 'lg',
  emptyText = '—',
  className = '',
  style = {},
}) {
  const formatted = formatKpiNum(value, precision)
  const sizeStyle = SIZE_STYLES[size] ?? SIZE_STYLES.lg
  const textColor = color ?? COLORS.textPrimary

  return (
    <span
      className={`nums ${className}`}
      style={{
        ...sizeStyle,
        color:         formatted ? textColor : COLORS.textMuted,
        fontFamily:    "'Inter', sans-serif",
        fontVariantNumeric: 'tabular-nums',
        display:       'inline-flex',
        alignItems:    'baseline',
        gap:           '3px',
        ...style,
      }}
    >
      {formatted ?? emptyText}
      {formatted && unit && (
        <span style={{
          fontSize:   '0.55em',
          fontWeight: 400,
          color:      COLORS.textMuted,
          letterSpacing: '0',
          marginRight: '2px',
        }}>
          {unit}
        </span>
      )}
    </span>
  )
}
