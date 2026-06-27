// ============================================================
// PR-1A — Reports Correctness Regression Tests
//
// Source-level tests (raw import, no DOM rendering) — same
// convention as ReportsPage.test.ts, since this component depends
// on Firebase-backed stores that are impractical to fully render
// in isolation.
//
// Confirmed bugs fixed in this bundle:
//   1. executiveSummary used a first-active-branch fallback under
//      "All Branches" instead of a true portfolio summary.
//   2. branchSummary summed actual/target across every KPI_FIELDS
//      key into one scalar (totalActual/totalTarget/gap), mixing
//      incompatible units (SAR + prescriptions + counts...).
//   3. mtdTrend summed every KPI together into one scalar with no
//      unit and no KPI identity.
//   4. "14-Day Entry Volume" summed KPI values instead of counting
//      entry records.
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration (same pattern as ReportsPage.test.ts)
  return (await import('./ReportsPage.jsx?raw')).default
}

describe('PR-1A — no first-branch fallback under All Branches', () => {
  it('imports generateExecutiveReport for portfolio-mode summaries', async () => {
    const s = await src()
    expect(s).toContain('generateExecutiveReport')
    expect(s).toContain("from '../../engine/executive'")
  })

  it('does not fall back to the first active pharmacy for the executive summary', async () => {
    const s = await src()
    expect(s).not.toContain(".find((p) => p.active !== false)?.id")
  })

  it('builds a portfolio-mode summary from every visible pharmacy, not one', async () => {
    const s = await src()
    expect(s).toContain("mode: 'portfolio'")
    expect(s).toContain('branchInputs')
    expect(s).toContain('visiblePharmacies')
  })

  it('still uses generateBranchSummary for a single selected branch', async () => {
    const s = await src()
    expect(s).toContain("mode: 'branch'")
    expect(s).toContain('generateBranchSummary(branchInput')
  })

  it('portfolio risk is shown as a distribution, never collapsed into one fabricated level', async () => {
    const s = await src()
    expect(s).toContain('riskDistribution')
    expect(s).toContain("executiveSummary.mode === 'portfolio'")
  })
})

describe('PR-1A — no mixed-unit Actual/Target/Gap aggregation', () => {
  it('branchSummary no longer sums actual/target across every KPI into one scalar', async () => {
    const s = await src()
    expect(s).not.toContain('const totalActual = KPI_FIELDS.reduce')
    expect(s).not.toContain('const totalTarget = KPI_FIELDS.reduce')
    expect(s).not.toContain('const gap = Math.max(0, totalTarget - totalActual)')
  })

  it('branchSummary computes validKpiCount using the same exclusion rule as computeOverallAchievement', async () => {
    const s = await src()
    expect(s).toContain('validKpiCount')
    expect(s).toContain('t > 0 && isFinite(t) && !isNaN(t)')
  })

  it('Branch Comparison table no longer renders Actual/Target/Gap columns', async () => {
    const s = await src()
    const tableSection = s.slice(s.indexOf('Branch Comparison'), s.indexOf('Branch Comparison') + 2500)
    expect(tableSection).not.toContain("'Actual', 'Target', 'Gap'")
    expect(tableSection).toContain('Valid KPIs')
  })

  it('exportExcel and exportReportPack no longer reference totalActual/totalTarget/gap', async () => {
    const s = await src()
    const exportSection = s.slice(s.indexOf('const exportExcel'), s.indexOf('const STAT_STYLE'))
    expect(exportSection).not.toContain('b.totalActual')
    expect(exportSection).not.toContain('b.totalTarget')
    expect(exportSection).not.toContain('b.gap')
  })
})

describe('PR-1A — KPI-specific MTD trend with explicit unit and equivalent periods', () => {
  it('removes the cross-KPI sum in mtdTrend', async () => {
    const s = await src()
    // The old bug: KPI_FIELDS.reduce(...) summing every KPI's value together.
    const mtdSection = s.slice(s.indexOf('const mtdTrend = useMemo'), s.indexOf('Territory summary'))
    expect(mtdSection).not.toContain('KPI_FIELDS.reduce')
    expect(mtdSection).toContain('activeMtdKpi.key')
  })

  it('exposes a KPI selector and unit lookup for the MTD trend', async () => {
    const s = await src()
    expect(s).toContain('mtdKpiKey')
    expect(s).toContain('getKpiMetaForKey(activeMtdKpi.key, liveRegistry)')
  })

  it('computes % change safely (never divides by zero)', async () => {
    const s = await src()
    expect(s).toContain('prevTotal > 0 ? Math.round((diff / prevTotal) * 100)')
  })

  it('renders the equivalent-period date ranges', async () => {
    const s = await src()
    expect(s).toContain('mtdTrend.currFrom')
    expect(s).toContain('mtdTrend.prevFrom')
  })
})

describe('PR-1A — true 14-day entry count', () => {
  it('14-day trend counts entry records instead of summing KPI values', async () => {
    const s = await src()
    const trendSection = s.slice(s.indexOf('// 14-day entry volume'), s.indexOf('// ── Executive Intelligence Summary'))
    expect(trendSection).not.toContain('KPI_FIELDS.reduce')
    expect(trendSection).toContain('de.length')
  })

  it('14-day trend is scope-aware under All Branches (no unscoped leak)', async () => {
    const s = await src()
    const trendSection = s.slice(s.indexOf('// 14-day entry volume'), s.indexOf('// ── Executive Intelligence Summary'))
    expect(trendSection).toContain('isPharmacyAllowed(scope, e.pharmacyId)')
  })
})

describe('PR-1A — scope/metric/period labels visible', () => {
  it('header shows the active scope alongside entry count and date range', async () => {
    const s = await src()
    expect(s).toContain("scope?.type === 'list' ? 'Scope: My Branches' : 'Scope: All Branches'")
  })

  it('Branch Comparison header states it is an overall weighted achievement, not a raw count', async () => {
    const s = await src()
    expect(s).toContain('Branch Comparison — Overall Weighted Achievement')
  })

  it('Top/Bottom 5 headers state the calculation basis', async () => {
    const s = await src()
    expect(s).toContain('Top 5 Branches — Overall Weighted Achievement')
    expect(s).toContain('Bottom 5 Branches — Overall Weighted Achievement')
  })
})
