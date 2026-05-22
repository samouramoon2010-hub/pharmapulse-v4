// ============================================================
// KPI Analytics Engine — Public API
// Import from here, not directly from kpiAnalyticsEngine.ts
// ============================================================

// Types
export type {
  KpiKey,
  TrafficLightStatus,
  TrendDirection,
  PaceStatus,
  RiskLevel,
  RecoveryLabel,
  MissionDifficulty,
  KpiEntry,
  MonthlyTarget,
  DayProgress,
  TrafficLightColors,
  KpiStats,
  PaceResult,
  ForecastResult,
  GapAnalysis,
  FullKpiAnalysis,
  DailyMission,
  PharmacistProfile,
} from './kpiAnalyticsEngine'

// Constants
export {
  KPI_KEYS,
  KPI_META,
  KPI_WEIGHTS,
  TRAFFIC_COLORS,
} from './kpiAnalyticsEngine'

// Day Progress
export { getDayProgress } from './kpiAnalyticsEngine'

// Achievement & Traffic Light
export {
  computeAchievementPct,
  computeExpectedMTD,
  getTrafficLight,
  computeRemainingToTarget,
  computeKpiStats,
} from './kpiAnalyticsEngine'

// Pace Engine
export {
  computeCurrentDailyRate,
  computeRequiredDailyPace,
  computePaceRatio,
  classifyPaceStatus,
  computePace,
} from './kpiAnalyticsEngine'

// Forecast Engine
export {
  computeForecastEOM,
  computeForecastScenarios,
  computeBreakEvenDay,
  computeRecoveryProbability,
  classifyRecoveryLabel,
  computeForecast,
} from './kpiAnalyticsEngine'

// Gap Analysis
export {
  computeAbsoluteGap,
  computeRelativeGapPct,
  computeDaysToRecover,
  computeGapAnalysis,
} from './kpiAnalyticsEngine'

// Trend & Momentum
export {
  compute7DayRollingAvg,
  computeTrendDirection,
  computeWeeklyMomentum,
} from './kpiAnalyticsEngine'

// Risk Level
export { computeRiskLevel } from './kpiAnalyticsEngine'

// Weakest / Strongest KPI
export {
  findWeakestKpi,
  findStrongestKpi,
  rankKpisByPriority,
} from './kpiAnalyticsEngine'

// Overall Achievement
export { computeOverallAchievement } from './kpiAnalyticsEngine'

// Daily Mission
export { buildDailyMission } from './kpiAnalyticsEngine'

// Entry Helpers
export {
  extractDailyValues,
  sumKpi,
  filterByDateRange,
  filterToCurrentMonth,
  filterToDate,
  getTargetForKpi,
} from './kpiAnalyticsEngine'

// High-level orchestration
export {
  analyseKpi,
  buildPharmacistProfile,
  buildBranchSummary,
} from './kpiAnalyticsEngine'

// ── Historical Data Layer V1 ──────────────────────────────────
export type {
  KpiDailySnapshot,
  DailySummary,
  MonthlySummary,
  ForecastSnapshot,
  RiskSnapshot,
  RankingEntry,
  RankingHistory,
  TrendSummary,
  AnalyticsCache,
} from './historyEngine'

export {
  // Constants
  HISTORY_COLLECTIONS,
  PERFORMANCE_RULES,
  TRIGGER_STRATEGY,

  // ID helpers
  dailySummaryId,
  monthlySummaryId,
  forecastSnapshotId,
  riskSnapshotId,
  rankingHistoryId,
  todayString,
  monthString,

  // Generators
  generateDailySummary,
  generateMonthlySummary,
  generateForecastSnapshot,
  generateRiskSnapshot,

  // Trend engine
  buildTrendSummary7d,
  buildTrendSummary30d,
  buildAllTrends,
  computeAchievementEvolution,
  computeHistoricalPace,

  // Ranking
  computeRankingHistory,

  // Cache
  buildAnalyticsCache,

  // Trigger helper
  getSummaryWriteTargets,
} from './historyEngine'
