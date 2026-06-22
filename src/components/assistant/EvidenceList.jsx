// ============================================================
// EvidenceList — Citation list for an assistant answer (Phase 7F)
//
// Pure presentational. Displays exactly the GroundedFact[] produced
// by the existing extractGroundedFacts() kernel. No grounding logic
// performed here.
// ============================================================
import React from 'react'
import { Quote } from 'lucide-react'

export default function EvidenceList({ evidence }) {
  if (!evidence || evidence.length === 0) return null

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
        <Quote style={{ width: 10, height: 10, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Evidence</span>
      </div>
      {evidence.map((fact, idx) => (
        <div key={idx} style={{
          display: 'flex', justifyContent: 'space-between', gap: '8px',
          fontSize: '10px', color: 'var(--text-secondary)', padding: '2px 0',
        }}>
          <span>{fact.label} <span style={{ color: 'var(--text-muted)' }}>({fact.source})</span></span>
          <span style={{ fontWeight: 600 }}>{typeof fact.value === 'number' ? fact.value.toFixed(1) : fact.value}</span>
        </div>
      ))}
    </div>
  )
}
