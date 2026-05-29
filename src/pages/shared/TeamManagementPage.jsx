// ============================================================
// Team Management — Full CRUD, performance summary
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, Plus, Pencil, Save, X, Loader2, Search,
  ToggleLeft, ToggleRight, Phone, Mail, Calendar,
  Award, TrendingUp, Building2, Shield,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTeamStore } from '../../store/teamStore'
import { useBranchStore } from '../../store/branchStore'
import { useKpiStore } from '../../store/kpiStore'
import { useToastStore } from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import AchievementCircle from '../../components/charts/AchievementCircle'
import PerformanceChart from '../../components/charts/PerformanceChart'
import { todayStr, getRoleLabel, getRoleBadgeStyle, getAchievementColor, currentMonthRange } from '../../utils/helpers'

const ROLES = [
  { value: 'pharmacist',    label: 'صيدلاني' },
  { value: 'store_manager', label: 'مدير فرع' },
  { value: 'area_manager',  label: 'مدير منطقة' },
]

const DEFAULT_FORM = {
  displayName: '', email: '', phone: '', role: 'pharmacist',
  branchId: '', employeeId: '', joiningDate: '', active: true,
}

export default function TeamManagementPage() {
  const { userProfile } = useAuthStore()
  const { members, subscribeAllMembers, subscribeMembers, createMember, updateMember, toggleMember } = useTeamStore()
  const { branches, subscribeBranches } = useBranchStore()
  const { templates, entries, subscribeTemplates, subscribeAllEntries } = useKpiStore()
  const toast = useToastStore()

  const [selected,  setSelected]  = useState(null)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(DEFAULT_FORM)
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterBranch, setFilterBranch] = useState('all')

  const isAdmin   = userProfile?.role === 'admin'
  const isArea    = ['admin', 'area_manager'].includes(userProfile?.role)
  const isManager = ['admin', 'area_manager', 'store_manager'].includes(userProfile?.role)

  useEffect(() => {
    const u1 = isAdmin ? subscribeAllMembers() : subscribeMembers({ branchId: userProfile?.branchId })
    const u2 = subscribeBranches()
    const u3 = subscribeTemplates()
    const u4 = subscribeAllEntries()
    return () => { u1(); u2(); u3(); u4() }
  }, [userProfile?.branchId])

  const today = todayStr()
  const { from: monthFrom, to: monthTo } = currentMonthRange()

  // Pharmacists only (team members view)
  const pharmacists = useMemo(() => members.filter((m) => m.role === 'pharmacist'), [members])

  // Enrich with performance data
  const enriched = useMemo(() =>
    pharmacists.map((m) => {
      const todayEntries = entries.filter((e) => e.userId === (m.uid || m.id) && e.date === today)
      const monthEntries = entries.filter((e) => e.userId === (m.uid || m.id) && e.date >= monthFrom && e.date <= monthTo)
      const todayAvg = todayEntries.length ? Math.round(todayEntries.reduce((s, e) => s + e.achievement, 0) / todayEntries.length) : 0
      const monthAvg = monthEntries.length ? Math.round(monthEntries.reduce((s, e) => s + e.achievement, 0) / monthEntries.length) : 0
      const branch   = branches.find((b) => b.id === m.branchId)
      return { ...m, todayAvg, monthAvg, branch, todayEntries, monthEntries }
    }).sort((a, b) => b.todayAvg - a.todayAvg),
    [pharmacists, entries, today, monthFrom, monthTo, branches]
  )

  const filtered = enriched.filter((m) => {
    const matchSearch = m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.employeeId?.toLowerCase().includes(search.toLowerCase())
    const matchBranch = filterBranch === 'all' || m.branchId === filterBranch
    return matchSearch && matchBranch
  })

  const selectedMember = selected ? enriched.find((m) => (m.uid || m.id) === selected) : null

  // Chart for selected member
  const memberChart = useMemo(() => {
    if (!selectedMember) return []
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const de = entries.filter((e) => e.userId === (selectedMember.uid || selectedMember.id) && e.date === ds)
      const avg = de.length ? Math.round(de.reduce((s, e) => s + e.achievement, 0) / de.length) : 0
      days.push({ date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }), value: avg, target: 80 })
    }
    return days
  }, [selectedMember, entries])

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, branchId: userProfile?.branchId || '' })
    setEditId(null); setShowForm(true)
  }
  const openEdit = (m) => {
    setForm({ ...DEFAULT_FORM, ...m, branchId: m.branchId || '' })
    setEditId(m.uid || m.id); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM) }

  const handleSave = async () => {
    if (!form.displayName || !form.email) return
    setSaving(true)
    try {
      if (editId) {
        await updateMember(editId, form, userProfile?.uid, userProfile?.role)
        toast.success('تم تحديث بيانات العضو')
      } else {
        await createMember(form, userProfile?.uid, userProfile?.role)
        toast.success('تم إضافة العضو بنجاح')
      }
      closeForm()
    } catch { toast.error('حدث خطأ — حاول مرة أخرى') }
    finally { setSaving(false) }
  }

  const handleToggle = async (uid) => {
    await toggleMember(uid, userProfile?.uid, userProfile?.role)
    toast.info('تم تغيير حالة العضو')
  }

  const activeKpis = templates.filter((t) => t.active && t.type !== 'formula' && t.visibleTo?.includes('pharmacist'))

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">إدارة الفريق</h1>
          <p className="text-sm text-slate-400 mt-0.5">{pharmacists.length} صيدلاني · {pharmacists.filter((m) => m.active !== false).length} نشط</p>
        </div>
        {isManager && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> عضو جديد
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الإيميل أو ID..." className="pr-9 text-sm" />
        </div>
        {isAdmin && (
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="text-sm">
            <option value="all">جميع الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Members list */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 && <EmptyState icon={Users} title="لا يوجد أعضاء" description="أضف أعضاء جدد للفريق" />}

          {filtered.map((m, idx) => {
            const uid = m.uid || m.id
            return (
              <div key={uid}
                onClick={() => setSelected(uid === selected ? null : uid)}
                className={`kpi-card cursor-pointer transition-all ${selected === uid ? 'border-brand-500/40 bg-brand-500/5' : 'hover:border-slate-700'} ${m.active === false ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' : idx === 1 ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-800 text-slate-600'
                  }`}>{idx + 1}</span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {m.displayName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{m.displayName}</div>
                    <div className="text-xs text-slate-500 truncate">{m.branch?.name || '—'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-bold ${getAchievementColor(m.todayAvg)}`}>{m.todayAvg}%</div>
                    <div className="text-xs text-slate-600">اليوم</div>
                  </div>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5">
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${Math.min(m.todayAvg, 100)}%`,
                    background: m.todayAvg >= 80 ? '#1a9a7e' : m.todayAvg >= 60 ? '#eab308' : '#ef4444',
                  }} />
                </div>

                {isManager && (
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-800/60">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(m) }}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleToggle(uid) }}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                      {m.active !== false ? <ToggleRight className="w-3.5 h-3.5 text-brand-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Member detail */}
        <div className="lg:col-span-3">
          {selectedMember ? (
            <div className="space-y-4 animate-fade-in">
              <div className="kpi-card">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xl">
                    {selectedMember.displayName?.[0]}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-white">{selectedMember.displayName}</h2>
                    {selectedMember.email && <p className="text-sm text-slate-400 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selectedMember.email}</p>}
                    {selectedMember.phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedMember.phone}</p>}
                    {selectedMember.employeeId && <p className="text-xs text-slate-600">ID: {selectedMember.employeeId}</p>}
                  </div>
                  <AchievementCircle pct={selectedMember.monthAvg} size={80} label="الشهر" />
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
                  {[
                    { label: 'اليوم',     value: `${selectedMember.todayAvg}%`,   color: getAchievementColor(selectedMember.todayAvg) },
                    { label: 'الشهر',     value: `${selectedMember.monthAvg}%`,   color: getAchievementColor(selectedMember.monthAvg) },
                    { label: 'الإدخالات', value: `${selectedMember.todayEntries.length}/${activeKpis.length}`, color: 'text-slate-300' },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">الأداء — آخر 14 يوم</h3>
                <PerformanceChart data={memberChart} dataKey="value" targetKey="target" color="#1a9a7e" height={180} />
              </div>

              {/* KPI breakdown today */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">KPIs اليوم</h3>
                <div className="space-y-2">
                  {activeKpis.map((kpi) => {
                    const entry = selectedMember.todayEntries.find((e) => e.kpiId === kpi.id)
                    return (
                      <div key={kpi.id} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kpi.color ?? kpi.defaultColor ?? '#a1a1aa' }} />
                        <span className="flex-1 text-sm text-slate-400">{kpi.name}</span>
                        {entry ? (
                          <>
                            <div className="w-20 bg-slate-800 rounded-full h-1.5">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(entry.achievement, 100)}%`, background: kpi.color ?? kpi.defaultColor ?? '#a1a1aa' }} />
                            </div>
                            <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(entry.achievement)}`}>{entry.achievement}%</span>
                          </>
                        ) : <span className="text-xs text-slate-700">لم يُدخل</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="kpi-card h-full min-h-[300px]">
              <EmptyState icon={Users} title="اختر عضواً لعرض تفاصيله" />
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editId ? 'تعديل عضو' : 'عضو جديد'}</h2>
              <button onClick={closeForm} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">الاسم الكامل *</label>
                <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="محمد أحمد" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">البريد الإلكتروني *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@example.com" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الجوال</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="05xxxxxxxx" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الدور</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الفرع</label>
                  <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                    <option value="">-- اختر فرعاً --</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">رقم الموظف</label>
                  <input value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} placeholder="EMP-001" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">تاريخ التعيين</label>
                  <input type="date" value={form.joiningDate} onChange={(e) => setForm((f) => ({ ...f, joiningDate: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">الحالة</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${form.active ? 'bg-brand-500/20 text-brand-300 border-brand-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                  {form.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {form.active ? 'نشط' : 'موقوف'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeForm} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button onClick={handleSave} disabled={!form.displayName || !form.email || saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'حفظ التعديلات' : 'إضافة العضو'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
