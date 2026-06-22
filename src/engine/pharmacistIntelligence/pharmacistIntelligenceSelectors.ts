// ============================================================
// Pharmacist Intelligence — Pure Selectors
// Phase 5C-1
//
// SAFETY REQUIREMENTS (same as Branch Intelligence Phase 4A):
//   - Pure functions only
//   - No Firestore imports
//   - No React imports
//   - No UI imports
//   - No side effects
//   - No mutation of inputs
//   - No date/time dependency
//   - No global state
//
// All functions operate solely on data already computed elsewhere
// (PharmacistPerformanceSummary, BranchIntelligenceViewModel outputs,
// AccountabilityInsight, CoachingRecommendation, PharmacistRankingSnapshot).
// No KPI/evaluation/forecast/ranking calculations are reimplemented here.
//
// Confirmed gaps respected (do not invent):
//   - computePharmacistRankingContext: supervisorGroupRank/regionalRank
//     are hardcoded null, regardless of input.
//   - computePharmacistStrengthsWeaknesses: no per-KPI trend — only
//     overall momentumDirection/momentumDelta is surfaced.
//   - No selector references a "supervisor"/"reportsTo" field.
// ============================================================

import { KPI_WEIGHTS, type KpiKey } from '../kpiAnalyticsEngine'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
  CoachingRecommendation,
} from '../teamIntelligence/teamIntelligenceTypes'
import type {
  KpiContributionEntry,
  SupervisorAction,
  ExpectedImpact,
} from '../branchIntelligence/branchIntelligenceTypes'
import { computeExpectedImpact } from '../branchIntelligence/branchIntelligenceSelectors'
import type {
  PharmacistKpiBreakdownEntry,
  PharmacistStrengthsWeaknesses,
  PharmacistRankingContext,
  PharmacistContributionContextEntry,
  PharmacistAccountability,
  PharmacistExpectedImpact,
  PharmacistRankingSnapshotInput,
  BranchPharmacistRankingEntryInput,
} from './pharmacistIntelligenceTypes'

// Mirrors coachingEngine's internal COACHING_THRESHOLDS.recognitionThreshold
// (not exported from coachingEngine.ts — duplicated here as a named
// constant rather than a magic number, documented for traceability).
const RECOGNITION_THRESHOLD = 90

// ══════════════════════════════════════════════════════════════
// Small local helpers (pure, no side effects)
// ══════════════════════════════════════════════════════════════

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const STRENGTH_PACE_STATUSES = new Set(['ahead', 'achieved'])
const WEAKNESS_PACE_STATUSES = new Set(['behind', 'critical'])

// ══════════════════════════════════════════════════════════════
// Selector 1 — computePharmacistKpiBreakdown
// ══════════════════════════════════════════════════════════════

/**
 * Build the full per-KPI breakdown for one pharmacist (Section 2).
 *
 * - actual/target/achievementPct/paceStatus/remaining/requiredPerDay:
 *   direct passthrough from summary.kpiSnapshots.
 * - expectedPct: from expectedPace.kpiExpectedPct[kpiKey], or null if
 *   expectedPace is not supplied.
 * - contributionPct/contributionRank: looked up in
 *   contributionByKpi[kpiKey] by pharmacistId === summary.userId, or
 *   null if contributionByKpi is not supplied or the pharmacist isn't
 *   found in it.
 *
 * Does not mutate `summary` or `contributionByKpi`.
 */
export function computePharmacistKpiBreakdown(
  summary: PharmacistPerformanceSummary,
  contributionByKpi: Record<KpiKey, KpiContributionEntry[]> | null,
  expectedPace: { kpiExpectedPct: Record<KpiKey, number> } | null,
): PharmacistKpiBreakdownEntry[] {
  return summary.kpiSnapshots.map((snap) => {
    const expectedPct = expectedPace?.kpiExpectedPct[snap.kpiKey] ?? null

    let contributionPct: number | null = null
    let contributionRank: number | null = null
    if (contributionByKpi) {
      const entry = contributionByKpi[snap.kpiKey]?.find((e) => e.pharmacistId === summary.userId)
      if (entry) {
        contributionPct = entry.contributionPct
        contributionRank = entry.contributionRank
      }
    }

    return {
      kpiKey: snap.kpiKey,
      actual: snap.actual,
      target: snap.target,
      achievementPct: snap.achievementPct,
      paceStatus: snap.paceStatus,
      remaining: snap.remaining,
      requiredPerDay: snap.requiredPerDay,
      expectedPct,
      contributionPct,
      contributionRank,
    }
  })
}

