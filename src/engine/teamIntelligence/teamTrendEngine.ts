// ============================================================
// Team Trend Engine — Phase 3C
// Analyses team momentum, stability, improvement consistency,
// operational stress patterns, recovery, and volatility.
// Pure function — no Firebase, no React.
// ============================================================

import type {
  PharmacistPerformanceSummary,
  MomentumDirection,
  TeamTrendSummary,
  VolatilityLevel,
  StressPattern,
  RecoveryTrend,
} from './teamIntelligenceTypes'

// ══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════

function deltaToDirection(delta: number): MomentumDirection {
  if (delta >= 8)   return 'accelerating'
  if (delta >= 2)   return 'improving'
  if (delta >= -2)  return 'stable'
  if (delta >= -8)  return 'cooling'
  return 'needs_support'
}

function teamCV(scores: number[]): number {
  if (scores.length < 2) return 0
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length
  if (!mean) return 0
  const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length
  return Math.sqrt(variance) / mean
}

function isPolarised(scores: number[]): boolean {
  if (scores.length < 2) return false
  const sorted = [...scores].sort((a, b) => a - b)
  return sorted[sorted.length - 1] - sorted[0] > 40
}

// ══════════════════════════════════════════════════════════════
// 1. TEAM MOMENTUM
// ══════════════════════════════════════════════════════════════

export function computeTeamMomentum(
  summaries: PharmacistPerformanceSummary[],
): { direction: MomentumDirection; delta: number; confidence: number } {
  if (!summaries.length) return { direction: 'stable', delta: 0, confidence: 0 }

  const deltas   = summaries.map((s) => s.momentumDelta)
  const avgDelta = deltas.reduce((s, v) => s + v, 0) / deltas.length

  const improvingCount = summaries.filter((s) =>
    s.momentumDirection === 'improving' ||
    s.momentumDirection === 'accelerating'
  ).length
  const confidence = Math.round((improvingCount / summaries.length) * 100) / 100

  return {
    direction: deltaToDirection(Math.round(avgDelta)),
    delta:     Math.round(avgDelta),
    confidence,
  }
}

// ══════════════════════════════════════════════════════════════
// 2. STABILITY SCORE (0–100)
// ══════════════════════════════════════════════════════════════
// 100 = perfect uniformity. Penalises high CV and polarisation.

export function computeTeamStability(
  summaries: PharmacistPerformanceSummary[],
): { isStable: boolean; cv: number; isPolarised: boolean; detail: string } {
  const scores = summaries.map((s) => s.performanceScore)
  const cv     = teamCV(scores)
  const polar  = isPolarised(scores)
  const stable = cv < 0.25 && !polar

  const detail = polar
    ? `Performance spread is wide (${Math.max(...scores) - Math.min(...scores)} pts) — consider pairing high and lower performers`
    : cv > 0.35
    ? `High variance across team (CV: ${Math.round(cv * 100)}%) — inconsistent conditions`
    : stable
    ? 'Team performance is relatively consistent'
    : 'Moderate variance — some members may benefit from additional support'

  return { isStable: stable, cv: Math.round(cv * 100) / 100, isPolarised: polar, detail }
}

function computeStabilityScore(summaries: PharmacistPerformanceSummary[]): number {
  if (!summaries.length) return 0
  const scores = summaries.map((s) => s.performanceScore)
  const cv     = teamCV(scores)
  const polar  = isPolarised(scores)

  // Base: 100 − penalty for variance − penalty for polarisation
  const cvPenalty    = Math.min(cv * 100, 60)          // up to −60
  const polarPenalty = polar ? 20 : 0
  return Math.max(0, Math.round(100 - cvPenalty - polarPenalty))
}

// ══════════════════════════════════════════════════════════════
// 3. IMPROVEMENT CONSISTENCY (0–100 %)
// ══════════════════════════════════════════════════════════════

function computeImprovementConsistency(
  summaries: PharmacistPerformanceSummary[],
): { pct: number; sustainedCount: number; ids: string[] } {
  if (!summaries.length) return { pct: 0, sustainedCount: 0, ids: [] }

  const improving = summaries.filter((s) =>
    s.momentumDirection === 'improving' ||
    s.momentumDirection === 'accelerating' ||
    s.improvingAfterSupport
  )

  // "Sustained" = improving AND momentum delta ≥ 5
  const sustained = improving.filter((s) => s.momentumDelta >= 5)

  return {
    pct:          Math.round((improving.length / summaries.length) * 100),
    sustainedCount: sustained.length,
    ids:          improving.map((s) => s.userId),
  }
}

// ══════════════════════════════════════════════════════════════
// 4. REPEATED OPERATIONAL STRESS
// ══════════════════════════════════════════════════════════════

