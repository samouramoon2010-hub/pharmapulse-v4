# PR-1G-A — Production Data Reset Proposal (PROPOSAL ONLY — NOT EXECUTED)

**No group below has been executed. No group may be executed under
PR-1G-A.** Execution of any group requires (a) a verified backup per
[`BACKUP_RESTORE_RUNBOOK.md`](BACKUP_RESTORE_RUNBOOK.md), which does not
yet exist, and (b) explicit per-group owner approval recorded in
[`PR1G_APPROVAL_CHECKLIST.md`](PR1G_APPROVAL_CHECKLIST.md), which
currently shows every row as **Pending**.

## Group 1 — Safe operational demo data

**Exact action:** delete every document across `pharmacies`, `users`,
`targets`, `personal_targets`, `kpi_entries`, `evaluation_results`, and
`demo_batches` where `isDemoData === true`, using the existing
`src/demo/demo-cleanup.ts` tool (already built, already gated by a
triple-confirmation UI flow in `DemoDataPage.tsx`).

**Why:** these documents exist solely to populate the UI for demos/
screenshots/walkthroughs; they have no business value once a real
production launch begins, and their presence could confuse a real admin
browsing `users` or `pharmacies` lists.

**What's retained:** every document without `isDemoData === true` — i.e.
all real data, untouched. The cleanup tool's delete query is scoped by
that field, not by collection wholesale.

**Blast radius:** limited to whatever batch IDs exist at execution time;
based on code paths, no other collection references demo documents except
the 7 listed (the seeder does not touch `kpi_registry`, `districts`,
`regions`, `import_jobs`, or `audit_logs`).

**Prerequisites:** verified backup (§ runbook); confirm via the
recommended dry-run tool (not yet built) that the live `isDemoData` count
matches expectations before deleting, since this audit cannot see live
data.

**Post-reset validation:** re-run the dry-run count and confirm it
reaches zero across all 7 collections; confirm a real (non-demo) user can
still log in and see real `pharmacies`/`targets` data unaffected.

**Rollback:** restore from the pre-reset backup (full restore, not
partial — see runbook's restore-semantics caveat).

**Approval checkbox:** ☐ Pending (see approval checklist).

## Group 2 — Test users

**Exact action:** identify and remove Auth + Firestore user records that
are clearly test/internal accounts and not real production accounts —
e.g. any account matching the `demo.<id>@pharmapulse.test` pattern (these
overlap with Group 1's demo users), plus any manually-created test
account the product owner identifies by review (this audit found no
*other* hardcoded or pattern-matched test account beyond the demo-seeder
ones and the unused, unimported `dummyData.js` literals — see §4 of the
main audit).

**Why:** test accounts left in production Auth are a credential-hygiene
risk (someone could still sign in with one) and clutter the `users` admin
page.

**What's retained:** the production admin account and every account the
owner identifies as real.

**Blast radius:** Auth account deletion is irreversible without a backup
(`firebase auth:export` beforehand is mandatory — see runbook). Firestore
`users` doc deletion for an account also referenced by historical
`kpi_entries`/`evaluation_results`/`audit_logs` will not cascade-delete
those records (by design — see referential-integrity finding on
`audit_logs`), but display of that user's name in historical views will
degrade to a fallback.

**Prerequisites:** verified backup including `firebase auth:export`;
owner must explicitly name which accounts beyond the demo-tagged set (if
any) qualify — this audit does not have a list of "test" accounts beyond
the demo-seeder pattern and cannot infer one safely.

**Post-reset validation:** confirm no real workflow (login, KPI entry,
reports) depends on the removed accounts; spot-check historical
evaluation/ranking views still render without error for periods that
involved a removed test user.

**Rollback:** restore from backup (both Firestore and Auth).

**Approval checkbox:** ☐ Pending.

## Group 3 — Import/staging history

**Exact action:** clear `import_staging_entries` (or equivalent
pre-commit staging rows) for `import_jobs` already in a terminal state
(committed or abandoned), and/or `import_jobs` documents themselves older
than a retention window the owner specifies.

**Why:** staging rows are explicitly transient working data; old
completed-job metadata has diminishing audit value over time but is not
zero-value (it is the provenance trail for `importBatchRef`).

**What's retained:** any `import_jobs` document not in a terminal state,
and (if the owner wants any retention window at all) recent terminal jobs.

**Blast radius:** **this is the riskiest group in this proposal.**
Deleting `import_jobs` documents that are still referenced by
`importBatchRef` on live `kpi_entries`/`targets` rows turns the existing
*unchecked* soft link (§6 finding) into an actual dangling reference —
there is no code that currently re-validates `importBatchRef` against a
deleted job, so this would be silent, not erroring. **Recommend this
group be scoped to staging rows only in the first reset, with `import_jobs`
metadata deletion deferred to a later phase** unless the owner explicitly
wants it included now.

**Prerequisites:** verified backup; owner-specified retention window;
recommend building the `importBatchRef`-existence dry-run check (§13)
before this group specifically, even ahead of other groups.

**Post-reset validation:** confirm `import_jobs` count matches the
expected pre-reset count minus deleted terminal jobs; spot-check several
recent `kpi_entries` rows with `importedViaDataExchange: true` still
resolve their `importBatchRef` to an existing job.

**Rollback:** restore from backup.

**Approval checkbox:** ☐ Pending.

## Group 4 — Evaluation/ranking/demo outputs

**Exact action:** delete `evaluation_results`, `ranking_history`, and
`shadow_evaluation_logs` documents that are either `isDemoData === true`
(overlaps with Group 1) or, if the owner wants it, results computed
against a now-archived/test `evaluation_profiles` version that was itself
only ever used for testing.

**Why:** demo-tagged outputs have no analytical value once real launch
begins; test-profile outputs (if any exist) could pollute historical
trend views if ever surfaced to a real user by mistake.

**What's retained:** every result/ranking/shadow-log row tied to a real,
published evaluation profile and a real period — this is historical
record, never a reset candidate (per the A-classification in the
inventory doc).

**Blast radius:** low for the demo-tagged subset (same boundary as Group
1). For test-profile outputs (if the owner identifies any), blast radius
depends on whether any real ranking view ever displayed them — this audit
found no code path that would have shown a test-profile result to a real
end user (`RankingsPage.tsx`/`ExecutiveDashboard` query by real, published
profile only), so the risk is assessed as low, not zero, absent a live
data check.

**Prerequisites:** verified backup; if the owner wants the test-profile
subset included, they must identify which `evaluation_profiles` document
IDs are test-only — this audit has no live data to identify them from
code alone.

**Post-reset validation:** confirm `RankingsPage.tsx` and
`ExecutiveDashboard` still render real historical rankings unaffected;
confirm dry-run count reaches zero for the targeted subset.

**Rollback:** restore from backup.

**Approval checkbox:** ☐ Pending.

## No group has been executed

Confirmed: this document is a proposal only. No Firestore delete call was
made in the production of this document or anywhere in this audit.
