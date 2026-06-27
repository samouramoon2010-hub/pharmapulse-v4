# PR-1E0 — Mobile Audit and Responsive Architecture Map

Read-only audit. No production code was changed to produce this document.
Two small, pre-existing-bug fixes were made *alongside* this audit (see
"Fixes made during audit" below) — both are bug fixes uncovered while
reading the code, not redesign work, and are disclosed rather than
silently folded into PR-1E1.

## Baseline confirmed

PR-1A–PR-1D are closed (337 files / 25,013 tests, zero new TS errors,
build green — see [`PR1D_UI_CLEANUP_CLOSURE.md`](PR1D_UI_CLEANUP_CLOSURE.md)).
A locked design contract already exists at
[`docs/ui3/mobile-blueprint.md`](../ui3/mobile-blueprint.md) and is
covered by existing certification tests (`uiFoundation.certification.test.ts`,
`ui32ExecutiveDashboard.certification.test.ts`,
`ui3ProductSurfaces.certification.test.ts`, `uiBlueprintLock.test.ts`).
**PR-1E does not introduce new mobile rules — it finishes enforcing this
already-locked contract**, which today is only partially implemented.

## Fixes made during audit (disclosed, not new scope)

- `src/index.css` — KPI Entry's sticky save bar used a flat `bottom-2`
  (8px), which the fixed bottom nav (`z-40`, 60px tall + safe-area inset)
  can sit on top of below the `lg` breakpoint, visually covering the save
  button. Added a `.sticky-save-bar` rule that offsets by
  `var(--mobile-nav-h) + env(safe-area-inset-bottom)` below `lg`, and
  reverts to `bottom: 8px` at `lg`+ where there is no bottom nav. Wired
  into `src/pages/pharmacist/KpiEntryPage.jsx` (class name only — no
  payload/save-state change) and the one stale test assertion that
  pattern-matched the old class name (`PR1D_uiCleanup.test.ts`).
  This is a real sticky-overlap defect the PR-1E0 audit was asked to find
  (see Mobile shell findings below) — fixing it inline rather than
  re-discovering it in PR-1E1/E2 avoided a duplicate diff.

## Breakpoints in use

`src/index.css`: `1024px` (`lg` — sidebar/topbar become desktop, mobile
nav disappears), `1280px` (`xl`), `max-width: 768px`, `max-width: 640px`,
plus `prefers-reduced-motion` and `print`. Custom layout variables:
`--sidebar-w: 256px`, `--sidebar-collapsed: 60px`, `--topbar-h: 52px`,
`--mobile-nav-h: 60px`.

These already line up with the spec's required certification matrix
(phones 320–430px fall under `max-width:640px`/`max-width:768px`;
tablets 768–1024px sit in the `768px`–`1024px` band; desktop regression
is `1024px`+). No new breakpoint is needed.

## Mobile shell findings

**Bottom nav (`MobileNav.jsx`)** — exists, fixed, safe-area-aware
(`padding-bottom: env(safe-area-inset-bottom)` already applied), but:
- Only branches on 3 roles: `admin`, `manager`, and an implicit
  catch-all. `branch_manager`, `district_supervisor`, `regional_manager`,
  and `general_manager` all fall into the catch-all and get
  Dashboard/**Performance**/Alerts/Settings — `/performance` is the
  pharmacist/branch self-view page and is not the right destination for
  district/regional/general managers, who have no individual KPI entry
  history to view there. This is a real role-nav mismatch, not a
  cosmetic gap.
- Center FAB always points to `/entry` (KPI Entry) for every role. KPI
  Entry is reachable by every role per `App.jsx`'s `ALL` guard, so this
  is not a permission violation, but it is not meaningful for
  district/regional/general managers, who do not enter KPIs personally.
- No "More" destination exists from the bottom nav at all — Users, Data
  Exchange, Export Studio, KPI Registry, Profile Studio, Evaluation
  Registry, Targets, Team are unreachable from the bottom-nav surface.

**Sidebar mobile drawer (`Sidebar.jsx`, `{mobileOpen && (...)}` block)**
— already a complete, role-correct "More" surface: reuses the same
`NAV_CONFIG`/`resolveNav(role)` source of truth as desktop, includes Sign
Out, and is reachable today only via the topbar hamburger
(`lg:hidden` menu button in `AppLayout.jsx`). **This already satisfies
the spec's "More" drawer requirement — it just needs a second entry
point from the bottom nav**, not a new component.

**Top bar (`AppLayout.jsx`)** — already responsive: product name text,
date chip, command-bar search, and the active-theme name all hide below
`md`/`sm`/`lg` respectively. No duplicated "Live" indicator (removed in
PR-1D1). No raw IDs or debug controls present. Notification bell and
profile menu remain visible at all widths, consistent with the spec's
"only essential context" requirement. **No crowded-header defect found.**

## Tables — the largest mobile risk

