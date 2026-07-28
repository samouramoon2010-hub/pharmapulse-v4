// ============================================================
// Universal AI Intake — Phase 2.1 Admin executor tests
//
// Runs against a hand-built, faithful in-memory fake of the Admin
// SDK's Firestore surface (`.collection(x).doc(y).get()/.set()`),
// implementing the SAME semantics that matter here: `merge:true`
// replaces a nested map field wholesale (it does NOT deep-merge), a
// missing doc's `.get()` returns `exists:false`, and `.doc()` with no
// id generates a fresh id. This is the documented alternative to a
// live Firebase Emulator Suite run (no emulator/Java toolchain is
// configured in this repo — see AI_INTAKE_PHASE_2_1_TEST_REPORT.md).
// ============================================================
import { describe, it, expect, vi } from 'vitest'

// Real firebase-admin FieldValue sentinels are opaque class instances —
// mocked here (same convention connectorHttpHandler.test.ts uses for
// the client SDK) so the fake Firestore below can recognize and apply
// server-timestamp/array-union semantics deterministically, without
// depending on firebase-admin's private internal shape.
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: (app: unknown) => {
    if (!app) throw new Error('The default Firebase app does not exist. Make sure you call initializeApp() before using any of the Firebase services.')
    return app
  },
  FieldValue: {
    serverTimestamp: () => ({ __serverTimestamp: true }),
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  },
}))

import { createAdminFirestoreCommitExecutor, createInMemoryOperationStateStore } from './adminFirestoreCommitExecutor'
import type { CommitOperation, CommitPlan } from '../../src/services/connector/commitPlan/commitOperationTypes'

let autoIdCounter = 0

function createFakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>()

  function docRef(collectionName: string, id?: string) {
    const docId = id ?? `auto-${++autoIdCounter}`
    const key = `${collectionName}/${docId}`
    return {
      id: docId,
      async get() {
        const data = docs.get(key)
        return { exists: data !== undefined, data: () => data }
      },
      async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
        const existing = docs.get(key) ?? {}
        const resolved: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && '__serverTimestamp' in v) { resolved[k] = 'TIMESTAMP'; continue }
          if (v && typeof v === 'object' && '__arrayUnion' in v) {
            const currentArr = Array.isArray((existing as any)[k]) ? (existing as any)[k] as unknown[] : []
            resolved[k] = [...new Set([...currentArr, ...(v as any).__arrayUnion as unknown[]])]
            continue
          }
          resolved[k] = v
        }
        if (opts?.merge) {
          docs.set(key, { ...existing, ...resolved })
        } else {
          docs.set(key, resolved)
        }
      },
      async add(data: Record<string, unknown>) { docs.set(`${collectionName}/auto-${++autoIdCounter}`, data) },
    }
  }

  return {
    collection(name: string) {
      return {
        doc(id?: string) { return docRef(name, id) },
        async add(data: Record<string, unknown>) { docs.set(`${name}/auto-${++autoIdCounter}`, data); return { id: `auto-${autoIdCounter}` } },
      }
    },
    _docs: docs,
  }
}

function makeOp(overrides: Partial<CommitOperation> = {}): CommitOperation {
  return {
    type: 'create', entityType: 'REGION', collectionKey: 'regions', documentId: 'RUH',
    data: { code: 'RUH', name: 'Riyadh' }, merge: true, identityKey: 'RUH',
    sourceRowId: 'r1', idempotencyKey: 'job-1:RUH',
    audit: { entityType: 'REGION', sourceRowId: 'r1', actorUid: 'a1', actorRole: 'admin' },
    ...overrides,
  }
}
function makePlan(operations: CommitOperation[]): CommitPlan {
  return { jobId: 'job-1', entityType: 'REGION', operations, skips: [], conflicts: [], validationFailures: [], expectedCreateCount: operations.length, expectedUpdateCount: 0, planSignature: 'sig' }
}

