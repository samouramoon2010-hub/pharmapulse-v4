# PR-1G-A — Read-Only Launch Audit

**Status: read-only audit complete. No production mutation was performed
or attempted.** This document is the entry point; detailed findings live
in the companion documents listed in each section.

This audit is code-level only — there is no live Firestore/Auth
connection available in this environment, and none was attempted. Every
finding below is derived from reading source files, configuration files,
and Firestore rules/indexes definitions, not from querying production
data. Counts described as "expected" or "candidate" are inferred from
code paths (e.g. what the demo-seeder writes), not measured against the
live database.

## 1. Repository and environment audit

**Production project:** `pharmapulse-646de` (Firebase project ID, read
from the **tracked** `.env` file — see the P0 finding below). No staging/
test Firebase project is configured anywhere in the codebase.

**Firebase initialization:** `src/services/firebase.js` reads all config
from `import.meta.env.VITE_FIREBASE_*` — no hardcoded config, no emulator
connection logic (`connectFirestoreEmulator`/`connectAuthEmulator` do not
appear anywhere). There is **no code-level mechanism to distinguish a
staging Firebase project from production** — whatever `VITE_FIREBASE_*`
values are present at build time is the project the app talks to, full
stop.

**🔴 P0 finding — `.env` is tracked in git.** Confirmed independently
(`git ls-files | grep -i env` returns `.env` and `.env.example`; `.gitignore`
has no `env` exclusion at all). The tracked `.env` contains all 8 Firebase
web-config fields (`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`,
`_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`,
plus `VITE_DEMO_MODE`) — field **names** confirmed, values redacted in
this audit per the no-secrets-in-report rule. The repo has a configured
GitHub remote (`origin`) and multiple commits already exist touching this
file, meaning these values have already left the local machine if the
remote has ever been pushed. This must be treated as a credential
rotation + git-history scrub action item for the product owner — seeing
this report is not a fix. Firebase web API keys are not authorization
secrets by themselves (Firestore access is governed by `firestore.rules`,
which this audit found well-scoped — see §8), but committing them is still
a hygiene violation that should be corrected (rotate the key in Firebase
Console / restrict it by HTTP referrer in Google Cloud Console, remove
`.env` from git tracking and history, add `.env` to `.gitignore`).

**Build/scripts:** `package.json` defines only `dev`, `build`, `lint`,
`preview`, `test` — no `seed`/`migrate`/`reset`/`backup` npm script exists.
`firebase-tools` is **not** a project dependency.

**Seed/demo/reset tooling found:** `src/demo/demo-seeder.ts` and
`src/demo/demo-cleanup.ts`, driven from an admin-only UI page
(`src/pages/admin/DemoDataPage.tsx`). Both are environment-agnostic — they
write to whatever Firebase project the build is currently pointed at — but
are markers-only-safe (see §3/§12). No standalone backup/export/restore
script exists anywhere in the repository (see §7 — backup is **BLOCKED**).

**Netlify:** `netlify.toml` exists — build command `npm run build`,
publish directory `dist`, SPA redirect `/*` → `/index.html` (200), Node
20.19.0. Per-context env: `VITE_DEMO_MODE="false"` (production context),
`VITE_DEMO_MODE="true"` (deploy-preview context). **This variable is
currently a no-op** — `VITE_DEMO_MODE` is not read anywhere in `src/`
(confirmed via repo-wide grep). Either this is leftover config from a
feature that was never wired up, or it was intended to gate something
that no longer exists. Recommend the product owner confirm intent before
launch (P2 — not a security risk, but a configuration-hygiene gap that
should be resolved or removed, not silently shipped).

Full detail: this section.

## 2–3. Firestore collection inventory and data classification

See [`PRODUCTION_DATA_INVENTORY.md`](PRODUCTION_DATA_INVENTORY.md) for the
full collection-by-collection table (35 collections/subcollections found),
each tagged with purpose, production-criticality, and the exact A/B/C/D
classification requested.

Headline counts: **27 collections classified A (must retain) or B (retain
unless explicitly approved)**, **8 classified C (safe reset candidate)**,
**0 classified D** (every collection had a clear enough purpose from code
to classify with confidence — none required "ambiguous/manual review").

## 4. Demo and test artifact audit

