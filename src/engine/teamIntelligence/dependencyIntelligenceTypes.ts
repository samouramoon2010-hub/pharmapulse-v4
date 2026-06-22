// ============================================================
// Dependency Intelligence — Type Definitions
// Sprint 1: Team Dependency Intelligence + Single Performer Risk
//
// Pure types only. No Firestore, no React, no runtime logic.
// ============================================================

import type { KpiKey } from '../kpiAnalyticsEngine'

// ══════════════════════════════════════════════════════════════
// 1. DEPENDENCY TIER
// ══════════════════════════════════════════════════════════════

/**
 * Four-tier risk classification for KPI contribution concentration.
 *
 * Thresholds applied to highestContributionPct (the single largest
 * share of a KPI's branch total held by one pharmacist):
 *
 *   < 40%  → healthy   (load well distributed)
 *   40–60% → moderate  (one pharmacist noticeably load-bearing)
 *   60–80% → high      (strong single-person dependency)
 *   > 80%  → critical  (KPI almost entirely attributable to one person)
 */
export type DependencyTier = 'healthy' | 'moderate' | 'high' | 'critical'

// ══════════════════════════════════════════════════════════════
// 2. PER-KPI DEPENDENCY ENTRY
// ══════════════════════════════════════════════════════════════

/**
 * Dependency analysis for a single KPI.
 * Only produced for KPIs where branch total actual > 0 —
 * inactive KPIs (no submissions this month) are excluded.
 */
export interface KpiDependencyEntry {
  kpiKey: KpiKey

  /**
   * The highest contributionPct across all pharmacists for this KPI.
   * Represents the most load-bearing single contributor's share (0-100, 1 decimal).
   */
  highestContributionPct: number

  /** userId of the pharmacist holding highestContributionPct. null when no top contributor is flagged. */
  topContributorId: string | null

  /** Display name of the pharmacist holding highestContributionPct. null when not available. */
  topContributorName: string | null

  /** Risk tier derived from highestContributionPct (see DependencyTier thresholds above). */
  dependencyTier: DependencyTier

  /** Number of pharmacists with active contribution to this KPI (entries.length). */
  teamSize: number
}

// ══════════════════════════════════════════════════════════════
// 3. BRANCH-LEVEL DEPENDENCY RESULT
// ══════════════════════════════════════════════════════════════

/**
 * Branch-wide dependency intelligence result.
 * Consumed by useBranchIntelligenceData and rendered by BranchIntelligencePage.
 */
export interface DependencyIntelligenceResult {
  /** One entry per active KPI (totalActual > 0). */
  kpiDependencies: KpiDependencyEntry[]

  /**
   * Branch-level roll-up: the most severe tier across all active KPIs.
   * One critical KPI makes the branch critical.
   * All KPIs must be healthy for the branch to be healthy.
   */
  branchDependencyTier: DependencyTier

  /** Deterministic, template-based summary text. Professional neutral tone. */
  summaryText: string

  criticalKpiCount: number
  highKpiCount: number
  moderateKpiCount: number
}
