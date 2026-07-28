import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeChecksum, extractFileMeta } from './fileChecksum'

function bufferFrom(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

describe('fileChecksum — computeChecksum', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('computes a deterministic sha256 hex digest for the same content', async () => {
    const a = await computeChecksum(bufferFrom('hello world'))
    const b = await computeChecksum(bufferFrom('hello world'))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces a different digest for different content', async () => {
    const a = await computeChecksum(bufferFrom('file-one'))
    const b = await computeChecksum(bufferFrom('file-two'))
    expect(a).not.toBe(b)
  })

  it('returns undefined (never throws) when digest computation fails', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('not supported'))
    const result = await computeChecksum(bufferFrom('anything'))
    expect(result).toBeUndefined()
  })
})

describe('fileChecksum — extractFileMeta', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('builds full metadata for a normal desktop upload', async () => {
    const meta = await extractFileMeta(
      { name: 'PharmaPulse_Branch_Actuals.xlsx', size: 20480, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      bufferFrom('workbook-bytes'),
      'Branch Actuals',
    )
    expect(meta.fileName).toBe('PharmaPulse_Branch_Actuals.xlsx')
    expect(meta.sizeBytes).toBe(20480)
    expect(meta.sheetName).toBe('Branch Actuals')
    expect(meta.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(meta.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('omits mimeType (never writes an empty string as if it were meaningful... actually omits only when truly empty) for a mobile-Safari-like empty file.type', async () => {
    const meta = await extractFileMeta(
      { name: 'upload.xlsx', size: 1024, type: '' },
      bufferFrom('bytes'),
    )
    expect('mimeType' in meta).toBe(false)
  })

  it('omits mimeType entirely when the File object has no type property at all', async () => {
    const meta = await extractFileMeta({ name: 'upload.xlsx', size: 1024 }, bufferFrom('bytes'))
    expect('mimeType' in meta).toBe(false)
  })

  it('omits checksum (never undefined) when digest computation fails', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('unsupported'))
    const meta = await extractFileMeta({ name: 'upload.xlsx', size: 1024, type: 'text/csv' }, bufferFrom('bytes'))
    expect('checksum' in meta).toBe(false)
    expect(JSON.stringify(meta)).not.toContain('undefined')
  })

  it('omits sheetName when not provided', async () => {
    const meta = await extractFileMeta({ name: 'upload.xlsx', size: 1024 }, bufferFrom('bytes'))
    expect('sheetName' in meta).toBe(false)
  })

  it('never includes an explicit undefined property anywhere in the result', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('unsupported'))
    const meta = await extractFileMeta({ name: 'upload.xlsx', size: 1024 }, bufferFrom('bytes'))
    for (const key of Object.keys(meta)) {
      expect((meta as Record<string, unknown>)[key]).not.toBeUndefined()
    }
  })
})
