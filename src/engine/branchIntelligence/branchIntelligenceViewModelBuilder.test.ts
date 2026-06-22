// ============================================================
// Branch Intelligence — ViewModel Builder Tests
// Phase 4B
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildBranchIntelligenceViewModel } from './branchIntelligenceViewModelBuilder'
import {
  computeKpiContributionBreakdown,
  computeWeakKpiAttribution,
  evaluateSupervisorActionRules,
  type SupervisorActionInputs,
} from './branchIntelligenceSelectors'
import type { BranchIntelligenceBuilderInput } from './branchIntelligenceTypes'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
  KpiSnapshot,
  TeamIntelligenceResult,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { BranchExecutiveSummary, KpiScoreBreakdown } from '../executive/executiveTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { KPI_KEYS } from '../kpiAnalyticsEngine'

// ════════════════════════════════════════════════════════════════
// Fixture builders
// ════════════════════════════════════════════════════════════════

function makeSnapshot(overrides: Partial<KpiSnapshot> & { kpiKey: KpiKey }): KpiSnapshot {
  const target = overrides.target ?? 100
  const actual = overrides.actual ?? 0
  return {
    kpiKey: overrides.kpiKey,
    label: overrides.kpiKey,
    actual,
    target,
    achievementPct: overrides.achievementPct ?? (target > 0 ? Math.round((actual / target) * 100) : 0),
    status: overrides.status ?? 'warning',
    remaining: overrides.remaining ?? Math.max(0, target - actual),
    requiredPerDay: overrides.requiredPerDay ?? 0,
    expectedToDate: overrides.expectedToDate ?? target * 0.5,
    paceStatus: overrides.paceStatus ?? 'on_track',
  }
}

/** Build a full set of 5 snapshots (KPI_KEYS) for one pharmacist, overriding one KPI. */
function makeFullSnapshots(overrideKpi: KpiKey, overrideActual: number, overrideAchievementPct: number, target = 100): KpiSnapshot[] {
  return KPI_KEYS.map((k) =>
    k === overrideKpi
      ? makeSnapshot({ kpiKey: k, actual: overrideActual, target, achievementPct: overrideAchievementPct })
      : makeSnapshot({ kpiKey: k, actual: 80, target: 100, achievementPct: 80 }),
  )
}

function makeSummary(overrides: {
  userId: string
  displayName: string
  kpiSnapshots: KpiSnapshot[]
  performanceScore?: number
  strongestKpi?: KpiKey
  weakestKpi?: KpiKey
  operationalRisk?: PharmacistPerformanceSummary['operationalRisk']
  momentumDirection?: PharmacistPerformanceSummary['momentumDirection']
  momentumDelta?: number
}): PharmacistPerformanceSummary {
  return {
    userId: overrides.userId,
    displayName: overrides.displayName,
    pharmacyId: 'branch-1',
    performanceScore: overrides.performanceScore ?? 70,
    consistencyScore: 80,
    momentumDirection: overrides.momentumDirection ?? 'stable',
    momentumDelta: overrides.momentumDelta ?? 0,
    strongestKpi: overrides.strongestKpi ?? 'wasfaty',
    weakestKpi: overrides.weakestKpi ?? 'omni',
    kpiSnapshots: overrides.kpiSnapshots,
    overallAchPct: 70,
    operationalRisk: overrides.operationalRisk ?? 'none',
    coachingPriority: 'routine',
    coachingFocusAreas: [],
    submissionRate: 100,
    activeDays: 20,
    missedDays: 0,
    improvingAfterSupport: false,
    isImproving: false,
    scoreVsPrevious: 0,
    month: '2026-06',
    computedAt: '2026-06-12T00:00:00.000Z',
  }
}

