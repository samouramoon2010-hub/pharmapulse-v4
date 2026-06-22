// ============================================================
// Pharmacist Intelligence — Page Foundation Tests (Phase 5C-3)
//
// Follows the same source-scan/structural convention as
// BranchIntelligencePage.test.ts (Phase 5A/5B) — no jsdom/RTL.
// ============================================================

import { describe, it, expect } from 'vitest'

async function pageSrc() {
  // Normalize CRLF→LF: several assertions below embed literal multi-line
  // '\n' boundaries and fixed-offset .slice() windows, which would
  // otherwise break on a Windows checkout (core.autocrlf=true) without
  // any change to actual file content.
  return (await import('./PharmacistIntelligencePage.jsx?raw')).default.replace(/\r\n/g, '\n')
}
async function hookSrc() {
  return (await import('./usePharmacistIntelligenceData.js?raw')).default
}
async function appSrc() {
  return (await import('../../App.jsx?raw')).default
}
async function branchHookSrc() {
  return (await import('../branch/useBranchIntelligenceData.js?raw')).default
}

// ════════════════════════════════════════════════════════════════
// 1. Route registration
// ════════════════════════════════════════════════════════════════

describe('1. Route registration', () => {
  it('registers /pharmacist/:userId/intelligence pointing at PharmacistIntelligencePage', async () => {
    const s = await appSrc()
    expect(s).toContain('import PharmacistIntelligencePage')
    expect(s).toContain('/pages/pharmacist/PharmacistIntelligencePage')
    expect(s).toContain('path="/pharmacist/:userId/intelligence"')
    expect(s).toContain('<PharmacistIntelligencePage />')
  })

  it('route allows ALL roles (incl. pharmacist) — ownership is enforced at the page level, not the route level', async () => {
    const s = await appSrc()
    const idx = s.indexOf('path="/pharmacist/:userId/intelligence"')
    const line = s.slice(idx - 20, idx + 120)
    expect(line).toContain('roles={ALL}')
    expect(line).not.toContain('roles={MGR_UP}')
  })

  it('page-level guard redirects a pharmacist viewing another userId to /unauthorized', async () => {
    const s = await pageSrc()
    expect(s).toContain("userProfile?.role === 'pharmacist' && userProfile.uid !== userId")
    expect(s).toContain('<Navigate to="/unauthorized" replace />')
  })

  it('admin and general_manager are allowed via scope=all — no role-specific branch check needed (Phase 2D)', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('Authorization guard')
    // Window 3400 — the hooks-order hotfix expanded the explanatory comment block.
    const block = s.slice(idx, idx + 3400)
    // Phase 2D: guard uses isPharmacyAllowed(scope, branchId) — scope='all' for admin/GM passes unconditionally.
    // The old manual manager/branch_manager string is replaced by the scope resolver.
    expect(block).toContain("userProfile?.role === 'pharmacist'")
    expect(block).toContain('isPharmacyAllowed(scope,')
    expect(block).not.toContain("'admin'")
    expect(block).not.toContain("userProfile?.role === 'manager' || userProfile?.role === 'branch_manager'")
  })

  it('all non-pharmacist roles are scoped via isPharmacyAllowed — closes district_supervisor/regional_manager gap (Phase 2D)', async () => {
    const s = await pageSrc()
    // Old pattern that only checked manager/branch_manager is gone
    expect(s).not.toContain("branchId !== userProfile.pharmacyId")
    // New pattern uses the scope resolver
    expect(s).toContain("isPharmacyAllowed(scope, branchId ?? '')")
    expect(s).toContain("userProfile?.role !== 'pharmacist'")
  })

  it('no nested child routes for KPI drilldowns', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/pharmacist/:userId/intelligence/')
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Hook orchestration
// ════════════════════════════════════════════════════════════════

describe('2. usePharmacistIntelligenceData — orchestration', () => {
  it('accepts userId, branchId, month, focusKpi', async () => {
    const s = await hookSrc()
    expect(s).toContain('export function usePharmacistIntelligenceData(userId, branchId, month, focusKpi)')
  })

  it('manager mode reuses useBranchIntelligenceData; self mode reads only own KPI entries (userId-filtered)', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { useBranchIntelligenceData } from '../branch/useBranchIntelligenceData'")
    expect(s).toContain('useBranchIntelligenceData(')
    // Self mode: own-userId-filtered query — no branch-wide pharmacyId-only query, no roster fetch
    expect(s).toContain("fetchKpiEntriesRange(lookbackFrom, monthTo, { userId })")
    expect(s).not.toMatch(/(?<!\/\/.*)getUsersByPharmacy\(/)
    expect(s).not.toContain("import { getUsersByPharmacy }")
  })

  it('extracts pharmacist summary, accountability, and branch ranking from the shared branch hook output', async () => {
    const s = await hookSrc()
    expect(s).toContain('branch.teamIntelligence?.pharmacistSummaries.find((p) => p.userId === userId)')
    expect(s).toContain('branch.teamIntelligence?.accountabilityInsights.find((a) => a.userId === userId)')
    expect(s).toContain('branch.viewModel?.pharmacistRanking.map((p) => ({ userId: p.userId, rank: p.rank }))')
    expect(s).toContain('branch.viewModel?.contributionByKpi')
    expect(s).toContain('branch.expectedPace')
  })

  it('uses usePharmacyStore (existing app-wide store) for the pharmacy document in both modes — no new Firestore primitive', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { usePharmacyStore } from '../../store/pharmacyStore'")
    expect(s).toContain('getPharmacyById(branchId)')
  })

  it('fetches official V1 evaluation result — the one new Firestore read', async () => {
    const s = await hookSrc()
    expect(s).toContain('fetchEvaluationResultsForUserMonth(userId, month)')
    expect(s).toContain("(r.engineVersion ?? 'v1') === 'v1'")
  })

  it('companyWideRankingSnapshot is always null (Phase 5A precedent, not wired)', async () => {
    const s = await hookSrc()
    expect(s).toContain('companyWideRankingSnapshot: null')
  })

  it('builds the final view model via buildPharmacistIntelligenceViewModel', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { buildPharmacistIntelligenceViewModel } from '../../engine/pharmacistIntelligence/pharmacistIntelligenceViewModelBuilder'")
    expect(s).toContain('return buildPharmacistIntelligenceViewModel(input)')
  })

  it('useBranchIntelligenceData additively exposes teamIntelligence/expectedPace/users (Phase 5C-3)', async () => {
    const s = await branchHookSrc()
    expect(s).toContain('teamIntelligence, expectedPace, users')
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Context Bar (Section 0)
// ════════════════════════════════════════════════════════════════

describe('3. Context Bar (Section 0)', () => {
  it('renders 3-level breadcrumb: Executive BI → Branch Intelligence → Pharmacist Intelligence', async () => {
    const s = await pageSrc()
    expect(s).toContain('to="/executive"')
    expect(s).toContain('Executive BI')
    expect(s).toContain('Branch Intelligence')
    expect(s).toContain('Pharmacist Intelligence')
  })

  it('Branch Intelligence breadcrumb links to /branch/:branchId/intelligence when branchId is known', async () => {
    const s = await pageSrc()
    expect(s).toContain('to={`/branch/${branchId}/intelligence`}')
  })

  it('shows pharmacist name, employee ID, branch name, branch code, region, and month', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.identity.displayName')
    expect(s).toContain('viewModel.identity.employeeId')
    expect(s).toContain('viewModel.identity.pharmacyName')
    expect(s).toContain('viewModel.identity.pharmacyCode')
    expect(s).toContain('viewModel.identity.region')
    expect(s).toContain('viewModel.metadata.month')
  })

  it('reads branchId/month/focusKpi from query params', async () => {
    const s = await pageSrc()
    expect(s).toContain("searchParams.get('branchId')")
    expect(s).toContain("searchParams.get('month')")
    expect(s).toContain("searchParams.get('focusKpi')")
  })

  it('focusKpi is validated against team-enabled engine keys before use (Phase 4F-C)', async () => {
    const s = await pageSrc()
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).includes(focusKpiParam) ? focusKpiParam : null")
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Executive Summary rendering (Section 1)
// ════════════════════════════════════════════════════════════════

describe('4. Pharmacist Executive Summary (Section 1)', () => {
  it('renders Identity Card with name, employee ID, pharmacy, branch code, region', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Identity"')
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('label="Name"')
    expect(block).toContain('label="Employee ID"')
    expect(block).toContain('label="Pharmacy"')
    expect(block).toContain('label="Branch Code"')
    expect(block).toContain('label="Region"')
  })

  it('renders Performance Card with score, grade, operational risk, momentum direction + delta', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Performance"')
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('label="Score"')
    expect(block).toContain('label="Grade"')
    expect(block).toContain('label="Operational Risk"')
    expect(block).toContain('label="Momentum"')
    expect(block).toContain('label="Momentum Δ"')
    expect(block).toContain('viewModel.performanceSummary.performanceScore')
    expect(block).toContain('viewModel.performanceSummary.momentumDelta')
  })

  it('Performance Card reuses GRADE_COLORS from the executive engine (no new color system)', async () => {
    const s = await pageSrc()
    expect(s).toContain("from '../../engine/executive'")
    expect(s).toContain('GRADE_COLORS')
  })

  it('renders Evaluation Card with rating, final score, engine version', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Evaluation"')
    const block = s.slice(idx, idx + 500)
    expect(block).toContain('label="Official Rating"')
    expect(block).toContain('label="Final Score"')
    expect(block).toContain('label="Engine Version"')
    expect(block).toContain('viewModel.performanceSummary.officialRating')
  })

  it('renders Metadata Card with generatedAt and data availability summary', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Metadata"')
    const block = s.slice(idx, idx + 850)
    expect(block).toContain('label="Generated At"')
    expect(block).toContain('viewModel.metadata.generatedAt')
    expect(block).toContain('viewModel.metadata.dataAvailability.hasKpiEntries')
    expect(block).toContain('viewModel.metadata.dataAvailability.hasTargets')
    expect(block).toContain('viewModel.metadata.dataAvailability.hasBranchContext')
    expect(block).toContain('viewModel.metadata.dataAvailability.hasCompanyWideRanking')
    expect(block).toContain('viewModel.metadata.dataAvailability.hasEvaluationResult')
  })

  it('all 5 cards are present', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Identity"')
    expect(s).toContain('title="Performance"')
    expect(s).toContain('title="Ranking"')
    expect(s).toContain('title="Evaluation"')
    expect(s).toContain('title="Metadata"')
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Ranking availability / unavailability
// ════════════════════════════════════════════════════════════════

describe('5. Ranking Card — availability/unavailability', () => {
  it('renders Branch Rank when rankingContext.branchRank is available', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking"')
    const block = s.slice(idx, idx + 900)
    expect(block).toContain('viewModel.rankingContext.branchRank')
    expect(block).toContain('label="Branch Rank"')
    expect(block).toContain('viewModel.rankingContext.branchRank.rank')
    expect(block).toContain('viewModel.rankingContext.branchRank.cohortSize')
  })

  it('renders "Not available" for Branch Rank when null', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking"')
    const block = s.slice(idx, idx + 900)
    expect(block).toContain('Not available')
  })

  it('renders Company Rank when available, "Not yet calculated" otherwise', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking"')
    const block = s.slice(idx, idx + 900)
    expect(block).toContain('viewModel.rankingContext.companyWideRank')
    expect(block).toContain('label="Company Rank"')
    expect(block).toContain('Not yet calculated')
  })

  it('Supervisor Group Rank and Regional Rank are shown as "Deferred" (no invented rankings)', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking"')
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('label="Supervisor Group Rank"')
    expect(block).toContain('label="Regional Rank"')
    expect(block).toContain('value="Deferred"')
  })
})

// ════════════════════════════════════════════════════════════════
// 6. Evaluation availability / unavailability
// ════════════════════════════════════════════════════════════════

describe('6. Evaluation Card — availability/unavailability', () => {
  it('renders official rating fields when officialRating is present', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Evaluation"')
    const block = s.slice(idx, idx + 500)
    expect(block).toContain('viewModel.performanceSummary.officialRating ? (')
    expect(block).toContain('viewModel.performanceSummary.officialRating.rating')
    expect(block).toContain('viewModel.performanceSummary.officialRating.finalScore')
  })

  it('renders an EmptyState when no official evaluation result exists', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Evaluation"')
    const block = s.slice(idx, idx + 700)
    expect(block).toContain('<EmptyState')
    expect(block).toContain('No official evaluation result')
  })
})

