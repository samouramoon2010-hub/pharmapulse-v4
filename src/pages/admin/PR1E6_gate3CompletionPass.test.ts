// ============================================================
// PR-1E6 Gate 3 Completion Pass — regression tests for defects
// found via real-browser certification of the previously-uncertified
// required pages (Users, Profile Studio, Run Evaluation) plus the
// Profile Studio / Assistant nav-visibility audit.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

async function src(path: string): Promise<string> {
  // @ts-expect-error — ?raw import has no type declaration
  return (await import(/* @vite-ignore */ `${path}?raw`)).default
}

const sidebar         = () => src('../../components/layout/Sidebar.jsx')
const usersPage        = () => src('./UsersPage.jsx')
const kpiEntryPage     = () => src('../pharmacist/KpiEntryPage.jsx')
const targetsPage      = () => src('../shared/TargetsPage.jsx')
const profileStudioPage = () => src('../profileStudio/ProfileStudioPage.jsx')
const evaluationRunPage = () => src('./EvaluationRunPage.tsx')
const indexCssSrc = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const indexCss = async () => indexCssSrc
const appJsx = () => src('../../App.jsx')

// ════════════════════════════════════════════════════════════
// 1. Profile Studio / Assistant nav visibility matches the actual
//    route guard (PS_ROLES) for branch_manager and regional_manager —
//    previously these two roles saw a nav item that redirected to
//    /unauthorized on click.
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Profile Studio/Assistant nav visibility matches PS_ROLES route guard', () => {
  it('App.jsx PS_ROLES route guard does not include branch_manager or regional_manager (confirms the guard, not changed by this pass)', async () => {
    const s = await appJsx()
    const idx = s.indexOf('PS_ROLES')
    const decl = s.slice(idx, idx + 120)
    expect(decl).not.toContain("'branch_manager'")
    expect(decl).not.toContain("'regional_manager'")
  })
  it('NAV_CONFIG.branch_manager filters out /profile-studio and /assistant from the manager array it aliases', async () => {
    const s = await sidebar()
    const idx = s.indexOf('NAV_CONFIG.branch_manager = NAV_CONFIG.manager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 300)
    expect(block).toContain("item.path !== '/profile-studio'")
    expect(block).toContain("item.path !== '/assistant'")
  })
  it('NAV_CONFIG.regional_manager filters out /profile-studio and /assistant from the district_supervisor array it aliases', async () => {
    const s = await sidebar()
    const idx = s.indexOf('NAV_CONFIG.regional_manager = NAV_CONFIG.district_supervisor')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 300)
    expect(block).toContain("item.path !== '/profile-studio'")
    expect(block).toContain("item.path !== '/assistant'")
  })
  it('manager and district_supervisor themselves keep Profile Studio/Assistant — only the two unauthorized aliases are filtered', async () => {
    const s = await sidebar()
    const managerBlockStart = s.indexOf('manager: [')
    const districtBlockStart = s.indexOf('NAV_CONFIG.district_supervisor = [')
    expect(s.slice(managerBlockStart, managerBlockStart + 1200)).toContain("path: '/profile-studio'")
    expect(s.slice(districtBlockStart, districtBlockStart + 700)).toContain("path: '/profile-studio'")
  })
})

// ════════════════════════════════════════════════════════════
// 2. Raw-ID fallback removal — KPI Entry subtitle and Targets bulk
//    modal previously fell back to a raw Firestore document ID when
//    the name lookup failed.
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — raw document IDs never render as a fallback display value', () => {
  it('KPI Entry subtitle no longer falls back to the raw pharmacyId', async () => {
    const s = await kpiEntryPage()
    expect(s).not.toContain('pharmacy?.name || pharmacyId')
    expect(s).toContain("pharmacy?.name || '—'")
  })
  it('Targets BulkModal no longer falls back to the raw branch id, at creation time or render time', async () => {
    const s = await targetsPage()
    expect(s).not.toContain('name: ph?.name || id')
    expect(s).not.toContain('rows[id]?.name || id')
    expect(s).toContain("ph?.name || 'Unnamed branch'")
    expect(s).toContain("rows[id]?.name || 'Unnamed branch'")
  })
})

