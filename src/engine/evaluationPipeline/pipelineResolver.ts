// ============================================================
// Evaluation Pipeline — Resolver (Phase 2B)
//
// Helpers for profile-driven pipeline selection and shadow comparison.
//
// Three concerns:
//   1. resolveEvaluationPipeline()  — pick the right preset for a profile
//   2. compareEvaluationResults()   — diff V1 vs V2 outputs
//   3. runShadowEvaluation()        — run V2 alongside V1, return comparison
//
// Production path is UNCHANGED.  V1 remains the official result.
// V2 runs in shadow mode: executed, compared, NOT written to ledger.
//
// Constraints:
//   ✓ Pure functions where possible
//   ✗ No Firestore writes
//   ✗ No ledger writes
//   ✗ No React
// ============================================================

import type { EvaluationProfile }      from '../evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationEngineInput }  from '../evaluationEngine/evaluationEngineTypes'
import type { EvaluationResult }       from '../evaluationEngine/evaluationEngineTypes'
import type { EvaluationPipelineStep } from '../evaluationPipeline/types'
import {
  buildLegacyPipeline,
  buildSmartsPipeline,
  buildPipelineContext,
  extractCapConfig,
  executePipeline,
  pipelineResultToEvaluationResult,
} from '../evaluationPipeline'

// ── Pipeline ID type ──────────────────────────────────────────

export type PipelineId =
  | 'legacy-band-score'
  | 'smarts-weighted-contribution'

// ── 1. Pipeline selection helper ─────────────────────────────

export interface ResolvedPipeline {
  pipelineId:  PipelineId
  steps:       EvaluationPipelineStep[]
  description: string
}

/**
 * Resolve which V2 pipeline preset to use for a given profile.
 *
 * - profile.pipelineId present and valid → use that preset
 * - profile.pipelineId absent / null     → default to 'legacy-band-score'
 *
 * The default ensures every profile gets a V2 shadow run even before
 * pipelineId has been explicitly configured.
 */
export function resolveEvaluationPipeline(
  profile: EvaluationProfile,
): ResolvedPipeline {
  const id: PipelineId =
    profile.pipelineId === 'smarts-weighted-contribution'
      ? 'smarts-weighted-contribution'
      : 'legacy-band-score'                           // default / absent / null

  const caps = extractCapConfig(profile)
  const opts = { defaultThresholdRule: profile.defaultThresholdRule, caps }

  const steps =
    id === 'smarts-weighted-contribution'
      ? buildSmartsPipeline(opts)
      : buildLegacyPipeline(opts)

  const description =
    id === 'smarts-weighted-contribution'
      ? 'SMARTS weighted-contribution pipeline (achievement% × weight → sum → threshold)'
      : 'Legacy band-score pipeline (weighted-avg aggregate → threshold → band score)'

  return { pipelineId: id, steps, description }
}

// ── 2. Comparison function ────────────────────────────────────

export interface EvaluationDifference {
  field:    string
  v1:       number | string
  v2:       number | string
  delta?:   number          // for numeric fields
}

export type ComparisonSeverity = 'none' | 'minor' | 'major'

export interface EvaluationComparisonResult {
  /** All numeric differences were within tolerance */
  matched:    boolean
  differences: EvaluationDifference[]
  severity:   ComparisonSeverity
  /** Tolerance used for numeric comparison (default 0.01) */
  tolerance:  number
}

const DEFAULT_TOLERANCE = 0.01

/**
 * Compare V1 and V2 evaluation results field-by-field.
 *
 * Numeric comparison uses tolerance (default 0.01) to account for
 * floating-point rounding differences.
 *
 * Coverage (expanded in Phase 2C):
 *   Scalar:  finalScore, normalizedFinalScorePct, ratingScore, status
 *   Basket:  basketCount, aggregateAchievementPct, bandScore, weightedScore, isValid
 *   Element: achievementPct, cappedAchievementPct, weightedScore, bandScore
 *   Trace:   cappedKpisCount
 */
