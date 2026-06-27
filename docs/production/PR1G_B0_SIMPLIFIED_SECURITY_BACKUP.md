# PR-1G-B0 — Simplified Security Fix + Backup Readiness

**Status: NOT closed — blocked on a Google Cloud billing prerequisite
outside this audit's authority to resolve.** Scope: untrack `.env`,
harden `.gitignore`, produce a names-only secret rotation checklist, and
produce and attempt a verified Firestore backup. No production data
reset, no Login V3 change, no evaluation-logic change, no new feature.

## Live backup attempt (follow-up session, after owner ran `gcloud auth login`)

The owner completed `gcloud auth login`. This audit then:

1. Confirmed real access: `gcloud auth list` → active account
   `samouramoon2010@gmail.com`; `gcloud projects describe pharmapulse-646de`
   → `lifecycleState: ACTIVE`, project number `522120299228` (matches the
   number independently found in PR-1G-A).
2. Confirmed the active project was already `pharmapulse-646de`
   (`gcloud config list`).
3. Confirmed the Firestore database is `FIRESTORE_NATIVE`, region
   `africa-south1` (`gcloud firestore databases list`).
4. Found **no existing Cloud Storage bucket** in the project
   (`gcloud storage buckets list` → 0 items) — the runbook's original
   assumption of a reusable default bucket was wrong for this project.
5. Attempted to create a dedicated, private, same-region backup bucket
   (`gs://pharmapulse-646de-firestore-backups`, `africa-south1`,
   uniform bucket-level access, public access prevented) — **failed**:
   `403 ... The billing account for the owning project is disabled in
   state absent.`
6. Confirmed the root cause directly: `gcloud billing projects describe
   pharmapulse-646de` → `billingEnabled: false`.
7. Attempted `gcloud firestore export` directly (to a bucket path that
   doesn't exist, so nothing could have been written even on success) —
   **failed** with `PERMISSION_DENIED ... BILLING_DISABLED`.
8. Confirmed via `gcloud firestore operations list` that **no export
   operation was queued** — only pre-existing, unrelated index-build
   operations appear; no `ExportDocuments` entry exists.

**Net result: no bucket was created, no export ran, no Firestore
document was read or written.** The blocker is now precisely identified:
**billing is disabled on the `pharmapulse-646de` Google Cloud project.**
Enabling it requires the owner to attach a billing account — an
account/financial-settings action this audit will not perform. Full
detail and the exact remediation link:
[`FIRESTORE_BACKUP_QUICK_RUNBOOK.md`](FIRESTORE_BACKUP_QUICK_RUNBOOK.md).

**This phase cannot be reclassified as closed** — per its own rule, a
backup is only verified once an export operation completes successfully
or appears in operation history as successful, and neither is true.

## 1. `.env` tracking fix

- Confirmed before this phase: `.env` was tracked in git (3 historical
  commits touch it: `1b1daa8`, `1d80c24`, `3c47da6`), with a configured
  `origin` remote (`https://github.com/samouramoon2010-hub/pharmapulse-v4.git`).
- Ran `git rm --cached .env` — removes it from git's index (future
  commits) while leaving the file on disk untouched. Confirmed the local
  file still exists after the command.
- `.gitignore` updated to add `.env`, `.env.local`, `.env.production`,
  `.env.development`, `.env.*.local`. `.env.example` was deliberately
  **not** matched by any new pattern (kept tracked, as required).
- `.env.example` updated to include all 8 variable names actually present
  in `.env` (it was previously missing `VITE_FIREBASE_MEASUREMENT_ID` and
  `VITE_DEMO_MODE`) — names only, every value left blank.

## 2. Secret rotation checklist

See [`SECRET_ROTATION_CHECKLIST.md`](SECRET_ROTATION_CHECKLIST.md).
Summary: the 7 `VITE_FIREBASE_*` variables are public Firebase client
configuration, not true secrets — Firestore/Storage/Auth access is
governed by rules, not by these values (PR-1G-A already confirmed no
open rules exist). Rotation of `VITE_FIREBASE_API_KEY` is recommended as
defensive hygiene (plus an HTTP-referrer restriction), not because it is
an exploitable secret. No true private secret (service-account key,
API token, analytics/monitoring token) was found anywhere in the
repository. Three items the repository itself cannot verify (Netlify-
dashboard-only env vars, out-of-repo service-account keys, actual GitHub
repo visibility) are listed explicitly as manual owner checks.

