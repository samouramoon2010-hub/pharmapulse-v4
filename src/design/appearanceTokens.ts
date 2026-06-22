// ============================================================
// appearanceTokens — Density / Radius / Font Scale (Theme T2)
//
// Pure data + pure CSS-var builders, same shape as themeCssVars.ts.
// No DOM access — safe to call during SSR or in a plain Node test
// environment. ThemeProvider is the only consumer that actually
// writes these to the document (via themeEngine.applyCssVars).
//
// Phase T2-F requirement: the critical-insight floor (13px, see
// design/tokens.ts DISPLAY_TYPOGRAPHY.sizeInsightMin) must hold in
// every font-scale mode. --font-body never drops below 13px;
// --font-caption is explicitly NOT insight text (same established
// distinction as the UI 3.0 Product Surface bundle) and may go
// smaller.
// ============================================================
import type { CssVarMap } from './themeTypes'

// ── Density (T2-D) ──────────────────────────────────────────────
export type DensityMode = 'compact' | 'comfortable' | 'spacious'
export const DENSITY_MODES: DensityMode[] = ['compact', 'comfortable', 'spacious']
export const DEFAULT_DENSITY_MODE: DensityMode = 'comfortable'

const DENSITY_VALUES: Record<DensityMode, CssVarMap> = {
  compact: {
    '--density-card-padding':   '12px',
    '--density-row-height':     '32px',
    '--density-section-gap':    '16px',
    '--density-control-height': '28px',
  },
  comfortable: {
    '--density-card-padding':   '16px',
    '--density-row-height':     '40px',
    '--density-section-gap':    '24px',
    '--density-control-height': '34px',
  },
  spacious: {
    '--density-card-padding':   '22px',
    '--density-row-height':     '48px',
    '--density-section-gap':    '32px',
    '--density-control-height': '40px',
  },
}

export function isValidDensityMode(mode: string | undefined | null): boolean {
  return !!mode && DENSITY_MODES.includes(mode as DensityMode)
}

export function resolveDensityMode(mode: string | undefined | null): DensityMode {
  return isValidDensityMode(mode) ? (mode as DensityMode) : DEFAULT_DENSITY_MODE
}

export function buildDensityCssVars(mode: string | undefined | null): CssVarMap {
  return { ...DENSITY_VALUES[resolveDensityMode(mode)] }
}

// ── Radius (T2-E) ────────────────────────────────────────────────
export type RadiusMode = 'sharp' | 'soft' | 'rounded'
export const RADIUS_MODES: RadiusMode[] = ['sharp', 'soft', 'rounded']
export const DEFAULT_RADIUS_MODE: RadiusMode = 'soft'

const RADIUS_VALUES: Record<RadiusMode, CssVarMap> = {
  sharp: {
    '--radius-card':   '4px',
    '--radius-button':  '4px',
    '--radius-input':   '4px',
    '--radius-panel':   '6px',
  },
  soft: {
    '--radius-card':   '12px',
    '--radius-button':  '8px',
    '--radius-input':   '8px',
    '--radius-panel':   '14px',
  },
  rounded: {
    '--radius-card':   '20px',
    '--radius-button': '14px',
    '--radius-input':  '14px',
    '--radius-panel':  '24px',
  },
}

export function isValidRadiusMode(mode: string | undefined | null): boolean {
  return !!mode && RADIUS_MODES.includes(mode as RadiusMode)
}

export function resolveRadiusMode(mode: string | undefined | null): RadiusMode {
  return isValidRadiusMode(mode) ? (mode as RadiusMode) : DEFAULT_RADIUS_MODE
}

export function buildRadiusCssVars(mode: string | undefined | null): CssVarMap {
  return { ...RADIUS_VALUES[resolveRadiusMode(mode)] }
}

// ── Font scale (T2-F) ────────────────────────────────────────────
export type FontScaleMode = 'compact' | 'standard' | 'large'
export const FONT_SCALE_MODES: FontScaleMode[] = ['compact', 'standard', 'large']
export const DEFAULT_FONT_SCALE_MODE: FontScaleMode = 'standard'

// Critical-insight floor (design/tokens.ts DISPLAY_TYPOGRAPHY.sizeInsightMin)
export const CRITICAL_INSIGHT_FLOOR_PX = 13

const FONT_SCALE_VALUES: Record<FontScaleMode, CssVarMap> = {
  compact: {
    '--font-scale':   '0.92',
    '--font-body':    '13px',
    '--font-caption': '11px',
    '--font-title':   '16px',
    '--font-display': '24px',
  },
  standard: {
    '--font-scale':   '1',
    '--font-body':    '14px',
    '--font-caption': '12px',
    '--font-title':   '18px',
    '--font-display': '28px',
  },
  large: {
    '--font-scale':   '1.12',
    '--font-body':    '16px',
    '--font-caption': '13px',
    '--font-title':   '20px',
    '--font-display': '32px',
  },
}

export function isValidFontScaleMode(mode: string | undefined | null): boolean {
  return !!mode && FONT_SCALE_MODES.includes(mode as FontScaleMode)
}

export function resolveFontScaleMode(mode: string | undefined | null): FontScaleMode {
  return isValidFontScaleMode(mode) ? (mode as FontScaleMode) : DEFAULT_FONT_SCALE_MODE
}

export function buildFontScaleCssVars(mode: string | undefined | null): CssVarMap {
  return { ...FONT_SCALE_VALUES[resolveFontScaleMode(mode)] }
}

/** True for every font-scale mode — guards the critical-insight floor at the data level, not just in tests. */
export function bodyFontMeetsInsightFloor(mode: string | undefined | null): boolean {
  const px = parseInt(FONT_SCALE_VALUES[resolveFontScaleMode(mode)]['--font-body'], 10)
  return px >= CRITICAL_INSIGHT_FLOOR_PX
}
