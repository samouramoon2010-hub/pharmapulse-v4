// ============================================================
// Pharmacist Intelligence — ViewModel Builder
// Phase 5C-2
//
// SAFETY REQUIREMENTS (same as Branch Intelligence Phase 4B):
//   - Pure function — no Firestore, no Date, no mutation of inputs
//   - Accepts PREPARED inputs only (caller runs date-aware engines
//     and Firestore fetches; this builder assembles their outputs)
//   - Reuses Phase 5C-1 selectors — no duplicate calculations
//   - Reuses scoreToGrade (executive) — no new grading scale
//
// Respects confirmed gaps (do not invent):
//   - identity.supervisorGroup is always null (no supervisor field
//     exists on the user document)
//   - rankingContext.supervisorGroupRank / regionalRank are always
//     null (Phase 5C-1's computePharmacistRankingContext enforces this)
//   - strengthsWeaknesses.overallMomentum is the only trend signal
//     (no per-KPI trend exists)
// ============================================================

import { scoreToGrade } from '../executive'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { buildCoachingRecommendations } from '../teamIntelligence'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { KpiContributionEntry, SupervisorAction } from '../branchIntelligence/branchIntelligenceTypes'
import {
  computePharmacistKpiBreakdown,
  computePharmacistContributionContext,
  computePharmacistStrengthsWeaknesses,
  computePharmacistRankingContext,
  computePharmacistExpectedImpact,
  computePharmacistActionCenter,
} from './pharmacistIntelligenceSelectors'
import type {
  PharmacistIntelligenceViewModel,
  PharmacistAccountability,
  PharmacistRankingSnapshotInput,
  BranchPharmacistRankingEntryInput,
} from './pharmacistIntelligenceTypes'

// ══════════════════════════════════════════════════════════════
// Builder input type
// ══════════════════════════════════════════════════════════════

/**
 * Raw, pre-computed inputs to buildPharmacistIntelligenceViewModel.
 *
 * "Prepared inputs" — mirrors BranchIntelligenceBuilderInput's
 * pattern (Phase 4B/4C): the caller (a future
 * usePharmacistIntelligenceData hook) is responsible for:
 *   - fetching the user document (identity)
 *   - fetching the pharmacy document (branch identity)
 *   - running generateTeamIntelligence and extracting this
 *     pharmacist's PharmacistPerformanceSummary
 *   - running buildBranchIntelligenceViewModel (or at minimum
 *     extracting contributionByKpi and pharmacistRanking from it)
 *   - extracting this pharmacist's AccountabilityInsight
 *   - fetching the company-wide pharmacist ranking snapshot, if any
 *   - fetching the V1 evaluation ledger result, if any
 *   - computing expectedPace (Phase 4C source: getDayProgress)
 *   - parsing the focusKpi query param, if present
 *
 * The builder itself touches no Firestore, no Date, and is fully
 * deterministic given these inputs.
 */
export interface PharmacistIntelligenceBuilderInput {
  /** users/{uid} document fields needed for identity. */
  user: {
    userId: string
    displayName: string
    employeeId?: string | null   // '' or undefined/null both treated as "not set"
    pharmacyId: string
  }

  /** pharmacies/{pharmacyId} document fields needed for identity. */
  pharmacy: {
    pharmacyId: string
    name: string
    code: string
    region?: string | null
  } | null

  /** This pharmacist's summary, from generateTeamIntelligence's pharmacistSummaries. */
  summary: PharmacistPerformanceSummary

  /**
   * Branch contribution breakdown, from
   * BranchIntelligenceViewModel.contributionByKpi. null when no
   * branch context is available (e.g. branch fetch failed).
   */
  contributionByKpi: Record<KpiKey, KpiContributionEntry[]> | null

  /**
   * Branch pharmacist ranking, from
   * BranchIntelligenceViewModel.pharmacistRanking (only userId/rank
   * needed). null when unavailable — mirrors contributionByKpi's
   * availability in practice but kept as a separate input per the
   * Phase 5C-1 selector signature.
   */
  branchPharmacistRanking: BranchPharmacistRankingEntryInput[] | null

  /** This pharmacist's AccountabilityInsight, from TeamIntelligenceResult.accountabilityInsights. null if not found. */
  accountabilityInsight: AccountabilityInsight | null

  /** Company-wide PharmacistRankingSnapshot, if one exists for the period. null otherwise. */
  companyWideRankingSnapshot: PharmacistRankingSnapshotInput | null

  /**
   * Official V1 evaluation ledger result for this user/month, if one
   * exists. Only engineVersion 'v1' results should ever be passed —
   * the caller is responsible for filtering out 'v2' shadow results
   * (per the V1/V2 production invariant).
   */
  officialEvaluationResult: { finalScore: number; rating: string } | null

  /** Day-progress-aware expected pace (Phase 4C source). null if unavailable. */
  expectedPace: { kpiExpectedPct: Record<KpiKey, number> } | null

  /**
   * focusKpi from the ?focusKpi= query param, if present and a valid
   * KpiKey. When null, metadata.focusKpi falls back to
   * summary.weakestKpi (if that KPI has target > 0), else null.
   */
  focusKpiParam: KpiKey | null

