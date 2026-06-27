import { describe, it, expect, vi, beforeEach } from 'vitest'

const addDocCalls: Array<{ data: Record<string, unknown> }> = []
const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { PHARMACIES: 'pharmacies', DISTRICTS: 'districts', REGIONS: 'regions', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async (_ref, data) => { addDocCalls.push({ data }); return { id: 'new-pharmacy-id' } }),
  updateDoc: vi.fn(async (ref, data) => { updateDocCalls.push({ id: ref.id, data }) }),
  deleteDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async (ref: { collection: string }) => {
    if (ref.collection === 'districts') {
      return { exists: () => true, data: () => ({ pharmacyIds: [], regionId: 'region-1', supervisorUid: null }) }
    }
    return { exists: () => false, data: () => null }
  }),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))
vi.mock('../../territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))
vi.mock('../../classification/repository', () => ({ assignClassification: vi.fn(async () => {}) }))

import { createBranchesAdapter } from './branchesAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

const RESOLVABLE_GROUPS = new Map([['RUH-N', 'district-1']])

beforeEach(() => { addDocCalls.length = 0; updateDocCalls.length = 0 })

describe('DX-2/DX-3 — Branches adapter', () => {
  it('creates a new branch and assigns it to a resolved group', async () => {
    const adapter = createBranchesAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingBranches: [], resolvableGroupCodes: RESOLVABLE_GROUPS })
    const raw = adapter.parseRow({ code: '6001', name: 'Branch Six', group: 'RUH-N' }, 1, { domain: 'BRANCH' })
    const job0 = createImportJob({ jobId: 'job-b1', domain: 'BRANCH', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('VALID')

    const { result } = await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(addDocCalls[0].data).toMatchObject({ code: '6001', name: 'Branch Six' })
  })

  it('updates an existing branch (metadata only)', async () => {
    const existing = [{ id: 'ph-1', code: '6001', name: 'Branch Six', active: true }]
    const adapter = createBranchesAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingBranches: existing, resolvableGroupCodes: new Map() })
    const raw = adapter.parseRow({ code: '6001', name: 'Branch Six', city: 'Riyadh' }, 1, { domain: 'BRANCH' })
    const job0 = createImportJob({ jobId: 'job-b2', domain: 'BRANCH', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('UPDATE')
    await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(updateDocCalls[0].data).toMatchObject({ city: 'Riyadh' })
  })

  it('blocks a branch referencing an unknown/unresolved group', async () => {
    const adapter = createBranchesAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingBranches: [], resolvableGroupCodes: new Map() })
    const raw = adapter.parseRow({ code: '6002', name: 'Branch Seven', group: 'GHOST-GROUP' }, 1, { domain: 'BRANCH' })
    const job0 = createImportJob({ jobId: 'job-b3', domain: 'BRANCH', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('classifies a duplicate branch code inside the same file as DUPLICATE', async () => {
    const adapter = createBranchesAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingBranches: [], resolvableGroupCodes: new Map() })
    const raw1 = adapter.parseRow({ code: '6003', name: 'A' }, 1, { domain: 'BRANCH' })
    const raw2 = adapter.parseRow({ code: '6003', name: 'B' }, 2, { domain: 'BRANCH' })
    const job0 = createImportJob({ jobId: 'job-b4', domain: 'BRANCH', createdBy: 'admin-1' })
    const { rows, summary } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
  })

  it('flags an existing branch code with a conflicting name as CONFLICT', async () => {
    const existing = [{ id: 'ph-1', code: '6001', name: 'Branch Six', active: true }]
    const adapter = createBranchesAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingBranches: existing, resolvableGroupCodes: new Map() })
    const raw = adapter.parseRow({ code: '6001', name: 'Completely Different Branch' }, 1, { domain: 'BRANCH' })
    const job0 = createImportJob({ jobId: 'job-b5', domain: 'BRANCH', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('CONFLICT')
  })
})
