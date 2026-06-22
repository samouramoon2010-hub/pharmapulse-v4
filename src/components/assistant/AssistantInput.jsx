// ============================================================
// AssistantInput — Controlled question input (Phase 7F)
//
// Pure presentational + controlled. No auto-send: onSubmit only
// fires from an explicit user action (clicking "Ask" or pressing
// Enter while typing) — never from a timer, mount effect, or
// automatic trigger.
// ============================================================
import React from 'react'
import { Send } from 'lucide-react'

export default function AssistantInput({ value, onChange, onSubmit, disabled }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !disabled && value?.trim()) {
      onSubmit()
    }
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask a question about this evaluation…"
        style={{
          flex: 1, fontSize: '12px', color: 'var(--text-primary)',
          background: 'var(--bg-canvas)', border: '1px solid var(--border-default)',
          borderRadius: '6px', padding: '7px 10px',
        }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value?.trim()}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', fontWeight: 500,
          color: !disabled && value?.trim() ? '#60a5fa' : 'var(--text-muted)',
          background: !disabled && value?.trim() ? 'rgba(96,165,250,0.08)' : 'var(--bg-overlay)',
          border: `1px solid ${!disabled && value?.trim() ? 'rgba(96,165,250,0.2)' : 'var(--border-subtle)'}`,
          borderRadius: '6px', padding: '6px 12px',
          cursor: !disabled && value?.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        <Send style={{ width: 11, height: 11 }} />
        Ask
      </button>
    </div>
  )
}
