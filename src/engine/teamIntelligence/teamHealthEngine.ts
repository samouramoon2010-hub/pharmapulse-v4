// ============================================================
// Team Health Engine
// Generates team-level operational health assessment.
// Pure function — no Firebase, no React.
// ============================================================

import { format } from 'date-fns'
import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  sumKpi, computeAchievementPct, getTrafficLight, getDayProgress,
} from '../kpiAnalyticsEngine'

import type {
  TeamHealthSummary,
  TeamSignal,
  TeamStatus,
  KpiSnapshot,
  MomentumDirection,
  PharmacistPerformanceSummary,
  TeamIntelligenceInput,
} from './teamIntelligenceTypes'

// ── Map average score to team status ─────────────────────────
function scoreToTeamStatus(
  avgScore:     number,
  highRiskCount: number,
  memberCount:  number,
): TeamStatus {
  const riskRatio = memberCount > 0 ? highRiskCount / memberCount : 0
  if (riskRatio >= 0.5 || avgScore < 35) return 'critical_operation'
  if (riskRatio >= 0.3 || avgScore < 55) return 'intervention_required'
  if (riskRatio >= 0.1 || avgScore < 72) return 'monitoring'
  return 'stable'
}

// ── Team momentum: dominant direction across members ─────────
function teamMomentum(summaries: PharmacistPerformanceSummary[]): MomentumDirection {
  if (!summaries.length) return 'stable'
  const ORDER: Record<MomentumDirection, number> = {
    accelerating: 4, improving: 3, stable: 2, cooling: 1, needs_support: 0,
  }
  const counts = summaries.reduce((acc, s) => {
    acc[s.momentumDirection] = (acc[s.momentumDirection] ?? 0) + 1
    return acc
  }, {} as Record<MomentumDirection, number>)
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as MomentumDirection
}

// ── Build team-level KPI snapshots (aggregate) ────────────────
function buildTeamKpiSnapshot(
  input:     TeamIntelligenceInput,
  now:       Date,
): KpiSnapshot[] {
  const dp = getDayProgress(now)
  return KPI_KEYS.map(k => {
    // Sum all pharmacist MTD entries for this KPI
    const totalActual = input.pharmacists.reduce(
      (s, p) => s + sumKpi(p.mtdEntries, k), 0)
    // Sum targets
    const totalTarget = input.pharmacists.reduce((s, p) => {
      const t = p.target ? Number((p.target as any)[KPI_META[k].targetField] ?? 0) : 0
      return s + t
    }, 0)
    const achievementPct = computeAchievementPct(totalActual, totalTarget)
    const status = getTrafficLight(achievementPct, dp.ratio)
    return { kpiKey: k, label: KPI_META[k].en, actual: totalActual, target: totalTarget, achievementPct, status }
  })
}

