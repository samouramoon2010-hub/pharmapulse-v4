import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { checkTemplateVersion, readTemplateVersion, SUPPORTED_TEMPLATE_VERSIONS } from './templateVersionGuard'
import { TEMPLATE_VERSION, buildBranchActualsTemplate } from './templateGenerator'

function metadataRowsFromWorkbook(wb: XLSX.WorkBook) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Metadata'])
}

describe('DX-8 — Template Version Guard', () => {
  it('a real generated template (current version) is supported', () => {
    const rows = metadataRowsFromWorkbook(buildBranchActualsTemplate())
    const result = checkTemplateVersion(rows)
    expect(result.supported).toBe(true)
    expect(result.version).toBe(TEMPLATE_VERSION)
  })

  it('a legacy file with no Metadata sheet at all is treated as a supported legacy version, never rejected', () => {
    const result = checkTemplateVersion(undefined)
    expect(result.supported).toBe(true)
    expect(result.version).toBeNull()
  })

  it('a Metadata sheet present but with no Template Version row is also treated as legacy-supported', () => {
    const result = checkTemplateVersion([{ Field: 'Template Name', Value: 'Something' }])
    expect(result.supported).toBe(true)
    expect(result.version).toBeNull()
  })

  it('an explicit, unrecognized future version is rejected with a clear, non-crashing reason', () => {
    const result = checkTemplateVersion([{ Field: 'Template Version', Value: '99.0' }])
    expect(result.supported).toBe(false)
    expect(result.version).toBe('99.0')
    expect(result.reason).toMatch(/template version/i)
    expect(result.reason).not.toMatch(/Error:|at Object|\.ts:\d+/) // never a raw stack trace
  })

  it('readTemplateVersion extracts exactly the Template Version field, ignoring other rows', () => {
    expect(readTemplateVersion([{ Field: 'Template Name', Value: 'X' }, { Field: 'Template Version', Value: '1.0' }])).toBe('1.0')
    expect(readTemplateVersion([])).toBeNull()
  })

  it('SUPPORTED_TEMPLATE_VERSIONS always includes the current generator version', () => {
    expect(SUPPORTED_TEMPLATE_VERSIONS).toContain(TEMPLATE_VERSION)
  })
})
