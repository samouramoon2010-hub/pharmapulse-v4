// ============================================================
// themeEffects — Premium Surface Tokens (Phase T3-A)
//
// Pure data — per-theme shadow/border/corner character that gives
// each of the 7 T1 themes a distinct premium "feel" (Corporate's
// minimal shadow vs. Executive's wide soft shadow vs. AMOLED's zero
// shadow, etc). No DOM access, no component rewrites — these are
// consumed as CSS variables by index.css, the same bridge mechanism
// themeCssVars.ts already uses for color tokens.
//
// Deliberately does NOT touch --radius-* — corner radius remains
// owned by the Theme T2 RadiusSelector (sharp/soft/rounded), so a
// theme's "character" here never fights the user's explicit choice.
// ============================================================
import type { ThemeId } from './themeTypes'

export interface ThemeEffectTokens {
  shadowCard:  string
  shadowFloat: string
  shadowInner: string
  /** Border width used for the card surface, in px-suffixed CSS length. */
  borderWidthCard: string
  /** Descriptive character label — informational only, not applied as CSS. */
  cornerStyle: 'sharp' | 'soft' | 'rounded'
}

export const THEME_EFFECT_PRESETS: Record<ThemeId, ThemeEffectTokens> = {
  corporate: {
    shadowCard:  '0 1px 2px rgba(15,23,42,0.05)',
    shadowFloat: '0 6px 18px rgba(15,23,42,0.08)',
    shadowInner: 'inset 0 1px 0 rgba(255,255,255,0.4)',
    borderWidthCard: '1px',
    cornerStyle: 'soft',
  },
  executive: {
    shadowCard:  '0 4px 16px rgba(0,0,0,0.32)',
    shadowFloat: '0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,110,0.10)',
    shadowInner: 'inset 0 1px 0 rgba(212,175,110,0.06)',
    borderWidthCard: '1px',
    cornerStyle: 'soft',
  },
  futuristic: {
    shadowCard:  '0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,240,255,0.14)',
    shadowFloat: '0 10px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,240,255,0.20)',
    shadowInner: 'inset 0 1px 0 rgba(0,240,255,0.05)',
    borderWidthCard: '1px',
    cornerStyle: 'sharp',
  },
  medical: {
    shadowCard:  '0 1px 2px rgba(17,48,42,0.05)',
    shadowFloat: '0 8px 20px rgba(17,48,42,0.08)',
    shadowInner: 'inset 0 1px 0 rgba(255,255,255,0.5)',
    borderWidthCard: '1px',
    cornerStyle: 'soft',
  },
  amoled: {
    shadowCard:  'none',
    shadowFloat: 'none',
    shadowInner: 'none',
    borderWidthCard: '1px',
    cornerStyle: 'soft',
  },
  apple: {
    shadowCard:  '0 2px 8px rgba(0,0,0,0.06)',
    shadowFloat: '0 12px 32px rgba(0,0,0,0.10)',
    shadowInner: 'inset 0 1px 0 rgba(255,255,255,0.6)',
    borderWidthCard: '1px',
    cornerStyle: 'rounded',
  },
  cyber: {
    shadowCard:  '0 0 0 1px rgba(255,42,109,0.20)',
    shadowFloat: '0 0 24px rgba(5,217,232,0.18), 0 0 0 1px rgba(255,42,109,0.28)',
    shadowInner: 'inset 0 1px 0 rgba(5,217,232,0.05)',
    borderWidthCard: '1px',
    cornerStyle: 'sharp',
  },
}

/** True when every shadow/border field on a token set is a non-empty string. Never throws. */
export function isThemeEffectTokensValid(tokens: unknown): boolean {
  try {
    const t = tokens as Partial<ThemeEffectTokens>
    if (!t || typeof t !== 'object') return false
    return (
      typeof t.shadowCard === 'string' &&
      typeof t.shadowFloat === 'string' &&
      typeof t.shadowInner === 'string' &&
      typeof t.borderWidthCard === 'string' && t.borderWidthCard.length > 0 &&
      ['sharp', 'soft', 'rounded'].includes(t.cornerStyle as string)
    )
  } catch {
    return false
  }
}

/** Safe lookup — always returns a valid token set, falling back to corporate. Never throws. */
export function getThemeEffectTokens(id: string | undefined | null): ThemeEffectTokens {
  const tokens = THEME_EFFECT_PRESETS[id as ThemeId]
  return isThemeEffectTokensValid(tokens) ? tokens : THEME_EFFECT_PRESETS.corporate
}

/** Pure — builds the CSS-variable map for a theme's surface effects. No DOM access. */
export function buildEffectCssVars(id: string | undefined | null): Record<string, string> {
  const t = getThemeEffectTokens(id)
  return {
    '--shadow-card':  t.shadowCard,
    '--shadow-float': t.shadowFloat,
    '--shadow-inner': t.shadowInner,
    '--border-width-card': t.borderWidthCard,
  }
}
