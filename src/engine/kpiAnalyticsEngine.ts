// ============================================================
// KPI Analytics Engine V1
// PharmaPulse Enterprise Analytics
//
// Implements every calculation defined in:
//   docs/KPI_INTELLIGENCE_FRAMEWORK.md
//
// Architecture rules:
//   - Pure functions only (no Firebase, no React, no side effects)
//   - All inputs are plain objects/arrays — no store coupling
//   - Each module section is independently importable
//   - Every exported function matches a documented formula exactly
//   - AI-ready hooks are marked with _aiReady: true
// ============================================================

// ══════════════════════════════════════════════════════════════
// SECTION 1 — TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════

export type KpiKey =
  | 'wasfaty'
  | 'omni'
  | 'wellness'
  | 'basket'
  | 'crossSelling'

export type TrafficLightStatus =
  | 'excellent'
  | 'good'
  | 'warning'
  | 'critical'

export type TrendDirection =
  | 'ACCELERATING'
  | 'IMPROVING'
  | 'STABLE'
  | 'DECLINING'
  | 'DETERIORATING'

export type PaceStatus =
  | 'EXCEEDING'
  | 'ON_PACE'
  | 'SLIGHTLY_BEHIND'
  | 'SIGNIFICANTLY_BEHIND'
  | 'CRITICAL'

export type RiskLevel =
  | 'ON_TRACK'
  | 'LOW_RISK'
  | 'MEDIUM_RISK'
  | 'HIGH_RISK'

export type RecoveryLabel =
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'CRITICAL'

export type MissionDifficulty =
  | 'EASY'
  | 'MODERATE'
  | 'CHALLENGING'
  | 'STRETCH'

// ── Raw data shapes (mirrors Firestore documents) ─────────────

export interface KpiEntry {
  id?:           string
  userId:        string
  pharmacyId:    string
  date:          string          // "yyyy-MM-dd"
  wasfaty:       number
  omni:          number
  wellness:      number
  basket:        number
  crossSelling:  number
  notes?:        string
  createdAt?:    unknown
  updatedAt?:    unknown
}

export interface MonthlyTarget {
  pharmacyId:       string
  month:            string       // "yyyy-MM"
  wasfatyTarget:    number
  omniTarget:       number
  wellnessTarget:   number
  basketTarget:     number
  crossSellTarget:  number
  salesTarget?:     number
}

// ── Computed result shapes ────────────────────────────────────

export interface DayProgress {
  currentDay:    number
  totalDays:     number
  daysRemaining: number
  ratio:         number          // 0..1
  pct:           number          // 0..100
}

export interface TrafficLightColors {
  color:    string
  bg:       string
  border:   string
  label:    string
  labelAr:  string
  icon:     string
}

export interface KpiStats {
  kpiKey:          KpiKey
  actual:          number
  target:          number
  achievementPct:  number
  expectedPct:     number        // dayProgress.ratio × 100
  delta:           number        // achievementPct - expectedPct
  remainingToTarget: number
  status:          TrafficLightStatus
  colors:          TrafficLightColors
}

export interface PaceResult {
  currentDailyRate:   number
  requiredDailyPace:  number
  paceRatio:          number
  paceStatus:         PaceStatus
}

export interface ForecastResult {
  forecastEOM:         number    // projected end-of-month value
  forecastAchPct:      number    // projected achievement %
  optimistic:          number    // +15% on current rate
  realistic:           number    // current rate × totalDays
  pessimistic:         number    // -15% on current rate
  recoveryProbability: number    // 0..1
  recoveryLabel:       RecoveryLabel
  breakEvenDay:        number | null
}

export interface GapAnalysis {
  absoluteGap:     number        // target - actual (positive = shortfall)
  relativeGapPct:  number        // (actual - expected) / expected × 100
  daysToRecover:   number        // days needed at current pace
  isRecoverable:   boolean
}

export interface FullKpiAnalysis {
  kpiKey:       KpiKey
  stats:        KpiStats
  pace:         PaceResult
  forecast:     ForecastResult
  gap:          GapAnalysis
  trend?:       TrendDirection   // requires historical entries
}

export interface DailyMission {
  focusKpi:          KpiKey
  kpiLabel:          { en: string; ar: string }
  achievementPct:    number
  targetGap:         number
  requiredToday:     number
  currentRate:       number
  action:            string
  motivation:        string
  difficulty:        MissionDifficulty
  allKpis:           Array<{ key: KpiKey; ach: number; target: number }>
  _aiReady:          true        // swap body for AI API call in Phase 1
}