function computeOperationalStress(
  summaries: PharmacistPerformanceSummary[],
  momentum:  ReturnType<typeof computeTeamMomentum>,
): { detected: boolean; pattern: StressPattern; detail: string } {
  if (!summaries.length) return { detected: false, pattern: 'none', detail: '' }

  const atRiskCount = summaries.filter(
    (s) => s.operationalRisk === 'high' || s.operationalRisk === 'medium'
  ).length
  const atRiskPct = atRiskCount / summaries.length

  const negMomentum = momentum.direction === 'cooling' || momentum.direction === 'needs_support'
  const lowConsistency = summaries.filter((s) => s.consistencyScore < 40).length / summaries.length

  // Pattern classification
  let pattern: StressPattern = 'none'
  let detected = false

  if (atRiskPct >= 0.6 && negMomentum) {
    pattern  = 'escalating'
    detected = true
  } else if (atRiskPct >= 0.4 && (negMomentum || lowConsistency >= 0.4)) {
    pattern  = 'persistent'
    detected = true
  } else if (atRiskPct >= 0.3) {
    pattern  = 'transient'
    detected = true
  }

  const detail = !detected
    ? ''
    : pattern === 'escalating'
    ? `${atRiskCount} of ${summaries.length} members at risk with declining momentum — immediate team review recommended`
    : pattern === 'persistent'
    ? `${atRiskCount} members showing sustained performance challenges — coaching intervention needed`
    : `${atRiskCount} members experiencing temporary performance dip — monitor closely`

  return { detected, pattern, detail }
}

// ══════════════════════════════════════════════════════════════
// 5. RECOVERY TREND
// ══════════════════════════════════════════════════════════════

function computeRecoveryTrend(
  summaries: PharmacistPerformanceSummary[],
): { trend: RecoveryTrend; count: number; ids: string[] } {
  if (!summaries.length) return { trend: 'not_applicable', count: 0, ids: [] }

  const recovering = summaries.filter((s) => s.improvingAfterSupport)
  const n          = recovering.length

  // Also consider members shifting from needs_support → stable/improving
  const emerging   = summaries.filter(
    (s) => s.momentumDirection === 'improving' && s.operationalRisk !== 'none'
  )

  if (n === 0 && !emerging.length) return { trend: 'not_applicable', count: 0, ids: [] }

  const allRecovering = [...new Set([...recovering, ...emerging])]
  const trend: RecoveryTrend =
    n >= Math.ceil(summaries.length * 0.4) ? 'strong'   :
    n >= 2                                 ? 'sustained' :
    allRecovering.length >= 1              ? 'emerging'  :
                                             'not_applicable'

  return { trend, count: allRecovering.length, ids: allRecovering.map((s) => s.userId) }
}

// ══════════════════════════════════════════════════════════════
// 6. VOLATILITY SIGNAL
// ══════════════════════════════════════════════════════════════
// Combines score spread + consistency variance + momentum disagreement

function computeVolatility(
  summaries:     PharmacistPerformanceSummary[],
  stabilityScore: number,
  stress:        ReturnType<typeof computeOperationalStress>,
): { level: VolatilityLevel; detail: string } {
  if (!summaries.length) return { level: 'low', detail: 'No data' }

  // Momentum disagreement: how many different directions?
  const directions = new Set(summaries.map((s) => s.momentumDirection))
  const disagreement = directions.size

  // Consistency spread
  const consistencyCV = teamCV(summaries.map((s) => s.consistencyScore))

  // Score
  const volatilityScore =
    (100 - stabilityScore) * 0.4 +
    disagreement            * 10  +
    consistencyCV           * 25  +
    (stress.detected ? 20 : 0)

  const level: VolatilityLevel =
    volatilityScore >= 70 ? 'critical'  :
    volatilityScore >= 45 ? 'high'      :
    volatilityScore >= 20 ? 'moderate'  :
                            'low'

  const detail =
    level === 'critical'  ? 'Severe team performance fragmentation — unified intervention needed'    :
    level === 'high'      ? 'Significant performance divergence across team members'                 :
    level === 'moderate'  ? 'Some performance variation — monitor for emerging patterns'             :
                            'Team is operating with low volatility'

  return { level, detail }
}

// ══════════════════════════════════════════════════════════════
// 7. KPI PROFILE (unchanged from 3A)
// ══════════════════════════════════════════════════════════════

