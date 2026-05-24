// ============================================================
// Regional Rollup Engine
// Aggregates BranchRollupSummary[] into per-region intelligence.
//
// Pure functions only — no Firebase, no React, no side effects.
// Input: BranchRollupSummary[] (output of branchRollupEngine)
// Output: RegionalRollupSummary[] (one entry per distinct region)
// ============================================================

import {
  KPI_KEYS, KPI_META,
  getTrafficLight,
  computeAchievementPct,
} from '../kpiAnalyticsEngine'

import type {
  KpiKey,
  TrafficLightStatus,
} from '../kpiAnalyticsEngine'

import type {
  BranchRollupSummary,
  RegionalRollupSummary,
  RegionalRiskLevel,
  RegionalKpiAverage,
  RegionalRiskConcentration,
  RecoverySignal,
  RecoverySignalStrength,
  DataQualityFlag,
} from './regionalTypes'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — CONSTANTS
// ══════════════════════════════════════════════════════════════

/** Thresholds for regional-level data quality flags */
const THRESHOLDS = {
  highInactiveRate:    0.30,  // > 30% inactive branches → flag
  highNoTargetRate:    0.40,  // > 40% missing targets → flag
  regionHighRiskPct:   0.50,  // > 50% HIGH_RISK branches → flag
  lowDataQualityPct:   0.30,  // > 30% branches with ERROR flags → flag
} as const

/** Minimum branches needed to compute a meaningful recovery signal */
const MIN_SCORE_FOR_STRONG_RECOVERY  = 70
const MIN_SCORE_FOR_MODERATE_RECOVERY = 50

// ══════════════════════════════════════════════════════════════
// SECTION 2 — GROUPING
// ══════════════════════════════════════════════════════════════

/**
 * Group branch rollups by region name.
 * Branches with empty/missing region are placed under 'Unassigned'.
 */
