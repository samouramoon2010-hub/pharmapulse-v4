// ============================================================
// PharmaPulse Futuristic Theme — Registration Tests
//
// Source-text pattern (consistent with project convention).
// Verifies the new theme is registered in:
//   1. THEMES constant
//   2. THEME_META constant
//   3. applyTheme() token table
//   4. index.css data-theme block
//
// Does NOT test visual output (no DOM) — tests structure only.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const THEME_KEY = 'pharmapulse-futuristic'

// ── Source loaders ────────────────────────────────────────────
let storeSrc: string
let cssSrc: string

beforeAll(async () => {
  storeSrc = (await import('../../store/settingsStore.js?raw')).default
  // CSS is not served as ?raw in Vitest — read from disk
  cssSrc   = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8')
})

// ─────────────────────────────────────────────────────────────
// 1. THEMES constant
// ─────────────────────────────────────────────────────────────
describe('THEMES constant — futuristic registration', () => {
  it('exports FUTURISTIC key in THEMES', () => {
    expect(storeSrc).toContain("FUTURISTIC:  'pharmapulse-futuristic'")
  })

  it('THEMES.FUTURISTIC value matches the theme key', () => {
    expect(storeSrc).toContain(`'${THEME_KEY}'`)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. THEME_META constant
// ─────────────────────────────────────────────────────────────
describe('THEME_META — futuristic metadata', () => {
  it('has an entry for pharmapulse-futuristic', () => {
    expect(storeSrc).toContain(`'pharmapulse-futuristic'`)
    expect(storeSrc).toContain("label: 'Futuristic'")
  })

  it('has Arabic label (مستقبلي)', () => {
    expect(storeSrc).toContain("labelAr: 'مستقبلي'")
  })

  it('has a preview colour', () => {
    expect(storeSrc).toContain("preview: '#071426'")
  })

  it('existing pharma theme is still present (not replaced)', () => {
    expect(storeSrc).toContain("label: 'Pharma'")
    expect(storeSrc).toContain("preview: '#1A2235'")
  })
})

// ─────────────────────────────────────────────────────────────
// 3. applyTheme() token table
// ─────────────────────────────────────────────────────────────
describe('applyTheme() — futuristic token object', () => {
  it("contains 'pharmapulse-futuristic' key in token table", () => {
    // Must appear at least twice: once in THEME_META, once in applyTheme T object
    const first  = storeSrc.indexOf("'pharmapulse-futuristic': {")
    const second = storeSrc.indexOf("'pharmapulse-futuristic': {", first + 1)
    expect(second).toBeGreaterThan(-1)
  })

  // Helper: gets the token block from the applyTheme T object (second occurrence)
  function tokenBlock(src: string): string {
    const first  = src.indexOf("'pharmapulse-futuristic': {")
    const second = src.indexOf("'pharmapulse-futuristic': {", first + 1)
    return src.slice(second, second + 1500)
  }

  it('sets --bg-canvas to #020617', () => {
    expect(tokenBlock(storeSrc)).toContain("'--bg-canvas':      '#020617'")
  })

  it('sets --bg-surface to #071426', () => {
    expect(tokenBlock(storeSrc)).toContain("'--bg-surface':     '#071426'")
  })

  it('sets --border-subtle to cyan rgba', () => {
    expect(tokenBlock(storeSrc)).toContain("'--border-subtle':  'rgba(56,189,248,0.22)'")
  })

  it('sets --brand-500 to cyan #06B6D4', () => {
    expect(tokenBlock(storeSrc)).toContain("'--brand-500':      '#06B6D4'")
  })

  it('sets --brand-300 to emerald #00F5A0', () => {
    expect(tokenBlock(storeSrc)).toContain("'--brand-300':      '#00F5A0'")
  })

  it('sets --text-primary to #F8FAFC', () => {
    expect(tokenBlock(storeSrc)).toContain("'--text-primary':   '#F8FAFC'")
  })

  it('sets sidebar-bg to deep navy', () => {
    expect(tokenBlock(storeSrc)).toContain("'--sidebar-bg':     'rgba(2,6,23,0.98)'")
  })

  it('existing pharma token object is still present (not removed)', () => {
    expect(storeSrc).toContain("pharma: {")
    expect(storeSrc).toContain("'--bg-canvas':      '#0F1623'")
  })
})

// ─────────────────────────────────────────────────────────────
// 4. CSS variables block in index.css
// ─────────────────────────────────────────────────────────────
describe('index.css — futuristic data-theme block', () => {
  it('has [data-theme="pharmapulse-futuristic"] selector', () => {
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"]')
  })

  it('defines --bg-canvas in CSS block', () => {
    const idx = cssSrc.indexOf('[data-theme="pharmapulse-futuristic"]')
    const block = cssSrc.slice(idx, idx + 2500)
    expect(block).toContain('--bg-canvas:    #020617')
  })

  it('defines --border-subtle in CSS block', () => {
    const idx = cssSrc.indexOf('[data-theme="pharmapulse-futuristic"]')
    const block = cssSrc.slice(idx, idx + 2500)
    expect(block).toContain('--border-subtle:  rgba(56,189,248,0.22)')
  })

  it('defines semantic status tokens', () => {
    const idx = cssSrc.indexOf('[data-theme="pharmapulse-futuristic"]')
    const block = cssSrc.slice(idx, idx + 2500)
    expect(block).toContain('--status-success:')
    expect(block).toContain('--status-warning:')
    expect(block).toContain('--status-critical:')
    expect(block).toContain('--status-info:')
  })

  it('has glass card overrides', () => {
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"] .card')
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"] .pp-card')
    expect(cssSrc).toContain('backdrop-filter: blur(8px)')
  })

  it('has gradient button override — cyan to emerald', () => {
    const idx = cssSrc.indexOf('[data-theme="pharmapulse-futuristic"] .btn-primary')
    expect(idx).toBeGreaterThan(-1)
    const block = cssSrc.slice(idx, idx + 200)
    expect(block).toContain('linear-gradient')
    expect(block).toContain('#06B6D4')
    expect(block).toContain('#00F5A0')
  })

  it('has nav active state override with cyan', () => {
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"] .nav-item.active')
  })

  it('has badge readability overrides', () => {
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"] .pp-badge-success')
    expect(cssSrc).toContain('[data-theme="pharmapulse-futuristic"] .pp-badge-info')
  })

  it('existing pharma CSS block is still present (not removed)', () => {
    expect(cssSrc).toContain('[data-theme="pharma"]')
  })

  it('color-scheme is dark', () => {
    const idx = cssSrc.indexOf('[data-theme="pharmapulse-futuristic"]')
    const block = cssSrc.slice(idx, idx + 3200)
    expect(block).toContain('color-scheme: dark')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. THEMES runtime import
// ─────────────────────────────────────────────────────────────
describe('THEMES runtime — futuristic key accessible', () => {
  it('THEMES.FUTURISTIC equals pharmapulse-futuristic', async () => {
    const { THEMES } = await import('../../store/settingsStore.js')
    expect(THEMES.FUTURISTIC).toBe('pharmapulse-futuristic')
  })

  it('THEME_META has pharmapulse-futuristic entry', async () => {
    const { THEME_META } = await import('../../store/settingsStore.js')
    expect(THEME_META['pharmapulse-futuristic']).toBeDefined()
    expect(THEME_META['pharmapulse-futuristic'].label).toBe('Futuristic')
    expect(THEME_META['pharmapulse-futuristic'].labelAr).toBe('مستقبلي')
  })

  it('applyTheme has futuristic token set (source check)', () => {
    expect(storeSrc).toContain("'pharmapulse-futuristic': {")
  })

  it('existing THEMES remain unchanged', async () => {
    const { THEMES } = await import('../../store/settingsStore.js')
    expect(THEMES.PHARMA).toBe('pharma')
    expect(THEMES.DARK).toBe('dark')
    expect(THEMES.LIGHT).toBe('light')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. SettingsPage wires theme selection correctly
// ─────────────────────────────────────────────────────────────
describe('SettingsPage — futuristic theme appears in grid', () => {
  it('imports THEME_META which now includes futuristic', async () => {
    const settingsPageSrc = (await import('../../pages/shared/SettingsPage.jsx?raw')).default
    expect(settingsPageSrc).toContain('THEME_META')
    // SettingsPage renders Object.entries(THEME_META) — futuristic is included
    expect(settingsPageSrc).toContain('Object.entries(THEME_META)')
  })

  it('THEME_META used in settings covers all themes including futuristic', async () => {
    const { THEME_META } = await import('../../store/settingsStore.js')
    const keys = Object.keys(THEME_META)
    expect(keys).toContain('pharmapulse-futuristic')
    expect(keys).toContain('pharma')
    expect(keys).toContain('dark')
    expect(keys.length).toBeGreaterThanOrEqual(9)
  })
})
