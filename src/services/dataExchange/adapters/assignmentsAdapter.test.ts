import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { USERS: 'users', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: vi.fn(async (ref: { id: string }) => ({
    exists: () => true,
    data: () => ({ role: 'pharmacist', pharmacyId: 'old-branch', assignedPharmacyIds: [] }),
  })),
  updateDoc: vi.fn(async (ref, data) => { updateDocCalls.push({ id: ref.id, data }) }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { UPDATE: 'update' } }))
vi.mock('../../territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))

import { createAssignmentsAdapter } from './assignmentsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

const PHARMACISTS = new Map([['EMP1', 'uid-1'], ['EMP2', 'uid-2']])
const BRANCHES = new Map([['6001', 'pharmacy-1'], ['6002', 'pharmacy-2']])

beforeEach(() => { updateDocCalls.length = 0 })

function makeAdapter(existingPrimary = new Map<string, string>()) {
  return createAssignmentsAdapter({
    guardCtx: ADMIN, actorRole: 'admin',
    resolvablePharmacistIds: PHARMACISTS, resolvableBranchCodes: BRANCHES,
    existingPrimaryByEmployeeId: existingPrimary,
  })
}

describe('DX-2/DX-3 — Assignments adapter', () => {
  it('creates a new primary assignment', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001' }, 1, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a1', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(updateDocCalls[0]).toMatchObject({ id: 'uid-1', data: expect.objectContaining({ pharmacyId: 'pharmacy-1' }) })
  })

  it('rejects a secondary assignment as unsupported by the current data model', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001', type: 'secondary' }, 1, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a2', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNSUPPORTED_ASSIGNMENT_TYPE')).toBe(true)
  })

  it('classifies an exact duplicate assignment row as DUPLICATE', async () => {
    const adapter = makeAdapter()
    const raw1 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001', 'start date': '2026-01-01' }, 1, { domain: 'ASSIGNMENT' })
    const raw2 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001', 'start date': '2026-01-01' }, 2, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a3', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { summary } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
  })

  it('detects overlapping primary assignments for the same employee in one file', async () => {
    const adapter = makeAdapter()
    const raw1 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001', 'start date': '2026-01-01' }, 1, { domain: 'ASSIGNMENT' })
    const raw2 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6002', 'start date': '2026-01-15' }, 2, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a4', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(rows[1].classification).toBe('ERROR')
    expect(rows[1].issues.some((i) => i.code === 'OVERLAPPING_PRIMARY_ASSIGNMENT')).toBe(true)
  })

  it('two distinct non-overlapping primary assignments (sequential transfer) for one employee are both valid', async () => {
    const adapter = makeAdapter()
    const raw1 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001', 'start date': '2026-01-01', 'end date': '2026-01-31' }, 1, { domain: 'ASSIGNMENT' })
    const raw2 = adapter.parseRow({ 'employee id': 'EMP1', branch: '6002', 'start date': '2026-02-01' }, 2, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a5', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(rows[0].classification).toBe('VALID')
    expect(rows[1].classification).toBe('VALID')
  })

  it('blocks a row referencing an unknown pharmacist', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'GHOST', branch: '6001' }, 1, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a6', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('blocks a row referencing an unknown branch', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP1', branch: 'GHOST' }, 1, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a7', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('re-importing an identical assignment that already matches the existing primary is a safe no-op (SKIP)', async () => {
    const adapter = makeAdapter(new Map([['EMP1', 'pharmacy-1']]))
    const raw = adapter.parseRow({ 'employee id': 'EMP1', branch: '6001' }, 1, { domain: 'ASSIGNMENT' })
    const job0 = createImportJob({ jobId: 'job-a8', domain: 'ASSIGNMENT', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('SKIP')
  })
})
