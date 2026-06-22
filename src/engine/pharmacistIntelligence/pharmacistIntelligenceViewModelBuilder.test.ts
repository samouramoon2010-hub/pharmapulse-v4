// ============================================================
// Pharmacist Intelligence — ViewModel Builder Tests
// Phase 5C-2
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildPharmacistIntelligenceViewModel } from './pharmacistIntelligenceViewModelBuilder'
import type { PharmacistIntelligenceBuilderInput } from './pharmacistIntelligenceViewModelBuilder'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
  KpiSnapshot,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import type { KpiContributionEntry } from '../branchIntelligence/branchIntelligenceTypes'

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

function makeFullSnapshots(overrides: Partial<Record<KpiKey, Partial<KpiSnapshot>>> = {}): KpiSnapshot[] {
  return KPI_KEYS.map((k) =>
    makeSnapshot({ kpiKey: k, actual: 80, target: 100, achievementPct: 80, paceStatus: 'on_track', ...(overrides[k] ?? {}) }),
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
  submissionRate?: number
  activeDays?: number
  missedDays?: number
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
    overallAchPct: overrides.performanceScore ?? 70,
    operationalRisk: overrides.operationalRisk ?? 'none',
    coachingPriority: 'routine',
    coachingFocusAreas: [],
    submissionRate: overrides.submissionRate ?? 100,
    activeDays: overrides.activeDays ?? 20,
    missedDays: overrides.missedDays ?? 0,
    improvingAfterSupport: false,
    isImproving: false,
    scoreVsPrevious: 0,
    month: '2026-06',
    computedAt: '2026-06-12T00:00:00.000Z',
  }
}

function makeContributionEntry(overrides: Partial<KpiContributionEntry> & { pharmacistId: string }): KpiContributionEntry {
  return {
    pharmacistId: overrides.pharmacistId,
    pharmacistName: overrides.pharmacistName ?? 'Pharmacist',
    actual: overrides.actual ?? 0,
    target: overrides.target ?? 100,
    achievementPct: overrides.achievementPct ?? 0,
    contributionPct: overrides.contributionPct ?? 0,
    contributionRank: overrides.contributionRank ?? 1,
    isLowestContributor: overrides.isLowestContributor ?? false,
    isTopContributor: overrides.isTopContributor ?? false,
    paceStatus: overrides.paceStatus ?? 'on_track',
  }
}

