// ============================================================
// Pharmacist Performance Engine
// Generates operational performance summary per pharmacist.
// Pure function — no Firebase, no React.
//
// Language: supportive and operational, not evaluative.
// ============================================================

import { format, subDays } from 'date-fns'
import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  computeKpiStats, computePace, getDayProgress,
  sumKpi, computeAchievementPct, getTrafficLight,
  findWeakestKpi, findStrongestKpi, computeOverallAchievement, safeReadTarget } from '../kpiAnalyticsEngine'

import type {
  PharmacistInput,
  PharmacistPerformanceSummary,
  KpiSnapshot,
  MomentumDirection,
  OperationalRisk,
  CoachingPriority,
} from './teamIntelligenceTypes'

// ── EMA smoother ──────────────────────────────────────────────
function ema(values: number[], alpha = 0.4): number {
  if (!values.length) return 0
  return values.reduce((e, v, i) => i === 0 ? v : alpha * v + (1 - alpha) * e, values[0])
}

// ── Coefficient of variation ──────────────────────────────────
function cv(values: number[]): number {
  const nz = values.filter(v => v > 0)
  if (nz.length < 2) return 0
  const mean = nz.reduce((s, v) => s + v, 0) / nz.length
  if (!mean) return 0
  const variance = nz.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nz.length
  return Math.sqrt(variance) / mean
}

// ── Daily values for a KPI ────────────────────────────────────
function dailyKpi(
  entries: PharmacistInput['mtdEntries'],
  kpiKey:  typeof KPI_KEYS[number],
  now:     Date,
  days:    number,
): number[] {
  return Array.from({ length: days }, (_, i) => {
    const d = format(subDays(now, days - 1 - i), 'yyyy-MM-dd')
    return entries.filter(e => e.date === d).reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  })
}

// ── Consistency score ─────────────────────────────────────────
// Combines submission regularity (0..1) with low daily variance (0..1)
export function computeConsistencyScore(
  input:     PharmacistInput,
  now:       Date = new Date(),
): number {
  const submissionRate = input.expectedSubmissionDays > 0
    ? input.actualSubmissionDays / input.expectedSubmissionDays
    : 0

  // Average CV across KPIs from last 14 days
  const hist = input.historicalEntries ?? input.mtdEntries
  const avgCV = KPI_KEYS.reduce((sum, k) => {
    const vals = dailyKpi(hist, k, now, 14)
    return sum + cv(vals)
  }, 0) / KPI_KEYS.length

  // Score: high submission rate × low variance
  const varianceScore = Math.max(0, 1 - Math.min(avgCV, 1))
  return Math.round(submissionRate * varianceScore * 100)
}

// ── Momentum direction ────────────────────────────────────────
export function computePharmacistMomentum(
  input: PharmacistInput,
  now:   Date = new Date(),
): { direction: MomentumDirection; delta: number } {
  const hist = input.historicalEntries ?? input.mtdEntries

  // Use the primary KPI (wasfaty by weight) for momentum direction
  const primary = 'wasfaty'
  const vals14  = dailyKpi(hist, primary, now, 14)

  const thisWeek = ema(vals14.slice(7))
  const prevWeek = ema(vals14.slice(0, 7))

  const delta = prevWeek > 0
    ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100)
    : 0

  // Cross-KPI weighted momentum
  const kpiDeltas = KPI_KEYS.map(k => {
    const v = dailyKpi(hist, k, now, 14)
    const tw = ema(v.slice(7))
    const pw = ema(v.slice(0, 7))
    return pw > 0 ? ((tw - pw) / pw) * 100 * (KPI_WEIGHTS[k] ?? 0.2) : 0
  })
  const weightedDelta = Math.round(kpiDeltas.reduce((s, v) => s + v, 0))

  const direction: MomentumDirection =
    weightedDelta >= 15  ? 'accelerating'  :
    weightedDelta >= 3   ? 'improving'     :
    weightedDelta >= -3  ? 'stable'        :
    weightedDelta >= -15 ? 'cooling'       :
                           'needs_support'

  return { direction, delta: weightedDelta }
}

// ── Operational risk ──────────────────────────────────────────
function deriveOperationalRisk(
  performanceScore: number,
  consistencyScore: number,
  momentum:         MomentumDirection,
): OperationalRisk {
  if (performanceScore < 40 || (performanceScore < 55 && momentum === 'needs_support')) return 'high'
  if (performanceScore < 60 || consistencyScore < 40) return 'medium'
  if (performanceScore < 75 || consistencyScore < 60) return 'low'
  return 'none'
}

// ── Coaching priority ─────────────────────────────────────────
function deriveCoachingPriority(
  risk:     OperationalRisk,
  momentum: MomentumDirection,
  score:    number,
): CoachingPriority {
  if (risk === 'high')   return 'immediate'
  if (risk === 'medium') return 'near_term'
  if (score >= 85 && (momentum === 'accelerating' || momentum === 'improving')) return 'recognition'
  return 'routine'
}