// ════════════════════════════════════════════════════════════════
// 7. Loading state
// ════════════════════════════════════════════════════════════════

describe('7. Loading state', () => {
  it('renders a loading message while data is being fetched', async () => {
    const s = await pageSrc()
    expect(s).toContain('{loading && (')
    expect(s).toContain('Loading pharmacist intelligence')
  })
})

// ════════════════════════════════════════════════════════════════
// 8. Error state
// ════════════════════════════════════════════════════════════════

describe('8. Error state', () => {
  it('renders an error message distinct from loading/empty', async () => {
    const s = await pageSrc()
    expect(s).toContain('!loading && error')
    expect(s).toContain('Failed to load pharmacist data')
  })

  it('both self-mode and manager-mode hooks surface their own error state', async () => {
    const s = await hookSrc()
    expect(s).toContain('const error = !enabled ? null : (branch.error || evalError)')
    expect(s).toContain('return { viewModel, loading: overallLoading, error }')
  })
})

// ════════════════════════════════════════════════════════════════
// 9. Empty state
// ════════════════════════════════════════════════════════════════

describe('9. Empty state', () => {
  it('renders an EmptyState when viewModel is null (no performance data)', async () => {
    const s = await pageSrc()
    expect(s).toContain('!loading && !error && !viewModel')
    expect(s).toContain('No performance data found for this pharmacist')
  })

  it('hook returns null viewModel when summary is not found (not throwing)', async () => {
    const s = await hookSrc()
    expect(s).toContain('if (!summary) return null')
  })
})

// ════════════════════════════════════════════════════════════════
// 10. No unintended sections rendered (KPI/Contribution/Coaching/ActionCenter)
// ════════════════════════════════════════════════════════════════

describe('10b. Contribution Intelligence uses its own shape (not Branch Intelligence\'s tabs/contributionByKpi)', () => {
  it('does not render Contribution Intelligence in the Branch-Intelligence style (tabs/contributionByKpi/isTopContributor)', async () => {
    const s = await pageSrc()
    // Section 5 here uses contributionContext + ContributionRow — a
    // different shape from Branch Intelligence's Section 4
    // (contributionByKpi + tabs + isTopContributor/isLowestContributor).
    expect(s).not.toContain('role="tablist"')
    expect(s).not.toContain('contributionByKpi[')
    expect(s).not.toContain('isTopContributor')
    expect(s).not.toContain('isLowestContributor')
  })

  it('does not modify Dashboard, Executive BI, Branch Intelligence UI, or Team Intelligence UI', async () => {
    const dashboard = (await import('../dashboard/DashboardPage.jsx?raw')).default
    const branchPage = (await import('../branch/BranchIntelligencePage.jsx?raw')).default
    expect(dashboard).not.toContain('PharmacistIntelligence')
    expect(branchPage).not.toContain('PharmacistIntelligencePage')
    // Branch Intelligence's prepared-but-not-wired drilldown placeholder remains a no-op
    expect(branchPage).toContain('/* TODO: navigate(`/pharmacist/${p.userId}/intelligence`) — Phase 5C+ */')
  })
})

// ════════════════════════════════════════════════════════════════
// Phase 5C-4 — Sections 2-5
// ════════════════════════════════════════════════════════════════

