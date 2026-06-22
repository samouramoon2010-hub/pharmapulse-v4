// ============================================================
// Executive Score Engine
// Computes composite branch score (0–100) + letter grade.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_WEIGHTS,
  computeKpiStats, computeOverallAchievement,
  computePace, computeTrendDirection,
  sumKpi, extractDailyValues, getDayProgress,
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey,
} from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import {
  type ExecutiveScore,
  type ExecutiveGrade,
  type KpiScoreBreakdown,
  GRADE_THRESHOLDS,
} from './executiveTypes'

// Protected Engines Migration Phase C — Executive BI.
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. kpiBreakdown's actual/target reads
// are routed through the Dynamic Reader only where proven parity holds for
// the live registry sample; otherwise they fall back to the exact
// pre-migration computation. The overall/adjusted score formulas below are
// derived only from kpiBreakdown, so parity-gated reads cannot change the
// score whenever parity actually holds — and no call site passes a
// registry yet, so production is unaffected.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

// ── Grade from score ──────────────────────────────────────────
export function scoreToGrade(score: number): ExecutiveGrade {
  if (score >= GRADE_THRESHOLDS.A) return 'A'
  if (score >= GRADE_THRESHOLDS.B) return 'B'
  if (score >= GRADE_THRESHOLDS.C) return 'C'
  if (score >= GRADE_THRESHOLDS.D) return 'D'
  return 'F'
}

/** Map grade to display color (CSS var-compatible) */
export const GRADE_COLORS: Record<ExecutiveGrade, string> = {
  A: '#22c55e',
  B: '#00d2ad',
  C: '#f59e0b',
  D: '#f97316',
  F: '#ef4444',
}

export const GRADE_BG: Record<ExecutiveGrade, string> = {
  A: 'rgba(34,197,94,0.08)',
  B: 'rgba(0,210,173,0.08)',
  C: 'rgba(245,158,11,0.08)',
  D: 'rgba(249,115,22,0.08)',
  F: 'rgba(239,68,68,0.08)',
}

export const GRADE_BORDER: Record<ExecutiveGrade, string> = {
  A: 'rgba(34,197,94,0.2)',
  B: 'rgba(0,210,173,0.2)',
  C: 'rgba(245,158,11,0.2)',
  D: 'rgba(249,115,22,0.2)',
  F: 'rgba(239,68,68,0.2)',
}

// ── Submission rate bonus/penalty ─────────────────────────────
function submissionAdjustment(
  submittedToday: number,
  totalPharmacists: number,
): number {
  if (!totalPharmacists) return 0
  const rate = submittedToday / totalPharmacists
  if (rate >= 0.9)  return +5
  if (rate >= 0.7)  return  0
  if (rate >= 0.5)  return -5
  return -10
}

// ── Consistency bonus/penalty (based on coefficient of variation) ──
function consistencyAdjustment(dailyValues: number[]): number {
  if (dailyValues.length < 5) return 0
  const nonZero = dailyValues.filter((v) => v > 0)
  if (!nonZero.length) return 0
  const mean   = nonZero.reduce((s, v) => s + v, 0) / nonZero.length
  if (!mean) return 0
  const variance = nonZero.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZero.length
  const cv = Math.sqrt(variance) / mean
  if (cv <= 0.2)  return +5
  if (cv <= 0.5)  return  0
  return -5
}

// ── Trend adjustment ──────────────────────────────────────────
function trendAdjustment(direction: string): number {
  switch (direction) {
    case 'ACCELERATING':  return +5
    case 'IMPROVING':     return +2
    case 'STABLE':        return  0
    case 'DECLINING':     return -2
    case 'DETERIORATING': return -5
    default:              return  0
  }
}

