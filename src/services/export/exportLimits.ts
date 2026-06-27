// ============================================================
// Export Studio — Centralized Performance Limits (DX-10)
//
// Untested numbers are not claimed here. These mirror the same
// order of magnitude already measured for Data Exchange's large-file
// engine (DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md, 2,000-row practical
// ceiling) — Export Studio reads already-materialized, already-
// aggregated data (per-branch/per-KPI summaries), not raw row-by-row
// adapters, so its row ceiling is the same order of magnitude, not a
// proven higher one.
// ============================================================
import type { ExportLimits } from './exportTypes'

export const EXPORT_LIMITS: ExportLimits = {
  maxRowsPerSheet: 2000,
  maxWorkbookRows: 8000,
  maxBranches: 500,
  maxPharmacists: 2000,
  maxDateRangeDays: 366,
  previewRowCount: 25,
}

export function exceedsRowLimit(rowCount: number): boolean {
  return rowCount > EXPORT_LIMITS.maxRowsPerSheet
}

export function exceedsWorkbookLimit(totalRows: number): boolean {
  return totalRows > EXPORT_LIMITS.maxWorkbookRows
}
