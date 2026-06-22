// ============================================================
// TrackingOnlyBadge — Pilot KPI Visual Indicator
//
// Part A — Tracking Only UX System (Milestone 3)
//
// Single source of truth for the "Tracking Only / للمتابعة فقط"
// badge displayed on every surface where a pilot KPI appears.
//
// Design rules:
//   • Amber — distinct from production KPI green/cyan
//   • Pill shape — non-rectangular to differentiate from status badges
//   • Always visible — never tooltip-only, never dismissible
//   • Bilingual — English + Arabic inline
//
// Usage:
//   <TrackingOnlyBadge />                      — default (inline)
//   <TrackingOnlyBadge size="sm" />            — compact (for tiles/tabs)
//   <TrackingOnlyBadge size="lg" block />      — section header
//   <TrackingOnlyBadge notice />               — badge + disclaimer notice
// ============================================================
import React from 'react'

const AMBER = {
  color:  '#b45309',     // amber-700 — readable against dark + light bg
  bg:     'rgba(245,158,11,0.10)',
  border: 'rgba(245,158,11,0.28)',
}

const SIZE = {
  sm: { fontSize: '9px',  padding: '2px 7px',  gap: '4px' },
  md: { fontSize: '10px', padding: '3px 9px',  gap: '5px' },
  lg: { fontSize: '11px', padding: '4px 11px', gap: '6px' },
}

/**
 * TrackingOnlyBadge
 *
 * @param {('sm'|'md'|'lg')} size     — badge size (default 'md')
 * @param {boolean}           block   — if true, renders as a flex row (section header use)
 * @param {boolean}           notice  — if true, appends a disclaimer paragraph below the badge
 * @param {string}            className
 */
export default function TrackingOnlyBadge({
  size      = 'md',
  block     = false,
  notice    = false,
  className = '',
  style     = {},
}) {
  const s = SIZE[size] ?? SIZE.md

  const badge = (
    <span
      aria-label="Tracking Only — does not affect evaluation or ranking"
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            s.gap,
        padding:        s.padding,
        borderRadius:   '999px',
        fontSize:       s.fontSize,
        fontWeight:     600,
        letterSpacing:  '0.02em',
        fontFamily:     "'Inter', sans-serif",
        color:          AMBER.color,
        background:     AMBER.bg,
        border:         `1px solid ${AMBER.border}`,
        whiteSpace:     'nowrap',
        flexShrink:     0,
        ...style,
      }}
      className={className}
    >
      {/* Amber dot indicator */}
      <span
        aria-hidden="true"
        style={{
          width:        size === 'sm' ? 4 : 5,
          height:       size === 'sm' ? 4 : 5,
          borderRadius: '50%',
          background:   AMBER.color,
          flexShrink:   0,
          opacity:      0.8,
        }}
      />
      Tracking Only
      <span aria-hidden="true" style={{ opacity: 0.6, fontWeight: 400 }}>·</span>
      <span dir="rtl">للمتابعة فقط</span>
    </span>
  )

  if (!notice) {
    return block ? (
      <div style={{ display: 'flex', alignItems: 'center' }}>{badge}</div>
    ) : badge
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {badge}
      <p style={{
        margin:     0,
        fontSize:   size === 'sm' ? '10px' : '11px',
        color:      'var(--text-muted)',
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.5,
      }}>
        These KPIs do not affect your evaluation score or ranking.{' '}
        <span dir="rtl" style={{ display: 'inline-block' }}>
          هذه المؤشرات لا تؤثر على التقييم أو الترتيب.
        </span>
      </p>
    </div>
  )
}

/**
 * PilotKpiSectionHeader
 *
 * Renders a horizontal divider + "Pilot KPIs" section title + badge.
 * Used before the pilot KPI block in Dashboard, Entry form, Targets, Reports.
 */
export function PilotKpiSectionHeader({ style = {} }) {
  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        '10px',
      margin:     '16px 0 10px',
      ...style,
    }}>
      {/* Divider */}
      <div style={{
        flex:         1,
        height:       '1px',
        background:   'var(--border-subtle)',
        opacity:      0.5,
      }} />
      <span style={{
        fontSize:   '11px',
        fontWeight: 600,
        color:      'var(--text-muted)',
        fontFamily: "'Inter', sans-serif",
        whiteSpace: 'nowrap',
      }}>
        Pilot KPIs
      </span>
      <TrackingOnlyBadge size="sm" />
      <div style={{
        flex:       1,
        height:     '1px',
        background: 'var(--border-subtle)',
        opacity:    0.5,
      }} />
    </div>
  )
}
