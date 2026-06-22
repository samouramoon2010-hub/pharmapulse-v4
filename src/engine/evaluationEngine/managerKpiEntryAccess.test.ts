// ============================================================
// Manager KPI Entry Access — Regression Tests
//
// Root cause: KPI Entry (/entry) nav item existed only in the
// pharmacist NAV_CONFIG. manager and branch_manager NAV_CONFIG
// had no such item, so managers had no visible path to enter
// their own daily KPI data.
//
// Fix: added { icon: ClipboardList, label: 'KPI Entry', path: '/entry' }
// to the manager 'My Work' group in Sidebar.jsx.
// branch_manager is aliased to manager, so it gets the item automatically.
//
// The route /entry already used <PR> with roles=ALL, so no route
// change was needed. KpiEntryPage has no role guard.
// saveKpiEntry uses auth.currentUser.uid as userId — correct for managers.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── 1. Sidebar nav item visibility ───────────────────────────

describe('Manager KPI Entry — Sidebar nav', () => {
  it('manager NAV_CONFIG contains KPI Entry item', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    // Extract the manager block
    const managerBlock = src.default
      .split('manager: [')[1]
      ?.split('pharmacist: [')[0] ?? ''
    expect(managerBlock).toContain("path: '/entry'")
    expect(managerBlock).toContain("label: 'KPI Entry'")
  })

  it('pharmacist NAV_CONFIG still contains KPI Entry item (unchanged)', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    const pharmacistBlock = src.default
      .split('pharmacist: [')[1]
      ?.split('NAV_CONFIG.branch_manager =')[0] ?? ''
    expect(pharmacistBlock).toContain("path: '/entry'")
    expect(pharmacistBlock).toContain("label: 'KPI Entry'")
  })

  it('branch_manager is re-aliased to manager nav (includes KPI Entry)', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    // Phase A restores the alias — branch_manager is a forward-compat role
    // not active in production. It inherits manager nav including KPI Entry.
    expect(src.default).toContain('NAV_CONFIG.branch_manager = NAV_CONFIG.manager')
    // Verify alias means branch_manager inherits KPI Entry via manager block
    const managerBlock = src.default
      .split('manager: [')[1]
      ?.split('pharmacist: [')[0] ?? ''
    expect(managerBlock).toContain("path: '/entry'")
    expect(managerBlock).toContain("label: 'KPI Entry'")
  })

  it('admin NAV_CONFIG does not need KPI Entry (has Run Evaluation instead)', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    const adminBlock = src.default
      .split('admin: [')[1]
      ?.split('manager: [')[0] ?? ''
    // Admin uses Run Evaluation, not personal entry
    expect(adminBlock).toContain("path: '/admin/evaluation-run'")
  })
})

// ── 2. Route accessibility ────────────────────────────────────

describe('Manager KPI Entry — route accessibility', () => {
  it('/entry route has no role restriction (uses PR with ALL roles)', async () => {
    const src = await import('../../App.jsx?raw')
    // The /entry route must use <PR> with no roles= override (defaults to ALL)
    const entryRoute = src.default.split('\n').find((l) => l.includes("path=\"/entry\"")) ?? ''
    expect(entryRoute).toContain('/entry')
    // Must NOT have roles={ADMIN} or roles={MGR_UP} — only ALL is acceptable
    expect(entryRoute).not.toContain('ADMIN')
    expect(entryRoute).not.toContain('MGR_UP')
  })

  it('ALL roles constant includes manager and branch_manager', async () => {
    const src = await import('../../App.jsx?raw')
    // ALL must include both manager roles
    const allLine = src.default.split('\n').find((l) => l.includes('const ALL')) ?? ''
    expect(allLine).toContain('manager')
    expect(allLine).toContain('branch_manager')
    expect(allLine).toContain('pharmacist')
  })
})

// ── 3. KpiEntryPage — no internal role guard ─────────────────

describe('Manager KPI Entry — page has no role restriction', () => {
  it('KpiEntryPage does not filter by role=pharmacist', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw')
    // Must NOT contain a role check that blocks managers
    expect(src.default).not.toMatch(/role\s*===\s*['"]pharmacist['"]/m)
    expect(src.default).not.toMatch(/if\s*\(!isPharmacist\)/m)
  })

  it('KpiEntryPage uses auth.currentUser.uid as userId', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw')
    // userId resolved from auth, not from a role-filtered lookup
    expect(src.default).toContain('auth?.currentUser?.uid')
  })

  it('KpiEntryPage uses userProfile.pharmacyId — works for managers with pharmacyId', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw')
    expect(src.default).toContain('userProfile?.pharmacyId')
  })
})

// ── 4. Save path — entry stored with correct userId ──────────

describe('Manager KPI Entry — save path uses correct userId', () => {
  it('saveKpiEntry resolves userId from auth.currentUser.uid (not role-filtered)', async () => {
    const src = await import('../../services/kpiService.js?raw')
    // resolvedUserId = auth?.currentUser?.uid || userId
    expect(src.default).toContain('resolvedUserId = auth?.currentUser?.uid || userId')
  })

  it('saveKpiEntry saves pharmacyId from the passed pharmacyId (manager pharmacyId)', async () => {
    const src = await import('../../services/kpiService.js?raw')
    // payload.pharmacyId = pharmacyId.trim()
    expect(src.default).toContain('pharmacyId: pharmacyId.trim()')
  })

  it('entry document ID encodes userId + pharmacyId + date', async () => {
    const src = await import('../../services/kpiService.js?raw')
    // entryId(userId, pharmacyId, date) → userId_pharmacyId_date
    expect(src.default).toContain('`${userId}_${pharmacyId}_${date}`')
  })
})

// ── 5. Evaluation aggregation compatibility ───────────────────

describe('Manager KPI Entry — evaluation aggregation compatibility', () => {
  it('aggregateKpiActuals queries by userId and pharmacyId — finds manager entries', async () => {
    const src = await import('../../services/evaluationActualsService.ts?raw')
    // Query must filter by both userId and pharmacyId
    expect(src.default).toContain("where('userId',     '==', userId)")
    expect(src.default).toContain("where('pharmacyId', '==', pharmacyId)")
  })

  it('aggregateKpiActuals has no role filter — works for any userId', async () => {
    const src = await import('../../services/evaluationActualsService.ts?raw')
    // Must NOT filter by role
    expect(src.default).not.toMatch(/where\(['"]role['"]/m)
    expect(src.default).not.toMatch(/role\s*===\s*['"]pharmacist['"]/m)
  })
})

// ── 6. Scope guard ────────────────────────────────────────────

describe('Manager KPI Entry — scope guard', () => {
  it('no Evaluation scoring changes were made', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    // normalizedFinalScorePct should still be present (from previous sprint)
    expect(src.default).toContain('normalizedFinalScorePct')
  })

  it('no new Ranking or Coaching routes added', async () => {
    const src = await import('../../App.jsx?raw')
    // /admin/rankings was added in RF-1B (approved route) — guard relaxed
    expect(src.default).not.toContain('/ranking-engine')
    expect(src.default).not.toContain('/coaching')
  })
})
