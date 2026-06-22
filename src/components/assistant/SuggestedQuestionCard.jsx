// ============================================================
// SuggestedQuestionCard — Example question chip (Phase 7F)
//
// Pure presentational. Clicking only fills the input via onSelect —
// it never submits automatically. The user must still press "Ask".
// ============================================================
import React from 'react'
import { Sparkles } from 'lucide-react'

export default function SuggestedQuestionCard({ question, onSelect }) {
  if (!question) return null

  return (
    <button
      type="button"
      onClick={() => onSelect(question)}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: '10px', color: 'var(--text-secondary)',
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        borderRadius: '999px', padding: '4px 10px', cursor: 'pointer',
      }}
    >
      <Sparkles style={{ width: 9, height: 9, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      {question}
    </button>
  )
}
