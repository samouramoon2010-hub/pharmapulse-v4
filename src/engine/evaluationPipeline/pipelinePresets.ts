// ============================================================
// Evaluation Pipeline — Presets
//
// Hardcoded pipeline step sequences for:
//
//   LEGACY_BAND_SCORE_PIPELINE
//     Reproduces v1 engine behaviour:
//       achievement% → cap → weighted-avg aggregate → threshold band → final score
//
//   SMARTS_WEIGHTED_CONTRIBUTION_PIPELINE
//     SMARTS-style flow:
//       achievement% → cap → weighted contribution → sum basket total → threshold band → final score
//
// Both presets accept a ThresholdRule for the final rating step.
// ============================================================

import type { EvaluationPipelineStep } from './types'
import type { ThresholdRule } from '../evaluationRegistry/evaluationRegistryTypes'

/**
 * Legacy band-score pipeline.
 * Matches the v1 evaluationEngine.ts flow as closely as possible.
 *
 * Flow:
 *   1. Compute raw element achievement% (actual / target × 100)
 *   2. Apply achievement caps if configured
 *   3. Weighted-average aggregate per basket (Σ cappedAch × weight)
 *   4. Match basket aggregate to threshold band → bandScore
 *   5. Combine basket bandScores into finalScore and rating
 */
export function buildLegacyPipeline(opts: {
  defaultThresholdRule: ThresholdRule | null
  caps?: Record<string, { basketCap?: number; elementCaps?: Record<string, number> }>
}): EvaluationPipelineStep[] {
  return [
    {
      type:        'ELEMENT_ACHIEVEMENT_CALCULATOR',
      description: 'Compute raw element achievement% (actual / target × 100)',
      config:      {},
    },
    {
      type:        'ACHIEVEMENT_CAP_APPLIER',
      description: 'Apply element and basket achievement caps from profile',
      config:      { caps: opts.caps ?? {} },
    },
    {
      type:        'ELEMENT_BAND_SCORER',
      description: 'Apply threshold band to each element (cappedAchievementPct → bandScore × weight)',
      config:      {},
    },
    {
      type:        'WEIGHTED_AVERAGE_AGGREGATOR',
      description: 'Aggregate element achievements into basket total using weighted average',
      config:      {},
    },
    {
      type:        'THRESHOLD_BAND_MATCHER',
      description: 'Match basket aggregate achievement% to threshold bands',
      config:      {},
    },
    {
      type:        'BASKET_SCORE_AGGREGATOR',
      description: 'Combine basket band scores into finalScore, normalize, and apply overall rating',
      config:      { defaultThresholdRule: opts.defaultThresholdRule },
    },
  ]
}

/**
 * SMARTS weighted-contribution pipeline.
 *
 * Flow:
 *   1. Compute raw element achievement% (actual / target × 100)
 *   2. Apply achievement caps if configured
 *   3. Compute weighted contribution: achievementPct × element.weight
 *   4. Sum contributions into basket total
 *   5. Match basket total to threshold band → bandScore
 *   6. Combine basket bandScores into finalScore and rating
 *
 * The key difference from legacy: elements contribute their raw weighted achievement
 * (not their band score) to the basket total before threshold matching.
 * This produces a continuous aggregate rather than a step-function.
 */
export function buildSmartsPipeline(opts: {
  defaultThresholdRule: ThresholdRule | null
  caps?: Record<string, { basketCap?: number; elementCaps?: Record<string, number> }>
}): EvaluationPipelineStep[] {
  return [
    {
      type:        'ELEMENT_ACHIEVEMENT_CALCULATOR',
      description: 'Compute raw element achievement% (actual / target × 100)',
      config:      {},
    },
    {
      type:        'ACHIEVEMENT_CAP_APPLIER',
      description: 'Apply element and basket achievement caps from profile',
      config:      { caps: opts.caps ?? {} },
    },
    {
      type:        'ELEMENT_BAND_SCORER',
      description: 'Apply threshold band to each element (cappedAchievementPct → bandScore × weight)',
      config:      {},
    },
    {
      type:        'WEIGHT_CONTRIBUTION_APPLIER',
      description: 'Compute weighted contribution: cappedAchievement% × element.weight',
      config:      {},
    },
    {
      type:        'SUM_AGGREGATOR',
      description: 'Sum element contributions into basket total',
      config:      {},
    },
    {
      type:        'THRESHOLD_BAND_MATCHER',
      description: 'Match basket contribution total to threshold bands',
      config:      {},
    },
    {
      type:        'BASKET_SCORE_AGGREGATOR',
      description: 'Combine basket band scores into finalScore, normalize, and apply overall rating',
      config:      { defaultThresholdRule: opts.defaultThresholdRule },
    },
  ]
}