// ════════════════════════════════════════════════════════════
// 3. Users page — DataTable has no responsive variant; previously a
//    1213px-wide table clipped every column but the role/scope/status
//    badges at a 375px viewport (measured via real-browser scrollWidth).
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Users page renders mobile cards instead of a clipped desktop table', () => {
  it('a sm:hidden card list maps the same `filtered` array the desktop table uses', async () => {
    const s = await usersPage()
    const idx = s.indexOf('Mobile cards')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('className="sm:hidden"')
    expect(block).toContain('filtered.map((row)')
  })
  it('the desktop DataTable is wrapped hidden sm:block — no second, divergent data source', async () => {
    const s = await usersPage()
    expect(s).toContain('<div className="hidden sm:block">')
  })
  it('cards expose the same row actions (Edit/Suspend-Activate/Transfer/Promote) gated by the same permission functions', async () => {
    const s = await usersPage()
    const idx = s.indexOf('Mobile cards')
    const block = s.slice(idx, idx + 4000)
    expect(block).toContain('canEdit &&')
    expect(block).toContain('canToggleRow(row)')
    expect(block).toContain('canTransferRow(row)')
    expect(block).toContain('canPromoteRow(row)')
  })
  it('no employeeId or other raw field is dropped from the card — same fields as the table column set', async () => {
    const s = await usersPage()
    const idx = s.indexOf('Mobile cards')
    const block = s.slice(idx, idx + 4000)
    expect(block).toContain('row.displayName')
    expect(block).toContain('row.email')
    expect(block).toContain('row.employeeId')
    expect(block).toContain('getRoleLabel(row.role)')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Profile Studio — fixed '1fr 320px' grid crushed the profile list
//    to ~39px at a 375px viewport (measured via screenshot, not
//    scrollWidth — the select narrowed instead of overflowing).
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Profile Studio grid stacks to one column below 1024px', () => {
  it('the grid carries the profile-studio-grid class alongside its fixed desktop template', async () => {
    const s = await profileStudioPage()
    expect(s).toContain('className="profile-studio-grid"')
    expect(s).toContain("gridTemplateColumns: '1fr 320px'")
  })
  it('a 1-column override exists below 1024px', async () => {
    const css = await indexCss()
    expect(css).toMatch(/@media \(max-width: 1023\.98px\) \{\s*\.profile-studio-grid \{ grid-template-columns: 1fr !important; \}/)
  })
  it('DOM order keeps Profiles list before Simulation Runs so stacking does not change reading order', async () => {
    const s = await profileStudioPage()
    const profilesIdx = s.indexOf('aria-label="Profiles list"')
    const runsIdx = s.indexOf('aria-label="Simulation runs"')
    expect(profilesIdx).toBeGreaterThan(-1)
    expect(runsIdx).toBeGreaterThan(profilesIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 5. Run Evaluation — fixed 4-col / 3-col control grids narrowed each
//    <select width:100%> cell to ~84px at 375px, clipping placeholder
//    text inside the control (measured via screenshot).
// ════════════════════════════════════════════════════════════
describe('PR-1E6 — Run Evaluation control grids stack to one column below 640px', () => {
  it('Single User mode grid carries eval-run-fields-4', async () => {
    const s = await evaluationRunPage()
    expect(s).toContain('className="eval-run-fields-4"')
  })
  it('Bulk Branch mode grid carries eval-run-fields-3', async () => {
    const s = await evaluationRunPage()
    expect(s).toContain('className="eval-run-fields-3"')
  })
  it('a 1-column override exists for both below 640px', async () => {
    const css = await indexCss()
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*\.eval-run-fields-4, \.eval-run-fields-3 \{ grid-template-columns: 1fr !important; \}/)
  })
  it('no field was dropped from either mode — Branch/User/Month/Profile and Branch/Month/Profile remain', async () => {
    const s = await evaluationRunPage()
    expect(s).toContain('label="Branch"')
    expect(s).toContain('label="User"')
    expect(s).toContain('label="Month"')
    expect(s).toContain('label="Evaluation Profile"')
  })
})

// ════════════════════════════════════════════════════════════
// 6. No scope creep — these are layout/visibility-only fixes, no
//    permission broadened, no new Firestore collection, no business
//    logic change.
// ════════════════════════════════════════════════════════════
describe('PR-1E6 Gate 3 Completion Pass — no scope creep', () => {
  it('no new Firestore collection literal introduced in any touched file', async () => {
    for (const loader of [sidebar, usersPage, kpiEntryPage, targetsPage, profileStudioPage, evaluationRunPage]) {
      const s = await loader()
      expect(s).not.toMatch(/collection\(\s*db,\s*['"][a-zA-Z_]+['"]\s*\)/)
    }
  })
  it('PS_ROLES itself was not widened or narrowed by this pass — only nav visibility changed to match it', async () => {
    const s = await appJsx()
    expect(s).toContain("const PS_ROLES = ['admin', 'general_manager', 'district_supervisor', 'manager']")
  })
})
