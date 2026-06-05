// ============================================================
// Region Service — RBAC Phase 1 Territory Infrastructure
//
// CRUD operations for the `regions` Firestore collection.
// Admin-only writes. All authenticated users can read (needed
// for district/pharmacy assignment UIs).
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
import type { Region } from './territoryTypes'

const clean = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Uniqueness guard ──────────────────────────────────────────

export async function regionCodeExists(
  code:      string,
  excludeId: string | null = null,
): Promise<boolean> {
  const q    = query(collection(db, COL.REGIONS), where('code', '==', code.trim().toUpperCase()))
  const snap = await getDocs(q)
  if (snap.empty) return false
  if (excludeId && snap.docs.length === 1 && snap.docs[0].id === excludeId) return false
  return true
}

// ── Real-time subscription ────────────────────────────────────

export function subscribeToRegions(
  callback: (regions: Region[]) => void,
): () => void {
  const q = query(collection(db, COL.REGIONS), orderBy('name'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Region)))
  )
}

// ── Create ────────────────────────────────────────────────────

export async function createRegion(
  data:      Partial<Region>,
  actorId:   string,
  actorRole: string,
): Promise<Region> {
  if (!data.code?.trim()) throw new Error('Region code is required')
  if (!data.name?.trim()) throw new Error('Region name is required')

  const code = data.code.trim().toUpperCase()
  if (await regionCodeExists(code)) {
    throw new Error(`Region code "${code}" is already in use`)
  }

  const payload = clean({
    code,
    name:        data.name.trim(),
    managerUid:  data.managerUid  || null,
    districtIds: data.districtIds || [],
    active:      data.active !== false,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
    createdBy:   actorId || null,
  })

  const ref = await addDoc(collection(db, COL.REGIONS), payload)
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.REGIONS,
    docId:      ref.id,
    userId:     actorId,
    userRole:   actorRole,
    after:      payload,
  })
  return { id: ref.id, ...payload } as Region
}

// ── Update ────────────────────────────────────────────────────

export async function updateRegion(
  id:        string,
  data:      Partial<Region>,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap   = await getDoc(doc(db, COL.REGIONS, id))
  const before = snap.exists() ? snap.data() : null

  if (data.code && data.code !== before?.code) {
    const code = data.code.trim().toUpperCase()
    if (await regionCodeExists(code, id)) {
      throw new Error(`Region code "${code}" is already in use`)
    }
    data = { ...data, code }
  }

  const payload = clean({ ...data, updatedAt: serverTimestamp(), updatedBy: actorId || null })
  await updateDoc(doc(db, COL.REGIONS, id), payload)
  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.REGIONS,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before,
    after:      payload,
  })
}

// ── Delete ────────────────────────────────────────────────────

export async function deleteRegion(
  id:        string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap   = await getDoc(doc(db, COL.REGIONS, id))
  const before = snap.exists() ? snap.data() : null

  // Safety: do not delete a region that has districts assigned
  const districts = await getDocs(
    query(collection(db, COL.DISTRICTS), where('regionId', '==', id))
  )
  if (!districts.empty) {
    throw new Error('Cannot delete a region that has districts assigned to it')
  }

  await deleteDoc(doc(db, COL.REGIONS, id))
  await logAction({
    action:     AUDIT_ACTION.DELETE,
    collection: COL.REGIONS,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before,
  })
}

// ── Fetch single ──────────────────────────────────────────────

export async function getRegion(id: string): Promise<Region | null> {
  const snap = await getDoc(doc(db, COL.REGIONS, id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Region) : null
}
