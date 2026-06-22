// ============================================================
// TeamPage — Phase 2F-1 Scope Resolver Integration Tests
//
// Source-level tests (raw import, no DOM rendering).
// Verifies that the Scope Resolver is wired correctly:
//
//   Structural:
//     imports, useScopeProfile call, filterAllowedPharmacies
//     selectedPharmacyId replaces userProfile.pharmacyId
//
//   Role dispatch:
//     scope.type === 'all'    → subscribeRecentEntries (admin/GM)
//     scope.type === 'single' → auto-selects scope.id (manager)
//     scope.type === 'list'   → branch selector + prompt (supervisor/regional)
//
//   UI guards:
//     selector visible for 'all' and 'list', hidden for 'single'
//     prompt text for unselected territory roles
//     scopeLoading → verifying access message
//     scopeError / scope.type === 'none' → access denied
//
//   Navigation:
//     Branch Intelligence link uses selectedPharmacyId
//     pharmacist navigate() uses selectedPharmacyId
//
//   Isolation:
//     does NOT reference ReportsPage, DashboardPage, ExecutiveDashboard
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  return (await import('./TeamPage.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. Imports
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — imports', () => {
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

  it('does not reference ReportsPage', async () => {
    const s = await src()
    expect(s).not.toContain('ReportsPage')
  })

  it('does not reference DashboardPage', async () => {
    const s = await src()
    expect(s).not.toContain('DashboardPage')
  })

  it('does not reference ExecutiveDashboard or Executive BI imports', async () => {
    const s = await src()
    expect(s).not.toContain('ExecutiveDashboard')
    expect(s).not.toContain("from '../../engine/executive/executiveBI'")
  })
})

// ════════════════════════════════════════════════════════════
// 2. useScopeProfile call and derived values
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — useScopeProfile wiring', () => {
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
// 3. selectedPharmacyId replaces userProfile.pharmacyId
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — selectedPharmacyId state', () => {
  it('declares selectedPharmacyId and setSelectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain('selectedPharmacyId')
    expect(s).toContain('setSelectedPharmacyId')
  })

  it('no longer reads userProfile.pharmacyId directly', async () => {
    const s = await src()
    expect(s).not.toContain('const pharmacyId = userProfile?.pharmacyId')
    expect(s).not.toContain('const isAdmin    = role')
  })

  it('subscribePharmacyEntries uses selectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain('subscribePharmacyEntries(selectedPharmacyId)')
  })

  it('subscribeMyTargets uses selectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain('subscribeMyTargets(selectedPharmacyId)')
  })

  it('getUsersByPharmacy uses selectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain('getUsersByPharmacy(selectedPharmacyId)')
  })

  it('generateTeamIntelligence pharmacyId uses selectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain("selectedPharmacyId || 'all'")
  })

  it('personalTargetsByBranch subscription uses selectedPharmacyId', async () => {
    const s = await src()
    expect(s).toContain('subscribePublishedPersonalTargetsByBranch(selectedPharmacyId')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Role dispatch — all / single / list
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — role dispatch', () => {
  it("scope.type === 'all' path calls subscribeRecentEntries (admin/GM)", async () => {
    const s = await src()
    const allIdx = s.indexOf("scope?.type === 'all'")
    expect(allIdx).toBeGreaterThan(-1)
    const block = s.slice(allIdx, allIdx + 180)
    expect(block).toContain('subscribeRecentEntries()')
  })

  it("scope.type === 'single' auto-sets selectedPharmacyId from scope.id", async () => {
    const s = await src()
    const singleIdx = s.indexOf("scope.type === 'single'")
    expect(singleIdx).toBeGreaterThan(-1)
    const block = s.slice(singleIdx, singleIdx + 100)
    expect(block).toContain('scope.id')
    expect(block).toContain('setSelectedPharmacyId')
  })

  it("scope.type === 'all' auto-selects first active pharmacy", async () => {
    const s = await src()
    const allIdx = s.indexOf("scope.type === 'all'")
    expect(allIdx).toBeGreaterThan(-1)
    const block = s.slice(allIdx, allIdx + 250)
    expect(block).toContain('active')
    expect(block).toContain('setSelectedPharmacyId')
  })

  it("scope.type === 'list' does NOT auto-select (territory roles wait for user)", async () => {
    const s = await src()
    // The auto-select useEffect handles 'single' and 'all'.
    // 'list' has no if-block — only a comment. Verify no conditional branch for list:
    const singleIdx = s.indexOf("scope.type === 'single'")
    const autoBlock = s.slice(singleIdx, singleIdx + 400)
    expect(autoBlock).not.toContain("if (scope.type === 'list')")
    expect(autoBlock).not.toContain("else if (scope.type === 'list')")
  })
})

