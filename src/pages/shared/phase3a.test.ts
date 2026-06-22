// ============================================================
// Phase 3A — Supervisor Layer: Unlock via Existing Pages
//
// Verifies:
//   1. Sidebar: district_supervisor gets dedicated nav
//   2. ReportsPage: branchSummary gate uses scope, not isManager
//   3. TargetsPage: useScopeProfile wiring + view-only mode
//   4. Guardrails: no new routes, no new dashboard, no Firestore changes
// ============================================================

import { describe, it, expect } from 'vitest'

const sidebarSrc    = () => import('../../components/layout/Sidebar.jsx?raw').then((m) => m.default)
const reportsPageSrc = () => import('./ReportsPage.jsx?raw').then((m) => m.default)
const targetsPageSrc = () => import('./TargetsPage.jsx?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1. Sidebar — district_supervisor nav config
// ════════════════════════════════════════════════════════════

describe('Phase 3A — Sidebar district_supervisor nav', () => {
  it('NAV_CONFIG.district_supervisor is defined in Sidebar', async () => {
    const s = await sidebarSrc()
    expect(s).toContain('NAV_CONFIG.district_supervisor')
  })

  it('district_supervisor nav includes Dashboard', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain("path: '/dashboard'")
  })

  it('district_supervisor nav includes Reports', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain("path: '/reports'")
  })

  it('district_supervisor nav includes Targets', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain("path: '/targets'")
  })

  it('district_supervisor nav includes Team', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain("path: '/team'")
  })

  it('district_supervisor nav includes Executive BI', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain("path: '/executive'")
  })

  it('district_supervisor nav does NOT include KPI Entry', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).not.toContain("path: '/entry'")
  })

  it('district_supervisor nav does NOT include Personal Targets', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    const block = s.slice(idx, idx + 1000)
    expect(block).not.toContain("path: '/personal-targets'")
  })

  it('resolveNav fallback is pharmacist (unknown role still falls back)', async () => {
    const s = await sidebarSrc()
    expect(s).toContain('NAV_CONFIG[role] || NAV_CONFIG.pharmacist')
  })
})

// ════════════════════════════════════════════════════════════
// 2. ReportsPage — branchSummary scope-based gate
// ════════════════════════════════════════════════════════════

describe('Phase 3A — ReportsPage branchSummary gates', () => {
  it('branchSummary gate uses scope.type check, not isManager', async () => {
    const s = await reportsPageSrc()
    expect(s).toContain("scope.type === 'single'")
    expect(s).toContain("scope.type === 'none'")
  })

  it('branchSummary memo does NOT gate on isManager', async () => {
    const s = await reportsPageSrc()
    // The old gate was `if (!isManager) return []`
    expect(s).not.toContain('if (!isManager) return []')
  })

  it('isManager is NOT in branchSummary useMemo deps array', async () => {
    const s = await reportsPageSrc()
    const memoIdx = s.indexOf('const branchSummary = useMemo')
    expect(memoIdx).toBeGreaterThan(-1)
    // Window 2000: Phase 3B added totalActual/totalTarget/gap fields to the memo body,
    // pushing the deps array beyond the original 1200-char window.
    const block = s.slice(memoIdx, memoIdx + 2000)
    const depsIdx = block.lastIndexOf('}, [')
    expect(depsIdx).toBeGreaterThan(-1)
    const depsLine = block.slice(depsIdx, depsIdx + 120)
    expect(depsLine).not.toContain('isManager')
  })

  it('Branch Performance section renders without isManager gate', async () => {
    const s = await reportsPageSrc()
    expect(s).not.toContain('{isManager && branchSummary.length > 0 &&')
    expect(s).toContain('{branchSummary.length > 0 &&')
  })

  it('Active Branches stat no longer gates on isAdmin', async () => {
    const s = await reportsPageSrc()
    expect(s).not.toContain('isAdmin ? branchSummary.filter')
    expect(s).toContain('branchSummary.length > 0 ? branchSummary.filter')
  })
})

// ════════════════════════════════════════════════════════════
// 3. TargetsPage — scope-aware subscription + view-only mode
// ════════════════════════════════════════════════════════════