// ── Main scoring function ─────────────────────────────────────
// registry is optional at this pure-function layer for backward
// compatibility with its large existing test suite (no test may be
// weakened). Core KPI Dependency Removal — No Silent Core Fallback
// Closure: every ACTIVE PRODUCTION caller resolves and passes the live
// registry at the orchestrator/hook boundary (see requireLiveRegistry()
// in engine/kpiRegistry/registryGuard.ts) — this optional parameter is
// exercised with `undefined` only by historical-compatibility tests.
export function computeExecutiveScore(branch: BranchInput, registry?: KpiRegistry): ExecutiveScore {
  const dp = getDayProgress()

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(branch.mtdEntries[0] ?? null, branch.target ?? null, registry, 'executiveBI')
    : undefined

  // Per-KPI breakdown.
  // Core KPI Dependency Removal — Stage F: widens to every active
  // production_evaluation KPI when a registry is supplied; identical to
  // before (5 Core keys only) when absent. weightedScore is naturally
  // weight-gated — a KPI with registry weight 0 (every current non-Core
  // production KPI) contributes 0 to the overall score regardless of its
  // achievementPct, so this widening is zero-drift today.
  const breakdownKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiBreakdown: KpiScoreBreakdown[] = breakdownKeys.map((kpiKey) => {
    const actual = registry && policy
      ? sumPilotActual(branch.mtdEntries as Record<string, unknown>[], kpiKey, registry, policy)
      : sumKpi(branch.mtdEntries, kpiKey)
    // Safe target extraction — parse strings, exclude NaN/negative
    const legacyTarget = () => {
      const rawT = branch.target
        ? branch.target[getKpiMetaForKey(kpiKey, registry).targetField as keyof typeof branch.target]
        : undefined
      const tgtN = typeof rawT === 'string' ? parseFloat(rawT) : Number(rawT ?? 0)
      return (isNaN(tgtN) || !isFinite(tgtN) || tgtN <= 0) ? 0 : tgtN
    }
    const target = registry && policy
      ? readPilotTarget(branch.target as Record<string, unknown> | null | undefined, kpiKey, registry, policy, legacyTarget)
      : legacyTarget()
    const stats  = computeKpiStats(actual, target, dp, kpiKey)
    const weight = registry ? getKpiWeightForKey(kpiKey, registry) : KPI_WEIGHTS[kpiKey]

    return {
      kpiKey,
      label:          getKpiMetaForKey(kpiKey, registry).en,
      actual,
      target,
      achievementPct: stats.achievementPct,
      status:         stats.status,
      weight,
      weightedScore:  stats.achievementPct * weight,
    }
  })

  // Weighted overall (same formula as kpiAnalyticsEngine)
  // FIX: include target so computeOverallAchievement passes the !stat.target guard.
  // Without target, every KPI was excluded → overall = 0 always.
  const kpiStatsMap = kpiBreakdown.reduce((acc, k) => {
    acc[k.kpiKey] = { achievementPct: k.achievementPct, target: k.target }
    return acc
  }, {} as Record<string, { achievementPct: number; target: number }>)

  const overall = computeOverallAchievement(kpiStatsMap as any, KPI_WEIGHTS, false, registry)

  // Adjustments
  // Submission rate: prefer explicit fields, fall back to distinct userId count
  const distinctSubmitters = new Set(branch.mtdEntries.map(e => e.userId)).size
  const totalPharmacists   = branch.pharmacistCount ?? Math.max(1, distinctSubmitters)
  const submittedCount     = branch.submittedToday ?? distinctSubmitters

  if (import.meta.env.DEV) {
    console.debug(`[EXEC_SCORE] pharmacy=${branch.pharmacyId} submitters=${submittedCount}/${totalPharmacists} (distinct=${distinctSubmitters})`)
  }

  const submissionRate = submissionAdjustment(submittedCount, totalPharmacists)

  // Consistency from historical wasfaty (representative KPI)
  const historicalVals = branch.historicalEntries
    ? extractDailyValues(branch.historicalEntries, 'wasfaty')
    : []
  const consistency = consistencyAdjustment(historicalVals)

  // Trend from historical entries
  const trendDir = historicalVals.length >= 4
    ? computeTrendDirection(historicalVals)
    : 'STABLE'
  const trend = trendAdjustment(trendDir)

  const adjustments = { submissionRate, consistency, trend }
  const adjusted    = Math.min(100, Math.max(0, overall + submissionRate + consistency + trend))

  return {
    overall,
    grade: scoreToGrade(adjusted),
    kpiBreakdown,
    adjustments,
    adjusted,
  }
}
