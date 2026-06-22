// ============================================================
// Phase 6D — Impact Simulator
// ============================================================
import { describe, it, expect } from 'vitest'

import { simulateImpact } from './impactSimulator'
import { simulateProfile } from '../profileStudio/simulator'
import type { EvaluationProfileDraft } from '../profileStudio/types'

function makePublishedProfile(): EvaluationProfileDraft {
  return {
    metadata: { id: 'p1', name: 'P', version: '1.0.0', status: 'PUBLISHED', scope: 'PHARMACY', validFrom: '2026-01-01' } as any,
    root: {
      id: 'root1', label: 'P',
      baskets: [{
        id: 'b1', label: 'OmniHealth', weight: 1, pipeline: { steps: [] },
        elements: [{
          id: 'e1', label: 'E1', weight: 1, pipeline: { steps: [] },
          rules: [{ id: 'r1', kpiKey: 'omnihealth', label: 'R1', metricType: 'count', weight: 1, pipeline: { steps: [{ processorType: 'RATIO_EVALUATOR', order: 0, config: {} }] } }],
        }],
      }],
    },
  } as any
}

describe('simulateImpact', () => {
  it('fails when the profile is not PUBLISHED', () => {
    const profile = makePublishedProfile()
    ;(profile.metadata as any).status = 'DRAFT'
    const result = simulateImpact({ profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 }, baselineActuals: { omnihealth: 75 }, scenarioActuals: { omnihealth: 95 } })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.scoreDelta).toBe(0)
  })

  it('reuses simulateProfile — baseline/scenario scores match direct calls', () => {
    const profile = makePublishedProfile()
    const baselineDirect = simulateProfile({ profile, actuals: { omnihealth: 75 }, targets: { omnihealth: 100 } })
    const scenarioDirect = simulateProfile({ profile, actuals: { omnihealth: 95 }, targets: { omnihealth: 100 } })
    const result = simulateImpact({ profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 }, baselineActuals: { omnihealth: 75 }, scenarioActuals: { omnihealth: 95 } })
    expect(result.baselineScore).toBe(baselineDirect.score)
    expect(result.scenarioScore).toBe(scenarioDirect.score)
  })

  it('reports a positive scoreDelta when the scenario improves actuals', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({ profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 }, baselineActuals: { omnihealth: 75 }, scenarioActuals: { omnihealth: 95 } })
    expect(result.scoreDelta).toBeGreaterThan(0)
  })

  it('computes rank/percentile impact via computeRanking when peerScores are supplied', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({
      profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 },
      baselineActuals: { omnihealth: 50 }, scenarioActuals: { omnihealth: 100 },
      peerScores: [{ entityId: 'br-2', score: 60 }, { entityId: 'br-3', score: 90 }],
    })
    expect(result.baselineRank).toBeDefined()
    expect(result.scenarioRank).toBeDefined()
    expect(result.rankChange).toBeGreaterThanOrEqual(0)
    expect(result.percentileChange).toBeGreaterThanOrEqual(0)
  })

  it('computes a gap reduction via computeBenchmark when peerScores are supplied', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({
      profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 },
      baselineActuals: { omnihealth: 50 }, scenarioActuals: { omnihealth: 100 },
      peerScores: [{ entityId: 'br-2', score: 70 }],
    })
    expect(typeof result.gapReduction).toBe('number')
  })

  it('omits ranking/benchmark fields when no peerScores are supplied', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({ profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 }, baselineActuals: { omnihealth: 50 }, scenarioActuals: { omnihealth: 90 } })
    expect(result.baselineRank).toBeUndefined()
    expect(result.gapReduction).toBeUndefined()
  })

  it('computes trend impact via computeMomentum when previousScore is supplied', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({
      profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 },
      baselineActuals: { omnihealth: 50 }, scenarioActuals: { omnihealth: 95 }, previousScore: 40,
    })
    expect(result.trendImpact?.scenarioDirection).toBe('improving')
  })

  it('omits trendImpact when no previousScore is supplied', () => {
    const profile = makePublishedProfile()
    const result = simulateImpact({ profile, entityId: 'br-1', entityType: 'branch', targets: { omnihealth: 100 }, baselineActuals: { omnihealth: 50 }, scenarioActuals: { omnihealth: 90 } })
    expect(result.trendImpact).toBeUndefined()
  })

  it('never throws on a malformed profile', () => {
    expect(() => simulateImpact({ profile: {} as any, entityId: 'e', entityType: 'branch', targets: {}, baselineActuals: {}, scenarioActuals: {} })).not.toThrow()
  })

  it('never throws on completely malformed input', () => {
    expect(() => simulateImpact({} as any)).not.toThrow()
    expect(() => simulateImpact(null as any)).not.toThrow()
  })
})
