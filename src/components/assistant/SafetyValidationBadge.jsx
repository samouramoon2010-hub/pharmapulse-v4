// ============================================================
// SafetyValidationBadge — Validation outcome indicator (Phase 8G)
//
// Pure presentational. Displays exactly the status produced by the
// existing validateAiResponse() kernel — "validated" when an
// AI-enhanced response passed every check, "fallback" when it failed
// and the deterministic answer was used instead, or "not_applicable"
// when AI was never invoked. No validation logic performed here.
// ============================================================
import React from 'react'
import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'

const STATUS_CONFIG = {
  validated:      { icon: ShieldCheck, label: 'Safety validated', color: '#34d399' },
  fallback:       { icon: ShieldAlert, label: 'Fell back (validation failed)', color: '#fbbf24' },
  not_applicable: { icon: ShieldOff, label: 'Deterministic only', color: 'var(--text-muted)' },
}

export default function SafetyValidationBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_applicable
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
