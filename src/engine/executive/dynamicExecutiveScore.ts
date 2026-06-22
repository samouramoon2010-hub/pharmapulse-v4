// ============================================================
// Dynamic Executive Score — Shadow Mode Engine
// Phase 4C-X-1
//
// DORMANT / UNWIRED (Core KPI Dependency Removal — Phase 4 audit):
// Verified zero production page/component/hook/service importers —
// only dynamicExecutiveDataPath.ts (itself unwired) and this module's
// own test file consume it. Retained as dormant legacy code. Do not
// activate.
//
// SHADOW MODE: This engine runs in parallel with the existing
// executiveScore.ts and is used ONLY for parity testing.
// Nothing user-facing uses this module yet.
//
// Purpose:
//   Prove that the Dynamic Executive Score (consuming normalized
//   metrics from dynamicExecutiveAdapter) produces identical
//   results to the legacy computeExecutiveScore for all
//   5-core-KPI scenarios.
//
// Formula (identical to legacy computeOverallAchievement):
//   1. For each KPI with a valid target (target > 0):
//      cappedAch = min(200, achievementPct)
//      weightedSum += weight * cappedAch
//      totalWeight += weight
//   2. overall = round(weightedSum / totalWeight)
//   3. adjusted = clamp(0, 100, overall + adjustments)
//   4. grade = scoreToGrade(adjusted)
//
// Deferred:
//   - LOWER_IS_BETTER polarity inversion
//   - RATIO aggregationType normalization
//   - AVG vs SUM distinction in portfolio scoring
//   - Custom KPI weight extension
//   All of the above are future Phase 4C-X-2 work.
// ============================================================

import { GRADE_THRESHOLDS, type ExecutiveGrade } from './executiveTypes'
import { ACHIEVEMENT_CAP } from '../kpiAnalyticsEngine'
import type { NormalizedBranchMetrics, NormalizedMetricRecord } from './dynamicExecutiveAdapter'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — OUTPUT TYPES
// ══════════════════════════════════════════════════════════════

/** Per-KPI breakdown entry in the dynamic score */
export interface DynamicKpiBreakdown {
  key:             string
  label:           string
  actual:          number | null
  target:          number | null
  achievementPct:  number | null
  cappedAch:       number       // min(200, achievementPct) when valid
  portfolioWeight: number
  weightedScore:   number       // cappedAch * portfolioWeight
  included:        boolean      // false when KPI excluded from denominator
  exclusionReason: string | null
}

/** Full dynamic executive score result */
export interface DynamicExecutiveScore {
  /** Raw weighted-average achievement % (matches legacy 'overall') */
  overall:         number
  /** Letter grade */
  grade:           ExecutiveGrade
  /** Score after adjustments (matches legacy 'adjusted') */
  adjusted:        number
  /** Weighted sum before normalization */
  weightedSum:     number
  /** Sum of included portfolio weights */
  totalWeight:     number
  /** Per-KPI breakdown */
  kpiBreakdown:    DynamicKpiBreakdown[]
  /** Adjustments (passed through from caller — not re-computed here) */
  adjustments: {
    submissionRate: number
    consistency:    number
    trend:          number
  }
}

/** Comparison result between legacy and dynamic scores */
export interface ScoreComparisonResult {
  isMatch:          boolean
  delta:            number       // dynamicScore.overall - legacyScore.overall
  percentageDelta:  number       // |delta| / legacyScore.overall * 100
  overallMatch:     boolean
  adjustedMatch:    boolean
  gradeMatch:       boolean
  differences:      ScoreDifference[]
}

export interface ScoreDifference {
  field:    string
  legacy:   number | string
  dynamic:  number | string
  delta:    number | string
}

