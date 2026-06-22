// ============================================================
// Profile Studio — Processor & Pipeline Validation (Phase 0C)
//
// Validates ProcessorPipelineDefinition objects and individual
// processor configs. Returns issue lists instead of throwing.
//
// Also exports validateProcessorStepConfig() which bridges
// to validation.ts (ProcessorStep/Record<string,unknown> format).
//
// No execution. No scoring. No Firestore. No React. No UI.
// ============================================================

import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
} from './processors'
import type { ProcessorTypeConstant } from './processors'
import type {
  AnyProcessorConfig,
  BandDefinition,
  PenaltyRule,
  CeilingClampConfig,
  FloorClampConfig,
  WeightMultiplierConfig,
  BandEvaluatorConfig,
  PenaltyEvaluatorConfig,
  NodeAggregatorConfig,
  ZeroTargetGuardConfig,
} from './processorConfig'
import type { ProcessorPipelineDefinition, PipelineIssue, PipelineValidationResult } from './pipeline'
import { flattenPipeline } from './pipeline'

// ── Helpers ───────────────────────────────────────────────────

function issueErr(code: string, message: string, stepId?: string): PipelineIssue {
  return { code, message, stepId, severity: 'error' }
}

function issueWarn(code: string, message: string, stepId?: string): PipelineIssue {
  return { code, message, stepId, severity: 'warning' }
}

function pipelineResult(issues: PipelineIssue[]): PipelineValidationResult {
  return { valid: issues.every((i) => i.severity !== 'error'), issues }
}

const VALID_AGGREGATION_TYPES = new Set(['weighted_sum', 'simple_average', 'min', 'max'])
const VALID_ZERO_BEHAVIOURS   = new Set(['skip', 'score_zero', 'score_full', 'use_fallback'])
const VALID_PENALTY_CONDITIONS = new Set(['below', 'above', 'equals'])

// ════════════════════════════════════════════════════════════
// SECTION 1 — Band and penalty validators
// ════════════════════════════════════════════════════════════

/**
 * Validates a set of band definitions:
 *   - Each band must have a non-empty id
 *   - minPct must be >= 0
 *   - minPct < maxPct
 *   - score must be 0–100
 *   - No overlapping ranges
 */
export function validateBandDefinitions(
  bands:   BandDefinition[],
  stepId?: string,
): PipelineIssue[] {
  const issues: PipelineIssue[] = []

  for (let i = 0; i < bands.length; i++) {
    const b  = bands[i]
    const bp = stepId ?? `band[${i}]`

    if (!b.id || b.id.trim() === '') {
      issues.push(issueErr('BAND_MISSING_ID', `Band at index ${i} must have a non-empty id.`, bp))
    }
    if (b.minPct < 0) {
      issues.push(issueErr('BAND_NEGATIVE_MIN', `Band "${b.label}" minPct must be >= 0. Got ${b.minPct}.`, bp))
    }
    if (b.minPct >= b.maxPct) {
      issues.push(issueErr('BAND_INVALID_RANGE',
        `Band "${b.label}" minPct (${b.minPct}) must be < maxPct (${b.maxPct}).`, bp))
    }
    if (b.score < 0 || b.score > 100) {
      issues.push(issueErr('BAND_INVALID_SCORE', `Band "${b.label}" score must be 0–100. Got ${b.score}.`, bp))
    }
  }

  // Overlap check (sorted by minPct)
  const sorted = [...bands].sort((a, b) => a.minPct - b.minPct)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPct < sorted[i - 1].maxPct) {
      issues.push(issueErr('BAND_OVERLAP',
        `Bands "${sorted[i - 1].label}" and "${sorted[i].label}" overlap.`, stepId))
    }
  }

  return issues
}

/**
 * Validates a set of penalty rules:
 *   - Each rule must have a non-empty id
 *   - condition must be 'below' | 'above' | 'equals'
 *   - penaltyValue must be >= 0
 */