describe('AdminFirestoreCommitExecutor — create/update', () => {
  it('creates a new document at the deterministic id with a create-marked result', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const result = await executor.execute(makePlan([makeOp()]))
    expect(result.created).toBe(1)
    expect(db._docs.get('regions/RUH')).toMatchObject({ code: 'RUH', name: 'Riyadh' })
  })

  it('updates an existing document without clobbering unrelated fields (merge:true)', async () => {
    const db = createFakeFirestore() as any
    await db.collection('regions').doc('RUH').set({ code: 'RUH', name: 'Old Name', unrelatedField: 'keep-me' })
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    await executor.execute(makePlan([makeOp({ type: 'update', data: { name: 'New Name' } })]))
    expect(db._docs.get('regions/RUH')).toMatchObject({ name: 'New Name', unrelatedField: 'keep-me' })
  })

  it('generates an auto-id when documentId is undefined', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const result = await executor.execute(makePlan([makeOp({ documentId: undefined })]))
    expect(result.executed[0].documentId).toMatch(/^auto-/)
  })
})

describe('AdminFirestoreCommitExecutor — nested map field (targets/actuals)', () => {
  it('flat top-level field (path: "") never needs a read — Firestore merge handles it', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      entityType: 'BRANCH_TARGET', collectionKey: 'targets', documentId: 'ph1_2026-07',
      data: { pharmacyId: 'ph1', month: '2026-07' }, nestedMapField: { path: '', key: 'wasfatyTarget', value: 100 },
    })
    await executor.execute(makePlan([op]))
    expect(db._docs.get('targets/ph1_2026-07')).toMatchObject({ wasfatyTarget: 100, pharmacyId: 'ph1' })
  })

  it('nested sub-map field (path: "targets") preserves OTHER keys already in the sub-map — no clobber', async () => {
    const db = createFakeFirestore() as any
    await db.collection('personal_targets').doc('u1_ph1_2026-07').set({
      userId: 'u1', pharmacyId: 'ph1', month: '2026-07', targets: { salesTarget: 500, slTarget: 90 },
    })
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      entityType: 'PHARMACIST_TARGET', collectionKey: 'personal_targets', documentId: 'u1_ph1_2026-07',
      data: { userId: 'u1', pharmacyId: 'ph1', month: '2026-07' },
      nestedMapField: { path: 'targets', key: 'wasfatyTarget', value: 120 },
    })
    await executor.execute(makePlan([op]))
    const doc = db._docs.get('personal_targets/u1_ph1_2026-07') as any
    expect(doc.targets).toEqual({ salesTarget: 500, slTarget: 90, wasfatyTarget: 120 })
  })

  it('two different-KPI actuals rows on the same date accumulate into kpiValues without clobbering each other', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const row1 = makeOp({
      entityType: 'BRANCH_ACTUALS', collectionKey: 'kpi_entries', documentId: 'mgr1_ph1_2026-07-01',
      data: { userId: 'mgr1', pharmacyId: 'ph1', date: '2026-07-01', wasfaty: 10 },
      nestedMapField: { path: 'kpiValues', key: 'wasfaty', value: 10 },
      sourceRowId: 'row-a', idempotencyKey: 'job-1:opA',
    })
    const row2 = makeOp({
      entityType: 'BRANCH_ACTUALS', collectionKey: 'kpi_entries', documentId: 'mgr1_ph1_2026-07-01',
      data: { userId: 'mgr1', pharmacyId: 'ph1', date: '2026-07-01', sl: 95 },
      nestedMapField: { path: 'kpiValues', key: 'sl', value: 95 },
      sourceRowId: 'row-b', idempotencyKey: 'job-1:opB',
    })
    await executor.execute(makePlan([row1, row2]))
    const doc = db._docs.get('kpi_entries/mgr1_ph1_2026-07-01') as any
    expect(doc.kpiValues).toEqual({ wasfaty: 10, sl: 95 })
  })
})

