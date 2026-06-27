// ============================================================
// Export Studio — KPI Performance Dataset Builder (DX-10)
//
// Scoped to exactly ONE KPI across branches — by construction every
// value in this workbook shares the same unit, so there is no
// mixed-unit aggregation risk to guard against here (unlike a
// multi-KPI branch comparison).
// ============================================================
import type { BranchExecutiveSummary } from '../../../engine/executive/executiveTypes'
import { getKpiMetaForKey } from '../../../engine/kpiAnalyticsEngine'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ExportDataset, ExportSheetData, ExportDefinitionRow } from '../exportTypes'

export interface KpiPerformanceDatasetParams {
  branches: BranchExecutiveSummary[]
  kpiKey: string
  registry?: KpiRegistry
  generatedBy: string
  periodLabel: string
  generatedAt?: string
}

function buildKpiSummarySheet(kpiKey: string, registry: KpiRegistry | undefined, branchRows: Array<{ actual: number; target: number; achievementPct: number }>): ExportSheetData {
  const meta = getKpiMetaForKey(kpiKey, registry)
  const avgAch = branchRows.length
    ? Math.round(branchRows.reduce((s, r) => s + r.achievementPct, 0) / branchRows.length)
    : 0
  return {
    sheetName: 'KPI Summary',
    columns: [
      { key: 'kpi', header: 'KPI', unit: 'number', numeric: false },
      { key: 'unit', header: 'Unit', unit: 'number', numeric: false },
      { key: 'branchCount', header: 'Branch Count', unit: 'count', numeric: true },
      { key: 'avgAchievementPct', header: 'Average Achievement %', unit: 'percentage', numeric: true },
    ],
    rows: [{ kpi: meta.en, unit: meta.unit, branchCount: branchRows.length, avgAchievementPct: avgAch }],
  }
}

function buildBranchComparisonSheet(branches: BranchExecutiveSummary[], kpiKey: string, registry?: KpiRegistry): ExportSheetData {
  const meta = getKpiMetaForKey(kpiKey, registry)
  const rows: Array<Record<string, string | number | null>> = []
  for (const b of branches) {
    const kpi = b.score.kpiBreakdown.find((k) => k.kpiKey === kpiKey)
    if (!kpi) continue
    rows.push({
      branchCode: b.pharmacyCode,
      branchName: b.pharmacyName,
      unit: meta.unit,
      actual: kpi.actual,
      target: kpi.target,
      achievementPct: kpi.achievementPct,
      status: kpi.status,
    })
  }
  return {
    sheetName: 'Branch Comparison',
    columns: [
      { key: 'branchCode', header: 'Branch Code', unit: 'number', numeric: false },
      { key: 'branchName', header: 'Branch Name', unit: 'number', numeric: false },
      { key: 'unit', header: 'Unit', unit: 'number', numeric: false },
      { key: 'actual', header: 'Actual', unit: 'number', numeric: true },
      { key: 'target', header: 'Target', unit: 'number', numeric: true },
      { key: 'achievementPct', header: 'Achievement %', unit: 'percentage', numeric: true },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
    ],
    rows,
    notes: [`Every row is the single KPI "${meta.en}" (${meta.unit}) — no cross-KPI aggregation in this workbook.`],
  }
}

function definitions(kpiKey: string, registry?: KpiRegistry): ExportDefinitionRow[] {
  const meta = getKpiMetaForKey(kpiKey, registry)
  return [{
    metric: meta.en, definition: `Actual vs. target for ${meta.en}, measured in ${meta.unit}.`,
    formula: 'achievementPct = (actual / target) * 100, when target > 0',
    unit: meta.unit, source: 'generateBranchSummary() per-branch KPI breakdown',
    exclusions: 'Archived/inactive KPIs are excluded upstream by the registry.',
    capBehavior: 'Not capped — values above 100% achievement are shown as-is.',
    missingTargetBehavior: 'A branch with no target for this KPI shows achievementPct as 0, not blank — target is required for this KPI to appear in Branch Comparison.',
    rankingScope: 'N/A — this workbook is not a ranking.', periodLogic: 'Current month-to-date, per the selected month.',
    notes: 'Scoped to exactly one KPI by design — see template description.',
  }]
}

export function buildKpiPerformanceDataset(params: KpiPerformanceDatasetParams): ExportDataset {
  const { branches, kpiKey, registry, generatedBy, periodLabel, generatedAt = new Date().toISOString() } = params
  const comparisonSheet = buildBranchComparisonSheet(branches, kpiKey, registry)
  const summarySheet = buildKpiSummarySheet(kpiKey, registry, comparisonSheet.rows as unknown as Array<{ actual: number; target: number; achievementPct: number }>)
  const sheets = [summarySheet, comparisonSheet]
  const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0)
  const meta = getKpiMetaForKey(kpiKey, registry)

  return {
    meta: {
      templateId: 'kpi-performance',
      templateName: 'KPI Performance Workbook',
      workbookVersion: '1.0',
      scopeLabel: `${meta.en} across ${branches.length} branches`,
      periodLabel,
      generatedAt,
      generatedBy,
      rowCount,
      warnings: comparisonSheet.rows.length === 0 ? [`No branches have data for KPI "${meta.en}" in this selection.`] : [],
    },
    sheets,
    definitions: definitions(kpiKey, registry),
  }
}
