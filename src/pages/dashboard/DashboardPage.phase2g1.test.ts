// ============================================================
// Phase 2G-1 — DashboardPage Scope Resolver Migration
//
// Verifies that DashboardPage now uses Scope Resolver for:
//   - subscriptions (scope-type dispatch, dead branch removed)
//   - myEntries (filterAllowedPharmacies-based filter)
//   - currentTarget (list scope aggregation)
//   - branchRanking (shown for all/list, hidden for single)
//   - teamIntelligence (scope.type gate, scope.id for single)
//   - access guards (scopeLoading / scopeError / none)
//
// Also verifies untouched files carry no Phase 2G-1 marker.
//
// All tests are source-level (raw imports — no DOM rendering).
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  return (await import('./DashboardPage.jsx?raw')).default.replace(/\r\n/g, '\n')
}

// ════════════════════════════════════════════════════════════
// A. Imports
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — imports', () => {
  it('imports useScopeProfile from ../../hooks/useScopeProfile', async () => {
    const s = await src()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('imports filterAllowedPharmacies from ../../services/scopeResolver', async () => {
    const s = await src()
    expect(s).toContain('filterAllowedPharmacies')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  it('calls useScopeProfile() and destructures scope + scopeLoading + scopeError', async () => {
    const s = await src()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scopeLoading')
    expect(s).toContain('scopeError')
  })

  it('derives allowedPharmacies via filterAllowedPharmacies(scope, pharmacies)', async () => {
    const s = await src()
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
    expect(s).toContain('allowedPharmacies')
  })
})

// ════════════════════════════════════════════════════════════
// B. Legacy patterns removed
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — legacy patterns removed', () => {
  it('isAdmin variable declaration removed', async () => {
    const s = await src()
    expect(s).not.toContain("const isAdmin   = role === 'admin'")
    expect(s).not.toContain("const isAdmin = role === 'admin'")
  })

  it('isManager variable declaration removed', async () => {
    const s = await src()
    expect(s).not.toContain("const isManager = ['manager','admin'].includes(role)")
    expect(s).not.toContain("const isManager = [")
  })

  it('noBranch variable removed', async () => {
    const s = await src()
    expect(s).not.toContain('noBranch')
  })

  it('dead else-if (uid && pharmacyId) branch removed from subscriptions', async () => {
    const s = await src()
    expect(s).not.toContain('else if (uid && pharmacyId)')
    expect(s).not.toContain('subscribeMyEntries')
  })
})

// ════════════════════════════════════════════════════════════
// C. Subscriptions — scope-driven dispatch
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — subscriptions', () => {
  it("all scope → subscribeRecentEntries + subscribeRecentTargets", async () => {
    const s = await src()
    const allIdx = s.indexOf("scope.type === 'all' || scope.type === 'list'")
    expect(allIdx).toBeGreaterThan(-1)
    const block = s.slice(allIdx, allIdx + 200)
    expect(block).toContain('subscribeRecentEntries()')
    expect(block).toContain('subscribeRecentTargets()')
  })

  it("list scope → subscribeRecentEntries + subscribeRecentTargets (same branch)", async () => {
    const s = await src()
    // list is handled in the same branch as 'all'
    expect(s).toContain("scope.type === 'all' || scope.type === 'list'")
  })

  it("single scope → subscribePharmacyEntries(scope.id) + subscribeMyTargets(scope.id)", async () => {
    const s = await src()
    const singleIdx = s.indexOf("scope.type === 'single'")
    expect(singleIdx).toBeGreaterThan(-1)
    const block = s.slice(singleIdx, singleIdx + 200)
    expect(block).toContain('subscribePharmacyEntries(scope.id)')
    expect(block).toContain('subscribeMyTargets(scope.id)')
  })

  it('subscription effect deps include scope (not legacy uid/pharmacyId/role)', async () => {
    const s = await src()
    // The cleanup line is unique to the subscription effect — deps follow immediately after
    const subscribeIdx = s.indexOf('uns.forEach((u) => u?.())')
    expect(subscribeIdx).toBeGreaterThan(-1)
    const afterBlock = s.slice(subscribeIdx, subscribeIdx + 100)
    const depsIdx = afterBlock.indexOf('}, [')
    const depsLine = afterBlock.slice(depsIdx, depsIdx + 40)
    expect(depsLine).toContain('[scope, tick]')
  })

  it('subscription effect guards on !scope', async () => {
    const s = await src()
    expect(s).toContain('if (!scope) return')
  })
})