describe('Phase 3A — TargetsPage scope wiring', () => {
  it('TargetsPage imports useScopeProfile', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('TargetsPage calls useScopeProfile hook', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('useScopeProfile()')
  })

  it('TargetsPage defines canDelete (admin-only) and allowedPharmacies (Phase 3A-1A: isViewOnly removed)', async () => {
    const s = await targetsPageSrc()
    // Phase 3A-1A: isViewOnly removed — supervisor is now writable
    expect(s).not.toContain("isViewOnly = scope?.type === 'list'")
    expect(s).toContain('canDelete = isAdmin')
    expect(s).toContain('allowedPharmacies = scope ?')
  })

  it('subscription useEffect uses scope, not pharmacyId direct read', async () => {
    const s = await targetsPageSrc()
    expect(s).not.toContain('pharmacyId = userProfile?.pharmacyId')
  })

  it("subscription useEffect handles scope.type === 'all'", async () => {
    const s = await targetsPageSrc()
    expect(s).toContain("scope.type === 'all'")
  })

  it("subscription useEffect handles scope.type === 'single'", async () => {
    const s = await targetsPageSrc()
    expect(s).toContain("scope.type === 'single'")
  })

  it("subscription useEffect handles scope.type === 'list'", async () => {
    const s = await targetsPageSrc()
    expect(s).toContain("scope.type === 'list'")
  })

  it('subscription useEffect depends on scope', async () => {
    const s = await targetsPageSrc()
    // The new effect has [scope, userProfile?.uid] deps
    expect(s).toContain('[scope, userProfile?.uid]')
  })
})

describe('Phase 3A — TargetsPage access guards (Phase 3A-1A: supervisor is writable)', () => {
  it('scopeLoading guard renders a loading state', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('scopeLoading')
    expect(s).toContain('Loading targets')
  })

  it('scopeError guard renders an access-denied message', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('scopeError')
    expect(s).toContain('Access denied')
  })

  it('Add Target button always shown (no isViewOnly gate — supervisor is writable)', async () => {
    const s = await targetsPageSrc()
    expect(s).not.toContain('!isViewOnly')
    // Button is present unconditionally for any writable scope
    expect(s).toContain('Add Target')
  })

  it('TargetCard receives hideDelete prop (not readOnly)', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('hideDelete={!canDelete}')
    expect(s).not.toContain('readOnly={isViewOnly}')
  })

  it('TargetCard function accepts hideDelete parameter', async () => {
    const s = await targetsPageSrc()
    const fnIdx = s.indexOf('function TargetCard(')
    expect(fnIdx).toBeGreaterThan(-1)
    const sig = s.slice(fnIdx, fnIdx + 110)
    expect(sig).toContain('hideDelete')
    expect(sig).not.toContain('readOnly')
  })

  it('TargetCard Delete button filtered only for non-admin (hideDelete)', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain(".filter(a => !(a.title === 'Delete' && hideDelete))")
    expect(s).not.toContain(".filter(a => !readOnly || a.title === 'Expand')")
  })
})

// ════════════════════════════════════════════════════════════
// 4. Guardrails — no new routes, no new dashboard, no Firestore changes
// ════════════════════════════════════════════════════════════

describe('Phase 3A — guardrails', () => {
  it('App.jsx has no new supervisor-dashboard route', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-dashboard')
    expect(s).not.toContain('SupervisorDashboard')
  })

  it('App.jsx not modified by Phase 3A (no Phase 3A marker)', async () => {
    const s = await appSrc()
    // Phase 3A-1B added a comment to App.jsx — use substring variants that won't
    // match "Phase 3A-1x" labels but will still catch a bare "Phase 3A" insertion.
    expect(s).not.toContain('Phase 3A\n')
    expect(s).not.toContain('Phase 3A:')
  })

  it('Firestore rules not modified by Phase 3A core (no Phase 3A nav/scope marker)', async () => {
    const s = await firestoreRules()
    // Phase 3A added nav/scope changes — Firestore rules were not touched in Phase 3A.
    // Phase 3A-1A is the first Firestore change (targets territory rules) — its marker is expected.
    expect(s).not.toContain('Phase 3A\n')
    expect(s).not.toContain('Phase 3A:')
  })

  it('district_supervisor is already in MGR_UP in App.jsx', async () => {
    const s = await appSrc()
    expect(s).toContain('district_supervisor')
  })
})
