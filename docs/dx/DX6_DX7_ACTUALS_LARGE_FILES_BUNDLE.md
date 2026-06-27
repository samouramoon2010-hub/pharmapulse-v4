# Actuals & Large Files Bundle (DX-6 / DX-7) — Implementation Record

Status: **Implemented and closed.** Builds on the closed DX-1–DX-5 bundles (`DX_STUDIO_ARCHITECTURE_V1.md`,
`DX4_DX5_KPI_TARGETS_BUNDLE.md`). Does not modify, redesign, or depend on any change to that closed work,
and does not modify the legacy `KPI_ACTUALS` domain (`adapters/kpiActualsAdapter.ts`).

## Scope

- **DX-6** — KPI Actuals Import via the generic Import Job Engine, for Branch-level and Pharmacist-level actuals.
- **DX-7** — Large File Processing: chunked validation, live progress, checkpointed/resumable commit, retry of
  failed rows, cooperative cancellation, and concurrency/double-commit protection.

DX-8 and later bundles are explicitly out of scope and were not started.

## Architecture

Both domains implement the existing `ImportDomainAdapter<TRaw, TStaged, TCommitResult>` contract and run
through the DX-1 Import Job Engine (`createImportJob` / `runValidation` / `commitJob`). The engine itself
gained two **additive, optional** hooks on `commitJob()` (`importJobEngine.ts`) — every existing caller
(`onboardingOrchestrator.ts`, `kpiTargetsImportRunner.ts`, every prior test) is unaffected:

- `onBatchComplete(batchResult, runningTotals)` — invoked after each committed/failed row, before the next
  starts. The engine still never touches Firestore — checkpointing happens in the caller.
- `shouldCancel()` — checked before each row; when true, the loop stops without starting the next row.
  Already-committed rows are never rolled back.

A self-identified correctness fix shipped alongside these hooks: `commitJob()`'s final-status computation
now accounts for rows left un-attempted after a cooperative cancel (`remainingTotal`), so a cancelled-mid-loop
commit with zero failures so far correctly reports `PARTIALLY_COMPLETED`, not `COMPLETED`.

### New ImportDomain values

`BRANCH_ACTUALS` / `PHARMACIST_ACTUALS` (`importJobTypes.ts`) — split out of the generic, intentionally
permissive `KPI_ACTUALS` legacy domain, the same pattern used when `BRANCH_TARGET`/`PHARMACIST_TARGET` were
split out of a generic "targets" concept in DX-5.

### Adapters

| File | Domain | Commits via |
|---|---|---|
| `adapters/branchActualsAdapter.ts` | `BRANCH_ACTUALS` | `saveKpiActualEntry()` (→ real `saveKpiEntry()`) |
| `adapters/pharmacistActualsAdapter.ts` | `PHARMACIST_ACTUALS` | `saveKpiActualEntry()` (→ real `saveKpiEntry()`) |

No new Firestore collection. Every commit writes the production `kpi_entries` document via the real,
already-tested `saveKpiEntry()` — `dxKpiEntryTypes.ts` is a narrow typed wrapper only (mirrors `dxKpiTargetTypes.ts`).

### Runner

`actualsImportRunner.ts` mirrors `kpiTargetsImportRunner.ts`'s single-domain Validate/Preview/Confirm/Commit
shape (these two domains have no inter-dependency on Groups/Branches/Pharmacists/Assignments, so they don't
need the 4-domain onboarding pipeline either), extended with:

- `validateActualsJob()` — chunked, yielding parse pass (`DX7_CONFIG.VALIDATION_CHUNK_SIZE`, default 200 rows
  per yield) so a large file doesn't freeze the tab; a hard `DX7_CONFIG.MAX_ROWS_PER_FILE` ceiling enforced
  before validation runs; returns both the full `rows`/summary and a `previewRows` array capped at
  `DX7_CONFIG.PREVIEW_ROW_CAP` for UI rendering only.
- `commitActualsJob()` — fresh commit from `READY`, with the same stale-preview and already-committing/
  already-committed guards as `commitKpiTargetsJob()`, wired to a per-row Firestore checkpoint
  (`onBatchComplete`) and an optional `shouldCancel`.
