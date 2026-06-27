// ============================================================
// PR-1E4 — Admin & Operational Mobile Surfaces
// ============================================================
import { describe, it, expect } from 'vitest'

async function src(path: string): Promise<string> {
  // @ts-expect-error — ?raw import has no type declaration
  return (await import(/* @vite-ignore */ `${path}?raw`)).default
}

const kpiRegistryTable   = () => src('../../components/admin/kpi/KpiRegistryTable.jsx')
const exportStudio       = () => src('../admin/ExportStudioPage.jsx')
const evaluationRun      = () => src('../admin/EvaluationRunPage.tsx')
const auditLogs          = () => src('../admin/AuditLogsPage.jsx')
const dataExchangeStudio = () => src('../admin/DataExchangeStudioPage.jsx')
const dynamicKpiShadow   = () => src('../admin/DynamicKpiShadowPage.jsx')
const targetsPage        = () => src('../shared/TargetsPage.jsx')
const personalTargets    = () => src('../manager/PersonalTargetsPage.tsx')
const importCenter       = () => src('../admin/ImportCenterPage.jsx')
const mobileRankCard     = () => src('../../components/ui/MobileRankCard.jsx')

// ════════════════════════════════════════════════════════════
// 1. Shared component extension — actions slot, backward compatible
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — MobileRankCard: actions slot is additive, backward compatible', () => {
  it('actions prop is optional and renders only when supplied', async () => {
    const s = await mobileRankCard()
    expect(s).toContain('actions,')
    expect(s).toMatch(/\{actions && \(/)
  })
  it('existing PR-1E3 callers (Reports/Rankings) still work without passing actions', async () => {
    const reports = await src('../shared/ReportsPage.jsx')
    const rankings = await src('../admin/RankingsPage.tsx')
    expect(reports).toContain('<MobileRankCard')
    expect(rankings).toContain('<MobileRankCard')
  })
})

