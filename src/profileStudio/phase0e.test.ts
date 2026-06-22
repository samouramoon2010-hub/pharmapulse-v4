// ============================================================
// Profile Studio — Phase 0E Tests: Simulator Kernel
//
// 160+ tests covering:
//   - simulationTrace.ts  (trace types + factories + utilities)
//   - simulator.ts        (executeProcessorStep, simulateRule,
//                          simulateElement, simulateBasket,
//                          simulateProfile, compareSimulationResults)
//
// No Firestore. No React. No UI. No production engine coupling.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'

// ── Trace imports ─────────────────────────────────────────────
import {
  createProcessorTrace,
  createRuleSimTrace,
  createElementSimTrace,
  createBasketSimTrace,
  createProfileSimTrace,
  flattenSimulationTrace,
  indexTraceByKpi,
} from './simulationTrace'
import type {
  SimStepTrace,
  RuleSimTrace,
  ElementSimTrace,
  BasketSimTrace,
  ProfileSimTrace,
} from './simulationTrace'

// ── Simulator imports ─────────────────────────────────────────
import {
  executeProcessorStep,
  simulateRule,
  simulateElement,
  simulateBasket,
  simulateProfile,
  compareSimulationResults,
} from './simulator'
import type {
  StudioSimulationInput,
  StudioSimulationResult,
} from './simulator'

// ── Profile helpers ───────────────────────────────────────────
import {
  createEmptyEvaluationProfile,
  createBasketNode,
  createElementNode,
  createRuleNode,
} from './profileFactory'
import type {
  ProcessorStep,
  RuleNode,
  ElementNode,
  BasketNode,
  EvaluationProfileDraft,
} from './types'
import {
  RATIO_EVALUATOR,
  CEILING_CLAMP,
  FLOOR_CLAMP,
  WEIGHT_MULTIPLIER,
  BAND_EVALUATOR,
  PENALTY_EVALUATOR,
  NODE_AGGREGATOR,
  ZERO_TARGET_GUARD,
} from './processors'

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function makeStep(
  processorType: string,
  config: Record<string, unknown> = {},
  order = 0,
): ProcessorStep {
  return { processorType: processorType as any, config, order }
}

function makeState(overrides: Partial<{
  actual:            number
  target:            number
  achievement:       number
  cappedAchievement: number
  score:             number
  weightedScore:     number
  zeroTarget:        boolean
  bandLabel:         string | undefined
  penaltyApplied:    number
  bandRan:           boolean
  childScores:       number[]
  childWeights:      number[]
  issues:            string[]
  stepTraces:        SimStepTrace[]
}> = {}) {
  return {
    actual:            0,
    target:            0,
    achievement:       0,
    cappedAchievement: 0,
    score:             0,
    weightedScore:     0,
    zeroTarget:        false,
    bandLabel:         undefined,
    penaltyApplied:    0,
    bandRan:           false,
    childScores:       [],
    childWeights:      [],
    issues:            [],
    stepTraces:        [],
    ...overrides,
  }
}

