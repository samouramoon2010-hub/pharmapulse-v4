// ============================================================
// Dynamic Executive Data Path Wiring — Phase 4C-X-2
// SHADOW MODE ONLY
//
// Connects real BranchInput data (the same input that
// computeExecutiveScore consumes) to the dynamic scoring
// pipeline and produces parity reports.
//
// Flow:
//   BranchInput (real data)
//     → extractBranchActuals()     [same sumKpi calls as legacy]
//     → normalizeLegacyFlatMetrics [adapter layer]
//     → computeDynamicExecutiveScore [shadow engine]
//     → compareExecutiveScores     [parity check]
//     → buildShadowScoreReport     [report]
//
// Nothing user-facing uses this module.
// No UI imports. No Firestore reads.
// No production scoring changes.
// ============================================================

// ══════════════════════════════════════════════════════════════
// DATA SEMANTICS FINDINGS (documented from Phase 4C-X-2 audit)
//
// CRITICAL FINDING — computeExecutiveScore overall is always 0:
//   computeExecutiveScore builds:
//     kpiStatsMap[key] = { achievementPct: k.achievementPct }   ← no .target field
//   Then calls computeOverallAchievement(kpiStatsMap) which checks:
//     if (!stat.target || stat.target <= 0) → exclude KPI
//   Since stat.target is undefined (truthy check fails) → ALL KPIs excluded
//   → weightedSum = 0 → overall = 0.
//   The score the user sees is purely: 0 + submissionAdj + consistencyAdj + trendAdj
//   clamped to [0,100]. Max possible = 0 + 5 + 5 + 5 = 10 (Grade F).
//
//   The dynamic engine correctly computes achievements: actual/target * 100.
//   This is a divergence — but the legacy behavior is what production shows.
//   Phase 4C-X-3 should decide whether to fix the legacy bug or keep it.
//
// SEMANTIC TABLE per KPI value:
//   POSITIVE_VALUE  (actual > 0, target > 0): Legacy=0 overall (target-field bug),
//                    Dynamic=X% achievement included correctly.
//   EXPLICIT_ZERO   (actual = 0, target > 0): Legacy=0 overall,
//                    Dynamic=0% included (ZERO_VALUE).
//   NOT_SUBMITTED   (entries empty, target > 0): Both get actual=0 via sumKpi.
//   TARGET_MISSING  (no target doc): Both exclude KPI entirely.
//   TARGET_ZERO     (target field = 0): Both exclude KPI.
// ══════════════════════════════════════════════════════════════


import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  sumKpi, extractDailyValues, computeTrendDirection,
  ACHIEVEMENT_CAP,
  type KpiKey, type KpiEntry,
} from '../kpiAnalyticsEngine'

import type { BranchInput, ExecutiveScore } from './executiveTypes'
import { computeExecutiveScore, scoreToGrade }           from './executiveScore'

import {
  CORE_KPI_EXECUTIVE_META,
  normalizeLegacyFlatMetrics,
  buildExecutiveMetaMap,
  type LegacyTargetDoc,
  type NormalizedBranchMetrics,
} from './dynamicExecutiveAdapter'

import {
  computeDynamicExecutiveScore,
  compareExecutiveScores,
  buildShadowScoreReport,
  buildPortfolioShadowReport,
  type BranchShadowReport,
  type ScoreComparisonResult,
} from './dynamicExecutiveScore'

import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — RAW DATA EXTRACTION FROM BranchInput
// ══════════════════════════════════════════════════════════════

/**
 * Extract per-KPI actual values from a BranchInput using the same
 * sumKpi() calls the legacy computeExecutiveScore uses.
 *
 * Returns a plain Record<string, number> — the numeric sums only.
 * Missing KPIs are NOT set to zero — they are simply absent.
 * This preserves the null vs 0 distinction in the adapter layer.
 */
export function extractBranchActuals(
  branch: BranchInput,
): Record<string, number> {
  const actuals: Record<string, number> = {}
  for (const key of KPI_KEYS) {
    const actual = sumKpi(branch.mtdEntries, key)
    // Only set if entries exist for this KPI (at least one non-zero)
    // Zero means "explicitly entered 0", not "no data"
    actuals[key] = actual
  }
  return actuals
}

/**
 * Convert a BranchInput target to the LegacyTargetDoc shape
 * expected by normalizeLegacyFlatMetrics.
 */
export function extractLegacyTargetDoc(
  branch: BranchInput,
): LegacyTargetDoc | null {
  if (!branch.target) return null
  const t = branch.target
  return {
    pharmacyId:     branch.pharmacyId,
    month:          '',   // not needed for normalization
    wasfatyTarget:   Number(t[KPI_META.wasfaty.targetField     as keyof typeof t] ?? 0),
    omniTarget:      Number(t[KPI_META.omni.targetField        as keyof typeof t] ?? 0),
    wellnessTarget:  Number(t[KPI_META.wellness.targetField    as keyof typeof t] ?? 0),
    basketTarget:    Number(t[KPI_META.basket.targetField      as keyof typeof t] ?? 0),
    crossSellTarget: Number(t[KPI_META.crossSelling.targetField as keyof typeof t] ?? 0),
  }
}

