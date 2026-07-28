# Full Pre-Production Data Cleanup — Dry Run Report

**READ-ONLY. No Firestore document was written, updated, or deleted at
any point. No Firebase Auth user was created, updated, disabled, or
deleted.** This report was originally produced with no live Firestore
access (see "Critical limitation" below, kept for historical accuracy).
It has since been supplemented with a live, read-only counting pass —
see "Live Read-Only Count Evidence" immediately below — using real
`getCountFromServer`/`getDocs`/`getDoc` reads only, run inside the
confirmed real admin's own authenticated browser session.

## Live Read-Only Count Evidence (2026-07-06)

**Project verified:** `pharmapulse-646de` (confirmed via the running
app's own `.env` config, matching the task's required project id).

**Real admin verified:** signed in via the app's own `/login` flow (the
admin typed their own credentials directly into the browser — never
seen or handled by this process). Session confirmed via the app's own
persisted profile: `role: admin`, `active: true`, masked uid `2hs9***`,
masked email `ad***@pharmapulse.com`. This is the same account every
query below ran as.

**Method:** a temporary, read-only Firebase Web SDK instance (CDN ESM,
matching the installed `firebase@12` major version) was loaded inside
the already-authenticated browser tab. Firebase Auth's persisted session
(stored in the browser's IndexedDB, keyed by API key + app name) was
picked up automatically by this temporary instance — this is standard,
documented Firebase Auth behavior for same-origin, same-project app
instances, not a workaround. Every call made was `getCountFromServer`,
`getDocs`, or `getDoc` — the Firebase Web SDK has no batch-delete
affordance that could be invoked accidentally through these calls, and
none was invoked deliberately either.

**Full real counts, confidence updates, and the one live rules finding
(Item Sales permission-denied) are in `FULL_RESET_DELETE_MANIFEST.md` —
this section is the methodology; that file has the numbers.**

**What remains unresolved even with live access:**
- Item Sales / Smart List collections (`item_sales_monthly`,
  `item_sales_branch_monthly`) returned `permission-denied` for the
  confirmed real admin on every query attempted — unfiltered count,
  unfiltered list, and list filtered by each of the 4 real pharmacy ids.
  This is a live rules-evaluation finding, not a limitation of this
  audit's access level, and is flagged for separate investigation.
- Firebase Auth's own user list (as opposed to Firestore `users`
  profiles) could not be enumerated — the client SDK only ever exposes
  the currently-signed-in user, never a full list. This requires the
  Firebase Admin SDK or Console, neither of which this environment has.
- Every group requiring an owner decision (go-live cutoff date, test
  account list, test branch/period list) is still exactly as unresolved
  as before — live counts answer "how many," not "which of these are
  experimental," which was never something data alone could answer.

## Critical limitation — read this first (historical — see live evidence above)

**This environment has no live Firestore connection and no Firebase
Admin SDK / service-account credentials.** `.env` contains only the
public, client-side Firebase Web SDK config (`VITE_FIREBASE_API_KEY`
etc.) — the same keys the browser app itself uses, which require an
authenticated session matching Firestore security rules to read any
data. There is no service account, no admin script, and no live
authenticated session available to this analysis.

**Consequence: every count below is either taken from a prior code-level
audit finding or explicitly marked `COUNT: REQUIRES LIVE QUERY`.** No
number in this report is invented. This is the same limitation the
PR-1G-A audit (`PRODUCTION_DATA_INVENTORY.md`) hit and disclosed
identically: *"This audit had no live database connection to run an
actual orphan scan."*

**What this report delivers instead, which is fully achievable and
genuinely useful without live access:**
- Exact classification **rules** (RETAIN / DELETE CANDIDATE / MANUAL
  REVIEW) per collection, grounded in the actual field-level schema and
  write-path code (not guessed from collection names).
- The complete referential-integrity map and safe deletion order.
- The exact specification for a read-only counting tool
  (`FULL_RESET_EXECUTION_PLAN.md` §"Dry-run counting tool spec") that,
  when run by an authenticated admin inside the real app, will populate
  every count this report cannot.

