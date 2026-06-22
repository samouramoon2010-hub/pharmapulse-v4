// ============================================================
// Executive Risk Engine
// Generates risk flags and a composite risk profile per branch.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META,
  computeKpiStats, computePace, computeForecast,
  computeRiskLevel, getTrafficLight,
  sumKpi, extractDailyValues, getDayProgress, safeReadTarget,
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey } from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import type {
  BranchRiskProfile,
  RiskFlag,
  RiskCategory,
} from './executiveTypes'

import { RISK_WEIGHTS } from './executiveTypes'

// Protected Engines Migration Phase C — Risk Engine.
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. Actual/target reads used to build
// risk flags and the traffic-light risk level are routed through the
// Dynamic Reader only where proven parity holds against a real sample;
// otherwise they fall back to the exact pre-migration computation. Risk
// thresholds and formulas below are completely untouched. No call site
// passes a registry yet.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, readPilotActual, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

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
function buildRiskFlags(branch: BranchInput, registry?: KpiRegistry, policy?: PilotPolicy): RiskFlag[] {
  const flags: RiskFlag[] = []
  const dp = getDayProgress()

  // Core KPI Dependency Removal — Stage F: risk flags are weight-gated —
  // only KPIs actually promoted into the weighted composite (weight > 0)
  // generate risk flags. Every current production KPI besides the 5 Core
  // keys has weight 0 in the registry, so this is byte-identical to the
  // pre-Stage-F behavior today; a KPI only starts contributing risk flags
  // once it is genuinely promoted, mirroring computeOverallAchievement's
  // promotion gate.
  const riskKeys = registry
    ? getProductionEngineKeys(registry).filter((k) => getKpiWeightForKey(k, registry) > 0)
    : KPI_KEYS
  for (const kpiKey of riskKeys) {
    const label   = getKpiMetaForKey(kpiKey, registry).en
    const actual  = registry && policy
      ? sumPilotActual(branch.mtdEntries as Record<string, unknown>[], kpiKey, registry, policy)
      : sumKpi(branch.mtdEntries, kpiKey)
    const legacyTarget = () => branch.target
      ? safeReadTarget(branch.target as any, getKpiMetaForKey(kpiKey, registry).targetField)
      : 0
    const target  = registry && policy
      ? readPilotTarget(branch.target as Record<string, unknown> | null | undefined, kpiKey, registry, policy, legacyTarget)
      : legacyTarget()

    if (!target) continue  // skip KPIs with no target

    const stats    = computeKpiStats(actual, target, dp, kpiKey)
    const pace     = computePace(actual, target, dp)
    const hist     = branch.historicalEntries
      ? (registry && policy
          ? branch.historicalEntries.map((e) => readPilotActual(e as Record<string, unknown>, kpiKey, registry, policy))
          : extractDailyValues(branch.historicalEntries, kpiKey))
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
export function computeBranchRiskProfile(branch: BranchInput, registry?: KpiRegistry): BranchRiskProfile {
  const dp     = getDayProgress()

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(branch.mtdEntries[0] ?? null, branch.target ?? null, registry, 'riskEngine')
    : undefined

  const flags  = buildRiskFlags(branch, registry, policy)

  // Use engine V1 traffic-light based risk level (consistent).
  // Weight-gated for the same reason as buildRiskFlags above.
  const statusKeys = registry
    ? getProductionEngineKeys(registry).filter((k) => getKpiWeightForKey(k, registry) > 0)
    : KPI_KEYS
  const statuses = statusKeys.map((k) => {
    const actual = registry && policy
      ? sumPilotActual(branch.mtdEntries as Record<string, unknown>[], k, registry, policy)
      : sumKpi(branch.mtdEntries, k)
    const legacyTarget = () => branch.target
      ? safeReadTarget(branch.target as any, getKpiMetaForKey(k, registry).targetField)
      : 0
    const target = registry && policy
      ? readPilotTarget(branch.target as Record<string, unknown> | null | undefined, k, registry, policy, legacyTarget)
      : legacyTarget()
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
