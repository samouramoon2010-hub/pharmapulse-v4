// ============================================================
// ProviderStatusBadge — AI provider connection state (Phase 8G)
//
// Pure presentational. Displays exactly the status produced by the
// existing connectToProvider() kernel (or the absence of a request
// when AI is fully disabled). No connection logic performed here.
// ============================================================
import React from 'react'
import { Plug, PlugZap, AlertOctagon, Sparkles } from 'lucide-react'

const STATUS_CONFIG = {
  disabled:             { icon: Plug, label: 'AI disabled', color: 'var(--text-muted)' },
  mocked:               { icon: PlugZap, label: 'AI mock mode', color: '#60a5fa' },
  provider_unavailable: { icon: AlertOctagon, label: 'Provider unavailable', color: '#f87171' },
  live:                 { icon: Sparkles, label: 'Your AI (live)', color: '#34d399' },
  invalid_response:     { icon: AlertOctagon, label: 'Response rejected', color: '#fbbf24' },
  model_unavailable:    { icon: AlertOctagon, label: 'Model unavailable', color: '#fbbf24' },
}

export default function ProviderStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disabled
  const Icon = config.icon

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '9px', fontWeight: 600, color: config.color,
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      borderRadius: '999px', padding: '2px 8px',
    }}>
      <Icon style={{ width: 9, height: 9 }} strokeWidth={2} />
      {config.label}
    </span>
  )
}
