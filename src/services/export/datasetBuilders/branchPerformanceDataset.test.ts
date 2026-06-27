import { describe, it, expect } from 'vitest'
import { generateBranchSummary } from '../../../engine/executive/executiveReportGenerator'
import type { BranchInput } from '../../../engine/executive/executiveTypes'
import { buildBranchPerformanceDataset } from './branchPerformanceDataset'

function makeBranch(id: string, overrides: Partial<BranchInput> = {}): BranchInput {
  return {
    pharmacyId: id,
    pharmacyName: `Branch ${id}`,
    pharmacyCode: id,
    region: 'R1',
    mtdEntries: [
      { id: 'e1', userId: 'u1', pharmacyId: id, date: '2026-06-01', wasfaty: 100, omni: 50, wellness: 30, basket: 20, crossSelling: 10 } as any,
    ],
    target: { pharmacyId: id, month: '2026-06', wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 60, basketTarget: 40, crossSellTarget: 20 } as any,
    ...overrides,
  }
}

describe('DX-10 — Branch Performance Dataset Builder', () => {
  it('builds Branch Summary, KPI Performance, and Targets vs Actuals sheets from real branch summaries', () => {
    const summary = generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')
    const dataset = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06' })

    const sheetNames = dataset.sheets.map((s) => s.sheetName)
    expect(sheetNames).toEqual(['Branch Summary', 'KPI Performance', 'Targets vs Actuals'])
    expect(dataset.sheets[0].rows).toHaveLength(1)
    expect(dataset.sheets[1].rows.length).toBeGreaterThan(0)
  })

  it('every KPI Performance row carries its own unit — never a cross-KPI mixed total', () => {
    const summary = generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')
    const dataset = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06' })
    const kpiSheet = dataset.sheets.find((s) => s.sheetName === 'KPI Performance')!
    for (const row of kpiSheet.rows) {
      expect(row.unit).toBeTruthy()
    }
    // basket is SAR (currency-equivalent), others are counts — never summed together anywhere in this sheet.
    const units = new Set(kpiSheet.rows.map((r) => r.unit))
    expect(units.size).toBeGreaterThan(1)
  })

  it('Gap is null (not a false zero) when a branch has no target for a KPI', () => {
    const branchNoTarget = makeBranch('B002', { target: null })
    const summary = generateBranchSummary(branchNoTarget, '2026-06-15', '2026-06')
    const dataset = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06' })
    const targetsSheet = dataset.sheets.find((s) => s.sheetName === 'Targets vs Actuals')!
    for (const row of targetsSheet.rows) {
      expect(row.gap).toBeNull()
      expect(row.gapBasis).toMatch(/no target set/)
    }
  })

  it('includeRawData adds a Raw Data sheet; omitting it leaves rawData undefined', () => {
    const summary = generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')
    const withRaw = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06', includeRawData: true })
    const withoutRaw = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06', includeRawData: false })
    expect(withRaw.rawData?.sheetName).toBe('Raw Data')
    expect(withoutRaw.rawData).toBeUndefined()
  })

  it('zero branches produces a warning, not a crash', () => {
    const dataset = buildBranchPerformanceDataset({ branches: [], generatedBy: 'admin-1', periodLabel: '2026-06' })
    expect(dataset.meta.warnings.length).toBeGreaterThan(0)
    expect(dataset.meta.rowCount).toBe(0)
  })

  it('Definitions sheet is always present with formula/unit/exclusions columns', () => {
    const summary = generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')
    const dataset = buildBranchPerformanceDataset({ branches: [summary], generatedBy: 'admin-1', periodLabel: '2026-06' })
    expect(dataset.definitions.length).toBeGreaterThan(0)
    for (const d of dataset.definitions) {
      expect(d.formula).toBeTruthy()
      expect(d.unit).toBeTruthy()
    }
  })
})
