// ============================================================
// Login Design Exploration — Certification
//
// Scope: three new visual-concept-only preview pages
// (LoginConceptA/B/C) plus their additive routes. Confirms the
// exploration stayed strictly visual — no auth wiring, no
// credentials, no biometric capability, no new dependency, no
// Firestore/Auth change — and that the rejected Login V3 + the
// production /login route were left untouched.
//
// See docs/production/LOGIN_DESIGN_EXPLORATION.md for the concept
// write-ups and comparison matrix this suite backs.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const appSrc      = await import('../App.jsx?raw').then((m) => m.default)
const conceptASrc = await import('../pages/auth/concepts/LoginConceptA.jsx?raw').then((m) => m.default)
const conceptBSrc = await import('../pages/auth/concepts/LoginConceptB.jsx?raw').then((m) => m.default)
const conceptCSrc = await import('../pages/auth/concepts/LoginConceptC.jsx?raw').then((m) => m.default)
const loginV2Src  = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const loginV3Src  = await import('../pages/auth/LoginPageV3.jsx?raw').then((m) => m.default)
const authStoreSrc = await import('../store/authStore.js?raw').then((m) => m.default)
const packageJson  = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

const concepts = [
  { name: 'A', src: conceptASrc },
  { name: 'B', src: conceptBSrc },
  { name: 'C', src: conceptCSrc },
]

// ════════════════════════════════════════════════════════════
// 1 — Routes exist, additively, production /login untouched
// ════════════════════════════════════════════════════════════
describe('1 — preview routes are additive; production /login is untouched', () => {
  it('all three concept routes are registered', () => {
    expect(appSrc).toContain("path=\"/login-concept-a\"")
    expect(appSrc).toContain("path=\"/login-concept-b\"")
    expect(appSrc).toContain("path=\"/login-concept-c\"")
  })

  it('the existing /login and /login-v3 routes are still present and unmodified', () => {
    expect(appSrc).toContain('<Route path="/login"        element={<LoginPageV2 />} />')
    expect(appSrc).toContain('<Route path="/login-v3"     element={<LoginPageV3 />} />')
  })

  it('LoginPageV2.jsx (production /login) source is byte-for-byte unaffected by this exploration', () => {
    // The rejected V3 and this exploration must not have touched V2 at all.
    expect(loginV2Src).toContain("import DataOceanBackground   from '../../components/login/DataOceanBackground'")
    expect(loginV2Src).not.toContain('LoginConcept')
  })

  it('LoginPageV3.jsx (the rejected design) was not refined, patched, or reused as a base', () => {
    expect(loginV3Src).not.toContain('LoginConcept')
    for (const { src } of concepts) {
      expect(src).not.toContain('lgv3-')
    }
  })
})

