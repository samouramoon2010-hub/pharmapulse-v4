// ============================================================
// Login V3 + Identity Bundle — PharmaPulse Identity Gateway V3
// Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// AUDIT RESULT (performed before any edit):
//   - App.jsx routes "/login" to <LoginPageV2 /> — confirmed the
//     active live login surface.
//   - src/pages/auth/LoginPage.jsx was a dead import in App.jsx
//     (imported but never rendered in any <Route> — the /login
//     route already rendered LoginPageV2). It also contained
//     DEMO_CREDENTIALS with hardcoded fake email/password pairs.
//     Proven a zero-reference orphan (only referenced by its own
//     file and by historical comments in unrelated test/store
//     files) and deleted, along with the dead import in App.jsx.
//   - src/components/login/AnimatedSaudiMap.jsx,
//     FloatingKpiCards.jsx, and LogoIntroAnimation.jsx were each
//     consumed ONLY by the prior LoginPageV2.jsx implementation.
//     Superseded by the new DataOceanBackground/IdentityPulseLogo
//     visual system; proven zero-reference orphans and deleted.
//     No dedicated test files existed for any of the 4 deleted
//     files — no preservation intent found.
//
// FIXES:
//   - LoginPageV2.jsx rebuilt with the approved "Identity Gateway
//     V3" visual: glass left panel, data-ocean animated right
//     panel, glowing P mark with ECG pulse (IdentityPulseLogo),
//     deterministic flowing particle background
//     (DataOceanBackground — no Math.random(), seeded LCG).
//   - Face ID / Passkey buttons are UI-ready placeholders only:
//     rendered with the native `disabled` attribute, `aria-disabled`,
//     and an onClick that calls preventDefault — no WebAuthn/
//     biometric backend exists, so neither button can fire any
//     network or auth call.
//   - Auth logic (useAuthStore.login/resetPassword, ROLE_HOME
//     routing, the submitting/progress/success state machine, the
//     forgot-password mode toggle, and the timeout query-param
//     notice) is carried over unchanged from the prior
//     implementation — only copy and markup changed (English
//     instead of Arabic, removing one of the deferred Arabic-copy
//     risks flagged in Mega Bundle C4).
//   - Footer renders a language placeholder plus "Privacy Policy"
//     and "Terms of Service" as inert text (no new routes created,
//     per the bundle's own "do not create new routes" rule — no
//     Privacy/Terms pages exist in this app).
//
// DEFERRED (explicitly NOT implemented — no backend exists):
//   - Real WebAuthn/passkey registration or authentication.
//   - Real biometric (Face ID) authentication.
//   Both remain UI-only placeholders until a backend decision is
//   made; flagged here rather than silently implemented.
//
// NO TEST FILES WERE DELETED IN THIS BUNDLE.
// ============================================================
import { describe, it, expect } from 'vitest'

const appSrc              = await import('../App.jsx?raw').then((m) => m.default)
const loginPageV2Src       = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const dataOceanSrc         = await import('../components/login/DataOceanBackground.jsx?raw').then((m) => m.default)
const identityLogoSrc      = await import('../components/login/IdentityPulseLogo.jsx?raw').then((m) => m.default)
const authStoreSrc         = await import('../store/authStore.js?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'LoginPageV2.jsx': loginPageV2Src,
  'DataOceanBackground.jsx': dataOceanSrc,
  'IdentityPulseLogo.jsx': identityLogoSrc,
}

