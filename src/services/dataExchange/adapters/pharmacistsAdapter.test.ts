import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []
const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { USERS: 'users', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  setDoc: vi.fn(async (ref, data) => { setDocCalls.push({ id: ref.id, data }) }),
  updateDoc: vi.fn(async (ref, data) => { updateDocCalls.push({ id: ref.id, data }) }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))

import { createPharmacistsAdapter } from './pharmacistsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const MANAGER: GuardContext = { uid: 'mgr-1', role: 'branch_manager', pharmacyId: 'p1' }
const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

const RESOLVABLE_BRANCHES = new Map([['6001', 'pharmacy-1']])

beforeEach(() => { setDocCalls.length = 0; updateDocCalls.length = 0 })

function makeAdapter(overrides: Partial<Parameters<typeof createPharmacistsAdapter>[0]> = {}) {
  return createPharmacistsAdapter({
    guardCtx: ADMIN, actorRole: 'admin',
    existingByEmployeeId: new Map(), existingByEmail: new Map(),
    resolvableBranchCodes: RESOLVABLE_BRANCHES,
    ...overrides,
  })
}

describe('DX-2/DX-3 — Pharmacists adapter', () => {
  it('creates a new operational record with PENDING_INVITATION auth status and no Auth account', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP1', name: 'Sara Al', email: 'sara@example.com', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p1', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('VALID')

    const { result } = await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(setDocCalls[0].id).toBe('pending_EMP1')
    expect(setDocCalls[0].data).toMatchObject({ authStatus: 'PENDING_INVITATION', employeeId: 'EMP1' })
    // No password, no Firebase Auth call anywhere in this payload.
    expect(setDocCalls[0].data).not.toHaveProperty('password')
  })

  it('allows an operational record to be created even with authentication pending (no email)', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP2', name: 'No Email Yet', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p2', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('WARNING')
    expect(rows[0].issues.some((i) => i.code === 'MISSING_OPTIONAL_FIELD')).toBe(true)
  })

  it('classifies a duplicate employee ID inside the same file as DUPLICATE', async () => {
    const adapter = makeAdapter()
    const raw1 = adapter.parseRow({ 'employee id': 'EMP3', name: 'A', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const raw2 = adapter.parseRow({ 'employee id': 'EMP3', name: 'B', role: 'pharmacist', branch: '6001' }, 2, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p3', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { summary } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
  })

  it('blocks a duplicate email used by two different employee IDs in the same file', async () => {
    const adapter = makeAdapter()
    const raw1 = adapter.parseRow({ 'employee id': 'EMP4', name: 'A', email: 'shared@example.com', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const raw2 = adapter.parseRow({ 'employee id': 'EMP5', name: 'B', email: 'shared@example.com', role: 'pharmacist', branch: '6001' }, 2, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p4', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    // Closure Patch Part 3: identity conflicts default to REVIEW_REQUIRED
    // (the existing CONFLICT classification, never auto-resolved) rather
    // than ERROR — a duplicate email across two employee IDs needs a
    // human decision, not "fix the file and re-upload."
    expect(rows[1].classification).toBe('CONFLICT')
    expect(rows[1].issues.some((i) => i.code === 'DUPLICATE_EMAIL' && i.requiresReview)).toBe(true)
  })

  it('blocks an email already linked to a different existing employee', async () => {
    const existingByEmail = new Map([['taken@example.com', { id: 'u1', employeeId: 'EMP-OLD', email: 'taken@example.com', role: 'pharmacist', pharmacyId: null, authStatus: 'ACTIVE' as const }]])
    const adapter = makeAdapter({ existingByEmail })
    const raw = adapter.parseRow({ 'employee id': 'EMP-NEW', name: 'New Person', email: 'taken@example.com', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p5', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    // Closure Patch Part 3: identity conflicts default to REVIEW_REQUIRED
    // (CONFLICT), never silently ERROR'd-and-forgotten or auto-resolved.
    expect(rows[0].classification).toBe('CONFLICT')
    expect(rows[0].issues.some((i) => i.code === 'EMAIL_LINKED_TO_ANOTHER_EMPLOYEE' && i.requiresReview)).toBe(true)
  })

  it('rejects an unsupported/privileged role (e.g. admin) from bulk import', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP6', name: 'Wannabe Admin', role: 'admin', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p6', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNSUPPORTED_ROLE')).toBe(true)
  })

  it('blocks a row referencing an unknown/unresolved branch', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP7', name: 'X', role: 'pharmacist', branch: 'GHOST' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p7', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('requires CONFLICT (not silent overwrite) when updating an ACTIVE Auth-linked pharmacist\'s role/branch', async () => {
    const existingByEmployeeId = new Map([['EMP8', { id: 'real-uid-8', employeeId: 'EMP8', email: 'e8@example.com', role: 'pharmacist', pharmacyId: 'some-other-branch', authStatus: 'ACTIVE' as const }]])
    const adapter = makeAdapter({ existingByEmployeeId })
    const raw = adapter.parseRow({ 'employee id': 'EMP8', name: 'E8', email: 'e8@example.com', role: 'branch_manager', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p8', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('CONFLICT')
  })

  it('allows free UPDATE on a PENDING_INVITATION record (our own staging artifact)', async () => {
    const existingByEmployeeId = new Map([['EMP9', { id: 'pending_EMP9', employeeId: 'EMP9', email: 'e9@example.com', role: 'pharmacist', pharmacyId: null, authStatus: 'PENDING_INVITATION' as const }]])
    const adapter = makeAdapter({ existingByEmployeeId })
    const raw = adapter.parseRow({ 'employee id': 'EMP9', name: 'E9', email: 'e9@example.com', role: 'branch_manager', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p9', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('UPDATE')
    await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(updateDocCalls[0].id).toBe('pending_EMP9')
  })

  it('rejects bulk Pharmacist import from a non-admin actor', async () => {
    const adapter = createPharmacistsAdapter({
      guardCtx: MANAGER, actorRole: 'branch_manager',
      existingByEmployeeId: new Map(), existingByEmail: new Map(), resolvableBranchCodes: RESOLVABLE_BRANCHES,
    })
    const raw = adapter.parseRow({ 'employee id': 'EMP10', name: 'X', role: 'pharmacist', branch: '6001' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p10', domain: 'PHARMACIST', createdBy: 'mgr-1' })
    const { rows } = await runValidation(job0, adapter, [raw], { actorUid: 'mgr-1', actorRole: 'branch_manager' }, { actorUid: 'mgr-1', actorRole: 'branch_manager' })
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('rejects an invalid employment date range (leaving before joining)', async () => {
    const adapter = makeAdapter()
    const raw = adapter.parseRow({ 'employee id': 'EMP11', name: 'X', role: 'pharmacist', branch: '6001', 'joining date': '2026-05-01', 'leaving date': '2026-01-01' }, 1, { domain: 'PHARMACIST' })
    const job0 = createImportJob({ jobId: 'job-p11', domain: 'PHARMACIST', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'INVALID_EMPLOYMENT_DATE')).toBe(true)
  })
})
