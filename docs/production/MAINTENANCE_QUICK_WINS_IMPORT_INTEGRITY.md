# Maintenance Quick Wins — importBatchRef Integrity Protection

Part 4 of the Maintenance Quick Wins phase.

## Full lifecycle audit

| Stage | Location |
|---|---|
| **Created** | `jobIdForActualsDomain()` in `src/services/dataExchange/actualsImportRunner.ts` — deterministic id (`${jobIdPrefix}-branch-actuals` / `-pharmacist-actuals`). Also created via `createImportJob({ jobId, ... })` (`importJobEngine.ts`) — a pure, in-memory `ImportJob` object, not yet persisted. |
| **Persisted** | `FirestoreStagingRepository.saveJob()` (`firestoreStagingRepository.ts:36`) — `setDoc(doc(db, COL.IMPORT_JOBS, job.jobId), ...)`. Called from `validateActualsJob()` (`actualsImportRunner.ts:260`) during the **Preview** step — always *before* any commit, per the Preview/Commit split (Closure Patch Part 4). |
| **Read (as a reference)** | `commitActualsJob()` (`actualsImportRunner.ts:319`) — `repo.loadJob(jobId)` — confirms the job exists and is in the right state before committing. |
| **Attached to writes** | `branchActualsAdapter.ts:269` / `pharmacistActualsAdapter.ts` (equivalent) — `importBatchRef: ctx.jobId` passed into `saveKpiActualEntry()` (`dxKpiEntryTypes.ts`) → `saveKpiEntry()` (`kpiService.js`). |
| **Persisted onto the referencing document** | `kpiService.js` `saveKpiEntry()` — `...(isDataExchangeImport ? { importedViaDataExchange: true, importBatchRef } : {})`, written into the `kpi_entries/{docId}` document. |

## Was a missing reference possible?

**In the real, wired production pipeline: no.** `commitActualsJob()` (the only
production entry point that reaches `saveKpiEntry` with
`isDataExchangeImport: true`) always runs after `validateActualsJob()` has
already persisted the job via `repo.saveJob()`. The `jobId` passed as
`importBatchRef` is therefore always a real, already-written
`import_jobs/{jobId}` document by the time any row commits.

**But `saveKpiEntry()` itself never verified this.** It is a shared,
lower-level function — any current or future caller that supplies an
arbitrary `importBatchRef` string (a copy/paste error, a new import path
that skips the runner, a manual script) could silently write a
`kpi_entries` document with a dangling `importBatchRef`, with no error at
write time. This is exactly the gap flagged by the PR-1G-A audit:

> P1-3 — `importBatchRef` has no existence check against `import_jobs` —
> "Currently latent (no group has been reset), but becomes a real
> dangling-reference risk the moment Reset Group 3 is ever approved —
> must be addressed before that group is executed, and is worth fixing
> independent of reset timing." (`LAUNCH_BLOCKERS_REGISTER.md`)

**Existing records:** no repair was needed or performed. This is a
new-write guard only — it does not read, validate, or touch any existing
`kpi_entries` document. Whether any existing document already has a
dangling `importBatchRef` is unknown (this phase does not query
production data) and out of scope — fixing that would be a data-repair
operation, explicitly excluded from this phase's scope ("no schema
migration, no production data changes").

## Fix implemented

`saveKpiEntry()` in `src/services/kpiService.js`, immediately after the
existing non-empty check and before any payload construction or Firestore
write:

```js
if (isDataExchangeImport && (!importBatchRef || typeof importBatchRef !== 'string' || !importBatchRef.trim())) {
  throw new Error('saveKpiEntry: isDataExchangeImport requires a non-empty importBatchRef')
}
if (isDataExchangeImport) {
  const jobSnap = await getDoc(doc(db, COL.IMPORT_JOBS, importBatchRef.trim()))
  if (!jobSnap.exists()) {
    throw new Error(`saveKpiEntry: importBatchRef "${importBatchRef}" does not reference an existing import job`)
  }
}
```

- **Smallest safe implementation:** a single existence check inside the
  one function every import-attributed write already funnels through —
  no new module, no schema change, no Firestore rules touched.
- **Runs before any write.** The check happens before `payload` is built
  and before `setDoc()` — a rejected reference never reaches Firestore,
  so there is no partial commit.
