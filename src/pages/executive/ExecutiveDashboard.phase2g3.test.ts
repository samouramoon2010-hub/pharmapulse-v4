// ============================================================
// Phase 2G-3 — ExecutiveDashboard Scope-Aware Labels
//
// Verifies that ExecutiveDashboard now uses Scope Resolver for
// all label/UI decisions previously driven by role === 'manager'.
//
// What changed:
//   - useScopeProfile() wired in
//   - isManager derived from scope?.type === 'single'
//   - role === 'manager' hardcoded check removed
//   - pageTitle / branchCountLabel / selectedBranchLabel computed from scope
//   - BranchLeaderboard receives scopeType (not isManager) for subtitle
//
// Test sections:
//   A. ExecutiveDashboard source guards
//   B. Label strings present
//   C. BranchLeaderboard subtitle (Task 6)
//   D. Guardrails — unchanged files
// ============================================================

import { describe, it, expect } from 'vitest'

async function dashSrc(): Promise<string> {
  return (await import('./ExecutiveDashboard.jsx?raw')).default
}

async function leaderboardSrc(): Promise<string> {
  return (await import('../../components/executive/BranchLeaderboard.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// A. ExecutiveDashboard — source guards
// ════════════════════════════════════════════════════════════

describe('2G-3 ExecutiveDashboard — source guards', () => {
  it('imports useScopeProfile', async () => {
    const s = await dashSrc()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('calls useScopeProfile() and destructures scope', async () => {
    const s = await dashSrc()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scope')
  })

  it("no role === 'manager' logic remains", async () => {
    const s = await dashSrc()
    expect(s).not.toContain("role === 'manager'")
    expect(s).not.toContain("userProfile?.role === 'manager'")
  })

  it("uses scope?.type === 'single' for isManager derivation", async () => {
    const s = await dashSrc()
    expect(s).toContain("scope?.type === 'single'")
  })

  it("uses scope?.type === 'all' for label logic", async () => {
    const s = await dashSrc()
    expect(s).toContain("scope?.type === 'all'")
  })

  it("uses scope?.type === 'list' for label logic", async () => {
    const s = await dashSrc()
    expect(s).toContain("scope?.type === 'list'")
  })
})

// ════════════════════════════════════════════════════════════
// B. Label strings — Tasks 3, 4, 5
// ════════════════════════════════════════════════════════════

describe('2G-3 ExecutiveDashboard — label strings', () => {
  it("Task 3: 'Branch Executive View' label present (single scope title)", async () => {
    const s = await dashSrc()
    expect(s).toContain('Branch Executive View')
  })

  it("Task 3: 'Enterprise Executive View' label present (all scope title)", async () => {
    const s = await dashSrc()
    expect(s).toContain('Enterprise Executive View')
  })

  it("Task 3: 'Territory Executive View' label present (list scope title)", async () => {
    const s = await dashSrc()
    expect(s).toContain('Territory Executive View')
  })

  it("Task 4: 'My Branch' label present (single scope branch count)", async () => {
    const s = await dashSrc()
    expect(s).toContain('My Branch')
  })

  it("Task 4: 'All Branches' label present (all scope branch count)", async () => {
    const s = await dashSrc()
    expect(s).toContain('All Branches')
  })

  it("Task 4: 'My Assigned Branches' label present (list scope branch count)", async () => {
    const s = await dashSrc()
    expect(s).toContain('My Assigned Branches')
  })

  it("Task 5: 'Selected Branch' label present (list scope selected branch)", async () => {
    const s = await dashSrc()
    expect(s).toContain('Selected Branch')
  })

  it("Task 5: 'Portfolio Branch' label present (all scope selected branch)", async () => {
    const s = await dashSrc()
    expect(s).toContain('Portfolio Branch')
  })

  it('Task 5: selectedBranchLabel variable declared', async () => {
    const s = await dashSrc()
    expect(s).toContain('selectedBranchLabel')
  })

  it('Task 4: branchCountLabel variable declared', async () => {
    const s = await dashSrc()
    expect(s).toContain('branchCountLabel')
  })

  it('Task 3: pageTitle variable declared', async () => {
    const s = await dashSrc()
    expect(s).toContain('pageTitle')
  })
})

// ════════════════════════════════════════════════════════════
// C. BranchLeaderboard subtitle — Task 6
// ════════════════════════════════════════════════════════════

describe('2G-3 BranchLeaderboard — subtitle (Task 6)', () => {
  it("accepts scopeType prop (isManager removed)", async () => {
    const s = await leaderboardSrc()
    expect(s).toContain('scopeType')
    expect(s).not.toContain('isManager')
  })

  it("single scope → no subtitle (leaderboardSubtitle = null)", async () => {
    const s = await leaderboardSrc()
    expect(s).toContain("scopeType === 'single' ? null")
  })

  it("list scope → 'My Assigned Branches Ranked'", async () => {
    const s = await leaderboardSrc()
    expect(s).toContain('My Assigned Branches Ranked')
  })

  it("all scope → 'All Branches Ranked'", async () => {
    const s = await leaderboardSrc()
    expect(s).toContain('All Branches Ranked')
  })

  it("subtitle conditionally rendered (not always shown)", async () => {
    const s = await leaderboardSrc()
    expect(s).toContain('leaderboardSubtitle &&')
  })

  it("no engine or analytics imports added to BranchLeaderboard", async () => {
    const s = await leaderboardSrc()
    expect(s).not.toContain('useScopeProfile')
    expect(s).not.toContain('filterAllowedPharmacies')
    expect(s).not.toContain('computeExec')
  })
})

// ════════════════════════════════════════════════════════════
// D. Guardrails — unchanged files
// ════════════════════════════════════════════════════════════

describe('2G-3 guardrails — unchanged files', () => {
  it('useExecutiveReport not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../hooks/useExecutiveReport.ts?raw')).default
    expect(s).not.toContain('Phase 2G-3')
    expect(s).toContain('useScopeProfile') // 2G-2 wiring intact
  })

  it('useRegionalIntelligence not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(s).not.toContain('Phase 2G-3')
  })

  it('DashboardPage not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../dashboard/DashboardPage.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
    expect(s).toContain('Phase 2G-1') // 2G-1 wiring intact
  })

  it('PortfolioScoreCard not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../components/executive/PortfolioScoreCard.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
    expect(s).not.toContain('useScopeProfile')
  })

  it('RiskDistributionPanel not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../components/executive/RiskDistributionPanel.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
    expect(s).not.toContain('useScopeProfile')
  })

  it('PortfolioKpiHeatmap not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
  })

  it('ExecutiveInsightsFeed not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../components/executive/ExecutiveInsightsFeed.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
  })

  it('App.jsx not modified (no Phase 2G-3 marker)', async () => {
    const s = (await import('../../App.jsx?raw')).default
    expect(s).not.toContain('Phase 2G-3')
  })

  it('Firestore rules not modified (no Phase 2G-3 marker)', async () => {
    const rules = (await import('../../../firestore.rules?raw')).default
    expect(rules).not.toContain('Phase 2G-3')
  })
})
