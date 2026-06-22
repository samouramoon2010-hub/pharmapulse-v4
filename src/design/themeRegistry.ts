// ============================================================
// themeRegistry — Theme Engine Core (T1-A)
//
// Registers the 7 existing UI3-B presets (themePresets.ts) for the
// new architecture-level Theme Engine. Does not redefine colors —
// only adds: cycle order, default theme, safe id resolution/
// fallback, dark/light classification, and theme list/metadata.
//
// No business logic. No Firestore. No Settings Center UI.
// ============================================================
import {
  THEME_PRESETS,
  THEME_PRESET_IDS,
  getThemePreset,
  isThemePresetValid,
  type ThemePreset,
} from './themePresets'
import type { ThemeId, ThemeMeta } from './themeTypes'

// ── Cycle order (Phase T1-D header toggle) ────────────────────
// Corporate -> Executive -> Futuristic -> Medical -> AMOLED -> Apple -> Cyber -> (repeat)
export const THEME_CYCLE_ORDER: ThemeId[] = [
  'corporate', 'executive', 'futuristic', 'medical', 'amoled', 'apple', 'cyber',
]

// ── Default theme (Phase T1-F: "Corporate remains default") ──
export const DEFAULT_THEME_ID: ThemeId = 'corporate'

// ── Dark/light classification ─────────────────────────────────
// Explicit, since the 7 presets are fixed and well known — simpler
// and never ambiguous compared to inferring luminance from a hex
// background value.
const DARK_THEME_IDS: ReadonlySet<ThemeId> = new Set<ThemeId>([
  'executive', 'futuristic', 'amoled', 'cyber',
])

export function isDarkThemeId(id: ThemeId): boolean {
  return DARK_THEME_IDS.has(id)
}

// ── Validation / safe lookup ───────────────────────────────────

/** True only for a registered id whose preset passes color validation. Never throws. */
export function isValidThemeId(id: string | undefined | null): boolean {
  if (!id) return false
  if (!THEME_PRESET_IDS.includes(id)) return false
  return isThemePresetValid(THEME_PRESETS[id])
}

/** Safe id resolution — always returns a registered, valid theme id. Falls back to DEFAULT_THEME_ID. */
export function resolveThemeId(id: string | undefined | null): ThemeId {
  return isValidThemeId(id) ? (id as ThemeId) : DEFAULT_THEME_ID
}

/** Safe preset lookup by (possibly invalid) id — never throws, never returns undefined. */
export function getThemeById(id: string | undefined | null): ThemePreset {
  return getThemePreset(resolveThemeId(id))
}

// ── Listing / metadata ─────────────────────────────────────────

export function listThemes(): ThemeMeta[] {
  return THEME_CYCLE_ORDER.map((id) => ({
    id,
    name: THEME_PRESETS[id]?.name ?? id,
    isDark: isDarkThemeId(id),
  }))
}

// ── Cycling (Phase T1-D) ────────────────────────────────────────

/** Returns the next theme id after `currentId` in THEME_CYCLE_ORDER, wrapping around. */
export function getNextThemeId(currentId: ThemeId): ThemeId {
  const safeId = resolveThemeId(currentId)
  const idx = THEME_CYCLE_ORDER.indexOf(safeId)
  return THEME_CYCLE_ORDER[(idx + 1) % THEME_CYCLE_ORDER.length]
}

export { THEME_PRESETS, THEME_PRESET_IDS }
export type { ThemeId, ThemeMeta, ThemePreset }
