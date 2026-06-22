// ============================================================
// glassTokens — Glassmorphism Layer (Phase T3-C)
//
// Only Apple and Executive get glass treatment — every other theme
// is explicitly disabled (opaque chrome, solid cards). Applied via
// index.css to the header/sidebar/dropdown/modal chrome surfaces,
// which already render from --topbar-bg/--sidebar-bg/--modal-bg
// (see AppLayout.jsx, Sidebar.jsx) — no component rewrites needed,
// only the variable values change under [data-theme-t1="apple"] /
// [data-theme-t1="executive"]. Cards are never glass — --bg-card
// stays fully opaque in every theme.
// ============================================================
import type { ThemeId } from './themeTypes'

export const GLASS_THEME_IDS: ThemeId[] = ['apple', 'executive']

export interface GlassTokens {
  enabled: boolean
  /** CSS blur length, e.g. '16px'. Spec range: 12-24px. */
  blur: string
  /** Chrome background opacity. Spec range: 0.6-0.85 (never below — text must stay readable). */
  opacity: number
}

const GLASS_PRESETS: Record<ThemeId, GlassTokens> = {
  apple:     { enabled: true,  blur: '20px', opacity: 0.78 },
  executive: { enabled: true,  blur: '18px', opacity: 0.82 },
  corporate: { enabled: false, blur: '0px',  opacity: 1 },
  futuristic:{ enabled: false, blur: '0px',  opacity: 1 },
  medical:   { enabled: false, blur: '0px',  opacity: 1 },
  amoled:    { enabled: false, blur: '0px',  opacity: 1 },
  cyber:     { enabled: false, blur: '0px',  opacity: 1 },
}

export function isGlassThemeId(id: string | undefined | null): boolean {
  return !!id && GLASS_THEME_IDS.includes(id as ThemeId)
}

/** True when blur is within 12-24px and opacity within 0.6-0.85 (or the theme is disabled). Never throws. */
export function isGlassTokensValid(tokens: unknown): boolean {
  try {
    const t = tokens as Partial<GlassTokens>
    if (!t || typeof t !== 'object') return false
    if (!t.enabled) return t.opacity === 1
    const blurPx = parseInt(String(t.blur), 10)
    return (
      blurPx >= 12 && blurPx <= 24 &&
      typeof t.opacity === 'number' && t.opacity >= 0.6 && t.opacity <= 0.85
    )
  } catch {
    return false
  }
}

/** Safe lookup — always returns a valid token set, falling back to the disabled (opaque) state. */
export function getGlassTokens(id: string | undefined | null): GlassTokens {
  const tokens = GLASS_PRESETS[id as ThemeId]
  return isGlassTokensValid(tokens) ? tokens : { enabled: false, blur: '0px', opacity: 1 }
}

/** Pure — builds the CSS-variable map for the glass layer. No DOM access. */
export function buildGlassCssVars(id: string | undefined | null): Record<string, string> {
  const t = getGlassTokens(id)
  return {
    '--glass-blur':    t.blur,
    '--glass-opacity': String(t.opacity),
    '--glass-enabled': String(t.enabled),
  }
}
