// ============================================================
// liveDataAdapter — focused tests
//
// Proves the actual bug fix: before this adapter existed,
// AssistantPage built an AssistantContext with no ledgerEntry/
// opportunities/recommendations, so every answer template said
// "no grounded evidence". These tests build a context the same way
// AssistantPage now does (buildAssistantContext + buildLiveBranchGrounding)
// from realistic live KPI data, then run it through the EXISTING,
// unmodified buildAnswer() kernel and assert real, non-empty answers.
// ============================================================
import { describe, it, expect } from 'vitest'

import { buildLiveBranchGrounding } from './liveDataAdapter'
import { buildAssistantContext } from './assistantContext'
import { buildAnswer } from './answerBuilder'
import { listGroundedKpiKeys, extractGroundedFacts } from './assistantGrounding'
import { computeKpiStats } from '../engine/kpiAnalyticsEngine'
import type { DayProgress } from '../engine/kpiAnalyticsEngine'
import type { BranchIntelligenceViewModel } from '../engine/branchIntelligence/branchIntelligenceTypes'

const DAY_PROGRESS: DayProgress = { currentDay: 15, totalDays: 30, daysRemaining: 15, ratio: 0.5, pct: 50 }

function stat(actual: number, target: number, kpiKey: string, label: string) {
  const s = computeKpiStats(actual, target, DAY_PROGRESS, kpiKey as any)
  return { ...s, _label: label }
}

function makeKpiStats() {
  return {
    wasfaty:      stat(40, 100, 'wasfaty', 'Wasfaty'),    // 40% — weakest
    omni:         stat(90, 100, 'omni', 'OmniHealth'),    // 90% — strongest
    wellness:     stat(60, 100, 'wellness', 'Wellness'),
  }
}

function makeViewModel(): BranchIntelligenceViewModel {
  return {
    branchSummary: {
      pharmacyId: 'branch-001', pharmacyName: 'Branch A', pharmacyCode: 'B01', region: 'Cairo',
      healthScore: 63.3, healthGrade: 'C', forecastPct: null, forecastTrend: 'flat', kpiTrends: [], riskLevel: 'watch',
      riskFlags: [
        { category: 'FORECAST', severity: 'HIGH', description: 'Wasfaty is on pace to miss target by a wide margin.' },
      ],
      riskCriticalCount: 1, riskWarningCount: 0,
      branchRank: null, teamSize: 3,
    },
    momentum: {
      pharmacyId: 'branch-001', overallDirection: 'improving', overallDelta: 4.2,
      kpiMomentum: [
        { kpiKey: 'wasfaty' as any, label: 'Wasfaty', direction: 'improving', todayVsYesterday: 3, weekVsPrevWeek: 5, streakDays: 2, streakDirection: 'up', momentumConfidence: 0.8, isAnomaly: false, smoothedDelta: 4.2, sustainedDays: 2 },
      ],
      dominantKpi: 'wasfaty' as any,
    },
    kpiIntelligence: { focusKpi: 'wasfaty' as any },
    pharmacistRanking: [],
    contributionByKpi: {} as any,
    coachingOpportunities: { topPerformer: null, mostImproved: null, mostAtRisk: null, lowestContributor: null },
    supervisorActions: [
      {
        severity: 'high', problem: 'Wasfaty is critically behind pace',
        cause: 'Two pharmacists are below 50% achievement.',
        recommendedAction: 'Run a coaching session on Wasfaty submission this week.',
        expectedImpact: { scenario: 'lowest contributors reach median', currentBranchPct: 40, projectedBranchPct: 55, impactDeltaPts: 15 },
        evidence: ['Wasfaty at 40% vs 50% expected'],
        relatedPharmacists: ['u1', 'u2'],
        relatedKpi: 'wasfaty' as any,
      },
    ],
    weakKpiAttribution: {
      focusKpi: 'wasfaty' as any,
      weakestPharmacists: [],
      contributionGap: 12,
      accountabilityFlags: [],
      explanation: 'Wasfaty underperformance is concentrated in 2 of 3 pharmacists.',
    },
    metadata: {
      pharmacyId: 'branch-001', month: '2026-06', generatedAt: '2026-06-15T12:00:00.000Z',
      dataAvailability: { hasKpiEntries: true, hasTargets: true, hasEvaluationResults: false, hasRankingSnapshot: false },
    },
    warnings: [],
  }
}