function makeAccountabilityInsight(overrides: Partial<AccountabilityInsight> & { userId: string; displayName: string }): AccountabilityInsight {
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

const FULL_EXPECTED_PACE = {
  kpiExpectedPct: Object.fromEntries(KPI_KEYS.map((k) => [k, 50])) as Record<KpiKey, number>,
}

function baseInput(overrides: Partial<PharmacistIntelligenceBuilderInput> = {}): PharmacistIntelligenceBuilderInput {
  const summary = overrides.summary ?? makeSummary({
    userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots(),
  })
  return {
    user: { userId: 'u1', displayName: 'Ahmed', employeeId: 'EMP-001', pharmacyId: 'branch-1' },
    pharmacy: { pharmacyId: 'branch-1', name: 'صيدلية الأثير 5074', code: '5074', region: 'Riyadh' },
    summary,
    contributionByKpi: null,
    branchPharmacistRanking: null,
    accountabilityInsight: null,
    companyWideRankingSnapshot: null,
    officialEvaluationResult: null,
    expectedPace: FULL_EXPECTED_PACE,
    focusKpiParam: null,
    metadata: {
      branchId: 'branch-1',
      month: '2026-06',
      generatedAt: '2026-06-12T00:00:00.000Z',
      dataAvailability: {
        hasKpiEntries: true,
        hasTargets: true,
        hasBranchContext: false,
        hasCompanyWideRanking: false,
        hasEvaluationResult: false,
      },
    },
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// Identity
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — identity', () => {
  it('assembles identity from user + pharmacy docs', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.identity).toEqual({
      userId: 'u1',
      displayName: 'Ahmed',
      employeeId: 'EMP-001',
      pharmacyId: 'branch-1',
      pharmacyName: 'صيدلية الأثير 5074',
      pharmacyCode: '5074',
      region: 'Riyadh',
      supervisorGroup: null,
    })
  })

  it('employeeId is null when empty string, with a warning', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      user: { userId: 'u1', displayName: 'Ahmed', employeeId: '', pharmacyId: 'branch-1' },
    }))
    expect(vm.identity.employeeId).toBeNull()
    expect(vm.warnings.some((w) => w.includes('Employee ID not set'))).toBe(true)
  })

  it('employeeId is null when undefined (not present on user doc)', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      user: { userId: 'u1', displayName: 'Ahmed', pharmacyId: 'branch-1' },
    }))
    expect(vm.identity.employeeId).toBeNull()
  })

  it('pharmacy=null falls back to pharmacyId for name/code, region=null, with a warning', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ pharmacy: null }))
    expect(vm.identity.pharmacyName).toBe('branch-1')
    expect(vm.identity.pharmacyCode).toBe('branch-1')
    expect(vm.identity.region).toBeNull()
    expect(vm.warnings.some((w) => w.includes('Pharmacy details unavailable'))).toBe(true)
  })

  it('supervisorGroup is ALWAYS null (no supervisor field exists)', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.identity.supervisorGroup).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// Performance Summary
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — performanceSummary', () => {
  it('performanceScore/grade/operationalRisk/momentum passthrough', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots(),
      performanceScore: 92, operationalRisk: 'low', momentumDirection: 'improving', momentumDelta: 4.2,
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary }))
    expect(vm.performanceSummary.performanceScore).toBe(92)
    expect(vm.performanceSummary.grade).toBe('A')
    expect(vm.performanceSummary.operationalRisk).toBe('low')
    expect(vm.performanceSummary.momentumDirection).toBe('improving')
    expect(vm.performanceSummary.momentumDelta).toBe(4.2)
  })

  it('officialRating populated when officialEvaluationResult is supplied', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      officialEvaluationResult: { finalScore: 88, rating: 'B+' },
      metadata: { ...baseInput().metadata, dataAvailability: { ...baseInput().metadata.dataAvailability, hasEvaluationResult: true } },
    }))
    expect(vm.performanceSummary.officialRating).toEqual({ finalScore: 88, rating: 'B+' })
  })

  it('officialRating absent and warning added when no evaluation result exists', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.performanceSummary.officialRating).toBeUndefined()
    expect(vm.warnings.some((w) => w.includes('No official evaluation result'))).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// KPI Breakdown / Strengths & Weaknesses (Selector reuse)
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — kpiBreakdown & strengthsWeaknesses', () => {
  it('kpiBreakdown has all 5 KPIs with expectedPct from expectedPace', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.kpiBreakdown).toHaveLength(5)
    expect(vm.kpiBreakdown.every((e) => e.expectedPct === 50)).toBe(true)
  })

  it('warning when expectedPace is null, expectedPct null for all KPIs', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ expectedPace: null }))
    expect(vm.kpiBreakdown.every((e) => e.expectedPct === null)).toBe(true)
    expect(vm.warnings.some((w) => w.includes('Expected-pace data unavailable'))).toBe(true)
  })

  it('warning when contributionByKpi is null, contributionPct/Rank null for all KPIs', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ contributionByKpi: null }))
    expect(vm.kpiBreakdown.every((e) => e.contributionPct === null && e.contributionRank === null)).toBe(true)
    expect(vm.warnings.some((w) => w.includes('Branch contribution data unavailable'))).toBe(true)
  })

  it('contributionPct/Rank populated when contributionByKpi supplied', () => {
    const contributionByKpi = {
      omni: [makeContributionEntry({ pharmacistId: 'u1', contributionPct: 42, contributionRank: 2, actual: 39, target: 100 })],
    } as Record<KpiKey, KpiContributionEntry[]>
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ contributionByKpi }))
    const omni = vm.kpiBreakdown.find((e) => e.kpiKey === 'omni')!
    expect(omni.contributionPct).toBe(42)
    expect(omni.contributionRank).toBe(2)
  })

  it('strengthsWeaknesses reflects paceStatus-based selector output', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({
        wasfaty: { paceStatus: 'achieved', achievementPct: 100 },
        omni:    { paceStatus: 'critical', achievementPct: 18, remaining: 82 },
      }),
      momentumDirection: 'cooling', momentumDelta: -3.1,
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary }))
    expect(vm.strengthsWeaknesses.topStrengths).toContain('wasfaty')
    expect(vm.strengthsWeaknesses.weakestKpis).toContain('omni')
    expect(vm.strengthsWeaknesses.biggestOpportunity).toBe('omni')
    expect(vm.strengthsWeaknesses.overallMomentum).toEqual({ direction: 'cooling', delta: -3.1 })
  })

  it('no per-KPI trend field exists anywhere on strengthsWeaknesses', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.strengthsWeaknesses).not.toHaveProperty('kpiTrends')
    expect(vm.strengthsWeaknesses).not.toHaveProperty('perKpiMomentum')
  })
})