function makeAccountability(overrides: Partial<AccountabilityInsight> & { userId: string; displayName: string }): AccountabilityInsight {
  return {
    userId: overrides.userId,
    displayName: overrides.displayName,
    submissionRate: overrides.submissionRate ?? 100,
    missedDays: overrides.missedDays ?? 0,
    consistentUnderperformance: overrides.consistentUnderperformance ?? false,
    showingImprovement: overrides.showingImprovement ?? false,
    improvementStreak: overrides.improvementStreak ?? 0,
    needsOperationalSupport: overrides.needsOperationalSupport ?? false,
    supportDetail: overrides.supportDetail ?? '',
  }
}

function makeKpiBreakdown(overrides: Partial<Record<KpiKey, Partial<KpiScoreBreakdown>>> = {}): KpiScoreBreakdown[] {
  return KPI_KEYS.map((k) => {
    const o = overrides[k] ?? {}
    const actual = o.actual ?? 80
    const target = o.target ?? 100
    return {
      kpiKey: k,
      label: k,
      actual,
      target,
      achievementPct: o.achievementPct ?? (target > 0 ? Math.round((actual / target) * 100) : 0),
      status: o.status ?? 'warning',
      weight: o.weight ?? 0.2,
      weightedScore: o.weightedScore ?? 16,
    }
  })
}

function makeBranchSummary(overrides: {
  kpiBreakdown?: KpiScoreBreakdown[]
  overall?: number
  grade?: BranchExecutiveSummary['score']['grade']
  riskFlags?: BranchExecutiveSummary['riskProfile']['flags']
  riskLevel?: BranchExecutiveSummary['riskProfile']['riskLevel']
  direction?: BranchExecutiveSummary['trend']['direction']
} = {}): BranchExecutiveSummary {
  return {
    pharmacyId: 'branch-1',
    pharmacyName: 'صيدلية الأثير 5074',
    pharmacyCode: '5074',
    region: 'Riyadh',
    reportMonth: '2026-06',
    reportDate: '2026-06-12',
    score: {
      overall: overrides.overall ?? 72,
      grade: overrides.grade ?? 'C',
      kpiBreakdown: overrides.kpiBreakdown ?? makeKpiBreakdown(),
      adjustments: { submissionRate: 0, consistency: 0 },
    },
    weakestKpi: 'omni',
    strongestKpi: 'wasfaty',
    overallAchPct: 72,
    riskProfile: {
      pharmacyId: 'branch-1',
      riskLevel: overrides.riskLevel ?? 'MEDIUM_RISK',
      riskScore: 10,
      flags: overrides.riskFlags ?? [],
      criticalCount: 0,
      warningCount: 1,
    },
    trend: {
      pharmacyId: 'branch-1',
      overallMomentum: 2,
      direction: overrides.direction ?? 'STABLE',
      kpiTrends: [],
    },
    insights: [],
    recommendations: [],
    generatedAt: '2026-06-12T00:00:00.000Z',
  }
}

function makeTeamIntelligence(overrides: {
  pharmacistSummaries: PharmacistPerformanceSummary[]
  accountabilityInsights?: AccountabilityInsight[]
  topPerformerIds?: string[]
  atRiskMemberIds?: string[]
  improvingMemberIds?: string[]
}): TeamIntelligenceResult {
  return {
    pharmacyId: 'branch-1',
    month: '2026-06',
    generatedAt: '2026-06-12T00:00:00.000Z',
    pharmacistSummaries: overrides.pharmacistSummaries,
    teamHealth: {} as TeamIntelligenceResult['teamHealth'],
    coachingRecommendations: [],
    accountabilityInsights: overrides.accountabilityInsights ?? [],
    hasImmediateCoachingNeeds: false,
    teamOperationalRisk: 'low',
    topPerformer: overrides.topPerformerIds?.[0] ?? null,
    mostImproved: overrides.improvingMemberIds?.[0] ?? null,
    coachingFocusSummary: '',
    teamMomentum: { direction: 'stable', delta: 0, confidence: 1 },
    teamStability: { isStable: true, cv: 0, isPolarised: false, detail: '' },
    improvingMemberIds: overrides.improvingMemberIds ?? [],
    atRiskMemberIds: overrides.atRiskMemberIds ?? [],
    topPerformerIds: overrides.topPerformerIds ?? [],
    operationalStressDetected: false,
    teamKpiProfile: { strengths: [], weaknesses: [] },
    teamTrendSummary: {} as TeamIntelligenceResult['teamTrendSummary'],
  }
}

