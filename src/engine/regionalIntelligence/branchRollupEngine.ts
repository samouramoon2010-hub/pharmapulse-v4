// ============================================================
// Branch Rollup Engine
// Computes a fully resolved BranchRollupSummary from raw
// BranchRollupInput + RegionalPeriod.
//
// Pure functions only — no Firebase, no React, no side effects.
// Reuses existing KPI/executive engine helpers wherever possible.
// ============================================================

import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  computeKpiStats,
  computeOverallAchievement,
  computeRiskLevel,
  computeTrendDirection,
  extractDailyValues,
  sumKpi,
  getDayProgress,
  getTargetForKpi,
} from '../kpiAnalyticsEngine'

import { computeExecutiveScore } from '../executive/executiveScore'

import type { KpiStats } from '../kpiAnalyticsEngine'

import type {
  BranchRollupInput,
  BranchRollupSummary,
  KpiRollupSummary,
  RegionalPeriod,
  RegionalRiskLevel,
  RegionalMomentumDirection,
  BranchOperationalStatus,
  DataQualityFlag,
  DataQualityFlagCode,
} from './regionalTypes'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — DATA QUALITY ANALYSIS
// ══════════════════════════════════════════════════════════════

const STALE_THRESHOLD_DAYS       = 3   // entries older than this → STALE
const LOW_SUBMISSION_THRESHOLD   = 0.7 // < 70% submission rate
const INSUFFICIENT_HISTORY_DAYS  = 14  // < 14 days → trend unreliable

/** Build all data quality flags for a branch input. */
function buildDataQualityFlags(
  input:   BranchRollupInput,
  period:  RegionalPeriod,
): DataQualityFlag[] {
  const flags: DataQualityFlag[] = []

  // ── NO_ENTRIES ───────────────────────────────────────────
  if (!input.entries.length) {
    flags.push({
      code:        'NO_ENTRIES',
      severity:    'ERROR',
      description: 'No KPI entries found for this period.',
    })
    // Most other flags are irrelevant when no data exists
    if (!input.target) {
      flags.push({
        code:        'NO_TARGET',
        severity:    'ERROR',
        description: 'No target document set for this month.',
      })
    }
    return sortFlags(flags)
  }

  // ── NO_TARGET ────────────────────────────────────────────
  if (!input.target) {
    flags.push({
      code:        'NO_TARGET',
      severity:    'WARNING',
      description: 'No target document set — achievement % cannot be computed.',
    })
  } else {
    // ── PARTIAL_TARGET ─────────────────────────────────────
    const zeroTargetKpis = KPI_KEYS.filter((k) => getTargetForKpi(input.target, k) === 0)
    if (zeroTargetKpis.length > 0 && zeroTargetKpis.length < KPI_KEYS.length) {
      flags.push({
        code:        'PARTIAL_TARGET',
        severity:    'WARNING',
        description: `${zeroTargetKpis.length} KPI(s) have no target set: ${zeroTargetKpis.join(', ')}.`,
        value:       zeroTargetKpis.length,
      })
    }
  }

  // ── STALE_DATA ───────────────────────────────────────────
  const sortedDates = input.entries
    .map((e) => e.date)
    .sort()
  const latestEntry  = sortedDates[sortedDates.length - 1]
  if (latestEntry) {
    const latestMs    = new Date(latestEntry).getTime()
    const endMs       = new Date(period.endDate).getTime()
    const daysDiff    = Math.floor((endMs - latestMs) / 86_400_000)
    if (daysDiff > STALE_THRESHOLD_DAYS) {
      flags.push({
        code:        'STALE_DATA',
        severity:    'WARNING',
        description: `Most recent entry is ${daysDiff} day(s) old (threshold: ${STALE_THRESHOLD_DAYS}).`,
        value:       daysDiff,
      })
    }
  }

  // ── LOW_SUBMISSION_RATE ──────────────────────────────────
  const distinctSubmitters = new Set(input.entries.map((e) => e.userId)).size
  const totalPharmacists   = input.pharmacistCount ?? Math.max(1, distinctSubmitters)
  const submittedCount     = input.submittedToday  ?? distinctSubmitters
  const submissionRate     = submittedCount / totalPharmacists

  if (submissionRate < LOW_SUBMISSION_THRESHOLD) {
    flags.push({
      code:        'LOW_SUBMISSION_RATE',
      severity:    'WARNING',
      description: `Submission rate is ${Math.round(submissionRate * 100)}% (threshold: ${Math.round(LOW_SUBMISSION_THRESHOLD * 100)}%).`,
      value:       Math.round(submissionRate * 100),
    })
  }

  // ── INSUFFICIENT_HISTORY ─────────────────────────────────
  const historicalDays = new Set(
    (input.historicalEntries ?? []).map((e) => e.date)
  ).size
  if (historicalDays < INSUFFICIENT_HISTORY_DAYS) {
    flags.push({
      code:        'INSUFFICIENT_HISTORY',
      severity:    'INFO',
      description: `Only ${historicalDays} day(s) of history (need ${INSUFFICIENT_HISTORY_DAYS} for reliable trend).`,
      value:       historicalDays,
    })
  }

  return sortFlags(flags)
}

