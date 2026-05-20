// ============================================================
// Notifications Page - Full notifications center
// ============================================================

import React, { useEffect } from 'react'
import { Bell, CheckCheck, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { formatDateAr } from '../../utils/helpers'

const TYPE_CONFIG = {
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  info:    { icon: Info,         color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/20' },
  error:   { icon: X,            color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} ساعة`
  return `منذ ${Math.floor(hrs / 24)} يوم`
}

export default function NotificationsPage() {
  const { userProfile } = useAuthStore()
  const { notifications, unreadCount, fetchNotifications, markRead, markAllRead } = useNotificationStore()

  useEffect(() => {
    if (userProfile?.uid) fetchNotifications(userProfile.uid)
  }, [userProfile?.uid])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الإشعارات</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : 'جميع الإشعارات مقروءة'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm gap-1.5">
            <CheckCheck className="w-4 h-4" />
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <div className="kpi-card flex flex-col items-center justify-center py-16">
          <Bell className="w-10 h-10 text-slate-700 mb-3" />
          <p className="text-slate-400">لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info
            const Icon = cfg.icon
            return (
              <div
                key={notif.id}
                onClick={() => !notif.read && markRead(notif.id)}
                className={`kpi-card flex items-start gap-4 cursor-pointer transition-all ${
                  !notif.read ? 'border-slate-700' : 'opacity-60'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-200">{notif.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-600">{timeAgo(notif.createdAt)}</span>
                      {!notif.read && (
                        <div className="w-2 h-2 rounded-full bg-brand-500" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{notif.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
