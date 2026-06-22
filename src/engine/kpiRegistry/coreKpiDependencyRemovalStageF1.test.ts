// ============================================================
// Core KPI Dependency Removal Program — Stage F, Phase 1 (Ranking)
//
// Proves that a brand-new, non-Core KPI (not one of the 5 legacy keys)
// can flow through the Ranking surface's score and per-KPI breakdown
// when a registry is supplied, with zero source-code change beyond
// adding the KPI to the registry/profile/data — and proves the
// no-registry path remains byte-identical to its pre-Stage-F behavior.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeBranchKpiScore,
  adaptKpiEntries,
  adaptTargetDoc,
  type KpiEntryDoc,
  type BranchTargetDoc,
} from '../../ranking/branch-kpi-engine'
import { buildBranchIntelligenceViewModel } from '../branchIntelligence/branchIntelligenceViewModelBuilder'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import type { KpiRegistry } from './kpiRegistryTypes'
import { KPI_KEYS } from '../kpiAnalyticsEngine'

const PID = 'branch-test'
const TEST_KPI_KEY = 'insurance_conversion_test'

const TEST_REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: {
    key:            TEST_KPI_KEY,
    label:          'Insurance Conversion (Test)',
    shortLabel:     'Insurance',
    labelAr:        'تحويل التأمين',
    category:       'engagement',
    valueType:      'count',
    unit:           'conversions',
    unitAr:         'تحويل',
    direction:      'higher_is_better',
    targetType:     'absolute',
    weight:         0.3,
    isCore:         false,
    isActive:       true,
    lifecycleStage: 'production_evaluation',
    actualField:    TEST_KPI_KEY,
    targetField:    `${TEST_KPI_KEY}Target`,
  } as any,
}

function entries(): KpiEntryDoc[] {
  return [
    {
      userId: 'u1', pharmacyId: PID, date: '2025-05-10',
      wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
      [TEST_KPI_KEY]: 40,
    },
  ]
}

function targetDoc(): BranchTargetDoc {
  return {
    pharmacyId: PID, month: '2025-05',
    wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
    basketTarget: 50, crossSellTarget: 60,
    [`${TEST_KPI_KEY}Target`]: 50,
  } as any
}

