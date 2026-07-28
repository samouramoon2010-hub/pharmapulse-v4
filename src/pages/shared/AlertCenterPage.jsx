// ============================================================
// Alert Center — auto-generated alerts with filters
// ============================================================
import React, { useEffect, useMemo } from 'react'
import { Bell, AlertTriangle, TrendingDown, ClipboardCheck, UserX, Building2, CheckCheck, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAlertStore, ALERT_TYPES, ALERT_PRIORITY } from '../../store/alertStore'
import { useKpiStore } from '../../store/kpiStore'
import { useApprovalStore } from '../../store/approvalStore'
import { useTeamStore } from '../../store/teamStore'
import { useBranchStore } from '../../store/branchStore'
import EmptyState from '../../components/ui/EmptyState'
import { todayStr } from '../../utils/helpers'
import { DUMMY_USERS, DUMMY_BRANCHES } from '../../data/dummyData'

const TYPE_CONFIG = {
  [ALERT_TYPES.MISSING_KPI]:      { icon: ClipboardCheck, label: 'إدخال ناقص',       color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  [ALERT_TYPES.PENDING_APPROVAL]: { icon: ClipboardCheck, label: 'اعتماد معلق',       color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  [ALERT_TYPES.LOW_KPI]:          { icon: TrendingDown,   label: 'أداء منخفض',         color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  [ALERT_TYPES.LOW_BRANCH]:       { icon: Building2,      label: 'فرع دون الهدف',      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  [ALERT_TYPES.LOW_PERFORMER]:    { icon: UserX,          label: 'أداء ضعيف متواصل',   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
}

const PRIORITY_BADGE = {
  [ALERT_PRIORITY.HIGH]:   'bg-red-500/20 text-red-400 border-red-500/30',
  [ALERT_PRIORITY.MEDIUM]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  [ALERT_PRIORITY.LOW]:    'bg-slate-700 text-slate-400 border-slate-600',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} ساعة`
  return `منذ ${Math.floor(hrs / 24)} يوم`
}

export default function AlertCenterPage() {
  const { userProfile } = useAuthStore()
  const { alerts, generateAlerts, markAlertRead, markAllRead } = useAlertStore()
  const { templates, entries, subscribeTemplates, subscribeAllEntries } = useKpiStore()
  const { overlay } = useApprovalStore()
  const { members, subscribeAllMembers } = useTeamStore()
  const { branches, subscribeBranches } = useBranchStore()

  const [filterType, setFilterType] = React.useState('all')
  const [filterPriority, setFilterPriority] = React.useState('all')
  const today = todayStr()

  useEffect(() => {
    const u1 = subscribeTemplates()
    const u2 = subscribeAllEntries()
    const u3 = subscribeAllMembers()
    const u4 = subscribeBranches()
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  // Auto-generate alerts whenever data changes
  useEffect(() => {
    if (templates.length && entries.length) {
      generateAlerts({
        entries,
        templates,
        users: members.length ? members : DUMMY_USERS,
        branches: branches.length ? branches : DUMMY_BRANCHES,
        today,
        approvalOverlay: overlay,
      })
    }
  }, [entries, templates, members, branches, overlay, today])

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const matchType     = filterType     === 'all' || a.type     === filterType
      const matchPriority = filterPriority === 'all' || a.priority === filterPriority
      return matchType && matchPriority
    })
  }, [alerts, filterType, filterPriority])

  const unread = alerts.filter((a) => !a.read).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand-400" /> مركز التنبيهات
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{unread} تنبيه غير مقروء · {alerts.length} إجمالي</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => generateAlerts({
            entries, templates,
            users: members.length ? members : DUMMY_USERS,
            branches: branches.length ? branches : DUMMY_BRANCHES,
            today, approvalOverlay: overlay,
          })} className="btn-secondary text-sm gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
          {unread > 0 && (
            <button onClick={markAllRead} className="btn-secondary text-sm gap-1.5">
              <CheckCheck className="w-3.5 h-3.5" /> قراءة الكل
            </button>
          )}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterType('all')}
          className={`badge flex-shrink-0 transition-all ${filterType === 'all' ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}>
          الكل <span className="font-bold mr-1">{alerts.length}</span>
        </button>
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const count = alerts.filter((a) => a.type === type).length
          if (!count) return null
          return (
            <button key={type} onClick={() => setFilterType(type === filterType ? 'all' : type)}
              className={`badge flex-shrink-0 transition-all ${filterType === type ? `${cfg.bg} ${cfg.color}` : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}>
              <cfg.icon className="w-3 h-3" />
              {cfg.label}
              <span className="font-bold mr-1">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Priority filter */}
      <div className="flex gap-2">
        {['all', 'high', 'medium', 'low'].map((p) => (
          <button key={p} onClick={() => setFilterPriority(p)}
            className={`badge text-xs transition-all ${filterPriority === p ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}>
            {p === 'all' ? 'كل الأولويات' : p === 'high' ? '🔴 عالية' : p === 'medium' ? '🟡 متوسطة' : '🟢 منخفضة'}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      {filtered.length === 0
        ? <EmptyState icon={Bell} title="لا توجد تنبيهات" description="النظام يعمل بشكل سليم" />
        : (
          <div className="space-y-2">
            {filtered.map((alert) => {
              const cfg = TYPE_CONFIG[alert.type] || TYPE_CONFIG[ALERT_TYPES.LOW_KPI]
              const Icon = cfg.icon
              return (
                <div key={alert.id}
                  onClick={() => !alert.read && markAlertRead(alert.id)}
                  className={`kpi-card flex items-start gap-4 cursor-pointer transition-all ${!alert.read ? 'border-slate-700' : 'opacity-60'}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-200">{alert.title}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge text-xs ${PRIORITY_BADGE[alert.priority]}`}>
                          {alert.priority === 'high' ? 'عالية' : alert.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                        </span>
                        {!alert.read && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{alert.message}</p>
                    <span className="text-xs text-slate-600 mt-1 block">{timeAgo(alert.createdAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
