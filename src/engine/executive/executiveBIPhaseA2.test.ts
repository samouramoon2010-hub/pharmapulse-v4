// ============================================================
// Executive BI Phase A.2 — Manager View Polish Tests
//
// Verifies that:
//  - manager sees Branch Executive View title
//  - manager sees Branch Score / Branch KPI Achievement etc.
//  - manager does NOT see Regional Intelligence
//  - admin still sees Executive BI / Portfolio labels
//  - no route/scoping regression introduced
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'

async function dashboardSrc(): Promise<string> {
  return (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
}

async function scoreCardSrc(): Promise<string> {
  return (await import('../../components/executive/PortfolioScoreCard.jsx?raw')).default
}

async function riskPanelSrc(): Promise<string> {
  return (await import('../../components/executive/RiskDistributionPanel.jsx?raw')).default
}

async function heatmapSrc(): Promise<string> {
  return (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
}

async function leaderboardSrc(): Promise<string> {
  return (await import('../../components/executive/BranchLeaderboard.jsx?raw')).default
}

async function insightsSrc(): Promise<string> {
  return (await import('../../components/executive/ExecutiveInsightsFeed.jsx?raw')).default
}

// ─────────────────────────────────────────────────────────────
// 1. Dashboard — page title and subtitle
// ─────────────────────────────────────────────────────────────

describe('Phase A.2 — Dashboard: manager page title', () => {
  it('manager sees "Branch Executive View" title', async () => {
    const src = await dashboardSrc()
    // Phase 2G-3: pageTitle variable replaces the inline ternary
    expect(src).toContain("'Branch Executive View'")
    expect(src).toContain('pageTitle')
  })

  it('admin sees "Executive BI" title (unchanged)', async () => {
    const src = await dashboardSrc()
    expect(src).toContain("'Executive BI'")
    // The conditional must still offer the admin label
    const idx = src.indexOf("'Executive BI'")
    expect(idx).toBeGreaterThan(-1)
  })

  it('manager subtitle shows branch intelligence with branchName and branchCode', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('Branch intelligence')
    expect(src).toContain('managerBranch?.pharmacyName')
    expect(src).toContain('managerBranch?.pharmacyCode')
  })

  it('admin subtitle shows portfolio intelligence with branch count label', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('Portfolio intelligence')
    // Phase 2G-3: branch count is now a scope-derived label (branchCountLabel), not report.totalBranches
    expect(src).toContain('branchCountLabel')
  })

  it('derives isManager from scope (Phase 2G-3: scope?.type replaces role check)', async () => {
    const src = await dashboardSrc()
    // Phase 2G-3: isManager now derived from scope?.type === 'single' (covers manager + branch_manager)
    expect(src).toContain("const isManager = scope?.type === 'single'")
  })

  it('derives managerBranch from report.allBranches[0] for single scoped branch', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('const managerBranch = isManager ? report?.allBranches?.[0] : null')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Widget labels — manager mode
// ─────────────────────────────────────────────────────────────

describe('Phase A.2 — PortfolioScoreCard: Branch Score for manager', () => {
  it('shows Branch Score when isManager=true, Portfolio Score otherwise', async () => {
    const src = await scoreCardSrc()
    expect(src).toContain("isManager ? 'Branch Score' : 'Portfolio Score'")
  })

  it('accepts isManager prop', async () => {
    const src = await scoreCardSrc()
    expect(src).toContain('isManager')
  })
})

describe('Phase A.2 — RiskDistributionPanel: Branch Risk Status for manager', () => {
  it('shows Branch Risk Status when isManager=true, Risk Distribution otherwise', async () => {
    const src = await riskPanelSrc()
    expect(src).toContain("isManager ? 'Branch Risk Status' : 'Risk Distribution'")
  })

  it('manager subtitle does not reference "All X branches"', async () => {
    const src = await riskPanelSrc()
    // The subtitle is conditional; admin gets "All X branches"
    expect(src).toContain('isManager ? report.reportMonth')
  })
})

describe('Phase A.2 — PortfolioKpiHeatmap: Branch KPI Achievement for manager', () => {
  it('shows Branch KPI Achievement when isManager=true', async () => {
    const src = await heatmapSrc()
    expect(src).toContain("isManager ? 'Branch KPI Achievement' : 'Portfolio KPI Achievement'")
  })

  it('manager subtitle does not say "Aggregate across all active branches"', async () => {
    const src = await heatmapSrc()
    expect(src).toContain('isManager ? report.reportMonth')
  })
})

describe('Phase A.2 — BranchLeaderboard: Branch Performance Summary for manager', () => {
  it('shows Branch Performance Summary for single scope, Branch Rankings otherwise', async () => {
    const src = await leaderboardSrc()
    // Phase 2G-3: uses scopeType prop instead of isManager boolean
    expect(src).toContain("scopeType === 'single' ? 'Branch Performance Summary' : 'Branch Rankings'")
  })

  it('single scope hides subtitle, list/all show scope-appropriate text', async () => {
    const src = await leaderboardSrc()
    // Phase 2G-3: subtitle is now scope-driven, not isManager ? reportMonth
    expect(src).toContain("scopeType === 'single' ? null")
    expect(src).toContain('My Assigned Branches Ranked')
    expect(src).toContain('All Branches Ranked')
  })
})

describe('Phase A.2 — ExecutiveInsightsFeed: Branch Insights for manager', () => {
  it('shows Branch Insights when isManager=true, Portfolio Insights otherwise', async () => {
    const src = await insightsSrc()
    expect(src).toContain("isManager ? 'Branch Insights' : 'Portfolio Insights'")
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Regional Intelligence — hidden for manager
// ─────────────────────────────────────────────────────────────

describe('Phase A.2 — RegionalIntelligencePanel hidden for manager', () => {
  it('Regional Intelligence is gated by scope (not single-branch) in dashboard', async () => {
    const src = await dashboardSrc()
    // Phase 2G-3: guard is now scope?.type !== 'single' (covers all non-single scopes)
    const importIdx = src.indexOf("import RegionalIntelligencePanel")
    const jsxIdx = src.indexOf('<RegionalIntelligencePanel', importIdx + 1)
    expect(jsxIdx).toBeGreaterThan(-1)
    const block = src.slice(Math.max(0, jsxIdx - 120), jsxIdx + 60)
    expect(block).toContain("'single'")
  })

  it('admin / list scope still sees Regional Intelligence (guard only hides for single)', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('<RegionalIntelligencePanel')
    // Phase 2G-3: guard is scope?.type !== 'single' && intelligence
    expect(src).toContain("scope?.type !== 'single' && intelligence &&")
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Admin regression — all portfolio labels preserved
// ─────────────────────────────────────────────────────────────

describe('Phase A.2 — Admin labels preserved unchanged', () => {
  it('Portfolio Score label still exists in PortfolioScoreCard (for admin)', async () => {
    const src = await scoreCardSrc()
    expect(src).toContain("'Portfolio Score'")
  })

  it('Risk Distribution label still exists in RiskDistributionPanel (for admin)', async () => {
    const src = await riskPanelSrc()
    expect(src).toContain("'Risk Distribution'")
  })

  it('Portfolio KPI Achievement label still exists in heatmap (for admin)', async () => {
    const src = await heatmapSrc()
    expect(src).toContain("'Portfolio KPI Achievement'")
  })

  it('Branch Rankings label still exists in BranchLeaderboard (for admin)', async () => {
    const src = await leaderboardSrc()
    expect(src).toContain("'Branch Rankings'")
  })

  it('Portfolio Insights label still exists in ExecutiveInsightsFeed (for admin)', async () => {
    const src = await insightsSrc()
    expect(src).toContain("'Portfolio Insights'")
  })

  it('All existing admin widget imports are present in dashboard', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('<PortfolioScoreCard')
    expect(src).toContain('<RiskDistributionPanel')
    expect(src).toContain('<PortfolioKpiHeatmap')
    expect(src).toContain('<BranchLeaderboard')
    expect(src).toContain('<ExecutiveInsightsFeed')
    expect(src).toContain('<RegionalIntelligencePanel')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. No role/scoping regression
// ─────────────────────────────────────────────────────────────

describe('Phase A.2 — No route or scoping regression', () => {
  it('EXEC_ROLES contains admin and manager (Phase 1A: expanded with hierarchy roles)', async () => {
    // Phase 1A expanded EXEC_ROLES — verify original roles are still present.
    const src   = (await import('../../App.jsx?raw')).default
    const idx   = src.indexOf('const EXEC_ROLES')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain("'admin'")
    expect(block).toContain("'manager'")
  })

  it('isManager derived from scope only — no role or pharmacyId check at dashboard level', async () => {
    const src = await dashboardSrc()
    // Phase 2G-3: isManager is derived from scope?.type === 'single'
    const idx = src.indexOf('const isManager')
    const line = src.slice(idx, idx + 80)
    expect(line).toContain("scope?.type === 'single'")
    expect(line).not.toContain('pharmacyId')
    expect(line).not.toContain("role === 'manager'")
  })

  it('Team Intelligence Rollup section is still present and unchanged', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('teamRollup.enabled')
    expect(src).toContain('<ExecutiveTeamRollup')
  })

  it('Phase A.2 does not introduce supervisor or area_manager role strings', async () => {
    const src = await dashboardSrc()
    expect(src).not.toContain('supervisor')
    expect(src).not.toContain('area_manager')
    expect(src).not.toContain('district_supervisor')
    expect(src).not.toContain('regional_manager')
  })
})