export function computeTeamKpiProfile(
  summaries: PharmacistPerformanceSummary[],
): {
  strengths:  Array<{ kpiKey: string; avgAch: number }>
  weaknesses: Array<{ kpiKey: string; avgAch: number; affectedCount: number }>
} {
  if (!summaries.length) return { strengths: [], weaknesses: [] }

  const kpiKeys = summaries[0]?.kpiSnapshots.map((s) => s.kpiKey) ?? []

  const profile = kpiKeys.map((k) => {
    const snaps = summaries
      .map((s) => s.kpiSnapshots.find((sn) => sn.kpiKey === k))
      .filter(Boolean) as Array<{ achievementPct: number; target: number }>

    const withTarget = snaps.filter((s) => s.target > 0)
    if (!withTarget.length) return null

    const avgAch       = Math.round(withTarget.reduce((s, v) => s + v.achievementPct, 0) / withTarget.length)
    const affectedCount = withTarget.filter((s) => s.achievementPct < 80).length
    return { kpiKey: k as string, avgAch, affectedCount }
  }).filter(Boolean) as Array<{ kpiKey: string; avgAch: number; affectedCount: number }>

  return {
    strengths:  profile.filter((p) => p.avgAch >= 85).sort((a, b) => b.avgAch - a.avgAch),
    weaknesses: profile.filter((p) => p.avgAch < 75).sort((a, b) => a.avgAch - b.avgAch),
  }
}

// ══════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS (used by generator / existing tests)
// ══════════════════════════════════════════════════════════════

export function identifyImprovingMembers(
  summaries: PharmacistPerformanceSummary[],
): string[] {
  return summaries
    .filter((s) => s.isImproving && s.scoreVsPrevious > 0)
    .map((s) => s.userId)
}

export function identifyAtRiskMembers(
  summaries: PharmacistPerformanceSummary[],
): string[] {
  return summaries
    .filter((s) => s.operationalRisk === 'high' || s.operationalRisk === 'medium')
    .map((s) => s.userId)
}

export function identifyTopPerformers(
  summaries: PharmacistPerformanceSummary[],
  n = 3,
): string[] {
  return [...summaries]
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, n)
    .map((s) => s.userId)
}

export function detectOperationalStress(
  summaries: PharmacistPerformanceSummary[],
  momentum:  ReturnType<typeof computeTeamMomentum>,
): boolean {
  return computeOperationalStress(summaries, momentum).detected
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT — generateTeamTrendSummary
// ══════════════════════════════════════════════════════════════

export function generateTeamTrendSummary(
  summaries: PharmacistPerformanceSummary[],
  pharmacyId: string,
): TeamTrendSummary {
  if (!summaries.length) {
    return {
      teamMomentumDirection: 'stable', momentumDelta: 0, momentumConfidence: 0,
      stabilityScore: 0, stabilityDetail: 'No team data',
      improvementConsistency: 0, sustainedImprovingCount: 0, improvingMemberIds: [],
      repeatedOperationalStress: false, stressPattern: 'none', stressDetail: '',
      atRiskMemberIds: [],
      recoveryTrend: 'not_applicable', recoveringMemberCount: 0, recoveringMemberIds: [],
      teamVolatilitySignal: 'low', volatilityDetail: 'No data', isPolarised: false,
      teamKpiStrengths: [], teamKpiWeaknesses: [],
      memberCount: 0, computedAt: new Date().toISOString(),
    }
  }

  // Compute each signal
  const momentum        = computeTeamMomentum(summaries)
  const stabilityRaw    = computeTeamStability(summaries)
  const stabilityScore  = computeStabilityScore(summaries)
  const improvement     = computeImprovementConsistency(summaries)
  const stress          = computeOperationalStress(summaries, momentum)
  const recovery        = computeRecoveryTrend(summaries)
  const volatility      = computeVolatility(summaries, stabilityScore, stress)
  const kpiProfile      = computeTeamKpiProfile(summaries)
  const atRiskIds       = identifyAtRiskMembers(summaries)

  return {
    // Momentum
    teamMomentumDirection: momentum.direction,
    momentumDelta:         momentum.delta,
    momentumConfidence:    momentum.confidence,

    // Stability
    stabilityScore,
    stabilityDetail: stabilityRaw.detail,

    // Improvement consistency
    improvementConsistency: improvement.pct,
    sustainedImprovingCount: improvement.sustainedCount,
    improvingMemberIds:      improvement.ids,

    // Stress
    repeatedOperationalStress: stress.detected,
    stressPattern:             stress.pattern,
    stressDetail:              stress.detail,
    atRiskMemberIds:           atRiskIds,

    // Recovery
    recoveryTrend:         recovery.trend,
    recoveringMemberCount: recovery.count,
    recoveringMemberIds:   recovery.ids,

    // Volatility
    teamVolatilitySignal: volatility.level,
    volatilityDetail:     volatility.detail,
    isPolarised:          stabilityRaw.isPolarised,

    // KPI profile
    teamKpiStrengths:  kpiProfile.strengths,
    teamKpiWeaknesses: kpiProfile.weaknesses,

    memberCount: summaries.length,
    computedAt:  new Date().toISOString(),
  }
}
