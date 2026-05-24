// ============================================================
// Regional Intelligence — Type Definitions
// Types consumed by branchRollupEngine, and future
// regionalRollupEngine, heatmapEngine, and benchmarkEngine.
//
// Pure types — no Firebase, no React, no side effects.
// ============================================================

import type {
  KpiKey,
  KpiEntry,
  MonthlyTarget,
  TrafficLightStatus,
  RiskLevel,
  TrendDirection,
} from '../kpiAnalyticsEngine'

// ── Re-export upstream types used across the regional layer ──
export type {
  KpiKey, KpiEntry, MonthlyTarget,
  TrafficLightStatus, RiskLevel, TrendDirection,
}

// ══════════════════════════════════════════════════════════════
// 1. PERIOD
// ══════════════════════════════════════════════════════════════

/**
 * The reporting window for a rollup.
 * Currently supports month-to-date (MTD) and arbitrary date ranges.
 */
export type RegionalPeriodType =
  | 'MTD'        // month-to-date (most common)
  | 'RANGE'      // arbitrary start/end
  | 'FULL_MONTH' // complete closed month

export interface RegionalPeriod {
  type:       RegionalPeriodType
  /** Inclusive start date — "yyyy-MM-dd" */
  startDate:  string
  /** Inclusive end date — "yyyy-MM-dd" */
  endDate:    string
  /** "yyyy-MM" — used for target lookup */
  month:      string
  /** Fraction of month elapsed (0..1) for pace calculations */
  dayRatio:   number
}

// ══════════════════════════════════════════════════════════════
// 2. INPUT
// ══════════════════════════════════════════════════════════════

/**
 * Raw input for one branch in a regional rollup.
 * Deliberately mirrors BranchInput from the executive layer
 * but is independent so regional types can evolve separately.
 */
export interface BranchRollupInput {
  branchId:    string
  branchName:  string
  branchCode:  string
  region:      string

  /** MTD (or period-scoped) entries for this branch */
  entries:     KpiEntry[]

  /** Monthly target document — null when no target is set */
  target:      MonthlyTarget | null

  /**
   * Historical entries sorted oldest → newest (used for trend).
   * Optional — trend will be STABLE when absent.
   */
  historicalEntries?: KpiEntry[]

  /**
   * Number of pharmacists registered to this branch.
   * Used for submission rate; falls back to distinct submitter count.
   */
  pharmacistCount?: number

  /** Pharmacists who have submitted at least once on the reference date */
  submittedToday?: number
}

// ══════════════════════════════════════════════════════════════
// 3. KPI ROLLUP SUMMARY
// ══════════════════════════════════════════════════════════════

/**
 * Rolled-up metrics for a single KPI within a branch or region.
 */
export interface KpiRollupSummary {
  kpiKey:           KpiKey

  /** Total actual MTD value */
  actual:           number

  /** Target for the period (0 when no target) */
  target:           number

  /** actual / target × 100, capped at 200, 0 when target is 0 */
  achievementPct:   number

  /** Expected achievement given day progress */
  expectedPct:      number

  /** achievementPct − expectedPct */
  delta:            number

  /** Remaining volume needed to reach target */
  remainingToTarget: number

  /** Traffic-light status for this KPI */
  status:           TrafficLightStatus

  /** Whether this KPI has a valid target set */
  hasTarget:        boolean
}

// ══════════════════════════════════════════════════════════════
// 4. REGIONAL RISK LEVEL
// ══════════════════════════════════════════════════════════════

/**
 * Composite risk level for a branch or region.
 * Aligns with the executive layer's RiskLevel values so existing
 * UI color maps work without modification.
 */
export type RegionalRiskLevel =
  | 'ON_TRACK'    // ≥ 4 KPIs green
  | 'LOW_RISK'    // 1 KPI warning
  | 'MEDIUM_RISK' // 1+ KPI critical or 2+ warning
  | 'HIGH_RISK'   // 3+ KPIs critical

// ══════════════════════════════════════════════════════════════
// 5. REGIONAL MOMENTUM DIRECTION
// ══════════════════════════════════════════════════════════════

