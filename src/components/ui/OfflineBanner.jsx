// ============================================================
// OfflineBanner — Offline First Bundle, Phase D
//
// Non-blocking: fixed-position strip above the app content, never
// covers interactive chrome, never intercepts pointer events when
// hidden, and renders nothing at all while online. The app remains
// fully usable underneath it at all times.
// ============================================================
import React from 'react'
import { WifiOff } from 'lucide-react'
import { useSyncStatus } from '../../hooks/useSyncStatus'

export default function OfflineBanner() {
  const { isOnline, pendingCount } = useSyncStatus()

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '7px 16px',
        background: 'rgba(245,158,11,0.12)',
        borderBottom: '1px solid rgba(245,158,11,0.28)',
        color: '#fbbf24',
        fontSize: '12.5px', fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        pointerEvents: 'none',
      }}
    >
      <WifiOff style={{ width: 14, height: 14, flexShrink: 0 }} />
      <span>
        You're offline — changes are saved locally and will sync automatically once you're back online.
        {pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
      </span>
    </div>
  )
}
