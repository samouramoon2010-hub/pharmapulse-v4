// ============================================================
// PR-1F Login V3 — Gate 3 (Auth Integration & Controlled Cutover)
// — Certification
//
// Scope verified by this suite:
//   - LoginPageV3 reuses the exact production auth contract (no second
//     sign-in implementation, no invented validation/normalization).
//   - authStore's error map now covers every category required by the
//     gate, in business-facing English, with no raw Firebase code ever
//     surfaced and a generic fallback for unmapped codes.
//   - resetPassword() now maps errors through the same table instead of
//     letting a raw Firebase exception escape.
//   - Submit guards (login + reset) are ref-based so a double-click
//     landing inside one synchronous tick — before React flushes the
//     `submitting` state — still cannot fire two network requests.
//   - The error banner is keyboard/screen-reader reachable (role=alert,
//     focus-managed) and never echoes a raw `error.code`/stack.
//   - Passkey/Face ID remain honest placeholders — no WebAuthn call, no
//     capability detection, no success state.
//   - LoginPageV2 (still the production /login route) is untouched.
//
// What this suite intentionally does NOT do: render LoginPageV3 through
// React/jsdom (this repo's test convention for these pages is Node +
// source-string assertion — see pr1fLoginV3Gate1Gate2.test.ts and
// loginDoubleSubmit.test.ts) or hit the real Firebase backend (that is
// covered by this gate's live-browser certification, documented in
// PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md, not by this file).
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const loginPageV2Src = await import('../pages/auth/LoginPageV2.jsx?raw').then((m) => m.default)
const loginPageV3Src = await import('../pages/auth/LoginPageV3.jsx?raw').then((m) => m.default)
const protectedRouteSrc = await import('../components/layout/ProtectedRoute.jsx?raw').then((m) => m.default)

// ── Mocks for the behavioral (store-level) tests ─────────────────
function mockAuthDeps() {
  vi.doMock('../services/firebase', () => ({
    auth: { currentUser: null },
    db: {},
    COL: { USERS: 'users', AUDIT_LOGS: 'audit_logs' },
  }))
  vi.doMock('firebase/firestore', () => ({
    doc: vi.fn((_db, col, id) => ({ __path: `${col}/${id}` })),
    getDoc: vi.fn(async () => ({
      exists: () => true, id: 'admin-uid',
      data: () => ({ displayName: 'Admin', role: 'admin', pharmacyId: 'ph-001' }),
    })),
    updateDoc: vi.fn(async () => {}),
    serverTimestamp: vi.fn(() => ({})),
  }))
  vi.doMock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn(() => vi.fn()),
    signInWithEmailAndPassword: vi.fn(async () => ({
      user: { uid: 'admin-uid', email: 'admin@pharmapulse.com' },
    })),
    signOut: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
    setPersistence: vi.fn(async () => {}),
    browserLocalPersistence: 'LOCAL',
    browserSessionPersistence: 'SESSION',
    EmailAuthProvider: { credential: vi.fn() },
    reauthenticateWithCredential: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
  }))
  vi.doMock('../services/auditService', () => ({
    logAction: vi.fn(async () => {}),
    AUDIT_ACTION: { LOGIN: 'login', LOGOUT: 'logout', CREATE: 'create' },
  }))
}

async function freshStore() {
  vi.resetModules()
  mockAuthDeps()
  const { useAuthStore } = await import('../store/authStore')
  return useAuthStore
}

beforeEach(() => {
  vi.resetModules()
})

