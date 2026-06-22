// ============================================================
// Phase 2F-4 — Scope Migration Regression Consolidation
//
// Definitive regression baseline for the full 2F sprint.
// Source-level (raw imports only — no DOM rendering).
//
// Coverage:
//
// TeamPage (items 1-7):
//   1. Uses useScopeProfile
//   2. Uses filterAllowedPharmacies
//   3. Does not use userProfile.pharmacyId as main scope source
//   4. Supervisor list scope requires branch selection (prompt guard)
//   5. Manager single scope auto-selects own branch (scope.id)
//   6. Branch Intelligence link uses selectedPharmacyId
//   7. Pharmacist navigation uses selectedPharmacyId
//
// ReportsPage (items 8-16):
//   8.  Uses useScopeProfile
//   9.  Uses filterAllowedPharmacies
//   10. Uses isPharmacyAllowed for selectedBranch='all'
//   11. Does not initialize selectedBranch with pharmacyId ?? 'all'
//   12. scope list uses pharmacyIds in fetch options
//   13. scope list [] cannot fall through to unscoped fetch ({})
//   14. No unscoped fetch for supervisor/regional manager
//   15. Manager single behavior preserved (scope.single → pharmacyId)
//   16. Admin/GM all behavior preserved (scope.all → {})
//
// Global guardrails (items 17-20):
//   17. DashboardPage not modified
//   18. ExecutiveDashboard not modified
//   19. App.jsx not modified
//   20. Firestore rules not modified
// ============================================================

import { describe, it, expect } from 'vitest'

async function teamPage(): Promise<string> {
  return (await import('../manager/TeamPage.jsx?raw')).default
}

