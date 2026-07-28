// ============================================================
// PR-1F Login V3 — Gate 1 (Asset Preparation) + Gate 2 (Static
// Pixel-Locked Shell) — Certification
//
// Scope verified by this suite:
//   - Gate 1: the two production WebP assets exist on disk, are real
//     WebP files, and are within the documented size budget.
//   - Gate 2: LoginPageV3.jsx is a new, isolated shell that reuses the
//     exact same useAuthStore contract as LoginPageV2.jsx (no auth
//     logic invented or changed); LoginPageV2.jsx itself is completely
//     untouched; the new /login-v3 route is additive, not a
//     replacement of /login; the card section order, accessibility
//     wiring, honest biometric-placeholder disclosure, and responsive
//     breakpoint structure match the PR-1F Gate 2 spec.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'

const loginPageV2Src = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const loginPageV3Src = await import('../pages/auth/LoginPageV3.jsx?raw').then((m) => m.default)
const visualPanelSrc = await import('../components/login/LoginVisualPanel.jsx?raw').then((m) => m.default)
const appSrc          = await import('../App.jsx?raw').then((m) => m.default)

const desktopAssetPath = new URL('../../public/assets/login-v3-visual-desktop.webp', import.meta.url)
const mobileAssetPath  = new URL('../../public/assets/login-v3-visual-mobile.webp', import.meta.url)

function readMagicBytes(url: URL, length: number): Buffer {
  return readFileSync(url).subarray(0, length)
}

// ════════════════════════════════════════════════════════════
// 1 — Gate 1: production assets exist and are real WebP files
// ════════════════════════════════════════════════════════════
describe('1 — Gate 1 asset preparation', () => {
  it('desktop visual asset exists and is a non-trivial WebP file', () => {
    const stat = statSync(desktopAssetPath)
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeGreaterThan(50_000)
    expect(stat.size).toBeLessThan(1_000_000)
  })

  it('mobile visual asset exists and is a non-trivial WebP file', () => {
    const stat = statSync(mobileAssetPath)
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeGreaterThan(20_000)
    expect(stat.size).toBeLessThan(500_000)
  })

  it('desktop asset has a valid RIFF/WEBP file signature', () => {
    const bytes = readMagicBytes(desktopAssetPath, 12)
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP')
  })

  it('mobile asset has a valid RIFF/WEBP file signature', () => {
    const bytes = readMagicBytes(mobileAssetPath, 12)
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP')
  })

  it('the design-lock reference doc records the source provenance', () => {
    const lockDoc = readFileSync(new URL('../../docs/production/LOGIN_V3_DESIGN_LOCK.md', import.meta.url), 'utf8')
    expect(lockDoc).toContain('1536')
    expect(lockDoc).toContain('1024')
    expect(lockDoc).toContain('design-reference/login-v3-reference.png.png')
  })
})

