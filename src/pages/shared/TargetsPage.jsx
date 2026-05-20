// ============================================================
// Targets Management Page
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Target, Plus, Pencil, Trash2, Save, X, Loader2,
  Calendar, Building2, ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTargetStore } from '../../store/targetStore'
import { useBranchStore } from '../../store/branchStore'
import { useKpiStore } from '../../store/kpiStore'
import { useToastStore } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import { formatKpiValue } from '../../utils/helpers'

const PERIODS = [
  { value: 'daily',   label: 'يومي' },
  { value: 'weekly',  label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
]

const MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
]

const CURRENT_YEAR  = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

const DEFAULT_FORM = {
  branchId: '', kpiId: '', kpiName: '', targetValue: '',
  period: 'monthly', year: CURRENT_YEAR, month: CURRENT_MONTH,
}

export default function TargetsPage() {
  const { userProfile } = useAuthStore()
  const { targets, subscribeAllTargets, createTarget, updateTarget, deleteTarget } = useTargetStore()
  const { branches, subscribeBranches } = useBranchStore()
  const { templates, subscribeTemplates } = useKpiStore()
  const toast = useToastStore()

  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [form,        setForm]        = useState(DEFAULT_FORM)
  const [saving,      setSaving]      = useState(false)
  const [delConfirm,  setDelConfirm]  = useState(null)
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [filterMonth,  setFilterMonth]  = useState('all')

  useEffect(() => {
    const u1 = subscribeAllTargets()
    const u2 = subscribeBranches()
    const u3 = subscribeTemplates()
    return () => { u1(); u2(); u3() }
  }, [])

  const activeKpis = templates.filter((t) => t.active && t.type !== 'formula')

  const filtered = useMemo(() => targets.filter((t) => {
    const mb = filterBranch === 'all' || t.branchId === filterBranch
    const mp = filterPeriod === 'all' || t.period   === filterPeriod
    const mm = filterMonth  === 'all' || String(t.month) === filterMonth
    return mb && mp && mm
  }), [targets, filterBranch, filterPeriod, filterMonth])

  const getBranchName = (bid) => branches.find((b) => b.id === bid)?.name || bid

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, branchId: userProfile?.branchId || '' })
    setEditId(null); setShowForm(true)
  }
  const openEdit = (t) => {
    setForm({ ...DEFAULT_FORM, ...t, targetValue: String(t.targetValue) })
    setEditId(t.id); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM) }

  const handleKpiChange = (kpiId) => {
    const kpi = activeKpis.find((k) => k.id === kpiId)
    setForm((f) => ({ ...f, kpiId, kpiName: kpi?.name || '', targetValue: String(kpi?.target || '') }))
  }

  const handleSave = async () => {
    if (!form.branchId)     { toast.error('اختر الفرع'); return }
    if (!form.kpiId)        { toast.error('اختر مؤشر KPI'); return }
    if (!form.targetValue || isNaN(Number(form.targetValue))) { toast.error('القيمة المستهدفة يجب أن تكون رقماً'); return }
    if (Number(form.targetValue) <= 0) { toast.error('الهدف يجب أن يكون أكبر من صفر'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        targetValue: Number(form.targetValue),
        year:  Number(form.year),
        month: Number(form.month),
      }
      if (editId) {
        await updateTarget(editId, payload, userProfile?.uid, userProfile?.role)
        toast.success('تم تحديث الهدف')
      } else {
        await createTarget(payload, userProfile?.uid, userProfile?.role)
        toast.success('تم إضافة الهدف')
      }
      closeForm()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteTarget(id, userProfile?.uid, userProfile?.role)
      toast.success('تم حذف الهدف')
    } catch { toast.error('حدث خطأ') }
    setDelConfirm(null)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-brand-400" /> إدارة الأهداف
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{targets.length} هدف مُسجَّل</p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm gap-2">
          <Plus className="w-4 h-4" /> هدف جديد
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="text-sm">
          <option value="all">جميع الفروع</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="text-sm">
          <option value="all">كل الفترات</option>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="text-sm">
          <option value="all">كل الأشهر</option>
          {MONTHS.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0
        ? <EmptyState icon={Target} title="لا توجد أهداف" description="أضف أهدافاً للفروع والمؤشرات" />
        : (
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header text-right">الفرع</th>
                  <th className="table-header text-right">المؤشر (KPI)</th>
                  <th className="table-header text-center">الهدف</th>
                  <th className="table-header text-center">الفترة</th>
                  <th className="table-header text-center">الشهر / السنة</th>
                  <th className="table-header text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const kpi = activeKpis.find((k) => k.id === t.kpiId)
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                          <span className="text-sm text-slate-300">{getBranchName(t.branchId)}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kpi?.color || '#1a9a7e' }} />
                          <span className="text-sm text-slate-300">{t.kpiName || kpi?.name || t.kpiId}</span>
                        </div>
                      </td>
                      <td className="table-cell text-center font-semibold text-brand-300">
                        {formatKpiValue(t.targetValue, kpi?.type, kpi?.unit)}
                      </td>
                      <td className="table-cell text-center">
                        <span className="badge text-xs bg-slate-800 text-slate-400 border-slate-700">
                          {PERIODS.find((p) => p.value === t.period)?.label}
                        </span>
                      </td>
                      <td className="table-cell text-center text-sm text-slate-400">
                        {t.month ? `${MONTHS[t.month - 1]} ${t.year}` : t.year}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(t)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDelConfirm({ id: t.id, label: `${getBranchName(t.branchId)} — ${t.kpiName}` })}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editId ? 'تعديل الهدف' : 'هدف جديد'}</h2>
              <button onClick={closeForm} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">الفرع *</label>
                <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">-- اختر الفرع --</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">مؤشر KPI *</label>
                <select value={form.kpiId} onChange={(e) => handleKpiChange(e.target.value)}>
                  <option value="">-- اختر المؤشر --</option>
                  {activeKpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">القيمة المستهدفة *</label>
                  <input type="number" min="1" value={form.targetValue}
                    onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
                    placeholder="مثال: 150000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">الفترة</label>
                  <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                    {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">الشهر</label>
                  <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}>
                    {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">السنة</label>
                  <select value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}>
                    {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeForm} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> حفظ...</> : <><Save className="w-4 h-4" />{editId ? 'حفظ التعديلات' : 'إضافة الهدف'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!delConfirm}
        onClose={() => setDelConfirm(null)}
        onConfirm={() => handleDelete(delConfirm?.id)}
        title="حذف الهدف"
        message={`هل تريد حذف هدف "${delConfirm?.label}"؟`}
        confirmLabel="حذف"
        danger
      />
    </div>
  )
}
