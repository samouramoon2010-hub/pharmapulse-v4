// ============================================================
// Pharmacist Intelligence — Pure Selector Tests
// Phase 5C-1
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computePharmacistKpiBreakdown,
  computePharmacistContributionContext,
  computePharmacistStrengthsWeaknesses,
  computePharmacistRankingContext,
  computePharmacistExpectedImpact,
  computePharmacistActionCenter,
} from './pharmacistIntelligenceSelectors'
import type {
  PharmacistPerformanceSummary,
  AccountabilityInsight,
  KpiSnapshot,
  CoachingRecommendation,
} from '../teamIntelligence/teamIntelligenceTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import type {
  KpiContributionEntry,
  PharmacistAccountability,
  PharmacistKpiBreakdownEntry,
} from './pharmacistIntelligenceTypes'

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

/** Build a full set of 5 snapshots (KPI_KEYS), each independently overridable. */
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
    operationalRisk: 'none',
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

function makeAccountability(overrides: Partial<PharmacistAccountability> = {}): PharmacistAccountability {
  return {
    activeDays: overrides.activeDays ?? 20,
    expectedSubmissionDays: overrides.expectedSubmissionDays ?? 20,
    submissionRate: overrides.submissionRate ?? 100,
    missedDays: overrides.missedDays ?? 0,
    improvementStreak: overrides.improvementStreak ?? 0,
    consistentUnderperformance: overrides.consistentUnderperformance ?? false,
    needsOperationalSupport: overrides.needsOperationalSupport ?? false,
    supportDetail: overrides.supportDetail ?? '',
  }
}

const FULL_EXPECTED_PACE = {
  kpiExpectedPct: Object.fromEntries(KPI_KEYS.map((k) => [k, 50])) as Record<KpiKey, number>,
}

// ════════════════════════════════════════════════════════════════
// Selector 1 — computePharmacistKpiBreakdown
// ════════════════════════════════════════════════════════════════

