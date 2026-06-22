// ============================================================
// Login V3 React Glass Panel Refinement — Certification
//
// Scope: visual-only refinement of the existing glass login panel
// in LoginPageV2.jsx (true CSS glassmorphism, layered reflections,
// typography, button materials, divider) plus a small, optional
// "Personal Identity Signature" presentation-only enhancement to
// the "Samir Goda" name display in Sidebar.jsx.
//
// Hard constraints verified by this suite (per the bundle's own
// safety rules):
//   - Auth logic untouched: same useAuthStore destructure, same
//     login()/resetPassword() call signatures, same ROLE_HOME
//     routing, same timeout query-param check.
//   - No Firebase/route-guard/role/permission/session code was
//     touched — App.jsx and authStore.js are not part of this
//     bundle's diff (not imported as "?raw" with new assertions
//     beyond what already existed).
//   - Face ID / Passkey buttons remain native-disabled, aria-disabled,
//     and preventDefault-guarded — still UI-only placeholders.
//   - Forgot-password mode toggle and handleReset are unchanged.
//   - Personal Identity Signature is presentation-only: no Firebase,
//     no store, no auth import in its own file; Sidebar.jsx falls
//     back to the original unconditional markup for every other name.
// ============================================================
import { describe, it, expect } from 'vitest'

