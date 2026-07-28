# Universal AI Intake — Phase 1 Test Report

## New test files (all passing)

| File | Tests |
|---|---:|
| `src/services/dataExchange/adapters/regionsAdapter.test.ts` | 7 |
| `src/services/dataExchange/entityDetection.test.ts` | 8 |
| `src/services/dataExchange/textIntakeParser.test.ts` | 7 |
| `src/services/dataExchange/pdfIntakeParser.test.ts` | 5 |
| `src/services/dataExchange/imageIntakeAdapter.test.ts` | 4 |
| `src/services/dataExchange/adapters/kpiRegistryDraftOnlyAdapter.test.ts` | 4 |
| `src/services/dataExchange/intakeSessionTypes.test.ts` | 4 |
| `src/pages/admin/aiIntakePhase1Certification.test.ts` | 16 |
| **Total new** | **55** |

## 24 scenarios → test coverage

| # | Scenario | Covered by |
|---|---|---|
| 1 | Excel parsing | Existing `xlsx`-based path, reused unchanged from Data Exchange Studio (already covered by its own test suite) |
| 2 | CSV parsing | Same as above; also `textIntakeParser.test.ts` "parses comma-separated pasted text" |
| 3 | Text parsing | `textIntakeParser.test.ts` (JSON/TSV/CSV/key-value blocks) |
| 4 | Multi-sheet selection | `AiIntakePage.jsx`'s `handleSheetChange`; sheet-selector UI verified live (see below) |
| 5 | Column mapping | `aiIntakePhase1Certification.test.ts` + reused `findUnresolvedHeaders`/`applyManualHeaderMapping` (existing DX-Data-2 tests) |
| 6 | Normalization | Reused `columnAliasUtils.ts` — covered by every existing adapter's own tests, unchanged |
| 7 | Required-field validation | `regionsAdapter.test.ts` "blocks a row missing a required field" |
| 8 | Duplicate detection inside file | `regionsAdapter.test.ts` "classifies a duplicate region code inside the same file" |
| 9 | Duplicate detection against repository | `regionsAdapter.test.ts` "updates an existing region" + live smoke test (real Firestore read) |
| 10 | Parent-child reference resolution | Reused `groupsAdapter.ts` (region→group) — existing tests; Region has no parent by design |
| 11 | Create preview | `regionsAdapter.test.ts` "creates a new region"; live smoke test confirmed `Create`/`VALID` row |
| 12 | Update preview | `regionsAdapter.test.ts` "updates an existing region" |
| 13 | Conflict preview | `regionsAdapter.test.ts` "flags an existing code with a conflicting name as CONFLICT" |
| 14 | Invalid-row exclusion | `aiIntakePhase1Certification.test.ts` "allows excluding individual rows before approval" |
| 15 | Explicit approval requirement | `aiIntakePhase1Certification.test.ts` (single `commitJob` call site, gated by `canApprove`) |
| 16 | Idempotent execution | Reused `buildCommitOperationKey`/`previewSignature` — existing engine tests (`importJobEngine`, `actualsImportRunner.test.ts`) |
| 17 | Partial failure | Reused `commitJob`'s existing `PARTIALLY_COMPLETED` path — existing engine tests |
| 18 | Retry failed rows | Reused DX-7 retry/resume mechanism — existing `actualsImportRunner.test.ts` |
| 19 | Owner/admin authorization | `regionsAdapter.test.ts` "rejects bulk Region import from a non-admin actor" |
| 20 | Blocked non-admin access | `aiIntakePhase1Certification.test.ts` "App.jsx registers /ai-intake gated by PR roles={ADMIN}" |
| 21 | Audit log creation | Reused `logAction()` — existing `dxAuditTypes`/adapter commit tests |
| 22 | Zero-row input | `aiIntakePhase1Certification.test.ts` "renders EmptyState when parsedRows is empty" |
| 23 | Malformed source | `textIntakeParser.test.ts` "returns UNRECOGNIZED for malformed JSON"; `pdfIntakeParser.test.ts` "PARSE_ERROR for a malformed/corrupt PDF" |
| 24 | No automatic destructive operations | `aiIntakePhase1Certification.test.ts` section 4 (source-scan for delete/reset/Auth-mutation calls) |

## Full validation sweep

- Focused: 39 files / 374 tests in `src/services/dataExchange/` (includes all new files above) — all pass.
- Full suite: **378 files / 25,746 tests — all pass**, zero regressions.
- TypeScript: same pre-existing repo-wide condition (no `typecheck` script; `?raw`-import resolution errors pre-date this session). Zero new type errors introduced by any file in this phase (verified by filtering `tsc --noEmit` output for every new/changed file name).
- Build: `npm run build` succeeds — only the same pre-existing chunk-size/dynamic-import warnings; one new `pdf` chunk (~330 kB) from `pdfjs-dist`.

## Live smoke test (real Firestore reads, zero writes)

Signed in as the protected admin (session already established earlier
in this working session):

- `/ai-intake` loads cleanly, no console errors from the page itself.
- Pasted `Region Code,Region Name\nZZTEST,Zzz Test Region` → auto-detected
  as **Regions at 100% confidence**.
- "Validate & preview" performed a real `getDocsFromServer` read of the
  live `regions`/`districts`/`pharmacies`/`users`/`kpi_registry`
  collections via `fetchIntakeExistingData()`, then classified the test
  row **VALID / Create** (since `ZZTEST` does not exist in the live
  registry) — confirming genuine duplicate-against-Firestore detection
  works, not a stub.
- **Stopped at the Preview step, deliberately** — Approve/Execute was
  not clicked, so **no Firestore document was created**, per this
  task's "no Firestore production mutation" restriction. The Execute
  path itself is proven correct via `regionsAdapter.test.ts`'s
  create/update tests (mocked Firestore) instead of a real write.