// ══════════════════════════════════════════════════════════════
// Selector 2 — computePharmacistContributionContext
// ══════════════════════════════════════════════════════════════

/**
 * For each KPI, compute this pharmacist's branch-contribution context
 * (Section 5): branch total, pharmacist actual, contribution %,
 * contribution rank.
 *
 * Returns [] when contributionByKpi is null (no branch context).
 * Skips a KPI if this pharmacist isn't present in
 * contributionByKpi[kpiKey] (defensive — shouldn't happen for a
 * pharmacist on the branch roster).
 *
 * Does not mutate `contributionByKpi`.
 */
export function computePharmacistContributionContext(
  userId: string,
  contributionByKpi: Record<KpiKey, KpiContributionEntry[]> | null,
): PharmacistContributionContextEntry[] {
  if (!contributionByKpi) return []

  const result: PharmacistContributionContextEntry[] = []
  for (const kpiKey of Object.keys(contributionByKpi) as KpiKey[]) {
    const entries = contributionByKpi[kpiKey]
    const mine = entries.find((e) => e.pharmacistId === userId)
    if (!mine) continue

    const branchTotal = entries.reduce((sum, e) => sum + e.actual, 0)

    result.push({
      kpiKey,
      branchTotal,
      pharmacistActual: mine.actual,
      contributionPct: mine.contributionPct,
      contributionRank: mine.contributionRank,
    })
  }
  return result
}

// ══════════════════════════════════════════════════════════════
// Selector 3 — computePharmacistStrengthsWeaknesses
// ══════════════════════════════════════════════════════════════

/**
 * Deterministic strengths/weaknesses summary (Section 3), derived from
 * computePharmacistKpiBreakdown's output (composition, not raw
 * kpiSnapshots — testable independently of Team Intelligence).
 *
 * - topStrengths: KPIs with paceStatus in ('ahead','achieved'),
 *   sorted by achievementPct DESC.
 * - weakestKpis: KPIs with paceStatus in ('behind','critical'),
 *   sorted by achievementPct ASC.
 * - biggestOpportunity: the weakest KPI (target > 0) with the largest
 *   `remaining`. null if weakestKpis is empty or none have target > 0.
 * - overallMomentum: passthrough of summary.momentumDirection/Delta —
 *   NO per-KPI trend exists, so this is the only momentum signal.
 *
 * A pharmacist with every KPI exactly 'on_track' has BOTH arrays
 * empty and biggestOpportunity = null — this is a valid state, not
 * an error.
 *
 * Does not mutate `kpiBreakdown`.
 */
export function computePharmacistStrengthsWeaknesses(
  kpiBreakdown: PharmacistKpiBreakdownEntry[],
  momentum: { direction: PharmacistPerformanceSummary['momentumDirection']; delta: number },
): PharmacistStrengthsWeaknesses {
  const topStrengths = kpiBreakdown
    .filter((k) => STRENGTH_PACE_STATUSES.has(k.paceStatus))
    .sort((a, b) => b.achievementPct - a.achievementPct)
    .map((k) => k.kpiKey)

  const weakestEntries = kpiBreakdown
    .filter((k) => WEAKNESS_PACE_STATUSES.has(k.paceStatus))
    .sort((a, b) => a.achievementPct - b.achievementPct)

  const weakestKpis = weakestEntries.map((k) => k.kpiKey)

  const eligibleForOpportunity = weakestEntries.filter((k) => k.target > 0)
  const biggestOpportunity = eligibleForOpportunity.length > 0
    ? [...eligibleForOpportunity].sort((a, b) => b.remaining - a.remaining)[0].kpiKey
    : null

  return {
    topStrengths,
    weakestKpis,
    biggestOpportunity,
    overallMomentum: {
      direction: momentum.direction,
      delta: momentum.delta,
    },
  }
}