/**
 * Dominant momentum direction for a branch or region.
 * Extends TrendDirection with an explicit INSUFFICIENT_DATA state
 * so callers never need to handle undefined trend.
 */
export type RegionalMomentumDirection =
  | 'ACCELERATING'       // > +5% WoW
  | 'IMPROVING'          // +1..+5% WoW
  | 'STABLE'             // −1..+1% WoW
  | 'DECLINING'          // −5..−1% WoW
  | 'DETERIORATING'      // < −5% WoW
  | 'INSUFFICIENT_DATA'  // < 2 data points — cannot compute

// ══════════════════════════════════════════════════════════════
// 6. DATA QUALITY FLAGS
// ══════════════════════════════════════════════════════════════

export type DataQualityFlagCode =
  // ── Branch-level codes ──────────────────────────────────
  | 'NO_ENTRIES'              // branch has zero MTD entries
  | 'NO_TARGET'               // no target document for this month
  | 'PARTIAL_TARGET'          // some KPI targets are 0 but others are set
  | 'LOW_SUBMISSION_RATE'     // < 70% of pharmacists submitted today
  | 'STALE_DATA'              // most recent entry is > 3 days old
  | 'INSUFFICIENT_HISTORY'    // < 14 historical days (trend unreliable)
  // ── Regional-level codes ─────────────────────────────────
  | 'HIGH_INACTIVE_RATE'      // > 30% of branches have no data
  | 'HIGH_NO_TARGET_RATE'     // > 40% of branches missing targets
  | 'REGION_HIGH_RISK'        // > 50% of branches are HIGH_RISK
  | 'REGION_LOW_DATA_QUALITY' // > 30% of branches have ERROR flags

export type DataQualitySeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface DataQualityFlag {
  code:        DataQualityFlagCode
  severity:    DataQualitySeverity
  description: string
  /** Optional numeric context (e.g. submission rate, days stale) */
  value?:      number
}

// ══════════════════════════════════════════════════════════════
// 7. OPERATIONAL STATUS
// ══════════════════════════════════════════════════════════════

/**
 * High-level operational classification for a branch.
 * Derived from data quality flags + performance metrics.
 */
export type BranchOperationalStatus =
  | 'ACTIVE'          // entries present, target set, data fresh
  | 'NO_DATA'         // zero entries this period
  | 'NO_TARGET'       // entries present but no target set
  | 'STALE'           // last entry > 3 days ago
  | 'DEGRADED'        // entries + target present but partial/low quality

// ══════════════════════════════════════════════════════════════
// 8. BRANCH ROLLUP SUMMARY
// ══════════════════════════════════════════════════════════════

/**
 * Fully computed rollup summary for a single branch.
 * This is the primary output of branchRollupEngine.generateBranchRollup().
 *
 * Designed to be composable:
 *   BranchRollupSummary[] → regional aggregation (Phase 4B-0B)
 *   BranchRollupSummary[] → heatmap rendering  (Phase 4B-1)
 *   BranchRollupSummary[] → benchmark engine   (Phase 4B-2)
 */
export interface BranchRollupSummary {
  // ── Identity ──────────────────────────────────────────────
  branchId:    string
  branchName:  string
  branchCode:  string
  region:      string

  // ── Period ────────────────────────────────────────────────
  period:      RegionalPeriod

  // ── KPI detail ────────────────────────────────────────────
  /** One KpiRollupSummary per KPI key — always 5 entries */
  kpiAchievementSummary: KpiRollupSummary[]

  /** Weighted composite achievement % (0..100+, pre-cap) */
  overallAchievementPct: number

  // ── Score ─────────────────────────────────────────────────
  /**
   * Composite branch score 0..100 (adjusted for submission rate,
   * consistency, and trend). Same algorithm as executive layer.
   */
  branchScore: number

  // ── Risk ──────────────────────────────────────────────────
  riskLevel:   RegionalRiskLevel

  // ── Momentum ──────────────────────────────────────────────
  momentumDirection: RegionalMomentumDirection

  // ── Operational ───────────────────────────────────────────
  operationalStatus: BranchOperationalStatus

  // ── Data quality ──────────────────────────────────────────
  /** Ordered by severity: ERROR → WARNING → INFO */
  dataQualityFlags: DataQualityFlag[]

