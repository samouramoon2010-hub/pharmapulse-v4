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
  findWeakestKpi, findStrongestKpi, computeOverallAchievement, safeReadTarget,
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey, type KpiKey } from '../kpiAnalyticsEngine'

// Protected Engines Migration Phase A — Team Intelligence Engine.
// registry is optional everywhere below: when omitted (the case at every
// current production call site), every function below uses the exact
// pre-migration legacy computation, byte-for-byte. When a registry IS
// supplied, sumPilotActual/readPilotTarget become the source only when
// parity is proven for that KPI against a real sample — otherwise they
// silently fall back to the same legacy computation. No call site has
// been changed to pass a registry yet; this phase only adds the capability.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

import type {
  PharmacistInput,
  PharmacistPerformanceSummary,
  KpiSnapshot,
  MomentumDirection,
  OperationalRisk,
  CoachingPriority,
} from './teamIntelligenceTypes'

// ── PT-2: personal target resolver ───────────────────────────
//
// Returns the effective target value for a KPI key, preferring the
// pharmacist's personal target when available and falling back to the
// branch target. This is the single resolution point — no other part
// of this engine needs to know about personal targets directly.
//
// personalTarget.targets is keyed by targetFieldName (e.g. 'wasfatyTarget').
// KPI_META[k].targetField is the same naming scheme.
// Direct field access is safe here because KPI_META covers all KPI_KEYS.
function resolveTargetValue(
  kpiKey:         KpiKey,
  branchTarget:   import('../kpiAnalyticsEngine').MonthlyTarget | null,
  personalTarget: import('../../services/personalTargetService').PersonalTargetDoc | null | undefined,
  registry?:      KpiRegistry,
  policy?:        PilotPolicy,
): number {
  // Personal target takes precedence when present and non-zero
  if (personalTarget?.targets) {
    const fieldName = getKpiMetaForKey(kpiKey, registry).targetField
    const personal  = personalTarget.targets[fieldName]
    if (personal != null && personal > 0) return personal
    // Personal target exists but this field is zero/missing → use zero
    // (the manager explicitly gave this pharmacist no target for this KPI)
    if (personal != null) return 0
  }
  // Fall back to branch target
  if (!branchTarget) return 0
  const legacyRead = () => safeReadTarget(branchTarget as any, getKpiMetaForKey(kpiKey, registry).targetField)
  if (registry && policy) {
    return readPilotTarget(branchTarget as any, kpiKey, registry, policy, legacyRead)
  }
  return legacyRead()
}

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
  entries:  PharmacistInput['mtdEntries'],
  kpiKey:   KpiKey,
  now:      Date,
  days:     number,
  registry?: KpiRegistry,
  policy?:   PilotPolicy,
): number[] {
  return Array.from({ length: days }, (_, i) => {
    const d = format(subDays(now, days - 1 - i), 'yyyy-MM-dd')
    const dayEntries = entries.filter(e => e.date === d)
    if (registry && policy) {
      return sumPilotActual(dayEntries as Record<string, unknown>[], kpiKey, registry, policy)
    }
    return dayEntries.reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  })
}

// ── Consistency score ─────────────────────────────────────────
// Combines submission regularity (0..1) with low daily variance (0..1)
export function computeConsistencyScore(
  input:     PharmacistInput,
  now:       Date = new Date(),
  registry?: KpiRegistry,
  policy?:   PilotPolicy,
): number {
  const submissionRate = input.expectedSubmissionDays > 0
    ? input.actualSubmissionDays / input.expectedSubmissionDays
    : 0

  // Average CV across KPIs from last 14 days
  const hist = input.historicalEntries ?? input.mtdEntries
  const keys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const avgCV = keys.reduce((sum, k) => {
    const vals = dailyKpi(hist, k, now, 14, registry, policy)
    return sum + cv(vals)
  }, 0) / keys.length

  // Score: high submission rate × low variance
  const varianceScore = Math.max(0, 1 - Math.min(avgCV, 1))
  return Math.round(submissionRate * varianceScore * 100)
}

