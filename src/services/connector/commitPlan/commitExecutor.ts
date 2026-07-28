// ============================================================
// Universal AI Intake — Phase 2.1 Commit Executor Contract
//
// Consumes ONLY a canonical CommitPlan — never row data, never a
// Firestore SDK type. Two implementations exist:
//   - AdminFirestoreCommitExecutor (netlify/functions/, firebase-admin)
//   - the existing Phase 1 commitJob()/adapter.commitBatch() pipeline
//     IS the "client executor" — no new class was introduced for it,
//     since one already exists and rebuilding it would violate
//     "do not rebuild the import engine" (see
//     AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md).
//
// Pure interface — no firebase-admin, no firebase/firestore import.
// ============================================================

import type { CommitOperation, CommitPlan } from './commitOperationTypes'

export type CommitRowState = 'created' | 'updated' | 'skipped' | 'failed'

export interface CommitExecutionRowResult {
  sourceRowId:    string
  state:          CommitRowState
  documentId?:    string
  failureReason?: string
}

export interface CommitExecutionResult {
  executed: CommitExecutionRowResult[]
  created:  number
  updated:  number
  skipped:  number
  failed:   number
}

/** Tracks per-operation execution outcomes, keyed by the operation's
 *  idempotencyKey — so a retried plan (e.g. after a partial failure)
 *  never re-writes an already-successful operation. Injected so tests
 *  use an in-memory Map and production uses Firestore. */
export interface OperationStateStore {
  getOperationResult(idempotencyKey: string): Promise<CommitExecutionRowResult | null>
  putOperationResult(idempotencyKey: string, result: CommitExecutionRowResult): Promise<void>
}

export interface CommitExecutor {
  execute(plan: CommitPlan): Promise<CommitExecutionResult>
}

export function createInMemoryOperationStateStore(): OperationStateStore {
  const store = new Map<string, CommitExecutionRowResult>()
  return {
    async getOperationResult(key) { return store.get(key) ?? null },
    async putOperationResult(key, result) { store.set(key, result) },
  }
}

/** Shared by every executor implementation: run each operation in
 *  order, skip ones already committed (idempotent retry), collect
 *  row-level results, tolerate individual failures without aborting
 *  the whole plan (partial-failure model). `writeOne` is the only
 *  SDK-specific piece — everything else (idempotency check, counting,
 *  result shape) is identical between executors. */
export async function runCommitPlan(
  plan: CommitPlan,
  store: OperationStateStore,
  writeOne: (op: CommitOperation) => Promise<{ documentId: string; state: 'created' | 'updated' }>,
): Promise<CommitExecutionResult> {
  const executed: CommitExecutionRowResult[] = []

  for (const op of plan.operations) {
    const cached = await store.getOperationResult(op.idempotencyKey)
    if (cached) { executed.push(cached); continue }

    try {
      const { documentId, state } = await writeOne(op)
      const result: CommitExecutionRowResult = { sourceRowId: op.sourceRowId, state, documentId }
      await store.putOperationResult(op.idempotencyKey, result)
      executed.push(result)
    } catch (e: any) {
      // Deliberately NOT persisted to the state store — a failed row
      // must be retryable on the next attempt, never permanently
      // marked done.
      executed.push({ sourceRowId: op.sourceRowId, state: 'failed', failureReason: e?.message ?? 'Unknown failure' })
    }
  }

  for (const skip of [...plan.skips, ...plan.conflicts, ...plan.validationFailures]) {
    executed.push({ sourceRowId: skip.sourceRowId, state: 'skipped', failureReason: skip.reason })
  }

  return {
    executed,
    created: executed.filter((r) => r.state === 'created').length,
    updated: executed.filter((r) => r.state === 'updated').length,
    skipped: executed.filter((r) => r.state === 'skipped').length,
    failed: executed.filter((r) => r.state === 'failed').length,
  }
}
