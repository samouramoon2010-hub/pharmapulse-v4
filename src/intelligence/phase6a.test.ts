// ============================================================
// Phase 6A — Opportunity Engine
// ============================================================
import { describe, it, expect } from 'vitest'

import {
  findBiggestWeakness, findBiggestOpportunity, findLowestContributingKpi,
  findHighestContributingKpi, findLargestScoreGap, findLargestDecline,
  findLargestImprovement, analyzeOpportunities,
} from './opportunityEngine'
import { buildOpportunityInput } from './opportunityFactory'
import type { ProfileSimTrace } from '../profileStudio/simulationTrace'
import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'

function makeTrace(): ProfileSimTrace {
  return {
    profileId: 'p1', profileVersion: '1.0.0', overallScore: 70, timestamp: '2026-06-01T00:00:00.000Z',
    baskets: [
      {
        basketId: 'b1', label: 'Smart List', score: 40, weight: 0.3, weightedContribution: 12, timestamp: '',
        elements: [
          { elementId: 'e1', label: 'E1', score: 40, weight: 1, weightedContribution: 40, timestamp: '', rules: [
            { ruleId: 'r1', kpiKey: 'wasfaty', rawActual: 40, rawTarget: 100, rawAchievement: 40, cappedAchievement: 40, weightedScore: 4, penaltyApplied: 0, finalNodeScore: 40, zeroTarget: false, stepTraces: [], timestamp: '' },
          ] },
        ],
      },
      {
        basketId: 'b2', label: 'OmniHealth', score: 90, weight: 0.7, weightedContribution: 63, timestamp: '',
        elements: [
          { elementId: 'e2', label: 'E2', score: 90, weight: 1, weightedContribution: 90, timestamp: '', rules: [
            { ruleId: 'r2', kpiKey: 'omnihealth', rawActual: 90, rawTarget: 100, rawAchievement: 90, cappedAchievement: 90, weightedScore: 63, penaltyApplied: 0, finalNodeScore: 90, zeroTarget: false, stepTraces: [], timestamp: '' },
          ] },
        ],
      },
    ],
  }
}

function makeEntry(overrides: Partial<EvaluationLedgerEntry> = {}): EvaluationLedgerEntry {
  return {
    evaluationId: 'eval_1', entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0',
    periodId: '2026-06', score: 70, basketScores: { b1: 40, b2: 90 }, elementScores: { e1: 40, e2: 90 },
    ruleScores: { r1: 40, r2: 90 }, trace: makeTrace(), timestamp: '2026-06-15T00:00:00.000Z', metadata: {},
    ...overrides,
  }
}

describe('findBiggestWeakness', () => {
  it('identifies the lowest-scoring basket', () => {
    const result = findBiggestWeakness(makeTrace())
    expect(result?.targetId).toBe('b1')
    expect(result?.value).toBe(40)
  })
  it('returns null for an empty trace', () => {
    expect(findBiggestWeakness({ profileId: '', profileVersion: '', overallScore: 0, baskets: [], timestamp: '' })).toBeNull()
  })
  it('never throws on undefined', () => {
    expect(() => findBiggestWeakness(undefined)).not.toThrow()
  })
})

describe('findBiggestOpportunity', () => {
  it('identifies the element with the largest weighted headroom', () => {
    const result = findBiggestOpportunity(makeTrace())
    expect(result?.targetId).toBe('e1') // (100-40)*1=60 > (100-90)*1=10
  })
  it('never throws on undefined', () => {
    expect(() => findBiggestOpportunity(undefined)).not.toThrow()
  })
})

describe('findLowestContributingKpi / findHighestContributingKpi', () => {
  it('lowest contributing KPI is r1 (weightedScore 4)', () => {
    expect(findLowestContributingKpi(makeTrace())?.targetId).toBe('r1')
  })
  it('highest contributing KPI is r2 (weightedScore 63)', () => {
    expect(findHighestContributingKpi(makeTrace())?.targetId).toBe('r2')
  })
  it('never throw on undefined', () => {
    expect(() => findLowestContributingKpi(undefined)).not.toThrow()
    expect(() => findHighestContributingKpi(undefined)).not.toThrow()
  })
})

describe('findLargestScoreGap', () => {
  it('reports a negative gap when below the benchmark average', () => {
    const result = findLargestScoreGap(makeEntry({ score: 60 }), 80)
    expect(result?.value).toBe(-20)
  })
  it('returns null when no benchmark average is supplied', () => {
    expect(findLargestScoreGap(makeEntry(), undefined)).toBeNull()
  })
  it('never throws on malformed input', () => {
    expect(() => findLargestScoreGap(null as any, 80)).not.toThrow()
  })
})

describe('findLargestDecline / findLargestImprovement', () => {
  it('finds a basket decline between two periods', () => {
    const prev = makeEntry({ basketScores: { b1: 60, b2: 90 } })
    const curr = makeEntry({ basketScores: { b1: 40, b2: 90 } })
    const decline = findLargestDecline(curr, prev)
    expect(decline?.targetId).toBe('b1')
    expect(decline?.value).toBeCloseTo(-20)
  })
  it('finds a basket improvement between two periods', () => {
    const prev = makeEntry({ basketScores: { b1: 40, b2: 70 } })
    const curr = makeEntry({ basketScores: { b1: 40, b2: 90 } })
    const improvement = findLargestImprovement(curr, prev)
    expect(improvement?.targetId).toBe('b2')
    expect(improvement?.value).toBeCloseTo(20)
  })
  it('returns null when no previous entry is supplied', () => {
    expect(findLargestDecline(makeEntry())).toBeNull()
    expect(findLargestImprovement(makeEntry())).toBeNull()
  })
  it('never throw on malformed input', () => {
    expect(() => findLargestDecline(null as any, null as any)).not.toThrow()
    expect(() => findLargestImprovement(null as any, null as any)).not.toThrow()
  })
})

describe('analyzeOpportunities', () => {
  it('aggregates all non-null findings', () => {
    const result = analyzeOpportunities({ entry: makeEntry(), benchmarkAverage: 80 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.every((i) => typeof i.description === 'string' && i.description.length > 0)).toBe(true)
  })
  it('skips findings that need missing data (no previous entry → no decline/improvement)', () => {
    const result = analyzeOpportunities({ entry: makeEntry() })
    expect(result.items.some((i) => i.category === 'LARGEST_DECLINE')).toBe(false)
    expect(result.items.some((i) => i.category === 'LARGEST_IMPROVEMENT')).toBe(false)
  })
  it('never throws on malformed input', () => {
    expect(() => analyzeOpportunities({} as any)).not.toThrow()
    expect(() => analyzeOpportunities(null as any)).not.toThrow()
  })
})

describe('buildOpportunityInput', () => {
  it('builds an input from raw current+previous entries', () => {
    const current = [makeEntry({ entityId: 'br-1', score: 75 })]
    const previous = [makeEntry({ entityId: 'br-1', score: 65 })]
    const input = buildOpportunityInput({ entityId: 'br-1', currentPeriodEntries: current, previousPeriodEntries: previous, benchmarkAverage: 70 })
    expect(input?.entry.score).toBe(75)
    expect(input?.previousEntry?.score).toBe(65)
    expect(input?.benchmarkAverage).toBe(70)
  })
  it('returns null when the entity has no current-period entry', () => {
    expect(buildOpportunityInput({ entityId: 'unknown', currentPeriodEntries: [] })).toBeNull()
  })
  it('never throws on malformed options', () => {
    expect(() => buildOpportunityInput({} as any)).not.toThrow()
  })
})
