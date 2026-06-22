// ============================================================
// Phase 2G-2 — Executive BI Scope Leak Fix
//
// Regression tests for the scopedPharmacies migration in:
//   useExecutiveReport.ts
//   useRegionalIntelligence.ts
//
// Bug closed:
//   district_supervisor and regional_manager fell through to
//   `return pharmacies` (all branches) in both hooks.
//   Phase 2G-2 replaces the legacy role check with
//   filterAllowedPharmacies(scope, pharmacies) so scope.type
//   determines the visible pharmacy set at all times.
//
// Test strategy:
//   Source-level (raw imports) — verifies the structural change.
//   Scope logic  — verifies filterAllowedPharmacies behavior per
//                  scope type (delegates to the engine; no mocks needed).
//   Guardrails   — verifies unchanged files carry no 2G-2 marker.
//
// All 3 file categories:
//   A. useExecutiveReport source guards
//   B. useRegionalIntelligence source guards
//   C. Scope-type → pharmacy mapping (behavior parity tests)
//   D. Unchanged-file guardrails
// ============================================================

import { describe, it, expect } from 'vitest'
import { filterAllowedPharmacies } from '../services/scopeResolver'
import type { PharmacyScope } from '../services/scopeResolver'

// ── Shared raw-import helpers ─────────────────────────────────

async function execSrc(): Promise<string> {
  return (await import('./useExecutiveReport.ts?raw')).default
}

async function regSrc(): Promise<string> {
  return (await import('./useRegionalIntelligence.ts?raw')).default
}

// ── Fixture pharmacies ────────────────────────────────────────

const PHARMACIES = [
  { id: 'ph-a', name: 'Alpha',  active: true  },
  { id: 'ph-b', name: 'Beta',   active: true  },
  { id: 'ph-c', name: 'Gamma',  active: true  },
  { id: 'ph-d', name: 'Delta',  active: false },
]

// ════════════════════════════════════════════════════════════
// A. useExecutiveReport — source guards
// ════════════════════════════════════════════════════════════

describe('2G-2 useExecutiveReport — source guards', () => {
  it('imports useScopeProfile from ./useScopeProfile', async () => {
    const s = await execSrc()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from './useScopeProfile'")
  })

  it('imports filterAllowedPharmacies from ../services/scopeResolver', async () => {
    const s = await execSrc()
    expect(s).toContain('filterAllowedPharmacies')
    expect(s).toContain("from '../services/scopeResolver'")
  })

  it('calls useScopeProfile() and destructures scope + scopeLoading', async () => {
    const s = await execSrc()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scopeLoading')
    expect(s).toContain('scope')
  })

  it('includes scopeLoading in combined loading flag', async () => {
    const s = await execSrc()
    expect(s).toContain('scopeLoading')
    const loadingIdx = s.indexOf('const loading =')
    const loadingLine = s.slice(loadingIdx, loadingIdx + 80)
    expect(loadingLine).toContain('scopeLoading')
  })

  it('scopedPharmacies guards on !scope → return []', async () => {
    const s = await execSrc()
    expect(s).toContain('if (!scope) return []')
  })

  it('scopedPharmacies calls filterAllowedPharmacies(scope, pharmacies)', async () => {
    const s = await execSrc()
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })

  it('no longer uses hardcoded manager/branch_manager role check for scoping', async () => {
    const s = await execSrc()
    // The old pattern that leaked all branches to territory roles
    expect(s).not.toContain("userProfile?.role === 'manager' || userProfile?.role === 'branch_manager'")
    // The old fallthrough
    expect(s).not.toContain('return pharmacies\n  }, [pharmacies, userProfile?.role')
  })

  it('scopedPharmacies memo deps are [scope, pharmacies]', async () => {
    const s = await execSrc()
    // Find the scopedPharmacies memo closing deps
    const memoIdx = s.indexOf('filterAllowedPharmacies(scope, pharmacies)')
    expect(memoIdx).toBeGreaterThan(-1)
    const block = s.slice(memoIdx, memoIdx + 60)
    expect(block).toContain('scope, pharmacies')
  })

  it('userProfile is still used for generatedBy', async () => {
    const s = await execSrc()
    expect(s).toContain('userProfile?.id')
    expect(s).toContain('useAuthStore')
  })
})

// ════════════════════════════════════════════════════════════
// B. useRegionalIntelligence — source guards
// ════════════════════════════════════════════════════════════

