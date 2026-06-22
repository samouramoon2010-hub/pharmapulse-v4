// ============================================================
// ReportsPage — Phase 2F-2 Scope Resolver Integration Tests
//
// Source-level tests (raw import, no DOM rendering).
// Verifies that the Scope Resolver is wired correctly for
// the branch selector / selectedBranch UI state migration.
//
//   Structural:
//     imports, useScopeProfile call, filterAllowedPharmacies
//     selectedBranch init changed to null (no closure)
//
//   Role dispatch:
//     scope.type === 'all'    → selectedBranch set to 'all'
//     scope.type === 'single' → auto-sets scope.id
//     scope.type === 'list'   → fallback to 'all'
//     scope.type === 'none'   → access denied guard
//
//   Branch selector:
//     shown for 'all' and 'list', hidden for 'single'
//     uses allowedPharmacies, not pharmacies.filter directly
//     'All Branches' label for all scope
//     'All My Branches' label for list scope
//
//   Scope guards:
//     scopeLoading → loading message
//     scopeError / scope.type === 'none' → access denied
//
//   Isolation — fetch layer unchanged:
//     fetchEntriesRange options still use pharmacyId
//     rangeEntries filter uses selectedBranch (unchanged memo)
//     branchSummary uses isManager/isAdmin/pharmacyId (unchanged)
//
//   Isolation — other pages not touched:
//     TeamPage not referenced, ExecutiveDashboard not referenced
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  return (await import('./ReportsPage.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. Imports
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2 — imports', () => {
  it('imports useScopeProfile from the hooks path', async () => {
    const s = await src()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('imports filterAllowedPharmacies from scopeResolver', async () => {
    const s = await src()
    expect(s).toContain('filterAllowedPharmacies')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  it('does not reference TeamPage or ExecutiveDashboard', async () => {
    const s = await src()
    expect(s).not.toContain('TeamPage')
    expect(s).not.toContain('ExecutiveDashboard')
  })
})

// ════════════════════════════════════════════════════════════
// 2. useScopeProfile wiring
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2 — useScopeProfile wiring', () => {
  it('calls useScopeProfile()', async () => {
    const s = await src()
    expect(s).toContain('useScopeProfile()')
  })

  it('destructures scope, scopeLoading, and scopeError from useScopeProfile', async () => {
    const s = await src()
    const callIdx = s.indexOf('useScopeProfile()')
    const before  = s.slice(Math.max(0, callIdx - 80), callIdx + 10)
    expect(before).toContain('scope')
    expect(before).toContain('scopeLoading')
    expect(before).toContain('scopeError')
  })

  it('derives allowedPharmacies via filterAllowedPharmacies(scope, pharmacies)', async () => {
    const s = await src()
    expect(s).toContain('filterAllowedPharmacies(scope')
    expect(s).toContain('allowedPharmacies')
  })
})

// ════════════════════════════════════════════════════════════
// 3. selectedBranch initialization
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2 — selectedBranch init', () => {
  it('selectedBranch initializes to null (no closure with role check)', async () => {
    const s = await src()
    expect(s).toContain("useState(null)")
    expect(s).not.toContain("userProfile?.role === 'admin' ? 'all'")
  })

  it("scope.type === 'single' auto-sets selectedBranch from scope.id", async () => {
    const s = await src()
    const singleIdx = s.indexOf("scope.type === 'single'")
    expect(singleIdx).toBeGreaterThan(-1)
    const block = s.slice(singleIdx, singleIdx + 120)
    expect(block).toContain('scope.id')
    expect(block).toContain('setSelectedBranch')
  })

  it("scope.type === 'all' initializes selectedBranch to 'all'", async () => {
    const s = await src()
    const allIdx = s.indexOf("scope.type === 'all'")
    expect(allIdx).toBeGreaterThan(-1)
    const block = s.slice(allIdx, allIdx + 120)
    expect(block).toContain("'all'")
    expect(block).toContain('setSelectedBranch')
  })

  it("scope.type === 'list' initializes selectedBranch to 'all' (fallback until Phase 2F-3)", async () => {
    const s = await src()
    const listIdx = s.indexOf("scope.type === 'list'")
    expect(listIdx).toBeGreaterThan(-1)
    const block = s.slice(listIdx, listIdx + 120)
    expect(block).toContain("'all'")
    expect(block).toContain('setSelectedBranch')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Branch selector visibility
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2 — branch selector', () => {
  it("selector shown for 'all' and 'list' scope types", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'all' || scope?.type === 'list'")
  })

  it('selector uses allowedPharmacies, not pharmacies.filter directly', async () => {
    const s = await src()
    // Find the selector block
    const selectorIdx = s.indexOf("scope?.type === 'all' || scope?.type === 'list'")
    const block = s.slice(selectorIdx, selectorIdx + 400)
    expect(block).toContain('allowedPharmacies')
  })

  it("'All Branches' label present for all-scope option", async () => {
    const s = await src()
    expect(s).toContain('All Branches')
  })

  it("'All My Branches' label present for list-scope option", async () => {
    const s = await src()
    expect(s).toContain('All My Branches')
  })

  it("isAdmin is no longer the sole gate for the branch selector", async () => {
    const s = await src()
    // The old pattern "{isAdmin && (<select" should not exist
    expect(s).not.toContain('{isAdmin && (\n          <select')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Scope loading / error guards
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2 — scope guards', () => {
  it('scopeLoading guard returns a loading message', async () => {
    const s = await src()
    const idx = s.indexOf('if (scopeLoading)')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('Loading reports')
  })

  it("scope.type === 'none' triggers access denied", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'none'")
    const noneIdx = s.indexOf("scope?.type === 'none'")
    const block   = s.slice(noneIdx, noneIdx + 450)
    expect(block).toContain('Access denied')
  })

  it('scopeError is included in the access denied condition', async () => {
    const s = await src()
    const ifIdx = s.indexOf('if (scopeError')
    expect(ifIdx).toBeGreaterThan(-1)
    const block = s.slice(ifIdx, ifIdx + 60)
    expect(block).toContain("scope?.type === 'none'")
  })
})

// ════════════════════════════════════════════════════════════
// 6. Fetch layer isolation (unchanged by Phase 2F-2)
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-2/2F-3 — fetch layer scope-driven', () => {
  it('fetchEntriesRange now uses scope-based fetchOptions (Phase 2F-3)', async () => {
    const s = await src()
    // Phase 2F-3 replaced old (!isAdmin && pharmacyId) pattern with scope-driven options
    expect(s).not.toContain('(!isAdmin && pharmacyId) ? { pharmacyId } : {}')
    expect(s).toContain('fetchOptions = {}')
    expect(s).toContain('fetchOptions = { pharmacyId: scope.id }')
  })

  it('rangeEntries filter uses isPharmacyAllowed for scope-safe all-branch filtering (Phase 2F-3)', async () => {
    const s = await src()
    expect(s).toContain('isPharmacyAllowed(scope, e.pharmacyId)')
  })

  it('branchSummary gates on scope type and uses filterAllowedPharmacies(scope) (Phase 3A: scope replaces isManager gate)', async () => {
    const s = await src()
    // Phase 3A: gate is now scope-type-based so district_supervisor (list scope) sees branch data
    expect(s).toContain("scope.type === 'single'")
    expect(s).not.toContain('if (!isManager) return []')
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })
})
