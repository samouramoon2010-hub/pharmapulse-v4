# Production Readiness Architecture

Running log of the Production Readiness & UI Cleanup bundle. Each section
is closed independently; closure evidence for a completed section is
never overwritten by a later section's work.

## PR-1A — Production Correctness Blockers

**Status: FORMALLY CLOSED.**

- Full suite: 331/331 test files, 24,940/24,940 tests passing
- Production build: passed
- TypeScript: 2,127 baseline, zero new errors
- Reports scope and mixed-unit issues fixed
- Rankings branch-name resolution and rank-scope clarity fixed
- UID/debug exposure masked
- Dashboard/Executive BI contradiction audit found no genuine blocker

Do not reopen PR-1A unless a verified regression is discovered. See
[`PR1B_ROLES_SCOPE_CLOSURE.md`](PR1B_ROLES_SCOPE_CLOSURE.md) for
confirmation that PR-1A's full regression suite remained green throughout
PR-1B.

## PR-1B — Roles, Scopes, and Identity Cleanup

**Status: see [`PR1B_ROLES_SCOPE_CLOSURE.md`](PR1B_ROLES_SCOPE_CLOSURE.md)
for the full closure report.**

Summary of what changed:

- Introduced a single canonical role/scope contract module —
  [`src/constants/roleScope.js`](../../src/constants/roleScope.js) — as
  the one source of truth for role labels, required scope type, org-wide
  flags, and role-specific validation messages. Every surface that
  previously hardcoded its own role-label map or its own
  "does this role need a branch" check now imports from this module.
  Full role/scope reference: [`ROLE_SCOPE_MATRIX.md`](ROLE_SCOPE_MATRIX.md).
- Replaced the admin-entered temporary password with a server-generated,
  never-displayed password plus a forced Firebase password-reset email
  (`userService.createUser`).
- Made the User Management form role-aware: branch/district/region
  selectors are shown or hidden per role (not just disabled), and
  changing role clears whichever scope field the previous role used.
- Re-audited every operational reader of the `users` collection for
  `authStatus === 'CLAIMED'` leakage and closed two previously-unguarded
  readers (`historyService.fetchBranchPharmacists`,
  `ranking-service.fetchUserDisplayNames`) plus two role/scope dropdown
  pickers (`DistrictsPage` supervisor list, `RegionsPage` manager list).
- No Firestore rule changes — the existing territory-role `/users/{userId}`
  rules already matched the client-side guards being relabeled here.

## PR-1C — Registry, Profile Studio, Evaluation Registry & Diagnostics Cleanup

**Status: see [`PR1C_REGISTRY_PROFILE_CLOSURE.md`](PR1C_REGISTRY_PROFILE_CLOSURE.md)
for the full closure report.**

Summary of what changed:

