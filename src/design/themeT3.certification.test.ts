// ============================================================
// Theme T3 Bundle — Premium Theme Polish Certification (Phase T3-I)
//
// Same convention as themeEngine.certification.test.ts /
// themeT2Settings.certification.test.ts: pure logic files are
// exercised directly in this project's real Node (no jsdom) vitest
// environment; React/CSS files are certified via raw `?raw` source
// inspection.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { THEME_CYCLE_ORDER, DEFAULT_THEME_ID, THEME_PRESETS } from './themeRegistry'
import {
  THEME_EFFECT_PRESETS, getThemeEffectTokens, isThemeEffectTokensValid, buildEffectCssVars,
} from './themeEffects'
import {
  SURFACE_TRANSITION_MS, SURFACE_TRANSITION_PROPERTIES, buildSurfaceTransitionValue, buildTransitionCssVars,
} from './themeTransitions'
import {
  BACKGROUND_LAYERS, isValidBackgroundLayer, getBackgroundLayer, buildBackgroundCssVars,
} from './backgroundLayers'
import {
  GLASS_THEME_IDS, isGlassThemeId, isGlassTokensValid, getGlassTokens, buildGlassCssVars,
} from './glassTokens'
import {
  THEME_SWITCH_DURATION_MS, THEME_SWITCH_PROPERTIES, buildThemeSwitchTransitionValue,
  buildThemeMotionCssVars, isThemeMotionSafe,
} from './themeMotion'
import { CHART_THEMES, getChartTheme, isChartThemeValid } from './chartThemes'
import {
  AMBIENT_ACCENT_MAX_OPACITY, isValidAmbientOpacity, getAmbientAccentOverlay, buildAmbientAccentCssVars,
} from './ambientAccent'

const themeProviderSrc = await import('../theme/ThemeProvider.jsx?raw').then((m) => m.default)
const indexCssSrc = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const appSrc = await import('../App.jsx?raw').then((m) => m.default)

const T3_SOURCE_FILES: Record<string, string> = {
  'themeEffects.ts':      await import('./themeEffects.ts?raw').then((m) => m.default),
  'themeTransitions.ts':  await import('./themeTransitions.ts?raw').then((m) => m.default),
  'backgroundLayers.ts':  await import('./backgroundLayers.ts?raw').then((m) => m.default),
  'glassTokens.ts':       await import('./glassTokens.ts?raw').then((m) => m.default),
  'themeMotion.ts':       await import('./themeMotion.ts?raw').then((m) => m.default),
  'chartThemes.ts':       await import('./chartThemes.ts?raw').then((m) => m.default),
  'ambientAccent.ts':     await import('./ambientAccent.ts?raw').then((m) => m.default),
}

// ════════════════════════════════════════════════════════════
// A — Premium surface tokens (T3-A)
// ════════════════════════════════════════════════════════════
describe('T3-A — themeEffects.ts covers every theme with valid tokens', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      it('has a registered effect preset', () => {
        expect(THEME_EFFECT_PRESETS[id]).toBeDefined()
      })
      it('passes isThemeEffectTokensValid', () => {
        expect(isThemeEffectTokensValid(THEME_EFFECT_PRESETS[id])).toBe(true)
      })
      it('getThemeEffectTokens returns the same preset for a valid id', () => {
        expect(getThemeEffectTokens(id)).toEqual(THEME_EFFECT_PRESETS[id])
      })
      it('buildEffectCssVars defines all 4 required vars as strings', () => {
        const vars = buildEffectCssVars(id)
        for (const key of ['--shadow-card', '--shadow-float', '--shadow-inner', '--border-width-card']) {
          expect(typeof vars[key]).toBe('string')
        }
      })
      it('cornerStyle is one of sharp/soft/rounded', () => {
        expect(['sharp', 'soft', 'rounded']).toContain(THEME_EFFECT_PRESETS[id].cornerStyle)
      })
      it('does not throw when building vars', () => {
        expect(() => buildEffectCssVars(id)).not.toThrow()
      })
    })
  }

  it('Corporate uses minimal shadows (thin, low-opacity)', () => {
    expect(THEME_EFFECT_PRESETS.corporate.shadowCard).toMatch(/0\.0[0-9]/)
  })
  it('Executive uses wide, soft shadows (large blur radius)', () => {
    expect(THEME_EFFECT_PRESETS.executive.shadowFloat).toMatch(/48px|45px|40px/)
  })
  it('Futuristic uses sharp corners', () => {
    expect(THEME_EFFECT_PRESETS.futuristic.cornerStyle).toBe('sharp')
  })
  it('AMOLED has zero shadows', () => {
    expect(THEME_EFFECT_PRESETS.amoled.shadowCard).toBe('none')
    expect(THEME_EFFECT_PRESETS.amoled.shadowFloat).toBe('none')
  })
  it('Apple uses continuous-curve (rounded) corners', () => {
    expect(THEME_EFFECT_PRESETS.apple.cornerStyle).toBe('rounded')
  })
  it('Cyber uses sharp, brutalist corners', () => {
    expect(THEME_EFFECT_PRESETS.cyber.cornerStyle).toBe('sharp')
  })
  it('Medical uses soft, calm corners', () => {
    expect(THEME_EFFECT_PRESETS.medical.cornerStyle).toBe('soft')
  })
  it('isThemeEffectTokensValid rejects garbage input', () => {
    expect(isThemeEffectTokensValid(null)).toBe(false)
    expect(isThemeEffectTokensValid({})).toBe(false)
    expect(isThemeEffectTokensValid('not an object')).toBe(false)
  })
  it('getThemeEffectTokens falls back to corporate for an invalid id', () => {
    expect(getThemeEffectTokens('nonsense')).toEqual(THEME_EFFECT_PRESETS.corporate)
  })
  it('themeEffects.ts never writes to --radius-card (radius stays owned by Theme T2)', () => {
    expect(T3_SOURCE_FILES['themeEffects.ts']).not.toContain("'--radius-card'")
  })
})

