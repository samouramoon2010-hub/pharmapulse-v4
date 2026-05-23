// ============================================================
// Coaching Engine
// Generates operational coaching recommendations per pharmacist.
// Language is supportive, not evaluative.
// Pure function — no Firebase, no React.
// ============================================================

import { KPI_META, KPI_KEYS } from '../kpiAnalyticsEngine'
import type {
  PharmacistPerformanceSummary,
  CoachingRecommendation
} from './teamIntelligenceTypes'

let _id = 0
function recId(): string { return `rec-${Date.now()}-${++_id}` }

// ── Thresholds ────────────────────────────────────────────────
const COACHING_THRESHOLDS = {
  lowSubmission:          70,   // % — flag submission habits
  lowKpiAchievement:      70,   // % — specific KPI coaching
  lowConsistency:         60,   // % — consistency coaching
  recognitionThreshold:   90,   // % — positive reinforcement
  recoveringThreshold:    0,    // positive scoreDelta = recovering
} as const

// ── Build coaching suggestion for a specific pharmacist ──────
export function buildCoachingRecommendations(
  summary: PharmacistPerformanceSummary,
): CoachingRecommendation[] {
  const recs: CoachingRecommendation[] = []

  // ── Recognition first ──────────────────────────────────────
  if (summary.performanceScore >= COACHING_THRESHOLDS.recognitionThreshold) {
    recs.push({
      id:              recId(),
      priority:        'recognition',
      title:           `Recognise ${summary.displayName}'s performance`,
      detail:          `${summary.displayName} is achieving ${summary.performanceScore}% overall — acknowledge this publicly to reinforce the behaviour.`,
      rationale:       `High performance score with positive momentum — recognition maintains engagement.`,
      targetUserId:    summary.userId,
      targetUserName:  summary.displayName,
      _aiReady:        true,
    })
    return recs  // recognition — no coaching needed
  }

  // ── Submission habits ──────────────────────────────────────
  if (summary.submissionRate < COACHING_THRESHOLDS.lowSubmission) {
    recs.push({
      id:             recId(),
      priority:       summary.submissionRate < 50 ? 'immediate' : 'near_term',
      title:          `Support ${summary.displayName} with daily data entry`,
      detail:         `Submission rate is ${summary.submissionRate}%. A brief daily check-in or reminder system could help build the habit.`,
      kpiKey:         undefined,
      rationale:      `Incomplete data limits visibility and forecasting accuracy for the team.`,
      targetUserId:   summary.userId,
      targetUserName: summary.displayName,
      _aiReady:       true,
    })
  }

  // ── Weakest KPI — specific focus ──────────────────────────
  const weakestSnapshot = summary.kpiSnapshots.find((s) => s.kpiKey === summary.weakestKpi)
  if (
    weakestSnapshot &&
    weakestSnapshot.achievementPct < COACHING_THRESHOLDS.lowKpiAchievement
  ) {
    const isImmediate = weakestSnapshot.achievementPct < 50
    recs.push({
      id:             recId(),
      priority:       isImmediate ? 'immediate' : 'near_term',
      title:          `${KPI_META[summary.weakestKpi].en} coaching for ${summary.displayName}`,
      detail:         `${KPI_META[summary.weakestKpi].en} is at ${weakestSnapshot.achievementPct}%. Focus on practical techniques during the next shift — identify what barriers exist.`,
      kpiKey:         summary.weakestKpi,
      rationale:      `Lowest KPI dragging overall performance. Targeted focus will have the highest return.`,
      targetUserId:   summary.userId,
      targetUserName: summary.displayName,
      _aiReady:       true,
    })
  }

  // ── Consistency coaching ──────────────────────────────────
  if (summary.consistencyScore < COACHING_THRESHOLDS.lowConsistency && summary.activeDays >= 3) {
    recs.push({
      id:             recId(),
      priority:       'near_term',
      title:          `Pacing support for ${summary.displayName}`,
      detail:         `Performance varies day to day (consistency ${summary.consistencyScore}%). Work on steady daily targets rather than catch-up spikes.`,
      rationale:      `High variance reduces forecasting reliability and indicates an unsteady work pattern.`,
      targetUserId:   summary.userId,
      targetUserName: summary.displayName,
      _aiReady:       true,
    })
  }

  // ── Recovering — positive support ─────────────────────────
  if (summary.isImproving && summary.scoreVsPrevious > 0 && summary.performanceScore < 80) {
    recs.push({
      id:             recId(),
      priority:       'routine',
      title:          `Continue supporting ${summary.displayName}'s recovery`,
      detail:         `Performance improved by +${summary.scoreVsPrevious} points this period. Acknowledge progress and maintain current support focus.`,
      rationale:      `Positive momentum after a difficult period — reinforcement accelerates recovery.`,
      targetUserId:   summary.userId,
      targetUserName: summary.displayName,
      _aiReady:       true,
    })
  }

  // ── Routine check-in for stable underperformance ──────────
  if (
    recs.length === 0 &&
    summary.performanceScore < 80 &&
    !summary.isImproving
  ) {
    recs.push({
      id:             recId(),
      priority:       'routine',
      title:          `Routine check-in with ${summary.displayName}`,
      detail:         `Performance is at ${summary.performanceScore}% — schedule a brief 1:1 to understand any operational barriers.`,
      rationale:      `Stable underperformance without obvious cause benefits from a direct conversation.`,
      targetUserId:   summary.userId,
      targetUserName: summary.displayName,
      _aiReady:       true,
    })
  }

  return recs
}

// ── Team-level coaching plan ──────────────────────────────────
export function buildTeamCoachingPlan(
  summaries: PharmacistPerformanceSummary[],
): { recommendations: CoachingRecommendation[]; focusSummary: string } {
  const allRecs = summaries
    .flatMap((s) => buildCoachingRecommendations(s))

  // Sort: immediate → near_term → routine → recognition
  const ORDER: Record<string, number> = {
    immediate: 0, near_term: 1, routine: 2, recognition: 3,
  }
  allRecs.sort((a, b) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9))

  // Build focus summary
  const immediateCount = allRecs.filter((r) => r.priority === 'immediate').length
  const recognitionCount = allRecs.filter((r) => r.priority === 'recognition').length

  let focusSummary: string
  if (immediateCount > 0) {
    focusSummary = `${immediateCount} member${immediateCount > 1 ? 's' : ''} need immediate coaching support`
  } else if (recognitionCount === summaries.length) {
    focusSummary = 'Team performing well — focus on recognition and reinforcement'
  } else {
    focusSummary = 'Routine coaching cycle — maintain current support approach'
  }

  return { recommendations: allRecs, focusSummary }
}
