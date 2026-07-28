# Universal AI Intake — Phase 2.1 Idempotency

Phase 2.1 adds a **second, operation-level** idempotency layer, on top
of (not replacing) Phase 2's existing **request-level** idempotency
(`connectorIdempotencyService.ts` — same idempotency key + same payload
returns the cached response; same key + different payload returns
`IDEMPOTENCY_CONFLICT`; unchanged).

## Why a second layer was needed

Request-level idempotency prevents the connector from re-executing an
entire `pharmapulse_execute_intake_session` call twice. It does **not**
prevent a *partially-failed* execution from re-writing operations that
already succeeded the first time, if the caller retries with a
different idempotency key (or if the request-level cache expires).
Operation-level idempotency closes that gap: each individual
`CommitOperation` inside a plan is tracked separately.

## `OperationStateStore`

```ts
interface OperationStateStore {
  getOperationResult(idempotencyKey: string): Promise<CommitExecutionRowResult | null>
  putOperationResult(idempotencyKey: string, result: CommitExecutionRowResult): Promise<void>
}
```

Keyed by each operation's `idempotencyKey`
(`buildCommitOperationKey(jobId, identityKey)` — the exact same helper
Phase 1's engine already uses, reused not reinvented). Two
implementations:

- `createInMemoryOperationStateStore()` — a `Map`, used by tests and
  the local simulator.
- `createFirestoreOperationStateStore(db)` — writes to a new
  `connector_operation_state` collection via the Admin SDK, used in
  production.

## `runCommitPlan()`'s idempotency check

For every operation, before writing:

```ts
const cached = await store.getOperationResult(op.idempotencyKey)
if (cached) { executed.push(cached); continue }   // skip the write entirely
```

On success, the result is persisted (`putOperationResult`) **before**
moving to the next operation. On failure, the result is deliberately
**not** persisted — a failed operation must remain retryable (see
`AI_INTAKE_PHASE_2_1_PARTIAL_FAILURE.md`).

## Required behaviors — verified

| Requirement | How it's satisfied | Proof |
|---|---|---|
| Same execution idempotency key + same payload returns original result | Request-level `connectorIdempotencyService.ts` (Phase 2, unchanged) | `connectorHttpHandler.test.ts` — "idempotent create" |
| Same key + different payload → `IDEMPOTENCY_CONFLICT` | Request-level, unchanged | `connectorHttpHandler.test.ts` — "idempotency conflict" |
| Successful rows never written twice | Operation-level `OperationStateStore` cache-hit skip | `commitExecutor.test.ts` — "idempotent retry" + `adminFirestoreCommitExecutor.test.ts` — "a retried plan ... does not write twice" (proves the underlying doc is untouched by the retry even if mutated by something else in between) |
| Partial retry writes only failed rows | Cache-hit skip for already-succeeded ops, real write attempted only for uncached (failed or new) ops | `commitExecutor.test.ts` — "partial failure" + "a failed operation is retryable" |
| Completed sessions cannot execute again | Session lifecycle status (`COMPLETED`) plus approval single-use (below) | `connectorHttpHandler.test.ts` — "a completed session cannot be executed again" |
| Approval token remains single-use | `repo.markApprovalConsumed()` (Phase 2, unchanged) checked via `assertApprovalNotConsumed` before every execute | `connectorHttpHandler.test.ts` — "single-use approval" |
| Replayed connector request is rejected | Request-level replay guard (`hasSeenRequestId`/`recordRequestId`, Phase 2, unchanged) | `connectorHttpHandler.test.ts` — "rejects a replayed requestId" |

## Interaction with the commit-plan signature check

Approval single-use and operation-level idempotency are independent
safeguards that compose: even if an approval token were somehow reused
(it can't be — single-use is enforced), any operation the first
execution already completed would still be skipped by the operation
state store, and any row whose data changed since approval would fail
the `plan.planSignature !== claims.previewSignature` check in
`executeIntakeSession` before a plan is even built (see Step 8 in
`AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md`).
