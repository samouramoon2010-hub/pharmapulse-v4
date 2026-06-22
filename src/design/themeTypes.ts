// ============================================================
// themeTypes — shared type contracts for the Theme Engine (T1-A)
//
// Pure types — no logic, no DOM access, no React. Built on top of
// the existing ThemePreset shape from themePresets.ts (UI3-B) so the
// engine never redefines the color contract, only adds the
// architecture (registry, CSS-var bridge, provider) around it.
// ============================================================
import type { ThemePreset } from './themePresets'

export type ThemeId = string

export interface ThemeMeta {
  id: ThemeId
  name: string
  isDark: boolean
}

/** Flat map of CSS custom-property name -> value, e.g. { '--color-primary': '#1D4E89' }. */
export type CssVarMap = Record<string, string>

export interface ComposedTheme {
  id: ThemeId
  preset: ThemePreset
  cssVars: CssVarMap
}

export interface ThemeContextValue {
  activeTheme: ThemePreset
  activeThemeId: ThemeId
  availableThemes: ThemeMeta[]
  setTheme: (id: ThemeId) => void
  resetTheme: () => void
  cycleTheme: () => void
  isDarkTheme: boolean
  cssVars: CssVarMap
}

export type { ThemePreset }
