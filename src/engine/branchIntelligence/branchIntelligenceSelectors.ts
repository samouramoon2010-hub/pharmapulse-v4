// ============================================================
// Branch Intelligence — Pure Selectors
// Phase 4A
//
// SAFETY REQUIREMENTS (per Phase 4A spec):
//   - Pure functions only
//   - No Firestore imports
//   - No React imports
//   - No UI imports
//   - No side effects
//   - No mutation of inputs
//   - No date/time dependency
//   - No global state
//
// All functions operate solely on data already computed by
// teamIntelligence (PharmacistPerformanceSummary, AccountabilityInsight).
// No KPI/evaluation/forecast calculations are reimplemented here.
// ============================================================

import type { KpiKey } from '../kpiAnalyticsEngine'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
} from '../teamIntelligence/teamIntelligenceTypes'
import type {
  KpiContributionEntry,
  WeakKpiAttribution,
  WeakKpiContributor,
  WeakKpiAccountabilityFlag,
  ExpectedImpact,
  SupervisorAction,
} from './branchIntelligenceTypes'

// ══════════════════════════════════════════════════════════════
// Small local helpers (pure, no side effects)
// ══════════════════════════════════════════════════════════════

/** Median of a numeric array. Returns 0 for an empty array. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/** Round to 1 decimal place. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ══════════════════════════════════════════════════════════════
// Selector 1 — computeKpiContributionBreakdown
// ══════════════════════════════════════════════════════════════

/**
 * For a given KPI, compute each pharmacist's contribution to the
 * branch's result for that KPI.
 *
 * - contributionPct: share of branch total `actual` (0 when total is 0)
 * - contributionRank: 1-indexed, by achievementPct DESC
 * - isTopContributor / isLowestContributor: restricted to target > 0 entries
 *   - team size <= 4 → bottom 1 flagged isLowestContributor
 *   - team size >  4 → bottom 2 flagged isLowestContributor
 *   - exactly 1 entry flagged isTopContributor (highest achievementPct, target > 0)
 *
 * Does not mutate `pharmacistSummaries`.
 */
export function computeKpiContributionBreakdown(
  pharmacistSummaries: PharmacistPerformanceSummary[],
  kpiKey: KpiKey,
): KpiContributionEntry[] {
  if (pharmacistSummaries.length === 0) return []

  // Extract the per-pharmacist KpiSnapshot for this KPI.
  // kpiSnapshots is an array; find the matching entry. If a pharmacist's
  // summary doesn't contain this KPI (shouldn't happen — KPI_KEYS is
  // fixed — but guard defensively), treat as a zero-value snapshot.
  const raw = pharmacistSummaries.map((summary) => {
    const snap = summary.kpiSnapshots.find((s) => s.kpiKey === kpiKey)
    return {
      pharmacistId:   summary.userId,
      pharmacistName: summary.displayName,
      actual:         snap?.actual ?? 0,
      target:         snap?.target ?? 0,
      achievementPct: snap?.achievementPct ?? 0,
      paceStatus:     snap?.paceStatus ?? 'critical' as const,
    }
  })

  // contributionPct = share of branch total actual. 0 when total is 0.
  const totalActual = raw.reduce((sum, r) => sum + r.actual, 0)

  // contributionRank: 1-indexed by achievementPct DESC.
  // Build the rank map from a sorted copy — do not mutate `raw`.
  const rankOrder = [...raw]
    .sort((a, b) => b.achievementPct - a.achievementPct)
    .map((r) => r.pharmacistId)
  const rankMap = new Map<string, number>()
  rankOrder.forEach((id, idx) => rankMap.set(id, idx + 1))

  // Top/lowest contributor flags — restricted to target > 0.
  const eligible = raw.filter((r) => r.target > 0)
  const lowestCount = pharmacistSummaries.length <= 4 ? 1 : 2

  const sortedEligibleAsc  = [...eligible].sort((a, b) => a.achievementPct - b.achievementPct)
  const sortedEligibleDesc = [...eligible].sort((a, b) => b.achievementPct - a.achievementPct)

  const lowestIds = new Set(sortedEligibleAsc.slice(0, lowestCount).map((r) => r.pharmacistId))
  const topId     = sortedEligibleDesc.length > 0 ? sortedEligibleDesc[0].pharmacistId : null

  return raw.map((r) => ({
    pharmacistId:        r.pharmacistId,
    pharmacistName:      r.pharmacistName,
    actual:              r.actual,
    target:              r.target,
    achievementPct:      r.achievementPct,
    contributionPct:     totalActual > 0 ? round1((r.actual / totalActual) * 100) : 0,
    contributionRank:    rankMap.get(r.pharmacistId) ?? raw.length,
    isLowestContributor: r.target > 0 && lowestIds.has(r.pharmacistId),
    isTopContributor:    r.target > 0 && r.pharmacistId === topId,
    paceStatus:          r.paceStatus,
  }))
}