- `resumeOrRetryActualsJob()` — the **same mechanism** serves both "browser closed mid-commit" (resume) and
  "some rows failed" (retry): `confirmedPrefix()` finds the first batch index that is not fully committed
  (`failed > 0`, or simply never ran) and re-enters `commitJob()` from there, passing the truly-confirmed
  prefix back as `existingBatches` — those rows are never re-executed.

## KPI entry attribution — the central architectural decision

`kpi_entries`' `create` Firestore rule requires `isOwnData()`: the payload's `userId` must equal the caller's
own Auth UID. There was no existing path for an admin to bulk-write a *real* entry attributed to someone
else — the only prior bypass was the demo-seeder's `isDemoData:true` carve-out, which does not apply to real
production actuals.

**Resolution (explicit, narrow, audited):**
- `firestore.rules` (`kpi_entries` create) gained one additional `||` clause, mirroring the `isDemoData`
  bypass exactly: `isAdmin() && importedViaDataExchange:true && importBatchRef is a non-empty string`.
- `saveKpiEntry()` (`kpiService.js`) gained two additive params, `isDataExchangeImport` / `importBatchRef`.
  When `isDataExchangeImport` is true, the admin's own `auth.currentUser.uid` is **not** substituted for the
  passed `userId` (the opposite of every manual-entry call site) and the payload carries the two marker
  fields the rule checks. Omitted (every existing call site), behavior is byte-for-byte unchanged — verified
  by the pre-existing `kpiEntryUserIdFix.test.ts` / `managerKpiEntryAccess.test.ts` source-level guards,
  which still pass unmodified in intent (one assertion's exact-string target was adjusted to match the new
  surrounding code shape, not its meaning).
- `dxKpiEntryTypes.ts`'s `saveKpiActualEntry()` always passes `isDataExchangeImport: true` — there is no way
  to call the DX-6 commit path without supplying a non-empty `importBatchRef` (enforced by a thrown error in
  `saveKpiEntry()` itself, not just the Firestore rule).

This is the only Firestore rules change in this bundle. No index changes were required.

## Branch Actuals attribution (resolved ambiguity)

There is no branch-only, non-user-attributed `kpi_entries` contract. A Branch Actual is attributed to the
branch's `managerUid` (`PharmacyRecord.managerUid`) — the branch's assigned manager becomes the entry's
`userId`. A branch with no manager assigned cannot receive a Branch Actual row; this is a blocking
`BRANCH_HAS_NO_MANAGER` validation error, never a silent fallback to any other identity.

## Pharmacist Actuals identity resolution

Reuses `fetchExistingOnboardingData()`'s CLAIMED-excluding `pharmacistsByEmployeeId`/`pharmacistsByEmail`
maps — the same boundary established for Pharmacist Targets (DX-5b). A CLAIMED record never appears in
those maps, so it reads as "unknown pharmacist," never a separate or weaker code path. Identifier resolution
order: Employee ID → email → UID.

## Validation rules (implemented)

Both adapters share the same rule shape:

- **Date**: `YYYY-MM-DD` / `YYYY/MM/DD` accepted and normalized (zero-padded month/day); future dates rejected
  (`FUTURE_DATE`).
- **Branch**: must exist and be active (`UNKNOWN_BRANCH` / `INACTIVE_BRANCH`); Branch Actuals additionally
  requires a `managerUid` (`BRANCH_HAS_NO_MANAGER`).
- **KPI**: must exist, be `isActive`, not `archived`, be in `production_evaluation` lifecycle stage
  (`KPI_NOT_PRODUCTION_EVALUATION`), and be `visibility.dashboardEnabled` (`DASHBOARD_IMPORT_NOT_ENABLED`) —
  pre-validated explicitly here rather than relying on `saveKpiEntry()`'s internal
  `sanitizeKpiEntryFields()`/`buildAllowedEntryKeys()`, which would otherwise silently drop a disallowed KPI
  field from the payload instead of surfacing a row-level error.
- **Value**: required (blank ≠ explicit `0`), numeric, non-negative.
- **Pharmacist Actuals only**: pharmacist must exist as an active operational record (`UNKNOWN_PHARMACIST` —
  also covers CLAIMED), be active (`INACTIVE_PHARMACIST`), have no identity ambiguity (`IDENTITY_REVIEW_REQUIRED`,
  classified `CONFLICT`), and belong to the stated branch (`PHARMACIST_BRANCH_MISMATCH`).
