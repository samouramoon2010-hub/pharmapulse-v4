// ============================================================
// Export Studio — Branch Performance Dataset Builder (DX-10)
//
// Pure function. Takes already-computed BranchExecutiveSummary[]
// (built by the real, registry-aware generateBranchSummary() in
// src/engine/executive/executiveReportGenerator.ts — never a second
// KPI calculation engine) and produces an ExportDataset.
//
// Per-KPI rows always carry their own unit (via getKpiMetaForKey) —
// achievement % and raw actual/target values are never summed across
// KPIs with different units.
// ============================================================
import type { BranchExecutiveSummary } from '../../../engine/executive/executiveTypes'
import { getKpiMetaForKey } from '../../../engine/kpiAnalyticsEngine'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ExportDataset, ExportSheetData, ExportDefinitionRow } from '../exportTypes'

export interface BranchPerformanceDatasetParams {
  branches: BranchExecutiveSummary[]
  registry?: KpiRegistry
  generatedBy: string
  periodLabel: string
  generatedAt?: string
  includeRawData?: boolean
}

function buildSummarySheet(branches: BranchExecutiveSummary[]): ExportSheetData {
  return {
    sheetName: 'Branch Summary',
    columns: [
      { key: 'branchCode', header: 'Branch Code', unit: 'number', numeric: false },
      { key: 'branchName', header: 'Branch Name', unit: 'number', numeric: false },
      { key: 'region', header: 'Region', unit: 'number', numeric: false },
      { key: 'overallAchPct', header: 'Overall Achievement %', unit: 'percentage', numeric: true },
      { key: 'grade', header: 'Grade', unit: 'number', numeric: false },
      { key: 'riskLevel', header: 'Risk Level', unit: 'number', numeric: false },
    ],
    rows: branches.map((b) => ({
      branchCode: b.pharmacyCode,
      branchName: b.pharmacyName,
      region: b.region,
      overallAchPct: b.overallAchPct,
      grade: b.score.grade,
      riskLevel: b.riskProfile.riskLevel,
    })),
  }
}

function buildKpiPerformanceSheet(branches: BranchExecutiveSummary[], registry?: KpiRegistry): ExportSheetData {
  const rows: Array<Record<string, string | number | null>> = []
  for (const b of branches) {
    for (const kpi of b.score.kpiBreakdown) {
      const meta = getKpiMetaForKey(kpi.kpiKey, registry)
      rows.push({
        branchCode: b.pharmacyCode,
        branchName: b.pharmacyName,
        kpi: meta.en,
        unit: meta.unit,
        actual: kpi.actual,
        target: kpi.target,
        achievementPct: kpi.achievementPct,
        status: kpi.status,
      })
    }
  }
  return {
    sheetName: 'KPI Performance',
    columns: [
      { key: 'branchCode', header: 'Branch Code', unit: 'number', numeric: false },
      { key: 'branchName', header: 'Branch Name', unit: 'number', numeric: false },
      { key: 'kpi', header: 'KPI', unit: 'number', numeric: false },
      { key: 'unit', header: 'Unit', unit: 'number', numeric: false },
      { key: 'actual', header: 'Actual', unit: 'number', numeric: true },
      { key: 'target', header: 'Target', unit: 'number', numeric: true },
      { key: 'achievementPct', header: 'Achievement %', unit: 'percentage', numeric: true },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
    ],
    rows,
    notes: ['One row per branch × KPI. Actual/Target/Achievement are never summed across different KPIs — each row carries its own Unit column.'],
  }
}

function buildTargetsVsActualsSheet(branches: BranchExecutiveSummary[], registry?: KpiRegistry): ExportSheetData {
  const rows: Array<Record<string, string | number | null>> = []
  for (const b of branches) {
    for (const kpi of b.score.kpiBreakdown) {
      const meta = getKpiMetaForKey(kpi.kpiKey, registry)
      const gap = kpi.target > 0 ? kpi.actual - kpi.target : null
      rows.push({
        branchCode: b.pharmacyCode,
        kpi: meta.en,
        unit: meta.unit,
        target: kpi.target,
        actual: kpi.actual,
        gap,
        gapBasis: kpi.target > 0 ? 'target set' : 'no target set — gap not computed',
      })
    }
  }
  return {
    sheetName: 'Targets vs Actuals',
    columns: [
      { key: 'branchCode', header: 'Branch Code', unit: 'number', numeric: false },
      { key: 'kpi', header: 'KPI', unit: 'number', numeric: false },
      { key: 'unit', header: 'Unit', unit: 'number', numeric: false },
      { key: 'target', header: 'Target', unit: 'number', numeric: true },
      { key: 'actual', header: 'Actual', unit: 'number', numeric: true },
      { key: 'gap', header: 'Gap (Actual − Target)', unit: 'number', numeric: true },
      { key: 'gapBasis', header: 'Gap Basis', unit: 'number', numeric: false },
    ],
    rows,
    notes: ['Gap is null (never silently 0) when no target was set for that branch/KPI/month — see Gap Basis column.'],
  }
}

const DEFINITIONS: ExportDefinitionRow[] = [
  {
    metric: 'Overall Achievement %', definition: 'Weighted average of per-KPI achievement %, weighted by each KPI\'s registry weight.',
    formula: 'sum(achievementPct_k * weight_k) for each KPI k', unit: '%', source: 'generateBranchSummary()',
    exclusions: 'Archived/inactive KPIs excluded by the registry before this calculation runs.', capBehavior: 'Not capped at 100% — see executiveScore.ts',
    missingTargetBehavior: 'A KPI with no target contributes 0 to achievement for that KPI.', rankingScope: 'N/A (single branch)',
    periodLogic: 'Current month-to-date, per the selected month.', notes: 'Never a raw sum of mixed-unit KPI values.',
  },
  {
    metric: 'Gap', definition: 'Actual minus Target, in the KPI\'s own unit.', formula: 'actual - target',
    unit: 'same as KPI', source: 'Derived', exclusions: 'N/A', capBehavior: 'N/A',
    missingTargetBehavior: 'Left blank (null) rather than computed as a false zero-target gap.', rankingScope: 'N/A',
    periodLogic: 'Same period as Actual.', notes: 'Never summed across KPIs of different units.',
  },
]

export function buildBranchPerformanceDataset(params: BranchPerformanceDatasetParams): ExportDataset {
  const { branches, registry, generatedBy, periodLabel, generatedAt = new Date().toISOString(), includeRawData = false } = params
  const sheets = [
    buildSummarySheet(branches),
    buildKpiPerformanceSheet(branches, registry),
    buildTargetsVsActualsSheet(branches, registry),
  ]
  const rawData = includeRawData
    ? { ...buildKpiPerformanceSheet(branches, registry), sheetName: 'Raw Data', notes: ['Same branch × KPI rows backing the KPI Performance sheet, marked as raw operational data for downstream tooling.'] }
    : undefined
  const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0) + (rawData?.rows.length ?? 0)

  return {
    meta: {
      templateId: 'branch-performance',
      templateName: 'Branch Performance Workbook',
      workbookVersion: '1.0',
      scopeLabel: branches.length === 1 ? branches[0].pharmacyName : `${branches.length} branches`,
      periodLabel,
      generatedAt,
      generatedBy,
      rowCount,
      warnings: branches.length === 0 ? ['No authorized branch data found for this selection.'] : [],
    },
    sheets,
    rawData,
    definitions: DEFINITIONS,
  }
}
