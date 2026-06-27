// ============================================================
// FirestoreStagingRepository tests (DX-2/DX-3, Part 1, 11)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const jobDocs = new Map<string, Record<string, unknown>>()
const rowDocs = new Map<string, Map<string, Record<string, unknown>>>()

vi.mock('../firebase', () => ({
  db: {},
  COL: { IMPORT_JOBS: 'import_jobs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => {
    // doc(db, COL.IMPORT_JOBS, jobId) or doc(rowsCollectionRef, rowId)
    if (args.length === 3) return { kind: 'job', id: args[2] as string }
    const colRef = args[0] as { jobId: string }
    return { kind: 'row', jobId: colRef.jobId, id: args[1] as string }
  }),
  collection: vi.fn((...args: unknown[]) => {
    if (args.length >= 3) return { jobId: args[1] as string }   // collection(db, COL.IMPORT_JOBS, jobId, 'rows')
    return {}
  }),
  setDoc: vi.fn(async (ref: { kind: string; id: string; jobId?: string }, data: Record<string, unknown>) => {
    if (ref.kind === 'job') jobDocs.set(ref.id, { ...data })
    else {
      if (!rowDocs.has(ref.jobId!)) rowDocs.set(ref.jobId!, new Map())
      const existing = rowDocs.get(ref.jobId!)!.get(ref.id) ?? {}
      rowDocs.get(ref.jobId!)!.set(ref.id, { ...existing, ...data })
    }
  }),
  getDoc: vi.fn(async (ref: { kind: string; id: string }) => {
    const data = jobDocs.get(ref.id)
    return { exists: () => data != null, data: () => data }
  }),
  getDocs: vi.fn(async (q: { jobId?: string }) => {
    const jobId = q.jobId
    const rows = jobId ? [...(rowDocs.get(jobId)?.values() ?? [])] : []
    return { docs: rows.map((data) => ({ data: () => data, ref: {} })) }
  }),
  query: vi.fn((colRef: unknown) => colRef),
  orderBy: vi.fn(() => ({})),
  where:   vi.fn(() => ({})),
  limit:   vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    set:    vi.fn((ref: { kind: string; id: string; jobId?: string }, data: Record<string, unknown>) => {
      if (!rowDocs.has(ref.jobId!)) rowDocs.set(ref.jobId!, new Map())
      rowDocs.get(ref.jobId!)!.set(ref.id, data)
    }),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
  deleteDoc: vi.fn(async (ref: { id: string }) => { jobDocs.delete(ref.id) }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

import { FirestoreStagingRepository } from './firestoreStagingRepository'
import { createImportJob, runValidation } from './importJobEngine'
import type { ImportDomainAdapter, ImportValidationContext, ImportAuthorizationContext } from './importDomainAdapter'
import type { StagedImportRow } from './importJobTypes'

beforeEach(() => { jobDocs.clear(); rowDocs.clear() })

interface Raw { id: string }
interface Staged { id: string }

function makeAdapter(): ImportDomainAdapter<Raw, Staged, unknown> {
  return {
    domain: 'BRANCH',
    resolveColumns: () => [],
    parseRow: (r) => r as unknown as Raw,
    validateRow: (raw) => ({ classification: 'VALID', issues: [], staged: { id: raw.id } }),
    identityKey: (s) => s.id,
    detectFileDuplicates: (staged) => ({ deduplicated: staged, duplicateCount: 0 }),
    loadExistingRecords: async () => new Map(),
    diffAgainstExisting: () => 'CREATE',
    authorizeRow: () => ({ allowed: true }),
    toStagedRow: (staged, jobId, rowIndex, classification, issues): StagedImportRow<Staged> => ({
      rowId: `${jobId}-${rowIndex}`, jobId, rowIndex, identityKey: staged.id, classification, issues, staged, state: 'STAGED',
    }),
    commitBatch: async () => ({}),
  }
}

const vCtx: ImportValidationContext = { actorUid: 'u1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'u1', actorRole: 'admin' }

describe('DX-2/DX-3 — FirestoreStagingRepository', () => {
  it('saves and reloads a job (simulating a browser-reload resume)', async () => {
    const repo = new FirestoreStagingRepository<Staged>()
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'fjob-1', domain: 'BRANCH', createdBy: 'u1' })
    const { job, rows } = await runValidation(job0, adapter, [{ id: 'a' }, { id: 'b' }], vCtx, aCtx)

    await repo.saveJob(job)
    await repo.saveStagedRows(job.jobId, rows)

    const reloadedJob  = await repo.loadJob('fjob-1')
    const reloadedRows = await repo.loadStagedRows('fjob-1')

    expect(reloadedJob?.status).toBe('READY')
    expect(reloadedRows).toHaveLength(2)
  })

  it('returns null for a job that was never saved', async () => {
    const repo = new FirestoreStagingRepository()
    expect(await repo.loadJob('does-not-exist')).toBeNull()
  })

  it('updateRowState patches a single row without disturbing others', async () => {
    const repo = new FirestoreStagingRepository<Staged>()
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'fjob-2', domain: 'BRANCH', createdBy: 'u1' })
    const { rows } = await runValidation(job0, adapter, [{ id: 'a' }, { id: 'b' }], vCtx, aCtx)
    await repo.saveStagedRows('fjob-2', rows)

    await repo.updateRowState('fjob-2', rows[0].rowId, { state: 'COMMITTED' })
    const reloaded = await repo.loadStagedRows('fjob-2')
    expect(reloaded.find((r) => r.rowId === rows[0].rowId)?.state).toBe('COMMITTED')
    expect(reloaded.find((r) => r.rowId === rows[1].rowId)?.state).toBe('STAGED')
  })

  it('loadLastConfirmedBatchIndex reflects the job\'s persisted commitBatches', async () => {
    const repo = new FirestoreStagingRepository()
    const job0 = createImportJob({ jobId: 'fjob-3', domain: 'BRANCH', createdBy: 'u1' })
    const jobWithBatches = {
      ...job0,
      commitBatches: [
        { batchIndex: 0, attempted: 1, committed: 1, skipped: 0, failed: 0, errors: [], startedAt: '', endedAt: '' },
        { batchIndex: 1, attempted: 1, committed: 1, skipped: 0, failed: 0, errors: [], startedAt: '', endedAt: '' },
      ],
    }
    await repo.saveJob(jobWithBatches)
    expect(await repo.loadLastConfirmedBatchIndex('fjob-3')).toBe(1)
  })

  it('loadLastConfirmedBatchIndex is -1 for a job with no confirmed batches', async () => {
    const repo = new FirestoreStagingRepository()
    const job0 = createImportJob({ jobId: 'fjob-4', domain: 'BRANCH', createdBy: 'u1' })
    await repo.saveJob(job0)
    expect(await repo.loadLastConfirmedBatchIndex('fjob-4')).toBe(-1)
  })

  it('deleteAbandonedDraft removes a draft job but refuses once rows are committed', async () => {
    const repo = new FirestoreStagingRepository()
    const draft = createImportJob({ jobId: 'fjob-5', domain: 'BRANCH', createdBy: 'u1' })
    await repo.saveJob(draft)
    expect(await repo.deleteAbandonedDraft('fjob-5')).toBe(true)
    expect(await repo.loadJob('fjob-5')).toBeNull()

    const committedJob = { ...createImportJob({ jobId: 'fjob-6', domain: 'BRANCH', createdBy: 'u1' }), rowCounts: { parsed: 1, validated: 1, committed: 1, failed: 0, skipped: 0, remaining: 0 } }
    await repo.saveJob(committedJob)
    expect(await repo.deleteAbandonedDraft('fjob-6')).toBe(false)
    expect(await repo.loadJob('fjob-6')).not.toBeNull()
  })
})