describe('1. KPI Performance Breakdown section renders (Section 2)', () => {
  it('renders viewModel.kpiBreakdown as compact cards (not a table)', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="KPI Performance Breakdown"')
    expect(s).toContain('viewModel.kpiBreakdown.map((entry) => (')
    expect(s).toContain('<PharmacistKpiCard')
    expect(s).not.toContain('<table')
    expect(s).not.toContain('<thead')
  })

  it('empty state when kpiBreakdown is empty', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="KPI Performance Breakdown"')
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('viewModel.kpiBreakdown.length === 0')
    expect(block).toContain('<EmptyState')
  })
})

describe('2. Each KPI card shows actual / target / achievement / remaining / required per day', () => {
  it('PharmacistKpiCard renders all required fields', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function PharmacistKpiCard')
    const block = s.slice(idx, idx + 5000)
    expect(block).toContain('formatNumber(entry.actual)')
    expect(block).toContain('formatNumber(entry.target)')
    expect(block).toContain('entry.achievementPct')
    expect(block).toContain('entry.remaining')
    expect(block).toContain('entry.requiredPerDay')
    expect(block).toContain('entry.expectedPct')
  })

  it('uses the shared 5-tier badge system (kpiBadge/kpiVsExpected) — no new color system', async () => {
    const s = await pageSrc()
    expect(s).toContain("from '../../components/kpi/kpiVisualHelpers'")
    expect(s).toContain('kpiBadge(entry')
    expect(s).toContain('kpiVsExpected(entry')
  })

  it('renders a segmented progress bar for KPIs with a target', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function PharmacistKpiCard')
    const block = s.slice(idx, idx + 6000)
    expect(block).toContain('role="progressbar"')
    expect(block).toContain('Array.from({ length: SEGS }')
  })
})

describe('3. Contribution % appears inside KPI Breakdown', () => {
  it('PharmacistKpiCard shows contributionPct and contributionRank when available', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function PharmacistKpiCard')
    const block = s.slice(idx, idx + 6000)
    expect(block).toContain('entry.contributionPct != null')
    expect(block).toContain('entry.contributionPct')
    expect(block).toContain('entry.contributionRank')
  })

  it('shows "Contribution data unavailable" when contributionPct is null', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function PharmacistKpiCard')
    const block = s.slice(idx, idx + 6000)
    expect(block).toContain('Contribution data unavailable')
  })
})

describe('4. Strengths & Weaknesses section renders (Section 3)', () => {
  it('renders Top Strengths, Weakest KPIs, and Overall Momentum cards from viewModel.strengthsWeaknesses', async () => {
    const s = await pageSrc()
    // Section title is mode-aware: 'Strengths & Weaknesses' (manager) /
    // 'Strengths & Improvement Areas' (self) — both reference the same
    // underlying viewModel.strengthsWeaknesses fields below.
    expect(s).toContain("title={mode === 'self' ? 'Strengths & Improvement Areas' : 'Strengths & Weaknesses'}")
    expect(s).toContain('title="Top Strengths"')
    // 'Weakest KPIs' (manager) / 'Improvement Areas' (self)
    expect(s).toContain("title={mode === 'self' ? 'Improvement Areas' : 'Weakest KPIs'}")
    expect(s).toContain('title="Overall Momentum"')
    expect(s).toContain('viewModel.strengthsWeaknesses.topStrengths')
    expect(s).toContain('viewModel.strengthsWeaknesses.weakestKpis')
    expect(s).toContain('viewModel.strengthsWeaknesses.biggestOpportunity')
    expect(s).toContain('viewModel.strengthsWeaknesses.overallMomentum')
  })

  it('biggestOpportunity is highlighted distinctly within Weakest KPIs', async () => {
    const s = await pageSrc()
    expect(s).toContain("k === viewModel.strengthsWeaknesses.biggestOpportunity ? 'Biggest Opportunity' : 'Weak'")
  })
})

describe('5. No per-KPI trend is invented', () => {
  it('overallMomentum is the only momentum/trend signal rendered in Section 3', async () => {
    const s = await pageSrc()
    const idx = s.indexOf("title={mode === 'self' ? 'Strengths & Improvement Areas'")
    const block = s.slice(idx, idx + 3500)
    expect(block).toContain('overallMomentum.direction')
    expect(block).toContain('overallMomentum.delta')
    // No per-KPI trend fields/labels
    expect(block).not.toContain('kpiTrends')
    expect(block).not.toContain('perKpiMomentum')
    expect(block).not.toContain('.trend')
    expect(block).toContain('per-KPI trend is not available')
  })

  it('top strengths / weakest KPIs are rendered as static labels, not trend deltas', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Top Strengths"')
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('value="Strength"')
    expect(block).not.toContain('momentumDelta')
  })
})

describe('6. Ranking Context renders branch rank and company rank (Section 4)', () => {
  it('renders Branch Rank and Company-Wide Rank cards from viewModel.rankingContext', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Ranking Context"')
    expect(s).toContain('title="Branch Rank"')
    expect(s).toContain('title="Company-Wide Rank"')
    expect(s).toContain('viewModel.rankingContext.branchRank')
    expect(s).toContain('viewModel.rankingContext.companyWideRank')
  })

  it('shows "Not available" / "Not yet calculated" when rankings are null', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking Context"')
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('Not available')
    expect(block).toContain('Not yet calculated')
  })
})

describe('7. Supervisor group / regional rank show deferred state', () => {
  it('Supervisor Group Rank and Regional Rank cards render "Deferred" + explanatory text — never invented', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Ranking Context"')
    const block = s.slice(idx, idx + 2000)
    expect(block).toContain('title="Supervisor Group Rank"')
    expect(block).toContain('title="Regional Rank"')
    expect(block).toContain('value="Deferred"')
    expect(block).toContain('Pending ranking engine')
    // Never present these as real rank numbers
    expect(block).not.toContain('rankingContext.supervisorGroupRank.rank')
    expect(block).not.toContain('rankingContext.regionalRank.rank')
  })

  it('rankingContext.supervisorGroupRank/regionalRank are read as null-only (per Phase 5C-1/5C-2 contract)', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('supervisorGroupRank ?')
    expect(s).not.toContain('regionalRank ?')
  })
})

describe('8. Contribution Intelligence section renders (Section 5)', () => {
  it('renders from viewModel.contributionContext with an explanation of contribution %', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Contribution Intelligence"')
    expect(s).toContain('viewModel.contributionContext')
    expect(s).toContain("Contribution % is this pharmacist's share of the branch's total actual")
  })

  it('empty state when contributionContext is empty', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Contribution Intelligence"')
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('viewModel.contributionContext.length === 0')
    expect(block).toContain('<EmptyState')
    expect(block).toContain('No branch contribution data available')
  })
})

describe('9. Contribution bars/cards show branch total, pharmacist actual, contribution %, rank', () => {
  it('ContributionRow renders all required fields', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function ContributionRow')
    const block = s.slice(idx, idx + 2000)
    expect(block).toContain('formatNumber(entry.branchTotal)')
    expect(block).toContain('formatNumber(entry.pharmacistActual)')
    expect(block).toContain('entry.contributionPct')
    expect(block).toContain('entry.contributionRank')
  })

  it('highlights top contributor (green) and low contributor (red) distinctly', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function ContributionRow')
    const block = s.slice(idx, idx + 2000)
    expect(block).toContain('const isTop = entry.contributionRank === 1')
    expect(block).toContain('const isLow = maxRank > 1 && entry.contributionRank === maxRank')
    expect(block).toContain('#22c55e')
    expect(block).toContain('#ef4444')
    expect(block).toContain('Top contributor')
    expect(block).toContain('Low contribution')
  })

  it('uses bars/cards, not a table', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Contribution Intelligence"')
    const block = s.slice(idx, idx + 1000)
    expect(block).not.toContain('<table')
  })
})

describe('10. Empty states render professionally (Sections 2-5)', () => {
  it('all 4 sections use the shared EmptyState component for their no-data cases', async () => {
    const s = await pageSrc()
    // Section 2
    expect(s.slice(s.indexOf('title="KPI Performance Breakdown"'), s.indexOf('title="KPI Performance Breakdown"') + 600)).toContain('<EmptyState')
    // Section 3 — inline professional messages (no crash), not <EmptyState> (cards always render)
    expect(s).toContain('No standout strengths this month.')
    expect(s).toContain('No KPIs significantly behind pace this month.')
    // Section 5
    expect(s.slice(s.indexOf('title="Contribution Intelligence"'), s.indexOf('title="Contribution Intelligence"') + 600)).toContain('<EmptyState')
  })
})

