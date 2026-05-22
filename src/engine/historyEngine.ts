// ============================================================
// Historical Data Layer V1
// PharmaPulse Enterprise Analytics
//
// Builds on KPI Analytics Engine V1 (kpiAnalyticsEngine.ts).
// All functions are pure — no Firebase, no React, no side effects.
//
// Responsibilities:
//   1. Daily Summary Generation
//   2. Monthly Summary Aggregation
//   3. Forecast Snapshot Tracking
//   4. Risk Snapshot Tracking
//   5. Trend Engine (7-day, 30-day, momentum)
//   6. Ranking History Support
//   7. Cached Analytics Strategy
//
// Firestore write strategy is defined in constants/interfaces
// but all computation is performed client-side for testability.
// ============================================================

import {
  // Types
  KpiKey,
  TrafficLightStatus,
  TrendDirection,
  PaceStatus,
  RiskLevel,
  RecoveryLabel,
  KpiEntry,
  MonthlyTarget,
  DayProgress,
  KpiStats,
  PaceResult,
  ForecastResult,

  // Constants
  KPI_KEYS,
  KPI_META,
  KPI_WEIGHTS,
  TRAFFIC_COLORS,

  // Engine V1 functions
  getDayProgress,
  getTrafficLight,
  computeKpiStats,
  computePace,
  computeForecast,
  computeRiskLevel,
  computeOverallAchievement,
  computeTrendDirection,
  compute7DayRollingAvg,
  computeWeeklyMomentum,
  findWeakestKpi,
  findStrongestKpi,
  buildDailyMission,
  extractDailyValues,
  sumKpi,
  filterByDateRange,
  filterToCurrentMonth,
  filterToDate,
  getTargetForKpi,
  computeAchievementPct,
  computeCurrentDailyRate,
} from './kpiAnalyticsEngine'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — HISTORICAL TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════

// ── Per-KPI snapshot in a daily summary ──────────────────────
export interface KpiDailySnapshot {
  actual:          number
  target:          number
  achievementPct:  number
  status:          TrafficLightStatus
  dailyRate:       number
  paceStatus:      PaceStatus
  forecastEOMPct:  number
  recoveryProb:    number
}

// ── Daily Summary ─────────────────────────────────────────────
// Stored in: daily_summaries/{userId}_{pharmacyId}_{date}
export interface DailySummary {
  // Identity
  id:          string          // "{userId}_{pharmacyId}_{date}"
  date:        string          // "yyyy-MM-dd"
  userId:      string
  pharmacyId:  string

  // Aggregate performance
  overallAchievement: number
  weakestKpi:         KpiKey
  strongestKpi:       KpiKey

  // Forecast at snapshot time
  forecastAchievement: number  // projected EOM %

  // Risk & pace
  riskLevel:   RiskLevel
  paceStatus:  PaceStatus      // overall pace (based on weakest KPI)

  // Per-KPI breakdown
  kpis: Record<KpiKey, KpiDailySnapshot>

  // Meta
  entryCount:  number          // how many kpi_entries contributed
  snapshotAt:  string          // ISO timestamp when snapshot was created
  month:       string          // "yyyy-MM" — for cross-ref with monthly_summaries
}

// ── Monthly Summary ───────────────────────────────────────────
// Stored in: monthly_summaries/{userId}_{pharmacyId}_{month}
export interface MonthlySummary {
  // Identity
  id:          string          // "{userId}_{pharmacyId}_{month}"
  month:       string          // "yyyy-MM"
  userId:      string
  pharmacyId:  string

  // Month result
  overallAchievement:  number
  bestKpi:             KpiKey
  worstKpi:            KpiKey

  // Per-KPI month totals
  kpis: Record<KpiKey, {
    total:          number
    target:         number
    achievementPct: number
    status:         TrafficLightStatus
  }>

  // Quality scores
  consistencyScore: number     // 0–100 (entry rate × inverse variance)
  momentumScore:    number     // -100..+100 (first vs second half comparison)
  averagePaceRatio: number     // avg of weekly pace ratios
  recoveryScore:    number     // % of at-risk KPIs that recovered by EOM

  // Forecast accuracy (if previous forecast snapshot exists)
  forecastAccuracy: number | null  // actual - forecast (pct points)
  finalForecastPct: number         // last forecast recorded before EOM

  // Entry health
  totalEntries:   number
  activeDays:     number       // distinct dates with entries
  possibleDays:   number       // total calendar days in month
  submissionRate: number       // activeDays / possibleDays × 100

  // Meta
  computedAt:  string          // ISO timestamp
}

