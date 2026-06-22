// ============================================================
// ActionEmptyState — Generic empty state for action lists
// Phase 3C-3A; compacted in the Targeted Visibility & UX Hotfix;
// `compact`/`tone` added in UI 3.0 Product Surface Bundle (UI3-2C).
//
// Pure presentational. No business logic.
// Props: message (string, used as the body when no title is given,
// or as a standalone line for the older single-line call sites),
// title (string, optional — renders a compact premium two-line
// title/body layout instead of the older oversized single block),
// icon (ReactNode, optional),
// compact (bool, optional — tighter padding/type for nested,
//   zero-count section placeholders so they don't read as a second
//   "giant empty box" underneath an already-empty summary),
// tone (optional — 'positive' | 'caution' | 'negative' | 'neutral' —
//   tints the icon container to match EmptyState's semantic tone API)
// ============================================================
import React from 'react'
import { getStatusToken } from '../../design/tokens'

export default function ActionEmptyState({ message, title, icon, compact = false, tone }) {
  const token = tone ? getStatusToken(tone) : null
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            title ? '4px' : compact ? '6px' : '10px',
        padding:        compact ? '12px 16px' : title ? '20px 24px' : '24px 24px',
        borderRadius:   '8px',
        background:     'var(--bg-surface)',
        border:         '1px solid var(--border-subtle)',
        textAlign:      'center',
      }}
    >
      {icon && (
        <div style={{
          color: token?.color ?? 'var(--text-muted)',
          opacity: token ? 1 : 0.6,
          marginBottom: '4px',
        }}>
          {icon}
        </div>
      )}
      {title && (
        <p style={{
          fontSize:   compact ? '12px' : '13px',
          fontWeight: 600,
          color:      'var(--text-secondary)',
          fontFamily: "'Inter', sans-serif",
          margin:     0,
        }}>
          {title}
        </p>
      )}
      <p
        style={{
          fontSize:   compact ? '11px' : '12px',
          color:      'var(--text-muted)',
          fontFamily: "'Inter', sans-serif",
          margin:     0,
          lineHeight: 1.5,
          maxWidth:   '360px',
        }}
      >
        {message}
      </p>
    </div>
  )
}