// ════════════════════════════════════════════════════════════
// 5. Branch selector visibility
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — branch selector', () => {
  it("showSelector is true for 'all' and 'list' scope types only", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'all' || scope?.type === 'list'")
  })

  it("selector is NOT shown for single scope (condition excludes 'single')", async () => {
    const s = await src()
    const showIdx = s.indexOf("scope?.type === 'all' || scope?.type === 'list'")
    const block   = s.slice(showIdx, showIdx + 60)
    expect(block).not.toContain("'single'")
  })

  it('branch selector renders options from allowedPharmacies', async () => {
    const s = await src()
    expect(s).toContain('allowedPharmacies.map')
  })

  it("prompt message shown when scope is 'list' and no branch selected", async () => {
    const s = await src()
    expect(s).toContain('Select a branch above to view team intelligence')
  })

  it("prompt guard checks scope.type === 'list' && !selectedPharmacyId", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'list' && !selectedPharmacyId")
  })
})

// ════════════════════════════════════════════════════════════
// 6. Branch Intelligence link
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — Branch Intelligence link', () => {
  it('link href uses selectedPharmacyId, not userProfile.pharmacyId', async () => {
    const s = await src()
    // Anchor directly on the link's `to` prop — most precise check
    expect(s).toContain('/branch/${selectedPharmacyId}/intelligence')
    expect(s).not.toContain('/branch/${pharmacyId}/intelligence')
  })

  it('link is guarded so it only renders when selectedPharmacyId is set', async () => {
    const s = await src()
    // The conditional rendering guard {selectedPharmacyId && ( must precede the Link
    const guardIdx = s.indexOf('{selectedPharmacyId && (')
    const linkIdx  = s.indexOf('Branch Intelligence →')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeGreaterThan(guardIdx) // guard appears before link text
  })
})

// ════════════════════════════════════════════════════════════
// 7. Pharmacist navigate
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — pharmacist navigate', () => {
  it('navigate call passes selectedPharmacyId as branchId query param', async () => {
    const s = await src()
    const navIdx = s.indexOf('branchId=${selectedPharmacyId}')
    expect(navIdx).toBeGreaterThan(-1)
  })

  it('navigate does not pass userProfile.pharmacyId as branchId', async () => {
    const s = await src()
    expect(s).not.toContain('branchId=${pharmacyId}')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Scope loading / error guards
// ════════════════════════════════════════════════════════════

describe('TeamPage 2F-1 — scope guards', () => {
  it('scopeLoading guard returns "Verifying access" message', async () => {
    const s = await src()
    // Use the if-statement form to skip past the destructuring line
    const idx = s.indexOf('if (scopeLoading)')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('Verifying access')
  })

  it("scope.type === 'none' triggers access denied", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'none'")
    const noneIdx = s.indexOf("scope?.type === 'none'")
    // Access denied text is ~330 chars into the block — use a 450-char window
    const block   = s.slice(noneIdx, noneIdx + 450)
    expect(block).toContain('Access denied')
  })

  it('scopeError is included in the access denied condition', async () => {
    const s = await src()
    // Use the if-statement form to find the guard, not the destructuring line
    const ifIdx = s.indexOf('if (scopeError')
    expect(ifIdx).toBeGreaterThan(-1)
    const block = s.slice(ifIdx, ifIdx + 60)
    expect(block).toContain("scope?.type === 'none'")
  })
})