/** Shadow report for a single branch */
export interface BranchShadowReport {
  branchId:      string
  branchName:    string
  legacyScore:   number
  dynamicScore:  number
  legacyGrade:   string
  dynamicGrade:  string
  delta:         number
  match:         boolean
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — GRADE HELPER (shared formula)
// ══════════════════════════════════════════════════════════════

/** Mirror of legacy scoreToGrade — uses the same GRADE_THRESHOLDS */
export function scoreToGradeDynamic(score: number): ExecutiveGrade {
  if (score >= GRADE_THRESHOLDS.A) return 'A'
  if (score >= GRADE_THRESHOLDS.B) return 'B'
  if (score >= GRADE_THRESHOLDS.C) return 'C'
  if (score >= GRADE_THRESHOLDS.D) return 'D'
  return 'F'
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — CORE SCORING ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Compute the dynamic executive score from a normalized metrics map.
 *
 * Exactly mirrors computeOverallAchievement from kpiAnalyticsEngine:
 *   - Excludes KPIs with null/zero target
 *   - Excludes KPIs with null achievementPct (null = no data)
 *   - Caps achievement at ACHIEVEMENT_CAP (200%)
 *   - Weights: from NormalizedMetricRecord.portfolioWeight
 *   - NOT_AGGREGATED KPIs: always excluded
 *
 * @param metrics     - Normalized metrics map from dynamicExecutiveAdapter
 * @param adjustments - Pre-computed adjustments (submissionRate, consistency, trend)
 */
export function computeDynamicExecutiveScore(
  metrics:     Record<string, NormalizedMetricRecord>,
  adjustments: { submissionRate: number; consistency: number; trend: number } = {
    submissionRate: 0, consistency: 0, trend: 0,
  },
): DynamicExecutiveScore {
  let weightedSum  = 0
  let totalWeight  = 0

  const kpiBreakdown: DynamicKpiBreakdown[] = []

  for (const [key, m] of Object.entries(metrics)) {
    // NOT_AGGREGATED: always excluded — never contributes to score
    if (m.aggregationType === 'NOT_AGGREGATED') {
      kpiBreakdown.push({
        key, label: key,
        actual:          null,
        target:          null,
        achievementPct:  null,
        cappedAch:       0,
        portfolioWeight: m.portfolioWeight,
        weightedScore:   0,
        included:        false,
        exclusionReason: 'NOT_AGGREGATED',
      })
      continue
    }

    // No target → exclude (mirrors legacy: if (!stat.target || stat.target <= 0))
    if (m.target === null || m.target === 0) {
      kpiBreakdown.push({
        key, label: key,
        actual:          m.actual,
        target:          m.target,
        achievementPct:  null,
        cappedAch:       0,
        portfolioWeight: m.portfolioWeight,
        weightedScore:   0,
        included:        false,
        exclusionReason: 'no valid target',
      })
      continue
    }

    // No actual data → exclude
    if (m.achievementPct === null) {
      kpiBreakdown.push({
        key, label: key,
        actual:          m.actual,
        target:          m.target,
        achievementPct:  null,
        cappedAch:       0,
        portfolioWeight: m.portfolioWeight,
        weightedScore:   0,
        included:        false,
        exclusionReason: 'null achievement',
      })
      continue
    }

    // Cap achievement (mirrors legacy ACHIEVEMENT_CAP = 200)
    const raw      = m.achievementPct
    const cappedAch = Math.min(
      isNaN(raw) || !isFinite(raw) ? 0 : raw,
      ACHIEVEMENT_CAP,
    )
    const w            = m.portfolioWeight
    const weightedScore = cappedAch * w

    weightedSum += weightedScore
    totalWeight += w

    kpiBreakdown.push({
      key, label: key,
      actual:          m.actual,
      target:          m.target,
      achievementPct:  raw,
      cappedAch,
      portfolioWeight: w,
      weightedScore,
      included:        true,
      exclusionReason: null,
    })
  }

  // Normalize — mirrors: Math.round(weightedSum / totalWeight)
  const rawOverall = totalWeight > 0 ? weightedSum / totalWeight : 0
  const overall    = isNaN(rawOverall) || !isFinite(rawOverall)
    ? 0
    : Math.round(rawOverall)

  // Apply adjustments — mirrors: clamp(0, 100, overall + sub + con + trend)
  const { submissionRate, consistency, trend } = adjustments
  const adjusted = Math.min(100, Math.max(0, overall + submissionRate + consistency + trend))

  return {
    overall,
    grade:        scoreToGradeDynamic(adjusted),
    adjusted,
    weightedSum,
    totalWeight,
    kpiBreakdown,
    adjustments,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — SHADOW COMPARISON UTILITY
// ══════════════════════════════════════════════════════════════

const TOLERANCE = 0.01   // ±0.01 acceptable delta

/**
 * Compare a legacy executive score against the dynamic shadow score.
 *
 * @param legacyOverall   - Legacy computeExecutiveScore().overall
 * @param legacyAdjusted  - Legacy computeExecutiveScore().adjusted
 * @param legacyGrade     - Legacy computeExecutiveScore().grade
 * @param dynamic         - DynamicExecutiveScore result
 */
export function compareExecutiveScores(
  legacyOverall:   number,
  legacyAdjusted:  number,
  legacyGrade:     string,
  dynamic:         DynamicExecutiveScore,
): ScoreComparisonResult {
  const delta            = dynamic.overall - legacyOverall
  const absDelta         = Math.abs(delta)
  const percentageDelta  = legacyOverall !== 0
    ? (absDelta / legacyOverall) * 100
    : absDelta > 0 ? Infinity : 0

  const overallMatch  = absDelta <= TOLERANCE
  const adjustedMatch = Math.abs(dynamic.adjusted - legacyAdjusted) <= TOLERANCE
  const gradeMatch    = dynamic.grade === legacyGrade

  const differences: ScoreDifference[] = []

  if (!overallMatch) {
    differences.push({
      field:   'overall',
      legacy:  legacyOverall,
      dynamic: dynamic.overall,
      delta:   dynamic.overall - legacyOverall,
    })
  }
  if (!adjustedMatch) {
    differences.push({
      field:   'adjusted',
      legacy:  legacyAdjusted,
      dynamic: dynamic.adjusted,
      delta:   dynamic.adjusted - legacyAdjusted,
    })
  }
  if (!gradeMatch) {
    differences.push({
      field:   'grade',
      legacy:  legacyGrade,
      dynamic: dynamic.grade,
      delta:   `${legacyGrade}→${dynamic.grade}`,
    })
  }

  return {
    isMatch:         overallMatch && adjustedMatch && gradeMatch,
    delta,
    percentageDelta,
    overallMatch,
    adjustedMatch,
    gradeMatch,
    differences,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — SHADOW REPORT
// ══════════════════════════════════════════════════════════════

/**
 * Build a shadow score report for a single branch.
 * For testing and debugging only — no UI integration.
 *
 * @param branchMetrics  - Normalized branch metrics
 * @param legacyOverall  - Legacy overall score
 * @param legacyAdjusted - Legacy adjusted score
 * @param legacyGrade    - Legacy grade
 * @param adjustments    - Adjustments to pass to dynamic engine
 */
export function buildShadowScoreReport(
  branchMetrics:   NormalizedBranchMetrics,
  legacyOverall:   number,
  legacyAdjusted:  number,
  legacyGrade:     string,
  adjustments:     { submissionRate: number; consistency: number; trend: number } = {
    submissionRate: 0, consistency: 0, trend: 0,
  },
): BranchShadowReport & { comparison: ScoreComparisonResult; dynamicDetail: DynamicExecutiveScore } {
  const dynamic    = computeDynamicExecutiveScore(branchMetrics.metrics, adjustments)
  const comparison = compareExecutiveScores(legacyOverall, legacyAdjusted, legacyGrade, dynamic)

  return {
    branchId:     branchMetrics.branchId,
    branchName:   branchMetrics.branchName,
    legacyScore:  legacyOverall,
    dynamicScore: dynamic.overall,
    legacyGrade,
    dynamicGrade: dynamic.grade,
    delta:        comparison.delta,
    match:        comparison.isMatch,
    comparison,
    dynamicDetail: dynamic,
  }
}

/**
 * Build a summary array of shadow reports for multiple branches.
 * For testing — verify parity across an entire portfolio.
 */
export function buildPortfolioShadowReport(
  reports: ReturnType<typeof buildShadowScoreReport>[],
): {
  totalBranches:  number
  matchingCount:  number
  mismatchCount:  number
  allMatch:       boolean
  maxDelta:       number
  avgDelta:       number
  mismatches:     string[]
} {
  const matchingCount = reports.filter((r) => r.match).length
  const mismatchCount = reports.length - matchingCount
  const deltas        = reports.map((r) => Math.abs(r.delta))
  const maxDelta      = deltas.length ? Math.max(...deltas) : 0
  const avgDelta      = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0
  const mismatches    = reports
    .filter((r) => !r.match)
    .map((r) => `${r.branchId}: legacy=${r.legacyScore} dynamic=${r.dynamicScore} delta=${r.delta.toFixed(2)}`)

  return {
    totalBranches:  reports.length,
    matchingCount,
    mismatchCount,
    allMatch:       mismatchCount === 0,
    maxDelta,
    avgDelta,
    mismatches,
  }
}