// ── Detect team signals ───────────────────────────────────────
function buildTeamSignals(
  summaries:   PharmacistPerformanceSummary[],
  kpiSnapshot: KpiSnapshot[],
): { strengths: TeamSignal[]; weaknesses: TeamSignal[]; unstable: TeamSignal[] } {
  const strengths:  TeamSignal[] = []
  const weaknesses: TeamSignal[] = []
  const unstable:   TeamSignal[] = []

  // KPI-level team signals
  for (const snap of kpiSnapshot) {
    if (!snap.target) continue
    const memberCount = summaries.length

    // Count members above/below 80% on this KPI
    const above80 = summaries.filter(s => {
      const ks = s.kpiSnapshots.find(k => k.kpiKey === snap.kpiKey)
      return (ks?.achievementPct ?? 0) >= 80
    }).length
    const below60 = summaries.filter(s => {
      const ks = s.kpiSnapshots.find(k => k.kpiKey === snap.kpiKey)
      return (ks?.achievementPct ?? 100) < 60 && (ks?.target ?? 0) > 0
    }).length

    if (above80 >= Math.ceil(memberCount * 0.7) && snap.achievementPct >= 85) {
      strengths.push({
        type: 'strength', kpiKey: snap.kpiKey,
        label: `${snap.label} — Team Strength`,
        detail: `${above80}/${memberCount} members above 80% · team total ${snap.achievementPct}%`,
        affectedMemberCount: above80,
      })
    }

    if (below60 >= Math.ceil(memberCount * 0.4)) {
      weaknesses.push({
        type: 'weakness', kpiKey: snap.kpiKey,
        label: `${snap.label} — Team Gap`,
        detail: `${below60}/${memberCount} members below 60% on ${snap.label}`,
        affectedMemberCount: below60,
      })
    }
  }

  // Unstable signals
  const highRisk = summaries.filter(s => s.operationalRisk === 'high').length
  if (highRisk > 0) {
    unstable.push({
      type: 'risk',
      label: `${highRisk} member${highRisk > 1 ? 's' : ''} need${highRisk === 1 ? 's' : ''} support`,
      detail: `${highRisk} team member${highRisk > 1 ? 's' : ''} identified as needing operational support`,
      affectedMemberCount: highRisk,
    })
  }

  // Consistency signal
  const lowConsistency = summaries.filter(s => s.consistencyScore < 40).length
  if (lowConsistency >= Math.ceil(summaries.length * 0.4)) {
    unstable.push({
      type: 'unstable',
      label: 'Team submission consistency low',
      detail: `${lowConsistency} members showing irregular submission patterns`,
      affectedMemberCount: lowConsistency,
    })
  }

  // Positive: multiple members improving
  const improving = summaries.filter(s =>
    s.momentumDirection === 'accelerating' || s.momentumDirection === 'improving'
  ).length
  if (improving >= Math.ceil(summaries.length * 0.5)) {
    strengths.push({
      type: 'strength',
      label: 'Team momentum positive',
      detail: `${improving}/${summaries.length} members showing improvement trend`,
      affectedMemberCount: improving,
    })
  }

  return { strengths, weaknesses, unstable }
}

// ── Main function ─────────────────────────────────────────────
export function computeTeamHealth(
  input:     TeamIntelligenceInput,
  summaries: PharmacistPerformanceSummary[],
  now:       Date = new Date(),
): TeamHealthSummary {
  const memberCount = summaries.length

  if (memberCount === 0) {
    return {
      pharmacyId: input.pharmacyId, month: input.month,
      overallTeamStatus: 'stable', teamStatusConfidence: 0,
      teamPerformanceScore: 0, teamConsistencyScore: 0,
      teamMomentumDirection: 'stable',
      operationalStrengths: [], operationalWeaknesses: [], unstableTeamSignals: [],
      memberCount: 0, activeMembers: 0, highPerformers: [], needsSupportList: [],
      teamKpiSnapshot: [], computedAt: new Date().toISOString(),
    }
  }

  // Averages
  const teamPerformanceScore = Math.round(
    summaries.reduce((s, m) => s + m.performanceScore, 0) / memberCount)
  const teamConsistencyScore = Math.round(
    summaries.reduce((s, m) => s + m.consistencyScore, 0) / memberCount)

  // Status
  const highRiskCount = summaries.filter(s => s.operationalRisk === 'high').length
  const overallTeamStatus = scoreToTeamStatus(teamPerformanceScore, highRiskCount, memberCount)

  // Confidence: more members = more reliable
  const teamStatusConfidence = Math.min(0.95, 0.4 + (memberCount / 10) * 0.55)

  // Momentum
  const teamMomentumDirection = teamMomentum(summaries)

  // Members
  const activeMembers   = summaries.filter(s => s.submissionRate > 0).length
  const highPerformers  = summaries.filter(s => s.performanceScore >= 80).map(s => s.userId)
  const needsSupportList = summaries.filter(s =>
    s.operationalRisk === 'high' || s.coachingPriority === 'immediate'
  ).map(s => s.userId)

  // KPI snapshot
  const teamKpiSnapshot = buildTeamKpiSnapshot(input, now)

  // Signals
  const { strengths, weaknesses, unstable } = buildTeamSignals(summaries, teamKpiSnapshot)

  return {
    pharmacyId: input.pharmacyId,
    month:      input.month,
    overallTeamStatus,
    teamStatusConfidence,
    teamPerformanceScore,
    teamConsistencyScore,
    teamMomentumDirection,
    operationalStrengths:  strengths,
    operationalWeaknesses: weaknesses,
    unstableTeamSignals:   unstable,
    memberCount,
    activeMembers,
    highPerformers,
    needsSupportList,
    teamKpiSnapshot,
    computedAt: new Date().toISOString(),
  }
}
