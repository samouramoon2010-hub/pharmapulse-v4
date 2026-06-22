// ============================================================
// Pharmacist Intelligence — Type Definitions
// Phase 5C-1
//
// Pure types only. No Firestore, no React, no runtime logic.
// Reuses KpiKey from kpiAnalyticsEngine, KpiSnapshot/CoachingRecommendation
// from teamIntelligence, and SupervisorAction/ExpectedImpact/
// KpiContributionEntry from branchIntelligence — no duplicate type
// definitions.
//
// Confirmed gaps (per Phase 5C architecture review — do not invent):
//   - No supervisor/"reports to" field on the user document.
//   - No supervisor-group or regional pharmacist ranking engine.
//   - No per-KPI historical trend (only overall momentumDirection/Delta).
// These are represented below as `null`-only fields / omitted fields,
// never as computed or guessed values.
// ============================================================

import type { KpiKey } from '../kpiAnalyticsEngine'
import type {
  KpiSnapshot,
  CoachingRecommendation,
  PharmacistPerformanceSummary,
} from '../teamIntelligence/teamIntelligenceTypes'
import type {
  KpiContributionEntry,
  SupervisorAction,
} from '../branchIntelligence/branchIntelligenceTypes'

// ══════════════════════════════════════════════════════════════
// 1. KPI BREAKDOWN
// ══════════════════════════════════════════════════════════════

/** One KPI's full breakdown for this pharmacist (Section 2). */
export interface PharmacistKpiBreakdownEntry {
  kpiKey: KpiKey

  actual: number
  target: number
  achievementPct: number
  paceStatus: KpiSnapshot['paceStatus']
  remaining: number
  requiredPerDay: number

  /**
   * Day-progress-aware expected % for this KPI, from
   * expectedPace.kpiExpectedPct[kpiKey] (Phase 4C source — uniform
   * across all KPIs). null when expectedPace is not supplied.
   */
  expectedPct: number | null

  /**
   * This pharmacist's share of the branch total for this KPI, from
   * BranchIntelligenceViewModel.contributionByKpi[kpiKey]. null when
   * branch contribution data is unavailable (e.g. pharmacist viewed
   * outside a branch context).
   */
  contributionPct: number | null

  /** 1-indexed rank within the branch for this KPI. null under the same conditions as contributionPct. */
  contributionRank: number | null
}

// ══════════════════════════════════════════════════════════════
// 2. STRENGTHS & WEAKNESSES
// ══════════════════════════════════════════════════════════════

/**
 * Deterministic strengths/weaknesses summary (Section 3).
 *
 * Per-KPI trend ("fastest improvement"/"biggest decline") is NOT
 * available — only overall momentumDirection/momentumDelta exists.
 * `overallMomentum` reflects this; there is no per-KPI equivalent.
 */
export interface PharmacistStrengthsWeaknesses {
  /** KPIs with paceStatus in ('ahead','achieved'), sorted by achievementPct DESC. */
  topStrengths: KpiKey[]

  /** KPIs with paceStatus in ('behind','critical'), sorted by achievementPct ASC. */
  weakestKpis: KpiKey[]

  /**
   * The weakest KPI (target > 0) with the largest `remaining` —
   * the single highest-upside opportunity. null if weakestKpis is empty
   * or none have target > 0.
   */
  biggestOpportunity: KpiKey | null

  /** Overall momentum — the only trend signal available (no per-KPI trend). */
  overallMomentum: {
    direction: PharmacistPerformanceSummary['momentumDirection']
    delta: number
  }
}

// ══════════════════════════════════════════════════════════════
// 3. RANKING CONTEXT
// ══════════════════════════════════════════════════════════════

/**
 * Ranking context (Section 4).
 *
 * supervisorGroupRank and regionalRank are ALWAYS null — no group or
 * regional pharmacist ranking engine exists (Phase 1/3 finding,
 * reconfirmed in Phase 5C). These fields exist so the UI can render a
 * consistent "not yet available" state, not because the data might
 * someday populate them through this selector — a future ranking
 * engine would require a NEW selector, not filling these in.
 */
export interface PharmacistRankingContext {
  branchRank: { rank: number; cohortSize: number } | null

  /** Always null — no supervisor-group ranking engine exists. */
  supervisorGroupRank: null

  /** Always null — no regional ranking engine exists. */
  regionalRank: null

