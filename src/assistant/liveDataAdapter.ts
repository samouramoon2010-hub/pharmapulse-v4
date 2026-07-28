// ============================================================
// Assistant — Live Branch Data Adapter
//
// AssistantPage previously built an AssistantContext with NO ledger
// entry, no opportunities, no recommendations — every answer (AI or
// deterministic) had zero grounded facts, so every question got
// "no grounded evidence available". This adapter fixes that by
// reformatting the SAME live, already-computed data that powers the
// Branch Intelligence page (useBranchIntelligenceData's `viewModel`
// and `kpiStats`) into the shapes the existing, certified grounding
// kernels (assistantGrounding.ts, answerTemplates.ts) already expect.
//
// This is a structural reformatting of real numbers — never a new
// calculation, never an invented value. Scope is intentionally
// limited to what is actually live today:
//   - ledgerEntry / trace   ✓ (from branchSummary.healthScore + kpiStats)
//   - opportunities         ✓ (weakest/strongest KPI from kpiStats, plus
//     the branch's top risk flags from riskEngine and its dominant
//     momentum signal from liveMomentumEngine — see buildOpportunities)
//   - recommendations       ✓ (from supervisorActions, already rule-based)
//   - ranking / benchmark / legacy trend  ✗ — these require the legacy
//     Evaluation Ledger/Profile Studio pipeline, which is not live in
//     production today. Left undefined on purpose: the existing
//     templates already say "not available" rather than guessing.
//
// No Firestore. No React. No AI.
// ============================================================

import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'
import type { ProfileSimTrace, ElementSimTrace, RuleSimTrace } from '../profileStudio/simulationTrace'
import type { OpportunityResult, OpportunityItem } from '../intelligence/opportunityTypes'
import type { RecommendationResult, RecommendationItem } from '../intelligence/recommendationTypes'
import type { BranchIntelligenceViewModel, SupervisorActionSeverity } from '../engine/branchIntelligence/branchIntelligenceTypes'
import type { KpiStats } from '../engine/kpiAnalyticsEngine'

type LiveKpiStats = KpiStats & { _label?: string }

export interface LiveBranchGrounding {
  ledgerEntry:     EvaluationLedgerEntry
  opportunities:   OpportunityResult
  recommendations: RecommendationResult
}

const SEVERITY_TO_PRIORITY: Record<SupervisorActionSeverity, RecommendationItem['priority']> = {
  critical: 'high',
  high:     'high',
  medium:   'medium',
  low:      'low',
}

function buildTrace(kpiStats: Record<string, LiveKpiStats>, healthScore: number): ProfileSimTrace {
  const now = new Date().toISOString()
  const entries = Object.entries(kpiStats)

  const elements: ElementSimTrace[] = entries.map(([kpiKey, stat]) => {
    const rule: RuleSimTrace = {
      ruleId:            `live-${kpiKey}`,
      kpiKey,
      rawActual:         stat.actual,
      rawTarget:         stat.target,
      rawAchievement:    stat.achievementPct,
      cappedAchievement: stat.achievementPct,
      weightedScore:     stat.achievementPct,
      penaltyApplied:    0,
      finalNodeScore:    stat.achievementPct,
      zeroTarget:        stat.target === 0,
      stepTraces:        [],
      timestamp:         now,
    }
    return {
      elementId:            `live-${kpiKey}-element`,
      label:                stat._label ?? kpiKey,
      score:                stat.achievementPct,
      weight:               1,
      weightedContribution: stat.achievementPct,
      rules:                [rule],
      timestamp:            now,
    }
  })

  return {
    profileId:      'live-branch-kpis',
    profileVersion: 'v1',
    overallScore:   healthScore,
    baskets: [{
      basketId:             'live-kpis',
      label:                'Live KPI Achievement',
      score:                healthScore,
      weight:               1,
      weightedContribution: healthScore,
      elements,
      timestamp:            now,
    }],
    timestamp: now,
  }
}

function buildLedgerEntry(
  branchId: string,
  periodId: string,
  viewModel: BranchIntelligenceViewModel,
  kpiStats: Record<string, LiveKpiStats>,
): EvaluationLedgerEntry {
  const healthScore = viewModel.branchSummary.healthScore
  const trace = buildTrace(kpiStats, healthScore)

  return {
    evaluationId:   `live-${branchId}-${periodId}`,
    entityId:       branchId,
    entityType:     'branch',
    profileId:      'live-branch-kpis',
    profileVersion: 'v1',
    periodId,
    score:          healthScore,
    basketScores:   { 'live-kpis': healthScore },
    elementScores:  Object.fromEntries(Object.entries(kpiStats).map(([k, s]) => [`live-${k}-element`, s.achievementPct])),
    ruleScores:     Object.fromEntries(Object.entries(kpiStats).map(([k, s]) => [`live-${k}`, s.achievementPct])),
    trace,
    timestamp:      viewModel.metadata.generatedAt,
    metadata:       { source: 'liveBranchIntelligence', dataAvailability: viewModel.metadata.dataAvailability },
  }
}

