// ============================================================
// useSyncStatus — Offline First Bundle, Phase A/D
//
// Combines connectivity state with the operation journal summary
// so UI components (offline banner, sync badge, status indicator)
// have one hook to read from. Polls the journal lightly instead of
// keeping an open IndexedDB cursor subscription — pending-write
// counts change infrequently enough that this is non-blocking and
// cheap.
// ============================================================
import { useEffect, useState } from 'react'
import { useConnectivityStore } from '../store/connectivityStore'
import { getSyncSummary } from '../offline/syncTracker'

const POLL_INTERVAL_MS = 4000

export function useSyncStatus() {
  const isOnline = useConnectivityStore((s) => s.isOnline)
  const [summary, setSummary] = useState({ pendingCount: 0, failedCount: 0, lastSyncedAt: null })

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const next = await getSyncSummary()
      if (!cancelled) setSummary(next)
    }
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [isOnline])

  const status = !isOnline
    ? 'offline'
    : summary.pendingCount > 0
      ? 'syncing'
      : 'online'

  return {
    isOnline,
    status,
    pendingCount: summary.pendingCount,
    failedCount: summary.failedCount,
    lastSyncedAt: summary.lastSyncedAt,
  }
}
