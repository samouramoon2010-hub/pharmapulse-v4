// ============================================================
// Evaluation Pipeline — Types
//
// Hybrid Pipeline-Based Strategy Engine foundation.
//
// Design principles:
//   ✓ No arbitrary expressions — only approved processor types
//   ✓ Each processor has a known, tested type
//   ✓ Context flows through processors immutably
//   ✓ Every step produces a trace entry
//   ✓ Unknown processor types throw at validation time, not execution time
//   ✓ Pure functions — no side effects, no Firestore, no React
//
// Relationship to production engine:
//   This pipeline module runs IN PARALLEL to the v1 engine.
//   The v1 engine (evaluationEngine.ts) is unchanged.
//   Migration to pipeline v2 is a future phase.
//
// Approved processor types — these are the ONLY valid operations:
//   ELEMENT_ACHIEVEMENT_CALCULATOR
//   ACHIEVEMENT_CAP_APPLIER
//   WEIGHTED_AVERAGE_AGGREGATOR    (legacy flow)
//   WEIGHT_CONTRIBUTION_APPLIER   (SMARTS flow)
//   SUM_AGGREGATOR
//   THRESHOLD_BAND_MATCHER
//   BASKET_SCORE_AGGREGATOR
// ============================================================

import type { ThresholdRule } from '../evaluationRegistry/evaluationRegistryTypes'

// ── Processor types ───────────────────────────────────────────

/**
 * Exhaustive list of approved processor types.
 * Adding a new type requires a corresponding implementation in processors.ts.
 * Any type NOT in this list throws a validation error before execution.
 */
export type EvaluationProcessorType =
  | 'ELEMENT_ACHIEVEMENT_CALCULATOR'
  | 'ACHIEVEMENT_CAP_APPLIER'
  | 'ELEMENT_BAND_SCORER'
  | 'WEIGHTED_AVERAGE_AGGREGATOR'
  | 'WEIGHT_CONTRIBUTION_APPLIER'
  | 'SUM_AGGREGATOR'
  | 'THRESHOLD_BAND_MATCHER'
  | 'BASKET_SCORE_AGGREGATOR'

// ── Pipeline context ──────────────────────────────────────────

/**
 * One element's worth of data as it flows through the pipeline.
 * Processors read from and write back to this shape.
 * Immutable per step — each processor returns a new context slice.
 */
export interface ElementContext {
  kpiKey:         string
  engineKey:      string
  label:          string
  weight:         number         // element weight within basket
  required:       boolean

  actual:         number
  target:         number
  targetSource:   'personal' | 'branch' | 'none'
  dataAvailable:  boolean

  // Set by ELEMENT_ACHIEVEMENT_CALCULATOR
  achievementPct?: number        // raw actual / target × 100

  // Set by ACHIEVEMENT_CAP_APPLIER
  cappedAchievementPct?: number  // equals achievementPct when no cap
  capApplied?:           boolean
  capPct?:               number | null

  // Set by WEIGHT_CONTRIBUTION_APPLIER (SMARTS flow)
  contribution?: number          // cappedAchievementPct × weight

  // Set by ELEMENT_BAND_SCORER (legacy flow: element-level band)
  // Mirrors V1 scoreElement: band = matchThresholdBand(cappedAchievementPct, thresholdOverride ?? basketRule)
  bandLabel?:    string
  bandLabelAr?:  string
  bandScore?:    number
  bandColor?:    string
  weightedScore?: number         // bandScore × weight (legacy flow)

  /**
   * Per-element threshold rule override.
   * Populated by contextBuilder from BasketElement.thresholdOverride.
   * When present, takes precedence over basket.thresholdRule for element band scoring.
   * Mirrors V1: el.thresholdOverride ?? basket.thresholdRule
   */
  thresholdOverride?: ThresholdRule
}

/**
 * One basket's worth of data as it flows through the pipeline.
 */