export interface PharmacistProfile {
  pharmacistId:  string
  month:         string
  dayProgress:   DayProgress
  kpiAnalyses:   FullKpiAnalysis[]
  overallAch:    number
  overallStatus: TrafficLightStatus
  weakestKpi:    KpiKey
  strongestKpi:  KpiKey
  riskLevel:     RiskLevel
  mission:       DailyMission | null
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — CONSTANTS
// ══════════════════════════════════════════════════════════════

export const KPI_KEYS: KpiKey[] = [
  'wasfaty',
  'omni',
  'wellness',
  'basket',
  'crossSelling',
]

export const KPI_META: Record<KpiKey, { en: string; ar: string; unit: string; targetField: string }> = {
  wasfaty:      { en: 'Wasfaty',       ar: 'وصفتي',          unit: 'prescriptions', targetField: 'wasfatyTarget'   },
  omni:         { en: 'OmniHealth',    ar: 'أومني هيلث',     unit: 'units',         targetField: 'omniTarget'      },
  wellness:     { en: 'Wellness',      ar: 'ويلنس',          unit: 'units',         targetField: 'wellnessTarget'  },
  basket:       { en: 'Basket Size',   ar: 'متوسط السلة',   unit: 'SAR',           targetField: 'basketTarget'    },
  crossSelling: { en: 'Cross Selling', ar: 'البيع المتقاطع', unit: 'transactions',  targetField: 'crossSellTarget' },
}

// KPI business weights — normalised to sum 1.0
// wasfaty:25, omni:20, wellness:20, basket:20, crossSell:15 → total 100
export const KPI_WEIGHTS: Record<KpiKey, number> = {
  wasfaty:      0.25,
  omni:         0.20,
  wellness:     0.20,
  basket:       0.20,
  crossSelling: 0.15,
}

/** Maximum achievement % to accept per KPI (caps unrealistic ratios) */
export const ACHIEVEMENT_CAP = 200

export const TRAFFIC_COLORS: Record<TrafficLightStatus, TrafficLightColors> = {
  excellent: { color:'#22c55e', bg:'rgba(34,197,94,0.10)',   border:'rgba(34,197,94,0.20)',   label:'Excellent',  labelAr:'ممتاز',        icon:'🟢' },
  good:      { color:'#00d2ad', bg:'rgba(0,210,173,0.10)',   border:'rgba(0,210,173,0.20)',   label:'On Track',   labelAr:'على المسار',  icon:'🔵' },
  warning:   { color:'#f59e0b', bg:'rgba(245,158,11,0.10)',  border:'rgba(245,158,11,0.20)',  label:'Warning',    labelAr:'تحذير',        icon:'🟡' },
  critical:  { color:'#ef4444', bg:'rgba(239,68,68,0.10)',   border:'rgba(239,68,68,0.20)',   label:'Critical',   labelAr:'حرج',          icon:'🔴' },
}

const ACTIONS: Record<KpiKey, string> = {
  wasfaty:      'Review pending e-prescriptions and process them before midday.',
  omni:         'Offer OmniHealth options to every customer with a chronic condition.',
  wellness:     'Display wellness products at the counter and mention them proactively.',
  basket:       'Suggest complementary items for each purchase (vitamins, supplements).',
  crossSelling: 'For every transaction, identify one cross-sell opportunity.',
}

const MOTIVATIONAL: string[] = [
  "Every prescription is a patient's trust — make it count.",
  'Small consistent efforts compound into great results.',
  "Today's effort is tomorrow's achievement.",
  'Focus on one thing: be better than yesterday.',
  'Your team is counting on you. Lead by example.',
  'Consistency beats intensity every day.',
  'The best time to improve was yesterday. The next best time is now.',
]

// ══════════════════════════════════════════════════════════════
// SECTION 3 — DAY PROGRESS
// ══════════════════════════════════════════════════════════════

/**
 * Compute day progress for a given date (defaults to today).
 * Formula: dayProgress = currentDay / totalDaysInMonth
 */
export function getDayProgress(referenceDate?: Date): DayProgress {
  const d            = referenceDate ?? new Date()
  const currentDay   = d.getDate()
  const totalDays    = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const daysRemaining = totalDays - currentDay
  const ratio        = currentDay / totalDays

  return {
    currentDay,
    totalDays,
    daysRemaining,
    ratio,
    pct: Math.round(ratio * 100),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — ACHIEVEMENT & TRAFFIC LIGHT
// ══════════════════════════════════════════════════════════════

/**
 * Compute achievement % for a single KPI.
 * Formula: (actual / target) × 100
 */
/**
 * Compute achievement % for a single KPI with enterprise-safe guards.
 * - Parses string numbers safely
 * - Excludes invalid/missing targets (returns 0)
 * - Coerces missing actual to 0
 * - Caps at ACHIEVEMENT_CAP (200%) to prevent unrealistic values
 * - Never returns NaN or Infinity
 */
export function computeAchievementPct(actual: number | string | undefined | null, target: number | string | undefined | null): number {
  // Parse target safely
  const tgt = typeof target === 'string' ? parseFloat(target) : Number(target ?? 0)
  if (!tgt || tgt <= 0 || !isFinite(tgt) || isNaN(tgt)) return 0

  // Parse actual safely — missing/null/undefined coerced to 0
  const act = typeof actual === 'string' ? parseFloat(actual) : Number(actual ?? 0)
  if (isNaN(act) || !isFinite(act)) return 0

  const raw = (Math.max(0, act) / tgt) * 100
  return Math.min(Math.round(raw), ACHIEVEMENT_CAP)  // cap at 200%
}

/**
 * Compute expected MTD value at current day.
 * Formula: expectedMTD = target × dayProgress.ratio
 */
export function computeExpectedMTD(target: number, dayRatio: number): number {
  return Math.round(target * dayRatio)
}

/**
 * Traffic Light — compares actual achievement to expected achievement.
 * Formula from docs:
 *   delta = achievementPct - (dayRatio × 100)
 *   delta >= +5   → excellent
 *   delta >= -5   → good
 *   delta >= -15  → warning
 *   else          → critical
 */
export function getTrafficLight(
  achievementPct: number,
  dayRatio: number,
): TrafficLightStatus {
  if (achievementPct == null || dayRatio == null) return 'critical'
  const expected = dayRatio * 100
  const delta    = achievementPct - expected

  if (delta >= 5)   return 'excellent'
  if (delta >= -5)  return 'good'
  if (delta >= -15) return 'warning'
  return 'critical'
}

/**
 * Compute remaining units needed to hit monthly target.
 * Formula: MAX(0, target - actual)
 */
export function computeRemainingToTarget(actual: number, target: number): number {
  return Math.max(0, target - actual)
}

/**
 * Full KPI stats for one metric.
 * Returns achievement %, traffic light, delta vs expected, and remaining.
 */
export function computeKpiStats(
  actual:      number,
  target:      number,
  dayProgress: DayProgress,
  kpiKey:      KpiKey,
): KpiStats {
  const achievementPct     = computeAchievementPct(actual, target)
  const expectedPct        = Math.round(dayProgress.ratio * 100)
  const delta              = achievementPct - expectedPct
  const remainingToTarget  = computeRemainingToTarget(actual, target)
  const status             = getTrafficLight(achievementPct, dayProgress.ratio)

  return {
    kpiKey,
    actual,
    target,
    achievementPct,
    expectedPct,
    delta,
    remainingToTarget,
    status,
    colors: TRAFFIC_COLORS[status],
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — PACE ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Current daily rate = actual / currentDay (rolling average).
 */
export function computeCurrentDailyRate(actual: number, currentDay: number): number {
  if (!currentDay || currentDay <= 0) return 0
  return Math.round((actual / currentDay) * 10) / 10
}

/**
 * Required daily pace to still hit the target.
 * Formula: remainingToTarget / daysRemaining
 */
export function computeRequiredDailyPace(
  remaining:     number,
  daysRemaining: number,
): number {
  if (remaining <= 0)     return 0               // already hit target
  if (daysRemaining <= 0) return Infinity         // no time left — missed
  return Math.round((remaining / daysRemaining) * 10) / 10
}

/**
 * Pace ratio = currentDailyRate / requiredDailyPace.
 * >1.0 → ahead, <1.0 → behind.
 */
export function computePaceRatio(
  currentRate:  number,
  requiredRate: number,
): number {
  if (!requiredRate || requiredRate === Infinity) return requiredRate === Infinity ? 0 : 999
  return Math.round((currentRate / requiredRate) * 100) / 100
}

/**
 * Classify pace ratio into a PaceStatus enum.
 * Thresholds from docs/KPI_INTELLIGENCE_FRAMEWORK.md §6.4
 */
export function classifyPaceStatus(paceRatio: number): PaceStatus {
  if (paceRatio >= 1.2)  return 'EXCEEDING'
  if (paceRatio >= 0.95) return 'ON_PACE'
  if (paceRatio >= 0.7)  return 'SLIGHTLY_BEHIND'
  if (paceRatio >= 0.5)  return 'SIGNIFICANTLY_BEHIND'
  return 'CRITICAL'
}

/**
 * Full pace analysis for one KPI.
 */
export function computePace(
  actual:      number,
  target:      number,
  dayProgress: DayProgress,
): PaceResult {
  const remaining        = computeRemainingToTarget(actual, target)
  const currentDailyRate = computeCurrentDailyRate(actual, dayProgress.currentDay)
  const requiredDailyPace = computeRequiredDailyPace(remaining, dayProgress.daysRemaining)
  const paceRatio        = computePaceRatio(currentDailyRate, requiredDailyPace)
  const paceStatus       = classifyPaceStatus(paceRatio)

  return {
    currentDailyRate,
    requiredDailyPace: requiredDailyPace === Infinity ? 0 : requiredDailyPace,
    paceRatio: paceRatio === Infinity ? 0 : paceRatio,
    paceStatus,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — FORECAST ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Forecast end-of-month value using linear projection.
 * Formula: forecastEOM = currentDailyRate × totalDays
 */
export function computeForecastEOM(
  currentDailyRate: number,
  totalDays:        number,
): number {
  return Math.round(currentDailyRate * totalDays)
}

/**
 * Three-scenario forecast.
 * Optimistic: +15% on current rate
 * Realistic:  current rate × totalDays
 * Pessimistic: -15% on current rate
 */
export function computeForecastScenarios(
  currentDailyRate: number,
  totalDays:        number,
): { optimistic: number; realistic: number; pessimistic: number } {
  return {
    optimistic:  Math.round(currentDailyRate * 1.15 * totalDays),
    realistic:   Math.round(currentDailyRate * totalDays),
    pessimistic: Math.round(currentDailyRate * 0.85 * totalDays),
  }
}

/**
 * Break-even day: the calendar day when target will be reached
 * at the current daily rate.
 * Returns null if target is unreachable.
 */
export function computeBreakEvenDay(
  target:           number,
  currentDailyRate: number,
  totalDays:        number,
): number | null {
  if (!currentDailyRate || currentDailyRate <= 0) return null
  const day = Math.ceil(target / currentDailyRate)
  return day <= totalDays ? day : null
}

/**
 * Recovery probability based on historical max vs required pace.
 * Formula from docs §8.1 — adjusted for trend direction.
 */
export function computeRecoveryProbability(
  requiredDailyPace: number,
  historicalMax:     number,
  historicalAvg:     number,
  trendDirection?:   TrendDirection,
): number {
  if (requiredDailyPace <= 0)   return 1   // target already hit
  if (!historicalAvg || historicalAvg <= 0) return 0.1

  let baseProb: number

  if (requiredDailyPace <= historicalMax)            baseProb = 0.85
  else if (requiredDailyPace <= historicalAvg * 1.2) baseProb = 0.70
  else if (requiredDailyPace <= historicalAvg * 1.5) baseProb = 0.45
  else                                                baseProb = 0.15

  // Trend multiplier
  const trendMultiplier: Record<TrendDirection, number> = {
    ACCELERATING:  1.15,
    IMPROVING:     1.05,
    STABLE:        1.00,
    DECLINING:     0.90,
    DETERIORATING: 0.75,
  }

  const multiplier = trendDirection ? trendMultiplier[trendDirection] : 1.0
  return Math.min(Math.round(baseProb * multiplier * 100) / 100, 0.99)
}

/**
 * Classify recovery probability into a human label.
 */
export function classifyRecoveryLabel(probability: number): RecoveryLabel {
  if (probability >= 0.85) return 'HIGH'
  if (probability >= 0.60) return 'MODERATE'
  if (probability >= 0.35) return 'LOW'
  return 'CRITICAL'
}

/**
 * Full forecast for one KPI.
 * Uses constant 0.5 as default recovery probability when no history.
 */
export function computeForecast(
  actual:      number,
  target:      number,
  dayProgress: DayProgress,
  dailyValues?: number[],     // last N days of raw daily values for history
  trend?:       TrendDirection,
): ForecastResult {
  const pace             = computePace(actual, target, dayProgress)
  const forecastEOM      = computeForecastEOM(pace.currentDailyRate, dayProgress.totalDays)
  const forecastAchPct   = computeAchievementPct(forecastEOM, target)
  const scenarios        = computeForecastScenarios(pace.currentDailyRate, dayProgress.totalDays)
  const breakEvenDay     = computeBreakEvenDay(target, pace.currentDailyRate, dayProgress.totalDays)

  // Recovery probability — use history if available
  const historicalMax    = dailyValues?.length ? Math.max(...dailyValues) : actual
  const historicalAvg    = dailyValues?.length
    ? dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length
    : pace.currentDailyRate

  const recoveryProb     = computeRecoveryProbability(
    pace.requiredDailyPace,
    historicalMax,
    historicalAvg,
    trend,
  )

  return {
    forecastEOM,
    forecastAchPct,
    optimistic:  scenarios.optimistic,
    realistic:   scenarios.realistic,
    pessimistic: scenarios.pessimistic,
    recoveryProbability: recoveryProb,
    recoveryLabel:       classifyRecoveryLabel(recoveryProb),
    breakEvenDay,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — GAP ANALYSIS
// ══════════════════════════════════════════════════════════════

/**
 * Absolute gap = target - actual (positive = shortfall).
 */
export function computeAbsoluteGap(actual: number, target: number): number {
  return target - actual
}

/**
 * Relative gap % = (actual - expected) / expected × 100
 * Positive = ahead, Negative = behind schedule.
 */
export function computeRelativeGapPct(actual: number, expected: number): number {
  if (!expected || expected <= 0) return 0
  return Math.round(((actual - expected) / expected) * 100)
}

/**
 * Days to recover = absoluteGap / currentDailyRate
 * (how many more days at current pace to hit target)
 */
export function computeDaysToRecover(
  remaining:        number,
  currentDailyRate: number,
): number {
  if (remaining <= 0)         return 0
  if (!currentDailyRate || currentDailyRate <= 0) return Infinity
  return Math.ceil(remaining / currentDailyRate)
}

/**
 * Full gap analysis for one KPI.
 */
export function computeGapAnalysis(
  actual:      number,
  target:      number,
  dayProgress: DayProgress,
): GapAnalysis {
  const absoluteGap    = computeAbsoluteGap(actual, target)
  const expected       = computeExpectedMTD(target, dayProgress.ratio)
  const relativeGapPct = computeRelativeGapPct(actual, expected)
  const pace           = computePace(actual, target, dayProgress)
  const daysToRecover  = computeDaysToRecover(
    computeRemainingToTarget(actual, target),
    pace.currentDailyRate,
  )
  const isRecoverable  = daysToRecover !== Infinity && daysToRecover <= dayProgress.daysRemaining

  return {
    absoluteGap,
    relativeGapPct,
    daysToRecover: daysToRecover === Infinity ? dayProgress.totalDays + 1 : daysToRecover,
    isRecoverable,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — TREND & MOMENTUM
// ══════════════════════════════════════════════════════════════

/**
 * Compute 7-day rolling average for a KPI from raw entries.
 * dailyValues must be ordered chronologically (oldest first).
 */
export function compute7DayRollingAvg(dailyValues: number[]): number {
  if (!dailyValues.length) return 0
  const last7 = dailyValues.slice(-7)
  return Math.round((last7.reduce((s, v) => s + v, 0) / last7.length) * 10) / 10
}

/**
 * Trend direction by comparing recent 7-day avg vs previous 7-day avg.
 * Formula from docs §7.2:
 *   change > +5%    → ACCELERATING
 *   change > +1%    → IMPROVING
 *   change > -1%    → STABLE
 *   change > -5%    → DECLINING
 *   else            → DETERIORATING
 */
export function computeTrendDirection(
  dailyValues: number[],    // ordered chronologically, min 14 values ideal
): TrendDirection {
  if (dailyValues.length < 2) return 'STABLE'

  const recent   = dailyValues.slice(-7)
  const previous = dailyValues.slice(-14, -7)

  if (!recent.length)    return 'STABLE'
  if (!previous.length)  return 'STABLE'

  const recentAvg   = recent.reduce((s, v) => s + v, 0)   / recent.length
  const previousAvg = previous.reduce((s, v) => s + v, 0) / previous.length

  if (!previousAvg || previousAvg === 0) return 'STABLE'

  const changePct = ((recentAvg - previousAvg) / previousAvg) * 100

  if (changePct > 5)    return 'ACCELERATING'
  if (changePct > 1)    return 'IMPROVING'
  if (changePct > -1)   return 'STABLE'
  if (changePct > -5)   return 'DECLINING'
  return 'DETERIORATING'
}

/**
 * Weekly momentum = (thisWeek - lastWeek) / lastWeek × 100.
 * Positive = gaining, Negative = losing.
 */
export function computeWeeklyMomentum(
  thisWeekValues: number[],
  lastWeekValues: number[],
): number {
  const thisWeek = thisWeekValues.reduce((s, v) => s + v, 0)
  const lastWeek = lastWeekValues.reduce((s, v) => s + v, 0)
  if (!lastWeek || lastWeek === 0) return 0
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — RISK LEVEL
// ══════════════════════════════════════════════════════════════

/**
 * Branch-level risk from the distribution of KPI traffic light statuses.
 * Formula from docs §6.2:
 *   criticalCount >= 3  → HIGH_RISK
 *   criticalCount >= 1  → MEDIUM_RISK
 *   warningCount  >= 2  → MEDIUM_RISK
 *   warningCount  >= 1  → LOW_RISK
 *   else                → ON_TRACK
 */
export function computeRiskLevel(statuses: TrafficLightStatus[]): RiskLevel {
  const criticalCount = statuses.filter((s) => s === 'critical').length
  const warningCount  = statuses.filter((s) => s === 'warning').length

  if (criticalCount >= 3) return 'HIGH_RISK'
  if (criticalCount >= 1) return 'MEDIUM_RISK'
  if (warningCount  >= 2) return 'MEDIUM_RISK'
  if (warningCount  >= 1) return 'LOW_RISK'
  return 'ON_TRACK'
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — WEAKEST / STRONGEST KPI DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Find the KPI with the lowest achievement %.
 * This becomes the Daily Focus KPI.
 */
export function findWeakestKpi(
  kpiStatsMap: Partial<Record<KpiKey, KpiStats>>,
): KpiKey {
  let weakest: KpiKey = 'wasfaty'
  let minAch  = Infinity

  for (const key of KPI_KEYS) {
    const stat = kpiStatsMap[key]
    if (!stat) continue
    if (stat.achievementPct < minAch) {
      minAch  = stat.achievementPct
      weakest = key
    }
  }
  return weakest
}

/**
 * Find the KPI with the highest achievement %.
 */
export function findStrongestKpi(
  kpiStatsMap: Partial<Record<KpiKey, KpiStats>>,
): KpiKey {
  let strongest: KpiKey = 'wasfaty'
  let maxAch   = -Infinity

  for (const key of KPI_KEYS) {
    const stat = kpiStatsMap[key]
    if (!stat) continue
    if (stat.achievementPct > maxAch) {
      maxAch    = stat.achievementPct
      strongest = key
    }
  }
  return strongest
}

/**
 * Priority rank: KPIs sorted by urgency (largest negative delta first).
 */
export function rankKpisByPriority(
  kpiStatsMap: Partial<Record<KpiKey, KpiStats>>,
): KpiKey[] {
  return KPI_KEYS
    .filter((k) => kpiStatsMap[k] != null)
    .sort((a, b) => {
      const deltaA = kpiStatsMap[a]!.delta
      const deltaB = kpiStatsMap[b]!.delta
      return deltaA - deltaB   // most negative delta (worst) first
    })
}

// ══════════════════════════════════════════════════════════════
// SECTION 11 — OVERALL ACHIEVEMENT
// ══════════════════════════════════════════════════════════════

/**
 * Weighted composite overall achievement %.
 * Default: equal weights (20% each KPI).
 * Formula from docs §2.4
 */
/**
 * Weighted composite overall achievement %.
 * Enterprise-safe:
 * - Excludes KPIs with missing/zero/NaN targets
 * - Normalises weights to only valid KPIs
 * - Caps each KPI contribution at ACHIEVEMENT_CAP
 * - Never returns NaN or Infinity
 *
 * dev mode: pass diagnostics=true to console.log per-KPI breakdown
 */
export function computeOverallAchievement(
  kpiStatsMap: Partial<Record<KpiKey, KpiStats>>,
  weights:     Record<KpiKey, number> = KPI_WEIGHTS,
  diagnostics: boolean = false,
): number {
  let weightedSum  = 0
  let totalWeight  = 0

  for (const key of KPI_KEYS) {
    const stat = kpiStatsMap[key]

    // Exclude KPI with missing stat
    if (!stat) {
      if (diagnostics) console.debug(`[ACH] ${key}: EXCLUDED — no stat`)
      continue
    }

    // Exclude KPI with invalid target
    if (!stat.target || stat.target <= 0 || !isFinite(stat.target) || isNaN(stat.target)) {
      if (diagnostics) console.debug(`[ACH] ${key}: EXCLUDED — target=${stat.target}`)
      continue
    }

    // Cap achievementPct defensively
    const cappedAch = Math.min(
      isNaN(stat.achievementPct) || !isFinite(stat.achievementPct) ? 0 : stat.achievementPct,
      ACHIEVEMENT_CAP
    )
    const w = weights[key] ?? 0

    if (diagnostics) {
      console.debug(
        `[ACH] ${key}: actual=${stat.actual} target=${stat.target} raw=${stat.achievementPct}% capped=${cappedAch}% weight=${w}`
      )
    }

    weightedSum += w * cappedAch
    totalWeight += w
  }

  if (!totalWeight) return 0
  const result = Math.round(weightedSum / totalWeight)

  if (diagnostics) console.debug(`[ACH] Overall: ${result}% (totalWeight=${totalWeight})`)

  return isNaN(result) || !isFinite(result) ? 0 : result
}

// ══════════════════════════════════════════════════════════════
// SECTION 12 — DAILY MISSION (Rule-based, AI-ready)
// ══════════════════════════════════════════════════════════════

/**
 * Classify mission difficulty from pace ratio.
 */
function classifyMissionDifficulty(paceRatio: number): MissionDifficulty {
  if (paceRatio >= 1.1)  return 'EASY'
  if (paceRatio >= 0.9)  return 'MODERATE'
  if (paceRatio >= 0.6)  return 'CHALLENGING'
  return 'STRETCH'
}

/**
 * Build the Daily Focus KPI mission.
 * Identifies the weakest KPI, sets a specific action, and adds motivation.
 *
 * _aiReady: true — replace this function body with an LLM call in Phase 1.
 * The input shape (pharmacistProfile, kpiStatsMap, paceMap) becomes the
 * AI context window payload.
 */
export function buildDailyMission(
  kpiStatsMap:  Partial<Record<KpiKey, KpiStats>>,
  paceMap:      Partial<Record<KpiKey, PaceResult>>,
  referenceDate?: Date,
): DailyMission | null {
  const available = KPI_KEYS.filter((k) => kpiStatsMap[k] != null)
  if (!available.length) return null

  const focusKpi  = findWeakestKpi(kpiStatsMap)
  const stats     = kpiStatsMap[focusKpi]!
  const pace      = paceMap[focusKpi]

  const allKpis = available.map((k) => ({
    key:    k,
    ach:    kpiStatsMap[k]!.achievementPct,
    target: kpiStatsMap[k]!.target,
  }))

  const day        = (referenceDate ?? new Date()).getDate()
  const motivation = MOTIVATIONAL[day % MOTIVATIONAL.length]
  const action     = ACTIONS[focusKpi]
  const difficulty = pace ? classifyMissionDifficulty(pace.paceRatio) : 'MODERATE'

  return {
    focusKpi,
    kpiLabel:       KPI_META[focusKpi],
    achievementPct: stats.achievementPct,
    targetGap:      stats.remainingToTarget,
    requiredToday:  pace?.requiredDailyPace ?? 0,
    currentRate:    pace?.currentDailyRate  ?? 0,
    action,
    motivation,
    difficulty,
    allKpis,
    _aiReady: true,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 13 — AGGREGATE ENTRY HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Extract daily values array for a single KPI key from an entries array.
 * Ordered oldest → newest (assumes entries sorted by date asc).
 */
export function extractDailyValues(
  entries: KpiEntry[],
  kpiKey:  KpiKey,
): number[] {
  return entries.map((e) => Number(e[kpiKey]) || 0)
}

/**
 * Sum a KPI across all entries in an array.
 */
export function sumKpi(entries: KpiEntry[], kpiKey: KpiKey): number {
  return entries.reduce((s, e) => s + (Number(e[kpiKey]) || 0), 0)
}

/**
 * Filter entries to a date range (inclusive).
 * Dates in "yyyy-MM-dd" format.
 */
export function filterByDateRange(
  entries:   KpiEntry[],
  fromDate:  string,
  toDate:    string,
): KpiEntry[] {
  return entries.filter((e) => e.date >= fromDate && e.date <= toDate)
}

/**
 * Filter entries to the current month.
 * Generates fromDate = "yyyy-MM-01" and toDate = "yyyy-MM-{last}".
 */
export function filterToCurrentMonth(
  entries:       KpiEntry[],
  referenceDate?: Date,
): KpiEntry[] {
  const d    = referenceDate ?? new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(yyyy, d.getMonth() + 1, 0).getDate()
  return filterByDateRange(entries, `${yyyy}-${mm}-01`, `${yyyy}-${mm}-${last}`)
}

/**
 * Filter entries to a specific date.
 */
export function filterToDate(entries: KpiEntry[], date: string): KpiEntry[] {
  return entries.filter((e) => e.date === date)
}

/**
 * Get target value for a KPI key from a MonthlyTarget document.
 */
/**
 * Safely extract target value for a KPI.
 * Returns 0 if target is missing, null, NaN, Infinity, or <= 0.
 * Parses string values from Firestore gracefully.
 */
export function getTargetForKpi(target: MonthlyTarget | null | undefined, kpiKey: KpiKey): number {
  if (!target) return 0
  const map: Record<KpiKey, keyof MonthlyTarget> = {
    wasfaty:      'wasfatyTarget',
    omni:         'omniTarget',
    wellness:     'wellnessTarget',
    basket:       'basketTarget',
    crossSelling: 'crossSellTarget',
  }
  const raw = target[map[kpiKey]]
  const n   = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  if (isNaN(n) || !isFinite(n) || n <= 0) return 0
  return n
}

/**
 * Safe target reader for any object that may have target fields.
 * Works with MonthlyTarget, inline objects, or Firestore docs.
 * Returns 0 for missing / NaN / Infinity / negative / string-0 values.
 */
export function safeReadTarget(obj: Record<string, unknown> | null | undefined, field: string): number {
  if (!obj) return 0
  const raw = obj[field]
  const n   = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  if (isNaN(n) || !isFinite(n) || n <= 0) return 0
  return n
}

/**
 * Safe actual KPI value reader.
 * Returns 0 for missing / NaN / Infinity / negative.
 */
export function safeReadActual(obj: Record<string, unknown> | null | undefined, field: string): number {
  if (!obj) return 0
  const raw = obj[field]
  const n   = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  if (isNaN(n) || !isFinite(n)) return 0
  return Math.max(0, n)
}

// ══════════════════════════════════════════════════════════════
// SECTION 14 — HIGH-LEVEL ORCHESTRATION
// ══════════════════════════════════════════════════════════════

/**
 * Analyse a single KPI end-to-end.
 * Combines stats + pace + forecast + gap.
 * Accepts optional sorted daily values for history-aware calculations.
 */
export function analyseKpi(
  actual:         number,
  target:         number,
  kpiKey:         KpiKey,
  dayProgress:    DayProgress,
  sortedDailyValues?: number[],
  trend?:         TrendDirection,
): FullKpiAnalysis {
  const stats    = computeKpiStats(actual, target, dayProgress, kpiKey)
  const pace     = computePace(actual, target, dayProgress)
  const forecast = computeForecast(actual, target, dayProgress, sortedDailyValues, trend)
  const gap      = computeGapAnalysis(actual, target, dayProgress)

  return { kpiKey, stats, pace, forecast, gap, trend }
}

/**
 * Full pharmacist profile — one-call API for the dashboard.
 *
 * @param mtdEntries    - All month-to-date entries for this pharmacist
 * @param todayEntries  - Today's entries only
 * @param target        - Monthly target document for this pharmacist's branch
 * @param allSortedEntries - Historical entries sorted asc (for trend)
 * @param referenceDate - Override today's date (useful for testing)
 */
export function buildPharmacistProfile(
  pharmacistId:       string,
  mtdEntries:         KpiEntry[],
  target:             MonthlyTarget | null,
  allSortedEntries?:  KpiEntry[],
  referenceDate?:     Date,
): PharmacistProfile {
  const dp     = getDayProgress(referenceDate)
  const month  = target?.month ?? (() => {
    const d = referenceDate ?? new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`
  })()

  const kpiAnalyses: FullKpiAnalysis[]              = []
  const kpiStatsMap: Partial<Record<KpiKey, KpiStats>> = {}
  const paceMap:     Partial<Record<KpiKey, PaceResult>> = {}

  for (const key of KPI_KEYS) {
    const actual     = sumKpi(mtdEntries, key)
    const tgt        = target ? getTargetForKpi(target, key) : 0
    const history    = allSortedEntries ? extractDailyValues(allSortedEntries, key) : undefined
    const trend      = history ? computeTrendDirection(history) : undefined
    const analysis   = analyseKpi(actual, tgt, key, dp, history, trend)

    kpiAnalyses.push(analysis)
    kpiStatsMap[key] = analysis.stats
    paceMap[key]     = analysis.pace
  }

  const overallAch    = computeOverallAchievement(kpiStatsMap)
  const overallStatus = getTrafficLight(overallAch, dp.ratio)
  const allStatuses   = KPI_KEYS.map((k) => kpiStatsMap[k]?.status ?? 'critical')
  const riskLevel     = computeRiskLevel(allStatuses)
  const weakestKpi    = findWeakestKpi(kpiStatsMap)
  const strongestKpi  = findStrongestKpi(kpiStatsMap)
  const mission       = buildDailyMission(kpiStatsMap, paceMap, referenceDate)

  return {
    pharmacistId,
    month,
    dayProgress:   dp,
    kpiAnalyses,
    overallAch,
    overallStatus,
    weakestKpi,
    strongestKpi,
    riskLevel,
    mission,
  }
}

/**
 * Minimal branch summary — aggregate all pharmacists' entries.
 * Used for Manager dashboard and branch ranking.
 */
export function buildBranchSummary(
  pharmacyId:  string,
  allEntries:  KpiEntry[],
  target:      MonthlyTarget | null,
  referenceDate?: Date,
): {
  pharmacyId:    string
  dayProgress:   DayProgress
  kpiStats:      Partial<Record<KpiKey, KpiStats>>
  overallAch:    number
  overallStatus: TrafficLightStatus
  riskLevel:     RiskLevel
  entryCount:    number
} {
  const dp    = getDayProgress(referenceDate)
  const today = (referenceDate ?? new Date()).toISOString().split('T')[0]

  const mtd   = filterToCurrentMonth(allEntries, referenceDate)
  const kpiStatsMap: Partial<Record<KpiKey, KpiStats>> = {}

  for (const key of KPI_KEYS) {
    const actual = sumKpi(mtd, key)
    const tgt    = target ? getTargetForKpi(target, key) : 0
    kpiStatsMap[key] = computeKpiStats(actual, tgt, dp, key)
  }

  const overallAch    = computeOverallAchievement(kpiStatsMap)
  const overallStatus = getTrafficLight(overallAch, dp.ratio)
  const allStatuses   = KPI_KEYS.map((k) => kpiStatsMap[k]?.status ?? 'critical')
  const riskLevel     = computeRiskLevel(allStatuses)

  return {
    pharmacyId,
    dayProgress:   dp,
    kpiStats:      kpiStatsMap,
    overallAch,
    overallStatus,
    riskLevel,
    entryCount:    filterToDate(allEntries, today).length,
  }
}