// ── Forecast Snapshot ─────────────────────────────────────────
// Stored in: forecast_snapshots/{userId}_{pharmacyId}_{date}
// One per day per pharmacist — tracks how forecast evolves
export interface ForecastSnapshot {
  id:          string          // "{userId}_{pharmacyId}_{date}"
  date:        string          // snapshot date
  userId:      string
  pharmacyId:  string
  month:       string

  // Snapshot of forecasts at this date
  dayProgress: {
    currentDay:    number
    totalDays:     number
    ratio:         number
  }

  kpis: Record<KpiKey, {
    actualMTD:        number
    forecastEOM:      number
    forecastAchPct:   number
    optimistic:       number
    pessimistic:      number
    recoveryProb:     number
    paceStatus:       PaceStatus
    breakEvenDay:     number | null
  }>

  overallForecastPct: number
  snapshotAt:        string
}

// ── Risk Snapshot ─────────────────────────────────────────────
// Stored in: risk_snapshots/{pharmacyId}_{date}
// Branch-level risk at a point in time
export interface RiskSnapshot {
  id:          string          // "{pharmacyId}_{date}"
  date:        string
  pharmacyId:  string

  riskLevel:   RiskLevel
  riskScore:   number          // 0–15 (sum of per-KPI weights)

  kpiStatuses: Record<KpiKey, TrafficLightStatus>
  criticalKpis: KpiKey[]
  warningKpis:  KpiKey[]

  // Pharmacist-level breakdown
  pharmacistCount:   number
  submissionRate:    number    // % who submitted today
  missingPharmacists: string[] // user IDs with no entry today

  snapshotAt:  string
}

// ── Ranking Entry ─────────────────────────────────────────────
export interface RankingEntry {
  userId:      string
  displayName: string
  pharmacyId:  string
  month:       string

  overallAch:  number
  rank:        number          // 1 = best
  percentile:  number          // 0–100
  rankDelta:   number          // vs previous period (positive = improved)

  kpiBreakdown: Record<KpiKey, number>  // achievementPct per KPI
}

// ── Ranking History ───────────────────────────────────────────
// Stored in: ranking_history/{pharmacyId}_{month}
export interface RankingHistory {
  id:          string          // "{pharmacyId}_{month}"
  pharmacyId:  string
  month:       string

  rankings:    RankingEntry[]
  computedAt:  string
}

// ── Trend Summary ─────────────────────────────────────────────
export interface TrendSummary {
  kpiKey:       KpiKey
  period:       '7d' | '30d'
  direction:    TrendDirection
  momentum:     number         // -100..+100
  rollingAvg:   number
  changeVsPrev: number         // % change vs previous period
  dataPoints:   number
}

// ── Historical Analytics Cache ────────────────────────────────
// In-memory cache contract — consumed by dashboard, not computed on-demand
export interface AnalyticsCache {
  userId:      string
  pharmacyId:  string
  month:       string
  cachedAt:    string

