// ============================================================
// KPI Service — kpi_entries + targets (Production Firestore)
// Phase 4B: saveKpiEntry is now fully dynamic — no hardcoded
//           KPI field destructuring. Payload built from the
//           live registry via sanitizeKpiEntryFields().
// ============================================================
import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { auth, db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import { triggerHistorySnapshots } from './historyService'
import {
  sanitizeKpiEntryFields,
  ENTRY_METADATA_FIELDS,
} from './kpiRegistryLogic'

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
  ...kpiFields  // all remaining fields treated as candidate KPI values
}) {
  // ── Step 1: resolve userId from Firebase Auth (source of truth) ──
  const resolvedUserId = auth?.currentUser?.uid || userId
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
  const existing = await getDoc(doc(db, COL.KPI_ENTRIES, docId))
  const isNew    = !existing.exists()

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

    // Non-KPI fields
    notes:     notes?.trim() || '',
    updatedAt: serverTimestamp(),
    createdBy: actorId || resolvedUserId || null,
    ...(isNew
      ? { createdAt: serverTimestamp(), submittedBy: actorId || resolvedUserId || null }
      : {}),
  })

  // ── Step 5: write to Firestore ────────────────────────────────
  await setDoc(doc(db, COL.KPI_ENTRIES, docId), payload, { merge: true })

  // ── Step 6: audit log ─────────────────────────────────────────
  await logAction({
    action:     isNew ? AUDIT_ACTION.CREATE : AUDIT_ACTION.UPDATE,
    collection: COL.KPI_ENTRIES,
    docId,
    userId:     actorId || resolvedUserId,
    userRole:   actorRole,
    before:     isNew ? null : existing.data(),
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

export function subscribeAllKpiEntries(callback) {
  const q = query(collection(db, COL.KPI_ENTRIES), orderBy('date', 'desc'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
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

export function subscribeTargets(pharmacyId, callback) {
  const q = query(
    collection(db, COL.TARGETS),
    where('pharmacyId', '==', pharmacyId),
    orderBy('month', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export function subscribeAllTargets(callback) {
  const q = query(collection(db, COL.TARGETS), orderBy('month', 'desc'))
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

export async function bulkImportKpiEntries(rows, usersMap, actorId, actorRole) {
  const results = { created: 0, updated: 0, errors: [] }
  for (const row of rows) {
    try {
      const userInfo = usersMap[row.employeeId]
      if (!userInfo) {
        results.errors.push({ row, error: `رقم موظف غير موجود: ${row.employeeId}` })
        continue
      }
      await saveKpiEntry({
        userId:       userInfo.uid,
        pharmacyId:   userInfo.pharmacyId,
        date:         row.date,
        wasfaty:      row.wasfaty,
        omni:         row.omni,
        wellness:     row.wellness,
        basket:       row.basket,
        crossSelling: row.crossSelling,
        notes:        row.notes,
        actorId, actorRole,
      })
      results.created++
    } catch (e) {
      results.errors.push({ row, error: e.message })
    }
  }
  return results
}
