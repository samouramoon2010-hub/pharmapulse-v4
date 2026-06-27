# PR-1B — Roles, Scopes & Identity Cleanup — Closure Report

## Scope completed

PR-1B Roles, Scopes, and Identity Cleanup, as specified. PR-1C and all
later sections were not started. No mobile redesign, Login V3 work,
Profile Studio cleanup, KPI Registry cleanup, or production data reset
was performed.

## Role mapping

Canonical contract: [`src/constants/roleScope.js`](../../src/constants/roleScope.js).
Full table: [`ROLE_SCOPE_MATRIX.md`](ROLE_SCOPE_MATRIX.md).

| Internal value | Production label | Compatibility |
|---|---|---|
| `admin` | Admin | — |
| `general_manager` | General Manager | — |
| `regional_manager` | Regional Manager | — |
| `district_supervisor` | District Supervisor | — |
| `branch_manager` | Branch Manager | — |
| `manager` | Branch Manager | **Legacy alias**, never renamed in Firestore, hidden from the New User role picker, grouped with `branch_manager` for stats/filtering |
| `pharmacist` | Pharmacist | — |

No persisted role value was migrated or renamed. "Manager (legacy)" /
"legacy manager" wording was removed from every production surface
(Sidebar, AppLayout, UsersPage) and replaced by `getRoleLabel()`.

## Scope behavior

| Scope type | Roles | Behavior |
|---|---|---|
| Branch | `pharmacist`, `branch_manager`, `manager` | Requires `pharmacyId`. Branch selector shown, required. |
| District | `district_supervisor` | Requires `districtId`. District selector shown, required; branch not required. |
| Region | `regional_manager` | Requires `regionIds[0]` (UI single-select; engine field supports an array). Region selector shown, required; branch not required. |
| Organization-wide | `admin`, `general_manager` | No scope field shown or required; no fake `pharmacyId` written. |

Higher-level roles (district supervisor, regional manager, general
manager, admin) no longer require or accept a branch assignment in the
New/Edit User form. Scope resolution for all roles continues to flow
exclusively through `scopeResolver.ts` / `useScopeProfile` — no new ad
hoc scope checks were added, and the pre-existing territory-role guard
logic in `userService.js` (create/edit/toggle/transfer/promote) was left
unchanged because it already matched this contract.

## User management

- **Dynamic fields**: the New/Edit User form renders exactly one of
  Branch / District / Region selector based on
  `getRequiredScopeType(form.role)`. Selecting a different role clears
  `pharmacyId`, `districtId`, and `regionId` together (`setRole()` in
  `UsersPage.jsx`), so a stale value from the previous role can never be
  submitted alongside the new role's scope.
- **Validation**: role-aware, via `getScopeRequiredMessage(role)` —
  produces messages like "Select a branch for this pharmacist.",
  "Select a district for this district supervisor.", "Select a region for
  this regional manager." No internal field name (`pharmacyId`,
  `districtId`, `regionId`) is ever shown to the user.
- **Password/invitation**: the New User form has no password field at
  all. `userService.createUser()` generates a random, never-displayed,
  never-logged password via `crypto.getRandomValues`, creates the Firebase
  Auth account with it, and immediately calls `sendPasswordResetEmail` so
  the real user sets their own password. The success screen tells the
  admin an invitation email was sent and explicitly states the admin never
  sees or sets the password — no plaintext password appears anywhere in
  the UI, logs, or Firestore.

## CLAIMED protection

Re-audited every operational reader of the `users` collection found via
`grep -rl COL.USERS`. Two previously-unguarded readers were found and
fixed in this section (the rest were already correct, certified in the
earlier Data Exchange closure bundle):

| Reader | Status |
|---|---|
| `userService.getUsersByPharmacy` | Already excluded CLAIMED (DX bundle) |
| `historyService.fetchBranchPharmacists` | **Fixed this section** — risk-snapshot missing-submission detection + ranking history roster |
| `ranking-service.fetchUserDisplayNames` | **Fixed this section** — rankings display-name enrichment map |
| `DistrictsPage` supervisor dropdown | **Fixed this section** — district→supervisor assignment picker |
| `RegionsPage` manager dropdown | **Fixed this section** — region→manager assignment picker |
| `UsersPage` active list | Already excluded CLAIMED (Closure Patch Part 2) |
| `territoryBackfill.ts` / `territoryValidation.ts` | Already excluded CLAIMED (DX bundle, certified in `claimedVisibility.test.ts`) |
| Data Exchange onboarding readers (`fetchExistingOnboardingData.ts`, `pharmacistsAdapter.ts`) | Already excluded CLAIMED (DX bundle) |

CLAIMED documents are never deleted; `claimedByUid`/`claimedAt` remain
intact and the record stays fully readable for audit purposes — only
operational rosters/selectors exclude it.

## Security

- No admin-entered or admin-visible password at any point.
- No plaintext password stored, logged, exported, or rendered.
- No Firebase Auth security setting weakened.
- No new backend infrastructure introduced.
- Firestore security rules were **not modified** in this section (see
  below).

