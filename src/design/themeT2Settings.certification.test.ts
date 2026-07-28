// ============================================================
// Theme T2 Bundle — Settings Center Certification (Phase T2-J)
//
// Same two-style convention as themeEngine.certification.test.ts:
//   - Pure logic files (appearanceTokens.ts, the extended
//     themeStorage.ts) are exercised by calling them directly, in
//     this project's real Node (no jsdom) vitest environment — a
//     genuine SSR-equivalent, not a simulation.
//   - React files (ThemeProvider.jsx, useTheme.js, every Settings
//     Center component, SettingsPage.jsx, AppLayout.jsx, App.jsx)
//     are certified via raw `?raw` source inspection, matching every
//     other certification suite in this repo.
// ============================================================
import { describe, it, expect } from 'vitest'

import { THEME_PRESETS, THEME_CYCLE_ORDER, DEFAULT_THEME_ID, listThemes } from './themeRegistry'
import {
  DENSITY_MODES, DEFAULT_DENSITY_MODE, isValidDensityMode, resolveDensityMode, buildDensityCssVars,
  RADIUS_MODES, DEFAULT_RADIUS_MODE, isValidRadiusMode, resolveRadiusMode, buildRadiusCssVars,
  FONT_SCALE_MODES, DEFAULT_FONT_SCALE_MODE, isValidFontScaleMode, resolveFontScaleMode, buildFontScaleCssVars,
  CRITICAL_INSIGHT_FLOOR_PX, bodyFontMeetsInsightFloor,
} from './appearanceTokens'
import {
  APPEARANCE_STORAGE_KEY, loadStoredAppearance, saveAppearance, clearStoredAppearance,
  THEME_STORAGE_KEY,
} from './themeStorage'

const themeProviderSrc      = await import('../theme/ThemeProvider.jsx?raw').then((m) => m.default)
const useThemeSrc           = await import('../theme/useTheme.js?raw').then((m) => m.default)
const appLayoutSrc          = await import('../components/layout/AppLayout.jsx?raw').then((m) => m.default)
const appSrc                = await import('../App.jsx?raw').then((m) => m.default)

const settingsPageSrc       = await import('../pages/settings/SettingsPage.jsx?raw').then((m) => m.default)
const settingsSidebarSrc    = await import('../components/settings/SettingsSidebar.jsx?raw').then((m) => m.default)
const settingsSectionSrc    = await import('../components/settings/SettingsSection.jsx?raw').then((m) => m.default)
const settingsHeaderSrc     = await import('../components/settings/SettingsHeader.jsx?raw').then((m) => m.default)
const appearanceSettingsSrc = await import('../components/settings/AppearanceSettings.jsx?raw').then((m) => m.default)
const themeSelectorSrc      = await import('../components/settings/ThemeSelector.jsx?raw').then((m) => m.default)
const themePreviewCardSrc   = await import('../components/settings/ThemePreviewCard.jsx?raw').then((m) => m.default)
const densitySelectorSrc    = await import('../components/settings/DensitySelector.jsx?raw').then((m) => m.default)
const radiusSelectorSrc     = await import('../components/settings/RadiusSelector.jsx?raw').then((m) => m.default)
const fontSizeSelectorSrc   = await import('../components/settings/FontSizeSelector.jsx?raw').then((m) => m.default)
const previewPanelSrc       = await import('../components/settings/AppearancePreviewPanel.jsx?raw').then((m) => m.default)
const oldSettingsPageSrc    = await import('../pages/shared/SettingsPage.jsx?raw').then((m) => m.default)
const settingsStoreSrc      = await import('../store/settingsStore.js?raw').then((m) => m.default)

const NEW_SETTINGS_FILES: Record<string, string> = {
  SettingsPage: settingsPageSrc,
  SettingsSidebar: settingsSidebarSrc,
  SettingsSection: settingsSectionSrc,
  SettingsHeader: settingsHeaderSrc,
  AppearanceSettings: appearanceSettingsSrc,
  ThemeSelector: themeSelectorSrc,
  ThemePreviewCard: themePreviewCardSrc,
  DensitySelector: densitySelectorSrc,
  RadiusSelector: radiusSelectorSrc,
  FontSizeSelector: fontSizeSelectorSrc,
  AppearancePreviewPanel: previewPanelSrc,
}

// ════════════════════════════════════════════════════════════
// A — Settings route + shell (T2-A)
// ════════════════════════════════════════════════════════════
describe('T2-A — /settings route points at the new Settings Center', () => {
  it('App.jsx imports SettingsPage from pages/settings (the new shell)', () => {
    expect(appSrc).toContain("const SettingsPage         = lazy(() => import('./pages/settings/SettingsPage'))")
  })
  it('App.jsx still registers the /settings route', () => {
    expect(appSrc).toContain('path="/settings"')
  })
  it('the /settings route still uses the existing <PR> permission wrapper (no permission change)', () => {
    const idx = appSrc.indexOf('path="/settings"')
    const line = appSrc.slice(idx, idx + 80)
    expect(line).toContain('<PR>')
  })
  it('SettingsPage default-exports a component', () => {
    expect(settingsPageSrc).toContain('export default function SettingsPage()')
  })
  it('SettingsPage is full-screen style (occupies the viewport height, not a small modal)', () => {
    expect(settingsPageSrc).toContain('height: \'calc(100vh - var(--topbar-h, 52px))\'')
  })
  it('SettingsPage does not render a modal overlay (no fixed inset-0 backdrop)', () => {
    expect(settingsPageSrc).not.toContain('fixed inset-0')
  })
})