export interface BasketContext {
  basketId:   string
  basketName: string
  weight:     number             // basket weight in profile
  thresholdRule: ThresholdRule

  elements:   ElementContext[]

  // Set by WEIGHTED_AVERAGE_AGGREGATOR or SUM_AGGREGATOR
  aggregateValue?: number        // either weighted-avg achievement% or sum of contributions
  /**
   * Semantic unit of aggregateValue — set by the aggregator step.
   * 'achievement_pct'  = weighted-average achievement% (legacy flow)
   * 'contribution_sum' = sum of weighted contributions (SMARTS flow)
   * undefined before any aggregator has run.
   */
  aggregateValueUnit?: 'achievement_pct' | 'contribution_sum'

  // Set by THRESHOLD_BAND_MATCHER (basket-level)
  bandLabel?:    string
  bandLabelAr?:  string
  bandScore?:    number
  bandColor?:    string

  // Set by BASKET_SCORE_AGGREGATOR
  weightedScore?: number         // band score × basket weight (legacy) or contribution (SMARTS)

  // Validity
  isValid?:      boolean
  invalidReason?: string
}

/**
 * Top-level pipeline context.
 * Created once per evaluation run and passed through all processors.
 */
export interface EvaluationPipelineContext {
  // Identity
  userId:     string
  pharmacyId: string
  month:      string
  role:       string
  profileId:  string
  profileVersion: number

  // Input data (set at pipeline construction, never mutated)
  kpiActuals:     Record<string, number>
  personalTarget: Record<string, number> | null   // flattened targets map
  branchTarget:   Record<string, number> | null   // flattened targets map
  registry:       Record<string, { key: string; label: string; aliasFor?: string }>

  // Basket contexts — one per active basket in the profile
  baskets:    BasketContext[]

  // Final outputs (set by BASKET_SCORE_AGGREGATOR)
  finalScore?:             number
  normalizedFinalScorePct?: number
  ratingLabel?:            string
  ratingLabelAr?:          string
  ratingScore?:            number
  ratingColor?:            string

  // Warnings accumulated during execution
  warnings:   string[]
}

// ── Pipeline step ─────────────────────────────────────────────

/**
 * A single step in an evaluation pipeline.
 * config carries processor-specific parameters.
 */
export interface EvaluationPipelineStep {
  type:        EvaluationProcessorType
  /** Human-readable description of what this step does */
  description: string
  /** Processor-specific parameters — typed per processor in processors.ts */
  config:      Record<string, unknown>
}

// ── Processor ─────────────────────────────────────────────────

/**
 * A processor is a pure function that takes a context,
 * applies one computation, records a trace entry, and returns
 * the updated context.
 */
export interface EvaluationProcessor {
  type:    EvaluationProcessorType
  execute: (
    ctx:     EvaluationPipelineContext,
    step:    EvaluationPipelineStep,
    tracing: ProcessorTrace[],
  ) => EvaluationPipelineContext
}

// ── Trace ─────────────────────────────────────────────────────

/**
 * Trace entry produced by each processor execution.
 * Provides full explainability of the calculation.
 */
export interface ProcessorTrace {
  step:        number            // 0-indexed step position in the pipeline
  processorType: EvaluationProcessorType
  description: string
  /** Key input values relevant to this processor */
  inputs:      Record<string, unknown>
  /** Key output values produced by this processor */
  outputs:     Record<string, unknown>
  /** Human-readable summary of what this step computed */
  summary:     string
  warnings:    string[]
  durationMs:  number
}

/**
 * Full pipeline execution result.
 */
export interface EvaluationPipelineResult {
  context:     EvaluationPipelineContext
  tracing:     ProcessorTrace[]
  /** Wall-clock time for the full pipeline */
  totalDurationMs: number
  /** Whether all processors completed without fatal errors */
  success:     boolean
  /** Accumulated errors from all steps */
  errors:      string[]
}
