// ============================================================
// ActionSummaryCards — Four-count summary row for action lists
// Phase 3C-3A
//
// Pure component — no data fetching.
// Receives the already-loaded actions array and derives counts.
// Props: actions (SuggestedAction[])
// ============================================================
import React from 'react'
import { COLORS } from '../../design/tokens'

export default function ActionSummaryCards({ actions = [] }) {
  const open      = actions.filter((a) => a.status === 'SUGGESTED').length
  const accepted  = actions.filter((a) => a.status === 'ACCEPTED').length
  const closed    = actions.filter((a) => a.status === 'CLOSED').length
  const dismissed = actions.filter((a) => a.status === 'DISMISSED').length

  const cards = [
    { label: 'Open',      value: open,      color: COLORS.info,        dot: COLORS.info        },
    { label: 'Accepted',  value: accepted,  color: COLORS.success,     dot: COLORS.success     },
    { label: 'Closed',    value: closed,    color: COLORS.kpiFallback,  dot: COLORS.kpiFallback },
    { label: 'Dismissed', value: dismissed, color: '#64748B',           dot: '#64748B'          },
  ]

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap:                 '8px',
      }}
    >
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            background:   'var(--bg-surface)',
            border:       '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding:      '12px 14px',
            textAlign:    'center',
          }}
        >
          <div
            style={{
              fontSize:      '9px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color:         'var(--text-muted)',
              fontFamily:    "'Inter', sans-serif",
              marginBottom:  '5px',
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize:          '22px',
              fontWeight:        700,
              color,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing:     '-0.03em',
              lineHeight:        1,
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}