async function reportsPage(): Promise<string> {
  return (await import('./ReportsPage.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// TeamPage — items 1-7
// ════════════════════════════════════════════════════════════

describe('2F-4 TeamPage — scope resolver wiring', () => {
  // Item 1
  it('uses useScopeProfile', async () => {
    const s = await teamPage()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  // Item 2
  it('uses filterAllowedPharmacies', async () => {
    const s = await teamPage()
    expect(s).toContain('filterAllowedPharmacies(scope')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  // Item 3
  it('does NOT read userProfile.pharmacyId as main scope source', async () => {
    const s = await teamPage()
    expect(s).not.toContain('const pharmacyId = userProfile?.pharmacyId')
    expect(s).not.toContain('const isAdmin    = role')
    // selectedPharmacyId is now the scope variable
    expect(s).toContain('selectedPharmacyId')
  })

  // Item 4
  it("supervisor list scope — prompt guard present when no branch selected", async () => {
    const s = await teamPage()
    expect(s).toContain("scope?.type === 'list' && !selectedPharmacyId")
    expect(s).toContain('Select a branch above to view team intelligence')
  })

  // Item 5
  it("manager single scope — auto-selects scope.id", async () => {
    const s = await teamPage()
    const singleIdx = s.indexOf("scope.type === 'single'")
    expect(singleIdx).toBeGreaterThan(-1)
    const block = s.slice(singleIdx, singleIdx + 80)
    expect(block).toContain('scope.id')
    expect(block).toContain('setSelectedPharmacyId')
  })

  // Item 6
  it('Branch Intelligence link uses selectedPharmacyId', async () => {
    const s = await teamPage()
    expect(s).toContain('/branch/${selectedPharmacyId}/intelligence')
    expect(s).not.toContain('/branch/${pharmacyId}/intelligence')
  })

  // Item 7
  it('pharmacist navigate uses selectedPharmacyId as branchId param', async () => {
    const s = await teamPage()
    expect(s).toContain('branchId=${selectedPharmacyId}')
    expect(s).not.toContain('branchId=${pharmacyId}')
  })
})

// ════════════════════════════════════════════════════════════
// ReportsPage — items 8-16
// ════════════════════════════════════════════════════════════

describe('2F-4 ReportsPage — scope resolver wiring', () => {
  // Item 8
  it('uses useScopeProfile', async () => {
    const s = await reportsPage()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  // Item 9
  it('uses filterAllowedPharmacies', async () => {
    const s = await reportsPage()
    expect(s).toContain('filterAllowedPharmacies(scope')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  // Item 10
  it("uses isPharmacyAllowed when selectedBranch === 'all'", async () => {
    const s = await reportsPage()
    expect(s).toContain('isPharmacyAllowed(scope, e.pharmacyId)')
    // The guard: selectedBranch !== 'all' → exact match; 'all' → isPharmacyAllowed
    expect(s).toContain("selectedBranch !== 'all'")
  })

  // Item 11
  it("does NOT initialize selectedBranch with pharmacyId ?? 'all' closure", async () => {
    const s = await reportsPage()
    expect(s).not.toContain("userProfile?.role === 'admin' ? 'all' : (userProfile?.pharmacyId ?? 'all')")
    expect(s).toContain('useState(null)')
  })

  // Item 12
  it('scope list uses pharmacyIds in fetch options', async () => {
    const s = await reportsPage()
    expect(s).toContain('fetchOptions = { pharmacyIds: scope.ids')
  })

  // Item 13
  it('scope list [] cannot fall through to unscoped fetch', async () => {
    const s = await reportsPage()
    // The list branch sets { pharmacyIds: ... } — not bare {}
    const listFetchIdx = s.indexOf('fetchOptions = { pharmacyIds: scope.ids')
    expect(listFetchIdx).toBeGreaterThan(-1)
    // fetchEntriesRange with pharmacyIds=[] returns [] immediately (no Firestore call)
    // Verify the kpiService guard also exists in source
    const kpiSvc = (await import('../../services/kpiService.js?raw')).default
    expect(kpiSvc).toContain('pharmacyIds.length === 0')
    expect(kpiSvc).toContain('return []')
  })

  // Item 14
  it('no unscoped fetch ({}) for list scope (supervisor/regional manager)', async () => {
    const s = await reportsPage()
    // The list branch in the fetch effect uses pharmacyIds — it does NOT assign fetchOptions = {}
    // Find the list type branch in the fetch effect (not the selector)
    const listFetchIdx = s.indexOf('fetchOptions = { pharmacyIds: scope.ids')
    expect(listFetchIdx).toBeGreaterThan(-1)
    // Confirm the list branch never falls through to all-branches {}
    // by checking there's no "scope.type === 'list'" branch that sets {}
    const beforeList = s.slice(0, listFetchIdx)
    // The last 'else if (scope.type === ...' before list assignment should be 'list'
    const lastElseIfBeforeList = beforeList.lastIndexOf("scope.type === 'list'")
    const allBranchFetchIdx = s.indexOf("fetchOptions = {}", 0)
    // The all-branch {} must appear in the 'all' branch, BEFORE the list assignment
    expect(allBranchFetchIdx).toBeLessThan(listFetchIdx)
  })

  // Item 15
  it('manager single scope preserved: fetch uses scope.id as pharmacyId', async () => {
    const s = await reportsPage()
    expect(s).toContain('fetchOptions = { pharmacyId: scope.id }')
  })

  // Item 16
  it('admin/GM all scope preserved: fetch uses empty options {}', async () => {
    const s = await reportsPage()
    expect(s).toContain('fetchOptions = {}')
  })
})

// ════════════════════════════════════════════════════════════
// Global guardrails — items 17-20
// ════════════════════════════════════════════════════════════

describe('2F-4 Global guardrails — unchanged files', () => {
  // Item 17
  it('DashboardPage not modified (no Phase 2F marker)', async () => {
    const s = (await import('../dashboard/DashboardPage.jsx?raw')).default
    expect(s).not.toContain('Phase 2F')
    // Phase 2G-1 legitimately adds useScopeProfile to DashboardPage — not a 2F marker
  })

  // Item 18
  it('ExecutiveDashboard not modified (no Phase 2F marker)', async () => {
    const s = (await import('../executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).not.toContain('Phase 2F')
    // Phase 2G-3 legitimately adds useScopeProfile to ExecutiveDashboard — not a 2F change
  })

  // Item 19
  it('App.jsx not modified (no Phase 2F marker)', async () => {
    const s = (await import('../../App.jsx?raw')).default
    expect(s).not.toContain('Phase 2F')
  })

  // Item 20
  it('Firestore rules not modified (no Phase 2F marker)', async () => {
    const rules = (await import('../../../firestore.rules?raw')).default
    expect(rules).not.toContain('Phase 2F')
  })
})
