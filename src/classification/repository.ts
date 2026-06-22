// ============================================================
// Branch Classification Repository — RF-0
//
// THE ONLY FILE IN THE classification MODULE THAT TOUCHES FIRESTORE.
//
// Swapping admin↔client SDK is a one-file change (this file).
//
// Responsibilities:
//   - CRUD for `classifications` collection
//   - Read/write classification fields on `pharmacies/{id}`
//   - Write to `pharmacies/{id}/classificationHistory`
//   - Transactional assignment (history + pointer in one write)
//
// Non-responsibilities:
//   - No resolver logic (see resolver.ts)
//   - No ranking (see ranking-contract.ts)
//   - No UI
//   - No evaluation
//
// Security contract (enforced by Firestore rules, not here):
//   - Read: any authenticated user
//   - Write: admin only (RF-0 constraint)
//   - Branch manager write capability deferred to a future RBAC sprint
// ============================================================

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  addDoc, query, orderBy, where, onSnapshot,
  serverTimestamp, writeBatch, runTransaction,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { logAction, AUDIT_ACTION } from '../services/auditService'
import {
  CLASSIFICATIONS_COLLECTION,
  CLASSIFICATION_HISTORY_SUBCOLLECTION,
  CLASSIFICATION_SCHEMA_VERSION,
  UNCLASSIFIED_ID,
} from './constants'
import type {
  BranchClassification,
  ClassificationHistoryEntry,
  ClassificationSource,
  PharmacyClassificationFields,
} from './types'

// ── Utility ───────────────────────────────────────────────────

const clean = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

/** Reference to the classifications collection. */
const classificationsCol = () => collection(db, CLASSIFICATIONS_COLLECTION)

/** Reference to a single classification document. */
const classificationDoc = (id: string) => doc(db, CLASSIFICATIONS_COLLECTION, id)

/** Reference to a pharmacy's classificationHistory subcollection. */
const historyCol = (pharmacyId: string) =>
  collection(db, 'pharmacies', pharmacyId, CLASSIFICATION_HISTORY_SUBCOLLECTION)

/** Reference to a single pharmacy document. */
const pharmacyDoc = (id: string) => doc(db, 'pharmacies', id)

// ── Classification registry — reads ──────────────────────────

/**
 * Fetch all active classification definitions, ordered by `order`.
 * Used by admin UI to populate dropdowns.
 */
export async function getActiveClassifications(): Promise<BranchClassification[]> {
  const q    = query(classificationsCol(), where('active', '==', true), orderBy('order'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BranchClassification))
}

/**
 * Fetch all classification definitions (including retired ones).
 * Used by admin management UI.
 */
export async function getAllClassifications(): Promise<BranchClassification[]> {
  const q    = query(classificationsCol(), orderBy('order'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BranchClassification))
}

/**
 * Real-time subscription to active classifications.
 * Returns unsubscribe function.
 */
export function subscribeToClassifications(
  callback: (classifications: BranchClassification[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(classificationsCol(), where('active', '==', true), orderBy('order'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BranchClassification))),
    onError,
  )
}

/**
 * Fetch a single classification by ID.
 * Returns null if not found.
 */
export async function getClassification(id: string): Promise<BranchClassification | null> {
  const snap = await getDoc(classificationDoc(id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as BranchClassification) : null
}

// ── Classification registry — writes ─────────────────────────

/**
 * Create a new classification definition.
 * Uses the ID as the Firestore document ID (predictable, no collisions).
 * Will not overwrite an existing document (idempotency guard).
 */
export async function createClassification(
  classification: Omit<BranchClassification, 'createdAt' | 'updatedAt'>,
  actorId: string,
  actorRole: string,
): Promise<void> {
  const ref      = classificationDoc(classification.id)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    return  // idempotent — don't overwrite admin edits
  }

  const payload = clean({
    ...classification,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  })

  await setDoc(ref, payload)
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: CLASSIFICATIONS_COLLECTION,
    docId:      classification.id,
    userId:     actorId,
    userRole:   actorRole,
    after:      payload,
  })
}

/**
 * Update a classification definition.
 * The `id` and `system` fields are immutable after creation.
 */
export async function updateClassification(
  id:      string,
  updates: Partial<Omit<BranchClassification, 'id' | 'createdAt'>>,
  actorId: string,
  actorRole: string,
): Promise<void> {
  const ref = classificationDoc(id)

  const existing = await getDoc(ref)
  if (!existing.exists()) throw new Error(`Classification '${id}' not found`)

  // Immutability guard: preserve id and system flag
  const safeUpdates = clean({
    ...updates,
    id:        undefined,  // strip
    system:    undefined,  // strip
    updatedAt: serverTimestamp(),
  })

  await updateDoc(ref, safeUpdates)
  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: CLASSIFICATIONS_COLLECTION,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before:     existing.data(),
    after:      safeUpdates,
  })
}

