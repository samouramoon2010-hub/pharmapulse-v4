// ============================================================
// OpportunityCard — Single opportunity insight (Phase 6E)
//
// Pure presentational. Displays exactly the fields produced by the
// existing deriveOpportunities() kernel. No insight logic performed here.
// ============================================================
import React from 'react'
import { Lightbulb } from 'lucide-react'

export default function OpportunityCard({ item }) {
  if (!item) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px',
      background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)',
      borderRadius: '8px', marginBottom: '6px',
    }}>
      <Lightbulb style={{ width: 13, height: 13, color: '#60a5fa', marginTop: '1px', flexShrink: 0 }} strokeWidth={1.5} />
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.description}</div>
      </div>
    </div>
  )
}
