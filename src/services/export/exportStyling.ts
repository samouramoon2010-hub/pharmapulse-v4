// ============================================================
// Export Studio — Styling Helpers (DX-10)
//
// Genuinely-supported SheetJS Community Edition features only:
// autofilter + column widths (verified by reading the writer source
// during DX-8). Frozen panes and in-cell data-validation dropdowns
// are NOT supported for writing in this library version — never
// claimed here. Number/percentage/date formats use cell-level `z`
// format strings, which the CE writer does support.
// ============================================================
import * as XLSX from 'xlsx'

export const NUMBER_FORMAT = '#,##0'
export const PERCENTAGE_FORMAT = '0.0%'
export const CURRENCY_FORMAT_SAR = '#,##0.00 "SAR"'
export const DATE_FORMAT = 'yyyy-mm-dd'

export function autoSizeColumns(headers: string[]): XLSX.ColInfo[] {
  return headers.map((h) => ({ wch: Math.max(14, h.length + 2) }))
}

export function applySheetQuality(sheet: XLSX.WorkSheet, headers: string[]): void {
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, headers.length - 1) } }) }
  sheet['!cols'] = autoSizeColumns(headers)
}

/** Applies a cell-level number format (`z`) to every data cell in a
 *  given column index (0-based), skipping the header row. */
export function applyColumnFormat(sheet: XLSX.WorkSheet, colIndex: number, rowCount: number, format: string): void {
  for (let r = 1; r <= rowCount; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: colIndex })
    const cell = sheet[addr]
    if (cell && typeof cell.v === 'number') {
      cell.z = format
    }
  }
}

export function formatForUnit(unit: string): string | null {
  if (unit === 'percentage') return PERCENTAGE_FORMAT
  if (unit === 'currency') return CURRENCY_FORMAT_SAR
  if (unit === 'count' || unit === 'number') return NUMBER_FORMAT
  return null
}