// ════════════════════════════════════════════════════════════════
// Ranking Context
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — rankingContext', () => {
  it('branchRank populated when branchPharmacistRanking supplied and userId found', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      branchPharmacistRanking: [{ userId: 'u2', rank: 1 }, { userId: 'u1', rank: 2 }],
    }))
    expect(vm.rankingContext.branchRank).toEqual({ rank: 2, cohortSize: 2 })
  })

  it('branchRank null + warning when branchPharmacistRanking is null', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ branchPharmacistRanking: null }))
    expect(vm.rankingContext.branchRank).toBeNull()
    expect(vm.warnings.some((w) => w.includes('Branch pharmacist ranking unavailable'))).toBe(true)
  })

  it('branchRank null + mismatch warning when ranking supplied but userId not found', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      branchPharmacistRanking: [{ userId: 'someone-else', rank: 1 }],
    }))
    expect(vm.rankingContext.branchRank).toBeNull()
    expect(vm.warnings.some((w) => w.includes('userId mismatch'))).toBe(true)
  })

  it('companyWideRank populated from snapshot; warning when absent and not yet calculated', () => {
    const withSnapshot = buildPharmacistIntelligenceViewModel(baseInput({
      companyWideRankingSnapshot: { currentRank: 12, cohortSize: 240 },
      metadata: { ...baseInput().metadata, dataAvailability: { ...baseInput().metadata.dataAvailability, hasCompanyWideRanking: true } },
    }))
    expect(withSnapshot.rankingContext.companyWideRank).toEqual({ rank: 12, cohortSize: 240 })
    expect(withSnapshot.warnings.some((w) => w.includes('Company-wide ranking not yet calculated'))).toBe(false)

    const without = buildPharmacistIntelligenceViewModel(baseInput())
    expect(without.rankingContext.companyWideRank).toBeNull()
    expect(without.warnings.some((w) => w.includes('Company-wide ranking not yet calculated'))).toBe(true)
  })

  it('supervisorGroupRank and regionalRank are ALWAYS null regardless of all other inputs', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      branchPharmacistRanking: [{ userId: 'u1', rank: 1 }],
      companyWideRankingSnapshot: { currentRank: 1, cohortSize: 1 },
    }))
    expect(vm.rankingContext.supervisorGroupRank).toBeNull()
    expect(vm.rankingContext.regionalRank).toBeNull()
  })

  it('single-pharmacist branch: rank=1, cohortSize=1', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({
      branchPharmacistRanking: [{ userId: 'u1', rank: 1 }],
    }))
    expect(vm.rankingContext.branchRank).toEqual({ rank: 1, cohortSize: 1 })
  })
})

// ════════════════════════════════════════════════════════════════
// Contribution Context
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — contributionContext', () => {
  it('empty when contributionByKpi is null', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ contributionByKpi: null }))
    expect(vm.contributionContext).toEqual([])
  })

  it('populated per KPI when contributionByKpi supplied', () => {
    const contributionByKpi = {
      omni: [
        makeContributionEntry({ pharmacistId: 'u1', actual: 72, contributionPct: 34.3, contributionRank: 2 }),
        makeContributionEntry({ pharmacistId: 'u2', actual: 138, contributionPct: 65.7, contributionRank: 1 }),
      ],
    } as Record<KpiKey, KpiContributionEntry[]>
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ contributionByKpi }))
    expect(vm.contributionContext).toEqual([
      { kpiKey: 'omni', branchTotal: 210, pharmacistActual: 72, contributionPct: 34.3, contributionRank: 2 },
    ])
  })
})