describe('11. Existing Section 0 and Section 1 remain unchanged', () => {
  it('Context Bar (Section 0) still renders breadcrumb, identity, and month', async () => {
    const s = await pageSrc()
    expect(s).toContain('to="/executive"')
    expect(s).toContain('Executive BI')
    expect(s).toContain('Branch Intelligence')
    expect(s).toContain('Pharmacist Intelligence')
  })

  it('Executive Summary (Section 1) still renders all 5 cards', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Identity"')
    expect(s).toContain('title="Performance"')
    expect(s).toContain('title="Ranking"')
    expect(s).toContain('title="Evaluation"')
    expect(s).toContain('title="Metadata"')
  })
})

describe('12. No "coming soon" placeholder remains — Sections 6-8 are fully implemented', () => {
  it('the Phase 5C-5 deferred-sections placeholder is gone', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('coming in Phase 5C-5')
  })
})

// ════════════════════════════════════════════════════════════════
// Phase 5C-5 — Sections 6-8
// ════════════════════════════════════════════════════════════════

describe('Accountability Intelligence (Section 6)', () => {
  it('renders from viewModel.accountability with all required fields', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Accountability Intelligence"')
    expect(s).toContain('viewModel.accountability')
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 1800)
    expect(block).toContain('label="Active Days"')
    expect(block).toContain('label="Submission Rate"')
    expect(block).toContain('label="Missed Days"')
    expect(block).toContain('label="Improvement Streak"')
    expect(block).toContain('a.activeDays')
    expect(block).toContain('a.expectedSubmissionDays')
    expect(block).toContain('a.submissionRate')
    expect(block).toContain('a.missedDays')
    expect(block).toContain('a.improvementStreak')
  })

  it('submission rate color: green >=90, amber 70-89, red <70', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 700)
    // submissionRate is read via formatCount(a.submissionRate) before
    // comparison (UX Polish Sprint defensive formatting)
    expect(block).toContain('const submissionRate = formatCount(a.submissionRate)')
    expect(block).toContain("submissionRate >= 90 ? '#22c55e'")
    expect(block).toContain("submissionRate >= 70 ? '#f59e0b'")
    expect(block).toContain("'#ef4444'")
  })

  it('renders Consistent Underperformance and Needs Operational Support flags', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 2100)
    expect(block).toContain('label="Consistent Underperformance"')
    expect(block).toContain('a.consistentUnderperformance')
    expect(block).toContain('label="Needs Operational Support"')
    expect(block).toContain('a.needsOperationalSupport')
  })

  it('renders supportDetail only when present', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 2100)
    expect(block).toContain('{a.supportDetail && (')
    expect(block).toContain('a.supportDetail')
  })

  it('empty state: "No accountability data available"', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('!viewModel.accountability')
    expect(block).toContain('<EmptyState')
    expect(block).toContain('No accountability data available')
  })
})

describe('Coaching Intelligence (Section 7)', () => {
  it('renders viewModel.coaching as read-only CoachingCard entries', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Coaching Intelligence"')
    expect(s).toContain('viewModel.coaching.map((rec) => (')
    expect(s).toContain('<CoachingCard')
  })

  it('CoachingCard displays title, detail, KPI label, and rationale', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function CoachingCard')
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('rec.title')
    expect(block).toContain('rec.detail')
    expect(block).toContain('rec.rationale')
    // Phase 1B: KPI_LABELS replaced by registry resolver
    expect(block).toContain('getKpiLabel(rec.kpiKey)')
  })

  it('no editing, AI generation, forms, or action buttons', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function CoachingCard')
    const block = s.slice(idx, idx + 1200)
    expect(block).not.toContain('<button')
    expect(block).not.toContain('<input')
    expect(block).not.toContain('<form')
    expect(block).not.toContain('onClick')
  })

  it('empty state: "No coaching recommendations available"', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Coaching Intelligence"')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('viewModel.coaching.length === 0')
    expect(block).toContain('<EmptyState')
    expect(block).toContain('No coaching recommendations available')
  })
})

describe('Supervisor Action Center (Section 8)', () => {
  it('renders viewModel.supervisorActions with Problem → Cause → Recommended Action → Expected Impact → Evidence, in order', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Supervisor Action Center"')
    expect(s).toContain('viewModel.supervisorActions.map')
    const probIdx   = s.indexOf('label="Problem"', s.indexOf('title="Supervisor Action Center"'))
    const causeIdx  = s.indexOf('label="Cause"', probIdx)
    const actionIdx = s.indexOf('label="Recommended Action"', causeIdx)
    const impactIdx = s.indexOf('label="Expected Impact"', actionIdx)
    const evidenceIdx = s.indexOf('Evidence', impactIdx)
    expect(probIdx).toBeGreaterThan(-1)
    expect(probIdx).toBeLessThan(causeIdx)
    expect(causeIdx).toBeLessThan(actionIdx)
    expect(actionIdx).toBeLessThan(impactIdx)
    expect(impactIdx).toBeLessThan(evidenceIdx)
  })

  it('severity badge colors: critical=red, high=orange, medium=amber, low=teal', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('const SEVERITY_COLORS')
    const block = s.slice(idx, idx + 500)
    expect(block).toContain("critical: { color: '#ef4444'")
    expect(block).toContain("high:     { color: '#f97316'")
    expect(block).toContain("medium:   { color: '#f59e0b'")
    expect(block).toContain("low:      { color: '#00d2ad'")
  })

  it('Expected Impact block is hidden when null', async () => {
    const s = await pageSrc()
    expect(s).toContain('action.expectedImpact && (')
  })

  it('renders Evidence as a bullet list', async () => {
    const s = await pageSrc()
    expect(s).toContain('action.evidence.length > 0')
    expect(s).toContain('action.evidence.map((e, j) => <li key={j}>{e}</li>)')
    expect(s).toContain('<ul')
  })

  it('resolves related pharmacist names without extra lookups (uses viewModel.identity)', async () => {
    const s = await pageSrc()
    expect(s).toContain('action.relatedPharmacists.map((uid) =>')
    expect(s).toContain('uid === viewModel.identity.userId ? viewModel.identity.displayName : uid')
  })

  it('empty state: "No supervisor actions available"', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Supervisor Action Center"')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('viewModel.supervisorActions.length === 0')
    expect(block).toContain('<EmptyState')
    expect(block).toContain('No supervisor actions available')
  })
})

describe('Regression — Sections 0-5 still render unchanged', () => {
  it('Sections 0-5 headers/titles still present', async () => {
    const s = await pageSrc()
    expect(s).toContain('Pharmacist Executive Summary')
    expect(s).toContain('title="KPI Performance Breakdown"')
    expect(s).toContain("title={mode === 'self' ? 'Strengths & Improvement Areas' : 'Strengths & Weaknesses'}")
    expect(s).toContain('title="Ranking Context"')
    expect(s).toContain('title="Contribution Intelligence"')
  })

  it('does not modify Dashboard, Branch Intelligence, or Executive BI', async () => {
    const dashboard = (await import('../dashboard/DashboardPage.jsx?raw')).default
    const branchPage = (await import('../branch/BranchIntelligencePage.jsx?raw')).default
    expect(dashboard).not.toContain('PharmacistIntelligence')
    expect(branchPage).not.toContain('PharmacistIntelligencePage')
  })

  it('reuses SectionHeader/SummaryCard/EmptyState — no new card primitives for Sections 6-8', async () => {
    const s = await pageSrc()
    const idx6 = s.indexOf('title="Accountability Intelligence"')
    const idx8end = s.indexOf('title="Supervisor Action Center"')
    const block = s.slice(idx6, idx8end + 3000)
    expect(block).toContain('<SectionHeader')
    expect(block).toContain('<SummaryCard')
    expect(block).toContain('<EmptyState')
  })
})

