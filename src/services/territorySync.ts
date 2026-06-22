// ============================================================
// Territory Sync Engine — Phase 1B-3A
//
// Pure computation engine for the assignedPharmacyIds cache.
// This module computes and writes the cache field only.
// It does NOT auto-trigger — service hooks are wired in
// sprints 1B-3B, 1B-3C, and 1B-3D.
//
// Safe fallback invariant:
//   For district_supervisor and regional_manager,
//   missing or unknown territory data → [] (never null).
//   null is reserved for "all access" (admin/GM) or
//   "not applicable" (branch_manager/manager/pharmacist).
//
// Region.districtIds is intentionally NOT used — it is never
// populated by createDistrict. district.regionId is authoritative.
// ============================================================

import {
  doc, getDoc, getDocs, updateDoc,
  collection, query, where,
  serverTimestamp,
} from 'firebase/firestore'
import { db, COL }              from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

// ── Comparison helper ─────────────────────────────────────────
// Order-insensitive: ['b','a'] === ['a','b']

function arraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a.length !== b.length)   return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

// ── getDistrictPharmacyIds ────────────────────────────────────
// Reads a single district document and returns its pharmacyIds.
// Returns [] if the district document does not exist.

export async function getDistrictPharmacyIds(districtId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, COL.DISTRICTS, districtId))
  if (!snap.exists()) return []
  const data = snap.data() as Record<string, unknown>
  return (data.pharmacyIds as string[] | undefined) || []
}

// ── getRegionPharmacyIds ──────────────────────────────────────
// Returns the deduplicated union of pharmacyIds across all
// districts that have district.regionId === regionId.
// Does NOT use region.districtIds (unreliable — never populated).
// Returns [] if no districts are found for the regionId.

export async function getRegionPharmacyIds(regionId: string): Promise<string[]> {
  const q    = query(collection(db, COL.DISTRICTS), where('regionId', '==', regionId))
  const snap = await getDocs(q)
  const all: string[] = []
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    const ids  = (data.pharmacyIds as string[] | undefined) || []
    all.push(...ids)
  }
  return [...new Set(all)]
}

// ── Internal: role-based computation from in-memory user data ─

async function _computeForUserData(data: Record<string, unknown>): Promise<string[] | null> {
  const role = data.role as string

  if (role === 'admin' || role === 'general_manager') return null

  if (role === 'district_supervisor') {
    const districtId = (data.districtId as string | null | undefined) || null
    if (!districtId) return []
    return getDistrictPharmacyIds(districtId)
  }

  if (role === 'regional_manager') {
    const regionIds = (data.regionIds as string[] | null | undefined) || []
    if (regionIds.length === 0) return []
    const all: string[] = []
    for (const regionId of regionIds) {
      const ids = await getRegionPharmacyIds(regionId)
      all.push(...ids)
    }
    return [...new Set(all)]
  }

  // branch_manager, manager, pharmacist, or any unrecognised role
  return null
}

// ── computeAssignedPharmacyIdsForUser ─────────────────────────
// Pure read — no writes.
// Returns the expected assignedPharmacyIds value for a user
// based on the current authoritative hierarchy.
// Returns null if the user document does not exist.

export async function computeAssignedPharmacyIdsForUser(uid: string): Promise<string[] | null> {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) return null
  return _computeForUserData(snap.data() as Record<string, unknown>)
}

// ── recomputeAssignedPharmacyIds ──────────────────────────────
// Reads the user document, computes the expected value,
// compares (order-insensitive) with the cached value, and
// writes only if changed.
// Safe to call multiple times — idempotent.

export async function recomputeAssignedPharmacyIds(
  uid:       string,
  actorId:   string,
  actorRole: string,
): Promise<{ changed: boolean; previous: string[] | null; current: string[] | null }> {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) throw new Error(`User ${uid} not found`)

  const userData = snap.data() as Record<string, unknown>
  const previous = (userData.assignedPharmacyIds ?? null) as string[] | null
  const current  = await _computeForUserData(userData)

  if (arraysEqual(previous, current)) {
    return { changed: false, previous, current }
  }

  await updateDoc(doc(db, COL.USERS, uid), {
    assignedPharmacyIds: current,
    updatedAt:           serverTimestamp(),
    updatedBy:           actorId || null,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.USERS,
    docId:      uid,
    userId:     actorId,
    userRole:   actorRole,
    before:     { assignedPharmacyIds: previous },
    after:      { assignedPharmacyIds: current },
  } as Parameters<typeof logAction>[0])

  return { changed: true, previous, current }
}
