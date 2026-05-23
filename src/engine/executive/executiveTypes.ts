// ============================================================
// Executive Intelligence Layer — Type Definitions
// All types consumed by executiveScore, riskEngine,
// trendEngine, insightEngine, recommendationEngine,
// and executiveReportGenerator.
// ============================================================

import type {
  KpiKey,
  RiskLevel,
  TrendDirection,
  TrafficLightStatus,
  KpiEntry,
  MonthlyTarget,
} from '../kpiAnalyticsEngine'

// ── Re-export upstream types for convenience ─────────────────
export type {
  KpiKey, RiskLevel, TrendDirection, TrafficLightStatus,
  KpiEntry, MonthlyTarget,
}

// ══════════════════════════════════════════════════════════════
// 1. INPUT SHAPES
// ══════════════════════════════════════════════════════════════

/** One branch's raw data as input to the executive layer */
export interface BranchInput {
  pharmacyId:   string
  pharmacyName: string
  pharmacyCode: string
  region:       string

  /** All MTD entries for this branch (current month) */
  mtdEntries: KpiEntry[]

  /** Monthly target document for this branch */
  target:     MonthlyTarget | null

  /** Sorted historical daily entries (oldest → newest, up to 60 days) */
  historicalEntries?: KpiEntry[]

  /** Number of registered pharmacists in this branch */
  pharmacistCount?: number

  /** Number of pharmacists who submitted today */
  submittedToday?: number
}

/** Input for the full executive report generator */
export interface ExecutiveReportInput {
  branches:      BranchInput[]
  reportDate:    string          // "yyyy-MM-dd"
  reportMonth:   string          // "yyyy-MM"
  generatedBy:   string          // userId
}

// ══════════════════════════════════════════════════════════════
// 2. SCORING
// ══════════════════════════════════════════════════════════════

export type ExecutiveGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface KpiScoreBreakdown {
  kpiKey:         KpiKey
  label:          string
  actual:         number
  target:         number
  achievementPct: number
  status:         TrafficLightStatus
  weight:         number          // 0..1
  weightedScore:  number          // achievementPct × weight
}

export interface ExecutiveScore {
  /** Composite score 0..100 */
  overall:        number

  /** Letter grade */
  grade:          ExecutiveGrade

  /** Score per KPI */
  kpiBreakdown:   KpiScoreBreakdown[]

  /** Bonus/penalty adjustments */
  adjustments: {
    submissionRate: number        // +5 if >90%, -10 if <70%
    consistency:    number        // ±5 based on CV
    trend:          number        // ±5 based on momentum
  }

  /** Score after adjustments */
  adjusted: number
}

// ══════════════════════════════════════════════════════════════
// 3. TREND
// ══════════════════════════════════════════════════════════════

export interface KpiTrendDetail {
  kpiKey:       KpiKey
  label:        string
  direction:    TrendDirection
  momentum:     number            // -100..+100 (week-over-week)
  rollingAvg7:  number
  changePct7d:  number            // % change vs previous 7 days
  changePct30d: number            // % change vs previous 30 days
  dataPoints:   number
}

export interface BranchTrendSummary {
  pharmacyId:     string
  overallMomentum: number         // avg across KPIs
  direction:       TrendDirection // dominant direction
  kpiTrends:       KpiTrendDetail[]
}

// ══════════════════════════════════════════════════════════════
// 4. RISK
// ══════════════════════════════════════════════════════════════

export type RiskCategory =
  | 'PERFORMANCE'     // KPI achievement below threshold
  | 'SUBMISSION'      // pharmacists not submitting data
  | 'PACE'            // current pace won't reach target
  | 'TREND'           // deteriorating performance
  | 'FORECAST'        // projected EOM below acceptable level

export interface RiskFlag {
  category:     RiskCategory
  severity:     'HIGH' | 'MEDIUM' | 'LOW'
  kpiKey?:      KpiKey
  description:  string
  value?:       number            // the triggering metric value
  threshold?:   number            // the threshold that was crossed
}

export interface BranchRiskProfile {
  pharmacyId:   string
  riskLevel:    RiskLevel
  riskScore:    number            // 0..25 composite
  flags:        RiskFlag[]
  criticalCount: number
  warningCount:  number
}

