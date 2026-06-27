# PR-1G-B0 — Firestore Backup Quick Runbook

**Status: `BACKUP PROCEDURE READY — LIVE BACKUP NOT YET VERIFIED`**

**Update (live attempt, this session):** the owner completed
`gcloud auth login`. This audit then verified real access
(`gcloud projects describe pharmapulse-646de` → `ACTIVE`;
`gcloud firestore databases list` → confirmed `FIRESTORE_NATIVE`
database in region `africa-south1`) and attempted the actual export.
**Both bucket creation and the export itself failed with the same root
cause: billing is disabled on this Google Cloud project**
(`gcloud billing projects describe pharmapulse-646de` →
`billingEnabled: false`). This is a new, more specific blocker than "no
tooling" — see the live evidence section below. **No bucket was created.
No export ran. No Firestore document was read or written by the export
attempt itself (the operation never queued).**

## Project ID

`pharmapulse-646de` — confirmed via `firebase projects:list` while logged
in as the project owner's own Firebase account (`samouramoon2010@gmail.com`)
during this phase. (Project ID is public, non-secret configuration — see
[`SECRET_ROTATION_CHECKLIST.md`](SECRET_ROTATION_CHECKLIST.md).)

## What this phase actually checked (tool availability, verified live)

| Tool | Found? | Authenticated? | Usable for Firestore export? |
|---|---|---|---|
| `firebase-tools` CLI (via `npx firebase-tools`) | Yes, v15.19.1 | Yes — logged in as `samouramoon2010@gmail.com`; `firebase projects:list` confirms access to `pharmapulse-646de` | **No** — `firebase-tools` has no `firestore:export` subcommand. Firestore export/import is exclusively a `gcloud` capability, not part of the `firebase` CLI |
| Google Cloud SDK (`gcloud`) | Yes, v573.0.0, installed at `C:\Users\samou\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd` | **No** — `gcloud auth list` returns "No credentialed accounts." | Not usable until the owner runs an interactive login (see prerequisites) |

This means the actual blocker today is not "no tooling installed" (both
CLIs are present) — it is **`gcloud` has no authenticated account in
this environment.** Authenticating `gcloud` requires an interactive
browser-based login (`gcloud auth login`), which is the project owner's
own credential action and was not performed here — this audit does not
log into Google accounts on the owner's behalf.

## Prerequisites (status as verified live this session)

1. ~~Run `gcloud auth login`~~ — **done.** Authenticated as
   `samouramoon2010@gmail.com`, confirmed via `gcloud auth list` (marked
   `ACTIVE`) and `gcloud projects describe pharmapulse-646de` (returned
   `lifecycleState: ACTIVE`, project number `522120299228` — matches the
   project number found independently in PR-1G-A).
2. ~~Set the active project~~ — **already correct.**
   `gcloud config list` showed `project = pharmapulse-646de` as the
   active config without any change needed.
3. **Cloud Storage bucket — does not exist, and cannot be created yet.**
   `gcloud storage buckets list --project=pharmapulse-646de` returned
   **0 buckets** — there is no pre-existing default bucket in this
   project to reuse, contrary to this runbook's original assumption.
   Attempting to create one
   (`gcloud storage buckets create gs://pharmapulse-646de-firestore-backups
   --location=africa-south1 --uniform-bucket-level-access --public-access-prevention`)
   failed with:
   ```
   ERROR: (gcloud.storage.buckets.create) HTTPError 403: The billing
   account for the owning project is disabled in state absent.
   ```
4. **🔴 New blocker confirmed: billing is disabled on this GCP project.**
   `gcloud billing projects describe pharmapulse-646de` returned:
   ```
   billingAccountName: ''
   billingEnabled: false
   ```
   This was confirmed to be the actual export blocker, not just a bucket
   problem — attempting `gcloud firestore export
   gs://pharmapulse-646de-firestore-backups/test-probe
   --project=pharmapulse-646de` (against a bucket path that doesn't even
   exist, so nothing could have been written regardless) failed
   immediately with:
   ```
   ERROR: (gcloud.firestore.export) PERMISSION_DENIED: This API method
   requires billing to be enabled. Please enable billing on project
   #pharmapulse-646de by visiting
   https://console.developers.google.com/billing/enable?project=pharmapulse-646de
   ...
   reason: BILLING_DISABLED
   ```
   Confirmed afterward via `gcloud firestore operations list` that **no
   export operation was queued** — the call was rejected before
   touching Firestore at all (the operations list shows only pre-existing,
   unrelated index-build operations from the application's normal
   history, no `ExportDocuments` entry).

