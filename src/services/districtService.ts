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
import { recomputeAssignedPharmacyIds } from './territorySync'
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

  // ── Territory sync — Phase 1B-3B ─────────────────────────────

  // Data-integrity fix: when district moves to a different region,
  // update pharmacy.regionId denormalization for all assigned pharmacies.
  // This is not best-effort — failure is surfaced to the caller.
  const oldRegionId = (before?.regionId as string | undefined) || null
  const newRegionId = ('regionId' in data)
    ? ((data.regionId as string | undefined) || null)
    : oldRegionId
  if (oldRegionId !== newRegionId && newRegionId) {
    const pharmacyIds = (before?.pharmacyIds as string[] | undefined) || []
    await Promise.all(
      pharmacyIds.map((phId) =>
        updateDoc(doc(db, COL.PHARMACIES, phId), {
          regionId:  newRegionId,
          updatedAt: serverTimestamp(),
          updatedBy: actorId || null,
        }),
      ),
    )
  }

  // Best-effort: recompute assignedPharmacyIds cache when district supervisor changes.
  // Failure is logged but must not fail the district update itself.
  const oldSupervisorUid = (before?.supervisorUid as string | null | undefined) || null
  const newSupervisorUid = ('supervisorUid' in data)
    ? ((data.supervisorUid as string | null | undefined) || null)
    : oldSupervisorUid
  if (oldSupervisorUid !== newSupervisorUid) {
    if (oldSupervisorUid) {
      recomputeAssignedPharmacyIds(oldSupervisorUid, actorId, actorRole).catch((e) =>
        console.error('[districtService] recompute old supervisor failed', e),
      )
    }
    if (newSupervisorUid) {
      recomputeAssignedPharmacyIds(newSupervisorUid, actorId, actorRole).catch((e) =>
        console.error('[districtService] recompute new supervisor failed', e),
      )
    }
  }
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

  // ── Territory sync — Phase 1B-3D ─────────────────────────────

  // Best-effort: recompute supervisor and regional manager after pharmacy is added.
  // Failure must never fail the primary assign operation.
  const supervisorUid = (district.supervisorUid as string | null | undefined) || null
  if (supervisorUid) {
    recomputeAssignedPharmacyIds(supervisorUid, actorId, actorRole).catch((e) =>
      console.error('[districtService] recompute supervisor failed (assign)', e),
    )
  }
  const regionId = (district.regionId as string | undefined) || null
  if (regionId) {
    getDoc(doc(db, COL.REGIONS, regionId)).then((regionSnap) => {
      const managerUid = regionSnap.exists()
        ? ((regionSnap.data().managerUid as string | null | undefined) || null)
        : null
      if (managerUid) {
        recomputeAssignedPharmacyIds(managerUid, actorId, actorRole).catch((e) =>
          console.error('[districtService] recompute regional manager failed (assign)', e),
        )
      }
    }).catch((e) =>
      console.error('[districtService] region lookup failed (assign)', e),
    )
  }
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

  // ── Territory sync — Phase 1B-3D ─────────────────────────────

  // Best-effort: recompute supervisor and regional manager after pharmacy is removed.
  // Failure must never fail the primary remove operation.
  const supervisorUid = (district.supervisorUid as string | null | undefined) || null
  if (supervisorUid) {
    recomputeAssignedPharmacyIds(supervisorUid, actorId, actorRole).catch((e) =>
      console.error('[districtService] recompute supervisor failed (remove)', e),
    )
  }
  const regionId = (district.regionId as string | undefined) || null
  if (regionId) {
    getDoc(doc(db, COL.REGIONS, regionId)).then((regionSnap) => {
      const managerUid = regionSnap.exists()
        ? ((regionSnap.data().managerUid as string | null | undefined) || null)
        : null
      if (managerUid) {
        recomputeAssignedPharmacyIds(managerUid, actorId, actorRole).catch((e) =>
          console.error('[districtService] recompute regional manager failed (remove)', e),
        )
      }
    }).catch((e) =>
      console.error('[districtService] region lookup failed (remove)', e),
    )
  }
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
