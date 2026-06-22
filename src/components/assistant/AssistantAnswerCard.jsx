// ============================================================
// AssistantAnswerCard — Single Q&A turn (Phase 7F)
//
// Pure presentational. Displays exactly the fields produced by the
// existing buildAnswer() kernel — question, intent, text, evidence,
// citedTraceRef. No answer generation performed here.
// ============================================================
import React from 'react'
import { MessageCircle } from 'lucide-react'

import EvidenceList from './EvidenceList'

export default function AssistantAnswerCard({ answer }) {
  if (!answer) return null

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '8px', padding: '10px', marginBottom: '8px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{answer.question}</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <MessageCircle style={{ width: 12, height: 12, color: '#60a5fa', marginTop: '1px', flexShrink: 0 }} strokeWidth={1.5} />
        <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{answer.text}</div>
      </div>

      <EvidenceList evidence={answer.evidence} />

      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px' }}>
        Intent: {answer.intent} · Source: {answer.citedTraceRef}
      </div>
    </div>
  )
}
