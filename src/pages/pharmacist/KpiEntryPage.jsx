// ============================================================
// KPI Entry Page — Daily entry for pharmacist
// userId  → auth.currentUser.uid (source of truth)
// pharmacyId → userProfile.pharmacyId (from Firestore)
// date    → new Date().toISOString().split('T')[0]
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  ClipboardList, CheckCircle2, AlertCircle, Save,
  Loader2, Calendar, RefreshCw, Info,
} from 'lucide-react'
import { auth } from '../../services/firebase'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }    from '../../components/ui/Toast'

// Compute today once — not inside render
const TODAY = new Date().toISOString().split('T')[0]

const KPI_FIELDS = [
  { key: 'wasfaty',     label: 'وصفتي (Wasfaty)',           hint: 'عدد الوصفات الإلكترونية',       emoji: '📋' },
  { key: 'omni',        label: 'أومني هيلث (Omni Health)',   hint: 'مبيعات أومني هيلث',             emoji: '❤️' },
  { key: 'wellness',    label: 'ويلنس (Wellness)',           hint: 'منتجات الصحة والعافية',          emoji: '⭐' },
  { key: 'basket',      label: 'متوسط السلة (Basket)',       hint: 'متوسط قيمة السلة اليومية',      emoji: '🧺' },
  { key: 'crossSelling',label: 'البيع المتقاطع (Cross Sell)',hint: 'عدد عمليات البيع الإضافي',      emoji: '🔀' },
]

const EMPTY_FORM = { wasfaty: '', omni: '', wellness: '', basket: '', crossSelling: '', notes: '' }

