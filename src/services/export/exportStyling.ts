// ============================================================
// Export Studio — Styling Helpers (DX-10, exceljs migration)
//
// Built on `exceljs` (not SheetJS Community Edition) specifically so
// exports can carry real styling: header fill/font colors, a frozen
// header row, autofilter, and per-column widths/number formats. The
// previous SheetJS-CE writer could not produce any of these — see
// git history for that version's documented limitations.
//
// Header brand color is a static hex constant, not a live CSS
// variable — export files are static documents independent of the
// viewer's in-app theme. Sourced from the 'corporate' preset
// (DEFAULT_THEME_ID in src/design/themeRegistry.ts), the app's
// default brand color, so the export always looks like PharmaPulse
// regardless of which theme the generating user has selected.
// ============================================================
import type ExcelJS from 'exceljs'

export const NUMBER_FORMAT = '#,##0'
// Percentage values arrive on the engine's 0-100 scale (achievementPct
// 87.5 means 87.5%). Excel's built-in '0.0%' format multiplies the
// stored value by 100 on display, which would render 87.5 as
// "8750.0%" — so the % sign is emitted as a literal instead.
export const PERCENTAGE_FORMAT = '0.0"%"'
export const CURRENCY_FORMAT_SAR = '#,##0.00 "SAR"'
export const DATE_FORMAT = 'yyyy-mm-dd'

export const HEADER_FILL_ARGB = 'FF1D4E89'
export const HEADER_FONT_ARGB = 'FFFFFFFF'

export function columnWidthFor(header: string): number {
  return Math.max(14, header.length + 2)
}

/** Applies the shared "data sheet" treatment: bold white-on-brand
 *  header row, frozen header row, autofilter, and auto-sized column
 *  widths. `headers` must be in the same order as the sheet's columns
 *  (row 1 is assumed to already contain them). */
export function applySheetQuality(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_ARGB } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } }
  })
  const lastColumn = Math.max(1, headers.length)
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastColumn } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  headers.forEach((h, idx) => {
    sheet.getColumn(idx + 1).width = columnWidthFor(h)
  })
}

/** Applies a cell-level number format (`numFmt`) to an entire data
 *  column (1-based internally; `colIndex` is 0-based to match the
 *  caller's column-array indexing). Header text is unaffected — numFmt
 *  only changes how numeric values render. */
export function applyColumnFormat(sheet: ExcelJS.Worksheet, colIndex: number, format: string): void {
  sheet.getColumn(colIndex + 1).numFmt = format
}

export function formatForUnit(unit: string): string | null {
  if (unit === 'percentage') return PERCENTAGE_FORMAT
  if (unit === 'currency') return CURRENCY_FORMAT_SAR
  if (unit === 'count' || unit === 'number') return NUMBER_FORMAT
  return null
}
