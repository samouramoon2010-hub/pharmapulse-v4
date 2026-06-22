// ============================================================
// useTheme — Theme Provider / Hook (T1-C)
//
// Exposes: activeTheme, activeThemeId, availableThemes, setTheme,
// resetTheme, cycleTheme, isDarkTheme, cssVars.
//
// Safe outside a <ThemeProvider> (e.g. an isolated unit test or a
// component rendered before the provider mounts) — falls back to a
// fully-formed value built from DEFAULT_THEME_ID instead of
// throwing, matching this codebase's "safe fallback, never crash"
// convention (see useScopeProfile, getStatusToken, getThemePreset).
// ============================================================
import { useContext } from 'react'
import { ThemeContext } from './ThemeProvider'
import { listThemes, isDarkThemeId, DEFAULT_THEME_ID } from '../design/themeRegistry'
import { composeTheme } from '../design/themeEngine'
import {
  buildDensityCssVars, DEFAULT_DENSITY_MODE,
  buildRadiusCssVars, DEFAULT_RADIUS_MODE,
  buildFontScaleCssVars, DEFAULT_FONT_SCALE_MODE,
} from '../design/appearanceTokens'

function fallbackThemeValue() {
  const composed = composeTheme(DEFAULT_THEME_ID)
  return {
    activeTheme:     composed.preset,
    activeThemeId:   DEFAULT_THEME_ID,
    availableThemes: listThemes(),
    setTheme:   () => {},
    resetTheme: () => {},
    cycleTheme: () => {},
    isDarkTheme: isDarkThemeId(DEFAULT_THEME_ID),
    cssVars: {
      ...composed.cssVars,
      ...buildDensityCssVars(DEFAULT_DENSITY_MODE),
      ...buildRadiusCssVars(DEFAULT_RADIUS_MODE),
      ...buildFontScaleCssVars(DEFAULT_FONT_SCALE_MODE),
    },

    densityMode: DEFAULT_DENSITY_MODE,
    radiusMode:  DEFAULT_RADIUS_MODE,
    fontScale:   DEFAULT_FONT_SCALE_MODE,
    setDensity:   () => {},
    setRadius:    () => {},
    setFontScale: () => {},
    resetAppearance: () => {},
  }
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  return ctx ?? fallbackThemeValue()
}
