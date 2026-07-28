# Full Reset — Future Execution Plan (Prepared, Not Run)

**This document specifies how a future cleanup tool must behave. Nothing
in this document has been built, run, or wired into the app. No code was
added by this task. This is a specification for a subsequent, separately
approved implementation phase.**

## Execution Update (2026-07-06, later same day)

The "Safe Demo Cleanup Only" scope (demo-tagged records + the 4
zero-committed `FAILED` import jobs) has been **executed**, with
explicit owner authorization (`CONFIRM FULL PRODUCTION DATA CLEANUP`,
then narrowed). Full before/after counts, safety-guard results, and
post-cleanup verification are in `FULL_RESET_EXECUTION_REPORT.md`. Every
guard specified below (bounded batches, admin hard-stop, `kpi_registry`/
`evaluation_profiles` never iterated, re-verification immediately before
each delete) was applied exactly as written. The broader scope
(non-demo users, KPI Registry, evaluation/ranking output, date-cutoff
sweep) was explicitly **not** executed — this plan's guards for that
broader scope remain a specification only, not yet built or run.

## Live Read-Only Count Evidence (2026-07-06)

A live, read-only counting pass has since been run against project
`pharmapulse-646de` (see `FULL_RESET_DELETE_MANIFEST.md` for full
numbers, `FULL_RESET_DRY_RUN_REPORT.md` for methodology). This confirms
the "Dry-run counting tool spec" below is achievable exactly as
specified — the ad-hoc script used for this evidence pass performed
`getCountFromServer`/`getDocs`/`getDoc` reads only, no writes, inside
the confirmed real admin's own session, and encountered no obstacle
other than one live rules-permission finding (Item Sales collections —
see the manifest). A permanent version of this tool, built per the spec
below, should be wired into the app's admin surface rather than run
ad-hoc, but the approach itself is proven to work.

## Dry-run counting tool spec (build this first, separately from deletion)

Before any deletion tool exists, build a **read-only counting extension**
of the existing `demo-cleanup.ts` pattern, covering every group in
`FULL_RESET_DELETE_MANIFEST.md`, not just the 8 demo-tagged collections
the current tool covers. Requirements:

- Every function is `get*`/`getDocs`/`getCountFromServer` only — **no
  `deleteDoc`, no `writeBatch().delete()`, no `updateDoc` anywhere in
  this tool.**
- Runs inside the authenticated app (reuses the admin's live session and
  existing Firestore security rules) — never a standalone script with
  separate service-account credentials, so it can never be run by anyone
  who isn't already an authenticated admin.
- Output: for each group in the manifest, the real count, split by
  RETAIN / DELETE CANDIDATE / MANUAL REVIEW per that group's rule, plus
  up to 5 masked sample ids per bucket.
- Defaults to dry-run mode with no delete affordance in its UI at all —
  this tool's entire purpose is producing the numbers this report is
  missing, nothing else.

## Exact deletion order (once counts + owner approval exist)

Identical to `FULL_RESET_DRY_RUN_REPORT.md`'s "Proposed deletion order"
section — repeated here for the execution tool's direct reference:

1. `import_jobs/{jobId}/rows` (approved terminal jobs only)
2. `import_jobs` top-level docs (only after step 1, only if referencing-row check passes)
3. `ranking_snapshots`, `ranking_history` (approved rows)
4. `evaluation_results` (approved rows)
5. `daily_summaries`, `monthly_summaries`, `forecast_snapshots`, `risk_snapshots` (approved rows)
6. `item_sales_monthly` then `item_sales_branch_monthly`, same branch+period together
7. `kpi_entries` (approved rows)
8. `targets`, `personal_targets` (approved rows)
9. `users` (approved test/demo accounts only)
10. `pharmacies` (approved rows, only after 1–9 clear for that pharmacy)
11. `demo_batches` metadata docs (last)

## Batch-size strategy

Match the existing, already-proven convention in `demo-cleanup.ts`:
`writeBatch(db)` with a **400-document batch size** (Firestore's hard
limit is 500 writes per batch; 400 leaves headroom for the batch's own
overhead). Never exceed 400 deletes per `batch.commit()` call.

## Fail-fast behavior