function makeBuilderInput(overrides: {
  branchSummary?: BranchExecutiveSummary
  teamIntelligence: TeamIntelligenceResult
  teamSize?: number
  branchRankSnapshot?: BranchIntelligenceBuilderInput['branchRankSnapshot']
  hasTargets?: boolean
}): BranchIntelligenceBuilderInput {
  return {
    branchSummary: overrides.branchSummary ?? makeBranchSummary(),
    teamIntelligence: overrides.teamIntelligence,
    teamSize: overrides.teamSize ?? overrides.teamIntelligence.pharmacistSummaries.length,
    branchRankSnapshot: overrides.branchRankSnapshot ?? null,
    metadata: {
      pharmacyId: 'branch-1',
      month: '2026-06',
      generatedAt: '2026-06-12T00:00:00.000Z',
      dataAvailability: {
        hasKpiEntries: overrides.teamIntelligence.pharmacistSummaries.length > 0,
        hasTargets: overrides.hasTargets ?? true,
        hasEvaluationResults: false,
        hasRankingSnapshot: !!overrides.branchRankSnapshot,
      },
    },
  }
}

// ════════════════════════════════════════════════════════════════
// Verification 1 — Rule 6 + optional Rule 5 (single-pharmacist branch)
// ════════════════════════════════════════════════════════════════

