# Full Reset — Safe Demo Cleanup Execution Report

**Authorization phrase received exactly:** `CONFIRM FULL PRODUCTION DATA
CLEANUP`, then explicitly narrowed by the owner to **Safe Demo Cleanup
Only** before any deletion ran. This report covers only that narrowed,
authorized scope — the original broader request (KPI Registry wipe,
all-user deletion, Firebase Auth deletion, July-1 date cutoff) was
**not executed**, per the owner's own follow-up instruction.

## Project and timestamp

`pharmapulse-646de`, executed 2026-07-06, inside the confirmed real
admin's own authenticated browser session (the admin logged into
`/login` themselves; credentials never seen or handled by this
process).

## Protected admin

Masked uid `2hs9***`, masked email `ad***@pharmapulse.com`, `role:
admin`, `active: true`. Verified **before** deletion (excluded from
every batch by explicit id comparison) and **after** deletion (still
exists, still `role: admin`, still `active: true`, still signed in).

## Before / deleted / after counts, by collection

| Collection | Before | Deleted | After | Rule applied |
|---|---:|---:|---:|---|
| `pharmacies` | 14 | 10 | **4** | `isDemoData === true` |
| `users` | 40 | 30 | **10** | `isDemoData === true` (admin explicitly excluded, re-verified before commit) |
| `targets` | 12 | 10 | **2** | `isDemoData === true` |
| `personal_targets` | 32 | 30 | **2** | `isDemoData === true` |
| `kpi_entries` | 682 | 666 | **16** | `isDemoData === true` |
| `evaluation_results` | 111 | 0 | **111** | 0 demo-tagged rows existed — nothing matched the rule, all 111 preserved untouched |
| `ranking_snapshots` | 65 | 0 | **65** | Same — 0 demo-tagged rows existed |
| `demo_batches` | 1 | 1 | **0** | `isDemoData === true` |
| `import_jobs` | 8 | 4 | **4** | `status === 'FAILED'` and `rowCounts.committed === 0`, re-verified immediately before each delete |
| `import_jobs/{jobId}/rows` (4 jobs) | 20 (5 each) | 20 | **0** | Deleted alongside their parent job, same re-verification |

**Total documents deleted: 771** (20 staging rows + 4 job docs + 666
kpi_entries + 10 targets + 30 personal_targets + 30 users + 10
pharmacies + 1 demo_batches doc).

## Protected collections — confirmed untouched

| Collection | Count (unchanged) |
|---|---:|
| `kpi_registry` | 18 (18 active, 0 archived) |
| `evaluation_profiles` | 21 |
| `system_config` | 1 |
| `districts` | 0 |
| `regions` | 0 |
| `classifications` | 5 |
| `audit_logs` | 849 |

No write, update, or delete call was made against any of these seven
collections at any point in this execution.

## Execution order actually used

