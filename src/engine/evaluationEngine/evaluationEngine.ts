// ============================================================
// Evaluation Engine — ER-2A
//
// CONSTRAINTS — enforced by architecture review:
//   ✗ No React
//   ✗ No Firestore
//   ✗ No Zustand
//   ✗ No side effects
//   ✗ No KPI_KEYS import
//   ✗ No KPI_WEIGHTS import
//   ✓ Pure functions only
//   ✓ Input in → Result out
//
// Weights come exclusively from profile.baskets[].weight
// and profile.baskets[].elements[].weight.
//
// KPI resolution uses existing registry utilities:
//   kpi.aliasFor ?? kpi.key         (actual value lookup)
//   getTargetFieldName(kpiKey)       (target value lookup)
//
// Non-goals for ER-2A:
//   No ranking. No coaching. No percentiles. No batch.
// ============================================================

import { getTargetFieldName } from '../kpiRegistry/kpiUiAdapter'
import type { ThresholdRule, ThresholdBand, EvaluationBasket }
  from '../evaluationRegistry/evaluationRegistryTypes'
import type {
  EvaluationEngineInput,
  ElementResult, BasketResult, EvaluationResult,
  CalculationTrace, TargetSource, CappedKpiTrace,
} from './evaluationEngineTypes'

// ── Threshold band matching ────────────────────────────────────

/**
 * Resolve the threshold band for a given achievement percentage.
 *
 * The last band is treated as open-ended (no upper bound check),
 * regardless of its `max` value. This handles both sentinel values
 * (max=999) and any other configuration.
 *
 * Boundary rule: band.min ≤ achievementPct < band.max
 * Special case:  the last band uses band.min ≤ achievementPct (open-ended)
 *
 * If no bands are defined, returns a safe fallback band.
 */
export function matchThresholdBand(
  achievementPct: number,
  rule:           ThresholdRule,
): ThresholdBand {
  const bands = rule.bands
  if (!bands || bands.length === 0) {
    return { min: 0, max: 999, label: 'Unknown', score: 0 }
  }

  // Sort ascending by min to ensure correct matching order
  const sorted = [...bands].sort((a, b) => a.min - b.min)

  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i]
    const isLast = i === sorted.length - 1

    if (isLast) {
      // Last band is open-ended — matches anything at or above its min
      if (achievementPct >= band.min) return band
    } else {
      // Standard: min (inclusive) to max (exclusive)
      if (achievementPct >= band.min && achievementPct < band.max) return band
    }
  }

  // Fallback: return the lowest band for values below the first band's min
  return sorted[0]
}

// ── Target resolution ─────────────────────────────────────────

/**
 * Resolve the effective target for a single KPI key.
 * Priority: personalTarget field → branchTarget field → 0.
 * Returns the value AND the source for traceability.
 */
function resolveTarget(
  kpiKey:         string,
  personalTarget: EvaluationEngineInput['personalTarget'],
  branchTarget:   EvaluationEngineInput['branchTarget'],
): { value: number; source: TargetSource } {
  const targetFieldName = getTargetFieldName(kpiKey)

  // Personal target — only use published targets (caller responsibility)
  if (personalTarget?.targets) {
    const personal = personalTarget.targets[targetFieldName]
    if (personal != null) {
      return { value: personal, source: 'personal' }
    }
  }

  // Branch target fallback
  if (branchTarget) {
    const branch = (branchTarget as Record<string, unknown>)[targetFieldName]
    if (typeof branch === 'number' && branch != null) {
      return { value: branch, source: 'branch' }
    }
  }

  return { value: 0, source: 'none' }
}

// ── Element scoring ───────────────────────────────────────────

/**
 * Score a single BasketElement.
 *
 * Actual value resolution:
 *   kpiKey → registry[kpiKey] → aliasFor ?? key → kpiActuals[engineKey]
 *
 * Achievement:
 *   actual / target × 100   (0 when target = 0)
 *
 * Achievement cap (profile-configurable, Phase 1):
 *   cappedAchievementPct = min(achievementPct, achievementCapPct) when cap is set.
 *   Raw achievementPct preserved in ElementResult for reporting.
 *   Band matching uses cappedAchievementPct.
 *
 * Threshold application:
 *   element has optional thresholdOverride; otherwise inherits basket rule.
 */
