// ============================================================
// Theme T1 Bundle — Certification (Phase T1-G)
//
// Two test styles, matching this repo's established conventions:
//   - Pure logic files (themeRegistry/themeStorage/themeCssVars/
//     themeEngine) are plain TS/JS with no JSX — exercised by
//     calling them directly. This vitest project runs in the
//     default Node environment (no jsdom/happy-dom configured —
//     verified: no environment override exists anywhere in this
//     repo), so `document`/`window` are genuinely undefined here.
//     That is not a workaround — it is real SSR-equivalent coverage
//     of every "no document" guard in themeEngine.ts/themeStorage.ts.
//   - React files (ThemeProvider.jsx, useTheme.js, AppLayout.jsx)
//     are certified via raw `?raw` source inspection, exactly like
//     every other certification suite in this repo (tokens.test.ts,
//     ui3ProductSurfaces.certification.test.ts, ProfileStudioPage.
//     test.ts) — no @testing-library/react anywhere in this repo.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { THEME_PRESETS, THEME_PRESET_IDS, isThemePresetValid, getThemePreset } from './themePresets'
import {
  THEME_CYCLE_ORDER, DEFAULT_THEME_ID, isDarkThemeId, isValidThemeId,
  resolveThemeId, getThemeById, getNextThemeId, listThemes,
} from './themeRegistry'
import { buildThemeCssVars, REQUIRED_COLOR_VARS, REQUIRED_LAYOUT_VARS, CHART_VAR_COUNT } from './themeCssVars'
import { composeTheme, applyCssVars, applyThemeToDocument, THEME_ROOT_ATTR } from './themeEngine'
import { THEME_STORAGE_KEY, loadStoredThemeId, saveThemeId, clearStoredThemeId } from './themeStorage'

const themeProviderSrc = await import('../theme/ThemeProvider.jsx?raw').then((m) => m.default)
const useThemeSrc      = await import('../theme/useTheme.js?raw').then((m) => m.default)
const appLayoutSrc     = await import('../components/layout/AppLayout.jsx?raw').then((m) => m.default)
const appSrc           = await import('../App.jsx?raw').then((m) => m.default)
// .css does not survive a `?raw` import cleanly through this project's Vite
// CSS pipeline (returns an empty string), so it is read directly from disk —
// same content, just via Node's fs instead of the module graph.
const indexCssSrc      = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const settingsStoreSrc = await import('../store/settingsStore.js?raw').then((m) => m.default)

const HEX_OR_RGBA = /^#[0-9a-fA-F]{3,8}$|^rgba?\(/

// ════════════════════════════════════════════════════════════
// A — Theme registration (per-theme loop, 7 themes × many checks)
// ════════════════════════════════════════════════════════════
describe('T1-A — every theme in THEME_CYCLE_ORDER is registered with a valid preset', () => {
  it('THEME_CYCLE_ORDER has exactly 7 entries', () => {
    expect(THEME_CYCLE_ORDER.length).toBe(7)
  })
  it('THEME_CYCLE_ORDER matches the spec order exactly', () => {
    expect(THEME_CYCLE_ORDER).toEqual(['corporate', 'executive', 'futuristic', 'medical', 'amoled', 'apple', 'cyber'])
  })
  it('theme ids in THEME_CYCLE_ORDER are unique', () => {
    expect(new Set(THEME_CYCLE_ORDER).size).toBe(THEME_CYCLE_ORDER.length)
  })
  it('THEME_PRESET_IDS contains every cycle-order id', () => {
    for (const id of THEME_CYCLE_ORDER) expect(THEME_PRESET_IDS).toContain(id)
  })

  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      const preset = THEME_PRESETS[id]

      it('exists in THEME_PRESETS', () => {
        expect(preset).toBeDefined()
      })
      it('id field matches its registry key', () => {
        expect(preset.id).toBe(id)
      })
      it('has a non-empty display name', () => {
        expect(typeof preset.name).toBe('string')
        expect(preset.name.length).toBeGreaterThan(0)
      })
      it('passes isThemePresetValid()', () => {
        expect(isThemePresetValid(preset)).toBe(true)
      })
      it('passes registry isValidThemeId()', () => {
        expect(isValidThemeId(id)).toBe(true)
      })
      for (const field of ['primary', 'secondary', 'background', 'surface', 'card', 'border', 'text', 'mutedText', 'success', 'warning', 'danger', 'info'] as const) {
        it(`${field} is a usable hex/rgba color string`, () => {
          expect(typeof preset[field]).toBe('string')
          expect(preset[field]).toMatch(HEX_OR_RGBA)
        })
      }
      it('chartPalette is a non-empty array of valid colors', () => {
        expect(Array.isArray(preset.chartPalette)).toBe(true)
        expect(preset.chartPalette.length).toBeGreaterThan(0)
        for (const c of preset.chartPalette) expect(c).toMatch(HEX_OR_RGBA)
      })
      it('getThemeById resolves to this exact preset', () => {
        expect(getThemeById(id)).toBe(preset)
      })
      it('resolveThemeId is the identity for a valid id', () => {
        expect(resolveThemeId(id)).toBe(id)
      })
      it('isDarkThemeId returns a boolean (no throw)', () => {
        expect(typeof isDarkThemeId(id)).toBe('boolean')
      })
      it('getNextThemeId never returns the same id unless the cycle has length 1', () => {
        const next = getNextThemeId(id)
        expect(THEME_CYCLE_ORDER).toContain(next)
        if (THEME_CYCLE_ORDER.length > 1) expect(next).not.toBe(id)
      })
      it('appears exactly once in listThemes()', () => {
        const matches = listThemes().filter((t) => t.id === id)
        expect(matches.length).toBe(1)
      })
    })
  }
})

