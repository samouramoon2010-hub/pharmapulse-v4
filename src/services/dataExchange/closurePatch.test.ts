// ============================================================
// Organization Onboarding Closure Patch — certification tests
// (Part 9: identity lifecycle, preview/commit separation, regression)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const userDocs = new Map<string, Record<string, unknown>>()
const targetDocs = new Map<string, Record<string, unknown>>()
const jobDocs = new Map<string, Record<string, unknown>>()
const jobRows = new Map<string, Map<string, Record<string, unknown>>>()
const auditCalls: Array<Record<string, unknown>> = []

function storeFor(collectionName: string): Map<string, Record<string, unknown>> {
  if (collectionName === 'users') return userDocs
  if (collectionName === 'personal_targets') return targetDocs
  if (collectionName === 'import_jobs') return jobDocs
  return new Map()
}

vi.mock('../firebase', () => ({
  db: {},
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', DISTRICTS: 'districts', REGIONS: 'regions',
    AUDIT_LOGS: 'audit_logs', PERSONAL_TARGETS: 'personal_targets', IMPORT_JOBS: 'import_jobs',
  },
}))

vi.mock('../auditService', () => ({
  logAction: vi.fn(async (params: Record<string, unknown>) => { auditCalls.push(params) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

vi.mock('../userService', () => ({
  createUser: vi.fn(async (params: { employeeId: string }) => {
    const uid = `auth-${params.employeeId}`
    userDocs.set(uid, { ...params, uid })
    return { uid, ...params }
  }),
  transferUser: vi.fn(async () => ({})),
}))

vi.mock('../pharmacyService', () => ({
  createPharmacy: vi.fn(async (data: { code: string }) => ({ id: `ph-${data.code}` })),
  updatePharmacy: vi.fn(async () => ({})),
}))

interface DocRef { collection: string; id: string; jobId?: string }

vi.mock('firebase/firestore', () => ({
  // doc(db, collectionName, id) — flat collection.
  // doc(rowsCollectionRef, rowId) — rows subcollection (2 args).
  doc: vi.fn((...args: unknown[]): DocRef => {
    if (args.length >= 3) return { collection: args[1] as string, id: args[2] as string }
    const ref = args[0] as { jobId: string }
    return { collection: 'rows', jobId: ref.jobId, id: args[1] as string }
  }),
  // collection(db, name) — flat collection.
  // collection(db, COL.IMPORT_JOBS, jobId, 'rows') — rows subcollection (4 args).
  collection: vi.fn((...args: unknown[]) => {
    if (args.length >= 4) return { jobId: args[2] as string }
    return { collection: args[1] as string }
  }),
  query: vi.fn((colRef: { collection?: string }, ..._clauses: unknown[]) => colRef),
  where: vi.fn((field: string, _op: string, value: unknown) => ({ field, value })),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  setDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => {
    if (ref.collection === 'rows') {
      if (!jobRows.has(ref.jobId!)) jobRows.set(ref.jobId!, new Map())
      jobRows.get(ref.jobId!)!.set(ref.id, data)
    } else {
      storeFor(ref.collection).set(ref.id, data)
    }
  }),
  updateDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => {
    const store = storeFor(ref.collection)
    store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: DocRef) => {
    const data = storeFor(ref.collection).get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async (q: { collection?: string; jobId?: string; field?: string; value?: unknown }) => {
    if (q?.jobId !== undefined) {
      const rows = [...(jobRows.get(q.jobId)?.values() ?? [])]
      return { docs: rows.map((data) => ({ data: () => data, ref: {} })) }
    }
    if (q?.collection === 'personal_targets' || q?.field === 'userId') {
      const docs = [...targetDocs.entries()]
        .filter(([, v]) => !q.field || v.userId === q.value)
        .map(([id, data]) => ({ id, data: () => data, ref: { collection: 'personal_targets', id } }))
      return { empty: docs.length === 0, docs }
    }
    return { empty: true, docs: [] }
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn((ref: DocRef, data: Record<string, unknown>) => {
      storeFor(ref.collection).set(ref.id, data)
    }),
    delete: vi.fn((ref: DocRef) => {
      storeFor(ref.collection).delete(ref.id)
    }),
    commit: vi.fn(async () => {}),
  })),
  deleteDoc: vi.fn(async (ref: DocRef) => {
    storeFor(ref.collection).delete(ref.id)
  }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: DocRef) => {
        const data = storeFor(ref.collection).get(ref.id)
        return { exists: () => data != null, data: () => data }
      },
      set: (ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        const store = storeFor(ref.collection)
        const existing = opts?.merge ? (store.get(ref.id) ?? {}) : {}
        store.set(ref.id, { ...existing, ...data })
      },
    }
    return fn(tx)
  }),
}))

import {
  activatePendingPharmacist, findPendingPharmacistRecord, deletePendingPharmacistIfNeverClaimed,
} from './pharmacistActivationService'
import {
  computeRowsSignature, validateOnboardingJob, commitOnboardingJob, type RunOnboardingParams,
} from './onboardingOrchestrator'
import { FirestoreStagingRepository } from './firestoreStagingRepository'
import type { GuardContext } from '../security/accessGuard'
import type { StagedImportRow } from './importJobTypes'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }

