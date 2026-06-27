// ============================================================
// DX-7 (Large File Processing, Progress, Retry, Resume) —
// actualsImportRunner tests. Mirrors kpiTargetsImportRunner.test.ts's
// mocking conventions, extended for checkpoint/resume/retry/cancel.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const jobDocs   = new Map<string, Record<string, unknown>>()
const entryDocs = new Map<string, Record<string, unknown>>()
const rowDocs   = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []

vi.mock('../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', DISTRICTS: 'districts', REGIONS: 'regions',
    AUDIT_LOGS: 'audit_logs', IMPORT_JOBS: 'import_jobs', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', PERSONAL_TARGETS: 'personal_targets', KPI_REGISTRY: 'kpi_registry',
  },
}))

interface DocRef { col: string; id: string }

function storeFor(col: string) {
  if (col === 'import_jobs') return jobDocs
  if (col === 'kpi_entries') return entryDocs
  return rowDocs   // 'import_job_rows' (the rows subcollection)
}

vi.mock('firebase/firestore', () => ({
  // doc(db, col, id) for top-level docs; doc(collectionRef, id) for the
  // import_jobs/{jobId}/rows subcollection — distinguished by whether
  // the first arg already carries a `.col` (a collection ref) or not
  // (the plain mocked `db` object, {}).
  doc: vi.fn((a: unknown, b: unknown, c?: unknown): DocRef => {
    if (a && typeof a === 'object' && 'col' in (a as DocRef)) {
      return { col: (a as DocRef).col, id: b as string }
    }
    return { col: b as string, id: c as string }
  }),
  collection: vi.fn((_db: unknown, col: string, ...rest: unknown[]): DocRef => {
    if (rest.length >= 2 && rest[1] === 'rows') return { col: 'import_job_rows', id: rest[0] as string }
    return { col, id: rest[0] as string }
  }),
  query:   vi.fn((ref: unknown) => ref),
  where:   vi.fn(() => ({})), orderBy: vi.fn(() => ({})), limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => {
    storeFor(ref.col).set(ref.id, { ...(storeFor(ref.col).get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: DocRef) => {
    const data = storeFor(ref.col).get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async (refOrQuery: DocRef | undefined) => {
    if (refOrQuery && refOrQuery.col === 'import_job_rows') {
      const jobId = refOrQuery.id
      const matches = [...rowDocs.entries()].filter(([id]) => id.startsWith(`${jobId}-`))
      return { empty: matches.length === 0, docs: matches.map(([id, data]) => ({ id, data: () => data })) }
    }
    return { empty: true, docs: [] }
  }),
  addDoc: vi.fn(async () => ({ id: 'audit-1' })),
  writeBatch: vi.fn(() => ({
    set: vi.fn((ref: DocRef, data: Record<string, unknown>) => {
      storeFor(ref.col).set(ref.id, { ...(storeFor(ref.col).get(ref.id) ?? {}), ...data })
    }),
    update: vi.fn(),
    delete: vi.fn((ref: DocRef) => { storeFor(ref.col).delete(ref.id) }),
    commit: vi.fn(async () => {}),
  })),
  deleteDoc: vi.fn(async (ref: DocRef) => { storeFor(ref.col).delete(ref.id) }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../auditService', () => ({
  logAction: vi.fn(async (p: Record<string, unknown>) => { auditCalls.push(p) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

vi.mock('../historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

import { setDoc as setDocReal } from 'firebase/firestore'
// This file mocks firebase/firestore with simplified {col,id} refs (not
// real DocumentReference objects) — cast away the real SDK types rather
// than fighting them, exactly at this one boundary.
const setDoc = setDocReal as unknown as ReturnType<typeof vi.fn<(ref: { col: string; id: string }, data: Record<string, unknown>) => Promise<void>>>
import {
  validateActualsJob, commitActualsJob, resumeOrRetryActualsJob, jobIdForActualsDomain,
} from './actualsImportRunner'
import { FirestoreStagingRepository } from './firestoreStagingRepository'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { GuardContext } from '../security/accessGuard'
import type { ActualsExistingData } from './actualsImportRunner'
import { DX7_CONFIG } from './dx7Config'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const repo = new FirestoreStagingRepository()

const EXISTING: ActualsExistingData = {
  branchesWithManager: [{ id: 'ph-1', code: 'B1', name: 'Branch One', active: true, managerUid: 'mgr-1' }],
  branchesPlain: [{ id: 'ph-1', code: 'B1', active: true }],
  registry: DEFAULT_KPI_REGISTRY,
  pharmacistsByEmployeeId: new Map(),
  pharmacistsByEmail: new Map(),
}

beforeEach(() => {
  jobDocs.clear(); entryDocs.clear(); rowDocs.clear(); auditCalls.length = 0
  setDoc.mockClear()
})

function rowsFor(kpiKeys: string[], baseDate = '2026-06-04') {
  return kpiKeys.map((k) => ({ date: baseDate, 'branch code': 'B1', 'kpi key': k, 'actual value': '100' }))
}

describe('DX-7 — Actuals Import Runner (chunked, checkpointed, resumable, cancellable)', () => {
  it('validates a Branch Actuals job, persists it to import_jobs staging, and reports readyToCommit', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-1', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
    }, repo)

    expect(preview.readyToCommit).toBe(true)
    expect(preview.summary.creates).toBe(1)
    expect(preview.totalRowCount).toBe(1)
    const jobId = jobIdForActualsDomain('ar-1', 'BRANCH_ACTUALS')
    expect(jobDocs.has(jobId)).toBe(true)
  })

  it('caps previewRows at DX7_CONFIG.PREVIEW_ROW_CAP while keeping the full row/summary counts uncapped', async () => {
    const many = Array.from({ length: DX7_CONFIG.PREVIEW_ROW_CAP + 50 }, (_, i) => ({
      date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': String(i + 1),
    }))
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-cap', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: many, existing: EXISTING,
    }, repo)

    expect(preview.totalRowCount).toBe(DX7_CONFIG.PREVIEW_ROW_CAP + 50)
    expect(preview.previewRows.length).toBe(DX7_CONFIG.PREVIEW_ROW_CAP)
    expect(preview.rows.length).toBe(DX7_CONFIG.PREVIEW_ROW_CAP + 50)
  })

  it('fails fast on a file exceeding MAX_ROWS_PER_FILE without attempting validation', async () => {
    const tooMany = Array.from({ length: DX7_CONFIG.MAX_ROWS_PER_FILE + 1 }, () => ({
      date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '1',
    }))
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-huge', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: tooMany, existing: EXISTING,
    }, repo)

    expect(preview.job.status).toBe('FAILED')
    expect(preview.rows[0].issues.some((i) => i.code === 'FILE_TOO_LARGE')).toBe(true)
  })

  it('commits a previewed job and writes the real kpi_entries document, attributed to managerUid', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-2', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
    }, repo)

    const outcome = await commitActualsJob({
      jobIdPrefix: 'ar-2', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)

    expect(outcome.stale).toBe(false)
    expect(outcome.result?.committed).toBe(1)
    expect(entryDocs.get('mgr-1_ph-1_2026-06-04')).toMatchObject({ userId: 'mgr-1', wasfaty: 100 })
  })

  it('refuses a stale preview — committed values changed since this preview was generated', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-3', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
    }, repo)

    // Simulate the underlying record changing between preview and commit.
    entryDocs.set('mgr-1_ph-1_2026-06-04', { userId: 'mgr-1', wasfaty: 999 })

    const outcome = await commitActualsJob({
      jobIdPrefix: 'ar-3', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)

    expect(outcome.stale).toBe(true)
  })

  it('checkpoints after every row — commitBatches grows incrementally and is persisted to import_jobs', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-4', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
    }, repo)

    const seenBatchCounts: number[] = []
    await commitActualsJob({
      jobIdPrefix: 'ar-4', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
      onProgress: (totals) => { seenBatchCounts.push(totals.committed) },
    }, repo)

    expect(seenBatchCounts).toEqual([1, 2, 3])
    const jobId = jobIdForActualsDomain('ar-4', 'BRANCH_ACTUALS')
    const finalJob = await repo.loadJob(jobId)
    expect(finalJob?.commitBatches).toHaveLength(3)
    expect(finalJob?.status).toBe('COMPLETED')
  })

  it('cancellation stops before the next chunk — already-committed rows are never rolled back, status is PARTIALLY_COMPLETED', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-5', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
    }, repo)

    let calls = 0
    const outcome = await commitActualsJob({
      jobIdPrefix: 'ar-5', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
      shouldCancel: () => { calls++; return calls > 1 },  // commit row 1, then cancel before row 2
    }, repo)

    expect(outcome.result?.committed).toBe(1)
    expect(outcome.result?.status).toBe('PARTIALLY_COMPLETED')

    const jobId = jobIdForActualsDomain('ar-5', 'BRANCH_ACTUALS')
    const job = await repo.loadJob(jobId)
    expect(job?.status).toBe('PARTIALLY_COMPLETED')
    expect(job?.commitBatches).toHaveLength(1)
  })

  it('resumeOrRetryActualsJob continues an interrupted commit without replaying the already-committed row', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-6', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
    }, repo)

    let calls = 0
    await commitActualsJob({
      jobIdPrefix: 'ar-6', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales', 'sl']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
      shouldCancel: () => { calls++; return calls > 1 },
    }, repo)

    setDoc.mockClear()
    const resumed = await resumeOrRetryActualsJob({
      jobIdPrefix: 'ar-6', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin', existing: EXISTING,
    }, repo)

    expect(resumed.stale).toBe(false)
    expect(resumed.result?.committed).toBe(3)
    expect(resumed.result?.status).toBe('COMPLETED')

    const jobId = jobIdForActualsDomain('ar-6', 'BRANCH_ACTUALS')
    const finalJob = await repo.loadJob(jobId)
    expect(finalJob?.commitBatches).toHaveLength(3)
    expect(finalJob?.commitBatches[0]).toMatchObject({ batchIndex: 0, committed: 1 })
    // Only the 2 remaining rows were re-attempted via setDoc — the first
    // row's already-committed kpi_entries write is never replayed.
    expect(setDoc.mock.calls.filter(([ref]) => ref.col === 'kpi_entries').length).toBe(2)
  })

  it('resumeOrRetryActualsJob retries only the failed row of a PARTIALLY_COMPLETED job, never the already-committed one', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-7', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales']), existing: EXISTING,
    }, repo)

    let kpiEntryWrites = 0
    setDoc.mockImplementation(async (ref: { col: string; id: string }, data: Record<string, unknown>) => {
      if (ref.col === 'kpi_entries') {
        kpiEntryWrites++
        if (kpiEntryWrites === 2) throw new Error('Simulated transient Firestore failure')
      }
      storeFor(ref.col).set(ref.id, { ...(storeFor(ref.col).get(ref.id) ?? {}), ...data })
    })

    const first = await commitActualsJob({
      jobIdPrefix: 'ar-7', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)
    expect(first.result?.status).toBe('PARTIALLY_COMPLETED')
    expect(first.result?.committed).toBe(1)
    expect(first.result?.failed).toBe(1)

    // Restore normal behavior for the retry.
    setDoc.mockImplementation(async (ref: { col: string; id: string }, data: Record<string, unknown>) => {
      storeFor(ref.col).set(ref.id, { ...(storeFor(ref.col).get(ref.id) ?? {}), ...data })
    })

    const retried = await resumeOrRetryActualsJob({
      jobIdPrefix: 'ar-7', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin', existing: EXISTING,
    }, repo)

    expect(retried.result?.status).toBe('COMPLETED')
    expect(retried.result?.committed).toBe(2)
    expect(retried.result?.failed).toBe(0)

    const jobId = jobIdForActualsDomain('ar-7', 'BRANCH_ACTUALS')
    const finalJob = await repo.loadJob(jobId)
    expect(finalJob?.commitBatches).toHaveLength(2)
    expect(finalJob?.commitBatches[0]).toMatchObject({ batchIndex: 0, committed: 1 })
    expect(finalJob?.commitBatches[1]).toMatchObject({ batchIndex: 1, committed: 1, failed: 0 })
  })

  it('refuses to resume/retry a fully COMPLETED job', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-8', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
    }, repo)
    await commitActualsJob({
      jobIdPrefix: 'ar-8', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)

    const resumed = await resumeOrRetryActualsJob({
      jobIdPrefix: 'ar-8', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin', existing: EXISTING,
    }, repo)
    expect(resumed.stale).toBe(true)
  })

  it('refuses a second concurrent commit against the same already-COMMITTING/COMMITTED job (double-commit protection)', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-9', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
    }, repo)
    await commitActualsJob({
      jobIdPrefix: 'ar-9', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)

    const second = await commitActualsJob({
      jobIdPrefix: 'ar-9', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)
    expect(second.stale).toBe(true)
  })

  it('enforces MAX_RETRY_ATTEMPTS — refuses to retry past the configured limit', async () => {
    const preview = await validateActualsJob({
      jobIdPrefix: 'ar-10', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales']), existing: EXISTING,
    }, repo)

    setDoc.mockImplementation(async (ref: { col: string; id: string }, data: Record<string, unknown>) => {
      if (ref.col === 'kpi_entries') throw new Error('Always fails')
      storeFor(ref.col).set(ref.id, { ...(storeFor(ref.col).get(ref.id) ?? {}), ...data })
    })

    await commitActualsJob({
      jobIdPrefix: 'ar-10', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: rowsFor(['wasfaty', 'sales']), existing: EXISTING,
      expectedPreviewSignature: preview.previewSignature,
    }, repo)

    for (let i = 0; i < DX7_CONFIG.MAX_RETRY_ATTEMPTS; i++) {
      await resumeOrRetryActualsJob({
        jobIdPrefix: 'ar-10', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin', existing: EXISTING,
      }, repo)
    }

    const final = await resumeOrRetryActualsJob({
      jobIdPrefix: 'ar-10', domain: 'BRANCH_ACTUALS', guardCtx: ADMIN, actorRole: 'admin', existing: EXISTING,
    }, repo)
    expect(final.stale).toBe(true)
    expect(final.staleReason).toMatch(/retried/)
  })
})
