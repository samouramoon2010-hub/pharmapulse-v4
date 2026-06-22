// ============================================================
// Phase 3B — Reports+ (Supervisor)
//
// Verifies:
//   1.  Branch comparison uses filterAllowedPharmacies (scope-aware)
//   2.  branchSummary returns [] for single scope
//   3.  branchSummary computes totalActual per branch
//   4.  branchSummary computes totalTarget and gap per branch
//   5.  Top 5 section derived from branchSummary (slice 0,5)
//   6.  Bottom 5 section derived from branchSummary (slice -5)
//   7.  mtdTrend useMemo uses fetchedEntries (no new Firestore collection)
//   8.  mtdTrend computes previous month period (prevFrom)
//   9.  territorySummary returns null for non-list scope
//  10.  exportExcel function exists
//  11.  exportExcel uses branchSummary (scoped data only)
//  12.  exportReportPack function exists
//  13.  No KPI registry editor operations added (KpiEditorModal absent)
//  14.  No new supervisor dashboard route added (SupervisorReportsPage absent)
// ============================================================

import { describe, it, expect } from 'vitest'

const reportsSrc = () => import('./ReportsPage.jsx?raw').then((m) => m.default)
const appSrc     = () => import('../../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-4. branchSummary scope correctness + new fields
// ════════════════════════════════════════════════════════════

describe('3B ReportsPage — branchSummary scope', () => {
  it('branch comparison uses filterAllowedPharmacies (test 1)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const branchSummary = useMemo')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('filterAllowedPharmacies')
  })

  it('branchSummary returns [] for single scope (test 2)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const branchSummary = useMemo')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    expect(block).toContain("'single'")
    expect(block).toContain('return []')
  })

  it('branchSummary computes totalActual per branch (test 3)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const branchSummary = useMemo')
    expect(idx).toBeGreaterThan(-1)
    // Window 1500: useMemo body is large before totalActual (CRLF adds bytes)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('totalActual')
  })

  it('branchSummary computes totalTarget and gap per branch (test 4)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const branchSummary = useMemo')
    expect(idx).toBeGreaterThan(-1)
    // Window 1500: totalTarget and gap appear after totalActual
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('totalTarget')
    expect(block).toContain('gap')
  })
})

// ════════════════════════════════════════════════════════════
// 5-6. Top / Bottom 5 sections
// ════════════════════════════════════════════════════════════

describe('3B ReportsPage — Top / Bottom 5', () => {
  it('Top 5 section uses branchSummary.slice(0, 5) (test 5)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('slice(0, 5)')
  })

  it('Bottom 5 section uses branchSummary.slice(-5) (test 6)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('slice(-5)')
  })

  it('Top / Bottom sections gated on branchSummary.length > 1 (test 6b)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('branchSummary.length > 1')
  })
})

// ════════════════════════════════════════════════════════════
// 7-8. mtdTrend useMemo
// ════════════════════════════════════════════════════════════

describe('3B ReportsPage — mtdTrend', () => {
  it('mtdTrend useMemo uses fetchedEntries (no new collection) (test 7)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const mtdTrend = useMemo')
    expect(idx).toBeGreaterThan(-1)
    // Window 1200: date math is ~700 chars before fetchedEntries appears (CRLF adds bytes)
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('fetchedEntries')
  })

  it('mtdTrend computes previous month period (prevFrom) (test 8)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const mtdTrend = useMemo')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('prevFrom')
  })

  it('mtdTrend returns trend direction string (test 8b)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const mtdTrend = useMemo')
    expect(idx).toBeGreaterThan(-1)
    // Window 1200: trend strings appear after currTotal/prevTotal computations
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain("'improving'")
    expect(block).toContain("'declining'")
    expect(block).toContain("'neutral'")
  })
})

// ════════════════════════════════════════════════════════════
// 9. territorySummary — list scope guard
// ════════════════════════════════════════════════════════════

describe('3B ReportsPage — territorySummary', () => {
  it('territorySummary returns null for non-list scope (test 9)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const territorySummary = useMemo')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    expect(block).toContain("'list'")
    expect(block).toContain('return null')
  })

  it('Territory Summary Card only renders when territorySummary is truthy (test 9b)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('{territorySummary && (')
  })
})

// ════════════════════════════════════════════════════════════
// 10-12. Export functions
// ════════════════════════════════════════════════════════════

describe('3B ReportsPage — export functions', () => {
  it('exportExcel function exists (test 10)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('const exportExcel = (')
  })

  it('exportExcel uses branchSummary (scoped data only) (test 11)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const exportExcel = (')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('branchSummary')
  })

  it('exportExcel uses scoped data — does not use unscoped pharmacies list directly (test 11b)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const exportExcel = (')
    expect(idx).toBeGreaterThan(-1)
    // branchSummary is already scope-filtered; exportExcel should not bypass it
    const block = s.slice(idx, idx + 400)
    expect(block).not.toContain('pharmacies.map')
  })

  it('exportReportPack function exists (test 12)', async () => {
    const s = await reportsSrc()
    expect(s).toContain('const exportReportPack = (')
  })

  it('exportReportPack includes branch ranking section (test 12b)', async () => {
    const s = await reportsSrc()
    const idx = s.indexOf('const exportReportPack = (')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('BRANCH RANKING')
    expect(block).toContain('MTD TREND')
  })
})

// ════════════════════════════════════════════════════════════
// 13-14. Guardrails
// ════════════════════════════════════════════════════════════

describe('3B guardrails', () => {
  it('No KPI registry editor operations added to ReportsPage (test 13)', async () => {
    const s = await reportsSrc()
    expect(s).not.toContain('KpiEditorModal')
    expect(s).not.toContain('saveKpiRegistry')
    expect(s).not.toContain('deleteKpi')
  })

  it('No new supervisor dashboard route added to App.jsx (test 14)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('SupervisorReportsPage')
  })
})
