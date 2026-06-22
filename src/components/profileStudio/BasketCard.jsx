// ============================================================
// BasketCard — Single basket row card (Phase 2F)
//
// Displays: label, weight, element count. Edit/Delete buttons only
// render when canEdit is true. Select highlights it for the Element
// editor. No rule/pipeline/processor detail is ever shown here.
// ============================================================
import React from 'react'
import { Package, Pencil, Trash2, AlertTriangle, TrendingDown } from 'lucide-react'

export default function BasketCard({
  basket,
  isSelected,
  canEdit,
  isOverweight,
  isUnderweight,
  onSelect,
  onEdit,
  onDelete,
}) {
  if (!basket) return null

  const elementCount = basket.elements?.length ?? 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(basket.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect?.(basket.id)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
        background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
        marginBottom: '6px',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '7px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Package style={{ width: 13, height: 13, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {basket.label || 'Unnamed Basket'}
          </span>
          {isOverweight && (
            <span title="Element weights exceed 100%" style={{ display: 'flex', alignItems: 'center', color: '#f87171' }}>
              <AlertTriangle style={{ width: 11, height: 11 }} />
            </span>
          )}
          {isUnderweight && (
            <span title="Element weights are below 100%" style={{ display: 'flex', alignItems: 'center', color: '#fbbf24' }}>
              <TrendingDown style={{ width: 11, height: 11 }} />
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          w={basket.weight ?? '—'} · {elementCount} elements
        </div>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit?.(basket.id) }}
            aria-label="Edit basket"
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
            onClick={(e) => { e.stopPropagation(); onDelete?.(basket.id) }}
            aria-label="Delete basket"
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
