// ============================================================
// Profile Studio Phase 0C — Processor Configuration Kernel Tests
//
// Groups:
//   1   (1-3):     File existence
//   2   (4-11):    Config factory functions — one per processor type
//   3   (12-18):   Config defaults and types
//   4   (19-25):   createEmptyPipeline / createPipelineStep
//   5   (26-31):   findStep / getStepIndex
//   6   (32-37):   flattenPipeline / countEnabledSteps
//   7   (38-44):   moveStep
//   8   (45-50):   removeStep
//   9   (51-57):   toggleStep
//   10  (58-62):   clonePipeline — immutability
//   11  (63-68):   Guards: canAdd / canRemove / canMove / canDisable / canEnable
//   12  (69-74):   validateDuplicateStepIds
//   13  (75-80):   validateProcessorOrder — one rule per ordering constraint
//   14  (81-86):   validateBandDefinitions
//   15  (87-91):   validatePenaltyDefinitions
//   16  (92-97):   validateRequiredConfig
//   17  (98-104):  validateProcessorConfig — value validation
//   18  (105-109): validatePipeline combined
//   19  (110-114): Trace compatibility types (source-level)
//   20  (115-118): validateProcessorConfigurations in validation.ts
//   21  (119-121): No throws
//   22  (122-135): Guardrails
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Live imports ──────────────────────────────────────────────

import {
  createRatioEvaluatorConfig,
  createCeilingClampConfig,
  createFloorClampConfig,
  createWeightMultiplierConfig,
  createBandEvaluatorConfig,
  createPenaltyEvaluatorConfig,
  createNodeAggregatorConfig,
  createZeroTargetGuardConfig,
} from './processorConfig'
import type {
  BandDefinition,
  PenaltyRule,
  AnyProcessorConfig,
} from './processorConfig'

import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
} from './processors'

import {
  createEmptyPipeline,
  createPipelineStep,
  findStep,
  getStepIndex,
  flattenPipeline,
  countEnabledSteps,
  moveStep,
  removeStep,
  toggleStep,
  clonePipeline,
  canAddProcessor,
  canRemoveProcessor,
  canMoveProcessor,
  canDisableProcessor,
  canEnableProcessor,
} from './pipeline'
import type { ProcessorPipelineDefinition } from './pipeline'

import {
  validateDuplicateStepIds,
  validateProcessorOrder,
  validateBandDefinitions,
  validatePenaltyDefinitions,
  validateRequiredConfig,
  validateProcessorConfig,
  validatePipeline,
  validateProcessorStepConfig,
} from './processorValidation'

import {
  validateProcessorConfigurations,
  validateProfile,
} from './validation'

import {
  createEmptyEvaluationProfile,
  createBasketNode,
  createElementNode,
  createRuleNode,
} from './profileFactory'

import type { EvaluationProfileDraft } from './types'

// ── Raw source imports ────────────────────────────────────────

const processorConfigSrc    = () => import('./processorConfig.ts?raw').then((m) => m.default)
const pipelineSrc           = () => import('./pipeline.ts?raw').then((m) => m.default)
const processorValidationSrc = () => import('./processorValidation.ts?raw').then((m) => m.default)
const validationSrc         = () => import('./validation.ts?raw').then((m) => m.default)

// ── Fixtures ──────────────────────────────────────────────────

const sampleBands: BandDefinition[] = [
  { id: 'b1', label: 'High',   minPct: 80, maxPct: 100, score: 100 },
  { id: 'b2', label: 'Medium', minPct: 50, maxPct: 80,  score: 70  },
  { id: 'b3', label: 'Low',    minPct: 0,  maxPct: 50,  score: 30  },
]

const samplePenaltyRules: PenaltyRule[] = [
  { id: 'p1', condition: 'below', threshold: 60, penaltyValue: 10, label: 'Below 60' },
]

function makeSimplePipeline(): ProcessorPipelineDefinition {
  const p     = createEmptyPipeline()
  const ratio = createRatioEvaluatorConfig()
  const ceil  = createCeilingClampConfig({ ceiling: 200 })
  const step1 = createPipelineStep(ratio, 0)
  const step2 = createPipelineStep(ceil,  1)
  return { ...p, steps: [step1, step2] }
}

