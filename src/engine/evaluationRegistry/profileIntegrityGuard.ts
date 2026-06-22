// ============================================================
// Evaluation Registry — Profile Integrity Guard
//
// Final Foundation Closure Bundle — Part 1/2.
//
// Stricter, registry-aware validation than validateEvaluationProfile():
// blocks publish/activation when a Profile references a KPI that does
// not exist or is inactive in the live Registry, has a structurally
// invalid weight, an empty/unreachable basket, a missing threshold
// rule, or a duplicate KPI within the SAME basket.
//
// Cross-basket KPI reuse (the same KPI appearing in two different
// active baskets, both contributing to the same final weighted score)
// is a confirmed, intentional, currently-supported pattern in this
// architecture (see the built-in SMARTS 2026 template and
// er15Hardening.test.ts's "cross-basket is fine" test). This guard
// does NOT block it — it reports it as a visible, auditable warning
// (KPI key, every basket path, the weight each path contributes, and
// the total effective weight share) so admins can see the double
// weighting without it being silently hidden or silently altered.
//
// This module:
//   - Does NOT change any score calculation.
//   - Does NOT change the Profile document schema.
//   - Does NOT silently deduplicate or rewrite weights.
//   - Is additive — called alongside the existing
//     validateEvaluationProfile() structural check, not a replacement.
// ============================================================

import type { EvaluationProfile, EvaluationBasket } from './evaluationRegistryTypes'
import type { KpiRegistry } from '../kpiRegistry'

export type ProfileIntegrityRule =
  | 'UNKNOWN_KPI'
  | 'INACTIVE_KPI'
  | 'DUPLICATE_KPI_SAME_BASKET'
  | 'DUPLICATE_KPI_CROSS_BASKET'
  | 'INVALID_BASKET_WEIGHT'
  | 'INVALID_ELEMENT_WEIGHT'
  | 'MISSING_ELEMENT_KPI_KEY'
  | 'MISSING_THRESHOLD_RULE'
  | 'EMPTY_ACTIVE_BASKET'
  | 'ORPHANED_BASKET_ID'
  | 'UNREACHABLE_ACTIVE_BASKET'

export interface ProfileIntegrityIssue {
  rule:        ProfileIntegrityRule
  basketId?:   string
  basketName?: string
  kpiKey?:     string
  message:     string
}

export interface CrossBasketKpiPath {
  basketId:      string
  basketName:    string
  basketWeight:  number
  elementWeight: number
  /** basketWeight × elementWeight — this path's nominal share of total profile weight */
  weightShare:   number
}

export interface CrossBasketKpiUsage {
  kpiKey:           string
  paths:            CrossBasketKpiPath[]
  /** Sum of weightShare across every basket path — the KPI's total nominal weight share */
  totalWeightShare: number
  message:          string
}

export interface ProfileIntegrityResult {
  valid:               boolean
  errors:              ProfileIntegrityIssue[]
  /** Non-blocking issues, including cross-basket KPI reuse */
  warnings:            ProfileIntegrityIssue[]
  /** Structured detail for every KPI used in more than one active basket */
  crossBasketKpiUsage: CrossBasketKpiUsage[]
}

/**
 * Checks a Profile against the live KPI Registry and basic structural
 * invariants required for safe evaluation. Pure function — does not
 * throw, does not mutate its inputs.
 *
 * Blocking rules (errors, valid=false):
 *   - Element references a KPI not present in the Registry
 *   - Element references an inactive Registry KPI
 *   - Same KPI duplicated within one basket (double weighting)
 *   - Basket or element weight is missing/non-numeric/negative
 *   - Active basket has no elements
 *   - Active basket has no threshold rule with at least one band
 *   - basketIds references a basket id that does not exist
 *   - An active basket exists but is not listed in basketIds (would
 *     silently never be evaluated by the pipeline)
 *
 * Non-blocking (warnings):
 *   - Same KPI used in two or more different active baskets that both
 *     contribute to the same final score. Confirmed intentional,
 *     supported methodology — reported for visibility only.
 */
