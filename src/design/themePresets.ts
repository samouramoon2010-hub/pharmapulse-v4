// ============================================================
// PharmaPulse — Theme Presets (Phase UI3-B)
//
// Pure data — 7 named presets for the planned UI 3.0 theme system.
// These are intentionally NOT wired into settingsStore.js / the
// existing ThemeSwitcher: per the Bundle spec, theme-switching UI
// for this catalog is out of scope for the Foundation bundle. The
// existing 9-preset runtime theme system (settingsStore.js
// THEME_META / applyTheme) is untouched.
//
// Each preset defines exactly the fields requested:
// primary, secondary, background, surface, card, border, text,
// mutedText, success, warning, danger, info, chartPalette.
// ============================================================

export interface ThemePreset {
  id:          string
  name:        string
  primary:     string
  secondary:   string
  background:  string
  surface:     string
  card:        string
  border:      string
  text:        string
  mutedText:   string
  success:     string
  warning:     string
  danger:      string
  info:        string
  chartPalette: string[]
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  corporate: {
    id: 'corporate', name: 'Corporate',
    primary: '#1D4E89', secondary: '#3B82C4',
    background: '#F4F6F9', surface: '#FFFFFF', card: '#FFFFFF',
    border: '#E2E8F0', text: '#1A2233', mutedText: '#5B6B82',
    success: '#1E8E5A', warning: '#C77700', danger: '#C0392B', info: '#2E6BBE',
    chartPalette: ['#1D4E89', '#3B82C4', '#1E8E5A', '#C77700', '#8E44AD', '#C0392B'],
  },
  executive: {
    id: 'executive', name: 'Executive',
    primary: '#0D6B74', secondary: '#2DD4BF',
    background: '#0F1623', surface: '#1A2235', card: '#1F2A40',
    border: '#2A3550', text: '#F1F5F9', mutedText: '#94A3B8',
    success: '#2D7D5A', warning: '#D4840A', danger: '#B92B2B', info: '#3B82F6',
    chartPalette: ['#2DD4BF', '#6366F1', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444'],
  },
  futuristic: {
    id: 'futuristic', name: 'Futuristic',
    primary: '#00F0FF', secondary: '#7C3AED',
    background: '#06080F', surface: '#0D1220', card: '#121A2E',
    border: 'rgba(0,240,255,0.18)', text: '#E6FBFF', mutedText: '#7FA9B8',
    success: '#21E6A1', warning: '#FFB020', danger: '#FF3B6B', info: '#5AC8FA',
    chartPalette: ['#00F0FF', '#7C3AED', '#21E6A1', '#FFB020', '#FF3B6B', '#5AC8FA'],
  },
  medical: {
    id: 'medical', name: 'Medical',
    primary: '#0E8C7A', secondary: '#4FB8A6',
    background: '#F7FBFA', surface: '#FFFFFF', card: '#FFFFFF',
    border: '#DCEDE9', text: '#11302A', mutedText: '#5C7B74',
    success: '#1E8E5A', warning: '#C77700', danger: '#C0392B', info: '#2E8BBE',
    chartPalette: ['#0E8C7A', '#4FB8A6', '#1E8E5A', '#C77700', '#3D6E9C', '#C0392B'],
  },
  amoled: {
    id: 'amoled', name: 'AMOLED',
    primary: '#2DD4BF', secondary: '#5EEAD4',
    background: '#000000', surface: '#0A0A0A', card: '#121212',
    border: 'rgba(255,255,255,0.08)', text: '#F5F5F5', mutedText: '#8A8A8A',
    success: '#2FBF71', warning: '#E0A100', danger: '#E5484D', info: '#3B9DFF',
    chartPalette: ['#2DD4BF', '#5EEAD4', '#2FBF71', '#E0A100', '#A78BFA', '#E5484D'],
  },
  apple: {
    id: 'apple', name: 'Apple',
    primary: '#0A84FF', secondary: '#5E5CE6',
    background: '#F5F5F7', surface: '#FFFFFF', card: '#FFFFFF',
    border: '#E5E5EA', text: '#1D1D1F', mutedText: '#6E6E73',
    success: '#34C759', warning: '#FF9F0A', danger: '#FF3B30', info: '#0A84FF',
    chartPalette: ['#0A84FF', '#5E5CE6', '#34C759', '#FF9F0A', '#AF52DE', '#FF3B30'],
  },
  cyber: {
    id: 'cyber', name: 'Cyber',
    primary: '#FF2A6D', secondary: '#05D9E8',
    background: '#0B0014', surface: '#15022A', card: '#1C0936',
    border: 'rgba(255,42,109,0.22)', text: '#F4EAFF', mutedText: '#9C84B8',
    success: '#05FFA1', warning: '#FFD319', danger: '#FF2A6D', info: '#05D9E8',
    chartPalette: ['#FF2A6D', '#05D9E8', '#05FFA1', '#FFD319', '#D300FF', '#FF2A6D'],
  },
}

export const THEME_PRESET_IDS = Object.keys(THEME_PRESETS)

/** Safe preset lookup — always returns a valid preset (falls back to executive). */
export function getThemePreset(id: string | undefined): ThemePreset {
  return THEME_PRESETS[id as string] ?? THEME_PRESETS.executive
}

const HEX_OR_RGBA = /^#[0-9a-fA-F]{3,8}$|^rgba?\(/

/** True when every color field on a preset is a usable color string. Never throws. */
export function isThemePresetValid(preset: unknown): boolean {
  try {
    const p = preset as Partial<ThemePreset>
    if (!p || typeof p !== 'object') return false
    const fields = ['primary', 'secondary', 'background', 'surface', 'card', 'border', 'text', 'mutedText', 'success', 'warning', 'danger', 'info'] as const
    for (const f of fields) {
      if (typeof p[f] !== 'string' || !HEX_OR_RGBA.test(p[f] as string)) return false
    }
    if (!Array.isArray(p.chartPalette) || p.chartPalette.length === 0) return false
    return p.chartPalette.every((c) => typeof c === 'string' && HEX_OR_RGBA.test(c))
  } catch {
    return false
  }
}
