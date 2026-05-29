// ============================================================
// PharmaPulse Design Tokens — Foundation Layer
// Phase: Design Tokens Foundation Lite (pre-QA, non-destructive)
//
// This file is the TypeScript source of truth for all design
// values used across PharmaPulse. CSS custom properties in
// index.css (:root) mirror these values — do NOT change one
// without updating the other.
//
// Usage:
//   import { COLORS, SPACING, KPI_TRAFFIC_COLORS } from '../design/tokens'
//
// All values are read-only constants — no runtime mutation.
// ============================================================

// ── Semantic Color Palette ─────────────────────────────────

export const COLORS = {
  // ── Canvas / Background layers
  bgCanvas:         '#09090b',   // deepest — page background
  bgSurface:        '#141417',   // cards, panels
  bgElevated:       '#1c1c20',   // modals, dropdowns
  bgOverlay:        '#222226',   // tooltips, popovers
  bgHover:          'rgba(255,255,255,0.04)',
  bgActive:         'rgba(0,210,173,0.08)',

  // ── Borders
  borderSubtle:     'rgba(255,255,255,0.06)',
  borderDefault:    'rgba(255,255,255,0.09)',
  borderStrong:     'rgba(255,255,255,0.14)',
  borderBrand:      'rgba(0,210,173,0.25)',

  // ── Text
  textPrimary:      '#fafafa',
  textSecondary:    '#a1a1aa',
  textMuted:        '#52525b',
  textBrand:        '#00d2ad',
  textInverse:      '#09090b',

  // ── Brand — PharmaPulse teal
  brand300:         '#4dffc9',
  brand400:         '#26e8b4',
  brand500:         '#00d2ad',   // primary brand
  brand600:         '#00a989',
  brand700:         '#008067',

  // ── Semantic status
  success:          '#22c55e',
  successBg:        'rgba(34,197,94,0.10)',
  successBorder:    'rgba(34,197,94,0.20)',

  warning:          '#f59e0b',
  warningBg:        'rgba(245,158,11,0.10)',
  warningBorder:    'rgba(245,158,11,0.20)',

  danger:           '#ef4444',
  dangerBg:         'rgba(239,68,68,0.10)',
  dangerBorder:     'rgba(239,68,68,0.20)',

  info:             '#3b82f6',
  infoBg:           'rgba(59,130,246,0.10)',
  infoBorder:       'rgba(59,130,246,0.20)',

  // ── KPI fallback (used when no dynamic color available)
  kpiFallback:      '#a1a1aa',

  // ── Pure scale
  white:            '#ffffff',
  black:            '#000000',
} as const

// ── KPI Traffic-Light Semantic Tokens ─────────────────────
// Mirrors TRAFFIC_COLORS in kpiAnalyticsEngine but as pure
// design tokens — no engine dependency.

export const KPI_TRAFFIC_COLORS = {
  excellent: {
    color:   '#22c55e',
    bg:      'rgba(34,197,94,0.10)',
    border:  'rgba(34,197,94,0.20)',
    label:   'Excellent',
    labelAr: 'ممتاز',
    icon:    '🟢',
  },
  good: {
    color:   '#00d2ad',
    bg:      'rgba(0,210,173,0.10)',
    border:  'rgba(0,210,173,0.20)',
    label:   'On Track',
    labelAr: 'على المسار',
    icon:    '🔵',
  },
  warning: {
    color:   '#f59e0b',
    bg:      'rgba(245,158,11,0.10)',
    border:  'rgba(245,158,11,0.20)',
    label:   'Warning',
    labelAr: 'تحذير',
    icon:    '🟡',
  },
  critical: {
    color:   '#ef4444',
    bg:      'rgba(239,68,68,0.10)',
    border:  'rgba(239,68,68,0.20)',
    label:   'Critical',
    labelAr: 'حرج',
    icon:    '🔴',
  },
} as const

export type KpiTrafficStatus = keyof typeof KPI_TRAFFIC_COLORS

/** Safe traffic-light lookup — always returns a valid config */
export function getTrafficConfig(status: string | undefined) {
  return KPI_TRAFFIC_COLORS[status as KpiTrafficStatus] ?? KPI_TRAFFIC_COLORS.good
}

/** Safe color extraction — never undefined */
export function getTrafficColor(status: string | undefined): string {
  return getTrafficConfig(status).color
}

// ── KPI-Specific Semantic Colors ──────────────────────────
// Fixed palette for the 5 core KPIs — used in charts/reports
// where a consistent per-KPI color is needed.

export const KPI_COLORS = {
  wasfaty:      '#6366f1',   // indigo
  omni:         '#ef4444',   // red
  wellness:     '#f59e0b',   // amber
  basket:       '#22c55e',   // green
  crossSelling: '#8b5cf6',   // violet
  // Custom KPI fallback (any unrecognized key)
  default:      '#a1a1aa',   // zinc-400
} as const

/** Returns the designated color for a KPI engine key, or fallback */
export function getKpiColor(engineKey: string): string {
  return (KPI_COLORS as Record<string, string>)[engineKey] ?? KPI_COLORS.default
}

// ── Risk / Executive Semantic Colors ──────────────────────

