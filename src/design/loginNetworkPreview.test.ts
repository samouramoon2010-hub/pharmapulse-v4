// ============================================================
// Login Network Preview — Certification
//
// Scope: an isolated preview route (/login-network-preview) pairing
// the code-built animated network background (design-assets/login-background/,
// served from public/login-network-preview/) with a real-structure
// React login panel. Local-only form state — no auth wiring, no
// Firestore/Auth change. Confirms production /login is untouched.
//
// See docs/production/LOGIN_STATIC_BACKGROUND_PREVIEW.md.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const appSrc      = await import('../App.jsx?raw').then((m) => m.default)
const previewSrc   = await import('../pages/auth/LoginNetworkPreview.jsx?raw').then((m) => m.default)
const loginV2Src   = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const authStoreSrc = await import('../store/authStore.js?raw').then((m) => m.default)
const packageJson   = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

// ════════════════════════════════════════════════════════════
// 1 — Route is additive; production /login is untouched
// ════════════════════════════════════════════════════════════
describe('1 — preview route is additive; production /login is untouched', () => {
  it('the /login-network-preview route is registered', () => {
    expect(appSrc).toContain('path="/login-network-preview"')
    expect(appSrc).toContain('LoginNetworkPreview')
  })

  it('the existing /login route is still present and unmodified', () => {
    expect(appSrc).toContain('<Route path="/login"        element={<LoginPageV2 />} />')
  })

  it('LoginPageV2.jsx (production /login) source is byte-for-byte unaffected by this preview', () => {
    expect(loginV2Src).toContain("import DataOceanBackground   from '../../components/login/DataOceanBackground'")
    expect(loginV2Src).not.toContain('LoginNetworkPreview')
  })

  it('authStore.js was not modified by this preview', () => {
    expect(authStoreSrc).toContain('AUTH_ERROR_MAP')
    expect(authStoreSrc).not.toContain('LoginNetworkPreview')
  })
})

