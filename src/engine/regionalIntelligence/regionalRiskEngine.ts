// ============================================================
// Regional Risk Engine
// Detects structural and operational risk patterns at the
// regional level. Outputs executive-ready risk assessments.
//
// Pure functions only — no Firebase, no React, no AI.
// Language is executive and operational — constructive framing.
//
// Input:  RegionalRollupSummary + optional RegionalTrendAnalysis
// Output: RegionalRiskAssessment
//
// TODO(future): Persist output to a `regional_risk_snapshots`
//   Firestore collection so historical risk progression can be
//   tracked without re-computation on every page load.
//
// TODO(future): Trigger as a Cloud Function on a scheduled
//   regional aggregation job (e.g. daily at 06:00) so the
//   executive dashboard always shows fresh risk assessments.
//
// TODO(future): Feed RegionalRiskAssessment[] into BigQuery
//   rollup source for trend analysis over quarterly periods.
// ============================================================

import { KPI_META, KPI_KEYS } from '../kpiAnalyticsEngine'

import type { KpiKey } from '../kpiAnalyticsEngine'

import type {
  RegionalRollupSummary,
  RegionalRiskAssessment,
  RegionalRiskReason,
  RegionalRiskReasonCode,
  RegionalPriorityFocusArea,
  RegionalExecutiveWarning,
  RegionalRiskLevel,
  RegionalTrendAnalysis,
  RegionalKpiAverage,
} from './regionalTypes'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — CONSTANTS
// ══════════════════════════════════════════════════════════════

const THRESHOLDS = {
  // Risk reason triggers
  highRiskConcentrationPct:   40,   // >= 40% HIGH_RISK branches
  sustainedScoreDecline:      10,   // score dropped >= 10 pts vs previous
  unstableStabilityScore:     40,   // stability score < 40
  weakKpiClusterCount:         2,   // >= 2 KPIs below achievement floor
  weakKpiAchievementFloor:    60,   // KPI mean achievement below this %
  highInactivePct:            30,   // >= 30% inactive branches
  dataQualityErrorPct:        25,   // >= 25% branches with ERROR flags

  // Executive warning triggers (higher bar than risk reasons)
  criticalHighRiskPct:        60,   // >= 60% HIGH_RISK → CRITICAL warning
  elevatedHighRiskPct:        40,   // >= 40% HIGH_RISK → ELEVATED warning
  criticalScoreDecline:       15,   // score dropped >= 15 pts → CRITICAL warning
  elevatedScoreDecline:       10,   // score dropped >= 10 pts → ELEVATED warning

  // Priority focus areas
  maxFocusAreas:               3,   // cap to prevent alert fatigue
} as const

// ══════════════════════════════════════════════════════════════
// SECTION 2 — RISK REASONS
// ══════════════════════════════════════════════════════════════

/**
 * Detect all applicable risk reasons from the rollup and optional trend data.
 * Returns reasons ordered by operational impact (most impactful first).
 */