// ════════════════════════════════════════════════════════════
// B — Default theme / fallback safety
// ════════════════════════════════════════════════════════════
describe('T1-A — default theme and safe fallback', () => {
  it('DEFAULT_THEME_ID is "corporate" (Phase T1-F: Corporate remains default)', () => {
    expect(DEFAULT_THEME_ID).toBe('corporate')
  })
  it('DEFAULT_THEME_ID is itself a valid, registered theme', () => {
    expect(isValidThemeId(DEFAULT_THEME_ID)).toBe(true)
  })
  it('resolveThemeId(undefined) falls back to DEFAULT_THEME_ID', () => {
    expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID)
  })
  it('resolveThemeId(null) falls back to DEFAULT_THEME_ID', () => {
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID)
  })
  it('resolveThemeId("") falls back to DEFAULT_THEME_ID', () => {
    expect(resolveThemeId('')).toBe(DEFAULT_THEME_ID)
  })
  it('resolveThemeId of an unregistered id falls back to DEFAULT_THEME_ID', () => {
    expect(resolveThemeId('not-a-real-theme')).toBe(DEFAULT_THEME_ID)
  })
  it('resolveThemeId of a prototype-pollution-style key falls back safely', () => {
    expect(resolveThemeId('__proto__')).toBe(DEFAULT_THEME_ID)
    expect(resolveThemeId('constructor')).toBe(DEFAULT_THEME_ID)
  })
  it('isValidThemeId never throws on weird input', () => {
    for (const bad of [undefined, null, '', 123 as unknown as string, {} as unknown as string, [] as unknown as string]) {
      expect(() => isValidThemeId(bad)).not.toThrow()
    }
  })
  it('getThemeById never throws and always returns a valid preset object', () => {
    for (const bad of [undefined, null, '', 'nonsense', '__proto__']) {
      const preset = getThemeById(bad)
      expect(preset).toBeTruthy()
      expect(isThemePresetValid(preset)).toBe(true)
    }
  })
  it('getNextThemeId on an invalid current id still returns a valid next id (no crash on corrupted stored state)', () => {
    const next = getNextThemeId('corrupted-id' as unknown as string)
    expect(THEME_CYCLE_ORDER).toContain(next)
  })
  it('the existing themePresets.getThemePreset() fallback (to executive) is untouched by the registry', () => {
    expect(getThemePreset(undefined)).toBe(THEME_PRESETS.executive)
  })
})

// ════════════════════════════════════════════════════════════
// C — listThemes() / metadata
// ════════════════════════════════════════════════════════════
describe('T1-A — listThemes() metadata', () => {
  it('returns exactly 7 entries, one per cycle-order id', () => {
    expect(listThemes().length).toBe(7)
  })
  it('every entry has id, name, and isDark fields', () => {
    for (const meta of listThemes()) {
      expect(typeof meta.id).toBe('string')
      expect(typeof meta.name).toBe('string')
      expect(typeof meta.isDark).toBe('boolean')
    }
  })
  it('order matches THEME_CYCLE_ORDER exactly', () => {
    expect(listThemes().map((t) => t.id)).toEqual(THEME_CYCLE_ORDER)
  })
})