describe('2G-2 useRegionalIntelligence — source guards', () => {
  it('imports useScopeProfile from ./useScopeProfile', async () => {
    const s = await regSrc()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from './useScopeProfile'")
  })

  it('imports filterAllowedPharmacies from ../services/scopeResolver', async () => {
    const s = await regSrc()
    expect(s).toContain('filterAllowedPharmacies')
    expect(s).toContain("from '../services/scopeResolver'")
  })

  it('calls useScopeProfile() and destructures scope + scopeLoading', async () => {
    const s = await regSrc()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scopeLoading')
  })

  it('includes scopeLoading in combined loading flag', async () => {
    const s = await regSrc()
    const loadingIdx = s.indexOf('const loading =')
    const loadingLine = s.slice(loadingIdx, loadingIdx + 80)
    expect(loadingLine).toContain('scopeLoading')
  })

  it('scopedPharmacies guards on !scope → return []', async () => {
    const s = await regSrc()
    expect(s).toContain('if (!scope) return []')
  })

  it('scopedPharmacies calls filterAllowedPharmacies(scope, pharmacies)', async () => {
    const s = await regSrc()
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })

  it('no longer uses hardcoded manager/branch_manager role check for scoping', async () => {
    const s = await regSrc()
    expect(s).not.toContain("userProfile?.role === 'manager' || userProfile?.role === 'branch_manager'")
    expect(s).not.toContain('return pharmacies\n  }, [pharmacies, userProfile?.role')
  })

  it('useAuthStore removed — no longer needed after scope resolver wiring', async () => {
    const s = await regSrc()
    // useRegionalIntelligence no longer needs userProfile directly
    expect(s).not.toContain("from '../store/authStore'")
    expect(s).not.toContain('useAuthStore')
  })
})

// ════════════════════════════════════════════════════════════
// C. Scope type → pharmacy mapping (behavior parity)
//    These tests verify filterAllowedPharmacies behavior that
//    useExecutiveReport / useRegionalIntelligence now delegate to.
// ════════════════════════════════════════════════════════════

describe('2G-2 scope type → pharmacy mapping', () => {
  it('null scope → [] (loading / unresolved)', () => {
    // Simulates the !scope guard in both hooks
    const scope: PharmacyScope | null = null
    const result = scope ? filterAllowedPharmacies(scope, PHARMACIES) : []
    expect(result).toEqual([])
  })

  it("scope.type 'all' → all pharmacies (admin / GM)", () => {
    const scope: PharmacyScope = { type: 'all' }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result.map((p) => p.id)).toContain('ph-a')
    expect(result.map((p) => p.id)).toContain('ph-b')
    expect(result.map((p) => p.id)).toContain('ph-c')
    expect(result).toHaveLength(PHARMACIES.length)
  })

  it("scope.type 'single' → own pharmacy only (manager / branch_manager)", () => {
    const scope: PharmacyScope = { type: 'single', id: 'ph-b' }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ph-b')
  })

  it("scope.type 'list' → assigned pharmacies (district_supervisor / regional_manager)", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a', 'ph-c'] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.id)).toContain('ph-a')
    expect(result.map((p) => p.id)).toContain('ph-c')
    expect(result.map((p) => p.id)).not.toContain('ph-b')
  })

  it("scope.type 'none' → [] (no access)", () => {
    const scope: PharmacyScope = { type: 'none' }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result).toEqual([])
  })

  it('district_supervisor cannot see unassigned branches', () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a'] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result.map((p) => p.id)).not.toContain('ph-b')
    expect(result.map((p) => p.id)).not.toContain('ph-c')
    expect(result.map((p) => p.id)).not.toContain('ph-d')
  })

  it('regional_manager cannot see all pharmacies via list scope', () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-b', 'ph-c'] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    // Must NOT include ph-a (not in assigned list)
    expect(result.map((p) => p.id)).not.toContain('ph-a')
    expect(result).toHaveLength(2)
  })

  it('list scope with [] → [] (no pharmacies assigned)', () => {
    const scope: PharmacyScope = { type: 'list', ids: [] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// D. Guardrails — unchanged files carry no 2G-2 marker
// ════════════════════════════════════════════════════════════

describe('2G-2 guardrails — unchanged files', () => {
  it('DashboardPage not modified by Phase 2G-2 (no Phase 2G-2 marker)', async () => {
    const s = (await import('../pages/dashboard/DashboardPage.jsx?raw')).default
    // Phase 2G-1 legitimately adds useScopeProfile and the Phase 2G-1 comment —
    // guard only against Phase 2G-2 which must not touch DashboardPage.
    expect(s).not.toContain('Phase 2G-2')
  })

  it('ExecutiveDashboard not modified by Phase 2G-2 (no Phase 2G-2 marker)', async () => {
    const s = (await import('../pages/executive/ExecutiveDashboard.jsx?raw')).default
    // Phase 2G-3 legitimately adds useScopeProfile and Phase 2G-3 comment — guard only against 2G-2.
    expect(s).not.toContain('Phase 2G-2')
  })

  it('BranchLeaderboard not modified (no Phase 2G marker)', async () => {
    const s = (await import('../components/executive/BranchLeaderboard.jsx?raw')).default
    expect(s).not.toContain('Phase 2G')
  })

  it('PortfolioScoreCard not modified (no Phase 2G marker)', async () => {
    const s = (await import('../components/executive/PortfolioScoreCard.jsx?raw')).default
    expect(s).not.toContain('Phase 2G')
  })

  it('App.jsx not modified (no Phase 2G marker)', async () => {
    const s = (await import('../App.jsx?raw')).default
    expect(s).not.toContain('Phase 2G')
  })

  it('Firestore rules not modified (no Phase 2G marker)', async () => {
    const rules = (await import('../../firestore.rules?raw')).default
    expect(rules).not.toContain('Phase 2G')
  })
})