// ══════════════════════════════════════════════════════════════
// Selector 4 — computePharmacistRankingContext
// ══════════════════════════════════════════════════════════════

/**
 * Ranking context (Section 4).
 *
 * branchRank: looked up by userId in branchPharmacistRanking. null +
 * (caller should warn) if not found — e.g. branchId/userId mismatch.
 *
 * companyWideRank: populated from companyWideSnapshot if supplied,
 * else null.
 *
 * supervisorGroupRank / regionalRank: ALWAYS null. No group or
 * regional pharmacist ranking engine exists. This selector does not
 * accept inputs for these fields — there is nothing to compute and
 * nothing to pass through. A future ranking engine would require a
 * new selector, not an extension of this one's null defaults.
 *
 * Does not mutate `branchPharmacistRanking`.
 */
export function computePharmacistRankingContext(
  userId: string,
  branchPharmacistRanking: BranchPharmacistRankingEntryInput[] | null,
  companyWideSnapshot: PharmacistRankingSnapshotInput | null,
): PharmacistRankingContext {
  let branchRank: PharmacistRankingContext['branchRank'] = null
  if (branchPharmacistRanking) {
    const entry = branchPharmacistRanking.find((p) => p.userId === userId)
    if (entry) {
      branchRank = { rank: entry.rank, cohortSize: branchPharmacistRanking.length }
    }
  }

  const companyWideRank = companyWideSnapshot
    ? { rank: companyWideSnapshot.currentRank, cohortSize: companyWideSnapshot.cohortSize }
    : null

  return {
    branchRank,
    supervisorGroupRank: null,
    regionalRank: null,
    companyWideRank,
  }
}

// ══════════════════════════════════════════════════════════════
// Selector 5 — computePharmacistExpectedImpact
// ══════════════════════════════════════════════════════════════

/**
 * Static what-if: if the pharmacist's weakest KPI reaches expected
 * pace, what happens to their performance score (and, optionally, the
 * branch KPI they contribute to).
 *
 * "Reaches expected pace" (not 100%) — consistent with Branch
 * Intelligence's pace framing.
 *
 * scoreDelta = (expectedPct - achievementPct) * KPI_WEIGHTS[kpiKey]
 * projectedPerformanceScore = min(100, performanceScore + scoreDelta)
 *
 * branchImpact (when contributionByKpi/branchActualByKpi/branchTargetByKpi
 * are all supplied) is computed via the SAME computeExpectedImpact used
 * by Branch Intelligence (Phase 4A), passed through as-is using Branch
 * Intelligence's own isLowestContributor designations for the weakest
 * KPI's breakdown — answering "what would happen to the branch if its
 * current lowest contributor(s) reached the median". No reimplementation.
 *
 * Returns null when:
 *   - weakestKpi is null (no KPI has target > 0)
 *   - the weakestKpi entry isn't found in kpiBreakdown, has target <= 0,
 *     or expectedPct is null
 *   - achievementPct >= expectedPct for the weakest KPI (already on/ahead of pace)
 *
 * Does not mutate any input.
 */