// ── Coaching focus areas ──────────────────────────────────────
function deriveCoachingFocusAreas(
  snapshots: KpiSnapshot[],
): typeof KPI_KEYS[number][] {
  return snapshots
    .filter(s => s.achievementPct < 75 && s.target > 0)
    .sort((a, b) => a.achievementPct - b.achievementPct)
    .slice(0, 3)
    .map(s => s.kpiKey)
}

// ── Improvement detection (was low, now trending up) ──────────
function detectImprovingAfterSupport(
  input: PharmacistInput,
  now:   Date,
): boolean {
  const hist = input.historicalEntries ?? input.mtdEntries
  if (hist.length < 6) return false
  if (!input.target) return false

  // Use momentum direction: last 7 days vs prior 7 days (normalized by target)
  const dp = getDayProgress(now)

  // Compute achievement in last 7 days vs prior 7 days per KPI
  const recentAch = KPI_KEYS.reduce((sum, k) => {
    const last7   = hist.slice(-7)
    const prior7  = hist.slice(-14, -7)
    const tgt     = safeReadTarget(input.target as any, KPI_META[k].targetField)
    if (!tgt || !prior7.length) return sum
    const recentRate = sumKpi(last7, k) / Math.max(last7.length, 1)
    const priorRate  = sumKpi(prior7, k) / Math.max(prior7.length, 1)
    // Was below target pace in prior period?
    const targetDaily = tgt / 31
    const wasLow     = priorRate < targetDaily * 0.7
    const improving  = recentRate > priorRate * 1.15  // 15%+ improvement
    return sum + (wasLow && improving ? 1 : 0)
  }, 0)

  // Improving in at least 2 KPIs that were underperforming
  return recentAch >= 2
}

// ── Main function ─────────────────────────────────────────────
export function computePharmacistPerformance(
  input: PharmacistInput,
  now:   Date = new Date(),
): PharmacistPerformanceSummary {
  const dp    = getDayProgress(now)
  const month = format(now, 'yyyy-MM')

  // Per-KPI snapshots
  const kpiSnapshots: KpiSnapshot[] = KPI_KEYS.map(k => {
    const actual = sumKpi(input.mtdEntries, k)
    const target = input.target
      ? safeReadTarget(input.target as any, KPI_META[k].targetField)
      : 0
    const achievementPct = computeAchievementPct(actual, target)
    const status         = getTrafficLight(achievementPct, dp.ratio)
    return { kpiKey: k, label: KPI_META[k].en, actual, target, achievementPct, status }
  })

  // Weighted overall achievement
  const kpiStatsMap = Object.fromEntries(
    kpiSnapshots.map(s => [s.kpiKey, { achievementPct: s.achievementPct }])
  )
  const overallAchPct = Math.round(
    KPI_KEYS.reduce((sum, k) => sum + (kpiStatsMap[k]?.achievementPct ?? 0) * (KPI_WEIGHTS[k] ?? 0.2), 0)
  )
  const performanceScore = Math.min(100, overallAchPct)

  // Strongest / weakest
  const strongestKpi = KPI_KEYS.reduce((best, k) =>
    (kpiStatsMap[k]?.achievementPct ?? 0) > (kpiStatsMap[best]?.achievementPct ?? 0) ? k : best, KPI_KEYS[0])
  const weakestKpi   = KPI_KEYS.reduce((worst, k) =>
    (kpiStatsMap[k]?.achievementPct ?? Infinity) < (kpiStatsMap[worst]?.achievementPct ?? Infinity) ? k : worst, KPI_KEYS[0])

  // Consistency + momentum
  const consistencyScore = computeConsistencyScore(input, now)
  const { direction: momentumDirection, delta: momentumDelta } = computePharmacistMomentum(input, now)

  // Operational risk + coaching
  const operationalRisk  = deriveOperationalRisk(performanceScore, consistencyScore, momentumDirection)
  const coachingPriority = deriveCoachingPriority(operationalRisk, momentumDirection, performanceScore)
  const coachingFocusAreas = deriveCoachingFocusAreas(kpiSnapshots)

  // Submission reliability
  const submissionRate = input.expectedSubmissionDays > 0
    ? Math.round((input.actualSubmissionDays / input.expectedSubmissionDays) * 100)
    : 0
  const missedDays = Math.max(0, input.expectedSubmissionDays - input.actualSubmissionDays)

  const improvingAfterSupport = detectImprovingAfterSupport(input, now)

  return {
    userId:      input.userId,
    displayName: input.displayName,
    pharmacyId:  input.pharmacyId,
    performanceScore,
    consistencyScore,
    momentumDirection,
    momentumDelta,
    strongestKpi,
    weakestKpi,
    kpiSnapshots,
    overallAchPct,
    operationalRisk,
    coachingPriority,
    coachingFocusAreas,
    submissionRate,
    activeDays:    input.actualSubmissionDays,
    missedDays,
    improvingAfterSupport,
    isImproving:      improvingAfterSupport,      // alias
    scoreVsPrevious:  0,                           // Phase 3C: compute from history
    month,
    computedAt: new Date().toISOString(),
  }
}