  /** From PharmacistRankingSnapshot (entityType: 'pharmacist'), if a snapshot exists for the period. */
  companyWideRank: { rank: number; cohortSize: number } | null
}

// ══════════════════════════════════════════════════════════════
// 4. CONTRIBUTION CONTEXT
// ══════════════════════════════════════════════════════════════

/** One KPI's branch-contribution context for this pharmacist (Section 5). */
export interface PharmacistContributionContextEntry {
  kpiKey: KpiKey
  branchTotal: number
  pharmacistActual: number
  contributionPct: number
  contributionRank: number
}

// ══════════════════════════════════════════════════════════════
// 5. ACCOUNTABILITY
// ══════════════════════════════════════════════════════════════

/** Accountability intelligence (Section 6) — direct re-projection of AccountabilityInsight + activity fields. */
export interface PharmacistAccountability {
  activeDays: number
  expectedSubmissionDays: number
  submissionRate: number
  missedDays: number
  improvementStreak: number
  consistentUnderperformance: boolean
  needsOperationalSupport: boolean
  supportDetail: string
}

// ══════════════════════════════════════════════════════════════
// 6. EXPECTED IMPACT (pharmacist-scoped)
// ══════════════════════════════════════════════════════════════

/**
 * Static what-if projection: if this pharmacist's weakest KPI reaches
 * expected pace, what happens to their performance score (and,
 * optionally, the branch KPI they contribute to).
 */
export interface PharmacistExpectedImpact {
  /** Human-readable description of the scenario being modeled. */
  scenario: string

  kpiKey: KpiKey

  currentAchievementPct: number
  projectedAchievementPct: number

  currentPerformanceScore: number
  projectedPerformanceScore: number

  /**
   * Optional branch-level impact, computed only when contribution data
   * is available. null when contributionByKpi was not supplied.
   */
  branchImpact: {
    currentBranchPct: number
    projectedBranchPct: number
  } | null
}

// ══════════════════════════════════════════════════════════════
// 7. PHARMACIST INTELLIGENCE VIEW MODEL
// ══════════════════════════════════════════════════════════════

/**
 * Top-level view model for /pharmacist/:userId/intelligence (future UI).
 *
 * Per the Phase 5C architecture review, this type is defined here for
 * completeness of the selector signatures, but Phase 5C-1 implements
 * only the selectors below — no builder/orchestration yet.
 */
export interface PharmacistIntelligenceViewModel {
  identity: {
    userId: string
    displayName: string
    employeeId: string | null
    pharmacyId: string
    pharmacyName: string
    pharmacyCode: string
    region: string | null
    /** Always null — no supervisor/"reports to" field exists on the user document. */
    supervisorGroup: null
  }

  performanceSummary: {
    performanceScore: number
    grade: string
    operationalRisk: PharmacistPerformanceSummary['operationalRisk']
    momentumDirection: PharmacistPerformanceSummary['momentumDirection']
    momentumDelta: number
    officialRating?: {
      finalScore: number
      rating: string
    }
  }

  kpiBreakdown: PharmacistKpiBreakdownEntry[]

  strengthsWeaknesses: PharmacistStrengthsWeaknesses

  rankingContext: PharmacistRankingContext

  contributionContext: PharmacistContributionContextEntry[]

  accountability: PharmacistAccountability | null

  coaching: CoachingRecommendation[]

  supervisorActions: SupervisorAction[]

  metadata: {
    userId: string
    branchId: string
    month: string
    focusKpi: KpiKey | null
    generatedAt: string
    dataAvailability: {
      hasKpiEntries: boolean
      hasTargets: boolean
      hasBranchContext: boolean
      hasCompanyWideRanking: boolean
      hasEvaluationResult: boolean
    }
  }

  warnings: string[]
}

// ══════════════════════════════════════════════════════════════
// 8. SELECTOR INPUT TYPES
// ══════════════════════════════════════════════════════════════

/** Minimal shape needed from a PharmacistRankingSnapshot — entityType: 'pharmacist'. */
export interface PharmacistRankingSnapshotInput {
  currentRank: number
  cohortSize: number
}

/** Minimal shape needed from a BranchIntelligenceViewModel's pharmacistRanking entry. */
export interface BranchPharmacistRankingEntryInput {
  userId: string
  rank: number
}

// Re-exported for convenience so callers don't need a second import for
// contribution-breakdown types when wiring these selectors.
export type { KpiContributionEntry }