// ════════════════════════════════════════════════════════════
// 2. KPI Registry — table → cards, actions preserved
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — KPI Registry: table converts to cards, no Core badge, actions touch-friendly', () => {
  it('table hidden below sm; card list reuses the same `kpis` data/order', async () => {
    const s = await kpiRegistryTable()
    expect(s).toContain('hidden sm:block tbl-wrap')
    expect(s).toMatch(/className="sm:hidden space-y-2">\s*\{kpis\.map/)
  })
  it('mobile cards reuse onEdit/onHide/onArchive directly — no duplicated archive logic', async () => {
    const s = await kpiRegistryTable()
    const cardBlockStart = s.indexOf('{kpis.map((kpi) => {')
    const cardBlockEnd = s.indexOf('<div className="hidden sm:block')
    const block = s.slice(cardBlockStart, cardBlockEnd)
    expect(block).toContain('onClick={() => onEdit(kpi)}')
    expect(block).toContain('onClick={() => onHide(kpi.key)}')
    expect(block).toContain('onClick={() => onArchive(kpi.key)}')
  })
  it('no Core badge is reintroduced on mobile (PR-1C removal preserved)', async () => {
    const s = await kpiRegistryTable()
    expect(s).not.toContain('function ProtectedBadge')
  })
  it('protected/core KPIs show the blocked-archive reason, not a silently missing action', async () => {
    const s = await kpiRegistryTable()
    expect(s).toContain('Protected system KPI — cannot be archived or hidden')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Export Studio — history table → cards, no PDF/background claim
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Export Studio: export history converts to cards', () => {
  it('table hidden below sm; card list reuses the same `history` data/order', async () => {
    const s = await exportStudio()
    expect(s).toContain('hidden sm:table')
    expect(s).toMatch(/className="sm:hidden space-y-2">\s*\{history\.map/)
  })
  it('CSV/XLSX format field is rendered as-is — no new PDF/background-processing claim added', async () => {
    const s = await exportStudio()
    expect(s).not.toMatch(/PDF (is )?(now )?(available|supported)/i)
    expect(s).not.toMatch(/background.*generat/i)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Evaluation Run — basket detail + bulk results convert to cards
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Evaluation Run: basket KPI breakdown and bulk results convert to cards', () => {
  it('basket detail table hidden below sm; card list reuses the same `basket.elements`', async () => {
    const s = await evaluationRun()
    expect(s).toContain("className=\"sm:hidden space-y-2\"")
    expect(s).toMatch(/basket\.elements\.map\(\(el\) => \([\s\S]*?<MobileRankCard/)
    expect(s).toContain('table className="hidden sm:table"')
  })
  it('bulk results table hidden below sm; card list reuses the same `bulkReport.results`', async () => {
    const s = await evaluationRun()
    expect(s).toMatch(/bulkReport\.results\.map\(\(r\) => \([\s\S]*?<MobileRankCard/)
    expect(s).toContain('className="hidden sm:block"')
  })
  it('imports MobileRankCard with the established @ts-expect-error pattern (no .d.ts needed)', async () => {
    const s = await evaluationRun()
    expect(s).toContain('@ts-expect-error — MobileRankCard.jsx has no .d.ts')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Audit Logs — expandable-row pattern preserved, raw IDs stay
//    inside this authorized diagnostics surface
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Audit Logs: table converts to cards, expand mechanism reused, not duplicated', () => {
  it('table hidden below sm; card list reuses the same `filtered.slice(0,100)` data/order', async () => {
    const s = await auditLogs()
    expect(s).toContain('hidden sm:table')
    expect(s).toMatch(/className="sm:hidden space-y-2">\s*\{filtered\.slice\(0,100\)\.map/)
  })
  it('mobile expand toggle reuses the existing `expanded` state and ExpandedLog component — no second diff renderer', async () => {
    const s = await auditLogs()
    const cardBlockStart = s.indexOf('className="sm:hidden space-y-2"')
    const cardBlockEnd = s.indexOf('table className="hidden sm:table"')
    const block = s.slice(cardBlockStart, cardBlockEnd)
    expect(block).toContain('setExpanded(expanded===log.id?null:log.id)')
    expect(block).toContain('<ExpandedLog log={log} />')
    expect((s.match(/function ExpandedLog/g) || []).length).toBe(1)
  })
  it('truncated userId remains visible — this page is the authorized diagnostics exception, not a leak', async () => {
    const s = await auditLogs()
    expect(s).toContain('log.userId?.slice(0,12)')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Data Exchange Studio — import history converts to cards;
//    sheet-mapping table converts to stacked rows
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Data Exchange Studio: import history cards, sheet mapping de-tabled', () => {
  it('import history table hidden below sm; card list reuses the same `jobs` data/order', async () => {
    const s = await dataExchangeStudio()
    expect(s).toMatch(/className="sm:hidden space-y-2">\s*\{jobs\.map/)
    expect(s).toContain('className="hidden sm:block" style={{ overflowX: \'auto\' }}')
  })
  it('sheet → domain mapping no longer uses a <table> with a <select> per cell', async () => {
    const s = await dataExchangeStudio()
    const idx = s.indexOf('<div className="space-y-2">\n            {sheetMappings.map')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 800)
    expect(block).not.toContain('<table>')
    expect(block).toContain('sheetMappings.map')
  })
  it('no import/commit/chunking semantics were touched (still calls the same orchestrator functions)', async () => {
    const s = await dataExchangeStudio()
    expect(s).toContain('resolveSheetMappings')
    expect(s).toContain('validateOnboardingJob')
    expect(s).toContain('commitOnboardingJob')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Dynamic KPI Shadow — developer-only classification, no silent
//    content clipping
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Dynamic KPI Shadow: developer-only, no overflow:hidden clipping', () => {
  it('still self-describes as internal/admin-only diagnostics (classification unchanged)', async () => {
    const s = await dynamicKpiShadow()
    expect(s).toContain('Internal diagnostics only')
  })
  it('table wrappers no longer silently clip overflowing content (overflow:hidden -> auto)', async () => {
    const s = await dynamicKpiShadow()
    expect(s).not.toMatch(/borderRadius: '8px', overflow: 'hidden'/)
    expect((s.match(/borderRadius: '8px', overflow: 'auto'/g) || []).length).toBeGreaterThanOrEqual(5)
  })
  it('a desktop-recommended note is shown on mobile rather than a forced card redesign of dense diagnostics tables', async () => {
    const s = await dynamicKpiShadow()
    expect(s).toContain('className="sm:hidden"')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Targets — fixed-column overflow defect fixed; bulk grid
//    explicitly Desktop-preferred
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Targets: KPI tile grid reflows instead of compressing illegibly', () => {
  it('the per-branch KPI grid no longer uses a fixed repeat(5,1fr) (was illegible below 430px)', async () => {
    const s = await targetsPage()
    expect(s).not.toContain("gridTemplateColumns:'repeat(5,1fr)'")
    expect(s).toContain("gridTemplateColumns:'repeat(auto-fit, minmax(64px, 1fr))'")
  })
  it('the bulk multi-branch x multi-KPI grid is explicitly labeled Desktop-preferred, not converted to cards', async () => {
    const s = await targetsPage()
    expect(s).toContain('Desktop-preferred')
    expect(s).toContain('<p className="sm:hidden"')
  })
  it('no target-edit contract change — saveTarget/onSave paths untouched', async () => {
    const s = await targetsPage()
    expect(s).toContain('onSave')
  })
})

describe('PR-1E4 — Personal Targets: per-pharmacist allocation matrix explicitly Desktop-preferred', () => {
  it('labeled Desktop-preferred rather than converted to cards (would break branch-total-vs-allocation comparison)', async () => {
    const s = await personalTargets()
    expect(s).toContain('Desktop-preferred')
    expect(s).toContain('<p className="sm:hidden"')
  })
  it('allocation engine calls are untouched (allocateEqual/allocateCustom/validateCustomAllocation)', async () => {
    const s = await personalTargets()
    expect(s).toContain('allocateEqual')
    expect(s).toContain('allocateCustom')
    expect(s).toContain('validateCustomAllocation')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Import Center — generic schema preview explicitly Desktop-preferred
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — Import Center: arbitrary-schema file preview explicitly Desktop-preferred', () => {
  it('preview rows remain capped at 5 (no thousands-of-rows mobile rendering)', async () => {
    const s = await importCenter()
    expect(s).toContain('rows.slice(0,5)')
  })
  it('a desktop-recommended note is shown on mobile for the raw column preview', async () => {
    const s = await importCenter()
    expect(s).toContain('className="sm:hidden px-4 pt-2')
  })
})

// ════════════════════════════════════════════════════════════
// 10. No raw IDs leaked outside authorized diagnostics surfaces
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — no raw IDs in non-diagnostic mobile cards', () => {
  it('KPI Registry mobile card shows the business key, not a Firestore doc id', async () => {
    const s = await kpiRegistryTable()
    const cardBlockStart = s.indexOf('{kpis.map((kpi) => {')
    const cardBlockEnd = s.indexOf('<div className="hidden sm:block')
    const block = s.slice(cardBlockStart, cardBlockEnd)
    expect(block).toContain('kpi.key')
    expect(block).not.toMatch(/kpi\.id\b/)
  })
  it('Export Studio / Data Exchange mobile cards show template/domain names, not raw job/template ids', async () => {
    const exp = await exportStudio()
    const dx = await dataExchangeStudio()
    expect(exp).toContain('h.templateName')
    expect(dx).toContain('job.domain')
  })
})

// ════════════════════════════════════════════════════════════
// 11. No scope creep — no Firestore/permission/calculation change
// ════════════════════════════════════════════════════════════
describe('PR-1E4 — no scope creep', () => {
  it('no new Firestore collection literal introduced in any touched page', async () => {
    for (const loader of [kpiRegistryTable, exportStudio, evaluationRun, auditLogs, dataExchangeStudio, dynamicKpiShadow, targetsPage, personalTargets, importCenter]) {
      const s = await loader()
      expect(s).not.toMatch(/collection\(\s*db,\s*['"][a-zA-Z_]+['"]\s*\)/)
    }
  })
  it('Evaluation Run does not gain a new evaluation formula (runEvaluationForUserMonth call unchanged)', async () => {
    const s = await evaluationRun()
    expect(s).toContain('runEvaluationForUserMonth')
  })
})
