// ============================================================
// Territory Backfill Engine — Phase 1B-3E
//
// Manual repair tool for the assignedPharmacyIds cache.
// Processes all district_supervisor and regional_manager users,
// calling recomputeAssignedPharmacyIds() for each.
//
// Safe to run multiple times — recompute is idempotent.
// Never stops on per-user failures — collects them in failures[].
// Only throws if the initial Firestore user query fails.
//
// Intended use: admin-triggered one-shot repair after:
//   - bulk hierarchy imports
//   - manual Firestore edits
//   - cache drift discovered by the validation engine (1B-3F)
//
// Does NOT execute automatically.
// Does NOT have UI.
// Does NOT implement validation or Scope Resolver.
// ============================================================

import {
  collection, getDocs, query, where,
} from 'firebase/firestore'
import { db, COL }                       from './firebase'
import { recomputeAssignedPharmacyIds }  from './territorySync'

// ── Role scope ────────────────────────────────────────────────
// Only these roles carry a computed assignedPharmacyIds cache.
// All other roles (admin, general_manager, manager,
// branch_manager, pharmacist) use null semantics and are skipped.

const TERRITORY_ROLES = ['district_supervisor', 'regional_manager'] as const

// ── Result type ───────────────────────────────────────────────

export interface BackfillResult {
  scanned:   number
  updated:   number
  unchanged: number
  failed:    number
  failures:  Array<{ uid: string; displayName: string; error: string }>
}

// ── backfillAllAssignedPharmacyIds ────────────────────────────
// Queries all users with territory roles and recomputes each one.
// Returns a summary of what was scanned, updated, and failed.

export async function backfillAllAssignedPharmacyIds(
  actorId:   string,
  actorRole: string,
): Promise<BackfillResult> {
  // Throws if Firestore is unreachable — caller must handle.
  const snap = await getDocs(
    query(collection(db, COL.USERS), where('role', 'in', TERRITORY_ROLES)),
  )

  const result: BackfillResult = {
    scanned:   0,
    updated:   0,
    unchanged: 0,
    failed:    0,
    failures:  [],
  }

  for (const userDoc of snap.docs) {
    result.scanned++
    const uid         = userDoc.id
    const displayName = (userDoc.data().displayName as string | undefined) || ''
    try {
      const { changed } = await recomputeAssignedPharmacyIds(uid, actorId, actorRole)
      if (changed) {
        result.updated++
      } else {
        result.unchanged++
      }
    } catch (e) {
      result.failed++
      result.failures.push({
        uid,
        displayName,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}