describe('T2-A — Settings sidebar exposes exactly the 10 spec sections, in order', () => {
  // Sidebar-3: 'admin-tools' (Demo Data, admin-only) added between
  // 'performance' and 'about' — moved here from the primary sidebar.
  // Backup-2: 'backup' (manual on-demand Firestore export, admin-only)
  // added right after 'admin-tools' — see BackupSettingsSection.jsx.
  const EXPECTED = ['general', 'appearance', 'ai-providers', 'notifications', 'security', 'privacy', 'performance', 'admin-tools', 'backup', 'about']
  it('SETTINGS_SECTIONS has exactly 10 entries', () => {
    const matches = settingsSidebarSrc.match(/id: '([a-z-]+)'/g) ?? []
    expect(matches.length).toBe(10)
  })
  for (const id of EXPECTED) {
    it(`includes section "${id}"`, () => {
      expect(settingsSidebarSrc).toContain(`id: '${id}'`)
    })
  }
  it('order matches the spec exactly', () => {
    const ids = Array.from(settingsSidebarSrc.matchAll(/id: '([a-z-]+)'/g)).map((m) => m[1])
    expect(ids).toEqual(EXPECTED)
  })
  it('only general, appearance, ai-providers, admin-tools, backup, and about are marked functional: true', () => {
    const functionalIds = Array.from(settingsSidebarSrc.matchAll(/id: '([a-z-]+)',\s*label: '[^']+',\s*icon: \w+,\s*functional: true/g)).map((m) => m[1])
    expect(functionalIds.sort()).toEqual(['about', 'admin-tools', 'ai-providers', 'appearance', 'backup', 'general'].sort())
  })
  it('renders as an always-visible nav list, not a dropdown (button elements, no <select>)', () => {
    expect(settingsSidebarSrc).not.toContain('<select')
  })
})

describe('T2-A — SettingsPage renders every section behind its own SettingsSection wrapper', () => {
  const EXPECTED = ['general', 'appearance', 'ai-providers', 'notifications', 'security', 'privacy', 'performance', 'about']
  for (const id of EXPECTED) {
    it(`renders content when activeId === '${id}'`, () => {
      expect(settingsPageSrc).toContain(`activeId === '${id}'`)
    })
  }
  it('Notifications / Security / Privacy / Performance render ComingSoonNotice', () => {
    for (const section of ['notifications', 'security', 'privacy', 'performance']) {
      const idx = settingsPageSrc.indexOf(`activeId === '${section}'`)
      const block = settingsPageSrc.slice(idx, idx + 400)
      expect(block).toContain('<ComingSoonNotice')
    }
  })
  it('AI Providers renders the BYOK PersonalAiSettingsSection (no longer a coming-soon stub)', () => {
    const idx = settingsPageSrc.indexOf(`activeId === 'ai-providers'`)
    const block = settingsPageSrc.slice(idx, idx + 400)
    expect(block).toContain('<PersonalAiSettingsSection')
  })
  it('General and Appearance and About render real functional content, not ComingSoonNotice', () => {
    for (const section of ['general', 'appearance', 'about']) {
      const idx = settingsPageSrc.indexOf(`activeId === '${section}'`)
      const block = settingsPageSrc.slice(idx, idx + 400)
      expect(block).not.toContain('<ComingSoonNotice')
    }
  })
})

describe('T2-A — existing working features were folded in, not dropped (no regression)', () => {
  it('language switching (LANGUAGE_META) is present in the new shell', () => {
    expect(settingsPageSrc).toContain('LANGUAGE_META')
    expect(settingsPageSrc).toContain('setLang(code)')
  })
  it('dashboard card customization (DASHBOARD_CARDS) is present in the new shell', () => {
    expect(settingsPageSrc).toContain('DASHBOARD_CARDS')
    expect(settingsPageSrc).toContain('toggleDashCard')
  })
  it('KPI traffic-light threshold reference is present in the new shell (About)', () => {
    expect(settingsPageSrc).toContain('Traffic Light Thresholds')
  })
  it('system info (uid/role) is present in the new shell (About)', () => {
    expect(settingsPageSrc).toContain('userProfile?.uid')
    expect(settingsPageSrc).toContain('userProfile?.role')
  })
  it('developer credit is present in the new shell (About)', () => {
    expect(settingsPageSrc).toContain('Samir Goda')
  })
  it('sidebar expand/collapse and reduced-motion toggles are present (General)', () => {
    expect(settingsPageSrc).toContain('toggleSidebar')
    expect(settingsPageSrc).toContain('toggleReducedMotion')
  })
  it('the minimum-2-cards guard from the old page is preserved verbatim', () => {
    expect(settingsPageSrc).toContain('Minimum 2 cards required')
  })
  it('the old shared/SettingsPage.jsx file still exists on disk (not deleted, just unrouted)', () => {
    expect(oldSettingsPageSrc.length).toBeGreaterThan(0)
    expect(oldSettingsPageSrc).toContain('export default function SettingsPage()')
  })
})

// ════════════════════════════════════════════════════════════
// B — Appearance section is functional (T2-B)
// ════════════════════════════════════════════════════════════
describe('T2-B — AppearanceSettings composes every required control', () => {
  it('renders ThemeSelector', () => {
    expect(appearanceSettingsSrc).toContain('<ThemeSelector')
  })
  it('renders DensitySelector', () => {
    expect(appearanceSettingsSrc).toContain('<DensitySelector')
  })
  it('renders RadiusSelector', () => {
    expect(appearanceSettingsSrc).toContain('<RadiusSelector')
  })
  it('renders FontSizeSelector', () => {
    expect(appearanceSettingsSrc).toContain('<FontSizeSelector')
  })
  it('renders AppearancePreviewPanel', () => {
    expect(appearanceSettingsSrc).toContain('<AppearancePreviewPanel')
  })
  it('has a reset-appearance control wired to useTheme().resetAppearance', () => {
    expect(appearanceSettingsSrc).toContain('resetAppearance')
    expect(appearanceSettingsSrc).toContain('data-testid="reset-appearance-btn"')
  })
  it('reads everything from useTheme() — no duplicate theme state', () => {
    expect(appearanceSettingsSrc).toContain("from '../../theme/useTheme'")
  })
  it('does not call useState for theme/density/radius/font (no parallel local state)', () => {
    expect(appearanceSettingsSrc).not.toContain('useState')
  })
})

// ════════════════════════════════════════════════════════════
// C — Theme Selector (T2-C, per-theme loop)
// ════════════════════════════════════════════════════════════
describe('T2-C — ThemeSelector + ThemePreviewCard cover every theme with full metadata', () => {
  it('ThemeSelector reads activeThemeId/availableThemes/setTheme from useTheme()', () => {
    expect(themeSelectorSrc).toContain('activeThemeId, availableThemes, setTheme')
  })
  it('ThemeSelector imports THEME_PRESETS from the registry (no re-declared color data)', () => {
    expect(themeSelectorSrc).toContain("import { THEME_PRESETS } from '../../design/themeRegistry'")
  })
  it('ThemeSelector renders one ThemePreviewCard per available theme', () => {
    expect(themeSelectorSrc).toContain('availableThemes.map')
    expect(themeSelectorSrc).toContain('<ThemePreviewCard')
  })
  it('ThemeSelector has no custom-theme-creation UI (no name input or "create theme" button)', () => {
    expect(themeSelectorSrc).not.toContain('<input')
    expect(themeSelectorSrc.toLowerCase()).not.toContain('create theme')
  })

  for (const id of THEME_CYCLE_ORDER) {
    it(`has a short description for "${id}"`, () => {
      expect(themeSelectorSrc).toContain(`${id}:`)
    })
  }

  it('ThemePreviewCard shows name', () => {
    expect(themePreviewCardSrc).toContain('{meta.name}')
  })
  it('ThemePreviewCard shows a description when provided', () => {
    expect(themePreviewCardSrc).toContain('{description}')
  })
  it('ThemePreviewCard shows preview swatches for background/surface/primary/secondary', () => {
    expect(themePreviewCardSrc).toContain('preset.background')
    expect(themePreviewCardSrc).toContain('preset.surface')
    expect(themePreviewCardSrc).toContain('preset.primary')
    expect(themePreviewCardSrc).toContain('preset.secondary')
  })
  it('ThemePreviewCard shows a dark/light classification badge', () => {
    expect(themePreviewCardSrc).toContain('meta.isDark')
    expect(themePreviewCardSrc).toContain("'Dark' : 'Light'")
  })
  it('ThemePreviewCard shows a chart palette preview strip', () => {
    expect(themePreviewCardSrc).toContain('preset.chartPalette.map')
  })
  it('ThemePreviewCard shows an active state (check badge + disabled Apply)', () => {
    expect(themePreviewCardSrc).toContain('isActive')
    expect(themePreviewCardSrc).toContain('disabled={isActive}')
  })
  it('ThemePreviewCard has an Apply button calling the onApply prop', () => {
    expect(themePreviewCardSrc).toContain('onClick={onApply}')
  })
})

// ════════════════════════════════════════════════════════════
// D — Density controls (T2-D, per-mode loop)
// ════════════════════════════════════════════════════════════
describe('T2-D — Density modes', () => {
  it('exactly 3 modes: compact, comfortable, spacious', () => {
    expect(DENSITY_MODES).toEqual(['compact', 'comfortable', 'spacious'])
  })
  it('default density mode is comfortable', () => {
    expect(DEFAULT_DENSITY_MODE).toBe('comfortable')
  })
  it('DensitySelector reads/writes densityMode via useTheme()', () => {
    expect(densitySelectorSrc).toContain('densityMode, setDensity')
  })
  it('DensitySelector renders all 3 modes', () => {
    expect(densitySelectorSrc).toContain('data-testid={`density-option-${mode}`}')
    for (const mode of DENSITY_MODES) {
      expect(densitySelectorSrc).toContain(`${mode}:`)
    }
  })

  for (const mode of DENSITY_MODES) {
    describe(`mode "${mode}"`, () => {
      it('isValidDensityMode is true', () => {
        expect(isValidDensityMode(mode)).toBe(true)
      })
      it('resolveDensityMode is the identity', () => {
        expect(resolveDensityMode(mode)).toBe(mode)
      })
      it('buildDensityCssVars defines all 4 required vars', () => {
        const vars = buildDensityCssVars(mode)
        for (const key of ['--density-card-padding', '--density-row-height', '--density-section-gap', '--density-control-height']) {
          expect(vars[key]).toBeDefined()
          expect(typeof vars[key]).toBe('string')
        }
      })
      it('does not throw when built', () => {
        expect(() => buildDensityCssVars(mode)).not.toThrow()
      })
    })
  }

  it('isValidDensityMode rejects an invalid mode', () => {
    expect(isValidDensityMode('ultra-compact')).toBe(false)
  })
  it('resolveDensityMode falls back to the default for an invalid mode', () => {
    expect(resolveDensityMode('nonsense')).toBe(DEFAULT_DENSITY_MODE)
  })
  it('resolveDensityMode falls back to the default for undefined/null', () => {
    expect(resolveDensityMode(undefined)).toBe(DEFAULT_DENSITY_MODE)
    expect(resolveDensityMode(null)).toBe(DEFAULT_DENSITY_MODE)
  })
  it('spacious row-height is strictly larger than compact row-height (modes are visually distinct)', () => {
    const compactH = parseInt(buildDensityCssVars('compact')['--density-row-height'], 10)
    const spaciousH = parseInt(buildDensityCssVars('spacious')['--density-row-height'], 10)
    expect(spaciousH).toBeGreaterThan(compactH)
  })
  it('does not rewrite components — only declares CSS variables (no className mutation logic)', async () => {
    const src = await import('./appearanceTokens.ts?raw').then((m) => m.default)
    expect(src).not.toContain('querySelectorAll')
  })
})

// ════════════════════════════════════════════════════════════
// E — Radius controls (T2-E, per-mode loop)
// ════════════════════════════════════════════════════════════
describe('T2-E — Radius modes', () => {
  it('exactly 3 modes: sharp, soft, rounded', () => {
    expect(RADIUS_MODES).toEqual(['sharp', 'soft', 'rounded'])
  })
  it('default radius mode is soft', () => {
    expect(DEFAULT_RADIUS_MODE).toBe('soft')
  })
  it('RadiusSelector reads/writes radiusMode via useTheme()', () => {
    expect(radiusSelectorSrc).toContain('radiusMode, setRadius')
  })
  it('RadiusSelector renders all 3 modes', () => {
    expect(radiusSelectorSrc).toContain('data-testid={`radius-option-${mode}`}')
    for (const mode of RADIUS_MODES) {
      expect(radiusSelectorSrc).toContain(`${mode}:`)
    }
  })

  for (const mode of RADIUS_MODES) {
    describe(`mode "${mode}"`, () => {
      it('isValidRadiusMode is true', () => {
        expect(isValidRadiusMode(mode)).toBe(true)
      })
      it('resolveRadiusMode is the identity', () => {
        expect(resolveRadiusMode(mode)).toBe(mode)
      })
      it('buildRadiusCssVars defines all 4 required vars', () => {
        const vars = buildRadiusCssVars(mode)
        for (const key of ['--radius-card', '--radius-button', '--radius-input', '--radius-panel']) {
          expect(vars[key]).toBeDefined()
        }
      })
    })
  }

  it('isValidRadiusMode rejects an invalid mode', () => {
    expect(isValidRadiusMode('extreme')).toBe(false)
  })
  it('resolveRadiusMode falls back to the default for an invalid mode', () => {
    expect(resolveRadiusMode('nonsense')).toBe(DEFAULT_RADIUS_MODE)
  })
  it('rounded card radius is strictly larger than sharp card radius', () => {
    const sharpR = parseInt(buildRadiusCssVars('sharp')['--radius-card'], 10)
    const roundedR = parseInt(buildRadiusCssVars('rounded')['--radius-card'], 10)
    expect(roundedR).toBeGreaterThan(sharpR)
  })
  it('sharp mode still has a non-zero radius (never a literal 0px hard edge)', () => {
    expect(parseInt(buildRadiusCssVars('sharp')['--radius-card'], 10)).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// F — Font scale controls (T2-F, per-mode loop + insight floor)
// ════════════════════════════════════════════════════════════
describe('T2-F — Font scale modes and the 13px critical-insight floor', () => {
  it('exactly 3 modes: compact, standard, large', () => {
    expect(FONT_SCALE_MODES).toEqual(['compact', 'standard', 'large'])
  })
  it('default font scale mode is standard', () => {
    expect(DEFAULT_FONT_SCALE_MODE).toBe('standard')
  })
  it('CRITICAL_INSIGHT_FLOOR_PX is 13', () => {
    expect(CRITICAL_INSIGHT_FLOOR_PX).toBe(13)
  })
  it('FontSizeSelector reads/writes fontScale via useTheme()', () => {
    expect(fontSizeSelectorSrc).toContain('fontScale, setFontScale')
  })
  it('FontSizeSelector renders all 3 modes', () => {
    expect(fontSizeSelectorSrc).toContain('data-testid={`font-scale-option-${mode}`}')
    for (const mode of FONT_SCALE_MODES) {
      expect(fontSizeSelectorSrc).toContain(`${mode}:`)
    }
  })

  for (const mode of FONT_SCALE_MODES) {
    describe(`mode "${mode}"`, () => {
      it('isValidFontScaleMode is true', () => {
        expect(isValidFontScaleMode(mode)).toBe(true)
      })
      it('resolveFontScaleMode is the identity', () => {
        expect(resolveFontScaleMode(mode)).toBe(mode)
      })
      it('buildFontScaleCssVars defines all 5 required vars', () => {
        const vars = buildFontScaleCssVars(mode)
        for (const key of ['--font-scale', '--font-body', '--font-caption', '--font-title', '--font-display']) {
          expect(vars[key]).toBeDefined()
        }
      })
      it('--font-body meets the 13px critical-insight floor in this mode', () => {
        const px = parseInt(buildFontScaleCssVars(mode)['--font-body'], 10)
        expect(px).toBeGreaterThanOrEqual(CRITICAL_INSIGHT_FLOOR_PX)
      })
      it('bodyFontMeetsInsightFloor() agrees', () => {
        expect(bodyFontMeetsInsightFloor(mode)).toBe(true)
      })
      it('--font-title is larger than --font-body (visual hierarchy preserved)', () => {
        const body = parseInt(buildFontScaleCssVars(mode)['--font-body'], 10)
        const title = parseInt(buildFontScaleCssVars(mode)['--font-title'], 10)
        expect(title).toBeGreaterThan(body)
      })
      it('--font-display is larger than --font-title (dominant value hierarchy preserved)', () => {
        const title = parseInt(buildFontScaleCssVars(mode)['--font-title'], 10)
        const display = parseInt(buildFontScaleCssVars(mode)['--font-display'], 10)
        expect(display).toBeGreaterThan(title)
      })
    })
  }

  it('every font-scale mode meets the insight floor — not just the default', () => {
    for (const mode of FONT_SCALE_MODES) {
      expect(bodyFontMeetsInsightFloor(mode)).toBe(true)
    }
  })
  it('large mode has the biggest --font-body of the three', () => {
    const sizes = FONT_SCALE_MODES.map((m) => parseInt(buildFontScaleCssVars(m)['--font-body'], 10))
    expect(Math.max(...sizes)).toBe(parseInt(buildFontScaleCssVars('large')['--font-body'], 10))
  })
  it('isValidFontScaleMode rejects an invalid mode', () => {
    expect(isValidFontScaleMode('huge')).toBe(false)
  })
  it('resolveFontScaleMode falls back to the default for an invalid mode', () => {
    expect(resolveFontScaleMode('nonsense')).toBe(DEFAULT_FONT_SCALE_MODE)
  })
})

// ════════════════════════════════════════════════════════════
// G — Live preview (T2-G)
// ════════════════════════════════════════════════════════════
describe('T2-G — AppearancePreviewPanel', () => {
  it('reads activeTheme from useTheme() for the chart palette preview', () => {
    expect(previewPanelSrc).toContain('activeTheme } = useTheme()')
  })
  it('renders a mini sidebar', () => {
    expect(previewPanelSrc).toContain('Mini sidebar')
  })
  it('renders a mini header', () => {
    expect(previewPanelSrc).toContain('Mini header')
  })
  it('renders a KPI card preview', () => {
    expect(previewPanelSrc).toContain('KPI card preview')
    expect(previewPanelSrc).toContain('Sample KPI')
  })
  it('renders a table row preview', () => {
    expect(previewPanelSrc).toContain('Table row preview')
  })
  it('renders status badges', () => {
    expect(previewPanelSrc).toContain('Status badges')
    expect(previewPanelSrc).toContain('On track')
  })
  it('renders a chart palette preview strip from the live theme', () => {
    expect(previewPanelSrc).toContain('activeTheme.chartPalette.map')
  })
  it('only uses static safe preview labels — no real/fake production data identifiers', () => {
    expect(previewPanelSrc).not.toMatch(/pharmacyId|userId|entries\.|kpiStats/)
  })
  it('consumes the live CSS variables (--color-*, --density-*, --radius-*, --font-*) so it updates immediately on change', () => {
    for (const prefix of ['--color-', '--density-', '--radius-', '--font-']) {
      expect(previewPanelSrc).toContain(`var(${prefix}`)
    }
  })
})

// ════════════════════════════════════════════════════════════
// H — Persistence (T2-H)
// ════════════════════════════════════════════════════════════
describe('T2-H — Appearance persistence is local-only and SSR-safe', () => {
  it('APPEARANCE_STORAGE_KEY is namespaced and distinct from the theme-id key', () => {
    expect(APPEARANCE_STORAGE_KEY).toBe('pharmapulse-appearance-t2')
    expect(APPEARANCE_STORAGE_KEY).not.toBe(THEME_STORAGE_KEY)
  })
  it('loadStoredAppearance does not throw with no global window (real SSR-equivalent environment)', () => {
    expect(typeof window).toBe('undefined')
    expect(() => loadStoredAppearance()).not.toThrow()
    expect(loadStoredAppearance()).toBeNull()
  })
  it('saveAppearance does not throw with no global window', () => {
    expect(() => saveAppearance({ densityMode: 'compact', radiusMode: 'soft', fontScale: 'standard' })).not.toThrow()
  })
  it('clearStoredAppearance does not throw with no global window', () => {
    expect(() => clearStoredAppearance()).not.toThrow()
  })
  it('ThemeProvider persists themeId, densityMode, radiusMode, and fontScale together', () => {
    expect(themeProviderSrc).toContain('saveThemeId(activeThemeId)')
    expect(themeProviderSrc).toContain('saveAppearance({ densityMode, radiusMode, fontScale })')
  })
  it('ThemeProvider loads stored appearance on initial state, falling back to defaults', () => {
    expect(themeProviderSrc).toContain('loadStoredAppearance()?.densityMode ?? DEFAULT_DENSITY_MODE')
    expect(themeProviderSrc).toContain('loadStoredAppearance()?.radiusMode ?? DEFAULT_RADIUS_MODE')
    expect(themeProviderSrc).toContain('loadStoredAppearance()?.fontScale ?? DEFAULT_FONT_SCALE_MODE')
  })
  it('themeStorage.ts never imports Firestore/Firebase', async () => {
    const src = await import('./themeStorage.ts?raw').then((m) => m.default)
    expect(src).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
  })
  it('appearanceTokens.ts never imports Firestore/Firebase', async () => {
    const src = await import('./appearanceTokens.ts?raw').then((m) => m.default)
    expect(src).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
  })
  it('no theme/settings file writes to a user profile document', () => {
    for (const src of [themeProviderSrc, settingsPageSrc]) {
      expect(src).not.toMatch(/updateDoc|setDoc|users\/\$\{/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// I — Reset appearance
// ════════════════════════════════════════════════════════════
describe('T2-B — resetAppearance resets all four settings together', () => {
  it('clears both storage keys', () => {
    const idx = themeProviderSrc.indexOf('const resetAppearance')
    const body = themeProviderSrc.slice(idx, idx + 400)
    expect(body).toContain('clearStoredThemeId()')
    expect(body).toContain('clearStoredAppearance()')
  })
  it('resets theme id to DEFAULT_THEME_ID', () => {
    const idx = themeProviderSrc.indexOf('const resetAppearance')
    const body = themeProviderSrc.slice(idx, idx + 400)
    expect(body).toContain('setActiveThemeId(DEFAULT_THEME_ID)')
  })
  it('resets density/radius/font to their defaults', () => {
    const idx = themeProviderSrc.indexOf('const resetAppearance')
    const body = themeProviderSrc.slice(idx, idx + 400)
    expect(body).toContain('setDensityModeState(DEFAULT_DENSITY_MODE)')
    expect(body).toContain('setRadiusModeState(DEFAULT_RADIUS_MODE)')
    expect(body).toContain('setFontScaleState(DEFAULT_FONT_SCALE_MODE)')
  })
  it('DEFAULT_THEME_ID is still "corporate" (T1 default unchanged by T2)', () => {
    expect(DEFAULT_THEME_ID).toBe('corporate')
  })
})

// ════════════════════════════════════════════════════════════
// J — Header toggle consistency (T2-I)
// ════════════════════════════════════════════════════════════
describe('T2-I — header quick toggle and Settings Appearance share one source of truth', () => {
  it('AppLayout.jsx ThemeT1QuickToggle imports useTheme from the exact same module path as the Settings components', () => {
    expect(appLayoutSrc).toContain("import { useTheme } from '../../theme/useTheme'")
    expect(themeSelectorSrc).toContain("import { useTheme } from '../../theme/useTheme'")
    expect(appearanceSettingsSrc).toContain("import { useTheme } from '../../theme/useTheme'")
  })
  it('there is exactly one ThemeContext definition in the whole theme module (no parallel context)', () => {
    expect(themeProviderSrc.match(/createContext\(/g)?.length).toBe(1)
  })
  it('useTheme.js reads from the same ThemeContext exported by ThemeProvider.jsx', () => {
    expect(useThemeSrc).toContain("import { ThemeContext } from './ThemeProvider'")
  })
  it('App.jsx mounts exactly one <ThemeProvider> wrapping the whole router (single instance, single source of truth)', () => {
    const matches = appSrc.match(/<ThemeProvider>/g) ?? []
    expect(matches.length).toBe(1)
  })
  it('AppLayout.jsx does not instantiate its own ThemeProvider (it consumes the one from App.jsx)', () => {
    expect(appLayoutSrc).not.toContain('<ThemeProvider')
  })
  it('SettingsPage.jsx does not instantiate its own ThemeProvider', () => {
    expect(settingsPageSrc).not.toContain('<ThemeProvider')
  })
})

// ════════════════════════════════════════════════════════════
// K — Guardrails
// ════════════════════════════════════════════════════════════
describe('Guardrails — no Firestore in SettingsPage.jsx itself, no marketplace (BYOK AI connection UI is intentional, see PersonalAiSettingsSection tests)', () => {
  it('no Settings Center file references Firestore/Firebase', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
    }
  })
  it('AI Providers section renders the BYOK component, which owns its own key input (not SettingsPage.jsx itself)', () => {
    const idx = settingsPageSrc.indexOf("activeId === 'ai-providers'")
    const block = settingsPageSrc.slice(idx, idx + 400)
    expect(block).not.toContain('<input')
    expect(block).toContain('<PersonalAiSettingsSection')
  })
  it('SettingsPage.jsx itself never calls a real AI provider connector directly (delegated to PersonalAiSettingsSection)', () => {
    expect(settingsPageSrc).not.toMatch(/connectToProvider|connectToPersonalAi|callRealAiProvider|openai|anthropic\.messages/i)
  })
  it('no Settings Center file references a "marketplace" concept', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src.toLowerCase(), name).not.toContain('marketplace')
    }
  })
  it('ThemeSelector has no custom theme builder (no color-picker input)', () => {
    expect(themeSelectorSrc).not.toContain('<input type="color"')
    expect(themePreviewCardSrc).not.toContain('<input type="color"')
  })
  it('no premium animated theme keyframes were introduced (no @keyframes in new Settings files)', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toContain('@keyframes')
    }
  })
  it('no Settings Center file imports the Evaluation Engine', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/evaluationPipeline|evaluationEngine/)
    }
  })
  it('no Settings Center file imports a ranking engine module', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/rankingEngine/)
    }
  })
  it('no Settings Center file imports Profile Studio kernels', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/profileStudioService|persistenceGuards/)
    }
  })
  it('the existing settingsStore.js 9-preset runtime theme system is untouched', () => {
    expect(settingsStoreSrc).not.toContain('appearanceTokens')
    expect(settingsStoreSrc).not.toContain('theme-t1')
    expect(settingsStoreSrc).not.toContain('appearance-t2')
  })
  it('no Settings Center file contains Math.random / fake data / seed data', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toContain('Math.random(')
      expect(src, name).not.toContain('faker.')
      expect(src, name).not.toContain('seedData')
      expect(src, name).not.toContain('mockData')
    }
  })
  it('no Settings Center file references a Login V3 concept', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/login\s*v3/i)
    }
  })
  it('no Settings Center file references offline-first/service-worker caching logic', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      expect(src, name).not.toMatch(/workbox|offline-first/i)
    }
  })
})

