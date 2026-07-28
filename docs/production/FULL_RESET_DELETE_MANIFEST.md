# Full Reset — Delete Manifest

**UPDATE (2026-07-06, later same day): the "Safe Demo Cleanup Only"
scope below (Group 1 demo-tagged records + the 4 zero-committed `FAILED`
import jobs) has since been EXECUTED, with owner authorization. See
`FULL_RESET_EXECUTION_REPORT.md` for the full before/after/deleted
counts, safety guards applied, and post-cleanup verification. Groups
2–8 (untagged manual-review data, Smart List/Item Sales, non-demo users,
etc.) were NOT executed and remain exactly as described below — nothing
in this document past Group 1 and the import-jobs row is stale.**

**UPDATE (2026-07-06, third pass): authorization phrase `CONFIRM DELETE
196 REMAINING EXPERIMENTAL RECORDS` was received for the 196 records in
Groups 2, 3, and 4b. Result: PARTIALLY COMPLETED. `ranking_snapshots`
(65 rows) was EXECUTED — deleted in full. `evaluation_results` (111
rows) could NOT be executed: `firestore.rules` lines 621–623 hard-code
`allow delete: if false` on this collection unconditionally (an
intentional, permanent "immutable ledger" rule, not a permission gap
tied to role). Per the run's own fail-fast instruction ("if a batch
commit throws, stop the entire group immediately — do not proceed to
the next collection") and the explicit "no rules deployment" restriction
in the same authorization, the run halted before touching `kpi_entries`
(16), `personal_targets` (2), or `targets` (2) — those 3 collections
were never attempted this pass and remain fully untouched. See
`FULL_RESET_EXECUTION_REPORT.md` for full detail.**

**UPDATE (2026-07-06, fourth pass): authorization phrase `CONFIRM DELETE
20 PRE-JULY KPI AND TARGET RECORDS` was received for the 3 collections
left untouched by the third pass. Result: CLOSED. `kpi_entries` (16),
`personal_targets` (2), and `targets` (2) — all 20 documents deleted in
full, in order, with 0 errors and 0 skips. `evaluation_results` (111,
still blocked by its immutable-ledger rule) remains the only unresolved
item from the original 196-record scope. See
`FULL_RESET_EXECUTION_REPORT.md` for full detail.**

**UPDATE (2026-07-07, fifth pass — separate operation, not part of the
196-record scope): the previously hard-RETAIN `kpi_registry` collection
(18 documents) was the subject of two follow-up requests. The first,
`CONFIRM DELETE ALL 18 KPI REGISTRY DEFINITIONS AND INVALIDATE DEPENDENT
PROFILES`, was refused (would have hard-deleted the registry, contradicting
this document's own protected-allowlist rule and Firestore's own
`allow delete: if false` rule on `kpi_registry`). The narrowed follow-up,
`Archive All Current KPIs — Safe Registry Reset`, was executed:
13 of 18 KPIs archived (`isActive: false`, never deleted), 5 left active
because the application's own `PROTECTED_CORE_KEYS` guard forbids
archiving them. All 4 previously-published/draft evaluation profiles
were archived first so no active profile references any KPI. Full
detail in `docs/production/KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md`.
`kpi_registry`'s document count remains 18 — this was never a deletion.**

Real counts below were obtained via a live, authenticated, read-only
scan on **2026-07-06** against project `pharmapulse-646de`, run inside
the confirmed real admin's own browser session (see "Live Read-Only
Count Evidence" below and `FULL_RESET_DRY_RUN_REPORT.md` for the full
methodology and admin verification). Every query used was
`getCountFromServer`/`getDocs`/`getDoc` only for the read-only pass;
the subsequent executed cleanup used `writeBatch`/`deleteDoc` only
against the two explicitly-approved groups, documented separately in
`FULL_RESET_EXECUTION_REPORT.md`.

Full reasoning and citations for every rule below live in
`FULL_RESET_DRY_RUN_REPORT.md`. This file is the compact, execution-facing
version.

## Legend