// ══════════════════════════════════════════════════════════════
// Selector 2 — computeWeakKpiAttribution
// ══════════════════════════════════════════════════════════════

/**
 * For the branch's Focus KPI, identify which pharmacists are
 * dragging the result down and why.
 *
 * Internally calls computeKpiContributionBreakdown — no duplicate
 * ranking/contribution logic.
 *
 * contributionGap = median(achievementPct, target > 0 entries)
 *                   - mean(achievementPct, target > 0 entries)
 *
 * (mean of target > 0 entries is used as the branch average proxy —
 * entries without a target don't have a meaningful achievementPct
 * and would distort the average.)
 */
export function computeWeakKpiAttribution(
  focusKpi: KpiKey,
  pharmacistSummaries: PharmacistPerformanceSummary[],
  accountabilityInsights: AccountabilityInsight[],
): WeakKpiAttribution {
  const breakdown = computeKpiContributionBreakdown(pharmacistSummaries, focusKpi)

  const weakestEntries = breakdown.filter((e) => e.isLowestContributor)
  const weakestPharmacists: WeakKpiContributor[] = weakestEntries.map((e) => ({
    userId:         e.pharmacistId,
    displayName:    e.pharmacistName,
    achievementPct: e.achievementPct,
    paceStatus:     e.paceStatus,
  }))

  // contributionGap = median - average, across entries with target > 0
  const eligibleAchievements = breakdown
    .filter((e) => e.target > 0)
    .map((e) => e.achievementPct)

  const medianAchievementPct = median(eligibleAchievements)
  const averageAchievementPct = eligibleAchievements.length > 0
    ? eligibleAchievements.reduce((s, v) => s + v, 0) / eligibleAchievements.length
    : 0

  const contributionGap = round1(medianAchievementPct - averageAchievementPct)

  // accountabilityFlags: join weakestPharmacists with accountabilityInsights
  // by userId, where needsOperationalSupport OR consistentUnderperformance.
  const weakestIds = new Set(weakestPharmacists.map((p) => p.userId))
  const accountabilityFlags: WeakKpiAccountabilityFlag[] = []
  for (const insight of accountabilityInsights) {
    if (!weakestIds.has(insight.userId)) continue
    if (insight.needsOperationalSupport) {
      accountabilityFlags.push({
        userId: insight.userId,
        displayName: insight.displayName,
        flag: 'needsOperationalSupport',
        detail: insight.supportDetail,
      })
    }
    if (insight.consistentUnderperformance) {
      accountabilityFlags.push({
        userId: insight.userId,
        displayName: insight.displayName,
        flag: 'consistentUnderperformance',
        detail: insight.supportDetail,
      })
    }
  }

  // Explanation — deterministic, template-based. No AI.
  const explanation = buildWeakKpiExplanation(focusKpi, weakestPharmacists, contributionGap)

  return {
    focusKpi,
    weakestPharmacists,
    contributionGap,
    accountabilityFlags,
    explanation,
  }
}

/** Deterministic explanation template — exported for direct testing. */
export function buildWeakKpiExplanation(
  focusKpi: KpiKey,
  weakestPharmacists: WeakKpiContributor[],
  contributionGap: number,
): string {
  if (weakestPharmacists.length === 0) {
    return `${focusKpi} is behind pace, but no individual pharmacist is significantly below the team.`
  }

  const names = weakestPharmacists
    .map((p) => `${p.displayName} (${Math.round(p.achievementPct)}%)`)
    .join(', ')

  if (contributionGap > 10) {
    const n = weakestPharmacists.length
    return `${focusKpi} is behind pace primarily because ${n} pharmacist(s) are below expected pace: ${names}.`
  }

  return `${focusKpi} is behind pace across most of the team, including ${names}.`
}

// ══════════════════════════════════════════════════════════════
// Selector 3 — computeExpectedImpact
// ══════════════════════════════════════════════════════════════

