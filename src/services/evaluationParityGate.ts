// ============================================================
// Evaluation Engine V2 Production Promotion Bundle — Phase C
//
// Parity Gate — aggregates existing shadow evaluation logs into a single
// PASS / WARN / BLOCK decision for whether V2 may safely become official.
//
// This module does NOT read Firestore and does NOT flip any production
// flag. It is a pure decision function: callers fetch shadow logs
// (shadow_evaluation_logs, see shadowEvaluationLogService.ts) themselves
// and pass a lightweight summary of them in. The decision is advisory —
// no code path in this codebase reads evaluateParityGate() output to
// change activeEngine. Promoting V2 in production still requires a
// manual Firestore system_config/evaluation edit, as documented in
// evaluationEngineConfigService.ts.
//
// Constraints:
//   ✓ Pure function — no Firestore, no React, no side effects
//   ✗ Never throws
//   ✗ Never writes anything
// ============================================================

import type { ComparisonSeverity } from '../engine/evaluationPipeline/pipelineResolver'

/** Minimum number of shadow samples required for a confident PASS. */
export const PARITY_GATE_MIN_SAMPLE_SIZE = 20

/**
 * The subset of a ShadowEvaluationLog the gate needs.
 * Deliberately decoupled from the full Firestore log shape so callers can
 * pass in plain summaries (e.g. from a Firestore query projection) without
 * importing the full ShadowEvaluationLog type.
 */
export interface ParityGateLogEntry {
  ran:      boolean
  severity: ComparisonSeverity | 'error'
}

export type ParityGateDecision = 'PASS' | 'WARN' | 'BLOCK'

export interface ParityGateSeverityCounts {
  none:   number
  minor:  number
  major:  number
  error:  number
  notRan: number
}

export interface ParityGateResult {
  decision:   ParityGateDecision
  reason:     string
  sampleSize: number
  counts:     ParityGateSeverityCounts
}

/**
 * Evaluate the V1/V2 parity gate from a set of shadow evaluation log
 * summaries.
 *
 * Decision rules (in priority order):
 *   1. Zero samples                         → BLOCK (cannot prove parity)
 *   2. Any 'major' mismatch or 'error'      → BLOCK (unsafe to promote)
 *   3. Sample size below the minimum         → WARN (too little evidence)
 *   4. Any 'minor' mismatch                  → WARN (review before promoting)
 *   5. Otherwise (all clean, enough samples) → PASS
 *
 * No production cutover should occur while the gate returns BLOCK.
 */
export function evaluateParityGate(shadowLogs: ParityGateLogEntry[]): ParityGateResult {
  const counts: ParityGateSeverityCounts = { none: 0, minor: 0, major: 0, error: 0, notRan: 0 }

  for (const log of shadowLogs) {
    // A failed shadow run (ran=false) is tracked in notRan AND counted by its
    // severity (buildShadowLog always sets severity='error' when ran=false —
    // see shadowEvaluationLogService.ts — so this is not double-counting two
    // independent problems, it is recording one problem two ways).
    if (!log.ran) counts.notRan++
    if (log.severity === 'none')  counts.none++
    else if (log.severity === 'minor') counts.minor++
    else if (log.severity === 'major') counts.major++
    else if (log.severity === 'error') counts.error++
  }

  const sampleSize = shadowLogs.length

  if (sampleSize === 0) {
    return {
      decision: 'BLOCK',
      reason: 'No shadow evaluation logs available — cannot prove V1/V2 parity with zero samples.',
      sampleSize,
      counts,
    }
  }

  if (counts.major > 0 || counts.error > 0) {
    return {
      decision: 'BLOCK',
      reason: `${counts.major} major mismatch(es) and ${counts.error} shadow run error(s) found across ${sampleSize} sample(s) — V2 must not become official until resolved.`,
      sampleSize,
      counts,
    }
  }

  if (sampleSize < PARITY_GATE_MIN_SAMPLE_SIZE) {
    return {
      decision: 'WARN',
      reason: `Only ${sampleSize} shadow sample(s) available (minimum ${PARITY_GATE_MIN_SAMPLE_SIZE} required for a confident PASS) — no major mismatches seen so far, but the sample size is too small to promote.`,
      sampleSize,
      counts,
    }
  }

  if (counts.minor > 0) {
    return {
      decision: 'WARN',
      reason: `${counts.minor} minor mismatch(es) found across ${sampleSize} samples — review before promoting.`,
      sampleSize,
      counts,
    }
  }

  return {
    decision: 'PASS',
    reason: `All ${sampleSize} shadow samples matched with zero differences — safe to consider V2 promotion.`,
    sampleSize,
    counts,
  }
}
