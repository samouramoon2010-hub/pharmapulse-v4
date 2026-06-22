// ============================================================
// Evaluation Ledger — Batch Runner (Phase 5B)
//
// Runs evaluations for many entities against the same published
// profile/period in one call. Delegates every individual run to
// the existing runEvaluation() — never reimplements scoring.
//
// Pure — never writes to Firestore. Bounded — processes entities
// sequentially with no unbounded accumulation beyond the result
// array the caller explicitly asked for.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { runEvaluation } from './evaluationRunner'
import type { RunEvaluationInput, RunEvaluationResult } from './evaluationRunner'

/** Safety ceiling — a single batch call should not attempt unbounded work. */
export const MAX_BATCH_SIZE = 5000

export interface RunEvaluationBatchInput {
  runs: RunEvaluationInput[]
}

export interface RunEvaluationBatchResult {
  total:        number
  successCount: number
  failureCount: number
  results:      RunEvaluationResult[]
  truncated:    boolean
}

/**
 * Runs a batch of evaluations sequentially. Never throws — a failure in
 * one run is captured in its own result entry and does not abort the batch.
 */
export function runEvaluationBatch(input: RunEvaluationBatchInput): RunEvaluationBatchResult {
  const runs = Array.isArray(input?.runs) ? input.runs : []
  const truncated = runs.length > MAX_BATCH_SIZE
  const bounded = truncated ? runs.slice(0, MAX_BATCH_SIZE) : runs

  const results: RunEvaluationResult[] = []
  let successCount = 0
  let failureCount = 0

  for (const run of bounded) {
    let result: RunEvaluationResult
    try {
      result = runEvaluation(run)
    } catch (e) {
      result = { success: false, issues: [`batch entry failed: ${e instanceof Error ? e.message : String(e)}`] }
    }
    results.push(result)
    if (result.success) successCount++
    else failureCount++
  }

  return { total: bounded.length, successCount, failureCount, results, truncated }
}
