// ============================================================
// Shadow Evaluation Log Service
//
// Stores V1 vs V2 shadow comparison results in a separate
// Firestore collection for diagnostic purposes.
//
// Contract:
//   ✓ Write-only (append-only documents, no updates)
//   ✓ NEVER touches evaluation_results (the official ledger)
//   ✓ NEVER affects V1 execution, ranking, or bulk evaluation
//   ✓ Pure diagnostic data — does not change scores
//   ✗ Not indexed by ranking service
//   ✗ Not read by any production evaluation path
//
// Firestore collection: shadow_evaluation_logs/{auto-id}
// ============================================================

import type { EvaluationDifference, ComparisonSeverity, PipelineId }
  from '../engine/evaluationPipeline/pipelineResolver'
import type { ResultStatus }
  from '../engine/evaluationEngine/evaluationEngineTypes'

// ── Types ─────────────────────────────────────────────────────

export type ShadowSource            = 'single_user' | 'bulk'
export type ComparisonDirection     = 'v1_vs_v2' | 'v2_vs_v1'

/**
 * Summary of the key scalar fields from one evaluation result (V1 or V2).
 * Used to preserve enough context for post-hoc comparison without storing
 * the full basket/element tree.
 */
export interface EvaluationResultSummary {
  finalScore:             number
  normalizedFinalScorePct: number | null
  ratingScore:            number
  status:                 ResultStatus
}

/**
 * A shadow evaluation log document.
 * Written to `shadow_evaluation_logs` after each evaluation
 * where shadow mode ran.
 *
 * One document per user evaluation. Write-once.
 */
export interface ShadowEvaluationLog {
  // ── Identity ─────────────────────────────────────────────
  userId:         string
  pharmacyId:     string
  month:          string
  role:           string
  profileId:      string
  profileVersion: number
  pipelineId:     PipelineId | 'unknown'

  // ── Shadow outcome ────────────────────────────────────────
  ran:            boolean
  severity:       ComparisonSeverity | 'error'
  differences:    EvaluationDifference[]

  // ── V1 result summary ─────────────────────────────────────
  v1:             EvaluationResultSummary | null

  // ── V2 result summary ─────────────────────────────────────
  v2:             EvaluationResultSummary | null

  // ── Diagnostic metadata ───────────────────────────────────
  /** Warnings from both V1 preflight and V2 shadow execution */
  warnings:       string[]
  /** Error message if shadow run failed (ran=false) */
  error?:         string
  /** Ledger doc ID written by V1 for cross-reference */
  ledgerDocId?:   string
  /** Whether this was triggered from single-user run or bulk run */
  source:         ShadowSource
  /** ISO timestamp */
  computedAt:     string

  // ── Engine direction metadata ─────────────────────────────
  /**
   * Which engine produced the official ledger document for this evaluation.
   * 'v1' during shadow validation; 'v2' during and after Limited Rollout.
   */
  officialEngine:       'v1' | 'v2'
  /**
   * Which engine ran in shadow mode (comparison only, not written to ledger).
   * 'v2' during shadow validation; 'v1' during Limited Rollout reverse-shadow.
   */
  shadowEngine:         'v1' | 'v2'
  /**
   * Direction of comparison, for sprint query filtering.
   * 'v1_vs_v2' — current: V1 official, V2 shadow (forward shadow mode)
   * 'v2_vs_v1' — Limited Rollout: V2 official, V1 reverse shadow
   */
  comparisonDirection:  ComparisonDirection
}

// ── Collection constant ───────────────────────────────────────

export const SHADOW_LOG_COLLECTION = 'shadow_evaluation_logs'

// ── Firestore sanitizer ───────────────────────────────────────

/**
 * Recursively sanitize a value so it is safe to write to Firestore.
 *
 * Firestore rejects documents that contain:
 *   - undefined  (including optional fields like EvaluationDifference.delta)
 *   - NaN
 *   - Infinity / -Infinity
 *
 * Rules applied:
 *   - undefined       → field is omitted from the output object
 *   - NaN / ±Infinity → null
 *   - Arrays          → each element sanitized; undefined elements removed
 *   - Plain objects   → each key sanitized; undefined-valued keys omitted
 *   - Everything else → passed through unchanged
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return undefined  // caller omits the key

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return null
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitizeForFirestore)
      .filter((v) => v !== undefined)
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeForFirestore(v)
      if (sanitized !== undefined) {
        out[k] = sanitized
      }
    }
    return out
  }

  return value  // string, boolean, null
}

/**
 * Sanitize a ShadowEvaluationLog for Firestore.
 * Returns the clean payload and a list of fields that were removed or coerced.
 */
function sanitizeLog(log: ShadowEvaluationLog): {
  payload: Record<string, unknown>
  removed: string[]
} {
  const removed: string[] = []

  if (log.error       === undefined) removed.push('error (undefined → omitted)')
  if (log.ledgerDocId === undefined) removed.push('ledgerDocId (undefined → omitted)')

  const undefDeltas = (log.differences ?? []).filter((d) => d.delta === undefined)
  if (undefDeltas.length > 0) {
    removed.push(
      `differences[].delta: ${undefDeltas.length} undefined → omitted ` +
      `(${undefDeltas.map((d) => d.field).join(', ')})`
    )
  }

  const badDeltas = (log.differences ?? []).filter(
    (d) => d.delta !== undefined && (isNaN(d.delta) || !isFinite(d.delta))
  )
  if (badDeltas.length > 0) {
    removed.push(`differences[].delta: ${badDeltas.length} NaN/Infinity → null`)
  }

  for (const label of ['v1', 'v2'] as const) {
    const s = log[label]
    if (s) {
      if (typeof s.finalScore  === 'number' && !isFinite(s.finalScore))  removed.push(`${label}.finalScore non-finite → null`)
      if (typeof s.ratingScore === 'number' && !isFinite(s.ratingScore)) removed.push(`${label}.ratingScore non-finite → null`)
    }
  }

  const payload = sanitizeForFirestore(log) as Record<string, unknown>
  return { payload, removed }
}

