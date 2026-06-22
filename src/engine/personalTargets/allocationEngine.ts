// ============================================================
// Personal Targets Allocation Engine — PT-1
//
// Pure functions only. No Firestore. No React. No side-effects.
// Testable in complete isolation.
//
// Responsibility:
//   1. Derive the set of allocatable KPI keys from the live registry
//   2. Equal-split branch targets across pharmacists (rounding-safe)
//   3. Validate custom allocation: sum must equal branch target exactly
//   4. Calculate personal achievement percentage
//
// Non-goals (deferred to future phases):
//   - Ranking, evaluation, coaching, performance scoring
//   - Territory enforcement
//   - Supervisor / regional allocation
// ============================================================

import { getTargetInputConfigs } from '../kpiRegistry/kpiUiAdapter'
import type { KpiRegistry } from '../kpiRegistry'

// ── Types ─────────────────────────────────────────────────────

/** One pharmacist's personal target allocation for a month */
export interface PersonalAllocation {
  userId:     string
  pharmacyId: string
  month:      string
  /** Keyed by targetFieldName (e.g. 'wasfatyTarget'), value is the numeric target */
  targets:    Record<string, number>
  allocationMethod: 'equal' | 'custom'
}

/** Branch-level targets for a month (from the `targets` collection) */
export type BranchTargets = Record<string, number>

/** Validation result for a custom allocation */
export interface AllocationValidationResult {
  valid:    boolean
  /** Per-KPI field errors: { wasfatyTarget: 'Sum 299900 ≠ branch target 300000' } */
  errors:   Record<string, string>
  /** Aggregate error across all fields */
  message?: string
}

// ── Helper: get allocatable KPI target field names ────────────

/**
 * Returns all targetFieldNames that are active and target-enabled
 * in the live registry. Dynamic — new KPIs appear automatically.
 *
 * Uses getTargetInputConfigs which already handles:
 *   - aliasFor resolution (omnihealth → omniTarget)
 *   - TARGET_FIELD_MAP overrides (crossSelling → crossSellTarget)
 *   - isTargetInputEnabled filtering
 */
export function getAllocatableTargetFields(registry: KpiRegistry): string[] {
  return getTargetInputConfigs(registry).map((c) => c.targetFieldName)
}

// ── Equal split ───────────────────────────────────────────────

/**
 * Splits branch targets equally across N pharmacists.
 *
 * Rounding safety: integer remainders are distributed one unit at a time
 * to the first N pharmacists. This guarantees:
 *   sum(personalTargets[field]) === branchTargets[field]
 * for every KPI field, regardless of rounding.
 *
 * Fractional (non-integer) branch targets (e.g. percentage KPIs) are
 * divided and rounded to 2 decimal places; the remainder is carried
 * forward to the last pharmacist using a running-sum approach.
 *
 * @param branchTargets  - { wasfatyTarget: 300000, omniTarget: 1500, ... }
 * @param userIds        - Ordered list of pharmacist UIDs to split across
 * @param pharmacyId     - Branch ID (written to each allocation doc)
 * @param month          - 'yyyy-MM'
 * @param registry       - Live KPI registry (determines which fields to split)
 */
export function allocateEqual(
  branchTargets: BranchTargets,
  userIds:       string[],
  pharmacyId:    string,
  month:         string,
  registry:      KpiRegistry,
): PersonalAllocation[] {
  if (userIds.length === 0) return []

  const fields    = getAllocatableTargetFields(registry)
  const n         = userIds.length
  const allocations: PersonalAllocation[] = userIds.map((uid) => ({
    userId:           uid,
    pharmacyId,
    month,
    targets:          {},
    allocationMethod: 'equal',
  }))

  for (const field of fields) {
    const total = branchTargets[field] ?? 0
    if (total <= 0) {
      // Zero target: distribute zero to all
      allocations.forEach((a) => { a.targets[field] = 0 })
      continue
    }

    const isWholeNumber = Number.isInteger(total)
    if (isWholeNumber) {
      // Integer split: base + distribute remainder one unit at a time
      const base      = Math.floor(total / n)
      const remainder = total - base * n
      allocations.forEach((a, i) => {
        a.targets[field] = base + (i < remainder ? 1 : 0)
      })
    } else {
      // Fractional split: running-sum to avoid floating-point drift
      const base = Math.round((total / n) * 100) / 100
      let distributed = 0
      allocations.forEach((a, i) => {
        if (i < n - 1) {
          a.targets[field] = base
          distributed     += base
        } else {
          // Last pharmacist absorbs rounding residual
          a.targets[field] = Math.round((total - distributed) * 100) / 100
        }
      })
    }
  }

  return allocations
}

