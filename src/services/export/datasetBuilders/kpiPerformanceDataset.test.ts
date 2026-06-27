import { describe, it, expect } from 'vitest'
import { generateBranchSummary } from '../../../engine/executive/executiveReportGenerator'
import type { BranchInput } from '../../../engine/executive/executiveTypes'
import { buildKpiPerformanceDataset } from './kpiPerformanceDataset'

function makeBranch(id: string): BranchInput {
  return {
    pharmacyId: id, pharmacyName: `Branch ${id}`, pharmacyCode: id, region: 'R1',
    mtdEntries: [{ id: 'e1', userId: 'u1', pharmacyId: id, date: '2026-06-01', wasfaty: 150, omni: 50, wellness: 30, basket: 20, crossSelling: 10 } as any],
    target: { pharmacyId: id, month: '2026-06', wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 60, basketTarget: 40, crossSellTarget: 20 } as any,
  }
}

describe('DX-10 — KPI Performance Dataset Builder', () => {
  it('is scoped to exactly one KPI — every Branch Comparison row shares the same unit', () => {
    const summaries = [generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06'), generateBranchSummary(makeBranch('B002'), '2026-06-15', '2026-06')]
    const dataset = buildKpiPerformanceDataset({ branches: summaries, kpiKey: 'wasfaty', generatedBy: 'admin-1', periodLabel: '2026-06' })
    const comparison = dataset.sheets.find((s) => s.sheetName === 'Branch Comparison')!
    const units = new Set(comparison.rows.map((r) => r.unit))
    expect(units.size).toBe(1)
    expect(comparison.rows).toHaveLength(2)
  })

  it('KPI Summary reports the average achievement across branches for that one KPI', () => {
    const summaries = [generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')]
    const dataset = buildKpiPerformanceDataset({ branches: summaries, kpiKey: 'wasfaty', generatedBy: 'admin-1', periodLabel: '2026-06' })
    const summarySheet = dataset.sheets.find((s) => s.sheetName === 'KPI Summary')!
    expect(summarySheet.rows[0].branchCount).toBe(1)
    expect(typeof summarySheet.rows[0].avgAchievementPct).toBe('number')
  })

  it('a KPI with no matching breakdown for a branch is simply omitted from Branch Comparison, never a fabricated zero row', () => {
    const summaries = [generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')]
    const dataset = buildKpiPerformanceDataset({ branches: summaries, kpiKey: 'doesNotExist', generatedBy: 'admin-1', periodLabel: '2026-06' })
    const comparison = dataset.sheets.find((s) => s.sheetName === 'Branch Comparison')!
    expect(comparison.rows).toHaveLength(0)
    expect(dataset.meta.warnings.length).toBeGreaterThan(0)
  })

  it('Definitions sheet describes exactly this one KPI', () => {
    const summaries = [generateBranchSummary(makeBranch('B001'), '2026-06-15', '2026-06')]
    const dataset = buildKpiPerformanceDataset({ branches: summaries, kpiKey: 'wasfaty', generatedBy: 'admin-1', periodLabel: '2026-06' })
    expect(dataset.definitions).toHaveLength(1)
    expect(dataset.definitions[0].metric).toBe('Wasfaty')
  })
})