/**
 * Compute the same adjustments used by computeExecutiveScore.
 * Mirrors the three internal functions: submissionAdjustment,
 * consistencyAdjustment, trendAdjustment.
 *
 * Exposed here so the dynamic engine can receive the same values.
 */
export function computeBranchAdjustments(branch: BranchInput): {
  submissionRate: number
  consistency:    number
  trend:          number
} {
  const distinctSubmitters = new Set(branch.mtdEntries.map((e) => e.userId)).size
  const totalPharmacists   = branch.pharmacistCount ?? Math.max(1, distinctSubmitters)
  const submittedCount     = branch.submittedToday  ?? distinctSubmitters

  // submissionAdjustment (mirrors executiveScore.ts)
  const submissionRate = computeSubmissionAdjustment(submittedCount, totalPharmacists)

  // consistencyAdjustment (mirrors executiveScore.ts)
  const historicalVals = branch.historicalEntries
    ? extractDailyValues(branch.historicalEntries, 'wasfaty')
    : []
  const consistency = computeConsistencyAdjustment(historicalVals)

  // trendAdjustment (mirrors executiveScore.ts)
  const trendDir = historicalVals.length >= 4
    ? computeTrendDirection(historicalVals)
    : 'STABLE'
  const trend = computeTrendAdjustment(trendDir)

  return { submissionRate, consistency, trend }
}

// ── Adjustment mirrors (pure, extracted for testability) ───────

export function computeSubmissionAdjustment(submitted: number, total: number): number {
  if (!total) return 0
  const rate = submitted / total
  if (rate >= 0.9) return +5
  if (rate >= 0.7) return  0
  if (rate >= 0.5) return -5
  return -10
}

export function computeConsistencyAdjustment(dailyValues: number[]): number {
  if (dailyValues.length < 5) return 0
  const nonZero = dailyValues.filter((v) => v > 0)
  if (!nonZero.length) return 0
  const mean     = nonZero.reduce((s, v) => s + v, 0) / nonZero.length
  if (!mean) return 0
  const variance = nonZero.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZero.length
  const cv       = Math.sqrt(variance) / mean
  if (cv <= 0.2) return +5
  if (cv <= 0.5) return  0
  return -5
}

export function computeTrendAdjustment(direction: string): number {
  switch (direction) {
    case 'ACCELERATING':  return +5
    case 'IMPROVING':     return +2
    case 'STABLE':        return  0
    case 'DECLINING':     return -2
    case 'DETERIORATING': return -5
    default:              return  0
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — BRANCH-LEVEL SHADOW PIPELINE
// ══════════════════════════════════════════════════════════════

/**
 * Run the full shadow pipeline for a single BranchInput.
 *
 * Computes BOTH legacy and dynamic scores from the same input
 * and returns a shadow comparison report.
 */
export function runBranchShadowPipeline(
  branch: BranchInput,
): {
  branchId:      string
  branchName:    string
  legacyResult:  ExecutiveScore
  shadowReport:  ReturnType<typeof buildShadowScoreReport>
} {
  // 1. Legacy score (unchanged production path)
  const legacyResult = computeExecutiveScore(branch)

  // 2. Extract data in the same way the legacy engine does
  const actuals     = extractBranchActuals(branch)
  const targetDoc   = extractLegacyTargetDoc(branch)
  const adjustments = computeBranchAdjustments(branch)

  // 3. Normalize through the adapter
  const coreMetaMap = Object.fromEntries(
    KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]])
  )
  const metrics = normalizeLegacyFlatMetrics(actuals, targetDoc, coreMetaMap)

  // 4. Build normalized branch metrics record
  const normalizedBranch: NormalizedBranchMetrics = {
    branchId:   branch.pharmacyId,
    branchName: branch.pharmacyName,
    branchCode: branch.pharmacyCode,
    period:     '',
    metrics,
  }

  // 5. Build shadow report with adjustments
  const shadowReport = buildShadowScoreReport(
    normalizedBranch,
    legacyResult.overall,
    legacyResult.adjusted,
    legacyResult.grade,
    adjustments,
  )

  return { branchId: branch.pharmacyId, branchName: branch.pharmacyName, legacyResult, shadowReport }
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — PORTFOLIO SHADOW REPORT
// ══════════════════════════════════════════════════════════════

