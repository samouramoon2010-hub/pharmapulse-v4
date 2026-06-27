// ============================================================
// Evaluation Shared — Official Score Rounding
//
// PR-1I compliance fix (Rule B).
//
// Business rule:
//   The official final evaluation score must be rounded to exactly
//   two decimal places at the final boundary, using a deterministic,
//   floating-point-safe rounding utility — never repeated
//   intermediate rounding, never left as a raw float artifact
//   (e.g. 89.999999999, 74.5550001, 100.00000000002).
//
//   roundedValue = Math.round((rawValue + Number.EPSILON) * 100) / 100
//
// Shared by:
//   - evaluationEngine.ts        (V1 production engine)
//   - evaluationPipeline/processors.ts (V2 pipeline)
//
// Constraints:
//   ✗ No React
//   ✗ No Firestore
//   ✗ No Zustand
//   ✗ No side effects
//   ✓ Pure functions only
// ============================================================

/**
 * Round a number to exactly two decimal places, guarding against
 * floating-point representation artifacts via Number.EPSILON.
 *
 * Apply this once, at the final official boundary, on the rounded-from
 * value (e.g. EvaluationResult.finalScore, trace.normalizedFinalScorePct)
 * — not on intermediate per-element or per-basket calculations.
 */
export function roundToTwoDecimals(value: number): number {
  if (!isFinite(value)) return value
  return Math.round((value + Number.EPSILON) * 100) / 100
}
