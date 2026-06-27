# PR-1E1 — Mobile Application Shell & Role-Aware Navigation — Closure Report

## Scope completed

PR-1E1 only. PR-1E2 (KPI Entry mobile workflow), PR-1E3 (Dashboard/
Reports/Rankings mobile layouts), PR-1E4 (admin/Data Exchange/Export
mobile work), PR-1E5 (PWA/accessibility/performance certification),
PR-1F (Login V3), PR-1G (Production Data Reset), and any backend/
permissions redesign were **not started**.

## Audit confirmation

PR-1E0's audit ([`PR1E0_MOBILE_AUDIT.md`](PR1E0_MOBILE_AUDIT.md)) and a
fresh route-guard read of `App.jsx`, `Sidebar.jsx`'s `NAV_CONFIG`, and
`src/constants/roleScope.js` confirmed the reported defect:
`MobileNav.jsx` branched only on `role === 'admin'`, `role === 'manager'`,
and an implicit catch-all, so `district_supervisor`, `regional_manager`,
and `general_manager` fell into the catch-all and received a
"Performance" tab pointing at `/performance`
(`PharmacistPerformancePage` — a self-scoped, individual KPI-history
view with no meaning for those roles).

**No permissions inconsistency requiring an authorization-logic change
was found.** Every route used below already has the correct role guard
in `App.jsx`; this section only changed which of a role's *already-
authorized* routes are surfaced on the bottom nav. No stop condition was
triggered.

## Canonical navigation model

New module: [`src/config/mobileNav.js`](../../src/config/mobileNav.js).
Single source of truth for primary bottom-nav items — `Sidebar.jsx`'s
`NAV_CONFIG`/`resolveNav(role)` is untouched and remains the single
source of truth for the "More" drawer. No route list is duplicated
between the two; the bottom nav promotes a subset of each role's
already-existing, already-guarded routes, using `Sidebar.jsx`'s own
group ordering as the signal for which routes are high-frequency for
that role.

`getMobilePrimaryNav(role)` resolves the legacy `'manager'` alias to the
exact same array as `'branch_manager'` via `getCanonicalRoleValue()`
(PR-1B) — no new internal role value, no renamed persisted value, no
second array to keep in sync.

## Role matrix

See [`MOBILE_NAVIGATION_MATRIX.md`](MOBILE_NAVIGATION_MATRIX.md) for the
full per-role mapping and the route-guard reasoning behind every cell,
including the three places the spec's illustrative example was
overridden by the real route audit (Rankings is admin-only; KPI Entry
and Performance are only meaningful for roles with a "My Work"/self-view
context in `Sidebar.jsx`).

## More drawer behavior

The bottom nav's "More" button does not navigate to a fake route — it
calls `onOpenMore`, a callback lifted from `AppLayout.jsx`
(`openMobileDrawer(moreTriggerRef)`) that opens the exact same
`Sidebar.jsx` mobile drawer the topbar hamburger already used. No second
drawer component exists. Changes made to the drawer itself:
- Added `id="mobile-more-drawer"`, `role="dialog"`, `aria-modal="true"`,
  `aria-label="More navigation"`.
- Added an `Escape` key handler that calls the same `onClose` the
  backdrop-click and X button already used.
- On open, focus moves to the drawer's close button
  (`closeButtonRef.current?.focus()`).
- On close, focus returns to whichever trigger opened it (hamburger or
  More) via a new `lastTriggerRef` in `AppLayout.jsx`.
- Drawer content (`resolveNav(role)`, `devOnly` filtering, grouping,
  Settings, Sign Out) is **unchanged** — same component, same logic.

## Active-state behavior

`MobileNav.jsx`'s `isActive(path, exact)` mirrors `Sidebar.jsx`'s
existing exact/prefix matching. Exactly one primary item (or the More
trigger, while the drawer is open) carries `aria-current="page"` at any
time — there is no code path that can mark two items active
simultaneously, since `items.map` and the More button are evaluated
independently from the same single `location.pathname` read per render.
Browser back/forward updates active state automatically because it is
derived from `useLocation()`, not from local click-tracked state.

## Safe-area and overlap behavior

- `AppLayout.jsx`'s `<main>` `paddingBottom` was
  `calc(1.5rem + var(--mobile-nav-h))`, which under-counted the bottom
  nav's actual rendered height on notched devices (`.mobile-nav` itself
  already grows by `env(safe-area-inset-bottom)`). Fixed to
  `calc(1.5rem + var(--mobile-nav-h) + env(safe-area-inset-bottom))` —
  this is not double-counting: it is the single place that accounts for
  the nav's *total* on-screen height, which the nav itself does not
  reserve layout space for (it is `position: fixed`).
- The Sidebar drawer now also pads its bottom by
  `env(safe-area-inset-bottom)` so Sign Out / the last nav group isn't
  flush against a notched device's home indicator.
- KPI Entry's sticky save bar (`.sticky-save-bar`, fixed in PR-1E0) is
  unaffected and still re-verified by this section's regression tests.
- The FAB pattern (`.mobile-fab`, a center button that always navigated
  to `/entry` regardless of role) was removed along with its dead CSS —
  it was the root mechanism that ignored role relevance; the bottom nav
  is now five equal-width buttons (`flex: 1`, `min-height: 44px`) with no
  special-cased center element.

## Accessibility