beforeEach(() => { userDocs.clear(); targetDocs.clear(); auditCalls.length = 0 })

// ── Identity lifecycle (Part 1/2/3) ─────────────────────────────
describe('Closure Patch — pharmacist activation / pending-record claim', () => {
  it('claims a pending record into the new Auth-linked doc, preserving operational fields', async () => {
    userDocs.set('pending_EMP1', {
      authStatus: 'PENDING_INVITATION', employeeId: 'EMP1', pharmacyId: 'ph-1',
      role: 'pharmacist', joiningDate: '2024-01-01', leavingDate: null,
    })

    const { uid, claimed, alreadyClaimed } = await activatePendingPharmacist({
      employeeId: 'EMP1', displayName: 'Sara', email: 's@example.com', password: 'x', role: 'pharmacist',
      actorId: 'admin-1', actorRole: 'admin',
    })

    expect(claimed).toBe(true)
    expect(alreadyClaimed).toBe(false)
    expect(uid).toBe('auth-EMP1')

    // Exactly one operational identity remains resolvable by the new uid —
    // the pending doc is archived (CLAIMED), never deleted.
    const newDoc = userDocs.get('auth-EMP1')
    expect(newDoc?.pharmacyId).toBe('ph-1')
    expect(newDoc?.activatedFromPendingId).toBe('pending_EMP1')

    const pendingDoc = userDocs.get('pending_EMP1')
    expect(pendingDoc?.authStatus).toBe('CLAIMED')
    expect(pendingDoc?.claimedByUid).toBe('auth-EMP1')
  })

  it('is idempotent — retrying activation after a successful claim never duplicates the identity', async () => {
    userDocs.set('pending_EMP2', { authStatus: 'PENDING_INVITATION', employeeId: 'EMP2', pharmacyId: null, role: 'pharmacist' })

    const first = await activatePendingPharmacist({
      employeeId: 'EMP2', displayName: 'A', email: 'a@example.com', password: 'x', role: 'pharmacist',
      actorId: 'admin-1', actorRole: 'admin',
    })
    expect(first.claimed).toBe(true)

    // Simulate a SECOND activation attempt for the SAME employeeId (e.g. a
    // retry after a network blip) creating a second Auth account, then
    // trying to claim the SAME already-claimed pending record.
    const second = await activatePendingPharmacist({
      employeeId: 'EMP2', displayName: 'A', email: 'a@example.com', password: 'x', role: 'pharmacist',
      actorId: 'admin-1', actorRole: 'admin',
    })
    expect(second.claimed).toBe(false)
    expect(second.alreadyClaimed).toBe(true)

    // The pending doc was never re-claimed by the second uid.
    expect(userDocs.get('pending_EMP2')?.claimedByUid).toBe('auth-EMP2')
  })

  it('activating an employeeId with no pending record behaves exactly like a normal createUser()', async () => {
    const { uid, claimed } = await activatePendingPharmacist({
      employeeId: 'EMP-NEW', displayName: 'B', email: 'b@example.com', password: 'x', role: 'pharmacist',
      actorId: 'admin-1', actorRole: 'admin',
    })
    expect(uid).toBe('auth-EMP-NEW')
    expect(claimed).toBe(false)
  })

  it('migrates personal_targets pre-allocated to the pending doc id to the real uid', async () => {
    userDocs.set('pending_EMP3', { authStatus: 'PENDING_INVITATION', employeeId: 'EMP3', pharmacyId: 'ph-1', role: 'pharmacist' })
    targetDocs.set('pending_EMP3_ph-1_2024-01', { userId: 'pending_EMP3', pharmacyId: 'ph-1', month: '2024-01', value: 100 })

    await activatePendingPharmacist({
      employeeId: 'EMP3', displayName: 'C', email: 'c@example.com', password: 'x', role: 'pharmacist',
      actorId: 'admin-1', actorRole: 'admin',
    })

    expect(targetDocs.has('pending_EMP3_ph-1_2024-01')).toBe(false)
    const migrated = targetDocs.get('auth-EMP3_ph-1_2024-01')
    expect(migrated?.userId).toBe('auth-EMP3')
    expect(migrated?.value).toBe(100)
  })

  it('findPendingPharmacistRecord is read-only and never writes', async () => {
    userDocs.set('pending_EMP4', { authStatus: 'PENDING_INVITATION', employeeId: 'EMP4' })
    const found = await findPendingPharmacistRecord('EMP4')
    expect(found?.employeeId).toBe('EMP4')
    expect(userDocs.get('pending_EMP4')?.authStatus).toBe('PENDING_INVITATION')
  })

  it('refuses to delete a pending record that was already claimed', async () => {
    userDocs.set('pending_EMP5', { authStatus: 'CLAIMED', employeeId: 'EMP5' })
    const deleted = await deletePendingPharmacistIfNeverClaimed('EMP5')
    expect(deleted).toBe(false)
    expect(userDocs.has('pending_EMP5')).toBe(true)
  })

  it('deletes an unclaimed pending record when explicitly requested', async () => {
    userDocs.set('pending_EMP6', { authStatus: 'PENDING_INVITATION', employeeId: 'EMP6' })
    const deleted = await deletePendingPharmacistIfNeverClaimed('EMP6')
    expect(deleted).toBe(true)
    expect(userDocs.has('pending_EMP6')).toBe(false)
  })
})

