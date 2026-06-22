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
  sumKpi, getDayProgress, safeReadTarget,
  getProductionEngineKeys, getKpiMetaForKey } from '../kpiAnalyticsEngine'

import type { LiveAnalyticsInput } from './liveAnalyticsTypes'
import type { KpiHealthSignal, KpiHealthState } from './liveAnalyticsTypes'

// Protected Engines Migration Phase D — Live Analytics (KPI Health).
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. Actual/target reads feeding the
// health-state derivation are routed through the Dynamic Reader only
// where proven parity holds against a real sample; otherwise they fall
// back to the exact pre-migration computation. Health-state thresholds
// and formulas are completely untouched. No call site passes a registry yet.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

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
  registry?:  KpiRegistry,
  policy?:    PilotPolicy,
): { pulse: 'up' | 'down' | 'flat'; pulseValue: number } {
  const sum = (entries: LiveAnalyticsInput['mtdEntries']) => registry && policy
    ? sumPilotActual(entries as Record<string, unknown>[], kpiKey, registry, policy)
    : entries.reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
  const todayVal = sum(mtdEntries.filter((e) => e.date === today))
  const yestVal  = sum(mtdEntries.filter((e) => e.date === yesterday))

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

// ── Main health computation ───────────────────────────────────
export function computeKpiHealth(input: LiveAnalyticsInput, registry?: KpiRegistry): KpiHealthSignal[] {
  const { mtdEntries, todayEntries, target, now } = input
  const dp        = getDayProgress(now)
  const today     = format(now, 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(mtdEntries[0] ?? null, target ?? null, registry, 'liveAnalytics')
    : undefined

  // Core KPI Dependency Removal — Stage F: widens to every active
  // production_evaluation KPI when a registry is supplied; identical to
  // before (5 Core keys only) when absent.
  const healthKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  return healthKeys.map((k) => {
    const actual   = registry && policy
      ? sumPilotActual(mtdEntries as Record<string, unknown>[], k, registry, policy)
      : sumKpi(mtdEntries, k)
    const todayVal = registry && policy
      ? sumPilotActual(todayEntries as Record<string, unknown>[], k, registry, policy)
      : sumKpi(todayEntries, k)
    const legacyTarget = () => target
      ? safeReadTarget(target as any, getKpiMetaForKey(k, registry).targetField)
      : 0
    const tgt      = registry && policy
      ? readPilotTarget(target as Record<string, unknown> | null | undefined, k, registry, policy, legacyTarget)
      : legacyTarget()

    const stats    = computeKpiStats(actual, tgt, dp, k)
    const pace     = computePace(actual, tgt, dp)
    const forecast = computeForecast(actual, tgt, dp)

    // Recent daily values for trend analysis
    const recentValues = getRecentDailyValues(mtdEntries, k, now, 7, registry, policy)
    const cv           = computeCV(recentValues)

    const { pulse, pulseValue } = computePulse(mtdEntries, k, today, yesterday, registry, policy)

    const expectedPct = Math.round(dp.ratio * 100)
    const state = tgt > 0
      ? deriveHealthState(stats.achievementPct, expectedPct, pace.paceRatio, recentValues, cv)
      : 'watch'

    return {
      kpiKey:         k,
      label:          getKpiMetaForKey(k, registry).en,
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
