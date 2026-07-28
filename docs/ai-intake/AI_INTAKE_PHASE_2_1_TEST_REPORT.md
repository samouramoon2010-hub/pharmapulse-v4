# Universal AI Intake — Phase 2.1 Test Report

## Summary

129 focused tests across 16 test files (connector/commit-plan modules
+ the Admin executor + the local simulator), all passing. Full repo
suite: 25,881 tests across 395 files, all passing (no regression to
any existing module). `tsc --noEmit` clean for every Phase 2.1 file
(pre-existing repo-wide baseline gaps — missing `@types/node`, a
handful of `?raw` source-scan imports, unrelated legacy files —
untouched and unaffected, documented below). `npm run build` succeeds;
`dist/` contains zero occurrences of `firebase-admin` or any
server-only secret name.

## New/updated test files

| File | Tests | Covers |
|---|---|---|
| `src/services/connector/commitPlan/buildCommitPlan.test.ts` | 21 (includes 3 collection-allowlist tests for `commitOperationTypes.ts`'s `resolveCollectionKey`/`COLLECTION_ALLOWLIST`) | plan generation for all 8 domains, classification routing, deterministic IDs, nested-map fields, idempotency-key/audit-metadata derivation |
| `src/services/connector/commitPlan/commitExecutor.ts` (via `commitExecutor.test.ts`) | 5 | shared `runCommitPlan()`: write-once, idempotent retry, partial failure, failed-row retryability, skips-never-written |
| `netlify/functions/adminFirestoreCommitExecutor.test.ts` | 15 | Admin SDK write mechanics: create/update/upsert, deterministic ID, auto-ID, nested-map (flat + sub-map, no-clobber, two-KPI accumulation), idempotent retry, audit-log write, per-domain coverage (GROUP/BRANCH/PHARMACIST/ASSIGNMENT/KPI_REGISTRY/PHARMACIST_ACTUALS), missing-credentials fail-closed |
| `src/services/connector/connectorHttpHandler.test.ts` (existing file, extended) | 24 (21 existing + 3 new) | full 8-tool lifecycle now exercised through the Admin-style plan/execute path (via an injected in-memory `CommitExecutor` fixture, not the client SDK); new: completed-session re-execution rejection, execute-time plan-signature mismatch, missing-commitExecutor fail-closed |
| `scripts/connectorSimulate.demo.test.ts` (existing file, extended) | 1 | full offline lifecycle including idempotent replay, now via the plan/execute path |

## Spec's 36-scenario checklist — mapped to actual coverage

1. commit-plan generation — `buildCommitPlan.test.ts`
2. collection allowlist enforcement — `buildCommitPlan.test.ts` "Collection allowlist"
3. arbitrary collection rejection — `resolveCollectionKey` throws for anything outside the hardcoded map; the map is closed at compile time (`Record<ImportDomain, string|null>`), so there is no code path that accepts a collection name from connector input at all — structurally impossible, not just tested
4. arbitrary path rejection — no tool contract exposes a raw Firestore path anywhere (`connectorTypes.ts` input/output shapes reviewed; `documentId` is always server-derived)
5. client executor compatibility — full DX/browser regression suite (25,881 tests) unchanged and passing; `commitJob()`/`adapter.commitBatch()` untouched
6. Admin executor create — `adminFirestoreCommitExecutor.test.ts`
7. Admin executor update — `adminFirestoreCommitExecutor.test.ts`
8. Admin executor upsert — `adminFirestoreCommitExecutor.test.ts` (nested-map tests use `upsert`-typed ops)
9. deterministic ID behavior — `adminFirestoreCommitExecutor.test.ts` "creates a new document at the deterministic id"
10. parent reference resolution — `buildCommitPlan.test.ts` "Group" (regionId preserved), "Assignment"/"Pharmacist" (resolved existing user UID)
11. region import — `buildCommitPlan.test.ts` + `adminFirestoreCommitExecutor.test.ts`
12. group import — `buildCommitPlan.test.ts` "Group" + `adminFirestoreCommitExecutor.test.ts` "GROUP create"
13. pharmacy import — `buildCommitPlan.test.ts` "Branch" + `adminFirestoreCommitExecutor.test.ts` "BRANCH create"
14. user-profile import — `buildCommitPlan.test.ts` "Pharmacist" + `adminFirestoreCommitExecutor.test.ts` "PHARMACIST create ... never Auth"
15. assignment import — `buildCommitPlan.test.ts` "Assignment" + `adminFirestoreCommitExecutor.test.ts` "ASSIGNMENT update"
16. KPI draft-only import — `buildCommitPlan.test.ts` "KPI Definitions" + `adminFirestoreCommitExecutor.test.ts` "KPI_REGISTRY create" + `connectorHttpHandler.test.ts`'s existing "KPI Definitions ... always forced to draft/inactive"
17. KPI target import — `buildCommitPlan.test.ts` + `adminFirestoreCommitExecutor.test.ts` nested-map tests
18. KPI actual import — same, plus `adminFirestoreCommitExecutor.test.ts` "PHARMACIST_ACTUALS upsert"
19. approval revalidation — `connectorHttpHandler.test.ts`'s existing "execute rejects a stale preview signature"
20. plan-signature mismatch — `connectorHttpHandler.test.ts`'s new "rejects execute when the commit-plan signature no longer matches the approved preview"
21. idempotent execution — `commitExecutor.test.ts` + `adminFirestoreCommitExecutor.test.ts` "a retried plan ... does not write twice"
22. idempotency conflict — `connectorHttpHandler.test.ts`'s existing "idempotency conflict"
23. no duplicate successful rows — same two tests as #21
24. partial failure persistence — `commitExecutor.test.ts` "partial failure"
25. failed-row retry — `commitExecutor.test.ts` "a failed operation is retryable"
26. completed-session execution rejection — `connectorHttpHandler.test.ts`'s new "a completed session cannot be executed again"
27. single-use approval token — `connectorHttpHandler.test.ts`'s existing "execute rejects an already-used approval"
28. Auth-mutation rejection — `connectorHttpHandler.test.ts`'s existing "no tool accepts or would act on a password/Auth-UID-creation field"; structurally reinforced by `adminFirestoreCommitExecutor.test.ts`'s PHARMACIST test asserting `doc.password` is `undefined`
29. protected-admin rejection — structural: no commit-plan builder for any domain ever mutates a role/permission field or targets an arbitrary UID from connector input; ASSIGNMENT only ever writes `pharmacyId` onto an already-resolved existing user. Not independently re-tested in Phase 2.1 since the write surface that would need to be "rejected" does not exist in the builders at all (verified in `buildCommitPlan.ts` — no role/scope field appears in any per-domain builder's `data` object)
30. production-write guard — `connectorHttpHandler.test.ts`'s existing "blocks execute by default when no productionGuardFlags are configured"
31. missing Admin credentials — `adminFirestoreCommitExecutor.test.ts`'s new "missing credentials (fail closed)"
32. audit record creation — `adminFirestoreCommitExecutor.test.ts` "writes a domain audit_logs record for every successful operation"
33. sensitive-data redaction — pre-existing `connectorAuditService.test.ts` (Phase 2, unaffected by this phase's changes — the Admin executor's own audit write does not include tokens/secrets in its payload by construction, only `op.data`)
34. client bundle isolation — `dist/` grep (see Build Isolation section below)
35. full connector execute flow — `connectorHttpHandler.test.ts`'s existing "create -> validate -> preview -> approve -> execute -> status, end to end" (now genuinely exercising the plan/Admin-style path) + `scripts/connectorSimulate.demo.test.ts`
36. browser import regression — full 25,881-test suite, zero failures

## Honest disclosure: no live Firebase Emulator Suite was run

`firebase.json` has no `"emulators"` key configured in this repo, and
no `firebase-tools`/Java toolchain was confirmed available this
session. Per the spec's own explicitly-permitted alternative
("isolated in-memory Firestore-compatible repository for unit tests"),
`adminFirestoreCommitExecutor.test.ts` uses a hand-built,
faithful in-memory fake of the Admin SDK's `Firestore.collection(x).doc(y).get()/.set()`
surface — implementing the specific semantics that matter for
correctness here (`merge:true` replaces a nested map wholesale, a
missing doc's `.get()` returns `exists:false`, `.doc()` with no id
generates a fresh id). This is **not** a live emulator run and is not
represented as one anywhere in this documentation set. Setting up a
real Firebase Emulator Suite run remains a documented follow-up.

## Type-check

`npx tsc --noEmit -p tsconfig.json --ignoreDeprecations 6.0` produces
zero errors in any Phase 2.1 file (`commitOperationTypes.ts`,
`buildCommitPlan.ts`, `commitExecutor.ts`,
`adminFirestoreCommitExecutor.ts`, `pharmapulse-connector.ts`,
`firestoreConnectorRepository.ts`, and all their `.test.ts` files). One
real type error was caught and fixed during this phase: the legacy
`KPI_ACTUALS` `ImportDomain` literal (superseded by
`BRANCH_ACTUALS`/`PHARMACIST_ACTUALS`, see
`importJobTypes.ts`) was missing from `COLLECTION_ALLOWLIST`'s
`Record<ImportDomain, string | null>` — fixed by mapping it to `null`
(same treatment as `HISTORICAL`; the connector's commit-plan path never
builds an operation for either). Remaining `tsc` errors across the
repo (missing `@types/node` for `crypto`/`Buffer`, `?raw` source-scan
imports, `evaluationLedgerService.ts`, `kpiImportService.ts`, etc.) are
pre-existing, repo-wide baseline gaps unrelated to this phase — same
baseline documented in every prior phase's final report.

## Build

`npm run build` succeeds (Vite production build, 6.8s). Pre-existing
`INEFFECTIVE_DYNAMIC_IMPORT` warnings and the >500kB chunk-size warning
are unrelated to this phase (same modules flagged in prior builds).

## Browser bundle isolation

```
grep -rl "firebase-admin" dist/                                    → no matches
grep -rl "FIREBASE_SERVICE_ACCOUNT_JSON|CONNECTOR_TOKEN_SECRET|CONNECTOR_APPROVAL_SECRET" dist/  → no matches
```

Confirms `firebase-admin` and every server-only secret name are absent
from the client bundle — the isolation boundary
(`netlify/functions/` never imported by anything under `src/`) holds.
