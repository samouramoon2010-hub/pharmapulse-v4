// ============================================================
// ambientAccent — Ambient Accent Engine (Phase T3-H)
//
// Pure utility — generates a very low-opacity (<=3%) background-only
// tint for "good"/"warning"/"critical" context. Delivered as
// infrastructure only in this bundle: nothing here reads real KPI,
// score, or evaluation data (that would mean touching the Evaluation
// Engine, which is out of scope), and nothing auto-applies it to any
// surface. A future bundle may wire a real state into this function.
//
// Hard guarantees: never affects text color, never affects cards,
// never affects metric values — only ever returns a background
// overlay color, and can be fully disabled (returns 'transparent').
// ============================================================

export const AMBIENT_ACCENT_MAX_OPACITY = 0.03

export type AmbientAccentState = 'good' | 'warning' | 'critical'

const AMBIENT_BASE_RGB: Record<AmbientAccentState, string> = {
  good:     '34,197,94',   // green
  warning:  '245,158,11',  // amber
  critical: '239,68,68',   // red
}

/** True only for opacity values at or below the 3% ambient ceiling. Never throws. */
export function isValidAmbientOpacity(opacity: number): boolean {
  try {
    return typeof opacity === 'number' && opacity >= 0 && opacity <= AMBIENT_ACCENT_MAX_OPACITY
  } catch {
    return false
  }
}

/**
 * Pure — returns a background-only rgba overlay color for the given
 * state, capped at AMBIENT_ACCENT_MAX_OPACITY. Returns 'transparent'
 * when disabled or given an unrecognized state. Never throws.
 */
export function getAmbientAccentOverlay(state: AmbientAccentState | undefined | null, enabled = true): string {
  try {
    if (!enabled || !state || !AMBIENT_BASE_RGB[state]) return 'transparent'
    return `rgba(${AMBIENT_BASE_RGB[state]},${AMBIENT_ACCENT_MAX_OPACITY})`
  } catch {
    return 'transparent'
  }
}

/** Pure — builds the CSS-variable map for the ambient accent overlay. No DOM access. */
export function buildAmbientAccentCssVars(state: AmbientAccentState | undefined | null = null, enabled = true): Record<string, string> {
  return { '--ambient-accent-overlay': getAmbientAccentOverlay(state, enabled) }
}