describe('Verification 1 — Rule 6 overrides Rules 1/2, optionally co-exists with Rule 5', () => {
  it('single-pharmacist branch with NO rank data → exactly 1 action (Rule 6 only)', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Solo', kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
    ]
    const breakdown = computeKpiContributionBreakdown(summaries, 'omni')
    const attribution = computeWeakKpiAttribution('omni', summaries, [])

    const inputs: SupervisorActionInputs = {
      focusKpi: 'omni',
      focusKpiAchievementPct: 39,
      focusKpiExpectedPct: 50,
      allKpiAchievementPct: { wasfaty: 80, omni: 39, wellness: 80, basket: 80, crossSelling: 80 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      pharmacistSummaries: summaries,
      accountabilityInsights: [],
      weakKpiAttribution: attribution,
      contributionByKpi: breakdown,
      branchActual: 39, branchTarget: 100,
      topPerformerId: null,
      branchRank: null,
    }

    const result = evaluateSupervisorActionRules(inputs)

    expect(result).toHaveLength(1)
    expect(result[0].cause).toContain('only one pharmacist')
    // No concentrated-gap or broad-gap action present
    expect(result.some((a) => a.cause.includes('primarily because'))).toBe(false)
    expect(result.some((a) => a.cause.includes('broad-based'))).toBe(false)
  })

  it('single-pharmacist branch WITH rank decline → Rule 6 + Rule 5, no Rule 1/2', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Solo', kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
    ]
    const breakdown = computeKpiContributionBreakdown(summaries, 'omni')
    const attribution = computeWeakKpiAttribution('omni', summaries, [])

    const inputs: SupervisorActionInputs = {
      focusKpi: 'omni',
      focusKpiAchievementPct: 39,
      focusKpiExpectedPct: 50,
      allKpiAchievementPct: { wasfaty: 80, omni: 39, wellness: 80, basket: 80, crossSelling: 80 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      pharmacistSummaries: summaries,
      accountabilityInsights: [],
      weakKpiAttribution: attribution,
      contributionByKpi: breakdown,
      branchActual: 39, branchTarget: 100,
      topPerformerId: null,
      branchRank: { currentRank: 5, previousRank: 3, rankMovement: 2, cohortSize: 18 },
    }

    const result = evaluateSupervisorActionRules(inputs)

    expect(result).toHaveLength(2)
    // Rule 6 present
    expect(result.some((a) => a.cause.includes('only one pharmacist'))).toBe(true)
    // Rule 5 present
    expect(result.some((a) => a.problem.includes('Branch rank dropped'))).toBe(true)
    // No Rule 1/2
    expect(result.some((a) => a.cause.includes('primarily because'))).toBe(false)
    expect(result.some((a) => a.cause.includes('broad-based'))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// Verification 2 — Branch=39, Median=58, Gap=19 → Rule 1
// ════════════════════════════════════════════════════════════════

describe('Verification 2 — Branch Achievement 39 / Median 58 / Gap 19 triggers Rule 1', () => {
  it('produces contributionGap = 19 and fires Rule 1 (concentrated), not Rule 2', () => {
    // 3 pharmacists for KPI 'omni'. We need:
    //   median(achievementPct) = 58
    //   average(achievementPct) (branch average proxy) = 39
    //   contributionGap = median - average = 58 - 39 = 19
    //
    // Choose: [10, 58, 90] (target=100 each)
    //   median  = 58
    //   average = (10+58+90)/3 = 52.666...
    // That gives gap = 58 - 52.67 = 5.33 — not 19. Need a different set.
    //
    // Solve directly: pick median = 58 (middle value of 3 = the middle entry),
    // and average = 39 → sum = 117.
    // middle entry = 58 → remaining two sum to 117 - 58 = 59.
    // Pick lowest = 5, highest = 54 (5 + 54 = 59, and 54 < 58 keeps 58 as median... wait
    // need highest >= median for 58 to be the median). Pick lowest=1, highest=58... no,
    // two entries can't both be 58 unless duplicated — fine, duplicates allowed.
    // lowest=1, middle=58, highest=58 → sorted [1,58,58], median=58, sum=117, avg=39. ✓
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: makeFullSnapshots('omni', 1,  1) }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: makeFullSnapshots('omni', 58, 58) }),
      makeSummary({ userId: 'u3', displayName: 'Khalid', kpiSnapshots: makeFullSnapshots('omni', 58, 58) }),
    ]

    const breakdown = computeKpiContributionBreakdown(summaries, 'omni')
    const attribution = computeWeakKpiAttribution('omni', summaries, [])

    // Verify the gap is exactly 19 as specified
    expect(attribution.contributionGap).toBeCloseTo(19, 1)
    expect(attribution.contributionGap).toBeGreaterThan(10)

    const inputs: SupervisorActionInputs = {
      focusKpi: 'omni',
      focusKpiAchievementPct: 39, // branch achievement = 39, per the scenario
      focusKpiExpectedPct: 50,    // behind pace
      allKpiAchievementPct: { wasfaty: 80, omni: 39, wellness: 80, basket: 80, crossSelling: 80 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      pharmacistSummaries: summaries,
      accountabilityInsights: [],
      weakKpiAttribution: attribution,
      contributionByKpi: breakdown,
      branchActual: 117, branchTarget: 300, // 117/300 = 39%
      topPerformerId: 'u2',
      branchRank: null,
    }

    const result = evaluateSupervisorActionRules(inputs)

    const rule1 = result.find((a) => a.cause.includes('primarily because'))
    const rule2 = result.find((a) => a.cause.includes('broad-based'))

    expect(rule1).toBeDefined()
    expect(rule2).toBeUndefined()
    expect(rule1!.severity).toBe('high')
    expect(rule1!.relatedPharmacists).toContain('u1') // Ahmed (1%) is the weakest contributor
  })
})

// ════════════════════════════════════════════════════════════════
// buildBranchIntelligenceViewModel
// ════════════════════════════════════════════════════════════════

