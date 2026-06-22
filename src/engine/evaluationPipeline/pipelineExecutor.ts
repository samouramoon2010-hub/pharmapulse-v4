// ============================================================
// Evaluation Pipeline — Executor
//
// Validates a pipeline definition, then runs each processor
// in sequence, threading context through and accumulating traces.
//
// Validation happens BEFORE execution — unknown processor types
// throw at validation time so no partial state is produced.
// ============================================================

import type {
  EvaluationPipelineContext,
  EvaluationPipelineStep,
  EvaluationPipelineResult,
  ProcessorTrace,
  EvaluationProcessorType,
} from './types'
import { PROCESSOR_REGISTRY } from './processors'

// ── Validation ────────────────────────────────────────────────

/**
 * Validate that every step in the pipeline has a registered processor.
 * Throws with the full list of invalid types if any are found.
 * Called before execution so no partial context is produced.
 */
export function validatePipeline(steps: EvaluationPipelineStep[]): void {
  const unknown = steps
    .map((s) => s.type)
    .filter((t) => !(t in PROCESSOR_REGISTRY))

  if (unknown.length > 0) {
    throw new Error(
      `Pipeline validation failed — unknown processor type(s): ${unknown.join(', ')}. ` +
      `Approved types: ${Object.keys(PROCESSOR_REGISTRY).join(', ')}`
    )
  }

  if (steps.length === 0) {
    throw new Error('Pipeline validation failed — no steps defined')
  }
}

// ── Execution ─────────────────────────────────────────────────

/**
 * Execute a validated pipeline.
 * Each processor receives the full context from the prior step.
 * Traces accumulate across all steps.
 *
 * @throws if pipeline is invalid (validatePipeline is called first)
 */
export function executePipeline(
  initialContext: EvaluationPipelineContext,
  steps:          EvaluationPipelineStep[],
): EvaluationPipelineResult {
  const wallStart = Date.now()

  // Validate before touching context
  validatePipeline(steps)

  const tracing: ProcessorTrace[] = []
  const errors:  string[] = []
  let ctx = initialContext

  for (const step of steps) {
    const processor = PROCESSOR_REGISTRY[step.type as EvaluationProcessorType]
    try {
      ctx = processor.execute(ctx, step, tracing)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Step ${tracing.length} (${step.type}): ${msg}`)
      // Continue with unchanged context so subsequent steps can still run
    }
  }

  return {
    context:          ctx,
    tracing,
    totalDurationMs:  Date.now() - wallStart,
    success:          errors.length === 0,
    errors,
  }
}