// ── Momentum direction ────────────────────────────────────────
export function computePharmacistMomentum(
  input: PharmacistInput,
  now:   Date = new Date(),
  registry?: KpiRegistry,
  policy?:   PilotPolicy,
): { direction: MomentumDirection; delta: number } {
  const hist = input.historicalEntries ?? input.mtdEntries

  // Use the primary KPI (wasfaty by weight) for momentum direction
  const primary = 'wasfaty'
  const vals14  = dailyKpi(hist, primary, now, 14, registry, policy)

  const thisWeek = ema(vals14.slice(7))
  const prevWeek = ema(vals14.slice(0, 7))

  const delta = prevWeek > 0
    ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100)
    : 0

  // Cross-KPI weighted momentum
  const momentumKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiDeltas = momentumKeys.map(k => {
    const v = dailyKpi(hist, k, now, 14, registry, policy)
    const tw = ema(v.slice(7))
    const pw = ema(v.slice(0, 7))
    const weight = registry ? getKpiWeightForKey(k, registry) : (KPI_WEIGHTS[k] ?? 0.2)
    return pw > 0 ? ((tw - pw) / pw) * 100 * weight : 0
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
): KpiKey[] {
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
  registry?: KpiRegistry,
  policy?:   PilotPolicy,
): boolean {
  const hist = input.historicalEntries ?? input.mtdEntries
  if (hist.length < 6) return false
  if (!input.target) return false

  // Use momentum direction: last 7 days vs prior 7 days (normalized by target)
  const dp = getDayProgress(now)

  // Compute achievement in last 7 days vs prior 7 days per KPI
  const improvingKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const recentAch = improvingKeys.reduce((sum, k) => {
    const last7   = hist.slice(-7)
    const prior7  = hist.slice(-14, -7)
    const tgt     = resolveTargetValue(k, input.target, input.personalTarget, registry, policy)
    if (!tgt || !prior7.length) return sum
    const recentRate = (registry && policy
      ? sumPilotActual(last7 as Record<string, unknown>[], k, registry, policy)
      : sumKpi(last7, k)) / Math.max(last7.length, 1)
    const priorRate  = (registry && policy
      ? sumPilotActual(prior7 as Record<string, unknown>[], k, registry, policy)
      : sumKpi(prior7, k)) / Math.max(prior7.length, 1)
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
  input:     PharmacistInput,
  now:       Date = new Date(),
  registry?: KpiRegistry,
): PharmacistPerformanceSummary {
  const dp    = getDayProgress(now)
  const month = format(now, 'yyyy-MM')

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy = registry
    ? buildPilotPolicy(input.mtdEntries[0] ?? null, input.target ?? null, registry, 'branchIntelligence')
    : undefined

  // Per-KPI snapshots — PT-2: uses personal target when present, branch target as fallback
  // Core KPI Dependency Removal — Stage F: widen to every active
  // production_evaluation KPI when a registry is supplied; identical to
  // before (5 Core keys only) when absent.
  const snapshotKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiSnapshots: KpiSnapshot[] = snapshotKeys.map(k => {
    const actual         = registry && policy
      ? sumPilotActual(input.mtdEntries as Record<string, unknown>[], k, registry, policy)
      : sumKpi(input.mtdEntries, k)
    const target         = resolveTargetValue(k, input.target, input.personalTarget, registry, policy)
    const achievementPct = computeAchievementPct(actual, target)
    const status         = getTrafficLight(achievementPct, dp.ratio)

    // B1 — Required Daily Units
    const remaining      = Math.max(0, target - actual)
    const requiredPerDay = (() => {
      if (target <= 0)              return 0   // no target set
      if (remaining <= 0)           return 0   // already achieved
      if (dp.daysRemaining <= 0)    return 0   // month ended
      const raw = remaining / dp.daysRemaining
      return Math.round(raw * 10) / 10         // 1 decimal place
    })()
    const expectedToDate = target > 0
      ? Math.round(target * dp.ratio * 10) / 10
      : 0
    const paceStatus: KpiSnapshot['paceStatus'] = (() => {
      if (target <= 0)           return 'achieved'  // no target → treat as achieved
      if (remaining <= 0)        return 'achieved'
      if (actual >= expectedToDate * 1.05) return 'ahead'
      if (actual >= expectedToDate * 0.95) return 'on_track'
      if (dp.daysRemaining <= 0)            return 'critical'
      const ratio = dp.daysRemaining > 0
        ? (actual / Math.max(1, dp.currentDay)) / (target / Math.max(1, dp.totalDays))
        : 0
      if (ratio >= 0.9)  return 'behind'
      return 'critical'
    })()

    return { kpiKey: k, label: getKpiMetaForKey(k, registry).en, actual, target, achievementPct, status,
             remaining, requiredPerDay, expectedToDate, paceStatus }
  })

  // Weighted overall achievement
  const kpiStatsMap = Object.fromEntries(
    kpiSnapshots.map(s => [s.kpiKey, { achievementPct: s.achievementPct }])
  )
  const overallAchPct = Math.round(
    snapshotKeys.reduce((sum, k) => {
      const weight = registry ? getKpiWeightForKey(k, registry) : (KPI_WEIGHTS[k] ?? 0.2)
      return sum + (kpiStatsMap[k]?.achievementPct ?? 0) * weight
    }, 0)
  )
  const performanceScore = Math.min(100, overallAchPct)

  // Strongest / weakest
  const strongestKpi = snapshotKeys.reduce((best, k) =>
    (kpiStatsMap[k]?.achievementPct ?? 0) > (kpiStatsMap[best]?.achievementPct ?? 0) ? k : best, snapshotKeys[0])
  const weakestKpi   = snapshotKeys.reduce((worst, k) =>
    (kpiStatsMap[k]?.achievementPct ?? Infinity) < (kpiStatsMap[worst]?.achievementPct ?? Infinity) ? k : worst, snapshotKeys[0])

  // Consistency + momentum
  const consistencyScore = computeConsistencyScore(input, now, registry, policy)
  const { direction: momentumDirection, delta: momentumDelta } = computePharmacistMomentum(input, now, registry, policy)

  // Operational risk + coaching
  const operationalRisk  = deriveOperationalRisk(performanceScore, consistencyScore, momentumDirection)
  const coachingPriority = deriveCoachingPriority(operationalRisk, momentumDirection, performanceScore)
  const coachingFocusAreas = deriveCoachingFocusAreas(kpiSnapshots)

  // Submission reliability
  const submissionRate = input.expectedSubmissionDays > 0
    ? Math.round((input.actualSubmissionDays / input.expectedSubmissionDays) * 100)
    : 0
  const missedDays = Math.max(0, input.expectedSubmissionDays - input.actualSubmissionDays)

  const improvingAfterSupport = detectImprovingAfterSupport(input, now, registry, policy)

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