function groupByRegion(
  rollups: BranchRollupSummary[],
): Map<string, BranchRollupSummary[]> {
  const map = new Map<string, BranchRollupSummary[]>()

  for (const rollup of rollups) {
    const region = rollup.region?.trim() || 'Unassigned'
    if (!map.has(region)) map.set(region, [])
    map.get(region)!.push(rollup)
  }

  return map
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — REGIONAL SCORE
// ══════════════════════════════════════════════════════════════

/**
 * Regional score = mean branchScore of active branches.
 * Inactive branches (NO_DATA) are excluded — they would unfairly
 * drag the score to 0 without reflecting operational performance.
 */
function computeRegionalScore(branches: BranchRollupSummary[]): number {
  const active = branches.filter((b) => b.operationalStatus !== 'NO_DATA')
  if (!active.length) return 0
  const sum = active.reduce((acc, b) => acc + b.branchScore, 0)
  return Math.round(sum / active.length)
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — KPI AVERAGES
// ══════════════════════════════════════════════════════════════

/**
 * Compute per-KPI averages across branches.
 * Only branches that have a valid target for a given KPI contribute
 * to that KPI's mean achievement. This avoids diluting the average
 * with branches that have no targets set.
 */
function computeKpiAverages(branches: BranchRollupSummary[]): RegionalKpiAverage[] {
  // Only active branches (those with at least some entries) contribute
  const contributing = branches.filter((b) => b.operationalStatus !== 'NO_DATA')

  return KPI_KEYS.map((kpiKey): RegionalKpiAverage => {
    // Gather the per-branch KpiRollupSummary for this KPI
    const kpiEntries = contributing
      .map((b) => b.kpiAchievementSummary.find((k) => k.kpiKey === kpiKey))
      .filter((k): k is NonNullable<typeof k> => k != null)

    // For achievement avg — only branches with a valid target
    const withTarget = kpiEntries.filter((k) => k.hasTarget)

    const meanActual = kpiEntries.length > 0
      ? Math.round(kpiEntries.reduce((s, k) => s + k.actual, 0) / kpiEntries.length)
      : 0

    const meanTarget = withTarget.length > 0
      ? Math.round(withTarget.reduce((s, k) => s + k.target, 0) / withTarget.length)
      : 0

    const meanAchievementPct = withTarget.length > 0
      ? Math.round(withTarget.reduce((s, k) => s + k.achievementPct, 0) / withTarget.length)
      : 0

    // Spread = max achievement − min achievement (volatility measure)
    const achValues = withTarget.map((k) => k.achievementPct)
    const spreadPct = achValues.length >= 2
      ? Math.max(...achValues) - Math.min(...achValues)
      : 0

    // Traffic light status from mean achievement vs expected
    // Use meanTarget > 0 guard; derive status from meanAchievementPct
    const status: TrafficLightStatus = meanTarget > 0
      ? getTrafficLight(meanAchievementPct, 0.5)  // 0.5 = generic mid-month ratio
      : 'critical'

    return {
      kpiKey,
      meanActual,
      meanTarget,
      meanAchievementPct,
      contributingBranches: withTarget.length,
      status,
      spreadPct,
    }
  })
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — WEAKEST / STRONGEST KPI DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Return the top-N KPI keys with the lowest mean achievement %.
 * Only KPIs with at least one contributing branch are considered.
 */
function findWeakestRegionalKpis(
  kpiAverages: RegionalKpiAverage[],
  n = 2,
): KpiKey[] {
  return kpiAverages
    .filter((k) => k.contributingBranches > 0)
    .sort((a, b) => a.meanAchievementPct - b.meanAchievementPct)
    .slice(0, n)
    .map((k) => k.kpiKey)
}

/**
 * Return the top-N KPI keys with the highest mean achievement %.
 * Only KPIs with at least one contributing branch are considered.
 */
function findStrongestRegionalKpis(
  kpiAverages: RegionalKpiAverage[],
  n = 2,
): KpiKey[] {
  return kpiAverages
    .filter((k) => k.contributingBranches > 0)
    .sort((a, b) => b.meanAchievementPct - a.meanAchievementPct)
    .slice(0, n)
    .map((k) => k.kpiKey)
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — RISK CONCENTRATION
// ══════════════════════════════════════════════════════════════

function computeRiskConcentration(branches: BranchRollupSummary[]): RegionalRiskConcentration {
  const total = branches.length
  if (!total) {
    return { onTrack: 0, lowRisk: 0, mediumRisk: 0, highRisk: 0, highRiskPct: 0 }
  }

  const counts = { onTrack: 0, lowRisk: 0, mediumRisk: 0, highRisk: 0 }

  for (const b of branches) {
    switch (b.riskLevel) {
      case 'ON_TRACK':    counts.onTrack++;    break
      case 'LOW_RISK':    counts.lowRisk++;    break
      case 'MEDIUM_RISK': counts.mediumRisk++; break
      case 'HIGH_RISK':   counts.highRisk++;   break
    }
  }

  return {
    ...counts,
    highRiskPct: Math.round((counts.highRisk / total) * 100),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — REGIONAL RISK LEVEL
// ══════════════════════════════════════════════════════════════

/**
 * Derive the regional risk level from the risk concentration.
 * Uses the same thresholds as the branch-level risk engine for consistency.
 */
function deriveRegionalRiskLevel(
  concentration: RegionalRiskConcentration,
  total: number,
): RegionalRiskLevel {
  if (!total) return 'LOW_RISK'

  const { highRisk, mediumRisk, lowRisk } = concentration
  const criticalPct = highRisk / total
  const warnPct     = (highRisk + mediumRisk) / total

  if (criticalPct >= 0.5)  return 'HIGH_RISK'
  if (criticalPct >= 0.2)  return 'MEDIUM_RISK'
  if (warnPct     >= 0.4)  return 'MEDIUM_RISK'
  if (lowRisk     >= 1)    return 'LOW_RISK'
  return 'ON_TRACK'
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — RECOVERY SIGNALS
// ══════════════════════════════════════════════════════════════

/**
 * Identify branches showing recovery momentum.
 * A branch is a recovery signal candidate when it is NOT ON_TRACK
 * and shows positive or stable momentum. Any ON_TRACK branch is
 * excluded regardless of score — it is already performing acceptably.
 */
function detectRecoverySignals(branches: BranchRollupSummary[]): RecoverySignal[] {
  const POSITIVE_MOMENTUM = new Set([
    'ACCELERATING', 'IMPROVING', 'STABLE',
  ])

  return branches
    .filter((b) => {
      // Must have some data
      if (b.operationalStatus === 'NO_DATA') return false
      // Must show positive or stable momentum
      if (!POSITIVE_MOMENTUM.has(b.momentumDirection)) return false
      // Must not already be ON_TRACK — any ON_TRACK branch is within acceptable
      // bounds and is not a recovery candidate regardless of score.
      if (b.riskLevel === 'ON_TRACK') return false
      return true
    })
    .map((b): RecoverySignal => {
      let strength: RecoverySignalStrength

      if (
        b.branchScore >= MIN_SCORE_FOR_STRONG_RECOVERY &&
        (b.momentumDirection === 'ACCELERATING' || b.momentumDirection === 'IMPROVING')
      ) {
        strength = 'STRONG'
      } else if (b.branchScore >= MIN_SCORE_FOR_MODERATE_RECOVERY) {
        strength = 'MODERATE'
      } else {
        strength = 'WEAK'
      }

      return {
        branchId:              b.branchId,
        branchName:            b.branchName,
        strength,
        momentumDirection:     b.momentumDirection,
        branchScore:           b.branchScore,
        overallAchievementPct: b.overallAchievementPct,
      }
    })
    // Surface strongest signals first
    .sort((a, b) => {
      const rank: Record<RecoverySignalStrength, number> = { STRONG: 2, MODERATE: 1, WEAK: 0 }
      return rank[b.strength] - rank[a.strength] || b.branchScore - a.branchScore
    })
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — REGIONAL DATA QUALITY FLAGS
// ══════════════════════════════════════════════════════════════

/**
 * Generate regional-level data quality flags from branch rollup data.
 * These are portfolio-level signals, distinct from per-branch flags.
 */
function buildRegionalDataQualityFlags(
  branches: BranchRollupSummary[],
  concentration: RegionalRiskConcentration,
): DataQualityFlag[] {
  const flags: DataQualityFlag[] = []
  const total = branches.length
  if (!total) return flags

  // HIGH_INACTIVE_RATE
  const inactiveCount = branches.filter((b) => b.operationalStatus === 'NO_DATA').length
  const inactiveRate  = inactiveCount / total
  if (inactiveRate > THRESHOLDS.highInactiveRate) {
    flags.push({
      code:        'HIGH_INACTIVE_RATE',
      severity:    'WARNING',
      description: `${inactiveCount} of ${total} branches (${Math.round(inactiveRate * 100)}%) have no data this period.`,
      value:       Math.round(inactiveRate * 100),
    })
  }

  // HIGH_NO_TARGET_RATE
  const noTargetCount = branches.filter((b) => b.operationalStatus === 'NO_TARGET').length
  const noTargetRate  = noTargetCount / total
  if (noTargetRate > THRESHOLDS.highNoTargetRate) {
    flags.push({
      code:        'HIGH_NO_TARGET_RATE',
      severity:    'WARNING',
      description: `${noTargetCount} of ${total} branches (${Math.round(noTargetRate * 100)}%) have no target set.`,
      value:       Math.round(noTargetRate * 100),
    })
  }

  // REGION_HIGH_RISK
  const highRiskRate = concentration.highRisk / total
  if (highRiskRate > THRESHOLDS.regionHighRiskPct) {
    flags.push({
      code:        'REGION_HIGH_RISK',
      severity:    'ERROR',
      description: `${concentration.highRisk} of ${total} branches (${Math.round(highRiskRate * 100)}%) are HIGH_RISK.`,
      value:       Math.round(highRiskRate * 100),
    })
  }

  // REGION_LOW_DATA_QUALITY
  const errorBranches    = branches.filter((b) => b.hasDataErrors).length
  const lowQualityRate   = errorBranches / total
  if (lowQualityRate > THRESHOLDS.lowDataQualityPct) {
    flags.push({
      code:        'REGION_LOW_DATA_QUALITY',
      severity:    'WARNING',
      description: `${errorBranches} of ${total} branches (${Math.round(lowQualityRate * 100)}%) have data quality errors.`,
      value:       Math.round(lowQualityRate * 100),
    })
  }

  // Sort: ERROR first, then WARNING
  const order: Record<DataQualityFlag['severity'], number> = { ERROR: 0, WARNING: 1, INFO: 2 }
  return flags.sort((a, b) => order[a.severity] - order[b.severity])
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — ACTIVE / INACTIVE COUNTS
// ══════════════════════════════════════════════════════════════

function countActiveBranches(branches: BranchRollupSummary[]): number {
  return branches.filter((b) => b.operationalStatus !== 'NO_DATA').length
}

function countInactiveBranches(branches: BranchRollupSummary[]): number {
  return branches.filter((b) => b.operationalStatus === 'NO_DATA').length
}

function countNoTargetBranches(branches: BranchRollupSummary[]): number {
  return branches.filter((b) => b.operationalStatus === 'NO_TARGET').length
}

// ══════════════════════════════════════════════════════════════
// SECTION 11 — SINGLE REGION AGGREGATION
// ══════════════════════════════════════════════════════════════

function aggregateRegion(
  regionName: string,
  branches:   BranchRollupSummary[],
): RegionalRollupSummary {
  const riskConcentration  = computeRiskConcentration(branches)
  const kpiAverages        = computeKpiAverages(branches)
  const regionalScore      = computeRegionalScore(branches)
  const regionalRiskLevel  = deriveRegionalRiskLevel(riskConcentration, branches.length)
  const weakestKpis        = findWeakestRegionalKpis(kpiAverages)
  const strongestKpis      = findStrongestRegionalKpis(kpiAverages)
  const recoverySignals    = detectRecoverySignals(branches)
  const dataQualityFlags   = buildRegionalDataQualityFlags(branches, riskConcentration)

  return {
    regionName,
    branchCount:       branches.length,
    activeBranches:    countActiveBranches(branches),
    inactiveBranches:  countInactiveBranches(branches),
    noTargetBranches:  countNoTargetBranches(branches),
    regionalScore,
    regionalRiskLevel,
    riskConcentration,
    kpiAverages,
    weakestKpis,
    strongestKpis,
    recoverySignals,
    dataQualityFlags,
    generatedAt: new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 12 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Aggregate branch rollup summaries into per-region intelligence.
 *
 * @param branchRollups - Array of BranchRollupSummary (one per branch)
 * @returns Array of RegionalRollupSummary sorted by regionName.
 *          Returns [] when input is empty — never throws.
 *
 * @example
 * const regions = generateRegionalRollups(branchRollups)
 * // → regions[0].regionName       ('Central')
 * // → regions[0].regionalScore    (74)
 * // → regions[0].weakestKpis      (['crossSelling', 'omni'])
 * // → regions[0].recoverySignals  ([{ branchId, strength: 'STRONG', ... }])
 */
export function generateRegionalRollups(
  branchRollups: BranchRollupSummary[],
): RegionalRollupSummary[] {
  if (!branchRollups.length) return []

  const grouped = groupByRegion(branchRollups)

  return Array.from(grouped.entries())
    .map(([regionName, branches]) => aggregateRegion(regionName, branches))
    .sort((a, b) => a.regionName.localeCompare(b.regionName))
}
