# Universal AI Intake — Phase 2.1 Admin SDK Commit Executor

## Location and isolation boundary

`netlify/functions/adminFirestoreCommitExecutor.ts` — lives outside
`src/` deliberately, exactly like `firestoreConnectorRepository.ts`
(Phase 2). Vite's client build never scans `netlify/functions/`, so
`firebase-admin` (Node-only: `fs`/`net`/gRPC) never reaches the browser
bundle. Verified: `dist/` after `npm run build` contains zero
occurrences of the string `firebase-admin` (see
`AI_INTAKE_PHASE_2_1_TEST_REPORT.md`'s "Browser bundle isolation" section).

## `runCommitPlan()` — shared, SDK-agnostic execution logic

`src/services/connector/commitPlan/commitExecutor.ts` exports a pure
function used by every `CommitExecutor` implementation (currently only
one: the Admin executor):

```ts
async function runCommitPlan(
  plan: CommitPlan,
  store: OperationStateStore,
  writeOne: (op: CommitOperation) => Promise<{ documentId: string; state: 'created' | 'updated' }>,
): Promise<CommitExecutionResult>
```

It handles, identically for every SDK: the idempotency-skip check (see
`AI_INTAKE_PHASE_2_1_IDEMPOTENCY.md`), per-operation try/catch so one
failure never aborts the rest of the plan (see
`AI_INTAKE_PHASE_2_1_PARTIAL_FAILURE.md`), and result counting
(`created`/`updated`/`skipped`/`failed`). Only `writeOne` — the actual
Firestore write — is SDK-specific.

## `writeOperation()` — the Admin SDK write mechanics

```ts
async function writeOperation(db: Firestore, op: CommitOperation): Promise<{ documentId: string; state: 'created' | 'updated' }>
```

1. Resolves the doc ref: `db.collection(op.collectionKey).doc(op.documentId)`
   if `documentId` is set, otherwise `.doc()` (Admin SDK auto-ID —
   used only when `buildCommitPlan.ts` didn't provide a deterministic
   one, e.g. never in the current 8-domain coverage, but supported).
2. Reads the existing document (`ref.get()`) to determine `create` vs
   `update` for `upsert`-typed operations, and to safely merge a
   `nestedMapField` (see below).
3. Builds the write payload: starts from `op.data`, applies the
   nested-map read-modify-write pattern if `op.nestedMapField` is set,
   stamps `updatedAt: FieldValue.serverTimestamp()` always and
   `createdAt: FieldValue.serverTimestamp()` on create.
4. `ref.set(payload, { merge: op.merge })` — the ONLY Firestore write
   call in the entire connector execute path.
5. Writes a best-effort domain audit record to `audit_logs` (same
   collection the browser path's `auditService.js` already writes to),
   wrapped in try/catch so an audit-write failure never fails the
   underlying commit (matches `auditService.js`'s own convention).
6. Returns `{ documentId, state }` to `runCommitPlan`.

## Nested-map field handling (the Firestore `merge:true` nuance)

As documented in the architecture doc, `setDoc(ref, data, {merge:true})`
replaces a nested object field wholesale — it does not deep-merge keys
inside it. `writeOperation()` handles this per `op.nestedMapField`:

- `path === ''` (flat top-level field, e.g. `BRANCH_TARGET`'s
  `wasfatyTarget`): no read needed — Firestore's document-level
  `merge:true` already handles a flat field correctly.
- `path !== ''` (a sub-map field, e.g. `PHARMACIST_TARGET`'s
  `targets.wasfatyTarget` or `BRANCH_ACTUALS`'/`PHARMACIST_ACTUALS`'
  `kpiValues.<kpiKey>`): reads the existing sub-map first
  (`existingSnap.data()?.[path] ?? {}`), spreads it, overwrites only
  the one changed key, and writes the whole sub-map back. Proven by a
  dedicated test: two different-KPI actuals rows on the same date
  accumulate into `kpiValues` without clobbering each other.

## Deterministic ID behavior

Confirmed by test for REGION (`RUH` → `regions/RUH`), and structurally
identical for GROUP/BRANCH (their own `code`); PHARMACIST/ASSIGNMENT
use a resolved real user UID or `pending_<employeeId>`; the four
Target/Actuals domains use a composite key
(`{userId}_{pharmacyId}_{month|date}`) that has always been
deterministic (unchanged from Phase 1).

## Precondition checks

The `existingSnap.exists` check before deciding `create` vs `update`
for `upsert`-typed operations is the precondition check required by
Step 4 — it is read immediately before the write in the same function
call, minimizing (not eliminating — see Idempotency doc for how actual
races are handled) the window for a stale decision.

## Credentials and fail-closed behavior

`createDefaultAdminFirestoreCommitExecutor(adminApp)` requires a real,
already-initialized Admin SDK app (via
`firestoreConnectorRepository.ts`'s `getAdminApp()`, which throws
immediately if `FIREBASE_SERVICE_ACCOUNT_JSON` is unset — see
`AI_INTAKE_PHASE_2_1_NETLIFY_CREDENTIALS.md`). Passing an
uninitialized/missing app makes `getFirestore()` throw — proven by a
dedicated test (`AdminFirestoreCommitExecutor — missing credentials`).
There is no fallback, default-credential lookup, or silent no-op path.

## Test coverage (Step 5 — entity coverage, all 8 domains)

`netlify/functions/adminFirestoreCommitExecutor.test.ts`, run against a
hand-built in-memory fake of the Admin SDK's Firestore surface (see
`AI_INTAKE_PHASE_2_1_TEST_REPORT.md` for why this substitutes for a
live emulator this session): create, update (merge without
clobbering unrelated fields), auto-ID generation, flat nested-map
field, sub-map nested-map field (no clobber), two-different-KPI
accumulation, idempotent retry (no re-write), domain audit-log write
per success, and per-domain create/update coverage for GROUP, BRANCH,
PHARMACIST (never touches Auth), ASSIGNMENT (updates an existing user
doc only), KPI_REGISTRY (draft/inactive), and PHARMACIST_ACTUALS.