  /** True when at least one ERROR flag is present */
  hasDataErrors:    boolean

  // ── Submission ────────────────────────────────────────────
  submissionRatePct: number   // 0..100 — % of pharmacists who submitted today

  // ── Metadata ──────────────────────────────────────────────
  generatedAt: string         // ISO timestamp
}

// ══════════════════════════════════════════════════════════════
// 9. REGIONAL KPI AVERAGE
// ══════════════════════════════════════════════════════════════

/**
 * Aggregated KPI metrics across all active branches in a region.
 * Averages are weighted by branch count (each branch = 1 vote).
 */
export interface RegionalKpiAverage {
  kpiKey:           KpiKey

  /** Mean actual value across active branches */
  meanActual:       number

  /** Mean target value across branches that have a target */
  meanTarget:       number

  /** Mean achievement % — excludes branches with no target */
  meanAchievementPct: number

  /** Branch count contributing to the averages */
  contributingBranches: number

  /** Traffic-light status derived from meanAchievementPct */
  status:           TrafficLightStatus

  /** KPI key with the widest spread (max − min achievement %) */
  spreadPct:        number
}

// ══════════════════════════════════════════════════════════════
// 10. RISK CONCENTRATION
// ══════════════════════════════════════════════════════════════

/** Distribution of risk levels across branches in a region */
export interface RegionalRiskConcentration {
  onTrack:    number   // count
  lowRisk:    number
  mediumRisk: number
  highRisk:   number
  /** % of branches that are HIGH_RISK */
  highRiskPct: number
}

// ══════════════════════════════════════════════════════════════
// 11. RECOVERY SIGNAL
// ══════════════════════════════════════════════════════════════

export type RecoverySignalStrength =
  | 'STRONG'     // branchScore >= 70 and momentum IMPROVING+
  | 'MODERATE'   // branchScore >= 50 and momentum STABLE
  | 'WEAK'       // branchScore < 50 and momentum DECLINING

/** A branch within a region that shows signs of recovery */
export interface RecoverySignal {
  branchId:         string
  branchName:       string
  strength:         RecoverySignalStrength
  momentumDirection: RegionalMomentumDirection
  branchScore:      number
  overallAchievementPct: number
}

// ══════════════════════════════════════════════════════════════
// 12. REGIONAL ROLLUP SUMMARY
// ══════════════════════════════════════════════════════════════

/**
 * Fully aggregated intelligence summary for one region.
 * Output of regionalRollupEngine.generateRegionalRollups().
 *
 * Designed to feed:
 *   RegionalRollupSummary[] → heatmap rendering  (Phase 4B-1)
 *   RegionalRollupSummary[] → benchmark engine   (Phase 4B-2)
 *   RegionalRollupSummary[] → executive UI panels
 */
export interface RegionalRollupSummary {
  // ── Identity ──────────────────────────────────────────────
  regionName:    string

  // ── Branch counts ─────────────────────────────────────────
  branchCount:   number            // total branches in region
  activeBranches: number           // branches with at least 1 entry
  inactiveBranches: number         // branches with NO_DATA status
  noTargetBranches: number         // branches without a target

  // ── Score ─────────────────────────────────────────────────
  /** Mean branch score (0..100) — only active branches */
  regionalScore:    number

  // ── Risk ──────────────────────────────────────────────────
  regionalRiskLevel:    RegionalRiskLevel
  riskConcentration:    RegionalRiskConcentration

  // ── KPI averages ──────────────────────────────────────────
  /** One RegionalKpiAverage per KPI key — always 5 entries */
  kpiAverages:    RegionalKpiAverage[]

  // ── Weakest / strongest KPIs ──────────────────────────────
  /** Up to 2 KPI keys with the lowest mean achievement % */
  weakestKpis:    KpiKey[]

  /** Up to 2 KPI keys with the highest mean achievement % */
  strongestKpis:  KpiKey[]

  // ── Recovery signals ──────────────────────────────────────
  /** Branches in this region showing recovery momentum */
  recoverySignals: RecoverySignal[]

