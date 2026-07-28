import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []
const registryDocs = new Map<string, Record<string, unknown>>()

vi.mock('../../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: { KPI_REGISTRY: 'kpi_registry', KPI_AUDIT_LOGS: 'kpi_audit_logs', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id) => ({ id })),
  setDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    setDocCalls.push({ id: ref.id, data })
    registryDocs.set(ref.id, { ...(registryDocs.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: { id: string }) => {
    const data = registryDocs.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'audit-1' })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({
  logAction: vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

import { createDraftOnlyKpiRegistryAdapter, DRAFT_ONLY_NOTE } from './kpiRegistryDraftOnlyAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }

beforeEach(() => { setDocCalls.length = 0; registryDocs.clear() })

describe('AI Intake — KPI Definitions draft-only guard', () => {
  it('forces isActive:false and lifecycleStage:draft even when the source row says Active/production', async () => {
    const adapter = createDraftOnlyKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const raw = adapter.parseRow({
      key: 'newKpi', 'name english': 'New KPI', unit: 'count', category: 'commercial',
      'lifecycle stage': 'production_evaluation', active: 'true',
    }, 1, { domain: 'KPI_REGISTRY' })
    const job0 = createImportJob({ jobId: 'job-k1', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)

    // WARNING, not VALID/ERROR — the forced-draft note is informational and
    // never blocks commit (see the second test below for the note itself).
    expect(rows[0].classification).toBe('WARNING')
    expect(rows[0].staged?.isActive).toBe(false)
    expect(rows[0].staged?.lifecycleStage).toBe('draft')
  })

  it('surfaces a visible, non-blocking note that the KPI was forced to draft', async () => {
    const adapter = createDraftOnlyKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const raw = adapter.parseRow({ key: 'newKpi2', 'name english': 'New KPI 2', unit: 'count', category: 'commercial' }, 1, { domain: 'KPI_REGISTRY' })
    const job0 = createImportJob({ jobId: 'job-k2', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)

    const note = rows[0].issues.find((i) => i.code === 'INTAKE_FORCED_DRAFT')
    expect(note).toBeDefined()
    expect(note?.message).toBe(DRAFT_ONLY_NOTE)
    expect(note?.blocksCommit).toBe(false)
  })

  it('commits the forced-draft definition to Firestore with isActive:false', async () => {
    const adapter = createDraftOnlyKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const raw = adapter.parseRow({ key: 'newKpi3', 'name english': 'New KPI 3', unit: 'count', category: 'commercial' }, 1, { domain: 'KPI_REGISTRY' })
    const job0 = createImportJob({ jobId: 'job-k3', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    await commitJob(job, adapter, rows, { actorUid: 'admin-1', actorRole: 'admin', jobId: job.jobId }, { chunkSize: 1 })

    expect(setDocCalls).toHaveLength(1)
    expect(setDocCalls[0].data).toMatchObject({ isActive: false, lifecycleStage: 'draft' })
  })

  it('still blocks a genuinely invalid row (e.g. missing required field) — the draft guard does not mask real errors', async () => {
    const adapter = createDraftOnlyKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const raw = adapter.parseRow({ key: 'newKpi4' }, 1, { domain: 'KPI_REGISTRY' })
    const job0 = createImportJob({ jobId: 'job-k4', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
  })
})
