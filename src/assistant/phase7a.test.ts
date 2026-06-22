// ============================================================
// Phase 7A — Assistant Context Layer
// ============================================================
import { describe, it, expect } from 'vitest'

import { buildAssistantContext } from './assistantContext'
import { extractGroundedFacts, isKpiKeyGrounded, isEntityIdGrounded, listGroundedKpiKeys, listGroundedEntityIds } from './assistantGrounding'
import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'
import type { ProfileSimTrace } from '../profileStudio/simulationTrace'

function makeTrace(): ProfileSimTrace {
  return {
    profileId: 'p1', profileVersion: '1.0.0', overallScore: 70, timestamp: '',
    baskets: [{
      basketId: 'b1', label: 'B1', score: 70, weight: 1, weightedContribution: 70, timestamp: '',
      elements: [{
        elementId: 'e1', label: 'E1', score: 70, weight: 1, weightedContribution: 70, timestamp: '',
        rules: [{ ruleId: 'r1', kpiKey: 'omnihealth', rawActual: 70, rawTarget: 100, rawAchievement: 70, cappedAchievement: 70, weightedScore: 70, penaltyApplied: 0, finalNodeScore: 70, zeroTarget: false, stepTraces: [], timestamp: '' }],
      }],
    }],
  }
}

function makeEntry(): EvaluationLedgerEntry {
  return {
    evaluationId: 'eval_1', entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0',
    periodId: '2026-06', score: 70, basketScores: { b1: 70 }, elementScores: { e1: 70 }, ruleScores: { r1: 70 },
    trace: makeTrace(), timestamp: '2026-06-15T00:00:00.000Z', metadata: {},
  }
}

describe('buildAssistantContext', () => {
  it('wires the ledger entry, trace, and rankingEntry for the requested entity', () => {
    const ranking = {
      entityType: 'branch' as const, profileId: 'p1', periodId: '2026-06', generatedAt: '',
      entries: [{ entityId: 'br-1', entityType: 'branch' as const, score: 70, rank: 1, percentile: 100, quartile: 1 as const, trend: 'new' as const, scoreDelta: 0 }],
    }
    const context = buildAssistantContext({
      entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06',
      ledgerEntry: makeEntry(), ranking,
    })
    expect(context.ledgerEntry?.score).toBe(70)
    expect(context.trace?.baskets.length).toBe(1)
    expect(context.rankingEntry?.entityId).toBe('br-1')
  })
  it('produces a leaner context when optional inputs are omitted, without throwing', () => {
    const context = buildAssistantContext({ entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06' })
    expect(context.ledgerEntry).toBeUndefined()
    expect(context.rankingEntry).toBeUndefined()
  })
  it('never throws on malformed options', () => {
    expect(() => buildAssistantContext({} as any)).not.toThrow()
    expect(() => buildAssistantContext(null as any)).not.toThrow()
  })
})

describe('assistantGrounding', () => {
  const context = buildAssistantContext({
    entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06',
    ledgerEntry: makeEntry(),
  })

  it('listGroundedKpiKeys finds every kpiKey in the trace', () => {
    expect(listGroundedKpiKeys(context)).toEqual(['omnihealth'])
  })
  it('isKpiKeyGrounded is true for a real KPI and false for a fabricated one', () => {
    expect(isKpiKeyGrounded(context, 'omnihealth')).toBe(true)
    expect(isKpiKeyGrounded(context, 'totally-made-up-kpi')).toBe(false)
  })
  it('listGroundedEntityIds includes the context entityId', () => {
    expect(listGroundedEntityIds(context)).toContain('br-1')
  })
  it('isEntityIdGrounded is false for an entity not present anywhere in context', () => {
    expect(isEntityIdGrounded(context, 'nonexistent-entity')).toBe(false)
  })
  it('extractGroundedFacts includes the ledger score', () => {
    const facts = extractGroundedFacts(context)
    expect(facts.some((f) => f.label === 'Overall score' && f.value === 70)).toBe(true)
  })
  it('every grounded fact has a recognised source', () => {
    const facts = extractGroundedFacts(context)
    const sources = ['ledger', 'ranking', 'benchmark', 'trend', 'opportunity', 'recommendation', 'trace', 'profile']
    expect(facts.every((f) => sources.includes(f.source))).toBe(true)
  })
  it('never throw on malformed context', () => {
    expect(() => extractGroundedFacts(null as any)).not.toThrow()
    expect(() => listGroundedKpiKeys(null as any)).not.toThrow()
    expect(() => isKpiKeyGrounded(null as any, 'x')).not.toThrow()
    expect(() => listGroundedEntityIds(undefined as any)).not.toThrow()
    expect(() => isEntityIdGrounded({} as any, 'x')).not.toThrow()
  })
})
