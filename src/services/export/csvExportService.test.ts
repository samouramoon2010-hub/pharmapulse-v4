import { describe, it, expect } from 'vitest'
import { buildCsv } from './csvExportService'
import type { ExportSheetData } from './exportTypes'

const SHEET: ExportSheetData = {
  sheetName: 'Branch Summary',
  columns: [
    { key: 'name', header: 'Branch Name', unit: 'number', numeric: false },
    { key: 'ach', header: 'Achievement %', unit: 'percentage', numeric: true },
  ],
  rows: [
    { name: 'مدينة الرياض', ach: 87.5 },
    { name: 'Branch, with comma', ach: null },
  ],
}

describe('DX-10 — CSV Export Service', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildCsv(SHEET)
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('header row matches the sheet\'s column order deterministically', () => {
    const csv = buildCsv(SHEET)
    const firstLine = csv.slice(1).split('\r\n')[0]
    expect(firstLine).toBe('Branch Name,Achievement %')
  })

  it('preserves Arabic text without mangling', () => {
    const csv = buildCsv(SHEET)
    expect(csv).toContain('مدينة الرياض')
  })

  it('quotes and escapes a value containing a comma', () => {
    const csv = buildCsv(SHEET)
    expect(csv).toContain('"Branch, with comma"')
  })

  it('a null value renders as an empty cell, never the string "null"', () => {
    const csv = buildCsv(SHEET)
    expect(csv).not.toContain('null')
  })

  it('column order is always the sheet.columns order, never object key insertion order', () => {
    const reordered: ExportSheetData = { ...SHEET, rows: [{ ach: 1, name: 'z' }] }
    const csv = buildCsv(reordered)
    const dataLine = csv.slice(1).split('\r\n')[1]
    expect(dataLine.startsWith('z,')).toBe(true)
  })
})
