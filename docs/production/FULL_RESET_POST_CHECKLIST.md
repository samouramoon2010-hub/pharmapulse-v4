# Full Reset — Post-Cleanup Smoke Test Checklist

**Prepared for a future cleanup execution. Nothing in this checklist has
been run — no cleanup has happened yet. This is the acceptance checklist
to run immediately after any future, owner-approved deletion.**

## Post-Execution Verification Results (2026-07-06, Safe Demo Cleanup)

The Safe Demo Cleanup scope has been executed and verified. Results:

- [x] Real admin logs in successfully — confirmed live, session unchanged throughout (`role: admin`, `active: true`)
- [x] `kpi_registry` count unchanged: 18 before, **18 after** (18 active, 0 archived — untouched)
- [x] `evaluation_profiles` unchanged: 21 before, **21 after** — untouched
- [x] Dashboard loads without error, full sidebar renders, zero console errors
- [x] Targets page loads without error, zero console errors
- [x] Referential integrity: 0 orphans found among all retained `kpi_entries` (16), `targets` (2), `personal_targets` (2) — every `pharmacyId`/`userId` resolves to an existing document
- [x] `audit_logs` unchanged: 849 before, **849 after** — untouched
- Not yet checked this pass: KPI Entry submission, Reports/Rankings rendering, Data Exchange new-import flow, Smart List/Item Sales (still blocked by the separate permission-denied finding, unrelated to this cleanup)

Full detail in `FULL_RESET_EXECUTION_REPORT.md`.

## Post-Execution Verification Results (2026-07-06, 196 Experimental Records Cleanup — PARTIALLY COMPLETED)

Authorization phrase `CONFIRM DELETE 196 REMAINING EXPERIMENTAL RECORDS`
was executed for `ranking_snapshots` only (65/65 deleted); blocked for
`evaluation_results` (0/111 — collection is hard-coded immutable at the
rules level, `allow delete: if false`); not attempted for `kpi_entries`
(0/16), `personal_targets` (0/2), `targets` (0/2) per fail-fast policy.
Full detail in `FULL_RESET_EXECUTION_REPORT.md`.

- [x] Real admin logs in successfully — confirmed live, session unchanged throughout
- [x] `kpi_registry` count unchanged: 18 before, **18 after**
- [x] `evaluation_profiles` unchanged: 21 before, **21 after**
- [x] `system_config`, `classifications`, `users` (10), `pharmacies` (4) all unchanged
- [x] `audit_logs`: 849 before, **851 after** — +2 entries, both the admin's own login/logout events from this session, inspected directly and confirmed unrelated to the cleanup
- [x] Dashboard (`/dashboard`) loads without error, zero console errors
- [x] Rankings (`/admin/rankings`) loads without error, zero console errors, shows the "Preview Ranking" generation UI cleanly with no stale snapshot data
- [x] Reports (`/reports`) loads without error, zero console errors
- [x] `kpi_entries` (16), `targets` (2), `personal_targets` (2) — all unchanged, untouched this pass

## Post-Execution Verification Results (2026-07-06, 20 Pre-July KPI and Target Records Cleanup — CLOSED)

Authorization phrase `CONFIRM DELETE 20 PRE-JULY KPI AND TARGET RECORDS`
was executed in full: `kpi_entries` (16/16 deleted), `personal_targets`
(2/2 deleted), `targets` (2/2 deleted). 0 errors, 0 skips. Full detail
in `FULL_RESET_EXECUTION_REPORT.md`.

- [x] Real admin logs in successfully — confirmed live, session unchanged throughout
- [x] `evaluation_results` unchanged: 111 before, **111 after** (still blocked/untouched)
- [x] `ranking_snapshots` unchanged: 0 before, **0 after**
- [x] `kpi_registry` unchanged: 18 before, **18 after**
- [x] `evaluation_profiles` unchanged: 21 before, **21 after**
- [x] `users` (10), `pharmacies` (4) unchanged
- [x] `audit_logs` unchanged: 851 before, **851 after**
- [x] Dashboard (`/dashboard`) loads without error, zero console errors
- [x] KPI Entry (`/entry`) loads without error, zero console errors, shows a clean "not yet entered / no target" empty state for every KPI
- [x] Targets (`/targets`) loads without error, zero console errors, shows a clean "No targets for July 2026" empty state
- [x] `kpi_entries`, `personal_targets`, `targets` all confirmed at 0 remaining pre-July records

