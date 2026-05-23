// ============================================================
// Executive Intelligence Layer — Public API
// Import from this file, not individual modules.
// ============================================================

// Types
export type {
  ExecutiveGrade,
  KpiScoreBreakdown,
  ExecutiveScore,
  KpiTrendDetail,
  BranchTrendSummary,
  RiskCategory,
  RiskFlag,
  BranchRiskProfile,
  InsightType,
  InsightPriority,
  ExecutiveInsight,
  RecommendationAction,
  Recommendation,
  BranchExecutiveSummary,
  PortfolioRiskDistribution,
  ExecutiveReport,
  BranchInput,
  ExecutiveReportInput,
} from './executiveTypes'

export { GRADE_THRESHOLDS, RISK_WEIGHTS } from './executiveTypes'

// Score
export {
  computeExecutiveScore,
  scoreToGrade,
  GRADE_COLORS,
  GRADE_BG,
  GRADE_BORDER,
} from './executiveScore'

// Trend
export { computeBranchTrend, computeKpiTrend } from './trendEngine'

// Risk
export { computeBranchRiskProfile } from './riskEngine'

// Insights
export {
  generateBranchInsights,
  generatePortfolioInsights,
} from './insightEngine'

// Recommendations
export {
  generateBranchRecommendations,
  generatePortfolioRecommendations,
} from './recommendationEngine'

// Report Generator (main entry point)
export {
  generateBranchSummary,
  generateExecutiveReport,
} from './executiveReportGenerator'
