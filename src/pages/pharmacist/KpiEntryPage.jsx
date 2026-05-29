// ============================================================
// KPI Entry Page — Dynamic registry-driven daily entry
// Phase 4C: liveRegistry is now passed to saveEntry() so
//           saveKpiEntry uses the Firestore-backed allowlist
//           for custom KPI field persistence.
//
// Key changes from static version:
//   - KPI_FIELDS → registry-driven via subscribeKpiRegistry +
//     getKpisForSurface('dashboardEnabled')
//   - EMPTY_FORM → dynamically built from active KPI engine keys
//   - Payload → all dynamic KPI fields via sanitizeKpiEntryFields
//   - saveEntry(payload, liveRegistry) — live registry threaded through
//   - Rendering → safe fallbacks for color/label/placeholder
//
// Backward compatible:
//   - Core KPIs (wasfaty, omni, wellness, basket, crossSelling)
//     always present via DEFAULT_KPI_REGISTRY fallback
//   - Notes field always rendered
//   - Form pre-fill from existingEntry still works for all fields
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  ClipboardList, CheckCircle2, AlertCircle, Save,
  Loader2, Calendar, RefreshCw, Info,
} from 'lucide-react'
import { auth }                from '../../services/firebase'
import { useAuthStore }        from '../../store/authStore'
import { useKpiStore }         from '../../store/kpiStore'
import { usePharmacyStore }    from '../../store/pharmacyStore'
import { useToastStore }       from '../../components/ui/Toast'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'

// Compute today once — not inside render
const TODAY = new Date().toISOString().split('T')[0]

// ── Registry → entry field config ─────────────────────────────
// Maps a KpiDefinition to the field descriptor used by the form.
// engineKey drives both form state keys and payload keys.
function buildEntryFields(registry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => {
    const engineKey = kpi.aliasFor ?? kpi.key
    return {
      key:         engineKey,                            // form state key + payload key
      registryKey: kpi.key,                              // registry identity
      label:       kpi.labelAr || kpi.label || kpi.key, // Arabic label preferred
      labelEn:     kpi.label || kpi.key,
      hint:        kpi.description || kpi.unit || '',
      color:       DEFAULT_KPI_UI_CONFIG.defaultColor,   // safe default; registry has no .color
      placeholder: String(kpi.sortOrder <= 50 ? '0' : '0'),
      unit:        kpi.unitAr || kpi.unit || '',
    }
  })
}

// ── Dynamic EMPTY_FORM builder ─────────────────────────────────
// Generates { engineKey: '' } for every active dashboard KPI +
// notes. All values default to '' (empty string) matching the
// existing pattern so Number('') || 0 === 0 in the payload.
function buildEmptyForm(entryFields) {
  const form = { notes: '' }
  for (const { key } of entryFields) {
    form[key] = ''
  }
  return form
}