const loginPageV2Src = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const sidebarSrc     = await import('../components/layout/Sidebar.jsx?raw').then((m) => m.default)
const pisSrc          = await import('../components/identity/PersonalIdentitySignature.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1 — Auth behavior remains unchanged
// ════════════════════════════════════════════════════════════
describe('1 — Auth behavior remains unchanged', () => {
  it('still destructures the same useAuthStore fields', () => {
    expect(loginPageV2Src).toContain("from '../../store/authStore'")
    expect(loginPageV2Src).toContain('login, resetPassword, loading, error, clearError')
  })

  it('still calls login(email, password, false) on submit', () => {
    expect(loginPageV2Src).toContain('await login(form.email, form.password, false)')
  })

  it('still calls resetPassword(resetEmail) in handleReset', () => {
    expect(loginPageV2Src).toContain('await resetPassword(resetEmail)')
  })

  it('still routes via ROLE_HOME map after successful login', () => {
    expect(loginPageV2Src).toContain('ROLE_HOME[profile.role]')
    expect(loginPageV2Src).toContain("navigate(`/${ROLE_HOME[profile.role]||'dashboard'}`")
  })

  it('still checks the timeout query param', () => {
    expect(loginPageV2Src).toContain("params.get('reason') === 'timeout'")
  })

  it('still guards empty email/password before submit', () => {
    expect(loginPageV2Src).toContain('if (!form.email || !form.password) return')
  })
})

// ════════════════════════════════════════════════════════════
// 2 — No Firebase / route guard / role / session changes
// ════════════════════════════════════════════════════════════
describe('2 — No Firebase/auth/role/route-guard changes in touched files', () => {
  it('LoginPageV2.jsx imports no Firebase modules directly', () => {
    expect(loginPageV2Src).not.toMatch(/from\s+['"]firebase/)
    expect(loginPageV2Src).not.toContain('signInWithEmailAndPassword')
  })

  it('Sidebar.jsx imports no Firebase modules directly', () => {
    expect(sidebarSrc).not.toMatch(/from\s+['"]firebase/)
  })

  it('PersonalIdentitySignature.jsx imports no Firebase, store, or router modules', () => {
    expect(pisSrc).not.toMatch(/from\s+['"]firebase/)
    expect(pisSrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/store/)
    expect(pisSrc).not.toContain('react-router-dom')
  })

  it('Sidebar.jsx still imports useAuthStore unchanged for role/logout (no new auth call added)', () => {
    expect(sidebarSrc).toContain("from '../../store/authStore'")
  })
})

// ════════════════════════════════════════════════════════════
// 3 — Biometric buttons remain UI-only / disabled
// ════════════════════════════════════════════════════════════
describe('3 — Biometric buttons remain UI-only, disabled', () => {
  it('Face ID button is natively disabled and preventDefault-guarded', () => {
    expect(loginPageV2Src).toContain('Continue with Face ID')
    expect(loginPageV2Src).toMatch(/disabled\s*\n\s*aria-disabled="true"\s*\n\s*title="Face ID sign-in is not yet available"/)
  })

  it('Passkey button is natively disabled and preventDefault-guarded', () => {
    expect(loginPageV2Src).toContain('Sign in with Passkey')
    expect(loginPageV2Src).toMatch(/disabled\s*\n\s*aria-disabled="true"\s*\n\s*title="Passkey sign-in is not yet available"/)
  })

  it('both biometric buttons call preventDefault on click', () => {
    const matches = loginPageV2Src.match(/onClick=\{\(e\) => e\.preventDefault\(\)\}/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('no WebAuthn/biometric backend call was introduced', () => {
    expect(loginPageV2Src).not.toContain('navigator.credentials')
    expect(loginPageV2Src).not.toContain('PublicKeyCredential')
  })
})

// ════════════════════════════════════════════════════════════
// 4 — Glass panel classes/styles exist
// ════════════════════════════════════════════════════════════
describe('4 — True CSS glassmorphism glass panel exists', () => {
  it('defines a glass card class using backdrop-filter blur', () => {
    expect(loginPageV2Src).toContain('.lv3-glass-card')
    expect(loginPageV2Src).toContain('backdrop-filter:blur(28px)')
    expect(loginPageV2Src).toContain('-webkit-backdrop-filter:blur(28px)')
  })

  it('glass card markup uses the lv3-glass-card class', () => {
    expect(loginPageV2Src).toContain('className="lv3-glass-card"')
  })

  it('defines layered reflection pseudo-elements (::before and ::after)', () => {
    expect(loginPageV2Src).toContain('.lv3-glass-card::before')
    expect(loginPageV2Src).toContain('.lv3-glass-card::after')
  })

  it('edge glow gradient references cyan and violet tones', () => {
    expect(loginPageV2Src).toMatch(/rgba\(34,211,238,0\.45\)/)
    expect(loginPageV2Src).toMatch(/rgba\(139,92,246,0\.4\)/)
  })

  it('primary Sign In button has a soft internal glow pseudo-element', () => {
    expect(loginPageV2Src).toContain('.lv3-btn-primary::before')
    expect(loginPageV2Src).toContain('radial-gradient(ellipse 70% 100% at 50% -10%')
  })

  it('Welcome back heading uses a gradient-text treatment', () => {
    expect(loginPageV2Src).toContain('Welcome back')
    expect(loginPageV2Src).toContain("WebkitBackgroundClip:'text'")
    expect(loginPageV2Src).toContain("fontSize:'29px'")
  })

  it('divider before biometric actions uses a dedicated class', () => {
    expect(loginPageV2Src).toContain('lv3-divider-biometric')
    expect(loginPageV2Src).toContain('lv3-divider-line')
  })

  it('input focus state has a visible glow box-shadow', () => {
    expect(loginPageV2Src).toContain('.lv3-input:focus')
    expect(loginPageV2Src).toMatch(/box-shadow:0 0 0 4px rgba\(34,211,238,0\.14\)/)
  })

  it('secondary (biometric) button has a hover state', () => {
    expect(loginPageV2Src).toContain('.lv3-btn-secondary:hover')
  })
})

// ════════════════════════════════════════════════════════════
// 5 — Forgot password still works
// ════════════════════════════════════════════════════════════
describe('5 — Forgot password flow unchanged', () => {
  it('Forgot password button still switches to reset mode', () => {
    expect(loginPageV2Src).toContain('Forgot password?')
    expect(loginPageV2Src).toContain("setMode('reset')")
  })

  it('reset mode still renders handleReset form and Back to sign in', () => {
    expect(loginPageV2Src).toContain('onSubmit={handleReset}')
    expect(loginPageV2Src).toContain('Back to sign in')
    expect(loginPageV2Src).toContain("setMode('login')")
  })

  it('reset success state still shows "Link sent"', () => {
    expect(loginPageV2Src).toContain('Link sent')
  })
})

// ════════════════════════════════════════════════════════════
// 6 — Responsive / reduced-motion hooks exist
// ════════════════════════════════════════════════════════════
describe('6 — Responsive and reduced-motion support', () => {
  it('LoginPageV2.jsx has a reduced-motion media query', () => {
    expect(loginPageV2Src).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('LoginPageV2.jsx has tablet and mobile breakpoints', () => {
    expect(loginPageV2Src).toContain('@media (max-width: 880px)')
    expect(loginPageV2Src).toContain('@media (max-width: 480px)')
  })

  it('PersonalIdentitySignature.jsx reads prefers-reduced-motion via matchMedia', () => {
    expect(pisSrc).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(pisSrc).toContain('pis-static')
    expect(pisSrc).toContain('pis-animated')
  })
})

// ════════════════════════════════════════════════════════════
// 7 — Personal Identity Signature is presentation-only
// ════════════════════════════════════════════════════════════
describe('7 — Personal Identity Signature is presentation-only', () => {
  it('only activates for the exact recognized display name', () => {
    expect(pisSrc).toContain("export const SIGNATURE_NAME = 'Samir Goda'")
    expect(pisSrc).toContain('export function isSignatureIdentity(name)')
    expect(pisSrc).toContain('name.trim() === SIGNATURE_NAME')
  })

  it('renders the required subtitle', () => {
    expect(pisSrc).toContain("export const SIGNATURE_SUBTITLE = 'Senior Executive Pharmacist'")
  })

  it('component is a pure render — no fetch, no Firestore, no store hooks', () => {
    expect(pisSrc).not.toContain('fetch(')
    expect(pisSrc).not.toContain('firestore')
    expect(pisSrc).not.toContain('useStore')
  })

  it('Sidebar.jsx falls back to original markup for non-signature names', () => {
    expect(sidebarSrc).toContain('isSignatureIdentity(userProfile?.displayName)')
    expect(sidebarSrc).toContain('{ROLE_LABELS[role] || role}')
    expect(sidebarSrc).toContain('<PersonalIdentitySignature name={userProfile.displayName} />')
  })

  it('Sidebar.jsx does not gate any nav/role logic on the signature identity', () => {
    const idx = sidebarSrc.indexOf('isSignatureIdentity')
    expect(idx).toBeGreaterThan(-1)
    const around = sidebarSrc.slice(Math.max(0, idx - 50), idx + 400)
    expect(around).not.toMatch(/navigate\(|logout\(|permission/i)
  })
})