describe('buildLiveBranchGrounding', () => {
  it('returns null when viewModel is missing (graceful degradation, not a crash)', () => {
    expect(buildLiveBranchGrounding('branch-001', '2026-06', null, makeKpiStats())).toBeNull()
  })

  it('returns null when kpiStats is empty', () => {
    expect(buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), {})).toBeNull()
  })

  it('never throws on a malformed viewModel', () => {
    expect(buildLiveBranchGrounding('branch-001', '2026-06', {} as any, makeKpiStats())).toBeDefined()
  })

  it('builds a ledgerEntry carrying the real healthScore, not an invented number', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    expect(grounding.ledgerEntry.score).toBe(63.3)
    expect(grounding.ledgerEntry.entityId).toBe('branch-001')
    expect(grounding.ledgerEntry.periodId).toBe('2026-06')
  })

  it('the trace exposes exactly the real KPI keys passed in (grounding allowlist)', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    const context = buildAssistantContext({
      entityId: 'branch-001', entityType: 'branch', profileId: 'live-branch-kpis', profileVersion: 'v1', periodId: '2026-06',
      ledgerEntry: grounding.ledgerEntry,
    })
    expect(listGroundedKpiKeys(context).sort()).toEqual(['omni', 'wasfaty', 'wellness'])
  })

  it('flags the weakest KPI as BIGGEST_WEAKNESS using its real achievement %', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    const weakness = grounding.opportunities.items.find((i) => i.category === 'BIGGEST_WEAKNESS')!
    expect(weakness.targetId).toBe('wasfaty')
    expect(weakness.value).toBe(40) // 40/100 actual/target achievement, via the real computeAchievementPct()
  })

  it('flags the strongest KPI as HIGHEST_CONTRIBUTING_KPI', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    const strongest = grounding.opportunities.items.find((i) => i.category === 'HIGHEST_CONTRIBUTING_KPI')!
    expect(strongest.targetId).toBe('omni')
  })

  it('flags the top risk flag as RISK_FLAG, using the real severity and description', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    const risk = grounding.opportunities.items.find((i) => i.category === 'RISK_FLAG')!
    expect(risk.targetId).toBe('FORECAST')
    expect(risk.value).toBe(3) // HIGH severity
    expect(risk.description).toBe('Wasfaty is on pace to miss target by a wide margin.')
  })

  it('surfaces the branch momentum signal as MOMENTUM_SIGNAL, citing the real dominant KPI and direction', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    const momentum = grounding.opportunities.items.find((i) => i.category === 'MOMENTUM_SIGNAL')!
    expect(momentum.targetId).toBe('wasfaty')
    expect(momentum.value).toBe(4.2)
    expect(momentum.description).toContain('improving')
  })

  it('omits MOMENTUM_SIGNAL when there is no live momentum data (kpiMomentum empty)', () => {
    const vm = makeViewModel()
    vm.momentum = { ...vm.momentum, kpiMomentum: [] }
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', vm, makeKpiStats())!
    expect(grounding.opportunities.items.find((i) => i.category === 'MOMENTUM_SIGNAL')).toBeUndefined()
  })

  it('omits RISK_FLAG items when there are no active risk flags', () => {
    const vm = makeViewModel()
    vm.branchSummary = { ...vm.branchSummary, riskFlags: [] }
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', vm, makeKpiStats())!
    expect(grounding.opportunities.items.find((i) => i.category === 'RISK_FLAG')).toBeUndefined()
  })

  it('maps supervisorActions into recommendations with the real expected impact, not a guess', () => {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    expect(grounding.recommendations.items).toHaveLength(1)
    expect(grounding.recommendations.items[0].expectedGain).toBe(15)
    expect(grounding.recommendations.items[0].priority).toBe('high')
  })
})

describe('end-to-end: the Assistant now produces real answers instead of "no grounded evidence" (regression for the reported bug)', () => {
  function buildLiveContext() {
    const grounding = buildLiveBranchGrounding('branch-001', '2026-06', makeViewModel(), makeKpiStats())!
    return buildAssistantContext({
      entityId: 'branch-001', entityType: 'branch', profileId: 'live-branch-kpis', profileVersion: 'v1', periodId: '2026-06',
      ledgerEntry: grounding.ledgerEntry, opportunities: grounding.opportunities, recommendations: grounding.recommendations,
    })
  }

  it('"Why is the score what it is?" returns the real score, not "no grounded evidence"', () => {
    const answer = buildAnswer('Why is the score what it is?', buildLiveContext())
    expect(answer.text).not.toContain('no grounded evidence')
    expect(answer.text).toContain('63.3')
    expect(answer.evidence.length).toBeGreaterThan(0)
  })

  it('"What are the biggest opportunities?" surfaces the real weakest/strongest KPI findings', () => {
    const answer = buildAnswer('What are the biggest opportunities?', buildLiveContext())
    expect(answer.text).not.toContain('No opportunity findings')
    expect(answer.text.toLowerCase()).toContain('wasfaty')
  })

  it('"What should we focus on?" surfaces the real supervisor-action recommendation', () => {
    const answer = buildAnswer('What should we focus on?', buildLiveContext())
    expect(answer.text).not.toContain('No recommendations are available')
    expect(answer.text).toContain('Wasfaty is critically behind pace')
  })

  it('every fact cited as evidence is one of: ledger, opportunity, recommendation — never invented', () => {
    const context = buildLiveContext()
    const facts = extractGroundedFacts(context)
    expect(facts.length).toBeGreaterThan(0)
    for (const f of facts) {
      expect(['ledger', 'opportunity', 'recommendation']).toContain(f.source)
    }
  })

  it('explain_ranking still honestly says "not available" — Option 1 scope deliberately excludes ranking', () => {
    const answer = buildAnswer('What is our ranking?', buildLiveContext())
    expect(answer.text).toContain('No ranking data is available')
  })

  it('with no live data at all (old behavior, e.g. no branchId), the assistant still degrades gracefully — never throws', () => {
    const context = buildAssistantContext({ entityId: 'unknown', entityType: 'branch', profileId: '', profileVersion: '', periodId: '2026-06' })
    expect(() => buildAnswer('Why is the score what it is?', context)).not.toThrow()
  })
})
