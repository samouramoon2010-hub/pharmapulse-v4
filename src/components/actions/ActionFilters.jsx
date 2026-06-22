// ============================================================
// ActionFilters — Filter bar for action lists
// Phase 3C-3A
//
// Stateless — parent owns filter state.
// Props:
//   filters          — { status?, priority?, month?, branch? }
//   onChange         — (nextFilters) => void
//   showBranchFilter — boolean (true on TasksPage only)
//   branches         — string[] (branch names for dropdown)
//
// No Firestore logic. All filters applied client-side by parent.
// ============================================================
import React, { useMemo } from 'react'

const STATUS_OPTIONS = [
  { value: '',          label: 'All Status'  },
  { value: 'SUGGESTED', label: 'Open'        },
  { value: 'ACCEPTED',  label: 'Accepted'    },
  { value: 'CLOSED',    label: 'Closed'      },
  { value: 'DISMISSED', label: 'Dismissed'   },
]

const PRIORITY_OPTIONS = [
  { value: '',         label: 'All Priority' },
  { value: 'CRITICAL', label: 'Critical'     },
  { value: 'HIGH',     label: 'High'         },
  { value: 'MEDIUM',   label: 'Medium'       },
  { value: 'LOW',      label: 'Low'          },
]

function buildMonthOptions() {
  const opts = [{ value: '', label: 'All Months' }]
  const now  = new Date()
  for (let i = 0; i < 4; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const lbl = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    opts.push({ value: val, label: lbl })
  }
  return opts
}

const SELECT_STYLE = {
  background:   'var(--bg-elevated)',
  border:       '1px solid var(--border-default)',
  borderRadius: '8px',
  color:        'var(--text-secondary)',
  fontSize:     '12px',
  padding:      '5px 10px',
  fontFamily:   "'Inter', sans-serif",
  cursor:       'pointer',
  outline:      'none',
  minWidth:     '120px',
}

export default function ActionFilters({
  filters  = {},
  onChange,
  showBranchFilter = false,
  branches = [],
}) {
  const monthOptions = useMemo(() => buildMonthOptions(), [])

  function set(key, value) {
    onChange({ ...filters, [key]: value || undefined })
  }

  return (
    <div
      style={{
        display:    'flex',
        flexWrap:   'wrap',
        gap:        '8px',
        alignItems: 'center',
      }}
    >
      {/* Status chips */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map(({ value, label }) => {
          const active = (filters.status ?? '') === value
          return (
            <button
              key={value || 'all-status'}
              onClick={() => set('status', value)}
              style={{
                fontSize:     '11px',
                padding:      '4px 10px',
                borderRadius: '9999px',
                border:       active ? '1px solid rgba(13,155,170,0.5)' : '1px solid var(--border-default)',
                background:   active ? 'rgba(13,155,170,0.12)' : 'var(--bg-elevated)',
                color:        active ? '#0D9BAA' : 'var(--text-muted)',
                cursor:       'pointer',
                fontFamily:   "'Inter', sans-serif",
                fontWeight:   active ? 600 : 400,
                transition:   'all 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Priority dropdown */}
      <select
        value={filters.priority ?? ''}
        onChange={(e) => set('priority', e.target.value)}
        style={SELECT_STYLE}
      >
        {PRIORITY_OPTIONS.map(({ value, label }) => (
          <option key={value || 'all-pri'} value={value}>{label}</option>
        ))}
      </select>

      {/* Month dropdown */}
      <select
        value={filters.month ?? ''}
        onChange={(e) => set('month', e.target.value)}
        style={SELECT_STYLE}
      >
        {monthOptions.map(({ value, label }) => (
          <option key={value || 'all-months'} value={value}>{label}</option>
        ))}
      </select>

      {/* Branch dropdown — shown only when showBranchFilter=true */}
      {showBranchFilter && (
        <select
          value={filters.branch ?? ''}
          onChange={(e) => set('branch', e.target.value)}
          style={SELECT_STYLE}
        >
          <option value=''>All Branches</option>
          {(branches ?? []).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      )}
    </div>
  )
}
