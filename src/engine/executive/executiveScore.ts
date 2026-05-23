// ============================================================
// Executive Score Engine
// Computes composite branch score (0–100) + letter grade.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  computeKpiStats, computeOverallAchievement,
  computePace, computeTrendDirection,
  sumKpi, extractDailyValues, getDayProgress,
} from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import {
  type ExecutiveScore,
  type ExecutiveGrade,
  type KpiScoreBreakdown,
  GRADE_THRESHOLDS,
} from './executiveTypes'

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
export function computeExecutiveScore(branch: BranchInput): ExecutiveScore {
  const dp = getDayProgress()

  // Per-KPI breakdown
  const kpiBreakdown: KpiScoreBreakdown[] = KPI_KEYS.map((kpiKey) => {
    const actual = sumKpi(branch.mtdEntries, kpiKey)
    const target = branch.target
      ? (branch.target[KPI_META[kpiKey].targetField as keyof typeof branch.target] as number ?? 0)
      : 0
    const stats  = computeKpiStats(actual, target, dp, kpiKey)
    const weight = KPI_WEIGHTS[kpiKey]

    return {
      kpiKey,
      label:          KPI_META[kpiKey].en,
      actual,
      target,
      achievementPct: stats.achievementPct,
      status:         stats.status,
      weight,
      weightedScore:  stats.achievementPct * weight,
    }
  })

  // Weighted overall (same formula as kpiAnalyticsEngine)
  const kpiStatsMap = kpiBreakdown.reduce((acc, k) => {
    acc[k.kpiKey] = { achievementPct: k.achievementPct }
    return acc
  }, {} as Record<string, { achievementPct: number }>)

  const overall = computeOverallAchievement(kpiStatsMap as any)

  // Adjustments
  const submissionRate = submissionAdjustment(
    branch.submittedToday ?? branch.mtdEntries.length,
    branch.pharmacistCount ?? 1,
  )

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
