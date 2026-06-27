// ============================================================
// KPI Service — kpi_entries + targets (Production Firestore)
// Phase 4B: saveKpiEntry is now fully dynamic — no hardcoded
//           KPI field destructuring. Payload built from the
//           live registry via sanitizeKpiEntryFields().
// ============================================================
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { auth, db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import { triggerHistorySnapshots } from './historyService'
import {
  sanitizeKpiEntryFields,
  buildKpiValuesMap,
  ENTRY_METADATA_FIELDS,
} from './kpiRegistryLogic'
import {
  mapDynamicToLegacyBatch,
} from '../engine/kpiCompatibility/legacyEntryAdapter'
import { KPI_ENGINE_ALIAS_MAP } from '../engine/kpiRegistry'
import { getProductionEngineKeys, DEFAULT_KPI_KEYS } from '../engine/kpiAnalyticsEngine'

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Composite doc ID prevents duplicates ──────────────────────
function entryId(userId, pharmacyId, date) {
  return `${userId}_${pharmacyId}_${date}`
}

// ── Save / upsert daily KPI entry ─────────────────────────────
// Phase 4B: No hardcoded KPI field destructuring.
// Accepts any shape of input; sanitizeKpiEntryFields() resolves
// which keys are valid KPI fields using the live registry.
// Metadata fields (userId, pharmacyId, date, notes, timestamps,
// actorId, actorRole) are handled explicitly and separately.
export async function saveKpiEntry({
  userId,
  pharmacyId,
  date,
  notes       = '',
  actorId,
  actorRole,
  registry,   // optional: pass live registry from caller for full dynamic support
  // DX-6 Actuals Import: when an admin bulk-imports actuals on behalf of
  // another user (a pharmacist, or a branch's managerUid), the caller is
  // NOT the entry's owner — the opposite of every existing manual-entry
  // call site. isDataExchangeImport opts into that explicit attribution
  // path; importBatchRef (the import_jobs jobId) makes every such write
  // traceable. Both are additive — omitted, behavior is byte-for-byte
  // unchanged from before this bundle.
  isDataExchangeImport = false,
  importBatchRef,
  ...kpiFields  // all remaining fields treated as candidate KPI values
}) {
  // ── Step 1: resolve the entry's owner ─────────────────────────
  // Manual entry (the default): ALWAYS use auth.currentUser.uid when
  // available — this is what Firestore isOwnData() rule compares against
  // (request.auth.uid). The passed `userId` is only a fallback for
  // non-browser contexts.
  // DX-6 import path: the admin's own auth.currentUser.uid must NOT be
  // substituted — the entry belongs to the imported userId. The matching
  // Firestore rule bypass (firestore.rules, kpi_entries create) requires
  // importedViaDataExchange:true + a non-empty importBatchRef, so this
  // path can never silently write under the wrong identity or escape audit.
  if (isDataExchangeImport && !userId) {
    throw new Error('saveKpiEntry: isDataExchangeImport requires an explicit userId')
  }
  if (isDataExchangeImport && (!importBatchRef || !String(importBatchRef).trim())) {
    throw new Error('saveKpiEntry: isDataExchangeImport requires a non-empty importBatchRef')
  }
  let resolvedUserId = auth?.currentUser?.uid || userId
  if (isDataExchangeImport) {
    resolvedUserId = userId
  }
  const today          = new Date().toISOString().split('T')[0]

  // ── Step 2: strict validation with clear error messages ──────
  if (!resolvedUserId) {
    throw new Error('لم يتم التعرف على هوية المستخدم — يرجى تسجيل الدخول مجدداً')
  }
  if (!pharmacyId || pharmacyId.trim() === '') {
    throw new Error('هذا المستخدم غير مرتبط بفرع — تواصل مع الإدارة')
  }
  if (!date || date.trim() === '') {
    throw new Error('التاريخ مطلوب')
  }
  if (date > today) {
    throw new Error('لا يمكن إدخال بيانات لتاريخ مستقبلي')
  }

  const docId   = entryId(resolvedUserId, pharmacyId, date)


  // ── Step 3: sanitize KPI value fields ────────────────────────
  // sanitizeKpiEntryFields():
  //   - Resolves allowed keys from the live registry (or default)
  //   - Skips metadata fields (userId, pharmacyId, etc.)
  //   - Converts strings → numbers; rejects NaN/Infinity
  //   - Clamps negatives to 0
  //   - Backward compatible: wasfaty/omni/wellness/basket/crossSelling
  //     are always in the default registry allowlist
  const safeKpiValues = sanitizeKpiEntryFields(kpiFields, registry)

  // ── Step 4: build clean Firestore payload ────────────────────
  const payload = clean({
    // Ownership + identity (always present)
    userId:    resolvedUserId,
    pharmacyId: pharmacyId.trim(),
    date,

    // All sanitized KPI values (dynamic — driven by registry)
    ...safeKpiValues,

    // Milestone 2 — Dual-write: kpiValues map (registry business keys)
    // Written alongside legacy flat fields for forward compatibility.
    // Existing engines read the flat fields (unchanged).
    // The Legacy Adapter reads kpiValues when active.
    // Both are derived from the same safeKpiValues — no divergence possible.
    kpiValues: buildKpiValuesMap(safeKpiValues, registry),

    // Non-KPI fields
    notes:     notes?.trim() || '',
    updatedAt: serverTimestamp(),
    createdBy: actorId || resolvedUserId || null,
    // createdAt and submittedBy are always included.
    // setDoc with merge:true will NOT overwrite these if the document already exists.
    createdAt:   serverTimestamp(),
    submittedBy: actorId || resolvedUserId || null,

    // DX-6 Actuals Import attribution marker — required by the matching
    // Firestore rule bypass. Never set for manual entry.
    ...(isDataExchangeImport ? { importedViaDataExchange: true, importBatchRef } : {}),
  })

  // ── Step 5: write to Firestore ────────────────────────────────
  await setDoc(doc(db, COL.KPI_ENTRIES, docId), payload, { merge: true })

  // ── Step 6: audit log ─────────────────────────────────────────
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.KPI_ENTRIES,
    docId,
    userId:     actorId || resolvedUserId,
    userRole:   actorRole,
    before:     null,
    after:      payload,
  })

  // ── Step 7: History Layer V1 snapshots (fire-and-forget) ─────
  triggerHistorySnapshots(
    resolvedUserId,
    payload.pharmacyId,
    date,
    actorId || resolvedUserId,
    actorRole,
  ).catch((e) => {
    console.error('[kpiService] Unexpected error in triggerHistorySnapshots:', e.message)
  })

  return { id: docId, ...payload }
}