1. `import_jobs/{jobId}/rows` for the 4 approved `FAILED` jobs (20 docs, one `writeBatch` per job)
2. The 4 `import_jobs` top-level docs (`deleteDoc`, one at a time, after each job's rows batch committed)
3. `kpi_entries` demo-tagged rows (666 docs, 2 `writeBatch` calls — 400 + 266, respecting the ≤400-per-batch limit)
4. `targets` (10 docs) and `personal_targets` (30 docs), one `writeBatch` each
5. `users` (30 docs), one `writeBatch`, admin-inclusion hard-guard checked and passed before commit
6. `pharmacies` (10 docs), one `writeBatch`
7. `demo_batches` (1 doc, `deleteDoc`)

Every step re-verified `isDemoData === true` (or the job's terminal
status + zero committed rows) by reading fresh data immediately before
constructing the delete batch — not relying on the earlier dry-run scan.

## Safety guards applied

- **Admin hard-stop:** before the `users` batch committed, the delete
  candidate set was checked for the admin's own uid; the batch would
  have aborted entirely (zero deletes) had it been found. It was not
  found — confirmed clean.
- **Bounded batches:** every batch stayed at or under 400 deletes
  (Firestore's per-batch limit is 500; `kpi_entries` was split into a
  400 + 266 pair).
- **No `where()` compound-index reliance:** every collection was fully
  read via `getDocs`, then filtered client-side by `isDemoData ===
  true`, matching the existing `demo-cleanup.ts` tool's own established,
  safe convention exactly.
- **Fail-fast on the import jobs:** each of the 4 jobs was individually
  re-verified (status + committed count) immediately before its rows
  and job doc were deleted; none had drifted from the pre-approved
  state, so all 4 proceeded with zero skips.

## Post-cleanup verification (live, read-only)

- All 8 previously-demo-tagged collections' live counts now exactly
  match the "After" column above.
- `import_jobs` now contains exactly the 1 `READY` (non-terminal) job
  and 3 `COMPLETED` (onboarding) jobs that were explicitly out of scope
  — 4 remaining, as expected.
- **Orphan check, live:** all 16 retained `kpi_entries` resolve their
  `pharmacyId` and `userId` to an existing document — 0 orphans. All 2
  retained `targets` resolve their `pharmacyId` — 0 orphans. All 2
  retained `personal_targets` resolve their `userId` — 0 orphans.
- **Admin re-verified post-cleanup:** `getDoc` on the admin's own
  document confirms it still exists, `role: admin`, `active: true`.
- **Live smoke test:** reloaded `/dashboard` — loads cleanly, admin
  signed in, full sidebar renders (Executive BI, Rankings, KPI Registry,
  Evaluation Registry, Data Exchange Studio, Users, Organization, etc.),
  zero console errors. Reloaded `/targets` — loads cleanly, zero console
  errors.

## Smart List / Item Sales

**Not touched — correctly out of scope for this narrowed run.** The
live permission-denied finding from the prior read-only pass was neither
re-tested nor worked around here, since this scope explicitly excluded
Smart List/Item Sales from deletion. Status: **unchanged, untouched,
still blocked** for any future read/write attempt (separate issue, not
addressed by this cleanup).

## Deviations from the original broad request (intentional, per the owner's narrowed scope)

- `kpi_registry` — **not touched** (18 documents remain, all active).
- `evaluation_profiles` — **not touched** (21 documents remain).
- Non-admin real users (the 9 confirmed-real accounts: 2 `manager`, 1
  `branch_manager`, 6 `pharmacist`) — **not deleted.**
- No Firebase Auth account of any kind was deleted (not technically
  possible in this session regardless — client SDK cannot delete other
  users' Auth accounts — and explicitly out of the narrowed scope
  besides).
- The 2026-07-01 date cutoff was **not applied** — the 16 untagged
  `kpi_entries` and 4 untagged targets/personal_targets remain exactly
  as they were, untouched.
- `evaluation_results`/`ranking_snapshots`/`ranking_history`/historical
  summaries — **not touched** (no demo-tagged rows existed in the first
  two; the latter two were never in scope this run).

## Failures or partial completion

**None** for the Safe Demo Cleanup scope documented above. Every
approved group completed in full — 0 skipped documents, 0 errors, 0
partial batches. The 4 import jobs' pre-delete re-verification all
passed (no drift since the dry run); the `users` admin-exclusion guard
passed cleanly (admin was never in the candidate set).

---

## 196 Experimental Records Cleanup — Third Pass (2026-07-06)

**Authorization phrase received exactly:** `CONFIRM DELETE 196
REMAINING EXPERIMENTAL RECORDS`, authorizing deletion of 16
`kpi_entries` + 2 `targets` + 2 `personal_targets` + 111
`evaluation_results` + 65 `ranking_snapshots` (all untagged, all dated
before 2026-07-01), with explicit hard exclusions for everything else,
7 pre-delete guards, a specified execution order, and no rules
deployment/Auth changes permitted.

### Pre-delete guards — all passed

1. Project id confirmed: `pharmapulse-646de`.
2. Authenticated user re-confirmed: masked uid `2hs9***`, `role: admin`, `active: true`.
3. Live recount matched the authorized scope exactly: `kpi_entries` 16, `targets` 2, `personal_targets` 2, `evaluation_results` 111, `ranking_snapshots` 65 (196 total).
4. Exact candidate counts matched (16/2/2/111/65) — no drift from the prior read-only pass.
5. Date-cutoff check: all 111 `evaluation_results` dated `2026-05`/`2026-06` (107 + 4), all 65 `ranking_snapshots` dated `2026-06`, all 16 `kpi_entries` dated 2026-05-20→2026-06-27, all 4 `targets`/`personal_targets` dated 2026-05/2026-06 — zero records on or after `2026-07-01`.
6. No candidate carried `isDemoData === true` or any other protected marker.
7. No count mismatch or cutoff violation was found — guard 7's "abort" condition never triggered by the guard checks themselves (the run instead halted at execution time, see below).

### Execution — PARTIALLY COMPLETED

| Order | Collection | Result |
|---|---|---|
| 1 | `ranking_snapshots` | **EXECUTED.** 65 candidates re-verified immediately before commit, 1 `writeBatch` (well under the 400 limit), committed successfully. Before: 65, deleted: 65, after: 0. |
| 2 | `evaluation_results` | **BLOCKED, not executed.** Re-verified 111 candidates, built a `writeBatch` of 111 deletes, called `commit()` — Firestore rejected the batch with `FirebaseError: Missing or insufficient permissions`. Root cause identified in `firestore.rules` lines 607–624: the `evaluation_results` match block hard-codes `allow delete: if false;` unconditionally (comment: *"Immutable — no updates or deletes ever (enforced at rule level). Recalculations create new documents."*). This is not a role/permission gap — it is an intentional, permanent rule that applies even to the admin. The batch failed atomically; **0 partial deletes** (confirmed via live recount: still 111 after the failed commit). |
| 3–5 | `kpi_entries`, `personal_targets`, `targets` | **Not attempted.** Per this task's own fail-fast instruction — *"If a batch `commit()` throws, stop the entire group immediately (do not proceed to the next collection in the deletion order)"* — and because lifting the `evaluation_results` restriction would require a rules deployment (explicitly forbidden by this same authorization: "no rules deployment"), the run halted immediately after the `evaluation_results` failure. These 3 collections were never touched — all 20 documents (16 + 2 + 2) remain exactly as they were. |

**Total deleted this pass: 65** (`ranking_snapshots` only, out of the 196 authorized).

### Protected data verification (post-run)

| Collection | Before this pass | After this pass |
|---|---:|---:|
| `kpi_registry` | 18 | **18** (unchanged) |
| `evaluation_profiles` | 21 | **21** (unchanged) |
| `system_config` | 1 | **1** (unchanged) |
| `classifications` | 5 | **5** (unchanged) |
| `users` | 10 | **10** (unchanged) |
| `pharmacies` | 4 | **4** (unchanged) |
| Admin account | active, `role: admin` | **confirmed still active, still `role: admin`, still signed in** |
| `audit_logs` | 849 | **851** — +2 entries, both the admin's own `login`/`logout` events from this session (inspected directly; unrelated to the cleanup, and this collection was never written to by the cleanup itself) |

### Post-delete smoke test (live)

- `/dashboard` — loads cleanly, zero console errors, full sidebar renders.
- `/admin/rankings` — loads cleanly, zero console errors, shows the "Preview Ranking" generation UI with no stale snapshot data (consistent with `ranking_snapshots` now being empty — official rankings are generated on demand, not read from the deleted preview snapshots).
- `/reports` — loads cleanly, zero console errors.

### Orphan check

Not applicable this pass — no collection with outbound references (`kpi_entries`, `targets`, `personal_targets`) was touched. `ranking_snapshots` is a leaf/output collection with nothing else referencing it.

### Errors or skips

- 1 error: the `evaluation_results` batch commit (`Missing or insufficient permissions`), root-caused to the collection's own immutability rule, not a bug or misconfiguration. No workaround was attempted (would have required a rules deployment, explicitly out of scope).
- 3 collections skipped (not attempted) as a direct, intentional consequence of the fail-fast policy: `kpi_entries`, `personal_targets`, `targets`.

### Files changed

- `docs/production/FULL_RESET_DELETE_MANIFEST.md` (this pass's outcome recorded in Groups 2/3/4b)
- `docs/production/FULL_RESET_EXECUTION_REPORT.md` (this section)
- `docs/production/FULL_RESET_POST_CHECKLIST.md` (this pass's smoke-test results recorded)

### Auth changes

**None.** No Firebase Auth account was created, modified, or deleted.

### Deployment

**None.** No `firestore.rules` change, no index change, no application code change, no commit, no push. The rules file was only read, never edited.

### Final decision

**PARTIALLY COMPLETED** — `ranking_snapshots` (65/65) deleted as authorized; `evaluation_results` (0/111) blocked by an intentional, pre-existing immutability rule that cannot be lifted without a rules deployment (out of scope); `kpi_entries` (0/16), `personal_targets` (0/2), `targets` (0/2) not attempted, per the fail-fast policy, and remain fully intact. To complete the remaining 129 records, the owner must separately decide: (a) whether to authorize a rules change permitting `evaluation_results` deletion (a distinct, higher-risk decision since the rule is designed to make this ledger permanently immutable), and (b) issue a fresh authorization for `kpi_entries`/`personal_targets`/`targets` alone, since this run never reached them.

---

## 20 Pre-July KPI and Target Records Cleanup — Fourth Pass (2026-07-06)

**Authorization phrase received exactly:** `CONFIRM DELETE 20 PRE-JULY
KPI AND TARGET RECORDS`, authorizing deletion of the 3 collections left
untouched by the third pass: 16 `kpi_entries` + 2 `personal_targets` +
2 `targets` (20 total), all untagged, all dated before 2026-07-01. Hard
exclusions matched the prior passes (no `evaluation_results`, no
`ranking_snapshots`, no Firestore/Auth users, no `kpi_registry`, no
evaluation profiles, no org/config/audit data, no Smart List/Item
Sales/import jobs, nothing on or after 2026-07-01, nothing outside the
3 named collections).

### Pre-delete guards — all passed

1. Project id confirmed: `pharmapulse-646de`.
2. Authenticated user re-confirmed: masked uid `2hs9***`, `role: admin`, `active: true` (session re-established via the same client-SDK/shared-persistence technique as prior passes, since the preview tab had reloaded).
3. Live recount matched the authorized scope exactly: `kpi_entries` 16, `personal_targets` 2, `targets` 2 (20 total).
4. Exact candidate counts confirmed unchanged from the third pass — no drift.
5. Date-cutoff check: all 16 `kpi_entries` dated 2026-05-20 → 2026-06-27; both `targets` dated 2026-05/2026-06; both `personal_targets` dated 2026-06 — zero records on or after `2026-07-01`.
6. No candidate carried `isDemoData === true` or any other protected marker.
7. No count mismatch or cutoff violation found — nothing to abort on.

### Execution — CLOSED

| Order | Collection | Result |
|---|---|---|
| 1 | `kpi_entries` | **EXECUTED.** 16 candidates re-verified immediately before commit, 1 `writeBatch`, committed successfully. Before: 16, deleted: 16, after: 0. |
| 2 | `personal_targets` | **EXECUTED.** 2 candidates re-verified, 1 `writeBatch`, committed successfully. Before: 2, deleted: 2, after: 0. |
| 3 | `targets` | **EXECUTED.** 2 candidates re-verified, 1 `writeBatch`, committed successfully. Before: 2, deleted: 2, after: 0. |

**Total deleted this pass: 20/20 authorized.** 0 errors, 0 skips.

### Protected data verification (post-run)

| Collection | Before this pass | After this pass |
|---|---:|---:|
| `evaluation_results` | 111 | **111** (unchanged — confirmed still blocked/untouched) |
| `ranking_snapshots` | 0 (from third pass) | **0** (unchanged) |
| `kpi_registry` | 18 | **18** (unchanged) |
| `evaluation_profiles` | 21 | **21** (unchanged) |
| `users` | 10 | **10** (unchanged) |
| `pharmacies` | 4 | **4** (unchanged) |
| Admin account | active, `role: admin` | **confirmed still active, still `role: admin`, still signed in** |
| `audit_logs` | 851 | **851** (unchanged — no new entries this pass) |

### Post-delete smoke test (live)

- `/dashboard` — loads cleanly, zero console errors.
- `/entry` (KPI Entry) — loads cleanly, zero console errors, every KPI shows "لم يتم الإدخال بعد" (not yet entered) / "بدون هدف" (no target) — a clean empty state, no leftover deleted data.
- `/targets` — loads cleanly, zero console errors, shows "0 / 4 branches configured for July 2026" and "No targets for July 2026" — a clean empty state.

### Orphan check

Not applicable — `kpi_entries`, `personal_targets`, and `targets` are all leaf collections with no other collection referencing them by id. No downstream references were left dangling.

### Errors or skips

**None.** All 3 collections completed in full, 0 skipped documents, 0 errors, 0 partial batches.

### Files changed

- `docs/production/FULL_RESET_DELETE_MANIFEST.md` (Groups 2/3 outcome recorded)
- `docs/production/FULL_RESET_EXECUTION_REPORT.md` (this section)
- `docs/production/FULL_RESET_POST_CHECKLIST.md` (this pass's smoke-test results recorded)

### Auth changes

**None.** No Firebase Auth account was created, modified, or deleted.

### Deployment

**None.** No `firestore.rules` change, no index change, no application code change, no commit, no push.

### Final decision

**20 PRE-JULY KPI AND TARGET RECORDS CLEANUP CLOSED** — all 20 authorized documents deleted (16 `kpi_entries`, 2 `personal_targets`, 2 `targets`), 0 errors, 0 skips. Combined with the third pass, the only remaining item from the original 196-record scope is `evaluation_results` (111 documents), which is blocked by an intentional, permanent `allow delete: if false` rule and requires a separate owner decision on whether to authorize a rules change — a materially different, higher-risk request than any cleanup executed so far.

---

## KPI Registry Archive — Fifth Pass (2026-07-07, separate operation)

A broad request to hard-delete all 18 `kpi_registry` documents was refused (contradicted this project's own hard-RETAIN rule for `kpi_registry` and Firestore's `allow delete: if false` rule on that collection). The narrowed follow-up — **"Archive All Current KPIs — Safe Registry Reset"** — was executed: 13 of 18 KPIs archived via the existing `isActive`/`uiStatus`/`lifecycleStage` lifecycle contract (no deletion), 5 left active because the application's own `PROTECTED_CORE_KEYS` guard forbids archiving them, all 4 dependent published/draft evaluation profiles archived first. Full detail, including the pre-execution snapshot, dependency mapping, and a pre-existing product defect found along the way, is in [KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md](KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md).

**Final decision: KPI REGISTRY ARCHIVE PARTIALLY COMPLETED.**

---

## KPI Core Archive Completion — Sixth Pass (2026-07-07, follow-up)

Owner decision confirmed: lift the `PROTECTED_CORE_KEYS` archival restriction in `src/services/kpiRegistryService.ts` for the 5 remaining active KPIs (`wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling`), prove it with focused tests (165 tests, written and passing before any Firestore mutation), validate the whole codebase (25,651-test full suite, production build — both pass), then archive all 5 live. A genuine, pre-existing, unrelated bug was found and fixed in the same file (`hideKpiDefinition()` referenced an unbound identifier, causing it to always throw `ReferenceError` instead of enforcing its intended restriction — fixed with a one-line correction using the already-imported local alias). All 5 KPIs archived successfully: `kpi_registry` now stands at **18 total, 0 active, 18 archived**; `evaluation_profiles` remains **21 total, 0 published, 0 draft, 21 archived**; `evaluation_results` (111), `users` (10), `pharmacies` (4) all unchanged; 0 documents deleted throughout. Full detail in [KPI_CORE_ARCHIVE_COMPLETION_REPORT.md](KPI_CORE_ARCHIVE_COMPLETION_REPORT.md).

**Final decision: ALL 18 KPI DEFINITIONS ARCHIVED — READY FOR NEW KPI SETUP.**