export function validatePenaltyDefinitions(
  rules:   PenaltyRule[],
  stepId?: string,
): PipelineIssue[] {
  const issues: PipelineIssue[] = []

  for (const rule of rules) {
    if (!rule.id || rule.id.trim() === '') {
      issues.push(issueErr('PENALTY_MISSING_ID', 'Each penalty rule must have a non-empty id.', stepId))
    }
    if (!VALID_PENALTY_CONDITIONS.has(rule.condition)) {
      issues.push(issueErr('PENALTY_INVALID_CONDITION',
        `Penalty condition must be below/above/equals. Got "${rule.condition}".`, stepId))
    }
    if (typeof rule.penaltyValue !== 'number' || rule.penaltyValue < 0) {
      issues.push(issueErr('PENALTY_NEGATIVE_VALUE',
        `Penalty rule "${rule.id}" penaltyValue must be >= 0. Got ${rule.penaltyValue}.`, stepId))
    }
  }

  return issues
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Individual config validators
// ════════════════════════════════════════════════════════════

/**
 * Validates that required configuration fields are present on a typed config.
 * Value validation is handled by validateProcessorConfig.
 */
export function validateRequiredConfig(config: AnyProcessorConfig): PipelineIssue[] {
  const issues: PipelineIssue[] = []
  const id = config.id

  switch (config.processorType) {
    case CEILING_CLAMP:
      if ((config as CeilingClampConfig).ceiling === undefined) {
        issues.push(issueErr('MISSING_CEILING', 'CEILING_CLAMP requires a ceiling value.', id))
      }
      break
    case FLOOR_CLAMP:
      if ((config as FloorClampConfig).floor === undefined) {
        issues.push(issueErr('MISSING_FLOOR', 'FLOOR_CLAMP requires a floor value.', id))
      }
      break
    case WEIGHT_MULTIPLIER:
      if ((config as WeightMultiplierConfig).weight === undefined) {
        issues.push(issueErr('MISSING_WEIGHT', 'WEIGHT_MULTIPLIER requires a weight value.', id))
      }
      break
    case BAND_EVALUATOR:
      if (!((config as BandEvaluatorConfig).bands?.length)) {
        issues.push(issueErr('MISSING_BANDS', 'BAND_EVALUATOR requires a non-empty bands array.', id))
      }
      break
    case PENALTY_EVALUATOR:
      if (!((config as PenaltyEvaluatorConfig).penaltyRules?.length)) {
        issues.push(issueErr('MISSING_PENALTY_RULES',
          'PENALTY_EVALUATOR requires at least one penalty rule.', id))
      }
      break
    case NODE_AGGREGATOR:
      if (!(config as NodeAggregatorConfig).aggregationType) {
        issues.push(issueErr('MISSING_AGGREGATION_TYPE',
          'NODE_AGGREGATOR requires an aggregationType.', id))
      }
      break
    case ZERO_TARGET_GUARD:
      if (!(config as ZeroTargetGuardConfig).zeroTargetBehaviour) {
        issues.push(issueErr('MISSING_ZERO_BEHAVIOUR',
          'ZERO_TARGET_GUARD requires zeroTargetBehaviour.', id))
      }
      break
  }

  return issues
}

/**
 * Validates the VALUES of a typed processor config object.
 * Returns a list of PipelineIssues (empty = valid).
 */
export function validateProcessorConfig(config: AnyProcessorConfig): PipelineIssue[] {
  const issues: PipelineIssue[] = []
  const id = config.id

  if (!id || id.trim() === '') {
    issues.push(issueErr('CONFIG_MISSING_ID', 'Processor config must have a non-empty id.'))
  }
  if (!config.version || config.version.trim() === '') {
    issues.push(issueErr('CONFIG_MISSING_VERSION', 'Processor config must have a version string.', id))
  }

  switch (config.processorType) {
    case CEILING_CLAMP: {
      const ceiling = (config as CeilingClampConfig).ceiling
      if (typeof ceiling !== 'number' || ceiling <= 0) {
        issues.push(issueErr('INVALID_CEILING', `Ceiling must be > 0. Got ${ceiling}.`, id))
      }
      break
    }
    case FLOOR_CLAMP: {
      const floor = (config as FloorClampConfig).floor
      if (typeof floor !== 'number' || floor < 0) {
        issues.push(issueErr('INVALID_FLOOR', `Floor must be >= 0. Got ${floor}.`, id))
      }
      break
    }
    case WEIGHT_MULTIPLIER: {
      const weight = (config as WeightMultiplierConfig).weight
      if (typeof weight !== 'number' || weight <= 0 || weight > 1) {
        issues.push(issueErr('INVALID_WEIGHT', `Weight must be > 0 and ≤ 1. Got ${weight}.`, id))
      }
      break
    }
    case BAND_EVALUATOR: {
      const c = config as BandEvaluatorConfig
      if (!Array.isArray(c.bands) || c.bands.length === 0) {
        issues.push(issueErr('BAND_EMPTY', 'BAND_EVALUATOR requires at least one band.', id))
      } else {
        issues.push(...validateBandDefinitions(c.bands, id))
      }
      if (c.defaultScore !== undefined && (c.defaultScore < 0 || c.defaultScore > 100)) {
        issues.push(issueErr('BAND_INVALID_DEFAULT',
          `defaultScore must be 0–100. Got ${c.defaultScore}.`, id))
      }
      break
    }
    case PENALTY_EVALUATOR: {
      const c = config as PenaltyEvaluatorConfig
      if (!Array.isArray(c.penaltyRules) || c.penaltyRules.length === 0) {
        issues.push(issueErr('PENALTY_EMPTY',
          'PENALTY_EVALUATOR requires at least one penalty rule.', id))
      } else {
        issues.push(...validatePenaltyDefinitions(c.penaltyRules, id))
      }
      if (c.maxPenalty !== undefined && c.maxPenalty < 0) {
        issues.push(issueErr('INVALID_MAX_PENALTY',
          `maxPenalty must be >= 0. Got ${c.maxPenalty}.`, id))
      }
      break
    }
    case NODE_AGGREGATOR: {
      const aggType = (config as NodeAggregatorConfig).aggregationType
      if (!VALID_AGGREGATION_TYPES.has(aggType)) {
        issues.push(issueErr('INVALID_AGGREGATION_TYPE',
          `aggregationType must be weighted_sum/simple_average/min/max. Got "${aggType}".`, id))
      }
      break
    }
    case ZERO_TARGET_GUARD: {
      const c = config as ZeroTargetGuardConfig
      if (!VALID_ZERO_BEHAVIOURS.has(c.zeroTargetBehaviour)) {
        issues.push(issueErr('INVALID_ZERO_BEHAVIOUR',
          `zeroTargetBehaviour must be skip/score_zero/score_full/use_fallback. Got "${c.zeroTargetBehaviour}".`, id))
      }
      if (c.zeroTargetBehaviour === 'use_fallback') {
        if (c.fallbackScore === undefined) {
          issues.push(issueErr('MISSING_FALLBACK_SCORE',
            'fallbackScore is required when zeroTargetBehaviour is "use_fallback".', id))
        } else if (c.fallbackScore < 0 || c.fallbackScore > 100) {
          issues.push(issueErr('INVALID_FALLBACK_SCORE',
            `fallbackScore must be 0–100. Got ${c.fallbackScore}.`, id))
        }
      }
      break
    }
    // RATIO_EVALUATOR has no extra required fields
  }

  return issues
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Pipeline-level validators
// ════════════════════════════════════════════════════════════

/**
 * Checks that all step ids in the pipeline are unique and non-empty.
 */
export function validateDuplicateStepIds(
  pipeline: ProcessorPipelineDefinition,
): PipelineValidationResult {
  const issues: PipelineIssue[] = []
  const seen = new Set<string>()

  for (const step of pipeline.steps) {
    if (!step.stepId || step.stepId.trim() === '') {
      issues.push(issueErr('STEP_MISSING_ID', 'Each pipeline step must have a non-empty stepId.'))
      continue
    }
    if (seen.has(step.stepId)) {
      issues.push(issueErr('DUPLICATE_STEP_ID',
        `Duplicate stepId "${step.stepId}" found in pipeline.`, step.stepId))
    }
    seen.add(step.stepId)
  }

  return pipelineResult(issues)
}

/**
 * Validates the relative ordering of processor types for enabled steps.
 *
 * Rules (only applied when both types exist in enabled steps):
 *   RATIO_EVALUATOR    must come before WEIGHT_MULTIPLIER
 *   CEILING_CLAMP      must come before WEIGHT_MULTIPLIER
 *   BAND_EVALUATOR     must come after  RATIO_EVALUATOR
 *   ZERO_TARGET_GUARD  must come before RATIO_EVALUATOR
 *   NODE_AGGREGATOR    cannot be the first enabled step
 */
export function validateProcessorOrder(
  pipeline: ProcessorPipelineDefinition,
): PipelineValidationResult {
  const issues: PipelineIssue[] = []

  // Only check enabled steps, sorted by order
  const enabled = flattenPipeline(pipeline).filter((s) => s.enabled)
  if (enabled.length === 0) return pipelineResult(issues)

  // Build type → positions map
  const posMap = new Map<string, number[]>()
  enabled.forEach((s, idx) => {
    const arr = posMap.get(s.config.processorType) ?? []
    arr.push(idx)
    posMap.set(s.config.processorType, arr)
  })

  const firstPos = (type: string): number => posMap.get(type)?.[0]            ?? -1
  const lastPos  = (type: string): number => {
    const arr = posMap.get(type)
    return arr ? arr[arr.length - 1] : -1
  }

  const ratioFirst  = firstPos(RATIO_EVALUATOR)
  const ratioLast   = lastPos(RATIO_EVALUATOR)
  const weightFirst = firstPos(WEIGHT_MULTIPLIER)
  const ceilLast    = lastPos(CEILING_CLAMP)
  const bandFirst   = firstPos(BAND_EVALUATOR)
  const zeroLast    = lastPos(ZERO_TARGET_GUARD)
  const aggrFirst   = firstPos(NODE_AGGREGATOR)

  if (ratioLast !== -1 && weightFirst !== -1 && ratioLast >= weightFirst) {
    issues.push(issueErr('ORDER_RATIO_BEFORE_WEIGHT',
      'RATIO_EVALUATOR must appear before WEIGHT_MULTIPLIER in the pipeline.'))
  }
  if (ceilLast !== -1 && weightFirst !== -1 && ceilLast >= weightFirst) {
    issues.push(issueErr('ORDER_CEILING_BEFORE_WEIGHT',
      'CEILING_CLAMP must appear before WEIGHT_MULTIPLIER in the pipeline.'))
  }
  if (bandFirst !== -1 && ratioLast !== -1 && bandFirst <= ratioLast) {
    issues.push(issueErr('ORDER_BAND_AFTER_RATIO',
      'BAND_EVALUATOR must appear after RATIO_EVALUATOR in the pipeline.'))
  }
  if (zeroLast !== -1 && ratioFirst !== -1 && zeroLast >= ratioFirst) {
    issues.push(issueErr('ORDER_ZERO_BEFORE_RATIO',
      'ZERO_TARGET_GUARD must appear before RATIO_EVALUATOR in the pipeline.'))
  }
  if (aggrFirst === 0) {
    issues.push(issueErr('ORDER_AGGREGATOR_NOT_FIRST',
      'NODE_AGGREGATOR cannot be the first enabled step in the pipeline.'))
  }

  return pipelineResult(issues)
}

/**
 * Validates all configs in the pipeline.
 */
export function validateProcessorConfigsInPipeline(
  pipeline: ProcessorPipelineDefinition,
): PipelineValidationResult {
  const issues: PipelineIssue[] = []
  for (const step of pipeline.steps) {
    issues.push(...validateProcessorConfig(step.config))
  }
  return pipelineResult(issues)
}

/**
 * Combined pipeline validator.
 * Runs all sub-validators and returns merged results.
 * Never throws for normal validation failures.
 */
export function validatePipeline(
  pipeline: ProcessorPipelineDefinition,
): PipelineValidationResult {
  try {
    const allIssues: PipelineIssue[] = [
      ...validateDuplicateStepIds(pipeline).issues,
      ...validateProcessorOrder(pipeline).issues,
      ...validateProcessorConfigsInPipeline(pipeline).issues,
    ]
    return pipelineResult(allIssues)
  } catch (e) {
    return {
      valid:  false,
      issues: [{
        code:     'PIPELINE_RUNTIME_ERROR',
        message:  e instanceof Error ? e.message : String(e),
        severity: 'error',
      }],
    }
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Integration bridge for validation.ts
// ════════════════════════════════════════════════════════════

/**
 * Validates config values for a ProcessorStep whose config is stored
 * as `Record<string, unknown>` (the format used by profile hierarchy types).
 *
 * Called by validation.ts's validateProcessorConfigurations().
 * Returns PipelineIssue[] — empty means valid.
 */
export function validateProcessorStepConfig(
  processorType: ProcessorTypeConstant,
  config:        Record<string, unknown>,
  path?:         string,
): PipelineIssue[] {
  const issues: PipelineIssue[] = []

  switch (processorType) {
    case CEILING_CLAMP: {
      const ceiling = config.ceiling as number | undefined
      if (ceiling !== undefined && (typeof ceiling !== 'number' || ceiling <= 0)) {
        issues.push(issueErr('INVALID_CEILING_VALUE',
          `Ceiling must be > 0. Got ${ceiling}.`, path))
      }
      break
    }
    case FLOOR_CLAMP: {
      const floor = config.floor as number | undefined
      if (floor !== undefined && (typeof floor !== 'number' || floor < 0)) {
        issues.push(issueErr('INVALID_FLOOR_VALUE',
          `Floor must be >= 0. Got ${floor}.`, path))
      }
      break
    }
    case WEIGHT_MULTIPLIER: {
      const weight = config.weight as number | undefined
      if (weight !== undefined && (typeof weight !== 'number' || weight <= 0 || weight > 1)) {
        issues.push(issueErr('INVALID_WEIGHT_VALUE',
          `Weight must be > 0 and ≤ 1. Got ${weight}.`, path))
      }
      break
    }
    case BAND_EVALUATOR: {
      const bands = config.bands as Array<Record<string, unknown>> | undefined
      if (bands !== undefined && Array.isArray(bands) && bands.length > 1) {
        const sorted = [...bands].sort(
          (a, b) => (a.minPct as number) - (b.minPct as number),
        )
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i].minPct as number) < (sorted[i - 1].maxPct as number)) {
            issues.push(issueErr('BAND_OVERLAP_IN_STEP',
              'Band ranges overlap in BAND_EVALUATOR config.', path))
            break
          }
        }
      }
      break
    }
    case PENALTY_EVALUATOR: {
      const rules = config.penaltyRules as Array<Record<string, unknown>> | undefined
      if (rules !== undefined && Array.isArray(rules)) {
        for (const rule of rules) {
          const pv = rule.penaltyValue as number | undefined
          if (pv !== undefined && (typeof pv !== 'number' || pv < 0)) {
            issues.push(issueErr('PENALTY_NEGATIVE_IN_STEP',
              `penaltyValue must be >= 0. Got ${pv}.`, path))
          }
        }
      }
      break
    }
    case ZERO_TARGET_GUARD: {
      const behaviour = config.zeroTargetBehaviour as string | undefined
      if (behaviour !== undefined && !VALID_ZERO_BEHAVIOURS.has(behaviour)) {
        issues.push(issueErr('INVALID_ZERO_BEHAVIOUR_VALUE',
          `zeroTargetBehaviour must be skip/score_zero/score_full/use_fallback. Got "${behaviour}".`, path))
      }
      break
    }
    case NODE_AGGREGATOR: {
      const aggType = config.aggregationType as string | undefined
      if (aggType !== undefined && !VALID_AGGREGATION_TYPES.has(aggType)) {
        issues.push(issueErr('INVALID_AGGREGATION_TYPE_VALUE',
          `aggregationType must be weighted_sum/simple_average/min/max. Got "${aggType}".`, path))
      }
      break
    }
  }

  return issues
}