## 3. Firestore backup procedure

See [`FIRESTORE_BACKUP_QUICK_RUNBOOK.md`](FIRESTORE_BACKUP_QUICK_RUNBOOK.md).
This phase went further than just writing a procedure — it checked real
tool availability live:
- `firebase-tools` (v15.19.1) is installed and **already logged in** as
  the project owner, with confirmed read access to the
  `pharmapulse-646de` project (`firebase projects:list`).
- `gcloud` (v573.0.0) is installed but has **no authenticated account**
  in this environment (`gcloud auth list` → "No credentialed accounts.").
- Firestore export/import is exclusively a `gcloud` capability —
  `firebase-tools` has no `firestore:export` subcommand. So the real
  blocker is `gcloud` authentication, not missing tooling.
- An interactive `gcloud auth login` would resolve this, but that is the
  owner's own credential action (browser-based Google sign-in) and was
  intentionally not performed here.

## 4. Backup verification

**Updated after the live attempt:** `gcloud` now has an authenticated
session (the owner ran `gcloud auth login`), and this audit confirmed
real project/Firestore access with it. The export was attempted for
real and rejected by Google Cloud — not due to missing auth, but because
**billing is disabled on the `pharmapulse-646de` project**
(`billingEnabled: false`, confirmed via `gcloud billing projects describe`).
No bucket exists, no export operation was queued
(`gcloud firestore operations list` shows no `ExportDocuments` entry),
and no Firestore document was touched. Per the explicit rule governing
this phase, backup success cannot be claimed without evidence (a
completed export operation or a populated storage destination), and
neither exists. Final status:

`BACKUP PROCEDURE READY — LIVE BACKUP NOT YET VERIFIED`

## 5. Validation sweep (read-only)

- `git status` reviewed: `.env` no longer tracked; `.env.example`,
  `.gitignore`, and the 4 new/updated `docs/production/` files are the
  only intentional changes from this phase.
- `.gitignore` confirmed to contain `.env`, `.env.local`,
  `.env.production`, `.env.development`, `.env.*.local`.
- `.env.example` confirmed to contain variable names only, every value
  blank.
- Secret-reference scan: repeated the PR-1G-A search for service-account
  files, `.pem`/`.key`/`.p12` files, hardcoded private-key literals, and
  analytics/monitoring tokens — none found, consistent with the prior
  audit.
- Full test suite, `tsc --noEmit`, and production build — results below.

## 6. Documentation

Created/updated exactly: `.gitignore`, `.env.example`,
`docs/production/SECRET_ROTATION_CHECKLIST.md`,
`docs/production/FIRESTORE_BACKUP_QUICK_RUNBOOK.md`, and this file.
No other documentation package was created.

## No production mutation occurred

No Firestore document was read, written, or deleted. No Auth change. No
rules/index deploy. No Netlify deploy. No Firestore export or import
ever ran to completion — the one real export attempt was rejected by
Google Cloud before queuing (`BILLING_DISABLED`). The one real bucket-
creation attempt was also rejected before creating anything (`403`,
same billing cause) — confirmed afterward via a fresh bucket listing
showing 0 items. Live calls made against real credentials across both
sessions: `firebase login:list`, `firebase projects:list`,
`gcloud auth list`, `gcloud config list`, `gcloud --version`,
`gcloud projects describe`, `gcloud firestore databases list`,
`gcloud storage buckets list` (×2), `gcloud billing projects describe`,
`gcloud storage buckets create` (failed, no-op),
`gcloud firestore export` (failed, no-op),
`gcloud firestore operations list`.

## Reset status

**Production data reset has not started.** This phase did not touch any
Firestore document, any Auth user, or any of the 4 reset groups proposed
in PR-1G-A's [`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md).
