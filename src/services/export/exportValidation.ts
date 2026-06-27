// ============================================================
// Export Studio — Pre-Download Validation (DX-10)
//
// Runs against an already-built ExportDataset, before any file is
// written. If validation fails with a blocking issue, the caller
// must not call the download service — see exportDownloadService.ts.
// ============================================================
import type { ExportDataset, ExportValidationIssue, ExportValidationResult } from './exportTypes'
import { EXPORT_LIMITS } from './exportLimits'

const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/

function checkWorksheetNames(dataset: ExportDataset): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  const allSheets = [...dataset.sheets, ...(dataset.rawData ? [dataset.rawData] : []), { sheetName: 'Definitions', columns: [], rows: [] }]
  const seen = new Set<string>()
  for (const sheet of allSheets) {
    if (sheet.sheetName.length === 0 || sheet.sheetName.length > 31) {
      issues.push({ code: 'INVALID_WORKSHEET_NAME', message: `Worksheet name "${sheet.sheetName}" must be 1-31 characters.`, blocking: true })
    }
    if (INVALID_SHEET_NAME_CHARS.test(sheet.sheetName)) {
      issues.push({ code: 'INVALID_WORKSHEET_NAME', message: `Worksheet name "${sheet.sheetName}" contains a character Excel does not allow (: \\ / ? * [ ]).`, blocking: true })
    }
    const key = sheet.sheetName.toLowerCase()
    if (seen.has(key)) {
      issues.push({ code: 'DUPLICATE_WORKSHEET_NAME', message: `Worksheet name "${sheet.sheetName}" is used more than once.`, blocking: true })
    }
    seen.add(key)
  }
  return issues
}

function checkDuplicateHeaders(dataset: ExportDataset): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  for (const sheet of [...dataset.sheets, ...(dataset.rawData ? [dataset.rawData] : [])]) {
    const headers = sheet.columns.map((c) => c.header.toLowerCase())
    const dupes = headers.filter((h, i) => headers.indexOf(h) !== i)
    if (dupes.length > 0) {
      issues.push({ code: 'DUPLICATE_HEADER', message: `Sheet "${sheet.sheetName}" has duplicate column headers: ${[...new Set(dupes)].join(', ')}.`, blocking: true })
    }
  }
  return issues
}

function checkRowCounts(dataset: ExportDataset): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  const actual = dataset.sheets.reduce((sum, s) => sum + s.rows.length, 0) + (dataset.rawData?.rows.length ?? 0)
  if (actual !== dataset.meta.rowCount) {
    issues.push({
      code: 'ROW_COUNT_MISMATCH',
      message: `Dataset metadata reports ${dataset.meta.rowCount} rows but sheets contain ${actual}.`,
      blocking: true,
    })
  }
  return issues
}

function checkPerformanceLimits(dataset: ExportDataset): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  for (const sheet of [...dataset.sheets, ...(dataset.rawData ? [dataset.rawData] : [])]) {
    if (sheet.rows.length > EXPORT_LIMITS.maxRowsPerSheet) {
      issues.push({
        code: 'ROW_LIMIT_EXCEEDED',
        message: `Sheet "${sheet.sheetName}" has ${sheet.rows.length} rows, exceeding the ${EXPORT_LIMITS.maxRowsPerSheet}-row limit per sheet. Narrow the export scope.`,
        blocking: true,
      })
    }
  }
  if (dataset.meta.rowCount > EXPORT_LIMITS.maxWorkbookRows) {
    issues.push({
      code: 'WORKBOOK_LIMIT_EXCEEDED',
      message: `This workbook would contain ${dataset.meta.rowCount} rows, exceeding the ${EXPORT_LIMITS.maxWorkbookRows}-row workbook limit. Narrow the export scope.`,
      blocking: true,
    })
  }
  return issues
}

function checkRequiredMetadata(dataset: ExportDataset): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  if (!dataset.meta.scopeLabel) issues.push({ code: 'MISSING_SCOPE_LABEL', message: 'Export scope label is missing.', blocking: true })
  if (!dataset.meta.periodLabel) issues.push({ code: 'MISSING_PERIOD_LABEL', message: 'Export period label is missing.', blocking: true })
  if (!dataset.meta.generatedBy) issues.push({ code: 'MISSING_GENERATED_BY', message: 'Generated-by actor is missing.', blocking: true })
  return issues
}

function checkEmptyDataset(dataset: ExportDataset): ExportValidationIssue[] {
  const totalRows = dataset.sheets.reduce((sum, s) => sum + s.rows.length, 0)
  if (totalRows === 0) {
    return [{ code: 'EMPTY_DATASET', message: 'No rows matched this export selection. The workbook will contain headers and Definitions only.', blocking: false }]
  }
  return []
}

export function validateExportDataset(dataset: ExportDataset): ExportValidationResult {
  const issues: ExportValidationIssue[] = [
    ...checkWorksheetNames(dataset),
    ...checkDuplicateHeaders(dataset),
    ...checkRowCounts(dataset),
    ...checkPerformanceLimits(dataset),
    ...checkRequiredMetadata(dataset),
    ...checkEmptyDataset(dataset),
  ]
  return {
    valid: issues.every((i) => !i.blocking),
    issues,
  }
}
