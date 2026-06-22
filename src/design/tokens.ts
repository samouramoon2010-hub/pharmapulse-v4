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
  bgCanvas:         '#0F1623',   // deepest — page background
  bgSurface:        '#1A2235',   // cards, panels
  bgElevated:       '#232E44',   // modals, dropdowns
  bgOverlay:        '#2A3550',   // tooltips, popovers
  bgHover:          'rgba(255,255,255,0.04)',
  bgActive:         'rgba(13,107,116,0.12)',

  // ── Borders
  borderSubtle:     '#2A3550',
  borderDefault:    'rgba(255,255,255,0.09)',
  borderStrong:     'rgba(255,255,255,0.14)',
  borderBrand:      'rgba(13,107,116,0.35)',

  // ── Text
  textPrimary:      '#F1F5F9',
  textSecondary:    '#94A3B8',
  textMuted:        '#64748B',
  textBrand:        '#0D9BAA',
  textInverse:      '#09090b',

  // ── Brand — PharmaPulse teal
  brand300:         '#5EEAD4',
  brand400:         '#2DD4BF',
  brand500:         '#0D6B74',   // primary brand
  brand600:         '#0A5560',
  brand700:         '#074048',

  // ── Semantic status
  success:          '#2D7D5A',
  successBg:        'rgba(45,125,90,0.10)',
  successBorder:    'rgba(45,125,90,0.25)',

  warning:          '#D4840A',
  warningBg:        'rgba(212,132,10,0.10)',
  warningBorder:    'rgba(212,132,10,0.25)',

  danger:           '#B92B2B',
  dangerBg:         'rgba(185,43,43,0.10)',
  dangerBorder:     'rgba(185,43,43,0.25)',

  info:             '#3b82f6',
  infoBg:           'rgba(59,130,246,0.10)',
  infoBorder:       'rgba(59,130,246,0.20)',

  // ── KPI fallback (used when no dynamic color available)
  kpiFallback:      '#94A3B8',

  // ── Pure scale
  white:            '#ffffff',
  black:            '#000000',
} as const

// ── KPI Traffic-Light Semantic Tokens ─────────────────────
// Mirrors TRAFFIC_COLORS in kpiAnalyticsEngine but as pure
// design tokens — no engine dependency.