// ════════════════════════════════════════════════════════════
// D. myEntries — scope-filtered
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — myEntries', () => {
  it('myEntries returns [] when scope is null', async () => {
    const s = await src()
    const myEntriesIdx = s.indexOf('const myEntries = useMemo')
    const block = s.slice(myEntriesIdx, myEntriesIdx + 300)
    expect(block).toContain('if (!scope) return []')
  })

  it("myEntries returns all entries for 'all' scope (admin / GM)", async () => {
    const s = await src()
    const myEntriesIdx = s.indexOf('const myEntries = useMemo')
    const block = s.slice(myEntriesIdx, myEntriesIdx + 300)
    expect(block).toContain("if (scope.type === 'all') return entries")
  })

  it('myEntries filters by allowedPharmacies for non-all scope', async () => {
    const s = await src()
    const myEntriesIdx = s.indexOf('const myEntries = useMemo')
    const block = s.slice(myEntriesIdx, myEntriesIdx + 300)
    expect(block).toContain('allowedPharmacies.map((p) => p.id)')
    expect(block).toContain('allowedIds.has(e.pharmacyId)')
  })

  it('myEntries deps include scope and allowedPharmacies (not isAdmin/pharmacyId)', async () => {
    const s = await src()
    const myEntriesIdx = s.indexOf('const myEntries = useMemo')
    const block = s.slice(myEntriesIdx, myEntriesIdx + 300)
    expect(block).toContain('[entries, scope, allowedPharmacies]')
    expect(block).not.toContain('isAdmin')
  })
})

// ════════════════════════════════════════════════════════════
// E. currentTarget — list scope aggregation
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — currentTarget', () => {
  it("'all' scope aggregates all pharmacy targets (admin / GM)", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'all'")
    const allIdx = s.indexOf("scope?.type === 'all'")
    const block = s.slice(allIdx, allIdx + 300)
    expect(block).toContain("pharmacyId: 'all'")
  })

  it("'list' scope aggregates assigned branch targets (district_supervisor / regional_manager)", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'list'")
    const listIdx = s.indexOf("scope?.type === 'list'")
    const block = s.slice(listIdx, listIdx + 300)
    expect(block).toContain("pharmacyId: 'list'")
    expect(block).toContain('scope.ids')
  })

  it("'single' scope finds own pharmacy target (manager / branch_manager)", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'single'")
    const singleIdx = s.indexOf("scope?.type === 'single'")
    const block = s.slice(singleIdx, singleIdx + 200)
    expect(block).toContain('scope.id')
    expect(block).toContain('t.pharmacyId === scope.id')
  })

  it('currentTarget deps include scope (not isAdmin/pharmacyId)', async () => {
    const s = await src()
    const idx = s.indexOf('[targets, scope, thisMonth]')
    expect(idx).toBeGreaterThan(-1)
  })
})

// ════════════════════════════════════════════════════════════
// F. branchRanking — scope-driven visibility
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — branchRanking', () => {
  it("branchRanking returns [] for single scope (manager / branch_manager)", async () => {
    const s = await src()
    const idx = s.indexOf('const branchRanking = useMemo')
    const block = s.slice(idx, idx + 300)
    expect(block).toContain("scope.type === 'single'")
    // The guard returns []
    expect(block).toContain('return []')
  })

  it("branchRanking uses allowedPharmacies (not raw pharmacies)", async () => {
    const s = await src()
    const idx = s.indexOf('const branchRanking = useMemo')
    const block = s.slice(idx, idx + 300)
    expect(block).toContain('allowedPharmacies.map')
    expect(block).not.toContain('pharmacies.map')
  })

  it('branchRanking no longer gates on isAdmin', async () => {
    const s = await src()
    const idx = s.indexOf('const branchRanking = useMemo')
    const block = s.slice(idx, idx + 300)
    expect(block).not.toContain('isAdmin')
  })
})

// ════════════════════════════════════════════════════════════
// G. teamIntelligence — scope-aware gate
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — teamIntelligence', () => {
  it('teamIntelligence gates on scope.type not isManager', async () => {
    const s = await src()
    const idx = s.indexOf('const teamIntelligence = useMemo')
    const block = s.slice(idx, idx + 600)
    expect(block).not.toContain('isManager')
    expect(block).not.toContain('!pharmacyId')
    expect(block).toContain("scope?.type === 'single'")
  })

  it("teamIntelligence uses scope.id for single scope", async () => {
    const s = await src()
    const idx = s.indexOf('const teamIntelligence = useMemo')
    const block = s.slice(idx, idx + 400)
    const singleIdx = block.indexOf("scope?.type === 'single'")
    expect(singleIdx).toBeGreaterThan(-1)
    const after = block.slice(singleIdx, singleIdx + 60)
    expect(after).toContain('scope.id')
  })

  it("teamIntelligence uses first allowedPharmacy for list scope", async () => {
    const s = await src()
    const idx = s.indexOf('const teamIntelligence = useMemo')
    const block = s.slice(idx, idx + 500)
    expect(block).toContain("scope?.type === 'list'")
    expect(block).toContain('allowedPharmacies[0]?.id')
  })

  it('teamIntelligence filters entries to teamPharmacyId (branchEntries)', async () => {
    const s = await src()
    const idx = s.indexOf('const teamIntelligence = useMemo')
    const block = s.slice(idx, idx + 800)
    expect(block).toContain('branchEntries')
    expect(block).toContain('e.pharmacyId === teamPharmacyId')
  })

  it('teamIntelligence deps include scope and allowedPharmacies', async () => {
    const s = await src()
    const idx = s.indexOf('[scope, allowedPharmacies, myEntries, currentTarget, loading,')
    expect(idx).toBeGreaterThan(-1)
  })
})