export function computePharmacistExpectedImpact(
  kpiBreakdown: PharmacistKpiBreakdownEntry[],
  weakestKpi: KpiKey | null,
  performanceScore: number,
  contributionByKpi: Record<KpiKey, KpiContributionEntry[]> | null,
  branchActualByKpi: Record<KpiKey, number> | null,
  branchTargetByKpi: Record<KpiKey, number> | null,
): PharmacistExpectedImpact | null {
  if (weakestKpi === null) return null

  const entry = kpiBreakdown.find((k) => k.kpiKey === weakestKpi)
  if (!entry) return null
  if (entry.target <= 0) return null
  if (entry.expectedPct === null) return null
  if (entry.achievementPct >= entry.expectedPct) return null

  const currentAchievementPct = entry.achievementPct
  const projectedAchievementPct = entry.expectedPct

  const weight = KPI_WEIGHTS[weakestKpi] ?? 0
  const scoreDelta = (projectedAchievementPct - currentAchievementPct) * weight
  const projectedPerformanceScore = round1(Math.min(100, performanceScore + scoreDelta))

  // Optional branch-level impact — reuse computeExpectedImpact (Phase 4A)
  // as-is, using Branch Intelligence's own isLowestContributor
  // designations for this KPI's breakdown. This answers "what would
  // happen to the branch if its current lowest contributor(s) reached
  // the median" — not necessarily THIS pharmacist specifically, unless
  // they are themselves flagged isLowestContributor. Direct passthrough,
  // no reimplementation of the median/uplift math.
  let branchImpact: PharmacistExpectedImpact['branchImpact'] = null
  if (contributionByKpi && branchActualByKpi && branchTargetByKpi) {
    const breakdown = contributionByKpi[weakestKpi]
    const branchActual = branchActualByKpi[weakestKpi]
    const branchTarget = branchTargetByKpi[weakestKpi]
    if (breakdown && branchTarget > 0) {
      const impact: ExpectedImpact | null = computeExpectedImpact(breakdown, branchActual, branchTarget)
      if (impact) {
        branchImpact = {
          currentBranchPct: impact.currentBranchPct,
          projectedBranchPct: impact.projectedBranchPct,
        }
      }
    }
  }

  const scenario = `If ${weakestKpi} reaches expected pace (${round1(projectedAchievementPct)}%), `
    + `performance score would change from ${round1(performanceScore)}% to ${projectedPerformanceScore}%.`

  return {
    scenario,
    kpiKey: weakestKpi,
    currentAchievementPct,
    projectedAchievementPct,
    currentPerformanceScore: round1(performanceScore),
    projectedPerformanceScore,
    branchImpact,
  }
}

// ══════════════════════════════════════════════════════════════
// Selector 6 — computePharmacistActionCenter
// ══════════════════════════════════════════════════════════════

/**
 * Pharmacist-scoped supervisor action rules (Section 8). Mirrors
 * Branch Intelligence's evaluateSupervisorActionRules pattern, but
 * scoped to one pharmacist:
 *
 *   Rule P3 (recognition) — performanceScore >= RECOGNITION_THRESHOLD
 *     → single recognition action, mirrors coachingEngine's own
 *       early-return (recognition recommendations exclude all other
 *       coaching). ONLY this rule fires when it matches.
 *
 *   Rule P4 (no data) — weakestKpi is null (no KPI has target > 0)
 *     → single "insufficient data" action. ONLY this rule fires.
 *
 *   Rule P1 (weakest KPI behind pace) — weakestKpi behind expectedPct
 *     → primary action: Problem/Cause from kpiBreakdown, Action from
 *       the matching CoachingRecommendation (kpiKey === weakestKpi),
 *       Impact from expectedImpact.
 *
 *   Rule P2 (accountability) — accountability.needsOperationalSupport
 *     → secondary action, co-exists with P1.
 *
 * Deterministic, rule-based. No AI/LLM calls. Does not mutate inputs.
 */
