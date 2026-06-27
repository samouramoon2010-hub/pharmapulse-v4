// ============================================================
// PR-1E6 — Device & Visual Certification
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

async function src(path: string): Promise<string> {
  // @ts-expect-error — ?raw import has no type declaration
  return (await import(/* @vite-ignore */ `${path}?raw`)).default
}

const dashboardPage = () => src('../dashboard/DashboardPage.jsx')
const branchLeaderboard = () => src('../../components/executive/BranchLeaderboard.jsx')
const indexCssSrc = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const indexCss = async () => indexCssSrc

// ════════════════════════════════════════════════════════════
// 1. BranchLeaderboard — fixed 6-column grid no longer forces
//    horizontal overflow on phones (real-browser measured: 422px
//    scrollWidth vs 375px viewport before this fix)
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — BranchLeaderboard grid no longer forces phone-width overflow', () => {
  it('header/row grid template moved out of inline style into the responsive .leaderboard-row class', async () => {
    const s = await branchLeaderboard()
    expect(s).not.toContain("gridTemplateColumns: '28px 1fr 52px 60px 80px 64px'")
    expect(s).toContain('className="leaderboard-row"')
  })
  it('Risk and Trend columns hide below sm — only on the 2 cells that previously forced the overflow', async () => {
    const s = await branchLeaderboard()
    const riskIdx = s.indexOf("h === 'Risk' || h === 'Trend'")
    expect(riskIdx).toBeGreaterThan(-1)
    expect((s.match(/className="hidden sm:inline"/g) || []).length).toBeGreaterThanOrEqual(2)
  })
  it('.leaderboard-row narrows to 4 tracks below 640px, matching the Risk/Trend hide', async () => {
    const css = await indexCss()
    expect(css).toContain('.leaderboard-row { grid-template-columns: 28px 1fr 52px 60px 80px 64px; }')
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*\.leaderboard-row \{ grid-template-columns: 22px 1fr 48px 44px; \}/)
  })
  it('no rank/branch/score/achievement data was dropped — only Risk/Trend reflow, per "reflow not drop fields"', async () => {
    const s = await branchLeaderboard()
    expect(s).toContain('{rank}')
    expect(s).toContain('{branch.pharmacyName}')
    expect(s).toContain('{branch.score.adjusted}')
    expect(s).toContain('{branch.overallAchPct}%')
  })
})

// ════════════════════════════════════════════════════════════
// 2. Dashboard Identity bar — wraps instead of overflowing
//    (real-browser measured: this row's own scrollWidth exceeded
//    its clientWidth by ~43px before this fix)
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Dashboard Identity bar wraps below phone width instead of overflowing', () => {
  it('Row 1 flex container allows wrapping', async () => {
    const s = await dashboardPage()
    const idx = s.indexOf('Row 1: Identity bar')
    const block = s.slice(idx, idx + 700)
    expect(block).toContain("flexWrap: 'wrap'")
  })
  it('the metadata line (month · day · status) also wraps, not just the outer row', async () => {
    const s = await dashboardPage()
    const idx = s.indexOf('{monthLabel}')
    const block = s.slice(Math.max(0, idx - 300), idx)
    expect(block).toContain("flexWrap:'wrap'")
  })
  it('no pharmacy name/code/month/day/status field was removed — only layout changed', async () => {
    const s = await dashboardPage()
    expect(s).toContain('{pharmName}')
    expect(s).toContain('{monthLabel}')
    expect(s).toContain('Day {daysPassed} of {totalDays}')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Dashboard Executive KPI cards — reflow to 2x2 below sm
//    (real-browser measured: ~85px per card at 375px viewport,
//    overflowing by ~75px before this fix)
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Dashboard Executive KPI cards reflow to 2x2 instead of cramming 4 across', () => {
  it('the 4-card row uses the responsive .exec-kpi-row class, not a hardcoded repeat(4,1fr)', async () => {
    const s = await dashboardPage()
    const idx = s.indexOf('Row 2: Executive KPI cards')
    const block = s.slice(idx, idx + 1100)
    expect(block).toContain('className="exec-kpi-row"')
    expect(block).not.toContain("gridTemplateColumns: 'repeat(4, 1fr)'")
  })
  it('.exec-kpi-row collapses to 2 columns below 640px, all 4 cards still present (2x2, not dropped)', async () => {
    const css = await indexCss()
    expect(css).toContain('.exec-kpi-row { grid-template-columns: repeat(4, 1fr); }')
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*\.exec-kpi-row \{ grid-template-columns: repeat\(2, 1fr\); \}/)
  })
  it('all 4 cards (Branch Health, Forecast EOM, Team Status, Portfolio Risk) remain in the markup', async () => {
    const s = await dashboardPage()
    expect(s).toContain('Branch Health')
    expect(s).toContain('Forecast EOM')
    expect(s).toContain('Team Status')
    expect(s).toContain('Portfolio Risk')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Dashboard KPI tile grid — hard 1-column floor below 480px
//    (real-browser measured: auto-fit minmax(220px,1fr) still
//    produced 2 sub-220px tracks at 375px, overflowing by ~30px)
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Dashboard KPI tile grid never produces a sub-220px track on phones', () => {
  it('the KPI tile grid carries the kpi-tile-grid class alongside its auto-fit minmax', async () => {
    const s = await dashboardPage()
    expect(s).toContain('className="kpi-tile-grid"')
    expect(s).toContain("gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'")
  })
  it('a hard 1-column override exists below 480px to force the auto-fit floor', async () => {
    const css = await indexCss()
    expect(css).toMatch(/@media \(max-width: 479\.98px\) \{\s*\.kpi-tile-grid \{ grid-template-columns: 1fr !important; \}/)
  })
})

// ════════════════════════════════════════════════════════════
// 5. Global defensive guard — no page-wide horizontal scrollbar
//    regardless of root cause
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — html/body carry a defensive overflow-x guard', () => {
  it('overflow-x: hidden is set on html and body as a backstop', async () => {
    const css = await indexCss()
    expect(css).toMatch(/html,\s*body\s*\{\s*overflow-x:\s*hidden;\s*\}/)
  })
})

// ════════════════════════════════════════════════════════════
// 6. No scope creep — these are layout-only fixes, no calculation/
//    permission/data change
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — no scope creep', () => {
  it('BranchLeaderboard still receives report/onSelectBranch/selectedId/scopeType as before — no new prop contract', async () => {
    const s = await branchLeaderboard()
    expect(s).toContain('export default function BranchLeaderboard({ report, onSelectBranch, selectedId, scopeType })')
  })
  it('no new Firestore collection literal introduced in either touched file', async () => {
    for (const loader of [dashboardPage, branchLeaderboard]) {
      const s = await loader()
      expect(s).not.toMatch(/collection\(\s*db,\s*['"][a-zA-Z_]+['"]\s*\)/)
    }
  })
})
