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
//
// PR-1E2 Visual Refinement Addendum — operational table/card redesign,
// daily-pace methodology, Discard/keyboard-shortcut footer. See
// docs/production/PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md.
// ============================================================
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  ClipboardList, CheckCircle2, AlertCircle, Save,
  Loader2, Calendar, RefreshCw, Info, ChevronDown,
  TrendingUp, TrendingDown, Minus, RotateCcw,
} from 'lucide-react'
import { auth }                from '../../services/firebase'
import { useAuthStore }        from '../../store/authStore'
import { useKpiStore }         from '../../store/kpiStore'
import { usePharmacyStore }    from '../../store/pharmacyStore'
import { useToastStore }       from '../../components/ui/Toast'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import ConfirmModal              from '../../components/ui/ConfirmModal'
import {
  computeAchievementPct,
  getDayProgress,
} from '../../engine'
import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  DEFAULT_KPI_UI_CONFIG,
  toKpiUiConfig,
  getTargetFieldName,
} from '../../engine/kpiRegistry'
import { computeRequiredDailyPace } from '../../components/kpi/kpiVisualHelpers'
import { formatNumber } from '../../utils/helpers'

// Compute today once — not inside render
const TODAY = new Date().toISOString().split('T')[0]

// ── Registry → entry field config ─────────────────────────────
// Maps a KpiDefinition to the field descriptor used by the form.
// engineKey drives both form state keys and payload keys.
// Only production_evaluation KPIs go in the main fields list.
// Pilot KPIs are not rendered here at all — see the PR-1D closure
// comment above buildEmptyForm for why.
function buildEntryFields(registry) {
  return getKpisForSurface(registry, 'dashboardEnabled')
    .filter((kpi) => kpi.lifecycleStage === 'production_evaluation')
    .map((kpi, idx) => {
      const engineKey = kpi.aliasFor ?? kpi.key
      // PR-1E2 — reuse the registry's own precision/min/max rules
      // (toKpiUiConfig, already used by the Target form) instead of
      // inventing separate mobile-input rules. minAllowedValue is always
      // 0 (no KPI permits negative actuals); maxAllowedValue is only
      // capped for percentage-type KPIs.
      const uiConfig = toKpiUiConfig(kpi, idx + 1)
      return {
        key:         engineKey,
        registryKey: kpi.key,
        label:       kpi.labelAr || kpi.label || kpi.key,
        labelEn:     kpi.label || kpi.key,
        hint:        kpi.description || kpi.unit || '',
        color:       DEFAULT_KPI_UI_CONFIG.defaultColor,
        placeholder: String(kpi.sortOrder <= 50 ? '0' : '0'),
        unit:        kpi.unitAr || kpi.unit || '',
        category:    kpi.category || 'uncategorized',
        valueType:       uiConfig.valueType,
        precision:       uiConfig.precision,
        minAllowedValue: uiConfig.minAllowedValue,
        maxAllowedValue: uiConfig.maxAllowedValue,
        targetFieldName: getTargetFieldName(kpi.key, registry),
      }
    })
}

// ── Category grouping ───────────────────────────────────────────
// Groups entry fields by the registry's own `category` field (real
// data, not invented). A KPI with no category falls back to a single
// "Other" group rather than being dropped or mislabeled.
const CATEGORY_LABELS = {
  prescription:   'Prescription Programs',
  digital:         'Digital Health',
  wellness:        'Wellness',
  commercial:      'Commercial',
  operational:     'Operational',
  health_program:  'Health Programs',
  uncategorized:   'Other',
}

function groupByCategory(fields) {
  const groups = new Map()
  for (const field of fields) {
    const key = field.category || 'uncategorized'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(field)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: CATEGORY_LABELS[key] || key,
    items,
  }))
}

// ── PR-1E2 — input semantics derived from the registry's own
// precision rule (see buildEntryFields). No new decimal/min/max logic —
// this only chooses the right HTML attributes for an already-known value.
export function stepForPrecision(precision) {
  if (!precision) return '1'
  return (1 / 10 ** precision).toFixed(precision)
}

