// ============================================================
// themeTransitions — Premium Surface Micro-Transitions (Phase T3-A)
//
// Pure data — the transition timing used by hover/focus states on
// premium surfaces (cards, nav items, buttons) once a T1 theme is
// active. Deliberately separate from themeMotion.ts (Phase T3-D),
// which governs the cross-theme-switch transition specifically.
// CSS-only — no framer-motion, no JS-driven animation.
// ============================================================

export const SURFACE_TRANSITION_MS = 150
export const SURFACE_TRANSITION_EASING = 'ease'
export const SURFACE_TRANSITION_PROPERTIES = ['background-color', 'border-color', 'box-shadow'] as const

/** Pure — builds the CSS `transition` shorthand value for premium surface hover/focus states. */
export function buildSurfaceTransitionValue(): string {
  return SURFACE_TRANSITION_PROPERTIES
    .map((prop) => `${prop} ${SURFACE_TRANSITION_MS}ms ${SURFACE_TRANSITION_EASING}`)
    .join(', ')
}

/** Pure — builds the CSS-variable map exposing the surface transition value. No DOM access. */
export function buildTransitionCssVars(): Record<string, string> {
  return {
    '--transition-surface': buildSurfaceTransitionValue(),
  }
}
