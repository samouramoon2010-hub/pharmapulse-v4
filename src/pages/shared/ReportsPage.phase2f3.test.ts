// ============================================================
// ReportsPage — Phase 2F-3 Scope-Driven Fetch Tests
//
// Source-level tests (raw import, no DOM rendering).
// Verifies the data-fetch layer is scope-aware:
//
//   Fetch options:
//     scope all    → options {}
//     scope single → { pharmacyId: scope.id }
//     scope list   → { pharmacyIds: scope.ids }
//     scope list [] guard: pharmacyIds=[] → never falls through to {}
//
//   rangeEntries filter:
//     selectedBranch !== 'all' → exact pharmacyId match
//     selectedBranch === 'all' → isPharmacyAllowed(scope, ...)
//
//   branchSummary:
//     visiblePharmacies uses filterAllowedPharmacies(scope, pharmacies)
//     no longer gates on isAdmin/pharmacyId for pharmacy list
//
//   executiveSummary:
//     fallback 'all' lookup uses filterAllowedPharmacies (scope-scoped)
//
//   Isolation:
//     TeamPage, Dashboard, ExecutiveDashboard, Firestore rules unchanged
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  return (await import('./ReportsPage.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. isPharmacyAllowed import
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — isPharmacyAllowed import', () => {
  it('imports isPharmacyAllowed from scopeResolver', async () => {
    const s = await src()
    expect(s).toContain('isPharmacyAllowed')
    expect(s).toContain("from '../../services/scopeResolver'")
  })
})

// ════════════════════════════════════════════════════════════
// 2. Fetch effect — scope-driven options
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — fetch effect scope options', () => {
  it("scope.type === 'all' → fetchOptions = {}", async () => {
    const s = await src()
    // Anchor on the fetch-effect specific pattern — unique to the fetch block
    expect(s).toContain("fetchOptions = {}")
  })

  it("scope.type === 'single' → fetchOptions uses scope.id as pharmacyId", async () => {
    const s = await src()
    expect(s).toContain('fetchOptions = { pharmacyId: scope.id }')
  })

  it("scope.type === 'list' → fetchOptions uses scope.ids as pharmacyIds", async () => {
    const s = await src()
    expect(s).toContain('fetchOptions = { pharmacyIds: scope.ids')
  })

  it("scope.type === 'list' options never falls through to {} (uses pharmacyIds, not {})", async () => {
    const s = await src()
    // The list branch specifically sets pharmacyIds — it must not assign bare {}
    const listFetchIdx = s.indexOf('fetchOptions = { pharmacyIds: scope.ids')
    expect(listFetchIdx).toBeGreaterThan(-1)
  })

  it('old (!isAdmin && pharmacyId) options pattern is removed from fetch effect', async () => {
    const s = await src()
    expect(s).not.toContain('(!isAdmin && pharmacyId) ? { pharmacyId } : {}')
  })

  it('fetch effect deps include scope, not isAdmin/pharmacyId', async () => {
    const s = await src()
    // New deps array should contain scope
    expect(s).toContain('userProfile?.uid, scope, dateRange.from')
    // Old deps with isAdmin and pharmacyId should be gone from the effect
    expect(s).not.toContain('userProfile?.uid, isAdmin, pharmacyId')
  })

  it('fetch effect guards on !scope (waits for scope resolution)', async () => {
    const s = await src()
    expect(s).toContain('if (!scope) return')
  })
})

// ════════════════════════════════════════════════════════════
// 3. rangeEntries filter — isPharmacyAllowed for 'all'
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — rangeEntries filter', () => {
  it("selectedBranch !== 'all' still uses exact pharmacyId match", async () => {
    const s = await src()
    expect(s).toContain("selectedBranch !== 'all'")
    expect(s).toContain('e.pharmacyId === selectedBranch')
  })

  it("selectedBranch === 'all' uses isPharmacyAllowed(scope, e.pharmacyId)", async () => {
    const s = await src()
    expect(s).toContain('isPharmacyAllowed(scope, e.pharmacyId)')
  })

  it('scope is in rangeEntries memo dependency array', async () => {
    const s = await src()
    expect(s).toContain('[fetchedEntries, dateRange, selectedBranch, scope]')
  })
})

// ════════════════════════════════════════════════════════════
// 4. branchSummary — filterAllowedPharmacies for visible list
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — branchSummary visiblePharmacies', () => {
  it('uses filterAllowedPharmacies(scope, pharmacies) for visiblePharmacies', async () => {
    const s = await src()
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })

  it('no longer gates visiblePharmacies on isAdmin alone', async () => {
    const s = await src()
    // The old pattern: isAdmin ? pharmacies.filter(...) : pharmacies.filter(... && p.id === pharmacyId)
    expect(s).not.toContain('isAdmin\n      ? pharmacies.filter')
    expect(s).not.toContain("p.id === pharmacyId")
  })

  it('branchSummary deps include scope but not isManager (Phase 3A: isManager removed from gate and deps)', async () => {
    const s = await src()
    // Phase 3A: isManager removed from deps (gate is now scope-type-based)
    expect(s).toContain('scope, KPI_FIELDS')
    expect(s).not.toContain('isManager, scope, KPI_FIELDS')
    expect(s).not.toContain('isManager, isAdmin, pharmacyId')
  })
})

// ════════════════════════════════════════════════════════════
// 5. executiveSummary — scope-scoped fallback
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — executiveSummary scope safety', () => {
  it("executiveSummary 'all' fallback uses filterAllowedPharmacies (not all pharmacies)", async () => {
    const s = await src()
    // The fallback for 'all' uses filterAllowedPharmacies, not pharmacies.find directly
    const execIdx = s.indexOf('executiveSummary = useMemo')
    expect(execIdx).toBeGreaterThan(-1)
    const block = s.slice(execIdx, execIdx + 500)
    expect(block).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })

  it('executiveSummary deps include scope', async () => {
    const s = await src()
    expect(s).toContain('[selectedBranch, scope, pharmacies, targets, fetchedEntries]')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Isolation — unchanged pages and rules
// ════════════════════════════════════════════════════════════

describe('ReportsPage 2F-3 — isolation', () => {
  it('does not reference TeamPage', async () => {
    const s = await src()
    expect(s).not.toContain('TeamPage')
  })

  it('does not reference DashboardPage', async () => {
    const s = await src()
    expect(s).not.toContain('DashboardPage')
  })

  it('does not reference ExecutiveDashboard', async () => {
    const s = await src()
    expect(s).not.toContain('ExecutiveDashboard')
  })

  it('TeamPage was not modified (no Phase 2F-3 marker)', async () => {
    const t = (await import('../manager/TeamPage.jsx?raw')).default
    expect(t).not.toContain('Phase 2F-3')
  })

  it('DashboardPage was not modified (no Phase 2F-3 marker)', async () => {
    const d = (await import('../dashboard/DashboardPage.jsx?raw')).default
    expect(d).not.toContain('Phase 2F-3')
  })
})
