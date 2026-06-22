// ============================================================
// backgroundLayers — Context-Aware Background System (Phase T3-B)
//
// Pure data — a single `background-image` CSS value per theme,
// exposed as the --bg-ambient-layer variable. CSS gradients/radial
// glows only: no canvas, no particles, no JS-driven animation, no
// images. Themes that want a flat look (Medical, AMOLED) simply use
// 'none'. Consumed by index.css under [data-theme-t1="..."] — the
// same attribute the rest of the Theme Engine writes.
// ============================================================
import type { ThemeId } from './themeTypes'

export const BACKGROUND_LAYERS: Record<ThemeId, string> = {
  // Soft neutral gradient — calm, professional canvas.
  corporate: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(29,78,137,0.05) 0%, transparent 70%)',
  // Deep navy gradient — premium, low-contrast depth.
  executive: 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(13,107,116,0.10) 0%, transparent 70%)',
  // Subtle radial glow — HUD feel, never a full-screen wash.
  futuristic: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(0,240,255,0.08) 0%, transparent 65%)',
  // Clean white background — no gradient at all.
  medical: 'none',
  // Pure black — zero ambient layer by definition.
  amoled: 'none',
  // Glass blur atmosphere — soft warm-gray haze.
  apple: 'radial-gradient(ellipse 85% 50% at 50% 0%, rgba(10,132,255,0.05) 0%, transparent 70%)',
  // Terminal dark — faint scanline-style glow, still CSS-only.
  cyber: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,42,109,0.07) 0%, transparent 65%)',
}

/** True for a registered theme id whose background layer is a usable string. Never throws. */
export function isValidBackgroundLayer(id: string | undefined | null): boolean {
  try {
    if (!id) return false
    return typeof BACKGROUND_LAYERS[id as ThemeId] === 'string'
  } catch {
    return false
  }
}

/** Safe lookup — always returns a usable background-image value, falling back to 'none'. */
export function getBackgroundLayer(id: string | undefined | null): string {
  return isValidBackgroundLayer(id) ? BACKGROUND_LAYERS[id as ThemeId] : 'none'
}

/** Pure — builds the CSS-variable map for the ambient background layer. No DOM access. */
export function buildBackgroundCssVars(id: string | undefined | null): Record<string, string> {
  return { '--bg-ambient-layer': getBackgroundLayer(id) }
}