// ════════════════════════════════════════════════════════════════
// Accountability
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — accountability', () => {
  it('null + warning when no AccountabilityInsight found', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ accountabilityInsight: null }))
    expect(vm.accountability).toBeNull()
    expect(vm.warnings.some((w) => w.includes('No accountability data found'))).toBe(true)
  })

  it('populated from AccountabilityInsight + summary activity fields', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots(),
      activeDays: 16, missedDays: 4,
    })
    const insight = makeAccountabilityInsight({
      userId: 'u1', displayName: 'Ahmed', submissionRate: 80, missedDays: 4,
      improvementStreak: 2, consistentUnderperformance: false, needsOperationalSupport: true,
      supportDetail: 'Submitted 16/20 days this month.',
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, accountabilityInsight: insight }))
    expect(vm.accountability).toEqual({
      activeDays: 16,
      expectedSubmissionDays: 20, // activeDays + missedDays
      submissionRate: 80,
      missedDays: 4,
      improvementStreak: 2,
      consistentUnderperformance: false,
      needsOperationalSupport: true,
      supportDetail: 'Submitted 16/20 days this month.',
    })
  })

  it('guards against undefined/NaN summary.activeDays/missedDays and accountabilityInsight fields — falls back to 0, never NaN/undefined', () => {
    // Simulate a caller that omits actualSubmissionDays/expectedSubmissionDays
    // on PharmacistInput (the Phase 5C-6 self-mode bug): summary.activeDays
    // and summary.missedDays come back undefined/NaN from
    // computePharmacistPerformance in that case.
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots(),
    })
    // Force the undefined/NaN condition directly on the summary object,
    // mirroring what computePharmacistPerformance returns when
    // actualSubmissionDays/expectedSubmissionDays are undefined.
    ;(summary as any).activeDays = undefined
    ;(summary as any).missedDays = NaN

    const insight = makeAccountabilityInsight({
      userId: 'u1', displayName: 'Ahmed',
      submissionRate: NaN, missedDays: undefined as any,
      improvementStreak: undefined as any,
    })

    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, accountabilityInsight: insight }))
    expect(vm.accountability).not.toBeNull()
    expect(vm.accountability!.activeDays).toBe(0)
    expect(vm.accountability!.missedDays).toBe(0)
    expect(vm.accountability!.expectedSubmissionDays).toBe(0)
    expect(vm.accountability!.submissionRate).toBe(0)
    expect(vm.accountability!.improvementStreak).toBe(0)
    // No field is NaN or undefined
    for (const [key, value] of Object.entries(vm.accountability!)) {
      if (typeof value === 'number') {
        expect(Number.isNaN(value), `${key} should not be NaN`).toBe(false)
      }
      expect(value, `${key} should not be undefined`).not.toBeUndefined()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// Coaching
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — coaching', () => {
  it('coaching is the direct output of buildCoachingRecommendations(summary)', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({ omni: { achievementPct: 18, paceStatus: 'critical' } }),
      weakestKpi: 'omni', performanceScore: 39,
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary }))
    expect(vm.coaching.length).toBeGreaterThan(0)
    expect(vm.coaching.some((c) => c.kpiKey === 'omni')).toBe(true)
  })

  it('recognition-only coaching when performanceScore >= 90', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots(), performanceScore: 95,
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary }))
    expect(vm.coaching).toHaveLength(1)
    expect(vm.coaching[0].priority).toBe('recognition')
  })
})