- **Rule** — the exact field-level condition the scan checked.
- **Confidence** — High / Medium / Low.
- **Requires** — what must still happen before this group can move from
  candidate to approved.

| # | Collection(s) | Rule | Delete-candidate count | Retain count | Manual-review count | Confidence | Requires |
|---|---|---|---|---|---|---|---|
| 1 | `pharmacies`, `users`, `targets`, `personal_targets`, `kpi_entries`, `evaluation_results`, `ranking_snapshots`, `demo_batches` | `isDemoData === true` | **752 — EXECUTED, all 752 deleted** | **220 — retained, confirmed live post-cleanup** | 0 | High | ~~Owner approval only~~ **Done, see `FULL_RESET_EXECUTION_REPORT.md`** |
| 2 | `kpi_entries` (untagged) | No field-level rule exists | **16 — EXECUTED 2026-07-06, all deleted** | 0 | 0 remaining review | High | Done — see `FULL_RESET_EXECUTION_REPORT.md` "20 Pre-July KPI and Target Records Cleanup" |
| 3 | `targets`, `personal_targets` (untagged) | Same as #2 | **2 + 2 — EXECUTED 2026-07-06, all deleted** | 0 + 0 | 0 remaining review | High | Done — see `FULL_RESET_EXECUTION_REPORT.md` "20 Pre-July KPI and Target Records Cleanup" |
| 4a | `evaluation_results`, `ranking_snapshots` (demo-tagged) | `isDemoData === true` | **0** — neither collection had any demo-tagged row live | — | 0 | High | N/A — finding is that Group 1's assumption of a demo-tagged subset here was wrong; both collections are 100% untagged |
| 4b | `evaluation_results` (111), `ranking_snapshots` (65), `ranking_history` (2) | No marker | `ranking_snapshots`: **65 — EXECUTED, all deleted**. `evaluation_results`: **BLOCKED — `firestore.rules` hard-codes `allow delete: if false` on this collection unconditionally** (an intentional immutable-ledger rule, not a role/permission gap). `ranking_history` (2): not attempted (out of the authorized 196 scope). | `evaluation_results` 111 (unchanged, cannot be deleted without a rules change, which was explicitly out of scope this run) | 0 | Low → resolved 2026-07-06 | Deleting `evaluation_results` requires an owner decision on whether to relax the immutable-ledger rule — a rules deployment, out of scope for any cleanup run per this task's own restrictions. Referential spot-check (prior pass): 15/111 `evaluation_results` sampled, all resolve to an existing `evaluation_profiles` doc — 0 orphans |
| 4c | `daily_summaries` (13), `monthly_summaries` (0), `forecast_snapshots` (13), `risk_snapshots` (11) | No marker | 0 by default | 0 by default | **37 total** | Low | Owner confirmation |
| 4d | `shadow_evaluation_logs` | No marker; diagnostic-only | 0 by default | 0 by default | **27** | Low | Owner confirmation, lean retain |
| 5 | `item_sales_monthly`, `item_sales_branch_monthly` | No tagging convention exists | **CANNOT DETERMINE** | **CANNOT DETERMINE** | **CANNOT DETERMINE** | N/A | **Live finding: both collections returned `permission-denied` for the confirmed real admin, on every query attempted** — unfiltered `getCountFromServer`, unfiltered `getDocs`, and `getDocs` filtered by each of the 4 real `branchId`s. This is a live security-rules gap, not a script error (see `firestore.rules` lines 982–991: the `isAnyMgr()` role list includes `'admin'`, so this appears to be a genuine rule-evaluation issue independent of this cleanup task — flagged for separate investigation, not fixed here) |
| 6 | `import_jobs` (8 total) | Terminal status **and** zero committed rows | **4 (all `FAILED`, 0 committed rows each) — EXECUTED**: 20 staging rows + 4 job docs deleted, re-verified zero-committed immediately before each delete, 0 skips, 0 errors | **1 `READY`** (non-terminal, untouched) **+ 3 `COMPLETED`** (8 committed rows across onboarding domains, untouched — explicitly out of the approved scope) | 0 | Medium → **High (post-execution)** | Done for the 4 `FAILED` jobs — see `FULL_RESET_EXECUTION_REPORT.md`. The `READY`/`COMPLETED` jobs remain out of scope, not pending owner input |
| 7 | `users` (untagged, suspected test/onboarding) | No marker exists; `authStatus === 'CLAIMED'`/`PENDING_INVITATION` is NOT a valid delete signal | 0 by default | **10 real users**: 1 `admin` (protected), 2 `manager`, 1 `branch_manager`, 6 `pharmacist`. 9 active, 1 inactive. 7 `authStatus: NONE`, 3 `PENDING_INVITATION` (legitimate, not test accounts) | 0 — no suspected-test account could be identified from data alone | Low | Owner-supplied explicit test-account list, if any exists |
| 8 | `notifications` (0), `audit_logs` (849), `kpi_audit_logs` (0) | No marker (`notifications`); `audit_logs`/`kpi_audit_logs` are hard RETAIN | 0 | `audit_logs`: 849 (hard retain, unchanged) | `notifications`: 0 (nothing to review — collection is empty) | High (retain), N/A (nothing to review) | None — `audit_logs` actor spot-check: 10/10 sampled entries resolve to an existing `users` document, 0 orphans found |

