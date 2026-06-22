// ============================================================
// Live Momentum Engine v2
// Phase 2: smoothing, anomaly detection, confidence scoring.
// Pure function — no Firebase, no React.
// ============================================================

import { format, subDays } from 'date-fns'
import { KPI_KEYS, getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey } from '../kpiAnalyticsEngine'
import type { LiveAnalyticsInput } from './liveAnalyticsTypes'
import type { KpiMomentumSignal, BranchMomentum, MomentumDirection } from './liveAnalyticsTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'

// Protected Engines Migration Phase D — Live Analytics (Momentum).
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. Per-day actual reads are routed
// through the Dynamic Reader only where proven parity holds against a
// real sample; otherwise they fall back to the exact pre-migration
// computation. Momentum formulas are completely untouched. No call site
// passes a registry yet.
import { buildPilotPolicy, sumPilotActual, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

// ── Direction mapping ─────────────────────────────────────────
function toDirection(pct: number): MomentumDirection {
  if (pct >= 15)   return 'surging'
  if (pct >= 3)    return 'improving'
  if (pct >= -3)   return 'stable'
  if (pct >= -15)  return 'cooling'
  return 'stalling'
}

// ── 3-period Exponential Moving Average (EMA) ────────────────
// Smooths volatile day-to-day changes
function computeEMA(values: number[], alpha = 0.4): number {
  if (!values.length) return 0
  return values.reduce((ema, v, i) =>
    i === 0 ? v : alpha * v + (1 - alpha) * ema,
    values[0]
  )
}

// ── IQR-based anomaly detection ──────────────────────────────
// Flags a day's value as an anomaly if it's an outlier vs recent distribution
function isOutlier(value: number, population: number[]): boolean {
  if (population.length < 5) return false
  const sorted = [...population].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  if (iqr === 0) return false
  return value < q1 - 2.5 * iqr || value > q3 + 2.5 * iqr
}

// ── Momentum confidence: based on data density + consistency ─
function computeConfidence(values: number[]): number {
  const nonZero = values.filter((v) => v > 0).length
  const density = nonZero / Math.max(values.length, 1)

  // Need at least 5 days of real data for meaningful momentum
  if (nonZero < 3) return 0.2
  if (nonZero < 5) return 0.5
  return Math.min(0.95, 0.5 + density * 0.45)
}

// ── Consecutive-streak detection ─────────────────────────────
function computeStreak(values: number[]): { days: number; direction: 'up' | 'down' | 'none' } {
  if (values.length < 2) return { days: 0, direction: 'none' }
  const rev = [...values].reverse()
  let days = 0
  let dir: 'up' | 'down' | 'none' = 'none'
  for (let i = 0; i < rev.length - 1; i++) {
    const cur = rev[i], prv = rev[i + 1]
    const currDir = cur > prv ? 'up' : 'down'
    if (i === 0) { dir = currDir; days = 1; continue }
    if (currDir !== dir) break
    days++
  }
  return { days, direction: dir }
}

// ── Sustained trend: N consecutive days above/below rolling avg ──
function computeSustainedDays(values: number[]): number {
  if (values.length < 3) return 0
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const rev = [...values].reverse()
  let count = 0
  const firstAbove = rev[0] > avg
  for (const v of rev) {
    if ((v > avg) === firstAbove) count++
    else break
  }
  return count
}

// ── Day values for last N days ────────────────────────────────
function getDailyValues(
  mtdEntries: LiveAnalyticsInput['mtdEntries'],
  kpiKey:     KpiKey,
  now:        Date,
  n:          number,
  registry?:  KpiRegistry,
  policy?:    PilotPolicy,
): number[] {
  return Array.from({ length: n }, (_, i) => {
    const d = format(subDays(now, n - 1 - i), 'yyyy-MM-dd')
    const dayEntries = mtdEntries.filter((e) => e.date === d)
    return registry && policy
      ? sumPilotActual(dayEntries as Record<string, unknown>[], kpiKey, registry, policy)
      : dayEntries.reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  })
}

// ── Per-KPI momentum signal (v2) ──────────────────────────────
function computeKpiMomentum(
  kpiKey:     KpiKey,
  mtdEntries: LiveAnalyticsInput['mtdEntries'],
  now:        Date,
  registry?:  KpiRegistry,
  policy?:    PilotPolicy,
): KpiMomentumSignal {
  const daily14 = getDailyValues(mtdEntries, kpiKey, now, 14, registry, policy)
  const daily7  = daily14.slice(7)
  const prev7   = daily14.slice(0, 7)

  // Raw today vs yesterday
  const todayVal = getDailyValues(mtdEntries, kpiKey, now, 1, registry, policy)[0] || 0
  const yestVal  = daily14[12] || 0
  const todayVsYesterday = yestVal > 0
    ? Math.round(((todayVal - yestVal) / yestVal) * 100)
    : 0

  // Anomaly detection: is today an outlier?
  const todayIsAnomaly = isOutlier(todayVal, daily14.slice(0, 13))

  // Smoothed week-over-week using EMA instead of raw sum
  const thisWeekEMA = computeEMA(daily7)
  const prevWeekEMA = computeEMA(prev7)
  const smoothedDelta = prevWeekEMA > 0
    ? Math.round(((thisWeekEMA - prevWeekEMA) / prevWeekEMA) * 100)
    : 0

  // Remove outliers before computing direction
  const cleanedDaily7 = daily7.map((v, i) =>
    isOutlier(v, daily14) ? (daily7[i - 1] ?? v) : v
  )
  const cleanedEMA = computeEMA(cleanedDaily7)
  const cleanedSmoothed = prevWeekEMA > 0
    ? Math.round(((cleanedEMA - prevWeekEMA) / prevWeekEMA) * 100)
    : 0

  const direction     = toDirection(cleanedSmoothed)
  const streak        = computeStreak(daily14)
  const confidence    = computeConfidence(daily14)
  const sustainedDays = computeSustainedDays(daily14)

  return {
    kpiKey,
    label:              getKpiMetaForKey(kpiKey, registry).en,
    direction,
    todayVsYesterday:   todayIsAnomaly ? 0 : todayVsYesterday,  // suppress anomaly
    weekVsPrevWeek:     smoothedDelta,
    streakDays:         streak.days,
    streakDirection:    streak.direction,
    momentumConfidence: confidence,
    isAnomaly:          todayIsAnomaly,
    smoothedDelta:      cleanedSmoothed,
    sustainedDays,
  }
}

// ── Branch-level momentum summary ────────────────────────────
export function computeLiveMomentum(input: LiveAnalyticsInput, registry?: KpiRegistry): BranchMomentum {
  const { mtdEntries, pharmacyId, now } = input

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(mtdEntries[0] ?? null, input.target ?? null, registry, 'liveAnalytics')
    : undefined

  // Core KPI Dependency Removal — Stage F: kpiMomentum widens to every
  // active production_evaluation KPI for display when a registry is
  // supplied. The aggregate fields below (overallDirection/overallDelta/
  // dominantKpi) are weight-gated — only KPIs with registry weight > 0
  // contribute — so they stay byte-identical with the live
  // DEFAULT_KPI_REGISTRY today (every non-Core KPI there has weight 0).
  const momentumKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiMomentum = momentumKeys.map((k) =>
    computeKpiMomentum(k, mtdEntries, now, registry, policy)
  )
  const weightedMomentum = registry
    ? kpiMomentum.filter((m) => getKpiWeightForKey(m.kpiKey, registry) > 0)
    : kpiMomentum

  // Weight average by confidence (low-confidence KPIs contribute less)
  const totalWeight = weightedMomentum.reduce((s, m) => s + m.momentumConfidence, 0) || 1
  const weightedDelta = weightedMomentum.reduce(
    (s, m) => s + m.smoothedDelta * m.momentumConfidence, 0
  ) / totalWeight

  const overallDirection = toDirection(Math.round(weightedDelta))

  // A malformed/empty registry can legitimately produce an empty
  // momentumKeys list (getProductionEngineKeys' deliberate contract for
  // {} — see Stage F Phase 3) — guard against reducing over no elements.
  const dominantPool = weightedMomentum.length ? weightedMomentum : kpiMomentum
  const dominantKpi = dominantPool.length
    ? dominantPool.reduce((best, m) =>
        Math.abs(m.smoothedDelta) > Math.abs(best.smoothedDelta) ? m : best,
        dominantPool[0],
      ).kpiKey
    : 'wasfaty'

  return {
    pharmacyId,
    overallDirection,
    overallDelta: Math.round(weightedDelta),
    kpiMomentum,
    dominantKpi,
  }
}
