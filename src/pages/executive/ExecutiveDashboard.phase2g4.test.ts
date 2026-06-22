// ============================================================
// Phase 2G-4 — Executive Drilldown Selection Guard
//
// Verifies that handleSelectBranch in ExecutiveDashboard now
// defends against out-of-scope branch selections:
//
//   1. Null/unresolved scope → selection ignored
//   2. Branch not in scope   → selection ignored (stale/race)
//   3. Branch in scope       → selection proceeds normally
//
// The guard reuses the already-imported useScopeProfile() scope
// and the isPharmacyAllowed() predicate from scopeResolver.
//
// All tests are source-level or fixture-based (no DOM rendering).
// ============================================================

import { describe, it, expect } from 'vitest'
import { isPharmacyAllowed } from '../../services/scopeResolver'
import type { PharmacyScope } from '../../services/scopeResolver'

async function dashSrc(): Promise<string> {
  return (await import('./ExecutiveDashboard.jsx?raw')).default
}

// ── Guard logic fixture ───────────────────────────────────
// Mirrors the exact handleSelectBranch guard so behavioral tests
// don't need DOM rendering.
function guardPasses(scope: PharmacyScope | null | undefined, pharmacyId: string): boolean {
  if (!scope) return false
  if (!isPharmacyAllowed(scope, pharmacyId)) return false
  return true
}

// ════════════════════════════════════════════════════════════
// A. Source guards — imports and structure
// ════════════════════════════════════════════════════════════

describe('2G-4 ExecutiveDashboard — source guards', () => {
  it('imports isPharmacyAllowed from ../../services/scopeResolver', async () => {
    const s = await dashSrc()
    expect(s).toContain('isPharmacyAllowed')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  it('handleSelectBranch guards on !scope before any branch state update', async () => {
    const s = await dashSrc()
    const fnIdx = s.indexOf('const handleSelectBranch')
    expect(fnIdx).toBeGreaterThan(-1)
    const block = s.slice(fnIdx, fnIdx + 200)
    expect(block).toContain('if (!scope) return')
  })

  it('handleSelectBranch guards on isPharmacyAllowed(scope, branch.pharmacyId)', async () => {
    const s = await dashSrc()
    const fnIdx = s.indexOf('const handleSelectBranch')
    const block = s.slice(fnIdx, fnIdx + 200)
    expect(block).toContain('isPharmacyAllowed(scope, branch.pharmacyId)')
  })

  it('scope guard appears before setSelectedBranch call', async () => {
    const s = await dashSrc()
    const fnIdx  = s.indexOf('const handleSelectBranch')
    const block  = s.slice(fnIdx, fnIdx + 300)
    const scopeGuardIdx = block.indexOf('if (!scope) return')
    const setStateIdx   = block.indexOf('setSelectedBranch')
    expect(scopeGuardIdx).toBeGreaterThan(-1)
    expect(setStateIdx).toBeGreaterThan(-1)
    expect(scopeGuardIdx).toBeLessThan(setStateIdx)
  })

  it('isPharmacyAllowed guard appears before setSelectedBranch call', async () => {
    const s = await dashSrc()
    const fnIdx = s.indexOf('const handleSelectBranch')
    const block = s.slice(fnIdx, fnIdx + 300)
    const allowedGuardIdx = block.indexOf('isPharmacyAllowed')
    const setStateIdx     = block.indexOf('setSelectedBranch')
    expect(allowedGuardIdx).toBeGreaterThan(-1)
    expect(allowedGuardIdx).toBeLessThan(setStateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// B. Guard behavior — fixture tests
// ════════════════════════════════════════════════════════════

describe('2G-4 handleSelectBranch guard — behavior', () => {
  it('null scope → selection ignored', () => {
    expect(guardPasses(null, 'ph-a')).toBe(false)
  })

  it('undefined scope → selection ignored', () => {
    expect(guardPasses(undefined, 'ph-a')).toBe(false)
  })

  it("scope.type 'none' → all selections ignored", () => {
    const scope: PharmacyScope = { type: 'none' }
    expect(guardPasses(scope, 'ph-a')).toBe(false)
  })

  it("scope.type 'single' → only own branch allowed", () => {
    const scope: PharmacyScope = { type: 'single', id: 'ph-a' }
    expect(guardPasses(scope, 'ph-a')).toBe(true)
    expect(guardPasses(scope, 'ph-b')).toBe(false)
  })

  it("scope.type 'list' → assigned branches allowed, unassigned ignored", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a', 'ph-c'] }
    expect(guardPasses(scope, 'ph-a')).toBe(true)
    expect(guardPasses(scope, 'ph-c')).toBe(true)
    expect(guardPasses(scope, 'ph-b')).toBe(false)
  })

  it("scope.type 'all' → any branch allowed (admin / GM)", () => {
    const scope: PharmacyScope = { type: 'all' }
    expect(guardPasses(scope, 'ph-a')).toBe(true)
    expect(guardPasses(scope, 'ph-xyz')).toBe(true)
  })

  it('stale branch after scope change → ignored (list scope, branch no longer assigned)', () => {
    const staleBranch = 'ph-z'
    const newScope: PharmacyScope = { type: 'list', ids: ['ph-a', 'ph-b'] }
    expect(guardPasses(newScope, staleBranch)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// C. Guardrails — unchanged files
// ════════════════════════════════════════════════════════════

describe('2G-4 guardrails — unchanged files', () => {
  it('BranchLeaderboard not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../../components/executive/BranchLeaderboard.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-4')
    expect(s).not.toContain('isPharmacyAllowed')
  })

  it('BranchDrilldown not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../../components/executive/BranchDrilldown.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-4')
    expect(s).not.toContain('isPharmacyAllowed')
  })

  it('useExecutiveReport not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../../hooks/useExecutiveReport.ts?raw')).default
    expect(s).not.toContain('Phase 2G-4')
  })

  it('useRegionalIntelligence not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(s).not.toContain('Phase 2G-4')
  })

  it('DashboardPage not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../dashboard/DashboardPage.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-4')
  })

  it('App.jsx not modified (no Phase 2G-4 marker)', async () => {
    const s = (await import('../../App.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-4')
  })

  it('Firestore rules not modified (no Phase 2G-4 marker)', async () => {
    const rules = (await import('../../../firestore.rules?raw')).default
    expect(rules).not.toContain('Phase 2G-4')
  })
})