// ════════════════════════════════════════════════════════════════
// /my-intelligence — first-class pharmacist page (promotion from
// dev-only /pharmacist/me)
// ════════════════════════════════════════════════════════════════

describe('My Intelligence — first-class page', () => {
  it('App.jsx registers /my-intelligence, role-restricted to pharmacist, pointing at MyPharmacistIntelligenceRedirect', async () => {
    const s = await appSrc()
    expect(s).toContain('import MyPharmacistIntelligenceRedirect')
    expect(s).toContain('path="/my-intelligence"')
    expect(s).toContain("roles={['pharmacist']}")
    expect(s).toContain('<MyPharmacistIntelligenceRedirect />')
  })

  it('the former dev-only /pharmacist/me route is removed', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/pharmacist/me')
    expect(s).not.toContain('TEMPORARY DEV SHORTCUT')
  })

  it('MyPharmacistIntelligenceRedirect resolves uid/pharmacyId and redirects to /pharmacist/:userId/intelligence', async () => {
    const s = (await import('./MyPharmacistIntelligenceRedirect.jsx?raw')).default
    expect(s).toContain('userProfile?.uid')
    expect(s).toContain('userProfile?.pharmacyId')
    expect(s).toContain('`/pharmacist/${userId}/intelligence?branchId=${branchId}&month=${month}`')
    expect(s).toContain('<Navigate')
    expect(s).not.toContain('import.meta.env.DEV')
  })

  it('Sidebar registers "My Intelligence" for the pharmacist role at /my-intelligence', async () => {
    const s = (await import('../../components/layout/Sidebar.jsx?raw')).default
    const pharmacistIdx = s.indexOf('pharmacist: [')
    const adminIdx = s.indexOf('  admin: [')
    const managerIdx = s.indexOf('  manager: [')
    const pharmacistBlock = s.slice(pharmacistIdx, pharmacistIdx + 600)
    expect(pharmacistBlock).toContain("label: 'My Intelligence'")
    expect(pharmacistBlock).toContain("path: '/my-intelligence'")
    // Not present for admin or manager nav configs
    const adminBlock = s.slice(adminIdx, pharmacistIdx)
    const managerBlock = s.slice(managerIdx, pharmacistIdx)
    expect(adminBlock).not.toContain('/my-intelligence')
    expect(managerBlock).not.toContain('/my-intelligence')
  })
})

// ════════════════════════════════════════════════════════════════
// Team Intelligence row wiring (requirement 7)
// ════════════════════════════════════════════════════════════════

describe('TeamPage — pharmacist row navigation', () => {
  it('clicking a pharmacist row navigates to /pharmacist/{userId}/intelligence?branchId={branchId}&month={currentMonth}', async () => {
    const s = (await import('../manager/TeamPage.jsx?raw')).default
    // useNavigate may share the import line with other named imports (e.g. Link)
    expect(s).toContain('useNavigate')
    expect(s).toContain("from 'react-router-dom'")
    expect(s).toContain('const navigate = useNavigate()')
    expect(s).toContain('navigate(`/pharmacist/${s.userId}/intelligence?branchId=${selectedPharmacyId}&month=${month}`)')
    expect(s).toContain("cursor:'pointer'")
  })

  it('the temporary dev "Open My Intelligence" button is removed', async () => {
    const s = (await import('../manager/TeamPage.jsx?raw')).default
    expect(s).not.toContain('Open My Intelligence')
    expect(s).not.toContain('/pharmacist/me')
    expect(s).not.toContain('TEMPORARY DEV SHORTCUT')
  })
})

// ════════════════════════════════════════════════════════════════
// Self mode vs Manager drilldown mode (Phase 5C-6 data-access split)
// ════════════════════════════════════════════════════════════════

describe('usePharmacistIntelligenceData — mode resolution', () => {
  it('self mode applies when role===pharmacist && uid===userId; manager mode otherwise', async () => {
    const s = await hookSrc()
    expect(s).toContain("const isSelfMode = userProfile?.role === 'pharmacist' && userProfile?.uid === userId")
    expect(s).toContain('useSelfPharmacistIntelligenceData(isSelfMode, userId, branchId, month, focusKpi, userProfile)')
    expect(s).toContain('useManagerPharmacistIntelligenceData(!isSelfMode, userId, branchId, month, focusKpi)')
    expect(s).toContain("{ ...self, mode: 'self' }")
    expect(s).toContain("{ ...manager, mode: 'manager' }")
  })
})

describe('Self mode — own-data-only reads', () => {
  it('does NOT call useBranchIntelligenceData with real args when in self mode (passes null)', async () => {
    const s = await hookSrc()
    expect(s).toContain('useBranchIntelligenceData(enabled ? branchId : null, enabled ? month : null)')
  })

  it('reads own KPI entries via userId filter, not pharmacyId-only (branch-wide) filter', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 4000)
    expect(block).toContain('fetchKpiEntriesRange(lookbackFrom, monthTo, { userId })')
    expect(block).not.toContain('{ pharmacyId: branchId }')
  })

  it('reads own personal target via fetchMyPersonalTarget', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { fetchMyPersonalTarget } from '../../services/personalTargetService'")
    expect(s).toContain('fetchMyPersonalTarget(userId, branchId, month)')
  })

  it('reads own branch target via subscribeTargets, scoped to own pharmacyId', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 5000)
    expect(block).toContain('subscribeTargets(branchId,')
  })

  it('reads own evaluation result via fetchEvaluationResultsForUserMonth', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 6000)
    expect(block).toContain('fetchEvaluationResultsForUserMonth(userId, month)')
  })

  it('reads own pharmacy document via usePharmacyStore', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('usePharmacyStore')
    expect(block).toContain('getPharmacyById(branchId)')
  })

  it('computes PharmacistPerformanceSummary via computePharmacistPerformance — no team-wide engine call', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { computePharmacistPerformance } from '../../engine/teamIntelligence/pharmacistPerformanceEngine'")
    expect(s).toContain('computePharmacistPerformance(pharmacistInput, now)')
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 6000)
    expect(block).not.toContain('generateTeamIntelligence')
  })

  it('computes accountability via computeAccountabilityInsights([pharmacistInput], ...) — single-element array', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { computeAccountabilityInsights } from '../../engine/teamIntelligence/accountabilityEngine'")
    expect(s).toContain('computeAccountabilityInsights([pharmacistInput], month, now)')
  })

  it('contributionByKpi, branchPharmacistRanking, and companyWideRankingSnapshot are null in self mode — never fabricated', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 7000)
    expect(block).toContain('contributionByKpi: null,')
    expect(block).toContain('branchPharmacistRanking: null,')
    expect(block).toContain('companyWideRankingSnapshot: null,')
    expect(block).toContain('hasBranchContext: false,')
  })

  it('expectedPace is derived locally from getDayProgress — no team data needed', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 7000)
    expect(block).toContain('getDayProgress(now)')
    expect(block).toContain('const overallExpectedPct = Math.round(dp.ratio * 100)')
  })
})

describe('Manager drilldown mode — unchanged branch-wide reads', () => {
  it('manager mode still uses useBranchIntelligenceData for contributionByKpi/pharmacistRanking/teamIntelligence', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useManagerPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 4000)
    expect(block).toContain('branch.teamIntelligence?.pharmacistSummaries.find((p) => p.userId === userId)')
    expect(block).toContain('branch.viewModel?.contributionByKpi')
    expect(block).toContain('branch.viewModel?.pharmacistRanking')
  })
})

