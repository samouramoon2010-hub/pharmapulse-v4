// ============================================================
// ElementCard — Single element row card (Phase 2G)
//
// Displays: label, weight, rule count. Edit/Delete buttons only
// render when canEdit is true. No rule/pipeline/processor detail
// is ever shown here.
// ============================================================
import React from 'react'
import { Layers3, Pencil, Trash2, AlertTriangle, TrendingDown, Target } from 'lucide-react'

export default function ElementCard({
  element,
  canEdit,
  isOverweight,
  isUnderweight,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}) {
  if (!element) return null

  const ruleCount = element.rules?.length ?? 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      marginBottom: '6px',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '7px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Layers3 style={{ width: 13, height: 13, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {element.label || 'Unnamed Element'}
          </span>
          {isOverweight && (
            <span title="Rule weights exceed 100%" style={{ display: 'flex', alignItems: 'center', color: '#f87171' }}>
              <AlertTriangle style={{ width: 11, height: 11 }} />
            </span>
          )}
          {isUnderweight && (
            <span title="Rule weights are below 100%" style={{ display: 'flex', alignItems: 'center', color: '#fbbf24' }}>
              <TrendingDown style={{ width: 11, height: 11 }} />
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          w={element.weight ?? '—'} · {ruleCount} rules
        </div>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onSelect?.(element.id)}
            aria-label="Manage rules"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '6px',
              background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              color: isSelected ? '#818cf8' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <Target style={{ width: 11, height: 11 }} />
          </button>
          <button
            type="button"
            onClick={() => onEdit?.(element.id)}
            aria-label="Edit element"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '6px',
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <Pencil style={{ width: 11, height: 11 }} />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(element.id)}
            aria-label="Delete element"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '6px',
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
              color: '#f87171', cursor: 'pointer',
            }}
          >
            <Trash2 style={{ width: 11, height: 11 }} />
          </button>
        </div>
      )}
    </div>
  )
}