- `<nav aria-label="Primary mobile navigation">` — semantic landmark.
- Every item renders visible text (`<span>{item.label}</span>`), never
  icon-only.
- Active item: `aria-current="page"`.
- More trigger: `aria-haspopup="dialog"`, `aria-expanded={moreOpen}`,
  `aria-controls="mobile-more-drawer"`.
- Drawer: `role="dialog"`, `aria-modal="true"`, `aria-label`, Escape-to-
  close, focus-in on open, focus-restore on close.
- Touch targets: `.mobile-nav-item` now has `min-height: 44px` and
  `flex: 1` (even width distribution across however many items render).
- `prefers-reduced-motion` (PR-1D5) is untouched — no new transition/
  animation was added.
- **Not claimed**: formal WCAG certification. This is targeted
  accessibility coverage for the shell's new interactive elements, not a
  structured audit.

## Files changed

**New:**
- `src/config/mobileNav.js` — canonical mobile nav resolver
- `src/pages/admin/PR1E1_mobileShellNavigation.test.ts` — 44 focused tests
- `docs/production/PR1E1_MOBILE_SHELL_CLOSURE.md` (this file)
- `docs/production/MOBILE_NAVIGATION_MATRIX.md`
- `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md` (in-progress tracker)
- `docs/production/PR1E0_MOBILE_AUDIT.md` (created in the PR-1E0 step,
  listed here for completeness)

**Modified:**
- `src/components/layout/MobileNav.jsx` — rewritten to consume
  `getMobilePrimaryNav(role)`; removed the 3-branch role check and the
  FAB; added the More trigger with full accessibility wiring.
- `src/components/layout/Sidebar.jsx` — drawer dialog semantics, Escape
  handler, focus-in/close-button ref, safe-area bottom padding. Desktop
  `<aside className="hidden lg:flex ...">` and `NAV_CONFIG`/`resolveNav`
  are unchanged.
- `src/components/layout/AppLayout.jsx` — lifted `openMobileDrawer`/
  `closeMobileDrawer`/`lastTriggerRef` so the hamburger and the new More
  button share one drawer-open state; hamburger gained
  `aria-haspopup`/`aria-expanded`/`aria-controls`; `<main>` bottom
  padding now includes `env(safe-area-inset-bottom)`; `MobileNav` now
  receives `onOpenMore`/`moreOpen`/`moreTriggerRef`.
- `src/index.css` — `.mobile-nav-item` gained `flex: 1; min-height: 44px`
  and lost its fixed horizontal padding tuned for the old 2+FAB+2 layout;
  `.mobile-fab` removed (dead code, no longer rendered by anything).
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — new PR-1E
  (in progress) section added.

## Tests

- **Focused PR-1E1 tests**: 44/44 passing
  (`PR1E1_mobileShellNavigation.test.ts`)
- **PR-1A/1B/1C/1D + roleScope regression** (9 files run directly):
  902/902 passing — `PR1D_uiCleanup.test.ts`,
  `uiFoundation.certification.test.ts`,
  `RankingsPage.pr1aCorrectness.test.ts`,
  `ReportsPage.pr1aCorrectness.test.ts`, `debugUidMasking.pr1a.test.ts`,
  `UsersPage.pr1bRoleScope.test.ts`, `claimedRecertification.pr1b.test.ts`,
  `PR1C_registryProfileDiagnostics.test.ts`, `roleScope.test.ts`
- **Full suite**: 338/338 test files, 25,057/25,057 tests passing (up
  from PR-1D's 337 files / 25,013 tests — net +1 file, all additive)

## TypeScript

- Baseline (PR-1D/PR-1E0 close): single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only the same pre-existing chunk-size and
ineffective-dynamic-import warnings present before this section started.

## Firestore / Auth changes

**None.** Every change in this section is presentation/navigation-only
(a new client-side config module, JSX/CSS edits to the mobile shell). No
Firestore rule, index, or schema change; no Auth change.

## Documentation created

- `docs/production/PR1E1_MOBILE_SHELL_CLOSURE.md` (this file)
- `docs/production/MOBILE_NAVIGATION_MATRIX.md`
- `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md` (in-progress tracker,
  not a final closure document)
- Updated `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

PR-1A/PR-1B/PR-1C/PR-1D closure evidence was not overwritten.

## Known limitations

- **Top-bar safe-area (`env(safe-area-inset-top)`) is not yet handled.**
  PR-1E0 flagged this as a real PR-1E5 item (notch/Dynamic-Island
  devices); not in scope for the shell/navigation work done here.
- **No live-browser or device screenshot certification was performed**
  for this section — verification was done via the focused/full test
  suite, TypeScript check, and production build, consistent with how
  PR-1D's equivalent limitation was disclosed. Visual/device
  certification is explicitly deferred to PR-1E6.
- **Team page route for organization-wide roles (`general_manager`,
  `admin`-adjacent territory roles) relies on the existing scope
  resolver to handle a missing branch context** — this was verified by
  reading `TeamPage.jsx`'s existing branch-selector logic for
  `district_supervisor`/`regional_manager`, not by interactively testing
  the page on a mobile device in this session.
- This section does not redesign any page content (Dashboard, Reports,
  Rankings, KPI Entry's input layout, admin tables) — those remain
  PR-1E2/E3/E4 scope, deliberately untouched here.

## Final decision

PR-1E1 MOBILE SHELL & NAVIGATION FORMALLY CLOSED
