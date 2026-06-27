import { describe, it, expect } from 'vitest'
import type { ImportJob } from '../../dataExchange/importJobTypes'
import { buildImportAuditDataset } from './importAuditDataset'

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    jobId: 'job-1', domain: 'BRANCH_ACTUALS', status: 'COMPLETED',
    createdBy: 'admin-1', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
    rowCounts: { parsed: 10, validated: 10, committed: 10, failed: 0, skipped: 0, remaining: 0 },
    commitBatches: [], rollbackStatus: 'NOT_ATTEMPTED', statusHistory: [],
    ...overrides,
  } as ImportJob
}

describe('DX-10 — Import Audit Dataset Builder', () => {
  it('builds Import Jobs, Failed & Retryable Summary, and Domain Summary sheets', () => {
    const dataset = buildImportAuditDataset({ jobs: [makeJob()], generatedBy: 'admin-1' })
    expect(dataset.sheets.map((s) => s.sheetName)).toEqual(['Import Jobs', 'Failed & Retryable Summary', 'Domain Summary'])
  })

  it('only PARTIALLY_COMPLETED Actuals jobs are marked retry-eligible — matches the DX-9 closure matrix exactly', () => {
    const jobs = [
      makeJob({ jobId: 'j1', domain: 'BRANCH_ACTUALS', status: 'PARTIALLY_COMPLETED', rowCounts: { parsed: 10, validated: 10, committed: 5, failed: 5, skipped: 0, remaining: 5 } }),
      makeJob({ jobId: 'j2', domain: 'GROUP', status: 'PARTIALLY_COMPLETED', rowCounts: { parsed: 10, validated: 10, committed: 5, failed: 5, skipped: 0, remaining: 5 } }),
    ]
    const dataset = buildImportAuditDataset({ jobs, generatedBy: 'admin-1' })
    const summary = dataset.sheets.find((s) => s.sheetName === 'Failed & Retryable Summary')!
    const j1 = summary.rows.find((r) => r.jobId === 'j1')
    const j2 = summary.rows.find((r) => r.jobId === 'j2')
    expect(j1?.retryEligible).toBe('Yes')
    expect(j2?.retryEligible).toBe('No')
  })

  it('Domain Summary counts jobs per domain+status combination', () => {
    const jobs = [makeJob({ domain: 'GROUP', status: 'COMPLETED' }), makeJob({ jobId: 'j2', domain: 'GROUP', status: 'COMPLETED' }), makeJob({ jobId: 'j3', domain: 'BRANCH', status: 'FAILED' })]
    const dataset = buildImportAuditDataset({ jobs, generatedBy: 'admin-1' })
    const domainSummary = dataset.sheets.find((s) => s.sheetName === 'Domain Summary')!
    expect(domainSummary.rows.find((r) => r.domain === 'GROUP' && r.status === 'COMPLETED')?.jobCount).toBe(2)
  })

  it('zero jobs produces a warning, not a crash', () => {
    const dataset = buildImportAuditDataset({ jobs: [], generatedBy: 'admin-1' })
    expect(dataset.meta.warnings.length).toBeGreaterThan(0)
  })
})
