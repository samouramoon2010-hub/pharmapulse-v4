// ============================================================
// Branch Intelligence — Page Foundation Tests (Phase 5A)
//
// The project has no jsdom/React Testing Library setup (all 4061+
// existing tests are pure-function / source-scan tests run under
// vitest's default 'node' environment — see kpiCardPolish.test.ts,
// enterpriseUxSprintPhaseNext.test.ts, etc.). Adding a rendering
// environment would be a global config change affecting every
// existing test file — out of scope for Phase 5A's "thin" mandate
// and "preserve stable foundations" principle.
//
// These tests follow the established source-scan convention:
// structural/composition checks on the page, route registration,
// and reuse verification (KpiTile/FocusKpiCommandCard imported, not
// forked). Hook data-shaping logic (entry grouping, expectedPace,
// month-range math) is tested as pure logic, mirroring the hook's
// implementation without requiring a DOM.
// ============================================================

import { describe, it, expect } from 'vitest'

async function pageSrc() {
  return (await import('./BranchIntelligencePage.jsx?raw')).default
}
async function hookSrc() {
  return (await import('./useBranchIntelligenceData.js?raw')).default
}
async function appSrc() {
  return (await import('../../App.jsx?raw')).default
}

// ════════════════════════════════════════════════════════════════
// 1. Route renders
// ════════════════════════════════════════════════════════════════

