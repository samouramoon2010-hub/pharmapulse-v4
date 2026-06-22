// ============================================================
// NotificationsPage — Notification Center
// (Designer Mode pass — Alerts Center)
//
// Display-only. Reads from useNotificationStore exactly as before
// (fetchNotifications/markRead/markAllRead/unreadCount unchanged —
// no store or data-shape changes). This pass only migrated the
// page's markup from legacy Arabic/Tailwind-utility styling to the
// app's English-language, theme-token-based design system, to
// match the rest of the already-migrated surfaces.
// ============================================================
import React, { useEffect } from 'react'
import { Bell, CheckCheck, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { getStatusToken } from '../../design/tokens'
import EmptyState from '../../components/ui/EmptyState'

const TYPE_CONFIG = {
  warning: { icon: AlertTriangle, tone: 'caution' },
  success: { icon: CheckCircle2,  tone: 'positive' },
  info:    { icon: Info,          tone: 'neutral' },
  error:   { icon: XCircle,       tone: 'negative' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationsPage() {
  const { userProfile } = useAuthStore()
  const { notifications, unreadCount, fetchNotifications, markRead, markAllRead } = useNotificationStore()

  useEffect(() => {
    if (userProfile?.uid) fetchNotifications(userProfile.uid)
  }, [userProfile?.uid])

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{
            fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: "'Inter', sans-serif", margin: 0,
          }}>
            Notifications
          </h1>
          <p style={{
            fontSize: '12px', color: 'var(--text-muted)',
            fontFamily: "'Inter', sans-serif", marginTop: '4px',
          }}>
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All notifications are read'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '7px', padding: '6px 14px', color: 'var(--text-secondary)',
            fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>
            <CheckCheck style={{ width: 13, height: 13 }} /> Mark all as read
          </button>
        )}
      </div>

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
        }}>
          <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map((notif) => {
            const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info
            const Icon = cfg.icon
            const token = getStatusToken(cfg.tone)
            return (
              <div
                key={notif.id}
                onClick={() => !notif.read && markRead(notif.id)}
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${!notif.read ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  cursor: notif.read ? 'default' : 'pointer',
                  opacity: notif.read ? 0.6 : 1,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '9px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: token.bg, border: `1px solid ${token.border}`,
                }}>
                  <Icon style={{ width: 15, height: 15, color: token.color }} strokeWidth={1.75} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
                      {notif.title}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}>
                        {timeAgo(notif.createdAt)}
                      </span>
                      {!notif.read && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-500)' }} />
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', fontFamily: "'Inter', sans-serif" }}>
                    {notif.message}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
