// ============================================================
// Universal AI Intake — Phase 2.1/2.2 test fixture
//
// A plain in-memory CommitExecutor — writes into a local Map instead
// of Firestore. Proves connector/MCP orchestration (approval
// re-checks, plan building, idempotency, result shaping) without
// depending on the real AdminFirestoreCommitExecutor, which has its
// own dedicated test suite (netlify/lib/adminFirestoreCommitExecutor.test.ts).
// Not imported by production code.
// ============================================================

import { runCommitPlan, createInMemoryOperationStateStore } from '../commitPlan/commitExecutor'
import type { CommitExecutor } from '../commitPlan/commitExecutor'

export function makeFakeCommitExecutor(): CommitExecutor {
  const docs = new Map<string, Record<string, unknown>>()
  const store = createInMemoryOperationStateStore()
  return {
    async execute(plan) {
      return runCommitPlan(plan, store, async (op) => {
        const key = `${op.collectionKey}/${op.documentId ?? op.identityKey}`
        const isCreate = op.type === 'create' || (op.type === 'upsert' && !docs.has(key))
        docs.set(key, { ...(docs.get(key) ?? {}), ...op.data })
        return { documentId: op.documentId ?? op.identityKey, state: isCreate ? 'created' : 'updated' }
      })
    },
  }
}