  // ── Data quality ──────────────────────────────────────────
  /** Regional-level data quality flags (not branch-level) */
  dataQualityFlags: DataQualityFlag[]

  // ── Metadata ──────────────────────────────────────────────
  generatedAt:   string            // ISO timestamp
}

// ══════════════════════════════════════════════════════════════
// 13. REGIONAL TREND ENGINE TYPES
// ══════════════════════════════════════════════════════════════

/**
 * Operational trend direction for a region — derived from score
 * movement, recovery signals, risk concentration, and KPI spread.
 *
 * Distinct from RegionalMomentumDirection (which is per-branch /
 * per-KPI). This is a regional aggregate classification.
 */
export type RegionalTrendDirection =
  | 'IMPROVING'   // score rising, risk concentration decreasing
  | 'DECLINING'   // score falling, risk concentration increasing
  | 'STABLE'      // score ±3 points, risk concentration steady
  | 'VOLATILE'    // high KPI spread + mixed branch directions
  | 'RECOVERY'    // was under stress, now showing positive signals

/** Input for the regional trend engine */
export interface RegionalTrendInput {
  /** Current rollup summary for this region */
  current:   RegionalRollupSummary

  /**
   * Previous period rollup for comparison.
   * When absent (first run), trend is STABLE with low confidence.
   */
  previous?: RegionalRollupSummary
}

/** Full trend analysis output for a region */
export interface RegionalTrendAnalysis {
  regionName:          string

  /** Dominant operational direction */
  trendDirection:      RegionalTrendDirection

  /**
   * Momentum score: −100 (strongly declining) to +100 (strongly improving).
   * Derived from score delta, risk shift, and recovery signal density.
   */
  momentumScore:       number

  /**
   * Stability score: 0 (chaotic) to 100 (very stable).
   * High spread + volatile branch directions → low stability.
   */
  stabilityScore:      number

  /**
   * True when ≥ 1 STRONG recovery signal is present and the region
   * was not already ON_TRACK last period.
   */
  recoverySignal:      boolean

  /**
   * True when ≥ 40% of branches are HIGH_RISK AND the score is
   * below 60 AND there are no STRONG recovery signals.
   */
  sustainedStressSignal: boolean

  /**
   * Short executive-ready narrative describing the region's trend.
   * Rule-based — no AI. Suitable for dashboard tooltips and reports.
   */
  trendNarrative:      string

  generatedAt:         string
}

// ══════════════════════════════════════════════════════════════
// 14. REGIONAL RISK ENGINE TYPES
// ══════════════════════════════════════════════════════════════

/**
 * Reason categories for regional risk flags.
 * Executive and operational language — no punitive framing.
 */
export type RegionalRiskReasonCode =
  | 'HIGH_RISK_CONCENTRATION'    // > 40% branches HIGH_RISK
  | 'SUSTAINED_SCORE_DECLINE'    // score dropped ≥ 10 pts vs previous
  | 'UNSTABLE_PERFORMANCE'       // volatility score < 40
  | 'WEAK_KPI_CLUSTER'           // ≥ 2 KPIs below 60% mean achievement
  | 'HIGH_INACTIVE_BRANCHES'     // > 30% branches with NO_DATA
  | 'DATA_QUALITY_RISK'          // > 25% branches have ERROR flags
  | 'RECOVERY_STALLED'           // had recovery signal, now declining

export interface RegionalRiskReason {
  code:        RegionalRiskReasonCode
  description: string
  /** Numeric context (e.g. % of HIGH_RISK branches, KPI achievement) */
  value?:      number
}

/**
 * Priority focus area — an actionable area for executive attention.
 * Executive language: specific, positive, constructive.
 */
export interface RegionalPriorityFocusArea {
  area:        string       // e.g. "Wasfaty & Cross Selling performance"
  action:      string       // e.g. "Review targets and coaching plans"
  urgency:     'HIGH' | 'MEDIUM' | 'LOW'
  kpiKeys?:    KpiKey[]     // relevant KPIs if KPI-specific
}

/**
 * Executive warning — surfaced only for serious regional conditions.
 * Severity deliberately limited to 2 levels to avoid alert fatigue.
 */
export interface RegionalExecutiveWarning {
  title:       string
  description: string
  severity:    'CRITICAL' | 'ELEVATED'
}

