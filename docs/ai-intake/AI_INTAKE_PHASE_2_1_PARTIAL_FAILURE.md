# Universal AI Intake — Phase 2.1 Partial Failure and Retry

## Row-level state model

`CommitExecutionRowResult.state` is one of:

```
'created' | 'updated' | 'skipped' | 'failed'
```

(`pending`/`executing` from the spec's suggested vocabulary are not
separately persisted states in this implementation — a `CommitPlan`'s
operations are processed synchronously in-request, so there is no
durable "in-flight" state to observe between requests. Every operation
resolves to one of the four terminal states above by the time
`execute()` returns. This is disclosed explicitly, not silently
narrowed — see "Do not claim atomic all-or-nothing behavior" below.)

## What happens when one operation fails

`runCommitPlan()` wraps each operation's write in its own try/catch:

```ts
try {
  const { documentId, state } = await writeOne(op)
  // ... success path, cached
} catch (e) {
  executed.push({ sourceRowId: op.sourceRowId, state: 'failed', failureReason: e?.message ?? 'Unknown failure' })
  // deliberately NOT persisted to the OperationStateStore
}
```

A failure in one operation does **not** stop the loop — every
subsequent operation in the plan is still attempted. This is a
**partial-failure model, not an all-or-nothing transaction.** The spec
explicitly requires this to be disclosed rather than mis-labeled:
`AdminFirestoreCommitExecutor` uses individual `ref.set()` calls per
operation, not a Firestore batch/transaction spanning the whole plan —
so there is no atomicity guarantee across operations in a single plan.
(A single operation's own write — one document — is always atomic,
since it's one Firestore `set()` call.)

## Session status after a partial failure

`executeIntakeSession` derives the session's terminal status from the
execution result:

```ts
const status = result.failed === 0
  ? 'COMPLETED'
  : (result.created + result.updated > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED')
```

`PARTIALLY_COMPLETED` and `FAILED` are pre-existing `ImportJobStatus`
literals (Phase 1, `importJobTypes.ts` — unchanged). Persisted rows'
`failureDetails` array (in `ExecuteIntakeSessionOutput`) maps each
failed operation back to its `sourceRowId`/`clientRowId` and the
captured error message, so the caller (ChatGPT via the connector) can
present exactly which rows need attention.

## Retry semantics — failed rows only

Because a failed operation's result is never written to the
`OperationStateStore`, and a successful operation's result IS written,
re-running the same `CommitPlan` (same `jobId`, same `identityKey`s →
same `idempotencyKey`s) after a partial failure will:

- **skip** every operation that already succeeded (cache hit — no
  re-write, no duplicate document mutation)
- **retry** only the operations that failed or were never attempted

This was proven directly: `commitExecutor.test.ts`'s "a failed
operation is retryable on the next attempt" test simulates a
write function that fails on the first call and succeeds on the
second, and confirms the retry succeeds without needing any special
"retry-only-failed-rows" API — it falls naturally out of the
idempotency-cache-skip logic in `runCommitPlan()`.

## What the connector currently does NOT do automatically

There is no automatic retry loop inside `executeIntakeSession` itself —
a partial failure is reported back to the caller (`status:
'PARTIALLY_COMPLETED'`, `failureDetails`), and a genuine retry requires
a **new** `pharmapulse_execute_intake_session` call (with a fresh
approval, since approval tokens are single-use — see the Idempotency
doc). This is intentional: automatically retrying without caller
awareness would hide failures rather than surface them, and the spec's
Step 10 asks for "allow retry of failed rows only," not "silently
auto-retry."
