// ============================================================
// Export Studio — Template Registry (DX-10)
//
// Centralized catalog. UI components must read from here, never
// hardcode per-page export logic. An "unavailableReason" is the
// honest alternative to shipping a guessed/incorrect calculation —
// see DX10_EXPORT_STUDIO_CLOSURE.md for why Pharmacist Performance
// and Evaluation Results are not in the initial catalog as available.
// ============================================================
import type { ExportTemplateDefinition, ExportTemplateId } from './exportTypes'

export const EXPORT_TEMPLATE_CATALOG: ExportTemplateDefinition[] = [
  {
    id: 'executive-performance',
    name: 'Executive Performance Workbook',
    description: 'Portfolio-wide executive summary across every branch the requester is authorized to see.',
    supportedRoles: ['admin', 'general_manager', 'regional_manager', 'district_supervisor'],
    supportedFormats: ['xlsx'],
    selectors: { required: ['month'], optional: ['branch', 'district', 'region', 'includeRawData'] },
    workbookVersion: '1.0',
    sheets: [
      { name: 'Executive Summary', description: 'Portfolio score, grade, risk distribution.', supported: true },
      { name: 'Branch Performance', description: 'Per-branch achievement %, grade, risk level.', supported: true },
      { name: 'KPI Analysis', description: 'Per-branch, per-KPI achievement breakdown (one row per branch×KPI, never summed across KPIs).', supported: true },
      { name: 'Risks & Opportunities', description: 'Risk flags and milestone/opportunity insights.', supported: true },
      { name: 'Raw Data', description: 'Branch-level KPI breakdown rows, optional.', supported: true },
      { name: 'Definitions', description: 'Metric definitions and formulas.', supported: true },
    ],
    requiredMetrics: ['overallAchPct', 'kpiBreakdown', 'riskLevel'],
    unavailableReason: null,
    knownLimitations: [
      'Rankings and Pharmacist Performance sheets are not included — see Pharmacist Performance Workbook status.',
      'Built from generateExecutiveReport() (registry-aware, no Core-only fallback) — never from the Reports page implementation flagged in REPORTS_CORRECTNESS_AUDIT.md.',
    ],
  },
  {
    id: 'branch-performance',
    name: 'Branch Performance Workbook',
    description: 'Deep-dive performance workbook for one or more specific branches.',
    supportedRoles: ['admin', 'general_manager', 'regional_manager', 'district_supervisor', 'branch_manager', 'manager'],
    supportedFormats: ['xlsx', 'csv'],
    selectors: { required: ['month', 'branch'], optional: ['includeRawData'] },
    workbookVersion: '1.0',
    sheets: [
      { name: 'Branch Summary', description: 'Score, grade, achievement %, risk level per branch.', supported: true },
      { name: 'KPI Performance', description: 'Per-KPI actual/target/achievement for the branch, one row per KPI.', supported: true },
      { name: 'Targets vs Actuals', description: 'Same data presented as Target/Actual/Gap, per KPI.', supported: true },
      { name: 'Raw Data', description: 'KPI entries backing the summary, optional.', supported: true },
      { name: 'Definitions', description: 'Metric definitions and formulas.', supported: true },
    ],
    requiredMetrics: ['score', 'kpiBreakdown', 'overallAchPct'],
    unavailableReason: null,
    knownLimitations: [
      'Pharmacist Contribution and Trend Analysis sheets are deferred — Pharmacist Performance Workbook is not yet available (see catalog entry).',
    ],
  },
  {
    id: 'pharmacist-performance',
    name: 'Pharmacist Performance Workbook',
    description: 'Per-pharmacist performance, targets, and ranking context.',
    supportedRoles: ['admin', 'general_manager', 'regional_manager', 'district_supervisor', 'branch_manager', 'manager'],
    supportedFormats: ['xlsx'],
    selectors: { required: ['month'], optional: ['branch', 'pharmacist'] },
    workbookVersion: '1.0',
    sheets: [],
    requiredMetrics: [],
    unavailableReason:
      'Pharmacist-level performance requires the evaluation ledger / ranking engine output (src/evaluationLedger, src/ranking), which was not verified safe to wire in this bundle without risking an incorrect or invented calculation. Blocked, not implemented.',
    knownLimitations: ['Not available in this catalog version — see unavailableReason.'],
  },
  {
    id: 'kpi-performance',
    name: 'KPI Performance Workbook',
    description: 'Single-KPI deep dive across branches — scoped to exactly one KPI, so every value shares one unit.',
    supportedRoles: ['admin', 'general_manager', 'regional_manager', 'district_supervisor', 'branch_manager', 'manager'],
    supportedFormats: ['xlsx', 'csv'],
    selectors: { required: ['month', 'kpi'], optional: ['branch', 'district', 'region', 'includeRawData'] },
    workbookVersion: '1.0',
    sheets: [
      { name: 'KPI Summary', description: 'KPI name, unit, direction, portfolio average achievement.', supported: true },
      { name: 'Branch Comparison', description: 'Per-branch actual/target/achievement for this one KPI only.', supported: true },
      { name: 'Raw Data', description: 'KPI entries for this KPI, optional.', supported: true },
      { name: 'Definitions', description: 'Metric definition and formula for this KPI.', supported: true },
    ],
    requiredMetrics: ['actual', 'target', 'achievementPct'],
    unavailableReason: null,
    knownLimitations: [
      'Pharmacist Comparison and Monthly Trend sheets are deferred to a future bundle.',
    ],
  },
  {
    id: 'evaluation-results',
    name: 'Evaluation Results Workbook',
    description: 'Weighted evaluation contributions, KPI breakdown, threshold/band results, ranking.',
    supportedRoles: ['admin', 'general_manager'],
    supportedFormats: ['xlsx'],
    selectors: { required: ['evaluationProfile'], optional: ['month', 'branch', 'pharmacist'] },
    workbookVersion: '1.0',
    sheets: [],
    requiredMetrics: [],
    unavailableReason:
      'Evaluation results require the evaluation pipeline / profile resolver output (src/engine/evaluationPipeline, src/profileStudio), which carries its own versioning and calculation-trace semantics that were not verified safe to re-export in this bundle. Blocked, not implemented.',
    knownLimitations: ['Not available in this catalog version — see unavailableReason.'],
  },
  {
    id: 'import-audit',
    name: 'Import Audit Workbook',
    description: 'Data Exchange import history — jobs, failed/retryable rows, domain summary, error categories.',
    supportedRoles: ['admin'],
    supportedFormats: ['xlsx', 'csv'],
    selectors: { required: [], optional: ['dateRange'] },
    workbookVersion: '1.0',
    sheets: [
      { name: 'Import Jobs', description: 'Recent import_jobs — date, domain, file, status, row counts.', supported: true },
      { name: 'Failed & Retryable Summary', description: 'Per-job committed/failed/remaining counts and retry-eligibility (PARTIAL Actuals jobs only) — job-level, not per-row.', supported: true },
      { name: 'Domain Summary', description: 'Job counts per import domain and status.', supported: true },
      { name: 'Definitions', description: 'Job-state definitions and retry-eligibility rules.', supported: true },
    ],
    requiredMetrics: ['status', 'rowCounts'],
    unavailableReason: null,
    knownLimitations: [
      'Reuses listRecentImportJobs() — limited to the same recent-job window as the Data Exchange Studio Import History section, not full historical archive.',
      'Failed-row error categories (DX-9 taxonomy) are per-row data not bulk-fetched by listRecentImportJobs() — this workbook reports at the job level only, not a per-row Error Categories breakdown.',
    ],
  },
]

export function getExportTemplate(id: ExportTemplateId): ExportTemplateDefinition | undefined {
  return EXPORT_TEMPLATE_CATALOG.find((t) => t.id === id)
}

export function getAvailableExportTemplates(): ExportTemplateDefinition[] {
  return EXPORT_TEMPLATE_CATALOG.filter((t) => t.unavailableReason === null)
}

export function isExportTemplateAvailable(id: ExportTemplateId): boolean {
  return getExportTemplate(id)?.unavailableReason == null
}

export function getExportTemplatesForRole(role: string): ExportTemplateDefinition[] {
  return EXPORT_TEMPLATE_CATALOG.filter((t) => t.supportedRoles.includes(role))
}