## Post-Execution Verification Results (2026-07-07, KPI Registry Archive — PARTIALLY COMPLETED)

`Archive All Current KPIs — Safe Registry Reset` executed: 13/18 KPIs archived (5 protected-core KPIs left active by the application's own existing guard), 4 dependent published/draft evaluation profiles archived first. Full detail in `KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md`.

- [x] `kpi_registry` document count unchanged: 18 before, **18 after** (archiving is a field update, never a deletion)
- [x] `kpi_registry` active count: 18 before, **5 after** (the 5 protected-core KPIs)
- [x] `kpi_registry` archived count: 0 before, **13 after**
- [x] `evaluation_profiles` unchanged in count: 21 before, **21 after** — published/draft went from 3/1 to **0/0**, all archived, none deleted
- [x] `evaluation_results` unchanged: 111 before, **111 after**
- [x] `users` (10), `pharmacies` (4) unchanged
- [x] Protected admin remains signed in and unchanged
- [x] `/entry` loads without crashing, shows only the 5 remaining active KPIs — a clean state
- [x] `/targets`, `/dashboard`, `/reports`, `/data-exchange` all load without error, zero console errors
- [x] `/admin/rankings` shows a clear "No published evaluation profiles found" empty state
- [ ] `/admin/kpis` (KPI Management) loads without crashing, but shows "17 definitions" instead of 18 — a **pre-existing, unrelated defect** (the `BSU` KPI has always lacked a `sortOrder` field, which Firestore's `orderBy('sortOrder')` query silently excludes; confirmed the underlying document was archived correctly). Reported, not fixed — see the execution report for detail.

## Post-Execution Verification Results (2026-07-07, KPI Core Archive — ALL 18 KPI DEFINITIONS ARCHIVED)

`Archive Remaining 5 Protected Core KPIs` executed: code restriction lifted for `wasfaty`/`omnihealth`/`wellnessCard`/`basket`/`crossSelling` (165 focused tests + 25,651-test full suite + production build all passed first), then all 5 archived live. Full detail in `KPI_CORE_ARCHIVE_COMPLETION_REPORT.md`.

- [x] `kpi_registry` total unchanged: 18 before, **18 after**
- [x] `kpi_registry` active: 5 before, **0 after**
- [x] `kpi_registry` archived: 13 before, **18 after**
- [x] `evaluation_profiles` unchanged: 21 total, 0 published, 0 draft, 21 archived (re-confirmed, not touched this pass)
- [x] `evaluation_results` unchanged: 111 before, **111 after**
- [x] `users` (10), `pharmacies` (4) unchanged
- [x] Protected admin remains signed in and unchanged
- [x] `/entry` loads without crashing, shows "kpis: 0" — a clean, correct empty state
- [x] `/targets`, `/dashboard`, `/reports`, `/data-exchange` all load without error, zero console errors
- [x] `/admin/rankings` shows "No published evaluation profiles found" — the expected empty state
- [x] `/admin/kpis` shows "17 definitions · 0 active" — all visible KPIs correctly archived (the 17-vs-18 count is the same pre-existing `BSU` defect, unchanged by this pass)
- [x] `BSU` re-inspected directly: still lacks `sortOrder`, but its own document is now correctly archived (`isActive:false`, `uiStatus:ARCHIVED`, `lifecycleStage:archived`) — confirmed not modified this pass, defect persists exactly as before

## Live Read-Only Count Evidence (2026-07-06)

Pre-cleanup baseline counts are now available (see
`FULL_RESET_DELETE_MANIFEST.md`) and should be used as the "before"
values this checklist's item 2 (KPI Registry count match) and the
before/after tracking in `FULL_RESET_EXECUTION_PLAN.md` compare against:
`kpi_registry` 18 (18 active), `evaluation_profiles` 21, `audit_logs`
849, real `pharmacies` 4, real `users` 10. No cleanup has been executed
against these baselines yet.

## Expected clean state

| Area | Expected state after cleanup |
|---|---|
| Login | Works — the real admin account signs in successfully via `/login` (Login V3), lands on the correct role-based home route |
| Real admin | Still present, still resolves the correct role/scope, still visible in Users management |
| Organization/reference structure | `pharmacies`, `districts`, `regions`, `classifications` — every real (non-demo) record intact, hierarchy unbroken |
| KPI Registry | All active KPI definitions remain, registry loads without error, `kpi_registry` document count unchanged from pre-cleanup |
| Official evaluation profiles | The active/published profile version remains selectable and remains the one new evaluations resolve to |
| Dashboard | Loads with clean empty states for any pharmacy/user that had only demo/experimental data — no error boundary, no stale demo numbers |
| KPI Entry | Ready for real data — a real user can submit a real entry immediately after cleanup with no leftover demo constraint |
| Targets | Empty for any pharmacy whose only targets were experimental, OR shows only the retained real targets — never a mix |
| Reports / Rankings | Contains no experimental result — a report run immediately after cleanup reflects only real, retained `kpi_entries`/`evaluation_results` |
| Data Exchange | Ready for the first real import — no leftover non-terminal `import_jobs` blocking a new job, no stale staging rows |
| Smart List / Item Sales | No test data — `item_sales_monthly`/`item_sales_branch_monthly` contain only branch/period pairs the owner confirmed as real |

## Smoke-test checklist (run in order, live, after execution)

1. **Auth**
   - [ ] Real admin logs in at `/login` successfully
   - [ ] Real admin's role/scope resolves correctly (lands on the expected home route)
   - [ ] No other previously-real user account was accidentally removed (spot-check 2-3 known real accounts still exist)

2. **KPI Registry**
   - [ ] Registry page loads with zero errors
   - [ ] Every KPI that was active before cleanup is still active after
   - [ ] `kpi_registry` document count matches the before-cleanup count exactly (this collection was never touched)

3. **Evaluation**
   - [ ] `evaluation_profiles` page loads, the active/published profile is still marked active
   - [ ] Running a new evaluation for a real pharmacy/period succeeds and produces a sane score (not zero/error due to a missing dependency)

4. **Dashboard**
   - [ ] Loads without a thrown error for at least one real pharmacy
   - [ ] Shows an explicit empty state (not a fabricated zero or crash) for any pharmacy whose demo data was just removed

5. **KPI Entry**
   - [ ] A real user can open KPI Entry and submit a real value for today with no validation error caused by the cleanup

6. **Targets**
   - [ ] TargetsPage loads without error
   - [ ] Real, retained targets still display correctly
   - [ ] Any pharmacy whose only targets were experimental shows an explicit "no targets set" state, not an error

7. **Reports / Rankings**
   - [ ] Reports page loads without error
   - [ ] No demo/experimental branch, user, or score appears anywhere in a generated report
   - [ ] Rankings page loads without error; ranking order reflects only retained real data

8. **Data Exchange**
   - [ ] Data Exchange Studio loads without error
   - [ ] Starting a brand-new import job succeeds (no interference from a deleted-but-still-referenced prior job)
   - [ ] Import history (if retained) shows no broken/dangling `importBatchRef` reference

9. **Smart List / Item Sales**
   - [ ] Item Sales Analytics page loads without error
   - [ ] No test branch/period appears in the month selector
   - [ ] A fresh Smart List import for a real branch succeeds end-to-end

10. **Referential integrity spot-check**
    - [ ] Pick 3 retained `kpi_entries` rows with a non-empty `importBatchRef` — confirm each still resolves to an existing `import_jobs` document (re-run the same existence check `saveKpiEntry()` performs, as a read, not a write)
    - [ ] Pick 3 retained `evaluation_results` rows — confirm each still resolves its `profileId`+`version` to an existing `evaluation_profiles` document

11. **Audit trail**
    - [ ] `audit_logs` collection is intact and unchanged in count from before cleanup (it must never have been touched)
    - [ ] The cleanup run itself produced its own audit entry per `FULL_RESET_EXECUTION_PLAN.md`'s "Audit output" requirement

## If any check fails

Stop. Do not proceed with any further planned cleanup group. The
No-backup warning in `FULL_RESET_DRY_RUN_REPORT.md` applies — there is
currently no official Firestore export to restore from, so a failed
check must be triaged manually (identify exactly what was deleted that
shouldn't have been, using the audit-log entry the run itself produced)
rather than assumed recoverable.