// ── Subscribe to entries (realtime) ───────────────────────────
export function subscribeKpiEntries({ userId, pharmacyId, from, to }, callback) {
  let q = query(collection(db, COL.KPI_ENTRIES), orderBy('date', 'desc'))
  if (userId)     q = query(q, where('userId',     '==', userId))
  if (pharmacyId) q = query(q, where('pharmacyId', '==', pharmacyId))
  if (from)       q = query(q, where('date', '>=', from))
  if (to)         q = query(q, where('date', '<=', to))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ── Rolling window real-time listener ─────────────────────────
// Default window: 90 days — covers the deepest engine requirement
// (executive trend engine: 60 days) with a 30-day safety margin.
// No composite index required: range + orderBy on the same field
// is served by the single-field date index.
export function subscribeRecentKpiEntries(callback, days = 90) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromDate = from.toISOString().split('T')[0]
  const q = query(
    collection(db, COL.KPI_ENTRIES),
    where('date', '>=', fromDate),
    orderBy('date', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ── On-demand historical fetch (no real-time listener) ────────
// Intended for Reports and any view that needs an explicit date
// range, including ranges older than the rolling subscription window.
// options.pharmacyId — restrict to a single branch
// options.userId     — restrict to a single user
// Returns a Promise<KpiEntry[]>; no persistent store side-effect.
export async function fetchKpiEntriesRange(fromDate, toDate, options = {}, registry = null) {
  // Empty pharmacyIds → no results (prevents list scope from fetching all branches)
  if (Array.isArray(options.pharmacyIds) && options.pharmacyIds.length === 0) {
    return []
  }

  const legacyKeySet = new Set(DEFAULT_KPI_KEYS)
  const extraEngineKeys = registry
    ? getProductionEngineKeys(registry).filter((k) => !legacyKeySet.has(k))
    : []

  // Multi-branch fetch: pharmacyIds list (district_supervisor / regional_manager)
  if (Array.isArray(options.pharmacyIds)) {
    const ids = options.pharmacyIds
    const baseQ = query(
      collection(db, COL.KPI_ENTRIES),
      where('date', '>=', fromDate),
      where('date', '<=', toDate),
    )
    // Firestore 'in' operator limit is 30 — chunk larger lists
    const chunks = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
    const snaps = await Promise.all(
      chunks.map((chunk) => getDocs(query(baseQ, where('pharmacyId', 'in', chunk))))
    )
    const seen = new Set()
    const rawDocs = []
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (!seen.has(d.id)) { seen.add(d.id); rawDocs.push({ id: d.id, ...d.data() }) }
      }
    }
    return mapDynamicToLegacyBatch(rawDocs, KPI_ENGINE_ALIAS_MAP, extraEngineKeys)
  }

  // Single-pharmacy or all-branches (original behavior preserved)
  let q = query(
    collection(db, COL.KPI_ENTRIES),
    where('date', '>=', fromDate),
    where('date', '<=', toDate),
    orderBy('date', 'desc'),
  )
  if (options.pharmacyId) q = query(q, where('pharmacyId', '==', options.pharmacyId))
  if (options.userId)     q = query(q, where('userId',     '==', options.userId))
  const snap = await getDocs(q)
  const rawDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return mapDynamicToLegacyBatch(rawDocs, KPI_ENGINE_ALIAS_MAP, extraEngineKeys)
}

// ── Targets ────────────────────────────────────────────────────
export async function saveTarget({
  pharmacyId, month,
  actorId, actorRole,
  ...targetFields   // accepts ALL *Target fields: legacy + dynamic KPIs
}) {
  const docId    = `${pharmacyId}_${month}`
  const existing = await getDoc(doc(db, COL.TARGETS, docId))

  // Accept any key ending in 'Target' as a safe dynamic KPI target field.
  const safeTargetFields = {}
  for (const [key, raw] of Object.entries(targetFields)) {
    if (!key.endsWith('Target')) continue
    const n = Number(raw)
    if (isNaN(n) || !isFinite(n)) continue
    safeTargetFields[key] = Math.max(0, n)
  }

  const payload = clean({
    pharmacyId, month,
    ...safeTargetFields,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  })

  await setDoc(doc(db, COL.TARGETS, docId), payload, { merge: true })
  await logAction({
    action:     existing.exists() ? AUDIT_ACTION.UPDATE : AUDIT_ACTION.CREATE,
    collection: COL.TARGETS,
    docId, userId: actorId, userRole: actorRole, after: payload,
  })
  return { id: docId, ...payload }
}

export function subscribeTargets(pharmacyId, callback, onError) {
  const q = query(
    collection(db, COL.TARGETS),
    where('pharmacyId', '==', pharmacyId),
    orderBy('month', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  , onError)
}

// @deprecated — unbounded listener.
// Use subscribeRecentTargets for all new consumers.
// Retained only until existing callers are migrated in a future sprint.
export function subscribeAllTargets(callback) {
  const q = query(collection(db, COL.TARGETS), orderBy('month', 'desc'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ── Bounded target subscription ────────────────────────────────
// Replaces subscribeAllTargets for operational views.
// Default window: 6 months — covers TargetsPage (±2 months),
// Dashboard, TeamPage, ExecutiveDashboard, and ReportsPage
// (all consume t.month === currentMonth, well within 6 months).
// No composite index required: range + orderBy on same field (month).
export function subscribeRecentTargets(callback, months = 6) {
  const from = new Date()
  from.setMonth(from.getMonth() - months)
  const fromMonth = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`
  const q = query(
    collection(db, COL.TARGETS),
    where('month', '>=', fromMonth),
    orderBy('month', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export async function deleteTarget(pharmacyId, month, actorId, actorRole) {
  const docId = `${pharmacyId}_${month}`
  const snap  = await getDoc(doc(db, COL.TARGETS, docId))
  if (!snap.exists()) throw new Error('الهدف غير موجود')
  await deleteDoc(doc(db, COL.TARGETS, docId))
  await logAction({
    action: AUDIT_ACTION.DELETE, collection: COL.TARGETS,
    docId, userId: actorId, userRole: actorRole, before: snap.data(),
  })
}