describe('AdminFirestoreCommitExecutor — per-domain coverage (Step 5)', () => {
  it('GROUP create writes to the districts collection at the deterministic code id', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({ entityType: 'GROUP', collectionKey: 'districts', documentId: 'GRP1', data: { code: 'GRP1', name: 'Group 1', regionId: 'RUH' } })
    const result = await executor.execute(makePlan([op]))
    expect(result.created).toBe(1)
    expect(db._docs.get('districts/GRP1')).toMatchObject({ code: 'GRP1', regionId: 'RUH' })
  })

  it('BRANCH create writes to the pharmacies collection', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({ entityType: 'BRANCH', collectionKey: 'pharmacies', documentId: 'BR1', data: { code: 'BR1', name: 'Branch 1' } })
    const result = await executor.execute(makePlan([op]))
    expect(result.created).toBe(1)
    expect(db._docs.get('pharmacies/BR1')).toMatchObject({ code: 'BR1' })
  })

  it('PHARMACIST create writes a pending-invitation profile to the users collection, never Auth', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      entityType: 'PHARMACIST', collectionKey: 'users', documentId: 'pending_E1',
      data: { employeeId: 'E1', displayName: 'New User', authStatus: 'PENDING_INVITATION' },
    })
    const result = await executor.execute(makePlan([op]))
    expect(result.created).toBe(1)
    const doc = db._docs.get('users/pending_E1') as any
    expect(doc.authStatus).toBe('PENDING_INVITATION')
    expect(doc.password).toBeUndefined()
  })

  it('ASSIGNMENT update writes pharmacyId onto the existing user doc (never creates a new user)', async () => {
    const db = createFakeFirestore() as any
    await db.collection('users').doc('real-uid-1').set({ employeeId: 'E1', displayName: 'Existing User' })
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({ type: 'update', entityType: 'ASSIGNMENT', collectionKey: 'users', documentId: 'real-uid-1', data: { pharmacyId: 'ph2' } })
    const result = await executor.execute(makePlan([op]))
    expect(result.updated).toBe(1)
    expect(db._docs.get('users/real-uid-1')).toMatchObject({ employeeId: 'E1', pharmacyId: 'ph2' })
  })

  it('KPI_REGISTRY create writes a draft/inactive definition to kpi_registry', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({ entityType: 'KPI_REGISTRY', collectionKey: 'kpi_registry', documentId: 'newKpi', data: { key: 'newKpi', isActive: false, lifecycleStage: 'draft' } })
    const result = await executor.execute(makePlan([op]))
    expect(result.created).toBe(1)
    expect(db._docs.get('kpi_registry/newKpi')).toMatchObject({ isActive: false, lifecycleStage: 'draft' })
  })

  it('PHARMACIST_ACTUALS upsert accumulates kpiValues without clobbering other KPIs (mirrors BRANCH_ACTUALS)', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      entityType: 'PHARMACIST_ACTUALS', collectionKey: 'kpi_entries', documentId: 'u1_ph1_2026-07-01',
      data: { userId: 'u1', pharmacyId: 'ph1', date: '2026-07-01', wasfaty: 8 },
      nestedMapField: { path: 'kpiValues', key: 'wasfaty', value: 8 },
    })
    const result = await executor.execute(makePlan([op]))
    expect(result.created).toBe(1)
    expect((db._docs.get('kpi_entries/u1_ph1_2026-07-01') as any).kpiValues).toEqual({ wasfaty: 8 })
  })
})