- Removed the misleading "Core" badge/column from `KpiRegistryTable.jsx`
  and the Core/Custom distinction from `SettingsPage.jsx`'s per-user
  KPI list (shown to every user, not just admins). The `isCore` field and
  every place it drives real runtime behavior (archive/hide protection,
  target-input gating, mandatory-input in entry forms) is unchanged — see
  [`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md).
- Built [`kpiArchiveGuard.ts`](../../src/services/kpiArchiveGuard.ts) —
  archiving a KPI now runs a real dependency check (active/draft
  evaluation profiles block archive; targets/actuals/results are
  informational) instead of having no check at all.
- Split KPI registry validation warnings into Blockers vs Recommendations
  with business language instead of one flat raw-string list.
- Added an explicit "this does not activate live evaluation" banner to
  Profile Studio — it has its own, separate `profileStudioPublishPackages`
  collection and "Published" status that never touches the official
  `evaluation_profiles` collection the Evaluation Engine reads. See
  [`EVALUATION_PROFILE_LIFECYCLE.md`](EVALUATION_PROFILE_LIFECYCLE.md).
- Folded older archived Evaluation Registry profile versions out of the
  main list into an explicit, on-demand "version history" section —
  drafts and the active published version stay individually visible
  (bulk-select/duplicate-detection depend on that).
- Classified every admin diagnostics/migration surface
  ([`DIAGNOSTICS_ACCESS_MATRIX.md`](DIAGNOSTICS_ACCESS_MATRIX.md)); found
  one genuine developer-only surface (Dynamic KPI Shadow Visibility) mixed
  into normal admin navigation and gated it out of the production Sidebar
  (`devOnly` nav filter in `Sidebar.jsx`) while keeping its route
  admin-gated for defense-in-depth.
- Audited the Assistant page's capability wording — already honest
  (deterministic/grounded, no AI-provider claim) — added regression tests
  rather than changing behavior.
- Audited demo/test KPI data — `DEFAULT_KPI_REGISTRY`'s 11 entries are all
  legitimate production KPIs, none are demo/test artifacts; no cleanup
  action needed.
- No Firestore rule changes.

## PR-1D — Core Application UI Cleanup

**Status: see [`PR1D_UI_CLEANUP_CLOSURE.md`](PR1D_UI_CLEANUP_CLOSURE.md)
for the full closure report.**

Summary of what changed:

- Removed the duplicate hardcoded "Live" pill from `AppLayout.jsx`'s top
  bar — `SyncStatusIndicator` is now the single connectivity indicator.
- Replaced the bare avatar button (which only navigated to `/settings`)
  with a real `ProfileMenu` dropdown (Profile/Settings/Sign out), showing
  the canonical role label from
  [`roleScope.js`](../../src/constants/roleScope.js).
- Added `aria-label`s to icon-only header controls.
- Fixed a verified UI-state bug in `KpiEntryPage.jsx`: a blank KPI input
  was being silently written to Firestore as `0` (`Number(form[key]) || 0`).
  The registry-level sanitizer was already designed to omit unset fields
  rather than zero them; the page-level coercion defeated that. Blank
  fields are now omitted from the save payload instead — see
  [`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md).
- Added category-based grouping to KPI Entry using the registry's own
  `category` field, with an unlabeled single-group fallback (never an
  invented category).
- Replaced the plain save button with a sticky save bar exposing explicit
  unsaved/saving/saved/failed states (failed shows a retry-labeled
  button) — presentation only, the write path is unchanged.
- Humanized the Rankings branch-classification cell (`hub` → `Hub`) to
  match the existing cohort section headers — same underlying value, not
  an invented label.
- Added a global `prefers-reduced-motion` CSS override.
- Reports page was audited and found already correct from PR-1A; no
  changes were made there.
- No Firestore rule changes.

## Known limitations carried forward from PR-1D

- **No formal WCAG audit performed.** PR-1D5 added a global
  `prefers-reduced-motion` CSS override and `aria-label`s on the header's
  icon-only controls, but did not build a `useReducedMotion` JS hook,
  a focus-trap library, skip-links, or run a structured accessibility
  audit tool against the app. This is a real, disclosed gap — not a
  claim of certification.
- **No live-browser visual screenshot capture was performed in this
  section** (no browser-automation tooling was available in this
  session) — visual correctness was verified by reading the rendered
  JSX/CSS and by the focused + full regression suite, not by pixel
  screenshots at 1280/1440/1920px as the section originally called for.
  This is the principal recommended follow-up before claiming full
  visual certification.
- **Quick Actions / notification backend honesty was not rebuilt.** The
  header's notification bell and command-palette trigger were left as
  they were (already honest — they navigate/open existing real surfaces,
  they do not fabricate counts or capability); no new role-aware Quick
  Actions row was added, since no such row existed before and adding one
  would be new scope rather than cleanup.
- **Sidebar grouping/labels were not modified** — the audit found the
  existing grouping, active-state, and `devOnly` filtering (from PR-1C)
  already met PR-1D's bar; touching it risked an unrelated diff with no
  defect to fix.
