// ============================================================
// Pharmacies Management — Full CRUD, Realtime, Enterprise UI
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Building2, Plus, Search, Pencil, Trash2,
  ToggleLeft, ToggleRight, MapPin, Save, X,
  Loader2, Filter, ChevronDown, AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore } from '../../components/ui/Toast'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/SkeletonCard'
import { pharmacyCodeExists } from '../../services/pharmacyService'

const SA_REGIONS = [
  'الرياض', 'مكة المكرمة', 'المدينة المنورة', 'القصيم',
  'المنطقة الشرقية', 'عسير', 'تبوك', 'حائل', 'الحدود الشمالية',
  'جازان', 'نجران', 'الباحة', 'الجوف',
]

const EMPTY = {
  code: '', name: '', region: 'الرياض', city: '',
  managerEmail: '', managerUid: '', active: true,
}

function Field({ label, required, error, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="w-3 h-3" />{error}
        </p>
      )}
    </div>
  )
}

export default function PharmaciesPage() {
  const { userProfile }  = useAuthStore()
  const { pharmacies, loading, subscribe, create, update, toggle, remove } = usePharmacyStore()
  const toast = useToastStore()

  const [search,       setSearch]       = useState('')
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterActive, setFilterActive] = useState('all')
  const [page,         setPage]         = useState(1)
  const PER_PAGE = 15

  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [errors,   setErrors]   = useState({})
  const [saving,   setSaving]   = useState(false)
  const [confirm,  setConfirm]  = useState(null)

  useEffect(() => { const u = subscribe(); return u }, [])

  // Filter + paginate
  const filtered = useMemo(() => {
    return pharmacies.filter((p) => {
      const q  = search.toLowerCase()
      const ms = !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q)
      const mr = filterRegion === 'all' || p.region === filterRegion
      const ma = filterActive === 'all' || (filterActive === 'active' ? p.active !== false : p.active === false)
      return ms && mr && ma
    })
  }, [pharmacies, search, filterRegion, filterActive])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paged      = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const set = (f, v) => { setForm((p) => ({ ...p, [f]: v })); setErrors((e) => ({ ...e, [f]: undefined })) }

  const openCreate = () => { setForm(EMPTY); setEditId(null); setErrors({}); setShowForm(true) }
  const openEdit   = (p)  => {
    setForm({ code: p.code, name: p.name, region: p.region || 'الرياض',
              city: p.city || '', managerEmail: p.managerEmail || '',
              managerUid: p.managerUid || '', active: p.active !== false })
    setEditId(p.id); setErrors({}); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null) }

  const validate = async () => {
    const e = {}
    if (!form.code?.trim()) e.code = 'الكود مطلوب'
    else {
      const dup = await pharmacyCodeExists(form.code.trim(), editId)
      if (dup) e.code = 'هذا الكود مستخدم مسبقاً'
    }
    if (!form.name?.trim()) e.name = 'الاسم مطلوب'
    if (!form.region)        e.region = 'المنطقة مطلوبة'
    return e
  }

  const handleSave = async () => {
    const errs = await validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (editId) {
        await update(editId, form, userProfile?.uid, userProfile?.role)
        toast.success('تم تحديث بيانات الفرع')
      } else {
        await create(form, userProfile?.uid, userProfile?.role)
        toast.success('تم إنشاء الفرع بنجاح')
      }
      closeForm()
    } catch (e) {
      toast.error(e.message)
    } finally { setSaving(false) }
  }

  const handleToggle = async (id) => {
    try {
      await toggle(id, userProfile?.uid, userProfile?.role)
      toast.info('تم تغيير حالة الفرع')
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async (id) => {
    try {
      await remove(id, userProfile?.uid, userProfile?.role)
      toast.success('تم حذف الفرع')
    } catch (e) { toast.error(e.message) }
    setConfirm(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-400" /> إدارة الفروع
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pharmacies.length} فرع · {pharmacies.filter((p) => p.active !== false).length} نشط
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary gap-2">
          <Plus className="w-4 h-4" /> إضافة فرع
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="بحث بالاسم أو الكود أو المدينة..." className="pr-9 text-sm" />
        </div>
        <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setPage(1) }} className="text-sm">
          <option value="all">كل المناطق</option>
          {SA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value); setPage(1) }} className="text-sm">
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">متوقف</option>
        </select>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={8} /> :
       paged.length === 0 ? (
        <EmptyState icon={Building2} title="لا توجد فروع"
          description="أضف فرعاً جديداً أو غيّر معايير البحث"
          action={<button onClick={openCreate} className="btn btn-primary btn-sm gap-2"><Plus className="w-4 h-4" />إضافة فرع</button>} />
      ) : (
        <>
          <div className="tbl-wrap overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الاسم</th>
                  <th className="hidden md:table-cell">المنطقة</th>
                  <th className="hidden md:table-cell">المدينة</th>
                  <th>الحالة</th>
                  <th className="text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => (
                  <tr key={p.id} className={p.active === false ? 'opacity-50' : ''}>
                    <td><code className="text-xs bg-slate-800 px-2 py-0.5 rounded text-brand-400">{p.code}</code></td>
                    <td><span className="text-sm font-medium text-slate-200">{p.name}</span></td>
                    <td className="hidden md:table-cell text-sm text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 inline ml-1 text-slate-600" />{p.region}
                    </td>
                    <td className="hidden md:table-cell text-sm text-slate-400">{p.city || '—'}</td>
                    <td>
                      <span className={`badge text-xs ${
                        p.active !== false
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {p.active !== false ? 'نشط' : 'متوقف'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(p)} className="btn btn-ghost btn-icon btn-sm" title="تعديل">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleToggle(p.id)} className="btn btn-ghost btn-icon btn-sm" title="تفعيل/إيقاف">
                          {p.active !== false
                            ? <ToggleRight className="w-4 h-4 text-brand-400" />
                            : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                        </button>
                        <button onClick={() => setConfirm({ id: p.id, name: p.name })}
                          className="btn btn-ghost btn-icon btn-sm hover:text-red-400" title="حذف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{filtered.length} فرع · صفحة {page} من {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost btn-sm">السابق</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`btn btn-sm ${page === n ? 'btn-primary' : 'btn-ghost'}`}>{n}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost btn-sm">التالي</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg
                          max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-bold text-white">{editId ? 'تعديل الفرع' : 'فرع جديد'}</h2>
              <button onClick={closeForm} className="btn btn-ghost btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="كود الفرع" required error={errors.code}>
                  <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
                    placeholder="5074" dir="ltr" disabled={!!editId}
                    className={editId ? 'opacity-60 cursor-not-allowed' : ''} />
                </Field>
                <Field label="اسم الفرع" required error={errors.name}>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="صيدلية الأثير" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="المنطقة" required error={errors.region}>
                  <select value={form.region} onChange={(e) => set('region', e.target.value)}>
                    {SA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="المدينة">
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="الدمام" />
                </Field>
              </div>
              <Field label="بريد مدير الفرع">
                <input type="email" dir="ltr" value={form.managerEmail}
                  onChange={(e) => set('managerEmail', e.target.value)}
                  placeholder="manager@company.com" />
              </Field>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-300">الحالة</span>
                <button type="button" onClick={() => set('active', !form.active)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
                    form.active
                      ? 'bg-brand-500/15 border-brand-500/30 text-brand-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}>
                  {form.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {form.active ? 'نشط' : 'متوقف'}
                </button>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeForm} className="btn btn-secondary flex-1">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'حفظ التعديلات' : 'إنشاء الفرع'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={() => handleDelete(confirm?.id)}
        title="حذف الفرع" message={`هل تريد حذف "${confirm?.name}"؟ لا يمكن التراجع.`}
        confirmLabel="حذف" danger />
    </div>
  )
}