describe('AdminFirestoreCommitExecutor — arrayUnion (Phase 2.2 branch-to-district link)', () => {
  it('pushes a pharmacyId into an empty districts/{id}.pharmacyIds array', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      type: 'update', entityType: 'BRANCH', collectionKey: 'districts', documentId: 'district-1',
      data: {}, arrayUnionField: { path: 'pharmacyIds', value: 'BR1' },
      identityKey: 'district-1:pharmacyIds:BR1', idempotencyKey: 'job-1:district-1:pharmacyIds:BR1',
    })
    await executor.execute(makePlan([op]))
    expect((db._docs.get('districts/district-1') as any).pharmacyIds).toEqual(['BR1'])
  })

  it('two different branches linked to the same district accumulate without clobbering each other', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op1 = makeOp({
      type: 'update', entityType: 'BRANCH', collectionKey: 'districts', documentId: 'district-1', data: {},
      arrayUnionField: { path: 'pharmacyIds', value: 'BR1' }, sourceRowId: 'row-a',
      identityKey: 'district-1:pharmacyIds:BR1', idempotencyKey: 'job-1:link-a',
    })
    const op2 = makeOp({
      type: 'update', entityType: 'BRANCH', collectionKey: 'districts', documentId: 'district-1', data: {},
      arrayUnionField: { path: 'pharmacyIds', value: 'BR2' }, sourceRowId: 'row-b',
      identityKey: 'district-1:pharmacyIds:BR2', idempotencyKey: 'job-1:link-b',
    })
    await executor.execute(makePlan([op1, op2]))
    expect((db._docs.get('districts/district-1') as any).pharmacyIds).toEqual(['BR1', 'BR2'])
  })

  it('re-adding an already-present pharmacyId is a no-op (real Firestore arrayUnion dedupe semantics)', async () => {
    const db = createFakeFirestore() as any
    await db.collection('districts').doc('district-1').set({ pharmacyIds: ['BR1'] })
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const op = makeOp({
      type: 'update', entityType: 'BRANCH', collectionKey: 'districts', documentId: 'district-1', data: {},
      arrayUnionField: { path: 'pharmacyIds', value: 'BR1' },
      identityKey: 'district-1:pharmacyIds:BR1', idempotencyKey: 'job-1:link-dedupe',
    })
    await executor.execute(makePlan([op]))
    expect((db._docs.get('districts/district-1') as any).pharmacyIds).toEqual(['BR1'])
  })

  it('a full BRANCH-import commit plan writes both the pharmacy doc (with districtId/regionId) and the district link in one execute() call', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    const branchOp = makeOp({
      entityType: 'BRANCH', collectionKey: 'pharmacies', documentId: 'BR9',
      data: { code: 'BR9', name: 'Branch 9', districtId: 'district-1', regionId: 'region-1' },
      identityKey: 'BR9', sourceRowId: 'row-9', idempotencyKey: 'job-1:BR9',
    })
    const linkOp = makeOp({
      type: 'update', entityType: 'BRANCH', collectionKey: 'districts', documentId: 'district-1', data: {},
      arrayUnionField: { path: 'pharmacyIds', value: 'BR9' },
      identityKey: 'district-1:pharmacyIds:BR9', sourceRowId: 'row-9', idempotencyKey: 'job-1:district-1:pharmacyIds:BR9',
    })
    const result = await executor.execute(makePlan([branchOp, linkOp]))
    expect(result.created).toBe(1)
    expect(result.updated).toBe(1)
    expect((db._docs.get('pharmacies/BR9') as any).districtId).toBe('district-1')
    expect((db._docs.get('districts/district-1') as any).pharmacyIds).toEqual(['BR9'])
  })
})

describe('AdminFirestoreCommitExecutor — missing credentials (fail closed)', () => {
  it('createDefaultAdminFirestoreCommitExecutor requires a real Admin app — a missing/invalid app throws rather than silently degrading', async () => {
    const { createDefaultAdminFirestoreCommitExecutor } = await import('./adminFirestoreCommitExecutor')
    // Passing something that is not a real initialized Admin app makes
    // getFirestore() throw, exactly like the production getAdminApp()
    // path throws when FIREBASE_SERVICE_ACCOUNT_JSON is unset (see
    // firestoreConnectorRepository.ts) — proves the credentials
    // boundary fails closed rather than falling back to any default.
    expect(() => createDefaultAdminFirestoreCommitExecutor(undefined as any)).toThrow()
  })
})

describe('AdminFirestoreCommitExecutor — idempotency + audit', () => {
  it('a retried plan with the same idempotency key does not write twice', async () => {
    const db = createFakeFirestore() as any
    const store = createInMemoryOperationStateStore()
    const executor = createAdminFirestoreCommitExecutor(db, store)
    const plan = makePlan([makeOp()])
    await executor.execute(plan)
    await db.collection('regions').doc('RUH').set({ code: 'RUH', name: 'MUTATED BY SOMETHING ELSE' })
    const second = await executor.execute(plan)
    expect(second.created).toBe(1) // reported from cache, not a new write
    expect(db._docs.get('regions/RUH')).toMatchObject({ name: 'MUTATED BY SOMETHING ELSE' }) // untouched by the retry
  })

  it('writes a domain audit_logs record for every successful operation', async () => {
    const db = createFakeFirestore() as any
    const executor = createAdminFirestoreCommitExecutor(db, createInMemoryOperationStateStore())
    await executor.execute(makePlan([makeOp()]))
    const auditDocs = [...db._docs.keys()].filter((k: string) => k.startsWith('audit_logs/'))
    expect(auditDocs.length).toBe(1)
  })
})
