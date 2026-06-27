// ============================================================
// Export Studio — Executive Performance Dataset Builder (DX-10)
//
// Pure function over an already-computed ExecutiveReport (built by
// generateExecutiveReport() — registry-aware, no Core-only fallback,
// the same engine useExecutiveReport.ts uses). Never built from
// ReportsPage.jsx, which carries the known "All Branches falls back
// to first branch" / mixed-unit-sum bugs documented in
// docs/deferred/REPORTS_CORRECTNESS_AUDIT.md.
//
// portfolioAch is keyed per-KPI (totalActual/totalTarget/achievementPct
// computed within that KPI only) — KPI Analysis rows are per-branch
// per-KPI, never a cross-KPI sum.
// ============================================================
import type { ExecutiveReport } from '../../../engine/executive/executiveTypes'
import { getKpiMetaForKey } from '../../../engine/kpiAnalyticsEngine'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ExportDataset, ExportSheetData, ExportDefinitionRow } from '../exportTypes'

export interface ExecutivePerformanceDatasetParams {
  report: ExecutiveReport
  registry?: KpiRegistry
  generatedBy: string
  scopeLabel: string
  includeRawData?: boolean
}

function buildExecutiveSummarySheet(report: ExecutiveReport): ExportSheetData {
  return {
    sheetName: 'Executive Summary',
    columns: [
      { key: 'metric', header: 'Metric', unit: 'number', numeric: false },
      { key: 'value', header: 'Value', unit: 'number', numeric: false },
    ],
    rows: [
      { metric: 'Total Branches', value: report.totalBranches },
      { metric: 'Active Branches', value: report.activeBranches },
      { metric: 'Portfolio Score', value: report.portfolioScore },
      { metric: 'Portfolio Grade', value: report.portfolioGrade },
      { metric: 'On Track', value: report.riskDistribution.onTrack },
      { metric: 'Low Risk', value: report.riskDistribution.lowRisk },
      { metric: 'Medium Risk', value: report.riskDistribution.mediumRisk },
      { metric: 'High Risk', value: report.riskDistribution.highRisk },
    ],
  }
}

function buildBranchPerformanceSheet(report: ExecutiveReport): ExportSheetData {
  return {
    sheetName: 'Branch Performance',
    columns: [
      { key: 'branchCode', header: 'Branch Code', unit: 'number', numeric: false },
      { key: 'branchName', header: 'Branch Name', unit: 'number', numeric: false },
      { key: 'region', header: 'Region', unit: 'number', numeric: false },
      { key: 'overallAchPct', header: 'Overall Achievement %', unit: 'percentage', numeric: true },
      { key: 'grade', header: 'Grade', unit: 'number', numeric: false },
      { key: 'riskLevel', header: 'Risk Level', unit: 'number', numeric: false },
    ],
    rows: report.allBranches.map((b) => ({
      branchCode: b.pharmacyCode,
      branchName: b.pharmacyName,
      region: b.region,
      overallAchPct: b.overallAchPct,
      grade: b.score.grade,
      riskLevel: b.riskProfile.riskLevel,
    })),
  }
}

function buildKpiAnalysisSheet(report: ExecutiveReport, registry?: KpiRegistry): ExportSheetData {
  const rows = Object.entries(report.portfolioAch).map(([kpiKey, v]) => {
    const meta = getKpiMetaForKey(kpiKey, registry)
    return {
      kpi: meta.en,
      unit: meta.unit,
      totalActual: v.totalActual,
      totalTarget: v.totalTarget,
      achievementPct: v.achievementPct,
      status: v.status,
    }
  })
  return {
    sheetName: 'KPI Analysis',
    columns: [
      { key: 'kpi', header: 'KPI', unit: 'number', numeric: false },
      { key: 'unit', header: 'Unit', unit: 'number', numeric: false },
      { key: 'totalActual', header: 'Total Actual', unit: 'number', numeric: true },
      { key: 'totalTarget', header: 'Total Target', unit: 'number', numeric: true },
      { key: 'achievementPct', header: 'Achievement %', unit: 'percentage', numeric: true },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
    ],
    rows,
    notes: ['One row per KPI. Total Actual/Target are summed only WITHIN that one KPI across branches — never combined across different KPIs.'],
  }
}

function buildRisksOpportunitiesSheet(report: ExecutiveReport): ExportSheetData {
  return {
    sheetName: 'Risks & Opportunities',
    columns: [
      { key: 'type', header: 'Type', unit: 'number', numeric: false },
      { key: 'priority', header: 'Priority', unit: 'number', numeric: false },
      { key: 'title', header: 'Title', unit: 'number', numeric: false },
      { key: 'branchName', header: 'Branch', unit: 'number', numeric: false },
      { key: 'body', header: 'Detail', unit: 'number', numeric: false },
    ],
    rows: report.portfolioInsights.map((i) => ({
      type: i.type,
      priority: i.priority,
      title: i.title,
      branchName: i.pharmacyName ?? '',
      body: i.body,
    })),
  }
}

const DEFINITIONS: ExportDefinitionRow[] = [
  {
    metric: 'Portfolio Score', definition: 'Weighted average of every authorized branch\'s executive score.',
    formula: 'avg(branch.score.adjusted) across allBranches', unit: 'score 0-100', source: 'generateExecutiveReport()',
    exclusions: 'Branches outside the requester\'s scope are never included — see scopeResolver.ts.',
    capBehavior: 'N/A', missingTargetBehavior: 'A branch with no target for a KPI contributes 0 for that KPI only.',
    rankingScope: 'All authorized branches.', periodLogic: 'Current month-to-date, per the selected month.',
    notes: 'This is a real cross-branch aggregation, not a first-branch fallback — see REPORTS_CORRECTNESS_AUDIT.md for the bug this avoids.',
  },
  {
    metric: 'KPI Analysis — Total Actual/Target', definition: 'Sum of actual/target values for ONE KPI across all authorized branches.',
    formula: 'sum(branch.actual) for KPI k, sum(branch.target) for KPI k', unit: 'same as KPI', source: 'generateExecutiveReport().portfolioAch',
    exclusions: 'N/A', capBehavior: 'N/A', missingTargetBehavior: 'Branches with no target for that KPI contribute 0 to totalTarget.',
    rankingScope: 'N/A', periodLogic: 'Current month-to-date.', notes: 'Never summed across DIFFERENT KPIs — one row per KPI, each with its own unit.',
  },
]

export function buildExecutivePerformanceDataset(params: ExecutivePerformanceDatasetParams): ExportDataset {
  const { report, registry, generatedBy, scopeLabel, includeRawData = false } = params
  const sheets = [
    buildExecutiveSummarySheet(report),
    buildBranchPerformanceSheet(report),
    buildKpiAnalysisSheet(report, registry),
    buildRisksOpportunitiesSheet(report),
  ]
  const rawData = includeRawData
    ? { ...buildBranchPerformanceSheet(report), sheetName: 'Raw Data', notes: ['Per-branch summary rows backing this workbook, marked as raw operational data.'] }
    : undefined
  const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0) + (rawData?.rows.length ?? 0)

  return {
    meta: {
      templateId: 'executive-performance',
      templateName: 'Executive Performance Workbook',
      workbookVersion: '1.0',
      scopeLabel,
      periodLabel: report.reportMonth,
      generatedAt: report.generatedAt,
      generatedBy,
      rowCount,
      warnings: report.totalBranches === 0 ? ['No authorized branches found for this requester.'] : [],
    },
    sheets,
    rawData,
    definitions: DEFINITIONS,
  }
}