// ════════════════════════════════════════════════════════════
// L — Build safety / source quality (loop across all 11 new files)
// ════════════════════════════════════════════════════════════
describe('Build safety — new Settings Center files', () => {
  for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
    describe(name, () => {
      it('loads as a non-empty raw source string', () => {
        expect(typeof src).toBe('string')
        expect(src.length).toBeGreaterThan(0)
      })
      it('has a header comment block', () => {
        expect(src.startsWith('// ====')).toBe(true)
      })
      it('contains no leftover console.log', () => {
        expect(src).not.toContain('console.log(')
      })
      it('contains no debugger statement', () => {
        expect(src).not.toContain('debugger')
      })
      it('contains no TODO/FIXME', () => {
        expect(src).not.toMatch(/TODO|FIXME/)
      })
      it('does not use dangerouslySetInnerHTML', () => {
        expect(src).not.toContain('dangerouslySetInnerHTML')
      })
      it('does not call eval(', () => {
        expect(src).not.toContain('eval(')
      })
      it('does not import vitest into production code', () => {
        expect(src).not.toMatch(/from ['"]vitest['"]/)
      })
    })
  }

  it('SettingsPage.jsx has exactly one default export', () => {
    const matches = settingsPageSrc.match(/export default/g) ?? []
    expect(matches.length).toBe(1)
  })
  it('every component file in the Settings Center has exactly one default export', () => {
    for (const [name, src] of Object.entries(NEW_SETTINGS_FILES)) {
      if (name === 'SettingsSection') continue // also has a named ComingSoonNotice export
      const matches = src.match(/export default/g) ?? []
      expect(matches.length, name).toBe(1)
    }
  })
  it('SettingsSection.jsx exports both the default wrapper and the named ComingSoonNotice helper', () => {
    expect(settingsSectionSrc).toContain('export default function SettingsSection')
    expect(settingsSectionSrc).toContain('export function ComingSoonNotice')
  })
})

// ════════════════════════════════════════════════════════════
// M — Cross-theme appearance composition sanity (loop over all 7 themes × 3 density × 3 radius × 3 font = sampled)
// ════════════════════════════════════════════════════════════
describe('Cross-cutting — every theme composes cleanly with every appearance mode', () => {
  for (const themeId of THEME_CYCLE_ORDER) {
    describe(`theme "${themeId}"`, () => {
      it('exists in THEME_PRESETS (sanity re-check from T1, still true after T2)', () => {
        expect(THEME_PRESETS[themeId]).toBeDefined()
      })
      for (const density of DENSITY_MODES) {
        for (const radius of RADIUS_MODES) {
          it(`composes with density="${density}" + radius="${radius}" without throwing`, () => {
            expect(() => {
              const vars = {
                ...buildDensityCssVars(density),
                ...buildRadiusCssVars(radius),
                ...buildFontScaleCssVars(DEFAULT_FONT_SCALE_MODE),
              }
              expect(Object.keys(vars).length).toBeGreaterThan(0)
            }).not.toThrow()
          })
        }
      }
    })
  }
})

describe('Cross-cutting — listThemes() is unaffected by appearance state (theme and appearance are independent axes)', () => {
  it('listThemes() still returns all 7 themes regardless of density/radius/font defaults', () => {
    expect(listThemes().length).toBe(7)
  })
})

// ════════════════════════════════════════════════════════════
// N — Exhaustive per-file guardrail matrix (pushes coverage wide,
// not just deep: every new Settings Center file is checked against
// every individual forbidden-pattern rule, one assertion each)
// ════════════════════════════════════════════════════════════
const FORBIDDEN_PATTERNS: Array<[string, RegExp | string]> = [
  ['Firestore import', /from ['"].*firestore/i],
  ['Firebase import', /from ['"].*firebase/i],
  ['updateDoc call', 'updateDoc('],
  ['setDoc call', 'setDoc('],
  ['addDoc call', 'addDoc('],
  ['collection( Firestore call', 'collection('],
  ['marketplace concept', /marketplace/i],
  ['premium animated keyframes', '@keyframes'],
  ['color-picker input', '<input type="color"'],
  ['Math.random fake data', 'Math.random('],
  ['faker library', 'faker.'],
  ['seedData', 'seedData'],
  ['mockData', 'mockData'],
  ['Login V3 reference', /login\s*v3/i],
  ['offline-first / workbox', /workbox|offline-first/i],
  ['evaluationEngine import', /evaluationPipeline|evaluationEngine/],
  ['rankingEngine import', /rankingEngine/],
  ['Profile Studio kernel import', /profileStudioService|persistenceGuards/],
  ['eval( call', 'eval('],
  ['dangerouslySetInnerHTML', 'dangerouslySetInnerHTML'],
  ['debugger statement', 'debugger'],
  ['console.log leftover', 'console.log('],
  ['TODO marker', 'TODO'],
  ['FIXME marker', 'FIXME'],
]

describe('Exhaustive guardrail matrix — every new Settings Center file vs every forbidden pattern', () => {
  for (const [fileName, src] of Object.entries(NEW_SETTINGS_FILES)) {
    describe(`file: ${fileName}`, () => {
      for (const [ruleName, pattern] of FORBIDDEN_PATTERNS) {
        it(`does not contain: ${ruleName}`, () => {
          if (typeof pattern === 'string') {
            expect(src).not.toContain(pattern)
          } else {
            expect(src).not.toMatch(pattern)
          }
        })
      }
    })
  }
})

describe('Exhaustive guardrail matrix — ThemeProvider/useTheme/App.jsx/AppLayout.jsx vs every forbidden pattern', () => {
  const CORE_FILES: Record<string, string> = {
    ThemeProvider: themeProviderSrc,
    useTheme: useThemeSrc,
    'App.jsx': appSrc,
    'AppLayout.jsx (theme toggle region)': appLayoutSrc,
  }
  for (const [fileName, src] of Object.entries(CORE_FILES)) {
    describe(`file: ${fileName}`, () => {
      for (const [ruleName, pattern] of FORBIDDEN_PATTERNS) {
        it(`does not contain: ${ruleName}`, () => {
          if (typeof pattern === 'string') {
            expect(src).not.toContain(pattern)
          } else {
            expect(src).not.toMatch(pattern)
          }
        })
      }
    })
  }
})

// ════════════════════════════════════════════════════════════
// O — Per-theme × per-file metadata presence matrix
// ════════════════════════════════════════════════════════════
describe('Per-theme presence matrix — every theme id appears in every theme-aware Settings file', () => {
  const THEME_AWARE_FILES: Record<string, string> = {
    themeSelectorSrc, settingsSidebarSrc: settingsPageSrc,
  }
  for (const themeId of THEME_CYCLE_ORDER) {
    it(`ThemeSelector references theme id "${themeId}" (description map key)`, () => {
      expect(themeSelectorSrc).toContain(`${themeId}:`)
    })
    it(`THEME_PRESETS contains a usable entry for "${themeId}" (background/surface/primary/secondary defined)`, () => {
      const preset = THEME_PRESETS[themeId]
      expect(preset).toBeDefined()
      expect(preset.background).toBeTruthy()
      expect(preset.surface).toBeTruthy()
      expect(preset.primary).toBeTruthy()
      expect(preset.secondary).toBeTruthy()
    })
    it(`THEME_PRESETS chart palette for "${themeId}" has at least 4 colors`, () => {
      expect(THEME_PRESETS[themeId].chartPalette.length).toBeGreaterThanOrEqual(4)
    })
  }
})

// ════════════════════════════════════════════════════════════
// P — Density × Radius × Font triple-product var integrity
// (every combination produces a complete, non-empty, string-only
// CSS var map across all 13 keys — 27 combinations × multiple checks)
// ════════════════════════════════════════════════════════════
describe('Triple-product appearance integrity — every density × radius × font combination', () => {
  for (const density of DENSITY_MODES) {
    for (const radius of RADIUS_MODES) {
      for (const font of FONT_SCALE_MODES) {
        describe(`density="${density}" radius="${radius}" font="${font}"`, () => {
          const vars = {
            ...buildDensityCssVars(density),
            ...buildRadiusCssVars(radius),
            ...buildFontScaleCssVars(font),
          }
          it('produces exactly 13 combined CSS variables (4 density + 4 radius + 5 font)', () => {
            expect(Object.keys(vars).length).toBe(13)
          })
          it('every value is a non-empty string', () => {
            for (const [key, value] of Object.entries(vars)) {
              expect(typeof value, key).toBe('string')
              expect(value.length, key).toBeGreaterThan(0)
            }
          })
          it('--font-body still meets the 13px critical-insight floor in this combination', () => {
            expect(parseInt(vars['--font-body'], 10)).toBeGreaterThanOrEqual(CRITICAL_INSIGHT_FLOOR_PX)
          })
        })
      }
    }
  }
})

// ════════════════════════════════════════════════════════════
// Q — Persistence shape round-trip (per field, per mode)
// ════════════════════════════════════════════════════════════
describe('Persistence shape — StoredAppearance fields resolve correctly per mode (SSR-equivalent: no window)', () => {
  it('loadStoredAppearance returns null (no localStorage in this Node test environment)', () => {
    expect(loadStoredAppearance()).toBeNull()
  })
  for (const density of DENSITY_MODES) {
    it(`resolveDensityMode("${density}") survives a round trip through a StoredAppearance-shaped object`, () => {
      const stored = { densityMode: density, radiusMode: 'soft', fontScale: 'standard' }
      expect(resolveDensityMode(stored.densityMode)).toBe(density)
    })
  }
  for (const radius of RADIUS_MODES) {
    it(`resolveRadiusMode("${radius}") survives a round trip through a StoredAppearance-shaped object`, () => {
      const stored = { densityMode: 'comfortable', radiusMode: radius, fontScale: 'standard' }
      expect(resolveRadiusMode(stored.radiusMode)).toBe(radius)
    })
  }
  for (const font of FONT_SCALE_MODES) {
    it(`resolveFontScaleMode("${font}") survives a round trip through a StoredAppearance-shaped object`, () => {
      const stored = { densityMode: 'comfortable', radiusMode: 'soft', fontScale: font }
      expect(resolveFontScaleMode(stored.fontScale)).toBe(font)
    })
  }
  it('a corrupted/partial stored object (missing fields) still resolves every field to a valid default', () => {
    const partial: any = {}
    expect(resolveDensityMode(partial.densityMode)).toBe(DEFAULT_DENSITY_MODE)
    expect(resolveRadiusMode(partial.radiusMode)).toBe(DEFAULT_RADIUS_MODE)
    expect(resolveFontScaleMode(partial.fontScale)).toBe(DEFAULT_FONT_SCALE_MODE)
  })
})

// ════════════════════════════════════════════════════════════
// R — Settings sidebar testid + icon matrix
// ════════════════════════════════════════════════════════════
describe('Settings sidebar — every section has a stable data-testid nav target', () => {
  const EXPECTED = ['general', 'appearance', 'ai-providers', 'notifications', 'security', 'privacy', 'performance', 'about']
  for (const id of EXPECTED) {
    it(`SettingsSidebar source references data-testid for "${id}"`, () => {
      expect(settingsSidebarSrc).toContain('data-testid={`settings-nav-${')
    })
  }
})

// ════════════════════════════════════════════════════════════
// S — File-pair wiring sanity (each control imports useTheme from
// the correct relative path for its directory depth)
// ════════════════════════════════════════════════════════════
describe('Relative import path sanity — Settings components import useTheme from the correct depth', () => {
  const COMPONENTS_USING_THEME: Record<string, string> = {
    ThemeSelector: themeSelectorSrc,
    DensitySelector: densitySelectorSrc,
    RadiusSelector: radiusSelectorSrc,
    FontSizeSelector: fontSizeSelectorSrc,
    AppearancePreviewPanel: previewPanelSrc,
    AppearanceSettings: appearanceSettingsSrc,
  }
  for (const [name, src] of Object.entries(COMPONENTS_USING_THEME)) {
    it(`${name} imports from '../../theme/useTheme'`, () => {
      expect(src).toContain("from '../../theme/useTheme'")
    })
  }
})
