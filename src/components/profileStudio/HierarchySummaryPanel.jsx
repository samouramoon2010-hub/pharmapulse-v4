// ============================================================
// HierarchySummaryPanel — Read-only basket-level hierarchy view (Phase 2D)
//
// Pure display component. Renders flat counts plus an optional flat
// basket list (label, weight, element count, rule count per basket).
//
// NEVER renders rule-level detail (kpiKey, thresholds, pipeline steps,
// processor config). NEVER renders a tree / nested / expand-collapse
// editor. NO lifecycle readiness verdicts. NO "Ready to X" wording.
//
// NO Firestore calls. NO editable fields. NO hierarchy editor.
// NO visual builder. NO canvas. NO drag & drop. NO AI.
// NO Excel/CSV import. NO Evaluation Engine changes.
// ============================================================
import React from 'react'

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500,
        textAlign: 'right', wordBreak: 'break-word',
      }}>
        {value}
      </span>
    </div>
  )
}

/** Basket-level summary row: label, weight, element count, rule count only. */
function BasketRow({ basket }) {
  const elementCount = basket?.elements?.length ?? 0
  const ruleCount = (basket?.elements || []).reduce(
    (sum, el) => sum + (el?.rules?.length ?? 0), 0,
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '10px', padding: '6px 8px', borderRadius: '6px',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      marginBottom: '5px',
    }}>
      <span style={{
        fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {basket?.label || 'Unnamed Basket'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>w={basket?.weight ?? '—'}</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{elementCount} elements</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{ruleCount} rules</span>
      </div>
    </div>
  )
}

export default function HierarchySummaryPanel({ hierarchy }) {
  const h = hierarchy || {}
  const baskets = Array.isArray(h.payload?.baskets) ? h.payload.baskets : []

  return (
    <div>
      <Row label="Root Label" value={h.rootLabel || '—'} />
      <Row label="Baskets"    value={h.basketCount  ?? 0} />
      <Row label="Elements"   value={h.elementCount ?? 0} />
      <Row label="Rules"      value={h.ruleCount    ?? 0} />

      {baskets.length > 0 ? (
        <div style={{ marginTop: '8px' }}>
          {baskets.map((basket, idx) => (
            <BasketRow key={basket?.id || idx} basket={basket} />
          ))}
        </div>
      ) : (
        <div style={{
          marginTop: '8px', padding: '10px', textAlign: 'center',
          fontSize: '11px', color: 'var(--text-muted)',
          background: 'var(--bg-overlay)', border: '1px dashed var(--border-subtle)',
          borderRadius: '6px',
        }}>
          Structure not yet built — no baskets defined
        </div>
      )}
    </div>
  )
}
