import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockDoc: any
let mockGetDocument: any

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}))

import { extractPdfText, PDF_REQUIRES_OCR_MESSAGE } from './pdfIntakeParser'

beforeEach(() => {
  mockGetDocument = vi.fn(() => ({ promise: Promise.resolve(mockDoc) }))
})

function makePage(text: string) {
  return { getTextContent: async () => ({ items: [{ str: text }] }) }
}

describe('Universal AI Intake — PDF text extraction', () => {
  it('extracts text from a text-based PDF, one entry per page', async () => {
    mockDoc = { numPages: 2, getPage: async (n: number) => makePage(n === 1 ? 'Region Code, Region Name' : 'RUH, Riyadh') }
    const result = await extractPdfText(new ArrayBuffer(0))
    expect(result.status).toBe('EXTRACTED')
    expect(result.pageText).toHaveLength(2)
    expect(result.pageText[0]).toContain('Region Code')
  })

  it('returns REQUIRES_OCR for a PDF with no meaningful extractable text (scanned/image-only)', async () => {
    mockDoc = { numPages: 1, getPage: async () => makePage('') }
    const result = await extractPdfText(new ArrayBuffer(0))
    expect(result.status).toBe('REQUIRES_OCR')
    expect(result.message).toBe(PDF_REQUIRES_OCR_MESSAGE)
    expect(result.pageText).toHaveLength(0)
  })

  it('never fabricates rows when no text layer exists', async () => {
    mockDoc = { numPages: 3, getPage: async () => makePage('   ') }
    const result = await extractPdfText(new ArrayBuffer(0))
    expect(result.status).toBe('REQUIRES_OCR')
    expect(result.pageText).toEqual([])
  })

  it('reports PASSWORD_PROTECTED for an encrypted workbook without crashing', async () => {
    mockGetDocument = vi.fn(() => ({
      promise: Promise.reject(Object.assign(new Error('encrypted'), { name: 'PasswordException' })),
    }))
    const result = await extractPdfText(new ArrayBuffer(0))
    expect(result.status).toBe('PASSWORD_PROTECTED')
  })

  it('reports PARSE_ERROR for a malformed/corrupt PDF without throwing', async () => {
    mockGetDocument = vi.fn(() => ({ promise: Promise.reject(new Error('corrupt file')) }))
    const result = await extractPdfText(new ArrayBuffer(0))
    expect(result.status).toBe('PARSE_ERROR')
  })
})