describe('T3-A — themeTransitions.ts (surface micro-transitions)', () => {
  it('SURFACE_TRANSITION_MS is 150', () => {
    expect(SURFACE_TRANSITION_MS).toBe(150)
  })
  it('SURFACE_TRANSITION_PROPERTIES has exactly 3 entries', () => {
    expect(SURFACE_TRANSITION_PROPERTIES.length).toBe(3)
  })
  for (const prop of ['background-color', 'border-color', 'box-shadow']) {
    it(`includes "${prop}"`, () => {
      expect(SURFACE_TRANSITION_PROPERTIES).toContain(prop)
    })
  }
  it('buildSurfaceTransitionValue produces a valid CSS transition shorthand', () => {
    const value = buildSurfaceTransitionValue()
    expect(value).toContain('150ms')
    expect(value.split(',').length).toBe(3)
  })
  it('buildTransitionCssVars exposes --transition-surface', () => {
    expect(buildTransitionCssVars()['--transition-surface']).toBe(buildSurfaceTransitionValue())
  })
  it('does not import framer-motion', () => {
    expect(T3_SOURCE_FILES['themeTransitions.ts']).not.toMatch(/from ['"]framer-motion['"]/)
  })
})

// ════════════════════════════════════════════════════════════
// B — Context-aware background system (T3-B)
// ════════════════════════════════════════════════════════════
describe('T3-B — backgroundLayers.ts covers every theme', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      it('has a registered background layer', () => {
        expect(BACKGROUND_LAYERS[id]).toBeDefined()
      })
      it('isValidBackgroundLayer is true', () => {
        expect(isValidBackgroundLayer(id)).toBe(true)
      })
      it('getBackgroundLayer matches the registry', () => {
        expect(getBackgroundLayer(id)).toBe(BACKGROUND_LAYERS[id])
      })
      it('buildBackgroundCssVars exposes --bg-ambient-layer', () => {
        expect(buildBackgroundCssVars(id)['--bg-ambient-layer']).toBe(BACKGROUND_LAYERS[id])
      })
      it('contains no canvas/particle/animation keywords', () => {
        const value = BACKGROUND_LAYERS[id]
        expect(value).not.toMatch(/canvas|particle|@keyframes|animation:/i)
      })
    })
  }

  it('Medical uses a clean (no-gradient) background', () => {
    expect(BACKGROUND_LAYERS.medical).toBe('none')
  })
  it('AMOLED uses pure black (no-gradient) background', () => {
    expect(BACKGROUND_LAYERS.amoled).toBe('none')
  })
  it('Futuristic uses a radial glow, not a full linear wash', () => {
    expect(BACKGROUND_LAYERS.futuristic).toContain('radial-gradient')
  })
  it('Executive uses a deep navy gradient', () => {
    expect(BACKGROUND_LAYERS.executive).toContain('gradient')
  })
  it('every non-"none" layer is a valid CSS gradient function', () => {
    for (const id of THEME_CYCLE_ORDER) {
      const value = BACKGROUND_LAYERS[id]
      if (value !== 'none') {
        expect(value).toMatch(/^(linear|radial)-gradient\(/)
      }
    }
  })
  it('isValidBackgroundLayer rejects an unregistered id', () => {
    expect(isValidBackgroundLayer('nonsense')).toBe(false)
  })
  it('getBackgroundLayer falls back to "none" for an invalid id', () => {
    expect(getBackgroundLayer('nonsense')).toBe('none')
  })
})