describe('buildBranchIntelligenceViewModel', () => {
  it('builds a complete view model for a healthy multi-pharmacist branch', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  performanceScore: 92, strongestKpi: 'wasfaty', kpiSnapshots: makeFullSnapshots('omni', 80, 80) }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', performanceScore: 80, kpiSnapshots: makeFullSnapshots('omni', 75, 75) }),
      makeSummary({ userId: 'u3', displayName: 'Khalid', performanceScore: 70, kpiSnapshots: makeFullSnapshots('omni', 78, 78) }),
    ]
    const teamIntelligence = makeTeamIntelligence({
      pharmacistSummaries: summaries,
      topPerformerIds: ['u1'],
    })
    const branchSummary = makeBranchSummary({
      kpiBreakdown: makeKpiBreakdown({
        omni: { actual: 233, target: 300, achievementPct: 78 }, // 233/300 = 77.67 → all KPIs ~80%, on track
      }),
    })

    const input = makeBuilderInput({ branchSummary, teamIntelligence, teamSize: 3 })
    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.branchSummary.pharmacyName).toBe('صيدلية الأثير 5074')
    expect(vm.branchSummary.healthScore).toBe(72)
    expect(vm.branchSummary.healthGrade).toBe('C')
    expect(vm.branchSummary.teamSize).toBe(3)
    expect(vm.branchSummary.branchRank).toBeNull() // no snapshot provided

    expect(vm.kpiIntelligence.focusKpi).not.toBeNull()
    expect(vm.pharmacistRanking).toHaveLength(3)
    expect(vm.pharmacistRanking[0].userId).toBe('u1') // highest performanceScore
    expect(vm.pharmacistRanking[0].rank).toBe(1)
    expect(vm.pharmacistRanking[0].grade).toBe('A')

    // contributionByKpi has all 5 KPI_KEYS
    expect(Object.keys(vm.contributionByKpi).sort()).toEqual([...KPI_KEYS].sort())

    expect(vm.coachingOpportunities.topPerformer?.userId).toBe('u1')
    expect(vm.supervisorActions.length).toBeGreaterThan(0)
    expect(vm.metadata.pharmacyId).toBe('branch-1')
  })

  it('Rule 7 (no data) is reflected end-to-end when pharmacistSummaries is empty', () => {
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: [] })
    const branchSummary = makeBranchSummary()
    const input = makeBuilderInput({ branchSummary, teamIntelligence, teamSize: 0, hasTargets: true })

    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.pharmacistRanking).toEqual([])
    expect(vm.supervisorActions).toHaveLength(1)
    expect(vm.supervisorActions[0].problem).toContain('Insufficient data')
    expect(vm.warnings.some((w) => w.includes('No pharmacist KPI data'))).toBe(true)
    expect(vm.coachingOpportunities.topPerformer).toBeNull()
    expect(vm.coachingOpportunities.lowestContributor).toBeNull()
  })

  it('focusKpi = null when no KPI has a target > 0', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Solo', kpiSnapshots: KPI_KEYS.map((k) => makeSnapshot({ kpiKey: k, actual: 0, target: 0, achievementPct: 0 })) }),
    ]
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: summaries })
    const branchSummary = makeBranchSummary({
      kpiBreakdown: makeKpiBreakdown(
        Object.fromEntries(KPI_KEYS.map((k) => [k, { actual: 0, target: 0, achievementPct: 0 }])) as any,
      ),
    })
    const input = makeBuilderInput({ branchSummary, teamIntelligence, hasTargets: false })

    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.kpiIntelligence.focusKpi).toBeNull()
    expect(vm.weakKpiAttribution).toBeNull()
    expect(vm.supervisorActions).toHaveLength(1)
    expect(vm.supervisorActions[0].cause).toContain('No KPI with a target')
    expect(vm.warnings.some((w) => w.includes('No KPI with a target'))).toBe(true)
    expect(vm.warnings.some((w) => w.includes('No targets configured'))).toBe(true)
  })

  it('branchRank is populated end-to-end when a snapshot is provided, and Rule 5 fires on decline', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
      makeSummary({ userId: 'u2', displayName: 'Khalid', kpiSnapshots: makeFullSnapshots('omni', 18, 18) }),
      makeSummary({ userId: 'u3', displayName: 'Fatima', kpiSnapshots: makeFullSnapshots('omni', 85, 85) }),
    ]
    const teamIntelligence = makeTeamIntelligence({
      pharmacistSummaries: summaries,
      atRiskMemberIds: ['u2'],
      topPerformerIds: ['u3'],
    })
    const branchSummary = makeBranchSummary({
      kpiBreakdown: makeKpiBreakdown({ omni: { actual: 47, target: 120, achievementPct: 39 } }),
    })
    const input = makeBuilderInput({
      branchSummary, teamIntelligence,
      branchRankSnapshot: { currentRank: 4, previousRank: 3, rankMovement: 1, cohortSize: 18 },
    })

    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.branchSummary.branchRank).toEqual({ currentRank: 4, cohortSize: 18, rankMovement: 1 })
    expect(vm.warnings.some((w) => w.includes('Branch ranking not yet calculated'))).toBe(false)
    expect(vm.supervisorActions.some((a) => a.problem.includes('Branch rank dropped from #3 to #4'))).toBe(true)
  })

  it('forecastPct is null with a warning when no FORECAST risk flag exists', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots('omni', 80, 80) }),
    ]
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: summaries })
    const branchSummary = makeBranchSummary({ riskFlags: [] })
    const input = makeBuilderInput({ branchSummary, teamIntelligence })

    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.branchSummary.forecastPct).toBeNull()
    expect(vm.warnings.some((w) => w.includes('No forecast data available'))).toBe(true)
  })

  it('forecastPct is populated from a FORECAST risk flag for the focus KPI', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
    ]
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: summaries })
    const branchSummary = makeBranchSummary({
      kpiBreakdown: makeKpiBreakdown({ omni: { actual: 39, target: 100, achievementPct: 39 } }),
      riskFlags: [
        { category: 'FORECAST', severity: 'HIGH', kpiKey: 'omni', description: 'omni projected at 45% by month end', value: 45, threshold: 60 },
      ],
    })
    const input = makeBuilderInput({ branchSummary, teamIntelligence })

    const vm = buildBranchIntelligenceViewModel(input)

    expect(vm.branchSummary.forecastPct).toBe(45)
    expect(vm.warnings.some((w) => w.includes('No forecast data available'))).toBe(false)
  })

  it('does not mutate its input', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
      makeSummary({ userId: 'u2', displayName: 'Khalid', kpiSnapshots: makeFullSnapshots('omni', 18, 18) }),
    ]
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: summaries })
    const input = makeBuilderInput({ teamIntelligence })
    const snapshot = JSON.parse(JSON.stringify(input))

    buildBranchIntelligenceViewModel(input)

    expect(input).toEqual(snapshot)
  })

  it('is deterministic — same input produces identical output', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: makeFullSnapshots('omni', 39, 39) }),
      makeSummary({ userId: 'u2', displayName: 'Khalid', kpiSnapshots: makeFullSnapshots('omni', 18, 18) }),
      makeSummary({ userId: 'u3', displayName: 'Fatima', kpiSnapshots: makeFullSnapshots('omni', 85, 85) }),
    ]
    const teamIntelligence = makeTeamIntelligence({ pharmacistSummaries: summaries, atRiskMemberIds: ['u2'], topPerformerIds: ['u3'] })
    const input = makeBuilderInput({ teamIntelligence })

    const vm1 = buildBranchIntelligenceViewModel(input)
    const vm2 = buildBranchIntelligenceViewModel(input)

    expect(vm1).toEqual(vm2)
  })
})