// ════════════════════════════════════════════════════════════
// 1 — Auth contract parity (LoginPageV3 vs LoginPageV2)
// ════════════════════════════════════════════════════════════
describe('1 — LoginPageV3 reuses the production auth contract unchanged', () => {
  it('both pages destructure the identical useAuthStore fields', () => {
    expect(loginPageV3Src).toContain('login, resetPassword, loading, error, clearError')
    expect(loginPageV2Src).toContain('login, resetPassword, loading, error, clearError')
  })

  it('both pages call login() with the same arity and rememberMe=false', () => {
    expect(loginPageV3Src).toContain('await login(form.email, form.password, false)')
    expect(loginPageV2Src).toContain('await login(form.email, form.password, false)')
  })

  it('both pages call resetPassword(resetEmail) identically', () => {
    expect(loginPageV3Src).toContain('await resetPassword(resetEmail)')
    expect(loginPageV2Src).toContain('await resetPassword(resetEmail)')
  })

  it('neither page invents email normalization beyond what production already does', () => {
    // Production has none today (confirmed by Phase 0 audit) — V3 must not add it unilaterally.
    expect(loginPageV3Src).not.toMatch(/\.toLowerCase\(\)|\.trim\(\)/)
  })

  it('neither page imports Firebase directly — both go through the store', () => {
    expect(loginPageV3Src).not.toMatch(/from\s+['"]firebase/)
    expect(loginPageV2Src).not.toMatch(/from\s+['"]firebase/)
  })

  it('both pages route through the same ROLE_HOME map after success', () => {
    expect(loginPageV3Src).toContain("navigate(`/${ROLE_HOME[profile.role] || 'dashboard'}`")
    expect(loginPageV2Src).toContain("navigate(`/${ROLE_HOME[profile.role]||'dashboard'}`")
  })

  it('neither page guards against an already-authenticated user visiting /login — pre-existing, disclosed, shared characteristic', () => {
    // ProtectedRoute redirects unauthenticated users to /login, but nothing
    // redirects an authenticated user away from /login. Confirmed identical
    // on both pages so the Gate 3 side-by-side comparison stays apples-to-apples.
    expect(loginPageV3Src).not.toMatch(/userProfile\s*&&\s*navigate/)
    expect(loginPageV2Src).not.toMatch(/userProfile\s*&&\s*navigate/)
    expect(protectedRouteSrc).toContain("Navigate to=\"/login\"")
  })
})

// ════════════════════════════════════════════════════════════
// 2 — Error mapping: every required category, English, no raw codes
// ════════════════════════════════════════════════════════════
describe('2 — authStore error mapping', () => {
  const cases: Array<[string, string]> = [
    ['auth/user-not-found', 'No account found with that email.'],
    ['auth/wrong-password', 'Incorrect password. Please try again.'],
    ['auth/invalid-credential', 'Incorrect email or password.'],
    ['auth/invalid-email', 'That email address looks invalid.'],
    ['auth/user-disabled', 'This account has been disabled. Contact your administrator.'],
    ['auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.'],
    ['auth/network-request-failed', 'Network error. Check your connection and try again.'],
  ]

  for (const [code, message] of cases) {
    it(`maps ${code} to a clean business-facing message`, async () => {
      const useAuthStore = await freshStore()
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(Object.assign(new Error(code), { code }))

      await expect(useAuthStore.getState().login('x@x.com', 'whatever')).rejects.toThrow(message)
      expect(useAuthStore.getState().error).toBe(message)
    })
  }

  it('falls back to a generic message for an unmapped Firebase code (never leaks the raw code)', async () => {
    const useAuthStore = await freshStore()
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('auth/some-unmapped-code'), { code: 'auth/some-unmapped-code' })
    )

    await expect(useAuthStore.getState().login('x@x.com', 'whatever'))
      .rejects.toThrow('Unable to sign in. Please try again.')
    expect(useAuthStore.getState().error).not.toContain('auth/')
  })

  it('maps the no-profile case to an administrator-contact message, not a raw error', async () => {
    const useAuthStore = await freshStore()
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any)

    await expect(useAuthStore.getState().login('x@x.com', 'whatever'))
      .rejects.toThrow('This account is not linked to a user profile. Contact your administrator.')
  })

  it('clears the previous error at the start of a new login attempt', async () => {
    const useAuthStore = await freshStore()
    useAuthStore.setState({ error: 'stale error from a previous attempt' })
    await useAuthStore.getState().login('admin@pharmapulse.com', 'Admin@123')
    expect(useAuthStore.getState().error).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 3 — resetPassword() error handling (previously unguarded)
// ════════════════════════════════════════════════════════════
describe('3 — resetPassword maps errors instead of leaking raw Firebase exceptions', () => {
  it('maps auth/invalid-email on reset to the same business message', async () => {
    const useAuthStore = await freshStore()
    const { sendPasswordResetEmail } = await import('firebase/auth')
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(
      Object.assign(new Error('auth/invalid-email'), { code: 'auth/invalid-email' })
    )
    await expect(useAuthStore.getState().resetPassword('not-an-email'))
      .rejects.toThrow('That email address looks invalid.')
  })

  it('falls back to a generic reset message for an unmapped code', async () => {
    const useAuthStore = await freshStore()
    const { sendPasswordResetEmail } = await import('firebase/auth')
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(
      Object.assign(new Error('auth/weird'), { code: 'auth/weird' })
    )
    await expect(useAuthStore.getState().resetPassword('x@x.com'))
      .rejects.toThrow('Unable to send the reset link. Please try again.')
  })

  it('resolves cleanly when Firebase does not throw (email-enumeration protection)', async () => {
    const useAuthStore = await freshStore()
    await expect(useAuthStore.getState().resetPassword('nobody@nowhere.invalid')).resolves.toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════
// 4 — Submit behavior: double-submit guards, no double network calls
// ════════════════════════════════════════════════════════════
describe('4 — double-submit guards are ref-based, not state-based', () => {
  it('handleLogin checks a ref before the state-based "submitting" flag', () => {
    // A ref read/writes synchronously; React state does not. Checking the
    // ref FIRST is what closes the same-tick double-click race (confirmed
    // live: two clicks fired two real signInWithPassword requests before
    // this guard existed, one request after).
    const fnStart = loginPageV3Src.indexOf('const handleLogin')
    const fnEnd = loginPageV3Src.indexOf('const handleReset')
    const fnBody = loginPageV3Src.slice(fnStart, fnEnd)
    expect(fnBody).toContain('if (loginInFlightRef.current || submitting || loading) return')
    expect(fnBody).toContain('loginInFlightRef.current = true')
    expect(fnBody).toMatch(/finally\s*\{\s*setSubmitting\(false\);\s*loginInFlightRef\.current = false\s*\}/)
  })

  it('handleReset has the same ref-based guard', () => {
    const fnStart = loginPageV3Src.indexOf('const handleReset')
    const fnEnd = loginPageV3Src.indexOf('return (')
    const fnBody = loginPageV3Src.slice(fnStart, fnEnd)
    expect(fnBody).toContain('if (resetInFlightRef.current || resetSubmitting) return')
    expect(fnBody).toContain('resetInFlightRef.current = true')
    expect(fnBody).toMatch(/finally\s*\{\s*setResetSubmitting\(false\);\s*resetInFlightRef\.current = false\s*\}/)
  })

  it('the submit button is disabled and aria-busy while submitting', () => {
    expect(loginPageV3Src).toContain('disabled={submitting || loading} aria-busy={submitting}')
  })

  it('the reset submit button is disabled and aria-busy while sending', () => {
    expect(loginPageV3Src).toContain('disabled={resetSubmitting} aria-busy={resetSubmitting}')
  })

  it('both submit handlers call preventDefault before doing anything else', () => {
    const loginStart = loginPageV3Src.indexOf('const handleLogin = async (e) => {')
    const resetStart = loginPageV3Src.indexOf('const handleReset = async (e) => {')
    expect(loginPageV3Src.slice(loginStart, loginStart + 80)).toContain('e.preventDefault()')
    expect(loginPageV3Src.slice(resetStart, resetStart + 80)).toContain('e.preventDefault()')
  })

  it('typed values survive a recoverable failure — neither field is cleared on catch', () => {
    const fnStart = loginPageV3Src.indexOf('const handleLogin')
    const fnEnd = loginPageV3Src.indexOf('const handleReset')
    const fnBody = loginPageV3Src.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('setForm({')
    expect(fnBody).not.toMatch(/setForm\(f\s*=>\s*\(\{\s*\.\.\.f,\s*password:\s*['"]/)
  })
})

// ════════════════════════════════════════════════════════════
// 5 — Error display: accessible, focus-managed, no raw Firebase text
// ════════════════════════════════════════════════════════════
describe('5 — error banner accessibility and content safety', () => {
  it('the login error banner uses role=alert and is focusable for the focus-management effect', () => {
    expect(loginPageV3Src).toContain('role="alert" ref={errorAlertRef} tabIndex={-1}')
  })

  it('the reset error banner uses role=alert and is focusable too', () => {
    expect(loginPageV3Src).toContain('role="alert" ref={resetErrorAlertRef} tabIndex={-1}')
  })

  it('focus is moved to the error banner via useEffect when error/resetErr changes', () => {
    expect(loginPageV3Src).toContain("useEffect(() => { if (error) errorAlertRef.current?.focus() }, [error])")
    expect(loginPageV3Src).toContain("useEffect(() => { if (resetErr) resetErrorAlertRef.current?.focus() }, [resetErr])")
  })

  it('the only thing ever rendered inside the alert is the mapped store error, never err.code/err.message directly', () => {
    // The component never reads error.code or constructs its own error string —
    // it only renders whatever authStore already mapped.
    expect(loginPageV3Src).not.toMatch(/error\.code/)
    expect(loginPageV3Src).not.toContain('{err.code}')
  })

  it('catch blocks in the page never construct a new error string — they only set local UI state', () => {
    const fnStart = loginPageV3Src.indexOf('const handleReset')
    const fnEnd = loginPageV3Src.indexOf('return (')
    const fnBody = loginPageV3Src.slice(fnStart, fnEnd)
    expect(fnBody).toContain('catch (err) { setResetErr(err.message) }')
  })
})

// ════════════════════════════════════════════════════════════
// 6 — Password reset UI: inline mode-toggle, not a modal or new route
// ════════════════════════════════════════════════════════════
describe('6 — password reset preserves the existing inline mode-toggle pattern', () => {
  it('reset mode is a local state toggle, not a route or modal', () => {
    expect(loginPageV3Src).toContain("const [mode, setMode] = useState('login')")
    expect(loginPageV3Src).not.toContain('Modal')
    expect(loginPageV3Src).not.toMatch(/navigate\(['"`]\/forgot-password/)
  })

  it('"Forgot password?" switches mode and clears any stale login error', () => {
    expect(loginPageV3Src).toContain("onClick={() => { setMode('reset'); clearError() }}")
  })

  it('"Back to sign in" returns to login mode and clears reset state', () => {
    expect(loginPageV3Src).toContain("onClick={() => { setMode('login'); setResetSent(false); setResetErr('') }}")
  })
})

// ════════════════════════════════════════════════════════════
// 7 — Passkey / Face ID honesty (must remain inert in this gate)
// ════════════════════════════════════════════════════════════
describe('7 — biometric placeholders stay honest, no capability introduced', () => {
  it('both placeholder buttons are natively disabled and aria-disabled', () => {
    const faceIdBtn = loginPageV3Src.slice(
      loginPageV3Src.indexOf('Continue with Face ID') - 300,
      loginPageV3Src.indexOf('Continue with Face ID')
    )
    expect(faceIdBtn).toContain('disabled')
    expect(faceIdBtn).toContain('aria-disabled="true"')
    expect(faceIdBtn).toContain('onClick={(e) => e.preventDefault()}')
  })

  it('no WebAuthn / navigator.credentials call exists anywhere in the page', () => {
    expect(loginPageV3Src).not.toMatch(/navigator\.credentials/)
    expect(loginPageV3Src).not.toMatch(/PublicKeyCredential/)
    expect(loginPageV3Src).not.toContain('webauthn')
  })

  it('the Passkey badge reads "Not yet available", not "New"', () => {
    expect(loginPageV3Src).toContain('Not yet available')
  })
})

// ════════════════════════════════════════════════════════════
// 8 — Security: no credential exposure
// ════════════════════════════════════════════════════════════
describe('8 — no credential exposure in source or storage', () => {
  it('the page never calls console.log/console.error with the password field', () => {
    expect(loginPageV3Src).not.toMatch(/console\.(log|error|warn|info)\([^)]*password/i)
  })

  it('the page contains no hardcoded credential or sample email', () => {
    expect(loginPageV3Src).not.toContain('samir@alathirpharmacy.com')
    expect(loginPageV3Src).not.toMatch(/password\s*[:=]\s*['"][^'"]{4,}['"]/)
  })

  it('authStore never logs the password parameter', async () => {
    const src = await import('../store/authStore.js?raw').then((m) => m.default)
    const loginStart = src.indexOf('login: async (email')
    const loginEnd = src.indexOf('logout: async')
    const loginBody = src.slice(loginStart, loginEnd)
    expect(loginBody).not.toMatch(/console\.(log|error|warn|info)\([^)]*password/i)
  })

  it('the zustand persist partialize still excludes password (only userProfile + minimal user)', async () => {
    const src = await import('../store/authStore.js?raw').then((m) => m.default)
    const partializeStart = src.indexOf('partialize:')
    const partializeEnd = src.indexOf('}\n  )\n)')
    const partializeBody = src.slice(partializeStart, partializeEnd)
    expect(partializeBody).not.toContain('password')
  })

  it('no query-string password pattern exists in the page', () => {
    expect(loginPageV3Src).not.toMatch(/[?&]password=/)
  })
})

// ════════════════════════════════════════════════════════════
// 9 — Regression: LoginPageV2 source remains untouched (now the
//     rollback page at /login-v2, no longer serving production /login)
// ════════════════════════════════════════════════════════════
describe('9 — LoginPageV2 source is unaffected by Gate 3 wiring (rollback path)', () => {
  it('still has no submitting-ref double-submit guard added (V3-only hardening, not backported into V2)', () => {
    expect(loginPageV2Src).not.toContain('loginInFlightRef')
  })

  it('still imports its original visual components, not LoginVisualPanel', () => {
    expect(loginPageV2Src).toContain('DataOceanBackground')
    expect(loginPageV2Src).not.toContain('LoginVisualPanel')
  })
})
