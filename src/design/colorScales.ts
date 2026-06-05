// ============================================================
// PharmaPulse — Color Scales for Regional Heatmaps
// Phase 4B-1B-α: Pure foundation, no React, no DOM.
//
// Three scale modes:
//   categorical  — 4-stop traffic-light (excellent/good/warning/critical)
//   continuous   — linear interpolation between two hex colors
//   diverging    — red-white-green centered on 100% achievement
//
// Empty-cell states — four semantically distinct non-data states:
//   NO_DATA         — branch/KPI exists but has zero entries
//   ZERO_VALUE      — explicit 0 value (distinct from no data)
//   NOT_APPLICABLE  — KPI does not apply to this branch
//   NOT_AGGREGATED  — KPI exists in registry but not scored by the
//                     regional engine yet (custom KPI gap)
//
// All functions are pure and deterministic.
// Hex values sourced from design tokens (tokens.ts).
// ============================================================

import { KPI_TRAFFIC_COLORS } from './tokens'
import type { KpiTrafficStatus } from './tokens'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — EMPTY-CELL STATE TYPES
// ══════════════════════════════════════════════════════════════

/** Semantically distinct non-data cell states for heatmap rendering. */
export type EmptyCellState =
  | 'NO_DATA'         // branch/period exists; zero entries found
  | 'ZERO_VALUE'      // explicit zero entered (submitter confirmed 0)
  | 'NOT_APPLICABLE'  // this KPI doesn't apply to this branch/context
  | 'NOT_AGGREGATED'  // KPI in registry but not yet scored by regional engine

/** Visual descriptor for an empty cell */
export interface EmptyCellStyle {
  state:       EmptyCellState
  /** CSS hex color for the cell background */
  background:  string
  /** CSS hex color for text/icon */
  foreground:  string
  /** Short display label (e.g. "—", "0", "N/A", "…") */
  label:       string
  /** Tooltip description */
  description: string
  /** Whether to render a diagonal stripe pattern overlay */
  striped:     boolean
}

/** Canonical empty-cell style definitions */
export const EMPTY_CELL_STYLES: Record<EmptyCellState, EmptyCellStyle> = {
  NO_DATA: {
    state:       'NO_DATA',
    background:  'rgba(71,85,105,0.12)',   // slate-600/12
    foreground:  '#475569',                // slate-600
    label:       '—',
    description: 'No data submitted for this period',
    striped:     true,
  },
  ZERO_VALUE: {
    state:       'ZERO_VALUE',
    background:  'rgba(239,68,68,0.10)',   // matches critical bg
    foreground:  '#ef4444',               // critical red
    label:       '0',
    description: 'Confirmed zero value — target not met',
    striped:     false,
  },
  NOT_APPLICABLE: {
    state:       'NOT_APPLICABLE',
    background:  'rgba(82,82,91,0.08)',    // zinc-600/8
    foreground:  '#52525b',               // zinc-600
    label:       'N/A',
    description: 'This KPI does not apply to this context',
    striped:     false,
  },
  NOT_AGGREGATED: {
    state:       'NOT_AGGREGATED',
    background:  'rgba(99,102,241,0.08)',  // indigo/8
    foreground:  '#818cf8',               // indigo-400
    label:       '…',
    description: 'Custom KPI — regional engine does not yet aggregate this metric',
    striped:     true,
  },
}