function makeMinimalProfile(): EvaluationProfileDraft {
  const p       = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
  const basket  = createBasketNode({ label: 'B', weight: 1.0 })
  const element = createElementNode({ label: 'E', weight: 1.0 })
  const rule    = createRuleNode({ kpiKey: 'wasfaty', label: 'W', weight: 1.0 })
  element.rules.push(rule)
  basket.elements.push(element)
  p.root.baskets.push(basket)
  return p
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — File existence
// ════════════════════════════════════════════════════════════

describe('Phase 0C › File existence', () => {
  it('processorConfig.ts exists and is non-empty (test 1)', async () => {
    const s = await processorConfigSrc()
    expect(s.length).toBeGreaterThan(200)
    expect(s).toContain('RatioEvaluatorConfig')
  })

  it('pipeline.ts exists and exports key symbols (test 2)', async () => {
    const s = await pipelineSrc()
    expect(s).toContain('createEmptyPipeline')
    expect(s).toContain('ProcessorPipelineDefinition')
  })

  it('processorValidation.ts exists and exports key validators (test 3)', async () => {
    const s = await processorValidationSrc()
    expect(s).toContain('validatePipeline')
    expect(s).toContain('validateProcessorOrder')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — Config factory functions (one per processor type)
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Config factory functions', () => {
  it('createRatioEvaluatorConfig returns correct processorType (test 4)', () => {
    expect(createRatioEvaluatorConfig().processorType).toBe(RATIO_EVALUATOR)
  })

  it('createCeilingClampConfig preserves ceiling value (test 5)', () => {
    const cfg = createCeilingClampConfig({ ceiling: 150 })
    expect(cfg.processorType).toBe(CEILING_CLAMP)
    expect(cfg.ceiling).toBe(150)
  })

  it('createFloorClampConfig preserves floor value (test 6)', () => {
    const cfg = createFloorClampConfig({ floor: 0 })
    expect(cfg.processorType).toBe(FLOOR_CLAMP)
    expect(cfg.floor).toBe(0)
  })

  it('createWeightMultiplierConfig preserves weight (test 7)', () => {
    const cfg = createWeightMultiplierConfig({ weight: 0.4 })
    expect(cfg.processorType).toBe(WEIGHT_MULTIPLIER)
    expect(cfg.weight).toBe(0.4)
  })

  it('createBandEvaluatorConfig preserves bands array (test 8)', () => {
    const cfg = createBandEvaluatorConfig({ bands: sampleBands })
    expect(cfg.processorType).toBe(BAND_EVALUATOR)
    expect(cfg.bands).toHaveLength(3)
  })

  it('createPenaltyEvaluatorConfig preserves penaltyRules (test 9)', () => {
    const cfg = createPenaltyEvaluatorConfig({ penaltyRules: samplePenaltyRules })
    expect(cfg.processorType).toBe(PENALTY_EVALUATOR)
    expect(cfg.penaltyRules).toHaveLength(1)
  })

  it('createNodeAggregatorConfig preserves aggregationType (test 10)', () => {
    const cfg = createNodeAggregatorConfig({ aggregationType: 'weighted_sum' })
    expect(cfg.processorType).toBe(NODE_AGGREGATOR)
    expect(cfg.aggregationType).toBe('weighted_sum')
  })

  it('createZeroTargetGuardConfig preserves zeroTargetBehaviour (test 11)', () => {
    const cfg = createZeroTargetGuardConfig({ zeroTargetBehaviour: 'score_zero' })
    expect(cfg.processorType).toBe(ZERO_TARGET_GUARD)
    expect(cfg.zeroTargetBehaviour).toBe('score_zero')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — Config defaults and additional properties
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Config defaults', () => {
  it('all factory configs default enabled to true (test 12)', () => {
    expect(createRatioEvaluatorConfig().enabled).toBe(true)
    expect(createCeilingClampConfig({ ceiling: 200 }).enabled).toBe(true)
    expect(createNodeAggregatorConfig({ aggregationType: 'min' }).enabled).toBe(true)
  })

  it('all factory configs default version to 1.0.0 (test 13)', () => {
    expect(createRatioEvaluatorConfig().version).toBe('1.0.0')
    expect(createFloorClampConfig({ floor: 0 }).version).toBe('1.0.0')
  })

  it('factory configs generate unique ids across calls (test 14)', () => {
    const ids = new Set(Array.from({ length: 10 }, () => createRatioEvaluatorConfig().id))
    expect(ids.size).toBe(10)
  })

  it('enabled can be overridden via options (test 15)', () => {
    const cfg = createRatioEvaluatorConfig({ enabled: false })
    expect(cfg.enabled).toBe(false)
  })

  it('label can be overridden (test 16)', () => {
    const cfg = createCeilingClampConfig({ ceiling: 100, label: 'My Cap' })
    expect(cfg.label).toBe('My Cap')
  })

  it('ZeroTargetGuard with use_fallback stores fallbackScore (test 17)', () => {
    const cfg = createZeroTargetGuardConfig({ zeroTargetBehaviour: 'use_fallback', fallbackScore: 50 })
    expect(cfg.fallbackScore).toBe(50)
  })

  it('BandEvaluatorConfig accepts optional defaultScore (test 18)', () => {
    const cfg = createBandEvaluatorConfig({ bands: sampleBands, defaultScore: 0 })
    expect(cfg.defaultScore).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — createEmptyPipeline / createPipelineStep
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Pipeline factories', () => {
  it('createEmptyPipeline returns pipeline with no steps (test 19)', () => {
    const p = createEmptyPipeline()
    expect(p.steps).toHaveLength(0)
  })

  it('createEmptyPipeline uses default version 1.0.0 (test 20)', () => {
    expect(createEmptyPipeline().version).toBe('1.0.0')
  })

  it('createEmptyPipeline generates a unique pipelineId (test 21)', () => {
    const ids = new Set(Array.from({ length: 5 }, () => createEmptyPipeline().pipelineId))
    expect(ids.size).toBe(5)
  })

  it('createEmptyPipeline accepts custom label and version (test 22)', () => {
    const p = createEmptyPipeline({ label: 'My Pipeline', version: '2.0.0' })
    expect(p.label).toBe('My Pipeline')
    expect(p.version).toBe('2.0.0')
  })

  it('createPipelineStep sets order from argument (test 23)', () => {
    const cfg  = createRatioEvaluatorConfig()
    const step = createPipelineStep(cfg, 5)
    expect(step.order).toBe(5)
  })

  it('createPipelineStep defaults enabled from config (test 24)', () => {
    const cfg  = createRatioEvaluatorConfig({ enabled: false })
    const step = createPipelineStep(cfg, 0)
    expect(step.enabled).toBe(false)
  })

  it('createPipelineStep generates unique stepId (test 25)', () => {
    const cfg  = createRatioEvaluatorConfig()
    const ids  = new Set(Array.from({ length: 5 }, () => createPipelineStep(cfg, 0).stepId))
    expect(ids.size).toBe(5)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — findStep / getStepIndex
// ════════════════════════════════════════════════════════════

describe('Phase 0C › findStep / getStepIndex', () => {
  it('findStep returns the correct step (test 26)', () => {
    const p    = makeSimplePipeline()
    const step = p.steps[0]
    expect(findStep(p, step.stepId)?.stepId).toBe(step.stepId)
  })

  it('findStep returns null for unknown stepId (test 27)', () => {
    const p = makeSimplePipeline()
    expect(findStep(p, 'ghost_step')).toBeNull()
  })

  it('getStepIndex returns correct index (test 28)', () => {
    const p = makeSimplePipeline()
    expect(getStepIndex(p, p.steps[0].stepId)).toBe(0)
    expect(getStepIndex(p, p.steps[1].stepId)).toBe(1)
  })

  it('getStepIndex returns -1 for unknown id (test 29)', () => {
    const p = makeSimplePipeline()
    expect(getStepIndex(p, 'nope')).toBe(-1)
  })

  it('findStep is reference-equal to steps array element (test 30)', () => {
    const p    = makeSimplePipeline()
    const step = p.steps[1]
    expect(findStep(p, step.stepId)).toBe(step)
  })

  it('findStep works after toggleStep mutates the list (test 31)', () => {
    const p    = makeSimplePipeline()
    const id   = p.steps[0].stepId
    const p2   = toggleStep(p, id)
    expect(findStep(p2, id)).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — flattenPipeline / countEnabledSteps
// ════════════════════════════════════════════════════════════

describe('Phase 0C › flattenPipeline / countEnabledSteps', () => {
  it('flattenPipeline returns steps sorted by order ascending (test 32)', () => {
    const p     = createEmptyPipeline()
    const cfg1  = createRatioEvaluatorConfig()
    const cfg2  = createCeilingClampConfig({ ceiling: 200 })
    const step1 = createPipelineStep(cfg1, 1)
    const step2 = createPipelineStep(cfg2, 0)  // order=0 comes first
    const p2    = { ...p, steps: [step1, step2] }
    const flat  = flattenPipeline(p2)
    expect(flat[0].config.processorType).toBe(CEILING_CLAMP)
    expect(flat[1].config.processorType).toBe(RATIO_EVALUATOR)
  })

  it('flattenPipeline returns a new array (not the original steps ref) (test 33)', () => {
    const p = makeSimplePipeline()
    expect(flattenPipeline(p)).not.toBe(p.steps)
  })

  it('flattenPipeline returns empty array for empty pipeline (test 34)', () => {
    expect(flattenPipeline(createEmptyPipeline())).toHaveLength(0)
  })

  it('countEnabledSteps returns 2 for pipeline with 2 enabled steps (test 35)', () => {
    expect(countEnabledSteps(makeSimplePipeline())).toBe(2)
  })

  it('countEnabledSteps returns 0 for empty pipeline (test 36)', () => {
    expect(countEnabledSteps(createEmptyPipeline())).toBe(0)
  })

  it('countEnabledSteps excludes disabled steps (test 37)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, p.steps[0].stepId)  // disable step 0
    expect(countEnabledSteps(p2)).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — moveStep
// ════════════════════════════════════════════════════════════

describe('Phase 0C › moveStep', () => {
  it('moveStep moves a step to a new index (test 38)', () => {
    const p    = makeSimplePipeline()
    const step = p.steps[0]
    const p2   = moveStep(p, step.stepId, 1)
    expect(flattenPipeline(p2)[1].stepId).toBe(step.stepId)
  })

  it('moveStep reorders order values sequentially (test 39)', () => {
    const p    = makeSimplePipeline()
    const p2   = moveStep(p, p.steps[0].stepId, 1)
    const flat = flattenPipeline(p2)
    expect(flat.map((s) => s.order)).toEqual([0, 1])
  })

  it('original pipeline unchanged after moveStep (test 40)', () => {
    const p      = makeSimplePipeline()
    const origId = p.steps[0].stepId
    moveStep(p, origId, 1)
    expect(p.steps[0].stepId).toBe(origId)
  })

  it('moveStep with unknown stepId returns pipeline unchanged (test 41)', () => {
    const p  = makeSimplePipeline()
    const p2 = moveStep(p, 'ghost', 0)
    expect(p2.steps.length).toBe(p.steps.length)
  })

  it('moveStep clamps out-of-bounds newIndex to end (test 42)', () => {
    const p    = makeSimplePipeline()
    const step = p.steps[0]
    const p2   = moveStep(p, step.stepId, 999)
    expect(flattenPipeline(p2)[flattenPipeline(p2).length - 1].stepId).toBe(step.stepId)
  })

  it('moveStep to index 0 places step first (test 43)', () => {
    const p    = makeSimplePipeline()
    const last = flattenPipeline(p)[1]
    const p2   = moveStep(p, last.stepId, 0)
    expect(flattenPipeline(p2)[0].stepId).toBe(last.stepId)
  })

  it('moveStep preserves all steps (test 44)', () => {
    const p  = makeSimplePipeline()
    const p2 = moveStep(p, p.steps[0].stepId, 1)
    expect(p2.steps.length).toBe(p.steps.length)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — removeStep
// ════════════════════════════════════════════════════════════

describe('Phase 0C › removeStep', () => {
  it('removeStep removes the step with matching stepId (test 45)', () => {
    const p    = makeSimplePipeline()
    const id   = p.steps[0].stepId
    const p2   = removeStep(p, id)
    expect(findStep(p2, id)).toBeNull()
  })

  it('removeStep reduces step count by 1 (test 46)', () => {
    const p  = makeSimplePipeline()
    const p2 = removeStep(p, p.steps[0].stepId)
    expect(p2.steps.length).toBe(p.steps.length - 1)
  })

  it('original pipeline unchanged after removeStep (test 47)', () => {
    const p    = makeSimplePipeline()
    const orig = p.steps.length
    removeStep(p, p.steps[0].stepId)
    expect(p.steps.length).toBe(orig)
  })

  it('removeStep with unknown id returns pipeline unchanged (test 48)', () => {
    const p  = makeSimplePipeline()
    const p2 = removeStep(p, 'ghost')
    expect(p2.steps.length).toBe(p.steps.length)
  })

  it('remaining step preserved after remove (test 49)', () => {
    const p       = makeSimplePipeline()
    const keepId  = p.steps[1].stepId
    const p2      = removeStep(p, p.steps[0].stepId)
    expect(findStep(p2, keepId)).not.toBeNull()
  })

  it('removeStep returns new pipeline object (test 50)', () => {
    const p  = makeSimplePipeline()
    const p2 = removeStep(p, p.steps[0].stepId)
    expect(p2).not.toBe(p)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — toggleStep
// ════════════════════════════════════════════════════════════

describe('Phase 0C › toggleStep', () => {
  it('toggleStep disables an enabled step (test 51)', () => {
    const p  = makeSimplePipeline()
    const id = p.steps[0].stepId
    expect(p.steps[0].enabled).toBe(true)
    const p2 = toggleStep(p, id)
    expect(findStep(p2, id)!.enabled).toBe(false)
  })

  it('toggleStep enables a disabled step (test 52)', () => {
    const p  = makeSimplePipeline()
    const id = p.steps[0].stepId
    const p2 = toggleStep(p, id)     // disable
    const p3 = toggleStep(p2, id)    // re-enable
    expect(findStep(p3, id)!.enabled).toBe(true)
  })

  it('original pipeline unchanged after toggleStep (test 53)', () => {
    const p    = makeSimplePipeline()
    const orig = p.steps[0].enabled
    toggleStep(p, p.steps[0].stepId)
    expect(p.steps[0].enabled).toBe(orig)
  })

  it('toggleStep returns new pipeline object (test 54)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, p.steps[0].stepId)
    expect(p2).not.toBe(p)
  })

  it('toggleStep does not affect other steps (test 55)', () => {
    const p   = makeSimplePipeline()
    const id0 = p.steps[0].stepId
    const id1 = p.steps[1].stepId
    const p2  = toggleStep(p, id0)
    expect(findStep(p2, id1)!.enabled).toBe(true)  // unchanged
  })

  it('toggleStep with unknown id returns pipeline unchanged (test 56)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, 'ghost')
    expect(p2.steps[0].enabled).toBe(p.steps[0].enabled)
  })

  it('countEnabledSteps reflects toggle correctly (test 57)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, p.steps[0].stepId)
    expect(countEnabledSteps(p2)).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — clonePipeline immutability
// ════════════════════════════════════════════════════════════

describe('Phase 0C › clonePipeline', () => {
  it('clonePipeline returns a new object (test 58)', () => {
    const p = makeSimplePipeline()
    expect(clonePipeline(p)).not.toBe(p)
  })

  it('clonePipeline produces deep clone — mutations do not affect original (test 59)', () => {
    const p    = makeSimplePipeline()
    const c    = clonePipeline(p)
    c.steps[0].enabled = false
    expect(p.steps[0].enabled).toBe(true)
  })

  it('cloned pipeline has same pipelineId and step count (test 60)', () => {
    const p = makeSimplePipeline()
    const c = clonePipeline(p)
    expect(c.pipelineId).toBe(p.pipelineId)
    expect(c.steps.length).toBe(p.steps.length)
  })

  it('cloned steps have same stepIds (test 61)', () => {
    const p    = makeSimplePipeline()
    const c    = clonePipeline(p)
    const ids  = p.steps.map((s) => s.stepId)
    const cIds = c.steps.map((s) => s.stepId)
    expect(cIds).toEqual(ids)
  })

  it('cloned config objects are separate references (test 62)', () => {
    const p = makeSimplePipeline()
    const c = clonePipeline(p)
    expect(c.steps[0].config).not.toBe(p.steps[0].config)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Guards
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Guards', () => {
  it('canAddProcessor returns true when config id is unique (test 63)', () => {
    const p   = makeSimplePipeline()
    const cfg = createRatioEvaluatorConfig()
    expect(canAddProcessor(p, cfg)).toBe(true)
  })

  it('canAddProcessor returns false when config id already exists (test 64)', () => {
    const p   = makeSimplePipeline()
    const cfg = p.steps[0].config
    expect(canAddProcessor(p, cfg as AnyProcessorConfig)).toBe(false)
  })

  it('canRemoveProcessor returns true for existing step (test 65)', () => {
    const p = makeSimplePipeline()
    expect(canRemoveProcessor(p, p.steps[0].stepId)).toBe(true)
  })

  it('canRemoveProcessor returns false for non-existent step (test 66)', () => {
    expect(canRemoveProcessor(makeSimplePipeline(), 'ghost')).toBe(false)
  })

  it('canMoveProcessor returns true for valid new position (test 67)', () => {
    const p = makeSimplePipeline()
    expect(canMoveProcessor(p, p.steps[0].stepId, 1)).toBe(true)
  })

  it('canMoveProcessor returns false when same index (test 68)', () => {
    const p = makeSimplePipeline()
    // steps[0] is at sorted index 0
    expect(canMoveProcessor(p, p.steps[0].stepId, 0)).toBe(false)
  })

  it('canDisableProcessor returns true for enabled step (test 69)', () => {
    const p = makeSimplePipeline()
    expect(canDisableProcessor(p, p.steps[0].stepId)).toBe(true)
  })

  it('canDisableProcessor returns false for already disabled step (test 70)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, p.steps[0].stepId)
    expect(canDisableProcessor(p2, p.steps[0].stepId)).toBe(false)
  })

  it('canEnableProcessor returns true for disabled step (test 71)', () => {
    const p  = makeSimplePipeline()
    const p2 = toggleStep(p, p.steps[0].stepId)
    expect(canEnableProcessor(p2, p.steps[0].stepId)).toBe(true)
  })

  it('canEnableProcessor returns false for already enabled step (test 72)', () => {
    const p = makeSimplePipeline()
    expect(canEnableProcessor(p, p.steps[0].stepId)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — validateDuplicateStepIds
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateDuplicateStepIds', () => {
  it('valid pipeline with unique ids passes (test 73)', () => {
    expect(validateDuplicateStepIds(makeSimplePipeline()).valid).toBe(true)
  })

  it('duplicate stepId fails validation (test 74)', () => {
    const p      = makeSimplePipeline()
    // Force duplicate by patching second step id to match first
    const dupPipeline = {
      ...p,
      steps: [p.steps[0], { ...p.steps[1], stepId: p.steps[0].stepId }],
    }
    const r = validateDuplicateStepIds(dupPipeline)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'DUPLICATE_STEP_ID')).toBe(true)
  })

  it('empty stepId fails (test 75)', () => {
    const p  = makeSimplePipeline()
    const p2 = { ...p, steps: [{ ...p.steps[0], stepId: '' }] }
    const r  = validateDuplicateStepIds(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'STEP_MISSING_ID')).toBe(true)
  })

  it('empty pipeline passes (test 76)', () => {
    expect(validateDuplicateStepIds(createEmptyPipeline()).valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — validateProcessorOrder
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateProcessorOrder', () => {
  it('empty pipeline passes ordering validation (test 77)', () => {
    expect(validateProcessorOrder(createEmptyPipeline()).valid).toBe(true)
  })

  it('RATIO before WEIGHT is valid (test 78)', () => {
    const p    = createEmptyPipeline()
    const step1 = createPipelineStep(createRatioEvaluatorConfig(),         0)
    const step2 = createPipelineStep(createWeightMultiplierConfig({ weight: 0.5 }), 1)
    const p2   = { ...p, steps: [step1, step2] }
    expect(validateProcessorOrder(p2).valid).toBe(true)
  })

  it('WEIGHT before RATIO violates ORDER_RATIO_BEFORE_WEIGHT (test 79)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createWeightMultiplierConfig({ weight: 0.5 }), 0)
    const step2 = createPipelineStep(createRatioEvaluatorConfig(),         1)
    const p2    = { ...p, steps: [step1, step2] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ORDER_RATIO_BEFORE_WEIGHT')).toBe(true)
  })

  it('CEILING after WEIGHT violates ORDER_CEILING_BEFORE_WEIGHT (test 80)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createWeightMultiplierConfig({ weight: 0.5 }), 0)
    const step2 = createPipelineStep(createCeilingClampConfig({ ceiling: 200 }), 1)
    const p2    = { ...p, steps: [step1, step2] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ORDER_CEILING_BEFORE_WEIGHT')).toBe(true)
  })

  it('BAND before RATIO violates ORDER_BAND_AFTER_RATIO (test 81)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createBandEvaluatorConfig({ bands: sampleBands }), 0)
    const step2 = createPipelineStep(createRatioEvaluatorConfig(),                      1)
    const p2    = { ...p, steps: [step1, step2] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ORDER_BAND_AFTER_RATIO')).toBe(true)
  })

  it('ZERO after RATIO violates ORDER_ZERO_BEFORE_RATIO (test 82)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createRatioEvaluatorConfig(),                       0)
    const step2 = createPipelineStep(createZeroTargetGuardConfig({ zeroTargetBehaviour: 'skip' }), 1)
    const p2    = { ...p, steps: [step1, step2] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ORDER_ZERO_BEFORE_RATIO')).toBe(true)
  })

  it('NODE_AGGREGATOR as first step violates ORDER_AGGREGATOR_NOT_FIRST (test 83)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createNodeAggregatorConfig({ aggregationType: 'weighted_sum' }), 0)
    const p2    = { ...p, steps: [step1] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ORDER_AGGREGATOR_NOT_FIRST')).toBe(true)
  })

  it('disabled steps are excluded from ordering checks (test 84)', () => {
    // WEIGHT before RATIO, but WEIGHT is disabled → should pass
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createWeightMultiplierConfig({ weight: 0.5 }), 0, { enabled: false })
    const step2 = createPipelineStep(createRatioEvaluatorConfig(), 1)
    const p2    = { ...p, steps: [step1, step2] }
    const r     = validateProcessorOrder(p2)
    expect(r.valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — validateBandDefinitions
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateBandDefinitions', () => {
  it('valid non-overlapping bands pass (test 85)', () => {
    expect(validateBandDefinitions(sampleBands)).toHaveLength(0)
  })

  it('overlapping bands are detected (test 86)', () => {
    const bands: BandDefinition[] = [
      { id: 'x1', label: 'A', minPct: 0,  maxPct: 60, score: 50 },
      { id: 'x2', label: 'B', minPct: 50, maxPct: 80, score: 80 },  // overlaps
    ]
    const issues = validateBandDefinitions(bands)
    expect(issues.some((i) => i.code === 'BAND_OVERLAP')).toBe(true)
  })

  it('band with minPct >= maxPct fails (test 87)', () => {
    const bands: BandDefinition[] = [
      { id: 'y1', label: 'Bad', minPct: 80, maxPct: 50, score: 50 },
    ]
    const issues = validateBandDefinitions(bands)
    expect(issues.some((i) => i.code === 'BAND_INVALID_RANGE')).toBe(true)
  })

  it('band score > 100 fails (test 88)', () => {
    const bands: BandDefinition[] = [
      { id: 'z1', label: 'Over', minPct: 0, maxPct: 100, score: 150 },
    ]
    const issues = validateBandDefinitions(bands)
    expect(issues.some((i) => i.code === 'BAND_INVALID_SCORE')).toBe(true)
  })

  it('band with missing id fails (test 89)', () => {
    const bands: BandDefinition[] = [
      { id: '', label: 'No id', minPct: 0, maxPct: 100, score: 50 },
    ]
    const issues = validateBandDefinitions(bands)
    expect(issues.some((i) => i.code === 'BAND_MISSING_ID')).toBe(true)
  })

  it('negative minPct fails (test 90)', () => {
    const bands: BandDefinition[] = [
      { id: 'n1', label: 'Neg', minPct: -10, maxPct: 50, score: 50 },
    ]
    const issues = validateBandDefinitions(bands)
    expect(issues.some((i) => i.code === 'BAND_NEGATIVE_MIN')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — validatePenaltyDefinitions
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validatePenaltyDefinitions', () => {
  it('valid penalty rules pass (test 91)', () => {
    expect(validatePenaltyDefinitions(samplePenaltyRules)).toHaveLength(0)
  })

  it('negative penaltyValue fails (test 92)', () => {
    const rules: PenaltyRule[] = [
      { id: 'r1', condition: 'below', threshold: 60, penaltyValue: -5 },
    ]
    const issues = validatePenaltyDefinitions(rules)
    expect(issues.some((i) => i.code === 'PENALTY_NEGATIVE_VALUE')).toBe(true)
  })

  it('invalid condition fails (test 93)', () => {
    const rules = [
      { id: 'r2', condition: 'between' as any, threshold: 60, penaltyValue: 5 },
    ]
    const issues = validatePenaltyDefinitions(rules)
    expect(issues.some((i) => i.code === 'PENALTY_INVALID_CONDITION')).toBe(true)
  })

  it('missing id fails (test 94)', () => {
    const rules: PenaltyRule[] = [
      { id: '', condition: 'below', threshold: 60, penaltyValue: 5 },
    ]
    const issues = validatePenaltyDefinitions(rules)
    expect(issues.some((i) => i.code === 'PENALTY_MISSING_ID')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — validateRequiredConfig
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateRequiredConfig', () => {
  it('CEILING_CLAMP with ceiling passes (test 95)', () => {
    const cfg = createCeilingClampConfig({ ceiling: 200 })
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })

  it('BAND_EVALUATOR with bands passes (test 96)', () => {
    const cfg = createBandEvaluatorConfig({ bands: sampleBands })
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })

  it('PENALTY_EVALUATOR with penaltyRules passes (test 97)', () => {
    const cfg = createPenaltyEvaluatorConfig({ penaltyRules: samplePenaltyRules })
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })

  it('NODE_AGGREGATOR with aggregationType passes (test 98)', () => {
    const cfg = createNodeAggregatorConfig({ aggregationType: 'min' })
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })

  it('ZERO_TARGET_GUARD with zeroTargetBehaviour passes (test 99)', () => {
    const cfg = createZeroTargetGuardConfig({ zeroTargetBehaviour: 'skip' })
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })

  it('RATIO_EVALUATOR has no required fields — passes (test 100)', () => {
    const cfg = createRatioEvaluatorConfig()
    expect(validateRequiredConfig(cfg)).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — validateProcessorConfig value validation
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateProcessorConfig — value validation', () => {
  it('valid CEILING_CLAMP config passes (test 101)', () => {
    const cfg = createCeilingClampConfig({ ceiling: 200 })
    expect(validateProcessorConfig(cfg)).toHaveLength(0)
  })

  it('CEILING_CLAMP with ceiling <= 0 fails (test 102)', () => {
    const cfg = createCeilingClampConfig({ ceiling: -10 })
    const issues = validateProcessorConfig(cfg)
    expect(issues.some((i) => i.code === 'INVALID_CEILING')).toBe(true)
  })

  it('WEIGHT_MULTIPLIER with weight > 1 fails (test 103)', () => {
    const cfg = createWeightMultiplierConfig({ weight: 1.5 })
    const issues = validateProcessorConfig(cfg)
    expect(issues.some((i) => i.code === 'INVALID_WEIGHT')).toBe(true)
  })

  it('WEIGHT_MULTIPLIER with weight = 0 fails (test 104)', () => {
    const cfg = createWeightMultiplierConfig({ weight: 0 })
    const issues = validateProcessorConfig(cfg)
    expect(issues.some((i) => i.code === 'INVALID_WEIGHT')).toBe(true)
  })

  it('ZERO_TARGET_GUARD with use_fallback but no fallbackScore fails (test 105)', () => {
    const cfg    = createZeroTargetGuardConfig({ zeroTargetBehaviour: 'use_fallback' })
    const issues = validateProcessorConfig(cfg)
    expect(issues.some((i) => i.code === 'MISSING_FALLBACK_SCORE')).toBe(true)
  })

  it('ZERO_TARGET_GUARD with use_fallback + fallbackScore passes (test 106)', () => {
    const cfg = createZeroTargetGuardConfig({ zeroTargetBehaviour: 'use_fallback', fallbackScore: 50 })
    expect(validateProcessorConfig(cfg)).toHaveLength(0)
  })

  it('NODE_AGGREGATOR with invalid aggregationType fails (test 107)', () => {
    const cfg    = createNodeAggregatorConfig({ aggregationType: 'median' as any })
    const issues = validateProcessorConfig(cfg)
    expect(issues.some((i) => i.code === 'INVALID_AGGREGATION_TYPE')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — validatePipeline combined
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validatePipeline combined', () => {
  it('simple valid pipeline passes (test 108)', () => {
    const r = validatePipeline(makeSimplePipeline())
    expect(r.valid).toBe(true)
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('pipeline with duplicate step id fails (test 109)', () => {
    const p  = makeSimplePipeline()
    const p2 = { ...p, steps: [p.steps[0], { ...p.steps[1], stepId: p.steps[0].stepId }] }
    expect(validatePipeline(p2).valid).toBe(false)
  })

  it('pipeline with ordering violation fails (test 110)', () => {
    const p     = createEmptyPipeline()
    const step1 = createPipelineStep(createWeightMultiplierConfig({ weight: 0.5 }), 0)
    const step2 = createPipelineStep(createRatioEvaluatorConfig(), 1)
    const r     = validatePipeline({ ...p, steps: [step1, step2] })
    expect(r.valid).toBe(false)
  })

  it('validatePipeline on empty pipeline passes (test 111)', () => {
    expect(validatePipeline(createEmptyPipeline()).valid).toBe(true)
  })

  it('pipeline with invalid config value fails (test 112)', () => {
    const p  = createEmptyPipeline()
    const s  = createPipelineStep(createCeilingClampConfig({ ceiling: -1 }), 0)
    const r  = validatePipeline({ ...p, steps: [s] })
    expect(r.valid).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — Trace compatibility types (source-level)
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Trace compatibility types', () => {
  it('processorConfig.ts exports ProcessorRawValueTrace (test 113)', async () => {
    const s = await processorConfigSrc()
    expect(s).toContain('ProcessorRawValueTrace')
    expect(s).toContain('rawValue')
  })

  it('processorConfig.ts exports ProcessorAchievementTrace (test 114)', async () => {
    const s = await processorConfigSrc()
    expect(s).toContain('ProcessorAchievementTrace')
    expect(s).toContain('achievement')
  })

  it('processorConfig.ts exports ProcessorCapTrace with cappedAchievement (test 115)', async () => {
    const s = await processorConfigSrc()
    expect(s).toContain('ProcessorCapTrace')
    expect(s).toContain('cappedAchievement')
  })

  it('processorConfig.ts exports ProcessorBandTrace / PenaltyTrace / AggregateTrace (test 116)', async () => {
    const s = await processorConfigSrc()
    expect(s).toContain('ProcessorBandTrace')
    expect(s).toContain('ProcessorPenaltyTrace')
    expect(s).toContain('ProcessorAggregateTrace')
  })

  it('processorConfig.ts exports ProcessorWeightTrace with weightedScore (test 117)', async () => {
    const s = await processorConfigSrc()
    expect(s).toContain('ProcessorWeightTrace')
    expect(s).toContain('weightedScore')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — validateProcessorConfigurations in validation.ts
// ════════════════════════════════════════════════════════════

describe('Phase 0C › validateProcessorConfigurations integration', () => {
  it('validateProcessorConfigurations is exported from validation.ts (test 118)', async () => {
    const s = await validationSrc()
    expect(s).toContain('export function validateProcessorConfigurations')
  })

  it('validateProcessorConfigurations passes for profile with no pipeline steps (test 119)', () => {
    const p = makeMinimalProfile()
    expect(validateProcessorConfigurations(p).valid).toBe(true)
  })

  it('validateProcessorConfigurations is included in combined validateProfile (test 120)', async () => {
    const s = await validationSrc()
    expect(s).toContain('...validateProcessorConfigurations(profile).issues')
  })

  it('validateProfile passes for minimal profile after 0C integration (test 121)', () => {
    const p = makeMinimalProfile()
    expect(validateProfile(p).valid).toBe(true)
  })

  it('validateProcessorConfigurations detects invalid ceiling in rule pipeline (test 122)', () => {
    const p    = makeMinimalProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    rule.pipeline.steps.push({
      processorType: CEILING_CLAMP,
      config:        { ceiling: -5 },
      order:         0,
    })
    const r = validateProcessorConfigurations(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'INVALID_CEILING_VALUE')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — No throws
// ════════════════════════════════════════════════════════════

describe('Phase 0C › No throws', () => {
  it('validatePipeline does not throw for completely empty input (test 123)', () => {
    // @ts-expect-error intentional bad input
    expect(() => validatePipeline({ pipelineId: '', steps: null, version: '' })).not.toThrow()
  })

  it('validateProcessorConfig does not throw for unknown processorType (test 124)', () => {
    const cfg = createRatioEvaluatorConfig()
    // @ts-expect-error intentional unknown type
    cfg.processorType = 'UNKNOWN_PROC'
    expect(() => validateProcessorConfig(cfg)).not.toThrow()
  })

  it('validateProcessorConfigurations does not throw for null root (test 125)', () => {
    const p = makeMinimalProfile()
    // @ts-expect-error intentional bad input
    p.root = null
    expect(() => validateProcessorConfigurations(p)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — Guardrails
// ════════════════════════════════════════════════════════════

describe('Phase 0C › Guardrails', () => {
  it('no React imports in processorConfig.ts (test 126)', async () => {
    const s = await processorConfigSrc()
    expect(s).not.toContain("from 'react'")
    expect(s).not.toContain('useState')
  })

  it('no Firestore imports in processorConfig.ts (test 127)', async () => {
    const s = await processorConfigSrc()
    expect(s).not.toContain('firebase/firestore')
    expect(s).not.toContain("from 'firebase")
  })

  it('no React imports in pipeline.ts (test 128)', async () => {
    const s = await pipelineSrc()
    expect(s).not.toContain("from 'react'")
    expect(s).not.toContain('useEffect')
  })

  it('no Firestore imports in pipeline.ts (test 129)', async () => {
    const s = await pipelineSrc()
    expect(s).not.toContain('firebase')
  })

  it('no UI component imports in any new 0C file (test 130)', async () => {
    const files = await Promise.all([processorConfigSrc(), pipelineSrc(), processorValidationSrc()])
    for (const s of files) {
      expect(s).not.toContain('components/')
      expect(s).not.toContain('pages/')
    }
  })

  it('no route definitions in any new 0C file (test 131)', async () => {
    const files = await Promise.all([processorConfigSrc(), pipelineSrc(), processorValidationSrc()])
    for (const s of files) {
      expect(s).not.toContain('<Route')
      expect(s).not.toContain("path='/")
    }
  })

  it('no AI / LLM references in any new 0C file (test 132)', async () => {
    const files = await Promise.all([processorConfigSrc(), pipelineSrc(), processorValidationSrc()])
    for (const s of files) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
    }
  })

  it('no Excel import references in any new 0C file (test 133)', async () => {
    const files = await Promise.all([processorConfigSrc(), pipelineSrc(), processorValidationSrc()])
    for (const s of files) {
      expect(s).not.toContain('xlsx')
      expect(s).not.toContain('ExcelJS')
    }
  })

  it('no Evaluation Engine production references in processorConfig.ts (test 134)', async () => {
    const s = await processorConfigSrc()
    expect(s).not.toContain('kpiAnalyticsEngine')
    expect(s).not.toContain('evaluationEngine')
    expect(s).not.toContain('executiveScore')
  })

  it('processorValidation.ts does not import Sidebar or App.jsx (test 135)', async () => {
    const s = await processorValidationSrc()
    expect(s).not.toContain('Sidebar')
    expect(s).not.toContain('App.jsx')
    expect(s).not.toContain('NAV_CONFIG')
  })
})
