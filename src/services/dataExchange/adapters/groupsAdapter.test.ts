import { describe, it, expect, vi, beforeEach } from 'vitest'

const addDocCalls: Array<{ collection: string; data: Record<string, unknown> }> = []
const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { DISTRICTS: 'districts', REGIONS: 'regions', PHARMACIES: 'pharmacies', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async (ref, data) => { addDocCalls.push({ collection: 'districts', data }); return { id: 'new-district-id' } }),
  updateDoc: vi.fn(async (ref, data) => { updateDocCalls.push({ id: ref.id, data }) }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))
vi.mock('../../territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))

import { createGroupsAdapter } from './groupsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const MANAGER: GuardContext = { uid: 'mgr-1', role: 'branch_manager', pharmacyId: 'p1' }

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

const REGIONS = [{ id: 'region-1', code: 'RUH' }]

beforeEach(() => { addDocCalls.length = 0; updateDocCalls.length = 0 })

describe('DX-2/DX-3 — Groups (District) adapter', () => {
  it('creates a new group/district', async () => {
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: [], existingRegions: REGIONS })
    const raw = adapter.parseRow({ code: 'RUH-N', name: 'North Riyadh', region: 'RUH' }, 1, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g1', domain: 'GROUP', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(job.status).toBe('READY')
    expect(rows[0].classification).toBe('VALID')

    const { result } = await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(addDocCalls).toHaveLength(1)
    expect(addDocCalls[0].data).toMatchObject({ code: 'RUH-N', name: 'North Riyadh', regionId: 'region-1' })
  })

  it('updates an existing group when only metadata changes', async () => {
    const existing = [{ id: 'd1', code: 'RUH-N', name: 'North Riyadh', regionId: 'region-1', active: true }]
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: existing, existingRegions: REGIONS })
    const raw = adapter.parseRow({ code: 'RUH-N', name: 'North Riyadh', region: 'RUH', status: 'inactive' }, 1, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g2', domain: 'GROUP', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('UPDATE')

    await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(updateDocCalls).toHaveLength(1)
    expect(updateDocCalls[0].data).toMatchObject({ active: false })
  })

  it('classifies a duplicate group code inside the same file as DUPLICATE', async () => {
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: [], existingRegions: REGIONS })
    const raw1 = adapter.parseRow({ code: 'RUH-N', name: 'North', region: 'RUH' }, 1, { domain: 'GROUP' })
    const raw2 = adapter.parseRow({ code: 'ruh-n', name: 'North Again', region: 'RUH' }, 2, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g3', domain: 'GROUP', createdBy: 'admin-1' })
    const { rows, summary } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
    expect(rows[1].classification).toBe('DUPLICATE')
  })

  it('flags an existing code with a conflicting name as CONFLICT, never silently overwritten', async () => {
    const existing = [{ id: 'd1', code: 'RUH-N', name: 'North Riyadh', regionId: 'region-1', active: true }]
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: existing, existingRegions: REGIONS })
    const raw = adapter.parseRow({ code: 'RUH-N', name: 'A Totally Different Name', region: 'RUH' }, 1, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g4', domain: 'GROUP', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('CONFLICT')
  })

  it('blocks a row referencing an unknown parent region', async () => {
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: [], existingRegions: REGIONS })
    const raw = adapter.parseRow({ code: 'X', name: 'X District', region: 'NOPE' }, 1, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g5', domain: 'GROUP', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNKNOWN_PARENT_ORGANIZATION')).toBe(true)
  })

  it('rejects bulk Group import from a non-admin actor (unauthorized scope)', async () => {
    const adapter = createGroupsAdapter({ guardCtx: MANAGER, actorRole: 'branch_manager', existingGroups: [], existingRegions: REGIONS })
    const raw = adapter.parseRow({ code: 'RUH-N', name: 'North', region: 'RUH' }, 1, { domain: 'GROUP' })
    const job0 = createImportJob({ jobId: 'job-g6', domain: 'GROUP', createdBy: 'mgr-1' })
    const { rows } = await runValidation(job0, adapter, [raw], { actorUid: 'mgr-1', actorRole: 'branch_manager' }, { actorUid: 'mgr-1', actorRole: 'branch_manager' })
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('English/Arabic header aliases both resolve to the same fields', async () => {
    const adapter = createGroupsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingGroups: [], existingRegions: REGIONS })
    const rawEn = adapter.parseRow({ 'Group Code': 'RUH-N', 'Group Name': 'North', 'Region Code': 'RUH' }, 1, { domain: 'GROUP' })
    const rawAr = adapter.parseRow({ 'كود المجموعة': 'RUH-N', 'اسم المجموعة': 'الشمال', 'كود المنطقة': 'RUH' }, 1, { domain: 'GROUP' })
    expect(rawEn.code).toBe('RUH-N')
    expect(rawAr.code).toBe('RUH-N')
  })
})