## Protected allowlist — live-verified counts

| Collection | Live count | Note |
|---|---|---|
| `kpi_registry` | 18 total (2026-07-07: **5 active, 13 archived** — see the fifth-pass update above and `KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md`) | Document count unchanged at 18 — archiving is a field-level status change, never a deletion. `kpi_registry` remains hard RETAIN; no document was ever removed |
| `evaluation_profiles` | 21 total — 17 archived, 3 published, 1 draft | Never a delete candidate at any status |
| `system_config` | 1 | Retained |
| `districts` | 0 | No territory hierarchy data currently exists — retained as a rule regardless of current emptiness |
| `regions` | 0 | Same |
| `classifications` | 5 | Retained |
| Real admin (`users`) | role=`admin`, active=`true`, masked uid `2hs9***`, masked email `ad***@pharmapulse.com` | Confirmed via the identification procedure in `FULL_RESET_DRY_RUN_REPORT.md` — this is the account that ran every query in this evidence pass |

## Masked sample identifiers (real, from the live scan)

- Demo pharmacies sample: `3dt4Z9***`, `8vOjuv***`, `EoSXYf***`
- Demo users sample: `demo_u***` (×3, seeder's own id prefix convention)
- Real (retained) pharmacies: `0uPy4***`, `lrpVk***`, `yh1Vr***`, `yqu5p***`
- Demo batch metadata: `DEMO_M***`
- Import jobs (all 8, masked): `act-1782***` (×2 — one FAILED, one READY), `dx-17825***` (×6 — 3 FAILED, 3 COMPLETED)

## What still cannot be determined without owner input

Per instruction, these are **not guessed**:

1. Whether the 16 untagged `kpi_entries` (2026-05-20 → 2026-06-27) and the
   4 untagged targets/personal_targets are real early-production data or
   leftover manual testing — **requires an owner-supplied go-live cutoff
   date.**
2. Whether the 178 untagged evaluation/ranking output rows should be
   removed — **requires an owner decision**, and structurally depends on
   #1 above.
3. Whether the 3 `COMPLETED` import jobs (onboarding data) are still
   needed as history — **requires owner confirmation.**
4. Item Sales / Smart List counts — **blocked entirely by the live
   permission-denied finding**, not by ambiguity. This must be resolved
   (rules fix or a different read path) before any classification is
   even possible for that group.
5. Firebase Auth user list (as opposed to Firestore `users` profiles) —
   **not checked this pass.** The client-side Firebase Auth SDK used for
   this scan only exposes the currently-signed-in user, never a list of
   all Auth accounts; listing all Auth users requires the Firebase Admin
   SDK / Console, which this environment does not have access to. This
   means "orphaned Auth users" and "Firestore users without an Auth
   account" from the original task's Group 6 requirements are **not
   yet answered.**
