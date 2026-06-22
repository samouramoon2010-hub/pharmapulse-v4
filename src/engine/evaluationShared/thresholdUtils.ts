// ============================================================
// Evaluation Shared — Threshold Utilities
//
// Pure functions for threshold band matching.
// Shared by:
//   - evaluationEngine.ts (V1 production engine)
//   - evaluationPipeline/processors.ts (V2 pipeline)
//
// Moving matchThresholdBand here breaks the V2 → V1 coupling
// that existed when processors.ts imported directly from
// evaluationEngine.ts.
//
// Constraints:
//   ✗ No React
//   ✗ No Firestore
//   ✗ No Zustand
//   ✗ No side effects
//   ✓ Pure functions only
// ============================================================

import type { ThresholdRule, ThresholdBand }
  from '../evaluationRegistry/evaluationRegistryTypes'

/**
 * Resolve the threshold band for a given input value.
 *
 * The last band is treated as open-ended (no upper bound check),
 * regardless of its `max` value. This handles both sentinel values
 * (max=999) and any other configuration.
 *
 * Boundary rule: band.min ≤ value < band.max
 * Special case:  the last band uses band.min ≤ value (open-ended)
 *
 * If no bands are defined, returns a safe fallback band (score=0, label='Unknown').
 *
 * @param value  The numeric value to match (achievement%, contribution total, or any scale)
 * @param rule   The ThresholdRule containing the ordered bands
 */
export function matchThresholdBand(
  value: number,
  rule:  ThresholdRule | null | undefined,
): ThresholdBand {
  // Defensive: a corrupted/historical profile may have a basket with no
  // thresholdRule at all (not merely empty bands). Same safe fallback as
  // the empty-bands case below — never throw, never silently invent a band.
  const bands = rule?.bands
  if (!bands || bands.length === 0) {
    return { min: 0, max: 999, label: 'Unknown', score: 0 }
  }

  // Sort ascending by min to ensure correct matching order
  const sorted = [...bands].sort((a, b) => a.min - b.min)

  for (let i = 0; i < sorted.length; i++) {
    const band   = sorted[i]
    const isLast = i === sorted.length - 1

    if (isLast) {
      // Last band is open-ended — matches anything at or above its min
      if (value >= band.min) return band
    } else {
      // Standard: min (inclusive) to max (exclusive)
      if (value >= band.min && value < band.max) return band
    }
  }

  // Fallback: return the lowest band for values below the first band's min
  return sorted[0]
}
