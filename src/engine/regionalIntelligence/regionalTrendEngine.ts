// ============================================================
// Regional Trend Engine
// Analyzes regional operational momentum and stability from
// rollup summaries. Pure rule-based intelligence — no AI,
// no Firestore, no React.
//
// Input:  RegionalTrendInput  (current + optional previous rollup)
// Output: RegionalTrendAnalysis
//
// TODO(future): Accept a RegionalSnapshot[] from the
//   `regional_snapshots` Firestore collection so trend direction
//   can be computed from a true 30/60-day history rather than
//   only current vs previous period.
//
// TODO(future): Expose as a Cloud Function trigger that fires
//   after each regional aggregation job so trend data is always
//   fresh in Firestore without client computation.
//
// TODO(future): Feed output into BigQuery rollup source for
//   historical trend dashboards and executive reporting.
// ============================================================

import type {
  RegionalTrendInput,
  RegionalTrendAnalysis,
  RegionalTrendDirection,
  RegionalRollupSummary,
  RegionalKpiAverage,
  RecoverySignal,
} from './regionalTypes'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — CONSTANTS
// ══════════════════════════════════════════════════════════════

/** Score delta thresholds for direction classification */
const SCORE_DELTA = {
  improving:  4,   // score rose >= 4 pts → IMPROVING
  declining: -4,   // score fell >= 4 pts → DECLINING
  stable:     3,   // |delta| <= 3 → STABLE band
} as const

/** Thresholds for individual signal computations */
const SIGNAL_THRESHOLDS = {
  sustainedStressHighRiskPct:  40,   // >= 40% HIGH_RISK triggers sustained stress check
  sustainedStressScoreCeiling: 60,   // score must be below this for sustained stress
  volatilitySpreadMin:         30,   // KPI spread >= 30% → volatility contribution
  volatilityKpiCount:           2,   // how many high-spread KPIs trigger volatility
  weakRecoverySignalMin:        0,   // at least 1 recovery signal = recovery candidate
  stressHighRiskForStress:     40,   // % high-risk that contributes to stress score
  momentumRecoveryBonus:       15,   // bonus to momentum for strong recovery signal
  momentumStresspenalty:      -20,   // penalty to momentum for sustained stress
} as const

// ══════════════════════════════════════════════════════════════
// SECTION 2 — SCORE DELTA
// ══════════════════════════════════════════════════════════════

/**
 * Compute the change in regional score between two periods.
 * Returns 0 when no previous data is available.
 */
