// ============================================================
// ProcessorStepCard — Single processor step row card (Phase 2I)
//
// Displays: order, processor type label, enabled state, and a short
// summary of the step's key config values. Edit/Delete buttons only
// render when canEdit is true. Reordering is via the `order` field in
// ProcessorConfigForm only — no drag & drop affordance here.
// ============================================================
import React from 'react'
import { Cog, Pencil, Trash2 } from 'lucide-react'

import { getProcessorDefinition } from '../../profileStudio/processors'

function summarizeConfig(processorType, config) {
  if (!config) return ''
  switch (processorType) {
    case 'CEILING_CLAMP': return `ceiling=${config.ceiling ?? '—'}`
    case 'FLOOR_CLAMP': return `floor=${config.floor ?? '—'}`
    case 'WEIGHT_MULTIPLIER': return `weight=${config.weight ?? '—'}`
    case 'BAND_EVALUATOR': return `${(config.bands ?? []).length} bands`
    case 'PENALTY_EVALUATOR': return `${(config.penaltyRules ?? []).length} penalty rules`
    case 'NODE_AGGREGATOR': return `aggregation=${config.aggregationType ?? '—'}`
    case 'ZERO_TARGET_GUARD': return `behaviour=${config.zeroTargetBehaviour ?? '—'}`
    default: return ''
  }
}

export default function ProcessorStepCard({ step, canEdit, onEdit, onDelete }) {
  if (!step) return null

  const def = getProcessorDefinition(step.processorType)
  const enabled = step.config?.enabled !== false

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      marginBottom: '6px',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '6px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Cog style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {def?.label ?? step.processorType}
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px',
            color: enabled ? '#34d399' : 'var(--text-muted)',
            background: enabled ? 'rgba(52,211,153,0.1)' : 'var(--bg-overlay)',
          }}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          order={step.order ?? '—'} · {summarizeConfig(step.processorType, step.config)}
        </div>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onEdit?.(step)}
            aria-label="Edit processor step"
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
            onClick={() => onDelete?.(step)}
            aria-label="Delete processor step"
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
