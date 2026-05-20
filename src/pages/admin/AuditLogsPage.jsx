// ============================================================
// Audit Logs Page — view all system actions
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { Shield, Search, Filter, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { subscribeAuditLogs, AUDIT_ACTION } from '../../services/auditService'
import EmptyState from '../../components/ui/EmptyState'
import { COL } from '../../services/firebase'

const ACTION_CONFIG = {
  [AUDIT_ACTION.LOGIN]:        { label: 'تسجيل دخول',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  [AUDIT_ACTION.LOGOUT]:       { label: 'تسجيل خروج',  color: 'text-slate-400',  bg: 'bg-slate-800 border-slate-700' },
  [AUDIT_ACTION.CREATE]:       { label: 'إنشاء',        color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  [AUDIT_ACTION.UPDATE]:       { label: 'تعديل',        color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  [AUDIT_ACTION.DELETE]:       { label: 'حذف',          color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  [AUDIT_ACTION.APPROVE]:      { label: 'اعتماد',       color: 'text-brand-400',  bg: 'bg-brand-500/10 border-brand-500/20' },
  [AUDIT_ACTION.REJECT]:       { label: 'رفض',          color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  [AUDIT_ACTION.IMPORT]:       { label: 'استيراد',      color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  [AUDIT_ACTION.BULK_APPROVE]: { label: 'اعتماد جماعي', color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
}

function timeAgo(ts) {
  if (!ts) return '—'
  const d    = typeof ts === 'string' ? new Date(ts) : ts.toDate?.() || new Date(ts)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'الآن'
  if (mins < 60) return `منذ ${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `منذ ${hrs} س`
  return d.toLocaleDateString('ar-SA')
}

export default function AuditLogsPage() {
  const { userProfile } = useAuthStore()
  const [logs,        setLogs]        = useState([])
  const [search,      setSearch]      = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterCol,   setFilterCol]   = useState('all')
  const [expanded,    setExpanded]    = useState(null)

  useEffect(() => {
    const unsub = subscribeAuditLogs({ n: 200 })((data) => setLogs(data))
    return unsub
  }, [])

  const filtered = useMemo(() => logs.filter((l) => {
    const matchSearch = !search ||
      l.userId?.includes(search) ||
      l.docId?.includes(search) ||
      l.action?.includes(search)
    const matchAction = filterAction === 'all' || l.action === filterAction
    const matchCol    = filterCol    === 'all' || l.collection === filterCol
    return matchSearch && matchAction && matchCol
  }), [logs, search, filterAction, filterCol])

  const collections = [...new Set(logs.map((l) => l.collection).filter(Boolean))]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-400" /> سجل التدقيق
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">{logs.length} عملية مسجّلة</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالمستخدم أو الوثيقة..." className="pr-9 text-sm" />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="text-sm">
          <option value="all">كل العمليات</option>
          {Object.entries(AUDIT_ACTION).map(([k, v]) => (
            <option key={v} value={v}>{ACTION_CONFIG[v]?.label || v}</option>
          ))}
        </select>
        <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} className="text-sm">
          <option value="all">كل المجموعات</option>
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0
        ? <EmptyState icon={Shield} title="لا توجد سجلات" description="العمليات ستظهر هنا عند تنفيذها" />
        : (
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header text-right">الوقت</th>
                  <th className="table-header text-right">العملية</th>
                  <th className="table-header text-right">المجموعة</th>
                  <th className="table-header text-right">المستخدم</th>
                  <th className="table-header text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const cfg = ACTION_CONFIG[log.action] || {}
                  const isExp = expanded === log.id
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-800/20 transition-colors">
                        <td className="table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(log.timestamp)}</td>
                        <td className="table-cell">
                          <span className={`badge text-xs ${cfg.bg || ''} ${cfg.color || ''}`}>{cfg.label || log.action}</span>
                        </td>
                        <td className="table-cell text-xs text-slate-400">{log.collection || '—'}</td>
                        <td className="table-cell">
                          <div className="text-xs text-slate-300">{log.userRole || '—'}</div>
                          <div className="text-xs text-slate-600 truncate max-w-[120px]">{log.userId || '—'}</div>
                        </td>
                        <td className="table-cell text-center">
                          {(log.before || log.after || log.meta) && (
                            <button onClick={() => setExpanded(isExp ? null : log.id)}
                              className="text-slate-500 hover:text-brand-400 transition-colors">
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExp && (
                        <tr>
                          <td colSpan={5} className="px-4 pb-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                              {log.meta && Object.keys(log.meta).length > 0 && (
                                <div className="bg-slate-800/40 rounded-lg p-3 text-xs">
                                  <p className="text-slate-400 font-semibold mb-1">Meta</p>
                                  <pre className="text-slate-500 overflow-auto max-h-32">{JSON.stringify(log.meta, null, 2)}</pre>
                                </div>
                              )}
                              {log.before && (
                                <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-xs">
                                  <p className="text-red-400 font-semibold mb-1">قبل</p>
                                  <pre className="text-slate-500 overflow-auto max-h-32">{JSON.stringify(log.before, null, 2)}</pre>
                                </div>
                              )}
                              {log.after && (
                                <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3 text-xs">
                                  <p className="text-green-400 font-semibold mb-1">بعد</p>
                                  <pre className="text-slate-500 overflow-auto max-h-32">{JSON.stringify(log.after, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}
