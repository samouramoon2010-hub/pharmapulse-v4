// ============================================================
// KPI Health Engine v2
// Phase 2: adds 'recovering' and 'unstable' states.
// Uses momentum + consistency + historical variance.
// Pure function — no Firebase, no React.
// ============================================================

import { format, subDays } from 'date-fns'
import {
  KPI_KEYS, KPI_META,
  computeKpiStats, computePace, computeForecast,
  sumKpi, getDayProgress,
} from '../kpiAnalyticsEngine'

import type { LiveAnalyticsInput } from './liveAnalyticsTypes'
import type { KpiHealthSignal, KpiHealthState } from './liveAnalyticsTypes'

// ── Coefficient of variation (consistency measure) ────────────
function computeCV(values: number[]): number {
  const nonZero = values.filter((v) => v > 0)
  if (nonZero.length < 2) return 0
  const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length
  if (!mean) return 0
  const variance = nonZero.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZero.length
  return Math.sqrt(variance) / mean
}

// ── Detect recovery: was below expected, now improving ────────
function isRecovering(
  achievementPct: number,
  expectedPct:    number,
  recentValues:   number[],  // last 5 days
): boolean {
  if (achievementPct >= expectedPct) return false  // already on track → healthy
  if (recentValues.length < 3) return false

  // Check: last 3 days all positive AND increasing
  const last3 = recentValues.slice(-3)
  const allPositive = last3.every((v) => v > 0)
  const increasing  = last3[2] > last3[1] && last3[1] >= last3[0]
  const delta       = achievementPct - expectedPct

  return allPositive && increasing && delta >= -20  // behind but trend is up
}

// ── Detect instability: high variance in recent performance ──
function isUnstable(
  recentValues: number[],
  cv:           number,
): boolean {
  if (recentValues.length < 4) return false
  // High CV + alternating up/down pattern
  if (cv < 0.5) return false

  // Check alternating pattern (up-down-up or down-up-down)
  let alternations = 0
  for (let i = 1; i < recentValues.length; i++) {
    const prevDir = recentValues[i-1] > (recentValues[i-2] ?? recentValues[i-1]) ? 1 : -1
    const currDir = recentValues[i] > recentValues[i-1] ? 1 : -1
    if (i >= 2 && prevDir !== currDir) alternations++
  }
  return alternations >= 2
}

// ── Derive health state using full signal set ─────────────────
function deriveHealthState(
  achievementPct: number,
  expectedPct:    number,
  paceRatio:      number,
  recentValues:   number[],
  cv:             number,
): KpiHealthState {
  const delta = achievementPct - expectedPct

  // Check recovering first (was behind, now trending up)
  if (delta < 0 && isRecovering(achievementPct, expectedPct, recentValues)) {
    return 'recovering'
  }

  // Check instability (high variance regardless of position)
  if (isUnstable(recentValues, cv)) {
    return 'unstable'
  }

  // Standard states
  if (delta >= 0 && paceRatio >= 0.95) return 'healthy'
  if (delta >= -8 && paceRatio >= 0.75) return 'watch'
  if (delta >= -20 && paceRatio >= 0.5) return 'risk'
  return 'critical'
}

// ── Pulse: is today better than yesterday? ───────────────────
function computePulse(
  mtdEntries: LiveAnalyticsInput['mtdEntries'],
  kpiKey:     typeof KPI_KEYS[number],
  today:      string,
  yesterday:  string,
): { pulse: 'up' | 'down' | 'flat'; pulseValue: number } {
  const todayVal = mtdEntries.filter((e) => e.date === today)
    .reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  const yestVal  = mtdEntries.filter((e) => e.date === yesterday)
    .reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)

  if (!yestVal && !todayVal) return { pulse: 'flat', pulseValue: 0 }
  if (!yestVal)              return { pulse: 'up',   pulseValue: todayVal }

  const delta = todayVal - yestVal
  if (Math.abs(delta) < 1)   return { pulse: 'flat', pulseValue: 0 }
  return {
    pulse:      delta > 0 ? 'up' : 'down',
    pulseValue: Math.round((Math.abs(delta) / yestVal) * 100),
  }
}

// ── Get last N days of daily values for one KPI ──────────────
function getRecentDailyValues(
  mtdEntries: LiveAnalyticsInput['mtdEntries'],
  kpiKey:     typeof KPI_KEYS[number],
  now:        Date,
  n:          number,
): number[] {
  return Array.from({ length: n }, (_, i) => {
    const d = format(subDays(now, n - 1 - i), 'yyyy-MM-dd')
    return mtdEntries.filter((e) => e.date === d)
      .reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  })
}

// ── Main health computation ───────────────────────────────────
export function computeKpiHealth(input: LiveAnalyticsInput): KpiHealthSignal[] {
  const { mtdEntries, todayEntries, target, now } = input
  const dp        = getDayProgress(now)
  const today     = format(now, 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')

  return KPI_KEYS.map((k) => {
    const actual   = sumKpi(mtdEntries, k)
    const todayVal = sumKpi(todayEntries, k)
    const tgt      = target
      ? (Number((target as any)[KPI_META[k].targetField] ?? 0))
      : 0

    const stats    = computeKpiStats(actual, tgt, dp, k)
    const pace     = computePace(actual, tgt, dp)
    const forecast = computeForecast(actual, tgt, dp)

    // Recent daily values for trend analysis
    const recentValues = getRecentDailyValues(mtdEntries, k, now, 7)
    const cv           = computeCV(recentValues)

    const { pulse, pulseValue } = computePulse(mtdEntries, k, today, yesterday)

    const expectedPct = Math.round(dp.ratio * 100)
    const state = tgt > 0
      ? deriveHealthState(stats.achievementPct, expectedPct, pace.paceRatio, recentValues, cv)
      : 'watch'

    return {
      kpiKey:         k,
      label:          KPI_META[k].en,
      state,
      achievementPct: stats.achievementPct,
      expectedPct,
      delta:          stats.achievementPct - expectedPct,
      paceRatio:      pace.paceRatio,
      forecastAchPct: forecast.forecastAchPct,
      todayValue:     todayVal,
      mtdValue:       actual,
      target:         tgt,
      pulse,
      pulseValue,
    }
  })
}

// ── Overall health: worst state across KPIs ──────────────────
export function computeOverallHealth(health: KpiHealthSignal[]): KpiHealthState {
  const ORDER: Record<KpiHealthState, number> = {
    critical:  0,
    risk:      1,
    unstable:  2,
    watch:     3,
    recovering:4,
    healthy:   5,
  }
  return health.reduce((worst, h) =>
    ORDER[h.state] < ORDER[worst] ? h.state : worst,
    'healthy' as KpiHealthState,
  )
}