export const RISK_COLORS = {
  low:      { color: '#22c55e',  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.15)',   label: 'Low Risk'      },
  medium:   { color: '#f59e0b',  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.15)',  label: 'Medium Risk'   },
  high:     { color: '#ef4444',  bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.15)',   label: 'High Risk'     },
  critical: { color: '#dc2626',  bg: 'rgba(220,38,38,0.10)',   border: 'rgba(220,38,38,0.20)',   label: 'Critical Risk' },
} as const

export const EXECUTIVE_COLORS = {
  momentum:   '#22c55e',
  declining:  '#ef4444',
  stable:     '#00d2ad',
  benchmark:  '#6366f1',
  highlight:  '#f59e0b',
} as const

// ── Spacing Scale ─────────────────────────────────────────
// Maps to Tailwind's 4px base unit: n * 4px

export const SPACING = {
  px:   '1px',
  0:    '0px',
  0.5:  '2px',
  1:    '4px',
  1.5:  '6px',
  2:    '8px',
  2.5:  '10px',
  3:    '12px',
  3.5:  '14px',
  4:    '16px',
  5:    '20px',
  6:    '24px',
  7:    '28px',
  8:    '32px',
  9:    '36px',
  10:   '40px',
  12:   '48px',
  14:   '56px',
  16:   '64px',
  20:   '80px',
  24:   '96px',
  // Semantic aliases
  cardPadding:  '16px',   // .card-p
  cardPaddingSm:'12px',   // .card-sm
  sectionGap:   '24px',
  pageGutter:   '24px',
} as const

// ── Typography Scale ──────────────────────────────────────

export const TYPOGRAPHY = {
  // Font families
  fontSans:    "'Inter', 'Cairo', system-ui, sans-serif",
  fontArabic:  "'Cairo', sans-serif",
  fontMono:    "'JetBrains Mono', ui-monospace, monospace",

  // Sizes (px)
  size2xs:  '10px',
  sizeXs:   '11px',
  sizeSm:   '12px',
  sizeBase: '13px',   // default body text in PharmaPulse
  sizeMd:   '14px',
  sizeLg:   '15px',
  sizeXl:   '16px',
  size2xl:  '20px',
  size3xl:  '24px',
  sizeMetric: '1.75rem',   // .metric-value
  sizeMetricSm: '1.25rem', // .metric-value-sm

  // Weights
  weightNormal:   400,
  weightMedium:   500,
  weightSemibold: 600,
  weightBold:     700,
  weightExtrabold:800,

  // Letter spacing
  trackingTighter: '-0.04em',
  trackingTight:   '-0.02em',
  trackingNormal:  '0em',
  trackingWide:    '0.05em',
  trackingWider:   '0.08em',  // metric labels
  trackingWidest:  '0.1em',   // section caps

  // Line heights
  leadingTight:  '1',
  leadingSnug:   '1.4',
  leadingNormal: '1.6',
  leadingRelaxed:'1.7',

  // Feature settings
  featureTabular: '"tnum" 1, "kern" 1',  // numeric inputs, metric values
} as const

// ── Border Radius ─────────────────────────────────────────

export const RADIUS = {
  none:   '0px',
  sm:     '4px',
  md:     '6px',
  lg:     '8px',
  xl:     '10px',
  '2xl':  '12px',  // cards (.card, .kpi-card)
  '3xl':  '16px',
  full:   '9999px',
  // Semantic aliases
  card:   '12px',
  badge:  '9999px',
  button: '8px',
  input:  '8px',
} as const

// ── Shadows ───────────────────────────────────────────────

export const SHADOWS = {
  xs:    '0 1px 2px rgba(0,0,0,0.4)',
  sm:    '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
  // Card inner highlight — depth effect
  card:  '0 0 0 1px rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.3)',
  cardInner: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  float: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
  glow:  '0 0 0 1px rgba(0,210,173,0.3), 0 4px 16px rgba(0,210,173,0.15)',
  focusRing: '0 0 0 2px rgba(0,210,173,0.12)',
} as const

// ── Z-index Scale ─────────────────────────────────────────

export const Z = {
  base:     0,
  raised:   10,
  dropdown: 20,
  sticky:   30,
  overlay:  40,
  modal:    50,
  toast:    60,
  tooltip:  70,
} as const

// ── Animation Durations ───────────────────────────────────

export const DURATION = {
  instant:  '0ms',
  fast:     '100ms',
  normal:   '150ms',
  smooth:   '200ms',
  slow:     '350ms',
  progress: '700ms',   // progress bar fills
  countup:  '600ms',   // StatCard count-up
} as const

// ── Convenience re-exports ────────────────────────────────

/** The canonical KPI fallback color — #a1a1aa (zinc-400) */
export const KPI_FALLBACK_COLOR = COLORS.kpiFallback

/** The brand primary color */
export const BRAND_COLOR = COLORS.brand500

// ── Type helpers ──────────────────────────────────────────

export type ColorToken    = typeof COLORS
export type SpacingToken  = typeof SPACING
export type TypographyToken = typeof TYPOGRAPHY
export type ShadowToken   = typeof SHADOWS
export type RadiusToken   = typeof RADIUS