- **Manual entries are completely unaffected.** The check is inside the
  `if (isDataExchangeImport)` branch only; the far more common
  manual-entry path (`isDataExchangeImport` false/omitted) never executes
  it.
- **Never silently converts a missing reference to `null` or auto-creates
  the missing job.** It throws — the caller must fix the reference or
  create the job first, exactly per the "reject invalid references, don't
  silently create missing import jobs" requirement.
- **No existing valid write is broken.** Real production commits always
  have the job already persisted (see lifecycle audit above), so this
  check is a no-op success on every real call path today.

## Test-fixture regressions found and fixed (not production bugs)

Two existing adapter-level test files called `commitJob()` directly
(bypassing the full `validateActualsJob()` → persisted job → `commitJob()`
pipeline that real production always goes through), and their mocked
Firestore did not model the `import_jobs` collection at all — both
`COL` mocks lacked `IMPORT_JOBS`, and both `doc()`/`getDoc()`/`setDoc()`
mocks routed every collection into one undifferentiated map:

- `src/services/dataExchange/adapters/branchActualsAdapter.test.ts`
- `src/services/dataExchange/adapters/pharmacistActualsAdapter.test.ts`

**Fix:** updated both files' mocks to model `import_jobs` as a separate
map (mirroring the pattern already used in
`actualsImportRunner.test.ts`, which — being the full-pipeline test —
was unaffected), and pre-seed a `job-1` import-job document in
`beforeEach`, matching the real invariant that `repo.saveJob()` always
persists the job before any commit is attempted. This is not a weakened
test — it makes the fixture accurately model the real system's
guarantee, which these adapter-level tests had previously not needed to
represent.

7 tests initially failed across the two files; all 7 pass after the mock
fix, with no assertion changed.

## Required tests — all present

New file: `src/services/importBatchRefIntegrity.test.ts` (10 tests, all
passing), calling the real `saveKpiEntry()` against a mocked Firestore
that models `kpi_entries` and `import_jobs` as two independent
collections:

1. **Valid `importBatchRef` accepted** — write succeeds, document carries
   `importedViaDataExchange: true, importBatchRef: 'job-real'`.
2. **Missing referenced job rejected** — throws
   `/does not reference an existing import job/`, `entryDocs` stays empty.
3. **Blank/absent `importBatchRef` allowed for manual records** —
   omitting `isDataExchangeImport` entirely still succeeds (existing
   contract unchanged; manual entries never carry the import marker).
4. **Invalid type rejected** — a numeric `importBatchRef` throws the
   pre-existing `/requires a non-empty importBatchRef/` message before the
   new existence check ever runs. A whitespace-only string is rejected the
   same way (4b).
5. **No partial commit after failed validation** — a rejected reference
   leaves zero entry docs, zero audit calls, zero history-snapshot calls.
6. **Existing deduplication unchanged** — re-saving the same
   `userId_pharmacyId_date` composite key with a valid `importBatchRef`
   upserts (1 document, latest value wins), never duplicates.
7. **Existing import audit linkage unchanged** — a valid import write
   still logs exactly one `audit_logs` entry for the `kpi_entries`
   collection.
8. **Role/scope behavior unchanged** — `isDataExchangeImport` without an
   explicit `userId` still throws
   `/requires an explicit userId/`, regardless of actor role.
9. **No Firestore/Auth mutation during tests** — the existence check
   itself performs only a `getDoc` read against `import_jobs`; the
   `import_jobs` map is asserted unchanged (deep-equal) after the call —
   proving the check never writes to that collection.

## Validation

```
npx vitest run src/services/importBatchRefIntegrity.test.ts     → 10/10 passed
npx vitest run src/services/dataExchange/adapters/branchActualsAdapter.test.ts       → 20/20 passed
npx vitest run src/services/dataExchange/adapters/pharmacistActualsAdapter.test.ts   → 20/20 passed
npx vitest run src/services/dataExchange src/services/milestone2Ingestion.test.ts    → 33 files, 387/387 passed
```

No schema migration was needed or performed. No Firestore rules were
touched or deployed. No existing production `kpi_entries` document was
read, validated, or repaired.
