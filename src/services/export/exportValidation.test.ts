import { describe, it, expect } from 'vitest'
import { validateExportDataset } from './exportValidation'
import { EXPORT_LIMITS } from './exportLimits'
import type { ExportDataset } from './exportTypes'

function makeDataset(overrides: Partial<ExportDataset> = {}): ExportDataset {
  const sheet = {
    sheetName: 'Branch Summary',
    columns: [{ key: 'name', header: 'Name', unit: 'number' as const, numeric: false }],
    rows: [{ name: 'x' }],
  }
  return {
    meta: {
      templateId: 'branch-performance', templateName: 'Branch Performance Workbook', workbookVersion: '1.0',
      scopeLabel: 'Branch B001', periodLabel: '2026-06', generatedAt: '2026-06-15T00:00:00.000Z',
      generatedBy: 'admin-1', rowCount: 1, warnings: [],
    },
    sheets: [sheet],
    definitions: [],
    ...overrides,
  }
}

describe('DX-10 — Export Validation', () => {
  it('a well-formed dataset validates with no blocking issues', () => {
    const result = validateExportDataset(makeDataset())
    expect(result.valid).toBe(true)
  })

  it('blocks on a row-count mismatch between meta.rowCount and actual sheet rows', () => {
    const result = validateExportDataset(makeDataset({ meta: { ...makeDataset().meta, rowCount: 99 } }))
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'ROW_COUNT_MISMATCH')).toBe(true)
  })

  it('blocks on a duplicate header within one sheet', () => {
    const dataset = makeDataset({
      sheets: [{ sheetName: 'S', columns: [{ key: 'a', header: 'Name', unit: 'number', numeric: false }, { key: 'b', header: 'Name', unit: 'number', numeric: false }], rows: [] }],
      meta: { ...makeDataset().meta, rowCount: 0 },
    })
    const result = validateExportDataset(dataset)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'DUPLICATE_HEADER')).toBe(true)
  })

  it('blocks on an invalid worksheet name (forbidden character)', () => {
    const dataset = makeDataset({ sheets: [{ sheetName: 'Bad:Name', columns: [], rows: [] }], meta: { ...makeDataset().meta, rowCount: 0 } })
    const result = validateExportDataset(dataset)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'INVALID_WORKSHEET_NAME')).toBe(true)
  })

  it('blocks on a duplicate worksheet name', () => {
    const dataset = makeDataset({
      sheets: [{ sheetName: 'Same', columns: [], rows: [] }, { sheetName: 'Same', columns: [], rows: [] }],
      meta: { ...makeDataset().meta, rowCount: 0 },
    })
    const result = validateExportDataset(dataset)
    expect(result.issues.some((i) => i.code === 'DUPLICATE_WORKSHEET_NAME')).toBe(true)
  })

  it('blocks when a sheet exceeds the per-sheet row limit', () => {
    const rows = Array.from({ length: EXPORT_LIMITS.maxRowsPerSheet + 1 }, (_, i) => ({ name: `r${i}` }))
    const dataset = makeDataset({ sheets: [{ sheetName: 'Big', columns: [{ key: 'name', header: 'Name', unit: 'number', numeric: false }], rows }], meta: { ...makeDataset().meta, rowCount: rows.length } })
    const result = validateExportDataset(dataset)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'ROW_LIMIT_EXCEEDED')).toBe(true)
  })

  it('blocks when required metadata (scope/period/generatedBy) is missing', () => {
    const result = validateExportDataset(makeDataset({ meta: { ...makeDataset().meta, scopeLabel: '' } }))
    expect(result.issues.some((i) => i.code === 'MISSING_SCOPE_LABEL')).toBe(true)
  })

  it('an empty dataset (zero rows) produces a non-blocking warning, not a refusal to download', () => {
    const dataset = makeDataset({ sheets: [{ sheetName: 'S', columns: [{ key: 'a', header: 'A', unit: 'number', numeric: false }], rows: [] }], meta: { ...makeDataset().meta, rowCount: 0 } })
    const result = validateExportDataset(dataset)
    const emptyIssue = result.issues.find((i) => i.code === 'EMPTY_DATASET')
    expect(emptyIssue?.blocking).toBe(false)
    expect(result.valid).toBe(true)
  })
})
