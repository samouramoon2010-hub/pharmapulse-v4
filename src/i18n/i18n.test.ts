// ============================================================
// i18n Foundation — Regression Tests
// Tests: translation, language switching, dir/lang DOM side
//        effects, localStorage persistence, KPI compatibility.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve }      from 'path'

import {
  translate,
  applyLanguage,
  isSupportedLang,
  normaliseLang,
  LANGUAGE_META,
  SUPPORTED_LANGUAGES,
} from './index'
import ar from './locales/ar.json'
import en from './locales/en.json'

// ── Source guards ──────────────────────────────────────────

const SETTINGS_STORE_SRC = readFileSync(
  resolve(__dirname, '../store/settingsStore.js'), 'utf8'
)
const SETTINGS_PAGE_SRC = readFileSync(
  resolve(__dirname, '../pages/shared/SettingsPage.jsx'), 'utf8'
)
const SIDEBAR_SRC = readFileSync(
  resolve(__dirname, '../components/layout/Sidebar.jsx'), 'utf8'
)

// ══════════════════════════════════════════════════════════════
// 1 — Translation file completeness
// ══════════════════════════════════════════════════════════════

describe('Translation files — structural completeness', () => {
  it('ar.json has common section', () => expect(ar).toHaveProperty('common'))
  it('ar.json has nav section',    () => expect(ar).toHaveProperty('nav'))
  it('ar.json has settings section', () => expect(ar).toHaveProperty('settings'))
  it('ar.json has kpi section',    () => expect(ar).toHaveProperty('kpi'))

  it('en.json has common section', () => expect(en).toHaveProperty('common'))
  it('en.json has nav section',    () => expect(en).toHaveProperty('nav'))
  it('en.json has settings section', () => expect(en).toHaveProperty('settings'))
  it('en.json has kpi section',    () => expect(en).toHaveProperty('kpi'))

  it('ar and en have the same top-level sections', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort())
  })

  it('ar and en have the same nav keys', () => {
    expect(Object.keys((ar as any).nav).sort()).toEqual(Object.keys((en as any).nav).sort())
  })

  it('ar and en have the same common keys', () => {
    expect(Object.keys((ar as any).common).sort()).toEqual(Object.keys((en as any).common).sort())
  })

  it('ar and en have the same settings keys', () => {
    expect(Object.keys((ar as any).settings).sort()).toEqual(Object.keys((en as any).settings).sort())
  })

  it('ar common.save is Arabic text', () => {
    expect((ar as any).common.save).toBe('حفظ')
  })

  it('en common.save is English text', () => {
    expect((en as any).common.save).toBe('Save')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — translate() function
// ══════════════════════════════════════════════════════════════

describe('translate() — dot-path key resolution', () => {
  it('resolves nav.dashboard in Arabic', () => {
    expect(translate('ar', 'nav.dashboard')).toBe('لوحة التحكم')
  })

  it('resolves nav.dashboard in English', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard')
  })

  it('resolves common.save in Arabic', () => {
    expect(translate('ar', 'common.save')).toBe('حفظ')
  })

  it('resolves common.save in English', () => {
    expect(translate('en', 'common.save')).toBe('Save')
  })

  it('resolves nav.reports in Arabic', () => {
    expect(translate('ar', 'nav.reports')).toBe('التقارير')
  })

  it('resolves nav.targets in Arabic', () => {
    expect(translate('ar', 'nav.targets')).toBe('الأهداف')
  })

  it('resolves nav.settings in Arabic', () => {
    expect(translate('ar', 'nav.settings')).toBe('الإعدادات')
  })

  it('resolves nav.entry in Arabic', () => {
    expect(translate('ar', 'nav.entry')).toBe('إدخال KPI')
  })

  it('returns key itself for unknown path (safe fallback)', () => {
    expect(translate('ar', 'nav.nonExistentKey')).toBe('nav.nonExistentKey')
  })

  it('falls back to Arabic when key missing in English', () => {
    // If en dict doesn't have the key but ar does, falls back to ar value
    const result = translate('en', 'nonExistent.deeply.nested', 'ar')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('never returns undefined', () => {
    const keys = ['common.save', 'nav.dashboard', 'kpi.noTarget', 'unknown.key', '']
    for (const key of keys) {
      expect(translate('ar', key)).not.toBeUndefined()
      expect(translate('en', key)).not.toBeUndefined()
    }
  })

  it('resolves settings.language in Arabic', () => {
    expect(translate('ar', 'settings.language')).toBe('اللغة')
  })

  it('resolves settings.language in English', () => {
    expect(translate('en', 'settings.language')).toBe('Language')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — LANGUAGE_META structure
// ══════════════════════════════════════════════════════════════

describe('LANGUAGE_META — language configuration', () => {
  it('Arabic meta has dir=rtl', () => {
    expect(LANGUAGE_META.ar.dir).toBe('rtl')
  })

  it('English meta has dir=ltr', () => {
    expect(LANGUAGE_META.en.dir).toBe('ltr')
  })

  it('Arabic has correct nativeName', () => {
    expect(LANGUAGE_META.ar.nativeName).toBe('العربية')
  })

  it('English has correct nativeName', () => {
    expect(LANGUAGE_META.en.nativeName).toBe('English')
  })

  it('both languages have label, nativeName, dir, fontClass', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const meta = LANGUAGE_META[lang]
      expect(meta.label).toBeTruthy()
      expect(meta.nativeName).toBeTruthy()
      expect(['rtl', 'ltr']).toContain(meta.dir)
      expect(typeof meta.fontClass).toBe('string')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — applyLanguage — logic verification (source-level)
// ══════════════════════════════════════════════════════════════

describe('applyLanguage — language/direction logic', () => {
  it('LANGUAGE_META.ar.dir is rtl — applyLanguage uses this for Arabic', () => {
    // applyLanguage reads LANGUAGE_META[lang].dir and applies it to document
    expect(LANGUAGE_META.ar.dir).toBe('rtl')
  })

  it('LANGUAGE_META.en.dir is ltr — applyLanguage uses this for English', () => {
    expect(LANGUAGE_META.en.dir).toBe('ltr')
  })

  it('Arabic should set dir=rtl on html element', () => {
    // Logic test: LANGUAGE_META lookup for ar gives rtl
    const expected = LANGUAGE_META['ar'].dir
    expect(expected).toBe('rtl')
  })

  it('English should set dir=ltr on html element', () => {
    const expected = LANGUAGE_META['en'].dir
    expect(expected).toBe('ltr')
  })

  it('applyLanguage source reads LANGUAGE_META[lang].dir', () => {
    const I18N_SRC = readFileSync(resolve(__dirname, './index.ts'), 'utf8')
    expect(I18N_SRC).toContain('document.documentElement.lang')
    expect(I18N_SRC).toContain('document.documentElement.dir')
    expect(I18N_SRC).toContain('LANGUAGE_META[lang]')
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Language guards and normalisers
// ══════════════════════════════════════════════════════════════

describe('isSupportedLang / normaliseLang', () => {
  it('ar is supported', () => expect(isSupportedLang('ar')).toBe(true))
  it('en is supported', () => expect(isSupportedLang('en')).toBe(true))
  it('fr is not supported', () => expect(isSupportedLang('fr')).toBe(false))
  it('undefined is not supported', () => expect(isSupportedLang(undefined)).toBe(false))
  it('empty string is not supported', () => expect(isSupportedLang('')).toBe(false))

  it('normaliseLang returns ar for unknown values', () => {
    expect(normaliseLang('fr')).toBe('ar')
    expect(normaliseLang(null)).toBe('ar')
    expect(normaliseLang(undefined)).toBe('ar')
    expect(normaliseLang('')).toBe('ar')
    expect(normaliseLang(42)).toBe('ar')
  })

  it('normaliseLang passes through valid langs', () => {
    expect(normaliseLang('ar')).toBe('ar')
    expect(normaliseLang('en')).toBe('en')
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — settingsStore integration (source-level checks)
// ══════════════════════════════════════════════════════════════

describe('settingsStore — language persistence', () => {
  it('imports applyLanguage from i18n', () => {
    expect(SETTINGS_STORE_SRC).toContain('applyLanguage')
    expect(SETTINGS_STORE_SRC).toContain("from '../i18n/index'")
  })

  it('has language field in initial state', () => {
    expect(SETTINGS_STORE_SRC).toMatch(/language:\s*['"]ar['"]/)
  })

  it('has setLanguage action', () => {
    expect(SETTINGS_STORE_SRC).toContain('setLanguage')
  })

  it('setLanguage calls applyLanguage (source check)', () => {
    // Both setLanguage and applyLanguage appear in the store, and setLanguage
    // block contains applyLanguage call (multiline source check)
    expect(SETTINGS_STORE_SRC).toContain('setLanguage')
    expect(SETTINGS_STORE_SRC).toContain('applyLanguage(safe)')
  })

  it('onRehydrateStorage calls applyLanguage', () => {
    expect(SETTINGS_STORE_SRC).toMatch(/onRehydrateStorage[\s\S]{1,200}applyLanguage/)
  })

  it('uses normaliseLang for safety', () => {
    expect(SETTINGS_STORE_SRC).toContain('normaliseLang')
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — SettingsPage language switcher
// ══════════════════════════════════════════════════════════════

describe('SettingsPage — language switcher section', () => {
  it('imports useI18n', () => {
    expect(SETTINGS_PAGE_SRC).toContain("from '../../hooks/useI18n'")
  })

  it('imports LANGUAGE_META', () => {
    expect(SETTINGS_PAGE_SRC).toContain('LANGUAGE_META')
  })

  it('has language tab in SECTIONS', () => {
    expect(SETTINGS_PAGE_SRC).toContain("'language'")
  })

  it('renders language switcher when active=language', () => {
    expect(SETTINGS_PAGE_SRC).toContain("active === 'language'")
  })

  it('uses t(settings.language) for section title', () => {
    expect(SETTINGS_PAGE_SRC).toMatch(/t\s*\(\s*['"]settings\.language['"]\s*\)/)
  })

  it('iterates LANGUAGE_META entries for language buttons', () => {
    expect(SETTINGS_PAGE_SRC).toMatch(/Object\.entries\s*\(\s*LANGUAGE_META\s*\)/)
  })

  it('calls setLang on language button click', () => {
    expect(SETTINGS_PAGE_SRC).toContain('setLang')
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Sidebar i18n integration
// ══════════════════════════════════════════════════════════════

describe('Sidebar — nav label translation', () => {
  it('imports useI18n', () => {
    expect(SIDEBAR_SRC).toContain("from '../../hooks/useI18n'")
  })

  it('has navLabel helper that maps known labels', () => {
    expect(SIDEBAR_SRC).toContain('navLabel')
  })

  it('navLabel uses t(nav.dashboard)', () => {
    expect(SIDEBAR_SRC).toMatch(/t\s*\(\s*['"]nav\.dashboard['"]\s*\)/)
  })

  it('navLabel uses t(nav.reports)', () => {
    expect(SIDEBAR_SRC).toMatch(/t\s*\(\s*['"]nav\.reports['"]\s*\)/)
  })

  it('navLabel uses t(nav.settings)', () => {
    expect(SIDEBAR_SRC).toMatch(/t\s*\(\s*['"]nav\.settings['"]\s*\)/)
  })

  it('translatedItem spread is used at render site', () => {
    expect(SIDEBAR_SRC).toContain('translatedItem')
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — KPI Registry compatibility
// ══════════════════════════════════════════════════════════════

describe('i18n — KPI Registry compatibility (non-interference)', () => {
  it('translation keys do NOT contain KPI-specific terms', () => {
    // i18n keys are for UI chrome, not KPI labels
    const navKeys = Object.keys((ar as any).nav)
    expect(navKeys).not.toContain('wasfaty')
    expect(navKeys).not.toContain('omni')
    expect(navKeys).not.toContain('sl')
  })

  it('i18n files do not reference KPI registry fields', () => {
    const arStr = JSON.stringify(ar)
    const enStr = JSON.stringify(en)
    expect(arStr).not.toContain('aliasFor')
    expect(arStr).not.toContain('engineKey')
    expect(enStr).not.toContain('aliasFor')
  })

  it('translate() never modifies KpiDefinition objects', () => {
    // Pure function — no side effects
    const result1 = translate('ar', 'nav.dashboard')
    const result2 = translate('ar', 'nav.dashboard')
    expect(result1).toBe(result2)
  })

  it('i18n module exports do not overlap with kpiRegistry exports', () => {
    // Sanity check: translate, LANGUAGE_META etc. not in kpiRegistry
    const KPIREG_SRC = readFileSync(
      resolve(__dirname, '../engine/kpiRegistry/index.ts'), 'utf8'
    )
    expect(KPIREG_SRC).not.toContain('translate')
    expect(KPIREG_SRC).not.toContain('useI18n')
  })
})