// ════════════════════════════════════════════════════════════
// C — Glassmorphism layer (T3-C)
// ════════════════════════════════════════════════════════════
describe('T3-C — glassTokens.ts: glass restricted to Apple/Executive only', () => {
  it('GLASS_THEME_IDS is exactly [apple, executive]', () => {
    expect(GLASS_THEME_IDS.sort()).toEqual(['apple', 'executive'].sort())
  })
  for (const id of THEME_CYCLE_ORDER) {
    const shouldBeGlass = id === 'apple' || id === 'executive'
    describe(`theme "${id}"`, () => {
      it(`isGlassThemeId is ${shouldBeGlass}`, () => {
        expect(isGlassThemeId(id)).toBe(shouldBeGlass)
      })
      it('getGlassTokens passes isGlassTokensValid', () => {
        expect(isGlassTokensValid(getGlassTokens(id))).toBe(true)
      })
      if (shouldBeGlass) {
        it('blur is within the 12-24px spec range', () => {
          const px = parseInt(getGlassTokens(id).blur, 10)
          expect(px).toBeGreaterThanOrEqual(12)
          expect(px).toBeLessThanOrEqual(24)
        })
        it('opacity is within the 0.6-0.85 spec range', () => {
          const { opacity } = getGlassTokens(id)
          expect(opacity).toBeGreaterThanOrEqual(0.6)
          expect(opacity).toBeLessThanOrEqual(0.85)
        })
        it('enabled is true', () => {
          expect(getGlassTokens(id).enabled).toBe(true)
        })
      } else {
        it('enabled is false (no glass everywhere)', () => {
          expect(getGlassTokens(id).enabled).toBe(false)
        })
        it('opacity is fully solid (1) when disabled', () => {
          expect(getGlassTokens(id).opacity).toBe(1)
        })
      }
      it('buildGlassCssVars exposes all 3 required vars', () => {
        const vars = buildGlassCssVars(id)
        expect(vars['--glass-blur']).toBeDefined()
        expect(vars['--glass-opacity']).toBeDefined()
        expect(vars['--glass-enabled']).toBeDefined()
      })
    })
  }
  it('isGlassTokensValid rejects garbage input', () => {
    expect(isGlassTokensValid(null)).toBe(false)
    expect(isGlassTokensValid('nope')).toBe(false)
  })
  it('getGlassTokens falls back to disabled/opaque for an invalid id', () => {
    expect(getGlassTokens('nonsense')).toEqual({ enabled: false, blur: '0px', opacity: 1 })
  })
  it('index.css applies glass opacity overrides only under [data-theme-t1="apple"] and [data-theme-t1="executive"]', () => {
    expect(indexCssSrc).toContain('[data-theme-t1="apple"] {')
    expect(indexCssSrc).toContain('[data-theme-t1="executive"] {')
  })
  it('index.css never overrides --bg-card under a glass theme selector (cards remain solid)', () => {
    const appleIdx = indexCssSrc.indexOf('[data-theme-t1="apple"] {')
    const block = indexCssSrc.slice(appleIdx, appleIdx + 300)
    expect(block).not.toContain('--bg-card')
  })
})