function detectRiskReasons(
  rollup:  RegionalRollupSummary,
  trend?:  RegionalTrendAnalysis,
): RegionalRiskReason[] {
  const reasons: RegionalRiskReason[] = []
  const total = rollup.branchCount || 1

  // ── HIGH_RISK_CONCENTRATION ───────────────────────────────
  const highRiskPct = rollup.riskConcentration.highRiskPct
  if (highRiskPct >= THRESHOLDS.highRiskConcentrationPct) {
    reasons.push({
      code:        'HIGH_RISK_CONCENTRATION',
      description: `${rollup.riskConcentration.highRisk} of ${rollup.branchCount} branches (${highRiskPct}%) require focused attention.`,
      value:       highRiskPct,
    })
  }

  // ── SUSTAINED_SCORE_DECLINE ───────────────────────────────
  // Requires trend data (previous period comparison)
  if (trend && trend.momentumScore <= -(THRESHOLDS.sustainedScoreDecline * 4)) {
    // Approximate score decline from momentumScore (momentum = delta × 4 approx)
    const approxDecline = Math.abs(Math.round(trend.momentumScore / 4))
    reasons.push({
      code:        'SUSTAINED_SCORE_DECLINE',
      description: `Regional performance has declined meaningfully — momentum score is ${trend.momentumScore}. Early intervention is recommended.`,
      value:       approxDecline,
    })
  }

  // ── UNSTABLE_PERFORMANCE ──────────────────────────────────
  if (trend && trend.stabilityScore < THRESHOLDS.unstableStabilityScore) {
    reasons.push({
      code:        'UNSTABLE_PERFORMANCE',
      description: `Branch performance within the region is inconsistent — stability score is ${trend.stabilityScore}/100. Coordination may be needed.`,
      value:       trend.stabilityScore,
    })
  }

  // ── WEAK_KPI_CLUSTER ──────────────────────────────────────
  const weakKpis = rollup.kpiAverages.filter(
    (k) =>
      k.contributingBranches > 0 &&
      k.meanAchievementPct < THRESHOLDS.weakKpiAchievementFloor,
  )
  if (weakKpis.length >= THRESHOLDS.weakKpiClusterCount) {
    const kpiNames = weakKpis.map((k) => KPI_META[k.kpiKey].en).join(', ')
    reasons.push({
      code:        'WEAK_KPI_CLUSTER',
      description: `${weakKpis.length} KPIs are below ${THRESHOLDS.weakKpiAchievementFloor}% regional achievement: ${kpiNames}.`,
      value:       weakKpis.length,
    })
  }

  // ── HIGH_INACTIVE_BRANCHES ────────────────────────────────
  const inactivePct = Math.round((rollup.inactiveBranches / total) * 100)
  if (inactivePct >= THRESHOLDS.highInactivePct) {
    reasons.push({
      code:        'HIGH_INACTIVE_BRANCHES',
      description: `${rollup.inactiveBranches} of ${rollup.branchCount} branches (${inactivePct}%) have no activity recorded this period.`,
      value:       inactivePct,
    })
  }

  // ── DATA_QUALITY_RISK ─────────────────────────────────────
  const errorFlagCount = rollup.dataQualityFlags.filter(
    (f) => f.severity === 'ERROR',
  ).length
  // Proxy: count branches implied by regional ERROR flags
  // Use rollup.dataQualityFlags value field where available
  const highDataRiskFlag = rollup.dataQualityFlags.find(
    (f) => f.code === 'REGION_LOW_DATA_QUALITY',
  )
  if (highDataRiskFlag) {
    reasons.push({
      code:        'DATA_QUALITY_RISK',
      description: `Data coverage gaps detected across the region — ${highDataRiskFlag.description}`,
      value:       highDataRiskFlag.value,
    })
  }

  // ── RECOVERY_STALLED ──────────────────────────────────────
  if (
    trend &&
    trend.trendDirection === 'DECLINING' &&
    rollup.recoverySignals.length === 0 &&
    rollup.riskConcentration.highRisk > 0
  ) {
    reasons.push({
      code:        'RECOVERY_STALLED',
      description: `The region is declining with no active recovery signals — ${rollup.riskConcentration.highRisk} branch${rollup.riskConcentration.highRisk > 1 ? 'es' : ''} at high risk.`,
      value:       rollup.riskConcentration.highRisk,
    })
  }

  // Sort: most impactful first (by value desc, then code for stability)
  return reasons.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — PRIORITY FOCUS AREAS
// ══════════════════════════════════════════════════════════════

/**
 * Derive up to 3 priority focus areas from risk reasons and rollup data.
 * Language is constructive and executive — what to do, not what went wrong.
 */
function buildPriorityFocusAreas(
  rollup:   RegionalRollupSummary,
  reasons:  RegionalRiskReason[],
): RegionalPriorityFocusArea[] {
  const areas: RegionalPriorityFocusArea[] = []

  // KPI focus area — based on weakest KPIs
  const weakKpis = rollup.weakestKpis
  if (weakKpis.length > 0) {
    const kpiNames = weakKpis.map((k) => KPI_META[k].en).join(' & ')
    const weakAvg  = rollup.kpiAverages
      .filter((k) => weakKpis.includes(k.kpiKey))
      .map((k) => k.meanAchievementPct)
    const lowestAch = Math.min(...weakAvg)

    areas.push({
      area:    `${kpiNames} performance`,
      action:  `Review branch-level targets and activate coaching plans for underperforming teams.`,
      urgency: lowestAch < 50 ? 'HIGH' : lowestAch < 70 ? 'MEDIUM' : 'LOW',
      kpiKeys: weakKpis,
    })
  }

  // High-risk branch focus
  const highRisk = rollup.riskConcentration.highRisk
  if (highRisk > 0 && reasons.some((r) => r.code === 'HIGH_RISK_CONCENTRATION')) {
    areas.push({
      area:    `High-risk branch stabilisation`,
      action:  `Schedule performance review sessions for the ${highRisk} branch${highRisk > 1 ? 'es' : ''} at high risk. Identify shared obstacles.`,
      urgency: rollup.riskConcentration.highRiskPct >= 60 ? 'HIGH' : 'MEDIUM',
    })
  }

  // Inactive branch data coverage
  if (rollup.inactiveBranches > 0 && reasons.some((r) => r.code === 'HIGH_INACTIVE_BRANCHES')) {
    areas.push({
      area:    `Data submission coverage`,
      action:  `Follow up with ${rollup.inactiveBranches} inactive branch${rollup.inactiveBranches > 1 ? 'es' : ''} to ensure KPI data is entered. Verify system access and workload.`,
      urgency: 'MEDIUM',
    })
  }

  // Recovery support
  if (reasons.some((r) => r.code === 'RECOVERY_STALLED')) {
    if (areas.length < THRESHOLDS.maxFocusAreas) {
      areas.push({
        area:    `Recovery pathway activation`,
        action:  `Engage branch managers to develop a short-term performance recovery plan with defined milestones.`,
        urgency: 'HIGH',
      })
    }
  }

  // Cap and sort by urgency
  const urgencyOrder: Record<RegionalPriorityFocusArea['urgency'], number> = {
    HIGH: 2, MEDIUM: 1, LOW: 0,
  }
  return areas
    .sort((a, b) => urgencyOrder[b.urgency] - urgencyOrder[a.urgency])
    .slice(0, THRESHOLDS.maxFocusAreas)
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — EXECUTIVE WARNINGS
// ══════════════════════════════════════════════════════════════

/**
 * Generate executive warnings — raised only for conditions that
 * genuinely require leadership attention. Kept to a minimum to
 * prevent desensitisation. Severity: CRITICAL or ELEVATED only.
 */
function buildExecutiveWarnings(
  rollup:  RegionalRollupSummary,
  reasons: RegionalRiskReason[],
  trend?:  RegionalTrendAnalysis,
): RegionalExecutiveWarning[] {
  const warnings: RegionalExecutiveWarning[] = []
  const regionName = rollup.regionName
  const highRiskPct = rollup.riskConcentration.highRiskPct

  // Critical: majority of branches at high risk
  if (highRiskPct >= THRESHOLDS.criticalHighRiskPct) {
    warnings.push({
      title:       `${regionName}: Majority of branches require attention`,
      description: `${rollup.riskConcentration.highRisk} of ${rollup.branchCount} branches (${highRiskPct}%) are at high risk this period. Regional performance support is recommended.`,
      severity:    'CRITICAL',
    })
  } else if (highRiskPct >= THRESHOLDS.elevatedHighRiskPct) {
    warnings.push({
      title:       `${regionName}: Elevated risk concentration`,
      description: `${rollup.riskConcentration.highRisk} of ${rollup.branchCount} branches (${highRiskPct}%) are at high risk. Monitor closely and prepare support plans.`,
      severity:    'ELEVATED',
    })
  }

  // Sustained stress with no recovery pathway
  if (
    trend?.sustainedStressSignal &&
    trend.trendDirection !== 'RECOVERY' &&
    trend.trendDirection !== 'IMPROVING'
  ) {
    warnings.push({
      title:       `${regionName}: Sustained operational pressure`,
      description: `The region is under sustained operational stress — score ${rollup.regionalScore}/100 with ${rollup.riskConcentration.highRisk} high-risk branches and no active recovery signals. Executive engagement is advisable.`,
      severity:    'ELEVATED',
    })
  }

  // Critical score decline
  if (trend) {
    const approxDecline = Math.abs(Math.round(trend.momentumScore / 4))
    if (approxDecline >= THRESHOLDS.criticalScoreDecline && trend.momentumScore < 0) {
      warnings.push({
        title:       `${regionName}: Significant performance decline`,
        description: `Regional performance has declined significantly this period (momentum score: ${trend.momentumScore}). A structured review of branch targets and support mechanisms is recommended.`,
        severity:    approxDecline >= THRESHOLDS.criticalScoreDecline ? 'CRITICAL' : 'ELEVATED',
      })
    }
  }

  // Sort CRITICAL first
  return warnings.sort((a, b) => (a.severity === 'CRITICAL' ? -1 : 1))
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — AGGREGATE RISK LEVEL
// ══════════════════════════════════════════════════════════════

/**
 * Derive the overall regional risk level from reasons and rollup data.
 * More conservative than the rollup engine's risk level — it
 * incorporates trend data and reason count.
 */
function deriveAssessmentRiskLevel(
  rollup:  RegionalRollupSummary,
  reasons: RegionalRiskReason[],
  trend?:  RegionalTrendAnalysis,
): RegionalRiskLevel {
  // Start from the rollup's existing risk level as the baseline
  const base = rollup.regionalRiskLevel

  // Upgrade to HIGH_RISK if we detect critical compound conditions
  const hasCritical =
    reasons.some((r) => r.code === 'HIGH_RISK_CONCENTRATION' && (r.value ?? 0) >= 60) ||
    (reasons.length >= 3 && base === 'MEDIUM_RISK') ||
    (trend?.sustainedStressSignal && base !== 'ON_TRACK')

  if (hasCritical) return 'HIGH_RISK'

  // Upgrade MEDIUM_RISK if sustained decline detected
  if (
    base === 'LOW_RISK' &&
    reasons.some((r) => r.code === 'SUSTAINED_SCORE_DECLINE' || r.code === 'RECOVERY_STALLED')
  ) {
    return 'MEDIUM_RISK'
  }

  return base
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Generate a full risk assessment for a single region.
 *
 * @param rollup  - Current period RegionalRollupSummary
 * @param trend   - Optional trend analysis (enriches risk detection)
 * @returns       RegionalRiskAssessment — safe, never throws
 *
 * @example
 * const risk = assessRegionalRisk(rollup, trend)
 * // → risk.regionalRiskLevel    ('HIGH_RISK' | 'MEDIUM_RISK' | ...)
 * // → risk.riskReasons          ([{ code: 'HIGH_RISK_CONCENTRATION', ... }])
 * // → risk.priorityFocusAreas   ([{ area: 'Wasfaty performance', ... }])
 * // → risk.executiveWarnings    ([{ title: '...', severity: 'CRITICAL' }])
 */
export function assessRegionalRisk(
  rollup: RegionalRollupSummary,
  trend?: RegionalTrendAnalysis,
): RegionalRiskAssessment {
  const riskReasons         = detectRiskReasons(rollup, trend)
  const priorityFocusAreas  = buildPriorityFocusAreas(rollup, riskReasons)
  const executiveWarnings   = buildExecutiveWarnings(rollup, riskReasons, trend)
  const regionalRiskLevel   = deriveAssessmentRiskLevel(rollup, riskReasons, trend)

  return {
    regionName:         rollup.regionName,
    regionalRiskLevel,
    riskReasons,
    priorityFocusAreas,
    executiveWarnings,
    generatedAt:        new Date().toISOString(),
  }
}

/**
 * Assess risk for all regions in a portfolio.
 * Matches each rollup to its trend analysis by regionName.
 * Returns one RegionalRiskAssessment per region, sorted by regionName.
 *
 * TODO(future): When scheduled regional aggregation jobs are
 *   implemented, replace direct invocation here with a Cloud
 *   Function that reads from the `regional_snapshots` collection
 *   and writes results to `regional_risk_snapshots`.
 */
export function assessAllRegionalRisks(
  rollups: RegionalRollupSummary[],
  trends?: RegionalTrendAnalysis[],
): RegionalRiskAssessment[] {
  if (!rollups.length) return []

  const trendMap = new Map(
    (trends ?? []).map((t) => [t.regionName, t]),
  )

  return rollups
    .map((r) => assessRegionalRisk(r, trendMap.get(r.regionName)))
    .sort((a, b) => a.regionName.localeCompare(b.regionName))
}