- **Duplicates**: within-file duplicate identity (`${userId}_${pharmacyId}_${date}_${kpiKey}`) classified
  `DUPLICATE`, never silently merged.
- **Existing entries**: a different existing value for the same identity is classified `UPDATE` (old vs new
  value carried on the staged row for preview); an identical value is `SKIP`; no existing value is `CREATE`.
  Never a silent overwrite.

## Commit semantics

Identical gate to every prior bundle: Validate (zero writes) → Preview (with a `previewSignature`
fingerprint) → explicit confirmation → Commit. `commitActualsJob()` refuses to commit if the job already
finished/started committing, or if a fresh re-validation's signature no longer matches what was previewed.
`chunkSize: 1` — both domains commit through the single-document `saveKpiEntry()` production service per
row, the same convention as every prior single-document-commit adapter.

## DX-7: chunking, progress, checkpoint, resume, retry, cancel

- **Chunk sizes** (`dx7Config.ts`, `DX7_CONFIG`): `VALIDATION_CHUNK_SIZE = 200` rows per yield-to-event-loop
  during parsing; `COMMIT_CHUNK_SIZE = 1` (matches the single-document-commit convention, not configurable
  per-call); `MAX_ROWS_PER_FILE` reuses the existing `INGESTION_LIMITS.MAX_ROWS_PER_BATCH` (2000) rather than
  inventing a new ceiling; `PREVIEW_ROW_CAP = 200`; `MAX_RETRY_ATTEMPTS = 5`.
- **Progress**: `onProgress({ committed, failed, skipped, totalCommittable })` fires after every row.
- **Checkpointing**: after every committed/failed row, the runner persists a partial `ImportJob` snapshot
  (`commitBatches` so far + recomputed `rowCounts`) via `repo.saveJob()` — full per-row durability, not just
  per-large-chunk.
- **Resume**: an interrupted `COMMITTING` job (browser closed mid-loop) re-enters via `resumeOrRetryActualsJob()`,
  which loads the persisted staged rows and the last-confirmed-prefix of `commitBatches`, and continues from
  the first non-confirmed batch index. The already-committed prefix is passed back as `existingBatches` —
  never re-executed, never duplicated in `kpi_entries`.
- **Retry**: a `PARTIALLY_COMPLETED` job (some rows failed) uses the identical mechanism — the failed batch
  is, by definition, not part of the "confirmed prefix," so it's naturally re-attempted on the next call.
  Capped at `MAX_RETRY_ATTEMPTS`; a job that has hit the cap must be re-uploaded as a fresh file.
- **Cancellation**: `shouldCancel()` is checked before each row; already-committed rows are never rolled back
  (no transactional rollback exists for this commit path) — the job ends at `PARTIALLY_COMPLETED` with an
  accurate committed/remaining count, and remains resumable via the same resume mechanism.
- **Concurrency / double-commit protection**: `commitActualsJob()` refuses a second commit attempt against a
  job already `COMMITTING`, `PARTIALLY_COMPLETED`, or `COMPLETED` — the caller must use
  `resumeOrRetryActualsJob()` instead. A `COMPLETED` job can never be resumed or retried (state-machine edge
  does not exist).

### State machine — no new states

`importJobStateMachine.ts` gained exactly two new transition **edges**, no new `ImportJobStatus` values:
`COMMITTING -> COMMITTING` (resume) and `PARTIALLY_COMPLETED -> COMMITTING` (retry). `PARTIALLY_COMPLETED`
is the pre-existing equivalent of "partial failure" and was reused, not duplicated. `CANCELLED` remains
unreachable from `COMMITTING` in the state machine (deliberately not changed) — a cancellation during commit
surfaces as `PARTIALLY_COMPLETED`, which already carries everything DX-7 needs (committed/failed/remaining
counts, resumability) without inventing a parallel "cancelled-but-partially-committed" status.

## Templates

`templateGenerator.ts` gained `buildBranchActualsTemplate()` / `downloadBranchActualsTemplate()` and
`buildPharmacistActualsTemplate()` / `downloadPharmacistActualsTemplate()`, following the exact established
pattern (canonical headers, one synthetic example row, an Instructions sheet covering date format,
identifier resolution order, KPI key/lifecycle requirements, zero-vs-blank, and the branch-manager
attribution deviation). No real or sensitive data in any template.