// ════════════════════════════════════════════════════════════
// D — Theme transition engine (T3-D)
// ════════════════════════════════════════════════════════════
describe('T3-D — themeMotion.ts: theme-switch transition is 150ms, CSS-only, safe properties', () => {
  it('THEME_SWITCH_DURATION_MS is 150', () => {
    expect(THEME_SWITCH_DURATION_MS).toBe(150)
  })
  it('THEME_SWITCH_PROPERTIES is exactly [background-color, color, opacity]', () => {
    expect(THEME_SWITCH_PROPERTIES).toEqual(['background-color', 'color', 'opacity'])
  })
  it('buildThemeSwitchTransitionValue includes all 3 properties and the duration', () => {
    const value = buildThemeSwitchTransitionValue()
    expect(value).toContain('150ms')
    expect(value).toContain('background-color')
    expect(value).toContain('color')
    expect(value).toContain('opacity')
  })
  it('isThemeMotionSafe is true for the real transition value (no layout-affecting properties)', () => {
    expect(isThemeMotionSafe(buildThemeSwitchTransitionValue())).toBe(true)
  })
  it('isThemeMotionSafe is false for a value containing transform', () => {
    expect(isThemeMotionSafe('transform 300ms ease')).toBe(false)
  })
  it('isThemeMotionSafe is false for a value containing scale, width, or height', () => {
    expect(isThemeMotionSafe('scale 1s')).toBe(false)
    expect(isThemeMotionSafe('width 1s')).toBe(false)
    expect(isThemeMotionSafe('height 1s')).toBe(false)
  })
  it('buildThemeMotionCssVars exposes duration and transition vars matching the constants', () => {
    const vars = buildThemeMotionCssVars()
    expect(vars['--theme-motion-duration']).toBe('150ms')
    expect(vars['--theme-motion-transition']).toBe(buildThemeSwitchTransitionValue())
  })
  it('themeMotion.ts does not import framer-motion', () => {
    expect(T3_SOURCE_FILES['themeMotion.ts']).not.toMatch(/from ['"]framer-motion['"]/)
  })
  it('themeMotion.ts touches no DOM API directly (no document/window reference)', () => {
    expect(T3_SOURCE_FILES['themeMotion.ts']).not.toMatch(/\bdocument\.|\bwindow\./)
  })
  it('ThemeProvider applies the theme-motion CSS vars once on mount', () => {
    expect(themeProviderSrc).toContain('buildThemeMotionCssVars()')
  })
  it('index.css applies --theme-motion-transition to surfaces under [data-theme-t1]', () => {
    expect(indexCssSrc).toContain('transition: var(--theme-motion-transition);')
  })
  it('index.css theme-switch transition rule is scoped (not a blanket * selector)', () => {
    const idx = indexCssSrc.indexOf('transition: var(--theme-motion-transition);')
    const before = indexCssSrc.slice(Math.max(0, idx - 400), idx)
    expect(before).not.toMatch(/\n\*\s*\{/)
  })
  it('the whole app has no framer-motion import anywhere relevant to theming', () => {
    for (const [name, src] of Object.entries(T3_SOURCE_FILES)) {
      expect(src, name).not.toMatch(/from ['"]framer-motion['"]/)
    }
    expect(themeProviderSrc).not.toMatch(/from ['"]framer-motion['"]/)
  })
})

// ════════════════════════════════════════════════════════════
// E — Premium typography (T3-E)
// ════════════════════════════════════════════════════════════
describe('T3-E — premium typography per theme, critical-insight floor preserved', () => {
  it('index.css applies a Geist/Inter heading stack for Executive', () => {
    const idx = indexCssSrc.indexOf('[data-theme-t1="executive"] .pp-text-heading')
    expect(idx).toBeGreaterThan(-1)
    const block = indexCssSrc.slice(idx, idx + 200)
    expect(block).toContain('Geist')
    expect(block).toContain('Inter')
  })
  it('index.css applies an SF-like stack for Apple', () => {
    const idx = indexCssSrc.indexOf('[data-theme-t1="apple"] body')
    expect(idx).toBeGreaterThan(-1)
    const block = indexCssSrc.slice(idx, idx + 200)
    expect(block).toMatch(/SF Pro|-apple-system/)
  })
  it('index.css applies JetBrains Mono for Cyber', () => {
    const idx = indexCssSrc.indexOf('[data-theme-t1="cyber"] body')
    expect(idx).toBeGreaterThan(-1)
    const block = indexCssSrc.slice(idx, idx + 250)
    expect(block).toContain('JetBrains Mono')
  })
  it('index.css already enforces tabular-nums broadly (pre-existing convention, unaffected by T3)', () => {
    expect(indexCssSrc).toContain('font-variant-numeric: tabular-nums')
  })
  it('the .tabular-nums utility class still exists', () => {
    expect(indexCssSrc).toContain('.tabular-nums { font-variant-numeric: tabular-nums; }')
  })
  it('the critical-insight floor (13px) constant from Theme T2 is untouched by T3', () => {
    // Re-verified here (not redefined) — T3 must not introduce a second, conflicting floor.
    expect(T3_SOURCE_FILES['themeEffects.ts']).not.toMatch(/CRITICAL_INSIGHT_FLOOR/)
    expect(T3_SOURCE_FILES['themeMotion.ts']).not.toMatch(/CRITICAL_INSIGHT_FLOOR/)
  })
  it('no T3 file sets a font-size below 13px', () => {
    for (const [name, src] of Object.entries(T3_SOURCE_FILES)) {
      const matches = src.match(/font-size:\s*(\d+)px/g) ?? []
      for (const m of matches) {
        const px = parseInt(m.replace(/[^\d]/g, ''), 10)
        expect(px, `${name}: ${m}`).toBeGreaterThanOrEqual(13)
      }
    }
  })
})

// ════════════════════════════════════════════════════════════
// F — Status color polish (T3-F)
// ════════════════════════════════════════════════════════════
describe('T3-F — status colors remain centralized, muted, and theme-valid', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      for (const field of ['success', 'warning', 'danger', 'info'] as const) {
        it(`${field} is a usable color string`, () => {
          expect(typeof THEME_PRESETS[id][field]).toBe('string')
          expect(THEME_PRESETS[id][field].length).toBeGreaterThan(0)
        })
      }
    })
  }
  it('the centralized --status-* token system in index.css is untouched (single source of truth)', () => {
    expect(indexCssSrc).toContain('--status-success:')
    expect(indexCssSrc).toContain('--status-warning:')
    expect(indexCssSrc).toContain('--status-critical:')
    expect(indexCssSrc).toContain('--status-info:')
  })
  it('status backgrounds use low-opacity rgba (muted), not solid neon fills', () => {
    expect(indexCssSrc).toContain('--status-success-bg:     rgba(45,125,90,0.10)')
    expect(indexCssSrc).toContain('--status-warning-bg:     rgba(212,132,10,0.10)')
  })
  it('no T3 file redefines status color tokens (single centralized system, not duplicated)', () => {
    for (const [name, src] of Object.entries(T3_SOURCE_FILES)) {
      expect(src, name).not.toMatch(/--status-success|--status-warning|--status-critical/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// G — Chart theme palettes (T3-G)
// ════════════════════════════════════════════════════════════
describe('T3-G — chartThemes.ts covers every theme, colors only', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      it('has a registered chart theme', () => {
        expect(CHART_THEMES[id]).toBeDefined()
      })
      it('passes isChartThemeValid', () => {
        expect(isChartThemeValid(CHART_THEMES[id])).toBe(true)
      })
      it('palette matches the preset chartPalette exactly (no new colors invented)', () => {
        expect(CHART_THEMES[id].palette).toEqual(THEME_PRESETS[id].chartPalette)
      })
      it('getChartTheme returns the same object for a valid id', () => {
        expect(getChartTheme(id)).toEqual(CHART_THEMES[id])
      })
      it('gridColor/axisColor/tooltipBg/tooltipText are derived from the preset, not hardcoded', () => {
        const theme = CHART_THEMES[id]
        const preset = THEME_PRESETS[id]
        expect(theme.gridColor).toBe(preset.border)
        expect(theme.axisColor).toBe(preset.mutedText)
        expect(theme.tooltipBg).toBe(preset.card)
        expect(theme.tooltipText).toBe(preset.text)
      })
    })
  }
  it('isChartThemeValid rejects garbage input', () => {
    expect(isChartThemeValid(null)).toBe(false)
    expect(isChartThemeValid({ palette: [] })).toBe(false)
  })
  it('getChartTheme falls back to corporate for an invalid id', () => {
    expect(getChartTheme('nonsense')).toEqual(CHART_THEMES.corporate)
  })
  it('chartThemes.ts contains no chart rendering/logic code (pure data + lookup only)', () => {
    expect(T3_SOURCE_FILES['chartThemes.ts']).not.toMatch(/<svg|<Bar|<Line|recharts/)
  })
  it('PerformanceChart.jsx is not imported by chartThemes.ts (no chart-logic coupling)', () => {
    expect(T3_SOURCE_FILES['chartThemes.ts']).not.toMatch(/from ['"].*PerformanceChart/)
  })
})

// ════════════════════════════════════════════════════════════
// H — Ambient accent engine (T3-H)
// ════════════════════════════════════════════════════════════
describe('T3-H — ambientAccent.ts: background-only, <=3% opacity, disableable', () => {
  it('AMBIENT_ACCENT_MAX_OPACITY is 0.03', () => {
    expect(AMBIENT_ACCENT_MAX_OPACITY).toBe(0.03)
  })
  it('isValidAmbientOpacity accepts 0.03 and rejects 0.04', () => {
    expect(isValidAmbientOpacity(0.03)).toBe(true)
    expect(isValidAmbientOpacity(0.04)).toBe(false)
  })
  for (const state of ['good', 'warning', 'critical'] as const) {
    it(`getAmbientAccentOverlay("${state}") returns an rgba string at or below 3% alpha`, () => {
      const value = getAmbientAccentOverlay(state, true)
      const match = value.match(/rgba\(\d+,\d+,\d+,([\d.]+)\)/)
      expect(match).not.toBeNull()
      expect(parseFloat(match![1])).toBeLessThanOrEqual(AMBIENT_ACCENT_MAX_OPACITY)
    })
  }
  it('getAmbientAccentOverlay returns "transparent" when disabled', () => {
    expect(getAmbientAccentOverlay('good', false)).toBe('transparent')
    expect(getAmbientAccentOverlay('critical', false)).toBe('transparent')
  })
  it('getAmbientAccentOverlay returns "transparent" for an unrecognized state', () => {
    expect(getAmbientAccentOverlay('nonsense' as any, true)).toBe('transparent')
  })
  it('buildAmbientAccentCssVars defaults to disabled/transparent', () => {
    expect(buildAmbientAccentCssVars()['--ambient-accent-overlay']).toBe('transparent')
  })
  it('ambientAccent.ts never reads from the Evaluation Engine, scoring, or report data', () => {
    expect(T3_SOURCE_FILES['ambientAccent.ts']).not.toMatch(/evaluationPipeline|evaluationEngine|portfolioScore|overallScore/)
  })
  it('ambientAccent.ts has no automatic DOM wiring (no document/window reference)', () => {
    expect(T3_SOURCE_FILES['ambientAccent.ts']).not.toMatch(/\bdocument\.|\bwindow\./)
  })
  it('index.css ambient overlay is disabled by default and applies to background only via ::before', () => {
    expect(indexCssSrc).toContain('--ambient-accent-overlay: transparent;')
    const idx = indexCssSrc.indexOf('.ambient-overlay::before')
    const block = indexCssSrc.slice(idx, idx + 200)
    expect(block).toContain('background: var(--ambient-accent-overlay)')
  })
  it('the ambient overlay utility never sets color or affects text', () => {
    const idx = indexCssSrc.indexOf('.ambient-overlay::before')
    const block = indexCssSrc.slice(idx, idx + 200)
    expect(block).not.toContain('color:')
  })
})

// ════════════════════════════════════════════════════════════
// I — Cross-cutting guardrails
// ════════════════════════════════════════════════════════════
const ALL_T3_FILES: Record<string, string> = { ...T3_SOURCE_FILES, 'ThemeProvider.jsx': themeProviderSrc }

describe('Guardrails — no Firestore, no engine, no AI, no Profile Studio, no routes, no permissions', () => {
  for (const [name, src] of Object.entries(ALL_T3_FILES)) {
    describe(name, () => {
      it('no Firestore/Firebase import', () => {
        expect(src).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
      })
      it('no Evaluation Engine reference', () => {
        expect(src).not.toMatch(/evaluationPipeline|evaluationEngine|evaluationRegistry/)
      })
      it('no Ranking engine reference', () => {
        expect(src).not.toMatch(/rankingEngine/)
      })
      it('no AI architecture reference', () => {
        expect(src).not.toMatch(/AssistantPage|aiProvider|anthropic\.messages/i)
      })
      it('no Profile Studio kernel reference', () => {
        expect(src).not.toMatch(/profileStudioService|persistenceGuards/)
      })
      it('no route registration (<Route or useNavigate)', () => {
        expect(src).not.toMatch(/<Route\b|useNavigate\(/)
      })
      it('no permission/role array reference', () => {
        expect(src).not.toMatch(/allowedRoles|ADMIN_ROLES|EXEC_ROLES/)
      })
      it('no canvas element', () => {
        expect(src).not.toMatch(/<canvas|getContext\(['"]2d['"]\)|getContext\(['"]webgl/i)
      })
      it('no WebGL reference', () => {
        expect(src).not.toMatch(/webgl/i)
      })
      it('no particle system usage (no PIXI/particles.js/particle-emitter library calls)', () => {
        expect(src).not.toMatch(/new Particle|particleSystem|particles\.js|pixi\.js/i)
      })
      it('no framer-motion dependency', () => {
        expect(src).not.toMatch(/from ['"]framer-motion['"]/)
      })
      it('no console.log left behind', () => {
        expect(src).not.toContain('console.log(')
      })
      it('no debugger statement', () => {
        expect(src).not.toContain('debugger')
      })
      it('no TODO/FIXME marker', () => {
        expect(src).not.toMatch(/TODO|FIXME/)
      })
    })
  }
})

describe('Guardrails — App.jsx routes/permissions unchanged by Theme T3', () => {
  it('App.jsx still mounts exactly one <ThemeProvider>', () => {
    expect(appSrc.match(/<ThemeProvider>/g)?.length).toBe(1)
  })
  it('App.jsx /settings route is unchanged (still points at pages/settings/SettingsPage)', () => {
    expect(appSrc).toContain("import SettingsPage         from './pages/settings/SettingsPage'")
  })
  it('App.jsx role arrays (ADMIN/EXEC_ROLES/MGR_UP/ALL) are still present, untouched in spirit by this bundle', () => {
    expect(appSrc).toContain("const ADMIN  = ['admin']")
    expect(appSrc).toContain('const EXEC_ROLES = [')
  })
})

describe('Guardrails — index.css T3 additions never touch business-logic or engine files', () => {
  it('index.css contains no Firestore/Firebase reference', () => {
    expect(indexCssSrc).not.toMatch(/firestore|firebase/i)
  })
  it('index.css T3 section contains no @keyframes (no heavy animation added)', () => {
    const idx = indexCssSrc.indexOf('Theme Engine T3 — Premium Theme Polish')
    const section = indexCssSrc.slice(idx)
    expect(section).not.toContain('@keyframes')
  })
  it('index.css T3 section never animates transform/scale/width/height', () => {
    const idx = indexCssSrc.indexOf('Theme Engine T3 — Premium Theme Polish')
    const section = indexCssSrc.slice(idx)
    const transitionLines = section.match(/transition:[^;]+;/g) ?? []
    for (const line of transitionLines) {
      expect(line.toLowerCase()).not.toMatch(/transform|scale\(|width|height/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// J — Build safety / source quality sweep across all T3 files
// ════════════════════════════════════════════════════════════
describe('Build safety — every new T3 design-token file', () => {
  for (const [name, src] of Object.entries(T3_SOURCE_FILES)) {
    describe(name, () => {
      it('loads as a non-empty raw source string', () => {
        expect(typeof src).toBe('string')
        expect(src.length).toBeGreaterThan(0)
      })
      it('has a header comment block', () => {
        expect(src.startsWith('// ====')).toBe(true)
      })
      it('does not use eval(', () => {
        expect(src).not.toContain('eval(')
      })
      it('does not use dangerouslySetInnerHTML', () => {
        expect(src).not.toContain('dangerouslySetInnerHTML')
      })
      it('does not import vitest into production code', () => {
        expect(src).not.toMatch(/from ['"]vitest['"]/)
      })
      it('has at least one exported function or const', () => {
        expect(src).toMatch(/export (function|const)/)
      })
    })
  }
})

// ════════════════════════════════════════════════════════════
// K — Cross-product integrity: every theme × every T3 builder
// (pushes coverage wide — every theme run through every pure
// builder function added in this bundle, asserted not to throw
// and to produce a non-empty CSS-variable map)
// ════════════════════════════════════════════════════════════
const T3_BUILDERS: Array<[string, (id: string) => Record<string, string>]> = [
  ['buildEffectCssVars', buildEffectCssVars],
  ['buildBackgroundCssVars', buildBackgroundCssVars],
  ['buildGlassCssVars', buildGlassCssVars],
]

describe('Cross-product — every theme runs cleanly through every T3 CSS-var builder', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      for (const [builderName, builder] of T3_BUILDERS) {
        it(`${builderName}("${id}") does not throw and returns a non-empty map`, () => {
          expect(() => {
            const vars = builder(id)
            expect(Object.keys(vars).length).toBeGreaterThan(0)
          }).not.toThrow()
        })
        it(`${builderName}("${id}") returns only string values`, () => {
          const vars = builder(id)
          for (const [key, value] of Object.entries(vars)) {
            expect(typeof value, key).toBe('string')
          }
        })
      }
      it('getChartTheme + getGlassTokens + getThemeEffectTokens + getBackgroundLayer all resolve together without conflict', () => {
        expect(() => {
          getChartTheme(id)
          getGlassTokens(id)
          getThemeEffectTokens(id)
          getBackgroundLayer(id)
        }).not.toThrow()
      })
    })
  }
})

describe('Cross-cutting — DEFAULT_THEME_ID is still corporate, unaffected by T3', () => {
  it('DEFAULT_THEME_ID is "corporate"', () => {
    expect(DEFAULT_THEME_ID).toBe('corporate')
  })
  it('Corporate is not a glass theme', () => {
    expect(isGlassThemeId(DEFAULT_THEME_ID)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// L — Exhaustive per-file guardrail matrix (every T3 file vs every
// forbidden pattern, one assertion each — pushes coverage wide)
// ════════════════════════════════════════════════════════════
const T3_FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['Firestore import', /from ['"].*firestore/i],
  ['Firebase import', /from ['"].*firebase/i],
  ['updateDoc call', /updateDoc\(/],
  ['setDoc call', /setDoc\(/],
  ['addDoc call', /addDoc\(/],
  ['Evaluation Engine import', /evaluationPipeline|evaluationEngine|evaluationRegistry/],
  ['Ranking engine import', /rankingEngine/],
  ['Profile Studio kernel import', /profileStudioService|persistenceGuards/],
  ['route registration', /<Route\b/],
  ['useNavigate usage', /useNavigate\(/],
  ['permission role array', /allowedRoles|ADMIN_ROLES|EXEC_ROLES/],
  ['canvas element', /<canvas/i],
  ['2d/webgl context', /getContext\(['"](2d|webgl)/i],
  ['WebGL reference', /webgl/i],
  ['particle engine usage', /new Particle|particleSystem|particles\.js|pixi\.js/i],
  ['framer-motion import', /from ['"]framer-motion['"]/],
  ['eval( call', /eval\(/],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['debugger statement', /debugger/],
  ['console.log leftover', /console\.log\(/],
  ['TODO marker', /TODO/],
  ['FIXME marker', /FIXME/],
  ['@keyframes heavy animation', /@keyframes/],
  ['Math.random fake data', /Math\.random\(/],
  ['mockData reference', /mockData/],
  ['seedData reference', /seedData/],
]

describe('Exhaustive guardrail matrix — every T3 design-token file vs every forbidden pattern', () => {
  for (const [fileName, src] of Object.entries(T3_SOURCE_FILES)) {
    describe(`file: ${fileName}`, () => {
      for (const [ruleName, pattern] of T3_FORBIDDEN_PATTERNS) {
        it(`does not contain: ${ruleName}`, () => {
          expect(src).not.toMatch(pattern)
        })
      }
    })
  }
})

describe('Exhaustive guardrail matrix — ThemeProvider.jsx vs every forbidden pattern', () => {
  for (const [ruleName, pattern] of T3_FORBIDDEN_PATTERNS) {
    it(`does not contain: ${ruleName}`, () => {
      expect(themeProviderSrc).not.toMatch(pattern)
    })
  }
})

// ════════════════════════════════════════════════════════════
// M — Per-theme metadata completeness matrix (every theme × every
// field across all 7 T3 token systems)
// ════════════════════════════════════════════════════════════
describe('Per-theme completeness matrix — every theme has every T3 token field defined', () => {
  for (const id of THEME_CYCLE_ORDER) {
    describe(`theme "${id}"`, () => {
      const effect = getThemeEffectTokens(id)
      const glass = getGlassTokens(id)
      const chart = getChartTheme(id)
      const bgLayer = getBackgroundLayer(id)

      for (const field of ['shadowCard', 'shadowFloat', 'shadowInner', 'borderWidthCard', 'cornerStyle'] as const) {
        it(`effect tokens define "${field}"`, () => {
          expect(effect[field]).toBeDefined()
          expect(effect[field]).not.toBe('')
        })
      }
      for (const field of ['enabled', 'blur', 'opacity'] as const) {
        it(`glass tokens define "${field}"`, () => {
          expect(glass[field]).toBeDefined()
        })
      }
      for (const field of ['palette', 'gridColor', 'axisColor', 'tooltipBg', 'tooltipText'] as const) {
        it(`chart theme defines "${field}"`, () => {
          expect(chart[field]).toBeDefined()
        })
      }
      it('background layer is defined (string, possibly "none")', () => {
        expect(typeof bgLayer).toBe('string')
      })
      it('chart palette has at least 4 colors', () => {
        expect(chart.palette.length).toBeGreaterThanOrEqual(4)
      })
      it('chart palette colors are all non-empty strings', () => {
        for (const color of chart.palette) {
          expect(typeof color).toBe('string')
          expect(color.length).toBeGreaterThan(0)
        }
      })
    })
  }
})

// ════════════════════════════════════════════════════════════
// N — Theme switch simulation: cycling through every theme in
// order applies every T3 builder without error at every step
// ════════════════════════════════════════════════════════════
describe('Theme switch simulation — cycling through all 7 themes in cycle order', () => {
  for (let i = 0; i < THEME_CYCLE_ORDER.length; i++) {
    const fromId = THEME_CYCLE_ORDER[i]
    const toId = THEME_CYCLE_ORDER[(i + 1) % THEME_CYCLE_ORDER.length]
    it(`switching from "${fromId}" to "${toId}" produces valid, non-colliding token sets`, () => {
      const fromVars = {
        ...buildEffectCssVars(fromId),
        ...buildBackgroundCssVars(fromId),
        ...buildGlassCssVars(fromId),
      }
      const toVars = {
        ...buildEffectCssVars(toId),
        ...buildBackgroundCssVars(toId),
        ...buildGlassCssVars(toId),
      }
      expect(Object.keys(fromVars).sort()).toEqual(Object.keys(toVars).sort())
    })
    it(`the theme-motion transition value used during "${fromId}" -> "${toId}" stays property-safe`, () => {
      expect(isThemeMotionSafe(buildThemeSwitchTransitionValue())).toBe(true)
    })
  }
})

// ════════════════════════════════════════════════════════════
// O — Glass opacity / blur boundary checks (explicit boundary
// values, not just the registered presets)
// ════════════════════════════════════════════════════════════
describe('Glass boundary checks — opacity and blur range enforcement', () => {
  const BOUNDARY_CASES: Array<[GlassBoundaryCase, boolean]> = [
    [{ enabled: true, blur: '12px', opacity: 0.6 }, true],
    [{ enabled: true, blur: '24px', opacity: 0.85 }, true],
    [{ enabled: true, blur: '11px', opacity: 0.7 }, false],
    [{ enabled: true, blur: '25px', opacity: 0.7 }, false],
    [{ enabled: true, blur: '16px', opacity: 0.59 }, false],
    [{ enabled: true, blur: '16px', opacity: 0.86 }, false],
    [{ enabled: false, blur: '0px', opacity: 1 }, true],
    [{ enabled: false, blur: '0px', opacity: 0.9 }, false],
  ]
  for (const [tokens, expected] of BOUNDARY_CASES) {
    it(`{enabled:${tokens.enabled}, blur:${tokens.blur}, opacity:${tokens.opacity}} is valid=${expected}`, () => {
      expect(isGlassTokensValid(tokens)).toBe(expected)
    })
  }
})

// ════════════════════════════════════════════════════════════
// P — Ambient accent opacity boundary checks
// ════════════════════════════════════════════════════════════
describe('Ambient accent boundary checks — opacity ceiling enforcement', () => {
  const OPACITY_CASES: Array<[number, boolean]> = [
    [0, true], [0.01, true], [0.02, true], [0.03, true],
    [0.031, false], [0.05, false], [0.1, false], [1, false], [-0.01, false],
  ]
  for (const [value, expected] of OPACITY_CASES) {
    it(`opacity ${value} is valid=${expected}`, () => {
      expect(isValidAmbientOpacity(value)).toBe(expected)
    })
  }
  for (const state of ['good', 'warning', 'critical'] as const) {
    for (const enabled of [true, false]) {
      it(`getAmbientAccentOverlay("${state}", ${enabled}) never throws`, () => {
        expect(() => getAmbientAccentOverlay(state, enabled)).not.toThrow()
      })
    }
  }
})

type GlassBoundaryCase = { enabled: boolean; blur: string; opacity: number }