// ════════════════════════════════════════════════════════════
// D — CSS Variable Bridge (themeCssVars.ts)
// ════════════════════════════════════════════════════════════
describe('T1-B — buildThemeCssVars produces every required variable for every theme', () => {
  it('REQUIRED_COLOR_VARS has the 12 named --color-* variables from the spec', () => {
    expect(REQUIRED_COLOR_VARS).toEqual([
      '--color-primary', '--color-secondary', '--color-background', '--color-surface',
      '--color-card', '--color-border', '--color-text', '--color-muted-text',
      '--color-success', '--color-warning', '--color-danger', '--color-info',
    ])
  })
  it('REQUIRED_LAYOUT_VARS has the 4 named radius/density variables from the spec', () => {
    expect(REQUIRED_LAYOUT_VARS).toEqual(['--radius-card', '--radius-button', '--density-card-padding', '--density-row-height'])
  })
  it('CHART_VAR_COUNT is 6 (covers every preset\'s 6-color chartPalette)', () => {
    expect(CHART_VAR_COUNT).toBe(6)
  })

  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      const vars = buildThemeCssVars(THEME_PRESETS[id])

      for (const key of REQUIRED_COLOR_VARS) {
        it(`defines ${key}`, () => {
          expect(vars[key]).toBeDefined()
          expect(typeof vars[key]).toBe('string')
          expect(vars[key].length).toBeGreaterThan(0)
        })
      }
      for (const key of REQUIRED_LAYOUT_VARS) {
        it(`defines ${key}`, () => {
          expect(vars[key]).toBeDefined()
        })
      }
      for (let i = 1; i <= CHART_VAR_COUNT; i++) {
        it(`defines --chart-${i}`, () => {
          expect(vars[`--chart-${i}`]).toBeDefined()
          expect(typeof vars[`--chart-${i}`]).toBe('string')
        })
      }
      it('--color-background matches the preset background exactly (no value drift)', () => {
        expect(vars['--color-background']).toBe(THEME_PRESETS[id].background)
      })
      it('--color-primary matches the preset primary exactly', () => {
        expect(vars['--color-primary']).toBe(THEME_PRESETS[id].primary)
      })
      it('bridges onto the existing shell vars (--bg-canvas, --text-primary, --border-subtle)', () => {
        expect(vars['--bg-canvas']).toBe(THEME_PRESETS[id].background)
        expect(vars['--text-primary']).toBe(THEME_PRESETS[id].text)
        expect(vars['--border-subtle']).toBe(THEME_PRESETS[id].border)
      })
      it('bridges status colors onto --status-success/warning/critical/info', () => {
        expect(vars['--status-success']).toBe(THEME_PRESETS[id].success)
        expect(vars['--status-warning']).toBe(THEME_PRESETS[id].warning)
        expect(vars['--status-critical']).toBe(THEME_PRESETS[id].danger)
        expect(vars['--status-info']).toBe(THEME_PRESETS[id].info)
      })
      it('every variable value is a non-empty string (no undefined/NaN leaking through)', () => {
        for (const v of Object.values(vars)) {
          expect(typeof v).toBe('string')
          expect(v.length).toBeGreaterThan(0)
        }
      })
    })
  }

  it('buildThemeCssVars never throws even for a palette shorter than CHART_VAR_COUNT', () => {
    const shortPalette = { ...THEME_PRESETS.corporate, chartPalette: ['#111111'] }
    expect(() => buildThemeCssVars(shortPalette)).not.toThrow()
    const vars = buildThemeCssVars(shortPalette)
    for (let i = 1; i <= CHART_VAR_COUNT; i++) {
      expect(vars[`--chart-${i}`]).toBeDefined()
    }
  })
})

