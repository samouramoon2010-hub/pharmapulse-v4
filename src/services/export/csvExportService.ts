// ============================================================
// Export Studio — CSV Export Service (DX-10)
//
// Converts one ExportSheetData (a single flat table, already
// scope-filtered and unit-labeled by its dataset builder) into a
// UTF-8-with-BOM CSV string for Arabic-text compatibility in Excel.
// Deterministic column order (the sheet's own `columns` array order)
// — never re-sorted or re-derived from object key enumeration.
// ============================================================
import type { ExportSheetData } from './exportTypes'

const BOM = '﻿'

function escapeCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Builds a deterministic CSV string (with leading BOM) from one
 *  sheet. Column order always matches `sheet.columns`, never the
 *  insertion order of an individual row object. */
export function buildCsv(sheet: ExportSheetData): string {
  const headerLine = sheet.columns.map((c) => escapeCsvCell(c.header)).join(',')
  const lines = sheet.rows.map((row) =>
    sheet.columns.map((c) => escapeCsvCell(row[c.key])).join(','),
  )
  return BOM + [headerLine, ...lines].join('\r\n')
}

export function downloadCsv(sheet: ExportSheetData, fileName: string): void {
  const csv = buildCsv(sheet)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