// ── PR-1E2 — target/progress context. Mirrors the existing, already-
// tested computeAchievementPct (used by Dashboard/Performance) rather
// than inventing a new achievement formula. Never divides by a missing
// or zero target, never shows a percentage for a not-yet-entered value,
// and never computes a ratio-of-percentage for percentage-type KPIs
// (that calculation would mislead, per PR-1E2's target/progress rule).
export function resolveTargetContext({ targetValue, actualRaw, valueType }) {
  const target = targetValue != null && targetValue !== '' ? Number(targetValue) : null
  if (target == null || isNaN(target)) return { state: 'none' }
  if (target <= 0) return { state: 'zero', target }
  if (actualRaw === '' || actualRaw == null) return { state: 'target-only', target }
  if (valueType === 'percentage') return { state: 'target-only', target }
  return { state: 'achievement', target, pct: computeAchievementPct(actualRaw, target) }
}

// ── PR-1E2 Visual Refinement Addendum — daily requirement context.
// Reuses two already-tested, already-shipped helpers rather than
// inventing new date or division math:
//   - getDayProgress() (engine/kpiAnalyticsEngine.ts) — the exact
//     currentDay/totalDays/daysRemaining calendar arithmetic Dashboard's
//     Run Rate Forecast and KpiCard already use.
//   - computeRequiredDailyPace() (components/kpi/kpiVisualHelpers.js) —
//     the exact guarded remainingGap/remainingDays formula KpiCard,
//     FocusKpiCommandCard, and KpiTile already render.
// Only valid for cumulative (count/currency) KPIs with a real positive
// target. Percentage-type KPIs are excluded here — a ratio-of-a-ratio
// or a percentage-target-divided-by-days would mislead — and instead
// get a direct actual-vs-target delta via resolvePaceStatus below.
export function resolveDailyPaceContext({ target, mtdActual, valueType, referenceDate }) {
  if (valueType === 'percentage') return { state: 'not-applicable' }
  if (target == null || isNaN(target) || target <= 0) return { state: 'not-applicable' }
  const value = mtdActual != null ? Number(mtdActual) : 0
  const gap = Math.max(target - value, 0)
  if (gap <= 0) return { state: 'completed' }
  const { daysRemaining } = getDayProgress(referenceDate)
  if (daysRemaining <= 0) return { state: 'unavailable' }
  const requiredDaily = computeRequiredDailyPace(gap, daysRemaining)
  // computeRequiredDailyPace rounds to 1 decimal — a tiny residual gap
  // can round down to 0. Never display "0/day": fold that edge case
  // into "completed" (the gap is negligible, not a real daily ask).
  if (requiredDaily == null || requiredDaily <= 0) return { state: 'completed' }
  return { state: 'pace', requiredDaily }
}

// ── PR-1E2 Visual Refinement Addendum — Ahead / On Track / Behind.
// One tolerance band (rounding to the same 1-decimal precision
// computeRequiredDailyPace already uses), one Behind tier — no
// invented severity thresholds. Used both for the cumulative
// actual-vs-required-pace comparison and the percentage-type
// actual-vs-target comparison (percentage has no daily pace, but a
// plain delta in percentage points is still meaningful and matches
// the approved visual reference).
export function resolvePaceStatus(actual, requiredOrTarget) {
  if (actual == null || isNaN(actual) || requiredOrTarget == null || isNaN(requiredOrTarget)) return null
  const delta = Math.round((Number(actual) - Number(requiredOrTarget)) * 10) / 10
  if (delta === 0) return { tone: 'onTrack', delta }
  if (delta > 0)  return { tone: 'ahead', delta }
  return { tone: 'behind', delta }
}

const STATUS_TONE = {
  ahead:   { label: 'أعلى من المطلوب',  icon: TrendingUp,   color: '#22c55e' },
  onTrack: { label: 'في المسار الصحيح', icon: Minus,        color: '#00d2ad' },
  // A single Behind tier — no official moderate/material threshold
  // exists, so this never escalates to an error/red tone.
  behind:  { label: 'أقل من المطلوب',   icon: TrendingDown, color: '#f59e0b' },
}

