# Mobile Navigation Matrix — PR-1E1

Source of truth: [`src/config/mobileNav.js`](../../src/config/mobileNav.js)
(`getMobilePrimaryNav(role)`), cross-checked against `App.jsx`'s route
guards and Sidebar's existing `NAV_CONFIG`/`resolveNav(role)` priority
order. Verified by `src/pages/admin/PR1E1_mobileShellNavigation.test.ts`.

## Primary bottom-nav destinations (max 4 + More)

| Role | 1 | 2 | 3 | 4 | More |
|---|---|---|---|---|---|
| `pharmacist` | Home `/dashboard` | KPI Entry `/entry` | Performance `/performance` | My Intelligence `/my-intelligence` | ✓ |
| `manager` (legacy alias) | Home | KPI Entry | Team `/team` | Executive BI `/executive` | ✓ |
| `branch_manager` | Home | KPI Entry | Team | Executive BI | ✓ |
| `district_supervisor` | Home | Reports `/reports` | Team | Executive BI | ✓ |
| `regional_manager` | Home | Reports | Team | Executive BI | ✓ |
| `general_manager` | Home | Reports | Team | Executive BI | ✓ |
| `admin` | Home | Reports | Rankings `/admin/rankings` | Executive BI | ✓ |

`manager` and `branch_manager` resolve to byte-identical arrays
(`getMobilePrimaryNav('manager')` === `getMobilePrimaryNav('branch_manager')`)
via `getCanonicalRoleValue()` (PR-1B) — no second copy of the route list,
no renamed persisted role value. `regional_manager` is also a literal
alias of `district_supervisor`'s array, matching how `Sidebar.jsx`
already treats the two roles identically.

## Why each cell is what it is (route-guard-grounded, not invented)

- **Rankings (`/admin/rankings`) is `ADMIN`-only in `App.jsx`.** No other
  role can reach it at all — not a UI choice, a route guard. The spec's
  suggested baseline offered Rankings to every role; the route audit
  overrides that suggestion per the spec's own instruction ("use the
  route audit as the source of truth"). Every non-admin role gets
  Executive BI in that slot instead — a real, already-guarded
  (`EXEC_ROLES`) destination ranked just below Team/Reports in each
  role's own `Sidebar.jsx` `NAV_CONFIG`.
- **KPI Entry (`/entry`) is route-guard-open to all 7 roles, but only
  surfaced for `pharmacist`/`manager`/`branch_manager`.** Those are the
  only roles with a "My Work" group in `Sidebar.jsx` — i.e. the only
  roles whose job includes entering their own KPI data. Showing it to
  district/regional/general managers or admin would be technically
  reachable but not meaningful, so it is intentionally omitted for them.
- **Performance (`/performance`) is route-guard-open to all 7 roles, but
  only surfaced for `pharmacist`.** It is `PharmacistPerformancePage` — a
  self-view scoped to the logged-in user's own KPI history. This is the
  exact defect PR-1E0 flagged in the old `MobileNav.jsx` (district/
  regional/general managers fell into a catch-all that pointed here).
  Fixed by removing the catch-all entirely — every role now has an
  explicit array.
- **Team (`/team`) is `MGR_UP`-guarded** (admin, manager, branch_manager,
  district_supervisor, regional_manager, general_manager). Offered to
  every `MGR_UP` role except admin, because admin's own `Sidebar.jsx`
  `NAV_CONFIG` does not include Team at all (admin oversees via
  Executive BI/Rankings, not the Team Intelligence surface) — admin gets
  Rankings in that slot instead.
- **Reports (`/reports`) is `MGR_UP`-guarded** — offered to every
  `MGR_UP` role. Not offered to pharmacist (no `/reports` access exists
  for pharmacist in `App.jsx` at all).
- **"Operations/Portfolio/Branches" (district_supervisor / regional_manager
  / general_manager / admin's spec-suggested 4th slot) has no
  corresponding static route.** `/branch/:branchId/intelligence` requires
  a `branchId` param and cannot be a fixed nav target without first
  picking a branch, so it was not used. Executive BI was used instead —
  a real, valid, already-authorized route — rather than inventing a
  `/operations` page or dropping to 4 total items unnecessarily.

## More drawer

The bottom nav's "More" button does not navigate anywhere — it opens the
*existing* `Sidebar.jsx` mobile drawer (the same component instance
already used by the topbar hamburger), via state lifted to
`AppLayout.jsx` (`mobileOpen` / `openMobileDrawer` / `closeMobileDrawer`).
There is no second drawer and no duplicated route list: the drawer still
resolves `resolveNav(role)` from `Sidebar.jsx`'s own `NAV_CONFIG`, which
already:
- groups destinations (Intelligence Operations / Data Architecture /
  Actions/Work / Platform)
- excludes `devOnly` items in production builds (PR-1C, unchanged)
- includes Settings and Sign Out
- is fully role-aware, including the same alias behavior described above

## Active-state behavior

`MobileNav.jsx`'s `isActive(path, exact)` marks exactly one primary item
`aria-current="page"` based on `location.pathname` (exact match for
`/dashboard`, prefix match for the rest — same pattern `Sidebar.jsx`
already used). The "More" trigger itself receives `aria-current="page"`
while the drawer is open, satisfying "More may show an active indicator
when the current route lives inside the drawer" without inventing a
second concept of "this route is inside the drawer" — opening the drawer
*is* the only state being tracked, which is sufficient since the primary
items already cover every route that isn't drawer-only.

## Known, intentional deviations from the spec's illustrative example

The spec's per-role example lists were explicitly marked as a
"recommended baseline," subordinate to the real route audit. The
deviations above (Rankings, Performance, KPI Entry, the 4th "Operations"
slot) are all cases where the route audit overrode the example, per the
spec's own instruction to do so.