// ══════════════════════════════════════════════════════════════
// 5. INSIGHTS
// ══════════════════════════════════════════════════════════════

export type InsightType =
  | 'ACHIEVEMENT'     // notable high/low performance
  | 'TREND'           // accelerating or deteriorating
  | 'RISK'            // risk flag surfaced
  | 'OPPORTUNITY'     // close to target, can hit it
  | 'MILESTONE'       // target already hit

export type InsightPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO'

export interface ExecutiveInsight {
  id:           string            // unique per report
  type:         InsightType
  priority:     InsightPriority
  title:        string
  body:         string
  kpiKey?:      KpiKey
  pharmacyId?:  string
  pharmacyName?: string
  value?:       number
  metric?:      string
}

// ══════════════════════════════════════════════════════════════
// 6. RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════

export type RecommendationAction =
  | 'FOCUS_KPI'
  | 'COACH_BRANCH'
  | 'ESCALATE'
  | 'RECOGNIZE'
  | 'SET_TARGET'
  | 'REVIEW_PACE'

export interface Recommendation {
  id:           string
  action:       RecommendationAction
  priority:     InsightPriority
  title:        string
  body:         string
  rationale:    string
  kpiKey?:      KpiKey
  pharmacyId?:  string
  pharmacyName?: string
  /** AI-ready: replace body generation with LLM call */
  _aiReady:     true
}

// ══════════════════════════════════════════════════════════════
// 7. BRANCH EXECUTIVE SUMMARY
// ══════════════════════════════════════════════════════════════

export interface BranchExecutiveSummary {
  // Identity
  pharmacyId:   string
  pharmacyName: string
  pharmacyCode: string
  region:       string
  reportMonth:  string
  reportDate:   string

  // Scoring
  score:          ExecutiveScore

  // KPI snapshot
  weakestKpi:     KpiKey
  strongestKpi:   KpiKey
  overallAchPct:  number

  // Risk
  riskProfile:    BranchRiskProfile

  // Trend
  trend:          BranchTrendSummary

  // Insights + Recommendations
  insights:       ExecutiveInsight[]
  recommendations: Recommendation[]

  // Metadata
  generatedAt:  string            // ISO timestamp
}

// ══════════════════════════════════════════════════════════════
// 8. PORTFOLIO EXECUTIVE REPORT
// ══════════════════════════════════════════════════════════════

export interface PortfolioRiskDistribution {
  onTrack:    number
  lowRisk:    number
  mediumRisk: number
  highRisk:   number
}

export interface ExecutiveReport {
  // Report identity
  reportId:    string
  reportDate:  string
  reportMonth: string
  generatedBy: string
  generatedAt: string

  // Portfolio summary
  totalBranches:   number
  activeBranches:  number          // at least 1 entry this month
  portfolioScore:  number          // weighted avg of branch scores
  portfolioGrade:  ExecutiveGrade

  // Portfolio KPI
  portfolioAch:    Record<KpiKey, {
    totalActual:    number
    totalTarget:    number
    achievementPct: number
    status:         TrafficLightStatus
  }>

  // Risk distribution
  riskDistribution: PortfolioRiskDistribution

  // Rankings
  topBranches:    BranchExecutiveSummary[]   // top 3 by score
  bottomBranches: BranchExecutiveSummary[]   // bottom 3 by score
  allBranches:    BranchExecutiveSummary[]

  // Portfolio insights and recommendations
  portfolioInsights:       ExecutiveInsight[]
  portfolioRecommendations: Recommendation[]
}

// ══════════════════════════════════════════════════════════════
// 9. GRADE THRESHOLDS (configurable)
// ══════════════════════════════════════════════════════════════

export const GRADE_THRESHOLDS: Record<ExecutiveGrade, number> = {
  A:  90,   // score >= 90
  B:  75,   // score >= 75
  C:  60,   // score >= 60
  D:  45,   // score >= 45
  F:   0,   // score < 45
}

export const RISK_WEIGHTS: Record<RiskCategory, number> = {
  PERFORMANCE: 5,
  SUBMISSION:  3,
  PACE:        4,
  TREND:       3,
  FORECAST:    3,
}
