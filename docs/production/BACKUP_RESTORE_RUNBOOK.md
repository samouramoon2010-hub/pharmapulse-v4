# PR-1G-A — Backup & Restore Runbook

**Status: BACKUP PATH NOT VERIFIED. Per the governing instruction for this
audit, any production reset is BLOCKED until a real, verified backup
exists.** This document describes the runbook a production-owner with
real Firebase/`gcloud` credentials would need to execute — it has not
been executed from this environment, no credentials were available here,
and no backup currently exists that this audit could verify.

## Why there is no existing backup capability

- `package.json` has no `backup`/`export` script.
- `firebase-tools` is not a project dependency (`devDependencies` and
  `dependencies` both checked).
- No `.github/workflows/` or other CI config schedules a Firestore export.
- No `docs/production/` file prior to this audit documents a backup
  procedure.

This means today, a destructive mistake in the Firebase Console or via
any future script would have **no recovery path**. This is the single
biggest reason PR-1G-B cannot be authorized yet, independent of anything
else in this audit.

## Recommended backup command (to be run by the product owner, not by this audit)

Using the standard Google Cloud / Firebase export, which writes a full
Firestore export to a Cloud Storage bucket (does not require adding
`firebase-tools` as a permanent project dependency — `npx` runs it
once):

```
# Requires: gcloud CLI authenticated as a project owner/editor, OR
# firebase-tools authenticated via `firebase login`, and an existing
# Cloud Storage bucket in the same project (Firestore export target).

gcloud firestore export gs://<PROJECT_ID>-firestore-backups/$(date +%Y%m%d-%H%M%S) \
  --project=<PROJECT_ID>

# Equivalent via firebase-tools:
npx firebase-tools firestore:export gs://<PROJECT_ID>-firestore-backups/$(date +%Y%m%d-%H%M%S) \
  --project=<PROJECT_ID>
```

**Expected duration:** proportional to data volume; for a database this
size (low tens of collections, no evidence of multi-million-document
volume in any single collection based on code paths), a full export
should complete in low single-digit minutes, but this is an estimate, not
a measurement — no live document counts were available to this audit.

**Collections included:** all of them, by default (a full-database
export). A scoped export limited to specific collections is possible via
`--collection-ids=` if the owner prefers to exclude clearly-transient
collections like `import_staging_entries`, but a first backup should be a
full export with no exclusions.

**Auth backup limitation — important:** Firestore export does **not**
include Firebase Authentication users. Auth users must be exported
separately:

```
firebase auth:export auth-backup-$(date +%Y%m%d-%H%M%S).json --project=<PROJECT_ID>
```

This produces a JSON file containing user records (UIDs, emails, hashed
passwords, provider data) — **this file itself is sensitive** and must be
stored with the same access control as production credentials, never
committed to git, and deleted/rotated-out once no longer needed.

## Restore procedure

```
gcloud firestore import gs://<PROJECT_ID>-firestore-backups/<TIMESTAMP> \
  --project=<PROJECT_ID>

firebase auth:import auth-backup-<TIMESTAMP>.json --project=<PROJECT_ID>
```

**Important Firestore-import semantics:** `gcloud firestore import` does
not delete documents created *after* the export and not present in it —
it overlays the export on top of current state. A true point-in-time
restore (rolling back unwanted writes) requires first wiping the affected
collections, which is itself a destructive operation requiring the same
PR-1G-B approval gate. This asymmetry should be disclosed to the product
owner: "restore" is not automatically "undo."

## Post-restore validation (manual checklist for the owner)

- [ ] Spot-check 3–5 known real `users` documents resolve correctly and
      role/scope fields are intact.
- [ ] Confirm `kpi_registry` document count matches pre-export count.
- [ ] Confirm at least one recent `evaluation_results` document for a real
      (non-demo) period is present and matches its pre-export score.
- [ ] Sign in as the production admin account and confirm dashboard loads.
- [ ] Confirm `audit_logs` count did not decrease.
- [ ] Re-run `firebase auth:export` and diff user count against the
      pre-restore baseline.

## Retention, encryption, access control

- The Cloud Storage bucket holding exports should have
  uniform bucket-level access restricted to the project owner / a named
  service account, not public or project-wide-editor access.
- Google Cloud Storage encrypts data at rest by default; no additional
  action is required for that property, but bucket IAM is the owner's
  responsibility to configure — this audit did not check current bucket
  IAM because no bucket exists yet.
- Recommend retaining at least the 3 most recent exports and deleting
  older ones on a rolling basis, to bound storage cost — exact retention
  window is a product-owner decision, not a code-derivable fact.

## Dry-run / reset-simulation capability (§13)

No safe read-only dry-run tooling currently exists in the repository.
Building one is in scope for a future approved phase, not for this
read-only audit (writing new tooling code is fine; *running* a mutation is
not — but a dry-run counter that only *reads* could be built once backup
is verified, see prerequisite below). Recommended design, not implemented
here:

- A script (or temporary admin-page panel) that:
  1. Reads every collection identified as a reset candidate in
     [`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md).
  2. Counts candidate documents per group (e.g. `isDemoData === true`
     count in each of the 7 demo-seeder collections).
  3. For each candidate, resolves and reports any documents in other
     collections that reference it (e.g. counts of `kpi_entries` rows
     whose `pharmacyId` matches a candidate demo `pharmacies` doc ID).
  4. Reports retained-record counts (the inverse set) so the owner can
     see what stays.
  5. Performs **zero writes and zero deletes** — read-only Firestore
     `get`/`where` queries only.
  6. Outputs a plain count/ID-list report (masked, no full PII) for the
     owner to review before any PR-1G-B execution is requested.

**Prerequisite before this dry-run tool is even built:** a verified
backup must exist first (per the explicit ordering in the governing
instruction — backup readiness gates the reset proposal, not the other
way around).
