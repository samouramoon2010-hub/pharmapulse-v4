// ============================================================
// KPI Approval Queue — review, approve, reject entries
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, CheckCircle2, XCircle, MessageSquare,
  Filter, RefreshCw, ChevronDown, CheckSquare, Square,
  Calendar, User, Loader2, AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import { useApprovalStore } from '../../store/approvalStore'
import { useTeamStore } from '../../store/teamStore'
import { useToastStore } from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import { todayStr, formatKpiValue, getAchievementColor, formatDateAr } from '../../utils/helpers'

const STATUS_CONFIG = {
  pending:    { label: 'في الانتظار',  bg: 'bg-amber-500/10  text-amber-400  border-amber-500/20' },
  approved:   { label: 'معتمد',        bg: 'bg-green-500/10  text-green-400  border-green-500/20' },
  rejected:   { label: 'مرفوض',        bg: 'bg-red-500/10    text-red-400    border-red-500/20' },
  needs_edit: { label: 'يحتاج تعديل',  bg: 'bg-blue-500/10   text-blue-400   border-blue-500/20' },
}

export default function ApprovalQueuePage() {
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeEntries, subscribeAllEntries } = useKpiStore()
  const { overlay, subscribeOverlay, approveEntry, rejectEntry, requestEdit, bulkApprove } = useApprovalStore()
  const { members, subscribeAllMembers } = useTeamStore()
  const toast = useToastStore()

  const [filterDate,     setFilterDate]     = useState(todayStr())
  const [filterPharmacist, setFilterPharmacist] = useState('all')
  const [filterKpi,      setFilterKpi]      = useState('all')
  const [filterStatus,   setFilterStatus]   = useState('pending')
  const [selected,       setSelected]       = useState(new Set())
  const [commentModal,   setCommentModal]   = useState(null) // { entryId, action }
  const [comment,        setComment]        = useState('')
  const [processing,     setProcessing]     = useState(false)

  const isAdmin   = userProfile?.role === 'admin'
  const canApprove = ['admin', 'store_manager'].includes(userProfile?.role)

  useEffect(() => {
    const u1 = subscribeTemplates()
    const u2 = isAdmin ? subscribeAllEntries() : subscribeEntries({ branchId: userProfile?.branchId })
    const u3 = subscribeAllMembers()
    const u4 = subscribeOverlay(userProfile?.branchId)
    return () => { u1(); u2(); u3(); u4() }
  }, [userProfile?.branchId])

  // Enrich entries with approval status + user/kpi names
  const enrichedEntries = useMemo(() => {
    return entries
      .filter((e) => e.date === filterDate)
      .map((e) => {
        const status  = overlay[e.id]?.status || 'pending'
        const kpi     = templates.find((t) => t.id === e.kpiId)
        const member  = members.find((m) => m.uid === e.userId || m.id === e.userId)
        return {
          ...e,
          status,
          managerComment: overlay[e.id]?.managerComment || '',
          approvedBy:     overlay[e.id]?.approvedBy || null,
          approvedAt:     overlay[e.id]?.approvedAt || null,
          kpiName:  kpi?.name  || e.kpiId,
          kpiColor: kpi?.color || '#1a9a7e',
          kpiType:  kpi?.type,
          kpiUnit:  kpi?.unit,
          userName: member?.displayName || e.userId,
          branchId: member?.branchId || e.branchId,
        }
      })
      .filter((e) => {
        const matchP = filterPharmacist === 'all' || e.userId === filterPharmacist
        const matchK = filterKpi       === 'all' || e.kpiId  === filterKpi
        const matchS = filterStatus    === 'all' || e.status === filterStatus
        return matchP && matchK && matchS
      })
      .sort((a, b) => (a.userName || '').localeCompare(b.userName || ''))
  }, [entries, overlay, templates, members, filterDate, filterPharmacist, filterKpi, filterStatus])

  const pendingEntries = enrichedEntries.filter((e) => e.status === 'pending')

  const toggleSelect = (id) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const selectAll = () => setSelected(new Set(pendingEntries.map((e) => e.id)))
  const clearAll  = () => setSelected(new Set())

  const handleBulkApprove = async () => {
    if (!selected.size) return
    setProcessing(true)
    try {
      await bulkApprove([...selected], userProfile?.uid, userProfile?.role)
      toast.success(`تم اعتماد ${selected.size} إدخال`)
      clearAll()
    } catch { toast.error('حدث خطأ أثناء الاعتماد') }
    finally { setProcessing(false) }
  }

  const openComment = (entryId, action) => {
    setCommentModal({ entryId, action })
    setComment('')
  }

  const handleAction = async () => {
    if (!commentModal) return
    setProcessing(true)
    try {
      const { entryId, action } = commentModal
      if (action === 'approve')  await approveEntry(entryId, userProfile?.uid, userProfile?.role, comment)
      if (action === 'reject')   await rejectEntry(entryId, userProfile?.uid, userProfile?.role, comment)
      if (action === 'edit')     await requestEdit(entryId, userProfile?.uid, userProfile?.role, comment)
      toast.success(
        action === 'approve' ? 'تم الاعتماد' :
        action === 'reject'  ? 'تم الرفض' : 'تم طلب التعديل'
      )
      setCommentModal(null)
    } catch { toast.error('حدث خطأ') }
    finally { setProcessing(false) }
  }

  const pharmacistOptions = useMemo(() =>
    [...new Map(entries.filter((e) => e.date === filterDate).map((e) => {
      const m = members.find((u) => u.uid === e.userId || u.id === e.userId)
      return [e.userId, { uid: e.userId, name: m?.displayName || e.userId }]
    })).values()],
    [entries, members, filterDate]
  )

  const counts = useMemo(() => ({
    all:        enrichedEntries.length,
    pending:    enrichedEntries.filter((e) => e.status === 'pending').length,
    approved:   enrichedEntries.filter((e) => e.status === 'approved').length,
    rejected:   enrichedEntries.filter((e) => e.status === 'rejected').length,
    needs_edit: enrichedEntries.filter((e) => e.status === 'needs_edit').length,
  }), [enrichedEntries])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-400" /> قائمة الاعتماد
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {counts.pending} إدخال في انتظار الاعتماد
          </p>
        </div>
        {canApprove && selected.size > 0 && (
          <button onClick={handleBulkApprove} disabled={processing} className="btn-primary">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            اعتماد المحدد ({selected.size})
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries({ all: 'الكل', pending: 'انتظار', approved: 'معتمد', rejected: 'مرفوض', needs_edit: 'يحتاج تعديل' }).map(([k, label]) => (
          <button key={k} onClick={() => setFilterStatus(k)}
            className={`badge transition-all ${filterStatus === k ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}>
            {label}
            <span className={`font-bold text-xs mr-1 ${filterStatus === k ? 'text-brand-300' : 'text-slate-600'}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">التاريخ</label>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} max={todayStr()} className="text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">الصيدلاني</label>
          <select value={filterPharmacist} onChange={(e) => setFilterPharmacist(e.target.value)} className="text-sm">
            <option value="all">الجميع</option>
            {pharmacistOptions.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">KPI</label>
          <select value={filterKpi} onChange={(e) => setFilterKpi(e.target.value)} className="text-sm">
            <option value="all">الكل</option>
            {templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {canApprove && filterStatus === 'pending' && pendingEntries.length > 0 && (
          <div className="flex items-end gap-2">
            <button onClick={selectAll} className="btn-secondary text-xs py-2 flex-1 justify-center">تحديد الكل</button>
            {selected.size > 0 && <button onClick={clearAll} className="btn-secondary text-xs py-2 px-3">إلغاء</button>}
          </div>
        )}
      </div>

      {/* Entries table */}
      {enrichedEntries.length === 0
        ? <EmptyState icon={ClipboardCheck} title="لا توجد إدخالات" description="لا توجد إدخالات بالفلاتر المحددة" />
        : (
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr>
                  {canApprove && filterStatus === 'pending' && <th className="table-header w-10"></th>}
                  <th className="table-header text-right">الصيدلاني</th>
                  <th className="table-header text-right">KPI</th>
                  <th className="table-header text-center">القيمة</th>
                  <th className="table-header text-center">الإنجاز</th>
                  <th className="table-header text-center">الحالة</th>
                  {canApprove && <th className="table-header text-center">إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {enrichedEntries.map((entry) => {
                  const scfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending
                  const isSelected = selected.has(entry.id)
                  return (
                    <tr key={entry.id} className={`hover:bg-slate-800/20 transition-colors ${isSelected ? 'bg-brand-500/5' : ''}`}>
                      {canApprove && filterStatus === 'pending' && (
                        <td className="table-cell">
                          {entry.status === 'pending' && (
                            <button onClick={() => toggleSelect(entry.id)} className="text-slate-500 hover:text-brand-400">
                              {isSelected ? <CheckSquare className="w-4 h-4 text-brand-400" /> : <Square className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {entry.userName?.[0]}
                          </div>
                          <span className="text-sm text-slate-300">{entry.userName}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.kpiColor }} />
                          <span className="text-sm text-slate-300">{entry.kpiName}</span>
                        </div>
                      </td>
                      <td className="table-cell text-center text-sm text-slate-300">
                        {formatKpiValue(entry.value, entry.kpiType, entry.kpiUnit)}
                      </td>
                      <td className="table-cell text-center">
                        <span className={`text-sm font-bold ${getAchievementColor(entry.achievement)}`}>{entry.achievement}%</span>
                      </td>
                      <td className="table-cell text-center">
                        <span className={`badge text-xs ${scfg.bg}`}>{scfg.label}</span>
                        {entry.managerComment && (
                          <p className="text-xs text-slate-600 mt-1 max-w-[120px] truncate" title={entry.managerComment}>
                            {entry.managerComment}
                          </p>
                        )}
                      </td>
                      {canApprove && (
                        <td className="table-cell text-center">
                          {entry.status === 'pending' && (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openComment(entry.id, 'approve')}
                                className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors" title="اعتماد">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => openComment(entry.id, 'edit')}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors" title="طلب تعديل">
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button onClick={() => openComment(entry.id, 'reject')}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="رفض">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Action modal */}
      {commentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommentModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <h3 className="text-base font-bold text-white mb-4">
              {commentModal.action === 'approve' ? '✅ اعتماد الإدخال' :
               commentModal.action === 'reject'  ? '❌ رفض الإدخال' : '📝 طلب تعديل'}
            </h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">تعليق (اختياري)</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                placeholder="أضف تعليقاً للصيدلاني..." />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCommentModal(null)} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button onClick={handleAction} disabled={processing}
                className={`flex-1 justify-center ${commentModal.action === 'reject' ? 'btn-danger' : 'btn-primary'}`}>
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {commentModal.action === 'approve' ? 'اعتماد' :
                 commentModal.action === 'reject'  ? 'رفض'   : 'إرسال طلب التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
