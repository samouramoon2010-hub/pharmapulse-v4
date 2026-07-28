// ============================================================
// 2026-07-13 — KPI Management: Show/Hide Archived toggle
//
// Owner request: after archiving KPIs (isActive=false), the admin
// wants a button to hide those archived rows from the /admin/kpis
// table entirely (they were already invisible everywhere else —
// target input, dashboard, KPI entry — via the existing isActive/
// lifecycleStage filtering in kpiUiAdapter.ts's getActiveKpis()).
// This is a pure view-side filter: archived KPIs are never removed
// from the registry itself, and the toggle lets the admin bring
// them back into view (e.g. to unarchive one later).
//
// This repo has no React component-rendering test harness — every
// "UI" test here asserts against the raw source string via the
// established `?raw` import convention.
// ============================================================
import { describe, it, expect } from 'vitest'

async function getSource() {
  return (await import('./KpiManagementPage.jsx?raw')).default
}

describe('1 — showArchived state defaults to false (archived hidden by default)', () => {
  it('declares showArchived initialized to false', async () => {
    const src = await getSource()
    expect(src).toContain('useState(false)')
    expect(src).toContain('const [showArchived, setShowArchived] = useState(false)')
  })
})

describe('2 — visibleKpis filters out archived KPIs unless showArchived is true', () => {
  it('visibleKpis returns allKpis unchanged when showArchived is true', async () => {
    const src = await getSource()
    const declIndex = src.indexOf('const visibleKpis = useMemo(')
    expect(declIndex).toBeGreaterThan(-1)
    const decl = src.slice(declIndex, declIndex + 400)
    expect(decl).toContain('if (showArchived) return allKpis')
  })

  it('visibleKpis filters using uiStatuses, not a duplicated lifecycle check', async () => {
    const src = await getSource()
    const declIndex = src.indexOf('const visibleKpis = useMemo(')
    const decl = src.slice(declIndex, declIndex + 400)
    expect(decl).toContain("!== 'ARCHIVED'")
    expect(decl).toContain('uiStatuses[k.key]')
  })
})

describe('3 — the table renders visibleKpis, not the unfiltered allKpis', () => {
  it('KpiRegistryTable receives kpis={visibleKpis}', async () => {
    const src = await getSource()
    expect(src).toContain('kpis={visibleKpis}')
    expect(src).not.toContain('kpis={allKpis}')
  })

  it('the registry health dashboard (Total/Archived counts) still reflects the full, unfiltered registry', async () => {
    const src = await getSource()
    // healthStats is derived from allKpis, independent of the view filter —
    // the admin should still see the true total/archived counts even when
    // archived rows are hidden from the table below.
    expect(src).toContain('const healthStats = useMemo(() => {')
    const healthIdx = src.indexOf('const healthStats = useMemo(')
    const nextMemoIdx = src.indexOf('const existingKeys', healthIdx)
    const healthDecl = src.slice(healthIdx, nextMemoIdx)
    expect(healthDecl).toContain('[allKpis]')
  })
})

describe('4 — a toggle button exists and reflects current state', () => {
  it('a button toggles showArchived via setShowArchived', async () => {
    const src = await getSource()
    expect(src).toContain('onClick={() => setShowArchived((s) => !s)}')
  })

  it('button label communicates the archived count when collapsed, and an undo action when expanded', async () => {
    const src = await getSource()
    expect(src).toContain('`Show archived (${healthStats.counts.archived})`')
    expect(src).toContain("'Hide archived'")
  })
})
