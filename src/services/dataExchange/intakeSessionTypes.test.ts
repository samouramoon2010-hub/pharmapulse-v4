import { describe, it, expect } from 'vitest'
import { withIntakeMeta, withApproval, withExecution, toProposedAction, INTAKE_SCHEMA_VERSION } from './intakeSessionTypes'
import { createImportJob } from './importJobEngine'

describe('Universal AI Intake — intake session model', () => {
  it('withIntakeMeta stamps sourceType and versions onto an existing ImportJob without a parallel collection', () => {
    const job = createImportJob({ jobId: 'job-1', domain: 'REGION', createdBy: 'admin-1' })
    const withMeta = withIntakeMeta(job, { sourceType: 'CSV', sourceFileName: 'regions.csv' })
    expect(withMeta.intakeSourceType).toBe('CSV')
    expect(withMeta.intakeSourceFileName).toBe('regions.csv')
    expect(withMeta.intakeSchemaVersion).toBe(INTAKE_SCHEMA_VERSION)
    // Still the same job — jobId/domain untouched
    expect(withMeta.jobId).toBe('job-1')
    expect(withMeta.domain).toBe('REGION')
  })

  it('never assigns undefined for omitted optional fields (Firestore rejects undefined)', () => {
    const job = createImportJob({ jobId: 'job-2', domain: 'REGION', createdBy: 'admin-1' })
    const withMeta = withIntakeMeta(job, { sourceType: 'TEXT' })
    expect('intakeSourceFileName' in withMeta).toBe(false)
    expect('intakeSelectedSheet' in withMeta).toBe(false)
  })

  it('withApproval and withExecution stamp their respective timestamps', () => {
    const job = createImportJob({ jobId: 'job-3', domain: 'REGION', createdBy: 'admin-1' })
    const approved = withApproval(job, '2026-07-13T10:00:00.000Z')
    expect(approved.approvedAt).toBe('2026-07-13T10:00:00.000Z')
    const executed = withExecution(approved, '2026-07-13T10:01:00.000Z')
    expect(executed.executedAt).toBe('2026-07-13T10:01:00.000Z')
    expect(executed.approvedAt).toBe('2026-07-13T10:00:00.000Z')
  })

  it('maps every RowClassification to the spec proposedAction vocabulary', () => {
    expect(toProposedAction('VALID')).toBe('create')
    expect(toProposedAction('UPDATE')).toBe('update')
    expect(toProposedAction('SKIP')).toBe('skip')
    expect(toProposedAction('DUPLICATE')).toBe('skip')
    expect(toProposedAction('CONFLICT')).toBe('conflict')
    expect(toProposedAction('ERROR')).toBe('invalid')
  })
})
