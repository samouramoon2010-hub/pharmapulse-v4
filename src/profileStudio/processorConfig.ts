// ============================================================
// Profile Studio — Processor Configuration Types (Phase 0C)
//
// Typed configuration interfaces for all 8 processor types,
// factory helpers, and trace compatibility types for future
// execution output.
//
// No execution. No scoring. No custom JS. No formula strings.
// No Firestore. No React. No UI.
// ============================================================

import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
} from './processors'
import type { ProcessorTypeConstant } from './processors'

// ── ID generation ─────────────────────────────────────────────

let _configIdCounter = 0

function generateConfigId(prefix = 'cfg'): string {
  _configIdCounter++
  return `${prefix}_${Date.now()}_${_configIdCounter}`
}

// ════════════════════════════════════════════════════════════
// SECTION 1 — Base config interface
// ════════════════════════════════════════════════════════════

/** Fields shared by every processor config. */
export interface BaseProcessorConfig {
  /** Unique identifier for this config instance. */
  id:            string
  /** Which processor type this config belongs to. */
  processorType: ProcessorTypeConstant
  /** Whether this step participates in evaluation runs. */
  enabled:       boolean
  /** Config schema version for forward-compatibility. */
  version:       string
  /** Optional human-readable label. */
  label?:        string
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Typed processor config interfaces
// ════════════════════════════════════════════════════════════

/** RATIO_EVALUATOR — computes achievement = actual / target. */
export interface RatioEvaluatorConfig extends BaseProcessorConfig {
  processorType: typeof RATIO_EVALUATOR
}

/** CEILING_CLAMP — caps achievement at a maximum percentage. */
export interface CeilingClampConfig extends BaseProcessorConfig {
  processorType: typeof CEILING_CLAMP
  /** Maximum achievement % (must be > 0). e.g. 200 = cap at 200%. */
  ceiling: number
}

/** FLOOR_CLAMP — enforces a minimum achievement floor. */
export interface FloorClampConfig extends BaseProcessorConfig {
  processorType: typeof FLOOR_CLAMP
  /** Minimum achievement % (must be >= 0). */
  floor: number
}

/** WEIGHT_MULTIPLIER — scales score by a fractional weight. */
export interface WeightMultiplierConfig extends BaseProcessorConfig {
  processorType: typeof WEIGHT_MULTIPLIER
  /** Fractional weight applied to the score (0 < weight ≤ 1). */
  weight: number
}

/** A single score band for BAND_EVALUATOR. */
export interface BandDefinition {
  id:      string
  label:   string
  /** Lower bound (inclusive), achievement %. */
  minPct:  number
  /** Upper bound (exclusive for non-top bands), achievement %. */
  maxPct:  number
  /** Score awarded (0–100) when achievement falls in this band. */
  score:   number
  color?:  string
}

/** BAND_EVALUATOR — maps achievement % to a discrete score band. */
export interface BandEvaluatorConfig extends BaseProcessorConfig {
  processorType: typeof BAND_EVALUATOR
  /** Ordered, non-overlapping band definitions. */
  bands:         BandDefinition[]
  /** Score returned when no band matches (0–100). */
  defaultScore?: number
}

/** A single rule applied by PENALTY_EVALUATOR. */
export interface PenaltyRule {
  id:           string
  /** Condition that triggers this penalty. */
  condition:    'below' | 'above' | 'equals'
  /** Achievement % threshold checked against the condition. */
  threshold:    number
  /** Points deducted when the condition is met (must be >= 0). */
  penaltyValue: number
  label?:       string
}

/** PENALTY_EVALUATOR — applies score deductions based on rules. */
export interface PenaltyEvaluatorConfig extends BaseProcessorConfig {
  processorType: typeof PENALTY_EVALUATOR
  /** Ordered penalty rules to evaluate. */
  penaltyRules:  PenaltyRule[]
  /** Maximum total deduction allowed (>= 0). Uncapped if undefined. */
  maxPenalty?:   number
}

/** Supported aggregation strategies for NODE_AGGREGATOR. */
export type NodeAggregationType = 'weighted_sum' | 'simple_average' | 'min' | 'max'

/** NODE_AGGREGATOR — combines child node scores into one value. */
export interface NodeAggregatorConfig extends BaseProcessorConfig {
  processorType:   typeof NODE_AGGREGATOR
  aggregationType: NodeAggregationType
}

/** Behaviour when target is zero in ZERO_TARGET_GUARD. */
export type ZeroTargetBehaviour = 'skip' | 'score_zero' | 'score_full' | 'use_fallback'

/** ZERO_TARGET_GUARD — handles the zero-target edge case. */
export interface ZeroTargetGuardConfig extends BaseProcessorConfig {
  processorType:       typeof ZERO_TARGET_GUARD
  zeroTargetBehaviour: ZeroTargetBehaviour
  /** Required when zeroTargetBehaviour === 'use_fallback' (0–100). */
  fallbackScore?:      number
}

/** Union of all typed processor config objects. */
export type AnyProcessorConfig =
  | RatioEvaluatorConfig
  | CeilingClampConfig
  | FloorClampConfig
  | WeightMultiplierConfig
  | BandEvaluatorConfig
  | PenaltyEvaluatorConfig
  | NodeAggregatorConfig
  | ZeroTargetGuardConfig

// ════════════════════════════════════════════════════════════
// SECTION 3 — Trace compatibility types
// (Pure interfaces only — no execution, no runtime logic)
// ════════════════════════════════════════════════════════════

/** Base trace emitted when a processor reads a raw KPI value. */
export interface ProcessorRawValueTrace {
  processorId:   string
  processorType: ProcessorTypeConstant
  /** The raw numeric value before any transformation. */
  rawValue:      number
  timestamp?:    string
}

/** Trace after RATIO_EVALUATOR produces an achievement ratio. */
export interface ProcessorAchievementTrace extends ProcessorRawValueTrace {
  /** Computed achievement: actual / target (may exceed 1.0). */
  achievement: number
}

/** Trace after CEILING_CLAMP or FLOOR_CLAMP is applied. */
export interface ProcessorCapTrace extends ProcessorAchievementTrace {
  /** The cap value that was enforced. */
  cap:               number
  /** Achievement after clamping (cappedAchievement ≤ cap). */
  cappedAchievement: number
}

/** Trace after WEIGHT_MULTIPLIER scales the score. */
export interface ProcessorWeightTrace extends ProcessorCapTrace {
  /** The fractional weight applied. */
  weight:        number
  /** Final weighted contribution: cappedAchievement × weight. */
  weightedScore: number
}

/** Trace produced by BAND_EVALUATOR when a band is matched. */
export interface ProcessorBandTrace {
  processorId:   string
  processorType: typeof BAND_EVALUATOR
  achievement:   number
  bandLabel:     string
  score:         number
  timestamp?:    string
}

/** Trace produced by PENALTY_EVALUATOR. */
export interface ProcessorPenaltyTrace {
  processorId:    string
  processorType:  typeof PENALTY_EVALUATOR
  inputScore:     number
  penaltyApplied: number
  finalScore:     number
  timestamp?:     string
}

/** Trace produced by NODE_AGGREGATOR. */
export interface ProcessorAggregateTrace {
  processorId:     string
  processorType:   typeof NODE_AGGREGATOR
  aggregationType: NodeAggregationType
  /** Input scores that were aggregated. */
  inputs:          number[]
  aggregate:       number
  timestamp?:      string
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Config factory helpers
// ════════════════════════════════════════════════════════════

type ConfigOptions<T extends BaseProcessorConfig> = Partial<Omit<T, 'processorType'>>

/** Creates a default RATIO_EVALUATOR config. */
export function createRatioEvaluatorConfig(
  options?: ConfigOptions<RatioEvaluatorConfig>,
): RatioEvaluatorConfig {
  return {
    id:            generateConfigId('ratio'),
    processorType: RATIO_EVALUATOR,
    enabled:       true,
    version:       '1.0.0',
    label:         'Ratio Evaluator',
    ...options,
  }
}

/** Creates a CEILING_CLAMP config. `ceiling` is required. */
export function createCeilingClampConfig(
  options: { ceiling: number } & ConfigOptions<CeilingClampConfig>,
): CeilingClampConfig {
  return {
    id:            generateConfigId('ceiling'),
    processorType: CEILING_CLAMP,
    enabled:       true,
    version:       '1.0.0',
    label:         'Ceiling Clamp',
    ...options,
  }
}

/** Creates a FLOOR_CLAMP config. `floor` is required. */
export function createFloorClampConfig(
  options: { floor: number } & ConfigOptions<FloorClampConfig>,
): FloorClampConfig {
  return {
    id:            generateConfigId('floor'),
    processorType: FLOOR_CLAMP,
    enabled:       true,
    version:       '1.0.0',
    label:         'Floor Clamp',
    ...options,
  }
}

/** Creates a WEIGHT_MULTIPLIER config. `weight` is required. */
export function createWeightMultiplierConfig(
  options: { weight: number } & ConfigOptions<WeightMultiplierConfig>,
): WeightMultiplierConfig {
  return {
    id:            generateConfigId('weight'),
    processorType: WEIGHT_MULTIPLIER,
    enabled:       true,
    version:       '1.0.0',
    label:         'Weight Multiplier',
    ...options,
  }
}

/** Creates a BAND_EVALUATOR config. `bands` is required. */
export function createBandEvaluatorConfig(
  options: { bands: BandDefinition[] } & ConfigOptions<BandEvaluatorConfig>,
): BandEvaluatorConfig {
  return {
    id:            generateConfigId('band'),
    processorType: BAND_EVALUATOR,
    enabled:       true,
    version:       '1.0.0',
    label:         'Band Evaluator',
    ...options,
  }
}

/** Creates a PENALTY_EVALUATOR config. `penaltyRules` is required. */
export function createPenaltyEvaluatorConfig(
  options: { penaltyRules: PenaltyRule[] } & ConfigOptions<PenaltyEvaluatorConfig>,
): PenaltyEvaluatorConfig {
  return {
    id:            generateConfigId('penalty'),
    processorType: PENALTY_EVALUATOR,
    enabled:       true,
    version:       '1.0.0',
    label:         'Penalty Evaluator',
    ...options,
  }
}

/** Creates a NODE_AGGREGATOR config. `aggregationType` is required. */
export function createNodeAggregatorConfig(
  options: { aggregationType: NodeAggregationType } & ConfigOptions<NodeAggregatorConfig>,
): NodeAggregatorConfig {
  return {
    id:            generateConfigId('aggregator'),
    processorType: NODE_AGGREGATOR,
    enabled:       true,
    version:       '1.0.0',
    label:         'Node Aggregator',
    ...options,
  }
}

/** Creates a ZERO_TARGET_GUARD config. `zeroTargetBehaviour` is required. */
export function createZeroTargetGuardConfig(
  options: { zeroTargetBehaviour: ZeroTargetBehaviour } & ConfigOptions<ZeroTargetGuardConfig>,
): ZeroTargetGuardConfig {
  return {
    id:            generateConfigId('zero'),
    processorType: ZERO_TARGET_GUARD,
    enabled:       true,
    version:       '1.0.0',
    label:         'Zero Target Guard',
    ...options,
  }
}
