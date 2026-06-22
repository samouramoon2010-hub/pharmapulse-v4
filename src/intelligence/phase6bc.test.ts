// ============================================================
// Phase 6B + 6C — Insight Engine + Recommendation Engine
// ============================================================
import { describe, it, expect } from 'vitest'

import { deriveStrengths, deriveRisks, deriveOpportunities, buildExecutiveSummary } from './insightEngine'
import { buildInsightInput } from './insightFactory'
import { derivePriority, deriveDifficulty, buildRecommendation, generateRecommendations } from './recommendationEngine'
import { generateRecommendationsBatch } from './recommendationFactory'
import type { OpportunityItem, OpportunityResult } from './opportunityTypes'

function item(category: OpportunityItem['category'], value: number, targetId = 't1', targetLabel = 'Smart List'): OpportunityItem {
  return { category, level: 'basket', targetId, targetLabel, value, description: `${targetLabel} ${category} ${value}` }
}

function makeOpportunityResult(items: OpportunityItem[]): OpportunityResult {
  return { entityId: 'br-1', entityType: 'branch', items, generatedAt: '2026-06-15T00:00:00.000Z' }
}

// ════════════════════════════════════════════════════════════
// 6B — Insight Engine
// ════════════════════════════════════════════════════════════

describe('deriveStrengths', () => {
  it('produces a strength for the highest-contributing KPI', () => {
    const strengths = deriveStrengths({ entityId: 'e', overallScore: 80, opportunityItems: [item('HIGHEST_CONTRIBUTING_KPI', 63, 'r2', 'OmniHealth')] })
    expect(strengths.some((s) => s.relatedId === 'r2')).toBe(true)
  })
  it('produces a momentum strength when trend is improving', () => {
    const strengths = deriveStrengths({ entityId: 'e', overallScore: 80, opportunityItems: [], trendDirection: 'improving', momentum: 5 })
    expect(strengths.some((s) => s.title === 'Positive momentum')).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => deriveStrengths(null as any)).not.toThrow()
    expect(deriveStrengths(null as any)).toEqual([])
  })
})

describe('deriveRisks', () => {
  it('produces a risk for the lowest-contributing KPI', () => {
    const risks = deriveRisks({ entityId: 'e', overallScore: 80, opportunityItems: [item('LOWEST_CONTRIBUTING_KPI', 4, 'r1', 'Smart List')] })
    expect(risks.some((r) => r.relatedId === 'r1')).toBe(true)
  })
  it('only flags a critical gap when the score gap is negative', () => {
    const below = deriveRisks({ entityId: 'e', overallScore: 80, opportunityItems: [item('LARGEST_SCORE_GAP', -10)] })
    const above = deriveRisks({ entityId: 'e', overallScore: 80, opportunityItems: [item('LARGEST_SCORE_GAP', 10)] })
    expect(below.some((r) => r.title === 'Critical gap vs. peers')).toBe(true)
    expect(above.some((r) => r.title === 'Critical gap vs. peers')).toBe(false)
  })
  it('produces a negative-momentum risk when trend is regressing', () => {
    const risks = deriveRisks({ entityId: 'e', overallScore: 80, opportunityItems: [], trendDirection: 'regressing', momentum: -5 })
    expect(risks.some((r) => r.title === 'Negative momentum')).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => deriveRisks(undefined as any)).not.toThrow()
  })
})

describe('deriveOpportunities', () => {
  it('produces an opportunity for the biggest headroom finding', () => {
    const opportunities = deriveOpportunities({ entityId: 'e', overallScore: 80, opportunityItems: [item('BIGGEST_OPPORTUNITY', 60, 'e1', 'E1')] })
    expect(opportunities.some((o) => o.relatedId === 'e1')).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => deriveOpportunities(null as any)).not.toThrow()
  })
})

describe('buildExecutiveSummary', () => {
  it('produces a narrative referencing the weakest basket and its share of the gap', () => {
    const summary = buildExecutiveSummary({
      entityId: 'br-1', overallScore: 70,
      opportunityItems: [item('BIGGEST_WEAKNESS', 8, 'b1', 'Smart List')],
    })
    expect(summary.narrative).toContain('Smart List')
    expect(summary.narrative).toMatch(/8\.0%/)
  })
  it('always returns strengths/risks/opportunities arrays', () => {
    const summary = buildExecutiveSummary({ entityId: 'e', overallScore: 50, opportunityItems: [] })
    expect(Array.isArray(summary.strengths)).toBe(true)
    expect(Array.isArray(summary.risks)).toBe(true)
    expect(Array.isArray(summary.opportunities)).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => buildExecutiveSummary(null as any)).not.toThrow()
    expect(() => buildExecutiveSummary({} as any)).not.toThrow()
  })
})

