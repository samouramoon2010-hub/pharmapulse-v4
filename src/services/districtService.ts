// ============================================================
// District Service — RBAC Phase 1 Territory Infrastructure
//
// CRUD operations for the `districts` Firestore collection.
// Admin-only writes. All authenticated users can read.
//
// A district groups pharmacies within a region and is managed
// by a district_supervisor. The 'district' term is configurable
// in the UI — this service is label-agnostic.
//
// Phase 1: infrastructure only.
// Phase 2 (future): territory-based access enforcement.
// ============================================================

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import type { District } from './territoryTypes'

const clean = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Uniqueness guard ──────────────────────────────────────────

export async function districtCodeExists(
  code:      string,
  excludeId: string | null = null,
): Promise<boolean> {
  const q    = query(collection(db, COL.DISTRICTS), where('code', '==', code.trim().toUpperCase()))
  const snap = await getDocs(q)
  if (snap.empty) return false
  if (excludeId && snap.docs.length === 1 && snap.docs[0].id === excludeId) return false
  return true
}

// ── Real-time subscriptions ───────────────────────────────────

export function subscribeToDistricts(
  callback: (districts: District[]) => void,
): () => void {
  const q = query(collection(db, COL.DISTRICTS), orderBy('name'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as District)))
  )
}

export function subscribeToDistrictsByRegion(
  regionId: string,
  callback: (districts: District[]) => void,
): () => void {
  const q = query(
    collection(db, COL.DISTRICTS),
    where('regionId', '==', regionId),
    orderBy('name'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as District)))
  )
}

// ── Create ────────────────────────────────────────────────────

export async function createDistrict(
  data:      Partial<District>,
  actorId:   string,
  actorRole: string,
): Promise<District> {
  if (!data.code?.trim())   throw new Error('District code is required')
  if (!data.name?.trim())   throw new Error('District name is required')
  if (!data.regionId?.trim()) throw new Error('Region is required')

  const code = data.code.trim().toUpperCase()
  if (await districtCodeExists(code)) {
    throw new Error(`District code "${code}" is already in use`)
  }

  const payload = clean({
    code,
    name:          data.name.trim(),
    regionId:      data.regionId.trim(),
    supervisorUid: data.supervisorUid || null,
    pharmacyIds:   data.pharmacyIds   || [],
    active:        data.active !== false,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
    createdBy:     actorId || null,
  })

  const ref = await addDoc(collection(db, COL.DISTRICTS), payload)
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.DISTRICTS,
    docId:      ref.id,
    userId:     actorId,
    userRole:   actorRole,
    after:      payload,
  })
  return { id: ref.id, ...payload } as District
}

// ── Update ────────────────────────────────────────────────────

export async function updateDistrict(
  id:        string,
  data:      Partial<District>,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap   = await getDoc(doc(db, COL.DISTRICTS, id))
  const before = snap.exists() ? snap.data() : null

  if (data.code && data.code !== before?.code) {
    const code = data.code.trim().toUpperCase()
    if (await districtCodeExists(code, id)) {
      throw new Error(`District code "${code}" is already in use`)
    }
    data = { ...data, code }
  }

  const payload = clean({ ...data, updatedAt: serverTimestamp(), updatedBy: actorId || null })
  await updateDoc(doc(db, COL.DISTRICTS, id), payload)
  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.DISTRICTS,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before,
    after:      payload,
  })
}

// ── Assign pharmacy to district ───────────────────────────────
// Adds a pharmacyId to the district's pharmacyIds array.
// Also updates the pharmacy document with districtId (denormalised).

export async function assignPharmacyToDistrict(
  districtId: string,
  pharmacyId: string,
  actorId:    string,
  actorRole:  string,
): Promise<void> {
  const distSnap = await getDoc(doc(db, COL.DISTRICTS, districtId))
  if (!distSnap.exists()) throw new Error('District not found')

  const district    = distSnap.data() as District
  const currentIds  = district.pharmacyIds || []
  if (currentIds.includes(pharmacyId)) return // already assigned — idempotent

  const updatedIds = [...currentIds, pharmacyId]

  // Update district pharmacyIds array
  await updateDoc(doc(db, COL.DISTRICTS, districtId), {
    pharmacyIds: updatedIds,
    updatedAt:   serverTimestamp(),
    updatedBy:   actorId,
  })

  // Denormalise districtId and regionId onto the pharmacy document
  await updateDoc(doc(db, COL.PHARMACIES, pharmacyId), {
    districtId: districtId,
    regionId:   district.regionId,
    updatedAt:  serverTimestamp(),
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.DISTRICTS,
    docId:      districtId,
    userId:     actorId,
    userRole:   actorRole,
    after:      { pharmacyIds: updatedIds, pharmacyId },
    meta:       { operation: 'assign_pharmacy' },
  } as Parameters<typeof logAction>[0])
}

// ── Remove pharmacy from district ────────────────────────────

export async function removePharmacyFromDistrict(
  districtId: string,
  pharmacyId: string,
  actorId:    string,
  actorRole:  string,
): Promise<void> {
  const distSnap = await getDoc(doc(db, COL.DISTRICTS, districtId))
  if (!distSnap.exists()) throw new Error('District not found')

  const district   = distSnap.data() as District
  const updatedIds = (district.pharmacyIds || []).filter((id) => id !== pharmacyId)

  await updateDoc(doc(db, COL.DISTRICTS, districtId), {
    pharmacyIds: updatedIds,
    updatedAt:   serverTimestamp(),
    updatedBy:   actorId,
  })

  // Clear districtId and regionId from the pharmacy document
  await updateDoc(doc(db, COL.PHARMACIES, pharmacyId), {
    districtId: null,
    regionId:   null,
    updatedAt:  serverTimestamp(),
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.DISTRICTS,
    docId:      districtId,
    userId:     actorId,
    userRole:   actorRole,
    after:      { pharmacyIds: updatedIds, pharmacyId },
    meta:       { operation: 'remove_pharmacy' },
  } as Parameters<typeof logAction>[0])
}

// ── Delete ────────────────────────────────────────────────────

export async function deleteDistrict(
  id:        string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap   = await getDoc(doc(db, COL.DISTRICTS, id))
  const before = snap.exists() ? snap.data() : null

  const district   = before as District | null
  const pharmacies = district?.pharmacyIds || []
  if (pharmacies.length > 0) {
    throw new Error('Cannot delete a district that has pharmacies assigned to it')
  }

  await deleteDoc(doc(db, COL.DISTRICTS, id))
  await logAction({
    action:     AUDIT_ACTION.DELETE,
    collection: COL.DISTRICTS,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before,
  })
}

// ── Fetch single ──────────────────────────────────────────────

export async function getDistrict(id: string): Promise<District | null> {
  const snap = await getDoc(doc(db, COL.DISTRICTS, id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as District) : null
}