## UI

`DataExchangeStudioPage.jsx` gained one new minimal section, `ActualsImportSection`, following the exact
construction pattern already used for `KpiTargetsImportSection` (domain toggle, template download, upload,
Validate, capped preview, confirm checkbox, Commit), extended with the DX-7 states this task requires:
file-selected / parsing / validating / preview-ready / confirmation-required / committing / partial-failure
(`partial`, with a Resume/Retry button) / completed / failed / cancelled (`cancelling`, surfaced as
`PARTIALLY_COMPLETED` once the in-flight row finishes) — plus a live progress bar (percent, committed/failed
counts, elapsed seconds) and a Cancel button during commit. The page itself was not redesigned; only one new
section was added, reusing the existing page's own established style.

## Performance (measured, not claimed)

Tested with the full project test suite and the focused adapter/runner suites described below — synthetic
rows, in-memory/mocked Firestore (vitest), not a live Firestore load test. No claim of a tested maximum
real-world row count beyond `DX7_CONFIG.MAX_ROWS_PER_FILE` (2000, reused from the existing, already-proven
`INGESTION_LIMITS` ceiling) is made. Known limitation: `validateRow()` itself still runs in one synchronous
pass inside the unmodified `runValidation()` — only the `parseRow` pass before it is chunked/yielding. This
is acceptable because `validateRow()` is pure, in-memory, and fast per row (no I/O); a future bundle could
chunk `runValidation()` itself if a real file approaches the row ceiling and exhibits jank, but that was not
observed or required here.

## Security model

- Both adapters require `actorRole === 'admin'` in `authorizeRow()` — matching the existing `import_jobs`
  Firestore rule and every prior bulk-import adapter. No permission was broadened.
- The one Firestore rule change (`kpi_entries` create bypass) is the narrowest possible: it requires
  `isAdmin()` **and** two explicit marker fields that only `saveKpiActualEntry()` sets, and that field name
  (`importedViaDataExchange`) appears nowhere else in the codebase — it cannot be triggered by any other
  existing write path, accidentally or otherwise.
- No raw Auth UIDs, internal metadata, or stack traces are exposed in any UI surface added by this bundle.
- `importBatchRef` (the `import_jobs` jobId) is written onto every actuals `kpi_entries` document, making
  every DX-6 write traceable to a specific, admin-confirmed import job.

## Known limitations

- `validateRow()` is not internally chunked (see Performance) — only `parseRow` is.
- No true streaming Excel parsing; the whole file is parsed into memory by the existing `xlsx` library before
  chunked validation begins. `MAX_ROWS_PER_FILE` exists specifically to bound this.
- Branch Actuals requires every target branch to have a `managerUid` assigned — branches without one are
  rejected, not silently re-attributed.
- `CANCELLED` is not reachable from `COMMITTING` (see State Machine) — a cancelled-mid-commit job is reported
  as `PARTIALLY_COMPLETED`, which is functionally equivalent for every requirement in this task but is a
  different status label than a literal "CANCELLED" badge would show.

## Test/build/typecheck evidence

- Focused suites: `branchActualsAdapter.test.ts` (20 tests), `pharmacistActualsAdapter.test.ts` (20 tests),
  `actualsImportRunner.test.ts` (12 tests), `importJobStateMachine.test.ts` (10 tests, 3 new DX-7 cases),
  `importJobEngine.test.ts` (12 tests, including the new resume/checkpoint/cancellation-correctness cases),
  `templateGenerator.test.ts` (7 tests, 3 new) — all green.
- `src/services/dataExchange/` suite: 21 files / 209 tests, all green (was 18 files / 151 tests at DX-4/DX-5
  closure).
- Full project suite: 315 files / 24,814 tests, all green.
- Production build (`vite build`): passed.
- TypeScript (`tsc --noEmit --ignoreDeprecations 6.0`): 2,127 errors before and after this bundle — **zero
  new TypeScript errors**, identical to the confirmed DX-4/DX-5 baseline.
- Firestore: one rule change (`kpi_entries` create bypass, documented above); zero index changes.
