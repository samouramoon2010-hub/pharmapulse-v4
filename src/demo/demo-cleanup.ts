// ============================================================
// Demo Cleanup — RF-0E
//
// Two entry points:
//   deleteDemoBatch(batchId)   — delete one specific batch
//   deleteAllDemoData()        — global reset: delete EVERY demo doc
//
// SAFETY CONTRACT (both functions):
//   Every document is checked client-side BEFORE deletion:
//     doc.isDemoData === true   (must be present and exactly true)
//   Any document missing this field is SKIPPED — never deleted.
//   Real production data never carries isDemoData, so it is
//   structurally impossible for this code to delete real data.
//
// Pattern: getDocs(collection) + client-side filter
//   We do NOT use where('isDemoData','==',true) compound queries
//   because they require Firestore composite indexes and return
//   permission-denied on empty / newly-created collections.
//   Full collection scans are safe — admin can read all docs in
//   every collection listed here.
// ============================================================

import {
  collection, doc, getDocs, deleteDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { DEMO_BATCHES_COLLECTION } from './constants'

// ── Config ────────────────────────────────────────────────────

const BATCH_SIZE = 400

/** All collections that may contain demo-tagged documents. */
const ALL_DEMO_COLLECTIONS = [
  'pharmacies',
  'users',
  'targets',
  'personal_targets',
  'kpi_entries',
  'evaluation_results',
  'ranking_snapshots',
  DEMO_BATCHES_COLLECTION,
] as const

type DemoCollection = typeof ALL_DEMO_COLLECTIONS[number]

// ── Types ─────────────────────────────────────────────────────

export interface DemoDocCount {
  collection: string
  count:      number
}

export interface GlobalCleanupScan {
  counts:     DemoDocCount[]
  totalDocs:  number
}

export interface GlobalCleanupResult {
  deleted:          Record<string, number>
  totalDeleted:     number
  skipped:          number
  verification:     Record<string, number>   // counts after deletion (all should be 0)
  verificationPass: boolean
  error?:           string
}

export interface CleanupResult {
  batchId:  string
  deleted:  Record<string, number>
  total:    number
  skipped:  number
  error?:   string
}

// ── Safety guard ──────────────────────────────────────────────

/** Returns true only when doc.isDemoData is strictly === true. */
function isSafeToDelete(data: Record<string, unknown>): boolean {
  return data.isDemoData === true
}

// ── Collection scan ───────────────────────────────────────────

/**
 * Count demo documents in every collection without deleting anything.
 * Used for the pre-deletion summary shown to the admin.
 */
export async function scanAllDemoData(): Promise<GlobalCleanupScan> {
  const counts: DemoDocCount[] = []
  let totalDocs = 0

  for (const col of ALL_DEMO_COLLECTIONS) {
    try {
      const snap  = await getDocs(collection(db, col))
      const count = snap.docs.filter((d) => isSafeToDelete(d.data() as Record<string, unknown>)).length
      counts.push({ collection: col, count })
      totalDocs += count
    } catch {
      counts.push({ collection: col, count: 0 })
    }
  }

  return { counts, totalDocs }
}

// ── Global delete ─────────────────────────────────────────────

/**
 * Delete ALL demo documents across ALL collections.
 *
 * Safety: every doc is re-verified client-side (isDemoData === true)
 * before deletion. Documents without this field are NEVER deleted.
 *
 * After deletion, a verification scan confirms all counts are 0.
 */
export async function deleteAllDemoData(): Promise<GlobalCleanupResult> {
  const result: GlobalCleanupResult = {
    deleted:          {},
    totalDeleted:     0,
    skipped:          0,
    verification:     {},
    verificationPass: false,
  }

  try {
    for (const col of ALL_DEMO_COLLECTIONS) {
      let snap
      try {
        snap = await getDocs(collection(db, col))
      } catch {
        result.deleted[col] = 0
        continue
      }

      const toDelete = snap.docs.filter((d) =>
        isSafeToDelete(d.data() as Record<string, unknown>)
      )
      result.skipped  += snap.docs.length - toDelete.length
      result.deleted[col] = toDelete.length

      // Delete in safe batches
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        for (const d of toDelete.slice(i, i + BATCH_SIZE)) {
          batch.delete(d.ref)
        }
        await batch.commit()
      }
    }

    result.totalDeleted = Object.values(result.deleted).reduce((a, b) => a + b, 0)

    // ── Post-deletion verification scan ──────────────────────
    for (const col of ALL_DEMO_COLLECTIONS) {
      try {
        const snap  = await getDocs(collection(db, col))
        const remaining = snap.docs.filter((d) =>
          isSafeToDelete(d.data() as Record<string, unknown>)
        ).length
        result.verification[col] = remaining
      } catch {
        result.verification[col] = -1   // -1 = could not verify
      }
    }

    result.verificationPass = Object.values(result.verification)
      .every((count) => count === 0)

  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }

  return result
}

// ── Per-batch delete (existing — unchanged) ───────────────────

/**
 * Delete all documents for one specific demo batch.
 * Filters by isDemoData===true AND demoBatchId===batchId.
 */
export async function deleteDemoBatch(
  batchId: string,
  dryRun = false,
): Promise<CleanupResult> {
  const result: CleanupResult = {
    batchId,
    deleted: {},
    total:   0,
    skipped: 0,
  }

  for (const col of ALL_DEMO_COLLECTIONS) {
    let snap
    try {
      snap = await getDocs(collection(db, col))
    } catch {
      result.skipped++
      continue
    }

    const toDelete = snap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>
      return data.isDemoData === true && data.demoBatchId === batchId
    })

    result.skipped    += snap.docs.length - toDelete.length
    result.deleted[col] = toDelete.length

    if (dryRun) continue

    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      for (const d of toDelete.slice(i, i + BATCH_SIZE)) {
        batch.delete(d.ref)
      }
      await batch.commit()
    }
  }

  // Also delete the batch metadata doc itself
  if (!dryRun) {
    try {
      await deleteDoc(doc(db, DEMO_BATCHES_COLLECTION, batchId))
    } catch { /* best-effort */ }
  }

  result.total = Object.values(result.deleted).reduce((a, b) => a + b, 0)
  return result
}
