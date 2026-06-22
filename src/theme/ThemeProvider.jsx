// ============================================================
// ThemeProvider — Theme Provider / Hook (T1-C, extended in T2-B/H)
//
// Owns the active T1 theme id PLUS the T2 appearance modes
// (density/radius/font scale) — a single source of truth, per
// T2-I, so the header quick toggle and the Settings Center
// Appearance section can never disagree about the active theme.
//
// Applies every change to the document (themeEngine.applyThemeToDocument
// / applyCssVars — SSR-safe no-ops when there is no document), and
// persists locally: theme id via themeStorage's existing T1 key,
// density/radius/font via its new, separate T2 appearance key. No
// duplicate theme state is created — density/radius/font are new
// concerns added to this SAME provider, not a parallel store.
//
// This is a separate, additive system from store/settingsStore.js's
// existing 9-preset runtime theme (ThemeSwitcher in AppLayout). It
// does not read, write, or remove anything from that store — both
// can coexist.
//
// No Settings Center business logic lives here — only the engine
// wiring. No backend persistence — local-only.
// ============================================================
import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react'
import { listThemes, resolveThemeId, getNextThemeId, isDarkThemeId, DEFAULT_THEME_ID } from '../design/themeRegistry'
import { composeTheme, applyThemeToDocument, applyCssVars } from '../design/themeEngine'
import {
  loadStoredThemeId, saveThemeId, clearStoredThemeId,
  loadStoredAppearance, saveAppearance, clearStoredAppearance,
} from '../design/themeStorage'
import {
  resolveDensityMode, buildDensityCssVars, DEFAULT_DENSITY_MODE,
  resolveRadiusMode, buildRadiusCssVars, DEFAULT_RADIUS_MODE,
  resolveFontScaleMode, buildFontScaleCssVars, DEFAULT_FONT_SCALE_MODE,
} from '../design/appearanceTokens'
import { buildEffectCssVars } from '../design/themeEffects'
import { buildBackgroundCssVars } from '../design/backgroundLayers'
import { buildGlassCssVars } from '../design/glassTokens'
import { buildThemeMotionCssVars } from '../design/themeMotion'

export const ThemeContext = createContext(null)

export default function ThemeProvider({ children }) {
  const [activeThemeId, setActiveThemeId] = useState(() =>
    resolveThemeId(loadStoredThemeId() ?? DEFAULT_THEME_ID)
  )

  const [densityMode, setDensityModeState] = useState(() =>
    resolveDensityMode(loadStoredAppearance()?.densityMode ?? DEFAULT_DENSITY_MODE)
  )
  const [radiusMode, setRadiusModeState] = useState(() =>
    resolveRadiusMode(loadStoredAppearance()?.radiusMode ?? DEFAULT_RADIUS_MODE)
  )
  const [fontScale, setFontScaleState] = useState(() =>
    resolveFontScaleMode(loadStoredAppearance()?.fontScale ?? DEFAULT_FONT_SCALE_MODE)
  )

  // Apply theme to the document + persist on every change, including
  // the very first render, so a stored preference is honored on load.
  // Also applies the T3 premium surface tokens (shadows, ambient
  // background layer, glass chrome opacity) that ride along with the
  // active theme id — pure CSS variables, no component rewrites.
  useEffect(() => {
    applyThemeToDocument(activeThemeId)
    saveThemeId(activeThemeId)
    applyCssVars(buildEffectCssVars(activeThemeId))
    applyCssVars(buildBackgroundCssVars(activeThemeId))
    applyCssVars(buildGlassCssVars(activeThemeId))
  }, [activeThemeId])

  // Theme-switch motion (T3-D) is theme-independent — applied once.
  useEffect(() => {
    applyCssVars(buildThemeMotionCssVars())
  }, [])

  // Apply density/radius/font CSS vars + persist together as one
  // appearance object whenever any of the three changes.
  useEffect(() => {
    applyCssVars(buildDensityCssVars(densityMode))
    applyCssVars(buildRadiusCssVars(radiusMode))
    applyCssVars(buildFontScaleCssVars(fontScale))
    saveAppearance({ densityMode, radiusMode, fontScale })
  }, [densityMode, radiusMode, fontScale])

  const setTheme = useCallback((id) => {
    setActiveThemeId(resolveThemeId(id))
  }, [])

  const setDensity = useCallback((mode) => {
    setDensityModeState(resolveDensityMode(mode))
  }, [])

  const setRadius = useCallback((mode) => {
    setRadiusModeState(resolveRadiusMode(mode))
  }, [])

  const setFontScale = useCallback((mode) => {
    setFontScaleState(resolveFontScaleMode(mode))
  }, [])

  const resetTheme = useCallback(() => {
    clearStoredThemeId()
    setActiveThemeId(DEFAULT_THEME_ID)
  }, [])

  /** Resets theme + density + radius + font scale together (T2-B "reset appearance"). */
  const resetAppearance = useCallback(() => {
    clearStoredThemeId()
    clearStoredAppearance()
    setActiveThemeId(DEFAULT_THEME_ID)
    setDensityModeState(DEFAULT_DENSITY_MODE)
    setRadiusModeState(DEFAULT_RADIUS_MODE)
    setFontScaleState(DEFAULT_FONT_SCALE_MODE)
  }, [])

  const cycleTheme = useCallback(() => {
    setActiveThemeId((prev) => getNextThemeId(prev))
  }, [])

  const composed = useMemo(() => composeTheme(activeThemeId), [activeThemeId])
  const availableThemes = useMemo(() => listThemes(), [])

  const appearanceCssVars = useMemo(() => ({
    ...buildDensityCssVars(densityMode),
    ...buildRadiusCssVars(radiusMode),
    ...buildFontScaleCssVars(fontScale),
  }), [densityMode, radiusMode, fontScale])

  const value = useMemo(() => ({
    activeTheme:     composed.preset,
    activeThemeId,
    availableThemes,
    setTheme,
    resetTheme,
    cycleTheme,
    isDarkTheme: isDarkThemeId(activeThemeId),
    cssVars:     { ...composed.cssVars, ...appearanceCssVars },

    // Theme T2 — appearance (density/radius/font scale)
    densityMode,
    radiusMode,
    fontScale,
    setDensity,
    setRadius,
    setFontScale,
    resetAppearance,
  }), [
    composed, activeThemeId, availableThemes, setTheme, resetTheme, cycleTheme,
    densityMode, radiusMode, fontScale, setDensity, setRadius, setFontScale,
    resetAppearance, appearanceCssVars,
  ])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