/** Sort flags: ERROR first, then WARNING, then INFO. */
function sortFlags(flags: DataQualityFlag[]): DataQualityFlag[] {
  const order: Record<DataQualityFlag['severity'], number> = {
    ERROR:   0,
    WARNING: 1,
    INFO:    2,
  }
  return [...flags].sort((a, b) => order[a.severity] - order[b.severity])
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — KPI ROLLUP
// ══════════════════════════════════════════════════════════════

/** Compute per-KPI rollup summaries for a branch. */
function buildKpiRollupSummaries(
  input:   BranchRollupInput,
  period:  RegionalPeriod,
): KpiRollupSummary[] {
  // Use a DayProgress anchored to the period's dayRatio for pace/status
  const dp = getDayProgress()
  // Override ratio with period's pre-computed ratio for test determinism
  const dpForPeriod = { ...dp, ratio: period.dayRatio }

  return KPI_KEYS.map((kpiKey): KpiRollupSummary => {
    const actual  = sumKpi(input.entries, kpiKey)
    const target  = getTargetForKpi(input.target, kpiKey)
    const stats   = computeKpiStats(actual, target, dpForPeriod, kpiKey)

    return {
      kpiKey,
      actual,
      target,
      achievementPct:    stats.achievementPct,
      expectedPct:       stats.expectedPct,
      delta:             stats.delta,
      remainingToTarget: stats.remainingToTarget,
      status:            stats.status,
      hasTarget:         target > 0,
    }
  })
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — RISK LEVEL
// ══════════════════════════════════════════════════════════════

/**
 * Derive RegionalRiskLevel from KPI rollup summaries.
 * Delegates to the existing computeRiskLevel engine function
 * so thresholds are consistent with the executive layer.
 */
function deriveRiskLevel(kpiSummaries: KpiRollupSummary[]): RegionalRiskLevel {
  const statuses = kpiSummaries
    .filter((k) => k.hasTarget)   // only KPIs with targets count
    .map((k) => k.status)

  if (!statuses.length) return 'LOW_RISK'  // no targets → uncertain, not critical

  // computeRiskLevel returns RiskLevel which is exactly RegionalRiskLevel values
  return computeRiskLevel(statuses) as RegionalRiskLevel
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — MOMENTUM DIRECTION
// ══════════════════════════════════════════════════════════════

/**
 * Compute dominant momentum direction from historical entries.
 * Returns INSUFFICIENT_DATA when history is too short.
 */
function deriveMomentumDirection(
  input: BranchRollupInput,
): RegionalMomentumDirection {
  const historical = input.historicalEntries ?? []
  if (historical.length < 2) return 'INSUFFICIENT_DATA'

  // Use wasfaty (highest-weight KPI) as the representative signal.
  // Phase 4B-0B will weight across all KPIs at the regional level.
  const dailyValues = extractDailyValues(historical, 'wasfaty')

  if (dailyValues.length < 2) return 'INSUFFICIENT_DATA'

  const direction = computeTrendDirection(dailyValues)

  // TrendDirection is a strict subset of RegionalMomentumDirection — safe cast
  return direction as RegionalMomentumDirection
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — OPERATIONAL STATUS
// ══════════════════════════════════════════════════════════════

/**
 * Classify operational status from flags and entry count.
 * Evaluated in priority order: worst condition wins.
 */
function deriveOperationalStatus(
  input: BranchRollupInput,
  flags: DataQualityFlag[],
): BranchOperationalStatus {
  // No entries at all → NO_DATA (most critical)
  if (!input.entries.length) return 'NO_DATA'

  // Stale data takes priority over missing target
  const isStale = flags.some((f) => f.code === 'STALE_DATA')
  if (isStale) return 'STALE'

  // Entries present but no target
  if (!input.target) return 'NO_TARGET'

  // Entries + target, but with quality issues (partial target, low submission)
  const hasWarnings = flags.some((f) => f.severity === 'WARNING' || f.severity === 'ERROR')
  if (hasWarnings) return 'DEGRADED'

  return 'ACTIVE'
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — SUBMISSION RATE
// ══════════════════════════════════════════════════════════════

function computeSubmissionRatePct(input: BranchRollupInput): number {
  const distinct = new Set(input.entries.map((e) => e.userId)).size
  const total    = input.pharmacistCount ?? Math.max(1, distinct)
  const submitted = input.submittedToday  ?? distinct
  return Math.min(100, Math.round((submitted / total) * 100))
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — BRANCH SCORE
// ══════════════════════════════════════════════════════════════

/**
 * Reuse the executive score engine for consistency.
 * Adapts BranchRollupInput → BranchInput (duck-typed compatible).
 */
function computeBranchScore(input: BranchRollupInput): number {
  if (!input.entries.length) return 0

  // Build the duck-typed BranchInput the executive engine expects
  const executiveBranchInput = {
    pharmacyId:         input.branchId,
    pharmacyName:       input.branchName,
    pharmacyCode:       input.branchCode,
    region:             input.region,
    mtdEntries:         input.entries,
    historicalEntries:  input.historicalEntries ?? [],
    target:             input.target,
    pharmacistCount:    input.pharmacistCount,
    submittedToday:     input.submittedToday,
  }

  return computeExecutiveScore(executiveBranchInput as any).adjusted
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — OVERALL ACHIEVEMENT
// ══════════════════════════════════════════════════════════════

/**
 * Compute weighted overall achievement % from KPI rollup summaries.
 * Excludes KPIs with no target (hasTarget = false) from the weighted average.
 */
function computeOverallAchPct(kpiSummaries: KpiRollupSummary[]): number {
  // Build a partial KpiStats map from rollup summaries for the existing utility
  const kpiStatsMap: Partial<Record<string, KpiStats>> = {}

  for (const k of kpiSummaries) {
    if (!k.hasTarget) continue
    kpiStatsMap[k.kpiKey] = {
      kpiKey:            k.kpiKey,
      actual:            k.actual,
      target:            k.target,
      achievementPct:    k.achievementPct,
      expectedPct:       k.expectedPct,
      delta:             k.delta,
      remainingToTarget: k.remainingToTarget,
      status:            k.status,
      colors:            { color: '', bg: '', border: '', label: '', labelAr: '', icon: '' },
    }
  }

  return computeOverallAchievement(kpiStatsMap as any, KPI_WEIGHTS)
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Generate a fully resolved BranchRollupSummary.
 *
 * @param input  - Raw branch data (entries, target, history)
 * @param period - The reporting period (dates + dayRatio)
 * @returns      Immutable BranchRollupSummary — safe to cache and compose
 *
 * @example
 * const summary = generateBranchRollup(input, period)
 * // → summary.kpiAchievementSummary[0].achievementPct
 * // → summary.riskLevel  ('ON_TRACK' | 'LOW_RISK' | ...)
 * // → summary.dataQualityFlags  ([{ code: 'NO_TARGET', ... }])
 */
export function generateBranchRollup(
  input:  BranchRollupInput,
  period: RegionalPeriod,
): BranchRollupSummary {
  // Compute in dependency order
  const dataQualityFlags     = buildDataQualityFlags(input, period)
  const kpiAchievementSummary = buildKpiRollupSummaries(input, period)
  const overallAchievementPct = computeOverallAchPct(kpiAchievementSummary)
  const branchScore           = computeBranchScore(input)
  const riskLevel             = deriveRiskLevel(kpiAchievementSummary)
  const momentumDirection     = deriveMomentumDirection(input)
  const operationalStatus     = deriveOperationalStatus(input, dataQualityFlags)
  const submissionRatePct     = computeSubmissionRatePct(input)
  const hasDataErrors         = dataQualityFlags.some((f) => f.severity === 'ERROR')

  return {
    branchId:              input.branchId,
    branchName:            input.branchName,
    branchCode:            input.branchCode,
    region:                input.region,
    period,
    kpiAchievementSummary,
    overallAchievementPct,
    branchScore,
    riskLevel,
    momentumDirection,
    operationalStatus,
    dataQualityFlags,
    hasDataErrors,
    submissionRatePct,
    generatedAt: new Date().toISOString(),
  }
}
