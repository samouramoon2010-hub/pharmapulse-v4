import { describe, it, expect } from 'vitest'
import { checkWorkbookDomain, readWorkbookDomain } from './templateDomainGuard'

function metadataRows(domain: string) {
  return [
    { Field: 'Template Name', Value: 'Some Template' },
    { Field: 'Template Version', Value: '1.0' },
    { Field: 'Import Domain', Value: domain },
  ]
}

describe('templateDomainGuard', () => {
  it('reads the Import Domain row from parsed Metadata sheet rows', () => {
    expect(readWorkbookDomain(metadataRows('PHARMACIST_ACTUALS'))).toBe('PHARMACIST_ACTUALS')
  })

  it('returns null when there is no Metadata sheet at all', () => {
    expect(readWorkbookDomain(undefined)).toBeNull()
  })

  it('returns null when the Metadata sheet has no Import Domain row', () => {
    expect(readWorkbookDomain([{ Field: 'Template Name', Value: 'X' }])).toBeNull()
  })

  it('passes when the declared domain matches the selected importer (all 5 domains)', () => {
    for (const domain of ['KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET', 'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS']) {
      const result = checkWorkbookDomain(metadataRows(domain), domain)
      expect(result.valid).toBe(true)
      expect(result.declaredDomain).toBe(domain)
    }
  })

  it('passes (does not block) a legacy workbook with no Metadata sheet', () => {
    const result = checkWorkbookDomain(undefined, 'BRANCH_ACTUALS')
    expect(result.valid).toBe(true)
    expect(result.declaredDomain).toBeNull()
  })

  it('passes (does not block) a workbook whose Metadata sheet has no Import Domain row', () => {
    const result = checkWorkbookDomain([{ Field: 'Template Name', Value: 'X' }], 'KPI_REGISTRY')
    expect(result.valid).toBe(true)
    expect(result.declaredDomain).toBeNull()
  })

  it('rejects a Pharmacist Actuals workbook uploaded under the Branch Actuals importer', () => {
    const result = checkWorkbookDomain(metadataRows('PHARMACIST_ACTUALS'), 'BRANCH_ACTUALS')
    expect(result.valid).toBe(false)
    expect(result.declaredDomain).toBe('PHARMACIST_ACTUALS')
    expect(result.reason).toBe(
      'Template domain mismatch:\nThis workbook is PHARMACIST_ACTUALS,\nbut the selected importer is BRANCH_ACTUALS.',
    )
  })

  it('rejects a Pharmacist Actuals workbook uploaded under the KPI Registry importer', () => {
    const result = checkWorkbookDomain(metadataRows('PHARMACIST_ACTUALS'), 'KPI_REGISTRY')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('This workbook is PHARMACIST_ACTUALS')
    expect(result.reason).toContain('but the selected importer is KPI_REGISTRY')
  })

  it('rejects a Branch Actuals workbook uploaded under the Pharmacist Actuals importer', () => {
    const result = checkWorkbookDomain(metadataRows('BRANCH_ACTUALS'), 'PHARMACIST_ACTUALS')
    expect(result.valid).toBe(false)
    expect(result.declaredDomain).toBe('BRANCH_ACTUALS')
  })
})
