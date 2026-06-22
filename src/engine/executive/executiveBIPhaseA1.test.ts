// ============================================================
// Executive BI Phase A.1 — Team Intelligence Rollup Tests
//
// Source-text audits following the project convention.
// Covers: hook correctness, widget content, security, admin
// regression, and section placement.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'

// ── Source loaders ────────────────────────────────────────────

async function rollupHookSrc(): Promise<string> {
  return (await import('../../hooks/useExecutiveTeamRollup.ts?raw')).default
}

async function rollupWidgetSrc(): Promise<string> {
  return (await import('../../components/executive/ExecutiveTeamRollup.jsx?raw')).default
}

async function dashboardSrc(): Promise<string> {
  return (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
}

// ─────────────────────────────────────────────────────────────
// 1. Hook — useExecutiveTeamRollup
// ─────────────────────────────────────────────────────────────

describe('useExecutiveTeamRollup — enabled only for manager role', () => {
  it('returns enabled=true for manager role, enabled=false otherwise', async () => {
    const src = await rollupHookSrc()
    expect(src).toContain("const isManager   = userProfile?.role === 'manager'")
    expect(src).toContain("enabled: false")
    expect(src).toContain("enabled: true")
  })

  it('calls useBranchIntelligenceData with pharmacyId and month for manager', async () => {
    const src = await rollupHookSrc()
    expect(src).toContain("import { useBranchIntelligenceData } from '../pages/branch/useBranchIntelligenceData'")
    expect(src).toContain("useBranchIntelligenceData(")
    expect(src).toContain("isManager ? pharmacyId : null")
    expect(src).toContain("isManager ? month      : null")
  })

  it('passes null/null to useBranchIntelligenceData when not manager — no-op', async () => {
    const src = await rollupHookSrc()
    // Find the actual hook call (after the comment that mentions useBranchIntelligenceData)
    const commentIdx = src.indexOf('// Data source: useBranchIntelligenceData')
    const callIdx = src.indexOf('const branch = useBranchIntelligenceData(', commentIdx)
    expect(callIdx).toBeGreaterThan(-1)
    const call = src.slice(callIdx, callIdx + 140)
    expect(call).toContain('isManager ? pharmacyId : null')
    expect(call).toContain('isManager ? month      : null')
  })

  it('returns branch.teamIntelligence from useBranchIntelligenceData', async () => {
    const src = await rollupHookSrc()
    expect(src).toContain('teamIntelligence: branch.teamIntelligence ?? null')
  })

  it('returns pharmacyId scoped to userProfile.pharmacyId', async () => {
    const src = await rollupHookSrc()
    expect(src).toContain('const pharmacyId  = isManager ? (userProfile?.pharmacyId ?? null) : null')
  })
})

describe('useExecutiveTeamRollup — security: own pharmacy only', () => {
  it('uses useBranchIntelligenceData which scopes all reads to branchId', async () => {
    const hookSrc = await rollupHookSrc()
    const branchSrc = (await import('../../pages/branch/useBranchIntelligenceData.js?raw')).default
    // Hook delegates to useBranchIntelligenceData
    expect(hookSrc).toContain('useBranchIntelligenceData(')
    // useBranchIntelligenceData uses pharmacyId-scoped queries
    expect(branchSrc).toContain('{ pharmacyId: branchId }')
    expect(branchSrc).toContain('subscribeTargets(branchId,')
    expect(branchSrc).toContain('getUsersByPharmacy(branchId)')
  })

  it('does not import or call any unscoped pharmacy/entry fetch', async () => {
    const src = await rollupHookSrc()
    expect(src).not.toContain('subscribeRecentEntries')
    expect(src).not.toContain('subscribeAllEntries')
    expect(src).not.toContain('getAllPharmacies')
    expect(src).not.toContain('subscribeToPharmacies')
  })

  it('returns null pharmacyId for non-manager — prevents any pharmacy lookup', async () => {
    const src = await rollupHookSrc()
    expect(src).toContain('pharmacyId: null,')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Widget — ExecutiveTeamRollup
// ─────────────────────────────────────────────────────────────

describe('ExecutiveTeamRollup widget — section A: Team Snapshot', () => {
  it('renders TeamSnapshot with teamHealth fields', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function TeamSnapshot(')
    expect(src).toContain('h.overallTeamStatus')
    expect(src).toContain('h.activeMembers')
    expect(src).toContain('h.teamPerformanceScore')
    expect(src).toContain('h.teamConsistencyScore')
    expect(src).toContain('h.teamMomentumDirection')
  })

  it('renders Team Snapshot section header', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain("title=\"Team Snapshot\"")
  })
})

describe('ExecutiveTeamRollup widget — section B: Top Performer', () => {
  it('renders TopPerformer with name, score, KPI, risk, momentum', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function TopPerformer(')
    expect(src).toContain('top.displayName')
    expect(src).toContain('top.performanceScore')
    expect(src).toContain('top.strongestKpi')
    expect(src).toContain('top.operationalRisk')
    expect(src).toContain('top.momentumDirection')
  })

  it('clicking Top Performer navigates to Pharmacist Intelligence', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function TopPerformer(')
    const block = src.slice(idx, idx + 1000)
    expect(block).toContain('useNavigate()')
    expect(block).toContain('`/pharmacist/${top.userId}/intelligence?branchId=${pharmacyId}&month=${month}`')
  })
})

describe('ExecutiveTeamRollup widget — section C: Needs Attention', () => {
  it('renders NeedsAttention with weak KPI, required/day, risk', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function NeedsAttention(')
    expect(src).toContain('s.weakestKpi')
    expect(src).toContain('s.operationalRisk')
    expect(src).toContain('weakSnap?.requiredPerDay')
  })

  it('shows friendly empty state when no one needs attention', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function NeedsAttention(')
    const block = src.slice(idx, idx + 800)
    expect(block).toContain('All team members are on track.')
  })

  it('clicking Needs Attention row navigates to Pharmacist Intelligence', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function NeedsAttention(')
    const block = src.slice(idx, idx + 1200)
    expect(block).toContain('`/pharmacist/${s.userId}/intelligence?branchId=${pharmacyId}&month=${month}`')
  })
})

describe('ExecutiveTeamRollup widget — section D: Accountability Watch', () => {
  it('renders AccountabilityWatch with submission rate, missed days, improvement streak, support flag', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function AccountabilityWatch(')
    expect(src).toContain('a.submissionRate')
    expect(src).toContain('a.missedDays')
    expect(src).toContain('a.improvementStreak')
    expect(src).toContain('a.needsOperationalSupport')
  })

  it('shows friendly empty state when no accountability flags', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function AccountabilityWatch(')
    const block = src.slice(idx, idx + 800)
    expect(block).toContain('No accountability flags this month.')
  })
})

describe('ExecutiveTeamRollup widget — section E: Coaching Priorities', () => {
  it('renders CoachingPriorities with title, detail, KPI, target user', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function CoachingPriorities(')
    expect(src).toContain('rec.title')
    expect(src).toContain('rec.detail')
    expect(src).toContain('rec.kpiKey')
    expect(src).toContain('rec.targetUserName')
  })

  it('shows no more than 3 recommendations', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function CoachingPriorities(')
    const block = src.slice(idx, idx + 200)
    expect(block).toContain('.slice(0, 3)')
  })

  it('shows friendly empty state when no coaching priorities', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function CoachingPriorities(')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain('No coaching priorities this month.')
  })
})

describe('ExecutiveTeamRollup widget — section F: Member Summary', () => {
  it('renders MemberSummary with name, score, risk, strongest KPI, weakest KPI, momentum', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('function MemberSummary(')
    expect(src).toContain('s.displayName')
    expect(src).toContain('s.performanceScore')
    expect(src).toContain('s.operationalRisk')
    expect(src).toContain('s.strongestKpi')
    expect(src).toContain('s.weakestKpi')
    expect(src).toContain('s.momentumDirection')
  })

  it('clicking member row navigates to Pharmacist Intelligence', async () => {
    const src = await rollupWidgetSrc()
    const idx = src.indexOf('function MemberSummary(')
    const block = src.slice(idx, idx + 1200)
    expect(block).toContain('`/pharmacist/${s.userId}/intelligence?branchId=${pharmacyId}&month=${month}`')
  })
})

describe('ExecutiveTeamRollup widget — no Official Rating or Final Score', () => {
  it('does not reference officialRating, finalScore, or rating field', async () => {
    const src = await rollupWidgetSrc()
    expect(src).not.toContain('officialRating')
    expect(src).not.toContain('finalScore')
    expect(src).not.toContain('.rating')
    expect(src).not.toContain('Official Rating')
    expect(src).not.toContain('Final Score')
  })

  it('does not reference evaluation engine or evaluation results', async () => {
    const src = await rollupWidgetSrc()
    expect(src).not.toContain('evaluationEngine')
    expect(src).not.toContain('fetchEvaluationResults')
    expect(src).not.toContain('engineVersion')
  })
})

describe('ExecutiveTeamRollup widget — empty state', () => {
  it('renders the friendly empty state message when no team data', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('Team intelligence will appear once pharmacist KPI entries are available.')
  })

  it('renders loading state', async () => {
    const src = await rollupWidgetSrc()
    expect(src).toContain('Loading team intelligence…')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Dashboard wiring
// ─────────────────────────────────────────────────────────────

describe('ExecutiveDashboard — Phase A.1 wiring', () => {
  it('imports useExecutiveTeamRollup and ExecutiveTeamRollup', async () => {
    const src = await dashboardSrc()
    expect(src).toContain("import { useExecutiveTeamRollup } from '../../hooks/useExecutiveTeamRollup'")
    expect(src).toContain("import ExecutiveTeamRollup        from '../../components/executive/ExecutiveTeamRollup'")
  })

  it('calls useExecutiveTeamRollup() and renders ExecutiveTeamRollup conditionally on enabled', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('const teamRollup = useExecutiveTeamRollup()')
    expect(src).toContain('{teamRollup.enabled && (')
    expect(src).toContain('<ExecutiveTeamRollup')
  })

  it('Team Rollup appears AFTER KPI Heatmap and BEFORE Leaderboard', async () => {
    const src = await dashboardSrc()
    const heatmapIdx   = src.indexOf('<PortfolioKpiHeatmap')
    const rollupIdx    = src.indexOf('<ExecutiveTeamRollup')
    const leaderIdx    = src.indexOf('<BranchLeaderboard')
    expect(heatmapIdx).toBeGreaterThan(-1)
    expect(rollupIdx).toBeGreaterThan(-1)
    expect(leaderIdx).toBeGreaterThan(-1)
    expect(heatmapIdx).toBeLessThan(rollupIdx)
    expect(rollupIdx).toBeLessThan(leaderIdx)
  })

  it('passes teamIntelligence, pharmacyId, month, loading props to the rollup widget', async () => {
    const src = await dashboardSrc()
    const idx = src.indexOf('<ExecutiveTeamRollup')
    const block = src.slice(idx, idx + 300)
    expect(block).toContain('teamIntelligence={teamRollup.teamIntelligence}')
    expect(block).toContain('pharmacyId={teamRollup.pharmacyId}')
    expect(block).toContain('month={teamRollup.month}')
    expect(block).toContain('loading={teamRollup.loading}')
  })
})

describe('ExecutiveDashboard — admin view unchanged', () => {
  it('admin is unaffected because teamRollup.enabled is false for admin', async () => {
    const hookSrc = await rollupHookSrc()
    // The only way enabled=true is role==='manager' 
    expect(hookSrc).toContain("const isManager   = userProfile?.role === 'manager'")
    // Admin role → isManager=false → enabled:false → {teamRollup.enabled && ...} renders nothing
    expect(hookSrc).toContain("enabled: false")
  })

  it('all existing admin widgets are still present in dashboard', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('<PortfolioScoreCard')
    expect(src).toContain('<RiskDistributionPanel')
    expect(src).toContain('<PortfolioKpiHeatmap')
    expect(src).toContain('<BranchLeaderboard')
    expect(src).toContain('<ExecutiveInsightsFeed')
    expect(src).toContain('<RegionalIntelligencePanel')
  })
})
