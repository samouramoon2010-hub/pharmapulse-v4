// ============================================================
// Branch Intelligence — Pure Selector Tests
// Phase 4A
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeKpiContributionBreakdown,
  computeWeakKpiAttribution,
  buildWeakKpiExplanation,
  computeExpectedImpact,
  evaluateSupervisorActionRules,
  type SupervisorActionInputs,
} from './branchIntelligenceSelectors'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
  KpiSnapshot,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import type { KpiContributionEntry } from './branchIntelligenceTypes'

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

// ════════════════════════════════════════════════════════════════
// Selector 1 — computeKpiContributionBreakdown
// ════════════════════════════════════════════════════════════════

describe('computeKpiContributionBreakdown', () => {
  it('returns empty array for empty input', () => {
    expect(computeKpiContributionBreakdown([], 'omni')).toEqual([])
  })

  it('contributionPct sums to approximately 100 across pharmacists', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 300, target: 1000 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 700, target: 1000 })] }),
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const total = result.reduce((s, e) => s + e.contributionPct, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('ranks by achievementPct DESC, not raw actual', () => {
    // u1 has higher actual but lower achievementPct (bigger target)
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 500, target: 2000 })] }), // 25%
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 300, target: 400 })] }),  // 75%
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const fatima = result.find((e) => e.pharmacistId === 'u2')!
    const ahmed  = result.find((e) => e.pharmacistId === 'u1')!
    expect(fatima.contributionRank).toBe(1)
    expect(ahmed.contributionRank).toBe(2)
  })

  it('flags the single top contributor (highest achievementPct, target > 0)', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100 })] }),  // 90%
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 40, target: 100 })] }),  // 40%
      makeSummary({ userId: 'u3', displayName: 'Omar',   kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 30, target: 100 })] }),  // 30%
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const topFlags = result.filter((e) => e.isTopContributor)
    expect(topFlags).toHaveLength(1)
    expect(topFlags[0].pharmacistId).toBe('u1')
  })

  it('team size <= 4: flags exactly the bottom 1 as lowest contributor', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100 })] }),  // 90%
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 60, target: 100 })] }),  // 60%
      makeSummary({ userId: 'u3', displayName: 'Omar',   kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 20, target: 100 })] }),  // 20% lowest
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const lowest = result.filter((e) => e.isLowestContributor)
    expect(lowest).toHaveLength(1)
    expect(lowest[0].pharmacistId).toBe('u3')
  })

  it('team size > 4: flags exactly the bottom 2 as lowest contributors', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 95, target: 100 })] }), // 95%
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 80, target: 100 })] }), // 80%
      makeSummary({ userId: 'u3', displayName: 'C', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 60, target: 100 })] }), // 60%
      makeSummary({ userId: 'u4', displayName: 'D', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 30, target: 100 })] }), // 30% — lowest
      makeSummary({ userId: 'u5', displayName: 'E', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 10, target: 100 })] }), // 10% — lowest
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const lowest = result.filter((e) => e.isLowestContributor)
    expect(lowest).toHaveLength(2)
    expect(lowest.map((e) => e.pharmacistId).sort()).toEqual(['u4', 'u5'])
  })

  it('entries with target = 0 are never flagged top or lowest', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 0, achievementPct: 0 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 50, target: 100 })] }), // 50%
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    const u1 = result.find((e) => e.pharmacistId === 'u1')!
    expect(u1.isTopContributor).toBe(false)
    expect(u1.isLowestContributor).toBe(false)
  })

  it('totalActual = 0 → all contributionPct are 0 (no divide-by-zero)', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 100, achievementPct: 0 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 100, achievementPct: 0 })] }),
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    expect(result.every((e) => e.contributionPct === 0)).toBe(true)
  })

  it('does not mutate the input array', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 50, target: 100 })] }),
    ]
    const snapshot = JSON.parse(JSON.stringify(summaries))
    computeKpiContributionBreakdown(summaries, 'omni')
    expect(summaries).toEqual(snapshot)
  })

  it('single-pharmacist branch: same entry is both top and lowest contributor', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Solo', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 50, target: 100 })] }),
    ]
    const result = computeKpiContributionBreakdown(summaries, 'omni')
    expect(result[0].isTopContributor).toBe(true)
    expect(result[0].isLowestContributor).toBe(true)
    expect(result[0].contributionPct).toBeCloseTo(100, 1)
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 2 — computeWeakKpiAttribution
// ════════════════════════════════════════════════════════════════

