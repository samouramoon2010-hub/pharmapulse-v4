// ============================================================
// UsageRemainingBadge — Remaining AI usage indicator (Phase 8G)
//
// Pure presentational. Displays exactly the fields produced by the
// existing checkUsageLimit() kernel. No limit-checking logic here.
// ============================================================
import React from 'react'
import { Gauge } from 'lucide-react'

export default function UsageRemainingBadge({ remainingDaily, remainingMonthly }) {
  if (remainingDaily === undefined && remainingMonthly === undefined) return null

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      borderRadius: '999px', padding: '2px 8px',
    }}>
      <Gauge style={{ width: 9, height: 9 }} strokeWidth={2} />
      {remainingDaily ?? '—'} left today · {remainingMonthly ?? '—'} this month
    </span>
  )
}
