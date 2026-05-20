// ============================================================
// KPI Service — kpi_entries + targets (Production Firestore)
// ============================================================
import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { auth, db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Composite doc ID prevents duplicates ──────────────────────
function entryId(userId, pharmacyId, date) {
  return `${userId}_${pharmacyId}_${date}`
}

// ── Save / upsert daily KPI entry ─────────────────────────────
export async function saveKpiEntry({
  userId,       // from auth.currentUser.uid — verified below
  pharmacyId,   // from userProfile.pharmacyId
  date,         // "yyyy-MM-dd"
  wasfaty      = 0,
  omni         = 0,
  wellness     = 0,
  basket       = 0,
  crossSelling = 0,
  notes        = '',
  actorId,
  actorRole,
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

  // ── Step 3: build clean payload ──────────────────────────────
  const payload = clean({
    userId:       resolvedUserId,
    pharmacyId:   pharmacyId.trim(),
    date,
    wasfaty:      Number(wasfaty)      || 0,
    omni:         Number(omni)         || 0,
    wellness:     Number(wellness)     || 0,
    basket:       Number(basket)       || 0,
    crossSelling: Number(crossSelling) || 0,
    notes:        notes?.trim()        || '',
    updatedAt:    serverTimestamp(),
    createdBy:    actorId || resolvedUserId || null,
    ...(isNew
      ? { createdAt: serverTimestamp(), submittedBy: actorId || resolvedUserId || null }
      : {}),
  })

  // Debug log — remove before final release
  console.log('[kpiService] saveKpiEntry payload:', {
    docId,
    userId:     payload.userId,
    pharmacyId: payload.pharmacyId,
    date:       payload.date,
    isNew,
  })

  // ── Step 4: write to Firestore ────────────────────────────────
  await setDoc(doc(db, COL.KPI_ENTRIES, docId), payload, { merge: true })

  // ── Step 5: audit log ─────────────────────────────────────────
  await logAction({
    action:     isNew ? AUDIT_ACTION.CREATE : AUDIT_ACTION.UPDATE,
    collection: COL.KPI_ENTRIES,
    docId,
    userId:     actorId || resolvedUserId,
    userRole:   actorRole,
    before:     isNew ? null : existing.data(),
    after:      payload,
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
  salesTarget = 0, wasfatyTarget = 0, omniTarget = 0,
  wellnessTarget = 0, crossSellTarget = 0,
  actorId, actorRole,
}) {
  const docId    = `${pharmacyId}_${month}`
  const existing = await getDoc(doc(db, COL.TARGETS, docId))

  const payload = clean({
    pharmacyId, month,
    salesTarget:     Number(salesTarget),
    wasfatyTarget:   Number(wasfatyTarget),
    omniTarget:      Number(omniTarget),
    wellnessTarget:  Number(wellnessTarget),
    crossSellTarget: Number(crossSellTarget),
    updatedAt:       serverTimestamp(),
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
