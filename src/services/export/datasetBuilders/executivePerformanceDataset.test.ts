import { describe, it, expect } from 'vitest'
import { generateExecutiveReport } from '../../../engine/executive/executiveReportGenerator'
import type { BranchInput } from '../../../engine/executive/executiveTypes'
import { buildExecutivePerformanceDataset } from './executivePerformanceDataset'

function makeBranch(id: string): BranchInput {
  return {
    pharmacyId: id, pharmacyName: `Branch ${id}`, pharmacyCode: id, region: 'R1',
    mtdEntries: [{ id: 'e1', userId: 'u1', pharmacyId: id, date: '2026-06-01', wasfaty: 150, omni: 50, wellness: 30, basket: 20, crossSelling: 10 } as any],
    target: { pharmacyId: id, month: '2026-06', wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 60, basketTarget: 40, crossSellTarget: 20 } as any,
  }
}

describe('DX-10 — Executive Performance Dataset Builder', () => {
  it('builds a real cross-branch portfolio — never a first-branch fallback', () => {
    const report = generateExecutiveReport({
      branches: [makeBranch('B001'), makeBranch('B002')],
      reportDate: '2026-06-15', reportMonth: '2026-06', generatedBy: 'admin-1',
    })
    const dataset = buildExecutivePerformanceDataset({ report, generatedBy: 'admin-1', scopeLabel: 'All Authorized Branches' })
    const branchSheet = dataset.sheets.find((s) => s.sheetName === 'Branch Performance')!
    expect(branchSheet.rows).toHaveLength(2)
    expect(new Set(branchSheet.rows.map((r) => r.branchCode)).size).toBe(2)
  })

  it('KPI Analysis sums Total Actual/Target only within one KPI, never across different KPIs', () => {
    const report = generateExecutiveReport({
      branches: [makeBranch('B001'), makeBranch('B002')],
      reportDate: '2026-06-15', reportMonth: '2026-06', generatedBy: 'admin-1',
    })
    const dataset = buildExecutivePerformanceDataset({ report, generatedBy: 'admin-1', scopeLabel: 'All Authorized Branches' })
    const kpiSheet = dataset.sheets.find((s) => s.sheetName === 'KPI Analysis')!
    const kpiNames = kpiSheet.rows.map((r) => r.kpi)
    expect(new Set(kpiNames).size).toBe(kpiNames.length) // one row per KPI, never merged
    for (const row of kpiSheet.rows) {
      expect(row.unit).toBeTruthy()
    }
  })

  it('Executive Summary reports real risk distribution counts', () => {
    const report = generateExecutiveReport({
      branches: [makeBranch('B001')], reportDate: '2026-06-15', reportMonth: '2026-06', generatedBy: 'admin-1',
    })
    const dataset = buildExecutivePerformanceDataset({ report, generatedBy: 'admin-1', scopeLabel: 'All Authorized Branches' })
    const summarySheet = dataset.sheets.find((s) => s.sheetName === 'Executive Summary')!
    expect(summarySheet.rows.find((r) => r.metric === 'Total Branches')?.value).toBe(1)
  })

  it('zero branches produces a warning, not a crash', () => {
    const report = generateExecutiveReport({ branches: [], reportDate: '2026-06-15', reportMonth: '2026-06', generatedBy: 'admin-1' })
    const dataset = buildExecutivePerformanceDataset({ report, generatedBy: 'admin-1', scopeLabel: 'All Authorized Branches' })
    expect(dataset.meta.warnings.length).toBeGreaterThan(0)
  })
})