**Recommended next step before any owner approval:** have an authenticated
admin run the counting-only extension described in the execution plan
(read-only `getCountFromServer`/`getDocs` calls, zero writes) and paste
its output back in; this report's rules will classify those real counts
without needing to be rewritten.

## No-backup warning (prominent, per instruction)

**Official Firestore backup is not currently available.** Per
`PR1G_B0_SIMPLIFIED_SECURITY_BACKUP.md` and `FIRESTORE_BACKUP_QUICK_RUNBOOK.md`,
this is because Google Cloud billing is disabled on the
`pharmapulse-646de` project, which is a prerequisite for
`gcloud firestore export`. **This means: if a future cleanup run deletes
the wrong document, there is currently no way to restore it.** This dry
run does not change that fact. Do not treat any part of this report as
making cleanup risk-free — it reduces the risk of deleting the *wrong*
data by classification discipline, but it cannot undo a mistake once
made. Enabling billing and taking one real export is the only action
that changes this.

---

## Real admin protection

**Identification procedure (to be run live, read-only, by an
authenticated admin — not executed here):**

1. Query `users` where `role in ['admin', 'general_manager']`.
2. Filter to `active !== false` and `authStatus !== 'CLAIMED'`.
3. For each candidate, confirm a matching Firebase Auth user exists
   (`auth.currentUser.uid === users/{uid}` document id — this repo's
   convention is that the Firestore doc id is always the Auth uid,
   confirmed in `authStore.js`'s `_fetchProfile`).
4. Confirm the candidate has no `isDemoData` field (structurally
   guaranteed already — see `FULL_RESET_RETAIN_ALLOWLIST.md`: the demo
   seeder never creates `role: 'admin'` users, only `role: 'pharmacist'`).
5. Confirm the account's scope resolves validly via
   `resolveAllowedPharmacyIdsSync()` — `admin`/`general_manager` always
   resolve to `{ type: 'all' }` per `scopeResolver.ts`, so this step is a
   sanity check that the role string is exactly one of the two literal
   values, not a typo'd variant.

**If step 3 or step 5 fails for every candidate, stop — do not proceed
with any cleanup approval until a real admin account is confirmed to
exist and authenticate successfully.** This report cannot execute this
procedure itself (no live connection); it is included so the person who
does run it live has an exact, unambiguous checklist.

**Email disclosure:** per instruction, this report does not print any
full email address. The identification procedure above resolves the
account by role/uid, not by displaying its email.

---

## Group-by-group classification

For each group: collection(s), classification rule, dependency impact,
and count status. "Prior finding" cites `PRODUCTION_DATA_INVENTORY.md`
(PR-1G-A) where a code-level classification already exists; "count"
status is `REQUIRES LIVE QUERY` everywhere a real number would need to be
invented otherwise.

### 1. Demo-tagged records

**Collections:** `pharmacies`, `users`, `targets`, `personal_targets`,
`kpi_entries`, `evaluation_results`, `ranking_snapshots`, `demo_batches`
(the exact 8 collections in `demo-cleanup.ts`'s `ALL_DEMO_COLLECTIONS`).

**Selection rule:** `doc.isDemoData === true` (strict equality, exactly
as `demo-cleanup.ts`'s `isSafeToDelete()` already enforces). Any document
missing the field, or where it is falsy/absent, is never a candidate
here.

**Dependency impact:** a demo `pharmacies` doc, if deleted, would orphan
any demo `users`/`targets`/`kpi_entries` rows referencing its id.
`demo-cleanup.ts`'s own delete order already handles this (referencing
collections before `pharmacies`) — see deletion order below.

**Confidence:** High. The tag is set unconditionally by the seeder and
checked unconditionally by the existing cleanup tool; no ambiguity.

**Count (live, 2026-07-06):** 752 demo-tagged rows total across the 8
collections; 220 real (retained) rows. Per-collection breakdown:
`pharmacies` 10/4, `users` 30/10, `targets` 10/2, `personal_targets`
30/2, `kpi_entries` 666/16, `evaluation_results` 0/111,
`ranking_snapshots` 0/65, `demo_batches` 1/0 (demo-tagged/retained).
Notable finding: `evaluation_results` and `ranking_snapshots` had **zero**
demo-tagged rows live — every row in both collections is untagged,
folding entirely into Group 4 below rather than being split as
originally assumed. Full table in `FULL_RESET_DELETE_MANIFEST.md`.

**Selection note beyond the existing tool:** `demo-cleanup.ts` does not
scan `evaluation_results` output tagging beyond what's listed — cross-
checked against `PRODUCTION_DATA_INVENTORY.md`'s finding that these are
"the only collections where individual documents can be confidently
identified as test data, via the `isDemoData === true` field. Confidence:
high for all [8]." This dry run does not expand that list — it is
already complete for the demo-tag mechanism specifically.

### 2. Manual experimental KPI entries

**Collection:** `kpi_entries` (rows **without** `isDemoData`).

**Selection rule:** This is explicitly **not** the same population as
Group 1. A manually-entered row created by a real user account during
development/UAT testing carries no demo tag at all — `saveKpiEntry()`
writes exactly what the caller passes, with no experimental/test marker
field in the schema. **There is no reliable field-level marker to
distinguish "real production entry" from "manual test entry typed by a
real staff account during setup."**

**Selection rule (best available, still requires human judgment):**
- Entries dated before the organization's declared "go-live" date (a
  date this report does not have — must be supplied by the owner).
- Entries attributed to accounts later confirmed as test/onboarding
  accounts (cross-reference against Group 7).
- Entries for pharmacies later confirmed as test branches.

**Classification:** **MANUAL REVIEW — mandatory.** Per instruction ("Do
not guess"), this group cannot be auto-classified as DELETE CANDIDATE
without either (a) a go-live cutoff date from the owner, or (b) a
per-entry confirmation. Flagging the entire non-demo-tagged
`kpi_entries` collection as one undifferentiated bucket would risk
deleting real early-production data entered before this cleanup was
scoped.

**Dependency impact:** `kpi_entries` feeds `evaluation_results`,
`ranking_snapshots`/`ranking_history`, `daily_summaries`,
`forecast_snapshots`, `risk_snapshots` — deleting entries after those
derived records exist leaves the derived records referencing since-
deleted source data (not a hard orphan — those are computed snapshots,
not live foreign keys — but the historical record would then be
unreconcilable against its source).

**Count (live, 2026-07-06):** 16 untagged `kpi_entries` rows (out of 682
total). Date range 2026-05-20 → 2026-06-27. 2 distinct real pharmacies,
3 distinct users. 0 of the 16 carry an `importBatchRef`, so none of them
are tied to an import job's provenance chain. Still requires the owner's
go-live cutoff date to turn this count into an actual candidate list.

### 3. Experimental targets

**Collections:** `targets`, `personal_targets` (rows without
`isDemoData`).

**Selection rule and classification:** Same reasoning as Group 2 —
**MANUAL REVIEW**. A target set for a real pharmacy before go-live could
be either a real, still-valid target or a testing artifact; no field
distinguishes the two.

**Dependency impact:** `targets`/`personal_targets` are read by the
evaluation engine at scoring time (`targets.kpiKey`/`kpiRegistry`
cross-reference, per `PRODUCTION_DATA_INVENTORY.md`'s referential
findings) — deleting a target referenced by an already-computed
`evaluation_results` row does not retroactively invalidate that row, but
means the target can no longer be displayed alongside it in the UI
(`TargetsPage.jsx` reads live).

**Count (live, 2026-07-06):** 2 untagged `targets` rows (months 2026-05,
2026-06; 1 real pharmacy) and 2 untagged `personal_targets` rows. Still
requires the owner's go-live cutoff date.

### 4. Evaluation/ranking/snapshot output

**Collections:** `evaluation_results` (demo-tagged subset already in
Group 1), `ranking_snapshots`, `ranking_history`, `daily_summaries`,
`monthly_summaries`, `forecast_snapshots`, `risk_snapshots`,
`shadow_evaluation_logs`.

**Selection rule:**
- `evaluation_results`/`ranking_snapshots` with `isDemoData === true` →
  already covered by Group 1 (DELETE CANDIDATE, high confidence).
- `evaluation_results`/`ranking_snapshots` **without** `isDemoData` → these
  are computed outputs derived from `kpi_entries`/`targets` at scoring
  time. If the source entries feeding them are ever approved for deletion
  (Groups 2/3), these derived records become stale/orphaned by
  definition and should be deleted **after** their source, not before —
  see deletion order.
- `daily_summaries`, `monthly_summaries`, `forecast_snapshots`,
  `risk_snapshots` — Historical Data Layer V1 rolling snapshots. No
  `isDemoData` tagging convention exists for these per code (not written
  by the seeder or checked by `demo-cleanup.ts`). **MANUAL REVIEW** —
  cannot be auto-classified.
- `shadow_evaluation_logs` — diagnostic-only, never affects official
  results (per its own doc comment: "results written to
  shadow_evaluation_logs only. Invisible" to production scoring).
  `PRODUCTION_DATA_INVENTORY.md` already flagged this as **B** (retain
  unless explicitly approved) — "currently the only audit trail for
  shadow-mode behavior — confirm with owner before clearing." This dry
  run keeps that classification: **MANUAL REVIEW**, lean toward retain.

**Dependency impact:** `ranking_history`/snapshots reference
`users`/`pharmacies` for display resolution only (fallback-safe, not a
hard foreign key, confirmed in PR-1B work) — low orphan risk either way.
`evaluation_results` references `evaluation_profiles` by id+version —
deleting a profile version that a real evaluation_results row points to
would break that row's explanatory trace; **never delete an
evaluation_profiles version that any evaluation_results row references,
demo or real** (this is why `evaluation_profiles` is a hard RETAIN, no
exceptions).

**Count (live, 2026-07-06):** `evaluation_results` 111 total (0
demo-tagged, all untagged — see Group 1's revised finding above),
`ranking_snapshots` 65 total (same), `ranking_history` 2,
`daily_summaries` 13, `monthly_summaries` 0, `forecast_snapshots` 13,
`risk_snapshots` 11, `shadow_evaluation_logs` 27. Referential spot-check:
15 of the 111 `evaluation_results` rows were sampled and each resolves
its `profileId` to an existing `evaluation_profiles` document — 0
orphans found in the sample (not a full census of all 111).

### 5. Smart List and Item Sales test data

**Collections:** `item_sales_monthly`, `item_sales_branch_monthly` (DX-12/
DX-12b — confirmed exact collection names from
`smartListCommitService.ts`), plus whatever staging rows the Smart List
import path writes under `import_jobs/{jobId}/rows` for
`ITEM_SALES`-domain jobs (see Group 6 — the staging mechanism is shared,
not a separate collection).

**Selection rule:** **No `isDemoData` tagging exists for these
collections at all** — confirmed: neither `demo-seeder.ts` nor
`demo-cleanup.ts` reference `item_sales_monthly`/`item_sales_branch_monthly`.
Every document in these two collections was written via a real Smart
List Excel import through `fetchItemSalesMonth()`'s write-side
counterpart — meaning **there is no structural way to distinguish "a
test import someone ran to try the feature" from "a real branch's real
first month of Smart List data"** other than the branch/period it
belonges to.

**Selection rule (requires owner input):** any document whose
`branchId` matches a pharmacy the owner confirms is a test/demo branch,
or whose `month` predates the declared go-live date.

**Classification:** **MANUAL REVIEW — mandatory**, same reasoning as
Groups 2/3. Do not default to "these two collections are new features
therefore automatically test data" — that is a guess, not a rule.

**Dependency impact:** keyed by `branchId` + `month`; deleting a branch's
`item_sales_branch_monthly` roll-up without deleting its matching
`item_sales_monthly` per-pharmacist rows (or vice versa) leaves the two
out of sync for that branch/period — delete both together per
branch+period, never one alone.

**Count (live, 2026-07-06):** **CANNOT DETERMINE — live rules finding.**
Every read attempt against `item_sales_monthly` and
`item_sales_branch_monthly` returned `permission-denied` for the
confirmed real admin — unfiltered `getCountFromServer`, unfiltered
`getDocs`, and `getDocs` filtered by each of the 4 real `branchId`s all
failed identically. `firestore.rules` lines 982–991 list `isAnyMgr()`
(which includes `'admin'`) as a valid read condition for both
collections, so this denial does not match the rule text as written —
this is a genuine live discrepancy between the deployed rules'
apparent intent and their actual enforcement, flagged here for separate
investigation. It is **not** a limitation of this task's access level
(the same admin session successfully read every other collection in
this report) and **not** something this read-only task will attempt to
fix.

### 6. Import jobs and staging records

**Collections:** `import_jobs` (top-level docs) + `import_jobs/{jobId}/rows`
(staging subcollection, confirmed in `firestoreStagingRepository.ts`).

**Selection rule:**
- Jobs in a **terminal state** (`COMPLETED`, `PARTIALLY_COMPLETED`, or an
  abandoned `DRAFT`/failed validation with no successful commits) are
  transient working data by design — `PRODUCTION_DATA_INVENTORY.md`
  already classifies staging rows as **C** (safe reset candidate) "once
  a job is committed or abandoned, but only for jobs in a terminal
  state."
- Jobs **not** in a terminal state (`READY`, `COMMITTING`) must never be
  touched — an in-progress or resumable commit exists
  (`resumeOrRetryActualsJob()` depends on the job doc + its staged rows
  surviving).
- **Hard constraint, already flagged in the prior audit and unresolved:**
  "Deleting `import_jobs` documents that are still referenced by
  `importBatchRef` on live `kpi_entries`/`targets` rows turns the
  existing unchecked soft link into an actual dangling reference." Since
  the Maintenance Quick Wins phase, `saveKpiEntry()` **now verifies**
  `importBatchRef` against `import_jobs` on every new write (see
  `MAINTENANCE_QUICK_WINS_IMPORT_INTEGRITY.md`) — but this check only
  runs at write time, not retroactively. **Any `import_jobs` document
  that is referenced by an `importBatchRef` on a `kpi_entries`/`targets`
  row that will be RETAINED must not be deleted**, or every future read
  of that retained row's provenance breaks.

**Existing safe tool:** `deleteAbandonedDraft(jobId)` in
`firestoreStagingRepository.ts` already implements exactly this pattern
(loads the job, checks it has zero committed rows, deletes rows +job
atomically) — this is the correct mechanism to reuse for this group,
not a new one.

**Classification:**
- Terminal-state jobs with **zero** referencing `kpi_entries`/`targets`
  rows in the RETAIN set → DELETE CANDIDATE (high confidence, once
  live-verified).
- Terminal-state jobs **with** a referencing row that will be retained →
  RETAIN (hard constraint above).
- Non-terminal jobs → RETAIN.
- Jobs where referencing-row status cannot be determined without a live
  cross-query → MANUAL REVIEW.

**Dependency impact:** see hard constraint above — this is the single
highest referential-integrity risk in the entire cleanup, flagged
identically in two prior audits now (PR-1G-A and this one).

**Count (live, 2026-07-06):** 8 `import_jobs` total — 4 `FAILED`
(terminal, 0 committed rows each — delete candidates), 1 `READY`
(non-terminal — must retain), 3 `COMPLETED` (terminal, 8 total committed
rows across `ASSIGNMENT`(3)/`BRANCH`(2)/`PHARMACIST`(3) domains — Data
Exchange onboarding data, not KPI actuals). None of the 16 untagged
`kpi_entries` rows carry an `importBatchRef`, so no currently-retained
`kpi_entries` row depends on any of these 8 jobs. The 3 `COMPLETED`
jobs' own committed effect on `users`/`pharmacies` was not individually
re-verified this pass. `rows` subcollections were not separately
counted (would require one additional read per job — low priority given
only 8 jobs total).

### 7. Experimental users and assignments

**Collections:** `users` (rows without `isDemoData`, but suspected
test/onboarding accounts), plus any pending-invitation pharmacist records
created during Data Exchange onboarding testing.

**Selection rule:** Demo-tagged `users` rows are already Group 1 (high
confidence). For **non-demo-tagged** accounts suspected of being
test/onboarding artifacts (e.g., accounts created while testing the
Users page, PHARMACISTS adapter, or ASSIGNMENTS adapter during
development): **no field marks these as test accounts** — they are
structurally identical to real accounts. `authStatus === 'CLAIMED'`
marks a *legitimate* pending-invitation state (already correctly
excluded from operational lists per PR-1B's CLAIMED-visibility fix), not
a test marker — **do not treat `authStatus === 'CLAIMED'` as a
delete signal**; that would incorrectly delete real pharmacists who
simply haven't logged in yet.

**Classification:** **MANUAL REVIEW — mandatory.** Confirmed in
`PR1G_READ_ONLY_LAUNCH_AUDIT.md`'s own finding: "this audit found no
*other* hardcoded or pattern-matched test account beyond the demo-seeder
ones ... this audit does not have a list of 'test' accounts beyond the
demo-seeded set and cannot infer one safely." This dry run reaches the
identical conclusion independently — there is no safe automated
selection rule for this group.

**Dependency impact:** deleting a `users` doc referenced by
`kpi_entries.userId`/`targets`/`audit_logs.userId` does not hard-break
those collections (display-only resolution with fallback, confirmed for
ranking; `audit_logs` are explicitly expected to outlive their actor per
PR-1G-A finding) but does degrade historical display quality.

**Count (live, 2026-07-06):** 10 real (non-demo-tagged) `users` out of
40 total. Breakdown: 1 `admin` (the protected account), 2 `manager`, 1
`branch_manager`, 6 `pharmacist`. 9 active, 1 inactive. `authStatus`: 7
`NONE`, 3 `PENDING_INVITATION` (legitimate pending-invitation state, not
a test signal). **No suspected test/onboarding account could be
identified from data alone** — still requires an owner-supplied explicit
list.

### 8. Disposable logs/diagnostics

**Collections:** `notifications`, `kpi_audit_logs` (RETAIN — see
allowlist), `audit_logs` (RETAIN — see allowlist), `shadow_evaluation_logs`
(see Group 4 — MANUAL REVIEW, lean retain).

**Selection rule:** `notifications` — rolling, per-user, not
business-critical, but real user notification history.
`PRODUCTION_DATA_INVENTORY.md` classifies it **B**: "do not assume safe
without confirming no active 'unread' UX dependency." This dry run keeps
that classification.

**Classification:** `notifications` → **MANUAL REVIEW**.
`audit_logs`/`kpi_audit_logs` → **RETAIN** (hard, see allowlist —
compliance-style, never a cleanup candidate). `shadow_evaluation_logs` →
**MANUAL REVIEW**, lean retain per Group 4.

**Dependency impact:** none of these are referenced *by* other
collections (they are all leaf/output records), so deleting them cannot
orphan anything else — the risk is purely losing the record itself, not
breaking a reference elsewhere.

**Count (live, 2026-07-06):** `notifications` 0 total — nothing exists to
review. `audit_logs` 849 total, `kpi_audit_logs` 0 total — both hard
retain, unaffected. Referential spot-check: 10 `audit_logs` entries
sampled, all 10 resolve their `userId` to an existing `users`
document — 0 orphans found in the sample.

---

## Manual-review items — consolidated

| Item | Why it cannot be auto-classified |
|---|---|
| Non-demo-tagged `kpi_entries` | No experimental marker exists; requires owner go-live cutoff date |
| Non-demo-tagged `targets`/`personal_targets` | Same as above |
| `item_sales_monthly` / `item_sales_branch_monthly` (all rows) | No tagging convention exists at all for this feature |
| Non-demo-tagged `users` (suspected test/onboarding accounts) | No test-account marker; `authStatus` is not a valid proxy |
| `import_jobs` in terminal state with unclear referencing-row status | Requires a live cross-query this environment cannot run |
| `daily_summaries`/`monthly_summaries`/`forecast_snapshots`/`risk_snapshots` | No tagging convention; Historical Data Layer output with no demo/real split mechanism |
| `notifications` | Real user history, no test marker, possible active UX dependency |
| `shadow_evaluation_logs` | Only audit trail for shadow-mode behavior; prior audit says confirm with owner |

---

## Proposed deletion order (once live counts + owner approval exist)

Deepest-dependency-first, matching `demo-cleanup.ts`'s own existing
pattern extended to the additional groups:

1. `import_jobs/{jobId}/rows` (staging rows) for jobs approved in Group 6
2. `import_jobs` top-level docs approved in Group 6 (only after their
   rows are gone and the referencing-row check passes)
3. `ranking_snapshots`, `ranking_history` demo/approved rows (leaf output,
   depends on nothing else being deleted first)
4. `evaluation_results` demo/approved rows
5. `daily_summaries`, `monthly_summaries`, `forecast_snapshots`,
   `risk_snapshots` approved rows (leaf, but logically follows the
   evaluation output they summarize)
6. `item_sales_monthly` rows, then `item_sales_branch_monthly` rows for
   the same branch+period (per-pharmacist detail before the roll-up, so
   a partial failure never leaves an orphaned roll-up pointing at
   deleted detail rows)
7. `kpi_entries` approved rows
8. `targets`, `personal_targets` approved rows
9. `users` approved rows (test/demo accounts only — never the admin)
10. `pharmacies` approved rows (only after every collection in 1–9 that
    could reference it is already clear for that pharmacy)
11. `demo_batches` metadata docs (last — nothing depends on this existing)

**Never delete `kpi_registry`, `evaluation_profiles`, `system_config`,
`districts`, `regions`, `classifications`, `audit_logs`,
`kpi_audit_logs`, or the real admin account at any point in this order.**

## Post-delete validation (per group, to run after any future execution)

For every group above: re-run the same read-only count query and confirm
it returns `0` for the approved-and-executed candidates, confirm the
RETAIN allowlist counts are **unchanged** from their pre-delete values
(a change there would indicate an over-broad delete and must halt further
groups), and spot-check that no `kpi_entries`/`targets` row now has a
dangling `importBatchRef` (re-run the existence check `saveKpiEntry()`
already performs, as a read-only verification, not a write).

## Rollback limitation

**There is no rollback beyond what this report already warned about
above.** No snapshot, no soft-delete, no trash/undo exists in this
codebase's Firestore write paths for hard deletes (`deleteDoc`/
`writeBatch().delete()` are permanent). The only real rollback path is
restoring from an official Firestore export, which does not currently
exist (see No-backup warning). Until that export exists, every deletion
in this manifest — even ones marked "high confidence" — is irreversible
if wrong.

## Confidence levels — summary

| Group | Confidence | Basis |
|---|---|---|
| 1. Demo-tagged records | High | Unconditional field tag, unconditionally checked by existing tool |
| 2. Manual experimental KPI entries | Low (as a bucket) | No marker; needs owner cutoff date |
| 3. Experimental targets | Low (as a bucket) | Same |
| 4. Evaluation/ranking/snapshot output | Medium (demo-tagged subset), Low (untagged) | Demo subset inherits Group 1's confidence; untagged has no marker |
| 5. Smart List/Item Sales | Low | No tagging convention exists |
| 6. Import jobs/staging | Medium | Terminal-state check is reliable; referencing-row cross-check requires live query |
| 7. Experimental users | Low | No test-account marker; confirmed twice now across two independent audits |
| 8. Disposable logs | Medium (`notifications`), Low (`shadow_evaluation_logs`, lean retain) | Per prior audit classification |