// ── Pharmacy classification assignment ────────────────────────

/**
 * Assign a classification to a pharmacy.
 *
 * Writes atomically (transaction):
 *   1. Closes the current open history entry (sets effectiveTo = previousMonth)
 *   2. Opens a new history entry (effectiveFrom = currentMonth, effectiveTo = null)
 *   3. Updates pharmacy.branchClassification pointer
 *
 * @param pharmacyId        Firestore pharmacy document ID
 * @param classificationId  Target classification ID (must exist in registry)
 * @param month             'YYYY-MM' — the month from which this applies
 * @param actorId           Auth UID of the assigning admin
 * @param actorRole         Role of the assigning admin
 */
export async function assignClassification(
  pharmacyId:       string,
  classificationId: string,
  month:            string,
  actorId:          string,
  actorRole:        string,
): Promise<void> {
  // Validate the target classification exists and is active
  const classSnap = await getDoc(classificationDoc(classificationId))
  if (!classSnap.exists()) {
    throw new Error(`Classification '${classificationId}' does not exist`)
  }
  if (classSnap.data()?.active === false) {
    throw new Error(`Classification '${classificationId}' is retired (active: false)`)
  }

  const pharmRef  = pharmacyDoc(pharmacyId)
  const histColRef = historyCol(pharmacyId)

  await runTransaction(db, async (txn) => {
    const pharmSnap = await txn.get(pharmRef)
    if (!pharmSnap.exists()) throw new Error(`Pharmacy '${pharmacyId}' not found`)

    // Close the most recent open history entry (effectiveTo = null)
    const openEntriesSnap = await getDocs(
      query(histColRef, where('effectiveTo', '==', null))
    )
    const previousMonth = offsetMonth(month, -1)
    for (const entryDoc of openEntriesSnap.docs) {
      txn.update(entryDoc.ref, { effectiveTo: previousMonth })
    }

    // Open new history entry
    const newEntry: Omit<ClassificationHistoryEntry, 'id'> = {
      classificationId,
      effectiveFrom: month,
      effectiveTo:   null,
      source:        'admin',
      setAt:         serverTimestamp(),
      setBy:         actorId,
    }
    txn.set(doc(histColRef), newEntry)

    // Update the current pointer on the pharmacy document
    const pointer: PharmacyClassificationFields = {
      branchClassification:       classificationId,
      branchClassificationSetAt:  new Date().toISOString(),
      branchClassificationSource: 'admin',
      schemaVersion:              CLASSIFICATION_SCHEMA_VERSION,
    }
    txn.update(pharmRef, clean(pointer as unknown as Record<string, unknown>))
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: 'pharmacies',
    docId:      pharmacyId,
    userId:     actorId,
    userRole:   actorRole,
    after:      { branchClassification: classificationId, month },
  })
}

// ── History reads ─────────────────────────────────────────────

/**
 * Fetch the full classification history for a pharmacy.
 * Sorted ascending by effectiveFrom.
 */
export async function getClassificationHistory(
  pharmacyId: string,
): Promise<ClassificationHistoryEntry[]> {
  const q    = query(historyCol(pharmacyId), orderBy('effectiveFrom', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassificationHistoryEntry))
}

// ── Pharmacy + classification reads (RF-0A verification UI) ──

/**
 * Real-time subscription to all pharmacies including their
 * classification fields. Returns the full pharmacy document shape
 * so the verification UI can display name, code, and all RF-0 fields.
 *
 * Read-only — no writes in this path.
 */
export function subscribeToPharmaciesWithClassification(
  callback: (pharmacies: PharmacyWithClassification[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(collection(db, 'pharmacies'), orderBy('name'))
  return onSnapshot(
    q,
    (snap) => callback(
      snap.docs
        .filter((d) => d.exists())   // guard: skip any null/missing snapshot docs
        .map((d) => ({ id: d.id, ...d.data() } as PharmacyWithClassification))
    ),
    onError,
  )
}

/** Minimal pharmacy shape returned for the verification UI. */
export interface PharmacyWithClassification {
  id:                           string
  name?:                        string
  code?:                        string
  branchClassification?:        string | null
  branchClassificationSetAt?:   string | null
  branchClassificationSource?:  string | null
  schemaVersion?:               number
  [key: string]: unknown  // other pharmacy fields not needed by this UI
}

// ── Utility ───────────────────────────────────────────────────

/**
 * Compute an offset month in YYYY-MM format.
 * offsetMonth('2026-06', -1) = '2026-05'
 * offsetMonth('2026-01', -1) = '2025-12'
 *
 * @pure — no I/O
 */
export function offsetMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
