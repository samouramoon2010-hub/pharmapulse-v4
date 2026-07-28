// ============================================================
// importBatchRef integrity — Maintenance Quick Wins
//
// saveKpiEntry() (kpiService.js) previously accepted ANY non-empty
// importBatchRef string for an isDataExchangeImport write — it never
// verified the referenced import_jobs document actually exists. This
// is the exact gap flagged by PR-1G-A's referential-integrity audit
// ("importBatchRef has no existence check against import_jobs" — see
// docs/production/LAUNCH_BLOCKERS_REGISTER.md P1-3): currently latent
// (the real pipeline always persists the job before commit — see
// actualsImportRunner.ts's validateActualsJob()/repo.saveJob()), but a
// silent dangling reference the moment anything calls saveKpiEntry
// without going through that pipeline.
//
// These tests call the REAL saveKpiEntry() against a mocked Firestore
// that models two independent collections (kpi_entries, import_jobs),
// exactly mirroring the real production shape — never a parallel
// re-implementation of the check.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const entryDocs = new Map<string, Record<string, unknown>>()
const jobDocs   = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []
const historyCalls: unknown[][] = []

vi.mock('./firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: { KPI_ENTRIES: 'kpi_entries', AUDIT_LOGS: 'audit_logs', IMPORT_JOBS: 'import_jobs' },
}))

function storeFor(col: string) {
  return col === 'import_jobs' ? jobDocs : entryDocs
}

vi.mock('firebase/firestore', () => ({
  collection:  vi.fn(() => ({})),
  doc:         vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  setDoc:      vi.fn(async (ref: { col: string; id: string }, data: Record<string, unknown>) => {
    const store = storeFor(ref.col)
    store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data })
  }),
  getDoc:      vi.fn(async (ref: { col: string; id: string }) => {
    const data = storeFor(ref.col).get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs:     vi.fn(async () => ({ docs: [] })),
  deleteDoc:   vi.fn(async () => {}),
  query:       vi.fn(() => ({})),
  where:       vi.fn(() => ({})),
  orderBy:     vi.fn(() => ({})),
  onSnapshot:  vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('./auditService', () => ({
  logAction:    vi.fn(async (p: Record<string, unknown>) => { auditCalls.push(p) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

vi.mock('./historyService', () => ({
  triggerHistorySnapshots: vi.fn(async (...args: unknown[]) => { historyCalls.push(args) }),
}))

import { saveKpiEntry } from './kpiService'

const TODAY = new Date().toISOString().split('T')[0]

beforeEach(() => {
  entryDocs.clear()
  jobDocs.clear()
  auditCalls.length = 0
  historyCalls.length = 0
  jobDocs.set('job-real', { jobId: 'job-real', status: 'READY' })
})

describe('importBatchRef integrity — isDataExchangeImport writes require a real import_jobs doc', () => {
  it('1. accepts a valid importBatchRef that references an existing import job', async () => {
    const result = await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 100,
    })
    expect(result.id).toBe('user-1_ph-1_' + TODAY)
    expect(entryDocs.get('user-1_ph-1_' + TODAY)).toMatchObject({ importedViaDataExchange: true, importBatchRef: 'job-real' })
  })

  it('2. rejects a missing/nonexistent referenced job — throws, never writes', async () => {
    await expect(saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-does-not-exist',
      wasfaty: 100,
    })).rejects.toThrow(/does not reference an existing import job/)
    expect(entryDocs.size).toBe(0)
  })

  it('3. blank/absent importBatchRef is allowed for manual (non-import) records — existing contract unchanged', async () => {
    // Manual entry (isDataExchangeImport omitted): saveKpiEntry always
    // substitutes auth.currentUser.uid ('admin-1' in this mock) for the
    // owner, per its pre-existing, unmodified contract — not affected by
    // this phase's importBatchRef check.
    const result = await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'user-1', actorRole: 'pharmacist',
      wasfaty: 50,
    })
    expect(result.id).toBe('admin-1_ph-1_' + TODAY)
    expect(entryDocs.get('admin-1_ph-1_' + TODAY)).toMatchObject({ wasfaty: 50 })
    // Manual entries never carry the import attribution marker
    expect(entryDocs.get('admin-1_ph-1_' + TODAY)).not.toHaveProperty('importedViaDataExchange')
  })

  it('4. an invalid-type importBatchRef (non-string) is rejected before the existence check even runs', async () => {
    await expect(saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 12345 as unknown as string,
      wasfaty: 100,
    })).rejects.toThrow(/requires a non-empty importBatchRef/)
    expect(entryDocs.size).toBe(0)
  })

  it('4b. an empty-string importBatchRef is rejected the same way (pre-existing contract, unchanged)', async () => {
    await expect(saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: '   ',
      wasfaty: 100,
    })).rejects.toThrow(/requires a non-empty importBatchRef/)
  })

  it('5. no partial commit after failed validation — no entry doc, no audit log, no history snapshot', async () => {
    await expect(saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-does-not-exist',
      wasfaty: 100,
    })).rejects.toThrow()
    expect(entryDocs.size).toBe(0)
    expect(auditCalls.length).toBe(0)
    expect(historyCalls.length).toBe(0)
  })

  it('6. existing deduplication (composite doc id) remains unchanged — re-importing the same row upserts, never duplicates', async () => {
    await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 100,
    })
    await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 200,
    })
    expect(entryDocs.size).toBe(1)
    expect(entryDocs.get('user-1_ph-1_' + TODAY)).toMatchObject({ wasfaty: 200 })
  })

  it('7. existing import audit linkage remains unchanged — a valid import write still logs an audit entry for kpi_entries', async () => {
    await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 100,
    })
    expect(auditCalls.length).toBe(1)
    expect(auditCalls[0]).toMatchObject({ collection: 'kpi_entries', userId: 'admin-1', userRole: 'admin' })
  })

  it('8. role/scope behavior is unchanged — isDataExchangeImport still requires an explicit userId regardless of actor role', async () => {
    await expect(saveKpiEntry({
      pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 100,
    } as never)).rejects.toThrow(/requires an explicit userId/)
  })

  it('9. the existence check itself makes no additional Firestore mutation — only a getDoc read, never a write, against import_jobs', async () => {
    const before = new Map(jobDocs)
    await saveKpiEntry({
      userId: 'user-1', pharmacyId: 'ph-1', date: TODAY,
      actorId: 'admin-1', actorRole: 'admin',
      isDataExchangeImport: true, importBatchRef: 'job-real',
      wasfaty: 100,
    })
    expect(jobDocs).toEqual(before) // import_jobs collection is read-only from saveKpiEntry's perspective
  })
})
