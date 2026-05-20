// ============================================================
// Pharmacy Service — Production Firestore CRUD
// ============================================================
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, setDoc, query, where, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

// ── Helper: remove undefined fields ─────────────────────────
const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Check code uniqueness ─────────────────────────────────────
export async function pharmacyCodeExists(code, excludeId = null) {
  const q    = query(collection(db, COL.PHARMACIES), where('code', '==', code.trim()))
  const snap = await getDocs(q)
  if (snap.empty) return false
  if (excludeId && snap.docs.length === 1 && snap.docs[0].id === excludeId) return false
  return true
}

// ── Subscribe realtime ────────────────────────────────────────
export function subscribeToPharmacies(callback) {
  const q = query(collection(db, COL.PHARMACIES), orderBy('name'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

// ── Create ────────────────────────────────────────────────────
export async function createPharmacy(data, actorId, actorRole) {
  // Validate code uniqueness
  if (await pharmacyCodeExists(data.code)) {
    throw new Error(`كود الفرع "${data.code}" مستخدم مسبقاً`)
  }

  const payload = clean({
    code:         data.code.trim(),
    name:         data.name.trim(),
    region:       data.region?.trim()       || null,
    city:         data.city?.trim()         || null,
    managerUid:   data.managerUid           || null,
    managerEmail: data.managerEmail?.trim() || null,
    active:       data.active !== false,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
    createdBy:    actorId || null,
  })

  const ref = await addDoc(collection(db, COL.PHARMACIES), payload)
  await logAction({
    action: AUDIT_ACTION.CREATE, collection: COL.PHARMACIES,
    docId: ref.id, userId: actorId, userRole: actorRole, after: payload,
  })
  return { id: ref.id, ...payload }
}

// ── Update ────────────────────────────────────────────────────
export async function updatePharmacy(id, data, actorId, actorRole) {
  const snap  = await getDoc(doc(db, COL.PHARMACIES, id))
  const before = snap.exists() ? snap.data() : null

  // If code changed, check uniqueness
  if (data.code && data.code !== before?.code) {
    if (await pharmacyCodeExists(data.code, id)) {
      throw new Error(`كود الفرع "${data.code}" مستخدم مسبقاً`)
    }
  }

  const payload = clean({ ...data, updatedAt: serverTimestamp(), updatedBy: actorId || null })
  await updateDoc(doc(db, COL.PHARMACIES, id), payload)
  await logAction({
    action: AUDIT_ACTION.UPDATE, collection: COL.PHARMACIES,
    docId: id, userId: actorId, userRole: actorRole, before, after: payload,
  })
}

// ── Toggle active ─────────────────────────────────────────────
export async function togglePharmacyStatus(id, actorId, actorRole) {
  const snap = await getDoc(doc(db, COL.PHARMACIES, id))
  if (!snap.exists()) throw new Error('الفرع غير موجود')
  const newActive = !snap.data().active
  await updateDoc(doc(db, COL.PHARMACIES, id), {
    active: newActive, updatedAt: serverTimestamp(),
  })
  await logAction({
    action: AUDIT_ACTION.UPDATE, collection: COL.PHARMACIES,
    docId: id, userId: actorId, userRole: actorRole,
    after: { active: newActive },
  })
}

// ── Delete ────────────────────────────────────────────────────
export async function deletePharmacy(id, actorId, actorRole) {
  const snap  = await getDoc(doc(db, COL.PHARMACIES, id))
  const before = snap.exists() ? snap.data() : null
  await deleteDoc(doc(db, COL.PHARMACIES, id))
  await logAction({
    action: AUDIT_ACTION.DELETE, collection: COL.PHARMACIES,
    docId: id, userId: actorId, userRole: actorRole, before,
  })
}

// ── Bulk import (from Excel) ──────────────────────────────────
export async function bulkImportPharmacies(rows, actorId, actorRole) {
  const results = { created: 0, skipped: 0, errors: [] }

  for (const row of rows) {
    try {
      if (!row.code || !row.name) {
        results.errors.push({ row, error: 'code و name مطلوبان' })
        continue
      }
      const exists = await pharmacyCodeExists(row.code)
      if (exists) {
        results.skipped++
        continue
      }
      await createPharmacy(row, actorId, actorRole)
      results.created++
    } catch (e) {
      results.errors.push({ row, error: e.message })
    }
  }
  return results
}