/** Full risk assessment output for a region */
export interface RegionalRiskAssessment {
  regionName:          string

  /** Aggregate regional risk level */
  regionalRiskLevel:   RegionalRiskLevel

  /** Ordered list of risk reasons (most impactful first) */
  riskReasons:         RegionalRiskReason[]

  /** Up to 3 priority focus areas for executive action */
  priorityFocusAreas:  RegionalPriorityFocusArea[]

  /** Executive warnings — only present when truly warranted */
  executiveWarnings:   RegionalExecutiveWarning[]

  generatedAt:         string
}

// ══════════════════════════════════════════════════════════════
// 15. UNIFIED REGIONAL INTELLIGENCE TYPES
// ══════════════════════════════════════════════════════════════

/**
 * Input to the unified regional intelligence generator.
 */
export interface RegionalIntelligenceInput {
  /** Branch-level rollup summaries (one per branch, all regions) */
  branchRollups: BranchRollupSummary[]

  /**
   * Previous period's regional rollups for trend comparison.
   * Optional — trends default to STABLE when absent.
   */
  previousRegionalRollups?: RegionalRollupSummary[]

  /**
   * The reporting period.
   * Optional — used for metadata only at this layer; period is
   * already embedded in each BranchRollupSummary.
   */
  period?: RegionalPeriod
}

// ── Portfolio-level summary ───────────────────────────────────

/** Cross-regional portfolio overview */
export interface PortfolioRegionalSummary {
  totalRegions:         number
  totalBranches:        number
  activeBranches:       number
  inactiveBranches:     number

  /** Mean regional score across all regions (0..100) */
  averageRegionalScore: number

  /** Regions with HIGH_RISK level or CRITICAL/ELEVATED warnings */
  highestRiskRegions:   string[]

  /** Regions with the highest regional score */
  strongestRegions:     string[]

  /** Regions with the lowest regional score */
  weakestRegions:       string[]

  /** Regions whose trend engine classified them as VOLATILE */
  volatileRegions:      string[]

  /** Regions whose trend engine classified them as RECOVERY */
  recoveringRegions:    string[]
}

// ── Executive focus area (portfolio-level) ───────────────────

/**
 * A portfolio-level executive focus recommendation.
 * Aggregates risk signals from all regions into a prioritised
 * action list for the executive layer.
 */
export interface ExecutiveFocusArea {
  regionName:  string
  reason:      string        // short human-readable rationale
  urgency:     'CRITICAL' | 'HIGH' | 'MEDIUM'
  /** Supporting detail from the risk assessment */
  detail:      string
}

// ── Data quality warning (portfolio-level) ──────────────────

/** A data quality concern surfaced at the portfolio level */
export interface PortfolioDataQualityWarning {
  regionName:  string
  code:        DataQualityFlagCode
  severity:    DataQualitySeverity
  description: string
  value?:      number
}

// ── Unified output ───────────────────────────────────────────

/**
 * The complete unified regional intelligence output.
 * Output of generateRegionalIntelligence().
 *
 * Designed to power:
 *   - Regional heatmap UI        (Phase 4B-1)
 *   - Regional executive panels  (Phase 4B-2)
 *   - Benchmark engine           (Phase 4B-3)
 *   - Executive BI dashboard     (Phase 4A — existing)
 */
export interface RegionalIntelligenceOutput {
  /** Per-region rollup summaries (from regionalRollupEngine) */
  regionalSummaries:  RegionalRollupSummary[]

  /** Per-region trend analyses (from regionalTrendEngine) */
  regionalTrends:     RegionalTrendAnalysis[]

  /** Per-region risk assessments (from regionalRiskEngine) */
  regionalRisks:      RegionalRiskAssessment[]

  /** Cross-regional portfolio overview */
  portfolioRegionalSummary: PortfolioRegionalSummary

  /** Ordered list of regions/areas requiring executive attention */
  recommendedExecutiveFocusAreas: ExecutiveFocusArea[]

  /** Aggregated data quality warnings across all regions */
  dataQualityWarnings: PortfolioDataQualityWarning[]

  generatedAt: string
}
