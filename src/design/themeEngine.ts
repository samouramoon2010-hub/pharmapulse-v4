// ============================================================
// themeEngine — Theme Engine Core (T1-A)
//
// Composes a theme id into { id, preset, cssVars } (pure, no DOM)
// and applies that map to document.documentElement (the only part
// that touches the DOM, and only when one exists).
//
// SSR-safe: every DOM-touching function guards on
// `typeof document !== 'undefined'` and is a complete no-op
// otherwise — composeTheme() itself never touches the DOM at all.
// ============================================================
import { buildThemeCssVars } from './themeCssVars'
import { getThemeById, resolveThemeId } from './themeRegistry'
import type { CssVarMap, ComposedTheme, ThemeId } from './themeTypes'

export const THEME_ROOT_ATTR = 'data-theme-t1'

function hasDocument(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.documentElement
  } catch {
    return false
  }
}

/** Pure — resolves + looks up the preset and builds its CSS var map. Never touches the DOM. */
export function composeTheme(id: string | undefined | null): ComposedTheme {
  const resolvedId: ThemeId = resolveThemeId(id)
  const preset = getThemeById(resolvedId)
  return { id: resolvedId, preset, cssVars: buildThemeCssVars(preset) }
}

/** Applies a CSS variable map to document.documentElement. No-op when no document exists (SSR/tests). */
export function applyCssVars(cssVars: CssVarMap): void {
  if (!hasDocument()) return
  const root = document.documentElement
  for (const [key, value] of Object.entries(cssVars)) {
    root.style.setProperty(key, value)
  }
}

/**
 * Applies a theme by id end-to-end: resolve -> compose -> set the
 * data-theme-t1 attribute -> apply CSS vars. SSR-safe no-op for the
 * DOM-touching parts; still returns the composed theme so callers
 * (e.g. ThemeProvider) can use it even when there is no document.
 */
export function applyThemeToDocument(id: string | undefined | null): ComposedTheme {
  const composed = composeTheme(id)
  if (hasDocument()) {
    document.documentElement.setAttribute(THEME_ROOT_ATTR, composed.id)
  }
  applyCssVars(composed.cssVars)
  return composed
}