describe('Self mode UI — softened ranking/contribution messaging (Polish Sprint)', () => {
  it('self view folds ranking/contribution context into the Metadata section with business-friendly wording', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="More to come"')
    expect(s).toContain('Branch ranking will appear here when ranking snapshots are available.')
    expect(s).toContain('Branch contribution details are available in manager view.')

    // None of the self-mode section bodies contain technical wording —
    // checked per-declaration since self/manager declarations interleave
    // in the file. (Manager-only sectionExecutiveSummary/sectionRanking
    // still legitimately use "Deferred"/"Engine Version" — unchanged.)
    const selfSections = [
      'sectionPerformanceSnapshot', 'sectionFocusToday', 'sectionKpiBreakdown',
      'sectionStrengths', 'sectionAccountability', 'sectionCoaching',
      'sectionEvaluation', 'sectionMetadata',
    ]
    for (const name of selfSections) {
      const declIdx = s.indexOf(`const ${name} = `)
      expect(declIdx, `${name} declaration should exist`).toBeGreaterThan(-1)
      // Find the next top-level "const sectionXxx = (" or end of composeable
      // region to bound this declaration's body.
      const nextDeclIdx = s.indexOf('\n            const section', declIdx + 10)
      const nextCommentIdx = s.indexOf('\n            // ════', declIdx + 10)
      const candidates = [nextDeclIdx, nextCommentIdx].filter((i) => i > -1)
      const endIdx = candidates.length > 0 ? Math.min(...candidates) : declIdx + 3000
      const body = s.slice(declIdx, endIdx)
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
      expect(body, `${name} should not contain "Deferred"`).not.toContain('Deferred')
      expect(body, `${name} should not contain "Engine Version"`).not.toContain('Engine Version')
      expect(body, `${name} should not contain "Context Unavailable"`).not.toContain('Context Unavailable')
      expect(body, `${name} should not contain "Manager View Only"`).not.toContain('Manager View Only')
    }
  })

  it('self view does not render standalone Ranking/Contribution sections (folded into Metadata)', async () => {
    const s = await pageSrc()
    const idx = s.indexOf("if (mode === 'self') {")
    const block = s.slice(idx, idx + 1000)
    expect(block).not.toContain('sectionRanking')
    expect(block).not.toContain('sectionContribution')
  })

  it('page destructures mode from the hook', async () => {
    const s = await pageSrc()
    expect(s).toContain('const { viewModel, loading, error, mode } = usePharmacistIntelligenceData(')
  })
})

describe('Debug logging removed (Phase 5C-6 cleanup)', () => {
  it('no [PharmacistIntel DEBUG] instrumentation remains in either hook', async () => {
    const s = await hookSrc()
    const b = await branchHookSrc()
    expect(s).not.toContain('PharmacistIntel DEBUG')
    expect(b).not.toContain('PharmacistIntel DEBUG')
    expect(s).not.toContain('console.error')
    expect(b).not.toContain('console.error')
  })
})

// ════════════════════════════════════════════════════════════════
// Pharmacist Self View Polish Sprint
// ════════════════════════════════════════════════════════════════

describe('Polish Sprint — Accountability NaN/undefined fix', () => {
  it('self-mode PharmacistInput includes actualSubmissionDays/expectedSubmissionDays — fixes undefined/NaN bug', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useSelfPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 7000)
    expect(block).toContain('const actualSubmissionDays   = new Set(mtdEntries.map((e) => e.date)).size')
    expect(block).toContain('const expectedSubmissionDays = dp.currentDay')
    expect(block).toContain('actualSubmissionDays,')
    expect(block).toContain('expectedSubmissionDays,')
  })

  it('Improvement Streak renders with "days" unit via formatStreak, not a bare number', async () => {
    const s = await pageSrc()
    expect(s).toContain('function formatStreak(value)')
    expect(s).toContain("return `${formatCount(value)} days`")
    expect(s).toContain('value={formatStreak(a.improvementStreak)}')
  })

  it('builder guards accountability fields against NaN/undefined (Number.isFinite fallback to 0)', async () => {
    const s = (await import('../../engine/pharmacistIntelligence/pharmacistIntelligenceViewModelBuilder.ts?raw')).default
    expect(s).toContain('Number.isFinite(summary.activeDays)')
    expect(s).toContain('Number.isFinite(accountabilityInsight.missedDays)')
    expect(s).toContain('Number.isFinite(summary.missedDays)')
    expect(s).toContain('Number.isFinite(accountabilityInsight.submissionRate)')
    expect(s).toContain('Number.isFinite(accountabilityInsight.improvementStreak)')
  })
})

describe('Polish Sprint — My Focus Today (Section B)', () => {
  it('renders MyFocusTodayCard derived from biggestOpportunity / weakest KPI + matching kpiBreakdown entry', async () => {
    const s = await pageSrc()
    expect(s).toContain('function MyFocusTodayCard({ entry })')
    expect(s).toContain('title="My Focus Today"')
    expect(s).toContain('const focusKpiKey = viewModel?.strengthsWeaknesses.biggestOpportunity')
    expect(s).toContain('viewModel?.strengthsWeaknesses.weakestKpis[0]')
    expect(s).toContain('viewModel?.kpiBreakdown.find((e) => e.kpiKey === focusKpiKey)')
  })

  it('MyFocusTodayCard shows KPI name, achievement %, remaining, required/day, status badge, and an action sentence — no new calculation', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function MyFocusTodayCard')
    const block = s.slice(idx, idx + 2500)
    // Phase 1B: KPI_LABELS replaced by registry resolver
    expect(block).toContain('getKpiLabel(entry.kpiKey)')
    expect(block).toContain('entry.achievementPct')
    expect(block).toContain('entry.remaining')
    expect(block).toContain('entry.requiredPerDay')
    expect(block).toContain('kpiBadge(entry')
    expect(block).toContain('actionSentence')
  })

  it('is omitted (not an error state) when no KPI qualifies', async () => {
    const s = await pageSrc()
    expect(s).toContain('const sectionFocusToday = focusEntry && (')
  })
})

describe('Polish Sprint — Self-view section order', () => {
  it('self mode renders sections in order A-H: Performance Snapshot, Focus Today, KPI Breakdown, Strengths, Accountability, Coaching, Evaluation, Metadata', async () => {
    const s = await pageSrc()
    const idx = s.indexOf("if (mode === 'self') {")
    const block = s.slice(idx, idx + 1000)
    const order = [
      'sectionPerformanceSnapshot',  // A
      'sectionFocusToday',           // B
      'sectionKpiBreakdown',         // C
      'sectionStrengths',            // D
      'sectionAccountability',       // E
      'sectionCoaching',             // F
      'sectionEvaluation',           // G
      'sectionMetadata',             // H
    ]
    let lastIdx = -1
    for (const name of order) {
      const i = block.indexOf(`{${name}}`)
      expect(i, `${name} should be present in self-mode order`).toBeGreaterThan(-1)
      expect(i, `${name} should come after the previous section`).toBeGreaterThan(lastIdx)
      lastIdx = i
    }
  })

  it('self view does not lead with Ranking, Contribution, or Metadata/Evaluation', async () => {
    const s = await pageSrc()
    const idx = s.indexOf("if (mode === 'self') {")
    const block = s.slice(idx, idx + 1000)
    const firstSection = block.match(/\{section\w+\}/)[0]
    expect(firstSection).toBe('{sectionPerformanceSnapshot}')
  })

  it('self view does not render the Supervisor Action Center section', async () => {
    const s = await pageSrc()
    const idx = s.indexOf("if (mode === 'self') {")
    const selfBlock = s.slice(idx, idx + 600)
    expect(selfBlock).not.toContain('sectionActionCenter')
  })
})

describe('Polish Sprint — Manager drilldown unchanged', () => {
  it('manager mode still renders Ranking Context and Contribution Intelligence sections with full detail', async () => {
    const s = await pageSrc()
    const idx = s.lastIndexOf('return (\n              <>')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('sectionExecutiveSummary')
    expect(block).toContain('sectionRanking')
    expect(block).toContain('sectionContribution')
    expect(block).toContain('sectionActionCenter')
    expect(block).not.toContain('sectionRankingSelf')
    expect(block).not.toContain('sectionContributionSelf')
  })

  it('manager mode is unaffected by self-mode hook changes (useManagerPharmacistIntelligenceData untouched)', async () => {
    const s = await hookSrc()
    const idx = s.indexOf('function useManagerPharmacistIntelligenceData')
    const block = s.slice(idx, idx + 4500)
    expect(block).toContain('branch.viewModel?.contributionByKpi')
    expect(block).toContain('branch.viewModel?.pharmacistRanking')
    expect(block).not.toContain('actualSubmissionDays')
  })
})