function buildOpportunities(branchId: string, kpiStats: Record<string, LiveKpiStats>, viewModel: BranchIntelligenceViewModel): OpportunityResult {
  const items: OpportunityItem[] = []
  const entries = Object.entries(kpiStats)

  if (entries.length > 0) {
    const [weakestKey, weakestStat]     = entries.reduce((a, b) => (b[1].achievementPct < a[1].achievementPct ? b : a))
    const [strongestKey, strongestStat] = entries.reduce((a, b) => (b[1].achievementPct > a[1].achievementPct ? b : a))

    items.push({
      category:    'BIGGEST_WEAKNESS',
      level:       'rule',
      targetId:    weakestKey,
      targetLabel: weakestStat._label ?? weakestKey,
      value:       weakestStat.achievementPct,
      description: `${weakestStat._label ?? weakestKey} is the weakest KPI at ${weakestStat.achievementPct}% of target (${weakestStat.actual}/${weakestStat.target}).`,
    })

    if (strongestKey !== weakestKey) {
      items.push({
        category:    'HIGHEST_CONTRIBUTING_KPI',
        level:       'rule',
        targetId:    strongestKey,
        targetLabel: strongestStat._label ?? strongestKey,
        value:       strongestStat.achievementPct,
        description: `${strongestStat._label ?? strongestKey} is the strongest KPI at ${strongestStat.achievementPct}% of target (${strongestStat.actual}/${strongestStat.target}).`,
      })
    }
  }

  // Risk evidence (riskEngine, via branchSummary.riskFlags — already
  // sorted HIGH severity first) — the Assistant can only cite a risk
  // if it shows up here as a grounded fact, so the top 2 active flags
  // are surfaced the same way a weak/strong KPI is.
  for (const flag of viewModel.branchSummary.riskFlags.slice(0, 2)) {
    items.push({
      category:    'RISK_FLAG',
      level:       'profile',
      targetId:    flag.category,
      targetLabel: flag.category,
      value:       flag.severity === 'HIGH' ? 3 : flag.severity === 'MEDIUM' ? 2 : 1,
      description: flag.description,
    })
  }

  // Momentum evidence (liveMomentumEngine, via viewModel.momentum) —
  // only when there is at least one KPI with a live momentum signal.
  const momentum = viewModel.momentum
  if (momentum && momentum.kpiMomentum.length > 0) {
    items.push({
      category:    'MOMENTUM_SIGNAL',
      level:       'rule',
      targetId:    momentum.dominantKpi,
      targetLabel: momentum.dominantKpi,
      value:       momentum.overallDelta,
      description: `Branch momentum is ${momentum.overallDirection}, driven mainly by ${momentum.dominantKpi}.`,
    })
  }

  return { entityId: branchId, entityType: 'branch', items, generatedAt: new Date().toISOString() }
}

function buildRecommendations(branchId: string, viewModel: BranchIntelligenceViewModel): RecommendationResult {
  const items: RecommendationItem[] = viewModel.supervisorActions.map((action, i) => ({
    id:           `live-action-${i}`,
    title:        action.problem,
    description:  [action.cause, action.recommendedAction].filter(Boolean).join(' '),
    priority:     SEVERITY_TO_PRIORITY[action.severity] ?? 'medium',
    impact:        action.expectedImpact?.impactDeltaPts ?? 0,
    confidence:    1,
    difficulty:   'medium',
    expectedGain:  action.expectedImpact?.impactDeltaPts ?? 0,
    basedOn: {
      opportunityCategory: 'BIGGEST_WEAKNESS',
      targetId:            action.relatedKpi ?? '',
    },
  }))

  return { entityId: branchId, items, generatedAt: new Date().toISOString() }
}

/**
 * Builds the grounding bundle for AssistantContext from the SAME live
 * data already computed for the Branch Intelligence page. Never
 * throws — a missing/incomplete viewModel produces an empty-items
 * grounding bundle, never a fabricated one.
 */
export function buildLiveBranchGrounding(
  branchId:  string,
  periodId:  string,
  viewModel: BranchIntelligenceViewModel | null | undefined,
  kpiStats:  Record<string, LiveKpiStats> | null | undefined,
): LiveBranchGrounding | null {
  try {
    if (!viewModel || !kpiStats || Object.keys(kpiStats).length === 0) return null

    return {
      ledgerEntry:     buildLedgerEntry(branchId, periodId, viewModel, kpiStats),
      opportunities:   buildOpportunities(branchId, kpiStats, viewModel),
      recommendations: buildRecommendations(branchId, viewModel),
    }
  } catch {
    return null
  }
}