export function compareEvaluationResults(
  v1:        EvaluationResult,
  v2:        EvaluationResult,
  tolerance: number = DEFAULT_TOLERANCE,
): EvaluationComparisonResult {
  const diffs: EvaluationDifference[] = []
  const numericClose = (a: number, b: number) => Math.abs(a - b) <= tolerance

  // ── Scalar fields ─────────────────────────────────────────

  if (!numericClose(v1.finalScore, v2.finalScore)) {
    diffs.push({
      field: 'finalScore',
      v1: v1.finalScore, v2: v2.finalScore,
      delta: Math.abs(v1.finalScore - v2.finalScore),
    })
  }

  const v1norm = v1.trace.normalizedFinalScorePct ?? 0
  const v2norm = v2.trace.normalizedFinalScorePct ?? 0
  if (!numericClose(v1norm, v2norm)) {
    diffs.push({
      field: 'normalizedFinalScorePct',
      v1: v1norm, v2: v2norm,
      delta: Math.abs(v1norm - v2norm),
    })
  }

  if (v1.ratingScore !== v2.ratingScore) {
    diffs.push({ field: 'ratingScore', v1: v1.ratingScore, v2: v2.ratingScore })
  }

  if (v1.status !== v2.status) {
    diffs.push({ field: 'status', v1: v1.status, v2: v2.status })
  }

  if (v1.basketResults.length !== v2.basketResults.length) {
    diffs.push({ field: 'basketCount', v1: v1.basketResults.length, v2: v2.basketResults.length })
  }

  // ── Per-basket + per-element ───────────────────────────────

  const basketCount = Math.min(v1.basketResults.length, v2.basketResults.length)
  for (let i = 0; i < basketCount; i++) {
    const b1 = v1.basketResults[i]
    const b2 = v2.basketResults[i]
    const bp = `basket[${i}]`

    if (!numericClose(b1.aggregateAchievementPct, b2.aggregateAchievementPct)) {
      diffs.push({
        field: `${bp}.aggregateAchievementPct`,
        v1: b1.aggregateAchievementPct, v2: b2.aggregateAchievementPct,
        delta: Math.abs(b1.aggregateAchievementPct - b2.aggregateAchievementPct),
      })
    }
    if (b1.bandScore !== b2.bandScore) {
      diffs.push({ field: `${bp}.bandScore`, v1: b1.bandScore, v2: b2.bandScore })
    }
    if (!numericClose(b1.weightedScore, b2.weightedScore)) {
      diffs.push({
        field: `${bp}.weightedScore`,
        v1: b1.weightedScore, v2: b2.weightedScore,
        delta: Math.abs(b1.weightedScore - b2.weightedScore),
      })
    }
    if (b1.isValid !== b2.isValid) {
      diffs.push({ field: `${bp}.isValid`, v1: String(b1.isValid), v2: String(b2.isValid) })
    }

    const elCount = Math.min(b1.elements?.length ?? 0, b2.elements?.length ?? 0)
    for (let j = 0; j < elCount; j++) {
      const e1 = b1.elements[j]
      const e2 = b2.elements[j]
      const ep = `${bp}.element[${j}]`

      if (!numericClose(e1.achievementPct, e2.achievementPct)) {
        diffs.push({
          field: `${ep}.achievementPct`,
          v1: e1.achievementPct, v2: e2.achievementPct,
          delta: Math.abs(e1.achievementPct - e2.achievementPct),
        })
      }
      if (!numericClose(e1.cappedAchievementPct, e2.cappedAchievementPct)) {
        diffs.push({
          field: `${ep}.cappedAchievementPct`,
          v1: e1.cappedAchievementPct, v2: e2.cappedAchievementPct,
          delta: Math.abs(e1.cappedAchievementPct - e2.cappedAchievementPct),
        })
      }
      if (!numericClose(e1.weightedScore, e2.weightedScore)) {
        diffs.push({
          field: `${ep}.weightedScore`,
          v1: e1.weightedScore, v2: e2.weightedScore,
          delta: Math.abs(e1.weightedScore - e2.weightedScore),
        })
      }
      if (e1.bandScore !== e2.bandScore) {
        diffs.push({ field: `${ep}.bandScore`, v1: e1.bandScore, v2: e2.bandScore })
      }
    }
  }

  // ── Cap trace ──────────────────────────────────────────────

  if (v1.trace.cappedKpis.length !== v2.trace.cappedKpis.length) {
    diffs.push({
      field: 'cappedKpisCount',
      v1: v1.trace.cappedKpis.length, v2: v2.trace.cappedKpis.length,
    })
  }

  // ── Severity ───────────────────────────────────────────────

  const matched = diffs.length === 0
  let severity: ComparisonSeverity = 'none'
  if (!matched) {
    const hasMajor = diffs.some((d) =>
      ['ratingScore','status','basketCount','cappedKpisCount'].includes(d.field) ||
      d.field.endsWith('.bandScore') ||
      d.field.endsWith('.isValid')   ||
      d.field.includes('.achievementPct') ||
      (d.field === 'finalScore'              && (d.delta ?? 0) > 0.1) ||
      (d.field === 'normalizedFinalScorePct' && (d.delta ?? 0) > 5)
    )
    severity = hasMajor ? 'major' : 'minor'
  }

  return { matched, differences: diffs, severity, tolerance }
}

