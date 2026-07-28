// ============================================================
// Branch Intelligence — Type Definitions
// Phase 4A
//
// Pure types only. No Firestore, no React, no runtime logic.
// Reuses KpiKey from kpiAnalyticsEngine and OperationalRisk /
// AccountabilityInsight from teamIntelligence — no duplicate
// type definitions.
// ============================================================

import type { KpiKey } from '../kpiAnalyticsEngine'
import type {
  KpiSnapshot,
  PharmacistPerformanceSummary,
  TeamIntelligenceResult,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { BranchExecutiveSummary } from '../executive/executiveTypes'
import type { BranchMomentum } from '../liveAnalytics/liveAnalyticsTypes'

// ══════════════════════════════════════════════════════════════
// 1. KPI CONTRIBUTION ENTRY
// ══════════════════════════════════════════════════════════════

/**
 * One pharmacist's contribution to a single KPI's branch result.
 * Produced by computeKpiContributionBreakdown, one array per KPI.
 */
export interface KpiContributionEntry {
  pharmacistId:   string
  pharmacistName: string

  /** Pharmacist's actual value for this KPI this month */
  actual: number

  /** Pharmacist's target for this KPI (personal target, or apportioned branch target) */
  target: number

  /** Pharmacist's achievement % for this KPI (from kpiSnapshots) */
  achievementPct: number

  /**
   * Share of the branch's total `actual` for this KPI produced by this
   * pharmacist, as a percentage (0-100, 1 decimal). 0 when the branch
   * total is 0 (avoids divide-by-zero).
   */
  contributionPct: number

  /**
   * 1-indexed rank within the branch for this KPI, sorted by
   * achievementPct DESC. Ranks by achievement (performance vs. own
   * target), not raw actual.
   */
  contributionRank: number

  /**
   * True for the bottom 1 (team size <= 4) or bottom 2 (team size > 4)
   * entries by achievementPct, restricted to entries with target > 0.
   * Always false when target === 0.
   */
  isLowestContributor: boolean

  /**
   * True for the single highest-achievementPct entry with target > 0.
   * Always false when target === 0.
   */
  isTopContributor: boolean

  /** Pace status for this KPI, carried through from the pharmacist's KpiSnapshot */
  paceStatus: KpiSnapshot['paceStatus']
}

// ══════════════════════════════════════════════════════════════
// 2. WEAK KPI ATTRIBUTION
// ══════════════════════════════════════════════════════════════

/** A pharmacist flagged as a contributor to the branch's Focus KPI shortfall */
export interface WeakKpiContributor {
  userId:         string
  displayName:    string
  achievementPct: number
  paceStatus:     KpiSnapshot['paceStatus']
}

/** Accountability flag attached to a weak-KPI contributor */
export interface WeakKpiAccountabilityFlag {
  userId:      string
  displayName: string
  flag:        'needsOperationalSupport' | 'consistentUnderperformance'
  detail:      string
}

/**
 * Attribution analysis for the branch's Focus KPI — answers
 * "which pharmacists are dragging this KPI down, and why".
 */
export interface WeakKpiAttribution {
  focusKpi: KpiKey

  /** Entries from computeKpiContributionBreakdown flagged isLowestContributor */
  weakestPharmacists: WeakKpiContributor[]

  /**
   * medianAchievementPct - branchAverageAchievementPct.
   * > 10  → underperformance concentrated in specific individuals.
   * <= 10 → underperformance broadly distributed across the team.
   */
  contributionGap: number

  /**
   * Accountability signals for weakestPharmacists where
   * needsOperationalSupport or consistentUnderperformance is true.
   */
  accountabilityFlags: WeakKpiAccountabilityFlag[]

  /** Deterministic, template-based human-readable summary. No AI. */
  explanation: string
}

// ══════════════════════════════════════════════════════════════
// 3. EXPECTED IMPACT
// ══════════════════════════════════════════════════════════════

/**
 * Static "what-if" projection: if the lowest contributors for the
 * Focus KPI reached the team median, what would the branch's
 * achievement % become.
 */
export interface ExpectedImpact {
  /** Human-readable description of the scenario being modeled */
  scenario: string

  /** Branch's current achievement % for the Focus KPI */
  currentBranchPct: number

  /** Projected branch achievement % if lowest contributors reach the median */
  projectedBranchPct: number

  /** projectedBranchPct - currentBranchPct */
  impactDeltaPts: number
}

// ══════════════════════════════════════════════════════════════
// 4. SUPERVISOR ACTION
// ══════════════════════════════════════════════════════════════

export type SupervisorActionSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * One actionable recommendation produced by evaluateSupervisorActionRules.
 * Deterministic, rule-based — no AI/LLM involvement.
 */
export interface SupervisorAction {
  severity: SupervisorActionSeverity

  /** What is happening (the observation) */
  problem: string

  /** Why it is happening (the attribution) */
  cause: string

  /** What the supervisor should do */
  recommendedAction: string

  /**
   * Static what-if projection, when applicable.
   * null when conditions in computeExpectedImpact's "when not to show" list apply.
   */
  expectedImpact: ExpectedImpact | null

  /** Short bullet-point facts supporting problem/cause */
  evidence: string[]

  /** userIds of pharmacists this action concerns. Empty array for team-wide actions. */
  relatedPharmacists: string[]

  /** KPI this action concerns. Omitted (undefined) only for Rule 7 (no-data) actions. */
  relatedKpi?: KpiKey
}

// ══════════════════════════════════════════════════════════════
// 5. BRANCH INTELLIGENCE VIEW MODEL (Phase 4B)
// ══════════════════════════════════════════════════════════════

/** Per-pharmacist row for Section 3 (Pharmacist Ranking). */
export interface PharmacistRankingEntry {
  rank:              number   // 1-indexed, sorted by performanceScore DESC
  userId:            string
  displayName:       string
  performanceScore:  number
  grade:             string   // ExecutiveGrade ('A'|'B'|'C'|'D'|'F'), via scoreToGrade
  momentumDirection: PharmacistPerformanceSummary['momentumDirection']
  momentumDelta:     number
}

/** Section 1 — Branch Executive Summary. */
export interface BranchSummaryViewModel {
  pharmacyId:    string
  pharmacyName:  string
  pharmacyCode:  string
  region:        string
  healthScore:   number
  healthGrade:   string   // ExecutiveGrade
  /**
   * Forecast EOM % for the Focus KPI, if available.
   *
   * BranchExecutiveSummary does not expose a branch-level forecast field —
   * forecastAchPct is computed internally by executive.riskEngine and only
   * surfaces via a RiskFlag (category: 'FORECAST') when a KPI's forecast
   * crosses a warning/critical threshold. Rather than re-implement
   * computeForecast here (would duplicate executive engine logic), this
   * field is populated from that RiskFlag's `value` when present, and is
   * null otherwise. A warning is added to the view model when null.
   */
  forecastPct:   number | null
  forecastTrend: string   // TrendDirection
  /**
   * Evidence behind forecastTrend — the per-KPI trend detail
   * (trendEngine.ts) that forecastTrend collapses into one branch-level
   * arrow. Week-over-week momentum + 7d/30d % change per KPI, sorted by
   * |momentum| descending so the most-moving KPI leads.
   */
  kpiTrends: Array<{
    kpiKey:       string
    label:        string
    direction:    string  // TrendDirection
    momentum:     number
    changePct7d:  number
    changePct30d: number
  }>
  riskLevel:     string   // RiskLevel
  /**
   * Evidence behind riskLevel — the actual flags riskEngine raised for
   * this branch (category/severity/description), sorted HIGH severity
   * first. Empty when the branch has no active risk flags. Surfaced so
   * riskLevel is never a bare "Action" label with no "Evidence" to
   * drill into (CLAUDE.design.md: Action → Evidence → Drill Down).
   */
  riskFlags: Array<{
    category:    string  // RiskCategory
    severity:    'HIGH' | 'MEDIUM' | 'LOW'
    description: string
  }>
  riskCriticalCount: number
  riskWarningCount:  number
  branchRank: {
    currentRank:  number
    cohortSize:   number
    rankMovement: number | null
  } | null
  teamSize: number
}

/** Section 5 — Coaching Opportunities. */
export interface CoachingOpportunitiesViewModel {
  topPerformer: {
    userId: string
    displayName: string
    performanceScore: number
    strongestKpi: KpiKey
  } | null

  mostImproved: {
    userId: string
    displayName: string
    momentumDelta: number
  } | null

  mostAtRisk: {
    userId: string
    displayName: string
    operationalRisk: PharmacistPerformanceSummary['operationalRisk']
  } | null

  lowestContributor: {
    userId: string
    displayName: string
    kpiKey: KpiKey
    achievementPct: number
  } | null
}

/** Top-level view model consumed by the Branch Intelligence page (future UI). */
export interface BranchIntelligenceViewModel {
  branchSummary: BranchSummaryViewModel

  kpiIntelligence: {
    focusKpi: KpiKey | null
  }

  pharmacistRanking: PharmacistRankingEntry[]

  contributionByKpi: Record<KpiKey, KpiContributionEntry[]>

  coachingOpportunities: CoachingOpportunitiesViewModel

  supervisorActions: SupervisorAction[]

  /** Passed through unchanged from the builder input — see
   *  BranchIntelligenceBuilderInput.momentum. */
  momentum: BranchMomentum

  weakKpiAttribution: WeakKpiAttribution | null

  metadata: {
    pharmacyId:  string
    month:       string
    generatedAt: string
    dataAvailability: {
      hasKpiEntries:        boolean
      hasTargets:           boolean
      hasEvaluationResults: boolean
      hasRankingSnapshot:   boolean
    }
  }

  warnings: string[]
}

// ══════════════════════════════════════════════════════════════
// 6. VIEW MODEL BUILDER — INPUT TYPES (Phase 4B)
// ══════════════════════════════════════════════════════════════

/**
 * Raw, pre-computed inputs to buildBranchIntelligenceViewModel.
 *
 * "Prepared inputs" — the caller (a future data-fetching hook) is
 * responsible for invoking executive.generateBranchSummary and
 * teamIntelligence.generateTeamIntelligence (both of which have an
 * implicit Date.now() dependency via getDayProgress) BEFORE calling
 * the builder. The builder itself touches no Firestore, no Date,
 * and is fully deterministic given these inputs.
 */
export interface BranchIntelligenceBuilderInput {
  /** Pre-computed by executive.generateBranchSummary(branchInput, reportDate, reportMonth). */
  branchSummary: BranchExecutiveSummary

  /** Pre-computed by teamIntelligence.generateTeamIntelligence(...). */
  teamIntelligence: TeamIntelligenceResult

  /** Active roster size for this branch (e.g. getUsersByPharmacy(pharmacyId).length). */
  teamSize: number

  /**
   * Pre-computed by liveAnalytics.computeLiveMomentum(momentumInput, registry).
   * EMA-smoothed, anomaly-aware momentum per KPI plus a branch-level
   * overall direction — a different, more sensitive signal than
   * branchSummary.trend (which is week/month-level, not day-level).
   */
  momentum: BranchMomentum

  /**
   * Branch ranking snapshot for this period, if one exists.
   * null when no snapshot has been generated yet — the builder will
   * not invent a rank (per Phase 3 Deliverable 5).
   */
  branchRankSnapshot: {
    currentRank:  number
    previousRank?: number
    rankMovement?: number
    cohortSize:   number
  } | null

  metadata: {
    pharmacyId:  string
    month:       string
    generatedAt: string
    dataAvailability: {
      hasKpiEntries:        boolean
      hasTargets:           boolean
      hasEvaluationResults: boolean
      hasRankingSnapshot:   boolean
    }
  }
}