`src/demo/demo-seeder.ts` writes demo documents into exactly **7
collections**: `pharmacies`, `users`, `targets`, `personal_targets`,
`kpi_entries`, `evaluation_results`, and the seeder's own metadata
collection `demo_batches`. Every demo document carries three markers:
`isDemoData: true` (boolean, strict-equality checked everywhere it
matters), `demoBatchId` (e.g. `DEMO_<timestamp>_<rand>`), and
`scenarioName`. Demo users use a `demo.<id>@pharmapulse.test` email
pattern — distinct from any real-looking domain.

`src/demo/demo-cleanup.ts` only ever deletes documents where
`isDemoData === true` is independently re-verified client-side before
each delete, and re-scans after deletion to confirm the count reached
zero. Structurally, a document without the `isDemoData` flag cannot be
touched by this code path — production data was never expected to carry
that field, so the cleanup path has no way to accidentally match it.

`src/pages/admin/DemoDataPage.tsx` gates seeding behind a mandatory
dry-run step (must run before generate is enabled), single-batch delete
behind a double-click confirmation, and a **global** "delete all demo
data" behind a triple-step confirmation (click 1: "are you sure?", click
2: "FINAL CONFIRM — this cannot be undone", click 3: executes).

**Separately found, not part of the seeder:** `src/data/dummyData.js`
contains hardcoded literal credentials (e.g. `admin@pharmapulse.com` /
`Admin@123`-style values) for an `admin`/`manager`/8 pharmacist set.
Confirmed via repo-wide grep that **this file is imported nowhere** in the
app — it is dead code, not wired into any seed/login/demo path. It is
still a P1 hygiene finding: hardcoded credential strings should not sit in
the repository even unused, and it should be deleted before launch (or
explicitly archived outside the app's source tree) rather than left as a
plausible-looking landmine for a future contributor to import by mistake.

Full candidate list and confidence levels: see
[`PRODUCTION_DATA_INVENTORY.md`](PRODUCTION_DATA_INVENTORY.md) §"Demo/test
candidates" and [`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md).

## 5. Authentication user audit

Read-only, code-level only (no live Auth user list is accessible from
here — every count below is a structural/process finding, not a live
census).

- **User creation is two-step:** Firebase Auth account first
  (`createFirebaseAuthUser`), then a Firestore `users/{uid}` doc
  (`src/services/userService.js:120–172`). Territory/role validation runs
  **before** the Auth call, so a validation failure cannot create an
  orphan Auth account for that reason — but if the Firestore write itself
  fails *after* a successful Auth create, an orphan Auth account (no
  Firestore doc) is possible; the code logs and re-throws rather than
  silently swallowing it, but does not auto-remediate.
- **Orphan Firestore docs without Auth users:** not possible via the
  normal creation path (Firestore write only happens after Auth succeeds).
  The one structured exception is the Data Exchange pending-pharmacist
  flow (`pending_<employeeId>` placeholder docs created by bulk import,
  with no Auth account until the pharmacist activates) — these are
  intentional, not orphans, and are excluded from operational user lists
  via `authStatus !== 'CLAIMED'` filtering (see §6 CLAIMED).
- **No hardcoded production credentials** were found in any code path that
  actually runs (the one hardcoded-credential file, `dummyData.js`, is
  confirmed dead/unimported — see §4).
- **No bootstrap/seed-admin script exists.** The first production admin
  account must be created manually (Firebase Console, or by an existing
  admin via the Users page) — this is undocumented in `docs/production/`
  today. **Recommend adding a one-paragraph "how to create the first admin"
  note to the runbook before launch** (P1 — not a blocker, but a real gap
  that could strand the product owner at launch time).
- **Password handling:** PR-1B already replaced admin-entered temporary
  passwords with a server-generated, never-displayed/never-logged
  32-character password plus a forced Firebase reset email — confirmed
  still in place, not modified by this audit.
- **Disabling a user** sets `active: false`/`status: 'inactive'` on the
  Firestore doc only — it does **not** disable the underlying Firebase
  Auth account. This is a real, disclosed gap: a "disabled" user's Auth
  session/credentials remain technically valid at the Firebase Auth layer
  even though every app-level read/write is denied by role/scope rules.
  Not a launch blocker (defense-in-depth via rules still holds), but worth
  the product owner knowing — true account disablement would require an
  Admin SDK call this client-only app cannot make.

## 6. Referential integrity audit

Full numbered findings: see [`PRODUCTION_DATA_INVENTORY.md`](PRODUCTION_DATA_INVENTORY.md)
§"Referential integrity" and [`LAUNCH_BLOCKERS_REGISTER.md`](LAUNCH_BLOCKERS_REGISTER.md).

Headline risks (none are new — all are pre-existing architectural
properties being surfaced for the reset decision, not regressions):

- **`importBatchRef` is an unchecked soft link.** The Data Exchange
  import-bypass rule (`firestore.rules`, the `importedViaDataExchange`
  branch) requires `importBatchRef` to be a non-empty string, but never
  verifies that string actually names an existing `import_jobs` document.
  A malformed/stale reference would still write successfully. Relevant if
  Reset Group 3 (import/staging history) is ever approved — deleting
  `import_jobs` docs would make this gap a true dangling reference rather
  than just an unchecked one.
- **`audit_logs` are not cascade-protected against user deletion.** Rules
  allow `userId == request.auth.uid` on create and admin-only delete, but
  there's no check that the actor's `users` doc still exists. Deleting a
  user does not delete their audit trail (this is actually *correct*
  retention behavior for an audit log), but it does mean a future reader
  could resolve `userId` to "no such user" with no further context — worth
  knowing if Reset Group 2 (test users) is ever approved for real accounts
  rather than only the cleanly-tagged demo ones.
- **CLAIMED-record visibility — confirmed still correctly enforced.**
  Every operational reader audited by PR-1B
  (`userService.getUsersByPharmacy`, `historyService.fetchBranchPharmacists`,
  `ranking-service.fetchUserDisplayNames`, `territoryValidation.ts`,
  `territoryBackfill.ts`, plus the Users/Regions/Districts admin pages)
  still excludes `authStatus === 'CLAIMED'` placeholder docs. No
  regression found.
- **KPI archive dependency checking is UI-side only** (`kpiArchiveGuard.ts`)
  — there is no Firestore rule that blocks writing a target/entry field
  for an archived KPI key. This was a known, accepted design from PR-1C
  (archiving is soft-delete, not destructive) and is not a new finding.

## 7. Backup and restore readiness

**🔴 BLOCKED.** See [`BACKUP_RESTORE_RUNBOOK.md`](BACKUP_RESTORE_RUNBOOK.md)
for full detail. Summary: no backup/export script exists in this
repository, `firebase-tools` is not a project dependency, and no
documented runbook for taking or restoring a Firestore export exists
under `docs/production/` prior to this audit. A backup is *possible*
using standard external tooling (`gcloud firestore export` or
`firebase firestore:export` via a one-off `npx firebase-tools` invocation
with project-owner credentials), but **none of that has been verified to
work against this specific project** from within this environment, and no
credentials are available here to test it. **Per the explicit instruction
governing this audit, reset is marked BLOCKED until a real backup is taken
and verified by someone with production Firebase Console / `gcloud`
access** — this audit does not have that access and did not attempt to
acquire it.

## 8. Firestore rules and indexes audit

`firestore.rules` (975 lines) — **no open/`if true` rules found anywhere.**
Two intentional, narrowly-scoped admin bypasses exist, both already
commented in the rules source itself:
1. The RF-0E demo-seeder bypass (`isDemoData: true` required).
2. The DX-6 Data Exchange import bypass (`importedViaDataExchange: true`
   + non-empty `importBatchRef` required).

Both are auditable (every write is taggable back to its cause) but
neither is currently *verified* against an `import_jobs` existence check
(see §6). Role names referenced in rules (`admin`, `manager`,
`branch_manager`, `district_supervisor`, `regional_manager`) match the
canonical list in `src/constants/roleScope.js`, including the
`manager`→`branch_manager` legacy-alias relationship. No mismatch found.

`firestore.indexes.json` (509 lines, 36 composite indexes) — cross-checked
against the `where()`/`orderBy()` patterns actually used in
`kpiService.js`, `evaluationLedgerService.ts`, and the bulk evaluation
services. **No missing index was found** for any query pattern this audit
could locate in code.

## 9. Environment variables and secrets audit

Full variable list: §1 above and `PRODUCTION_DATA_INVENTORY.md`. No
secret **values** appear in this or any companion document. The repo's
own `.env` tracking (§1 P0 finding) is the only secrets-handling issue
found — variable *names* are not secret and are listed for inventory
purposes throughout these documents.

## 10. Netlify deployment audit

Confirmed: SPA fallback redirect present and correct
(`/* → /index.html, 200`), build command/publish directory correct,
per-context `VITE_DEMO_MODE` set but currently a no-op (§1). No evidence
of any sensitive file being explicitly published. A production build was
run as part of this audit's validation sweep (see Tests/Build section)
and its output was inspected directly — see §11 for the corrected
preview-asset finding.

## 11. Preview and dead-code audit

Full inventory: see [`LAUNCH_BLOCKERS_REGISTER.md`](LAUNCH_BLOCKERS_REGISTER.md)
§"Preview/dead-code." Headline finding: `public/login-network-preview/`
and `public/login-vortex-preview/` (the two login-background preview
asset folders built earlier in this engagement) live under `public/`,
which Vite copies verbatim into `dist/` — **confirmed by running an actual
production build during this audit's validation sweep** (both folders
appear under `dist/`). They are therefore reachable by direct URL in
production, exactly like the routes that serve them.

