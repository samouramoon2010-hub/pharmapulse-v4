// ============================================================
// Team Intelligence Generator v2
// Orchestrates all team intelligence engines into one result.
// Pure function — no Firebase, no React.
// ============================================================

import { computePharmacistPerformance } from './pharmacistPerformanceEngine'
import { computeTeamHealth }            from './teamHealthEngine'
import { buildTeamCoachingPlan }        from './coachingEngine'
import { computeAccountabilityInsights } from './accountabilityEngine'
import {
  computeTeamMomentum,
  computeTeamStability,
  identifyImprovingMembers,
  identifyAtRiskMembers,
  identifyTopPerformers,
  detectOperationalStress,
  computeTeamKpiProfile,
  generateTeamTrendSummary,
} from './teamTrendEngine'

import type {
  TeamIntelligenceInput,
  TeamIntelligenceResult,
  OperationalRisk,
  PharmacistPerformanceSummary,
} from './teamIntelligenceTypes'

// ── Team operational risk ─────────────────────────────────────
function teamOperationalRisk(summaries: PharmacistPerformanceSummary[]): OperationalRisk {
  const highCount = summaries.filter((s) => s.operationalRisk === 'high').length
  const total     = summaries.length || 1
  const ratio     = highCount / total
  if (ratio >= 0.4) return 'high'
  if (ratio >= 0.2) return 'medium'
  if (highCount > 0) return 'low'
  return 'none'
}

// ── Main generator ────────────────────────────────────────────
export function generateTeamIntelligence(
  input: TeamIntelligenceInput,
  now:   Date = new Date(),
): TeamIntelligenceResult {
  // 1. Per-pharmacist performance summaries
  const pharmacistSummaries = input.pharmacists.map((p) =>
    computePharmacistPerformance(p, now)
  )

  // 2. Team health (uses performance summaries)
  const teamHealth = computeTeamHealth(input, pharmacistSummaries, now)

  // 3. Coaching plan (Phase 3: uses coachingEngine)
  const { recommendations: coachingRecommendations, focusSummary } =
    buildTeamCoachingPlan(pharmacistSummaries)

  // 4. Accountability insights (Phase 3: uses accountabilityEngine)
  const accountabilityInsights = computeAccountabilityInsights(
    input.pharmacists,
    input.month,
    now,
  )

  // 5. Team trend analysis (Phase 3: uses teamTrendEngine)
  const momentum       = computeTeamMomentum(pharmacistSummaries)
  const stability      = computeTeamStability(pharmacistSummaries)
  const improving      = identifyImprovingMembers(pharmacistSummaries)
  const atRisk         = identifyAtRiskMembers(pharmacistSummaries)
  const topPerfs       = identifyTopPerformers(pharmacistSummaries, 3)
  const isStressed     = detectOperationalStress(pharmacistSummaries, momentum)
  const kpiProfile     = computeTeamKpiProfile(pharmacistSummaries)
  // Phase 3C: unified trend summary
  const teamTrendSummary = generateTeamTrendSummary(pharmacistSummaries, input.pharmacyId)

  // 6. Aggregate flags
  const hasImmediateCoachingNeeds = coachingRecommendations.some((r) => r.priority === 'immediate')
  const teamRisk      = teamOperationalRisk(pharmacistSummaries)

  const sorted        = [...pharmacistSummaries].sort((a, b) => b.performanceScore - a.performanceScore)
  const topPerformer  = sorted[0]?.performanceScore >= 70 ? sorted[0].userId : null
  const mostImproved  = pharmacistSummaries
    .filter((s) => s.isImproving && s.scoreVsPrevious > 0)
    .sort((a, b) => b.scoreVsPrevious - a.scoreVsPrevious)[0]?.userId ?? null

  return {
    pharmacyId:  input.pharmacyId,
    month:       input.month,
    generatedAt: now.toISOString(),

    pharmacistSummaries,
    teamHealth,
    coachingRecommendations,
    accountabilityInsights,

    hasImmediateCoachingNeeds,
    teamOperationalRisk: teamRisk,
    topPerformer,
    mostImproved,

    // Phase 3 additions
    coachingFocusSummary:   focusSummary,
    teamMomentum:           momentum,
    teamStability:          stability,
    improvingMemberIds:     improving,
    atRiskMemberIds:        atRisk,
    topPerformerIds:        topPerfs,
    operationalStressDetected: isStressed,
    teamKpiProfile:         kpiProfile,
    // Phase 3C: full trend summary
    teamTrendSummary,
  }
}