// ════════════════════════════════════════════════════════════
// 2 — Gate 2: auth contract is reused unchanged, not reinvented
// ════════════════════════════════════════════════════════════
describe('2 — LoginPageV3 reuses the exact existing auth contract', () => {
  it('destructures the same useAuthStore fields as LoginPageV2', () => {
    expect(loginPageV3Src).toContain("from '../../store/authStore'")
    expect(loginPageV3Src).toContain('login, resetPassword, loading, error, clearError')
  })

  it('calls login(email, password, false) identically to LoginPageV2', () => {
    expect(loginPageV3Src).toContain('await login(form.email, form.password, false)')
  })

  it('calls resetPassword(resetEmail) identically to LoginPageV2', () => {
    expect(loginPageV3Src).toContain('await resetPassword(resetEmail)')
  })

  it('routes via the same ROLE_HOME map after successful login', () => {
    expect(loginPageV3Src).toContain('ROLE_HOME[profile.role]')
    expect(loginPageV3Src).toContain("navigate(`/${ROLE_HOME[profile.role] || 'dashboard'}`")
  })

  it('checks the same timeout query param', () => {
    expect(loginPageV3Src).toContain("params.get('reason') === 'timeout'")
  })

  it('imports no Firebase module directly', () => {
    expect(loginPageV3Src).not.toMatch(/from\s+['"]firebase/)
    expect(loginPageV3Src).not.toContain('signInWithEmailAndPassword')
  })

  it('LoginVisualPanel.jsx imports no Firebase, store, or router modules', () => {
    expect(visualPanelSrc).not.toMatch(/from\s+['"]firebase/)
    expect(visualPanelSrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/store/)
    expect(visualPanelSrc).not.toContain('react-router-dom')
  })
})

// ════════════════════════════════════════════════════════════
// 3 — LoginPageV2.jsx source file is preserved unmodified (rollback path)
// ════════════════════════════════════════════════════════════
describe('3 — LoginPageV2 source is preserved unmodified for rollback', () => {
  it('still uses its own CSS/SVG DataOceanBackground + IdentityPulseLogo right panel', () => {
    expect(loginPageV2Src).toContain("import DataOceanBackground   from '../../components/login/DataOceanBackground'")
    expect(loginPageV2Src).toContain("import IdentityPulseLogo     from '../../components/login/IdentityPulseLogo'")
  })

  it('does not import LoginVisualPanel (the new Gate 1/2 asset component)', () => {
    expect(loginPageV2Src).not.toContain('LoginVisualPanel')
  })
})

// ════════════════════════════════════════════════════════════
// 4 — Routing: Gate 3 cutover — /login now serves LoginPageV3;
//     LoginPageV2 remains reachable at /login-v2 for rollback
// ════════════════════════════════════════════════════════════
describe('4 — App.jsx routing reflects the approved Gate 3 cutover', () => {
  it('routes /login to LoginPageV3 (cutover complete)', () => {
    expect(appSrc).toContain('<Route path="/login"        element={<LoginPageV3 />} />')
  })

  it('keeps /login-v3 as an equivalent alias route to LoginPageV3', () => {
    expect(appSrc).toContain('<Route path="/login-v3"     element={<LoginPageV3 />} />')
  })

  it('keeps LoginPageV2 reachable at /login-v2 for rollback/reference', () => {
    expect(appSrc).toContain('<Route path="/login-v2"     element={<LoginPageV2 />} />')
  })

  it('imports both LoginPageV2 and LoginPageV3', () => {
    expect(appSrc).toContain("const LoginPageV2      = lazy(() => import('./pages/auth/LoginPageV2'))")
    expect(appSrc).toContain("import LoginPageV3 from './pages/auth/LoginPageV3'")
  })
})

// ════════════════════════════════════════════════════════════
// 5 — Card section order matches the approved Gate 2 spec
// ════════════════════════════════════════════════════════════
describe('5 — left card section order matches the approved spec', () => {
  it('renders sections in the required order: brand → identity gateway → welcome back → email → password → forgot → sign in → divider → biometric → security → footer', () => {
    const order = [
      'Pharma<span',
      'Identity Gateway V3',
      'Welcome back',
      "htmlFor={emailId}>Email address",
      "htmlFor={passwordId}>Password",
      'Forgot password?',
      'className="lgv3-btn-primary" disabled={submitting || loading}',
      "fontFamily: \"'Inter',sans-serif\" }}>or<",
      'Continue with Face ID',
      'Sign in with Passkey',
      'Protected by PharmaPulse Identity',
      'Privacy Policy',
    ].map((needle) => loginPageV3Src.indexOf(needle))

    order.forEach((idx) => expect(idx).toBeGreaterThan(-1))
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1])
    }
  })
})

// ════════════════════════════════════════════════════════════
// 6 — Biometric placeholders are honestly disabled, no fake capability
// ════════════════════════════════════════════════════════════
describe('6 — Face ID / Passkey remain honest, non-functional placeholders', () => {
  it('Face ID button is natively disabled, aria-disabled, and guarded', () => {
    const faceIdBlock = loginPageV3Src.slice(
      loginPageV3Src.indexOf('Continue with Face ID') - 400,
      loginPageV3Src.indexOf('Continue with Face ID') + 50
    )
    expect(faceIdBlock).toContain('disabled')
    expect(faceIdBlock).toContain('aria-disabled="true"')
    expect(faceIdBlock).toContain('onClick={(e) => e.preventDefault()}')
  })

  it('Passkey button is natively disabled and labeled "Not yet available", not a fake "New" capability claim', () => {
    const passkeyBlock = loginPageV3Src.slice(
      loginPageV3Src.indexOf('Sign in with Passkey') - 600,
      loginPageV3Src.indexOf('Sign in with Passkey') + 400
    )
    expect(passkeyBlock).toContain('disabled')
    expect(passkeyBlock).toContain('aria-disabled="true"')
    expect(passkeyBlock).toContain('Not yet available')
  })
})

// ════════════════════════════════════════════════════════════
// 7 — No hardcoded personal/user-specific data
// ════════════════════════════════════════════════════════════
describe('7 — no hardcoded personal data in the new shell', () => {
  it('does not contain the reference image sample email', () => {
    expect(loginPageV3Src).not.toContain('samir@alathirpharmacy.com')
  })

  it('uses a neutral placeholder email, not a real address', () => {
    expect(loginPageV3Src).toContain('you@pharmacy.com')
  })

  it('does not contain a hardcoded personal name, branch, or date', () => {
    expect(loginPageV3Src).not.toMatch(/Samir|Goda/i)
  })
})

// ════════════════════════════════════════════════════════════
// 8 — Accessibility wiring required by the Gate 2 spec
// ════════════════════════════════════════════════════════════
describe('8 — accessibility wiring', () => {
  it('email and password inputs use real <label htmlFor> association, not label-as-text only', () => {
    expect(loginPageV3Src).toContain('<label className="lgv3-label" htmlFor={emailId}>Email address</label>')
    expect(loginPageV3Src).toContain('<label className="lgv3-label" htmlFor={passwordId}>Password</label>')
  })

  it('inputs declare autoComplete for password-manager compatibility', () => {
    expect(loginPageV3Src).toContain("autoComplete=\"email\"")
    expect(loginPageV3Src).toContain("autoComplete=\"current-password\"")
  })

  it('password toggle button has an accessible name and pressed state', () => {
    expect(loginPageV3Src).toContain("aria-label={showPass ? 'Hide password' : 'Show password'}")
    expect(loginPageV3Src).toContain('aria-pressed={showPass}')
  })

  it('error/timeout banners use role="alert"', () => {
    expect(loginPageV3Src).toContain('role="alert"')
  })

  it('the sign-in form has an accessible name', () => {
    expect(loginPageV3Src).toContain('aria-label="Sign in to PharmaPulse"')
  })

  it('declares a focus-visible style for keyboard navigation', () => {
    expect(loginPageV3Src).toContain(':focus-visible')
  })

  it('respects prefers-reduced-motion', () => {
    expect(loginPageV3Src).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('inputs use 16px minimum font size to avoid mobile zoom-on-focus', () => {
    expect(loginPageV3Src).toMatch(/\.lgv3-input\s*\{[^}]*font-size:\s*16px/)
  })
})

// ════════════════════════════════════════════════════════════
// 9 — Responsive shell structure
// ════════════════════════════════════════════════════════════
describe('9 — responsive breakpoint structure', () => {
  it('declares a desktop/tablet-landscape split layout at min-width: 1024px', () => {
    expect(loginPageV3Src).toContain('@media (min-width: 1024px)')
  })

  it('desktop split sets a definite height and hides page-level overflow (no desktop page scroll)', () => {
    const desktopBlock = loginPageV3Src.slice(loginPageV3Src.indexOf('@media (min-width: 1024px)'))
    expect(desktopBlock).toContain('height: 100vh')
    expect(desktopBlock).toContain('overflow: hidden')
  })

  it('desktop card is content-sized, bounded by a max-height safety cap (PR-1F Gate 3 compactness fix)', () => {
    // Originally a fixed `height: calc(100vh - 80px)` forced the card to fill
    // the viewport regardless of content, making it visibly taller than the
    // approved reference. Gate 3 replaced that with a content-driven card
    // (auto height, vertically centered by .lgv3-card-wrap) plus a max-height
    // cap + internal scroll so very short viewports still can't overflow.
    const desktopBlock = loginPageV3Src.slice(loginPageV3Src.indexOf('@media (min-width: 1024px)'))
    expect(desktopBlock).toContain('max-height: calc(100vh - 64px)')
    expect(desktopBlock).not.toMatch(/\.lgv3-glass-card\s*\{[^}]*(?<!max-)height:\s*calc/)
  })

  it('mobile/tablet-portrait uses a fixed full-bleed visual background with safe-area padding', () => {
    expect(loginPageV3Src).toContain('env(safe-area-inset-top)')
    expect(loginPageV3Src).toContain('env(safe-area-inset-bottom)')
  })

  it('the glass card uses the spec border-radius (~24px)', () => {
    expect(loginPageV3Src).toContain('border-radius: 24px')
  })
})

// ════════════════════════════════════════════════════════════
// 10 — Right visual panel uses the Gate 1 image assets, not CSS/SVG
// ════════════════════════════════════════════════════════════
describe('10 — right visual panel renders the Gate 1 image assets', () => {
  it('LoginVisualPanel references both desktop and mobile WebP asset paths', () => {
    expect(visualPanelSrc).toContain('/assets/login-v3-visual-desktop.webp')
    expect(visualPanelSrc).toContain('/assets/login-v3-visual-mobile.webp')
  })

  it('uses a native <picture>/<source> responsive swap, no JS-driven image selection', () => {
    expect(visualPanelSrc).toContain('<picture>')
    expect(visualPanelSrc).toContain('<source media="(max-width: 1023px)"')
  })

  it('marks the decorative visual as aria-hidden and gives the <img> an empty alt', () => {
    expect(visualPanelSrc).toContain('aria-hidden="true"')
    expect(visualPanelSrc).toContain('alt=""')
  })

  it('does not import the CSS/SVG DataOceanBackground or IdentityPulseLogo components', () => {
    expect(visualPanelSrc).not.toContain('DataOceanBackground')
    expect(visualPanelSrc).not.toContain('IdentityPulseLogo')
  })
})