export function computePharmacistActionCenter(
  kpiBreakdown: PharmacistKpiBreakdownEntry[],
  weakestKpi: KpiKey | null,
  performanceScore: number,
  accountability: PharmacistAccountability | null,
  coaching: CoachingRecommendation[],
  expectedImpact: PharmacistExpectedImpact | null,
): SupervisorAction[] {
  const actions: SupervisorAction[] = []

  // ── Rule P3: Recognition — mirrors coachingEngine's early return ──
  if (performanceScore >= RECOGNITION_THRESHOLD) {
    const recognitionRec = coaching.find((c) => c.priority === 'recognition')
    actions.push({
      severity: 'low',
      problem: `Performance score is ${round1(performanceScore)}% — at or above the recognition threshold.`,
      cause: 'Consistently high achievement across KPIs.',
      recommendedAction: recognitionRec?.detail
        ?? `Recognise this pharmacist's performance to reinforce the behaviour.`,
      expectedImpact: null,
      evidence: [`Performance score: ${round1(performanceScore)}%`],
      relatedPharmacists: [],
    })
    return actions
  }

  // ── Rule P4: No data ──────────────────────────────────────────
  if (weakestKpi === null) {
    actions.push({
      severity: 'low',
      problem: 'Insufficient data to generate recommendations this month.',
      cause: 'No KPI with a target greater than 0 was found for this pharmacist this month.',
      recommendedAction: 'Verify personal/branch target configuration for this pharmacist.',
      expectedImpact: null,
      evidence: [],
      relatedPharmacists: [],
    })
    return actions
  }

  const weakEntry = kpiBreakdown.find((k) => k.kpiKey === weakestKpi)
  const behindPace = weakEntry && weakEntry.expectedPct !== null
    ? weakEntry.achievementPct < weakEntry.expectedPct
    : false

  // ── Rule P1: Weakest KPI behind expected pace ────────────────
  if (weakEntry && behindPace) {
    const gapPts = weakEntry.expectedPct !== null
      ? round1(weakEntry.expectedPct - weakEntry.achievementPct)
      : 0
    const matchingRec = coaching.find((c) => c.kpiKey === weakestKpi)

    actions.push({
      severity: 'high',
      problem: `${weakestKpi} is at ${round1(weakEntry.achievementPct)}% — ${gapPts}pts behind expected pace.`,
      cause: `Pharmacist is achieving ${round1(weakEntry.achievementPct)}% vs expected ${round1(weakEntry.expectedPct ?? 0)}%.`,
      recommendedAction: matchingRec?.detail
        ?? `Review ${weakestKpi} workflow and identify the cause of the shortfall.`,
      expectedImpact: expectedImpact
        ? { scenario: expectedImpact.scenario, currentBranchPct: expectedImpact.currentPerformanceScore, projectedBranchPct: expectedImpact.projectedPerformanceScore, impactDeltaPts: round1(expectedImpact.projectedPerformanceScore - expectedImpact.currentPerformanceScore) }
        : null,
      evidence: [
        `Actual: ${weakEntry.actual.toLocaleString()} / Target: ${weakEntry.target.toLocaleString()}`,
        `Remaining: ${weakEntry.remaining.toLocaleString()}`,
        `Required pace: ${weakEntry.requiredPerDay.toLocaleString()}/day`,
      ],
      relatedPharmacists: [],
      relatedKpi: weakestKpi,
    })
  }

  // ── Rule P2: Accountability — co-exists with P1 ──────────────
  if (accountability?.needsOperationalSupport) {
    actions.push({
      severity: 'medium',
      problem: 'Low achievement may be partly operational, not skill-related.',
      cause: accountability.supportDetail,
      recommendedAction: `Check in on submission consistency before assuming a performance issue — low submission rate may be inflating the apparent gap.`,
      expectedImpact: null,
      evidence: [
        `Submission rate: ${round1(accountability.submissionRate)}%`,
        `Missed days: ${accountability.missedDays}`,
      ],
      relatedPharmacists: [],
      ...(weakestKpi ? { relatedKpi: weakestKpi } : {}),
    })
  }

  // ── Fallback: behind-pace check was false but no P1/P2 fired ──
  // (e.g. weakestKpi exists but is at/above expected pace, and no
  // accountability flag). Mirrors Branch Intelligence Rule 4's
  // "on track" framing, pharmacist-scoped.
  if (actions.length === 0) {
    actions.push({
      severity: 'low',
      problem: 'No KPI is significantly behind pace this month.',
      cause: 'Pharmacist is tracking on or ahead of expected pace.',
      recommendedAction: 'Continue current approach.',
      expectedImpact: null,
      evidence: [`Performance score: ${round1(performanceScore)}%`],
      relatedPharmacists: [],
      ...(weakestKpi ? { relatedKpi: weakestKpi } : {}),
    })
  }

  return actions
}
