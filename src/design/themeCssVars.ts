// ============================================================
// themeCssVars — CSS Variable Bridge (T1-B)
//
// Converts a ThemePreset into a flat CSS-variable map. Pure
// function — no DOM access, no `window`/`document` — safe to call
// during SSR or in a plain Node test environment.
//
// Two layers are produced:
//   1. The new architecture-level vars requested by the T1 spec
//      (--color-*, --chart-1..N, --radius-*, --density-*).
//   2. A bridge onto the EXISTING shell variable names already
//      consumed by every UI 3.0 surface (--bg-*, --text-*,
//      --border-*, --status-*, --brand-*) — see Phase T1-E. This
//      is the same "set CSS vars on :root" mechanism
//      settingsStore.applyTheme() already uses for the separate,
//      untouched 9-preset runtime system; it lets the whole shell
//      react to a theme change without rewriting any component.
// ============================================================
import type { ThemePreset } from './themePresets'
import type { CssVarMap } from './themeTypes'

export const REQUIRED_COLOR_VARS = [
  '--color-primary', '--color-secondary', '--color-background', '--color-surface',
  '--color-card', '--color-border', '--color-text', '--color-muted-text',
  '--color-success', '--color-warning', '--color-danger', '--color-info',
] as const

export const REQUIRED_LAYOUT_VARS = [
  '--radius-card', '--radius-button', '--density-card-padding', '--density-row-height',
] as const

export const CHART_VAR_COUNT = 6

export function buildThemeCssVars(preset: ThemePreset): CssVarMap {
  const vars: CssVarMap = {
    // ── New architecture-level vars (Phase T1-B) ──
    '--color-primary':      preset.primary,
    '--color-secondary':    preset.secondary,
    '--color-background':   preset.background,
    '--color-surface':      preset.surface,
    '--color-card':         preset.card,
    '--color-border':       preset.border,
    '--color-text':         preset.text,
    '--color-muted-text':   preset.mutedText,
    '--color-success':      preset.success,
    '--color-warning':      preset.warning,
    '--color-danger':       preset.danger,
    '--color-info':         preset.info,

    '--radius-card':            '12px',
    '--radius-button':          '8px',
    '--density-card-padding':   '16px',
    '--density-row-height':     '40px',

    // ── Bridge onto existing shell vars (Phase T1-E) ──
    // Background elevations
    '--bg-canvas':   preset.background,
    '--bg-surface':  preset.surface,
    '--bg-elevated': preset.card,
    '--bg-overlay':  preset.card,
    '--bg-hover':    preset.surface,
    '--bg-base':     preset.background,
    '--bg-card':     preset.card,
    // Borders
    '--border-subtle':  preset.border,
    '--border-default': preset.border,
    '--border':          preset.border,
    // Text
    '--text-primary':   preset.text,
    '--text-secondary': preset.text,
    '--text-muted':      preset.mutedText,
    // Brand scale (derived from primary/secondary — no new color invented)
    '--brand-300': preset.secondary,
    '--brand-400': preset.primary,
    '--brand-500': preset.primary,
    '--brand-600': preset.primary,
    // Status colors
    '--status-success':  preset.success,
    '--status-warning':  preset.warning,
    '--status-critical': preset.danger,
    '--status-info':     preset.info,
    // Sidebar/topbar/card surfaces reuse the same elevation tokens
    '--sidebar-bg': preset.surface,
    '--topbar-bg':  preset.surface,
    '--modal-bg':   preset.card,
    '--input-bg':   preset.surface,
  }

  preset.chartPalette.slice(0, CHART_VAR_COUNT).forEach((color, i) => {
    vars[`--chart-${i + 1}`] = color
  })
  // Always emit exactly CHART_VAR_COUNT chart vars, even if a preset's
  // palette is shorter — repeat the last color rather than leaving a
  // variable undefined (Phase T1-F: "no missing tokens").
  for (let i = preset.chartPalette.length; i < CHART_VAR_COUNT; i++) {
    vars[`--chart-${i + 1}`] = preset.chartPalette[preset.chartPalette.length - 1] ?? preset.primary
  }

  return vars
}
