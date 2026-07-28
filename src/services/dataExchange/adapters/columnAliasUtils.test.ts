import { describe, it, expect } from 'vitest'
import { normalizeHeader, pickField, findAliasMatch } from './columnAliasUtils'

describe('DX-Data-1 — normalizeHeader', () => {
  it('lowercases and trims', () => {
    expect(normalizeHeader('  Branch Code  ')).toBe('branchcode')
  })

  it('strips spaces, underscores, dashes, dots, and slashes', () => {
    expect(normalizeHeader('Branch_Code')).toBe('branchcode')
    expect(normalizeHeader('Branch-Code')).toBe('branchcode')
    expect(normalizeHeader('Branch.Code')).toBe('branchcode')
    expect(normalizeHeader('Branch/Code')).toBe('branchcode')
  })

  it('treats all separator variants of the same header as equal', () => {
    const variants = ['Branch Code', 'branch_code', 'BranchCode', 'branch-code', '  branch   code ']
    const normalized = variants.map(normalizeHeader)
    expect(new Set(normalized).size).toBe(1)
  })

  it('does not collapse distinct words that only differ by spacing into unrelated words', () => {
    expect(normalizeHeader('Branch Code')).not.toBe(normalizeHeader('Branch'))
  })
})

describe('DX-Data-1 — pickField with normalized matching', () => {
  it('matches a header that differs from the alias only by spacing/case', () => {
    const row = { 'Branch_Code': '6001' }
    expect(pickField(row, ['branch code'])).toBe('6001')
  })

  it('matches Arabic header variants the same way', () => {
    const row = { ' كود الفرع ': '6001' }
    expect(pickField(row, ['كود الفرع'])).toBe('6001')
  })

  it('still returns undefined when no alias matches', () => {
    const row = { 'Unrelated Column': 'value' }
    expect(pickField(row, ['branch code'])).toBeUndefined()
  })

  it('skips blank values and falls through to the next matching key', () => {
    const row = { 'Branch Code': '', 'BranchCode': '6002' }
    expect(pickField(row, ['branch code'])).toBe('6002')
  })
})

describe('DX-Data-1 — findAliasMatch', () => {
  const aliasMap = {
    code: ['code', 'branch code'],
    name: ['name', 'branch name'],
  }

  it('resolves a header to its target field via normalized comparison', () => {
    expect(findAliasMatch('Branch_Code', aliasMap)).toBe('code')
    expect(findAliasMatch('branch-name', aliasMap)).toBe('name')
  })

  it('returns undefined for an unresolved header', () => {
    expect(findAliasMatch('Some Other Column', aliasMap)).toBeUndefined()
  })
})