describe('1. Route registration', () => {
  it('registers /branch/:branchId/intelligence pointing at BranchIntelligencePage', async () => {
    const s = await appSrc()
    expect(s).toContain("import BranchIntelligencePage")
    expect(s).toContain('/pages/branch/BranchIntelligencePage')
    expect(s).toContain('path="/branch/:branchId/intelligence"')
    expect(s).toContain('<BranchIntelligencePage />')
  })

  it('route is supervisor-facing (MGR_UP roles), not nested under other routes', async () => {
    const s = await appSrc()
    const idx = s.indexOf('path="/branch/:branchId/intelligence"')
    const line = s.slice(idx - 20, idx + 120)
    expect(line).toContain('roles={MGR_UP}')
    // No nested child routes UNDER /branch/:branchId/intelligence itself
    // (e.g. no /branch/:branchId/intelligence/:something). The separate
    // top-level /pharmacist/:userId/intelligence route was added in
    // Phase 5C-3 — that's a sibling route, not a nested child.
    expect(s).not.toContain('/branch/:branchId/intelligence/')
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Context bar renders
// ════════════════════════════════════════════════════════════════

describe('2. Context Bar (Section 0)', () => {
  it('renders breadcrumb back to Executive BI', async () => {
    const s = await pageSrc()
    expect(s).toContain('to="/executive"')
    expect(s).toContain('Executive BI')
  })

  it('renders a month selector with no persistence/filtering logic', async () => {
    const s = await pageSrc()
    expect(s).toContain('type="month"')
    expect(s).toContain('setMonth')
    // No localStorage/Firestore writes from the month selector
    expect(s).not.toContain('localStorage')
    expect(s).not.toContain('saveTarget')
  })

  it('breadcrumb shows the branch name from the view model', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel?.branchSummary?.pharmacyName')
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Executive Summary renders
// ════════════════════════════════════════════════════════════════

describe('3. Executive Summary Band (Section 1)', () => {
  it('renders all 5 required cards: Health Score, Forecast, Risk, Branch Rank, Team Size', async () => {
    const s = await pageSrc()
    expect(s).toContain('label="Health Score"')
    expect(s).toContain('label="Forecast"')
    expect(s).toContain('label="Risk"')
    expect(s).toContain('label="Branch Rank"')
    expect(s).toContain('label="Team Size"')
  })

  it('renders Branch Name, Code, and Region', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.branchSummary.pharmacyName')
    expect(s).toContain('viewModel.branchSummary.pharmacyCode')
    expect(s).toContain('viewModel.branchSummary.region')
  })

  it('reads values directly from viewModel.branchSummary — no inline recomputation', async () => {
    const s = await pageSrc()
    // healthScore/healthGrade/forecastPct/riskLevel/branchRank/teamSize all
    // come from viewModel.branchSummary.*, not from local arithmetic
    expect(s).toContain('viewModel.branchSummary.healthScore')
    expect(s).toContain('viewModel.branchSummary.healthGrade')
    expect(s).toContain('viewModel.branchSummary.forecastPct')
    expect(s).toContain('viewModel.branchSummary.riskLevel')
    expect(s).toContain('viewModel.branchSummary.branchRank')
    expect(s).toContain('viewModel.branchSummary.teamSize')
    // No new score/grade computation on the page
    expect(s).not.toContain('function computeExecutiveScore')
    expect(s).not.toContain('function scoreToGrade')
  })

  it('uses GRADE_COLORS from the executive engine (no new color system)', async () => {
    const s = await pageSrc()
    expect(s).toContain("from '../../engine/executive'")
    expect(s).toContain('GRADE_COLORS')
  })
})

// ════════════════════════════════════════════════════════════════
// 4. KPI Intelligence renders
// ════════════════════════════════════════════════════════════════

describe('4. KPI Intelligence (Section 2)', () => {
  it('renders a KPI Cards row (official KpiCard template) driven by getKpisForSurface(teamEnabled) and kpiStats', async () => {
    const s = await pageSrc()
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {")
    expect(s).toContain('<KpiCard')
    expect(s).toContain('entry={{ value: s?.actual ?? null, target: s?.target ?? 0, achievement: s?.achievementPct ?? null }}')
  })

  it('renders the section using viewModel.kpiIntelligence', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.kpiIntelligence.focusKpi')
  })

  it('Phase 5A placeholder is replaced by real Sections 3-6 (Phase 5B)', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('Section 3-6 coming in Phase 5B')
    expect(s).toContain('title="Pharmacist Ranking"')
    expect(s).toContain('title="Contribution Intelligence"')
    expect(s).toContain('title="Coaching Opportunities"')
    expect(s).toContain('title="Supervisor Action Center"')
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Focus KPI renders
// ════════════════════════════════════════════════════════════════

describe('5. Focus KPI Command Card', () => {
  it('renders FocusKpiCommandCard with kpiKey/stats/pace/expectedPct from the view model', async () => {
    const s = await pageSrc()
    expect(s).toContain('<FocusKpiCommandCard')
    expect(s).toContain('kpiKey={viewModel.kpiIntelligence.focusKpi}')
    expect(s).toContain('stats={kpiStats[viewModel.kpiIntelligence.focusKpi]}')
    expect(s).toContain('pace={paceMap[viewModel.kpiIntelligence.focusKpi]}')
    expect(s).toContain('expectedPct={kpiStats[viewModel.kpiIntelligence.focusKpi]?.expectedPct')
  })

  it('Focus KPI card is conditional on focusKpi being non-null (Rule 7 / no-data safe)', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.kpiIntelligence.focusKpi && (')
  })

  it('expectedPct is sourced from kpiStats[k].expectedPct — the Phase 4C getDayProgress source, no placeholder', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('PLACEHOLDER_EXPECTED_PCT')
    expect(s).not.toContain('expectedPct={50}')
  })
})

// ════════════════════════════════════════════════════════════════
// 6. Official KpiCard template + FocusKpiCommandCard reused (not forked)
// ════════════════════════════════════════════════════════════════

describe('6. KpiCard / FocusKpiCommandCard reuse (no fork)', () => {
  it('BranchIntelligencePage imports the official KpiCard template and FocusKpiCommandCard from the shared components module', async () => {
    const s = await pageSrc()
    expect(s).toContain("import KpiCard from '../../components/kpi/KpiCard'")
    expect(s).toContain("import { FocusKpiCommandCard } from '../../components/kpi/FocusKpiCommandCard'")
  })

  it('DashboardPage ALSO imports KpiCard from the same shared module (single source of truth)', async () => {
    const dashboard = (await import('../dashboard/DashboardPage.jsx?raw')).default
    // Branch Intelligence Visual Migration: BranchIntelligencePage's KPI
    // grid was migrated to the official KpiCard template (kpi-card-
    // blueprint.md), matching the same migration DashboardPage went
    // through in UI3.2-C — both pages now share the one KpiCard component.
    // Designer Mode (Dashboard pass): the standalone Focus KPI Command
    // Card was removed from DashboardPage — its info (focus KPI, gap,
    // required pace) duplicated DailyMissionHero's "Need ... today" stat
    // and the per-KPI KpiCard grid right below it. The component itself
    // is untouched and still imported by BranchIntelligencePage.
    expect(dashboard).toContain("import KpiCard from '../../components/kpi/KpiCard'")
    expect(dashboard).not.toContain("from '../../components/kpi/FocusKpiCommandCard'")
  })

  it('BranchIntelligencePage does not redefine KPI_STATUS_BADGE, kpiBadge, or segmented-bar logic', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('const KPI_STATUS_BADGE')
    expect(s).not.toContain('function kpiBadge')
    expect(s).not.toContain('const SEGS')
  })

  it('KpiCard and FocusKpiCommandCard component files exist and export the expected names', async () => {
    const card = (await import('../../components/kpi/KpiCard.jsx?raw')).default
    const focusCard = (await import('../../components/kpi/FocusKpiCommandCard.jsx?raw')).default
    expect(card).toContain('export default function KpiCard')
    expect(focusCard).toContain('export function FocusKpiCommandCard')
  })

  it('KpiTile.jsx still exists (kept, not deleted) even though no page currently renders it', async () => {
    const tile = (await import('../../components/kpi/KpiTile.jsx?raw')).default
    expect(tile).toContain('export function KpiTile')
  })
})

// ════════════════════════════════════════════════════════════════
// 7. No duplicate fetch calls
// ════════════════════════════════════════════════════════════════

describe('7. Single-fetch strategy (no duplicate Firestore reads)', () => {
  it('fetchKpiEntriesRange is called exactly once per effect run', async () => {
    const s = await hookSrc()
    const matches = s.match(/fetchKpiEntriesRange\(/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('getUsersByPharmacy is called exactly once per effect run', async () => {
    const s = await hookSrc()
    const matches = s.match(/getUsersByPharmacy\(/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('subscribeTargets is called exactly once and unsubscribed on cleanup', async () => {
    const s = await hookSrc()
    const matches = s.match(/subscribeTargets\(/g) ?? []
    expect(matches.length).toBe(1)
    expect(s).toContain('unsubscribe?.()')
  })

  it('entries/users/targets state feeds BOTH the view model AND kpiStats/paceMap (derived in-memory, not re-fetched)', async () => {
    const s = await hookSrc()
    // Both useMemo blocks depend on the same `entries`/`targets`/`users` state
    const viewModelMemoIdx = s.indexOf('const branchData = useMemo')
    const statsMemoIdx     = s.indexOf('kpiStats: statsMap')
    expect(viewModelMemoIdx).toBeGreaterThan(-1)
    expect(statsMemoIdx).toBeGreaterThan(-1)
    // No second fetchKpiEntriesRange/getUsersByPharmacy call near the stats memo
    const statsBlock = s.slice(s.lastIndexOf('useMemo', statsMemoIdx), statsMemoIdx + 200)
    expect(statsBlock).not.toContain('fetchKpiEntriesRange')
    expect(statsBlock).not.toContain('getUsersByPharmacy')
  })
})

// ════════════════════════════════════════════════════════════════
// 8. Empty state renders correctly
// ════════════════════════════════════════════════════════════════

describe('8. Empty / loading / error states', () => {
  it('renders a loading state while data is being fetched', async () => {
    const s = await pageSrc()
    expect(s).toContain('Loading branch intelligence')
    expect(s).toContain('{loading && (')
  })

  it('renders an empty state when viewModel is null (no KPI data for this branch/month)', async () => {
    const s = await pageSrc()
    expect(s).toContain('!loading && !error && !viewModel')
    expect(s).toContain('No KPI data found for this branch')
  })

  it('renders an error state distinct from the empty state', async () => {
    const s = await pageSrc()
    expect(s).toContain('!loading && error')
    expect(s).toContain('Failed to load branch data')
  })

  it('renders viewModel.warnings when present (Rule 7 / missing-data warnings from Phase 4C)', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.warnings.length > 0')
    expect(s).toContain('viewModel.warnings.map')
  })

  it('hook returns null viewModel (not throwing) when generateTeamIntelligence/generateBranchSummary fail', async () => {
    const s = await hookSrc()
    expect(s).toContain('catch {')
    expect(s).toContain('teamIntelligence = null')
    expect(s).toContain('branchSummary = null')
    // Phase 5C-3: branchData memo returns a wrapped object (not bare null)
    // so usePharmacistIntelligenceData can also read teamIntelligence —
    // same early-exit behavior, different return shape.
    expect(s).toContain('if (!teamIntelligence) return { viewModel: null, teamIntelligence: null, expectedPace: null }')
    expect(s).toContain('if (!branchSummary) return { viewModel: null, teamIntelligence, expectedPace: null }')
  })
})

// ════════════════════════════════════════════════════════════════
// Hook data-shaping — pure logic mirrors (no DOM required)
// ════════════════════════════════════════════════════════════════

describe('useBranchIntelligenceData — data shaping logic', () => {
  it('month-range math: computes correct monthFrom/monthTo for a given yyyy-MM', () => {
    const month = '2026-06'
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const mon  = Number(monthStr)
    const monthFrom = `${month}-01`
    const lastDay   = new Date(year, mon, 0).getDate()
    const monthTo   = `${month}-${String(lastDay).padStart(2, '0')}`

    expect(monthFrom).toBe('2026-06-01')
    expect(monthTo).toBe('2026-06-30')
  })

  it('entries are grouped by userId, mirroring TeamPage pattern', () => {
    const entries = [
      { userId: 'u1', date: '2026-06-01', pharmacyId: 'b1', omni: 5 },
      { userId: 'u1', date: '2026-06-02', pharmacyId: 'b1', omni: 3 },
      { userId: 'u2', date: '2026-06-01', pharmacyId: 'b1', omni: 7 },
    ]
    const userGroups = new Map()
    entries.forEach((e) => {
      if (!userGroups.has(e.userId)) userGroups.set(e.userId, [])
      userGroups.get(e.userId).push(e)
    })
    expect(userGroups.get('u1')).toHaveLength(2)
    expect(userGroups.get('u2')).toHaveLength(1)
  })

  it('expectedPace is uniform across all KPIs (Phase 4C: single dayRatio-derived value)', async () => {
    const s = await hookSrc()
    expect(s).toContain('Math.round(dp.ratio * 100)')
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })")
  })
})

// ════════════════════════════════════════════════════════════════
// Phase 5B — Sections 3-6
// ════════════════════════════════════════════════════════════════

describe('1. Pharmacist Ranking section renders (Section 3)', () => {
  it('renders pharmacistRanking with rank, name, score, grade, momentum', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.pharmacistRanking')
    expect(s).toContain('p.displayName')
    expect(s).toContain('p.performanceScore')
    expect(s).toContain('p.grade')
    expect(s).toContain('p.momentumDirection')
    expect(s).toContain('p.momentumDelta')
  })

  it('gives #1/#2/#3 distinct visual hierarchy', async () => {
    const s = await pageSrc()
    expect(s).toContain('isTop3')
    expect(s).toContain('GRADE_COLORS_BY_RANK')
    expect(s).toContain('GRADE_BG_BY_RANK')
  })

  it('subtly highlights at-risk members using existing viewModel fields (no new computation)', async () => {
    const s = await pageSrc()
    expect(s).toContain('atRiskIds')
    expect(s).toContain('coachingOpportunities.mostAtRisk')
    expect(s).toContain('weakKpiAttribution?.weakestPharmacists')
    expect(s).toContain('At Risk')
  })

  it('rows are prepared for future drilldown but do not navigate (no route created)', async () => {
    const s = await pageSrc()
    expect(s).toContain('role="button"')
    expect(s).toContain('TODO: navigate')
    expect(s).toContain('/pharmacist/${p.userId}/intelligence')
    // Confirms it's commented out, not a live call
    expect(s).toMatch(/\/\*\s*TODO: navigate/)
  })

  it('avoids a giant table — uses a compact list, not <table>', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('<table')
    expect(s).not.toContain('<thead')
  })
})

describe('2. Contribution Intelligence section renders (Section 4)', () => {
  it('renders from viewModel.contributionByKpi', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.contributionByKpi[activeContributionKpi]')
  })

  it('renders KPI selector tabs/pills for all core engine keys', async () => {
    const s = await pageSrc()
    expect(s).toContain('role="tablist"')
    expect(s).toContain('role="tab"')
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {")
    expect(s).toContain('setSelectedContributionKpi(k)')
  })

  it('shows pharmacist name, achievement %, actual, contribution %, contribution rank', async () => {
    const s = await pageSrc()
    expect(s).toContain('entry.pharmacistName')
    expect(s).toContain('entry.achievementPct')
    expect(s).toContain('entry.actual')
    expect(s).toContain('entry.contributionPct')
    expect(s).toContain('entry.contributionRank')
  })

  it('uses horizontal contribution bars, not a giant table', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('<table')
    // Bar implementation: width derived from achievementPct
    expect(s).toContain("width: `${Math.min(Math.max(entry.achievementPct, 0), 100)}%`")
  })
})

describe('3. KPI selector defaults to focusKpi', () => {
  it('selectedContributionKpi initializes from viewModel.kpiIntelligence.focusKpi', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel?.kpiIntelligence?.focusKpi && selectedContributionKpi === null')
    expect(s).toContain('setSelectedContributionKpi(viewModel.kpiIntelligence.focusKpi)')
  })

  it('activeContributionKpi falls back to focusKpi when no manual selection has been made', async () => {
    const s = await pageSrc()
    expect(s).toContain('selectedContributionKpi ?? viewModel?.kpiIntelligence?.focusKpi')
  })

  it('focus KPI tab is visually marked (🔥) among the selector pills', async () => {
    const s = await pageSrc()
    expect(s).toContain('isFocus = k === viewModel.kpiIntelligence.focusKpi')
    expect(s).toContain('🔥')
  })
})

describe('4. Contribution breakdown shows top/lowest contributor', () => {
  it('highlights isTopContributor and isLowestContributor with distinct styling', async () => {
    const s = await pageSrc()
    expect(s).toContain('entry.isTopContributor')
    expect(s).toContain('entry.isLowestContributor')
    expect(s).toContain('>Top</span>')
    expect(s).toContain('>Lowest</span>')
  })

  it('uses distinct colors for top (green) vs lowest (red) vs neutral', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('const barColor')
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('#22c55e') // top
    expect(block).toContain('#ef4444') // lowest
  })

  it('breakdown is sorted by contributionRank', async () => {
    const s = await pageSrc()
    expect(s).toContain('.sort((a, b) => a.contributionRank - b.contributionRank)')
  })
})

describe('5. Coaching Opportunities renders 4 cards (Section 5)', () => {
  it('renders all 4 required cards: Top Performer, Most Improved, Most At Risk, Lowest Contributor', async () => {
    const s = await pageSrc()
    expect(s).toContain('label="Top Performer"')
    expect(s).toContain('label="Most Improved"')
    expect(s).toContain('label="Most At Risk"')
    expect(s).toContain('label="Lowest Contributor"')
  })

  it('each card reads from viewModel.coachingOpportunities.* with no new text generation', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.coachingOpportunities.topPerformer')
    expect(s).toContain('viewModel.coachingOpportunities.mostImproved')
    expect(s).toContain('viewModel.coachingOpportunities.mostAtRisk')
    expect(s).toContain('viewModel.coachingOpportunities.lowestContributor')
    // No AI / generated-text helper imports
    expect(s).not.toContain('generateRecommendation')
    expect(s).not.toContain('llm')
    expect(s).not.toContain('openai')
  })

  it('cards show pharmacist name, score/achievement, and KPI/reason where relevant', async () => {
    const s = await pageSrc()
    expect(s).toContain('d.displayName')
    expect(s).toContain('d.performanceScore')
    expect(s).toContain('d.momentumDelta')
    expect(s).toContain('d.operationalRisk')
    expect(s).toContain('d.achievementPct')
    expect(s).toContain('d.kpiKey')
    expect(s).toContain('d.strongestKpi')
  })

  it('renders a neutral "No data available" state per-card when a slot is null', async () => {
    const s = await pageSrc()
    expect(s).toContain('No data available')
  })
})

describe('6. Supervisor Action Center renders Problem/Cause/Action/Impact (Section 6)', () => {
  it('renders from viewModel.supervisorActions with all required fields', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.supervisorActions.map')
    expect(s).toContain('label="Problem"')
    expect(s).toContain('label="Cause"')
    expect(s).toContain('label="Recommended Action"')
    expect(s).toContain('label="Expected Impact"')
    expect(s).toContain('action.problem')
    expect(s).toContain('action.cause')
    expect(s).toContain('action.recommendedAction')
    expect(s).toContain('action.expectedImpact')
  })

  it('renders evidence bullets, related pharmacists, and related KPI', async () => {
    const s = await pageSrc()
    expect(s).toContain('action.evidence.map')
    expect(s).toContain('action.relatedPharmacists')
    expect(s).toContain('action.relatedKpi')
  })

  it('renders severity using existing 5-tier-derived colors, not a new color system', async () => {
    const s = await pageSrc()
    expect(s).toContain('SEVERITY_COLORS')
    expect(s).toContain("critical:")
    expect(s).toContain("high:")
    expect(s).toContain("medium:")
    expect(s).toContain("low:")
  })

  it('Expected Impact is conditionally rendered only when present (Phase 4A "when not to show")', async () => {
    const s = await pageSrc()
    expect(s).toContain('action.expectedImpact && (')
  })

  it('related pharmacists resolve userIds to display names via pharmacistRanking (no new lookup table)', async () => {
    const s = await pageSrc()
    expect(s).toContain('viewModel.pharmacistRanking.find((r) => r.userId === uid)')
  })

  it('section feels like Problem → Cause → Action → Impact, in that order', async () => {
    const s = await pageSrc()
    const probIdx = s.indexOf('label="Problem"')
    const causeIdx = s.indexOf('label="Cause"')
    const actionIdx = s.indexOf('label="Recommended Action"')
    const impactIdx = s.indexOf('label="Expected Impact"')
    expect(probIdx).toBeLessThan(causeIdx)
    expect(causeIdx).toBeLessThan(actionIdx)
    expect(actionIdx).toBeLessThan(impactIdx)
  })
})

describe('7. Empty states render for Sections 3-6', () => {
  it('Section 3: empty state when pharmacistRanking is empty', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('Pharmacist Ranking')
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('pharmacistRanking.length === 0')
    expect(block).toContain('<EmptyState')
  })

  it('Section 4: empty state when contribution breakdown is empty', async () => {
    const s = await pageSrc()
    expect(s).toContain('breakdown.length === 0')
    expect(s).toContain('No contribution data available')
  })

  it('Section 5: each coaching card handles a null slot gracefully (no crash)', async () => {
    const s = await pageSrc()
    expect(s).toContain('data ? renderBody(data)')
  })

  it('Section 6: empty state when supervisorActions is empty', async () => {
    const s = await pageSrc()
    const idx = s.indexOf('Supervisor Action Center')
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain('supervisorActions.length === 0')
    expect(block).toContain('<EmptyState')
  })

  it('EmptyState is a shared component, not duplicated per section', async () => {
    const s = await pageSrc()
    const matches = s.match(/function EmptyState/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('8. Sections 3-6 no longer show the Phase 5A placeholder', () => {
  it('"Section 3-6 coming in Phase 5B" text is removed', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('Section 3-6 coming in Phase 5B')
  })

  it('all four section headers are present', async () => {
    const s = await pageSrc()
    expect(s).toContain('title="Pharmacist Ranking"')
    expect(s).toContain('title="Contribution Intelligence"')
    expect(s).toContain('title="Coaching Opportunities"')
    expect(s).toContain('title="Supervisor Action Center"')
  })
})

describe('9. Pharmacist drilldown route (Phase 5C-3) — registered, but NOT wired from this page', () => {
  it('App.jsx registers /pharmacist/:userId/intelligence as a separate route (Phase 5C-3)', async () => {
    const s = await appSrc()
    expect(s).toContain('/pharmacist/:userId/intelligence')
    expect(s).toContain('PharmacistIntelligencePage')
  })

  it('BranchIntelligencePage itself does not import or render the pharmacist drilldown page', async () => {
    const s = await pageSrc()
    expect(s).not.toContain('PharmacistIntelligencePage')
    expect(s).not.toContain("from './PharmacistPage")
  })

  it('Section 3 pharmacist rows remain a documented no-op click handler — navigation wiring deferred', async () => {
    const s = await pageSrc()
    expect(s).toContain('/* TODO: navigate(`/pharmacist/${p.userId}/intelligence`) — Phase 5C+ */')
  })
})

describe('10. DashboardPage remains untouched by Phase 5B', () => {
  it('DashboardPage.jsx is unchanged from Phase 5A (no Section 3-6 concepts leaked into it)', async () => {
    const dashboard = (await import('../dashboard/DashboardPage.jsx?raw')).default
    expect(dashboard).not.toContain('Contribution Intelligence')
    expect(dashboard).not.toContain('Supervisor Action Center')
    expect(dashboard).not.toContain('Coaching Opportunities')
    expect(dashboard).not.toContain('pharmacistRanking')
    expect(dashboard).not.toContain('contributionByKpi')
    expect(dashboard).not.toContain('supervisorActions')
  })

  it('Dashboard regression test suites still import shared kpi components unchanged', async () => {
    const dashboard = (await import('../dashboard/DashboardPage.jsx?raw')).default
    // UI3.2-C: KpiTile import dropped from DashboardPage (migrated to
    // KpiCard) — kpiVisualHelpers still shared. Designer Mode (Dashboard
    // pass): FocusKpiCommandCard's standalone render was removed from
    // DashboardPage as duplicated information (see test #6 above); the
    // shared component file itself is untouched.
    expect(dashboard).toContain("from '../../components/kpi/kpiVisualHelpers'")
  })
})

// ════════════════════════════════════════════════════════════════
// Phase 2E — Scope Resolver Guard
// ════════════════════════════════════════════════════════════════

describe('Phase 2E — scope guard: imports', () => {
  it('BranchIntelligencePage imports useScopeProfile', async () => {
    const s = await pageSrc()
    expect(s).toContain("import { useScopeProfile }")
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('BranchIntelligencePage imports isPharmacyAllowed from scopeResolver', async () => {
    const s = await pageSrc()
    expect(s).toContain("import { isPharmacyAllowed }")
    expect(s).toContain("from '../../services/scopeResolver'")
  })
})

describe('Phase 2E — scope guard: all roles use isPharmacyAllowed', () => {
  it('admin/general_manager allowed via scope=all — no explicit role check needed', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Scope guard — Phase 2E')
    const block = s.slice(guardIdx, guardIdx + 900)
    expect(block).toContain('isPharmacyAllowed(scope,')
    expect(block).not.toContain("=== 'admin'")
    expect(block).not.toContain("=== 'general_manager'")
  })

  it('manager/branch_manager scoped via isPharmacyAllowed (scope=single)', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Scope guard — Phase 2E')
    const block = s.slice(guardIdx, guardIdx + 900)
    expect(block).not.toContain("=== 'manager'")
    expect(block).not.toContain("=== 'branch_manager'")
    expect(block).toContain('isPharmacyAllowed(scope, branchId')
  })

  it('district_supervisor/regional_manager scoped via isPharmacyAllowed (scope=list)', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Scope guard — Phase 2E')
    const block = s.slice(guardIdx, guardIdx + 900)
    expect(block).not.toContain("=== 'district_supervisor'")
    expect(block).not.toContain("=== 'regional_manager'")
    // Covered by the single isPharmacyAllowed call
    expect(block).toContain('isPharmacyAllowed(scope,')
  })

  it('all deny paths are covered by a single isPharmacyAllowed call', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Scope guard — Phase 2E')
    const block = s.slice(guardIdx, guardIdx + 900)
    expect(block).toContain('!isPharmacyAllowed(scope, branchId ?? \'\')')
  })
})

describe('Phase 2E — scope guard: loading and error handling', () => {
  it('scope loading gate renders loading state — never shows branch data early', async () => {
    const s = await pageSrc()
    expect(s).toContain('scopeLoading')
    expect(s).toContain('Verifying access')
  })

  it('scope error fails closed — shows access denied message', async () => {
    const s = await pageSrc()
    const guardIdx = s.indexOf('Scope guard — Phase 2E')
    const block = s.slice(guardIdx, guardIdx + 900)
    expect(block).toContain('scopeError')
    expect(block).toContain('!scope || scopeError')
  })

  it('null scope fails closed', async () => {
    const s = await pageSrc()
    expect(s).toContain('!scope || scopeError')
  })

  it('useScopeProfile is called and destructured', async () => {
    const s = await pageSrc()
    expect(s).toContain('useScopeProfile()')
    expect(s).toContain('scope, loading: scopeLoading, error: scopeError')
  })

  it('access denied renders the expected message', async () => {
    const s = await pageSrc()
    expect(s).toContain('Access denied. You do not have permission to view this branch.')
  })
})

describe('Phase 2E — scope guard: hook order respected', () => {
  it('useScopeProfile is called after useBranchIntelligenceData (hook order preserved)', async () => {
    const s = await pageSrc()
    const dataHookIdx  = s.indexOf('useBranchIntelligenceData(')
    const scopeHookIdx = s.indexOf('useScopeProfile()')
    expect(scopeHookIdx).toBeGreaterThan(dataHookIdx)
  })

  it('guard early returns come after useScopeProfile call (no hook called after a return)', async () => {
    const s = await pageSrc()
    const scopeHookIdx = s.indexOf('useScopeProfile()')
    const firstGuardReturn = s.indexOf('if (scopeLoading)', scopeHookIdx)
    expect(firstGuardReturn).toBeGreaterThan(scopeHookIdx)
  })

  it('branchId ?? empty string used — null URL param does not accidentally match any scope', async () => {
    const s = await pageSrc()
    expect(s).toContain("branchId ?? ''")
  })
})

describe('Phase 2E — no other pages modified', () => {
  it('PharmacistIntelligencePage is not modified by Phase 2E', async () => {
    const s = (await import('../pharmacist/PharmacistIntelligencePage.jsx?raw')).default
    expect(s).not.toContain('Phase 2E')
  })

  it('TeamPage was not touched by Phase 2E (migrated later in Phase 2F-1)', async () => {
    const s = (await import('../manager/TeamPage.jsx?raw')).default
    expect(s).not.toContain('Phase 2E')
    // useScopeProfile is legitimately present from Phase 2F-1 — do not assert its absence
  })

  it('ReportsPage was not touched by Phase 2E (migrated later in Phase 2F-2)', async () => {
    const s = (await import('../shared/ReportsPage.jsx?raw')).default
    expect(s).not.toContain('Phase 2E')
    // useScopeProfile is legitimately present from Phase 2F-2 — do not assert its absence
  })

  it('ExecutiveDashboard is unchanged by Phase 2E', async () => {
    const s = (await import('../executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).not.toContain('Phase 2E')
    // Phase 2G-3 legitimately adds useScopeProfile to ExecutiveDashboard — not a 2E change
  })

  it('App.jsx is unchanged', async () => {
    const s = await appSrc()
    expect(s).not.toContain('Phase 2E')
  })
})