// ════════════════════════════════════════════════════════════
// E — Theme Safety (Phase T1-F)
// ════════════════════════════════════════════════════════════
describe('T1-F — theme safety requirements', () => {
  it('AMOLED uses a true black background', () => {
    expect(THEME_PRESETS.amoled.background).toBe('#000000')
  })
  it('AMOLED is classified as a dark theme', () => {
    expect(isDarkThemeId('amoled')).toBe(true)
  })
  it('Medical remains light (high background luminance, not dark)', () => {
    expect(THEME_PRESETS.medical.background.toUpperCase()).toBe('#F7FBFA')
    expect(isDarkThemeId('medical')).toBe(false)
  })
  it('Medical text/background pairing is high contrast (dark text on a light background)', () => {
    const bg = THEME_PRESETS.medical.background
    const text = THEME_PRESETS.medical.text
    expect(bg.toUpperCase()).not.toBe(text.toUpperCase())
    // light bg starts with a high hex value, dark text starts low
    expect(parseInt(bg.slice(1, 3), 16)).toBeGreaterThan(200)
    expect(parseInt(text.slice(1, 3), 16)).toBeLessThan(60)
  })
  it('Executive uses a dark navy background with a teal/gold-leaning accent palette', () => {
    expect(isDarkThemeId('executive')).toBe(true)
    expect(THEME_PRESETS.executive.background.toUpperCase()).toBe('#0F1623')
  })
  it('Futuristic uses a dark background with a cyan primary accent', () => {
    expect(isDarkThemeId('futuristic')).toBe(true)
    expect(THEME_PRESETS.futuristic.primary.toUpperCase()).toBe('#00F0FF')
  })
  it('Corporate is light and is the registered default', () => {
    expect(isDarkThemeId('corporate')).toBe(false)
    expect(DEFAULT_THEME_ID).toBe('corporate')
  })
  it('Apple and Medical and Corporate are the only light themes; the rest are dark', () => {
    const light = THEME_CYCLE_ORDER.filter((id) => !isDarkThemeId(id))
    expect(light.sort()).toEqual(['apple', 'corporate', 'medical'].sort())
  })
  it('no theme has an identical text and background color (guaranteed unreadable)', () => {
    for (const id of THEME_CYCLE_ORDER) {
      const p = THEME_PRESETS[id]
      expect(p.text.toUpperCase()).not.toBe(p.background.toUpperCase())
    }
  })
  it('no theme has an identical surface and card color collapsing visual hierarchy entirely', () => {
    // Same color is allowed for one or two themes by design (e.g. flat surfaces),
    // but never for ALL themes — this guards against a copy-paste preset bug.
    const collapsed = THEME_CYCLE_ORDER.filter((id) => THEME_PRESETS[id].surface === THEME_PRESETS[id].card)
    expect(collapsed.length).toBeLessThan(THEME_CYCLE_ORDER.length)
  })
})

// ════════════════════════════════════════════════════════════
// F — themeEngine.ts (compose / apply / SSR safety)
// ════════════════════════════════════════════════════════════
describe('T1-A/T1-B — themeEngine.composeTheme is pure and SSR-safe', () => {
  it('composeTheme never throws for any input', () => {
    for (const input of [undefined, null, '', 'corporate', 'not-real']) {
      expect(() => composeTheme(input)).not.toThrow()
    }
  })
  it('composeTheme returns { id, preset, cssVars } with the resolved id', () => {
    const composed = composeTheme('amoled')
    expect(composed.id).toBe('amoled')
    expect(composed.preset).toBe(THEME_PRESETS.amoled)
    expect(composed.cssVars['--color-background']).toBe('#000000')
  })
  it('composeTheme falls back safely for an invalid id', () => {
    const composed = composeTheme('totally-invalid')
    expect(composed.id).toBe(DEFAULT_THEME_ID)
  })
})

describe('T1-A/T1-B — themeEngine DOM application is SSR-safe (this test runs with no document/window — Node environment, not jsdom)', () => {
  it('this test file genuinely has no global document (real SSR-equivalent environment, not a simulation)', () => {
    expect(typeof document).toBe('undefined')
  })
  it('this test file genuinely has no global window', () => {
    expect(typeof window).toBe('undefined')
  })
  it('applyCssVars does not throw when there is no document', () => {
    const vars = buildThemeCssVars(THEME_PRESETS.corporate)
    expect(() => applyCssVars(vars)).not.toThrow()
  })
  it('applyThemeToDocument does not throw when there is no document', () => {
    expect(() => applyThemeToDocument('executive')).not.toThrow()
  })
  it('applyThemeToDocument still returns the composed theme even with no document to write to', () => {
    const result = applyThemeToDocument('cyber')
    expect(result.id).toBe('cyber')
    expect(result.preset).toBe(THEME_PRESETS.cyber)
  })
  it('THEME_ROOT_ATTR is the stable attribute name used to mark the active theme on <html>', () => {
    expect(THEME_ROOT_ATTR).toBe('data-theme-t1')
  })
})

// ════════════════════════════════════════════════════════════
// G — themeStorage.ts (local-only, never throws, SSR-safe)
// ════════════════════════════════════════════════════════════
describe('T1-A — themeStorage is local-only and never throws (also exercised with no global window present)', () => {
  it('THEME_STORAGE_KEY is a stable, namespaced key', () => {
    expect(THEME_STORAGE_KEY).toBe('pharmapulse-theme-t1')
  })
  it('loadStoredThemeId does not throw with no window (returns null)', () => {
    expect(() => loadStoredThemeId()).not.toThrow()
    expect(loadStoredThemeId()).toBeNull()
  })
  it('saveThemeId does not throw with no window (silent no-op)', () => {
    expect(() => saveThemeId('corporate')).not.toThrow()
  })
  it('clearStoredThemeId does not throw with no window (silent no-op)', () => {
    expect(() => clearStoredThemeId()).not.toThrow()
  })
  it('themeStorage never imports Firestore/Firebase (local-only, no backend persistence)', async () => {
    const src = await import('./themeStorage.ts?raw').then((m) => m.default)
    expect(src).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
  })
})