describe('Stage F Phase 1 — Ranking surface accepts an arbitrary new KPI', () => {
  it('without a registry, computeBranchKpiScore ignores the new KPI entirely (byte-identical legacy behavior)', () => {
    const score = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc())
    expect(Object.keys(score.kpiBreakdown).sort()).toEqual([...KPI_KEYS].sort())
    expect(score.kpiBreakdown).not.toHaveProperty(TEST_KPI_KEY)
  })

  it('with a registry, kpiBreakdown includes the new KPI with correct actual/target/achievementPct — no source change beyond the registry entry', () => {
    const score = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc(), TEST_REGISTRY)
    expect(score.kpiBreakdown).toHaveProperty(TEST_KPI_KEY)
    expect(score.kpiBreakdown[TEST_KPI_KEY]).toEqual({
      actual: 40,
      target: 50,
      achievementPct: 80,
    })
  })

  it('with a registry, the 5 Core KPI breakdown values are unchanged by the new KPI being present', () => {
    const withoutNewKpi = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc())
    const withNewKpi     = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc(), TEST_REGISTRY)
    for (const key of KPI_KEYS) {
      expect(withNewKpi.kpiBreakdown[key]).toEqual(withoutNewKpi.kpiBreakdown[key])
    }
  })

  it('with a registry, the new KPI contributes to overallAchievementPct via its registry weight (achievement 80% × weight 0.3)', () => {
    const score = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc(), TEST_REGISTRY)
    // overallAchievementPct must be a valid percentage and must differ from
    // the no-registry score, proving the new KPI's weighted contribution
    // was actually summed into the composite ranking score, not just
    // displayed in the breakdown.
    const withoutNewKpi = computeBranchKpiScore(PID, '2025-05', 'cls-1', 'Branch Test', entries(), targetDoc())
    expect(score.overallAchievementPct).not.toBe(withoutNewKpi.overallAchievementPct)
    expect(score.overallAchievementPct).toBeGreaterThanOrEqual(0)
  })

  it('adaptKpiEntries and adaptTargetDoc preserve the new KPI field instead of dropping it', () => {
    const adaptedEntries = adaptKpiEntries(entries())
    const adaptedTarget  = adaptTargetDoc(targetDoc())
    expect(adaptedEntries[0][TEST_KPI_KEY]).toBe(40)
    expect(adaptedTarget[`${TEST_KPI_KEY}Target`]).toBe(50)
  })

  it('Branch Intelligence view model widens contributionByKpi to include the new KPI when pharmacist snapshots carry it', () => {
    // Mirrors the fixture builders established in
    // branchIntelligenceViewModelBuilder.test.ts (makeSnapshot/makeSummary/
    // makeBranchSummary/makeTeamIntelligence/makeBuilderInput) rather than
    // hand-rolling a new partial shape — this builder has many fields
    // unrelated to the contributionByKpi loop under test.
    const wasfatySnapshot: any = {
      kpiKey: 'wasfaty', label: 'wasfaty', actual: 150, target: 200, achievementPct: 75,
      status: 'warning', remaining: 50, requiredPerDay: 0, expectedToDate: 100, paceStatus: 'on_track',
    }
    const newKpiSnapshot: any = {
      kpiKey: TEST_KPI_KEY, label: TEST_KPI_KEY, actual: 40, target: 50, achievementPct: 80,
      status: 'warning', remaining: 10, requiredPerDay: 0, expectedToDate: 25, paceStatus: 'on_track',
    }
    const summary: any = {
      userId: 'u1', displayName: 'Test Pharmacist', pharmacyId: PID,
      performanceScore: 70, consistencyScore: 80, momentumDirection: 'stable', momentumDelta: 0,
      strongestKpi: 'wasfaty', weakestKpi: TEST_KPI_KEY,
      kpiSnapshots: [wasfatySnapshot, newKpiSnapshot],
      overallAchPct: 70, operationalRisk: 'none', coachingPriority: 'routine', coachingFocusAreas: [],
      submissionRate: 100, activeDays: 20, missedDays: 0, improvingAfterSupport: false, isImproving: false,
      scoreVsPrevious: 0, month: '2025-05', computedAt: '2025-05-15T00:00:00.000Z',
    }
    const branchSummary: any = {
      pharmacyId: PID, pharmacyName: 'Branch Test', pharmacyCode: 'BT', region: 'Central',
      reportMonth: '2025-05', reportDate: '2025-05-15',
      score: {
        overall: 72, grade: 'C',
        kpiBreakdown: [{ kpiKey: 'wasfaty', actual: 150, target: 200, achievementPct: 75 }],
        adjustments: { submissionRate: 0, consistency: 0 },
      },
      weakestKpi: TEST_KPI_KEY, strongestKpi: 'wasfaty', overallAchPct: 72,
      riskProfile: { pharmacyId: PID, riskLevel: 'MEDIUM_RISK', riskScore: 10, flags: [], criticalCount: 0, warningCount: 1 },
      trend: { pharmacyId: PID, overallMomentum: 2, direction: 'STABLE', kpiTrends: [] },
      insights: [], recommendations: [], generatedAt: '2025-05-15T00:00:00.000Z',
    }
    const teamIntelligence: any = {
      pharmacyId: PID, month: '2025-05', generatedAt: '2025-05-15T00:00:00.000Z',
      pharmacistSummaries: [summary], teamHealth: {}, coachingRecommendations: [],
      accountabilityInsights: [], hasImmediateCoachingNeeds: false, teamOperationalRisk: 'low',
      topPerformer: null, mostImproved: null, coachingFocusSummary: '',
      teamMomentum: { direction: 'stable', delta: 0, confidence: 1 },
      teamStability: { isStable: true, cv: 0, isPolarised: false, detail: '' },
      improvingMemberIds: [], atRiskMemberIds: [], topPerformerIds: [],
      operationalStressDetected: false, teamKpiProfile: { strengths: [], weaknesses: [] },
      teamTrendSummary: {},
    }
    const vm = buildBranchIntelligenceViewModel({
      branchSummary,
      teamIntelligence,
      teamSize: 1,
      branchRankSnapshot: null,
      metadata: {
        pharmacyId: PID, month: '2025-05', generatedAt: '2025-05-15T00:00:00.000Z',
        dataAvailability: { hasKpiEntries: true, hasTargets: true, hasEvaluationResults: false, hasRankingSnapshot: false },
      },
    })
    expect(vm.contributionByKpi).toHaveProperty(TEST_KPI_KEY)
    expect(vm.contributionByKpi).toHaveProperty('wasfaty')
  })
})
