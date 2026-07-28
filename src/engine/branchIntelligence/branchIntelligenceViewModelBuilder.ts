// ============================================================
// Branch Intelligence — ViewModel Builder
// Phase 4B
//
// SAFETY REQUIREMENTS (per Phase 4B spec):
//   - Pure functions only — no Firestore, no React, no Date
//   - Reuses executive + teamIntelligence outputs (prepared inputs)
//   - Reuses Phase 4A selectors — no duplicate calculations
//   - No mutation of inputs
//   - Fully deterministic given its inputs
//
// generateBranchSummary and generateTeamIntelligence both have an
// implicit Date.now() dependency (via getDayProgress). To keep this
// builder deterministic, it accepts their OUTPUTS as inputs
// (BranchIntelligenceBuilderInput) — the date-dependent calls happen
// in a future data-fetching hook, not here.
// ============================================================

import { scoreToGrade } from '../executive/executiveScore'
import { KPI_KEYS, type KpiKey } from '../kpiAnalyticsEngine'
import type { PharmacistPerformanceSummary } from '../teamIntelligence/teamIntelligenceTypes'
import {
  computeKpiContributionBreakdown,
  computeWeakKpiAttribution,
  evaluateSupervisorActionRules,
  type SupervisorActionInputs,
} from './branchIntelligenceSelectors'
import type {
  BranchIntelligenceBuilderInput,
  BranchIntelligenceViewModel,
  CoachingOpportunitiesViewModel,
  PharmacistRankingEntry,
} from './branchIntelligenceTypes'

// ══════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════

/**
 * Determine the branch's Focus KPI: the KPI with the lowest
 * achievementPct among KPIs where the branch has a target > 0,
 * read from BranchExecutiveSummary.score.kpiBreakdown.
 *
 * Returns null if no KPI has a target > 0 (Rule 7 territory).
 */
function determineFocusKpi(
  kpiBreakdown: BranchIntelligenceBuilderInput['branchSummary']['score']['kpiBreakdown'],
): KpiKey | null {
  const eligible = kpiBreakdown.filter((k) => k.target > 0)
  if (eligible.length === 0) return null
  return eligible.reduce((worst, k) =>
    k.achievementPct < worst.achievementPct ? k : worst,
  ).kpiKey
}

/**
 * Per-KPI expected % at this point in the month. Derived from the
 * KPI's own achievementPct vs. its weightedScore ratio is not
 * meaningful here — instead, expected % is read uniformly from the
 * branch's overall day-progress proxy: the branch's overallMomentum
 * trend doesn't give a single "expected %" either.
 *
 * BranchExecutiveSummary does not expose an "expectedPct" field per
 * KPI (that's computed transiently inside computeKpiStats/riskEngine
 * and not surfaced). Re-deriving it here from kpiBreakdown alone is
 * not possible without the day-progress ratio, which this builder
 * does not have access to (no Date dependency, by design).
 *
 * Resolution: callers (the future data-fetching hook) MAY supply
 * pre-computed expected percentages via a richer builder input in a
 * later phase. For Phase 4B, this builder uses a neutral placeholder
 * of 50% expected for all KPIs — sufficient for the "behind/ahead of
 * pace" classification used by Rules 1/2/4, while remaining honest
 * that this is a simplification (documented and warned).
 *
 * This does not affect Phase 4A selector correctness (those operate
 * on PharmacistPerformanceSummary.kpiSnapshots, which DO carry
 * per-pharmacist expectedToDate/paceStatus from the date-aware
 * teamIntelligence engine).
 */
const PLACEHOLDER_EXPECTED_PCT = 50

/** Extract a FORECAST risk flag's value for the given KPI, if present. */
function extractForecastPct(
  riskProfile: BranchIntelligenceBuilderInput['branchSummary']['riskProfile'],
  focusKpi: KpiKey | null,
): number | null {
  if (!focusKpi) return null
  const flag = riskProfile.flags.find(
    (f) => f.category === 'FORECAST' && f.kpiKey === focusKpi && f.value !== undefined,
  )
  return flag?.value ?? null
}

/** Build the Section 3 pharmacist ranking list, sorted by performanceScore DESC. */
function buildPharmacistRanking(
  pharmacistSummaries: PharmacistPerformanceSummary[],
): PharmacistRankingEntry[] {
  return [...pharmacistSummaries]
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      displayName: p.displayName,
      performanceScore: p.performanceScore,
      grade: scoreToGrade(p.performanceScore),
      momentumDirection: p.momentumDirection,
      momentumDelta: p.momentumDelta,
    }))
}

