// ============================================================
// Evaluation Shared — Missing-Data Weight Redistribution
//
// PR-1I compliance fix (Rule A).
//
// Business rule:
//   When a basket element has no applicable data, it must be
//   excluded from the basket's weighted aggregate AND its weight
//   must be redistributed proportionally across the remaining
//   applicable elements — never silently dropped, never assigned
//   a contributing score of zero "for free."
//
//   normalizedWeight_i = originalWeight_i / Σ(originalWeight of all applicable elements)
//   weightedContribution_i = elementScore_i × normalizedWeight_i
//
// Explicit sub-rules:
//   - An element that is present but genuinely achieved 0% is
//     APPLICABLE (dataAvailable = true) and is NOT redistributed —
//     0 !== missing.
//   - When every element in a basket is inapplicable, there is no
//     valid denominator. Callers must guard the zero-denominator
//     case themselves (this module never divides by zero) and fall
//     back to the existing supported no-data value rather than
//     inventing a score.
//
// Shared by:
//   - evaluationEngine.ts        (V1 production engine)
//   - evaluationPipeline/processors.ts (V2 pipeline — legacy + SMARTS flows)
//
// Constraints:
//   ✗ No React
//   ✗ No Firestore
//   ✗ No Zustand
//   ✗ No side effects
//   ✓ Pure functions only
// ============================================================

export interface WeightApplicability {
  weight:        number
  dataAvailable: boolean
}

/**
 * Sum the weight of every applicable (dataAvailable = true) element.
 * Elements with no data contribute nothing to this denominator.
 */
export function computeApplicableWeightSum(
  elements: readonly WeightApplicability[],
): number {
  return elements.reduce(
    (sum, el) => sum + (el.dataAvailable ? el.weight : 0),
    0,
  )
}

/**
 * Resolve the normalized (redistributed) weight for a single element.
 *
 * Returns 0 for an inapplicable element (its weight was redistributed
 * away from it, not toward it) and 0 when there is no valid
 * denominator (applicableWeightSum <= 0) — callers handle the
 * basket-level no-data fallback separately.
 */
export function normalizedElementWeight(
  weight:              number,
  dataAvailable:       boolean,
  applicableWeightSum: number,
): number {
  if (!dataAvailable) return 0
  if (applicableWeightSum <= 0) return 0
  return weight / applicableWeightSum
}