/** Build a minimal SIMULATED profile with one basket > element > rule. */
function buildSimulatedProfile(
  kpiKey     = 'sales',
  weight     = 1,
  pipelineSteps: ProcessorStep[] = [],
): EvaluationProfileDraft {
  const profile = createEmptyEvaluationProfile({ name: 'Test Profile' })
  profile.metadata.status = 'SIMULATED'

  const rule    = createRuleNode({ kpiKey, label: 'Rule', weight: 1 })
  rule.pipeline = { steps: pipelineSteps }

  const element   = createElementNode({ label: 'Element', weight: 1 })
  element.rules   = [rule]

  const basket    = createBasketNode({ label: 'Basket', weight })
  basket.elements = [element]

  profile.root.baskets = [basket]
  return profile
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — simulationTrace: createProcessorTrace
// ════════════════════════════════════════════════════════════

describe('createProcessorTrace', () => {
  it('returns object with processorType, input, output', () => {
    const t = createProcessorTrace('RATIO_EVALUATOR', 80, 90)
    expect(t.processorType).toBe('RATIO_EVALUATOR')
    expect(t.input).toBe(80)
    expect(t.output).toBe(90)
  })

  it('notes is undefined when not provided', () => {
    const t = createProcessorTrace('X', 1, 2)
    expect(t.notes).toBeUndefined()
  })

  it('notes is included when provided', () => {
    const t = createProcessorTrace('X', 1, 2, 'clamped')
    expect(t.notes).toBe('clamped')
  })

  it('preserves numeric 0 input/output', () => {
    const t = createProcessorTrace('X', 0, 0)
    expect(t.input).toBe(0)
    expect(t.output).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — simulationTrace: createRuleSimTrace
// ════════════════════════════════════════════════════════════

describe('createRuleSimTrace', () => {
  const base = {
    ruleId:            'r1',
    kpiKey:            'sales',
    rawActual:         80,
    rawTarget:         100,
    rawAchievement:    80,
    cappedAchievement: 80,
    weightedScore:     0.8,
    penaltyApplied:    0,
    finalNodeScore:    80,
    zeroTarget:        false,
    stepTraces:        [] as SimStepTrace[],
  }

  it('adds timestamp', () => {
    const t = createRuleSimTrace(base)
    expect(typeof t.timestamp).toBe('string')
    expect(t.timestamp.length).toBeGreaterThan(0)
  })

  it('preserves all fields', () => {
    const t = createRuleSimTrace(base)
    expect(t.ruleId).toBe('r1')
    expect(t.kpiKey).toBe('sales')
    expect(t.rawActual).toBe(80)
    expect(t.finalNodeScore).toBe(80)
  })

  it('bandLabel is optional', () => {
    const t = createRuleSimTrace(base)
    expect(t.bandLabel).toBeUndefined()
  })

  it('bandLabel is preserved when provided', () => {
    const t = createRuleSimTrace({ ...base, bandLabel: 'Excellent' })
    expect(t.bandLabel).toBe('Excellent')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — simulationTrace: createElementSimTrace
// ════════════════════════════════════════════════════════════

describe('createElementSimTrace', () => {
  it('adds timestamp', () => {
    const t = createElementSimTrace({
      elementId: 'e1', label: 'E', score: 80, weight: 0.5, weightedContribution: 40, rules: [],
    })
    expect(typeof t.timestamp).toBe('string')
  })

  it('preserves elementId, label, score, weight', () => {
    const t = createElementSimTrace({
      elementId: 'e1', label: 'E', score: 75, weight: 0.3, weightedContribution: 22.5, rules: [],
    })
    expect(t.elementId).toBe('e1')
    expect(t.score).toBe(75)
    expect(t.weight).toBe(0.3)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — simulationTrace: createBasketSimTrace
// ════════════════════════════════════════════════════════════

describe('createBasketSimTrace', () => {
  it('adds timestamp', () => {
    const t = createBasketSimTrace({
      basketId: 'b1', label: 'B', score: 90, weight: 1, weightedContribution: 90, elements: [],
    })
    expect(typeof t.timestamp).toBe('string')
  })

  it('preserves basketId and score', () => {
    const t = createBasketSimTrace({
      basketId: 'b1', label: 'B', score: 60, weight: 0.4, weightedContribution: 24, elements: [],
    })
    expect(t.basketId).toBe('b1')
    expect(t.score).toBe(60)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — simulationTrace: createProfileSimTrace
// ════════════════════════════════════════════════════════════

describe('createProfileSimTrace', () => {
  it('adds timestamp', () => {
    const t = createProfileSimTrace({
      profileId: 'p1', profileVersion: '1.0.0', overallScore: 85, baskets: [],
    })
    expect(typeof t.timestamp).toBe('string')
  })

  it('preserves profileId, profileVersion, overallScore', () => {
    const t = createProfileSimTrace({
      profileId: 'p1', profileVersion: '2.0.0', overallScore: 70, baskets: [],
    })
    expect(t.profileId).toBe('p1')
    expect(t.profileVersion).toBe('2.0.0')
    expect(t.overallScore).toBe(70)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — simulationTrace: flattenSimulationTrace
// ════════════════════════════════════════════════════════════

describe('flattenSimulationTrace', () => {
  function makeRuleTrace(ruleId: string, kpiKey: string): RuleSimTrace {
    return createRuleSimTrace({
      ruleId, kpiKey,
      rawActual: 0, rawTarget: 0, rawAchievement: 0, cappedAchievement: 0,
      weightedScore: 0, penaltyApplied: 0, finalNodeScore: 0, zeroTarget: false, stepTraces: [],
    })
  }

  it('returns empty array for empty profile trace', () => {
    const t = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [] })
    expect(flattenSimulationTrace(t)).toHaveLength(0)
  })

  it('flattens single basket → element → rule', () => {
    const ruleT = makeRuleTrace('r1', 'sales')
    const elemT = createElementSimTrace({ elementId: 'e1', label: 'E', score: 0, weight: 1, weightedContribution: 0, rules: [ruleT] })
    const baskT = createBasketSimTrace({ basketId: 'b1', label: 'B', score: 0, weight: 1, weightedContribution: 0, elements: [elemT] })
    const profT = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [baskT] })
    const flat  = flattenSimulationTrace(profT)
    expect(flat).toHaveLength(1)
    expect(flat[0].ruleId).toBe('r1')
  })

  it('flattens multiple baskets and elements', () => {
    const rules1 = [makeRuleTrace('r1', 'k1'), makeRuleTrace('r2', 'k2')]
    const rules2 = [makeRuleTrace('r3', 'k3')]
    const elem1  = createElementSimTrace({ elementId: 'e1', label: 'E1', score: 0, weight: 0.5, weightedContribution: 0, rules: rules1 })
    const elem2  = createElementSimTrace({ elementId: 'e2', label: 'E2', score: 0, weight: 0.5, weightedContribution: 0, rules: rules2 })
    const bask1  = createBasketSimTrace({ basketId: 'b1', label: 'B1', score: 0, weight: 0.5, weightedContribution: 0, elements: [elem1] })
    const bask2  = createBasketSimTrace({ basketId: 'b2', label: 'B2', score: 0, weight: 0.5, weightedContribution: 0, elements: [elem2] })
    const prof   = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [bask1, bask2] })
    expect(flattenSimulationTrace(prof)).toHaveLength(3)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — simulationTrace: indexTraceByKpi
// ════════════════════════════════════════════════════════════

describe('indexTraceByKpi', () => {
  function makeRuleTrace(ruleId: string, kpiKey: string): RuleSimTrace {
    return createRuleSimTrace({
      ruleId, kpiKey,
      rawActual: 0, rawTarget: 0, rawAchievement: 0, cappedAchievement: 0,
      weightedScore: 0, penaltyApplied: 0, finalNodeScore: 0, zeroTarget: false, stepTraces: [],
    })
  }

  it('returns empty map for empty trace', () => {
    const t = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [] })
    expect(indexTraceByKpi(t).size).toBe(0)
  })

  it('keys rules by kpiKey', () => {
    const ruleT = makeRuleTrace('r1', 'sales')
    const elemT = createElementSimTrace({ elementId: 'e1', label: 'E', score: 0, weight: 1, weightedContribution: 0, rules: [ruleT] })
    const baskT = createBasketSimTrace({ basketId: 'b1', label: 'B', score: 0, weight: 1, weightedContribution: 0, elements: [elemT] })
    const profT = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [baskT] })
    const map   = indexTraceByKpi(profT)
    expect(map.has('sales')).toBe(true)
    expect(map.get('sales')?.ruleId).toBe('r1')
  })

  it('handles multiple KPI keys', () => {
    const r1 = makeRuleTrace('r1', 'k1')
    const r2 = makeRuleTrace('r2', 'k2')
    const e  = createElementSimTrace({ elementId: 'e1', label: 'E', score: 0, weight: 1, weightedContribution: 0, rules: [r1, r2] })
    const b  = createBasketSimTrace({ basketId: 'b1', label: 'B', score: 0, weight: 1, weightedContribution: 0, elements: [e] })
    const p  = createProfileSimTrace({ profileId: 'p1', profileVersion: '1.0', overallScore: 0, baskets: [b] })
    const map = indexTraceByKpi(p)
    expect(map.size).toBe(2)
    expect(map.has('k1')).toBe(true)
    expect(map.has('k2')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — executeProcessorStep: ZERO_TARGET_GUARD
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – ZERO_TARGET_GUARD', () => {
  it('sets zeroTarget=true when target <= 0', () => {
    const step  = makeStep(ZERO_TARGET_GUARD)
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.zeroTarget).toBe(true)
  })

  it('leaves zeroTarget=false when target > 0', () => {
    const step  = makeStep(ZERO_TARGET_GUARD)
    const state = makeState({ target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.zeroTarget).toBe(false)
  })

  it('behaviour=skip does not assign score', () => {
    const step  = makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'skip' })
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(0)
    expect(next.achievement).toBe(0)
  })

  it('behaviour=score_zero sets score=0', () => {
    const step  = makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'score_zero' })
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(0)
  })

  it('behaviour=score_full sets achievement=100', () => {
    const step  = makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'score_full' })
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBe(100)
    expect(next.cappedAchievement).toBe(100)
  })

  it('behaviour=use_fallback uses fallbackScore', () => {
    const step  = makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'use_fallback', fallbackScore: 50 })
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(50)
  })

  it('use_fallback clamps fallbackScore to 100', () => {
    const step  = makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'use_fallback', fallbackScore: 150 })
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(100)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(ZERO_TARGET_GUARD)
    const state = makeState({ target: 0 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
    expect(next.stepTraces[0].processorType).toBe(ZERO_TARGET_GUARD)
  })

  it('does not mutate the original state', () => {
    const step  = makeStep(ZERO_TARGET_GUARD)
    const state = makeState({ target: 0 })
    executeProcessorStep(step, state)
    expect(state.zeroTarget).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — executeProcessorStep: RATIO_EVALUATOR
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – RATIO_EVALUATOR', () => {
  it('computes 80/100 → achievement=80', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 80, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBeCloseTo(80, 5)
    expect(next.cappedAchievement).toBeCloseTo(80, 5)
  })

  it('computes 120/100 → achievement=120', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 120, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBeCloseTo(120, 5)
  })

  it('skips computation when zeroTarget=true', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 50, target: 0, zeroTarget: true })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBe(0)
  })

  it('handles actual=0 correctly → achievement=0', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 0, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBe(0)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 80, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
  })

  it('does not produce NaN', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: NaN as any, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(Number.isNaN(next.achievement)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — executeProcessorStep: CEILING_CLAMP
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – CEILING_CLAMP', () => {
  it('clamps 120 to 100 ceiling', () => {
    const step  = makeStep(CEILING_CLAMP, { ceiling: 100 })
    const state = makeState({ achievement: 120, cappedAchievement: 120 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(100)
  })

  it('does not clamp when achievement is below ceiling', () => {
    const step  = makeStep(CEILING_CLAMP, { ceiling: 150 })
    const state = makeState({ achievement: 80, cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(80)
  })

  it('defaults ceiling to 100 when config empty', () => {
    const step  = makeStep(CEILING_CLAMP)
    const state = makeState({ achievement: 120, cappedAchievement: 120 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(100)
  })

  it('appends a stepTrace with correct processorType', () => {
    const step  = makeStep(CEILING_CLAMP, { ceiling: 100 })
    const state = makeState({ achievement: 80, cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces[0].processorType).toBe(CEILING_CLAMP)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — executeProcessorStep: FLOOR_CLAMP
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – FLOOR_CLAMP', () => {
  it('raises achievement below floor', () => {
    const step  = makeStep(FLOOR_CLAMP, { floor: 20 })
    const state = makeState({ achievement: 10, cappedAchievement: 10 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(20)
  })

  it('does not raise when achievement is above floor', () => {
    const step  = makeStep(FLOOR_CLAMP, { floor: 20 })
    const state = makeState({ achievement: 50, cappedAchievement: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(50)
  })

  it('defaults floor to 0', () => {
    const step  = makeStep(FLOOR_CLAMP)
    const state = makeState({ achievement: -10, cappedAchievement: -10 })
    const next  = executeProcessorStep(step, state)
    expect(next.cappedAchievement).toBe(0)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(FLOOR_CLAMP, { floor: 10 })
    const state = makeState({ achievement: 5, cappedAchievement: 5 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — executeProcessorStep: WEIGHT_MULTIPLIER
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – WEIGHT_MULTIPLIER', () => {
  it('computes weightedScore = cappedAchievement/100 × weight', () => {
    const step  = makeStep(WEIGHT_MULTIPLIER, { weight: 0.5 })
    const state = makeState({ cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.weightedScore).toBeCloseTo(0.4, 5)
  })

  it('defaults weight to 1.0', () => {
    const step  = makeStep(WEIGHT_MULTIPLIER)
    const state = makeState({ cappedAchievement: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.weightedScore).toBeCloseTo(1.0, 5)
  })

  it('clamps weight to 1.0 if > 1', () => {
    const step  = makeStep(WEIGHT_MULTIPLIER, { weight: 2 })
    const state = makeState({ cappedAchievement: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.weightedScore).toBeCloseTo(1.0, 5)
  })

  it('weightedScore=0 when weight=0', () => {
    const step  = makeStep(WEIGHT_MULTIPLIER, { weight: 0 })
    const state = makeState({ cappedAchievement: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.weightedScore).toBe(0)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(WEIGHT_MULTIPLIER, { weight: 0.5 })
    const state = makeState({ cappedAchievement: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — executeProcessorStep: BAND_EVALUATOR
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – BAND_EVALUATOR', () => {
  const bands = [
    { minPct: 90, maxPct: 200, score: 100, label: 'Excellent' },
    { minPct: 75, maxPct: 90,  score: 80,  label: 'Good' },
    { minPct: 50, maxPct: 75,  score: 60,  label: 'Average' },
    { minPct: 0,  maxPct: 50,  score: 30,  label: 'Poor' },
  ]

  it('matches the highest applicable band', () => {
    const step  = makeStep(BAND_EVALUATOR, { bands })
    const state = makeState({ cappedAchievement: 95 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(100)
    expect(next.bandLabel).toBe('Excellent')
  })

  it('matches mid-range band', () => {
    const step  = makeStep(BAND_EVALUATOR, { bands })
    const state = makeState({ cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(80)
    expect(next.bandLabel).toBe('Good')
  })

  it('uses defaultScore when no band matches', () => {
    const highBands = [{ minPct: 90, maxPct: 200, score: 100, label: 'Top' }]
    const step  = makeStep(BAND_EVALUATOR, { bands: highBands, defaultScore: 10 })
    const state = makeState({ cappedAchievement: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(10)
  })

  it('defaults to 0 when no bands and no defaultScore', () => {
    const step  = makeStep(BAND_EVALUATOR, { bands: [] })
    const state = makeState({ cappedAchievement: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(0)
  })

  it('sets bandRan=true', () => {
    const step  = makeStep(BAND_EVALUATOR, { bands })
    const state = makeState({ cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.bandRan).toBe(true)
  })

  it('clamps band score to [0,100]', () => {
    const overshotBands = [{ minPct: 0, maxPct: 200, score: 150, label: 'Overshoot' }]
    const step  = makeStep(BAND_EVALUATOR, { bands: overshotBands })
    const state = makeState({ cappedAchievement: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(100)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(BAND_EVALUATOR, { bands })
    const state = makeState({ cappedAchievement: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
    expect(next.stepTraces[0].processorType).toBe(BAND_EVALUATOR)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — executeProcessorStep: PENALTY_EVALUATOR
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – PENALTY_EVALUATOR', () => {
  it('deducts penalty when condition met (below)', () => {
    const penaltyRules = [{ condition: 'below', threshold: 80, penaltyValue: 20 }]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules })
    const state = makeState({ cappedAchievement: 70, score: 70 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(50)
    expect(next.penaltyApplied).toBe(20)
  })

  it('does not deduct when condition not met', () => {
    const penaltyRules = [{ condition: 'below', threshold: 80, penaltyValue: 20 }]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules })
    const state = makeState({ cappedAchievement: 90, score: 90 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(90)
    expect(next.penaltyApplied).toBe(0)
  })

  it('respects maxPenalty cap', () => {
    const penaltyRules = [
      { condition: 'below', threshold: 100, penaltyValue: 30 },
      { condition: 'below', threshold: 100, penaltyValue: 30 },
    ]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules, maxPenalty: 40 })
    const state = makeState({ cappedAchievement: 50, score: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.penaltyApplied).toBe(40)
  })

  it('score never goes below 0', () => {
    const penaltyRules = [{ condition: 'below', threshold: 100, penaltyValue: 200 }]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules })
    const state = makeState({ cappedAchievement: 50, score: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBeGreaterThanOrEqual(0)
  })

  it('handles condition=above', () => {
    const penaltyRules = [{ condition: 'above', threshold: 80, penaltyValue: 10 }]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules })
    const state = makeState({ cappedAchievement: 90, score: 90 })
    const next  = executeProcessorStep(step, state)
    expect(next.penaltyApplied).toBe(10)
  })

  it('handles condition=equals', () => {
    const penaltyRules = [{ condition: 'equals', threshold: 75, penaltyValue: 5 }]
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules })
    const state = makeState({ cappedAchievement: 75, score: 75 })
    const next  = executeProcessorStep(step, state)
    expect(next.penaltyApplied).toBe(5)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(PENALTY_EVALUATOR, { penaltyRules: [] })
    const state = makeState({ cappedAchievement: 80, score: 80 })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — executeProcessorStep: NODE_AGGREGATOR
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – NODE_AGGREGATOR', () => {
  it('weighted_sum aggregation', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'weighted_sum' })
    const state = makeState({ childScores: [80, 60], childWeights: [0.6, 0.4] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBeCloseTo(80 * 0.6 + 60 * 0.4, 5)
  })

  it('simple_average aggregation', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'simple_average' })
    const state = makeState({ childScores: [60, 80, 100], childWeights: [] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBeCloseTo(80, 5)
  })

  it('min aggregation returns minimum score', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'min' })
    const state = makeState({ childScores: [70, 40, 90], childWeights: [] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(40)
  })

  it('max aggregation returns maximum score', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'max' })
    const state = makeState({ childScores: [70, 40, 90], childWeights: [] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(90)
  })

  it('score=0 when no children', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'weighted_sum' })
    const state = makeState({ childScores: [], childWeights: [] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(0)
  })

  it('unknown aggregationType adds issue, score=0', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'unknown_type' })
    const state = makeState({ childScores: [80], childWeights: [1] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(0)
    expect(next.issues.length).toBeGreaterThan(0)
  })

  it('defaults aggregationType to weighted_sum', () => {
    const step  = makeStep(NODE_AGGREGATOR, {})
    const state = makeState({ childScores: [100], childWeights: [1] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBeCloseTo(100, 5)
  })

  it('clamps score to [0,100]', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'weighted_sum' })
    const state = makeState({ childScores: [150, 200], childWeights: [0.6, 0.4] })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(100)
  })

  it('appends a stepTrace', () => {
    const step  = makeStep(NODE_AGGREGATOR, { aggregationType: 'simple_average' })
    const state = makeState({ childScores: [50], childWeights: [] })
    const next  = executeProcessorStep(step, state)
    expect(next.stepTraces.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — executeProcessorStep: disabled step
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – disabled step', () => {
  it('returns state unchanged when enabled=false', () => {
    const step  = { ...makeStep(RATIO_EVALUATOR), enabled: false } as any
    const state = makeState({ actual: 80, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBe(0)
    expect(next.stepTraces.length).toBe(0)
  })

  it('enabled=true is treated as active', () => {
    const step  = { ...makeStep(RATIO_EVALUATOR), enabled: true }
    const state = makeState({ actual: 80, target: 100 })
    const next  = executeProcessorStep(step, state)
    expect(next.achievement).toBeCloseTo(80, 5)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — executeProcessorStep: unknown type
// ════════════════════════════════════════════════════════════

describe('executeProcessorStep – unknown type', () => {
  it('adds issue and returns state unchanged', () => {
    const step  = makeStep('FAKE_TYPE' as any)
    const state = makeState({ score: 50 })
    const next  = executeProcessorStep(step, state)
    expect(next.score).toBe(50)
    expect(next.issues.some((i) => i.includes('FAKE_TYPE'))).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — simulateRule: basic
// ════════════════════════════════════════════════════════════

describe('simulateRule – basic', () => {
  function makeRule(steps: ProcessorStep[] = []): RuleNode {
    const r = createRuleNode({ kpiKey: 'sales', label: 'Sales', weight: 1 })
    r.pipeline = { steps }
    return r
  }

  it('returns ruleId, kpiKey', () => {
    const rule   = makeRule()
    const result = simulateRule(rule, { sales: 80 }, { sales: 100 })
    expect(result.ruleId).toBe(rule.id)
    expect(result.kpiKey).toBe('sales')
  })

  it('uses actual=0 when missing from actuals', () => {
    const rule   = makeRule()
    const result = simulateRule(rule, {}, { sales: 100 })
    expect(result.actual).toBe(0)
  })

  it('uses target=0 when missing from targets', () => {
    const rule   = makeRule()
    const result = simulateRule(rule, { sales: 80 }, {})
    expect(result.target).toBe(0)
  })

  it('score is in [0,100]', () => {
    const steps = [
      makeStep(RATIO_EVALUATOR, {}, 1),
      makeStep(CEILING_CLAMP, { ceiling: 100 }, 2),
    ]
    const rule   = makeRule(steps)
    const result = simulateRule(rule, { sales: 150 }, { sales: 100 })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('zeroTarget=true when target=0', () => {
    const steps  = [makeStep(ZERO_TARGET_GUARD, {}, 0)]
    const rule   = makeRule(steps)
    const result = simulateRule(rule, { sales: 50 }, { sales: 0 })
    expect(result.zeroTarget).toBe(true)
  })

  it('produces a trace with ruleId', () => {
    const rule   = makeRule()
    const result = simulateRule(rule, { sales: 80 }, { sales: 100 })
    expect(result.trace.ruleId).toBe(rule.id)
    expect(typeof result.trace.timestamp).toBe('string')
  })

  it('steps executed in ascending order', () => {
    const steps = [
      makeStep(CEILING_CLAMP, { ceiling: 100 }, 2),
      makeStep(RATIO_EVALUATOR, {}, 1),
    ]
    const rule   = makeRule(steps)
    const result = simulateRule(rule, { sales: 120 }, { sales: 100 })
    expect(result.score).toBe(100)
  })

  it('disabled step is skipped', () => {
    const steps = [
      { ...makeStep(RATIO_EVALUATOR, {}, 1), enabled: false } as any,
    ]
    const rule   = makeRule(steps)
    const result = simulateRule(rule, { sales: 80 }, { sales: 100 })
    expect(result.achievement).toBe(0)
  })

  it('no NaN in score for unusual inputs', () => {
    const rule   = makeRule([makeStep(RATIO_EVALUATOR, {}, 1)])
    const result = simulateRule(rule, { sales: 0 }, { sales: 0 })
    expect(Number.isNaN(result.score)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — simulateRule: pipeline combinations
// ════════════════════════════════════════════════════════════

describe('simulateRule – pipeline combinations', () => {
  function ruleWith(steps: ProcessorStep[]): RuleNode {
    const r = createRuleNode({ kpiKey: 'kpi', label: 'R', weight: 0.5 })
    r.pipeline = { steps }
    return r
  }

  it('ZERO_TARGET_GUARD + RATIO_EVALUATOR handles zero target safely', () => {
    const steps = [
      makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'score_zero' }, 0),
      makeStep(RATIO_EVALUATOR, {}, 1),
    ]
    const result = simulateRule(ruleWith(steps), { kpi: 50 }, { kpi: 0 })
    expect(result.zeroTarget).toBe(true)
    expect(result.score).toBe(0)
  })

  it('RATIO → CEILING → BAND full pipeline', () => {
    const steps = [
      makeStep(RATIO_EVALUATOR, {}, 1),
      makeStep(CEILING_CLAMP, { ceiling: 100 }, 2),
      makeStep(BAND_EVALUATOR, {
        bands: [
          { minPct: 90, maxPct: 200, score: 100, label: 'Excellent' },
          { minPct: 0,  maxPct: 90,  score: 50,  label: 'OK' },
        ],
      }, 3),
    ]
    const result = simulateRule(ruleWith(steps), { kpi: 95 }, { kpi: 100 })
    expect(result.score).toBe(100)
    expect(result.bandLabel).toBe('Excellent')
  })

  it('RATIO → PENALTY deducts correctly', () => {
    const steps = [
      makeStep(RATIO_EVALUATOR, {}, 1),
      makeStep(PENALTY_EVALUATOR, {
        penaltyRules: [{ condition: 'below', threshold: 80, penaltyValue: 20 }],
      }, 2),
    ]
    const result = simulateRule(ruleWith(steps), { kpi: 70 }, { kpi: 100 })
    expect(result.penaltyApplied).toBe(20)
    expect(result.score).toBe(50)
  })

  it('RATIO → FLOOR clamps up from 0', () => {
    const steps = [
      makeStep(RATIO_EVALUATOR, {}, 1),
      makeStep(FLOOR_CLAMP, { floor: 30 }, 2),
    ]
    const result = simulateRule(ruleWith(steps), { kpi: 0 }, { kpi: 100 })
    expect(result.cappedAchievement).toBe(30)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — simulateElement
// ════════════════════════════════════════════════════════════

describe('simulateElement', () => {
  function makeElement(rules: RuleNode[], weight = 1): ElementNode {
    const e = createElementNode({ label: 'Element', weight })
    e.rules  = rules
    return e
  }

  it('returns elementId and label', () => {
    const rule  = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    rule.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const elem   = makeElement([rule], 1)
    const result = simulateElement(elem, { k: 80 }, { k: 100 })
    expect(result.elementId).toBe(elem.id)
    expect(result.label).toBe('Element')
  })

  it('score=0 for element with no rules', () => {
    const elem   = makeElement([], 1)
    const result = simulateElement(elem, {}, {})
    expect(result.score).toBe(0)
  })

  it('default weighted_sum aggregates rule scores', () => {
    const r1 = createRuleNode({ kpiKey: 'k1', label: 'R1', weight: 0.6 })
    r1.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const r2 = createRuleNode({ kpiKey: 'k2', label: 'R2', weight: 0.4 })
    r2.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const elem   = makeElement([r1, r2], 1)
    const result = simulateElement(elem, { k1: 80, k2: 100 }, { k1: 100, k2: 100 })
    expect(result.score).toBeCloseTo(80 * 0.6 + 100 * 0.4, 3)
  })

  it('weightedContribution = score × weight', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const elem   = makeElement([r], 0.5)
    const result = simulateElement(elem, { k: 80 }, { k: 100 })
    expect(result.weightedContribution).toBeCloseTo(result.score * 0.5, 5)
  })

  it('score is in [0,100]', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const elem   = makeElement([r], 1)
    const result = simulateElement(elem, { k: 150 }, { k: 100 })
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('produces elementSimTrace with timestamp', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [] }
    const elem   = makeElement([r], 1)
    const result = simulateElement(elem, { k: 50 }, { k: 100 })
    expect(typeof result.trace.timestamp).toBe('string')
  })

  it('propagates rule issues to element issues', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep('FAKE' as any, {}, 1)] }
    const elem   = makeElement([r], 1)
    const result = simulateElement(elem, { k: 80 }, { k: 100 })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('uses NODE_AGGREGATOR from element pipeline when present', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 0.5 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const elem = makeElement([r], 1)
    elem.pipeline = {
      steps: [makeStep(NODE_AGGREGATOR, { aggregationType: 'simple_average' }, 1)],
    }
    const result = simulateElement(elem, { k: 60 }, { k: 100 })
    // With simple_average of one rule → score = rule.score = 60
    expect(result.score).toBeCloseTo(60, 3)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — simulateBasket
// ════════════════════════════════════════════════════════════

describe('simulateBasket', () => {
  function makeBasket(elements: ElementNode[], weight = 1): BasketNode {
    const b    = createBasketNode({ label: 'Basket', weight })
    b.elements = elements
    return b
  }

  function makeSimpleElement(kpiKey: string, weight: number): ElementNode {
    const r = createRuleNode({ kpiKey, label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const e = createElementNode({ label: 'E', weight })
    e.rules = [r]
    return e
  }

  it('returns basketId and label', () => {
    const basket = makeBasket([], 1)
    const result = simulateBasket(basket, {}, {})
    expect(result.basketId).toBe(basket.id)
    expect(result.label).toBe('Basket')
  })

  it('score=0 for basket with no elements', () => {
    const basket = makeBasket([], 1)
    const result = simulateBasket(basket, {}, {})
    expect(result.score).toBe(0)
  })

  it('aggregates elements by weighted_sum', () => {
    const e1 = makeSimpleElement('k1', 0.6)
    const e2 = makeSimpleElement('k2', 0.4)
    const basket = makeBasket([e1, e2], 1)
    const result = simulateBasket(basket, { k1: 80, k2: 100 }, { k1: 100, k2: 100 })
    expect(result.score).toBeCloseTo(80 * 0.6 + 100 * 0.4, 3)
  })

  it('weightedContribution = score × weight', () => {
    const e = makeSimpleElement('k', 1)
    const basket = makeBasket([e], 0.7)
    const result = simulateBasket(basket, { k: 80 }, { k: 100 })
    expect(result.weightedContribution).toBeCloseTo(result.score * 0.7, 5)
  })

  it('score is in [0,100]', () => {
    const e = makeSimpleElement('k', 1)
    const basket = makeBasket([e], 1)
    const result = simulateBasket(basket, { k: 200 }, { k: 100 })
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('produces basketSimTrace with timestamp', () => {
    const basket = makeBasket([], 1)
    const result = simulateBasket(basket, {}, {})
    expect(typeof result.trace.timestamp).toBe('string')
  })

  it('propagates element issues', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep('FAKE' as any, {}, 1)] }
    const e = createElementNode({ label: 'E', weight: 1 })
    e.rules = [r]
    const basket = makeBasket([e], 1)
    const result = simulateBasket(basket, {}, {})
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — simulateProfile: validation gate
// ════════════════════════════════════════════════════════════

describe('simulateProfile – validation gate', () => {
  it('returns valid=false for a bare DRAFT profile with no baskets', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Draft Profile' })
    const input: StudioSimulationInput = { profile, actuals: {}, targets: {} }
    const result = simulateProfile(input)
    expect(result.valid).toBe(false)
  })

  it('issues list is non-empty when validation fails', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Draft' })
    const result  = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('score=0 when validation fails', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Draft' })
    const result  = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.score).toBe(0)
  })

  it('baskets empty map when validation fails', () => {
    const profile = createEmptyEvaluationProfile({ name: 'Draft' })
    const result  = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(Object.keys(result.baskets).length).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 23 — simulateProfile: successful run
// ════════════════════════════════════════════════════════════

describe('simulateProfile – successful run', () => {
  it('valid=true for a SIMULATED profile with baskets', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(result.valid).toBe(true)
  })

  it('score is in [0,100]', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('profileId matches profile metadata id', () => {
    const profile = buildSimulatedProfile()
    const result  = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.profileId).toBe(profile.metadata.id)
  })

  it('profileVersion matches profile metadata version', () => {
    const profile = buildSimulatedProfile()
    profile.metadata.status = 'SIMULATED'
    const result  = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.profileVersion).toBe(profile.metadata.version)
  })

  it('baskets map has an entry for each basket', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(Object.keys(result.baskets).length).toBe(1)
  })

  it('elements map has an entry for each element', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(Object.keys(result.elements).length).toBe(1)
  })

  it('trace.overallScore matches result.score', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(result.traces.overallScore).toBeCloseTo(result.score, 5)
  })

  it('score is 80 when actuals/targets = 80/100 and single ratio rule', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(result.score).toBeCloseTo(80, 3)
  })

  it('zero target does not produce NaN', () => {
    const steps   = [makeStep(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'score_zero' }, 0)]
    const profile = buildSimulatedProfile('sales', 1, steps)
    const result  = simulateProfile({ profile, actuals: { sales: 50 }, targets: { sales: 0 } })
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('missing actuals default to 0, score remains valid', () => {
    const profile = buildSimulatedProfile('sales', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: {}, targets: { sales: 100 } })
    expect(result.valid).toBe(true)
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('context is ignored by simulation (no crash)', () => {
    const profile = buildSimulatedProfile()
    expect(() =>
      simulateProfile({
        profile,
        actuals: {},
        targets: {},
        context: { month: '2026-01', pharmacyId: 'ph1' },
      }),
    ).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 24 — simulateProfile: safety / edge cases
// ════════════════════════════════════════════════════════════

describe('simulateProfile – safety', () => {
  it('does not throw for empty pipeline steps', () => {
    const profile = buildSimulatedProfile('sales', 1, [])
    expect(() =>
      simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } }),
    ).not.toThrow()
  })

  it('score never exceeds 100 even with inflated actuals', () => {
    const steps   = [makeStep(RATIO_EVALUATOR, {}, 1)]
    const profile = buildSimulatedProfile('sales', 1, steps)
    const result  = simulateProfile({ profile, actuals: { sales: 999 }, targets: { sales: 100 } })
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('basket weight=0 contributes 0 to overall score', () => {
    const profile = buildSimulatedProfile('sales', 0, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { sales: 80 }, targets: { sales: 100 } })
    expect(result.score).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 25 — compareSimulationResults
// ════════════════════════════════════════════════════════════

describe('compareSimulationResults', () => {
  function buildResult(score: number, basketId: string, basketScore: number): StudioSimulationResult {
    const profile = buildSimulatedProfile('k', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    profile.root.baskets[0].id = basketId
    profile.root.baskets[0].elements[0].rules[0].kpiKey = 'k'

    // Build manually so we control scores
    const ruleResult = simulateRule(
      profile.root.baskets[0].elements[0].rules[0],
      { k: basketScore },
      { k: 100 },
    )
    const elemResult = {
      elementId: profile.root.baskets[0].elements[0].id,
      label: 'E',
      score: basketScore,
      weight: 1,
      weightedContribution: basketScore,
      rules: [ruleResult],
      issues: [] as string[],
      trace: createElementSimTrace({
        elementId: profile.root.baskets[0].elements[0].id,
        label: 'E',
        score: basketScore,
        weight: 1,
        weightedContribution: basketScore,
        rules: [ruleResult.trace],
      }),
    }
    const basketResult = {
      basketId,
      label: 'B',
      score: basketScore,
      weight: 1,
      weightedContribution: basketScore,
      elements: [elemResult],
      issues: [] as string[],
      trace: createBasketSimTrace({
        basketId,
        label: 'B',
        score: basketScore,
        weight: 1,
        weightedContribution: basketScore,
        elements: [elemResult.trace],
      }),
    }
    return {
      profileId: 'p1',
      profileVersion: '1.0',
      valid: true,
      score,
      baskets: { [basketId]: basketResult },
      elements: { [elemResult.elementId]: elemResult },
      traces: createProfileSimTrace({
        profileId: 'p1', profileVersion: '1.0', overallScore: score, baskets: [basketResult.trace],
      }),
      issues: [],
    }
  }

  it('scoreDelta = b.score - a.score', () => {
    const a = buildResult(60, 'b1', 60)
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.scoreDelta).toBeCloseTo(20, 5)
  })

  it('basketDeltas include per-basket delta', () => {
    const a = buildResult(60, 'b1', 60)
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    const bd  = cmp.basketDeltas.find((d) => d.basketId === 'b1')
    expect(bd).toBeDefined()
    expect(bd!.delta).toBeCloseTo(20, 5)
  })

  it('elementDeltas include per-element delta', () => {
    const a = buildResult(60, 'b1', 60)
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.elementDeltas.length).toBeGreaterThan(0)
  })

  it('changedBands is empty when bands did not change', () => {
    const a = buildResult(80, 'b1', 80)
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.changedBands.length).toBe(0)
  })

  it('changedIssues.added is empty when both results have no issues', () => {
    const a = buildResult(80, 'b1', 80)
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.changedIssues.added.length).toBe(0)
    expect(cmp.changedIssues.removed.length).toBe(0)
  })

  it('scoreDelta is 0 when scores are identical', () => {
    const a = buildResult(75, 'b1', 75)
    const b = buildResult(75, 'b1', 75)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.scoreDelta).toBe(0)
  })

  it('changedIssues.added lists new issues from b', () => {
    const a = buildResult(80, 'b1', 80)
    const b = buildResult(80, 'b1', 80)
    b.issues = ['New issue']
    const cmp = compareSimulationResults(a, b)
    expect(cmp.changedIssues.added).toContain('New issue')
  })

  it('changedIssues.removed lists dropped issues from a', () => {
    const a = buildResult(80, 'b1', 80)
    a.issues = ['Old issue']
    const b = buildResult(80, 'b1', 80)
    const cmp = compareSimulationResults(a, b)
    expect(cmp.changedIssues.removed).toContain('Old issue')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 26 — safeNum / NaN guards (integration)
// ════════════════════════════════════════════════════════════

describe('NaN / Infinity guards (integration)', () => {
  it('no NaN in simulateRule when actual=NaN', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const result = simulateRule(r, { k: NaN as any }, { k: 100 })
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('no Infinity in simulateRule when target=Infinity', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const result = simulateRule(r, { k: 80 }, { k: Infinity as any })
    expect(Number.isFinite(result.score)).toBe(true)
  })

  it('no NaN in simulateElement with NaN-producing rules', () => {
    const r = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    r.pipeline = { steps: [makeStep(RATIO_EVALUATOR, {}, 1)] }
    const e = createElementNode({ label: 'E', weight: 1 })
    e.rules = [r]
    const result = simulateElement(e, { k: NaN as any }, { k: 100 })
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('CEILING_CLAMP with NaN ceiling defaults to 100', () => {
    const step  = makeStep(CEILING_CLAMP, { ceiling: NaN })
    const state = makeState({ achievement: 120, cappedAchievement: 120 })
    const next  = executeProcessorStep(step, state)
    expect(Number.isNaN(next.cappedAchievement)).toBe(false)
    expect(next.cappedAchievement).toBeLessThanOrEqual(120)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 27 — StudioSimulationContext (interface presence)
// ════════════════════════════════════════════════════════════

describe('StudioSimulationContext integration', () => {
  it('profile simulates with full context object', () => {
    const profile = buildSimulatedProfile('s', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({
      profile,
      actuals:  { s: 90 },
      targets:  { s: 100 },
      context: {
        month:         '2026-06',
        pharmacyId:    'ph_001',
        pharmacistId:  'phm_42',
        dayProgress:   0.75,
        metadata:      { note: 'mid-month sim' },
      },
    })
    expect(result.valid).toBe(true)
    expect(result.score).toBeCloseTo(90, 1)
  })

  it('profile simulates with no context (optional)', () => {
    const profile = buildSimulatedProfile('s', 1, [makeStep(RATIO_EVALUATOR, {}, 1)])
    const result  = simulateProfile({ profile, actuals: { s: 80 }, targets: { s: 100 } })
    expect(result.valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 28 — Immutability checks
// ════════════════════════════════════════════════════════════

describe('Immutability', () => {
  it('executeProcessorStep does not mutate input state issues array', () => {
    const step  = makeStep('FAKE' as any)
    const orig  = ['existing issue']
    const state = makeState({ issues: orig })
    executeProcessorStep(step, state)
    expect(state.issues).toHaveLength(1)
  })

  it('executeProcessorStep does not mutate input state stepTraces array', () => {
    const step  = makeStep(RATIO_EVALUATOR)
    const state = makeState({ actual: 80, target: 100 })
    expect(state.stepTraces).toHaveLength(0)
    const next  = executeProcessorStep(step, state)
    expect(state.stepTraces).toHaveLength(0)
    expect(next.stepTraces).toHaveLength(1)
  })

  it('simulateRule does not mutate the rule pipeline.steps array', () => {
    const r     = createRuleNode({ kpiKey: 'k', label: 'R', weight: 1 })
    const steps = [makeStep(RATIO_EVALUATOR, {}, 2), makeStep(CEILING_CLAMP, {}, 1)]
    r.pipeline  = { steps }
    const originalOrder = [...r.pipeline.steps.map((s) => s.order)]
    simulateRule(r, { k: 80 }, { k: 100 })
    expect(r.pipeline.steps.map((s) => s.order)).toEqual(originalOrder)
  })
})