// ════════════════════════════════════════════════════════════════
// UX Polish Sprint 2 — defensive formatting, Focus Today format,
// final A-H ordering, friendly messages, manager mode unchanged
// ════════════════════════════════════════════════════════════════

describe('UX Polish Sprint 2 — no undefined/NaN ever rendered', () => {
  it('defines formatCount/formatPercent/formatActiveDays/formatStreak helpers', async () => {
    const s = await pageSrc()
    expect(s).toContain('function formatCount(value)')
    expect(s).toContain('return Number.isFinite(value) ? value : 0')
    expect(s).toContain('function formatPercent(value)')
    expect(s).toContain('function formatActiveDays(active, expected)')
    expect(s).toContain('function formatStreak(value)')
  })

  it('Accountability section uses the defensive helpers for every numeric field', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('title="Accountability Intelligence"')
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('value={formatActiveDays(a.activeDays, a.expectedSubmissionDays)}')
    expect(block).toContain('value={formatPercent(a.submissionRate)}')
    expect(block).toContain('value={formatCount(a.missedDays)}')
    expect(block).toContain('value={formatStreak(a.improvementStreak)}')
    // Never raw interpolation of a possibly-undefined field
    expect(block).not.toContain('${a.activeDays} / ${a.expectedSubmissionDays}')
    expect(block).not.toContain('${a.submissionRate}%')
  })
})

describe('UX Polish Sprint 2 — My Focus Today exact field layout', () => {
  it('renders KPI name, Achievement, Remaining, Required / Day, Status, and an Action line', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function MyFocusTodayCard')
    const block = s.slice(idx, idx + 2500)
    expect(block).toContain('label="Achievement"')
    expect(block).toContain('label="Remaining"')
    expect(block).toContain('label="Required / Day"')
    expect(block).toContain('label="Status"')
    expect(block).toContain('Action: ')
    expect(block).toContain('badge?.label')
  })

  it('critical Wasfaty produces the example action sentence via registry resolver', async () => {
    // Phase 1B: switch statement replaced by getKpiCoachingAction() from registry
    const s = await pageSrc()
    const idx = s.indexOf('function MyFocusTodayCard')
    const block = s.slice(idx, idx + 1500)
    // Resolver call replaces the hardcoded switch
    expect(block).toContain('getKpiCoachingAction(entry.kpiKey)')
    // Hardcoded switch must be gone
    expect(block).not.toContain("case 'wasfaty':")
  })

  it('falls back to "No target set" status when the KPI has no target', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('function MyFocusTodayCard')
    const block = s.slice(idx, idx + 2500)
    expect(block).toContain('<CardRow label="Status" value="No target set" />')
  })
})

describe('UX Polish Sprint 2 — friendly empty-state messages (self mode)', () => {
  it('Accountability and Coaching empty states are mode-aware with business-friendly self-mode text', async () => {
    const s = await pageSrc()
    expect(s).toContain('Your activity summary will appear here once data is available for this month.')
    expect(s).toContain('No coaching tips for you right now — check back next month.')
    // Manager-mode wording preserved
    expect(s).toContain("'No accountability data available'")
    expect(s).toContain("'No coaching recommendations available'")
  })

  it('self-mode Evaluation empty state avoids technical month-interpolated phrasing', async () => {
    const s = await pageSrc()
    expect(s).toContain('Your official evaluation result for this month is not yet available.')
  })
})

describe('UX Polish Sprint 2 — Manager mode fully unchanged', () => {
  it('manager mode composition still references sectionExecutiveSummary, sectionRanking, sectionContribution, sectionActionCenter with original content', async () => {
    const s = await pageSrc()
    const managerIdx = s.lastIndexOf('return (\n              <>')
    const block = s.slice(managerIdx, managerIdx + 400)
    expect(block).toContain('sectionExecutiveSummary')
    expect(block).toContain('sectionKpiBreakdown')
    expect(block).toContain('sectionStrengths')
    expect(block).toContain('sectionRanking')
    expect(block).toContain('sectionContribution')
    expect(block).toContain('sectionAccountability')
    expect(block).toContain('sectionCoaching')
    expect(block).toContain('sectionActionCenter')
  })

  it('manager mode Evaluation card still shows "Engine Version" (unchanged, self-only simplification)', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('const sectionExecutiveSummary = (')
    const block = s.slice(idx, idx + 4000)
    expect(block).toContain('<CardRow label="Engine Version" value="v1" />')
  })

  it('manager mode Ranking section still uses "Deferred" for supervisor-group/regional ranks', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('const sectionRanking = (')
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('value="Deferred"')
    expect(block).toContain('Pending ranking engine — not available yet.')
  })
})

// ════════════════════════════════════════════════════════════════
// Phase 2D — Scope Resolver Guard
// ════════════════════════════════════════════════════════════════

describe('Phase 2D — scope resolver guard: imports', () => {
  it('page imports useScopeProfile', async () => {
    const s = await pageSrc()
    expect(s).toContain("import { useScopeProfile }")
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('page imports isPharmacyAllowed from scopeResolver', async () => {
    const s = await pageSrc()
    expect(s).toContain("import { isPharmacyAllowed }")
    expect(s).toContain("from '../../services/scopeResolver'")
  })
})

describe('Phase 2D — scope resolver guard: pharmacist self-only check preserved', () => {
  it('pharmacist can view self — self-check still present', async () => {
    const s = await pageSrc()
    expect(s).toContain("userProfile?.role === 'pharmacist' && userProfile.uid !== userId")
    expect(s).toContain('<Navigate to="/unauthorized" replace />')
  })

  it('pharmacist is excluded from the isPharmacyAllowed check', async () => {
    const s = await pageSrc()
    // The isPharmacyAllowed check is guarded by role !== 'pharmacist'
    expect(s).toContain("userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(")
  })
})

describe('Phase 2D — scope resolver guard: all non-pharmacist roles use isPharmacyAllowed', () => {
  it('admin allows via scope=all (isPharmacyAllowed({type:all}) is always true)', async () => {
    const s = await pageSrc()
    // Admin has scope={type:'all'} — no explicit admin branch; isPharmacyAllowed handles it
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    // Window 3400: the hooks-order hotfix moved useState/usePharmacistIntelligenceData
    // above the guard returns and expanded the explanatory comment, pushing the
    // later guard lines further from the anchor comment.
    const block = s.slice(guardIdx, guardIdx + 3400)
    expect(block).toContain('isPharmacyAllowed(scope,')
    expect(block).not.toContain("=== 'admin'")
  })

  it('general_manager allows via scope=all — same as admin', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    // Window 3400 — see note above re: the hooks-order hotfix comment expansion.
    const block = s.slice(guardIdx, guardIdx + 3400)
    expect(block).not.toContain("=== 'general_manager'")
  })

  it('manager scoped via isPharmacyAllowed — old branchId!==pharmacyId removed', async () => {
    const s = await pageSrc()
    expect(s).not.toContain("branchId !== userProfile.pharmacyId")
    expect(s).toContain("isPharmacyAllowed(scope, branchId ?? '')")
  })

  it('district_supervisor cannot fall through — isPharmacyAllowed checks list scope', async () => {
    const s = await pageSrc()
    // The guard block includes loading JSX so use a wider window
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    // Window 3400 — see note above re: the hooks-order hotfix comment expansion.
    const block = s.slice(guardIdx, guardIdx + 3400)
    // The only bypass for non-pharmacist is through isPharmacyAllowed
    expect(block).toContain("userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(")
    expect(block).not.toContain("=== 'district_supervisor'")
  })

  it('regional_manager cannot fall through — same list-scope check as district_supervisor', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    // Window 3400 — see note above re: the hooks-order hotfix comment expansion.
    const block = s.slice(guardIdx, guardIdx + 3400)
    expect(block).not.toContain("=== 'regional_manager'")
    // Covered by the generic isPharmacyAllowed check
    expect(block).toContain("isPharmacyAllowed(scope, branchId ?? '')")
  })
})