function scoreElement(
  kpiKey:            string,
  weight:            number,
  required:          boolean,
  thresholdRule:     ThresholdRule,
  input:             EvaluationEngineInput,
  missingKpis:       string[],
  achievementCapPct: number | null | undefined,
  cappedKpis:        CappedKpiTrace[],
): ElementResult {
  const registry = input.registry
  const kpi      = registry[kpiKey]

  // Resolve engine key (handles aliasFor)
  const engineKey = kpi?.aliasFor ?? kpi?.key ?? kpiKey
  const label     = kpi?.label ?? kpiKey

  // Actual value
  const rawActual   = input.kpiActuals[engineKey]
  const dataAvailable = rawActual != null && isFinite(rawActual)
  const actual        = dataAvailable ? rawActual : 0

  if (!dataAvailable) {
    missingKpis.push(engineKey)
  }

  // Target
  const { value: target, source: targetSource } = resolveTarget(
    kpiKey, input.personalTarget, input.branchTarget,
  )

  // Raw achievement — always preserved for reporting
  const achievementPct = target > 0 ? (actual / target) * 100 : 0

  // Apply cap if configured
  const capActive = typeof achievementCapPct === 'number' && achievementCapPct > 0
  const cappedAchievementPct = capActive
    ? Math.min(achievementPct, achievementCapPct!)
    : achievementPct
  const capApplied = capActive && cappedAchievementPct < achievementPct

  // Record cap trace when cap was actually applied (raw exceeded cap)
  if (capApplied) {
    cappedKpis.push({
      kpiKey,
      engineKey,
      actualAchievementPct:  achievementPct,
      cappedAchievementPct,
      capPct:                achievementCapPct!,
      source:                'element',   // caller overrides to 'basket' if needed
    })
  }

  // Threshold band — applied to capped achievement
  const band = matchThresholdBand(cappedAchievementPct, thresholdRule)

  return {
    kpiKey,
    engineKey,
    label,
    weight,
    actual,
    target,
    targetSource,
    achievementPct,          // RAW — never modified
    cappedAchievementPct,    // after cap; equals achievementPct when no cap
    capApplied,
    capPct: capActive ? achievementCapPct! : null,
    bandLabel:     band.label,
    bandLabelAr:   band.labelAr,
    bandScore:     band.score,
    bandColor:     band.color,
    weightedScore: band.score * weight,
    required,
    dataAvailable,
  }
}

// ── Basket scoring ────────────────────────────────────────────

function scoreBasket(
  basket:      EvaluationBasket,
  input:       EvaluationEngineInput,
  missingKpis: string[],
  cappedKpis:  CappedKpiTrace[],
): BasketResult {
  const elementResults: ElementResult[] = basket.elements.map((el) => {
    // Cap precedence: element-level > basket-level > none
    // Resolve before calling so scoreElement knows the source
    const elementHasCap = typeof el.achievementCapPct === 'number' && el.achievementCapPct > 0
    const basketHasCap  = typeof basket.achievementCapPct === 'number' && basket.achievementCapPct > 0

    let resolvedCap: number | null | undefined
    let capSource: 'element' | 'basket' = 'element'

    if (elementHasCap) {
      resolvedCap = el.achievementCapPct
      capSource   = 'element'
    } else if (basketHasCap) {
      resolvedCap = basket.achievementCapPct
      capSource   = 'basket'
    }

    const result = scoreElement(
      el.kpiKey,
      el.weight,
      el.required,
      el.thresholdOverride ?? basket.thresholdRule,
      input,
      missingKpis,
      resolvedCap,
      cappedKpis,
    )

    // If basket-level cap was used, update the trace source from the element's default 'element'
    if (result.capApplied && capSource === 'basket') {
      const traceEntry = cappedKpis[cappedKpis.length - 1]
      if (traceEntry && traceEntry.kpiKey === el.kpiKey) {
        traceEntry.source = 'basket'
      }
    }

    return result
  })

  // Aggregate uses cappedAchievementPct (not raw achievementPct)
  const aggregateAchievementPct = elementResults.reduce(
    (sum, el) => sum + el.cappedAchievementPct * el.weight,
    0,
  )

  // Apply basket-level threshold rule to the aggregate achievement
  const band = matchThresholdBand(aggregateAchievementPct, basket.thresholdRule)

  // Validity: any required element with no data → basket invalid
  const invalidElement = elementResults.find((el) => el.required && !el.dataAvailable)
  const isValid        = !invalidElement
  const invalidReason  = invalidElement
    ? `Required KPI "${invalidElement.kpiKey}" has no data`
    : undefined

  return {
    basketId:   basket.id,
    basketName: basket.name,
    weight:     basket.weight,
    elements:   elementResults,
    aggregateAchievementPct,
    bandLabel:    band.label,
    bandLabelAr:  band.labelAr,
    bandScore:    band.score,
    bandColor:    band.color,
    weightedScore: band.score * basket.weight,
    isValid,
    invalidReason,
  }
}