**Remaining prerequisite for the owner: enable billing on the
`pharmapulse-646de` Google Cloud project** (attach a billing account via
the URL above, or Google Cloud Console → Billing → Link a billing
account). This is an account/billing-settings change outside this
audit's scope to perform — Firestore export, and Cloud Storage bucket
creation, are both unavailable until it is done. Once billing is
enabled, re-run step 3 (bucket creation) and then the export command
below — no other prerequisite is outstanding.

## Backup command (read-only with respect to Firestore — it only reads Firestore and writes to Cloud Storage, never deletes or modifies any Firestore document)

**Verified live:** this project has no existing default Cloud Storage
bucket (see prerequisite §3 above), and the Firestore database's region
is confirmed to be `africa-south1` (via
`gcloud firestore databases list`). The bucket must therefore be created
in that same region first:

```
gcloud storage buckets create gs://pharmapulse-646de-firestore-backups \
  --project=pharmapulse-646de \
  --location=africa-south1 \
  --uniform-bucket-level-access \
  --public-access-prevention
```

Then run the export into a clearly named, timestamped subfolder:

```
gcloud firestore export gs://pharmapulse-646de-firestore-backups/backup-$(date +%Y%m%d-%H%M%S) \
  --project=pharmapulse-646de
```

Both commands are blocked today by the billing prerequisite above —
neither has succeeded yet.

**Auth users are not included** — Firestore export covers Firestore
documents only. A separate export is needed for Auth:

```
firebase auth:export auth-backup-$(date +%Y%m%d-%H%M%S).json --project=pharmapulse-646de
```

This command **is** runnable today with the existing `firebase-tools`
login (no `gcloud` auth needed for this one) — it was not run in this
phase because doing so would write a file containing real user records
(UIDs, emails, hashed passwords) to local disk, which is itself a
sensitive-data-handling action this audit chose not to take without the
owner's direct involvement in deciding where that file is stored and how
it's protected afterward.

## Expected output

`gcloud firestore export` runs asynchronously and prints an operation
name immediately (e.g. `projects/pharmapulse-646de/databases/(default)/operations/...`);
it does not block until the export finishes. For a database this size
(low tens of collections, no evidence of multi-million-document volume
in any single collection based on the code-level review in PR-1G-A), the
underlying export operation should complete within a few minutes, but
this is an estimate from code review, not a measurement.

## Verification steps

```
gcloud firestore operations list --project=pharmapulse-646de
```

Confirm the export operation shows `done: true` and no `error` field —
specifically, look for an entry whose `metadata.@type` is
`type.googleapis.com/google.firestore.admin.v1.ExportDocumentsMetadata`
(this audit confirmed live that no such entry exists yet — the list
currently contains only unrelated, pre-existing index-build operations).
Then confirm the export actually landed in storage:

```
gcloud storage ls gs://pharmapulse-646de-firestore-backups/backup-<TIMESTAMP>/
```

A successful export produces an `*.overall_export_metadata` file plus
per-collection export files under that path. **Per this phase's own
verification rule: a backup is only considered verified once one of
these two checks returns a real, successful result.** Neither check has
been run against a real export in this phase, because no real export was
performed (no authenticated `gcloud` session was available).

## Restore command (do not run without explicit owner approval — never restore over production without a separate, explicit decision)

```
gcloud firestore import gs://pharmapulse-646de-firestore-backups/backup-<TIMESTAMP> \
  --project=pharmapulse-646de

firebase auth:import auth-backup-<TIMESTAMP>.json --project=pharmapulse-646de
```

**⚠️ Warning:** `gcloud firestore import` overlays the export on top of
current Firestore state — it does not first delete documents written
after the export. A true point-in-time rollback would require clearing
affected collections first, which is a destructive action requiring the
same approval gate as any other production reset proposed in PR-1G-A.
**This restore command must never be run against the production project
without the product owner's explicit, separate, written approval at the
time it is needed** — it is documented here only so the procedure exists
when genuinely required.

## Final status

**`BACKUP PROCEDURE READY — LIVE BACKUP NOT YET VERIFIED`**

No export was executed. No restore was executed. No Firestore document
was read, written, or deleted by this phase or by the live attempt made
in the follow-up session. Live actions taken across both sessions:
read-only introspection (`firebase projects:list`, `firebase login:list`,
`gcloud auth list`, `gcloud config list`, `gcloud --version`,
`gcloud projects describe`, `gcloud firestore databases list`,
`gcloud storage buckets list`, `gcloud billing projects describe`,
`gcloud firestore operations list`) plus two real but **failed, no-op**
mutation attempts (`gcloud storage buckets create` and
`gcloud firestore export`), both rejected by Google Cloud before any
resource was created or any Firestore data was touched, due to billing
being disabled on the project. **Remaining blocker: the owner must
enable billing on `pharmapulse-646de`** before this runbook's commands
can succeed.