**Correcting an earlier inference in this audit:** a first pass assumed
the PWA plugin's default Workbox precache glob would also pick these
WebP files up into the service-worker cache. Running the actual build and
inspecting the generated `dist/sw.js` precache manifest shows this is
**not the case** — the manifest contains exactly 13 entries (JS/CSS
bundles, `index.html`, `registerSW.js`, `manifest.webmanifest`), no
images at all, from either `public/` or anywhere else. So there is no
service-worker cache-weight issue from these assets. The only real
finding here is the unauthenticated direct-URL reachability noted above,
which is unchanged from §10/§3 and already tracked.

`.render-tmp/`, `design-assets/`, `design-reference/` are confirmed **not**
imported by anything in `src/` or `public/` — they cannot reach `dist/`
through Vite's bundling and are not a deployment risk. They are, however,
**not excluded by `.gitignore`** (confirmed — `.gitignore` lists
`node_modules`, `dist`, `dist-ssr`, `*.local`, editor files, and
`.netlify` only), so they remain tracked-or-trackable repo bloat. P3
cleanup recommendation, not a launch blocker.

## 12–14. Reset proposal, dry-run capability, smoke-test plan

See the three dedicated documents:
- [`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md)
- [`BACKUP_RESTORE_RUNBOOK.md`](BACKUP_RESTORE_RUNBOOK.md) (dry-run section)
- [`FINAL_LAUNCH_SMOKE_TEST_MATRIX.md`](FINAL_LAUNCH_SMOKE_TEST_MATRIX.md)

## 15. Launch blockers classification

Full register with every finding above assigned a P0–P3 severity: see
[`LAUNCH_BLOCKERS_REGISTER.md`](LAUNCH_BLOCKERS_REGISTER.md).

## 16–18. Documentation, validation, approval package

See [`PR1G_APPROVAL_CHECKLIST.md`](PR1G_APPROVAL_CHECKLIST.md) for the
approval table and final sign-off gate.

**Validation sweep results (read-only — test run, type check, and build
only; no Firestore/Auth/rules/deploy action):**
- Full test suite: **351/351 test files, 25,493/25,493 tests passed.**
- `tsc --noEmit`: zero type errors. (One pre-existing, unrelated
  deprecation notice about `tsconfig.json`'s `baseUrl` option printed —
  not an error, not introduced by this audit, no code was changed that
  could affect it.)
- Production build (`vite build`): succeeded. Output inspected directly
  as part of §10/§11 above — confirms SPA/PWA build artifacts are
  correct and corrects an earlier inference about service-worker
  precache contents.
- No repository file outside `docs/production/` was modified by this
  audit. `dist/` build output is gitignored and was not committed.

## No production mutation occurred

Confirmed: no Firestore write, no Firestore delete, no Auth user
created/disabled/deleted, no password reset triggered, no Firestore rule
or index deployed, no Netlify deploy triggered, during this audit. Every
finding above was produced by reading source files and configuration —
nothing in this repository's tracked history was changed except the
addition of the seven audit documents this phase explicitly calls for.
