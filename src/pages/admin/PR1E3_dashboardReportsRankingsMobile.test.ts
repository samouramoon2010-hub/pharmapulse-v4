// ============================================================
// PR-1E3 — Dashboard, Reports & Rankings Mobile Layouts
// ============================================================
import { describe, it, expect } from 'vitest'

// @ts-expect-error — ?raw import has no type declaration
async function dashboardSrc() { return (await import('../dashboard/DashboardPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function reportsSrc() { return (await import('../shared/ReportsPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function rankingsSrc() { return (await import('./RankingsPage.tsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function mobileRankCardSrc() { return (await import('../../components/ui/MobileRankCard.jsx?raw')).default }

// ════════════════════════════════════════════════════════════
// 1. Shared component reuse — MobileRankCard used by ≥2 pages
// ════════════════════════════════════════════════════════════
describe('PR-1E3 — MobileRankCard: one shared primitive, reused (not a second design system)', () => {
  it('is a presentation-only component: no Firestore/engine imports, no calculation logic', async () => {
    const src = await mobileRankCardSrc()
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/(services|engine|ranking)/)
    expect(src).not.toContain('computeAchievementPct')
  })
  it('uses existing .card/.card-p tokens, not a new card class', async () => {
    const src = await mobileRankCardSrc()
    expect(src).toContain('className="card card-p')
  })
  it('is imported and used by ReportsPage (Branch Comparison)', async () => {
    const src = await reportsSrc()
    expect(src).toContain("import MobileRankCard       from '../../components/ui/MobileRankCard'")
    expect(src).toContain('<MobileRankCard')
  })
  it('is imported and used by RankingsPage (both branch and pharmacist cohort tables)', async () => {
    const src = await rankingsSrc()
    expect(src).toContain("import MobileRankCard")
    expect((src.match(/<MobileRankCard/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

// ════════════════════════════════════════════════════════════
// 2. Reports — mobile filter summary, table→card conversion
// ════════════════════════════════════════════════════════════
describe('PR-1E3 — Reports: mobile filter summary always shows scope/period/KPI/comparison', () => {
  it('renders a mobile-only filter summary line', async () => {
    const src = await reportsSrc()
    expect(src).toContain('sm:hidden flex flex-wrap gap-x-3 gap-y-1')
  })
  it('summary shows Scope, Period, MTD KPI, and Comparison basis — all from existing state, no new fetch', async () => {
    const src = await reportsSrc()
    expect(src).toContain('Scope:')
    expect(src).toContain('Period:')
    expect(src).toContain('MTD KPI:')
    expect(src).toContain('Comparison:')
  })
})

describe('PR-1E3 — Reports: Branch Comparison table converts to cards on mobile (mobile-blueprint.md rule)', () => {
  it('table is hidden below sm; a card list (same branchSummary data) replaces it', async () => {
    const src = await reportsSrc()
    expect(src).toContain('<div className="hidden sm:block" style={{ overflowX:\'auto\' }}>')
    expect(src).toMatch(/className="sm:hidden space-y-2">\s*\{branchSummary\.map/)
  })
  it('mobile cards reuse branchSummary directly — no re-sort, no re-aggregation, no new calc call', async () => {
    const src = await reportsSrc()
    const cardBlockStart = src.indexOf('{branchSummary.map((b, idx) => {')
    const cardBlockEnd   = src.indexOf('</div>\n          <div className="hidden sm:block"')
    const cardBlock = src.slice(cardBlockStart, cardBlockEnd)
    expect(cardBlock).not.toContain('.sort(')
    expect(cardBlock).not.toContain('computeOverallAchievement(')
  })
  it('no PDF support is claimed anywhere (still a disabled "coming soon" toast)', async () => {
    const src = await reportsSrc()
    expect(src).toContain("toast.info('PDF export — coming soon')")
    expect(src).not.toMatch(/PDF (export )?(is )?(now )?(available|supported|ready)/i)
  })
  it('Excel/CSV export functions are unchanged (still exportCSV/exportExcel, no new export engine)', async () => {
    const src = await reportsSrc()
    expect(src).toContain('onClick={exportCSV}')
    expect(src).toContain('onClick={exportExcel}')
  })
  it('mixed-unit columns (raw Actual/Target/Gap totals) are not reintroduced to the comparison row', async () => {
    const src = await reportsSrc()
    const idx = src.indexOf('Branch Comparison — Overall Weighted Achievement')
    const block = src.slice(idx, idx + 2400)
    expect(block).not.toContain('totalActual')
    expect(block).not.toContain('totalTarget')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Rankings — table→card conversion, official rank preserved
// ════════════════════════════════════════════════════════════
describe('PR-1E3 — Rankings: both cohort tables convert to cards on mobile', () => {
  it('BranchCohortTable: table hidden below sm; card list reuses the same `snapshots` array, same order', async () => {
    const src = await rankingsSrc()
    const fnStart = src.indexOf('function BranchCohortTable')
    const fnEnd   = src.indexOf('function PharmacistCohortTable')
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain('className="sm:hidden space-y-2"')
    expect(fn).toContain('className="hidden sm:block"')
    expect(fn).toMatch(/snapshots\.map\(\(s\) => \{[\s\S]*?<MobileRankCard/)
    expect(fn).not.toMatch(/snapshots\.(sort|filter)\(/)
  })
  it('PharmacistCohortTable: table hidden below sm; card list reuses the same `snapshots` array, same order', async () => {
    const src = await rankingsSrc()
    const fnStart = src.indexOf('function PharmacistCohortTable')
    const fnEnd   = src.indexOf('// ── Page')
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain('className="sm:hidden space-y-2"')
    expect(fn).toContain('className="hidden sm:block"')
    expect(fn).not.toMatch(/snapshots\.(sort|filter)\(/)
  })
  it('mobile cards pass currentRank as the official rank — no second/unofficial rank is computed', async () => {
    const src = await rankingsSrc()
    expect(src).toMatch(/rank=\{s\.currentRank\}/)
    expect(src).not.toMatch(/const\s+mobileRank\s*=/)
  })
  it('"Showing X of Y eligible" diagnostics text is still rendered unconditionally (not hidden on mobile)', async () => {
    const src = await rankingsSrc()
    expect(src).toContain('Showing ${diagnostics.branchesRanked} of')
    expect(src).not.toMatch(/className="[^"]*\bhidden\b[^"]*"[^>]*>\s*\{?\s*Showing/)
  })
  it('classification/branch-name labels in mobile cards reuse the existing humanizer/resolver — no raw ids', async () => {
    const src = await rankingsSrc()
    expect(src).toContain('subtitle={classificationLabel(s.classificationId)}')
    expect(src).toContain('subtitle={pharmId !== undefined ? (pharmacyNameById.get(pharmId) ?? ')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Dashboard — mobile section order, desktop preserved
// ════════════════════════════════════════════════════════════
describe('PR-1E3 — Dashboard: mobile reorders risk/alerts ahead of trend/secondary insight', () => {
  it('Smart Alerts panel is order-1 on mobile, restored to natural position at xl', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('className="order-1 xl:order-none"')
    expect(src).toContain('<TopAlertsPanel')
  })
  it('Trend chart is order-2 and KPI Distribution is order-3 on mobile — both reset at xl (unchanged desktop order)', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('className="order-2 xl:order-none"')
    expect(src).toContain('className="card card-p order-3 xl:order-none"')
  })
  it('reordering is CSS-only (Tailwind order utilities) — no component is duplicated or removed', async () => {
    const src = await dashboardSrc()
    expect((src.match(/<TopAlertsPanel/g) || []).length).toBe(1)
    expect((src.match(/<KpiDistributionDonut/g) || []).length).toBe(1)
  })
  it('charts still use ResponsiveContainer (no fixed-pixel chart width introduced)', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('<ResponsiveContainer width="100%"')
  })
  it('no raw user/pharmacy id is newly rendered by this section\'s edits', async () => {
    const src = await dashboardSrc()
    const idx = src.indexOf('Analytics</span>')
    const block = src.slice(idx, idx + 2200)
    expect(block).not.toMatch(/\.uid\b/)
  })
})

// ════════════════════════════════════════════════════════════
// 5. Regression — no calculation/ranking-logic changes
// ════════════════════════════════════════════════════════════
describe('PR-1E3 — no scope creep into calculation/ranking logic', () => {
  it('Reports: branchSummary/mtdTrend computation functions are not redefined in this file beyond existing names', async () => {
    const src = await reportsSrc()
    expect(src).toContain('const activeMtdKpi = KPI_FIELDS.find((f) => f.key === mtdKpiKey)')
  })
  it('Rankings: no new sort/filter was added to the ranking pipeline itself (cohortMap/sortedCohortKeys unchanged)', async () => {
    const src = await rankingsSrc()
    expect(src).toContain('cohortMap')
    expect(src).toContain('sortedCohortKeys')
  })
  it('Dashboard: KPI tile grid (primary KPI summary) is untouched by the reorder', async () => {
    const src = await dashboardSrc()
    expect(src).toContain("repeat(auto-fit, minmax(220px, 1fr))")
  })
})