/**
 * Static what-if projection: if the lowest contributors for this KPI
 * reached the team median, what would the branch achievement % become.
 *
 * Returns null when:
 *   - contributionByKpi has no isLowestContributor entries
 *   - branchTarget <= 0
 *   - only one pharmacist (contributionByKpi.length <= 1)
 *   - total uplift across lowest contributors is 0
 */
export function computeExpectedImpact(
  contributionByKpi: KpiContributionEntry[],
  branchActual: number,
  branchTarget: number,
): ExpectedImpact | null {
  if (branchTarget <= 0) return null
  if (contributionByKpi.length <= 1) return null

  const lowestContributors = contributionByKpi.filter((e) => e.isLowestContributor)
  if (lowestContributors.length === 0) return null

  // median across entries with target > 0
  const eligibleAchievements = contributionByKpi
    .filter((e) => e.target > 0)
    .map((e) => e.achievementPct)
  const medianAchievementPct = median(eligibleAchievements)

  let totalUpliftActual = 0
  for (const c of lowestContributors) {
    const upliftPct = Math.max(0, medianAchievementPct - c.achievementPct)
    const upliftActual = (upliftPct / 100) * c.target
    totalUpliftActual += upliftActual
  }

  if (totalUpliftActual === 0) return null

  const currentBranchPct   = round1((branchActual / branchTarget) * 100)
  const projectedBranchPct = round1(((branchActual + totalUpliftActual) / branchTarget) * 100)
  const impactDeltaPts     = round1(projectedBranchPct - currentBranchPct)

  const names = lowestContributors.map((c) => c.pharmacistName).join(', ')
  const scenario = `If ${names} reach the team median (${round1(medianAchievementPct)}%), branch achievement would change from ${currentBranchPct}% to ${projectedBranchPct}%.`

  return {
    scenario,
    currentBranchPct,
    projectedBranchPct,
    impactDeltaPts,
  }
}

// ══════════════════════════════════════════════════════════════
// Selector 4 — evaluateSupervisorActionRules
// ══════════════════════════════════════════════════════════════

/**
 * Input shape for evaluateSupervisorActionRules.
 * Deliberately minimal — only what the 7 rules need.
 */
export interface SupervisorActionInputs {
  /** The branch's Focus KPI (lowest achievementPct KPI with target > 0). */
  focusKpi: KpiKey | null

  /** Branch-wide achievement % for focusKpi (e.g. from Executive BI). */
  focusKpiAchievementPct: number

  /** Expected achievement % for focusKpi at this point in the month. */
  focusKpiExpectedPct: number

  /** Per-KPI branch achievement %, for the "branch on track" check (Rule 4). */
  allKpiAchievementPct: Record<KpiKey, number>

  /** Per-KPI expected %, same keys as allKpiAchievementPct. */
  allKpiExpectedPct: Record<KpiKey, number>

  pharmacistSummaries: PharmacistPerformanceSummary[]
  accountabilityInsights: AccountabilityInsight[]

  /** Result of computeWeakKpiAttribution(focusKpi, ...). */
  weakKpiAttribution: WeakKpiAttribution | null

  /** Result of computeKpiContributionBreakdown(pharmacistSummaries, focusKpi). */
  contributionByKpi: KpiContributionEntry[]

  /** Branch actual/target for focusKpi — for computeExpectedImpact. */
  branchActual: number
  branchTarget: number

  /** topPerformerIds[0] from TeamIntelligenceResult, if any. */
  topPerformerId: string | null

  /** Branch ranking context, if a snapshot exists for this period. null if not available. */
  branchRank: {
    currentRank: number
    previousRank?: number
    rankMovement?: number
    cohortSize: number
  } | null
}

/**
 * Evaluate all 7 supervisor action rules against the given inputs.
 * Returns an array of 1+ SupervisorAction objects (primary + any
 * co-existing secondary actions, e.g. Rule 3 alongside Rule 1).
 *
 * Deterministic, rule-based. No AI/LLM calls.
 */