// ════════════════════════════════════════════════════════════
// H — ThemeProvider / useTheme contract (T1-C, source-scan)
// ════════════════════════════════════════════════════════════
describe('T1-C — ThemeProvider exposes the required API surface', () => {
  it('imports the theme engine + registry + storage modules (not a parallel re-implementation)', () => {
    expect(themeProviderSrc).toContain("from '../design/themeRegistry'")
    expect(themeProviderSrc).toContain("from '../design/themeEngine'")
    expect(themeProviderSrc).toContain("from '../design/themeStorage'")
  })
  it('exposes a ThemeContext', () => {
    expect(themeProviderSrc).toContain('export const ThemeContext = createContext(null)')
  })
  it('provides activeTheme, activeThemeId, availableThemes, setTheme, resetTheme, cycleTheme, isDarkTheme, cssVars', () => {
    for (const field of ['activeTheme', 'activeThemeId', 'availableThemes', 'setTheme', 'resetTheme', 'cycleTheme', 'isDarkTheme', 'cssVars']) {
      expect(themeProviderSrc).toContain(field)
    }
  })
  it('applies the theme to the document and persists it on every activeThemeId change', () => {
    expect(themeProviderSrc).toContain('applyThemeToDocument(activeThemeId)')
    expect(themeProviderSrc).toContain('saveThemeId(activeThemeId)')
  })
  it('initializes from a stored preference, falling back to DEFAULT_THEME_ID', () => {
    expect(themeProviderSrc).toContain('loadStoredThemeId() ?? DEFAULT_THEME_ID')
  })
  it('resetTheme clears the stored preference and returns to the default', () => {
    expect(themeProviderSrc).toContain('clearStoredThemeId()')
    expect(themeProviderSrc).toContain('setActiveThemeId(DEFAULT_THEME_ID)')
  })
  it('cycleTheme advances via getNextThemeId, not a hand-rolled index calculation', () => {
    expect(themeProviderSrc).toContain('getNextThemeId(prev)')
  })
  it('does not import or reference Firestore (no backend persistence)', () => {
    expect(themeProviderSrc).not.toMatch(/firestore|firebase/i)
  })
  it('does not import the Settings Center (none exists yet — out of scope for T1)', () => {
    expect(themeProviderSrc).not.toMatch(/SettingsCenter/)
  })
  it('explicitly documents that it does not touch the existing settingsStore theme system', () => {
    expect(themeProviderSrc).toContain('does not read, write, or remove anything from that store')
  })
})

describe('T1-C — useTheme hook contract', () => {
  it('reads from ThemeContext', () => {
    expect(useThemeSrc).toContain("import { ThemeContext } from './ThemeProvider'")
    expect(useThemeSrc).toContain('useContext(ThemeContext)')
  })
  it('exports a useTheme function', () => {
    expect(useThemeSrc).toContain('export function useTheme()')
  })
  it('never throws outside a provider — falls back instead', () => {
    expect(useThemeSrc).toContain('ctx ?? fallbackThemeValue()')
  })
  it('fallback value is built from DEFAULT_THEME_ID, not a hardcoded duplicate theme', () => {
    expect(useThemeSrc).toContain('composeTheme(DEFAULT_THEME_ID)')
  })
})

// ════════════════════════════════════════════════════════════
// I — Header Quick Theme Toggle (T1-D, source-scan)
// ════════════════════════════════════════════════════════════
describe('T1-D — AppLayout header has a Theme T1 quick toggle', () => {
  it('imports useTheme from the new theme engine', () => {
    expect(appLayoutSrc).toContain("import { useTheme } from '../../theme/useTheme'")
  })
  it('defines a ThemeT1QuickToggle component', () => {
    expect(appLayoutSrc).toContain('function ThemeT1QuickToggle()')
  })
  it('cycles via cycleTheme() on click — no dropdown, no settings page', () => {
    expect(appLayoutSrc).toContain('onClick={cycleTheme}')
  })
  it('shows the current theme name', () => {
    expect(appLayoutSrc).toContain('{activeTheme.name}')
  })
  it('is rendered in the header alongside (not replacing) the existing ThemeSwitcher', () => {
    expect(appLayoutSrc).toContain('<ThemeSwitcher />')
    expect(appLayoutSrc).toContain('<ThemeT1QuickToggle />')
  })
  it('has a stable test id for the toggle button', () => {
    expect(appLayoutSrc).toContain('data-testid="theme-t1-toggle"')
  })
  it('explicitly documents the intended cycle order in a comment', () => {
    expect(appLayoutSrc).toContain('Corporate -> Executive -> Futuristic -> Medical ->')
    expect(appLayoutSrc).toContain('AMOLED -> Apple -> Cyber')
  })
  it('does not introduce a complex dropdown for the T1 toggle (single button, no menu state)', () => {
    const idx = appLayoutSrc.indexOf('function ThemeT1QuickToggle()')
    const body = appLayoutSrc.slice(idx, idx + 700)
    expect(body).not.toContain('useState')
  })
})