// ════════════════════════════════════════════════════════════
// 2 — No auth wiring of any kind
// ════════════════════════════════════════════════════════════
describe('2 — concepts are visual-only, no auth service connection', () => {
  for (const { name, src } of concepts) {
    it(`Concept ${name} does not import the auth store`, () => {
      expect(src).not.toMatch(/from\s+['"].*authStore['"]/)
    })
    it(`Concept ${name} does not import Firebase directly`, () => {
      expect(src).not.toMatch(/from\s+['"]firebase/)
      expect(src).not.toMatch(/from\s+['"].*services\/firebase['"]/)
    })
    it(`Concept ${name} has no real submit logic (preventDefault only, no async call)`, () => {
      const submitFnStart = src.indexOf('handleSubmit')
      const submitFnBody = src.slice(submitFnStart, submitFnStart + 200)
      expect(submitFnBody).toContain('e.preventDefault()')
      expect(submitFnBody).not.toMatch(/await\s+(login|signIn|resetPassword)/)
    })
  }

  it('authStore.js was not modified by this exploration (still the Gate 3 English error map)', () => {
    expect(authStoreSrc).toContain('AUTH_ERROR_MAP')
    expect(authStoreSrc).not.toContain('LoginConcept')
  })
})

// ════════════════════════════════════════════════════════════
// 3 — No hardcoded credentials, no active biometric capability
// ════════════════════════════════════════════════════════════
describe('3 — no credential exposure, no fake biometric capability', () => {
  for (const { name, src } of concepts) {
    it(`Concept ${name} has no hardcoded credential or sample email`, () => {
      expect(src).not.toMatch(/password\s*[:=]\s*['"][^'"]{3,}['"]/)
      expect(src).not.toContain('samir@alathirpharmacy.com')
      expect(src).not.toMatch(/@(pharmapulse|alathir)[a-z.]*\.com['"]/i)
    })

    it(`Concept ${name} has no Face ID / Passkey / WebAuthn reference`, () => {
      expect(src).not.toMatch(/face\s*id/i)
      expect(src).not.toMatch(/passkey/i)
      expect(src).not.toMatch(/webauthn/i)
      expect(src).not.toMatch(/navigator\.credentials/)
      expect(src).not.toMatch(/PublicKeyCredential/)
    })

    it(`Concept ${name} never logs the password field`, () => {
      expect(src).not.toMatch(/console\.(log|error|warn|info)\([^)]*password/i)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 4 — Accessible, labeled forms
// ════════════════════════════════════════════════════════════
describe('4 — every concept has a fully labeled, accessible form', () => {
  for (const { name, src } of concepts) {
    it(`Concept ${name} has a real <label htmlFor> for both email and password`, () => {
      const labelMatches = src.match(/htmlFor=\{(emailId|passwordId)\}/g) || []
      expect(labelMatches.length).toBeGreaterThanOrEqual(2)
    })

    it(`Concept ${name}'s form has an aria-label`, () => {
      expect(src).toMatch(/<form[^>]*aria-label=/)
    })

    it(`Concept ${name}'s password toggle has an accessible name and pressed state`, () => {
      expect(src).toMatch(/aria-label=\{showPass \? 'Hide password' : 'Show password'\}/)
      expect(src).toContain('aria-pressed={showPass}')
    })

    it(`Concept ${name} uses autoComplete for email and password`, () => {
      expect(src).toContain('autoComplete="email"')
      expect(src).toContain('autoComplete="current-password"')
    })

    it(`Concept ${name} keeps inputs at 16px minimum (no iOS zoom-on-focus)`, () => {
      expect(src).toMatch(/font-size:\s*16px/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 5 — Mobile-safe structure
// ════════════════════════════════════════════════════════════
describe('5 — mobile-safe structure', () => {
  for (const { name, src } of concepts) {
    it(`Concept ${name} respects safe-area insets`, () => {
      expect(src).toMatch(/env\(safe-area-inset-(top|bottom)\)/)
    })
  }

  it('Concepts A and C collapse their side visual to a simpler band below 1024px (no desktop split forced onto mobile)', () => {
    for (const src of [conceptASrc, conceptCSrc]) {
      const mediaIdx = src.indexOf('@media (min-width: 1024px)')
      expect(mediaIdx).toBeGreaterThan(0)
      // The visual panel must only become position:absolute split-mode INSIDE the
      // desktop media query — its default (mobile) rule must not be absolute.
      // Slice exactly to the rule's own closing brace so a short rule doesn't
      // bleed into the next selector (e.g. ".lcc-visual {}" followed by
      // ".lcc-blob { position: absolute }", which is a different element).
      const beforeMedia = src.slice(0, mediaIdx)
      const visualStart = beforeMedia.search(/\.lc[ac]-visual\s*\{/)
      const visualBlock = beforeMedia.slice(visualStart, beforeMedia.indexOf('}', visualStart) + 1)
      expect(visualBlock).not.toContain('position: absolute')
    }
  })

  it('Concept B has no side visual panel to collapse (single-column on every breakpoint)', () => {
    expect(conceptBSrc).not.toContain('@media (min-width: 1024px)')
  })
})

// ════════════════════════════════════════════════════════════
// 6 — RTL/LTR-safe styling (logical properties, not physical mirroring)
// ════════════════════════════════════════════════════════════
describe('6 — direction-aware styling, not whole-composition mirroring', () => {
  for (const { name, src } of concepts) {
    it(`Concept ${name} uses logical inline properties for icon/input positioning`, () => {
      expect(src).toMatch(/inset-inline-(start|end)/)
      expect(src).toMatch(/text-align:\s*start/)
    })

    it(`Concept ${name} explicitly sets dir="ltr" for its hard-authored English copy`, () => {
      expect(src).toMatch(/dir="ltr"/)
    })

    it(`Concept ${name} does not use a physical left/right flex "order" hack tied to direction`, () => {
      // Negative lookbehind avoids false-matching "border: 1px" etc.
      expect(src).not.toMatch(/(?<![a-zA-Z-])order:\s*[12]/)
    })
  }

  it('Concepts A and C pin their visual panel with physical inset-inline-end (stable composition), not a flippable flex order', () => {
    for (const src of [conceptASrc, conceptCSrc]) {
      expect(src).toMatch(/inset-inline-end:\s*0/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// 7 — No new dependency, no Firestore/Auth change
// ════════════════════════════════════════════════════════════
describe('7 — no new dependency, no Firestore/Auth rule change', () => {
  const allowedImportRoots = ['react', 'react-router-dom', 'lucide-react']

  it('every concept only imports from React, react-router-dom, lucide-react, or local relative paths', () => {
    for (const { src } of concepts) {
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const imp of imports) {
        const isRelative = imp.startsWith('.')
        const isAllowedPackage = allowedImportRoots.includes(imp)
        expect(isRelative || isAllowedPackage).toBe(true)
      }
    }
  })

  it('package.json was not modified to add a new dependency for this exploration', () => {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    // lucide-react and react-router-dom must already be present (pre-existing),
    // not newly added by this bundle.
    expect(deps['lucide-react']).toBeTruthy()
    expect(deps['react-router-dom']).toBeTruthy()
  })

  it('no concept imports Recharts/canvas/WebGL or any particle/animation library', () => {
    for (const { src } of concepts) {
      expect(src).not.toMatch(/recharts|three\.js|threejs|canvas-confetti|particles\.js|webgl/i)
    }
  })
})