function computeScoreDelta(
  current:  RegionalRollupSummary,
  previous: RegionalRollupSummary | undefined,
): number {
  if (!previous) return 0
  return current.regionalScore - previous.regionalScore
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — HIGH-RISK DELTA
// ══════════════════════════════════════════════════════════════

/**
 * Change in HIGH_RISK branch % between periods.
 * Positive = more branches at high risk (worsening).
 * Negative = fewer branches at high risk (improving).
 */
function computeHighRiskDelta(
  current:  RegionalRollupSummary,
  previous: RegionalRollupSummary | undefined,
): number {
  if (!previous) return 0
  return (
    current.riskConcentration.highRiskPct -
    previous.riskConcentration.highRiskPct
  )
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — KPI VOLATILITY
// ══════════════════════════════════════════════════════════════

/**
 * Count KPIs with high cross-branch spread (max − min achievement %).
 * A high spread means branches within the region are very inconsistent
 * on that KPI — a regional coordination problem, not just a weak KPI.
 */
function countVolatileKpis(kpiAverages: RegionalKpiAverage[]): number {
  return kpiAverages.filter(
    (k) =>
      k.contributingBranches >= 2 &&
      k.spreadPct >= SIGNAL_THRESHOLDS.volatilitySpreadMin,
  ).length
}

/**
 * Mean KPI spread across all KPIs with contributing branches.
 * Used to penalise the stability score.
 */
function meanKpiSpread(kpiAverages: RegionalKpiAverage[]): number {
  const valid = kpiAverages.filter((k) => k.contributingBranches >= 1)
  if (!valid.length) return 0
  return valid.reduce((s, k) => s + k.spreadPct, 0) / valid.length
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — MOMENTUM SCORE
// ══════════════════════════════════════════════════════════════

/**
 * Composite momentum score: −100 (strongly declining) to +100 (strongly improving).
 *
 * Components (all clamped individually before summing):
 *   Score delta contribution : delta × 4  (capped ±60)
 *   Risk delta contribution  : −riskDelta × 1.5 (capped ±25)
 *   Recovery signal bonus    : +15 per STRONG recovery signal (capped +20)
 *   Sustained stress penalty : −20 flat
 */
function computeMomentumScore(
  scoreDelta:          number,
  highRiskDelta:       number,
  recoverySignals:     RecoverySignal[],
  sustainedStress:     boolean,
): number {
  const scorePart   = Math.max(-60, Math.min(60,  scoreDelta * 4))
  const riskPart    = Math.max(-25, Math.min(25, -highRiskDelta * 1.5))

  const strongCount = recoverySignals.filter((s) => s.strength === 'STRONG').length
  const recoveryBonus = Math.min(20, strongCount * SIGNAL_THRESHOLDS.momentumRecoveryBonus)

  const stressPenalty = sustainedStress ? SIGNAL_THRESHOLDS.momentumStresspenalty : 0

  const raw = scorePart + riskPart + recoveryBonus + stressPenalty
  return Math.max(-100, Math.min(100, Math.round(raw)))
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — STABILITY SCORE
// ══════════════════════════════════════════════════════════════

/**
 * Stability score: 0 (chaotic / unpredictable) to 100 (very stable).
 *
 * Starts at 100 and deducts:
 *   − (meanKpiSpread × 0.8)  for cross-branch KPI inconsistency
 *   − (volatileKpiCount × 10) for KPIs with particularly high spread
 *   − (highRiskPct × 0.4)    for concentration of high-risk branches
 *   − (inactiveRate × 30)    for data coverage gaps
 */
function computeStabilityScore(
  current:         RegionalRollupSummary,
  volatileKpis:    number,
  kpiSpreadMean:   number,
): number {
  const total       = current.branchCount || 1
  const inactiveRate = current.inactiveBranches / total
  const highRiskPct  = current.riskConcentration.highRiskPct

  const spreadPenalty    = Math.min(50, kpiSpreadMean * 0.8)
  const volatilePenalty  = volatileKpis * 10
  const riskPenalty      = Math.min(25, highRiskPct * 0.4)
  const inactivePenalty  = Math.min(20, inactiveRate * 30)

  const raw = 100 - spreadPenalty - volatilePenalty - riskPenalty - inactivePenalty
  return Math.max(0, Math.min(100, Math.round(raw)))
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — SUSTAINED STRESS SIGNAL
// ══════════════════════════════════════════════════════════════

/**
 * Sustained stress = the region is objectively under structural
 * pressure, not just having a bad day.
 *
 * Fires when ALL THREE hold simultaneously:
 *   1. >= 40% of branches are HIGH_RISK
 *   2. Regional score < 60
 *   3. No STRONG recovery signals present
 */
function detectSustainedStress(current: RegionalRollupSummary): boolean {
  const highRiskPct    = current.riskConcentration.highRiskPct
  const score          = current.regionalScore
  const hasStrongRec   = current.recoverySignals.some((s) => s.strength === 'STRONG')

  return (
    highRiskPct  >= SIGNAL_THRESHOLDS.sustainedStressHighRiskPct &&
    score        <  SIGNAL_THRESHOLDS.sustainedStressScoreCeiling &&
    !hasStrongRec
  )
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — RECOVERY SIGNAL
// ══════════════════════════════════════════════════════════════

/**
 * Regional recovery signal = the region is showing positive
 * movement after a period of difficulty.
 *
 * Fires when:
 *   - At least 1 STRONG branch-level recovery signal exists, AND
 *   - The region was NOT already ON_TRACK last period
 *     (or no previous data available, which is treated conservatively)
 */
function detectRecoverySignal(
  current:  RegionalRollupSummary,
  previous: RegionalRollupSummary | undefined,
): boolean {
  const hasStrongSignal = current.recoverySignals.some((s) => s.strength === 'STRONG')
  if (!hasStrongSignal) return false

  // If we have a previous period: only fire if not already fully on-track before
  if (previous) {
    const wasAlreadyOnTrack = previous.regionalRiskLevel === 'ON_TRACK' &&
                              previous.regionalScore >= 80
    if (wasAlreadyOnTrack) return false
  }

  return true
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — TREND DIRECTION CLASSIFICATION
// ══════════════════════════════════════════════════════════════

/**
 * Classify the dominant trend direction for the region.
 * Evaluated in priority order — first matching rule wins.
 */
function classifyTrendDirection(
  scoreDelta:       number,
  momentumScore:    number,
  volatileKpis:     number,
  recoverySignal:   boolean,
  sustainedStress:  boolean,
): RegionalTrendDirection {
  // RECOVERY takes priority when the signal is genuine
  if (recoverySignal && momentumScore > 0) return 'RECOVERY'

  // VOLATILE when many KPIs have high cross-branch spread
  if (volatileKpis >= SIGNAL_THRESHOLDS.volatilityKpiCount) return 'VOLATILE'

  // DECLINING when score is falling meaningfully
  if (scoreDelta <= SCORE_DELTA.declining) return 'DECLINING'

  // IMPROVING when score is rising meaningfully
  if (scoreDelta >= SCORE_DELTA.improving) return 'IMPROVING'

  // STABLE is the default when nothing else fires
  return 'STABLE'
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — TREND NARRATIVE
// ══════════════════════════════════════════════════════════════

/**
 * Generate a short, executive-ready narrative describing the
 * region's operational trend. Rule-based — no AI, no LLM calls.
 * Constructive and operational in tone.
 *
 * TODO(future): Replace the return value with an LLM-generated
 *   narrative once Phase 5 AI infrastructure is in place.
 *   The inputs to this function become the AI context payload.
 */
function buildTrendNarrative(
  regionName:       string,
  direction:        RegionalTrendDirection,
  scoreDelta:       number,
  momentumScore:    number,
  stabilityScore:   number,
  current:          RegionalRollupSummary,
  sustainedStress:  boolean,
): string {
  const score    = current.regionalScore
  const highRisk = current.riskConcentration.highRisk
  const total    = current.branchCount
  const inactive = current.inactiveBranches
  const recs     = current.recoverySignals.length

  switch (direction) {
    case 'IMPROVING':
      return `${regionName} is showing meaningful improvement — regional score rose ${scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} points this period. ` +
             `${highRisk > 0 ? `${highRisk} of ${total} branches remain at high risk and merit continued focus. ` : 'All branches are within acceptable risk bounds. '}` +
             `Momentum score: ${momentumScore > 0 ? '+' : ''}${momentumScore}.`

    case 'DECLINING':
      return `${regionName} performance declined this period — regional score moved ${scoreDelta} points. ` +
             `${highRisk > 0 ? `${highRisk} of ${total} branches are at high risk. ` : ''}` +
             `${inactive > 0 ? `${inactive} branch${inactive > 1 ? 'es have' : ' has'} no data this period. ` : ''}` +
             `Early coaching and target review are recommended.`

    case 'RECOVERY':
      return `${regionName} is in active recovery — ${recs} branch${recs !== 1 ? 'es are' : ' is'} showing positive momentum. ` +
             `Regional score: ${score}. Stability score: ${stabilityScore}/100. ` +
             `Continue reinforcing current practices to sustain this trajectory.`

    case 'VOLATILE':
      return `${regionName} shows high operational variability — KPI performance is inconsistent across branches. ` +
             `Stability score: ${stabilityScore}/100. ` +
             `${highRisk > 0 ? `${highRisk} of ${total} branches are at high risk. ` : ''}` +
             `Targeted alignment sessions may help reduce inter-branch spread.`

    case 'STABLE':
    default:
      if (sustainedStress) {
        return `${regionName} is stable but under sustained operational pressure — ` +
               `${highRisk} of ${total} branches are at high risk with a regional score of ${score}. ` +
               `No recovery signals are present. Escalation and targeted support are advisable.`
      }
      return `${regionName} is operationally stable this period — regional score: ${score}, ` +
             `stability score: ${stabilityScore}/100. ` +
             `${highRisk > 0 ? `${highRisk} branch${highRisk > 1 ? 'es' : ''} at high risk — monitor closely. ` : 'All branches within normal operating range.'}` +
             `${recs > 0 ? ` ${recs} branch${recs > 1 ? 'es are' : ' is'} showing recovery momentum.` : ''}`
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 11 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Analyze the operational trend for a single region.
 *
 * @param input - Current rollup + optional previous period rollup
 * @returns     RegionalTrendAnalysis — safe, never throws
 *
 * @example
 * const trend = analyzeRegionalTrend({ current, previous })
 * // → trend.trendDirection   ('IMPROVING' | 'DECLINING' | ...)
 * // → trend.momentumScore    (+42)
 * // → trend.stabilityScore   (78)
 * // → trend.trendNarrative   ('North region is showing...')
 */
export function analyzeRegionalTrend(
  input: RegionalTrendInput,
): RegionalTrendAnalysis {
  const { current, previous } = input

  // Compute deltas
  const scoreDelta     = computeScoreDelta(current, previous)
  const highRiskDelta  = computeHighRiskDelta(current, previous)

  // KPI volatility
  const volatileKpis   = countVolatileKpis(current.kpiAverages)
  const kpiSpreadMean  = meanKpiSpread(current.kpiAverages)

  // Signals
  const sustainedStress = detectSustainedStress(current)
  const recoverySignal  = detectRecoverySignal(current, previous)

  // Composite scores
  const momentumScore   = computeMomentumScore(
    scoreDelta,
    highRiskDelta,
    current.recoverySignals,
    sustainedStress,
  )
  const stabilityScore  = computeStabilityScore(current, volatileKpis, kpiSpreadMean)

  // Direction classification
  const trendDirection  = classifyTrendDirection(
    scoreDelta,
    momentumScore,
    volatileKpis,
    recoverySignal,
    sustainedStress,
  )

  // Narrative
  const trendNarrative  = buildTrendNarrative(
    current.regionName,
    trendDirection,
    scoreDelta,
    momentumScore,
    stabilityScore,
    current,
    sustainedStress,
  )

  return {
    regionName:           current.regionName,
    trendDirection,
    momentumScore,
    stabilityScore,
    recoverySignal,
    sustainedStressSignal: sustainedStress,
    trendNarrative,
    generatedAt:          new Date().toISOString(),
  }
}

/**
 * Analyze trends for all regions in a portfolio.
 * Convenience wrapper — matches each current rollup to its
 * corresponding previous rollup by regionName.
 *
 * @param current  - Array of current-period regional rollups
 * @param previous - Array of previous-period regional rollups (optional)
 * @returns        One RegionalTrendAnalysis per region, sorted by regionName
 *
 * TODO(future): When regional_snapshots Firestore collection is
 *   implemented, replace the `previous` parameter with a direct
 *   Firestore read inside a scheduled Cloud Function so this
 *   function remains a pure aggregation layer.
 */
export function analyzeAllRegionalTrends(
  current:   RegionalRollupSummary[],
  previous?: RegionalRollupSummary[],
): RegionalTrendAnalysis[] {
  if (!current.length) return []

  const prevMap = new Map(
    (previous ?? []).map((r) => [r.regionName, r]),
  )

  return current
    .map((c) => analyzeRegionalTrend({ current: c, previous: prevMap.get(c.regionName) }))
    .sort((a, b) => a.regionName.localeCompare(b.regionName))
}
