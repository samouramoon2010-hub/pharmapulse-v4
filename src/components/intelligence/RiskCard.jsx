// ============================================================
// RiskCard — Single risk insight (Phase 6E)
//
// Pure presentational. Displays exactly the fields produced by the
// existing deriveRisks() kernel. No insight logic performed here.
// ============================================================
import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default function RiskCard({ item }) {
  if (!item) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px',
      background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: '8px', marginBottom: '6px',
    }}>
      <AlertTriangle style={{ width: 13, height: 13, color: '#f87171', marginTop: '1px', flexShrink: 0 }} strokeWidth={1.5} />
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.description}</div>
      </div>
    </div>
  )
}
