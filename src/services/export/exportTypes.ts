// ============================================================
// Export Studio — Domain Types & Request Contract (DX-10)
//
// A separate subsystem from Data Exchange (Import) Studio. Reuses
// shared scope/KPI/user/branch/evaluation/formatting contracts —
// never a second KPI calculation engine. See
// docs/export/EXPORT_STUDIO_ARCHITECTURE_V1.md.
// ============================================================

import type { PharmacyScope } from '../scopeResolver'

// ── Template catalog ──────────────────────────────────────────

export type ExportTemplateId =
  | 'executive-performance'
  | 'branch-performance'
  | 'pharmacist-performance'
  | 'kpi-performance'
  | 'evaluation-results'
  | 'import-audit'

export type ExportFormat = 'xlsx' | 'csv'

/** A unit-typed value — every numeric figure in an export must carry
 *  its own unit so the workbook/CSV builder can refuse to silently
 *  sum incompatible units. Mirrors KpiValueType from kpiRegistryTypes. */
export type ExportValueUnit = 'number' | 'currency' | 'percentage' | 'count' | 'ratio'

export interface ExportTemplateSelectors {
  /** Selectors the user MUST provide before a preview/generate is allowed. */
  required: Array<'dateRange' | 'month' | 'branch' | 'district' | 'region' | 'pharmacist' | 'kpi' | 'evaluationProfile'>
  /** Selectors the user MAY provide to narrow the export. */
  optional: Array<'dateRange' | 'month' | 'branch' | 'district' | 'region' | 'pharmacist' | 'kpi' | 'evaluationProfile' | 'includeRawData'>
}

export interface ExportSheetDefinition {
  name: string
  description: string
  /** True only when this sheet is backed by a real, validated data source today. */
  supported: boolean
}

export interface ExportTemplateDefinition {
  id: ExportTemplateId
  name: string
  description: string
  supportedRoles: string[]
  supportedFormats: ExportFormat[]
  selectors: ExportTemplateSelectors
  workbookVersion: string
  sheets: ExportSheetDefinition[]
  requiredMetrics: string[]
  /** Non-null only when this template cannot be safely produced yet —
   *  the UI must show this instead of a generate button. Never hide a
   *  known gap behind a silently-wrong calculation. */
  unavailableReason: string | null
  knownLimitations: string[]
}

// ── Export request / selection contract ──────────────────────

export interface ExportDateRange {
  /** "yyyy-MM-dd" */
  start: string
  /** "yyyy-MM-dd" */
  end: string
}

export interface ExportSelection {
  templateId: ExportTemplateId
  format: ExportFormat
  month?: string            // "yyyy-MM"
  dateRange?: ExportDateRange
  branchIds?: string[]
  districtIds?: string[]
  regionIds?: string[]
  pharmacistIds?: string[]
  kpiKey?: string
  evaluationProfileId?: string
  evaluationProfileVersion?: number
  includeRawData: boolean
}

export interface ExportRequestContext {
  selection: ExportSelection
  actorUid: string
  actorRole: string
  /** Resolved once by the caller via scopeResolver — never re-derived
   *  inside a dataset builder. */
  scope: PharmacyScope
}

// ── Dataset (builder output) ──────────────────────────────────

export interface ExportMetricColumn {
  key: string
  header: string
  unit: ExportValueUnit
  /** True when this column is a blank-vs-zero-sensitive numeric value. */
  numeric: boolean
}

export interface ExportSheetData {
  sheetName: string
  columns: ExportMetricColumn[]
  rows: Array<Record<string, string | number | null>>
  /** Free-text notes shown under the sheet's data (basis, caveats). */
  notes?: string[]
}

export interface ExportDefinitionRow {
  metric: string
  definition: string
  formula: string
  unit: string
  source: string
  exclusions: string
  capBehavior: string
  missingTargetBehavior: string
  rankingScope: string
  periodLogic: string
  notes: string
}

export interface ExportDatasetMeta {
  templateId: ExportTemplateId
  templateName: string
  workbookVersion: string
  scopeLabel: string
  periodLabel: string
  generatedAt: string
  generatedBy: string
  rowCount: number
  warnings: string[]
}

export interface ExportDataset {
  meta: ExportDatasetMeta
  sheets: ExportSheetData[]
  rawData?: ExportSheetData
  definitions: ExportDefinitionRow[]
}

// ── Validation ──────────────────────────────────────────────

export interface ExportValidationIssue {
  code: string
  message: string
  blocking: boolean
}

export interface ExportValidationResult {
  valid: boolean
  issues: ExportValidationIssue[]
}

// ── Audit ──────────────────────────────────────────────────

export type ExportAuditStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED'

export interface ExportAuditRecord {
  templateId: ExportTemplateId
  templateName: string
  actorUid: string
  actorRole: string
  scopeLabel: string
  format: ExportFormat
  generatedAt: string
  rowCount: number
  workbookVersion: string
  status: ExportAuditStatus
  failureCategory?: string
  fileName: string
}

// ── Performance limits (centralized — see exportLimits.ts) ────

export interface ExportLimits {
  maxRowsPerSheet: number
  maxWorkbookRows: number
  maxBranches: number
  maxPharmacists: number
  maxDateRangeDays: number
  previewRowCount: number
}