// ── Main engine ───────────────────────────────────────────────

/**
 * Run an evaluation for a single pharmacist+month against a published profile.
 *
 * Pure function — no Firestore, no React, no side effects.
 * Safe for Cloud Functions migration.
 *
 * The caller is responsible for:
 *   - Fetching the published EvaluationProfile
 *   - Summing kpi_entries into kpiActuals
 *   - Fetching the published PersonalTargetDoc
 *   - Fetching the MonthlyTarget (branch)
 *   - Providing the live KpiRegistry
 */
export function runEvaluation(input: EvaluationEngineInput): EvaluationResult {
  const { profile, userId, pharmacyId, role, month } = input
  const missingKpis:  string[]          = []
  const cappedKpis:   CappedKpiTrace[]  = []
  const startMs = Date.now()

  // Score each active basket in declared order
  const activeBaskets = (profile.basketIds || [])
    .map((id) => profile.baskets?.[id])
    .filter((b): b is EvaluationBasket => !!b && b.active !== false)

  const basketResults = activeBaskets.map((basket) =>
    scoreBasket(basket, input, missingKpis, cappedKpis)
  )

  // Final score = Σ basket.weightedScore
  const finalScore = basketResults.reduce((sum, b) => sum + b.weightedScore, 0)

  // ── Rating via normalized final score ──────────────────────
  //
  // finalScore domain:     1.0 – 5.0  (weighted sum of basket band scores 1–5)
  // defaultThresholdRule:  0 – 999%   (achievement percentage bands)
  // These are incompatible units — finalScore MUST be normalized first.
  //
  // normalizedFinalScorePct = (finalScore - minScore) / (maxScore - minScore) × 100
  //
  // minScore = Σ (min band score in basket threshold × basket.weight)
  // maxScore = Σ (max band score in basket threshold × basket.weight)
  //
  // Clamped to [0, 100] to guard against edge cases (no bands defined, etc.)
  const minScore = activeBaskets.reduce((sum, b) => {
    const scores = b.thresholdRule?.bands?.map((bd) => bd.score) ?? [1]
    return sum + Math.min(...scores) * b.weight
  }, 0)

  const maxScore = activeBaskets.reduce((sum, b) => {
    const scores = b.thresholdRule?.bands?.map((bd) => bd.score) ?? [5]
    return sum + Math.max(...scores) * b.weight
  }, 0)

  const scoreRange = maxScore - minScore
  const normalizedFinalScorePct = scoreRange > 0
    ? Math.max(0, Math.min(100, ((finalScore - minScore) / scoreRange) * 100))
    : 0

  const defaultRule = profile.defaultThresholdRule
  const ratingBand  = defaultRule
    ? matchThresholdBand(normalizedFinalScorePct, defaultRule)
    : { label: 'Unknown', score: 0, min: 0, max: 999 }

  // Determine overall status
  const hasInvalidBasket = basketResults.some((b) => !b.isValid)
  const hasMissingOptional = missingKpis.length > 0 && !hasInvalidBasket
  const status = hasInvalidBasket
    ? 'invalid'
    : hasMissingOptional
      ? 'partial'
      : 'complete'

  const trace: CalculationTrace = {
    personalTargetUsed: !!input.personalTarget,
    missingKpis:        [...new Set(missingKpis)],  // deduplicate
    cappedKpis,                                      // structured cap records (empty when no caps)
    profileSnapshotId:  profile.id,
    profileVersion:     profile.version,
    calculatedAtMs:     startMs,
    normalizedFinalScorePct,
  }

  return {
    userId,
    pharmacyId,
    role,
    month,
    profileId:      profile.id,
    profileVersion: profile.version,
    basketResults,
    finalScore,
    rating:       ratingBand.label,
    ratingAr:     (ratingBand as { labelAr?: string }).labelAr,
    ratingScore:  ratingBand.score,
    ratingColor:  (ratingBand as { color?: string }).color,
    status,
    trace,
  }
}
