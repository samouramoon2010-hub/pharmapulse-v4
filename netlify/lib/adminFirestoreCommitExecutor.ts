// ============================================================
// Universal AI Intake — Phase 2.1 Admin SDK Commit Executor
//
// The ONLY module in this codebase that performs a real Firestore
// WRITE for connector-driven imports, via firebase-admin. Lives
// outside src/ deliberately — never imported by the Vite client build.
//
// Uses the shared, SDK-agnostic `runCommitPlan()` (src/services/
// connector/commitPlan/commitExecutor.ts) for idempotency/partial-
// failure/counting — this file supplies only the `writeOne` Admin-SDK
// mechanics per operation, plus a Firestore-backed OperationStateStore
// and a best-effort domain audit_logs write mirroring auditService.js's
// existing shape (action/collection/docId/userId/userRole/before/after).
// ============================================================

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { runCommitPlan, createInMemoryOperationStateStore } from '../../src/services/connector/commitPlan/commitExecutor'
import type { CommitExecutor, CommitExecutionResult, OperationStateStore } from '../../src/services/connector/commitPlan/commitExecutor'
import type { CommitOperation, CommitPlan } from '../../src/services/connector/commitPlan/commitOperationTypes'

const OPERATION_STATE_COLLECTION = 'connector_operation_state'
const DOMAIN_AUDIT_COLLECTION = 'audit_logs' // same collection the browser path's auditService.js already writes to

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

export function createFirestoreOperationStateStore(db: Firestore): OperationStateStore {
  return {
    async getOperationResult(key) {
      const snap = await db.collection(OPERATION_STATE_COLLECTION).doc(key).get()
      return snap.exists ? (snap.data() as any) : null
    },
    async putOperationResult(key, result) {
      await db.collection(OPERATION_STATE_COLLECTION).doc(key).set(result)
    },
  }
}

async function writeDomainAudit(db: Firestore, op: CommitOperation, documentId: string, state: 'created' | 'updated') {
  try {
    await db.collection(DOMAIN_AUDIT_COLLECTION).add({
      action: state === 'created' ? 'create' : 'update',
      collection: op.collectionKey,
      docId: documentId,
      userId: op.audit.actorUid,
      userRole: op.audit.actorRole,
      before: null,
      after: op.data,
      meta: { source: 'connector', entityType: op.entityType, sourceRowId: op.sourceRowId },
      timestamp: FieldValue.serverTimestamp(),
    })
  } catch {
    // Best-effort, matches auditService.js's own try/catch-and-warn
    // convention — an audit-write failure must never fail the commit.
  }
}

/**
 * Writes one CommitOperation via the Admin SDK. Handles the
 * nested-map-field pattern (KPI Targets/Actuals) by reading the
 * existing sub-map and merging in only the one changed key before
 * writing it back whole — replicating the exact behavior documented
 * in AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md (Firestore's
 * `merge:true` replaces a nested map field wholesale, it does not
 * deep-merge nested keys).
 */
async function writeOperation(db: Firestore, op: CommitOperation): Promise<{ documentId: string; state: 'created' | 'updated' }> {
  const ref = op.documentId
    ? db.collection(op.collectionKey).doc(op.documentId)
    : db.collection(op.collectionKey).doc()

  const existingSnap = await ref.get()
  const isCreate = op.type === 'create' || (op.type === 'upsert' && !existingSnap.exists)

  let payload: Record<string, unknown> = { ...op.data }

  if (op.nestedMapField) {
    if (op.nestedMapField.path === '') {
      // Flat top-level field — Firestore's document-level merge:true
      // already handles this safely, no read-modify-write needed.
      payload[op.nestedMapField.key] = op.nestedMapField.value
    } else {
      const existingSubMap = (existingSnap.exists ? (existingSnap.data() as any)?.[op.nestedMapField.path] : null) ?? {}
      payload[op.nestedMapField.path] = { ...existingSubMap, [op.nestedMapField.key]: op.nestedMapField.value }
    }
  }

  // Atomic array-union (e.g. districts/{id}.pharmacyIds) — no read
  // needed, Firestore's arrayUnion sentinel is server-side atomic and
  // naturally idempotent (union of an already-present id is a no-op).
  if (op.arrayUnionField) {
    payload[op.arrayUnionField.path] = FieldValue.arrayUnion(op.arrayUnionField.value)
  }

  payload.updatedAt = FieldValue.serverTimestamp()
  if (isCreate) payload.createdAt = FieldValue.serverTimestamp()

  await ref.set(clean(payload), { merge: op.merge })

  const state = isCreate ? 'created' : 'updated'
  await writeDomainAudit(db, op, ref.id, state)
  return { documentId: ref.id, state }
}

export function createAdminFirestoreCommitExecutor(db: Firestore, stateStore?: OperationStateStore): CommitExecutor {
  const store = stateStore ?? createFirestoreOperationStateStore(db)
  return {
    async execute(plan: CommitPlan): Promise<CommitExecutionResult> {
      return runCommitPlan(plan, store, (op) => writeOperation(db, op))
    },
  }
}

/** Convenience factory using the already-initialized Admin app's
 *  default Firestore instance (see firestoreConnectorRepository.ts's
 *  getAdminApp()) — kept separate so tests can inject a fake db. */
export function createDefaultAdminFirestoreCommitExecutor(adminApp: Parameters<typeof getFirestore>[0]): CommitExecutor {
  return createAdminFirestoreCommitExecutor(getFirestore(adminApp))
}

export { createInMemoryOperationStateStore }
