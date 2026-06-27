import { describe, it, expect } from 'vitest'
import {
  categorizeIssueCode, categorizeRowClassification, categorizeStaleReason, categorizeRow,
  IMPORT_ERROR_CATEGORIES,
} from './importErrorTaxonomy'

describe('DX-9 — Import Error Taxonomy', () => {
  it('categorizes every real adapter issue code into a non-System-Error category', () => {
    const realCodes = [
      'MISSING_REQUIRED_FIELD', 'UNKNOWN_BRANCH', 'UNKNOWN_KPI', 'INVALID_DATE', 'FUTURE_DATE',
      'NEGATIVE_ACTUAL_VALUE', 'BRANCH_HAS_NO_MANAGER', 'PHARMACIST_BRANCH_MISMATCH', 'INACTIVE_PHARMACIST',
      'UNAUTHORIZED_ROW', 'DUPLICATE_EMAIL', 'IDENTITY_REVIEW_REQUIRED', 'NORMALIZED_KEY_COLLISION',
    ]
    for (const code of realCodes) {
      expect(categorizeIssueCode(code)).not.toBe('System Error')
    }
  })

  it('maps UNAUTHORIZED_ROW to Permission Denied — never exposed as a raw error', () => {
    expect(categorizeIssueCode('UNAUTHORIZED_ROW')).toBe('Permission Denied')
  })

  it('falls back to System Error for an unrecognized code, never throwing', () => {
    expect(categorizeIssueCode('SOME_FUTURE_CODE_NOT_YET_MAPPED')).toBe('System Error')
  })

  it('categorizes DUPLICATE and CONFLICT row classifications distinctly from VALID/ERROR', () => {
    expect(categorizeRowClassification('DUPLICATE')).toBe('Duplicate Row')
    expect(categorizeRowClassification('CONFLICT')).toBe('Existing Record Conflict')
    expect(categorizeRowClassification('VALID')).toBeNull()
    expect(categorizeRowClassification('ERROR')).toBeNull()
  })

  it('categorizeRow prefers classification over issue code for DUPLICATE/CONFLICT rows', () => {
    expect(categorizeRow('DUPLICATE', ['UNKNOWN_BRANCH'])).toBe('Duplicate Row')
    expect(categorizeRow('ERROR', ['UNKNOWN_BRANCH'])).toBe('Invalid Identifier')
    expect(categorizeRow('ERROR', [])).toBe('System Error')
  })

  it('categorizes real runner-level stale/retry reason strings without ever matching raw stack-trace text', () => {
    expect(categorizeStaleReason('Existing Firestore records changed since this preview was generated. Revalidate before committing.')).toBe('Stale Preview')
    expect(categorizeStaleReason('Job act-1-branch-actuals already committed (status COMPLETED) — refusing to commit twice.')).toBe('Retry Not Safe')
    expect(categorizeStaleReason('Job act-1-branch-actuals has already been retried 5 times (limit 5) — re-upload a fresh file instead.')).toBe('Retry Not Safe')
    expect(categorizeStaleReason('Job act-1-branch-actuals was not found.')).toBe('Retry Not Safe')
  })

  it('IMPORT_ERROR_CATEGORIES contains exactly the 11 task-specified categories', () => {
    expect(IMPORT_ERROR_CATEGORIES).toHaveLength(11)
    expect(IMPORT_ERROR_CATEGORIES).toContain('File Format Error')
    expect(IMPORT_ERROR_CATEGORIES).toContain('Template Version Error')
    expect(IMPORT_ERROR_CATEGORIES).toContain('System Error')
  })
})
