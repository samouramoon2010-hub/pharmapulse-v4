import { describe, it, expect } from 'vitest'
import { findUnresolvedHeaders, applyManualHeaderMapping, DOMAIN_FIELD_ALIASES, DOMAIN_FIELD_LABELS } from './headerResolution'

describe('DX-Data-2 — findUnresolvedHeaders', () => {
  it('returns no unresolved headers for a fully recognized BRANCH sheet', () => {
    const headerRow = ['Branch Code', 'Branch Name', 'Region', 'City', 'Group', 'Manager', 'Status']
    expect(findUnresolvedHeaders('BRANCH', headerRow)).toEqual([])
  })

  it('flags a header with no alias in any field as unresolved', () => {
    const headerRow = ['Branch Code', 'Branch Name', 'Internal Notes']
    expect(findUnresolvedHeaders('BRANCH', headerRow)).toEqual(['Internal Notes'])
  })

  it('returns an empty list for an unknown domain rather than throwing', () => {
    expect(findUnresolvedHeaders('NOT_A_DOMAIN', ['Anything'])).toEqual([])
  })
})

describe('DX-Data-2 — applyManualHeaderMapping', () => {
  it('copies a mapped column value under the field key`s canonical alias', () => {
    const rows = [{ 'Store Code': '6001', 'Store Name': 'Branch Six' }]
    const mapped = applyManualHeaderMapping('BRANCH', rows, { 'Store Code': 'code', 'Store Name': 'name' })
    expect(mapped[0].code).toBe('6001')
    expect(mapped[0].name).toBe('Branch Six')
    // Original columns are preserved, not removed.
    expect(mapped[0]['Store Code']).toBe('6001')
  })

  it('returns rows unchanged when the mapping is empty', () => {
    const rows = [{ 'Internal Notes': 'x' }]
    expect(applyManualHeaderMapping('BRANCH', rows, {})).toBe(rows)
  })

  it('ignores a mapping entry with no field selected', () => {
    const rows = [{ 'Internal Notes': 'x' }]
    const mapped = applyManualHeaderMapping('BRANCH', rows, { 'Internal Notes': '' })
    expect(mapped[0].code).toBeUndefined()
  })

  it('every DOMAIN_FIELD_LABELS key has a matching DOMAIN_FIELD_ALIASES entry', () => {
    for (const domain of Object.keys(DOMAIN_FIELD_LABELS)) {
      const aliasKeys = Object.keys(DOMAIN_FIELD_ALIASES[domain] ?? {})
      for (const fieldKey of Object.keys(DOMAIN_FIELD_LABELS[domain])) {
        expect(aliasKeys).toContain(fieldKey)
      }
    }
  })
})