// ── Firestore service ─────────────────────────────────────────

/**
 * Write a shadow evaluation log document.
 *
 * Safe: never throws. Any Firestore error is caught and logged to console.
 * Does NOT affect V1 evaluation outcome.
 *
 * @returns The new document ID, or null if write failed.
 */
export async function writeShadowEvaluationLog(
  log: ShadowEvaluationLog,
): Promise<string | null> {
  try {
    const { addDoc, collection } = await import('firebase/firestore')
    const { db } = await import('./firebase')
    console.debug('[shadowLog] calling addDoc to shadow_evaluation_logs', {
      userId:     log.userId,
      month:      log.month,
      severity:   log.severity,
      source:     log.source,
      pipelineId: log.pipelineId,
    })
    const { payload, removed } = sanitizeLog(log)
    console.debug('[shadowLog] sanitized payload ready', {
      userId:       log.userId,
      month:        log.month,
      severity:     log.severity,
      source:       log.source,
      pipelineId:   log.pipelineId,
      topLevelKeys: Object.keys(payload),
      ...(removed.length > 0 && { sanitized: removed }),
    })
    const ref = await addDoc(collection(db, SHADOW_LOG_COLLECTION), payload)
    console.debug('[shadowLog] addDoc succeeded ✓', { docId: ref.id })
    return ref.id
  } catch (err) {
    // Shadow log failure must NEVER affect the caller.
    // Log with enough detail to diagnose the failure in the browser console.
    const code    = (err as any)?.code    ?? 'unknown'
    const message = (err as any)?.message ?? String(err)
    console.error(
      `[shadowLog] Failed to write shadow evaluation log — code: ${code}`,
      { message, userId: log.userId, month: log.month, severity: log.severity },
    )
    return null
  }
}

/**
 * Build a ShadowEvaluationLog from the components available
 * after a shadow evaluation run.
 */
export function buildShadowLog(opts: {
  userId:         string
  pharmacyId:     string
  month:          string
  role:           string
  profileId:      string
  profileVersion: number
  ledgerDocId?:   string
  source:         ShadowSource
  /**
   * Which engine produced the official ledger doc.
   * Defaults to 'v1' (current shadow validation mode).
   * Pass 'v2' when V2 is the official engine (Limited Rollout+).
   */
  officialEngine?: 'v1' | 'v2'
  shadow: {
    ran:          boolean
    pipelineId?:  PipelineId
    error?:       string
    v2Result?:    {
      finalScore:    number
      ratingScore:   number
      status:        ResultStatus
      trace: { normalizedFinalScorePct?: number }
    }
    comparison?: {
      severity:    ComparisonSeverity
      differences: EvaluationDifference[]
    }
    summary:      string
  }
  v1: {
    finalScore:    number
    ratingScore:   number
    status:        ResultStatus
    trace: { normalizedFinalScorePct?: number }
  }
  warnings:       string[]
}): ShadowEvaluationLog {
  const { shadow, v1, userId, pharmacyId, month, role,
          profileId, profileVersion, ledgerDocId, source, warnings } = opts

  // Determine direction from officialEngine (defaults to 'v1' → forward shadow mode)
  const official:   'v1' | 'v2'    = opts.officialEngine ?? 'v1'
  const shadow_eng: 'v1' | 'v2'    = official === 'v1' ? 'v2' : 'v1'
  const direction:  ComparisonDirection =
    official === 'v1' ? 'v1_vs_v2' : 'v2_vs_v1'

  const v1Summary: EvaluationResultSummary = {
    finalScore:             v1.finalScore,
    normalizedFinalScorePct: v1.trace.normalizedFinalScorePct ?? null,
    ratingScore:            v1.ratingScore,
    status:                 v1.status,
  }

  const v2Summary: EvaluationResultSummary | null = shadow.v2Result
    ? {
        finalScore:             shadow.v2Result.finalScore,
        normalizedFinalScorePct: shadow.v2Result.trace.normalizedFinalScorePct ?? null,
        ratingScore:            shadow.v2Result.ratingScore,
        status:                 shadow.v2Result.status,
      }
    : null

  return {
    userId, pharmacyId, month, role,
    profileId, profileVersion,
    pipelineId:  shadow.pipelineId ?? 'unknown',
    ran:         shadow.ran,
    severity:    shadow.ran ? (shadow.comparison?.severity ?? 'none') : 'error',
    differences: shadow.comparison?.differences ?? [],
    v1:          v1Summary,
    v2:          v2Summary,
    warnings,
    error:       shadow.error,
    ledgerDocId,
    source,
    computedAt:  new Date().toISOString(),
    officialEngine:      official,
    shadowEngine:        shadow_eng,
    comparisonDirection: direction,
  }
}