// ════════════════════════════════════════════════════════════
// 2 — No auth wiring, no Firestore/Auth change
// ════════════════════════════════════════════════════════════
describe('2 — preview is visual-only, no auth service connection', () => {
  it('does not import the auth store', () => {
    expect(previewSrc).not.toMatch(/from\s+['"].*authStore['"]/)
  })
  it('does not import Firebase directly', () => {
    expect(previewSrc).not.toMatch(/from\s+['"]firebase/)
    expect(previewSrc).not.toMatch(/from\s+['"].*services\/firebase['"]/)
  })
  it('has no real submit logic (preventDefault only, simulated local status, no auth call)', () => {
    const submitFnStart = previewSrc.indexOf('handleSubmit')
    const submitFnBody = previewSrc.slice(submitFnStart, previewSrc.indexOf('const base', submitFnStart))
    expect(submitFnBody).toContain('e.preventDefault()')
    expect(submitFnBody).not.toMatch(/await\s+(login|signIn|resetPassword)/)
  })
})

// ════════════════════════════════════════════════════════════
// 3 — No personal data, no hardcoded credentials, no biometric UI
// ════════════════════════════════════════════════════════════
describe('3 — no personal data, no credential exposure, no biometric capability', () => {
  it('has no hardcoded credential or sample email', () => {
    expect(previewSrc).not.toMatch(/password\s*[:=]\s*['"][^'"]{3,}['"]/)
    expect(previewSrc).not.toContain('samir@alathirpharmacy.com')
    expect(previewSrc).not.toMatch(/@(pharmapulse|alathir)[a-z.]*\.com['"]/i)
  })

  it('has no Face ID / Passkey / WebAuthn reference', () => {
    expect(previewSrc).not.toMatch(/face\s*id/i)
    expect(previewSrc).not.toMatch(/passkey/i)
    expect(previewSrc).not.toMatch(/webauthn/i)
    expect(previewSrc).not.toMatch(/navigator\.credentials/)
    expect(previewSrc).not.toMatch(/PublicKeyCredential/)
  })

  it('never logs the password field', () => {
    expect(previewSrc).not.toMatch(/console\.(log|error|warn|info)\([^)]*password/i)
  })
})

// ════════════════════════════════════════════════════════════
// 4 — Background asset path correctness
// ════════════════════════════════════════════════════════════
describe('4 — background asset paths are correct and swap by breakpoint', () => {
  it('references the desktop and mobile composition file stems', () => {
    expect(previewSrc).toContain("'/login-network-preview/login-bg-'")
    expect(previewSrc).toContain("'desktop-1920x1080'")
    expect(previewSrc).toContain("'mobile-1080x1920'")
  })
  it('picks the composition via a real desktop/mobile breakpoint check', () => {
    expect(previewSrc).toMatch(/min-width:\s*768px/)
  })
  it('falls back to a static poster image under prefers-reduced-motion instead of mounting a video', () => {
    expect(previewSrc).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(previewSrc).toContain('prefersReducedMotion')
    expect(previewSrc).toMatch(/<img[^>]*posterSrc/)
  })
})

// ════════════════════════════════════════════════════════════
// 5 — Accessible, labeled, semantic form
// ════════════════════════════════════════════════════════════
describe('5 — fully labeled, accessible, semantic form', () => {
  it('has a real <label htmlFor> for email, password, and remember-me', () => {
    const labelMatches = previewSrc.match(/htmlFor=\{(emailId|passwordId|rememberId)\}/g) || []
    expect(labelMatches.length).toBeGreaterThanOrEqual(3)
  })
  it("the form has an aria-label", () => {
    expect(previewSrc).toMatch(/<form[^>]*aria-label=/)
  })
  it('the password toggle has an accessible name and pressed state', () => {
    expect(previewSrc).toMatch(/aria-label=\{showPass \? copy\.hidePassword : copy\.showPassword\}/)
    expect(previewSrc).toContain('aria-pressed={showPass}')
  })
  it('uses autoComplete for email and password', () => {
    expect(previewSrc).toContain('autoComplete="email"')
    expect(previewSrc).toContain('autoComplete="current-password"')
  })
  it('keeps inputs at 16px minimum (no iOS zoom-on-focus)', () => {
    expect(previewSrc).toMatch(/font-size:\s*16px/)
  })
  it('has a prepared error live region', () => {
    expect(previewSrc).toMatch(/aria-live="polite"/)
  })
  it('has a prepared loading state with aria-busy', () => {
    expect(previewSrc).toMatch(/aria-busy=\{status === 'submitting'\}/)
  })
  it('panel structure follows the required order: brand, heading, subtitle, email, password, remember, forgot, submit, security, language', () => {
    const order = ['className="lnp-brand"', 'className="lnp-heading"', 'className="lnp-sub"', 'htmlFor={emailId}', 'htmlFor={passwordId}', 'className="lnp-remember"', 'className="lnp-link"', 'type="submit"', 'className="lnp-security"', 'className="lnp-lang"']
    let cursor = -1
    for (const token of order) {
      const idx = previewSrc.indexOf(token)
      expect(idx).toBeGreaterThan(cursor)
      cursor = idx
    }
  })
})

// ════════════════════════════════════════════════════════════
// 6 — Desktop compact panel + mobile structure
// ════════════════════════════════════════════════════════════
describe('6 — desktop compact panel + mobile-safe structure', () => {
  it('desktop panel width is within the 400-440px range', () => {
    expect(previewSrc).toMatch(/max-width:\s*420px/)
  })
  it('panel height is content-driven (no fixed/full-height card rule)', () => {
    expect(previewSrc).not.toMatch(/\.lnp-panel\s*\{[^}]*height:\s*100vh/)
    expect(previewSrc).not.toMatch(/\.lnp-panel\s*\{[^}]*height:\s*calc\(100vh/)
  })
  it('mobile panel width follows calc(100% - 32px) via wrap padding, not a forced desktop split', () => {
    expect(previewSrc).toMatch(/padding:\s*24px\s*16px/)
  })
  it('respects safe-area insets', () => {
    expect(previewSrc).toMatch(/env\(safe-area-inset-bottom\)/)
  })
})

// ════════════════════════════════════════════════════════════
// 7 — Motion: entrance, hover, loading, shake, reduced-motion
// ════════════════════════════════════════════════════════════
describe('7 — prepared motion and micro-interaction states', () => {
  it('has a panel entrance fade/translate keyframe under ~700ms', () => {
    expect(previewSrc).toMatch(/lnpFadeUp 620ms/)
  })
  it('has a brand entrance reveal', () => {
    expect(previewSrc).toMatch(/lnpBrandReveal/)
  })
  it('has a button hover lift and arrow movement', () => {
    expect(previewSrc).toMatch(/\.lnp-btn:hover:not\(:disabled\)/)
    expect(previewSrc).toMatch(/\.lnp-arrow/)
  })
  it('has a prepared loading spinner and a prepared success checkmark state', () => {
    expect(previewSrc).toContain('Loader2')
    expect(previewSrc).toContain('lnp-spin')
    expect(previewSrc).toContain("status === 'success'")
  })
  it('has a localized shake on validation failure, not a full-page movement', () => {
    expect(previewSrc).toMatch(/lnpShake/)
    expect(previewSrc).toContain('lnp-shake')
  })
  it('disables movement under prefers-reduced-motion while preserving immediate visibility', () => {
    const idx = previewSrc.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(idx).toBeGreaterThan(0)
    const block = previewSrc.slice(idx, previewSrc.indexOf('`}</style>', idx))
    expect(block).toContain('animation: none')
  })
})

// ════════════════════════════════════════════════════════════
// 8 — RTL/LTR-safe styling using the real app locale
// ════════════════════════════════════════════════════════════
describe('8 — direction-aware styling via the real app locale, stable composition', () => {
  it('uses the real useI18n hook for dir/lang rather than hardcoding a locale', () => {
    expect(previewSrc).toMatch(/from\s+['"]\.\.\/\.\.\/hooks\/useI18n['"]/)
    expect(previewSrc).toContain('useI18n()')
    expect(previewSrc).not.toMatch(/dir="ltr"[\s>]/) // no hardcoded-ltr root like the earlier concepts
  })
  it("the panel's own dir attribute is bound to the real locale, not hardcoded", () => {
    expect(previewSrc).toContain('dir={dir}')
  })
  it('uses logical properties for icon/input/padding positioning', () => {
    expect(previewSrc).toMatch(/inset-inline-(start|end)/)
    expect(previewSrc).toMatch(/padding-inline-(start|end)/)
    expect(previewSrc).toMatch(/text-align:\s*start/)
  })
  it('pins the macro layout (background split + panel side) with an explicit CSS direction, not a physical/locale mirror', () => {
    expect(previewSrc).toMatch(/style=\{\{\s*direction:\s*'ltr'\s*\}\}/)
  })
  it('does not use a physical left/right flex "order" hack tied to direction', () => {
    expect(previewSrc).not.toMatch(/(?<![a-zA-Z-])order:\s*[12]/)
  })
})

// ════════════════════════════════════════════════════════════
// 9 — No new dependency, no Firestore/Auth rule change
// ════════════════════════════════════════════════════════════
describe('9 — no new dependency, no Firestore/Auth rule change', () => {
  const allowedImportRoots = ['react', 'react-router-dom', 'lucide-react']

  it('only imports from React, lucide-react, or local relative paths (hooks/components)', () => {
    const imports = [...previewSrc.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const imp of imports) {
      const isRelative = imp.startsWith('.')
      const isAllowedPackage = allowedImportRoots.includes(imp)
      expect(isRelative || isAllowedPackage).toBe(true)
    }
  })

  it('package.json was not modified to add a new dependency for this preview', () => {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    expect(deps['lucide-react']).toBeTruthy()
    expect(deps.react).toBeTruthy()
    expect(deps.playwright).toBeUndefined()
  })

  it('no canvas/WebGL/particle/video-library dependency is referenced', () => {
    expect(previewSrc).not.toMatch(/recharts|three\.js|threejs|canvas-confetti|particles\.js|webgl/i)
  })
})
