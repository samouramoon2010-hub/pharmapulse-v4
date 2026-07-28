// ============================================================
// AnswerModeBadge — Deterministic vs AI-enhanced indicator (Phase 8G)
//
// Pure presentational. An answer is either purely deterministic
// (the Bundle 7 buildAnswer() output, unmodified) or AI-enhanced
// (passed AI response validation). No mode-decision logic here.
// ============================================================
import React from 'react'
import { Cpu, Sparkles, UserCheck } from 'lucide-react'

const MODE_CONFIG = {
  ai_enhanced: { icon: Sparkles, label: 'AI-enhanced', color: '#a78bfa' },
  ai_personal: { icon: UserCheck, label: 'Your personal AI', color: '#34d399' },
}

export default function AnswerModeBadge({ mode }) {
  const config = MODE_CONFIG[mode]
  const Icon = config ? config.icon : Cpu

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '9px', fontWeight: 600,
      color: config ? config.color : 'var(--text-muted)',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      borderRadius: '999px', padding: '2px 8px',
    }}>
      <Icon style={{ width: 9, height: 9 }} strokeWidth={2} />
      {config ? config.label : 'Deterministic'}
    </span>
  )
}