// ── 3. Shadow evaluation runner ───────────────────────────────

export interface ShadowEvaluationResult {
  /** Whether the shadow run completed without error */
  ran:        boolean
  /** The V2 adapted result (undefined if run failed) */
  v2Result?:  EvaluationResult
  /** Comparison of V1 vs V2 (undefined if run failed) */
  comparison?: EvaluationComparisonResult
  /** Which pipeline was used */
  pipelineId?: PipelineId
  /** Error message if shadow run failed */
  error?:     string
  /** Log-friendly summary string */
  summary:    string
}

/**
 * Run V2 pipeline in shadow mode alongside a V1 result.
 *
 * Safety contract:
 *   - This function NEVER throws.
 *   - Any error is captured in ShadowEvaluationResult.error.
 *   - The official V1 result is never affected.
 *   - Nothing is written to Firestore.
 *
 * @param v1Result   The official V1 evaluation result (already computed)
 * @param engineInput  The same EvaluationEngineInput used for V1
 */
export function runShadowEvaluation(
  v1Result:    EvaluationResult,
  engineInput: EvaluationEngineInput,
): ShadowEvaluationResult {
  try {
    const resolved = resolveEvaluationPipeline(engineInput.profile)
    const ctx      = buildPipelineContext(engineInput)
    const pipeRes  = executePipeline(ctx, resolved.steps)

    // ── Stale-context guard ──────────────────────────────────
    // If any processor threw during execution, pipeRes.success = false and
    // pipeRes.context contains results from a partially-transformed context.
    // Comparing that against V1 would produce either false divergences or
    // false matches, both of which contaminate shadow log data.
    // We record it as a failed shadow run — not a parity comparison.
    if (!pipeRes.success) {
      const errorDetail = pipeRes.errors.join('; ')
      return {
        ran:    false,
        error:  `Pipeline execution failed (${pipeRes.errors.length} step error(s)): ${errorDetail}`,
        summary: `V2 Shadow: ❌ pipeline failed — ${errorDetail}`,
      }
    }

    const v2Result = pipelineResultToEvaluationResult(pipeRes, {
      personalTargetUsed: !!engineInput.personalTarget,
      calculatedAt:       Date.now(),
    })

    const comparison = compareEvaluationResults(v1Result, v2Result)

    const icon = comparison.severity === 'none'  ? '✅' :
                 comparison.severity === 'minor' ? '⚠️' : '❌'

    const summary =
      `V2 Shadow [${resolved.pipelineId}]: ${icon} ` +
      (comparison.matched
        ? 'Matched'
        : `${comparison.differences.length} difference(s) — severity: ${comparison.severity}`)

    return {
      ran: true, v2Result, comparison,
      pipelineId: resolved.pipelineId,
      summary,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ran: false,
      error: msg,
      summary: `V2 Shadow: failed — ${msg}`,
    }
  }
}