export const KPI_TRAFFIC_COLORS = {
  excellent: {
    color:   '#2D7D5A',
    bg:      'rgba(45,125,90,0.10)',
    border:  'rgba(45,125,90,0.25)',
    label:   'Excellent',
    labelAr: 'ممتاز',
    icon:    '🟢',
  },
  good: {
    color:   '#0D9BAA',
    bg:      'rgba(13,155,170,0.10)',
    border:  'rgba(13,155,170,0.25)',
    label:   'On Track',
    labelAr: 'على المسار',
    icon:    '🔵',
  },
  warning: {
    color:   '#D4840A',
    bg:      'rgba(212,132,10,0.10)',
    border:  'rgba(212,132,10,0.25)',
    label:   'Warning',
    labelAr: 'تحذير',
    icon:    '🟡',
  },
  critical: {
    color:   '#B92B2B',
    bg:      'rgba(185,43,43,0.10)',
    border:  'rgba(185,43,43,0.25)',
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

// Phase 1B: getKpiColor now delegates to the registry resolver.
// KPI_COLORS kept for consumers that need the full map object.
// Return values are identical — no visual change.
import { getKpiColor as _resolverGetKpiColor } from '../engine/kpiRegistry/kpiMetaResolver'

/** Returns the designated color for a KPI engine key, or fallback */
export function getKpiColor(engineKey: string): string {
  return _resolverGetKpiColor(engineKey)
}

// ── Risk / Executive Semantic Colors ──────────────────────

export const RISK_COLORS = {
  low:      { color: '#2D7D5A',  bg: 'rgba(45,125,90,0.08)',   border: 'rgba(45,125,90,0.18)',   label: 'Low Risk'      },
  medium:   { color: '#D4840A',  bg: 'rgba(212,132,10,0.08)',  border: 'rgba(212,132,10,0.18)',  label: 'Medium Risk'   },
  high:     { color: '#B92B2B',  bg: 'rgba(185,43,43,0.08)',   border: 'rgba(185,43,43,0.18)',   label: 'High Risk'     },
  critical: { color: '#991B1B',  bg: 'rgba(153,27,27,0.10)',   border: 'rgba(153,27,27,0.22)',   label: 'Critical Risk' },
} as const

export const EXECUTIVE_COLORS = {
  momentum:   '#2D7D5A',
  declining:  '#B92B2B',
  stable:     '#0D9BAA',
  benchmark:  '#6366f1',
  highlight:  '#f59e0b',
} as const

// ── Risk Level Colors (Number Locale + Executive BI Migration) ────
// Executive BI / Branch Intelligence risk badges (On Track / Low /
// Medium / High Risk) previously duplicated this exact 4-color
// palette as a module-level constant in 4+ separate files
// (PortfolioScoreCard, RiskDistributionPanel, BranchLeaderboard,
// BranchDrilldown, RegionalIntelligencePanel). Centralized here with
// the SAME hex values already in use everywhere — this is pure
// de-duplication, not a new color choice, so it does not change any
// rendered pixel color.
export const RISK_LEVEL_COLORS = {
  ON_TRACK:    { label: 'On Track',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)'  },
  LOW_RISK:    { label: 'Low Risk',    color: '#00d2ad', bg: 'rgba(0,210,173,0.08)',  border: 'rgba(0,210,173,0.2)'  },
  MEDIUM_RISK: { label: 'Medium Risk', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  HIGH_RISK:   { label: 'High Risk',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
} as const

/** Same palette as RISK_LEVEL_COLORS, keyed by the camelCase bucket
 *  names used by ExecutiveReport.riskDistribution (onTrack/lowRisk/
 *  mediumRisk/highRisk) instead of the SCREAMING_SNAKE risk-level key. */
export const RISK_BUCKET_COLORS = {
  onTrack:    RISK_LEVEL_COLORS.ON_TRACK,
  lowRisk:    RISK_LEVEL_COLORS.LOW_RISK,
  mediumRisk: RISK_LEVEL_COLORS.MEDIUM_RISK,
  highRisk:   RISK_LEVEL_COLORS.HIGH_RISK,
} as const

export function getRiskLevelColor(riskLevel: string | undefined) {
  return RISK_LEVEL_COLORS[riskLevel as keyof typeof RISK_LEVEL_COLORS] ?? RISK_LEVEL_COLORS.LOW_RISK
}

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

// ============================================================
// UI 3.0 Foundation — additive token layers (Phase UI3-A)
//
// Layering: Global tokens (COLORS/SPACING/TYPOGRAPHY/RADIUS/SHADOWS
// above) → Semantic tokens (STATUS_TOKENS/ELEVATION/CHART_TOKENS
// below, which assign meaning to global tokens) → Component tokens
// (DENSITY presets, consumed directly by card/table components).
//
// Purely additive — no existing export above was changed, so the
// pre-existing tokens.test.ts certification keeps passing unchanged.
// ============================================================

// ── Display-scale typography (UI3-A) ──────────────────────
// Adds the "Display" tier (48px/bold) required by the UI 3.0 type
// scale, plus a critical-insight floor used by certification to
// guarantee insight text is never rendered below 13px.

export const DISPLAY_TYPOGRAPHY = {
  sizeDisplay:      '48px',
  weightDisplay:    TYPOGRAPHY.weightBold,
  sizeTitle:        '20px',
  weightTitle:      TYPOGRAPHY.weightSemibold,
  sizeSubtitle:     '14px',
  weightSubtitle:   TYPOGRAPHY.weightMedium,
  sizeCaptionMin:   '12px',   // absolute floor for any caption text
  sizeInsightMin:   '13px',   // absolute floor for critical insight text
} as const

// ── Elevation Tokens (semantic) ────────────────────────────
// Named elevation levels — each maps to an existing SHADOWS value
// so there is exactly one physical shadow definition per level.

export const ELEVATION = {
  flat:     'none',
  raised:   SHADOWS.xs,
  card:     SHADOWS.card,
  float:    SHADOWS.float,
  modal:    SHADOWS.float,
  glow:     SHADOWS.glow,
} as const

// ── Status Tokens (semantic) ───────────────────────────────
// Unifies KPI_TRAFFIC_COLORS + RISK_COLORS under one vocabulary
// for components that just need "is this good/bad" without caring
// whether the source was a KPI or a risk distribution.

export const STATUS_TOKENS = {
  positive: { color: COLORS.success, bg: COLORS.successBg, border: COLORS.successBorder },
  caution:  { color: COLORS.warning, bg: COLORS.warningBg, border: COLORS.warningBorder },
  negative: { color: COLORS.danger,  bg: COLORS.dangerBg,  border: COLORS.dangerBorder },
  neutral:  { color: COLORS.info,    bg: COLORS.infoBg,    border: COLORS.infoBorder },
} as const

export type StatusToken = keyof typeof STATUS_TOKENS

/** Safe status-token lookup — always returns a valid config. */
export function getStatusToken(status: string | undefined) {
  return STATUS_TOKENS[status as StatusToken] ?? STATUS_TOKENS.neutral
}

// ── Density Tokens (component) ─────────────────────────────
// Component-level spacing presets consumed by card/table/list
// components that need to switch between comfortable and compact
// presentation without each component inventing its own numbers.

export const DENSITY = {
  comfortable: {
    cardPadding:    '16px',
    cardGap:        '12px',
    rowHeight:      '40px',
    radius:         RADIUS.lg,    // 8px
  },
  compact: {
    cardPadding:    '12px',
    cardGap:        '8px',
    rowHeight:      '32px',
    radius:         RADIUS.md,    // 6px
  },
} as const

export type DensityToken = keyof typeof DENSITY

// ── Chart Tokens (semantic) ─────────────────────────────────
// Token-driven chart styling so chart components never hardcode
// hex colors for grid/axis/tooltip chrome.

export const CHART_TOKENS = {
  grid:        'rgba(255,255,255,0.06)',
  axisLine:    'transparent',
  axisTick:    COLORS.textMuted,
  tooltipBg:   COLORS.bgElevated,
  tooltipBorder: COLORS.borderDefault,
  tooltipText: COLORS.textPrimary,
  targetLine:  COLORS.borderStrong,
  palette: [
    COLORS.brand400,
    '#6366f1',
    '#f59e0b',
    '#22c55e',
    '#8b5cf6',
    '#ef4444',
  ],
} as const

// ── Type helpers ──────────────────────────────────────────

export type ColorToken    = typeof COLORS
export type SpacingToken  = typeof SPACING
export type TypographyToken = typeof TYPOGRAPHY
export type ShadowToken   = typeof SHADOWS
export type RadiusToken   = typeof RADIUS
export type ElevationToken = typeof ELEVATION
export type ChartToken     = typeof CHART_TOKENS
