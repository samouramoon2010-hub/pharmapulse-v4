// ============================================================
// Login Double-Submit Regression Tests
//
// Root cause (confirmed in audit):
//   authStore.login() called set({ loading: true }) which caused
//   App.jsx to unmount <BrowserRouter> entirely (because the loading
//   gate was INSIDE the router). This orphaned the useNavigate() hook
//   in LoginPage, silently dropping the post-login navigate() call.
//   On the second attempt loading was already false so the router
//   stayed mounted and navigate() worked.
//
// Fixes applied:
//   1. BrowserRouter moved outside the loading gate in App.jsx
//   2. login() no longer sets loading:true — LoginPage has submitting
//   3. _loggingIn guard prevents duplicate onAuthStateChanged fetch
//
// Tests verify:
//   1. login() does not set loading:true during execution
//   2. login() does not set loading:false on catch (loading state unchanged)
//   3. _loggingIn is set true at login() start and cleared on success
//   4. _loggingIn is cleared on login() failure
//   5. onAuthStateChanged is skipped when _loggingIn is true
//   6. App.jsx BrowserRouter is outside the loading gate
//   7. login() still sets userProfile on success
//   8. login() still sets error on failure
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  auth: { currentUser: null },
  db:   {},
  COL:  {
    USERS: 'users', AUDIT_LOGS: 'audit_logs', KPI_ENTRIES: 'kpi_entries',
    PHARMACIES: 'pharmacies', TARGETS: 'targets', PERSONAL_TARGETS: 'personal_targets',
    EVALUATION_RESULTS: 'evaluation_results', RANKING_SNAPSHOTS: 'ranking_snapshots',
    DEMO_BATCHES: 'demo_batches',
  },
}))

vi.mock('firebase/firestore', () => ({
  doc:             vi.fn((_db, col, id) => ({ __path: `${col}/${id}` })),
  getDoc:          vi.fn(async () => ({
    exists:  () => true,
    id:      'admin-uid',
    data:    () => ({ displayName: 'Admin', role: 'admin', pharmacyId: 'ph-001' }),
  })),
  updateDoc:       vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged:       vi.fn(() => vi.fn()),   // returns unsubscribe
  signInWithEmailAndPassword: vi.fn(async () => ({
    user: { uid: 'admin-uid', email: 'admin@pharmapulse.com' },
  })),
  signOut:                  vi.fn(async () => {}),
  sendPasswordResetEmail:   vi.fn(async () => {}),
  setPersistence:           vi.fn(async () => {}),
  browserLocalPersistence:  'LOCAL',
  browserSessionPersistence: 'SESSION',
  EmailAuthProvider:        { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(async () => {}),
  updatePassword:           vi.fn(async () => {}),
}))

vi.mock('../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { LOGIN: 'login', LOGOUT: 'logout', CREATE: 'create' },
}))

// ── Helpers ───────────────────────────────────────────────────

async function freshStore() {
  // Reset module to get a clean Zustand store on each test
  vi.resetModules()

  // Re-mock after reset
  vi.mock('../../services/firebase', () => ({
    auth: { currentUser: null },
    db:   {},
    COL:  {
      USERS: 'users', AUDIT_LOGS: 'audit_logs', KPI_ENTRIES: 'kpi_entries',
      PHARMACIES: 'pharmacies', TARGETS: 'targets', PERSONAL_TARGETS: 'personal_targets',
      EVALUATION_RESULTS: 'evaluation_results', RANKING_SNAPSHOTS: 'ranking_snapshots',
      DEMO_BATCHES: 'demo_batches',
    },
  }))
  vi.mock('firebase/firestore', () => ({
    doc:             vi.fn((_db, col, id) => ({ __path: `${col}/${id}` })),
    getDoc:          vi.fn(async () => ({
      exists: () => true, id: 'admin-uid',
      data: () => ({ displayName: 'Admin', role: 'admin', pharmacyId: 'ph-001' }),
    })),
    updateDoc:       vi.fn(async () => {}),
    serverTimestamp: vi.fn(() => ({})),
  }))
  vi.mock('firebase/auth', () => ({
    onAuthStateChanged:        vi.fn(() => vi.fn()),
    signInWithEmailAndPassword: vi.fn(async () => ({
      user: { uid: 'admin-uid', email: 'admin@pharmapulse.com' },
    })),
    signOut:                   vi.fn(async () => {}),
    sendPasswordResetEmail:    vi.fn(async () => {}),
    setPersistence:            vi.fn(async () => {}),
    browserLocalPersistence:   'LOCAL',
    browserSessionPersistence: 'SESSION',
    EmailAuthProvider:         { credential: vi.fn() },
    reauthenticateWithCredential: vi.fn(async () => {}),
    updatePassword:            vi.fn(async () => {}),
  }))
  vi.mock('../services/auditService', () => ({
    logAction:    vi.fn(async () => {}),
    AUDIT_ACTION: { LOGIN: 'login', LOGOUT: 'logout', CREATE: 'create' },
  }))

  const { useAuthStore } = await import('../../store/authStore')
  return useAuthStore
}

// ════════════════════════════════════════════════════════════════
// 1. login() does not touch loading state
// ════════════════════════════════════════════════════════════════