// ════════════════════════════════════════════════════════════
// H. Access guards
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — access guards', () => {
  it('scopeLoading guard returns loading message', async () => {
    const s = await src()
    const idx = s.indexOf('if (scopeLoading)')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('Loading dashboard')
  })

  it("scopeError || scope?.type === 'none' triggers access denied", async () => {
    const s = await src()
    expect(s).toContain("scopeError || scope?.type === 'none'")
    const noneIdx = s.indexOf("scopeError || scope?.type === 'none'")
    const block = s.slice(noneIdx, noneIdx + 400)
    expect(block).toContain('Access denied')
  })

  it('scope guards are placed before the return JSX (after all hooks)', async () => {
    const s = await src()
    const scopeGuardIdx = s.indexOf('if (scopeLoading)')
    const returnJsxIdx  = s.indexOf('return (\n    <div style={{ maxWidth:')
    expect(scopeGuardIdx).toBeGreaterThan(-1)
    expect(returnJsxIdx).toBeGreaterThan(-1)
    expect(scopeGuardIdx).toBeLessThan(returnJsxIdx)
  })
})

// ════════════════════════════════════════════════════════════
// I. JSX scope checks
// ════════════════════════════════════════════════════════════

describe('2G-1 DashboardPage — JSX scope checks', () => {
  it("branch ranking shown for scope !== 'single'", async () => {
    const s = await src()
    expect(s).toContain("scope?.type !== 'single'")
  })

  it("TeamIntelligenceCard shown for single or list scope", async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'single' || scope?.type === 'list'")
    // The old isManager gate is gone
    const tiCardIdx = s.indexOf('<TeamIntelligenceCard')
    expect(tiCardIdx).toBeGreaterThan(-1)
    const before = s.slice(Math.max(0, tiCardIdx - 100), tiCardIdx)
    expect(before).not.toContain('isManager')
  })

  it("no-entries banner shown for single or list scope only", async () => {
    const s = await src()
    expect(s).toContain("(scope?.type === 'single' || scope?.type === 'list') && monthEntries.length === 0")
  })

  it("hero section no longer guards on noBranch", async () => {
    const s = await src()
    // Hero now just checks !loading
    expect(s).not.toContain('!noBranch')
  })

  it("pharmName uses scope type for label (not isAdmin)", async () => {
    const s = await src()
    const pharmNameIdx = s.indexOf('const pharmName')
    const block = s.slice(pharmNameIdx, pharmNameIdx + 150)
    expect(block).toContain("scope?.type === 'all'")
    expect(block).not.toContain('isAdmin')
  })

  it("teamHeroState uses scope?.type === 'all' (not isAdmin)", async () => {
    const s = await src()
    const idx = s.indexOf('const teamHeroState')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("scope?.type === 'all'")
    expect(block).not.toContain('isAdmin')
  })
})

// ════════════════════════════════════════════════════════════
// J. Guardrails — unchanged files
// ════════════════════════════════════════════════════════════

describe('2G-1 guardrails — unchanged files', () => {
  it('useExecutiveReport not modified (no Phase 2G-1 marker)', async () => {
    const s = (await import('../../hooks/useExecutiveReport.ts?raw')).default
    expect(s).not.toContain('Phase 2G-1')
    // Phase 2G-2 changes are still present
    expect(s).toContain('useScopeProfile')
  })

  it('useRegionalIntelligence not modified (no Phase 2G-1 marker)', async () => {
    const s = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(s).not.toContain('Phase 2G-1')
    expect(s).toContain('useScopeProfile')
  })

  it('ExecutiveDashboard not modified by Phase 2G-1 (no Phase 2G-1 marker)', async () => {
    const s = (await import('../executive/ExecutiveDashboard.jsx?raw')).default
    // Phase 2G-3 legitimately modifies ExecutiveDashboard — guard only against 2G-1.
    expect(s).not.toContain('Phase 2G-1')
  })

  it('BranchLeaderboard not modified (no Phase 2G marker)', async () => {
    const s = (await import('../../components/executive/BranchLeaderboard.jsx?raw')).default
    expect(s).not.toContain('Phase 2G')
  })

  it('App.jsx not modified (no Phase 2G-1 marker)', async () => {
    const s = (await import('../../App.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-1')
  })

  it('Firestore rules not modified (no Phase 2G marker)', async () => {
    const rules = (await import('../../../firestore.rules?raw')).default
    expect(rules).not.toContain('Phase 2G')
  })
})