// ── Custom allocation ─────────────────────────────────────────

/**
 * Builds personal allocations from a manager-supplied custom
 * allocation table. The caller provides per-user, per-field values.
 * No sum enforcement here — call validateCustomAllocation() first.
 *
 * @param customValues - { userId: { wasfatyTarget: 120000, ... } }
 */
export function allocateCustom(
  customValues:  Record<string, Record<string, number>>,
  pharmacyId:    string,
  month:         string,
): PersonalAllocation[] {
  return Object.entries(customValues).map(([userId, targets]) => ({
    userId,
    pharmacyId,
    month,
    targets: Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
    ),
    allocationMethod: 'custom',
  }))
}

// ── Validation ────────────────────────────────────────────────

/**
 * Validates that the sum of custom per-user targets equals the
 * branch target for every KPI field.
 *
 * Returns valid=true only when ALL fields balance exactly.
 * Returns per-field error messages for UI inline display.
 */
export function validateCustomAllocation(
  allocations:   PersonalAllocation[],
  branchTargets: BranchTargets,
  registry:      KpiRegistry,
): AllocationValidationResult {
  const fields = getAllocatableTargetFields(registry)
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const branchTotal = branchTargets[field] ?? 0
    const allocTotal  = allocations.reduce((s, a) => s + (a.targets[field] ?? 0), 0)

    // Use a small epsilon for floating-point equality on fractional targets
    const delta = Math.abs(allocTotal - branchTotal)
    if (delta > 0.01) {
      errors[field] = `Sum ${allocTotal} ≠ branch target ${branchTotal}`
    }
  }

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    message: valid
      ? undefined
      : 'Personal targets must sum to the branch target for each KPI',
  }
}

// ── Achievement calculation ───────────────────────────────────

/**
 * Calculate personal achievement percentage for one KPI.
 *
 * Pure function. No ranking. No evaluation. No scoring.
 * Returns null when the personal target is zero or undefined
 * (cannot compute a meaningful percentage).
 *
 * @param personalTarget  - The pharmacist's allocated target for this KPI
 * @param actualValue     - Their actual performance value (from kpi_entries)
 * @returns Achievement percentage (0–∞, rounded to 1dp), or null
 */
export function calculatePersonalAchievement(
  personalTarget: number,
  actualValue:    number,
): number | null {
  if (!personalTarget || personalTarget <= 0) return null
  const pct = (actualValue / personalTarget) * 100
  return Math.round(pct * 10) / 10
}

/**
 * Calculate achievement for all KPI fields in a personal allocation.
 * Returns a map of { targetFieldName → achievementPct | null }.
 *
 * @param personalTargets  - { wasfatyTarget: 100000, ... }
 * @param actualValues     - { wasfaty: 87500, ... } (engine keys)
 * @param registry         - Live registry for field→engine key resolution
 */
export function calculateAllPersonalAchievements(
  personalTargets: Record<string, number>,
  actualValues:    Record<string, number>,
  registry:        KpiRegistry,
): Record<string, number | null> {
  const configs = getTargetInputConfigs(registry)
  const result: Record<string, number | null> = {}

  for (const cfg of configs) {
    const target = personalTargets[cfg.targetFieldName] ?? 0
    const actual = actualValues[cfg.engineKey] ?? 0
    result[cfg.targetFieldName] = calculatePersonalAchievement(target, actual)
  }

  return result
}
