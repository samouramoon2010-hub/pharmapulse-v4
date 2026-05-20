// ============================================================
// Branch Management — Full CRUD, role-aware
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import {
  Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Save, X, Loader2, MapPin, Phone, Users, Target,
  Search, ChevronDown, TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'
import { useKpiStore } from '../../store/kpiStore'
import { useTeamStore } from '../../store/teamStore'
import { useToastStore } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import AchievementCircle from '../../components/charts/AchievementCircle'
import PerformanceChart from '../../components/charts/PerformanceChart'
import { todayStr, getAchievementColor } from '../../utils/helpers'
import { DUMMY_USERS } from '../../data/dummyData'

const SA_REGIONS = ['الرياض','جدة','مكة المكرمة','المدينة المنورة','الدمام','الخبر','الطائف','القصيم','الأحساء','تبوك','أبها','جازان']
const MANAGERS   = DUMMY_USERS.filter((u) => u.role === 'store_manager')

const DEFAULT_FORM = {
  name: '', code: '', region: 'الرياض', city: '', address: '',
  phone: '', managerId: '', targetMonthly: 100000, active: true,
}

export default function BranchManagementPage() {
  const { userProfile } = useAuthStore()
  const { branches, subscribeBranches, createBranch, updateBranch, toggleBranch, deleteBranch } = useBranchStore()
  const { entries, subscribeAllEntries } = useKpiStore()
  const { members, subscribeAllMembers } = useTeamStore()
  const toast = useToastStore()

  const [selected, setSelected]     = useState(null)
  const [showForm, setShowForm]      = useState(false)
  const [editId,   setEditId]        = useState(null)
  const [form,     setForm]          = useState(DEFAULT_FORM)
  const [saving,   setSaving]        = useState(false)
  const [search,   setSearch]        = useState('')
  const [confirm,  setConfirm]       = useState(null)

  const isAdmin   = userProfile?.role === 'admin'
  const isArea    = ['admin', 'area_manager'].includes(userProfile?.role)
  const canEdit   = isAdmin

  useEffect(() => {
    const u1 = subscribeBranches()
    const u2 = subscribeAllEntries()
    const u3 = subscribeAllMembers()
    return () => { u1(); u2(); u3() }
  }, [])

  const today = todayStr()

  // Enrich each branch with live stats
  const branchStats = useMemo(() => {
    let list = branches
    // Area manager: show only their region (demo: show all since no region filter on users)
    return list.map((b) => {
      const todayEntries  = entries.filter((e) => e.branchId === b.id && e.date === today)
      const monthEntries  = entries.filter((e) => e.branchId === b.id)
      const staff         = members.filter((u) => u.branchId === b.id && u.role === 'pharmacist')
      const managerObj    = MANAGERS.find((m) => m.uid === b.managerId)
      const todayAvg      = todayEntries.length
        ? Math.round(todayEntries.reduce((s, e) => s + e.achievement, 0) / todayEntries.length) : 0
      const monthAvg      = monthEntries.length
        ? Math.round(monthEntries.reduce((s, e) => s + e.achievement, 0) / monthEntries.length) : 0
      return { ...b, todayAvg, monthAvg, staffCount: staff.length, staff, managerName: managerObj?.displayName || '—', todayEntries }
    }).sort((a, b) => b.todayAvg - a.todayAvg)
  }, [branches, entries, members, today])

  const filtered = branchStats.filter((b) =>
    b.name?.toLowerCase().includes(search.toLowerCase()) ||
    b.code?.toLowerCase().includes(search.toLowerCase()) ||
    b.region?.includes(search)
  )

  const selectedBranch = selected ? branchStats.find((b) => b.id === selected) : null

  // Chart data for selected branch
  const branchChartData = useMemo(() => {
    if (!selectedBranch) return []
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const de = entries.filter((e) => e.branchId === selectedBranch.id && e.date === ds)
      const avg = de.length ? Math.round(de.reduce((s, e) => s + e.achievement, 0) / de.length) : 0
      days.push({ date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }), value: avg, target: 80 })
    }
    return days
  }, [selectedBranch, entries])

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, order: branches.length + 1 })
    setEditId(null); setShowForm(true)
  }
  const openEdit = (branch) => {
    setForm({ ...DEFAULT_FORM, ...branch })
    setEditId(branch.id); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM) }

  const handleSave = async () => {
    if (!form.name || !form.code) return
    setSaving(true)
    try {
      if (editId) {
        await updateBranch(editId, form, userProfile?.uid, userProfile?.role)
        toast.success('تم تحديث بيانات الفرع')
      } else {
        await createBranch(form, userProfile?.uid, userProfile?.role)
        toast.success('تم إنشاء الفرع بنجاح')
      }
      closeForm()
    } catch { toast.error('حدث خطأ — حاول مرة أخرى') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await deleteBranch(id, userProfile?.uid, userProfile?.role)
    toast.success('تم حذف الفرع')
    if (selected === id) setSelected(null)
  }

  const handleToggle = async (id) => {
    await toggleBranch(id)
    toast.info('تم تغيير حالة الفرع')
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">إدارة الفروع</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {branches.length} فرع · {branches.filter((b) => b.active).length} نشط
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> فرع جديد
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الكود أو المنطقة..." className="pr-9 text-sm" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Branch list */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 && <EmptyState icon={Building2} title="لا توجد فروع" description="أضف فرعاً جديداً للبدء" />}

          {filtered.map((branch, idx) => (
            <div key={branch.id}
              onClick={() => setSelected(branch.id === selected ? null : branch.id)}
              className={`kpi-card cursor-pointer transition-all ${selected === branch.id ? 'border-brand-500/40 bg-brand-500/5' : 'hover:border-slate-700'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' : idx === 1 ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-800 text-slate-500'
                }`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200 truncate">{branch.name}</span>
                    {!branch.active && <span className="badge text-xs bg-red-500/10 text-red-400 border-red-500/20">متوقف</span>}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>{branch.code}</span>
                    <span>·</span>
                    <MapPin className="w-3 h-3" /><span>{branch.region}</span>
                    <span>·</span>
                    <Users className="w-3 h-3" /><span>{branch.staffCount}</span>
                  </div>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${getAchievementColor(branch.todayAvg)}`}>{branch.todayAvg}%</span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(branch.todayAvg, 100)}%`,
                  background: branch.todayAvg >= 80 ? '#1a9a7e' : branch.todayAvg >= 60 ? '#eab308' : '#ef4444',
                }} />
              </div>

              {/* Actions */}
              {canEdit && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-800/60">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(branch) }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleToggle(branch.id) }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                    {branch.active ? <ToggleRight className="w-3.5 h-3.5 text-brand-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirm({ id: branch.id, name: branch.name }) }}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Branch detail */}
        <div className="lg:col-span-3">
          {selectedBranch ? (
            <div className="space-y-4 animate-fade-in">
              {/* Info card */}
              <div className="kpi-card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedBranch.name}</h2>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedBranch.address || selectedBranch.region}</span>
                      {selectedBranch.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selectedBranch.phone}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">مدير الفرع: {selectedBranch.managerName}</p>
                  </div>
                  <span className={`badge text-sm ${selectedBranch.active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {selectedBranch.active ? 'نشط' : 'متوقف'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
                  {[
                    { label: 'إنجاز اليوم', value: `${selectedBranch.todayAvg}%`, color: getAchievementColor(selectedBranch.todayAvg) },
                    { label: 'إنجاز الشهر', value: `${selectedBranch.monthAvg}%`, color: getAchievementColor(selectedBranch.monthAvg) },
                    { label: 'عدد الصيادلة', value: selectedBranch.staffCount, color: 'text-slate-300' },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">الأداء — آخر 14 يوم</h3>
                <PerformanceChart data={branchChartData} dataKey="value" targetKey="target" color="#1a9a7e" height={180} type="bar" />
              </div>

              {/* Staff list */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">الفريق ({selectedBranch.staffCount})</h3>
                {selectedBranch.staff.length === 0
                  ? <p className="text-sm text-slate-600 text-center py-4">لا يوجد صيادلة مرتبطون بهذا الفرع</p>
                  : (
                    <div className="space-y-2">
                      {selectedBranch.staff.map((m) => {
                        const me = selectedBranch.todayEntries.filter((e) => e.userId === m.uid)
                        const avg = me.length ? Math.round(me.reduce((s, e) => s + e.achievement, 0) / me.length) : 0
                        return (
                          <div key={m.uid} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
                              {m.displayName?.[0]}
                            </div>
                            <span className="flex-1 text-sm text-slate-300">{m.displayName}</span>
                            <div className="w-20 bg-slate-800 rounded-full h-1.5">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(avg, 100)}%`, background: avg >= 80 ? '#1a9a7e' : avg >= 60 ? '#eab308' : '#ef4444' }} />
                            </div>
                            <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(avg)}`}>{avg}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              </div>
            </div>
          ) : (
            <div className="kpi-card h-full min-h-[300px]">
              <EmptyState icon={Building2} title="اختر فرعاً لعرض تفاصيله" />
            </div>
          )}
        </div>
      </div>

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editId ? 'تعديل الفرع' : 'فرع جديد'}</h2>
              <button onClick={closeForm} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">اسم الفرع *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="فرع العليا" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">كود الفرع *</label>
                  <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="ALY-001" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">المنطقة</label>
                  <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
                    {SA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">المدينة</label>
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="الرياض" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">العنوان</label>
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="شارع التحلية..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الهاتف</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="011xxxxxxx" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الهدف الشهري (ر.س)</label>
                  <input type="number" value={form.targetMonthly} onChange={(e) => setForm((f) => ({ ...f, targetMonthly: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">مدير الفرع</label>
                <select value={form.managerId} onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}>
                  <option value="">-- اختر مديراً --</option>
                  {MANAGERS.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">الحالة</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${form.active ? 'bg-brand-500/20 text-brand-300 border-brand-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                  {form.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {form.active ? 'نشط' : 'متوقف'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeForm} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button onClick={handleSave} disabled={!form.name || !form.code || saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'حفظ التعديلات' : 'إنشاء الفرع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => handleDelete(confirm.id)}
        title="حذف الفرع"
        message={`هل تريد حذف "${confirm?.name}"؟ لا يمكن التراجع عن هذه العملية.`}
        confirmLabel="حذف"
        danger
      />
    </div>
  )
}