// ── Preview/Commit separation (Part 4/6) ────────────────────────
function baseParams(jobIdPrefix: string, overrides: Partial<RunOnboardingParams['rows']> = {}): RunOnboardingParams {
  return {
    jobIdPrefix, guardCtx: ADMIN, actorRole: 'admin',
    rows: { pharmacistRows: [{ 'employee id': 'EMP10', name: 'Sara', role: 'pharmacist' }], ...overrides },
    existing: {
      groups: [], regions: [], branches: [],
      pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
      primaryAssignmentByEmployeeId: new Map(),
    },
  }
}

describe('Closure Patch — Preview/Commit separation', () => {
  it('validateOnboardingJob never writes to production collections — only import_jobs staging', async () => {
    const repo = new FirestoreStagingRepository()
    const before = userDocs.size
    const preview = await validateOnboardingJob(baseParams('cp-1'), repo)

    expect(preview.readyToCommit).toBe(true)
    expect(preview.domains[0].creates).toBe(1)
    // No pharmacist doc was ever written — Validate/Preview must not commit.
    expect(userDocs.size).toBe(before)
  })

  it('persists the previewed job as READY so the UI can render it after a reload', async () => {
    const repo = new FirestoreStagingRepository()
    const preview = await validateOnboardingJob(baseParams('cp-2'), repo)
    const reloaded = await repo.loadJob(preview.jobs.pharmacists!.jobId)
    expect(reloaded?.status).toBe('READY')
    expect(reloaded?.previewSignature).toBe(preview.previewSignature)
  })

  it('commitOnboardingJob refuses to commit when existing data changed since the preview (stale signature)', async () => {
    const repo = new FirestoreStagingRepository()
    const params = baseParams('cp-3')
    const preview = await validateOnboardingJob(params, repo)

    // Simulate a Firestore change between Preview and Commit: the
    // employeeId is now already active elsewhere.
    const staleExisting: RunOnboardingParams['existing'] = {
      ...params.existing,
      pharmacistsByEmployeeId: new Map([
        ['EMP10', { id: 'auth-EMP10', employeeId: 'EMP10', email: null, role: 'pharmacist', pharmacyId: null, authStatus: 'ACTIVE' }],
      ]),
    }

    const outcome = await commitOnboardingJob(
      { ...params, existing: staleExisting, expectedPreviewSignature: preview.previewSignature },
      repo,
    )

    expect(outcome.stale).toBe(true)
    expect(outcome.result).toBeUndefined()
    // No pharmacist doc was written by the refused commit.
    expect(userDocs.has('pending_EMP10')).toBe(false)
  })

  it('commitOnboardingJob commits when the signature still matches a fresh re-validation', async () => {
    const repo = new FirestoreStagingRepository()
    const params = baseParams('cp-4')
    const preview = await validateOnboardingJob(params, repo)

    const outcome = await commitOnboardingJob(
      { ...params, expectedPreviewSignature: preview.previewSignature },
      repo,
    )

    expect(outcome.stale).toBe(false)
    expect(outcome.result?.pharmacists?.result.committed).toBe(1)
    expect(userDocs.has('pending_EMP10')).toBe(true)
  })

  it('refuses a second commit against an already-completed job', async () => {
    const repo = new FirestoreStagingRepository()
    const params = baseParams('cp-5')
    const preview = await validateOnboardingJob(params, repo)
    await commitOnboardingJob({ ...params, expectedPreviewSignature: preview.previewSignature }, repo)

    const secondAttempt = await commitOnboardingJob(
      { ...params, expectedPreviewSignature: preview.previewSignature }, repo,
    )

    expect(secondAttempt.stale).toBe(true)
    expect(secondAttempt.staleReason).toMatch(/already committed/i)
  })

  it('computeRowsSignature is deterministic and order-independent', () => {
    const rowA: StagedImportRow<unknown> = { rowId: 'a', jobId: 'j', rowIndex: 1, identityKey: 'a', classification: 'VALID', issues: [], staged: { x: 1 }, state: 'STAGED' }
    const rowB: StagedImportRow<unknown> = { rowId: 'b', jobId: 'j', rowIndex: 2, identityKey: 'b', classification: 'UPDATE', issues: [], staged: { x: 2 }, state: 'STAGED' }
    expect(computeRowsSignature([rowA, rowB])).toBe(computeRowsSignature([rowB, rowA]))
  })

  it('computeRowsSignature changes when a row classification changes', () => {
    const row: StagedImportRow<unknown> = { rowId: 'a', jobId: 'j', rowIndex: 1, identityKey: 'a', classification: 'VALID', issues: [], staged: { x: 1 }, state: 'STAGED' }
    const changed = { ...row, classification: 'CONFLICT' as const }
    expect(computeRowsSignature([row])).not.toBe(computeRowsSignature([changed]))
  })
})
