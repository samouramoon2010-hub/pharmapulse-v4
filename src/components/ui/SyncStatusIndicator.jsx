// ============================================================
// SyncStatusIndicator — Offline First Bundle, Phase D
//
// Small header badge: online/offline/syncing state, pending-changes
// count, and last-sync timestamp. Read-only, non-blocking — purely
// reflects useSyncStatus(), never gates any action.
// ============================================================
import React from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useSyncStatus } from '../../hooks/useSyncStatus'

function formatRelative(ts) {
  if (!ts) return 'never'
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  return `${diffHr}h ago`
}

export default function SyncStatusIndicator() {
  const { status, pendingCount, lastSyncedAt } = useSyncStatus()

  const config = {
    online:  { icon: Wifi,      color: 'var(--text-muted)', label: 'Live' },
    syncing: { icon: RefreshCw, color: '#fbbf24',           label: `Syncing${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    offline: { icon: WifiOff,   color: '#f87171',           label: 'Offline' },
  }[status]

  const Icon = config.icon

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 text-xs"
      style={{ color: config.color }}
      title={`Last sync: ${formatRelative(lastSyncedAt)}`}
    >
      <Icon style={{ width: 12, height: 12 }} className={status === 'syncing' ? 'animate-spin' : ''} />
      {config.label}
    </div>
  )
}
