// ============================================================
// chartThemes — Chart Theme Palettes (Phase T3-G)
//
// Pure derivation from THEME_PRESETS — colors only, no new chart
// logic. PerformanceChart.jsx is NOT modified by this bundle and
// keeps its existing behavior; this file exists so a future bundle
// can opt a chart into theme-aware colors without inventing a new
// color contract (chartPalette already exists on every preset).
// ============================================================
import { THEME_PRESETS } from './themePresets'
import type { ThemeId, ThemePreset } from './themeTypes'

export interface ChartTheme {
  palette:     string[]
  gridColor:   string
  axisColor:   string
  tooltipBg:   string
  tooltipText: string
}

function deriveChartTheme(preset: ThemePreset): ChartTheme {
  return {
    palette:     preset.chartPalette,
    gridColor:   preset.border,
    axisColor:   preset.mutedText,
    tooltipBg:   preset.card,
    tooltipText: preset.text,
  }
}

export const CHART_THEMES: Record<ThemeId, ChartTheme> = Object.fromEntries(
  Object.entries(THEME_PRESETS).map(([id, preset]) => [id, deriveChartTheme(preset)]),
)

/** True when a chart theme has a non-empty palette and all 4 derived fields are strings. Never throws. */
export function isChartThemeValid(theme: unknown): boolean {
  try {
    const t = theme as Partial<ChartTheme>
    if (!t || typeof t !== 'object') return false
    return (
      Array.isArray(t.palette) && t.palette.length > 0 &&
      typeof t.gridColor === 'string' &&
      typeof t.axisColor === 'string' &&
      typeof t.tooltipBg === 'string' &&
      typeof t.tooltipText === 'string'
    )
  } catch {
    return false
  }
}

/** Safe lookup — always returns a valid chart theme, falling back to corporate. Never throws. */
export function getChartTheme(id: string | undefined | null): ChartTheme {
  const theme = CHART_THEMES[id as ThemeId]
  return isChartThemeValid(theme) ? theme : CHART_THEMES.corporate
}