describe('computeWeakKpiAttribution', () => {
  it('contributionGap > 10 → "concentrated" explanation', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100 })] }), // 90%
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100 })] }), // 85%
      makeSummary({ userId: 'u3', displayName: 'C', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 10, target: 100 })] }), // 10% — outlier
    ]
    const result = computeWeakKpiAttribution('omni', summaries, [])
    expect(result.contributionGap).toBeGreaterThan(10)
    expect(result.explanation).toContain('primarily because')
    expect(result.explanation).toContain('C (10%)')
  })

  it('contributionGap <= 10 → "broad" explanation', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 45, target: 100 })] }), // 45%
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 50, target: 100 })] }), // 50%
      makeSummary({ userId: 'u3', displayName: 'C', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 40, target: 100 })] }), // 40% — lowest
    ]
    const result = computeWeakKpiAttribution('omni', summaries, [])
    expect(result.contributionGap).toBeLessThanOrEqual(10)
    expect(result.explanation).toContain('across most of the team')
  })

  it('accountability flags correctly join by userId (only weakest pharmacists)', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100 })] }), // 90%
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100 })] }), // 85%
      makeSummary({ userId: 'u3', displayName: 'C', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 10, target: 100 })] }), // 10% — weakest
    ]
    const insights = [
      makeAccountability({ userId: 'u1', displayName: 'A', needsOperationalSupport: true, supportDetail: 'A needs support' }),
      makeAccountability({ userId: 'u3', displayName: 'C', needsOperationalSupport: true, supportDetail: 'C submitted 8/20 days' }),
    ]
    const result = computeWeakKpiAttribution('omni', summaries, insights)
    // u1 is NOT in weakestPharmacists, so its flag must not appear
    expect(result.accountabilityFlags.find((f) => f.userId === 'u1')).toBeUndefined()
    // u3 IS in weakestPharmacists, so its flag must appear
    const u3flag = result.accountabilityFlags.find((f) => f.userId === 'u3')
    expect(u3flag).toBeDefined()
    expect(u3flag?.flag).toBe('needsOperationalSupport')
    expect(u3flag?.detail).toBe('C submitted 8/20 days')
  })

  it('accountabilityFlags includes both flag types when both are true for the same user', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100 })] }),
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 10, target: 100 })] }), // weakest
    ]
    const insights = [
      makeAccountability({
        userId: 'u2', displayName: 'B',
        needsOperationalSupport: true,
        consistentUnderperformance: true,
        supportDetail: 'B is struggling',
      }),
    ]
    const result = computeWeakKpiAttribution('omni', summaries, insights)
    const flags = result.accountabilityFlags.filter((f) => f.userId === 'u2')
    expect(flags.map((f) => f.flag).sort()).toEqual(['consistentUnderperformance', 'needsOperationalSupport'])
  })

  it('no weakest pharmacist (zero target) → safe "no individual" explanation', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 0, achievementPct: 0 })] }),
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 0, achievementPct: 0 })] }),
    ]
    const result = computeWeakKpiAttribution('omni', summaries, [])
    expect(result.weakestPharmacists).toEqual([])
    expect(result.explanation).toContain('no individual pharmacist is significantly below')
  })
})

