// ============================================================
// RuleCard — Single rule row card (Phase 2H)
//
// Displays: label, kpiKey, weight, processor step count. Edit/Delete
// buttons and the "Manage Pipeline" toggle only render when canEdit
// is true. No processor config detail is ever shown inline here —
// that is the responsibility of ProcessorPipelinePanel.
// ============================================================
import React from 'react'
import { Target, Pencil, Trash2, AlertTriangle, TrendingDown, Cog } from 'lucide-react'

export default function RuleCard({
  rule,
  isSelected,
  canEdit,
  isOverweight,
  isUnderweight,
  onSelect,
  onEdit,
  onDelete,
}) {
  if (!rule) return null

  const stepCount = rule.pipeline?.steps?.length ?? 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px', borderRadius: '8px',
      background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
      border: `1px solid ${isSelected ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
      marginBottom: '6px',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '6px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Target style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {rule.label || 'Unnamed Rule'}
          </span>
          {isOverweight && (
            <span title="Rule weight pushes element over 100%" style={{ display: 'flex', alignItems: 'center', color: '#f87171' }}>
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
          kpi={rule.kpiKey || '—'} · w={rule.weight ?? '—'} · {stepCount} processor steps
        </div>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onSelect?.(rule.id)}
            aria-label="Manage pipeline"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '6px',
              background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              color: isSelected ? '#818cf8' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <Cog style={{ width: 11, height: 11 }} />
          </button>
          <button
            type="button"
            onClick={() => onEdit?.(rule.id)}
            aria-label="Edit rule"
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
            onClick={() => onDelete?.(rule.id)}
            aria-label="Delete rule"
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
