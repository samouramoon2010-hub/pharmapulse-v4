// ============================================================
// Executive Risk Engine
// Generates risk flags and a composite risk profile per branch.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META,
  computeKpiStats, computePace, computeForecast,
  computeRiskLevel, getTrafficLight,
  sumKpi, extractDailyValues, getDayProgress, safeReadTarget } from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import type {
  BranchRiskProfile,
  RiskFlag,
  RiskCategory,
} from './executiveTypes'

import { RISK_WEIGHTS } from './executiveTypes'

// ── Threshold constants ───────────────────────────────────────
const THRESHOLDS = {
  achievementCritical: 50,  // < 50% achievement → critical
  achievementWarning:  75,  // < 75% achievement → warning
  submissionCritical:  0.5, // < 50% submission rate → critical
  submissionWarning:   0.7, // < 70% submission rate → warning
  paceRatioCritical:   0.5, // pace < 50% of required → critical
  paceRatioWarning:    0.7, // pace < 70% of required → warning
  forecastCritical:    60,  // forecast EOM < 60% → critical
  forecastWarning:     80,  // forecast EOM < 80% → warning
} as const

// ── Build risk flags for one branch ──────────────────────────
function buildRiskFlags(branch: BranchInput): RiskFlag[] {
  const flags: RiskFlag[] = []
  const dp = getDayProgress()

  for (const kpiKey of KPI_KEYS) {
    const label   = KPI_META[kpiKey].en
    const actual  = sumKpi(branch.mtdEntries, kpiKey)
    const target  = branch.target
      ? safeReadTarget(branch.target as any, KPI_META[kpiKey].targetField)
      : 0

    if (!target) continue  // skip KPIs with no target

    const stats    = computeKpiStats(actual, target, dp, kpiKey)
    const pace     = computePace(actual, target, dp)
    const hist     = branch.historicalEntries
      ? extractDailyValues(branch.historicalEntries, kpiKey)
      : undefined
    const forecast = computeForecast(actual, target, dp, hist)

    // ── Performance flags ──
    if (stats.achievementPct < THRESHOLDS.achievementCritical) {
      flags.push({
        category: 'PERFORMANCE',
        severity: 'HIGH',
        kpiKey,
        description: `${label} at ${stats.achievementPct}% — critically below target`,
        value: stats.achievementPct,
        threshold: THRESHOLDS.achievementCritical,
      })
    } else if (stats.achievementPct < THRESHOLDS.achievementWarning) {
      flags.push({
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        kpiKey,
        description: `${label} at ${stats.achievementPct}% — below expected pace`,
        value: stats.achievementPct,
        threshold: THRESHOLDS.achievementWarning,
      })
    }

    // ── Pace flags ──
    if (pace.requiredDailyPace > 0 && pace.paceRatio < THRESHOLDS.paceRatioCritical) {
      flags.push({
        category: 'PACE',
        severity: 'HIGH',
        kpiKey,
        description: `${label} pace is ${Math.round(pace.paceRatio * 100)}% of required — recovery at risk`,
        value: pace.paceRatio,
        threshold: THRESHOLDS.paceRatioCritical,
      })
    } else if (pace.requiredDailyPace > 0 && pace.paceRatio < THRESHOLDS.paceRatioWarning) {
      flags.push({
        category: 'PACE',
        severity: 'MEDIUM',
        kpiKey,
        description: `${label} pace needs acceleration (${pace.currentDailyRate}/day vs ${pace.requiredDailyPace} required)`,
        value: pace.paceRatio,
        threshold: THRESHOLDS.paceRatioWarning,
      })
    }

    // ── Forecast flags ──
    if (forecast.forecastAchPct < THRESHOLDS.forecastCritical) {
      flags.push({
        category: 'FORECAST',
        severity: 'HIGH',
        kpiKey,
        description: `${label} projected at ${forecast.forecastAchPct}% by month end`,
        value: forecast.forecastAchPct,
        threshold: THRESHOLDS.forecastCritical,
      })
    } else if (forecast.forecastAchPct < THRESHOLDS.forecastWarning) {
      flags.push({
        category: 'FORECAST',
        severity: 'MEDIUM',
        kpiKey,
        description: `${label} forecast ${forecast.forecastAchPct}% — below 80% target`,
        value: forecast.forecastAchPct,
        threshold: THRESHOLDS.forecastWarning,
      })
    }
  }

  // ── Submission rate flag ──
  // Use unique userIds in mtdEntries as fallback when submittedToday not provided
  const total = branch.pharmacistCount ?? Math.max(1, new Set(branch.mtdEntries.map(e => e.userId)).size)
  const submitted = branch.submittedToday
    ?? new Set(branch.mtdEntries.map(e => e.userId)).size  // count distinct submitters
  const rate = total > 0 ? Math.min(submitted / total, 1) : 0

  if (import.meta.env.DEV) {
    console.debug(`[SUBMISSION] pharmacy=${branch.pharmacyId} total=${total} submitted=${submitted} rate=${Math.round(rate*100)}%`)
  }

  if (rate < THRESHOLDS.submissionCritical) {
    flags.push({
      category: 'SUBMISSION',
      severity: 'HIGH',
      description: `Only ${Math.round(rate * 100)}% of pharmacists submitted today`,
      value: rate,
      threshold: THRESHOLDS.submissionCritical,
    })
  } else if (rate < THRESHOLDS.submissionWarning) {
    flags.push({
      category: 'SUBMISSION',
      severity: 'MEDIUM',
      description: `${Math.round(rate * 100)}% submission rate — some pharmacists missing`,
      value: rate,
      threshold: THRESHOLDS.submissionWarning,
    })
  }

  return flags
}

// ── Compute composite risk score ──────────────────────────────
function flagsToScore(flags: RiskFlag[]): number {
  return flags.reduce((score, flag) => {
    const base = RISK_WEIGHTS[flag.category] ?? 3
    const mult = flag.severity === 'HIGH' ? 2 : flag.severity === 'MEDIUM' ? 1 : 0.5
    return score + base * mult
  }, 0)
}

// ── Main function ─────────────────────────────────────────────
export function computeBranchRiskProfile(branch: BranchInput): BranchRiskProfile {
  const dp     = getDayProgress()
  const flags  = buildRiskFlags(branch)

  // Use engine V1 traffic-light based risk level (consistent)
  const statuses = KPI_KEYS.map((k) => {
    const actual = sumKpi(branch.mtdEntries, k)
    const target = branch.target
      ? safeReadTarget(branch.target as any, KPI_META[k].targetField)
      : 0
    const stats  = computeKpiStats(actual, target, dp, k)
    return stats.status
  })

  const riskLevel    = computeRiskLevel(statuses)
  const riskScore    = Math.min(Math.round(flagsToScore(flags)), 25)
  const criticalCount = flags.filter((f) => f.severity === 'HIGH').length
  const warningCount  = flags.filter((f) => f.severity === 'MEDIUM').length

  return {
    pharmacyId: branch.pharmacyId,
    riskLevel,
    riskScore,
    flags,
    criticalCount,
    warningCount,
  }
}