export default function KpiEntryPage() {
  const { userProfile }                               = useAuthStore()
  const { entries, subscribeMyEntries, saveEntry }    = useKpiStore()
  const { pharmacies, subscribe: subscribePh }        = usePharmacyStore()
  const toast                                         = useToastStore()

  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})

  // ── Resolved IDs ─────────────────────────────────────────────
  // uid: prefer auth.currentUser (always fresh), fallback to profile
  const uid        = auth?.currentUser?.uid || userProfile?.uid
  const pharmacyId = userProfile?.pharmacyId || null

  // ── Subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const u2 = subscribePh()
    if (!uid || !pharmacyId) return u2

    const u1 = subscribeMyEntries(uid, pharmacyId)
    return () => { u1(); u2() }
  }, [uid, pharmacyId])

  // ── Find existing entry for selected date ─────────────────────
  const existingEntry = useMemo(() =>
    entries.find(
      (e) => e.userId === uid && e.pharmacyId === pharmacyId && e.date === selectedDate
    ),
    [entries, uid, pharmacyId, selectedDate]
  )

  // ── Pre-fill form when date has existing data ─────────────────
  useEffect(() => {
    if (existingEntry) {
      setForm({
        wasfaty:      String(existingEntry.wasfaty      ?? ''),
        omni:         String(existingEntry.omni         ?? ''),
        wellness:     String(existingEntry.wellness     ?? ''),
        basket:       String(existingEntry.basket       ?? ''),
        crossSelling: String(existingEntry.crossSelling ?? ''),
        notes:        existingEntry.notes || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [selectedDate, existingEntry?.id])

  const pharmacy  = pharmacies.find((p) => p.id === pharmacyId)
  const setField  = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }

  // ── Validation ────────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (selectedDate > TODAY) e._global = 'لا يمكن إدخال بيانات لتاريخ مستقبلي'
    KPI_FIELDS.forEach(({ key }) => {
      const v = form[key]
      if (v !== '' && isNaN(Number(v))) e[key] = 'يجب أن يكون رقماً'
      if (v !== '' && Number(v) < 0)   e[key] = 'لا يمكن أن تكون القيمة سالبة'
    })
    return e
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSave = async () => {
    // ①  Validate form fields
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    // ②  Guard: pharmacyId must exist
    if (!pharmacyId) {
      toast.error('هذا المستخدم غير مرتبط بفرع — تواصل مع الإدارة لإضافة الفرع')
      return
    }

    // ③  Guard: uid must exist
    if (!uid) {
      toast.error('لم يتم التعرف على هوية المستخدم — سجّل الدخول مجدداً')
      return
    }

    // ④  Build payload
    const payload = {
      userId:       uid,
      pharmacyId:   pharmacyId,
      date:         selectedDate,
      wasfaty:      Number(form.wasfaty)      || 0,
      omni:         Number(form.omni)         || 0,
      wellness:     Number(form.wellness)     || 0,
      basket:       Number(form.basket)       || 0,
      crossSelling: Number(form.crossSelling) || 0,
      notes:        form.notes?.trim()        || '',
      actorId:      uid,
      actorRole:    userProfile?.role,
    }

    // ⑤  Debug log (remove in production)
    console.log('[KpiEntryPage] payload before save:', payload)

    setSaving(true)
    try {
      await saveEntry(payload)
      toast.success(`✅ تم حفظ KPI بتاريخ ${selectedDate}`)
    } catch (err) {
      console.error('[KpiEntryPage] save error:', err)
      toast.error(err.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-400" /> إدخال KPI
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pharmacy?.name || pharmacyId || '—'} · {userProfile?.displayName}
          </p>
          {/* Debug info (remove in production) */}
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-slate-700 mt-1 font-mono">
              uid: {uid || 'NULL'} · pharmacyId: {pharmacyId || 'NULL'}
            </p>
          )}
        </div>
        {existingEntry && (
          <span className="badge bg-green-500/10 text-green-400 border-green-500/20 text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> تم الإدخال مسبقاً
          </span>
        )}
      </div>

      {/* No pharmacy warning */}
      {!pharmacyId && (
        <div className="card card-p bg-amber-500/5 border-amber-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="text-sm text-amber-400">
            <strong>حسابك غير مرتبط بفرع.</strong> تواصل مع المدير لربط حسابك بالفرع الصحيح.
          </div>
        </div>
      )}

      {/* No uid warning */}
      {!uid && (
        <div className="card card-p bg-red-500/5 border-red-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="text-sm text-red-400">
            انتهت الجلسة — <button onClick={() => window.location.href='/login'} className="underline">سجّل الدخول مجدداً</button>
          </div>
        </div>
      )}

      {/* Date selector */}
      <div className="card card-p flex items-center gap-4">
        <Calendar className="w-5 h-5 text-brand-400 flex-shrink-0" />
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">تاريخ الإدخال</label>
          <input type="date" value={selectedDate} max={TODAY}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm bg-transparent border-none p-0 focus:ring-0 w-auto" />
        </div>
        {selectedDate !== TODAY && (
          <button onClick={() => setSelectedDate(TODAY)} className="btn btn-ghost btn-sm gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> اليوم
          </button>
        )}
      </div>

      {/* Global error */}
      {errors._global && (
        <div className="card card-p bg-red-500/5 border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{errors._global}
        </div>
      )}

      {/* KPI input fields */}
      <div className="card card-p space-y-5">
        <h2 className="text-base font-semibold text-white border-b border-slate-800 pb-3">
          مؤشرات الأداء — {selectedDate}
          {existingEntry && <span className="text-xs text-slate-500 mr-2">(تعديل إدخال موجود)</span>}
        </h2>

        {KPI_FIELDS.map(({ key, label, hint, emoji }) => (
          <div key={key}>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <span>{emoji}</span>
              {label}
              <span className="text-xs text-slate-600 mr-auto" title={hint}>
                <Info className="w-3.5 h-3.5" />
              </span>
            </label>
            <input
              type="number" min="0" value={form[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder="0" dir="ltr"
              className={`text-base ${errors[key] ? 'border-red-500/50 bg-red-500/5' : ''}`}
            />
            {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]}</p>}
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">📝 ملاحظات</label>
          <textarea value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            rows={3} placeholder="أي ملاحظات إضافية..." />
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !pharmacyId || !uid}
        className="btn btn-primary w-full py-3 text-base gap-2"
      >
        {saving ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> جاري الحفظ...</>
        ) : (
          <><Save className="w-5 h-5" />{existingEntry ? 'تحديث البيانات' : 'حفظ KPI'}</>
        )}
      </button>

      {/* Entry history */}
      {entries.length > 0 && (
        <div className="card card-p space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">آخر الإدخالات</h3>
          <div className="space-y-2">
            {entries.slice(0, 7).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs border-b border-slate-800/40 pb-2 last:border-0 last:pb-0">
                <span className="text-slate-400 font-mono">{e.date}</span>
                <div className="flex gap-3 text-slate-500">
                  {KPI_FIELDS.map(({ key, emoji }) => (
                    <span key={key} title={key}>{emoji} {e[key] ?? 0}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
