// ============================================================
// themeMotion — Theme Transition Engine (Phase T3-D)
//
// Governs ONLY the cross-theme-switch transition: 150ms, CSS-only,
// limited to background-color/color/opacity. No layout movement, no
// scale, no framer-motion, no JS-driven animation — the value built
// here is applied as a plain CSS `transition` declaration in
// index.css under [data-theme-t1], the same attribute the engine
// already writes on every theme change.
// ============================================================

export const THEME_SWITCH_DURATION_MS = 150
export const THEME_SWITCH_EASING = 'ease'
export const THEME_SWITCH_PROPERTIES = ['background-color', 'color', 'opacity'] as const

/** Pure — builds the CSS `transition` shorthand value used during a theme switch. */
export function buildThemeSwitchTransitionValue(): string {
  return THEME_SWITCH_PROPERTIES
    .map((prop) => `${prop} ${THEME_SWITCH_DURATION_MS}ms ${THEME_SWITCH_EASING}`)
    .join(', ')
}

/** Pure — builds the CSS-variable map for the theme-switch transition. No DOM access. */
export function buildThemeMotionCssVars(): Record<string, string> {
  return {
    '--theme-motion-duration':   `${THEME_SWITCH_DURATION_MS}ms`,
    '--theme-motion-transition': buildThemeSwitchTransitionValue(),
  }
}

/** True when a CSS transition value only touches the 3 allowed properties (no transform/scale/width/height). */
export function isThemeMotionSafe(transitionValue: string): boolean {
  try {
    const FORBIDDEN = ['transform', 'scale', 'width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']
    const lower = transitionValue.toLowerCase()
    return !FORBIDDEN.some((token) => lower.includes(token))
  } catch {
    return false
  }
}
