// ============================================================
// Ranking Snapshot Repository — RF-1B
//
// THE ONLY FILE IN THE RANKING MODULE THAT TOUCHES FIRESTORE.
//
// Responsibilities:
//   - writeRankingSnapshots()      — upsert a batch of snapshots
//   - getRankingSnapshots()         — fetch by period + profile
//   - subscribeRankingSnapshots()   — real-time subscription
//   - getPreviousPeriodSnapshots()  — for rankMovement computation
//   - deletePreviewSnapshots()      — clean up before re-generation
//
// Collection: ranking_snapshots
// Document ID: snapshot.snapshotId (deterministic, from RF-1A engines)
//
// Security: admin-only write (RF-1B constraint).
// ============================================================

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
  serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db, COL } from '../services/firebase'
import type { RankingSnapshot, BranchRankingSnapshot, PharmacistRankingSnapshot } from './types'

// ── Collection reference ──────────────────────────────────────

const col = () => collection(db, COL.RANKING_SNAPSHOTS)
const snapDoc = (id: string) => doc(db, COL.RANKING_SNAPSHOTS, id)

// ── Stored snapshot shape ─────────────────────────────────────

/** Fields added by the repository layer (provenance + mode flags). */
export interface StoredRankingSnapshot extends RankingSnapshot {
  generatedBy:     string    // admin userId who triggered generation
  generationMode:  'manual'  // RF-1B is always manual; 'scheduled' is RF-2
  isPreview:       boolean   // true = can be overwritten; false = official (RF-2)
  writtenAt:       unknown   // serverTimestamp()
}

// ── Batch size ────────────────────────────────────────────────

const BATCH_SIZE = 450

// ── Sanitize ──────────────────────────────────────────────────

/**
 * Remove all undefined values from a snapshot before writing to Firestore.
 * Firestore rejects documents containing `undefined` field values.
 * Optional snapshot fields (entityName, previousRank, rankMovement, score variants)
 * must be omitted entirely rather than written as undefined.
 *
 * Also ensures entityName falls back to entityId so the field is always present.
 */
function sanitizeSnapshot(snap: StoredRankingSnapshot): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snap)) {
    if (value !== undefined) result[key] = value
  }
  // entityName must always be a string — Firestore rejects undefined
  if (!result.entityName) {
    result.entityName = result.entityId ?? 'Unknown Entity'
  }
  return result
}

// ── Write ─────────────────────────────────────────────────────

/**
 * Upsert a batch of ranking snapshots.
 * Uses the snapshot's deterministic snapshotId as the document ID,
 * so re-generation safely overwrites the previous preview.
 */
export async function writeRankingSnapshots(
  snapshots:   RankingSnapshot[],
  generatedBy: string,
  isPreview = true,
): Promise<void> {
  if (snapshots.length === 0) return

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = snapshots.slice(i, i + BATCH_SIZE)

    for (const snap of chunk) {
      const ref = snapDoc(snap.snapshotId)
      const unsanitized: StoredRankingSnapshot = {
        ...snap,
        generatedBy,
        generationMode: 'manual',
        isPreview,
        writtenAt: serverTimestamp(),
      }
      // sanitizeSnapshot removes all undefined fields and ensures entityName is set
      const payload = sanitizeSnapshot(unsanitized)
      batch.set(ref, payload)   // set (not update) — full overwrite on re-generation
    }

    await batch.commit()
  }
}

// ── Read ──────────────────────────────────────────────────────

/**
 * Fetch all ranking snapshots for a period + profile.
 * Ordered by cohortId, then currentRank.
 */
export async function getRankingSnapshots(
  periodId:       string,
  profileId:      string,
  profileVersion: number,
  entityType?:    'branch' | 'pharmacist',
): Promise<StoredRankingSnapshot[]> {
  let q = query(
    col(),
    where('periodId',       '==', periodId),
    where('profileId',      '==', profileId),
    where('profileVersion', '==', profileVersion),
  )
  if (entityType) {
    q = query(q, where('entityType', '==', entityType))
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...d.data() } as StoredRankingSnapshot))
}

/**
 * Real-time subscription to ranking snapshots for a period + profile.
 * Returns unsubscribe function.
 */
export function subscribeRankingSnapshots(
  periodId:       string,
  profileId:      string,
  profileVersion: number,
  entityType:     'branch' | 'pharmacist' | undefined,
  callback:       (snaps: StoredRankingSnapshot[]) => void,
  onError?:       (err: Error) => void,
): () => void {
  const constraints: Parameters<typeof query>[1][] = [
    where('periodId',       '==', periodId),
    where('profileId',      '==', profileId),
    where('profileVersion', '==', profileVersion),
  ]
  if (entityType) constraints.push(where('entityType', '==', entityType))
  const q = query(col(), ...constraints)

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ ...d.data() } as StoredRankingSnapshot))),
    onError,
  )
}

/**
 * Fetch snapshots from the immediately preceding period.
 * Used by the service to compute previousRank / rankMovement.
 */
export async function getPreviousPeriodSnapshots(
  currentPeriodId: string,
  profileId:       string,
  profileVersion:  number,
  entityType?:     'branch' | 'pharmacist',
): Promise<StoredRankingSnapshot[]> {
  const [y, m] = currentPeriodId.split('-').map(Number)
  const prev   = new Date(y, m - 2, 1)  // subtract 1 month
  const prevId = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  return getRankingSnapshots(prevId, profileId, profileVersion, entityType)
}

/**
 * Delete all preview snapshots for a period + profile before re-generation.
 * Safe to call multiple times (idempotent).
 */
export async function deletePreviewSnapshots(
  periodId:       string,
  profileId:      string,
  profileVersion: number,
): Promise<number> {
  const snaps = await getRankingSnapshots(periodId, profileId, profileVersion)
  const previews = snaps.filter((s) => s.isPreview)

  for (let i = 0; i < previews.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const s of previews.slice(i, i + BATCH_SIZE)) {
      batch.delete(snapDoc(s.snapshotId))
    }
    await batch.commit()
  }
  return previews.length
}

/**
 * Fetch a single snapshot by its deterministic ID.
 */
export async function getRankingSnapshot(snapshotId: string): Promise<StoredRankingSnapshot | null> {
  const snap = await getDoc(snapDoc(snapshotId))
  return snap.exists() ? (snap.data() as StoredRankingSnapshot) : null
}