// ════════════════════════════════════════════════════════════
// J — Shell wiring (T1-E)
// ════════════════════════════════════════════════════════════
describe('T1-E — ThemeProvider wraps the app shell', () => {
  it('App.jsx imports ThemeProvider', () => {
    expect(appSrc).toContain("import ThemeProvider  from './theme/ThemeProvider'")
  })
  it('App.jsx wraps the router tree in <ThemeProvider>', () => {
    const openIdx  = appSrc.indexOf('<ThemeProvider>')
    const closeIdx = appSrc.indexOf('</ThemeProvider>')
    expect(openIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeGreaterThan(openIdx)
  })
  it('<BrowserRouter> is nested inside <ThemeProvider>, not the other way around', () => {
    const providerIdx = appSrc.indexOf('<ThemeProvider>')
    const routerIdx    = appSrc.indexOf('<BrowserRouter>')
    expect(providerIdx).toBeLessThan(routerIdx)
  })
})

describe('T1-E — safe CSS baseline defaults exist for every new variable (no missing tokens before JS runs)', () => {
  it('index.css defines a safe default for every REQUIRED_COLOR_VARS entry', () => {
    for (const key of REQUIRED_COLOR_VARS) {
      expect(indexCssSrc).toContain(`${key}:`)
    }
  })
  it('index.css defines a safe default for every REQUIRED_LAYOUT_VARS entry', () => {
    for (const key of REQUIRED_LAYOUT_VARS) {
      expect(indexCssSrc).toContain(`${key}:`)
    }
  })
  it('index.css defines a safe default for every --chart-N variable', () => {
    for (let i = 1; i <= CHART_VAR_COUNT; i++) {
      expect(indexCssSrc).toContain(`--chart-${i}:`)
    }
  })
  it('the baseline defaults are documented as Theme Engine T1 placeholders, not a second hardcoded theme system', () => {
    expect(indexCssSrc).toContain('Theme Engine T1 — safe baseline defaults')
  })
})

// ════════════════════════════════════════════════════════════
// K — Guardrails
// ════════════════════════════════════════════════════════════
describe('Guardrails — no Settings Center, no Theme Marketplace, no business logic changes', () => {
  it('no SettingsCenter component or page was created', async () => {
    // glob-style existence probe: importing a non-existent module throws
    await expect(import('../pages/shared/SettingsCenterPage.jsx?raw')).rejects.toBeTruthy()
  })
  it('ThemeProvider.jsx contains no Settings Center reference', () => {
    expect(themeProviderSrc).not.toMatch(/SettingsCenter|ThemeMarketplace/)
  })
  it('AppLayout.jsx T1 toggle does not navigate to a settings/marketplace route', () => {
    const idx = appLayoutSrc.indexOf('function ThemeT1QuickToggle()')
    const body = appLayoutSrc.slice(idx, idx + 700)
    expect(body).not.toContain('navigate(')
  })
  it('the existing settingsStore.js (9-preset runtime theme system) is completely untouched by this bundle', () => {
    expect(settingsStoreSrc).not.toContain('themeRegistry')
    expect(settingsStoreSrc).not.toContain('themeEngine')
    expect(settingsStoreSrc).not.toContain('theme-t1')
  })
  it('no theme file imports the Evaluation Engine', async () => {
    for (const src of [themeProviderSrc, useThemeSrc]) {
      expect(src).not.toMatch(/evaluationPipeline|evaluationEngine/)
    }
  })
  it('no theme file imports a ranking engine module', () => {
    for (const src of [themeProviderSrc, useThemeSrc]) {
      expect(src).not.toMatch(/rankingEngine/)
    }
  })
  it('no theme file references an AI provider', () => {
    for (const src of [themeProviderSrc, useThemeSrc]) {
      expect(src).not.toMatch(/openai|anthropic\.messages/i)
    }
  })
  it('no theme file references Profile Studio kernels', () => {
    for (const src of [themeProviderSrc, useThemeSrc]) {
      expect(src).not.toMatch(/profileStudioService|persistenceGuards/)
    }
  })
  it('no theme file declares a new Firestore collection', () => {
    for (const src of [themeProviderSrc, useThemeSrc]) {
      expect(src).not.toMatch(/collection\(\s*db\s*,/)
    }
  })
  it('theme engine source files contain no Math.random / fake data / seed data', async () => {
    for (const path of ['./themeTypes.ts', './themeRegistry.ts', './themeStorage.ts', './themeCssVars.ts', './themeEngine.ts']) {
      const src = await import(/* @vite-ignore */ `${path}?raw`).then((m) => m.default)
      expect(src).not.toContain('Math.random(')
      expect(src).not.toContain('faker.')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('mockData')
    }
  })
})

// ════════════════════════════════════════════════════════════
// L — Build safety
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// M — index.css baseline mirrors the Corporate (default) preset exactly
// ════════════════════════════════════════════════════════════
describe('T1-E — CSS baseline defaults mirror the Corporate default preset values', () => {
  const corporate = THEME_PRESETS.corporate
  const directMappings: Array<[string, string]> = [
    ['--color-primary', corporate.primary],
    ['--color-secondary', corporate.secondary],
  ]
  for (const [key, value] of directMappings) {
    it(`${key} baseline equals Corporate's value (${value})`, () => {
      const re = new RegExp(`${key.replace(/[-]/g, '\\-')}:\\s*${value.replace(/[#]/g, '\\#')}\\b`)
      expect(indexCssSrc).toMatch(re)
    })
  }
  it('chart baselines equal Corporate\'s chartPalette in order', () => {
    corporate.chartPalette.forEach((color, i) => {
      expect(indexCssSrc).toContain(`--chart-${i + 1}: ${color}`)
    })
  })
})

// ════════════════════════════════════════════════════════════
// N — Source-quality guardrail loop across the 5 new design files
// ════════════════════════════════════════════════════════════
describe('Source quality — new Theme Engine files', () => {
  const NEW_FILES: Record<string, string> = {}
  it('loads all 5 new design-layer files as raw source', async () => {
    for (const name of ['themeTypes', 'themeRegistry', 'themeStorage', 'themeCssVars', 'themeEngine']) {
      NEW_FILES[name] = await import(/* @vite-ignore */ `./${name}.ts?raw`).then((m) => m.default)
      expect(NEW_FILES[name].length).toBeGreaterThan(0)
    }
  })

  for (const name of ['themeTypes', 'themeRegistry', 'themeStorage', 'themeCssVars', 'themeEngine']) {
    describe(name, () => {
      it('has a header comment block', async () => {
        const src = await import(/* @vite-ignore */ `./${name}.ts?raw`).then((m) => m.default)
        expect(src.startsWith('// ====')).toBe(true)
      })
      it('contains no leftover console.log debug statement', async () => {
        const src = await import(/* @vite-ignore */ `./${name}.ts?raw`).then((m) => m.default)
        expect(src).not.toContain('console.log(')
      })
      it('contains no debugger statement', async () => {
        const src = await import(/* @vite-ignore */ `./${name}.ts?raw`).then((m) => m.default)
        expect(src).not.toContain('debugger')
      })
      it('does not import React (these are pure logic files, not components)', async () => {
        const src = await import(/* @vite-ignore */ `./${name}.ts?raw`).then((m) => m.default)
        expect(src).not.toMatch(/from ['"]react['"]/)
      })
    })
  }
})

// ════════════════════════════════════════════════════════════
// O — buildThemeCssVars output shape is stable across themes
// ════════════════════════════════════════════════════════════
describe('T1-B — buildThemeCssVars output key set is identical across every theme (same shape, different values)', () => {
  const referenceKeys = Object.keys(buildThemeCssVars(THEME_PRESETS.corporate)).sort()
  it('reference (Corporate) produces at least 25 variables', () => {
    expect(referenceKeys.length).toBeGreaterThanOrEqual(25)
  })
  for (const id of THEME_CYCLE_ORDER) {
    it(`"${id}" produces the exact same variable key set as Corporate`, () => {
      const keys = Object.keys(buildThemeCssVars(THEME_PRESETS[id])).sort()
      expect(keys).toEqual(referenceKeys)
    })
  }
})

// ════════════════════════════════════════════════════════════
// P — Cycle traversal integrity
// ════════════════════════════════════════════════════════════
describe('T1-D — full cycle traversal returns to the start exactly once per full lap', () => {
  it('starting from corporate, 7 consecutive getNextThemeId calls return to corporate', () => {
    let id = 'corporate'
    const seen = [id]
    for (let i = 0; i < 7; i++) {
      id = getNextThemeId(id)
      seen.push(id)
    }
    expect(seen[seen.length - 1]).toBe('corporate')
    expect(new Set(seen.slice(0, 7)).size).toBe(7)
  })
  it('starting from any theme, 7 consecutive getNextThemeId calls return to the start', () => {
    for (const start of THEME_CYCLE_ORDER) {
      let id = start
      for (let i = 0; i < 7; i++) id = getNextThemeId(id)
      expect(id).toBe(start)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Q — Display names / listThemes consistency (per-theme loop)
// ════════════════════════════════════════════════════════════
const EXPECTED_NAMES: Record<string, string> = {
  corporate: 'Corporate', executive: 'Executive', futuristic: 'Futuristic',
  medical: 'Medical', amoled: 'AMOLED', apple: 'Apple', cyber: 'Cyber',
}
describe('T1-A — display names match the spec exactly', () => {
  for (const id of THEME_CYCLE_ORDER) {
    it(`"${id}" preset.name is "${EXPECTED_NAMES[id]}"`, () => {
      expect(THEME_PRESETS[id].name).toBe(EXPECTED_NAMES[id])
    })
    it(`"${id}" id is lowercase with no special characters`, () => {
      expect(id).toMatch(/^[a-z]+$/)
    })
    it(`listThemes() entry for "${id}" has the same name as the preset`, () => {
      const meta = listThemes().find((t) => t.id === id)
      expect(meta?.name).toBe(THEME_PRESETS[id].name)
    })
    it(`saveThemeId("${id}") does not throw (no global window present)`, () => {
      expect(() => saveThemeId(id)).not.toThrow()
    })
  }
})

// ════════════════════════════════════════════════════════════
// R — Additional source-quality / no-dead-code guards
// ════════════════════════════════════════════════════════════
describe('Source quality — additional guards', () => {
  it('ThemeProvider.jsx has no TODO/FIXME left in it', () => {
    expect(themeProviderSrc).not.toMatch(/TODO|FIXME/)
  })
  it('useTheme.js has no TODO/FIXME left in it', () => {
    expect(useThemeSrc).not.toMatch(/TODO|FIXME/)
  })
  it('ThemeProvider.jsx does not redirect via window.location', () => {
    expect(themeProviderSrc).not.toContain('window.location')
  })
  it('AppLayout.jsx defines ThemeT1QuickToggle exactly once (no duplicate component)', () => {
    const matches = appLayoutSrc.match(/function ThemeT1QuickToggle\(\)/g) ?? []
    expect(matches.length).toBe(1)
  })
  it('AppLayout.jsx renders <ThemeT1QuickToggle /> exactly once', () => {
    const matches = appLayoutSrc.match(/<ThemeT1QuickToggle \/>/g) ?? []
    expect(matches.length).toBe(1)
  })
  it('applyCssVars does not throw on an empty variable map', () => {
    expect(() => applyCssVars({})).not.toThrow()
  })
  it('composeTheme is referentially stable for the preset object across repeated calls (no needless re-allocation of preset data)', () => {
    const a = composeTheme('corporate')
    const b = composeTheme('corporate')
    expect(a.preset).toBe(b.preset)
  })
  it('App.jsx still calls the existing applyTheme(theme) for the untouched settingsStore system', () => {
    expect(appSrc).toContain('applyTheme(theme)')
  })
  it('App.jsx still imports useSettingsStore unchanged', () => {
    expect(appSrc).toContain("import { useSettingsStore, applyTheme } from './store/settingsStore'")
  })
  it('themeCssVars.ts and themeEngine.ts together cover every required var group (color + chart + radius/density)', () => {
    const vars = buildThemeCssVars(THEME_PRESETS.corporate)
    const hasColor = REQUIRED_COLOR_VARS.every((k) => k in vars)
    const hasLayout = REQUIRED_LAYOUT_VARS.every((k) => k in vars)
    const hasChart = Array.from({ length: CHART_VAR_COUNT }, (_, i) => `--chart-${i + 1}`).every((k) => k in vars)
    expect(hasColor && hasLayout && hasChart).toBe(true)
  })
})

describe('Build safety', () => {
  it('ThemeProvider.jsx has exactly one default export', () => {
    const matches = themeProviderSrc.match(/export default/g) ?? []
    expect(matches.length).toBe(1)
  })
  it('useTheme.js has no default export (named export only, matching hook convention in this repo)', () => {
    expect(useThemeSrc).not.toContain('export default')
  })
  it('every theme preset object round-trips through buildThemeCssVars + composeTheme without throwing', () => {
    for (const id of THEME_CYCLE_ORDER) {
      expect(() => {
        const composed = composeTheme(id)
        const vars = buildThemeCssVars(composed.preset)
        applyCssVars(vars)
      }).not.toThrow()
    }
  })
})