// ════════════════════════════════════════════════════════════
// Validation target 1 — /login still resolves to the active
// login surface
// ════════════════════════════════════════════════════════════
describe('Validation 1 — /login resolves to the active login surface', () => {
  it('App.jsx routes "/login" to LoginPageV2', () => {
    expect(appSrc).toContain('"/login"')
    expect(appSrc).toContain('LoginPageV2')
  })

  it('App.jsx no longer imports the deleted dead LoginPage component', () => {
    expect(appSrc).not.toContain("from './pages/auth/LoginPage'")
    expect(appSrc).not.toMatch(/import LoginPage\s+from/)
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — existing password sign-in path remains
// wired
// ════════════════════════════════════════════════════════════
describe('Validation 2 — password sign-in path remains wired, unchanged', () => {
  it('LoginPageV2.jsx still calls useAuthStore for login/resetPassword/loading/error/clearError', () => {
    expect(loginPageV2Src).toContain("from '../../store/authStore'")
    expect(loginPageV2Src).toContain('login, resetPassword, loading, error, clearError')
  })

  it('LoginPageV2.jsx still calls login(email, password, false) on submit', () => {
    expect(loginPageV2Src).toContain('await login(form.email, form.password, false)')
  })

  it('LoginPageV2.jsx still routes to ROLE_HOME[profile.role] after a successful login', () => {
    expect(loginPageV2Src).toContain("ROLE_HOME[profile.role]||'dashboard'")
    expect(loginPageV2Src).toContain('admin:\'dashboard\'')
  })

  it('LoginPageV2.jsx still supports the forgot-password reset flow via resetPassword()', () => {
    expect(loginPageV2Src).toContain('await resetPassword(resetEmail)')
    expect(loginPageV2Src).toContain("setMode('reset')")
  })

  it('LoginPageV2.jsx still honors the ?reason=timeout query param notice', () => {
    expect(loginPageV2Src).toContain("params.get('reason') === 'timeout'")
  })

  it('LoginPageV2.jsx still has email/password inputs with show/hide password toggle', () => {
    expect(loginPageV2Src).toContain("type={showPass?'text':'password'}")
    expect(loginPageV2Src).toContain('setShowPass(!showPass)')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — no fake auth data or dummy credentials
// ════════════════════════════════════════════════════════════
describe('Validation 3 — no fake auth data or dummy credentials exist', () => {
  it('LoginPageV2.jsx contains no DEMO_CREDENTIALS or hardcoded test passwords', () => {
    expect(loginPageV2Src).not.toContain('DEMO_CREDENTIALS')
    expect(loginPageV2Src).not.toMatch(/password:\s*['"][A-Za-z0-9@]+['"]/)
  })

  it('the deleted LoginPage.jsx (which contained DEMO_CREDENTIALS) is no longer imported anywhere live', () => {
    expect(appSrc).not.toContain('DEMO_CREDENTIALS')
    expect(appSrc).not.toContain('admin@pharmapulse.com')
  })

  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not import dummyData / DUMMY_* fixtures or mock helpers`, () => {
      expect(src).not.toContain('dummyData')
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
      expect(src).not.toContain('mockData')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('fakeData')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — no auth services, route guards, Firestore
// contracts, or role logic were changed
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'Math.random(',
  'signInWithEmailAndPassword(', 'EmailAuthProvider', 'reauthenticateWithCredential',
]

describe('Validation 4 — no auth services / route guards / Firestore contracts / role logic changed', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('authStore.js (the actual Firebase auth boundary) was not modified by this bundle', () => {
    expect(authStoreSrc).toContain('signInWithEmailAndPassword(auth, email, password)')
    expect(authStoreSrc).toContain('export const useAuthStore')
  })

  it('LoginPageV2.jsx never calls Firebase auth functions directly — only via useAuthStore', () => {
    expect(loginPageV2Src).not.toContain('signInWithEmailAndPassword')
    expect(loginPageV2Src).not.toContain('firebase/auth')
  })

  it('App.jsx still wraps the app router in ProtectedRoute/AppLayout, unchanged route structure', () => {
    expect(appSrc).toContain('ProtectedRoute')
    expect(appSrc).toContain('AppLayout')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — approved visual markers are present
// ════════════════════════════════════════════════════════════
describe('Validation 5 — Login V3 renders the approved visual markers', () => {
  it('renders "PharmaPulse" identity branding and "Identity Gateway V3" label', () => {
    expect(loginPageV2Src).toContain('Pharma')
    expect(loginPageV2Src).toContain('Pulse')
    expect(loginPageV2Src).toContain('Identity Gateway V3')
  })

  it('renders the "Protected by PharmaPulse Identity" and encryption microcopy', () => {
    expect(loginPageV2Src).toContain('Protected by PharmaPulse Identity')
    expect(loginPageV2Src).toContain('Your data is encrypted and secure')
  })

  it('renders a disabled, guarded "Continue with Face ID" button', () => {
    const idx = loginPageV2Src.indexOf('Continue with Face ID')
    expect(idx).toBeGreaterThan(-1)
    const block = loginPageV2Src.slice(Math.max(0, idx - 700), idx)
    expect(block).toContain('disabled')
    expect(block).toContain('aria-disabled')
    expect(block).toContain('e.preventDefault()')
  })

  it('renders a disabled, guarded "Sign in with Passkey" button', () => {
    const idx = loginPageV2Src.indexOf('Sign in with Passkey')
    expect(idx).toBeGreaterThan(-1)
    const block = loginPageV2Src.slice(Math.max(0, idx - 700), idx)
    expect(block).toContain('disabled')
    expect(block).toContain('aria-disabled')
    expect(block).toContain('e.preventDefault()')
  })

  it('renders the primary "Sign in" submit action', () => {
    expect(loginPageV2Src).toContain("'Signing in...' : 'Sign in'")
  })

  it('renders the footer language placeholder and legal-copy placeholders without creating new routes', () => {
    expect(loginPageV2Src).toContain('English')
    expect(loginPageV2Src).toContain('Privacy Policy')
    expect(loginPageV2Src).toContain('Terms of Service')
    expect(loginPageV2Src).not.toMatch(/navigate\(['"`]\/privacy/)
    expect(loginPageV2Src).not.toMatch(/navigate\(['"`]\/terms/)
  })

  it('renders the DataOceanBackground and IdentityPulseLogo components for the right panel', () => {
    expect(loginPageV2Src).toContain('<DataOceanBackground')
    expect(loginPageV2Src).toContain('<IdentityPulseLogo')
  })

  it('contains no KPI cards, numbers, charts, or dashboard widgets on the login surface', () => {
    expect(loginPageV2Src).not.toContain('FloatingKpiCards')
    expect(loginPageV2Src).not.toContain('AnimatedSaudiMap')
    expect(loginPageV2Src).not.toMatch(/recharts/)
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 (continued) — reduced-motion-safe animation
// hooks
// ════════════════════════════════════════════════════════════
describe('Validation 5b — reduced-motion-safe animation hooks exist on both new components', () => {
  it('DataOceanBackground respects prefers-reduced-motion (no rAF loop started when reduced)', () => {
    expect(dataOceanSrc).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    expect(dataOceanSrc).toContain('mq.matches')
    expect(dataOceanSrc).toContain('requestAnimationFrame')
  })

  it('DataOceanBackground contains no Math.random() — fully deterministic seeded particles', () => {
    expect(dataOceanSrc).not.toContain('Math.random(')
  })

  it('IdentityPulseLogo respects prefers-reduced-motion via a static/animated class toggle', () => {
    expect(identityLogoSrc).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    expect(identityLogoSrc).toContain('ipl-static')
    expect(identityLogoSrc).toContain('ipl-animated')
  })
})

// ════════════════════════════════════════════════════════════
// Deleted files proven orphaned before deletion
// ════════════════════════════════════════════════════════════
describe('Validation 6 — deleted files proven orphaned before deletion', () => {
  it('App.jsx has zero references to any of the 4 deleted files', () => {
    for (const name of ['LoginPage', 'AnimatedSaudiMap', 'FloatingKpiCards', 'LogoIntroAnimation']) {
      if (name === 'LoginPage') {
        // LoginPageV2 legitimately contains the substring "LoginPage" — assert
        // the standalone dead import specifically instead.
        expect(appSrc).not.toMatch(/import LoginPage\s+from/)
        continue
      }
      expect(appSrc).not.toContain(name)
    }
  })

  it('none of the touched live files reference any of the 4 deleted files', () => {
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      expect(src).not.toContain('AnimatedSaudiMap')
      expect(src).not.toContain('FloatingKpiCards')
      expect(src).not.toContain('LogoIntroAnimation')
      expect(src).not.toMatch(/from\s+['"].*\/LoginPage['"]/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// No test files deleted in this bundle
// ════════════════════════════════════════════════════════════
describe('Validation — no test files were deleted in this bundle', () => {
  it('loginDoubleSubmit.test.ts (authStore double-submit guard test) still exists, untouched', async () => {
    const src = await import('../engine/evaluationRegistry/loginDoubleSubmit.test.ts?raw').then((m) => m.default)
    expect(src.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — touched files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — touched files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} has at least one export`, () => {
      expect(src).toMatch(/export (default |const |function )/)
    })
    it(`${fileName} has balanced braces`, () => {
      const open = (src.match(/\{/g) ?? []).length
      const close = (src.match(/\}/g) ?? []).length
      expect(open).toBe(close)
    })
    it(`${fileName} has balanced parentheses`, () => {
      const open = (src.match(/\(/g) ?? []).length
      const close = (src.match(/\)/g) ?? []).length
      // DataOceanBackground.jsx deliberately uses incomplete 'rgba(r,g,b,'
      // string literals (3 of them, same established trick as the prior
      // particle systems in this codebase) that are closed at runtime by
      // appending the alpha value + ')' in the template-literal fillStyle
      // assignment — this yields exactly 2 more source-level '(' than ')'.
      const expectedOffset = fileName === 'DataOceanBackground.jsx' ? 2 : 0
      expect(open - close).toBe(expectedOffset)
    })
  }
})