- If any single document in a batch fails its client-side safety check
  (e.g. `isDemoData !== true` re-verified immediately before delete, not
  just at scan time), **abort that entire batch**, log which document
  failed re-verification, and do not commit any delete in that batch.
  This matches `demo-cleanup.ts`'s existing pattern of checking
  `isSafeToDelete()` at the point of building the delete list, extended
  to a second check immediately before commit (defends against a
  read-then-write race where the flag changed between scan and delete).
- If a batch `commit()` throws, stop the entire group immediately (do
  not proceed to the next collection in the deletion order) and surface
  the exact error plus which batch index failed.
- Never continue an in-progress deletion group after any failure —
  resuming requires an explicit new run, not an automatic retry loop.

## Resumability / checkpoints

- Before starting a deletion group, write a **dry-run-only** checkpoint
  record (in-memory or to a dedicated, clearly-named diagnostic
  collection — never mixed into `import_jobs` or any production
  collection) capturing: group name, total candidate count, batches
  planned, timestamp, actor uid.
- After each successful batch commit, update the checkpoint's
  "batches completed" counter.
- On restart after an interruption, the tool must re-read the checkpoint
  and resume from the next unprocessed batch — never re-scan from zero
  and never re-attempt a batch already marked committed (idempotency:
  re-deleting an already-deleted doc is a no-op in Firestore, but
  skipping re-verified batches is still preferred to avoid wasted reads).

## Before/after counts

- Every group's execution must record the exact count immediately before
  the first delete in that group, and the exact count immediately after
  the last delete in that group (both via the same read-only counting
  tool, not by trusting the "deleted" tally alone — this catches any
  silent partial failure).
- The RETAIN allowlist's counts must also be captured before and after
  **every single group**, not just once at the end — any change there
  at any point is a stop-everything signal.

## Protected-document allowlist (enforced in code, not just docs)

The future deletion tool must hard-code an allowlist check equivalent to
`FULL_RESET_RETAIN_ALLOWLIST.md`, structured so that:

- The collections `kpi_registry`, `kpi_audit_logs`, `evaluation_profiles`,
  `system_config`, `districts`, `regions`, `classifications`,
  `audit_logs` are **never even iterated** by the deletion tool — not
  filtered out at the document level, excluded at the collection-list
  level, so there is no code path that could ever call `deleteDoc` on
  them.
- The real admin document's uid (once identified per the live procedure
  in `FULL_RESET_DRY_RUN_REPORT.md`) is captured once at the start of any
  run and hard-excluded from the `users` deletion candidate list by
  explicit id comparison, not by role-string matching alone (defends
  against a future data-entry error where the admin's role field is
  accidentally blank).

## Owner/admin hard-stop guard

Before any deletion group begins, the tool must:
1. Re-run the real-admin identification procedure live.
2. If it returns zero or more than one plausible admin candidate, **halt
   the entire run** — do not proceed with any group, even ones that don't
   touch `users` — until a human resolves the ambiguity. An ambiguous
   admin identification is treated as equivalent to "cannot confirm the
   account we must protect," which per this task's instruction means
   stop.

## `kpi_registry` hard-stop guard

Any code path change, migration, or refactor that touches the deletion
tool must include an automated test asserting `kpi_registry` never
appears in any collection list the tool is capable of iterating —
mirroring the certification-test convention already used elsewhere in
this repo (raw-source scan asserting a banned string/collection name is
absent from the relevant file).

## Official-profile hard-stop guard

Same pattern: assert `evaluation_profiles` never appears in an iterable
delete-candidate list, and separately assert that no code path in the
deletion tool ever calls `deleteDoc` on a path matching
`evaluation_profiles/*` (including the `drafts` subcollection).

## Audit output

Every executed run (once this tool exists and is actually used) must
write its own summary to `audit_logs` — action type, actor uid, group
name, before/after counts, batch count, any failures — using the
existing `logAction()`/`AUDIT_ACTION` convention already used everywhere
else in this codebase. This is itself append-only and must never be
included in what a future cleanup can delete (already covered — see
allowlist).

## Confirmation phrase requirement

Per instruction, generic yes/no confirmation is insufficient. Any future
UI or CLI for actual deletion must require the operator to type the
exact literal string:

```
CONFIRM FULL PRODUCTION DATA CLEANUP
```

Case-sensitive, exact match, no partial match, no default value. Any
other input — including "yes," "confirm," "y," or a close-but-not-exact
phrase — must be rejected and the run must not proceed. **The tool must
default to dry-run mode; a live deletion mode must never be the
default state of any future implementation of this tool.**
