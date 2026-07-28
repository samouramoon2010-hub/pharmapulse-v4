# Universal AI Intake — Phase 2.1 Commit Plan

## `buildCommitPlan(ctx, rows, deps)`

`src/services/connector/commitPlan/buildCommitPlan.ts` — pure function,
zero Firestore/firebase-admin import. Turns `StagedImportRow[]`
(already validated by Phase 1's `runValidation()`) into a `CommitPlan`:

```ts
interface CommitPlan {
  jobId: string
  entityType: ImportDomain
  operations: CommitOperation[]
  skips: CommitPlanFailure[]
  conflicts: CommitPlanFailure[]
  validationFailures: CommitPlanFailure[]
  expectedCreateCount: number
  expectedUpdateCount: number
  planSignature: string
}
```

Rows route by `classification` (the Phase 1 field, never
re-derived here):

| classification | outcome |
|---|---|
| `ERROR` | → `validationFailures`, no operation |
| `SKIP` / `DUPLICATE` | → `skips`, no operation |
| `CONFLICT` | → `conflicts`, no operation (never auto-resolved) |
| `VALID` / `WARNING` | → `create` operation |
| `UPDATE` | → `update` operation |

## `CommitOperation` — the shared, SDK-agnostic contract

```ts
interface CommitOperation {
  type: 'create' | 'update' | 'upsert' | 'skip'
  entityType: ImportDomain
  collectionKey: string        // resolved server-side, see below
  documentId?: string
  nestedMapField?: { path: string; key: string; value: unknown }
  data: Record<string, unknown>
  merge: boolean
  identityKey: string
  sourceRowId: string
  idempotencyKey: string       // buildCommitOperationKey(jobId, identityKey) — reused from Phase 1
  audit: { entityType, sourceRowId, actorUid, actorRole }
}
```

`collectionKey` is **never** accepted from connector input. It is
resolved from `COLLECTION_ALLOWLIST` (`commitOperationTypes.ts`), a
closed, hardcoded `Record<ImportDomain, string | null>` — the only 10
Firestore collections a commit operation may ever target (`regions`,
`districts`, `pharmacies`, `users`, `kpi_registry`, `targets`,
`personal_targets`, `kpi_entries` ×2, and `null` for the two domains
with no commit-plan support: `HISTORICAL` and the legacy `KPI_ACTUALS`).
`resolveCollectionKey()` throws for any entity type not in the
allowlist — adding a domain requires a code change, never a request
field. No public tool contract (see
`AI_INTAKE_PHASE_2_MCP_TOOL_CONTRACTS.md`) exposes a raw Firestore
document path anywhere.

## Why there is no `ClientFirestoreCommitExecutor` class

The spec's suggested shape names two executors,
`ClientFirestoreCommitExecutor` and `AdminFirestoreCommitExecutor`. The
"client" one already exists — it is Phase 1's `commitJob()` +
`adapter.commitBatch()` pipeline, unchanged, still used by the browser
`/ai-intake` and Data Exchange Studio pages. Wrapping it in a new class
that also implements the `CommitExecutor.execute(plan)` interface would
require re-deriving the plan back into per-adapter row-batches — pure
churn that adds a translation layer without changing any behavior, and
risks silently diverging from the plan-based path this phase actually
needed to close (server execution). The spec explicitly says "do not
rebuild the import engine" — introducing a second consumer of
`CommitPlan` for the already-working client path would be exactly that.
The two executors that exist are: the (unchanged) legacy client
pipeline, and the new `AdminFirestoreCommitExecutor`.

## Per-domain operation builders (I/O-shape mapping only)

Each domain has one small builder function
(`buildRegionOperation`, `buildGroupOperation`, ... `buildPharmacistActualOperation`)
that maps the row's already-validated `staged` object onto the exact
payload shape documented in `AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md`'s
audit table — this is field-for-field I/O mapping, not business logic.
No validation, normalization, or duplicate-detection rule is
re-implemented anywhere in `buildCommitPlan.ts`.

Notable per-domain details:

- **REGION/GROUP/BRANCH**: deterministic `code`-based document ID (see
  the architecture doc's "deliberate deviation" section).
- **PHARMACIST**: `documentId` is `pending_<employeeId>` for a brand
  new pharmacist (no Auth account exists yet), or the real resolved
  user UID (via `deps.resolveExistingUserId`) when updating an
  existing profile.
- **ASSIGNMENT**: `type: 'update'` always — never creates a user. If
  `resolveExistingUserId` returns `null`, the row goes to
  `validationFailures` rather than fabricating a document ID.
- **KPI_REGISTRY**: forwards the `staged` object unchanged — the
  draft-only enforcement already happened upstream (Phase 1's
  `kpiRegistryDraftOnlyAdapter.ts` guard, unchanged in Phase 2.1).
- **BRANCH_TARGET / PHARMACIST_TARGET / BRANCH_ACTUALS / PHARMACIST_ACTUALS**:
  `type: 'upsert'` with a `nestedMapField` describing exactly one
  changed key inside a sub-map (`targets` or `kpiValues`) — see the
  Idempotency and Admin Executor docs for how the executor avoids
  clobbering sibling keys.

## `planSignature`

Passed straight through from `ctx.planSignature`, which the caller
(`executeIntakeSession`) sets to the session's `currentSignature` (the
same `computeRowsSignature()` fingerprint the approval token is bound
to). This means `plan.planSignature === approval-bound signature` by
construction — `executeIntakeSession` re-checks this explicitly anyway
(defense in depth, Step 8) rather than relying on it being true by
construction alone. See `AI_INTAKE_PHASE_2_APPROVAL_MODEL.md` for the
full approval-binding mechanism (unchanged in Phase 2.1).
