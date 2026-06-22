// ============================================================
// Branch Classification Resolver — RF-0
//
// CONSTRAINTS — enforced by architecture review:
//   ✗ No Firestore
//   ✗ No React
//   ✗ No Zustand
//   ✗ No side effects
//   ✓ Pure functions only
//   ✓ Input in → Result out
//   ✓ Deterministic: same inputs always produce same output
//
// The caller is responsible for:
//   - Loading the pharmacy document (including classificationHistory)
//   - Providing both current pointer and history array
//
// Resolution priority:
//   1. If month given → search classificationHistory for that month
//   2. If month given but no history match → fall back to current pointer
//   3. If no month given → return current pointer
//   4. If no current pointer → UNCLASSIFIED_ID
// ============================================================

import { UNCLASSIFIED_ID } from './constants'
import type {
  PharmacyForResolution,
  ClassificationResolution,
  ClassificationHistoryEntry,
} from './types'

// ── Month format validation ───────────────────────────────────

/**
 * Validate that a month string is in YYYY-MM format.
 * Rejects malformed strings before they propagate into ranking keys.
 */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

// ── History resolution ────────────────────────────────────────

/**
 * Find the history entry that covers a given month.
 *
 * A history entry covers month M when:
 *   effectiveFrom <= M  AND  (effectiveTo is null OR effectiveTo >= M)
 *
 * If multiple entries match (should not happen with correct writes, but
 * handled defensively), the one with the latest effectiveFrom wins.
 *
 * @returns the matching history entry, or null if none found.
 */
export function findHistoryEntryForMonth(
  history: ClassificationHistoryEntry[],
  month:   string,
): ClassificationHistoryEntry | null {
  if (!history || history.length === 0) return null
  if (!isValidMonth(month)) return null

  const candidates = history.filter((entry) => {
    if (!entry.effectiveFrom || !isValidMonth(entry.effectiveFrom)) return false
    if (entry.effectiveFrom > month) return false
    if (entry.effectiveTo !== null && entry.effectiveTo !== undefined) {
      if (!isValidMonth(entry.effectiveTo)) return false
      if (entry.effectiveTo < month) return false
    }
    return true
  })

  if (candidates.length === 0) return null

  // Latest effectiveFrom wins on conflict (defensive — shouldn't happen in practice)
  return candidates.reduce((best, curr) =>
    curr.effectiveFrom > best.effectiveFrom ? curr : best
  )
}

// ── Main resolver ─────────────────────────────────────────────

/**
 * Resolve the effective branch classification for a pharmacy.
 *
 * When `month` is provided:
 *   Searches classificationHistory for a record covering that month.
 *   Falls back to the current pointer if history has no matching entry.
 *   This makes monthly evaluations reproducible — they use the classification
 *   that was in effect THAT month, not today's value.
 *
 * When `month` is not provided:
 *   Returns the current branchClassification pointer directly.
 *   Used for UI display, real-time dashboards, etc.
 *
 * Never throws. Returns UNCLASSIFIED_ID on any edge case.
 *
 * @param pharmacy  Pharmacy document with optional classificationHistory
 * @param month     Optional 'YYYY-MM' month to resolve historically
 */
export function resolveBranchClassification(
  pharmacy: PharmacyForResolution,
  month?:   string,
): ClassificationResolution {
  // Guard: invalid month string → treat as "current"
  if (month !== undefined && !isValidMonth(month)) {
    return {
      classificationId: pharmacy.branchClassification ?? UNCLASSIFIED_ID,
      source:           'current',
      month:            null,
    }
  }

  // No month requested → return current pointer
  if (month === undefined) {
    return {
      classificationId: pharmacy.branchClassification ?? UNCLASSIFIED_ID,
      source:           'current',
      month:            null,
    }
  }

  // Month requested → try history first
  const history = pharmacy.classificationHistory ?? []
  const historyEntry = findHistoryEntryForMonth(history, month)

  if (historyEntry) {
    return {
      classificationId: historyEntry.classificationId,
      source:           'history',
      month,
    }
  }

  // No history match → fall back to current pointer
  const current = pharmacy.branchClassification
  if (current !== null && current !== undefined) {
    return {
      classificationId: current,
      source:           'current',
      month,
    }
  }

  // No pointer at all → sentinel fallback
  return {
    classificationId: UNCLASSIFIED_ID,
    source:           'fallback',
    month,
  }
}

// ── Batch resolver ────────────────────────────────────────────

/**
 * Resolve classifications for multiple pharmacies at once.
 * Returns a Map<pharmacyId, ClassificationResolution> for O(1) lookup.
 *
 * Used by the Ranking Engine to build peer groups efficiently.
 */
export function resolveClassificationsForPharmacies(
  pharmacies: PharmacyForResolution[],
  month?:     string,
): Map<string, ClassificationResolution> {
  const result = new Map<string, ClassificationResolution>()
  for (const pharmacy of pharmacies) {
    result.set(pharmacy.id, resolveBranchClassification(pharmacy, month))
  }
  return result
}

// ── Classification equality ───────────────────────────────────

/**
 * Returns true if two pharmacies are in the same classification peer group
 * for the given month. Used by the Ranking Engine for grouping.
 *
 * @pure
 */
export function areSamePeerGroup(
  a:     PharmacyForResolution,
  b:     PharmacyForResolution,
  month?: string,
): boolean {
  const aClass = resolveBranchClassification(a, month).classificationId
  const bClass = resolveBranchClassification(b, month).classificationId
  return aClass === bClass
}
