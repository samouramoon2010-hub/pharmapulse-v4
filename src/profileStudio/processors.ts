// ============================================================
// Profile Studio — Processor Registry (Phase 0A)
//
// Defines all supported processor types and their metadata.
// Each processor describes what it does, its required config,
// and its I/O contract.
//
// DESIGN CONSTRAINTS:
//   - deterministic: true on every processor (no randomness)
//   - No executable formulas here — metadata only
//   - No custom DSL, no arbitrary JS evaluation
//   - No Firestore. No React. No UI.
// ============================================================

// ── Processor type constants ──────────────────────────────────

export const RATIO_EVALUATOR    = 'RATIO_EVALUATOR'    as const
export const CEILING_CLAMP      = 'CEILING_CLAMP'      as const
export const FLOOR_CLAMP        = 'FLOOR_CLAMP'        as const
export const WEIGHT_MULTIPLIER  = 'WEIGHT_MULTIPLIER'  as const
export const BAND_EVALUATOR     = 'BAND_EVALUATOR'     as const
export const PENALTY_EVALUATOR  = 'PENALTY_EVALUATOR'  as const
export const NODE_AGGREGATOR    = 'NODE_AGGREGATOR'    as const
export const ZERO_TARGET_GUARD  = 'ZERO_TARGET_GUARD'  as const

export type ProcessorTypeConstant =
  | typeof RATIO_EVALUATOR
  | typeof CEILING_CLAMP
  | typeof FLOOR_CLAMP
  | typeof WEIGHT_MULTIPLIER
  | typeof BAND_EVALUATOR
  | typeof PENALTY_EVALUATOR
  | typeof NODE_AGGREGATOR
  | typeof ZERO_TARGET_GUARD

export const ALL_PROCESSOR_TYPES: ProcessorTypeConstant[] = [
  RATIO_EVALUATOR,
  CEILING_CLAMP,
  FLOOR_CLAMP,
  WEIGHT_MULTIPLIER,
  BAND_EVALUATOR,
  PENALTY_EVALUATOR,
  NODE_AGGREGATOR,
  ZERO_TARGET_GUARD,
]

// ── Processor definition shape ────────────────────────────────

export interface ProcessorDefinition {
  /** Stable string identifier — matches the processor type constant. */
  id:                   ProcessorTypeConstant
  /** Human-readable name for UI and audit logs. */
  label:                string
  /** Description of what this processor does. */
  description:          string
  /** Expected shape of the processor's input (documentation only). */
  inputShape:           string
  /** Expected shape of the processor's output (documentation only). */
  outputShape:          string
  /** Config fields that MUST be present for the processor to run. */
  requiredConfigFields: string[]
  /** Config fields that may be omitted; defaults are used when absent. */
  optionalConfigFields: string[]
  /**
   * Always true — all processors are deterministic.
   * No randomness, no external API calls, no side effects.
   */
  deterministic: true
}

// ── Processor definitions ─────────────────────────────────────

export const PROCESSOR_DEFINITIONS: Record<ProcessorTypeConstant, ProcessorDefinition> = {

  [RATIO_EVALUATOR]: {
    id:          RATIO_EVALUATOR,
    label:       'Ratio Evaluator',
    description: 'Computes achievement as (actual / target) × 100. Returns 0 when target is 0 unless overridden by ZERO_TARGET_GUARD.',
    inputShape:  '{ actual: number, target: number }',
    outputShape: '{ ratio: number }',
    requiredConfigFields: [],
    optionalConfigFields: ['zeroBehaviour'],
    deterministic: true,
  },

  [CEILING_CLAMP]: {
    id:          CEILING_CLAMP,
    label:       'Ceiling Clamp',
    description: 'Clamps an input value to a configured maximum (ceiling). Prevents runaway over-achievement from distorting composite scores.',
    inputShape:  '{ value: number }',
    outputShape: '{ clampedValue: number, clampApplied: boolean }',
    requiredConfigFields: ['ceiling'],
    optionalConfigFields: [],
    deterministic: true,
  },

  [FLOOR_CLAMP]: {
    id:          FLOOR_CLAMP,
    label:       'Floor Clamp',
    description: 'Clamps an input value to a configured minimum (floor). Prevents negative scores when achievement drops below zero.',
    inputShape:  '{ value: number }',
    outputShape: '{ clampedValue: number, clampApplied: boolean }',
    requiredConfigFields: ['floor'],
    optionalConfigFields: [],
    deterministic: true,
  },

  [WEIGHT_MULTIPLIER]: {
    id:          WEIGHT_MULTIPLIER,
    label:       'Weight Multiplier',
    description: 'Multiplies an input value by a configured weight factor. Used to assign relative importance to a node in the composite score.',
    inputShape:  '{ value: number }',
    outputShape: '{ weightedValue: number }',
    requiredConfigFields: ['weight'],
    optionalConfigFields: [],
    deterministic: true,
  },

  [BAND_EVALUATOR]: {
    id:          BAND_EVALUATOR,
    label:       'Band Evaluator',
    description: 'Maps an achievement ratio to a discrete score band. Each band defines a minPct, maxPct, score, and label (e.g. "Excellent", "On Track").',
    inputShape:  '{ ratio: number }',
    outputShape: '{ bandScore: number, bandLabel: string }',
    requiredConfigFields: ['bands'],
    optionalConfigFields: ['defaultScore'],
    deterministic: true,
  },

  [PENALTY_EVALUATOR]: {
    id:          PENALTY_EVALUATOR,
    label:       'Penalty Evaluator',
    description: 'Applies configurable deductions to a score when specific conditions are met (e.g. consecutive misses, critical threshold breach).',
    inputShape:  '{ value: number, conditions: Record<string, unknown> }',
    outputShape: '{ penalizedValue: number, penaltyApplied: boolean, penaltyAmount: number }',
    requiredConfigFields: ['penaltyRules'],
    optionalConfigFields: ['maxPenalty', 'penaltyFloor'],
    deterministic: true,
  },

  [NODE_AGGREGATOR]: {
    id:          NODE_AGGREGATOR,
    label:       'Node Aggregator',
    description: 'Combines child node scores into a single parent score using a configured aggregation strategy (WEIGHTED_SUM, AVERAGE, MIN, MAX).',
    inputShape:  '{ childScores: number[], weights?: number[] }',
    outputShape: '{ aggregatedScore: number }',
    requiredConfigFields: ['aggregationType'],
    optionalConfigFields: ['weights'],
    deterministic: true,
  },

  [ZERO_TARGET_GUARD]: {
    id:          ZERO_TARGET_GUARD,
    label:       'Zero Target Guard',
    description: "Intercepts evaluation when target is 0, applying a configured behaviour: 'SCORE_ZERO' (0%), 'SCORE_FULL' (100%), or 'EXCLUDE' (skip node).",
    inputShape:  '{ actual: number, target: number }',
    outputShape: '{ guardedRatio: number, targetWasZero: boolean }',
    requiredConfigFields: ['zeroTargetBehaviour'],
    optionalConfigFields: [],
    deterministic: true,
  },

}

// ── Lookup helpers ────────────────────────────────────────────

/** Returns the ProcessorDefinition for a given type, or undefined. */
export function getProcessorDefinition(type: ProcessorTypeConstant): ProcessorDefinition {
  return PROCESSOR_DEFINITIONS[type]
}

/** Returns true when the given string is a recognised processor type. */
export function isSupportedProcessorType(type: unknown): type is ProcessorTypeConstant {
  return typeof type === 'string' && (ALL_PROCESSOR_TYPES as string[]).includes(type)
}