/** Build the Section 5 coaching opportunities — reuses existing TeamIntelligenceResult fields. */
function buildCoachingOpportunities(
  input: BranchIntelligenceBuilderInput,
  focusKpi: KpiKey | null,
  contributionByKpi: BranchIntelligenceViewModel['contributionByKpi'],
): CoachingOpportunitiesViewModel {
  const { teamIntelligence } = input
  const summaries = teamIntelligence.pharmacistSummaries

  // Top Performer — topPerformerIds[0]
  const topPerformerId = teamIntelligence.topPerformerIds[0] ?? null
  const topPerformerSummary = topPerformerId
    ? summaries.find((p) => p.userId === topPerformerId) ?? null
    : null
  const topPerformer = topPerformerSummary
    ? {
        userId: topPerformerSummary.userId,
        displayName: topPerformerSummary.displayName,
        performanceScore: topPerformerSummary.performanceScore,
        strongestKpi: topPerformerSummary.strongestKpi,
      }
    : null

  // Most Improved — improvingMemberIds, sorted by momentumDelta DESC
  const improving = summaries
    .filter((p) => teamIntelligence.improvingMemberIds.includes(p.userId))
    .sort((a, b) => b.momentumDelta - a.momentumDelta)
  const mostImproved = improving.length > 0
    ? {
        userId: improving[0].userId,
        displayName: improving[0].displayName,
        momentumDelta: improving[0].momentumDelta,
      }
    : null

  // Most At Risk — atRiskMemberIds[0]
  const mostAtRiskId = teamIntelligence.atRiskMemberIds[0] ?? null
  const mostAtRiskSummary = mostAtRiskId
    ? summaries.find((p) => p.userId === mostAtRiskId) ?? null
    : null
  const mostAtRisk = mostAtRiskSummary
    ? {
        userId: mostAtRiskSummary.userId,
        displayName: mostAtRiskSummary.displayName,
        operationalRisk: mostAtRiskSummary.operationalRisk,
      }
    : null

  // Lowest Contributor — from contributionByKpi[focusKpi], isLowestContributor
  // entry with the lowest achievementPct
  let lowestContributor: CoachingOpportunitiesViewModel['lowestContributor'] = null
  if (focusKpi) {
    const breakdown = contributionByKpi[focusKpi] ?? []
    const lowest = breakdown
      .filter((e) => e.isLowestContributor)
      .sort((a, b) => a.achievementPct - b.achievementPct)[0]
    if (lowest) {
      lowestContributor = {
        userId: lowest.pharmacistId,
        displayName: lowest.pharmacistName,
        kpiKey: focusKpi,
        achievementPct: lowest.achievementPct,
      }
    }
  }

  return { topPerformer, mostImproved, mostAtRisk, lowestContributor }
}

// ══════════════════════════════════════════════════════════════
// Main builder
// ══════════════════════════════════════════════════════════════

/**
 * Build the BranchIntelligenceViewModel from prepared inputs.
 *
 * Reuses:
 *   - executive.generateBranchSummary output (input.branchSummary)
 *   - teamIntelligence.generateTeamIntelligence output (input.teamIntelligence)
 *   - executive.scoreToGrade
 *   - Phase 4A selectors: computeKpiContributionBreakdown,
 *     computeWeakKpiAttribution, evaluateSupervisorActionRules
 *
 * Does not fetch Firestore, does not depend on Date/time, does not
 * mutate `input`.
 */