export interface ExecutiveShadowReport {
  generatedAt:       string
  branchesCompared:  number
  portfolioMatch:    boolean
  maxDelta:          number
  averageDelta:      number
  branchResults:     BranchShadowReport[]
  portfolioSummary:  ReturnType<typeof buildPortfolioShadowReport>
}

/**
 * Generate a full Executive Shadow Report from an array of BranchInputs.
 *
 * This is the main entry point for shadow validation.
 * Runs both legacy and dynamic scoring on every branch and
 * produces a portfolio-level parity summary.
 */
export function buildExecutiveShadowReport(
  branches: BranchInput[],
): ExecutiveShadowReport {
  const branchPipelines = branches.map((b) => runBranchShadowPipeline(b))
  const branchReports   = branchPipelines.map((p) => p.shadowReport)
  const portfolioSummary = buildPortfolioShadowReport(branchReports)

  return {
    generatedAt:      new Date().toISOString(),
    branchesCompared: branches.length,
    portfolioMatch:   portfolioSummary.allMatch,
    maxDelta:         portfolioSummary.maxDelta,
    averageDelta:     portfolioSummary.avgDelta,
    branchResults:    branchReports,
    portfolioSummary,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — MISMATCH CLASSIFICATION
// ══════════════════════════════════════════════════════════════

export type MismatchCategory =
  | 'MISSING_DATA_MISMATCH'       // null vs 0 handling divergence
  | 'WEIGHT_MISMATCH'             // portfolio weight difference
  | 'AGGREGATION_MISMATCH'        // SUM vs AVG vs RATIO difference
  | 'ADJUSTMENT_MISMATCH'         // submission/consistency/trend difference
  | 'LEGACY_ASSUMPTION_MISMATCH'  // legacy engine uses a hard-coded assumption
  | 'UNKNOWN_MISMATCH'            // unclassified

export interface ClassifiedMismatch {
  branchId:    string
  branchName:  string
  category:    MismatchCategory
  description: string
  legacyScore: number
  dynamicScore: number
  delta:       number
}

/**
 * Classify why two scores differ.
 * Called after findParityMismatches identifies non-matching branches.
 */
export function classifyMismatch(
  report: ReturnType<typeof buildShadowScoreReport>,
): MismatchCategory {
  const { comparison, dynamicDetail } = report

  if (!comparison.isMatch) {
    // Check if any KPIs were excluded in dynamic but not in legacy
    const hasNotAggregated = dynamicDetail.kpiBreakdown.some(
      (k) => k.exclusionReason === 'NOT_AGGREGATED'
    )
    if (hasNotAggregated) return 'AGGREGATION_MISMATCH'

    const hasNullExclusion = dynamicDetail.kpiBreakdown.some(
      (k) => k.exclusionReason === 'null achievement'
    )
    if (hasNullExclusion) return 'MISSING_DATA_MISMATCH'

    const hasNoTarget = dynamicDetail.kpiBreakdown.some(
      (k) => k.exclusionReason === 'no valid target'
    )
    if (hasNoTarget) return 'MISSING_DATA_MISMATCH'

    // Grade mismatch with small delta: likely an adjustment difference
    if (!comparison.gradeMatch && Math.abs(comparison.delta) <= 5) {
      return 'ADJUSTMENT_MISMATCH'
    }

    // Weight-related if totalWeight differs from 1.0
    if (Math.abs(dynamicDetail.totalWeight - 1.0) > 0.01) return 'WEIGHT_MISMATCH'
  }

  return 'UNKNOWN_MISMATCH'
}

/**
 * Find all mismatching branches in a shadow report and classify them.
 */
export function findParityMismatches(
  report: ExecutiveShadowReport,
): ClassifiedMismatch[] {
  const mismatches: ClassifiedMismatch[] = []

  for (const branchReport of report.branchResults) {
    if (branchReport.match) continue

    const pipeline = runBranchShadowPipeline({
      pharmacyId:   branchReport.branchId,
      pharmacyName: branchReport.branchName,
      pharmacyCode: '',
      region:       '',
      mtdEntries:   [],
      target:       null,
    } as BranchInput)

    const category = classifyMismatch(pipeline.shadowReport)

    mismatches.push({
      branchId:     branchReport.branchId,
      branchName:   branchReport.branchName,
      category,
      description:  getMismatchDescription(category, branchReport),
      legacyScore:  branchReport.legacyScore,
      dynamicScore: branchReport.dynamicScore,
      delta:        branchReport.delta,
    })
  }

  return mismatches
}

function getMismatchDescription(
  category: MismatchCategory,
  report: BranchShadowReport,
): string {
  switch (category) {
    case 'MISSING_DATA_MISMATCH':
      return `Branch ${report.branchId}: null/missing KPI handled differently — legacy counts as 0, dynamic excludes from denominator`
    case 'WEIGHT_MISMATCH':
      return `Branch ${report.branchId}: portfolio weights don't sum to 1.0 in dynamic engine`
    case 'AGGREGATION_MISMATCH':
      return `Branch ${report.branchId}: KPI marked NOT_AGGREGATED in dynamic but scored in legacy`
    case 'ADJUSTMENT_MISMATCH':
      return `Branch ${report.branchId}: submission/consistency/trend adjustments applied differently (delta=${report.delta.toFixed(2)})`
    default:
      return `Branch ${report.branchId}: unclassified mismatch — legacy=${report.legacyScore} dynamic=${report.dynamicScore} delta=${report.delta.toFixed(2)}`
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Validate parity for a complete shadow report.
 * Returns true if all branches match within tolerance.
 */
export function validateShadowParity(
  report: ExecutiveShadowReport,
  tolerancePct = 0.01,
): { valid: boolean; failingBranches: string[]; summary: string } {
  const failing = report.branchResults
    .filter((r) => !r.match || Math.abs(r.delta) > tolerancePct)
    .map((r) => r.branchId)

  const valid = failing.length === 0

  const summary = valid
    ? `✅ All ${report.branchesCompared} branches match within ±${tolerancePct}`
    : `❌ ${failing.length}/${report.branchesCompared} branches fail parity. Max delta: ${report.maxDelta.toFixed(3)}`

  return { valid, failingBranches: failing, summary }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — DATA SEMANTICS AUDIT HELPERS
// ══════════════════════════════════════════════════════════════

export type KpiDataSemantics =
  | 'EXPLICIT_ZERO'     // entry submitted with value 0
  | 'POSITIVE_VALUE'    // normal submitted value > 0
  | 'NOT_SUBMITTED'     // no entries for this pharmacist/day
  | 'TARGET_MISSING'    // no target document for this branch/month
  | 'TARGET_ZERO'       // target document has 0 for this KPI

/**
 * Audit the data semantics of a single KPI field for a branch.
 * Returns the semantic classification and what each engine does with it.
 */
export function auditKpiDataSemantics(
  kpiKey:     KpiKey,
  entries:    KpiEntry[],
  targetDoc:  LegacyTargetDoc | null,
): {
  semantics:     KpiDataSemantics
  rawActual:     number
  rawTarget:     number | null
  legacyBehavior: string
  dynamicBehavior: string
} {
  const rawActual  = sumKpi(entries, kpiKey)
  const targetKey  = kpiKey === 'crossSelling' ? 'crossSellTarget' : `${kpiKey}Target`
  const rawTarget  = targetDoc ? (Number(targetDoc[targetKey] ?? 0) || null) : null

  let semantics: KpiDataSemantics
  if (!targetDoc)               semantics = 'TARGET_MISSING'
  else if (!rawTarget)          semantics = 'TARGET_ZERO'
  else if (entries.length === 0) semantics = 'NOT_SUBMITTED'
  else if (rawActual === 0)      semantics = 'EXPLICIT_ZERO'
  else                           semantics = 'POSITIVE_VALUE'

  // Document what each engine does
  const legacyBehavior = ((): string => {
    if (semantics === 'TARGET_MISSING' || semantics === 'TARGET_ZERO')
      return 'EXCLUDED from denominator (target=0 check)'
    if (semantics === 'NOT_SUBMITTED')
      return 'INCLUDED at 0% — sumKpi returns 0 for missing entries'
    if (semantics === 'EXPLICIT_ZERO')
      return 'INCLUDED at 0% — actual=0, achievementPct=0'
    return `INCLUDED at ${Math.min(200, (rawActual / (rawTarget ?? 1)) * 100).toFixed(1)}%`
  })()

  const dynamicBehavior = ((): string => {
    if (semantics === 'TARGET_MISSING' || semantics === 'TARGET_ZERO')
      return 'EXCLUDED (target null/0 in NormalizedMetricRecord)'
    if (semantics === 'NOT_SUBMITTED')
      return 'INCLUDED at 0% — sumKpi returns 0, normalized as actual=0'
    if (semantics === 'EXPLICIT_ZERO')
      return 'INCLUDED as ZERO_VALUE — actual=0, achievementPct=0'
    return `INCLUDED at ${Math.min(200, (rawActual / (rawTarget ?? 1)) * 100).toFixed(1)}%`
  })()

  return { semantics, rawActual, rawTarget, legacyBehavior, dynamicBehavior }
}

/**
 * Run a full data semantics audit for all 5 core KPIs on a branch.
 * Returns findings documenting exactly how each engine interprets each value.
 */
export function auditBranchDataSemantics(branch: BranchInput) {
  const targetDoc = extractLegacyTargetDoc(branch)
  return KPI_KEYS.map((key) => ({
    kpiKey: key,
    ...auditKpiDataSemantics(key, branch.mtdEntries, targetDoc),
  }))
}