export function evaluateSupervisorActionRules(
  inputs: SupervisorActionInputs,
): SupervisorAction[] {
  const actions: SupervisorAction[] = []

  // ── Rule 7: No data / insufficient data ──────────────────────
  // Fires when there's no team data, or no focus KPI could be determined
  // (e.g. all KPIs have target = 0).
  if (inputs.pharmacistSummaries.length === 0 || inputs.focusKpi === null) {
    actions.push({
      severity: 'low',
      problem: 'Insufficient data to generate recommendations this month.',
      cause: inputs.pharmacistSummaries.length === 0
        ? 'No pharmacist KPI data found for this branch this month.'
        : 'No KPI with a target greater than 0 was found for this branch this month.',
      recommendedAction: 'Verify branch roster and target configuration for this month.',
      expectedImpact: null,
      evidence: [],
      relatedPharmacists: [],
      // relatedKpi intentionally omitted (undefined) — no KPI to relate to.
    })
    return actions
  }

  const focusKpi = inputs.focusKpi
  const isSinglePharmacist = inputs.pharmacistSummaries.length === 1
  const behindPace = inputs.focusKpiAchievementPct < inputs.focusKpiExpectedPct
  const gapPts = round1(inputs.focusKpiExpectedPct - inputs.focusKpiAchievementPct)

  // ── Rule 6: Single-pharmacist branch ─────────────────────────
  // Overrides Rules 1/2/3/4 (which require team-size > 1 framing) when
  // the branch has exactly one pharmacist — "contribution gap" framing
  // is meaningless with N=1. Falls through to Rule 5 (rank decline),
  // which is independent of team size.
  if (isSinglePharmacist) {
    const only = inputs.pharmacistSummaries[0]
    const behind = behindPace

    actions.push({
      severity: behind ? 'high' : 'low',
      problem: behind
        ? `${focusKpi} is at ${round1(inputs.focusKpiAchievementPct)}% — ${gapPts}pts behind expected pace.`
        : `${focusKpi} is at ${round1(inputs.focusKpiAchievementPct)}%, on or ahead of expected pace.`,
      cause: 'This branch has only one pharmacist — all branch performance is attributable to this individual.',
      recommendedAction: behind
        ? `Direct coaching for ${only.displayName} on ${focusKpi}.`
        : `Continue current approach for ${focusKpi}; consider recognition for ${only.displayName}.`,
      expectedImpact: null, // computeExpectedImpact returns null for single-pharmacist branches
      evidence: [`${only.displayName}: ${round1(inputs.focusKpiAchievementPct)}% achievement on ${focusKpi}`],
      relatedPharmacists: [only.userId],
      relatedKpi: focusKpi,
    })
    // NOTE (Phase 4B correction): do NOT return early here. Rule 6 overrides
    // Rules 1/2/3/4 (all of which require team-size > 1 framing), but Rule 5
    // (rank decline) is independent of team size and must still be evaluated
    // below. Falls through to the Rule 5 check at the end of this function.
  } else {

  // ── Rule 4: Branch on track / recognition ────────────────────
  // Fires when focusKpi is at/above expected pace AND no KPI is more
  // than 5pts behind its expected pace.
  const allOnTrack = Object.entries(inputs.allKpiAchievementPct).every(
    ([k, pct]) => pct >= (inputs.allKpiExpectedPct[k as KpiKey] ?? 0) - 5,
  )

  if (!behindPace && allOnTrack) {
    const topPerformer = inputs.topPerformerId
      ? inputs.pharmacistSummaries.find((p) => p.userId === inputs.topPerformerId)
      : null

    actions.push({
      severity: 'low',
      problem: 'No KPI is significantly behind pace this month.',
      cause: 'Branch is tracking on or ahead of expected pace across all KPIs.',
      recommendedAction: topPerformer
        ? `Consider recognition for ${topPerformer.displayName} (${round1(topPerformer.performanceScore)}%, strongest in ${topPerformer.strongestKpi}).`
        : 'Consider team recognition for sustained performance.',
      expectedImpact: null,
      evidence: topPerformer
        ? [`Branch performance score: ${round1(topPerformer.performanceScore)}%`, `Top performer: ${topPerformer.displayName}`]
        : [],
      relatedPharmacists: topPerformer ? [topPerformer.userId] : [],
      relatedKpi: focusKpi,
    })
    // Rule 4 is terminal for the "on track" branch — Rules 1-3/5 below all
    // assume behindPace; Rule 5 (rank decline) can still apply independently,
    // so fall through rather than returning.
  }

  // ── Rules 1 & 2: Concentrated vs. broad underperformance ─────
  // Only meaningful when focusKpi is behind pace.
  if (behindPace && inputs.weakKpiAttribution) {
    const attribution = inputs.weakKpiAttribution
    const expectedImpact = computeExpectedImpact(
      inputs.contributionByKpi,
      inputs.branchActual,
      inputs.branchTarget,
    )

    if (attribution.weakestPharmacists.length > 0 && attribution.contributionGap > 10) {
      // Rule 1: Concentrated underperformance
      const names = attribution.weakestPharmacists.map((p) => p.displayName).join(', ')
      actions.push({
        severity: 'high',
        problem: `${focusKpi} is at ${round1(inputs.focusKpiAchievementPct)}% — ${gapPts}pts behind expected pace.`,
        cause: attribution.explanation,
        recommendedAction: `Schedule coaching for ${names} focused on ${focusKpi}.`,
        expectedImpact,
        evidence: attribution.weakestPharmacists.map(
          (p) => `${p.displayName}: ${Math.round(p.achievementPct)}% (${p.paceStatus})`,
        ),
        relatedPharmacists: attribution.weakestPharmacists.map((p) => p.userId),
        relatedKpi: focusKpi,
      })
    } else {
      // Rule 2: Broad team-wide gap
      const eligible = inputs.contributionByKpi.filter((e) => e.target > 0)
      const medianPct = round1(median(eligible.map((e) => e.achievementPct)))

      actions.push({
        severity: 'high',
        problem: `${focusKpi} is at ${round1(inputs.focusKpiAchievementPct)}% — ${gapPts}pts behind expected pace.`,
        cause: 'Underperformance is broad-based — most of the team is below pace, not isolated to specific individuals.',
        recommendedAction: `Review ${focusKpi} process/training at the team level (e.g. team huddle, refresher training) rather than individual coaching.`,
        expectedImpact,
        evidence: [
          `Team median achievement: ${medianPct}%`,
          `Branch achievement: ${round1(inputs.focusKpiAchievementPct)}%`,
          `Team size: ${inputs.pharmacistSummaries.length}`,
        ],
        relatedPharmacists: [],
        relatedKpi: focusKpi,
      })
    }

    // ── Rule 3: Accountability-driven issue ────────────────────
    // Co-exists with Rule 1/2 — a secondary card, not mutually exclusive.
    if (attribution.accountabilityFlags.length > 0) {
      const names = [...new Set(attribution.accountabilityFlags.map((f) => f.displayName))].join(', ')
      actions.push({
        severity: 'medium',
        problem: `${names} have low ${focusKpi} achievement, but the cause may be operational, not skill-related.`,
        cause: attribution.accountabilityFlags.map((f) => f.detail).join(' '),
        recommendedAction: `Check in on ${names}'${attribution.accountabilityFlags.length === 1 ? 's' : ''} submission consistency before assuming a performance issue — low submission rate may be inflating the apparent gap.`,
        expectedImpact: null,
        evidence: attribution.accountabilityFlags.map((f) => `${f.displayName}: ${f.flag}`),
        relatedPharmacists: [...new Set(attribution.accountabilityFlags.map((f) => f.userId))],
        relatedKpi: focusKpi,
      })
    }
  }
  } // end of else (multi-pharmacist branch: Rules 1-4)

  // ── Rule 5: Rank decline ──────────────────────────────────────
  // Secondary card — adds rank context alongside whichever of Rule 1/2/4 fired.
  // Only fires when branchRank data exists and rank got worse (rankMovement > 0).
  if (inputs.branchRank && (inputs.branchRank.rankMovement ?? 0) > 0) {
    const { currentRank, previousRank, cohortSize } = inputs.branchRank
    const cause = inputs.weakKpiAttribution?.explanation
      ?? `${focusKpi} is behind pace, contributing to the rank decline.`

    actions.push({
      severity: 'medium',
      problem: `Branch rank dropped from #${previousRank ?? '?'} to #${currentRank} (of ${cohortSize}).`,
      cause,
      recommendedAction: behindPace
        ? `Address ${focusKpi} underperformance — see related recommendation above.`
        : `Review recent changes across all KPIs to identify the cause of the rank movement.`,
      expectedImpact: null,
      evidence: [
        `Previous rank: #${previousRank ?? '?'}`,
        `Current rank: #${currentRank}`,
        `${focusKpi} achievement: ${round1(inputs.focusKpiAchievementPct)}%`,
      ],
      relatedPharmacists: inputs.weakKpiAttribution?.weakestPharmacists.map((p) => p.userId) ?? [],
      relatedKpi: focusKpi,
    })
  }

  return actions
}
