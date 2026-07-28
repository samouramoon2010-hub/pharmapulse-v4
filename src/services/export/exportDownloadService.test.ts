// ============================================================
// Export Studio — Download Service tests (DX-10, exceljs migration)
//
// exceljs's writeBuffer() is async (the SheetJS-CE writer was sync),
// so downloadExportWorkbook() is now a Promise — the main regression
// this suite guards is that the file is never written when validation
// fails, and that a valid dataset actually triggers a Blob download.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadExportWorkbook } from './exportDownloadService'
import type { ExportDataset } from './exportTypes'

function makeDataset(overrides: Partial<ExportDataset> = {}): ExportDataset {
  return {
    meta: {
      templateId: 'branch-performance', templateName: 'Branch Performance Workbook', workbookVersion: '1.0',
      scopeLabel: 'Branch B001', periodLabel: '2026-06', generatedAt: '2026-06-15T00:00:00.000Z',
      generatedBy: 'admin-1', rowCount: 1, warnings: [],
    },
    sheets: [{
      sheetName: 'Branch Summary',
      columns: [{ key: 'name', header: 'Name', unit: 'number', numeric: false }],
      rows: [{ name: 'x' }],
    }],
    definitions: [],
    ...overrides,
  }
}

describe('DX-10 — exportDownloadService (exceljs)', () => {
  // This project's vitest environment is 'node' (no jsdom) — component
  // tests here use source-scan patterns instead of DOM rendering. This
  // is the first module needing the download-trigger DOM calls
  // (document.createElement/appendChild/removeChild, URL.createObjectURL),
  // so they're stubbed directly rather than pulling in jsdom.
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>
  let appendChildSpy: ReturnType<typeof vi.fn>
  let removeChildSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    clickSpy = vi.fn()
    appendChildSpy = vi.fn()
    removeChildSpy = vi.fn()

    ;(globalThis as any).URL.createObjectURL = createObjectURL
    ;(globalThis as any).URL.revokeObjectURL = revokeObjectURL
    ;(globalThis as any).document = {
      createElement: vi.fn(() => ({ click: clickSpy, href: '', download: '' })),
      body: { appendChild: appendChildSpy, removeChild: removeChildSpy },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not download when validation fails, and reports the validation result', async () => {
    const invalid = makeDataset({ meta: { ...makeDataset().meta, scopeLabel: '' } })
    const outcome = await downloadExportWorkbook(invalid)
    expect(outcome.downloaded).toBe(false)
    expect(outcome.validation.valid).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('builds a workbook buffer and triggers a Blob download when valid', async () => {
    const outcome = await downloadExportWorkbook(makeDataset())
    expect(outcome.downloaded).toBe(true)
    expect(outcome.validation.valid).toBe(true)
    expect(outcome.fileName).toMatch(/\.xlsx$/)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