  metadata: {
    branchId: string
    month: string
    generatedAt: string
    dataAvailability: {
      hasKpiEntries: boolean
      hasTargets: boolean
      hasBranchContext: boolean
      hasCompanyWideRanking: boolean
      hasEvaluationResult: boolean
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════

/**
 * Resolve the effective focus KPI:
 *   1. focusKpiParam, if it has target > 0 in the breakdown
 *   2. else summary.weakestKpi, if it has target > 0
 *   3. else the first KPI in the breakdown with target > 0
 *   4. else null (Rule P4 / no-data territory)
 *
 * A focusKpiParam that doesn't correspond to a target>0 KPI is NOT an
 * error — it just isn't used as the "weakest KPI" for action-center
 * purposes. metadata.focusKpi still reflects the user's query-param
 * choice when valid (see buildPharmacistIntelligenceViewModel), but
 * weakestKpiForActions (used by strengths/impact/action-center
 * selectors) follows this resolution.
 */
function resolveWeakestKpiForActions(
  kpiBreakdown: ReturnType<typeof computePharmacistKpiBreakdown>,
  focusKpiParam: KpiKey | null,
  summaryWeakestKpi: KpiKey,
): KpiKey | null {
  const byKey = new Map(kpiBreakdown.map((e) => [e.kpiKey, e]))

  if (focusKpiParam && (byKey.get(focusKpiParam)?.target ?? 0) > 0) {
    return focusKpiParam
  }
  if ((byKey.get(summaryWeakestKpi)?.target ?? 0) > 0) {
    return summaryWeakestKpi
  }
  const firstWithTarget = kpiBreakdown.find((e) => e.target > 0)
  return firstWithTarget?.kpiKey ?? null
}

/** Sum a numeric field across a KpiContributionEntry[] array. */
function sumBy(entries: KpiContributionEntry[], field: 'actual' | 'target'): number {
  return entries.reduce((sum, e) => sum + e[field], 0)
}

// ══════════════════════════════════════════════════════════════
// Main builder
// ══════════════════════════════════════════════════════════════

/**
 * Build the PharmacistIntelligenceViewModel from prepared inputs.
 *
 * Reuses:
 *   - executive.scoreToGrade
 *   - teamIntelligence.coachingEngine.buildCoachingRecommendations
 *   - Phase 5C-1 selectors: computePharmacistKpiBreakdown,
 *     computePharmacistContributionContext,
 *     computePharmacistStrengthsWeaknesses,
 *     computePharmacistRankingContext,
 *     computePharmacistExpectedImpact,
 *     computePharmacistActionCenter
 *
 * Does not fetch Firestore, does not depend on Date/time, does not
 * mutate `input`.
 */
export function buildPharmacistIntelligenceViewModel(
  input: PharmacistIntelligenceBuilderInput,
): PharmacistIntelligenceViewModel {
  const warnings: string[] = []
  const { user, pharmacy, summary, contributionByKpi, branchPharmacistRanking,
          accountabilityInsight, companyWideRankingSnapshot, officialEvaluationResult,
          expectedPace, focusKpiParam, metadata } = input

  // ── Identity ───────────────────────────────────────────────
  if (!pharmacy) {
    warnings.push('Pharmacy details unavailable — pharmacyName/pharmacyCode/region fields are best-effort.')
  }

  const identity: PharmacistIntelligenceViewModel['identity'] = {
    userId: user.userId,
    displayName: user.displayName,
    employeeId: user.employeeId && user.employeeId.trim() !== '' ? user.employeeId : null,
    pharmacyId: user.pharmacyId,
    pharmacyName: pharmacy?.name ?? user.pharmacyId,
    pharmacyCode: pharmacy?.code ?? user.pharmacyId,
    region: pharmacy?.region ?? null,
    // Always null — no supervisor/"reports to" field exists on the
    // user document (Phase 5C architecture review, confirmed gap).
    supervisorGroup: null,
  }
  if (identity.employeeId === null) {
    warnings.push('Employee ID not set for this user.')
  }

  // ── Performance Summary ────────────────────────────────────
  const grade = scoreToGrade(summary.performanceScore)
  const performanceSummary: PharmacistIntelligenceViewModel['performanceSummary'] = {
    performanceScore: summary.performanceScore,
    grade,
    operationalRisk: summary.operationalRisk,
    momentumDirection: summary.momentumDirection,
    momentumDelta: summary.momentumDelta,
    ...(officialEvaluationResult
      ? { officialRating: { finalScore: officialEvaluationResult.finalScore, rating: officialEvaluationResult.rating } }
      : {}),
  }
  if (!officialEvaluationResult && metadata.dataAvailability.hasEvaluationResult === false) {
    warnings.push(`No official evaluation result found for ${metadata.month}.`)
  }

  // ── KPI Breakdown (Selector 1) ─────────────────────────────
  if (!contributionByKpi) {
    warnings.push('Branch contribution data unavailable — contributionPct/contributionRank are null for all KPIs.')
  }
  if (!expectedPace) {
    warnings.push('Expected-pace data unavailable — expectedPct is null for all KPIs.')
  }
  const kpiBreakdown = computePharmacistKpiBreakdown(summary, contributionByKpi, expectedPace)

  // ── Strengths & Weaknesses (Selector 3) ────────────────────
  const strengthsWeaknesses = computePharmacistStrengthsWeaknesses(kpiBreakdown, {
    direction: summary.momentumDirection,
    delta: summary.momentumDelta,
  })

  // ── Ranking Context (Selector 4) ───────────────────────────
  if (!branchPharmacistRanking) {
    warnings.push('Branch pharmacist ranking unavailable — branchRank is null.')
  }
  if (!companyWideRankingSnapshot && !metadata.dataAvailability.hasCompanyWideRanking) {
    warnings.push(`Company-wide ranking not yet calculated for ${metadata.month}.`)
  }
  const rankingContext = computePharmacistRankingContext(
    user.userId, branchPharmacistRanking, companyWideRankingSnapshot,
  )
  if (branchPharmacistRanking && rankingContext.branchRank === null) {
    warnings.push('Pharmacist not found in branch ranking — branchId/userId mismatch?')
  }

  // ── Contribution Context (Selector 2) ──────────────────────
  const contributionContext = computePharmacistContributionContext(user.userId, contributionByKpi)

  // ── Coaching (direct engine call, per Phase 5C scope) ──────
  const coaching = buildCoachingRecommendations(summary)

  // ── Resolve effective weakest KPI for impact/action-center ─
  const weakestKpiForActions = resolveWeakestKpiForActions(kpiBreakdown, focusKpiParam, summary.weakestKpi)
  if (focusKpiParam && weakestKpiForActions !== focusKpiParam) {
    warnings.push(`focusKpi "${focusKpiParam}" has no target this month — using "${weakestKpiForActions ?? 'none'}" for action-center analysis.`)
  }

  // ── Expected Impact (Selector 5) ───────────────────────────
  let branchActualByKpi: Record<KpiKey, number> | null = null
  let branchTargetByKpi: Record<KpiKey, number> | null = null
  if (contributionByKpi) {
    branchActualByKpi = {} as Record<KpiKey, number>
    branchTargetByKpi = {} as Record<KpiKey, number>
    for (const k of Object.keys(contributionByKpi) as KpiKey[]) {
      branchActualByKpi[k] = sumBy(contributionByKpi[k], 'actual')
      branchTargetByKpi[k] = sumBy(contributionByKpi[k], 'target')
    }
  }
  const expectedImpact = computePharmacistExpectedImpact(
    kpiBreakdown, weakestKpiForActions, summary.performanceScore,
    contributionByKpi, branchActualByKpi, branchTargetByKpi,
  )

  // ── Accountability (Section 6) ─────────────────────────────
  let accountability: PharmacistAccountability | null = null
  if (accountabilityInsight) {
    // Defensive guards: summary.activeDays/missedDays come from
    // PharmacistInput.actualSubmissionDays/expectedSubmissionDays
    // (computePharmacistPerformance). If a caller omits these fields,
    // fall back to 0 rather than surfacing undefined/NaN in the UI.
    const activeDays = Number.isFinite(summary.activeDays) ? summary.activeDays : 0
    const missedDays = Number.isFinite(accountabilityInsight.missedDays) ? accountabilityInsight.missedDays : 0
    const summaryMissedDays = Number.isFinite(summary.missedDays) ? summary.missedDays : 0
    const expectedSubmissionDays = activeDays + summaryMissedDays
    const submissionRate = Number.isFinite(accountabilityInsight.submissionRate) ? accountabilityInsight.submissionRate : 0
    const improvementStreak = Number.isFinite(accountabilityInsight.improvementStreak) ? accountabilityInsight.improvementStreak : 0

    accountability = {
      activeDays,
      expectedSubmissionDays,
      submissionRate,
      missedDays,
      improvementStreak,
      consistentUnderperformance: accountabilityInsight.consistentUnderperformance,
      needsOperationalSupport: accountabilityInsight.needsOperationalSupport,
      supportDetail: accountabilityInsight.supportDetail,
    }
  } else {
    warnings.push('No accountability data found for this pharmacist this month.')
  }

  // ── Supervisor Actions (Selector 6) ────────────────────────
  const supervisorActions: SupervisorAction[] = computePharmacistActionCenter(
    kpiBreakdown, weakestKpiForActions, summary.performanceScore,
    accountability, coaching, expectedImpact,
  )

  // ── metadata.focusKpi ───────────────────────────────────────
  // Reflects the resolved focus KPI used for action-center analysis —
  // NOT the raw (possibly invalid) query param. UI can highlight this
  // KPI in Section 2.
  const focusKpi = weakestKpiForActions

  return {
    identity,
    performanceSummary,
    kpiBreakdown,
    strengthsWeaknesses,
    rankingContext,
    contributionContext,
    accountability,
    coaching,
    supervisorActions,
    metadata: {
      userId: user.userId,
      branchId: metadata.branchId,
      month: metadata.month,
      focusKpi,
      generatedAt: metadata.generatedAt,
      dataAvailability: metadata.dataAvailability,
    },
    warnings,
  }
}