- **KPI Entry pilot-tracking fields are not included in the save
  payload** (`pilotEntryFields` are rendered but never written in
  `handleSave`) — discovered while reading the file for the blank/zero
  fix. This is pre-existing behavior, not introduced or fixed by PR-1D
  (fixing it would be a save-path business-logic change beyond this
  section's UI-cleanup scope) — flagged here for a future section.

## Known limitation carried forward from PR-1C

- **No Profile Studio → Evaluation Registry compiler.** A profile authored
  in Profile Studio does not automatically become a live `EvaluationProfile`
  document — an admin must separately build the equivalent profile in the
  Evaluation Registry editor. Building a correct compiler between the two
  independently-designed schemas is a substantial mapping exercise that
  was not attempted in this section (the safe disclosure banner was added
  instead of a rushed, unsafe integration). See
  [`EVALUATION_PROFILE_LIFECYCLE.md`](EVALUATION_PROFILE_LIFECYCLE.md)
  Known Limitation for the full explanation.

## Architectural limitations carried forward

- **No "area" entity.** "Area Manager" maps onto the existing org-wide
  `general_manager` scope. See [`ROLE_SCOPE_MATRIX.md`](ROLE_SCOPE_MATRIX.md#area-manager--known-architectural-limitation).
- **No dedicated invitation infrastructure.** Account onboarding reuses
  Firebase Auth's password-reset email; there is no Cloud Functions /
  Admin SDK layer to track delivery or distinguish a failed send from an
  unopened one. See [`PR1B_ROLES_SCOPE_CLOSURE.md`](PR1B_ROLES_SCOPE_CLOSURE.md)
  Known Limitations.
- **`usePermission.js` is a separate, unused 3-role legacy permission
  hook** (`src/hooks/usePermission.js`), referenced only by older test
  files, not by any live page. It was not touched in PR-1B or PR-1C — it
  is dead code, not part of the production role/scope contract, and is
  flagged here for a future cleanup section rather than removed mid-section.

## PR-1E — Mobile Production Redesign (in progress)

PR-1E0 (mobile audit, read-only), PR-1E1 (mobile application shell &
role-aware navigation), PR-1E2 (KPI Entry mobile workflow), and PR-1E3
(Dashboard/Reports/Rankings mobile layouts) are complete. PR-1E4 onward
(admin/Data Exchange/Export mobile work, PWA/accessibility/performance
certification, device certification) are **not started**. This section
is **not** closed — see
[`PR1E_MOBILE_REDESIGN_CLOSURE.md`](PR1E_MOBILE_REDESIGN_CLOSURE.md)
for the in-progress tracker.

- [`PR1E0_MOBILE_AUDIT.md`](PR1E0_MOBILE_AUDIT.md) — read-only audit;
  confirmed no backend/permissions/route/charting blocker.
- [`PR1E1_MOBILE_SHELL_CLOSURE.md`](PR1E1_MOBILE_SHELL_CLOSURE.md) — new
  canonical mobile nav resolver (`src/config/mobileNav.js`), fixed the
  role-nav mismatch PR-1E0 flagged (district/regional/general managers no
  longer fall into a pharmacist-self-performance catch-all), wired the
  bottom nav's "More" into the pre-existing `Sidebar.jsx` drawer instead
  of building a second one, added dialog semantics/focus management/
  Escape handling to that drawer, and fixed a safe-area gap in
  `AppLayout.jsx`'s content padding.
- [`MOBILE_NAVIGATION_MATRIX.md`](MOBILE_NAVIGATION_MATRIX.md) — full
  per-role bottom-nav mapping with the route-guard reasoning behind every
  cell.
- [`PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md`](PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md) —
  collapsible registry-driven categories, registry-derived input
  semantics (`inputMode`/`step`/`min`/`max` via the existing
  `toKpiUiConfig()`), a new target/progress context
  (`resolveTargetContext()`, reusing `computeAchievementPct()`), a
  registry `maxAllowedValue` validation rule, focus-first-error,
  `ConfirmModal`-based date-change-with-unsaved-changes guard, and
  accessibility wiring — all without changing the save payload, the
  blank-versus-zero contract, or any Firestore/permission behavior.
- [`PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md`](PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md) —
  new shared `MobileRankCard.jsx` (reused 3×: Reports' Branch Comparison,
  Rankings' two cohort tables) converting raw `<table>`s to phone-width
  card lists per the locked `docs/ui3/mobile-blueprint.md` rule, a
  CSS-only `order-*` mobile reorder of Dashboard's Analytics Row
  (alerts ahead of trend/secondary insight), and a Reports mobile
  filter-summary line — all reusing already-computed data with zero
  calculation, ranking-order, or permission changes.
- [`MOBILE_PAGE_BEHAVIOR.md`](MOBILE_PAGE_BEHAVIOR.md) — per-page mobile
  workflow documentation: KPI Entry (PR-1E2), Dashboard/Reports/Rankings
  (PR-1E3).
- [`PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md`](PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md) —
  PR-1E2 Visual Refinement Addendum: redesigned KPI Entry into one
  responsive operational row template (KPI/Target/Actual/Required-
  Status, reused at every breakpoint), a daily-requirement methodology
  built entirely from two already-shipped helpers (`getDayProgress()`,
  `computeRequiredDailyPace()` — no new date or division formula), and
  a Discard Changes + Ctrl/Cmd+S footer — all on top of PR-1E2's
  unchanged save payload, validation, and target-context behavior.
- [`PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md`](PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md) —
  PR-1E Final Mobile Production Bundle, Gate 1: converted KPI Registry,
  Export Studio, Evaluation Run (basket + bulk), Audit Logs, and Data
  Exchange Studio's raw `<table>`s to phone-width cards via the shared
  `MobileRankCard` (extended with an optional `actions` footer slot);
  de-tabled Data Exchange's 2-field sheet-mapping row; fixed a genuine
  `repeat(5,1fr)` grid-compression defect in Targets and a genuine
  `overflow:hidden` clipping bug in Dynamic KPI Shadow; classified
  Targets' BulkModal, Personal Targets' allocation grid, and Import
  Center's schema preview as Desktop-preferred-with-safe-fallback rather
  than card-converting them — all reusing already-computed data with
  zero calculation, permission, or Firestore/Auth changes.
- [`PR1E5_PWA_ACCESSIBILITY_PERFORMANCE_CLOSURE.md`](PR1E5_PWA_ACCESSIBILITY_PERFORMANCE_CLOSURE.md) —
  PR-1E Final Mobile Production Bundle, Gate 2: added `env(safe-area-
  inset-top)` to the sticky topbar (the one carried-forward safe-area gap
  from PR-1E0/E1) and a mobile/tablet-only 44px touch-target floor for
  `.btn-icon`; confirmed the PWA manifest, bottom safe-area handling,
  single-source offline/connectivity indicator, mobile drawer keyboard
  behavior, and reduced-motion CSS were already correct; documented (not
  fixed) the pre-existing lack of route-level code-splitting as a known,
  separately-scoped limitation — zero Firestore/Auth changes.
- [`PR1E6_DEVICE_VISUAL_CERTIFICATION.md`](PR1E6_DEVICE_VISUAL_CERTIFICATION.md) /
  [`MOBILE_CERTIFICATION_MATRIX.md`](MOBILE_CERTIFICATION_MATRIX.md) —
  PR-1E Final Mobile Production Bundle, Gate 3 (still **not closed**):
  the Gate 3 Completion Pass added real-browser coverage for Users,
  Targets, Data Exchange Studio, Export Studio, Profile Studio,
  Evaluation Registry, Audit Logs, and Run Evaluation, giving all 7
  explicitly-critical pages phone+tablet+desktop coverage; found and
  fixed 5 more genuine layout defects (Users' table→cards conversion,
  Profile Studio's and Run Evaluation's crushed-column fixed grids, two
  raw-Firestore-ID display fallbacks) plus a navigation/permission-guard
  mismatch (branch_manager/regional_manager saw a Profile Studio/
  Assistant nav link the route guard didn't authorize for them — fixed
  by filtering the nav, not by broadening the guard); zero Firestore/
  Auth changes. A third pass, the **Final Evidence Completion Pass**,
  then closed every remaining named breakpoint (390/430/820/1024-
  landscape/1440/1920px) across all 7 critical pages, captured genuine
  modal/offline-state/RTL evidence (confirming the offline banner's
  "saved locally, will sync automatically" claim is real — backed by
  Firestore's `persistentLocalCache`, not fabricated), re-verified
  Rankings consistency live, and found/fixed 3 more real defects: an
  `AppLayout.jsx` `clamp()` ramp that left the sidebar overlapping
  `<main>` for the entire 1024–1278px range, an `index.css` rule that
  defeated `.cmd-trigger`'s own responsive Tailwind classes, and an
  app-wide accessibility gap in the shared `ConfirmModal` (no dialog
  role, no focus management, no Escape handling). It also found and
  disclosed (without fixing) a new RTL/LTR visual-mirroring gap on the
  Settings page. Remaining gap before closure: physical-device review
  and live-browser role-switch testing for non-admin roles.

## PR-1F — Login V3 (Gate 1 + Gate 2 only; in progress)

Scoped explicitly to asset preparation and a static visual shell — no
Firebase Auth, password-reset, session, redirect, route-guard, or
Firestore/Auth rule changes were made or are in scope for these two
gates.

- [`LOGIN_V3_DESIGN_LOCK.md`](LOGIN_V3_DESIGN_LOCK.md) — the official
  reference image (`design-reference/login-v3-reference.png.png`,
  1536×1024) and the measured crop boundary/focal-point analysis used
  to derive every production asset and CSS `object-position` value.
- [`PR1F_GATE1_ASSET_PREPARATION_CLOSURE.md`](PR1F_GATE1_ASSET_PREPARATION_CLOSURE.md) —
  **Closed.** Produced `public/assets/login-v3-visual-desktop.webp`
  (1106×1024, 235KB) and `login-v3-visual-mobile.webp` (820×759,
  113KB) directly from the source PNG via the browser's native Canvas
  WebP encoder (zero new image-processing dependency), with the left
  login card and its sample email fully excluded from both crops.
- [`PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md`](PR1F_GATE2_STATIC_LOGIN_SHELL_CLOSURE.md) /
  [`LOGIN_V3_RESPONSIVE_SPEC.md`](LOGIN_V3_RESPONSIVE_SPEC.md) —
  **Closed.** New `LoginVisualPanel.jsx` + `LoginPageV3.jsx`, reachable
  at the additive `/login-v3` route (production `/login` →
  `LoginPageV2.jsx` is completely untouched). Reuses `LoginPageV2`'s
  exact auth contract with zero logic changes; rebuilds the visual
  shell (image-based right panel, 24px-radius card, `calc(100vh-80px)`
  desktop height, real label/autoComplete/aria wiring, honest
  "Not yet available" biometric placeholders). Found and fixed one
  real layout defect (1920×1080 vertical overflow from a flex
  percentage-height timing issue) during breakpoint certification.
  40 new certification tests; 347/347 files and 25,314/25,314 tests
  green; zero new TypeScript errors; build passed.
- [`PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md`](PR1F_GATE3_AUTH_INTEGRATION_CLOSURE.md) /
  [`LOGIN_V3_AUTH_PARITY_MATRIX.md`](LOGIN_V3_AUTH_PARITY_MATRIX.md) /
  [`LOGIN_V3_CUTOVER_RUNBOOK.md`](LOGIN_V3_CUTOVER_RUNBOOK.md) —
  **Not closed.** `LoginPageV3` wired to the exact same `useAuthStore`
  auth contract as `LoginPageV2` — no second sign-in implementation.
  Fixed two shared `authStore.js` gaps that affect both pages
  (Arabic→English error map plus two missing codes; unhandled
  `resetPassword` errors). Found and fixed a real same-tick
  double-submit race in `LoginPageV3` via a ref-based guard (V3-only
  hardening; `LoginPageV2` untouched). Live-tested against the real
  production Firebase project using only synthetic `*.invalid`
  addresses — confirmed real network round-trips, correct English
  error mapping with no raw Firebase text, and the double-submit fix.
  44 new certification tests; 348/348 files and 25,358/25,358 tests
  green; zero new TypeScript errors; build passed. **`/login` still
  serves `LoginPageV2.jsx` in production** — the one remaining gap is
  a real account login confirmation at `/login-v3`, which only the
  user can perform (production-only Firebase project, no emulator, no
  self-registration). Cutover procedure is documented but not
  executed.
- **Not started: Gate 4 (Passkey/WebAuthn).**

## PR-1G — Production Data Reset & Final Launch Certification

**Status: Part A (read-only audit) closed. Part B (approved reset &
final certification) not started — not authorized in this phase.**

PR-1G is split into two explicitly separate parts. Only Part A ran in
this phase; Part B requires a future, separate, explicit approval and is
not addressed by this entry.

**PR-1G-A — Read-Only Launch Audit:** a code-level (no live
Firestore/Auth connection), strictly read-only audit covering repository/
environment configuration, the full Firestore collection inventory with
A/B/C/D retention classification, demo/test artifact identification,
Auth user process review, referential-integrity risk mapping, backup/
restore readiness, Firestore rules/indexes review, environment-variable
inventory, Netlify deployment review, preview/dead-code inventory, a
four-group production reset proposal (proposed only, not executed), a
dry-run tooling design (not built — no safe read-only counting tool
exists yet), a launch smoke-test plan, and a P0–P3 launch-blockers
register. See
[`PR1G_READ_ONLY_LAUNCH_AUDIT.md`](PR1G_READ_ONLY_LAUNCH_AUDIT.md) (entry
point), with detail in
[`PRODUCTION_DATA_INVENTORY.md`](PRODUCTION_DATA_INVENTORY.md),
[`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md),
[`BACKUP_RESTORE_RUNBOOK.md`](BACKUP_RESTORE_RUNBOOK.md),
[`FINAL_LAUNCH_SMOKE_TEST_MATRIX.md`](FINAL_LAUNCH_SMOKE_TEST_MATRIX.md),
[`LAUNCH_BLOCKERS_REGISTER.md`](LAUNCH_BLOCKERS_REGISTER.md), and
[`PR1G_APPROVAL_CHECKLIST.md`](PR1G_APPROVAL_CHECKLIST.md).

Headline findings: two P0s — no verified production backup/export
capability exists anywhere in the repository or tooling (this blocks any
future reset regardless of approval), and the project's `.env` (live
Firebase project config) is tracked in git with an existing remote
configured. Four P1s — no documented first-admin bootstrap procedure, a
dead-but-still-present hardcoded-credentials file
(`src/data/dummyData.js`), an unchecked `importBatchRef`-to-`import_jobs`
soft link that would become a real dangling-reference risk if import
history is ever reset, and Firestore-doc-level user "disable" not
disabling the underlying Firebase Auth account. No open/`if true`
Firestore rules were found; both existing admin bypasses (RF-0E demo
seeder, DX-6 Data Exchange import) remain narrowly scoped and
self-documented. CLAIMED-record visibility exclusion was re-confirmed
intact everywhere previously audited (PR-1B) — no regression.

**No production mutation occurred during PR-1G-A.** No Firestore write
or delete, no Auth user change, no rules/index deploy, no Netlify deploy.
The seven documents above (plus this entry) are the only changes made in
this phase.

**Not started: PR-1G-B** — any production data reset, backup execution,
test-user removal, or final go-live certification. Requires: a verified
backup, explicit per-group owner approval (currently all rows in
[`PR1G_APPROVAL_CHECKLIST.md`](PR1G_APPROVAL_CHECKLIST.md) read
"Pending"), and a separate explicit authorization to proceed.

### PR-1G-B0 — Simplified Security Fix + Backup Readiness

**Status: not closed — blocked on a Google Cloud billing prerequisite
outside this program's authority to resolve.** `.env` was found tracked
in git (3 historical commits, remote configured) and was untracked via
`git rm --cached` (local file preserved); `.gitignore` hardened;
`.env.example` completed to match all 8 real variable names.
[`SECRET_ROTATION_CHECKLIST.md`](SECRET_ROTATION_CHECKLIST.md) and
[`FIRESTORE_BACKUP_QUICK_RUNBOOK.md`](FIRESTORE_BACKUP_QUICK_RUNBOOK.md)
produced. A live backup attempt — after the owner completed
`gcloud auth login` — confirmed real project/Firestore access
(`pharmapulse-646de`, region `africa-south1`) but both the required
Cloud Storage bucket creation and the Firestore export itself were
rejected by Google Cloud with `BILLING_DISABLED`
(`gcloud billing projects describe` confirms `billingEnabled: false`).
No bucket was created, no export ran, no Firestore data was touched.
**Final status: `BACKUP PROCEDURE READY — LIVE BACKUP NOT YET
VERIFIED`** — pending the owner enabling billing on the GCP project.

## PR-1H — Final Product Stabilization & Launch Candidate

**Status: closed. Release Candidate ready** (pending the deferred items
below — most notably backup still unverified and production reset not
started, both outside this phase's authority).

A stabilization-only certification pass across the 12 production-critical
workflows (Login V2, logout/session, Dashboard, KPI Entry, Targets,
Reports, Rankings, Evaluation Engine V2, Data Exchange, Export Studio,
Users/Roles/Scopes, routing/navigation), plus a full production route
inventory and a production-hygiene sweep. No redesign, no new features,
no evaluation-methodology change, no production data reset.

**Three real, in-scope, low-risk defects were found and fixed**, each
with a regression test: (1) a real personal email
(`samir@alathirpharmacy.com`) was hardcoded as placeholder text on the
actual production `/login` page in two fields — every prior Login V3/
preview variant had already been tested against this exact string, but
the production page itself never was; (2) `historyService.js` fired 4
diagnostic `console.log` calls on every KPI entry save; (3) the KPI Entry
hint icon had no accessible name for screen readers. See
[`PR1H_BUG_REGISTER.md`](PR1H_BUG_REGISTER.md) for full detail, including
two evaluation-engine findings (missing weight redistribution for an
absent optional KPI; final score not explicitly rounded to 2 decimals)
that were **deliberately left unfixed** because both touch evaluation
methodology, which this phase's governing policy explicitly forbids
modifying — flagged for a dedicated future phase with product-owner
sign-off instead.

Full production route inventory (production / admin-only / internal
diagnostic / preview / deprecated / dead) confirmed: every existing
preview route (`/login-v3`, `/login-concept-a/b/c`,
`/login-network-preview`, `/login-vortex-preview`) remains unlinked from
production nav (verified in `Sidebar.jsx`/`MobileNav.jsx` source and live
in a running dev server), and the one internal-diagnostic route
(`/admin/dynamic-kpi-shadow`) is confirmed dead-code-eliminated from the
production bundle's nav by inspecting the actual minified build output,
independent of its existing admin-only route guard. No deprecated or
dead route was found.

Validation: test suite grew from 351→352 files (25,493→25,501 tests) with
the new regression file, full suite green at both baseline and final;
zero TypeScript errors before and after; production build succeeded
unchanged in shape. One pre-existing intermittent flake
(`phase4aCertification.test.ts`, previously observed and documented in
PR-1G-B0) did not recur in either PR-1H full-suite run.

**No production mutation occurred.** No commit, tag, or deploy was
created — `pharmapulse-rc1` is the recommended tag name, with exact
commands left for the owner to run after review. See
[`PR1H_RELEASE_CANDIDATE.md`](PR1H_RELEASE_CANDIDATE.md),
[`PR1H_BASELINE.md`](PR1H_BASELINE.md),
[`PR1H_SMOKE_TEST_MATRIX.md`](PR1H_SMOKE_TEST_MATRIX.md),
[`PR1H_BUG_REGISTER.md`](PR1H_BUG_REGISTER.md), and
[`PR1H_DEFERRED_LIMITATIONS.md`](PR1H_DEFERRED_LIMITATIONS.md).

## PR-1I — Evaluation Compliance Fix

**Status: closed — Release Candidate ready.** Dedicated, narrow-scope
phase to fix exactly the two evaluation-methodology findings PR-1H
deliberately deferred (see `PR1H_DEFERRED_LIMITATIONS.md` item 13, now
marked resolved): missing-data weight redistribution, and final score
rounding to 2 decimal places.

**Two engines, not one.** This phase's audit confirmed
`evaluationEngine.ts` (V1) is not the only production-connected scoring
implementation — `evaluationPipeline/processors.ts` (V2) is genuinely
promoted to official per-scope via `evaluationOrchestrationService.ts` +
`getActiveEngine()` (`'v1'` default, `'v2'` for limited-rollout scopes),
not merely a parallel shadow experiment. Both independently reimplemented
the identical missing-data-evaporates-silently bug and both left their
final score unrounded, so both were fixed using two new shared, pure
utilities under `src/engine/evaluationShared/`
(`weightRedistribution.ts`, `scoreRounding.ts`) — following the existing
`thresholdUtils.ts` precedent for code shared between V1 and V2.

**Rule A — weight redistribution:** `dataAvailable` (already correctly
distinguishing missing data from a real `0`) is now also the basis for
excluding a missing element's weight from its basket's aggregation
denominator and proportionally redistributing that weight across the
remaining applicable elements. A basket with zero applicable elements
safely returns `0` (the existing, already-approved no-data contract)
rather than dividing by zero or inventing a score.

**Rule B — final-score rounding:** `finalScore` and
`trace.normalizedFinalScorePct` are now rounded to exactly 2 decimal
places at the final official boundary in both engines
(`roundToTwoDecimals = Math.round((x + Number.EPSILON) * 100) / 100`).
Raw, full-precision values are preserved separately
(`trace.rawFinalScore`, `trace.rawNormalizedFinalScorePct`) so the
rounding step remains auditable. Normalization math itself is computed
from the raw, unrounded `finalScore` so precision is never degraded by
an earlier rounding step.

**Traceability extended, backward-compatibly.** New optional fields
(`ElementResult.normalizedWeight`/`exclusionReason`,
`BasketResult.applicableWeightSum`,
`CalculationTrace.rawFinalScore`/`rawNormalizedFinalScorePct`) follow the
established `normalizedFinalScorePct?`/`integrityWarnings?` pattern — no
Firestore migration, no stored-profile-format change.

**Zero downstream consumer changes required.** Every reader of
`finalScore`/`normalizedFinalScorePct` (ledger writer, ranking service,
shadow comparison, `EvaluationRunPage`, `RankingsPage`, Pharmacist
Intelligence view model) reads the field directly with no parallel
rounding logic of its own, so the fix lands transparently the moment the
engines return corrected/rounded numbers.

Validation: 31 new tests (22 V1 + 9 V2 pipeline) covering all 12
weight-redistribution and all 10 rounding cases from the governing spec,
all proven failing against the unmodified engine first, then passing
after the fix. Full suite grew from 352→354 files (25,501→25,532 tests),
100% green; only one pre-existing test required a source-text update
(a renamed local variable in a literal-string assertion, not a numeric
expectation change). Zero TypeScript errors; production build succeeded
unchanged in shape.

**No production mutation occurred.** No Firestore/Auth change, no rules
or index deploy, no commit, tag, or deploy created. See
[`PR1I_BASELINE.md`](PR1I_BASELINE.md),
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md),
[`PR1I_TEST_EVIDENCE.md`](PR1I_TEST_EVIDENCE.md), and
[`PR1I_RELEASE_DECISION.md`](PR1I_RELEASE_DECISION.md).