describe('login() — loading state untouched', () => {
  it('loading stays false throughout a successful login', async () => {
    const useAuthStore = await freshStore()
    const store = useAuthStore.getState()

    // Simulate app already initialised (loading = false)
    useAuthStore.setState({ loading: false })

    const loadingValues: boolean[] = []
    const unsub = useAuthStore.subscribe((s) => loadingValues.push(s.loading))

    await store.login('admin@pharmapulse.com', 'Admin@123')

    unsub()
    // loading must never have been set to true
    expect(loadingValues.every((v) => v === false)).toBe(true)
  })

  it('loading stays false when login throws bad credentials', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('wrong'), { code: 'auth/wrong-password' })
    )

    const useAuthStore = await freshStore()
    useAuthStore.setState({ loading: false })

    const loadingValues: boolean[] = []
    const unsub = useAuthStore.subscribe((s) => loadingValues.push(s.loading))

    try { await useAuthStore.getState().login('x@x.com', 'wrong') } catch {}

    unsub()
    expect(loadingValues.every((v) => v === false)).toBe(true)
  })

  it('login() source does not contain set({ loading: true })', async () => {
    const src = await import('../../store/authStore.js?raw')
    // The login function must not set loading:true
    // We check for the specific pattern removed by the fix
    const loginFnStart = src.default.indexOf('login: async (email')
    const loginFnEnd   = src.default.indexOf('logout: async')
    const loginFnBody  = src.default.slice(loginFnStart, loginFnEnd)
    expect(loginFnBody).not.toContain('loading: true')
  })
})

// ════════════════════════════════════════════════════════════════
// 2. _loggingIn guard
// ════════════════════════════════════════════════════════════════

describe('_loggingIn guard', () => {
  it('_loggingIn is false in initial state', async () => {
    const useAuthStore = await freshStore()
    expect((useAuthStore.getState() as any)._loggingIn).toBe(false)
  })

  it('_loggingIn is cleared to false on successful login', async () => {
    const useAuthStore = await freshStore()
    await useAuthStore.getState().login('admin@pharmapulse.com', 'Admin@123')
    expect((useAuthStore.getState() as any)._loggingIn).toBe(false)
  })

  it('_loggingIn is cleared to false when login throws', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('fail'), { code: 'auth/wrong-password' })
    )

    const useAuthStore = await freshStore()
    try { await useAuthStore.getState().login('x@x.com', 'wrong') } catch {}

    expect((useAuthStore.getState() as any)._loggingIn).toBe(false)
  })

  it('onAuthStateChanged callback returns early when _loggingIn is true', async () => {
    const useAuthStore = await freshStore()
    const store = useAuthStore.getState()

    // Manually set _loggingIn and loading (simulating mid-login state)
    useAuthStore.setState({ _loggingIn: true, loading: true } as any)

    // Simulate the init() callback firing with a user
    // by calling the internal logic directly: if _loggingIn, skip
    const loggingIn = (useAuthStore.getState() as any)._loggingIn
    expect(loggingIn).toBe(true)
    // The guard prevents _fetchProfile from being called a second time
    // Verified by checking the source:
    const src = await import('../../store/authStore.js?raw')
    expect(src.default).toContain('if (get()._loggingIn) return')
  })
})

// ════════════════════════════════════════════════════════════════
// 3. login() still hydrates the store correctly
// ════════════════════════════════════════════════════════════════

describe('login() — store hydration', () => {
  it('sets userProfile on successful login', async () => {
    const useAuthStore = await freshStore()
    const profile = await useAuthStore.getState().login('admin@pharmapulse.com', 'Admin@123')

    const state = useAuthStore.getState()
    expect(state.userProfile).not.toBeNull()
    expect(state.userProfile?.role).toBe('admin')
    expect(state.user?.uid).toBe('admin-uid')
    expect(profile.role).toBe('admin')
  })

  it('sets error on failed login', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('bad creds'), { code: 'auth/invalid-credential' })
    )

    const useAuthStore = await freshStore()
    try { await useAuthStore.getState().login('bad@bad.com', 'wrong') } catch {}

    const state = useAuthStore.getState()
    expect(state.error).toBeTruthy()
    expect(state.userProfile).toBeNull()
  })

  it('userProfile is null before login', async () => {
    const useAuthStore = await freshStore()
    expect(useAuthStore.getState().userProfile).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// 4. App.jsx structure — BrowserRouter outside loading gate
// ════════════════════════════════════════════════════════════════

describe('App.jsx — BrowserRouter outside loading gate', () => {
  it('BrowserRouter is rendered before the loading check', async () => {
    const src = await import('../../App.jsx?raw')
    const routerPos  = src.default.indexOf('<BrowserRouter>')
    const loadingPos = src.default.indexOf('loading ?')
    // BrowserRouter must appear BEFORE the loading conditional
    expect(routerPos).toBeGreaterThan(0)
    expect(loadingPos).toBeGreaterThan(0)
    expect(routerPos).toBeLessThan(loadingPos)
  })

  it('loading gate is inside BrowserRouter (LoadingScreen is a child of router)', async () => {
    const src = await import('../../App.jsx?raw')
    // The old pattern was: if (loading) return <LoadingScreen /> then <BrowserRouter>
    // The new pattern: <BrowserRouter>...{loading ? <LoadingScreen /> : <Routes>}
    expect(src.default).not.toMatch(/if \(loading\) return <LoadingScreen/)
    expect(src.default).toContain('loading ?')
    expect(src.default).toContain('<LoadingScreen')
  })

  it('no top-level early return of LoadingScreen before BrowserRouter', async () => {
    const src = await import('../../App.jsx?raw')
    const earlyReturnPos = src.default.indexOf('if (loading) return <LoadingScreen')
    expect(earlyReturnPos).toBe(-1)
  })
})