## Files changed

**New:**
- `src/constants/roleScope.js`
- `src/constants/roleScope.test.ts`
- `src/pages/admin/UsersPage.pr1bRoleScope.test.ts`
- `src/services/claimedRecertification.pr1b.test.ts`
- `docs/production/PR1B_ROLES_SCOPE_CLOSURE.md`
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`
- `docs/production/ROLE_SCOPE_MATRIX.md`

**Modified:**
- `src/pages/admin/UsersPage.jsx` — canonical role/scope import, dynamic
  district/region selectors, role-aware validation, role-change scope
  clearing, canonical stats-strip role chips with legacy-alias grouping
- `src/services/userService.js` — secure auto-generated password +
  forced reset email, removed admin-entered password path
- `src/components/layout/Sidebar.jsx` — removed local incomplete
  `ROLE_LABELS` map, now uses `getRoleLabel()`
- `src/components/layout/AppLayout.jsx` — removed dead unused
  `ROLE_LABELS` constant
- `src/services/historyService.js` — CLAIMED exclusion in
  `fetchBranchPharmacists`
- `src/ranking/ranking-service.ts` — CLAIMED exclusion in
  `fetchUserDisplayNames`
- `src/pages/admin/DistrictsPage.tsx` — CLAIMED exclusion in supervisor
  dropdown
- `src/pages/admin/RegionsPage.tsx` — CLAIMED exclusion in manager
  dropdown
- `src/design/loginV3ReactGlassPanelRefinement.test.ts`,
  `src/pages/admin/phase3a1c1.test.ts`, `src/pages/admin/phase3a1c2.test.ts`
  — updated stale source-string/window assertions that referenced the
  pre-PR-1B `ROLE_LABELS` map and `needsPharmacy` field (no behavioral
  change; these were assertion-only updates required because the
  underlying source they pattern-match against changed)

## Tests

- **Focused PR-1B tests**: 27/27 passing across 3 new test files
  (`roleScope.test.ts`: 12, `UsersPage.pr1bRoleScope.test.ts`: 11,
  `claimedRecertification.pr1b.test.ts`: 4)
- **Full suite**: 334/334 test files, 24,967/24,967 tests passing
  (up from PR-1A's 331 files / 24,940 tests — net +3 files / +27 tests,
  all additive)
- PR-1A regression: all PR-1A-specific test files remain green
- Data Exchange / Export Studio regression: all DX/Export Studio test
  files remain green
- Route guards, Firestore rules tests, login/activation-claim flow,
  rankings/reports: all green (unchanged, part of the 334-file full run)

## TypeScript

- Baseline (PR-1A): 2,127
- Final: same single pre-existing `TS5101` config deprecation notice
  (`tsconfig.json` `baseUrl` option, unrelated to this section, present
  before PR-1B started)
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only pre-existing chunk-size and
ineffective-dynamic-import warnings (unrelated to this section, present
before PR-1B started).

## Firestore/Auth changes

**None.** The existing `/users/{userId}` territory-role rules
(`affectedKeys().hasOnly([...])`-restricted create/read/toggle/transfer/
promote permissions) already matched what `userService.js` enforces
client-side and needed no change for this section's scope. Firestore
rule and index files showed as modified in `git status` at the start of
this session belong to prior, separate work (DX-10/Export Studio) and
were not touched during PR-1B.

## Documentation created

- `docs/production/PR1B_ROLES_SCOPE_CLOSURE.md` (this file)
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`
- `docs/production/ROLE_SCOPE_MATRIX.md`

PR-1A closure evidence was not overwritten — it is preserved as a
separate section in `PRODUCTION_READINESS_ARCHITECTURE.md`.

## Known limitations

- **No area-level entity.** "Area Manager" is not a distinct role or
  scope in this codebase; it maps onto `general_manager`'s existing
  org-wide scope. Documented rather than invented around — see
  `ROLE_SCOPE_MATRIX.md`.
- **No dedicated invitation infrastructure.** Onboarding reuses Firebase
  Auth's password-reset email. There is no Cloud Functions / Admin SDK
  layer to track delivery, retry a failed send, or distinguish "failed to
  send" from "sent but unopened" — `sendPasswordResetEmail` failures are
  swallowed so account creation itself cannot fail, but there is
  currently no "Invitation Failed" UI state because the backend cannot
  detect that condition. Building that capability would require new
  backend infrastructure, which is explicitly out of scope for this
  section per the bundle's Firestore/Auth change-control instruction.
- **`usePermission.js`** is a separate, already-dead 3-role legacy
  permission hook, unused by any live page (referenced only by older test
  files). Left untouched — it is not part of the role/scope contract this
  section closes, and removing dead code is outside this section's scope.
- **Regional Manager UI exposes a single region per user**, even though
  the underlying `regionIds[]` field and `scopeResolver.ts` support
  multiple regions per user. This matches the existing data model; the
  form was not extended to multi-select since no requirement called for
  it.

## Final decision

PR-1B ROLES, SCOPES & IDENTITY FORMALLY CLOSED