// ── PR-1E2 Visual Refinement Addendum — restore the last loaded/saved
// values for the active date (used by both the prefill effect and the
// Discard action, so the two never compute "what was loaded" twice).
function buildFilledFormFromEntry(existingEntry, emptyForm) {
  if (!existingEntry) return emptyForm
  const filled = { ...emptyForm }
  for (const key of Object.keys(filled)) {
    if (key === 'notes') {
      filled.notes = existingEntry.notes || ''
    } else {
      const v = existingEntry[key]
      filled[key] = v != null ? String(v) : ''
    }
  }
  return filled
}

// PR-1D closure (pilot-tracking field investigation): KPI Entry
// previously rendered editable inputs for pilot_tracking KPIs via a
// dedicated registry lifecycle selector (see kpiMetaResolver.ts) and
// a now-removed field-builder function.
// Traced the full write path: saveKpiEntry() -> sanitizeKpiEntryFields()
// -> buildAllowedEntryKeys() (kpiRegistryLogic.ts), which deliberately
// and structurally excludes any KPI whose lifecycleStage is not
// 'production_evaluation' — a tested hardening boundary (see
// buildAllowedEntryKeysHardening.test.ts), not an oversight. A value
// typed into a pilot field was therefore never included in the save
// payload (entryFields-only loop below) and, even if it had been,
// the sanitizer would have silently dropped it before Firestore.
// No production storage contract exists for pilot actuals via this
// write path, so the editable UI was unsupported/dead — removed per
// docs/production/KPI_REGISTRY_GOVERNANCE.md's pilot-field classification.
// The KPI registry's pilot_tracking lifecycle stage itself, the
// Dashboard/Reports/Targets pilot surfaces, and the Legacy Adapter's
// pilot-stripping behavior are all unrelated and were not touched.

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
  const { targets, subscribeMyTargets, getTargetForMonth } = useKpiStore()
  const { pharmacies, subscribe: subscribePh }        = usePharmacyStore()
  const toast                                         = useToastStore()

  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  // Sticky save-bar state machine: idle (no changes yet) → unsaved (user
  // edited a field) → saving → saved | failed. Drives the bar's label/
  // color only — never changes what gets written.
  const [saveState, setSaveState] = useState('idle')

  // ── PR-1E2 — per-field dirty tracking (for the category "unsaved"
  // dot) and per-category collapse state. Purely presentational: neither
  // affects `form`, the payload, or which fields exist.
  const [dirtyKeys, setDirtyKeys]           = useState(() => new Set())
  const [closedCategories, setClosedCategories] = useState(() => new Set())
  const fieldRefs = useRef({})
  // Date-change-with-unsaved-changes confirmation (reuses the existing
  // ConfirmModal pattern — no new global navigation-blocking subsystem).
  const [pendingDate, setPendingDate] = useState(null)
  // PR-1E2 Visual Refinement Addendum — Discard Changes confirmation.
  // Separate modal/state from the date-change guard above: discarding
  // never changes selectedDate, it only restores the active date's
  // last loaded/saved values.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const lastLoadedFormRef = useRef(null)

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
  const categoryGroups = useMemo(() => groupByCategory(entryFields), [entryFields])

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
    // PR-1E2 — target context. Read-only: this page never writes targets.
    const u3 = subscribeMyTargets(pharmacyId)
    return () => { u1(); u2(); u3() }
  }, [uid, pharmacyId])

  // ── PR-1E2 — this month's target document, if one exists. This is a
  // branch-level (pharmacyId-scoped) target — there is no personal
  // per-user target document in this collection, so every row labels
  // it "هدف الفرع الشهري" (Branch Monthly Target), never a bare/
  // ambiguous "Target". ──────────────────────────────────────────
  const monthTarget = useMemo(
    () => (pharmacyId ? getTargetForMonth(pharmacyId, selectedDate.slice(0, 7)) : null),
    [pharmacyId, selectedDate, targets]
  )

  // ── Find existing entry for selected date ─────────────────────
  const existingEntry = useMemo(() =>
    entries.find(
      (e) => e.userId === uid && e.pharmacyId === pharmacyId && e.date === selectedDate
    ),
    [entries, uid, pharmacyId, selectedDate]
  )

  // ── PR-1E2 Visual Refinement Addendum — month-to-date actual, summed
  // from the entries this page already subscribes to (no new fetch, no
  // new Firestore read). Mirrors the same inline sum pattern Reports'
  // MTD Trend and the Executive Summary already use (date-range filter
  // + reduce) — not a new aggregation methodology. Includes every
  // persisted day up to and including selectedDate (matches how
  // Dashboard/KpiCard's `value` already reflects whatever is saved as
  // of the read); the *live, possibly-unsaved* value being typed for
  // selectedDate is compared separately against the resulting pace,
  // not folded into this sum.
  const monthActualSums = useMemo(() => {
    const monthPrefix = selectedDate.slice(0, 7)
    const sums = {}
    for (const e of entries) {
      if (e.userId !== uid || e.pharmacyId !== pharmacyId) continue
      if (!e.date || e.date.slice(0, 7) !== monthPrefix || e.date > selectedDate) continue
      for (const { key } of entryFields) {
        sums[key] = (sums[key] || 0) + (Number(e[key]) || 0)
      }
    }
    return sums
  }, [entries, uid, pharmacyId, selectedDate, entryFields])

  // Calendar reference for getDayProgress — built from selectedDate's
  // own Y/M/D components (not `new Date(isoString)`, which parses as
  // UTC and can shift a day in negative-offset timezones).
  const paceReferenceDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDate])

  // ── Pre-fill form when date has existing data ─────────────────
  // Fills all fields the entry has; unknown new fields default to ''.
  useEffect(() => {
    const filled = buildFilledFormFromEntry(existingEntry, emptyForm)
    lastLoadedFormRef.current = filled
    setForm(filled)
    setErrors({})
    setSaveState('idle')
    setDirtyKeys(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, existingEntry?.id, emptyForm])

  // ── PR-1E2 — auto-open any category that currently has a validation
  // error (initial validation-failure or a category-level error left
  // over from a failed save), so the user never has to hunt for it
  // behind a collapsed section.
  useEffect(() => {
    const errorKeys = Object.keys(errors).filter((k) => k !== '_global')
    if (!errorKeys.length) return
    const errorCategories = new Set(
      entryFields.filter((f) => errorKeys.includes(f.key)).map((f) => f.category)
    )
    if (!errorCategories.size) return
    setClosedCategories((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const cat of errorCategories) { if (next.delete(cat)) changed = true }
      return changed ? next : prev
    })
  }, [errors, entryFields])

  const pharmacy = pharmacies.find((p) => p.id === pharmacyId)
  const setField = useCallback((k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
    setSaveState('unsaved')
    // Preserve the user-entered value while correcting validation errors —
    // setForm above already does that; this only marks the category dirty.
    setDirtyKeys((prev) => (prev.has(k) ? prev : new Set(prev).add(k)))
  }, [])

  const toggleCategory = useCallback((key) => {
    setClosedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  // ── Validation — unchanged rules (NaN / negative), plus the
  // registry's own maxAllowedValue (e.g. percentage-type KPIs capped at
  // 100), which was never enforced client-side before this section.
  const validate = () => {
    const e = {}
    if (selectedDate > TODAY) e._global = 'لا يمكن إدخال بيانات لتاريخ مستقبلي'
    for (const { key, maxAllowedValue } of entryFields) {
      const v = form[key]
      if (v === '') continue
      if (isNaN(Number(v)))            { e[key] = 'يجب أن يكون رقماً'; continue }
      if (Number(v) < 0)               { e[key] = 'لا يمكن أن تكون القيمة سالبة'; continue }
      if (maxAllowedValue != null && Number(v) > maxAllowedValue) {
        e[key] = `الحد الأقصى المسموح به هو ${maxAllowedValue}`
      }
    }
    return e
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      // PR-1E2 — scroll to and focus the first invalid field, in
      // registry render order (not error-object key order). Respects
      // prefers-reduced-motion without a new hook/dependency.
      const firstInvalid = entryFields.find((f) => errs[f.key])
      const el = firstInvalid && fieldRefs.current[firstInvalid.key]
      if (el) {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
        el.focus()
      }
      return
    }

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
    // CRITICAL: always read auth.currentUser.uid AT SAVE TIME, not from
    // the `uid` const which may have been computed before auth resolved.
    // Firestore isOwnData() rule compares payload.userId == request.auth.uid.
    // If these differ (userProfile.uid ≠ Auth UID), isOwnData() → false → DENIED.
    const saveUid = auth?.currentUser?.uid
    if (!saveUid) { toast.error('يرجى تسجيل الدخول مجدداً'); return }
    const payload = {
      userId:    saveUid,    // MUST equal request.auth.uid for isOwnData()
      pharmacyId,
      date:      selectedDate,
      notes:     form.notes?.trim() || '',
      actorId:   saveUid,    // audit attribution
      actorRole: userProfile?.role,
    }
    // Blank = not entered, zero = explicitly reported zero. A blank field
    // must never be silently written as 0 — omit it so the registry-level
    // sanitizer (which already treats absent keys as "not set", not "0")
    // and the merge:true write both preserve that distinction.
    for (const { key } of entryFields) {
      if (form[key] === '' || form[key] == null) continue
      payload[key] = Number(form[key])
    }


    setSaving(true)
    setSaveState('saving')
    try {
      // Pass liveRegistry as second argument — kpiStore.saveEntry threads it
      // through to saveKpiEntry({ ...payload, registry: liveRegistry })
      await saveEntry(payload, liveRegistry)
      toast.success(`✅ تم حفظ KPI بتاريخ ${selectedDate}`)
      setSaveState('saved')
      setDirtyKeys(new Set())
    } catch (err) {
      console.error('[KpiEntryPage] save error:', err)
      toast.error(err.message || 'حدث خطأ أثناء الحفظ')
      setSaveState('failed')
    } finally {
      setSaving(false)
    }
  }

  // ── PR-1E2 Visual Refinement Addendum — Ctrl/Cmd+S keyboard shortcut.
  // Refs avoid a stale closure without re-subscribing the listener every
  // render. Mirrors the Save button's own guards (disabled while
  // already saving) and reuses handleSave's existing validate() call —
  // so an invalid form is never silently saved via the shortcut either.
  const savingRef = useRef(saving)
  savingRef.current = saving
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  useEffect(() => {
    function onKeyDown(e) {
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
      if (!isSaveShortcut) return
      e.preventDefault()
      if (savingRef.current) return
      handleSaveRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── PR-1E2 — date-change-with-unsaved-changes guard. KPI Entry has no
  // branch/pharmacist context selector of its own (pharmacyId is fixed
  // from userProfile), so date is the only "context change" this page
  // can silently discard data through. Reuses the existing ConfirmModal
  // pattern rather than window.confirm or a new global route blocker.
  const requestDateChange = (newDate) => {
    if (saveState === 'unsaved') { setPendingDate(newDate); return }
    setSelectedDate(newDate)
  }
  const confirmDateChange = () => {
    if (pendingDate != null) setSelectedDate(pendingDate)
    setPendingDate(null)
  }

  // ── PR-1E2 Visual Refinement Addendum — Discard Changes. Restores the
  // active date's last loaded/saved values (never an immediate reset —
  // gated behind ConfirmModal) and clears dirty state only on confirm.
  const confirmDiscard = () => {
    setForm(lastLoadedFormRef.current ?? emptyForm)
    setErrors({})
    setSaveState('idle')
    setDirtyKeys(new Set())
    setDiscardConfirmOpen(false)
  }

  const saveStatusText =
    saveState === 'saving'  ? 'جاري الحفظ...' :
    saveState === 'saved'   ? '✅ تم الحفظ' :
    saveState === 'failed'  ? 'فشل الحفظ — حاول مرة أخرى' :
    saveState === 'unsaved' ? 'تغييرات غير محفوظة' :
    (existingEntry ? 'تعديل إدخال موجود' : 'لم يتم الإدخال بعد')

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-4">

      {/* Header — PR-1E2: a compact mobile-only context line (date +
          branch + save state) is added below the title so the active
          context stays visible without scrolling to the date card or
          the sticky bar. Desktop layout is unchanged. */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-400" /> السجل التشغيلي اليومي
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pharmacy?.name || '—'}{pharmacy?.code ? ` · ${pharmacy.code}` : ''} · {userProfile?.displayName}
          </p>
          <p className="sm:hidden text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Calendar className="w-3 h-3" /> {selectedDate}
            <span aria-hidden="true">·</span>
            <span role="status" aria-live="polite">{saveStatusText}</span>
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-slate-700 mt-1 font-mono">
              uid: {uid ? `${uid.slice(0, 6)}…` : 'NULL'} · pharmacyId: {pharmacyId || 'NULL'} · kpis: {entryFields.length}
            </p>
          )}
        </div>
        {/* Desktop/tablet save-state pill — same saveStatusText/live
            region the mobile header line already uses, just promoted
            to visibility at sm+ instead of being sticky-bar-only. */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs" role="status" aria-live="polite"
             style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full" aria-hidden="true"
                style={{ background: saveState === 'failed' ? '#ef4444' : saveState === 'unsaved' ? '#f59e0b' : '#22c55e' }} />
          {saveStatusText}
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
          <label htmlFor="kpi-entry-date" className="block text-xs text-slate-400 mb-1">تاريخ الإدخال</label>
          <input id="kpi-entry-date" type="date" value={selectedDate} max={TODAY}
            onChange={(e) => requestDateChange(e.target.value)}
            className="text-sm bg-transparent border-none p-0 focus:ring-0 w-auto" />
        </div>
        {selectedDate !== TODAY && (
          <button onClick={() => requestDateChange(TODAY)} className="btn btn-ghost btn-sm gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> اليوم
          </button>
        )}
      </div>

      {/* PR-1E2 — unsaved-changes guard. Only date changes are guarded:
          KPI Entry has no branch/context selector of its own to guard. */}
      <ConfirmModal
        open={pendingDate != null}
        onCancel={() => setPendingDate(null)}
        onConfirm={confirmDateChange}
        title="تغيير التاريخ"
        message="لديك تغييرات غير محفوظة لهذا اليوم. سيتم تجاهلها إذا غيّرت التاريخ الآن."
        confirmLabel="تجاهل والتغيير"
        cancelLabel="إلغاء"
        danger
      />

      {/* PR-1E2 Visual Refinement Addendum — Discard Changes guard.
          Never resets immediately; restores the last loaded/saved
          values for the active date only on confirmation. */}
      <ConfirmModal
        open={discardConfirmOpen}
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={confirmDiscard}
        title="إلغاء التعديلات"
        message="سيتم استرجاع آخر قيم محفوظة لهذا اليوم وتجاهل التعديلات الحالية."
        confirmLabel="تجاهل التعديلات"
        cancelLabel="رجوع"
        danger
      />

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

        {/* PR-1E2 Visual Refinement Addendum — desktop/tablet column
            header. Mobile renders no header strip: each stacked row
            already self-labels every value (KPI → target → actual →
            required/status), matching the required mobile content
            order without a redundant heading. */}
        <div className="hidden sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr] sm:gap-4 text-[10px] font-semibold uppercase tracking-wide"
             style={{ color: 'var(--text-muted)' }}>
          <span>مؤشر الأداء (KPI)</span>
          <span>الهدف الشهري</span>
          <span>الإدخال الفعلي</span>
          <span>المطلوب لليوم / الحالة</span>
        </div>

        {categoryGroups.map((group) => {
          // Single-group registries ("Other" only) never show a header —
          // a no-op heading/toggle for the only group adds nothing.
          const showHeader = categoryGroups.length > 1
          const isOpen = !showHeader || !closedCategories.has(group.key)
          const hasDirty = group.items.some((f) => dirtyKeys.has(f.key))
          const hasError = group.items.some((f) => errors[f.key])
          const panelId  = `kpi-category-panel-${group.key}`
          const headerId = `kpi-category-header-${group.key}`
          return (
            <div key={group.key} className="rounded-lg border border-slate-800/60 bg-slate-900/20 p-3 sm:p-4 space-y-1">
              {showHeader && (
                <button
                  type="button"
                  id={headerId}
                  onClick={() => toggleCategory(group.key)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 -mb-1 py-1"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <span className="flex-1 text-right">{group.label}</span>
                  <span className="badge text-[10px] normal-case" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{group.items.length}</span>
                  {hasDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" title="تغييرات غير محفوظة" />}
                  {hasError && <AlertCircle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />}
                  <span className="sr-only">{hasError ? '— يحتوي على أخطاء' : hasDirty ? '— تغييرات غير محفوظة' : ''}</span>
                </button>
              )}
              {isOpen && (
                <div id={panelId} role="region" aria-labelledby={showHeader ? headerId : undefined} className="space-y-0">
                  {group.items.map(({ key, label, labelEn, hint, unit, valueType, precision, minAllowedValue, maxAllowedValue, targetFieldName }) => {
                    const targetRaw = monthTarget?.[targetFieldName]
                    const ctx = resolveTargetContext({ targetValue: targetRaw, actualRaw: form[key], valueType })
                    const inputId = `kpi-input-${key}`
                    const errorId = `kpi-error-${key}`

                    // PR-1E2 Visual Refinement Addendum — daily pace +
                    // status. Computed only from already-resolved ctx.target
                    // (never re-derives target/achievement logic).
                    const pace = ctx.target != null
                      ? resolveDailyPaceContext({ target: ctx.target, mtdActual: monthActualSums[key], valueType, referenceDate: paceReferenceDate })
                      : { state: 'not-applicable' }
                    const actualNum = form[key] !== '' && form[key] != null ? Number(form[key]) : null
                    const compareValue =
                      valueType === 'percentage' ? ctx.target :
                      (pace.state === 'pace' ? pace.requiredDaily : null)
                    const paceStatus = actualNum != null && compareValue != null
                      ? resolvePaceStatus(actualNum, compareValue)
                      : null
                    const tone = paceStatus ? STATUS_TONE[paceStatus.tone] : null
                    const ToneIcon = tone?.icon

                    return (
                      <div key={key}
                           className="sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr] sm:items-start sm:gap-4 py-2.5 sm:py-2 border-b border-slate-800/40 last:border-0">

                        {/* KPI label */}
                        <div className="flex items-center gap-2 mb-1.5 sm:mb-0">
                          <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <span className="text-slate-400 text-xs font-mono">{labelEn}</span>
                            <span className="text-slate-200">{label !== labelEn ? label : ''}</span>
                          </label>
                          {hint && (
                            <span className="text-xs text-slate-600" title={hint} role="img" aria-label={hint}>
                              <Info className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        {/* Target — always scoped: "Branch Monthly Target",
                            never a bare/ambiguous "Target". This collection
                            only stores branch-level targets (no personal
                            per-user target exists), so no fallback
                            disclosure is needed. */}
                        <div className="text-xs mb-1.5 sm:mb-0" style={{ color: 'var(--text-muted)' }}>
                          {ctx.state === 'none' && 'بدون هدف'}
                          {ctx.state === 'zero' && `هدف الفرع الشهري: ${formatNumber(ctx.target)}`}
                          {(ctx.state === 'target-only' || ctx.state === 'achievement') && (
                            <>
                              هدف الفرع الشهري{' '}
                              <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                {formatNumber(ctx.target)}{unit ? ` ${unit}` : ''}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Actual input — unchanged semantics */}
                        <div className="mb-1.5 sm:mb-0">
                          <input
                            id={inputId}
                            ref={(el) => { fieldRefs.current[key] = el }}
                            type="number"
                            inputMode={precision > 0 ? 'decimal' : 'numeric'}
                            step={stepForPrecision(precision)}
                            min={minAllowedValue}
                            max={maxAllowedValue ?? undefined}
                            value={form[key] ?? ''}
                            onChange={(e) => setField(key, e.target.value)}
                            placeholder="0" dir="ltr"
                            aria-invalid={errors[key] ? 'true' : undefined}
                            aria-describedby={errors[key] ? errorId : undefined}
                            className={`text-base w-full ${errors[key] ? 'border-red-500/50 bg-red-500/5' : ''}`}
                          />
                          {unit && <span className="text-[10px] mt-1 block" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
                          {errors[key] && <p id={errorId} className="text-xs text-red-400 mt-1">{errors[key]}</p>}
                        </div>

                        {/* Required today / status */}
                        <div className="text-xs space-y-0.5">
                          {ctx.state === 'none' && <span style={{ color: 'var(--text-muted)' }}>بدون هدف</span>}
                          {ctx.state === 'zero' && <span style={{ color: 'var(--text-muted)' }}>غير متاح</span>}

                          {ctx.state === 'achievement' && (
                            <div style={{ color: 'var(--text-muted)' }}>{ctx.pct}% من الهدف</div>
                          )}

                          {valueType !== 'percentage' && (ctx.state === 'target-only' || ctx.state === 'achievement') && pace.state === 'completed' && (
                            <span className="flex items-center gap-1" style={{ color: '#22c55e' }}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> اكتمل الهدف
                            </span>
                          )}
                          {valueType !== 'percentage' && (ctx.state === 'target-only' || ctx.state === 'achievement') && pace.state === 'unavailable' && (
                            <span style={{ color: 'var(--text-muted)' }}>المعدل اليومي غير متاح</span>
                          )}
                          {valueType !== 'percentage' && (ctx.state === 'target-only' || ctx.state === 'achievement') && pace.state === 'pace' && (
                            <>
                              <div className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                المطلوب لليوم: {formatNumber(pace.requiredDaily, { maximumFractionDigits: 1 })}/يوم
                              </div>
                              {tone && (
                                <div className="flex items-center gap-1 font-medium" style={{ color: tone.color }}>
                                  <ToneIcon className="w-3.5 h-3.5" />
                                  {paceStatus.delta > 0 ? '+' : ''}{formatNumber(paceStatus.delta, { maximumFractionDigits: 1 })} {tone.label}
                                </div>
                              )}
                            </>
                          )}

                          {valueType === 'percentage' && ctx.state === 'target-only' && tone && (
                            <div className="flex items-center gap-1 font-medium" style={{ color: tone.color }}>
                              <ToneIcon className="w-3.5 h-3.5" />
                              {paceStatus.delta > 0 ? '+' : ''}{formatNumber(paceStatus.delta, { maximumFractionDigits: 1 })}% {tone.label}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Pilot-tracking KPIs are intentionally NOT rendered here — see
            the PR-1D closure investigation comment near buildEntryFields
            above. They remain visible (display-only) on Dashboard and
            Reports, which is unaffected by this removal. */}

        {/* Notes always rendered. Optional — already persisted via the
            existing `notes` payload field (see handleSave); it has no
            effect on evaluation/scoring, which only reads KPI numeric
            fields. No new notes contract was added. */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">📝 ملاحظات (اختياري)</label>
          <textarea value={form.notes ?? ''}
            onChange={(e) => setField('notes', e.target.value)}
            rows={3} placeholder="أي ملاحظات إضافية... (لا تؤثر على التقييم)" />
        </div>
      </div>

      {/* Sticky save bar — explicit unsaved/saving/saved/failed states.
          Pure presentation: handleSave and the write payload are unchanged. */}
      <div className="sticky sticky-save-bar z-10 card card-p flex items-center gap-3 py-3"
           style={{ backdropFilter: 'blur(12px)' }}>
        <button
          type="button"
          onClick={() => setDiscardConfirmOpen(true)}
          disabled={saveState !== 'unsaved'}
          className="btn btn-ghost btn-sm gap-1.5 text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">إلغاء التعديلات</span>
        </button>
        <div className="flex-1 text-xs" role="status" aria-live="polite"
             style={{ color: saveState === 'failed' ? undefined : 'var(--text-muted)' }}>
          <span className={saveState === 'failed' ? 'text-red-400' : ''}>{saveStatusText}</span>
        </div>
        <span className="hidden lg:inline text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          Ctrl / Cmd + S
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !pharmacyId || !uid}
          className="btn btn-primary px-6 py-2.5 text-sm gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
          ) : saveState === 'failed' ? (
            <><RefreshCw className="w-4 h-4" /> إعادة المحاولة</>
          ) : (
            <><Save className="w-4 h-4" />{existingEntry ? 'تحديث البيانات' : 'حفظ KPI'}</>
          )}
        </button>
      </div>

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