export default function KpiEntryPage() {
  const { userProfile }                               = useAuthStore()
  const { entries, subscribeMyEntries, saveEntry }    = useKpiStore()
  const { pharmacies, subscribe: subscribePh }        = usePharmacyStore()
  const toast                                         = useToastStore()

  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})

  // ── Live registry state ───────────────────────────────────────
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)

  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // ── Derived KPI field list — reactive to registry ─────────────
  const entryFields = useMemo(() => buildEntryFields(liveRegistry), [liveRegistry])

  // ── Dynamic EMPTY_FORM — reactive to registry ─────────────────
  const emptyForm = useMemo(() => buildEmptyForm(entryFields), [entryFields])

  const [form, setForm] = useState(() => buildEmptyForm(buildEntryFields(DEFAULT_KPI_REGISTRY)))

  // ── Resolved IDs ─────────────────────────────────────────────
  const uid        = auth?.currentUser?.uid || userProfile?.uid || userProfile?.id
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
  // Fills all fields the entry has; unknown new fields default to ''.
  useEffect(() => {
    if (existingEntry) {
      const filled = { ...emptyForm }
      for (const key of Object.keys(filled)) {
        if (key === 'notes') {
          filled.notes = existingEntry.notes || ''
        } else {
          const v = existingEntry[key]
          filled[key] = v != null ? String(v) : ''
        }
      }
      setForm(filled)
    } else {
      setForm(emptyForm)
    }
    setErrors({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, existingEntry?.id, emptyForm])

  const pharmacy = pharmacies.find((p) => p.id === pharmacyId)
  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  // ── Validation ────────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (selectedDate > TODAY) e._global = 'لا يمكن إدخال بيانات لتاريخ مستقبلي'
    for (const { key } of entryFields) {
      const v = form[key]
      if (v !== '' && isNaN(Number(v))) e[key] = 'يجب أن يكون رقماً'
      if (v !== '' && Number(v) < 0)   e[key] = 'لا يمكن أن تكون القيمة سالبة'
    }
    return e
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    if (!pharmacyId) {
      toast.error('هذا المستخدم غير مرتبط بفرع — تواصل مع الإدارة لإضافة الفرع')
      return
    }
    if (!uid) {
      toast.error('لم يتم التعرف على هوية المستخدم — سجّل الدخول مجدداً')
      return
    }

    // Build payload: metadata + all dynamic KPI fields for this entry date.
    // saveEntry(payload, liveRegistry) threads the live Firestore registry
    // through to sanitizeKpiEntryFields, so custom KPIs (nps, sl, ndf…)
    // are persisted when they are active in the live registry.
    const payload = {
      userId:    uid,
      pharmacyId,
      date:      selectedDate,
      notes:     form.notes?.trim() || '',
      actorId:   uid,
      actorRole: userProfile?.role,
    }
    for (const { key } of entryFields) {
      payload[key] = Number(form[key]) || 0
    }

    console.log('[KpiEntryPage] payload before save:', payload)

    setSaving(true)
    try {
      // Pass liveRegistry as second argument — kpiStore.saveEntry threads it
      // through to saveKpiEntry({ ...payload, registry: liveRegistry })
      await saveEntry(payload, liveRegistry)
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
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-slate-700 mt-1 font-mono">
              uid: {uid || 'NULL'} · pharmacyId: {pharmacyId || 'NULL'} · kpis: {entryFields.length}
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

      {/* KPI input fields — registry-driven */}
      <div className="card card-p space-y-5">
        <h2 className="text-base font-semibold text-white border-b border-slate-800 pb-3">
          مؤشرات الأداء — {selectedDate}
          {existingEntry && <span className="text-xs text-slate-500 mr-2">(تعديل إدخال موجود)</span>}
        </h2>

        {entryFields.map(({ key, label, labelEn, hint, unit }) => (
          <div key={key}>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <span className="text-slate-400 text-xs font-mono">{labelEn}</span>
              <span className="text-slate-200">{label !== labelEn ? label : ''}</span>
              {unit && <span className="text-xs text-slate-600 mr-auto">{unit}</span>}
              {hint && !unit && (
                <span className="text-xs text-slate-600 mr-auto" title={hint}>
                  <Info className="w-3.5 h-3.5" />
                </span>
              )}
            </label>
            <input
              type="number" min="0" value={form[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              placeholder="0" dir="ltr"
              className={`text-base ${errors[key] ? 'border-red-500/50 bg-red-500/5' : ''}`}
            />
            {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]}</p>}
          </div>
        ))}

        {/* Notes always rendered */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">📝 ملاحظات</label>
          <textarea value={form.notes ?? ''}
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

      {/* Entry history — shows all KPI fields present in entry */}
      {entries.length > 0 && (
        <div className="card card-p space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">آخر الإدخالات</h3>
          <div className="space-y-2">
            {entries.slice(0, 7).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs border-b border-slate-800/40 pb-2 last:border-0 last:pb-0">
                <span className="text-slate-400 font-mono">{e.date}</span>
                <div className="flex gap-3 text-slate-500 flex-wrap justify-end">
                  {entryFields.map(({ key, labelEn }) => (
                    <span key={key} title={key} className="whitespace-nowrap">
                      {labelEn.slice(0, 6)} {e[key] ?? 0}
                    </span>
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