describe('buildInsightInput', () => {
  it('wires an OpportunityResult + TrendResult into an InsightAnalysisInput', () => {
    const opportunityResult = makeOpportunityResult([item('BIGGEST_WEAKNESS', 8)])
    const input = buildInsightInput({
      overallScore: 70, opportunityResult,
      trend: { entityId: 'br-1', history: [], movingAverage: [], momentum: 3, direction: 'improving', profileVersionChanges: [] },
      benchmarkAverage: 75,
    })
    expect(input.entityId).toBe('br-1')
    expect(input.trendDirection).toBe('improving')
    expect(input.momentum).toBe(3)
  })
  it('never throws on malformed options', () => {
    expect(() => buildInsightInput({} as any)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 6C — Recommendation Engine
// ════════════════════════════════════════════════════════════

describe('derivePriority / deriveDifficulty', () => {
  it.each([[25, 'high'], [10, 'medium'], [2, 'low']])('priority for value %s is %s', (value, expected) => {
    expect(derivePriority(value as number)).toBe(expected)
  })
  it.each([[35, 'high'], [15, 'medium'], [2, 'low']])('difficulty for value %s is %s', (value, expected) => {
    expect(deriveDifficulty(value as number)).toBe(expected)
  })
  it('priority/difficulty use the magnitude, not the sign', () => {
    expect(derivePriority(-25)).toBe(derivePriority(25))
    expect(deriveDifficulty(-35)).toBe(deriveDifficulty(35))
  })
})

describe('buildRecommendation', () => {
  it('builds a recommendation for an eligible category', () => {
    const rec = buildRecommendation(item('BIGGEST_OPPORTUNITY', 60, 'e1', 'E1'), 0)
    expect(rec?.basedOn.opportunityCategory).toBe('BIGGEST_OPPORTUNITY')
    expect(rec?.basedOn.targetId).toBe('e1')
    expect(rec?.confidence).toBe(1)
  })
  it('returns null for a non-recommendable category', () => {
    expect(buildRecommendation(item('BIGGEST_WEAKNESS', 40), 0)).toBeNull()
    expect(buildRecommendation(item('HIGHEST_CONTRIBUTING_KPI', 40), 0)).toBeNull()
  })
  it('every recommendation description references its basedOn finding (explainable, not black-box)', () => {
    const rec = buildRecommendation(item('LOWEST_CONTRIBUTING_KPI', 4, 'r1', 'Smart List'), 0)
    expect(rec?.description).toContain('Based on')
  })
  it('caps impact at 100', () => {
    const rec = buildRecommendation(item('BIGGEST_OPPORTUNITY', 500), 0)
    expect(rec?.impact).toBe(100)
  })
  it('never throws on malformed input', () => {
    expect(() => buildRecommendation(null as any, 0)).not.toThrow()
  })
})

describe('generateRecommendations', () => {
  it('sorts recommendations by impact descending', () => {
    const result = generateRecommendations(makeOpportunityResult([
      item('LOWEST_CONTRIBUTING_KPI', 4, 'r1'),
      item('BIGGEST_OPPORTUNITY', 60, 'e1'),
    ]))
    expect(result.items[0].basedOn.targetId).toBe('e1')
  })
  it('excludes non-recommendable categories', () => {
    const result = generateRecommendations(makeOpportunityResult([item('BIGGEST_WEAKNESS', 40, 'b1')]))
    expect(result.items.length).toBe(0)
  })
  it('never throws on malformed input', () => {
    expect(() => generateRecommendations(null as any)).not.toThrow()
    expect(() => generateRecommendations({} as any)).not.toThrow()
  })
})

describe('generateRecommendationsBatch', () => {
  it('generates recommendations for multiple entities independently', () => {
    const results = generateRecommendationsBatch([
      makeOpportunityResult([item('BIGGEST_OPPORTUNITY', 60, 'e1')]),
      { ...makeOpportunityResult([item('LOWEST_CONTRIBUTING_KPI', 4, 'r1')]), entityId: 'br-2' },
    ])
    expect(results.length).toBe(2)
    expect(results[0].entityId).toBe('br-1')
    expect(results[1].entityId).toBe('br-2')
  })
  it('never throws on an empty array', () => {
    expect(() => generateRecommendationsBatch([])).not.toThrow()
  })
  it('never throws on malformed input', () => {
    expect(() => generateRecommendationsBatch(null as any)).not.toThrow()
  })
})