describe('computePharmacistKpiBreakdown', () => {
  it('passes through actual/target/achievementPct/paceStatus/remaining/requiredPerDay for all KPIs', () => {
    const summary = makeSummary({
      userId: 'u1', displayName: 'Ahmed',
      kpiSnapshots: makeFullSnapshots({
        omni: { actual: 39, target: 100, achievementPct: 39, paceStatus: 'critical', remaining: 61, requiredPerDay: 5 },
      }),
    })
    const result = computePharmacistKpiBreakdown(summary, null, FULL_EXPECTED_PACE)
    expect(result).toHaveLength(KPI_KEYS.length)
    const omni = result.find((e) => e.kpiKey === 'omni')!
    expect(omni.actual).toBe(39)
    expect(omni.target).toBe(100)
    expect(omni.achievementPct).toBe(39)
    expect(omni.paceStatus).toBe('critical')
    expect(omni.remaining).toBe(61)
    expect(omni.requiredPerDay).toBe(5)
  })

  it('expectedPct comes from expectedPace.kpiExpectedPct, null when expectedPace is null', () => {
    const summary = makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots() })

    const withPace = computePharmacistKpiBreakdown(summary, null, FULL_EXPECTED_PACE)
    expect(withPace.every((e) => e.expectedPct === 50)).toBe(true)

    const withoutPace = computePharmacistKpiBreakdown(summary, null, null)
    expect(withoutPace.every((e) => e.expectedPct === null)).toBe(true)
  })

  it('contributionPct/contributionRank populated from contributionByKpi when present', () => {
    const summary = makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots() })
    const contributionByKpi = {
      omni: [
        makeContributionEntry({ pharmacistId: 'u1', contributionPct: 42, contributionRank: 2 }),
        makeContributionEntry({ pharmacistId: 'u2', contributionPct: 58, contributionRank: 1 }),
      ],
    } as Record<KpiKey, KpiContributionEntry[]>

    const result = computePharmacistKpiBreakdown(summary, contributionByKpi, FULL_EXPECTED_PACE)
    const omni = result.find((e) => e.kpiKey === 'omni')!
    expect(omni.contributionPct).toBe(42)
    expect(omni.contributionRank).toBe(2)

    // KPI not present in contributionByKpi → null
    const wasfaty = result.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfaty.contributionPct).toBeNull()
    expect(wasfaty.contributionRank).toBeNull()
  })

  it('contributionPct/contributionRank are null when contributionByKpi is null', () => {
    const summary = makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots() })
    const result = computePharmacistKpiBreakdown(summary, null, FULL_EXPECTED_PACE)
    expect(result.every((e) => e.contributionPct === null && e.contributionRank === null)).toBe(true)
  })

  it('null when pharmacist not found in contributionByKpi[kpiKey]', () => {
    const summary = makeSummary({ userId: 'u-not-present', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots() })
    const contributionByKpi = {
      omni: [makeContributionEntry({ pharmacistId: 'someone-else' })],
    } as Record<KpiKey, KpiContributionEntry[]>
    const result = computePharmacistKpiBreakdown(summary, contributionByKpi, FULL_EXPECTED_PACE)
    const omni = result.find((e) => e.kpiKey === 'omni')!
    expect(omni.contributionPct).toBeNull()
    expect(omni.contributionRank).toBeNull()
  })

  it('does not mutate inputs', () => {
    const summary = makeSummary({ userId: 'u1', displayName: 'Ahmed', kpiSnapshots: makeFullSnapshots() })
    const contributionByKpi = { omni: [makeContributionEntry({ pharmacistId: 'u1' })] } as Record<KpiKey, KpiContributionEntry[]>
    const summarySnapshot = JSON.parse(JSON.stringify(summary))
    const contribSnapshot = JSON.parse(JSON.stringify(contributionByKpi))
    computePharmacistKpiBreakdown(summary, contributionByKpi, FULL_EXPECTED_PACE)
    expect(summary).toEqual(summarySnapshot)
    expect(contributionByKpi).toEqual(contribSnapshot)
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 2 — computePharmacistContributionContext
// ════════════════════════════════════════════════════════════════

describe('computePharmacistContributionContext', () => {
  it('returns [] when contributionByKpi is null', () => {
    expect(computePharmacistContributionContext('u1', null)).toEqual([])
  })

  it('computes branchTotal as sum of all entries actual for each KPI', () => {
    const contributionByKpi = {
      omni: [
        makeContributionEntry({ pharmacistId: 'u1', actual: 72, contributionPct: 34.3, contributionRank: 2 }),
        makeContributionEntry({ pharmacistId: 'u2', actual: 138, contributionPct: 65.7, contributionRank: 1 }),
      ],
    } as Record<KpiKey, KpiContributionEntry[]>

    const result = computePharmacistContributionContext('u1', contributionByKpi)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      kpiKey: 'omni',
      branchTotal: 210,
      pharmacistActual: 72,
      contributionPct: 34.3,
      contributionRank: 2,
    })
  })

  it('skips a KPI if the pharmacist is not present in contributionByKpi[kpiKey]', () => {
    const contributionByKpi = {
      omni: [makeContributionEntry({ pharmacistId: 'someone-else' })],
      wasfaty: [makeContributionEntry({ pharmacistId: 'u1' })],
    } as Record<KpiKey, KpiContributionEntry[]>

    const result = computePharmacistContributionContext('u1', contributionByKpi)
    expect(result).toHaveLength(1)
    expect(result[0].kpiKey).toBe('wasfaty')
  })

  it('does not mutate contributionByKpi', () => {
    const contributionByKpi = { omni: [makeContributionEntry({ pharmacistId: 'u1', actual: 10 })] } as Record<KpiKey, KpiContributionEntry[]>
    const snapshot = JSON.parse(JSON.stringify(contributionByKpi))
    computePharmacistContributionContext('u1', contributionByKpi)
    expect(contributionByKpi).toEqual(snapshot)
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 3 — computePharmacistStrengthsWeaknesses
// ════════════════════════════════════════════════════════════════

describe('computePharmacistStrengthsWeaknesses', () => {
  function breakdownFrom(overrides: Partial<Record<KpiKey, Partial<PharmacistKpiBreakdownEntry>>>): PharmacistKpiBreakdownEntry[] {
    return KPI_KEYS.map((k) => ({
      kpiKey: k, actual: 80, target: 100, achievementPct: 80, paceStatus: 'on_track' as const,
      remaining: 20, requiredPerDay: 1, expectedPct: 50, contributionPct: null, contributionRank: null,
      ...(overrides[k] ?? {}),
    }))
  }

  it('topStrengths: KPIs with paceStatus ahead/achieved, sorted by achievementPct DESC', () => {
    const breakdown = breakdownFrom({
      wasfaty: { paceStatus: 'achieved', achievementPct: 100 },
      omni:    { paceStatus: 'ahead', achievementPct: 92 },
      wellness:{ paceStatus: 'ahead', achievementPct: 98 },
    })
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    expect(result.topStrengths).toEqual(['wasfaty', 'wellness', 'omni'])
  })

  it('weakestKpis: KPIs with paceStatus behind/critical, sorted by achievementPct ASC', () => {
    const breakdown = breakdownFrom({
      omni:   { paceStatus: 'critical', achievementPct: 18 },
      basket: { paceStatus: 'behind', achievementPct: 42 },
    })
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    expect(result.weakestKpis).toEqual(['omni', 'basket'])
  })

  it('biggestOpportunity: weakest KPI with target>0 and largest remaining', () => {
    const breakdown = breakdownFrom({
      omni:   { paceStatus: 'critical', achievementPct: 18, target: 100, remaining: 82 },
      basket: { paceStatus: 'behind',   achievementPct: 42, target: 200, remaining: 116 },
    })
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    // basket has larger remaining (116 > 82) despite higher achievementPct
    expect(result.biggestOpportunity).toBe('basket')
  })

  it('biggestOpportunity excludes weakest KPIs with target=0', () => {
    const breakdown = breakdownFrom({
      omni: { paceStatus: 'critical', achievementPct: 0, target: 0, remaining: 0 },
    })
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    expect(result.weakestKpis).toContain('omni')
    expect(result.biggestOpportunity).toBeNull()
  })

  it('all KPIs on_track → both arrays empty, biggestOpportunity null (valid state, not an error)', () => {
    const breakdown = breakdownFrom({})
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    expect(result.topStrengths).toEqual([])
    expect(result.weakestKpis).toEqual([])
    expect(result.biggestOpportunity).toBeNull()
  })

  it('overallMomentum is a direct passthrough — no per-KPI trend computed', () => {
    const breakdown = breakdownFrom({})
    const result = computePharmacistStrengthsWeaknesses(breakdown, { direction: 'improving', delta: 7.5 })
    expect(result.overallMomentum).toEqual({ direction: 'improving', delta: 7.5 })
  })

  it('does not mutate input', () => {
    const breakdown = breakdownFrom({ omni: { paceStatus: 'critical', achievementPct: 18 } })
    const snapshot = JSON.parse(JSON.stringify(breakdown))
    computePharmacistStrengthsWeaknesses(breakdown, { direction: 'stable', delta: 0 })
    expect(breakdown).toEqual(snapshot)
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 4 — computePharmacistRankingContext
// ════════════════════════════════════════════════════════════════

describe('computePharmacistRankingContext', () => {
  it('branchRank populated when pharmacist found in branchPharmacistRanking', () => {
    const ranking = [
      { userId: 'u2', rank: 1 },
      { userId: 'u1', rank: 2 },
      { userId: 'u3', rank: 3 },
    ]
    const result = computePharmacistRankingContext('u1', ranking, null)
    expect(result.branchRank).toEqual({ rank: 2, cohortSize: 3 })
  })

  it('branchRank is null when pharmacist not found or branchPharmacistRanking is null', () => {
    expect(computePharmacistRankingContext('u-missing', [{ userId: 'u1', rank: 1 }], null).branchRank).toBeNull()
    expect(computePharmacistRankingContext('u1', null, null).branchRank).toBeNull()
  })

  it('companyWideRank populated from snapshot when supplied, null otherwise', () => {
    const withSnapshot = computePharmacistRankingContext('u1', null, { currentRank: 12, cohortSize: 240 })
    expect(withSnapshot.companyWideRank).toEqual({ rank: 12, cohortSize: 240 })

    const withoutSnapshot = computePharmacistRankingContext('u1', null, null)
    expect(withoutSnapshot.companyWideRank).toBeNull()
  })

  it('supervisorGroupRank and regionalRank are ALWAYS null, regardless of inputs', () => {
    const result = computePharmacistRankingContext(
      'u1',
      [{ userId: 'u1', rank: 1 }],
      { currentRank: 1, cohortSize: 1 },
    )
    expect(result.supervisorGroupRank).toBeNull()
    expect(result.regionalRank).toBeNull()
  })

  it('single-pharmacist branch: rank=1, cohortSize=1', () => {
    const result = computePharmacistRankingContext('u1', [{ userId: 'u1', rank: 1 }], null)
    expect(result.branchRank).toEqual({ rank: 1, cohortSize: 1 })
  })

  it('does not mutate branchPharmacistRanking', () => {
    const ranking = [{ userId: 'u1', rank: 1 }]
    const snapshot = JSON.parse(JSON.stringify(ranking))
    computePharmacistRankingContext('u1', ranking, null)
    expect(ranking).toEqual(snapshot)
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 5 — computePharmacistExpectedImpact
// ════════════════════════════════════════════════════════════════

describe('computePharmacistExpectedImpact', () => {
  function breakdownWith(omniOverrides: Partial<PharmacistKpiBreakdownEntry>): PharmacistKpiBreakdownEntry[] {
    return KPI_KEYS.map((k) => ({
      kpiKey: k, actual: 80, target: 100, achievementPct: 80, paceStatus: 'on_track' as const,
      remaining: 20, requiredPerDay: 1, expectedPct: 50, contributionPct: null, contributionRank: null,
      ...(k === 'omni' ? omniOverrides : {}),
    }))
  }

  it('returns null when weakestKpi is null', () => {
    const breakdown = breakdownWith({})
    expect(computePharmacistExpectedImpact(breakdown, null, 70, null, null, null)).toBeNull()
  })

  it('returns null when weakest KPI is at/above expected pace', () => {
    const breakdown = breakdownWith({ achievementPct: 60, expectedPct: 50 }) // 60 >= 50
    expect(computePharmacistExpectedImpact(breakdown, 'omni', 70, null, null, null)).toBeNull()
  })

  it('returns null when expectedPct is null (expectedPace not supplied)', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: null })
    expect(computePharmacistExpectedImpact(breakdown, 'omni', 70, null, null, null)).toBeNull()
  })

  it('returns null when weakest KPI has target <= 0', () => {
    const breakdown = breakdownWith({ achievementPct: 0, target: 0, expectedPct: 50 })
    expect(computePharmacistExpectedImpact(breakdown, 'omni', 70, null, null, null)).toBeNull()
  })

  it('correct projectedPerformanceScore for a hand-computed scenario', () => {
    // omni: achievementPct=18, expectedPct=58 → gap=40 ; KPI_WEIGHTS.omni = 0.20
    // scoreDelta = (58-18) * 0.20 = 8
    // performanceScore=39 → projected = min(100, 39+8) = 47
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, target: 100, remaining: 82 })
    const result = computePharmacistExpectedImpact(breakdown, 'omni', 39, null, null, null)
    expect(result).not.toBeNull()
    expect(result!.currentAchievementPct).toBe(18)
    expect(result!.projectedAchievementPct).toBe(58)
    expect(result!.currentPerformanceScore).toBe(39)
    expect(result!.projectedPerformanceScore).toBe(47)
    expect(result!.kpiKey).toBe('omni')
    expect(result!.scenario).toContain('omni')
    expect(result!.branchImpact).toBeNull()
  })

  it('projectedPerformanceScore is capped at 100', () => {
    // omni: achievementPct=10, expectedPct=90 → gap=80 ; weight=0.20 → scoreDelta=16
    // performanceScore=95 → 95+16=111 → capped to 100
    const breakdown = breakdownWith({ achievementPct: 10, expectedPct: 90, target: 100, remaining: 90 })
    const result = computePharmacistExpectedImpact(breakdown, 'omni', 95, null, null, null)
    expect(result!.projectedPerformanceScore).toBe(100)
  })

  it('branchImpact populated when contributionByKpi/branchActual/branchTarget all supplied', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, target: 100, remaining: 82 })
    const contributionByKpi = {
      omni: [
        makeContributionEntry({ pharmacistId: 'u1', actual: 18, target: 100, achievementPct: 18, isLowestContributor: true }),
        makeContributionEntry({ pharmacistId: 'u2', actual: 58, target: 100, achievementPct: 58 }),
        makeContributionEntry({ pharmacistId: 'u3', actual: 58, target: 100, achievementPct: 58 }),
      ],
    } as Record<KpiKey, KpiContributionEntry[]>
    const branchActualByKpi = { omni: 134 } as Record<KpiKey, number>   // 18+58+58
    const branchTargetByKpi = { omni: 300 } as Record<KpiKey, number>

    const result = computePharmacistExpectedImpact(
      breakdown, 'omni', 39, contributionByKpi, branchActualByKpi, branchTargetByKpi,
    )
    expect(result!.branchImpact).not.toBeNull()
    expect(result!.branchImpact!.currentBranchPct).toBeCloseTo((134 / 300) * 100, 1)
  })

  it('branchImpact is null when contribution/branch data not supplied', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58 })
    const result = computePharmacistExpectedImpact(breakdown, 'omni', 39, null, null, null)
    expect(result!.branchImpact).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// Selector 6 — computePharmacistActionCenter
// ════════════════════════════════════════════════════════════════

describe('computePharmacistActionCenter', () => {
  function breakdownWith(omniOverrides: Partial<PharmacistKpiBreakdownEntry>): PharmacistKpiBreakdownEntry[] {
    return KPI_KEYS.map((k) => ({
      kpiKey: k, actual: 80, target: 100, achievementPct: 80, paceStatus: 'on_track' as const,
      remaining: 20, requiredPerDay: 1, expectedPct: 50, contributionPct: null, contributionRank: null,
      ...(k === 'omni' ? omniOverrides : {}),
    }))
  }

  it('Rule P3 (recognition) fires when performanceScore >= 90, and ONLY P3 fires', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, paceStatus: 'critical' })
    const coaching: CoachingRecommendation[] = [
      { id: '1', priority: 'recognition', title: 'Recognise', detail: 'Great job!', rationale: 'high score', _aiReady: true },
    ]
    const result = computePharmacistActionCenter(breakdown, 'omni', 92, null, coaching, null)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('low')
    expect(result[0].recommendedAction).toBe('Great job!')
  })

  it('Rule P4 (no data) fires when weakestKpi is null, and ONLY P4 fires', () => {
    const breakdown = breakdownWith({})
    const result = computePharmacistActionCenter(breakdown, null, 50, null, [], null)
    expect(result).toHaveLength(1)
    expect(result[0].problem).toContain('Insufficient data')
    expect(result[0].relatedKpi).toBeUndefined()
  })

  it('Rule P1 fires when weakest KPI is behind expected pace', () => {
    const breakdown = breakdownWith({ achievementPct: 47, expectedPct: 62, paceStatus: 'behind', actual: 47, target: 100, remaining: 53, requiredPerDay: 3 })
    const coaching: CoachingRecommendation[] = [
      { id: '1', priority: 'near_term', title: 'Wasfaty focus', detail: 'Review Wasfaty workflow and daily prescription capture.', kpiKey: 'omni', rationale: 'low achievement', _aiReady: true },
    ]
    const result = computePharmacistActionCenter(breakdown, 'omni', 70, null, coaching, null)
    const p1 = result.find((a) => a.severity === 'high')
    expect(p1).toBeDefined()
    expect(p1!.problem).toContain('omni')
    expect(p1!.cause).toContain('47%')
    expect(p1!.cause).toContain('62%')
    expect(p1!.recommendedAction).toBe('Review Wasfaty workflow and daily prescription capture.')
    expect(p1!.relatedKpi).toBe('omni')
  })

  it('Rule P2 (accountability) co-exists with P1', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, paceStatus: 'critical' })
    const accountability = makeAccountability({ needsOperationalSupport: true, supportDetail: 'Submitted 8/20 days this month.', submissionRate: 40, missedDays: 12 })
    const result = computePharmacistActionCenter(breakdown, 'omni', 39, accountability, [], null)
    const p1 = result.find((a) => a.severity === 'high')
    const p2 = result.find((a) => a.severity === 'medium')
    expect(p1).toBeDefined()
    expect(p2).toBeDefined()
    expect(p2!.cause).toBe('Submitted 8/20 days this month.')
  })

  it('fallback "on track" action when weakest KPI is not behind pace and no accountability flag', () => {
    const breakdown = breakdownWith({ achievementPct: 65, expectedPct: 50, paceStatus: 'ahead' })
    const result = computePharmacistActionCenter(breakdown, 'omni', 70, null, [], null)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('low')
    expect(result[0].problem).toContain('No KPI is significantly behind pace')
  })

  it('expectedImpact is attached to P1 when supplied', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, paceStatus: 'critical' })
    const expectedImpact = {
      scenario: 'If omni reaches expected pace (58%), performance score would change from 39% to 47%.',
      kpiKey: 'omni' as KpiKey,
      currentAchievementPct: 18,
      projectedAchievementPct: 58,
      currentPerformanceScore: 39,
      projectedPerformanceScore: 47,
      branchImpact: null,
    }
    const result = computePharmacistActionCenter(breakdown, 'omni', 39, null, [], expectedImpact)
    const p1 = result.find((a) => a.severity === 'high')
    expect(p1!.expectedImpact).not.toBeNull()
    expect(p1!.expectedImpact!.impactDeltaPts).toBe(8)
  })

  it('does not mutate inputs', () => {
    const breakdown = breakdownWith({ achievementPct: 18, expectedPct: 58, paceStatus: 'critical' })
    const coaching: CoachingRecommendation[] = []
    const snapshot = JSON.parse(JSON.stringify(breakdown))
    computePharmacistActionCenter(breakdown, 'omni', 39, null, coaching, null)
    expect(breakdown).toEqual(snapshot)
  })
})