export function checkProfileIntegrity(
  profile:  Partial<EvaluationProfile>,
  registry: KpiRegistry,
): ProfileIntegrityResult {
  const errors:   ProfileIntegrityIssue[] = []
  const warnings: ProfileIntegrityIssue[] = []

  const basketsMap  = profile.baskets ?? {}
  const basketIds   = profile.basketIds ?? []
  const basketEntries = Object.entries(basketsMap) as [string, EvaluationBasket][]

  // ── Hierarchy: basketIds referencing a basket that does not exist ──
  for (const id of basketIds) {
    if (!basketsMap[id]) {
      errors.push({
        rule: 'ORPHANED_BASKET_ID', basketId: id,
        message: `basketIds references "${id}" but no basket with that id exists in the profile`,
      })
    }
  }

  // ── Hierarchy: active basket not reachable via basketIds ──
  for (const [id, basket] of basketEntries) {
    if (basket.active !== false && !basketIds.includes(id)) {
      errors.push({
        rule: 'UNREACHABLE_ACTIVE_BASKET', basketId: id, basketName: basket.name,
        message: `Basket "${basket.name}" (${id}) is active but is not listed in basketIds — ` +
          `the evaluation pipeline builds its basket list from basketIds, so this basket would silently never be evaluated`,
      })
    }
  }

  const activeBasketEntries = basketEntries.filter(([, b]) => b.active !== false)

  // kpiKey -> every basket path it appears in (across ALL active baskets)
  const usageMap = new Map<string, CrossBasketKpiPath[]>()

  for (const [id, basket] of activeBasketEntries) {
    const elements = basket.elements ?? []

    if (elements.length === 0) {
      errors.push({
        rule: 'EMPTY_ACTIVE_BASKET', basketId: id, basketName: basket.name,
        message: `Basket "${basket.name}" is active but has no elements — it cannot be evaluated safely`,
      })
      continue
    }

    const basketWeightValid = typeof basket.weight === 'number' && isFinite(basket.weight) && basket.weight >= 0
    if (!basketWeightValid) {
      errors.push({
        rule: 'INVALID_BASKET_WEIGHT', basketId: id, basketName: basket.name,
        message: `Basket "${basket.name}" has an invalid weight (${JSON.stringify(basket.weight)}) — must be a non-negative number`,
      })
    }

    if (!basket.thresholdRule || !basket.thresholdRule.bands || basket.thresholdRule.bands.length === 0) {
      errors.push({
        rule: 'MISSING_THRESHOLD_RULE', basketId: id, basketName: basket.name,
        message: `Basket "${basket.name}" has no threshold rule with at least one band defined — it cannot be evaluated safely`,
      })
    }

    const seenInBasket = new Set<string>()
    for (const el of elements) {
      const kpiKey = el?.kpiKey

      if (!kpiKey || typeof kpiKey !== 'string' || !kpiKey.trim()) {
        errors.push({
          rule: 'MISSING_ELEMENT_KPI_KEY', basketId: id, basketName: basket.name,
          message: `Basket "${basket.name}" has an element with no KPI key defined`,
        })
        continue
      }

      const elementWeightValid = typeof el.weight === 'number' && isFinite(el.weight) && el.weight >= 0
      if (!elementWeightValid) {
        errors.push({
          rule: 'INVALID_ELEMENT_WEIGHT', basketId: id, basketName: basket.name, kpiKey,
          message: `Basket "${basket.name}": KPI "${kpiKey}" has an invalid weight (${JSON.stringify(el.weight)}) — must be a non-negative number`,
        })
      }

      if (seenInBasket.has(kpiKey)) {
        errors.push({
          rule: 'DUPLICATE_KPI_SAME_BASKET', basketId: id, basketName: basket.name, kpiKey,
          message: `Basket "${basket.name}" contains KPI "${kpiKey}" more than once — this double-counts its weight within the same basket`,
        })
      }
      seenInBasket.add(kpiKey)

      const kpiDef = registry[kpiKey]
      if (!kpiDef) {
        errors.push({
          rule: 'UNKNOWN_KPI', basketId: id, basketName: basket.name, kpiKey,
          message: `Basket "${basket.name}": KPI "${kpiKey}" does not exist in the active KPI Registry`,
        })
      } else if (kpiDef.isActive === false) {
        errors.push({
          rule: 'INACTIVE_KPI', basketId: id, basketName: basket.name, kpiKey,
          message: `Basket "${basket.name}": KPI "${kpiKey}" (${kpiDef.label}) is inactive in the Registry`,
        })
      }

      const basketWeight  = basketWeightValid  ? (basket.weight as number) : 0
      const elementWeight = elementWeightValid ? el.weight : 0
      const path: CrossBasketKpiPath = {
        basketId: id, basketName: basket.name,
        basketWeight, elementWeight,
        weightShare: basketWeight * elementWeight,
      }
      const list = usageMap.get(kpiKey) ?? []
      list.push(path)
      usageMap.set(kpiKey, list)
    }
  }

  // ── Cross-basket KPI reuse — confirmed intentional, warning only ──
  const crossBasketKpiUsage: CrossBasketKpiUsage[] = []
  for (const [kpiKey, paths] of usageMap.entries()) {
    const distinctBaskets = new Set(paths.map((p) => p.basketId))
    if (distinctBaskets.size <= 1) continue

    const totalWeightShare = paths.reduce((s, p) => s + p.weightShare, 0)
    const pathSummary = paths
      .map((p) => `${p.basketName} (basket weight ${p.basketWeight.toFixed(2)} × element weight ${p.elementWeight.toFixed(2)} = ${p.weightShare.toFixed(3)} share)`)
      .join(', ')
    const message =
      `KPI "${kpiKey}" is used in ${distinctBaskets.size} different active baskets that all contribute to the ` +
      `same final score: ${pathSummary}. Total effective weight share: ${totalWeightShare.toFixed(3)}. ` +
      `This is a supported, intentional reuse pattern in this architecture — not blocked — flagged here for visibility only.`

    crossBasketKpiUsage.push({ kpiKey, paths, totalWeightShare, message })
    warnings.push({ rule: 'DUPLICATE_KPI_CROSS_BASKET', kpiKey, message })
  }

  return {
    valid: errors.length === 0,
    errors, warnings, crossBasketKpiUsage,
  }
}
