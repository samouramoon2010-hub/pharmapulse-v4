// ============================================================
// Personal Target Service — PT-1
//
// CRUD operations for the `personal_targets` Firestore collection.
//
// Security:
//   - Admin: full access to any branch
//   - manager / branch_manager: own branch only (enforced client-side
//     and by Firestore rules)
//   - pharmacist: read own target only (Firestore rules only)
//   - district_supervisor / regional_manager: no access in PT-1
//
// Doc ID: {userId}_{pharmacyId}_{month}  — prevents duplicates
// ============================================================

import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import type { PersonalAllocation } from '../engine/personalTargets/allocationEngine'

// ── Doc ID ───────────────────────────────────────────────────

function personalTargetId(userId: string, pharmacyId: string, month: string): string {
  return `${userId}_${pharmacyId}_${month}`
}

// ── Types ─────────────────────────────────────────────────────

// PT-2: status field added for draft/published workflow.
// draft     — allocation saved but not yet visible to pharmacists.
// published — allocation committed; pharmacist can read their own target.
//             A published doc can still be edited (no lock in PT-2).
export type PersonalTargetStatus = 'draft' | 'published'

export interface PersonalTargetDoc {
  id:               string
  userId:           string
  pharmacyId:       string
  month:            string
  targets:          Record<string, number>
  allocationMethod: 'equal' | 'custom'
  // PT-2 fields
  status:           PersonalTargetStatus
  publishedAt:      unknown | null  // serverTimestamp when first published
  createdBy:        string | null
  createdAt:        unknown
  updatedAt:        unknown
}

// ── Write (upsert) ────────────────────────────────────────────

export async function savePersonalTarget(
  allocation: PersonalAllocation,
  actorId:    string,
  actorRole:  string,
): Promise<PersonalTargetDoc> {
  const { userId, pharmacyId, month, targets, allocationMethod } = allocation
  const docId   = personalTargetId(userId, pharmacyId, month)
  const ref     = doc(db, COL.PERSONAL_TARGETS, docId)
  const existing = await getDoc(ref)

  const payload: Record<string, unknown> = {
    userId,
    pharmacyId,
    month,
    targets,
    allocationMethod,
    updatedAt: serverTimestamp(),
    ...(existing.exists()
      ? {}
      : {
          createdAt:   serverTimestamp(),
          createdBy:   actorId || null,
          // New docs start as draft; publish explicitly via publishPersonalTargets()
          status:      'draft' as PersonalTargetStatus,
          publishedAt: null,
        }),
  }

  await setDoc(ref, payload, { merge: true })
  await logAction({
    action:     existing.exists() ? AUDIT_ACTION.UPDATE : AUDIT_ACTION.CREATE,
    collection: COL.PERSONAL_TARGETS,
    docId,
    userId:     actorId,
    userRole:   actorRole,
    after:      payload,
  })

  return { id: docId, ...payload } as PersonalTargetDoc
}

/**
 * Save a full set of personal targets for a branch+month in one pass.
 * Writes one doc per allocation. Awaits all writes before returning.
 */
export async function saveBranchPersonalTargets(
  allocations: PersonalAllocation[],
  actorId:     string,
  actorRole:   string,
): Promise<PersonalTargetDoc[]> {
  return Promise.all(
    allocations.map((a) => savePersonalTarget(a, actorId, actorRole))
  )
}

// ── Delete ────────────────────────────────────────────────────

export async function deletePersonalTarget(
  userId:     string,
  pharmacyId: string,
  month:      string,
  actorId:    string,
  actorRole:  string,
): Promise<void> {
  const docId = personalTargetId(userId, pharmacyId, month)
  const snap  = await getDoc(doc(db, COL.PERSONAL_TARGETS, docId))
  const before = snap.exists() ? snap.data() : null
  await deleteDoc(doc(db, COL.PERSONAL_TARGETS, docId))
  await logAction({
    action:     AUDIT_ACTION.DELETE,
    collection: COL.PERSONAL_TARGETS,
    docId,
    userId:     actorId,
    userRole:   actorRole,
    before,
  })
}

// ── Publish workflow ─────────────────────────────────────────

/**
 * Publish personal targets for an entire branch+month.
 * Sets status → 'published' and records publishedAt timestamp.
 * Published targets become visible to pharmacists via Firestore rules.
 *
 * Idempotent: calling again on an already-published set is safe.
 * Re-publishing after an edit is the correct way to push updates
 * to pharmacists.
 *
 * PT-2: No lock mechanism — published docs can still be edited.
 * Locking is deferred to PT-3.
 */
export async function publishPersonalTargets(
  pharmacyId: string,
  month:      string,
  actorId:    string,
  actorRole:  string,
): Promise<void> {
  const existing = await fetchPersonalTargets(pharmacyId, month)
  if (existing.length === 0) {
    throw new Error(`No personal targets found for ${pharmacyId} / ${month}`)
  }

  // Batch all updates into a single write
  const batch = writeBatch(db)
  const now   = serverTimestamp()

  for (const target of existing) {
    const ref = doc(db, COL.PERSONAL_TARGETS, target.id)
    const update: Record<string, unknown> = { status: 'published', updatedAt: now }
    // Only set publishedAt on first publish
    if (target.status !== 'published') update.publishedAt = now
    batch.update(ref, update)
  }

  await batch.commit()
  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.PERSONAL_TARGETS,
    docId:      `${pharmacyId}_${month}`,
    userId:     actorId,
    userRole:   actorRole,
    after:      { status: 'published', pharmacyId, month, count: existing.length },
  })
}

// ── Subscriptions ─────────────────────────────────────────────

/** Real-time listener: all personal targets for a specific pharmacy + month */
export function subscribePersonalTargetsByBranch(
  pharmacyId: string,
  month:      string,
  callback:   (docs: PersonalTargetDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL.PERSONAL_TARGETS),
    where('pharmacyId', '==', pharmacyId),
    where('month',      '==', month),
    orderBy('userId'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTargetDoc)))
  )
}

/** Real-time listener: a single pharmacist's own personal targets */
export function subscribeMyPersonalTargets(
  userId:   string,
  month:    string,
  callback: (docs: PersonalTargetDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL.PERSONAL_TARGETS),
    where('userId', '==', userId),
    where('month',  '==', month),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTargetDoc)))
  )
}

/** Real-time listener: a pharmacist's own PUBLISHED personal target for a month.
 * Pharmacists should only see published targets — not drafts the manager is still editing.
 */
export function subscribeMyPublishedPersonalTarget(
  userId:   string,
  month:    string,
  callback: (docs: PersonalTargetDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL.PERSONAL_TARGETS),
    where('userId', '==', userId),
    where('month',  '==', month),
    where('status', '==', 'published'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTargetDoc)))
  )
}

// ── On-demand fetch ───────────────────────────────────────────

/** Fetch personal targets for a branch+month. No real-time listener. */
export async function fetchPersonalTargets(
  pharmacyId: string,
  month:      string,
): Promise<PersonalTargetDoc[]> {
  const q    = query(
    collection(db, COL.PERSONAL_TARGETS),
    where('pharmacyId', '==', pharmacyId),
    where('month',      '==', month),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTargetDoc))
}

/** Fetch the personal target for a specific pharmacist+month. */
export async function fetchMyPersonalTarget(
  userId:     string,
  pharmacyId: string,
  month:      string,
): Promise<PersonalTargetDoc | null> {
  const docId = personalTargetId(userId, pharmacyId, month)
  const snap  = await getDoc(doc(db, COL.PERSONAL_TARGETS, docId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PersonalTargetDoc) : null
}
