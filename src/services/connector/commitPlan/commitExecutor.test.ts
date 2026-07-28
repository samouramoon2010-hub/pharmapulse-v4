import { describe, it, expect, vi } from 'vitest'
import { runCommitPlan, createInMemoryOperationStateStore } from './commitExecutor'
import type { CommitPlan, CommitOperation } from './commitOperationTypes'

function makeOp(overrides: Partial<CommitOperation> = {}): CommitOperation {
  return {
    type: 'create', entityType: 'REGION', collectionKey: 'regions', documentId: 'RUH',
    data: { code: 'RUH', name: 'Riyadh' }, merge: true, identityKey: 'RUH',
    sourceRowId: 'r1', idempotencyKey: 'job-1:RUH',
    audit: { entityType: 'REGION', sourceRowId: 'r1', actorUid: 'a1', actorRole: 'admin' },
    ...overrides,
  }
}

function makePlan(operations: CommitOperation[], overrides: Partial<CommitPlan> = {}): CommitPlan {
  return {
    jobId: 'job-1', entityType: 'REGION', operations, skips: [], conflicts: [], validationFailures: [],
    expectedCreateCount: operations.length, expectedUpdateCount: 0, planSignature: 'sig', ...overrides,
  }
}

describe('runCommitPlan — shared executor logic (SDK-agnostic)', () => {
  it('writes each operation once and reports created/updated counts', async () => {
    const store = createInMemoryOperationStateStore()
    const writeOne = vi.fn(async (op) => ({ documentId: op.documentId!, state: op.type === 'create' ? 'created' as const : 'updated' as const }))
    const plan = makePlan([makeOp(), makeOp({ type: 'update', documentId: 'JED', identityKey: 'JED', idempotencyKey: 'job-1:JED', sourceRowId: 'r2' })])
    const result = await runCommitPlan(plan, store, writeOne)
    expect(result.created).toBe(1)
    expect(result.updated).toBe(1)
    expect(writeOne).toHaveBeenCalledTimes(2)
  })

  it('idempotent retry: an already-committed operation is never re-written', async () => {
    const store = createInMemoryOperationStateStore()
    const writeOne = vi.fn(async (op) => ({ documentId: op.documentId!, state: 'created' as const }))
    const plan = makePlan([makeOp()])
    await runCommitPlan(plan, store, writeOne)
    const second = await runCommitPlan(plan, store, writeOne)
    expect(writeOne).toHaveBeenCalledTimes(1) // not called again on the second run
    expect(second.created).toBe(1)
  })

  it('partial failure: one operation failing does not abort the others, and is reported failed not created', async () => {
    const store = createInMemoryOperationStateStore()
    const writeOne = vi.fn(async (op) => {
      if (op.documentId === 'FAIL') throw new Error('simulated write failure')
      return { documentId: op.documentId!, state: 'created' as const }
    })
    const plan = makePlan([makeOp(), makeOp({ documentId: 'FAIL', identityKey: 'FAIL', idempotencyKey: 'job-1:FAIL', sourceRowId: 'r2' })])
    const result = await runCommitPlan(plan, store, writeOne)
    expect(result.created).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.executed.find((r) => r.sourceRowId === 'r2')?.state).toBe('failed')
  })

  it('a failed operation is retryable on the next attempt (not permanently marked done)', async () => {
    const store = createInMemoryOperationStateStore()
    let attempt = 0
    const writeOne = vi.fn(async (op) => {
      attempt += 1
      if (attempt === 1) throw new Error('first attempt fails')
      return { documentId: op.documentId!, state: 'created' as const }
    })
    const plan = makePlan([makeOp()])
    const first = await runCommitPlan(plan, store, writeOne)
    expect(first.failed).toBe(1)
    const retry = await runCommitPlan(plan, store, writeOne)
    expect(retry.created).toBe(1)
    expect(writeOne).toHaveBeenCalledTimes(2)
  })

  it('skips/conflicts/validationFailures are surfaced as skipped rows with a reason, never written', async () => {
    const store = createInMemoryOperationStateStore()
    const writeOne = vi.fn(async (op) => ({ documentId: op.documentId!, state: 'created' as const }))
    const plan = makePlan([], {
      skips: [{ sourceRowId: 'r3', reason: 'DUPLICATE' }],
      conflicts: [{ sourceRowId: 'r4', reason: 'Existing record differs' }],
      validationFailures: [{ sourceRowId: 'r5', reason: 'Missing name' }],
    })
    const result = await runCommitPlan(plan, store, writeOne)
    expect(result.skipped).toBe(3)
    expect(writeOne).not.toHaveBeenCalled()
  })
})