// ════════════════════════════════════════════════════════════════
// Supervisor Actions / focusKpi resolution / metadata
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — supervisorActions & focusKpi', () => {
  it('Rule P1 fires for weakest KPI behind expected pace; metadata.focusKpi = weakestKpi', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({ omni: { achievementPct: 47, paceStatus: 'behind', actual: 47, target: 100, remaining: 53, requiredPerDay: 3 } }),
      weakestKpi: 'omni', performanceScore: 70,
    })
    const expectedPace = { kpiExpectedPct: Object.fromEntries(KPI_KEYS.map((k) => [k, k === 'omni' ? 62 : 50])) as Record<KpiKey, number> }
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, expectedPace }))
    const p1 = vm.supervisorActions.find((a) => a.severity === 'high')
    expect(p1).toBeDefined()
    expect(p1!.cause).toContain('47%')
    expect(p1!.cause).toContain('62%')
    expect(vm.metadata.focusKpi).toBe('omni')
  })

  it('focusKpiParam used when it has target > 0', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({
        omni:    { achievementPct: 47, paceStatus: 'behind' },
        wellness:{ achievementPct: 30, paceStatus: 'critical' },
      }),
      weakestKpi: 'wellness',
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, focusKpiParam: 'omni' }))
    expect(vm.metadata.focusKpi).toBe('omni')
  })

  it('focusKpiParam with target=0 falls back to weakestKpi, with a warning', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({
        wasfaty: { target: 0, actual: 0, achievementPct: 0, paceStatus: 'achieved' },
        omni:    { achievementPct: 18, paceStatus: 'critical', target: 100 },
      }),
      weakestKpi: 'omni',
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, focusKpiParam: 'wasfaty' }))
    expect(vm.metadata.focusKpi).toBe('omni')
    expect(vm.warnings.some((w) => w.includes('focusKpi "wasfaty" has no target'))).toBe(true)
  })

  it('Rule P4 (no data) fires and metadata.focusKpi is null when all KPIs have target=0', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: KPI_KEYS.map((k) => makeSnapshot({ kpiKey: k, actual: 0, target: 0, achievementPct: 0, paceStatus: 'achieved' })),
      weakestKpi: 'omni',
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary }))
    expect(vm.metadata.focusKpi).toBeNull()
    expect(vm.supervisorActions).toHaveLength(1)
    expect(vm.supervisorActions[0].problem).toContain('Insufficient data')
  })

  it('Rule P2 co-exists with P1 when accountability flags needsOperationalSupport', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({ omni: { achievementPct: 18, paceStatus: 'critical', actual: 18, target: 100 } }),
      weakestKpi: 'omni', performanceScore: 39,
    })
    const expectedPace = { kpiExpectedPct: Object.fromEntries(KPI_KEYS.map((k) => [k, 58])) as Record<KpiKey, number> }
    const insight = makeAccountabilityInsight({
      userId: 'u1', displayName: 'Ahmed', needsOperationalSupport: true, supportDetail: 'Submitted 8/20 days.',
    })
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, expectedPace, accountabilityInsight: insight }))
    const p1 = vm.supervisorActions.find((a) => a.severity === 'high')
    const p2 = vm.supervisorActions.find((a) => a.severity === 'medium')
    expect(p1).toBeDefined()
    expect(p2).toBeDefined()
    expect(p2!.cause).toBe('Submitted 8/20 days.')
  })

  it('expectedImpact attached to P1 when applicable, end-to-end', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({ omni: { achievementPct: 18, paceStatus: 'critical', actual: 18, target: 100, remaining: 82 } }),
      weakestKpi: 'omni', performanceScore: 39,
    })
    const expectedPace = { kpiExpectedPct: Object.fromEntries(KPI_KEYS.map((k) => [k, 58])) as Record<KpiKey, number> }
    const vm = buildPharmacistIntelligenceViewModel(baseInput({ summary, expectedPace }))
    const p1 = vm.supervisorActions.find((a) => a.severity === 'high')
    expect(p1!.expectedImpact).not.toBeNull()
    // omni weight = 0.20; gap = 58-18 = 40; scoreDelta = 8; 39+8=47
    expect(p1!.expectedImpact!.impactDeltaPts).toBe(8)
  })
})

// ════════════════════════════════════════════════════════════════
// Metadata & general
// ════════════════════════════════════════════════════════════════

describe('buildPharmacistIntelligenceViewModel — metadata & purity', () => {
  it('metadata passthrough fields (userId/branchId/month/generatedAt/dataAvailability)', () => {
    const vm = buildPharmacistIntelligenceViewModel(baseInput())
    expect(vm.metadata.userId).toBe('u1')
    expect(vm.metadata.branchId).toBe('branch-1')
    expect(vm.metadata.month).toBe('2026-06')
    expect(vm.metadata.generatedAt).toBe('2026-06-12T00:00:00.000Z')
    expect(vm.metadata.dataAvailability.hasKpiEntries).toBe(true)
  })

  it('does not mutate input', () => {
    const input = baseInput({
      contributionByKpi: { omni: [makeContributionEntry({ pharmacistId: 'u1', actual: 10 })] } as Record<KpiKey, KpiContributionEntry[]>,
      branchPharmacistRanking: [{ userId: 'u1', rank: 1 }],
      accountabilityInsight: makeAccountabilityInsight({ userId: 'u1', displayName: 'Ahmed' }),
    })
    const snapshot = JSON.parse(JSON.stringify(input))
    buildPharmacistIntelligenceViewModel(input)
    expect(input).toEqual(snapshot)
  })

  it('is deterministic — same input produces identical output (excluding coachingEngine\'s internal recId counter)', () => {
    const input = baseInput()
    const vm1 = buildPharmacistIntelligenceViewModel(input)
    const vm2 = buildPharmacistIntelligenceViewModel(input)
    // coachingEngine.buildCoachingRecommendations generates `id: rec-${Date.now()}-${counter}`
    // internally — a pre-existing non-determinism in Team Intelligence,
    // out of scope for this builder (Phase 5C-2 does not modify
    // Team Intelligence). Strip `id` before comparing.
    const strip = (vm: typeof vm1) => ({ ...vm, coaching: vm.coaching.map(({ id, ...rest }) => rest) })
    expect(strip(vm1)).toEqual(strip(vm2))
  })
})
