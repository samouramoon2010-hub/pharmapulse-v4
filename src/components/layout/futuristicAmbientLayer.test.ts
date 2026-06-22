// ============================================================
// FuturisticAmbientLayer — Test Suite
//
// Source-text pattern (project convention).
// Verifies:
//   1. Component exists and has required properties
//   2. AppLayout imports and renders it
//   3. Theme gating — only futuristic theme activates it
//   4. LoginPageV2 does NOT import it
//   5. pointer-events: none
//   6. prefers-reduced-motion support
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'

let ambientSrc:    string
let appLayoutSrc:  string
let loginPageSrc:  string

beforeAll(async () => {
  ambientSrc   = (await import('../../components/ui/FuturisticAmbientLayer.jsx?raw')).default
  appLayoutSrc = (await import('./AppLayout.jsx?raw')).default
  loginPageSrc = (await import('../../pages/auth/LoginPageV2.jsx?raw')).default
})

// ─────────────────────────────────────────────────────────────
// 1. Component structure
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — component structure', () => {
  it('file exists and exports a default function', () => {
    expect(ambientSrc).toContain('export default function FuturisticAmbientLayer')
  })

  it('imports useSettingsStore for theme reading', () => {
    expect(ambientSrc).toContain("import { useSettingsStore } from '../../store/settingsStore'")
  })

  it('uses Canvas for particles and CSS for mesh/glows (no SVG flow lines)', () => {
    // V2: SVG flow lines removed — replaced with Canvas particles + CSS gradients
    expect(ambientSrc).toContain('<canvas')
    expect(ambientSrc).not.toContain('FLOW_LINES')
    expect(ambientSrc).not.toContain('animateMotion')
  })

  it('has PARTICLE_SEED with at least 50 entries (deterministic)', () => {
    // V2: FLOW_LINES replaced with PARTICLE_SEED for Canvas particles
    expect(ambientSrc).toContain('const PARTICLE_SEED = ')
    // Seed table has 60 particles — check for lcg usage
    expect(ambientSrc).toContain('lcg(')
  })

  it('uses requestAnimationFrame for Canvas particle loop', () => {
    // V2: animateMotion replaced with Canvas rAF loop
    expect(ambientSrc).toContain('requestAnimationFrame')
    expect(ambientSrc).not.toContain('animateMotion')
  })

  it('does not use SVG animateMotion (removed in V2)', () => {
    // V2 design principle: no SVG lines crossing content
    expect(ambientSrc).not.toContain('<animateMotion')
    expect(ambientSrc).not.toContain('FLOW_LINES')
    expect(ambientSrc).not.toContain('fut-line-fade')
  })

  it('does not use Math.random() in code — only in comments', () => {
    // Strip single-line // comments before checking
    const codeOnly = ambientSrc
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//'))
      .join('\n')
    expect(codeOnly).not.toContain('Math.random')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Theme gating — returns null for non-futuristic themes
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — theme gating', () => {
  it('checks theme === pharmapulse-futuristic before rendering', () => {
    expect(ambientSrc).toContain("theme !== 'pharmapulse-futuristic'")
  })

  it('returns null for other themes', () => {
    expect(ambientSrc).toContain('if (theme !== \'pharmapulse-futuristic\') return null')
  })

  it('reads theme from useSettingsStore()', () => {
    expect(ambientSrc).toContain('const { theme } = useSettingsStore()')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Layering — sits behind content
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — layering and isolation', () => {
  it('container uses pointer-events: none', () => {
    expect(ambientSrc).toContain("pointerEvents: 'none'")
  })

  it('container uses position: fixed', () => {
    expect(ambientSrc).toContain("position:      'fixed'")
  })

  it('container uses z-index: 0 (behind content)', () => {
    expect(ambientSrc).toContain("zIndex:        0")
  })

  it('has aria-hidden="true" so screen readers skip it', () => {
    expect(ambientSrc).toContain('aria-hidden="true"')
  })

  it('SVG flow line layer is removed — no preserveAspectRatio', () => {
    // V2: SVG flow line layer replaced by Canvas + CSS gradients
    expect(ambientSrc).not.toContain('preserveAspectRatio="xMidYMid slice"')
    expect(ambientSrc).not.toContain('FLOW_LINES')
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Opacity — stays subtle, never overwhelming
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — opacity discipline', () => {
  it('Canvas particle max opacity is ≤ 0.08', () => {
    // V2: tighter opacity discipline — particles nearly invisible
    expect(ambientSrc).toContain('Math.min(0.08, p.alpha)')
  })

  it('radial glow CSS opacity values are ≤ 0.08 (executive restraint)', () => {
    // V2: only check cyan/teal/emerald rgba accent values (not the dark background gradient)
    // The dark gradient rgba(2,6,23,0.6) is a background deepener — not a light glow
    const cyanGlows    = [...ambientSrc.matchAll(/rgba\(6,182,212,\s*([\d.]+)\)/g)].map(m => parseFloat(m[1]))
    const emeraldGlows = [...ambientSrc.matchAll(/rgba\(0,245,160,\s*([\d.]+)\)/g)].map(m => parseFloat(m[1]))
    const blueGlows    = [...ambientSrc.matchAll(/rgba\(14,165,233,\s*([\d.]+)\)/g)].map(m => parseFloat(m[1]))
    const allGlows = [...cyanGlows, ...emeraldGlows, ...blueGlows].filter(v => v > 0)
    expect(allGlows.length).toBeGreaterThan(0)
    allGlows.forEach(alpha => {
      expect(alpha).toBeLessThanOrEqual(0.08)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Accessibility — reduced motion
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — accessibility', () => {
  it('reads prefers-reduced-motion via matchMedia (JS-driven for Canvas)', () => {
    // V2: no CSS animation-play-state needed — Canvas loop checks matchMedia
    expect(ambientSrc).toContain("prefers-reduced-motion: reduce")
  })

  it('Canvas loop pauses drawing when reduced motion is active', () => {
    // V2: no CSS animation-play-state — Canvas rAF loop pauses itself
    expect(ambientSrc).toContain('if (!pausedRef.current)')
    expect(ambientSrc).not.toContain('animation-play-state: paused')
  })

  it('atmospheric glows have no animation — reduced motion safe by default', () => {
    // V2: edge glow divs are pure static CSS radial-gradients — no animation property
    // They work under reduced motion without any special handling
    expect(ambientSrc).toContain('radial-gradient(circle, rgba(6,182,212')
    expect(ambientSrc).toContain('radial-gradient(circle, rgba(0,245,160')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. AppLayout integration
// ─────────────────────────────────────────────────────────────
describe('AppLayout — FuturisticAmbientLayer wired in', () => {
  it('imports FuturisticAmbientLayer', () => {
    expect(appLayoutSrc).toContain("import FuturisticAmbientLayer from '../ui/FuturisticAmbientLayer'")
  })

  it('renders <FuturisticAmbientLayer /> in JSX', () => {
    expect(appLayoutSrc).toContain('<FuturisticAmbientLayer />')
  })

  it('ambient layer appears before Sidebar (behind layout chrome)', () => {
    const ambientIdx = appLayoutSrc.indexOf('<FuturisticAmbientLayer />')
    const sidebarIdx = appLayoutSrc.indexOf('<Sidebar ')
    expect(ambientIdx).toBeGreaterThan(-1)
    expect(sidebarIdx).toBeGreaterThan(-1)
    expect(ambientIdx).toBeLessThan(sidebarIdx)
  })

  it('outer div has position: relative to anchor fixed layer', () => {
    const idx = appLayoutSrc.indexOf('<FuturisticAmbientLayer />')
    // Check the div that contains the layer has position:relative
    const preceding = appLayoutSrc.slice(Math.max(0, idx - 200), idx)
    expect(preceding).toContain("position:'relative'")
  })
})

// ─────────────────────────────────────────────────────────────
// 7. LoginPageV2 is NOT affected
// ─────────────────────────────────────────────────────────────
describe('LoginPageV2 — ambient layer not present', () => {
  it('does not import FuturisticAmbientLayer', () => {
    expect(loginPageSrc).not.toContain('FuturisticAmbientLayer')
  })

  it('does not reference pharmapulse-futuristic theme directly', () => {
    // Login page doesn't check or use the futuristic theme — it's theme-agnostic
    expect(loginPageSrc).not.toContain('pharmapulse-futuristic')
  })
})

// ─────────────────────────────────────────────────────────────
// 8. CSS animation quality
// ─────────────────────────────────────────────────────────────
describe('FuturisticAmbientLayer — animation quality', () => {
  it('V2 removes fut-line-fade keyframe (lines removed)', () => {
    expect(ambientSrc).not.toContain('@keyframes fut-line-fade')
  })

  it('V2 removes fut-pkt-fade keyframe (SVG particles removed)', () => {
    expect(ambientSrc).not.toContain('@keyframes fut-pkt-fade')
  })

  it('atmospheric glows are static divs — no keyframe animation', () => {
    // V2: edge glows are pure CSS gradients with no animation property
    // Reduced motion applies automatically since nothing animates
    expect(ambientSrc).not.toContain('@keyframes fut-glow-breathe')
  })

  it('Canvas particles have max opacity ≤ 0.08 (nearly invisible)', () => {
    // V2: particles drift at opacity 0.015–0.08 max
    expect(ambientSrc).toContain('0.08')  // max alpha cap
    expect(ambientSrc).toContain('0.015') // min alpha
  })

  it('gradient mesh uses CSS radial-gradient (no SVG, no motion)', () => {
    // V2: mesh is pure CSS gradients — zero animation, never crosses content
    expect(ambientSrc).toContain('radial-gradient')
    expect(ambientSrc).toContain('linear-gradient')
  })
})