/** Get the style descriptor for an empty cell state (safe — never throws) */
export function getEmptyCellStyle(state: EmptyCellState): EmptyCellStyle {
  return EMPTY_CELL_STYLES[state] ?? EMPTY_CELL_STYLES.NO_DATA
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — CATEGORICAL SCALE (traffic-light)
// ══════════════════════════════════════════════════════════════

export interface CategoricalCellColor {
  background: string
  border:     string
  foreground: string
  status:     KpiTrafficStatus
}

/**
 * Map an achievement % to a categorical traffic-light color.
 * Thresholds are configurable; defaults match the engine's
 * TRAFFIC_COLORS (excellent ≥90, good ≥70, warning ≥50, critical <50).
 *
 * @param achievementPct  - 0..200+ percentage
 * @param thresholds      - Optional override { excellent, good, warning }
 */
export function getCategoricalColor(
  achievementPct: number,
  thresholds: { excellent?: number; good?: number; warning?: number } = {},
): CategoricalCellColor {
  const t = {
    excellent: thresholds.excellent ?? 90,
    good:      thresholds.good      ?? 70,
    warning:   thresholds.warning   ?? 50,
  }

  let status: KpiTrafficStatus
  if (achievementPct >= t.excellent)  status = 'excellent'
  else if (achievementPct >= t.good)  status = 'good'
  else if (achievementPct >= t.warning) status = 'warning'
  else                                  status = 'critical'

  const cfg = KPI_TRAFFIC_COLORS[status]
  return {
    background: cfg.bg,
    border:     cfg.border,
    foreground: cfg.color,
    status,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — CONTINUOUS SCALE
// ══════════════════════════════════════════════════════════════

/**
 * Clamp a value to [min, max].
 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Parse a 6-digit hex color into [r, g, b] components.
 * Returns [161,161,170] (zinc-400 / fallback) on parse failure.
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return [161, 161, 170]
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [161, 161, 170]
  return [r, g, b]
}

/**
 * Format [r, g, b] as a 6-digit hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Linearly interpolate between two hex colors at position t ∈ [0, 1].
 *
 * @param fromHex  - Color at t=0
 * @param toHex    - Color at t=1
 * @param t        - Interpolation factor 0..1
 */
export function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const tf = clamp(t, 0, 1)
  const [r1, g1, b1] = hexToRgb(fromHex)
  const [r2, g2, b2] = hexToRgb(toHex)
  return rgbToHex(
    r1 + (r2 - r1) * tf,
    g1 + (g2 - g1) * tf,
    b1 + (b2 - b1) * tf,
  )
}

export interface ContinuousScaleConfig {
  /** Color at 0% of the range (low value) */
  lowColor:  string
  /** Color at 100% of the range (high value) */
  highColor: string
  /** Minimum value of the data range */
  min:       number
  /** Maximum value of the data range */
  max:       number
}

/**
 * Map a value to a continuous color between lowColor and highColor.
 * Values outside [min, max] are clamped.
 *
 * @param value   - The data value to color
 * @param config  - Scale configuration
 */
export function getContinuousColor(
  value: number,
  config: ContinuousScaleConfig,
): string {
  const { lowColor, highColor, min, max } = config
  if (max <= min) return highColor   // degenerate range — return high
  const t = clamp((value - min) / (max - min), 0, 1)
  return interpolateColor(lowColor, highColor, t)
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — DIVERGING SCALE (centered on 100% achievement)
// ══════════════════════════════════════════════════════════════

/**
 * Default diverging scale colors — red → white-ish → green.
 * Midpoint = 100% (on-target), with breathing room ±5%.
 */
export const DEFAULT_DIVERGING_COLORS = {
  belowColor: '#ef4444',   // critical red   (0% achievement)
  midColor:   '#1c1c20',   // near-neutral   (100% achievement — blends with dark bg)
  aboveColor: '#22c55e',   // success green  (150%+ achievement)
  midPoint:   100,         // achievement % that maps to midColor
  lowerBound:   0,         // maps to belowColor
  upperBound:  150,        // maps to aboveColor
} as const

export interface DivergingScaleConfig {
  belowColor: string   // color for values below midPoint
  midColor:   string   // color at midPoint (on-target)
  aboveColor: string   // color for values above midPoint
  midPoint:   number   // achievement % that is "on target" (typically 100)
  lowerBound: number   // achievement % that maps to belowColor
  upperBound: number   // achievement % that maps to aboveColor
}

/**
 * Map an achievement % to a diverging color scale.
 * - Below midPoint: interpolate from belowColor → midColor
 * - Above midPoint: interpolate from midColor → aboveColor
 * - Values outside [lowerBound, upperBound] are clamped.
 *
 * @param achievementPct  - 0..200+ percentage
 * @param config          - Optional scale configuration
 */
export function getDivergingColor(
  achievementPct: number,
  config: DivergingScaleConfig = DEFAULT_DIVERGING_COLORS,
): string {
  const { belowColor, midColor, aboveColor, midPoint, lowerBound, upperBound } = config
  const v = clamp(achievementPct, lowerBound, upperBound)

  if (v <= midPoint) {
    if (midPoint <= lowerBound) return midColor
    const t = (v - lowerBound) / (midPoint - lowerBound)
    return interpolateColor(belowColor, midColor, t)
  } else {
    if (upperBound <= midPoint) return midColor
    const t = (v - midPoint) / (upperBound - midPoint)
    return interpolateColor(midColor, aboveColor, t)
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — UNIFIED CELL COLOR RESOLVER
// ══════════════════════════════════════════════════════════════

export type HeatmapScaleMode = 'categorical' | 'continuous' | 'diverging'

export interface CellColorConfig {
  scale:       HeatmapScaleMode
  /** For continuous scale */
  continuous?: ContinuousScaleConfig
  /** For diverging scale */
  diverging?:  DivergingScaleConfig
  /** For categorical scale */
  categoricalThresholds?: { excellent?: number; good?: number; warning?: number }
}

export interface ResolvedCellColor {
  /** CSS hex background color */
  background: string
  /** CSS hex foreground/text color */
  foreground: string
  /** CSS hex border color */
  border:     string
  /** Traffic-light status (categorical only; null for other modes) */
  status:     KpiTrafficStatus | null
}

/**
 * Resolve the final cell color for a given achievement % and scale mode.
 * For empty cells, use getEmptyCellStyle() instead.
 *
 * @param achievementPct  - 0..200+ percentage
 * @param config          - Scale and color configuration
 */
export function resolveCellColor(
  achievementPct: number,
  config: CellColorConfig,
): ResolvedCellColor {
  switch (config.scale) {
    case 'categorical': {
      const c = getCategoricalColor(achievementPct, config.categoricalThresholds)
      return { background: c.background, foreground: c.foreground, border: c.border, status: c.status }
    }
    case 'continuous': {
      if (!config.continuous) {
        // Fallback: use categorical
        const c = getCategoricalColor(achievementPct)
        return { background: c.background, foreground: c.foreground, border: c.border, status: c.status }
      }
      const bg = getContinuousColor(achievementPct, config.continuous)
      return { background: bg, foreground: '#fafafa', border: 'transparent', status: null }
    }
    case 'diverging': {
      const bg = getDivergingColor(achievementPct, config.diverging)
      return { background: bg, foreground: '#fafafa', border: 'transparent', status: null }
    }
    default: {
      const c = getCategoricalColor(achievementPct)
      return { background: c.background, foreground: c.foreground, border: c.border, status: c.status }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — LEGEND GENERATION
// ══════════════════════════════════════════════════════════════

export interface LegendStop {
  value:      number   // the achievement % at this stop
  color:      string   // the resolved cell color
  label:      string   // display label (e.g. '0%', '100%', '150%+')
}

/**
 * Generate evenly-spaced legend stops for a given scale.
 * Returns 5 stops by default.
 *
 * @param scale   - Scale mode
 * @param config  - Color configuration
 * @param steps   - Number of legend stops (default 5)
 */
export function buildLegendStops(
  scale:   HeatmapScaleMode,
  config:  CellColorConfig,
  steps =  5,
): LegendStop[] {
  const maxPct = scale === 'diverging'
    ? (config.diverging?.upperBound ?? 150)
    : (config.continuous?.max       ?? 150)
  const minPct = scale === 'diverging'
    ? (config.diverging?.lowerBound ?? 0)
    : (config.continuous?.min       ?? 0)

  return Array.from({ length: steps }, (_, i) => {
    const value = minPct + ((maxPct - minPct) / (steps - 1)) * i
    const resolved = resolveCellColor(value, config)
    const isLast   = i === steps - 1
    return {
      value,
      color: resolved.background,
      label: isLast && value >= maxPct ? `${Math.round(value)}%+` : `${Math.round(value)}%`,
    }
  })
}