describe('Phase 2D — scope resolver guard: loading and error handling', () => {
  it('scope loading gate is present — content not shown while scope resolves', async () => {
    const s = await pageSrc()
    expect(s).toContain('scopeLoading')
    expect(s).toContain('Verifying access')
  })

  it('scope error fails closed — redirects to unauthorized', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    // Window 3400 — see note above re: the hooks-order hotfix comment expansion.
    const block = s.slice(guardIdx, guardIdx + 3400)
    expect(block).toContain('scopeError')
    expect(block).toContain('!scope || scopeError')
  })

  it('null scope fails closed', async () => {
    const s = await pageSrc()
    expect(s).toContain('!scope || scopeError')
  })

  it('useScopeProfile is called (not just imported)', async () => {
    const s = await pageSrc()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scope, loading: scopeLoading, error: scopeError')
  })
})

describe('Phase 2D — no unrestricted fall-through remains', () => {
  it('no branch exists that allows non-pharmacist access without isPharmacyAllowed', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Authorization guard — Phase 2D')
    const block = s.slice(guardIdx, guardIdx + 1400)
    // The only way to pass is: role=pharmacist+self, OR isPharmacyAllowed passes
    // No "admin bypass" string, no district_supervisor bypass, no empty else
    expect(block).not.toContain("role === 'admin'")
    expect(block).not.toContain("role === 'general_manager'")
    expect(block).not.toContain("role === 'district_supervisor'")
    expect(block).not.toContain("role === 'regional_manager'")
  })

  it('branchId ?? empty string prevents null pharmacyId from accidentally matching', async () => {
    const s = await pageSrc()
    expect(s).toContain("branchId ?? ''")
  })
})

describe('Phase 2D — no other pages modified', () => {
  it('BranchIntelligencePage was not touched by Phase 2D (migrated later in Phase 2E)', async () => {
    const s = (await import('../branch/BranchIntelligencePage.jsx?raw')).default
    expect(s).not.toContain('Phase 2D')
    // useScopeProfile is legitimately present from Phase 2E — do not assert its absence
  })

  it('ExecutiveDashboard is unchanged by Phase 2D', async () => {
    const s = (await import('../executive/ExecutiveDashboard.jsx?raw')).default
    // Phase 2G-3 legitimately adds useScopeProfile to ExecutiveDashboard — not a 2D change
    expect(s).not.toContain('Phase 2D')
  })

  it('App.jsx is unchanged', async () => {
    const s = await appSrc()
    expect(s).not.toContain('Phase 2D')
  })
})

// ════════════════════════════════════════════════════════════════
// Pharmacist Detail React Hooks Runtime Bug — targeted hotfix
//
// Root cause: useState(month) and usePharmacistIntelligenceData(...)
// were called AFTER four conditional early-return guard statements,
// so a render that exited early invoked fewer hooks than a render
// that reached the data hook — "Rendered more hooks than during the
// previous render." Fix: every hook now runs unconditionally before
// any return; the same authorization outcome is computed as plain
// booleans and only decides what to render / whether real args reach
// the data hook (null-ed out when not yet authorized), mirroring the
// existing enabled-flag idiom in usePharmacistIntelligenceData.js.
// ════════════════════════════════════════════════════════════════

function fnBody(s: string) {
  const fnIdx = s.indexOf('export default function PharmacistIntelligencePage')
  return s.slice(fnIdx)
}

// Index of the first *executed* return statement (line starting with
// `return`, ignoring leading whitespace) — comments that merely mention
// the word "return" do not start a line with it, so they don't match.
function firstReturnIdx(body: string) {
  const m = /^\s*return\b/m.exec(body)
  return m ? m.index + (m[0].length - m[0].trimStart().length) : -1
}

describe('Hooks-order hotfix — no conditional hooks before any early return', () => {
  it('useState(month) is declared before the first return statement', async () => {
    const body = fnBody(await pageSrc())
    const stateIdx = body.indexOf('const [month] = useState(')
    const returnIdx = firstReturnIdx(body)
    expect(stateIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeGreaterThan(-1)
    expect(stateIdx).toBeLessThan(returnIdx)
  })

  it('usePharmacistIntelligenceData(...) is called before the first return statement', async () => {
    const body = fnBody(await pageSrc())
    const hookCallIdx = body.indexOf('usePharmacistIntelligenceData(')
    const returnIdx = firstReturnIdx(body)
    expect(hookCallIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeGreaterThan(-1)
    expect(hookCallIdx).toBeLessThan(returnIdx)
  })

  it('useAuthStore() and useScopeProfile() are also called before the first return statement', async () => {
    const body = fnBody(await pageSrc())
    const returnIdx = firstReturnIdx(body)
    expect(body.indexOf('useAuthStore()')).toBeLessThan(returnIdx)
    expect(body.indexOf('useScopeProfile()')).toBeLessThan(returnIdx)
  })

  it('no early-return guard precedes any hook call (loading state does not return before hooks)', async () => {
    const body = fnBody(await pageSrc())
    const hookCallIdx = body.indexOf('usePharmacistIntelligenceData(')
    const beforeHookCall = body.slice(0, hookCallIdx)
    // None of the guard branches (ownProfileDenied / scopeSettling / scopeDenied
    // / pharmacyDenied) may return before the data hook is invoked.
    expect(beforeHookCall).not.toMatch(/^\s*return\b/m)
    expect(beforeHookCall).not.toContain('Verifying access')
    expect(beforeHookCall).not.toContain('<Navigate')
  })

  it('exactly the same four guard conditions still exist, just computed as booleans (no business logic rewrite)', async () => {
    const s = await pageSrc()
    expect(s).toContain("userProfile?.role === 'pharmacist' && userProfile.uid !== userId")
    expect(s).toContain('scopeLoading || (!scope && !scopeError)')
    expect(s).toContain('!scope || scopeError')
    expect(s).toContain("userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(scope, branchId ?? '')")
  })

  it('the data hook receives null args (not a skipped call) when not yet authorized — no permission weakening', async () => {
    const s = await pageSrc()
    expect(s).toContain('authorized ? userId : null')
    expect(s).toContain('authorized ? branchId : null')
  })

  it('the unauthorized/loading returns happen after the hook call, gated by the same authorized boolean', async () => {
    const body = fnBody(await pageSrc())
    const hookCallIdx = body.indexOf('usePharmacistIntelligenceData(')
    const afterHookCall = body.slice(hookCallIdx)
    expect(afterHookCall).toContain('if (ownProfileDenied)')
    expect(afterHookCall).toContain('if (scopeSettling)')
    expect(afterHookCall).toContain('if (scopeDenied)')
    expect(afterHookCall).toContain('if (pharmacyDenied)')
  })
})

describe('Hooks-order hotfix — manager same-branch vs cross-branch behavior unchanged', () => {
  it('manager same-branch access still flows entirely through isPharmacyAllowed(scope, branchId)', async () => {
    const s = await pageSrc()
    expect(s).toContain("userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(scope, branchId ?? '')")
  })

  it('cross-branch denial is still a hard fail-closed redirect to /unauthorized, not a weaker state', async () => {
    const s = await pageSrc()
    const pharmacyDeniedIdx = s.indexOf('const pharmacyDenied')
    const block = s.slice(pharmacyDeniedIdx, pharmacyDeniedIdx + 600)
    expect(block).toContain('!isPharmacyAllowed(scope, branchId')
    expect(s).toContain('if (pharmacyDenied) {\n    return <Navigate to="/unauthorized" replace />\n  }')
  })

  it('pharmacist self-view still bypasses isPharmacyAllowed entirely (role-gated, not scope-gated)', async () => {
    const s = await pageSrc()
    const authorizedIdx = s.indexOf('const authorized')
    expect(s.slice(0, authorizedIdx)).toContain("userProfile?.role === 'pharmacist' && userProfile.uid !== userId")
  })
})
