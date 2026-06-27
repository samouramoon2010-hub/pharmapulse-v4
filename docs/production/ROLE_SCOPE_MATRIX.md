# Role / Scope Matrix — Canonical Reference

Single source of truth for every internal role value, its production
label, its required scope assignment, and backward-compatibility status.
The runtime contract lives in [`src/constants/roleScope.js`](../../src/constants/roleScope.js) —
this document describes that module; it does not duplicate its logic.

## Roles

| Internal value         | Production label         | Level | Required scope | Org-wide | Notes |
|-------------------------|---------------------------|:-----:|-----------------|:--------:|-------|
| `admin`                 | Admin                     | 100   | none             | yes      | Full access. No branch/scope field used or required. |
| `general_manager`       | General Manager           | 90    | none             | yes      | Org-wide read scope (see "Area Manager" below). No `pharmacyId`. |
| `regional_manager`      | Regional Manager          | 70    | region           | no       | Requires `regionIds[]` (UI exposes a single-select; engine supports multiple). Branch not required. |
| `district_supervisor`   | District Supervisor       | 60    | district         | no       | Requires `districtId`. Branch not required. |
| `branch_manager`        | Branch Manager            | 40    | branch           | no       | Requires `pharmacyId`. |
| `manager`                | Branch Manager (alias)    | 40    | branch           | no       | **Legacy alias** for `branch_manager` — see Backward Compatibility below. Hidden from the New User role picker. |
| `pharmacist`             | Pharmacist                 | 10    | branch           | no       | Requires `pharmacyId`. |

"Level" is authority ordering only (used for hierarchy comparisons); it is
not a persisted field and carries no scope meaning by itself.

## Area Manager — known architectural limitation

**There is no distinct "Area Manager" role or "area" entity anywhere in
this codebase.** Firestore has no `areas` collection, and `scopeResolver.ts`
has no concept of an area-level scope. "Area Manager / General Manager" in
the product brief maps onto the single existing `general_manager` role,
whose scope is organization-wide (`{ type: 'all' }`, the same scope `admin`
resolves to). This is documented here rather than invented around, per the
explicit instruction not to create a new hierarchy where the architecture
doesn't support one. If a true area-level entity (narrower than
organization-wide, broader than a region) is needed in the future, that is
new scope infrastructure and out of scope for this section.

## Required scope by role

| Role                  | `pharmacyId` | `districtId` | `regionIds[]` | Resolved scope (scopeResolver.ts) |
|------------------------|:---:|:---:|:---:|---|
| `admin`                | —   | —   | —   | `{ type: 'all' }` |
| `general_manager`      | —   | —   | —   | `{ type: 'all' }` |
| `regional_manager`     | —   | —   | required | `{ type: 'list', ids: [...district pharmacies in region] }` |
| `district_supervisor`  | —   | required | —   | `{ type: 'list', ids: [...pharmacies in district] }` |
| `branch_manager` / `manager` | required | —   | —   | `{ type: 'single', id: pharmacyId }` |
| `pharmacist`           | required | —   | —   | `{ type: 'single', id: pharmacyId }` |

A missing required scope assignment resolves to an explicit empty/error
state (`{ type: 'none' }` or an "Access denied" UI state) — never a
first-branch fallback, never the actor's own `pharmacyId` borrowed for a
higher role, never a broadened "show everything" fallback.

## Backward compatibility

- `manager` is a long-standing internal value that predates the
  `branch_manager` value. **It is never renamed in Firestore.** It is
  labeled identically to `branch_manager` ("Branch Manager") everywhere in
  the UI, resolves to the same `branch` scope requirement, and is grouped
  with `branch_manager` for stats/filtering via
  `getCanonicalRoleValue('manager') === 'branch_manager'`.
- `manager` is excluded from `CREATABLE_ROLES` (the New User role picker)
  so new users are always created with the `branch_manager` value going
  forward — existing `manager` documents are untouched and keep working
  unchanged in every reader (scopeResolver, Firestore rules, route guards,
  this matrix).
- No mass migration of persisted role values was performed or is planned
  in this section.

## User-creation behavior

- Admin enters name, email, employee ID, role, and the scope field that
  role requires (branch / district / region / none).
- Fields for scopes the selected role does not use are hidden, not merely
  disabled — switching role clears any previously-entered
  `pharmacyId`/`districtId`/`regionId` so a stale value can never be
  submitted alongside the new role's scope.
- No password field exists in the form. The account is created with an
  internally generated, never-displayed, never-logged password
  (`userService.generateSecurePassword()`), and a Firebase
  `sendPasswordResetEmail` is sent immediately so the user sets their own
  password. The admin never knows or transmits the real password.

## Invitation limitations

- The invitation mechanism is Firebase Auth's built-in password-reset
  email (`sendPasswordResetEmail`), not a dedicated "invite" template or
  flow. There is no Cloud Functions / Admin SDK infrastructure in this
  codebase to send a custom invitation email, track delivery, or
  distinguish "invitation failed to send" from "invitation sent but
  unopened" — `sendPasswordResetEmail` failures are swallowed
  (`.catch(() => {})`) so account creation cannot fail because of an email
  delivery issue, but there is currently no UI surfacing of a failed send.
  This is a known limitation, not a silently faked capability — see
  [`PR1B_ROLES_SCOPE_CLOSURE.md`](PR1B_ROLES_SCOPE_CLOSURE.md) Known
  Limitations.
- "Invitation Failed" as a distinct, persisted identity state does not
  exist for this reason — it is not displayed because the backend cannot
  currently detect it.

## Identity states (derived, not persisted)

| State | Derived from |
|---|---|
| Active | `active !== false` and `lastLoginAt` is set |
| Pending Invitation | `active !== false` and `lastLoginAt` is unset |
| Inactive | `active === false` or `status === 'inactive'` |
| Claimed / Migrated Audit Record | `authStatus === 'CLAIMED'` — audit-only, never an operational row |

No new field was added to support these states — they are computed from
fields the schema already has (`active`, `lastLoginAt`, `authStatus`).
"Suspended" is not listed separately because the architecture has only one
boolean inactive state (`active: false`), surfaced as "Inactive" with a
Suspend/Activate toggle action — there is no second, distinct suspended
state to expose.

## CLAIMED-record behavior

A `CLAIMED` user document (`authStatus: 'CLAIMED'`) is a soft-archived,
pre-activation pending-onboarding record, superseded by a real Auth-linked
user document the moment a pharmacist claims their account (see
`pharmacistActivationService.ts`). It:

- is **never deleted** — `claimedByUid` and `claimedAt` remain on it
  permanently for audit/history purposes;
- is **excluded from every operational reader** in this codebase (Users
  list, pharmacist selectors, branch/district/region role pickers, KPI
  Entry rosters, rankings, history snapshots, executive reports, export
  datasets) — see [`PR1B_ROLES_SCOPE_CLOSURE.md`](PR1B_ROLES_SCOPE_CLOSURE.md)
  for the full recertification list;
- remains fully queryable for audit purposes (it is a normal Firestore
  document, just excluded by an explicit `authStatus !== 'CLAIMED'` filter
  in operational queries).

## Security model

- No plaintext password is ever stored, logged, returned to a caller, or
  rendered in any UI.
- Account creation always goes through `createFirebaseAuthUser()` (the
  existing Identity Toolkit REST path) followed by a Firestore profile
  write — unchanged from the pre-existing architecture.
- Firestore security rules for `/users/{userId}` were not modified in
  this section — the existing territory-role `affectedKeys().hasOnly([...])`
  restrictions already match what `userService.js` enforces client-side.
