import { describe, it, expect, beforeEach, vi } from 'vitest'

const addDocCalls: Array<{ data: Record<string, unknown> }> = []
const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { REGIONS: 'regions', DISTRICTS: 'districts', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async (ref, data) => { addDocCalls.push({ data }); return { id: 'new-region-id' } }),
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

import { createRegionsAdapter } from './regionsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const MANAGER: GuardContext = { uid: 'mgr-1', role: 'branch_manager', pharmacyId: 'p1' }

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

beforeEach(() => { addDocCalls.length = 0; updateDocCalls.length = 0 })

describe('AI Intake — Regions adapter', () => {
  it('creates a new region', async () => {
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: [] })
    const raw = adapter.parseRow({ code: 'RUH', name: 'Riyadh' }, 1, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r1', domain: 'REGION', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(job.status).toBe('READY')
    expect(rows[0].classification).toBe('VALID')

    const { result } = await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(addDocCalls).toHaveLength(1)
    expect(addDocCalls[0].data).toMatchObject({ code: 'RUH', name: 'Riyadh' })
  })

  it('updates an existing region when only metadata changes', async () => {
    const existing = [{ id: 'r1', code: 'RUH', name: 'Riyadh', active: true }]
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: existing })
    const raw = adapter.parseRow({ code: 'RUH', name: 'Riyadh', status: 'inactive' }, 1, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r2', domain: 'REGION', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('UPDATE')

    await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })
    expect(updateDocCalls).toHaveLength(1)
    expect(updateDocCalls[0].data).toMatchObject({ active: false })
  })

  it('classifies a duplicate region code inside the same file as DUPLICATE (case-insensitive)', async () => {
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: [] })
    const raw1 = adapter.parseRow({ code: 'RUH', name: 'Riyadh' }, 1, { domain: 'REGION' })
    const raw2 = adapter.parseRow({ code: 'ruh', name: 'Riyadh Again' }, 2, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r3', domain: 'REGION', createdBy: 'admin-1' })
    const { rows, summary } = await runValidation(job0, adapter, [raw1, raw2], vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
    expect(rows[1].classification).toBe('DUPLICATE')
  })

  it('flags an existing code with a conflicting name as CONFLICT, never silently overwritten', async () => {
    const existing = [{ id: 'r1', code: 'RUH', name: 'Riyadh', active: true }]
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: existing })
    const raw = adapter.parseRow({ code: 'RUH', name: 'A Totally Different Name' }, 1, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r4', domain: 'REGION', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('CONFLICT')
  })

  it('blocks a row missing a required field', async () => {
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: [] })
    const raw = adapter.parseRow({ code: 'RUH' }, 1, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r5', domain: 'REGION', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'MISSING_REQUIRED_FIELD')).toBe(true)
  })

  it('rejects bulk Region import from a non-admin actor', async () => {
    const adapter = createRegionsAdapter({ guardCtx: MANAGER, actorRole: 'branch_manager', existingRegions: [] })
    const raw = adapter.parseRow({ code: 'RUH', name: 'Riyadh' }, 1, { domain: 'REGION' })
    const job0 = createImportJob({ jobId: 'job-r6', domain: 'REGION', createdBy: 'mgr-1' })
    const { rows } = await runValidation(job0, adapter, [raw], { actorUid: 'mgr-1', actorRole: 'branch_manager' }, { actorUid: 'mgr-1', actorRole: 'branch_manager' })
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('English/Arabic header aliases both resolve to the same fields', async () => {
    const adapter = createRegionsAdapter({ guardCtx: ADMIN, actorRole: 'admin', existingRegions: [] })
    const rawEn = adapter.parseRow({ 'Region Code': 'RUH', 'Region Name': 'Riyadh' }, 1, { domain: 'REGION' })
    const rawAr = adapter.parseRow({ 'كود المنطقة': 'RUH', 'اسم المنطقة': 'الرياض' }, 1, { domain: 'REGION' })
    expect(rawEn.code).toBe('RUH')
    expect(rawAr.code).toBe('RUH')
  })
})