describe('buildWeakKpiExplanation', () => {
  it('handles all three branches directly', () => {
    expect(buildWeakKpiExplanation('omni', [], 5))
      .toBe('omni is behind pace, but no individual pharmacist is significantly below the team.')

    const contributors = [{ userId: 'u1', displayName: 'Ahmed', achievementPct: 18, paceStatus: 'critical' as const }]

    expect(buildWeakKpiExplanation('omni', contributors, 15))
      .toBe('omni is behind pace primarily because 1 pharmacist(s) are below expected pace: Ahmed (18%).')

    expect(buildWeakKpiExplanation('omni', contributors, 5))
      .toBe('omni is behind pace across most of the team, including Ahmed (18%).')
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 3 — computeExpectedImpact
// ════════════════════════════════════════════════════════════════

describe('computeExpectedImpact', () => {
  it('computes correct projectedBranchPct and impactDeltaPts', () => {
    // 3 pharmacists, target 100 each, branch target 300
    const breakdown: KpiContributionEntry[] = [
      { pharmacistId: 'u1', pharmacistName: 'A', actual: 90, target: 100, achievementPct: 90, contributionPct: 50, contributionRank: 1, isLowestContributor: false, isTopContributor: true,  paceStatus: 'ahead' },
      { pharmacistId: 'u2', pharmacistName: 'B', actual: 80, target: 100, achievementPct: 80, contributionPct: 44, contributionRank: 2, isLowestContributor: false, isTopContributor: false, paceStatus: 'on_track' },
      { pharmacistId: 'u3', pharmacistName: 'C', actual: 10, target: 100, achievementPct: 10, contributionPct: 6,  contributionRank: 3, isLowestContributor: true,  isTopContributor: false, paceStatus: 'critical' },
    ]
    // branchActual = 90+80+10 = 180, branchTarget = 300 → currentBranchPct = 60
    // median(achievementPct) = median(90,80,10) = 80
    // uplift for C: upliftPct = max(0, 80-10) = 70 → upliftActual = 0.70 * 100 = 70
    // newBranchActual = 180 + 70 = 250 → projectedBranchPct = 250/300*100 = 83.3
    // impactDeltaPts = 83.3 - 60 = 23.3
    const result = computeExpectedImpact(breakdown, 180, 300)
    expect(result).not.toBeNull()
    expect(result!.currentBranchPct).toBeCloseTo(60, 1)
    expect(result!.projectedBranchPct).toBeCloseTo(83.3, 1)
    expect(result!.impactDeltaPts).toBeCloseTo(23.3, 1)
    expect(result!.scenario).toContain('C')
  })

  it('returns null when branchTarget <= 0', () => {
    const breakdown: KpiContributionEntry[] = [
      { pharmacistId: 'u1', pharmacistName: 'A', actual: 10, target: 100, achievementPct: 10, contributionPct: 50, contributionRank: 1, isLowestContributor: true, isTopContributor: false, paceStatus: 'critical' },
      { pharmacistId: 'u2', pharmacistName: 'B', actual: 50, target: 100, achievementPct: 50, contributionPct: 50, contributionRank: 2, isLowestContributor: false, isTopContributor: true, paceStatus: 'on_track' },
    ]
    expect(computeExpectedImpact(breakdown, 60, 0)).toBeNull()
    expect(computeExpectedImpact(breakdown, 60, -10)).toBeNull()
  })

  it('returns null for single-pharmacist branches', () => {
    const breakdown: KpiContributionEntry[] = [
      { pharmacistId: 'u1', pharmacistName: 'Solo', actual: 10, target: 100, achievementPct: 10, contributionPct: 100, contributionRank: 1, isLowestContributor: true, isTopContributor: true, paceStatus: 'critical' },
    ]
    expect(computeExpectedImpact(breakdown, 10, 100)).toBeNull()
  })

  it('returns null when there are no lowest contributors', () => {
    const breakdown: KpiContributionEntry[] = [
      { pharmacistId: 'u1', pharmacistName: 'A', actual: 50, target: 0, achievementPct: 0, contributionPct: 50, contributionRank: 1, isLowestContributor: false, isTopContributor: false, paceStatus: 'achieved' },
      { pharmacistId: 'u2', pharmacistName: 'B', actual: 50, target: 0, achievementPct: 0, contributionPct: 50, contributionRank: 1, isLowestContributor: false, isTopContributor: false, paceStatus: 'achieved' },
    ]
    expect(computeExpectedImpact(breakdown, 100, 200)).toBeNull()
  })

  it('returns null when total uplift is 0 (lowest contributor already at/above median)', () => {
    // All entries have the same achievementPct — median equals the "lowest" too,
    // so upliftPct = 0 for everyone.
    const breakdown: KpiContributionEntry[] = [
      { pharmacistId: 'u1', pharmacistName: 'A', actual: 50, target: 100, achievementPct: 50, contributionPct: 50, contributionRank: 1, isLowestContributor: true, isTopContributor: false, paceStatus: 'on_track' },
      { pharmacistId: 'u2', pharmacistName: 'B', actual: 50, target: 100, achievementPct: 50, contributionPct: 50, contributionRank: 1, isLowestContributor: false, isTopContributor: true, paceStatus: 'on_track' },
    ]
    expect(computeExpectedImpact(breakdown, 100, 200)).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 4 — evaluateSupervisorActionRules
// ════════════════════════════════════════════════════════════════

function baseInputs(overrides: Partial<SupervisorActionInputs> = {}): SupervisorActionInputs {
  return {
    focusKpi: 'omni',
    focusKpiAchievementPct: 39,
    focusKpiExpectedPct: 50,
    allKpiAchievementPct: { wasfaty: 81, omni: 39, wellness: 95, basket: 67, crossSelling: 72 },
    allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
    pharmacistSummaries: [],
    accountabilityInsights: [],
    weakKpiAttribution: null,
    contributionByKpi: [],
    branchActual: 0,
    branchTarget: 0,
    topPerformerId: null,
    branchRank: null,
    ...overrides,
  }
}

describe('evaluateSupervisorActionRules', () => {
  it('Rule 7 fires when there is no pharmacist data', () => {
    const result = evaluateSupervisorActionRules(baseInputs({ pharmacistSummaries: [], focusKpi: 'omni' }))
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('low')
    expect(result[0].problem).toContain('Insufficient data')
    expect(result[0].relatedKpi).toBeUndefined()
  })

  it('Rule 7 fires when focusKpi is null (no KPI has a target)', () => {
    const summaries = [makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 0, target: 0, achievementPct: 0 })] })]
    const result = evaluateSupervisorActionRules(baseInputs({ pharmacistSummaries: summaries, focusKpi: null }))
    expect(result).toHaveLength(1)
    expect(result[0].cause).toContain('No KPI with a target')
  })

  it('Rule 6 fires for single-pharmacist branch and overrides cause/action text', () => {
    const summaries = [makeSummary({ userId: 'u1', displayName: 'Solo', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 39, target: 100, achievementPct: 39 })] })]
    const result = evaluateSupervisorActionRules(baseInputs({ pharmacistSummaries: summaries }))
    expect(result).toHaveLength(1)
    expect(result[0].cause).toContain('only one pharmacist')
    expect(result[0].relatedPharmacists).toEqual(['u1'])
    expect(result[0].expectedImpact).toBeNull()
  })

  it('Rule 1 (concentrated) fires when contributionGap > 10 and weakest pharmacists exist', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100, achievementPct: 90 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100, achievementPct: 85 })] }),
      makeSummary({ userId: 'u3', displayName: 'Khalid', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 18, target: 100, achievementPct: 18 })] }),
    ]
    const contributionByKpi = computeKpiContributionBreakdown(summaries, 'omni')
    const weakKpiAttribution = computeWeakKpiAttribution('omni', summaries, [])

    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      contributionByKpi,
      weakKpiAttribution,
      branchActual: 193, branchTarget: 300, // arbitrary nonzero for expectedImpact
    }))

    const rule1 = result.find((a) => a.cause.includes('primarily because'))
    expect(rule1).toBeDefined()
    expect(rule1!.severity).toBe('high')
    expect(rule1!.relatedPharmacists).toContain('u3')
  })

  it('Rule 2 (broad) fires when contributionGap <= 10', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'A', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 45, target: 100, achievementPct: 45 })] }),
      makeSummary({ userId: 'u2', displayName: 'B', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 50, target: 100, achievementPct: 50 })] }),
      makeSummary({ userId: 'u3', displayName: 'C', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 40, target: 100, achievementPct: 40 })] }),
    ]
    const contributionByKpi = computeKpiContributionBreakdown(summaries, 'omni')
    const weakKpiAttribution = computeWeakKpiAttribution('omni', summaries, [])

    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      contributionByKpi,
      weakKpiAttribution,
      focusKpiAchievementPct: 45,
    }))

    const rule2 = result.find((a) => a.cause.includes('broad-based'))
    expect(rule2).toBeDefined()
    expect(rule2!.relatedPharmacists).toEqual([])
  })

  it('Rule 3 coexists with Rule 1 when accountability flags are present', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100, achievementPct: 90 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100, achievementPct: 85 })] }),
      makeSummary({ userId: 'u3', displayName: 'Khalid', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 18, target: 100, achievementPct: 18 })] }),
    ]
    const accountabilityInsights = [
      makeAccountability({ userId: 'u3', displayName: 'Khalid', needsOperationalSupport: true, supportDetail: 'Khalid submitted 8/20 days this month.' }),
    ]
    const contributionByKpi = computeKpiContributionBreakdown(summaries, 'omni')
    const weakKpiAttribution = computeWeakKpiAttribution('omni', summaries, accountabilityInsights)

    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      accountabilityInsights,
      contributionByKpi,
      weakKpiAttribution,
    }))

    const rule1 = result.find((a) => a.cause.includes('primarily because'))
    const rule3 = result.find((a) => a.problem.includes('operational, not skill-related'))
    expect(rule1).toBeDefined()
    expect(rule3).toBeDefined()
    expect(rule3!.relatedPharmacists).toEqual(['u3'])
  })

  it('Rule 4 (on track) fires when focusKpi and all KPIs are at/above expected pace', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  performanceScore: 92, strongestKpi: 'wasfaty', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 60, target: 100, achievementPct: 60 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', performanceScore: 80, kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 55, target: 100, achievementPct: 55 })] }),
    ]
    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      focusKpi: 'omni',
      focusKpiAchievementPct: 60,
      focusKpiExpectedPct: 50,
      allKpiAchievementPct: { wasfaty: 81, omni: 60, wellness: 95, basket: 67, crossSelling: 72 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      topPerformerId: 'u1',
    }))

    const rule4 = result.find((a) => a.problem.includes('No KPI is significantly behind pace'))
    expect(rule4).toBeDefined()
    expect(rule4!.severity).toBe('low')
    expect(rule4!.relatedPharmacists).toEqual(['u1'])
    expect(rule4!.recommendedAction).toContain('Ahmed')
  })

  it('Rule 5 (rank decline) fires when branchRank.rankMovement > 0', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  performanceScore: 92, kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 60, target: 100, achievementPct: 60 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', performanceScore: 80, kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 55, target: 100, achievementPct: 55 })] }),
    ]
    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      focusKpi: 'omni',
      focusKpiAchievementPct: 60,
      focusKpiExpectedPct: 50,
      allKpiAchievementPct: { wasfaty: 81, omni: 60, wellness: 95, basket: 67, crossSelling: 72 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      topPerformerId: 'u1',
      branchRank: { currentRank: 4, previousRank: 3, rankMovement: 1, cohortSize: 18 },
    }))

    const rule5 = result.find((a) => a.problem.includes('Branch rank dropped'))
    expect(rule5).toBeDefined()
    expect(rule5!.problem).toContain('#3 to #4')
    expect(rule5!.evidence).toContain('Current rank: #4')
  })

  it('Rule 5 does not fire when rankMovement <= 0', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 60, target: 100, achievementPct: 60 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 55, target: 100, achievementPct: 55 })] }),
    ]
    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      focusKpi: 'omni',
      focusKpiAchievementPct: 60,
      focusKpiExpectedPct: 50,
      allKpiAchievementPct: { wasfaty: 81, omni: 60, wellness: 95, basket: 67, crossSelling: 72 },
      allKpiExpectedPct:    { wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50 },
      branchRank: { currentRank: 3, previousRank: 4, rankMovement: -1, cohortSize: 18 },
    }))
    expect(result.find((a) => a.problem.includes('Branch rank dropped'))).toBeUndefined()
  })

  it('produces no duplicate actions with identical problem strings', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed',  kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 90, target: 100, achievementPct: 90 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100, achievementPct: 85 })] }),
      makeSummary({ userId: 'u3', displayName: 'Khalid', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 18, target: 100, achievementPct: 18 })] }),
    ]
    const accountabilityInsights = [
      makeAccountability({ userId: 'u3', displayName: 'Khalid', needsOperationalSupport: true, consistentUnderperformance: true, supportDetail: 'Low submission rate.' }),
    ]
    const contributionByKpi = computeKpiContributionBreakdown(summaries, 'omni')
    const weakKpiAttribution = computeWeakKpiAttribution('omni', summaries, accountabilityInsights)

    const result = evaluateSupervisorActionRules(baseInputs({
      pharmacistSummaries: summaries,
      accountabilityInsights,
      contributionByKpi,
      weakKpiAttribution,
      branchRank: { currentRank: 4, previousRank: 3, rankMovement: 1, cohortSize: 18 },
    }))

    const problems = result.map((a) => a.problem)
    expect(problems.length).toBe(new Set(problems).size)
  })

  it('does not mutate input arrays', () => {
    const summaries = [
      makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 18, target: 100, achievementPct: 18 })] }),
      makeSummary({ userId: 'u2', displayName: 'Fatima', kpiSnapshots: [makeSnapshot({ kpiKey: 'omni', actual: 85, target: 100, achievementPct: 85 })] }),
    ]
    const inputs = baseInputs({ pharmacistSummaries: summaries })
    const snapshot = JSON.parse(JSON.stringify(inputs))
    evaluateSupervisorActionRules(inputs)
    expect(inputs).toEqual(snapshot)
  })
})
