// ============================================================
// AnswerModeBadge — Deterministic vs AI-enhanced indicator (Phase 8G)
//
// Pure presentational. An answer is either purely deterministic
// (the Bundle 7 buildAnswer() output, unmodified) or AI-enhanced
// (passed AI response validation). No mode-decision logic here.
// ============================================================
import React from 'react'
import { Cpu, Sparkles } from 'lucide-react'

export default function AnswerModeBadge({ mode }) {
  const isAiEnhanced = mode === 'ai_enhanced'
  const Icon = isAiEnhanced ? Sparkles : Cpu

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '9px', fontWeight: 600,
      color: isAiEnhanced ? '#a78bfa' : 'var(--text-muted)',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      borderRadius: '999px', padding: '2px 8px',
    }}>
      <Icon style={{ width: 9, height: 9 }} strokeWidth={2} />
      {isAiEnhanced ? 'AI-enhanced' : 'Deterministic'}
    </span>
  )
}