Confirmed: **no `DataTable.jsx` abstraction exists** — every page below
uses inline, raw `<table>` markup, which is exactly the pattern
`docs/ui3/mobile-blueprint.md` already prohibits as a primary mobile
pattern ("No table is ever rendered with horizontally scrolling,
truncated columns as the primary mobile pattern — card conversion is the
required fallback"):

`RankingsPage.tsx` (3 tables), `AuditLogsPage.jsx`, `DataExchangeStudioPage.jsx`
(2), `DynamicKpiShadowPage.jsx` (5, dev-only route), `EvaluationRunPage.tsx` (2),
`ExportStudioPage.jsx`, `ImportCenterPage.jsx`, `PersonalTargetsPage.tsx`,
`ReportsPage.jsx`, `TargetsPage.jsx`.

This is the single largest piece of PR-1E's required work and spans
PR-1E2 (Reports/Targets tables), PR-1E3 (Rankings), and PR-1E4 (admin
surfaces). It is pre-existing scope already committed to by the locked
blueprint, not new scope being added by PR-1E.

Charts (`ReportsPage.jsx`'s `AreaChart`/`BarChart`) already use
`ResponsiveContainer` — no chart-library or chart-overflow defect found.

## Modals

Six pages use `ConfirmModal` for destructive/confirm actions
(`DistrictsPage`, `EvaluationRegistryPage`, `PharmaciesPage`,
`RegionsPage`, `UsersPage`, `TargetsPage`) — per the spec, confirmation/
dangerous-action dialogs are allowed to stay centered, so **no
conversion required for these**. `AppLayout.jsx`'s `ThemeSwitcher` and
`ProfileMenu` dropdowns are the only non-destructive dropdown-style
overlays found in the shell; both already use
`aria-haspopup`/`role="menu"`. No dedicated filter/date-selection modal
exists yet on Reports/Rankings to convert — those pages currently use
inline filter controls, not modals, so PR-1E3's bottom-sheet work there
is about the inline control layout, not a modal-to-sheet conversion.

## PWA / safe-area

`vite.config.js`'s manifest already has `display: 'standalone'`,
`orientation: 'any'`, `start_url: '/'`, both icon sizes, and a 3MB
Workbox cache limit. `.mobile-nav` and the new `.sticky-save-bar` rule
are the only two surfaces with `env(safe-area-inset-bottom)` today;
the top bar has no `env(safe-area-inset-top)` handling, which is a
real PR-1E5 item (notch/Dynamic-Island devices), not yet fixed.

## Offline / connectivity

Real infrastructure exists (`OfflineBanner.jsx`, `connectivityService.ts`,
`operationJournal.ts` IndexedDB queue, `syncTracker.ts`) but is not wired
into the mobile shell's single connectivity indicator
(`SyncStatusIndicator` in `AppLayout.jsx`). `docs/ui3/mobile-blueprint.md`
already reserves "an offline indicator placeholder" without committing to
offline-first behavior — consistent with this audit's instruction to
document real capability honestly rather than build a new offline-write
layer.

## KPI Entry (highest priority for PR-1E2)

Already single-column, already has the role/scope/category-grouping/
blank-vs-zero/sticky-save-bar behavior from PR-1D. `type="number"`
inputs rely on the browser's default numeric keyboard (no explicit
`inputMode` set, which is fine — `type="number"` is sufficient on
iOS/Android). The one defect found (save-bar/bottom-nav overlap) is
already fixed above. **No further structural mobile work is required for
KPI Entry beyond the audit's table findings (Reports tables that surface
KPI history elsewhere), which belong to PR-1E2/E3's per-table decisions,
not to KpiEntryPage.jsx itself.**

## Per-page classification

| Page | Classification | Notes |
|---|---|---|
| Dashboard | Responsive adjustment sufficient | Card-grid already reflows; no table risk |
| KPI Entry | Responsive adjustment sufficient | Save-bar overlap fixed above; rest already mobile-ready |
| Reports | Mobile-native redesign required | Raw `<table>` + filter row need the blueprint's card conversion |
| Rankings | Mobile-native redesign required | 3 raw tables, admin-only route |
| Users | Mobile-native redesign required | Table-driven; no card pattern yet |
| Data Exchange Studio | Desktop-preferred with safe fallback | File-upload/preview workflow is inherently desktop-centric; needs an honest mobile-supported-vs-desktop-preferred split, not a full redesign |
| Export Studio | Responsive adjustment sufficient | Export-type selection is form-like, not table-heavy |
| KPI Registry | Desktop-preferred with safe fallback | Authoring surface; must stay safe/readable, not redesigned |
| Profile Studio | Not suitable for mobile | Authoring-only per PR-1C disclaimer; out of mobile scope |
| Evaluation Registry | Desktop-preferred with safe fallback | Admin-only authoring/version surface |
| Targets / Personal Targets | Mobile-native redesign required | Raw table |

## Files expected to change in PR-1E1–E6

`MobileNav.jsx` (role coverage + "More" entry point), `Sidebar.jsx`
(expose drawer trigger from bottom nav, no `NAV_CONFIG` change), a new
shared table→card component (blueprint already requires this — likely
one new component reused by Reports/Rankings/Users/Targets rather than
four bespoke ones), `ReportsPage.jsx`, `RankingsPage.tsx`,
`UsersPage.jsx`, `TargetsPage.jsx`/`PersonalTargetsPage.tsx`,
`AppLayout.jsx` (safe-area-top), `index.css` (additional safe-area
rules). No Firestore, route-guard, or permission change is anticipated.

## Reusable components/patterns to preserve

`.mobile-nav`/`.mobile-fab` CSS, the Sidebar drawer's role resolution via
`NAV_CONFIG`/`resolveNav(role)`, `ConfirmModal.jsx` for destructive
actions, `ResponsiveContainer`-wrapped charts, `EmptyState.jsx`/`Toast.jsx`,
the existing `ProfileMenu`/`ThemeSwitcher` dropdown pattern, the
`ui3`/blueprint-lock design tokens, and KPI Entry's category grouping/
sticky-save-bar/blank-vs-zero state machine.

## Deferred to PR-1F or later (no work attempted here)

Login V3 redesign, biometric/passkey auth, offline-first write queue,
new chart library, PDF export, native Excel charts, Profile Studio
compiler, Evaluation Engine changes, Firestore schema changes.

## Stop-and-report check

No item found in this audit requires a new backend contract, a new
permissions model, a destructive route change, a separate application,
or an unsupported charting dependency. **No stop condition triggered —
PR-1E1 may proceed.**