  mtdByKpi:    Record<KpiKey, number>    // sumKpi result for current month
  trends:      TrendSummary[]
  momentum:    Record<KpiKey, number>    // weekly momentum score per KPI
  lastSummary: DailySummary | null
  riskHistory: RiskSnapshot[]            // last 7 days
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — FIRESTORE COLLECTION DESIGN
// ══════════════════════════════════════════════════════════════

/**
 * Firestore Collection Schema
 *
 * daily_summaries/{userId}_{pharmacyId}_{date}
 *   - one document per pharmacist per day
 *   - written after every KPI save (upsert)
 *   - used for: trend charts, momentum, ranking history
 *
 * monthly_summaries/{userId}_{pharmacyId}_{month}
 *   - one document per pharmacist per month
 *   - written at end of month (or on-demand refresh)
 *   - used for: manager summary, executive reports
 *
 * forecast_snapshots/{userId}_{pharmacyId}_{date}
 *   - one document per pharmacist per day
 *   - written daily (after KPI save) for forecast drift tracking
 *   - used for: forecast accuracy analysis
 *
 * risk_snapshots/{pharmacyId}_{date}
 *   - one document per branch per day
 *   - written after any pharmacist in branch saves KPI
 *   - used for: manager alert history, risk trend
 *
 * ranking_history/{pharmacyId}_{month}
 *   - one document per branch per month
 *   - recomputed whenever any pharmacist's MTD changes
 *   - used for: leaderboard, trend movement
 *
 * Recommended Indexes (firestore.indexes.json additions):
 *
 * daily_summaries:
 *   [userId ASC, date DESC]
 *   [pharmacyId ASC, date DESC]
 *   [pharmacyId ASC, month ASC, date DESC]
 *
 * monthly_summaries:
 *   [userId ASC, month DESC]
 *   [pharmacyId ASC, month DESC]
 *
 * forecast_snapshots:
 *   [userId ASC, date DESC]
 *   [pharmacyId ASC, month ASC, date ASC]
 *
 * risk_snapshots:
 *   [pharmacyId ASC, date DESC]
 *
 * ranking_history:
 *   [pharmacyId ASC, month DESC]
 *   [pharmacyId ASC, "rankings.userId" ASC, month DESC]
 */
export const HISTORY_COLLECTIONS = {
  DAILY_SUMMARIES:     'daily_summaries',
  MONTHLY_SUMMARIES:   'monthly_summaries',
  FORECAST_SNAPSHOTS:  'forecast_snapshots',
  RISK_SNAPSHOTS:      'risk_snapshots',
  RANKING_HISTORY:     'ranking_history',
} as const

// ══════════════════════════════════════════════════════════════
// SECTION 3 — DOCUMENT ID HELPERS
// ══════════════════════════════════════════════════════════════

export function dailySummaryId(userId: string, pharmacyId: string, date: string): string {
  return `${userId}_${pharmacyId}_${date}`
}

export function monthlySummaryId(userId: string, pharmacyId: string, month: string): string {
  return `${userId}_${pharmacyId}_${month}`
}

export function forecastSnapshotId(userId: string, pharmacyId: string, date: string): string {
  return `${userId}_${pharmacyId}_${date}`
}

export function riskSnapshotId(pharmacyId: string, date: string): string {
  return `${pharmacyId}_${date}`
}

export function rankingHistoryId(pharmacyId: string, month: string): string {
  return `${pharmacyId}_${month}`
}

export function todayString(ref?: Date): string {
  return (ref ?? new Date()).toISOString().split('T')[0]
}

export function monthString(ref?: Date): string {
  const d = ref ?? new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — DAILY SUMMARY GENERATOR
// ══════════════════════════════════════════════════════════════

/**
 * Generate a DailySummary for one pharmacist on one date.
 *
 * @param userId       - Pharmacist UID
 * @param pharmacyId   - Branch ID
 * @param date         - Date string "yyyy-MM-dd"
 * @param mtdEntries   - All entries for this pharmacist this month (up to `date`)
 * @param target       - Monthly target for this branch/month
 * @param referenceDate - Override today (for backfilling)
 */
export function generateDailySummary(
  userId:        string,
  pharmacyId:    string,
  date:          string,
  mtdEntries:    KpiEntry[],
  target:        MonthlyTarget | null,
  referenceDate?: Date,
): DailySummary {
  const ref = referenceDate ?? new Date(`${date}T12:00:00`)
  const dp  = getDayProgress(ref)

  // Per-KPI computation
  const kpiStatsMap: Partial<Record<KpiKey, KpiStats>> = {}
  const kpiSnaps:    Record<string, KpiDailySnapshot>  = {}

  for (const key of KPI_KEYS) {
    const actual = sumKpi(mtdEntries, key)
    const tgt    = target ? getTargetForKpi(target, key) : 0

    const stats    = computeKpiStats(actual, tgt, dp, key)
    const pace     = computePace(actual, tgt, dp)
    const forecast = computeForecast(actual, tgt, dp)

    kpiStatsMap[key] = stats
    kpiSnaps[key] = {
      actual,
      target:         tgt,
      achievementPct: stats.achievementPct,
      status:         stats.status,
      dailyRate:      pace.currentDailyRate,
      paceStatus:     pace.paceStatus,
      forecastEOMPct: forecast.forecastAchPct,
      recoveryProb:   forecast.recoveryProbability,
    }
  }

  const overallAchievement = computeOverallAchievement(kpiStatsMap)
  const weakestKpi         = findWeakestKpi(kpiStatsMap)
  const strongestKpi       = findStrongestKpi(kpiStatsMap)
  const allStatuses        = KPI_KEYS.map((k) => kpiStatsMap[k]?.status ?? 'critical')
  const riskLevel          = computeRiskLevel(allStatuses)

  // Overall forecast = weighted forecast achievement
  const overallForecast = Math.round(
    KPI_KEYS.reduce((sum, k) => {
      const w = KPI_WEIGHTS[k] ?? 0.2
      return sum + (kpiSnaps[k]?.forecastEOMPct ?? 0) * w
    }, 0)
  )

  // Overall pace status = based on weakest KPI
  const weakestPace = kpiSnaps[weakestKpi]?.paceStatus ?? 'CRITICAL'

  return {
    id:        dailySummaryId(userId, pharmacyId, date),
    date,
    userId,
    pharmacyId,
    month:     date.slice(0, 7),
    overallAchievement,
    weakestKpi,
    strongestKpi,
    forecastAchievement: overallForecast,
    riskLevel,
    paceStatus: weakestPace,
    kpis:      kpiSnaps as Record<KpiKey, KpiDailySnapshot>,
    entryCount: mtdEntries.filter((e) => e.date === date).length,
    snapshotAt: new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — MONTHLY SUMMARY GENERATOR
// ══════════════════════════════════════════════════════════════

/**
 * Compute consistency score for a month.
 * Formula: entryRate × (1 − min(CV, 1)) × 100
 * CV = coefficient of variation (std/mean)
 */
function computeConsistencyScore(
  dailyValues: number[],
  possibleDays: number,
): number {
  if (!dailyValues.length || !possibleDays) return 0

  const entryRate = dailyValues.filter((v) => v > 0).length / possibleDays
  const mean      = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length

  if (mean === 0) return 0

  const variance  = dailyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / dailyValues.length
  const stddev    = Math.sqrt(variance)
  const cv        = stddev / mean

  return Math.round(entryRate * (1 - Math.min(cv, 1)) * 100)
}

/**
 * Compute momentum score by comparing first half vs second half of month.
 * Range: -100..+100
 */
function computeMonthMomentum(
  dailyValues: number[],
  totalDays:   number,
): number {
  if (dailyValues.length < 2) return 0

  const midpoint  = Math.floor(totalDays / 2)
  const firstHalf = dailyValues.slice(0, midpoint)
  const secndHalf = dailyValues.slice(midpoint)

  if (!firstHalf.length || !secndHalf.length) return 0

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
  const avgSecnd = secndHalf.reduce((s, v) => s + v, 0) / secndHalf.length

  if (avgFirst === 0) return avgSecnd > 0 ? 100 : 0

  const changePct = ((avgSecnd - avgFirst) / avgFirst) * 100
  return Math.max(-100, Math.min(100, Math.round(changePct)))
}

/**
 * Compute recovery score: % of at-risk KPIs that reached ≥80% by EOM.
 */
function computeRecoveryScore(
  kpiMap: Record<KpiKey, { achievementPct: number }>,
): number {
  const atRisk  = KPI_KEYS.filter((k) => kpiMap[k]?.achievementPct < 80)
  if (!atRisk.length) return 100

  const recovered = atRisk.filter((k) => kpiMap[k]?.achievementPct >= 80)
  return Math.round((recovered.length / atRisk.length) * 100)
}

/**
 * Generate a MonthlySummary for one pharmacist for one month.
 *
 * @param userId        - Pharmacist UID
 * @param pharmacyId    - Branch ID
 * @param month         - "yyyy-MM"
 * @param allEntries    - All entries for this pharmacist in this month
 * @param target        - Monthly target document
 * @param lastForecastPct - Final forecast recorded before EOM (from forecast_snapshots)
 * @param actualFinalAch  - What actually happened (for forecast accuracy — supply when closing month)
 */
export function generateMonthlySummary(
  userId:          string,
  pharmacyId:      string,
  month:           string,
  allEntries:      KpiEntry[],
  target:          MonthlyTarget | null,
  lastForecastPct: number = 0,
  actualFinalAch:  number | null = null,
): MonthlySummary {
  const [yyyy, mm] = month.split('-').map(Number)
  const totalDays  = new Date(yyyy, mm, 0).getDate()
  const dp         = getDayProgress(new Date(yyyy, mm - 1, totalDays))  // last day of month

  const kpiSummaries: Record<string, { total: number; target: number; achievementPct: number; status: TrafficLightStatus }> = {}
  const kpiStatsMap:  Partial<Record<KpiKey, { achievementPct: number }>> = {}

  let totalConsistency = 0
  let totalMomentum    = 0

  for (const key of KPI_KEYS) {
    const daily = allEntries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => Number(e[key]) || 0)

    const total   = daily.reduce((s, v) => s + v, 0)
    const tgt     = target ? getTargetForKpi(target, key) : 0
    const achPct  = computeAchievementPct(total, tgt)
    const status  = getTrafficLight(achPct, 1)    // vs full month

    kpiSummaries[key] = { total, target: tgt, achievementPct: achPct, status }
    kpiStatsMap[key]  = { achievementPct: achPct }

    totalConsistency += computeConsistencyScore(daily, totalDays)
    totalMomentum    += computeMonthMomentum(daily, totalDays)
  }

  const consistencyScore = Math.round(totalConsistency / KPI_KEYS.length)
  const momentumScore    = Math.round(totalMomentum    / KPI_KEYS.length)

  // Distinct dates with at least one entry
  const activeDaysSet = new Set(allEntries.map((e) => e.date))
  const activeDays    = activeDaysSet.size
  const submissionRate = Math.round((activeDays / totalDays) * 100)

  // Best/worst KPI
  const bestKpi  = KPI_KEYS.reduce((best, k) =>
    (kpiSummaries[k].achievementPct > (kpiSummaries[best]?.achievementPct ?? 0)) ? k : best,
    KPI_KEYS[0]
  )
  const worstKpi = KPI_KEYS.reduce((worst, k) =>
    (kpiSummaries[k].achievementPct < (kpiSummaries[worst]?.achievementPct ?? Infinity)) ? k : worst,
    KPI_KEYS[0]
  )

  const overallAchievement = Math.round(
    KPI_KEYS.reduce((sum, k) => sum + (kpiSummaries[k]?.achievementPct ?? 0) * (KPI_WEIGHTS[k] ?? 0.2), 0)
  )

  // Average pace ratio = overall achievement / 100 (simplified for monthly)
  const averagePaceRatio = overallAchievement / 100

  // Recovery score
  const recoveryScore = computeRecoveryScore(kpiSummaries as any)

  // Forecast accuracy (actual - forecast, in pct points)
  const forecastAccuracy = actualFinalAch !== null && lastForecastPct > 0
    ? Math.round((actualFinalAch - lastForecastPct) * 10) / 10
    : null

  return {
    id:         monthlySummaryId(userId, pharmacyId, month),
    month,
    userId,
    pharmacyId,
    overallAchievement,
    bestKpi,
    worstKpi,
    kpis:             kpiSummaries as MonthlySummary['kpis'],
    consistencyScore,
    momentumScore,
    averagePaceRatio: Math.round(averagePaceRatio * 100) / 100,
    recoveryScore,
    forecastAccuracy,
    finalForecastPct: lastForecastPct,
    totalEntries:     allEntries.length,
    activeDays,
    possibleDays:     totalDays,
    submissionRate,
    computedAt:       new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — FORECAST SNAPSHOT GENERATOR
// ══════════════════════════════════════════════════════════════

/**
 * Generate a ForecastSnapshot capturing all KPI forecasts for today.
 * Called once per day after KPI save to track forecast drift.
 */
export function generateForecastSnapshot(
  userId:        string,
  pharmacyId:    string,
  date:          string,
  mtdEntries:    KpiEntry[],
  target:        MonthlyTarget | null,
  referenceDate?: Date,
): ForecastSnapshot {
  const ref = referenceDate ?? new Date(`${date}T12:00:00`)
  const dp  = getDayProgress(ref)

  const kpiSnaps: Record<string, ForecastSnapshot['kpis'][KpiKey]> = {}
  let totalForecastPct = 0

  for (const key of KPI_KEYS) {
    const actual     = sumKpi(mtdEntries, key)
    const tgt        = target ? getTargetForKpi(target, key) : 0
    const sorted     = [...mtdEntries].sort((a, b) => a.date.localeCompare(b.date))
    const dailyVals  = sorted.map((e) => Number(e[key]) || 0)
    const pace       = computePace(actual, tgt, dp)
    const forecast   = computeForecast(actual, tgt, dp, dailyVals)

    kpiSnaps[key] = {
      actualMTD:      actual,
      forecastEOM:    forecast.forecastEOM,
      forecastAchPct: forecast.forecastAchPct,
      optimistic:     forecast.optimistic,
      pessimistic:    forecast.pessimistic,
      recoveryProb:   forecast.recoveryProbability,
      paceStatus:     pace.paceStatus,
      breakEvenDay:   forecast.breakEvenDay,
    }

    totalForecastPct += forecast.forecastAchPct * (KPI_WEIGHTS[key] ?? 0.2)
  }

  return {
    id:         forecastSnapshotId(userId, pharmacyId, date),
    date,
    userId,
    pharmacyId,
    month:      date.slice(0, 7),
    dayProgress: {
      currentDay: dp.currentDay,
      totalDays:  dp.totalDays,
      ratio:      Math.round(dp.ratio * 1000) / 1000,
    },
    kpis:              kpiSnaps as ForecastSnapshot['kpis'],
    overallForecastPct: Math.round(totalForecastPct),
    snapshotAt:        new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — RISK SNAPSHOT GENERATOR
// ══════════════════════════════════════════════════════════════

/**
 * Generate a branch-level RiskSnapshot for today.
 * Aggregates across all pharmacists in the branch.
 *
 * @param pharmacyId      - Branch ID
 * @param date            - Snapshot date
 * @param todayEntries    - All entries for this branch on this date
 * @param mtdEntries      - All MTD entries for this branch
 * @param target          - Branch monthly target
 * @param allPharmacists  - List of all pharmacist UIDs in this branch
 * @param referenceDate   - Override today
 */
export function generateRiskSnapshot(
  pharmacyId:      string,
  date:            string,
  todayEntries:    KpiEntry[],
  mtdEntries:      KpiEntry[],
  target:          MonthlyTarget | null,
  allPharmacists:  string[],
  referenceDate?:  Date,
): RiskSnapshot {
  const ref = referenceDate ?? new Date(`${date}T12:00:00`)
  const dp  = getDayProgress(ref)

  // Aggregate MTD across all pharmacists in branch
  const kpiStatusMap: Record<string, TrafficLightStatus> = {}
  const criticalKpis: KpiKey[] = []
  const warningKpis:  KpiKey[] = []

  let riskScore = 0

  for (const key of KPI_KEYS) {
    const actual = sumKpi(mtdEntries, key)
    const tgt    = target ? getTargetForKpi(target, key) : 0
    const stats  = computeKpiStats(actual, tgt, dp, key)

    kpiStatusMap[key] = stats.status
    if (stats.status === 'critical') { criticalKpis.push(key); riskScore += 5 }
    if (stats.status === 'warning')  { warningKpis.push(key);  riskScore += 1 }
  }

  const riskLevel = computeRiskLevel(Object.values(kpiStatusMap) as TrafficLightStatus[])

  // Submission rate
  const submittedToday  = new Set(todayEntries.map((e) => e.userId))
  const missingPharmacists = allPharmacists.filter((uid) => !submittedToday.has(uid))
  const submissionRate  = allPharmacists.length > 0
    ? Math.round((submittedToday.size / allPharmacists.length) * 100)
    : 0

  return {
    id:          riskSnapshotId(pharmacyId, date),
    date,
    pharmacyId,
    riskLevel,
    riskScore:   Math.min(riskScore, 15),
    kpiStatuses: kpiStatusMap as Record<KpiKey, TrafficLightStatus>,
    criticalKpis,
    warningKpis,
    pharmacistCount:    allPharmacists.length,
    submissionRate,
    missingPharmacists,
    snapshotAt:         new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — TREND ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Build a 7-day TrendSummary for a single KPI from sorted daily summaries.
 */
export function buildTrendSummary7d(
  kpiKey:      KpiKey,
  summaries:   DailySummary[],   // sorted ascending by date, last 14+ days ideal
): TrendSummary {
  const values  = summaries.map((s) => s.kpis[kpiKey]?.actual ?? 0)
  const recent  = values.slice(-7)
  const prev    = values.slice(-14, -7)

  const rollingAvg = compute7DayRollingAvg(values)
  const direction  = computeTrendDirection(values)

  const momentum   = prev.length
    ? computeWeeklyMomentum(recent, prev)
    : 0

  const recentSum = recent.reduce((s, v) => s + v, 0)
  const prevSum   = prev.reduce((s, v) => s + v, 0)
  const changeVsPrev = prevSum > 0
    ? Math.round(((recentSum - prevSum) / prevSum) * 100)
    : 0

  return {
    kpiKey,
    period:     '7d',
    direction,
    momentum,
    rollingAvg,
    changeVsPrev,
    dataPoints: recent.length,
  }
}

/**
 * Build a 30-day TrendSummary for a single KPI.
 */
export function buildTrendSummary30d(
  kpiKey:    KpiKey,
  summaries: DailySummary[],   // sorted ascending, last 60+ days ideal
): TrendSummary {
  const values  = summaries.map((s) => s.kpis[kpiKey]?.actual ?? 0)
  const recent  = values.slice(-30)
  const prev    = values.slice(-60, -30)

  const rollingAvg = compute7DayRollingAvg(values)
  const direction  = computeTrendDirection(values)
  const momentum   = prev.length ? computeWeeklyMomentum(recent, prev) : 0

  const recentSum = recent.reduce((s, v) => s + v, 0)
  const prevSum   = prev.reduce((s, v) => s + v, 0)
  const changeVsPrev = prevSum > 0
    ? Math.round(((recentSum - prevSum) / prevSum) * 100)
    : 0

  return {
    kpiKey,
    period:    '30d',
    direction,
    momentum,
    rollingAvg,
    changeVsPrev,
    dataPoints: recent.length,
  }
}

/**
 * Build all KPI trends (7d and 30d) from historical daily summaries.
 */
export function buildAllTrends(
  summaries: DailySummary[],
  period:    '7d' | '30d' = '7d',
): TrendSummary[] {
  const builder = period === '7d' ? buildTrendSummary7d : buildTrendSummary30d
  return KPI_KEYS.map((k) => builder(k, summaries))
}

/**
 * Compute achievement evolution: how overall achievement % changed day-by-day.
 * Returns array of { date, overallAch } sorted ascending.
 */
export function computeAchievementEvolution(
  summaries: DailySummary[],
): Array<{ date: string; overallAch: number }> {
  return summaries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, overallAch: s.overallAchievement }))
}

/**
 * Compute historical pace: how required daily pace evolved for a KPI.
 * Useful for understanding if goal is getting harder over time.
 */
export function computeHistoricalPace(
  summaries: DailySummary[],
  kpiKey:    KpiKey,
): Array<{ date: string; paceStatus: PaceStatus; dailyRate: number }> {
  return summaries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      date:      s.date,
      paceStatus: s.kpis[kpiKey]?.paceStatus ?? 'CRITICAL',
      dailyRate:  s.kpis[kpiKey]?.dailyRate  ?? 0,
    }))
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — RANKING HISTORY
// ══════════════════════════════════════════════════════════════

/**
 * Compute pharmacist rankings for a branch in a given month.
 *
 * @param pharmacyId         - Branch ID
 * @param month              - "yyyy-MM"
 * @param pharmacistProfiles - Array of { userId, displayName, mtdEntries }
 * @param target             - Branch monthly target
 * @param previousRankings   - Previous period rankings (for delta calculation)
 */
export function computeRankingHistory(
  pharmacyId:  string,
  month:       string,
  pharmacistProfiles: Array<{
    userId:      string
    displayName: string
    mtdEntries:  KpiEntry[]
  }>,
  target:            MonthlyTarget | null,
  previousRankings?: RankingEntry[],
): RankingHistory {
  const [yyyy, mm] = month.split('-').map(Number)
  const totalDays  = new Date(yyyy, mm, 0).getDate()
  const dp         = getDayProgress(new Date(yyyy, mm - 1, totalDays))

  // Compute overall achievement for each pharmacist
  const pharmacistScores = pharmacistProfiles.map(({ userId, displayName, mtdEntries }) => {
    const kpiStatsMap: Partial<Record<KpiKey, { achievementPct: number }>> = {}
    const kpiBreakdown: Record<string, number> = {}

    for (const key of KPI_KEYS) {
      const actual = sumKpi(mtdEntries, key)
      const tgt    = target ? getTargetForKpi(target, key) : 0
      const stats  = computeKpiStats(actual, tgt, dp, key)
      kpiStatsMap[key]   = { achievementPct: stats.achievementPct }
      kpiBreakdown[key]  = stats.achievementPct
    }

    const overallAch = Math.round(
      KPI_KEYS.reduce((sum, k) => sum + (kpiStatsMap[k]?.achievementPct ?? 0) * (KPI_WEIGHTS[k] ?? 0.2), 0)
    )

    return { userId, displayName, overallAch, kpiBreakdown }
  })

  // Sort by overall achievement descending → assign rank
  const sorted = [...pharmacistScores].sort((a, b) => b.overallAch - a.overallAch)
  const total  = sorted.length

  const rankings: RankingEntry[] = sorted.map((p, idx) => {
    const rank       = idx + 1
    const percentile = total > 1 ? Math.round(((total - rank) / (total - 1)) * 100) : 100

    // Rank delta vs previous period
    const prevRank   = previousRankings?.find((r) => r.userId === p.userId)?.rank ?? rank
    const rankDelta  = prevRank - rank   // positive = moved up

    return {
      userId:       p.userId,
      displayName:  p.displayName,
      pharmacyId,
      month,
      overallAch:   p.overallAch,
      rank,
      percentile,
      rankDelta,
      kpiBreakdown: p.kpiBreakdown as Record<KpiKey, number>,
    }
  })

  return {
    id:         rankingHistoryId(pharmacyId, month),
    pharmacyId,
    month,
    rankings,
    computedAt: new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — ANALYTICS CACHE BUILDER
// ══════════════════════════════════════════════════════════════

/**
 * Build an in-memory analytics cache for a pharmacist.
 * Dashboards consume this cache — NOT raw Firestore entries.
 *
 * Strategy:
 *   1. Compute MTD sums (cheap)
 *   2. Build trends from last 14 days of daily summaries
 *   3. Compute weekly momentum
 *   4. Reference last daily summary for risk/pace
 *
 * This cache should be recomputed:
 *   - After each KPI save
 *   - On dashboard mount (if > 5 minutes old)
 *
 * @param userId          - Pharmacist UID
 * @param pharmacyId      - Branch ID
 * @param mtdEntries      - Current month entries
 * @param recentSummaries - Last 14+ daily summaries (sorted asc)
 */
export function buildAnalyticsCache(
  userId:          string,
  pharmacyId:      string,
  mtdEntries:      KpiEntry[],
  recentSummaries: DailySummary[],
): AnalyticsCache {
  const month = monthString()

  // MTD sums per KPI
  const mtdByKpi: Record<string, number> = {}
  for (const key of KPI_KEYS) {
    mtdByKpi[key] = sumKpi(mtdEntries, key)
  }

  // Trends from summaries
  const trends = buildAllTrends(recentSummaries, '7d')

  // Weekly momentum
  const momentum: Record<string, number> = {}
  for (const key of KPI_KEYS) {
    const values = recentSummaries.map((s) => s.kpis[key]?.actual ?? 0)
    const recent = values.slice(-7)
    const prev   = values.slice(-14, -7)
    momentum[key] = prev.length ? computeWeeklyMomentum(recent, prev) : 0
  }

  // Last summary
  const sortedSummaries = [...recentSummaries].sort((a, b) => b.date.localeCompare(a.date))
  const lastSummary     = sortedSummaries[0] ?? null

  // Last 7 days of risk data (requires risk_snapshots — here we use summary riskLevel)
  const riskHistory: RiskSnapshot[] = []  // populated from Firestore in real usage

  return {
    userId,
    pharmacyId,
    month,
    cachedAt:    new Date().toISOString(),
    mtdByKpi:    mtdByKpi as Record<KpiKey, number>,
    trends,
    momentum:    momentum as Record<KpiKey, number>,
    lastSummary,
    riskHistory,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 11 — TRIGGER STRATEGY
// ══════════════════════════════════════════════════════════════

/**
 * Trigger Strategy (documentation — no Cloud Functions yet)
 *
 * TRIGGER 1: After KPI Save
 *   When: kpiService.saveKpiEntry() succeeds
 *   Action:
 *     1. generateDailySummary(userId, pharmacyId, today, mtdEntries, target)
 *        → write to daily_summaries/{userId}_{pharmacyId}_{today}
 *     2. generateForecastSnapshot(...)
 *        → write to forecast_snapshots/{userId}_{pharmacyId}_{today}
 *     3. generateRiskSnapshot(...) for the branch
 *        → write to risk_snapshots/{pharmacyId}_{today}
 *     4. computeRankingHistory(...)
 *        → write to ranking_history/{pharmacyId}_{month}
 *   Implementation: Call from kpiService.saveKpiEntry() after Firestore write
 *
 * TRIGGER 2: Nightly Refresh (future — Cloud Function scheduled)
 *   When: 23:59 daily
 *   Action:
 *     - Generate daily summaries for any pharmacist who saved KPI today
 *       but whose summary is > 1h old
 *     - Refresh risk snapshots for all active branches
 *     - Refresh ranking history for all active branches
 *   Status: PENDING (requires Cloud Functions)
 *
 * TRIGGER 3: Month-End Aggregation (future — Cloud Function scheduled)
 *   When: First day of each month at 00:01
 *   Action:
 *     - generateMonthlySummary for each pharmacist in previous month
 *     - Compute forecast accuracy (compare last ForecastSnapshot to actual)
 *     - Archive raw kpi_entries older than 12 months
 *   Status: PENDING (requires Cloud Functions)
 *
 * CLIENT-SIDE WORKAROUND (current implementation):
 *   Until Cloud Functions are set up, triggers are called directly
 *   from the kpiService after a successful saveKpiEntry().
 *   This is "good enough" for V1 — misses nightly refresh for
 *   pharmacists who don't save daily.
 */
export const TRIGGER_STRATEGY = {
  ON_KPI_SAVE: 'on_kpi_save',
  NIGHTLY:     'nightly',        // future Cloud Function
  MONTH_END:   'month_end',      // future Cloud Function
} as const

/**
 * Determine which summaries need to be (re)generated after a KPI save.
 * Returns the document IDs that should be written to Firestore.
 */
export function getSummaryWriteTargets(
  userId:      string,
  pharmacyId:  string,
  date:        string,
): {
  dailySummaryId:    string
  forecastSnapshotId_: string
  riskSnapshotId_:    string
  rankingHistoryId_:  string
  month:             string
} {
  const month = date.slice(0, 7)
  return {
    dailySummaryId:     dailySummaryId(userId, pharmacyId, date),
    forecastSnapshotId_: forecastSnapshotId(userId, pharmacyId, date),
    riskSnapshotId_:    riskSnapshotId(pharmacyId, date),
    rankingHistoryId_:  rankingHistoryId(pharmacyId, month),
    month,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 12 — PERFORMANCE RULES
// ══════════════════════════════════════════════════════════════

/**
 * Performance Rules (constants for query limits and cache TTLs)
 */
export const PERFORMANCE_RULES = {
  // Max entries to load per Firestore query
  MAX_ENTRIES_PER_QUERY:    500,

  // Max daily summaries to load for trend calculations
  MAX_SUMMARIES_FOR_TREND:   60,   // 60 days = 2 months

  // Cache TTL: invalidate analytics cache after N minutes
  CACHE_TTL_MINUTES:          5,

  // Max risk snapshots to load for risk history widget
  MAX_RISK_HISTORY_DAYS:      7,

  // Do NOT load all kpi_entries for an admin dashboard
  // Instead: aggregate daily_summaries per branch
  DASHBOARD_STRATEGY: 'summaries_first',  // not 'raw_entries'

  // Max pharmacists to rank at once
  MAX_RANKING_SIZE:          50,
} as const
