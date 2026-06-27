# Data Exchange Studio — Admin Runbook

Operational reference for admins troubleshooting Data Exchange Studio
imports. Pairs with `DATA_EXCHANGE_USER_GUIDE.md` (end-user flow) and
`DATA_EXCHANGE_CLOSURE_MATRIX.md` (per-domain capability reference).

## Permissions

- All import actions (upload, validate, commit, retry/resume, viewing
  Import History) require the **Admin** role. Non-admins see the page
  but cannot upload or commit.
- Firestore rules enforce this independently of the UI: `import_jobs`
  create/update requires `isAdmin()`; reads are scoped to
  `createdBy == uid() || isAdmin()`. The UI gate is a convenience, not
  the security boundary.

## Job states

An `import_jobs` document moves through: `DRAFT` → `VALIDATING` →
`COMMITTING` → `COMPLETED` / `PARTIAL` / `FAILED` / `CANCELLED`.

- **COMPLETED** — every row committed successfully.
- **PARTIAL** — some rows committed, some failed (Actuals only — these
  are retryable; see below).
- **FAILED** — the commit did not complete (e.g. all rows failed, or an
  unrecoverable error stopped it).
- **CANCELLED** — an admin cancelled mid-commit (Actuals only);
  already-committed rows remain committed and are reflected in the
  job's row counts.

## Troubleshooting

### "Stale Preview" on commit

The underlying data (a branch, KPI, pharmacist, etc.) changed in
Firestore between Validate and Commit. This is by design — it prevents
committing against data that no longer matches what was previewed.
**Fix**: re-upload the same file and Validate again, then Commit.

### Duplicate rows reported during Validate

Two rows in the uploaded file resolve to the same identifier (e.g. same
Branch Code, same Employee ID). Only one will be applied; the other is
flagged. **Fix**: have the user remove the duplicate row from the
source file, or confirm which value should win and delete the other row.

### "Existing Record Conflict"

The row would create an identity ambiguity against existing data (e.g.
an email already linked to a different employee record, or an
overlapping primary branch assignment). These require manual review —
**do not** treat this the same as a simple duplicate; check the
specific record in the relevant admin page (Users, Branches, etc.)
before re-importing.

### Partial completion — retry safety

Only **Branch Actuals** and **Pharmacist Actuals** support retry. The
retry/resume action:

- Re-attempts only rows in `FAILED` state from the same job.
- Never re-applies a row already in `COMMITTED` state.
- Is blocked (with a clear, non-technical reason) if: the job is
  already `COMPLETED`, the retry limit has been reached, the source
  file has changed since the failed attempt, or the job cannot be
  found. These are all surfaced as a **Retry Not Safe** category, never
  a raw error.

For Organization Onboarding, KPI Registry, and Targets, a partial
failure has no retry action in the UI — the job result shows exactly
which rows failed and why; the corrective path is to fix those rows in
the source file and re-upload (re-import is idempotent by row identity,
so successfully-committed rows are simply updated again with the same
values, not duplicated).

### Cancellation

Only Actuals commits can be cancelled mid-run. Cancelling stops before
the next row starts — rows already committed before the cancel stay
committed. The resulting job is marked `CANCELLED` with accurate
committed/failed/remaining counts.

### Unsupported template version

If a user reports their upload was rejected immediately with a
template-version message, they are using either a newer template than
this deployment supports, or a corrupted/hand-edited Metadata sheet.
**Fix**: have them download a fresh template from the Template Library.
A file with **no** Metadata sheet at all (i.e., generated before DX-8)
is never rejected for this reason — it's treated as a supported legacy
file.

### Inactive / archived references rejected

Rows referencing an inactive branch, inactive/archived KPI, or
deactivated pharmacist are blocked at validation (`INACTIVE_BRANCH`,
`ARCHIVED_KPI`, `INACTIVE_PHARMACIST`, etc.) — this is intentional, not
a bug. Reactivate the referenced record first if the import is correct.

### CLAIMED pharmacists

Pharmacist-identity-bearing imports (Pharmacists, Assignments,
Pharmacist Targets, Pharmacist Actuals) exclude pharmacist records in
`CLAIMED` status from matching — a CLAIMED record is mid-claim by a real
user and must not be silently overwritten by a bulk import. If a row's
identifier can't be resolved and the admin believes a matching
pharmacist exists, check whether that pharmacist's status is `CLAIMED`
before assuming the import is broken.

## Audit review

Use the **Import History** section (admin-only) for a quick look at
recent imports — domain, file, status, row counts. For deeper review
inspect the `import_jobs` document directly: it has the full
`commitBatches` array (Actuals) and per-row state in the `rows`
subcollection. No raw uploaded file binary is ever stored — only file
metadata (name, size, checksum).

## Recovery

If a job is stuck in `DRAFT` or `FAILED` with **zero** committed rows
(an abandoned draft, e.g. the admin closed the tab before validating),
it is safe to discard — `FirestoreStagingRepository.deleteAbandonedDraft`
only deletes jobs with `committed === 0` and a non-active status; it
will refuse to delete anything with committed rows.

## Escalation

If an import shows unexpected data loss, a security-relevant error
(permission bypass, data visible to the wrong role), or repeated System
Error categorization for a code that should be mapped, stop and escalate
rather than retrying — check `importErrorTaxonomy.ts`'s
`ISSUE_CODE_CATEGORY` map and the relevant adapter's emitted codes
before assuming it's a one-off.