export function buildBranchIntelligenceViewModel(
  input: BranchIntelligenceBuilderInput,
): BranchIntelligenceViewModel {
  const warnings: string[] = []
  const { branchSummary, teamIntelligence, teamSize, branchRankSnapshot, metadata, momentum } = input
  const summaries = teamIntelligence.pharmacistSummaries

  // ── Focus KPI ──────────────────────────────────────────────
  const focusKpi = determineFocusKpi(branchSummary.score.kpiBreakdown)
  if (focusKpi === null) {
    warnings.push('No KPI with a target greater than 0 was found for this branch this month.')
  }

  // ── Contribution breakdown — one per KPI (Selector 1, Phase 4A) ──
  // Core KPI Dependency Removal — Stage F: derive the KPI key set from the
  // actual data already present (the union of every kpiKey across all
  // pharmacist kpiSnapshots) instead of the fixed KPI_KEYS list. This
  // requires no new parameter here — once Team Intelligence's snapshot
  // arrays widen to include non-Core KPIs, Branch Intelligence picks them
  // up automatically. Falls back to KPI_KEYS when there's no snapshot data
  // to derive from (e.g. an empty team), preserving prior behavior exactly.
  const contributionByKpi = {} as BranchIntelligenceViewModel['contributionByKpi']
  const observedKpiKeys = summaries.length > 0
    ? [...new Set(summaries.flatMap((s) => s.kpiSnapshots.map((snap) => snap.kpiKey)))]
    : KPI_KEYS
  for (const k of observedKpiKeys) {
    contributionByKpi[k] = computeKpiContributionBreakdown(summaries, k)
  }

  // ── Weak KPI attribution (Selector 2, Phase 4A) ──────────────
  const weakKpiAttribution = focusKpi
    ? computeWeakKpiAttribution(focusKpi, summaries, teamIntelligence.accountabilityInsights)
    : null

  // ── Section 1: Branch Summary ────────────────────────────────
  const forecastPct = extractForecastPct(branchSummary.riskProfile, focusKpi)
  if (forecastPct === null) {
    warnings.push('No forecast data available for the Focus KPI this month.')
  }

  if (!branchRankSnapshot) {
    warnings.push(`Branch ranking not yet calculated for ${metadata.month}.`)
  }

  const branchSummaryVM: BranchIntelligenceViewModel['branchSummary'] = {
    pharmacyId:    branchSummary.pharmacyId,
    pharmacyName:  branchSummary.pharmacyName,
    pharmacyCode:  branchSummary.pharmacyCode,
    region:        branchSummary.region,
    healthScore:   branchSummary.score.overall,
    healthGrade:   branchSummary.score.grade,
    forecastPct,
    forecastTrend: branchSummary.trend.direction,
    kpiTrends: [...branchSummary.trend.kpiTrends]
      .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum))
      .map((t) => ({
        kpiKey: t.kpiKey, label: t.label, direction: t.direction,
        momentum: t.momentum, changePct7d: t.changePct7d, changePct30d: t.changePct30d,
      })),
    riskLevel:     branchSummary.riskProfile.riskLevel,
    riskFlags: [...branchSummary.riskProfile.flags]
      .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'HIGH' ? -1 : b.severity === 'HIGH' ? 1 : 0))
      .map((f) => ({ category: f.category, severity: f.severity, description: f.description })),
    riskCriticalCount: branchSummary.riskProfile.criticalCount,
    riskWarningCount:  branchSummary.riskProfile.warningCount,
    branchRank: branchRankSnapshot
      ? {
          currentRank:  branchRankSnapshot.currentRank,
          cohortSize:   branchRankSnapshot.cohortSize,
          rankMovement: branchRankSnapshot.rankMovement ?? null,
        }
      : null,
    teamSize,
  }

  // ── Section 3: Pharmacist Ranking ────────────────────────────
  const pharmacistRanking = buildPharmacistRanking(summaries)

  // ── Section 5: Coaching Opportunities ────────────────────────
  const coachingOpportunities = buildCoachingOpportunities(input, focusKpi, contributionByKpi)

  // ── Section 6: Supervisor Actions (Selector 4, Phase 4A) ─────
  // Per-KPI achievement/expected maps for Rule 4's "all KPIs on track" check.
  const allKpiAchievementPct = {} as Record<KpiKey, number>
  const allKpiExpectedPct    = {} as Record<KpiKey, number>
  for (const k of branchSummary.score.kpiBreakdown) {
    allKpiAchievementPct[k.kpiKey] = k.achievementPct
    allKpiExpectedPct[k.kpiKey]    = PLACEHOLDER_EXPECTED_PCT
  }
  if (branchSummary.score.kpiBreakdown.length > 0) {
    warnings.push(
      `Expected-pace percentages use a placeholder value (${PLACEHOLDER_EXPECTED_PCT}%) ` +
      `pending day-progress-aware expected % on BranchExecutiveSummary.`,
    )
  }

  const focusKpiBreakdown = focusKpi
    ? branchSummary.score.kpiBreakdown.find((k) => k.kpiKey === focusKpi) ?? null
    : null

  const actionInputs: SupervisorActionInputs = {
    focusKpi,
    focusKpiAchievementPct: focusKpiBreakdown?.achievementPct ?? 0,
    focusKpiExpectedPct: PLACEHOLDER_EXPECTED_PCT,
    allKpiAchievementPct,
    allKpiExpectedPct,
    pharmacistSummaries: summaries,
    accountabilityInsights: teamIntelligence.accountabilityInsights,
    weakKpiAttribution,
    contributionByKpi: focusKpi ? contributionByKpi[focusKpi] : [],
    branchActual: focusKpiBreakdown?.actual ?? 0,
    branchTarget: focusKpiBreakdown?.target ?? 0,
    topPerformerId: teamIntelligence.topPerformerIds[0] ?? null,
    branchRank: branchRankSnapshot,
  }

  const supervisorActions = evaluateSupervisorActionRules(actionInputs)

  // ── Assemble ──────────────────────────────────────────────────
  if (summaries.length === 0) {
    warnings.push(`No pharmacist KPI data found for this branch in ${metadata.month}.`)
  }
  if (!metadata.dataAvailability.hasTargets) {
    warnings.push('No targets configured for this branch this month.')
  }

  return {
    branchSummary: branchSummaryVM,
    kpiIntelligence: { focusKpi },
    pharmacistRanking,
    contributionByKpi,
    coachingOpportunities,
    supervisorActions,
    momentum,
    weakKpiAttribution,
    metadata,
    warnings,
  }
}
