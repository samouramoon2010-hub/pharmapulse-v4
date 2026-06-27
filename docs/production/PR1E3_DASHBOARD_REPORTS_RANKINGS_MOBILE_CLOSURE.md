# PR-1E3 — Dashboard, Reports & Rankings Mobile Layouts — Closure Report

## Scope completed

PR-1E3 only. PR-1E4 (admin/Data Exchange/Export mobile work), PR-1E5
(PWA/accessibility/performance certification), PR-1E6 (device
certification), PR-1F (Login V3), PR-1G (Production Data Reset), and any
backend/evaluation-engine/permissions redesign were **not started**.

## Audit findings (Phase 0)

Confirmed by reading `DashboardPage.jsx`, `ReportsPage.jsx`,
`RankingsPage.tsx`, `index.css`, `docs/ui3/mobile-blueprint.md`, and the
existing PR-1A correctness test files:

1. **Dashboard is already well-structured for mobile** — every section
   is CSS Grid/Flexbox with `auto-fit`/responsive Tailwind breakpoints
   (`xl:grid-cols-...`), and both charts already use
   `<ResponsiveContainer width="100%" ...>`. No fixed pixel widths
   exist anywhere in the file. The one real gap: the Analytics Row's DOM
   order (Trend → Distribution → Alerts) puts Smart Alerts visually last
   on a single-column mobile layout, while the required mobile priority
   order puts risk/alerts ahead of trend/secondary-insight content.
2. **Reports' Branch Comparison section is a raw `<table>`** (6 columns:
   `#`/Branch/Achievement%/Valid KPIs/Entries/Status) — the only table on
   this page, and the only section that genuinely overflows at phone
   widths. Everything else (filters, stat grids, the 14-day chart) is
   already grid/flex/`ResponsiveContainer`-based.
3. **Rankings' two cohort tables** (Branch: 8 columns; Pharmacist: 8
   columns) are the only tables on the page and both overflow at phone
   widths — confirmed the largest mobile gap in this section.
4. Reports' filters already wrap (`flexWrap`) but scope/period/KPI/
   comparison context wasn't summarized in one always-visible place —
   a user could lose track of the active KPI selector (buried in the
   MTD Trend section) while scrolling.
5. No chart in any of the three pages has a fixed width/height; no page
   has hardcoded pixel widths that would force horizontal overflow at
   320px.
6. The "Showing X of Y eligible" diagnostics text on Rankings already
   renders unconditionally as plain text — already mobile-safe, no
   change needed.
7. No item required new backend data, a new charting library, new
   permissions, a calculation change, or a destructive route change.
   **No stop condition was triggered.**

## Dashboard mobile behavior

Two CSS-only changes, no markup duplication, no logic change:
- `TopAlertsPanel` (Smart Alerts) wrapper: `order-1 xl:order-none`.
- Trend chart wrapper: `order-2 xl:order-none`.
- KPI Distribution wrapper: `order-3 xl:order-none`.

Below `xl`, this reorders the Analytics Row to Alerts → Trend →
Distribution, matching the required mobile priority order (risk/alerts
ahead of trend/secondary insight) without touching any component, prop,
or data flow. At `xl`+, `order-none` restores the exact original
left-to-right desktop arrangement. The KPI achievement tile grid (the
page's primary KPI summary, already first in DOM order before this
section, already `auto-fit` responsive) was not touched — it already
satisfies "primary KPI summary" ranking above the Analytics Row.

## Reports mobile behavior

- **Mobile filter summary** — a new `sm:hidden` line directly under the
  filter controls shows Scope / Period / MTD KPI / Comparison basis,
  built entirely from already-computed state (`selectedBranch`, `scope`,
  `useCustom`/`customFrom`/`customTo`, `reportType`, `activeMtdKpi`) —
  no new fetch, no new derived calculation.
- **Branch Comparison table → cards** — the `<table>` is now
  `hidden sm:block`; a `sm:hidden` card list directly above it maps over
  the exact same `branchSummary` array (no re-sort, no re-aggregation)
  via the new shared `MobileRankCard` component, showing rank, branch
  name, achievement % (primary metric), valid-KPI-coverage and entry
  count (secondary metrics), and status — the same fields the table
  showed, just reflowed per the locked mobile-blueprint.md rule.
- **No mixed-unit regression** — confirmed no `totalActual`/`totalTarget`
  appears anywhere near the comparison section (this was the exact
  defect PR-1A's `ReportsPage.pr1aCorrectness.test.ts` already
  guards against; this section's tests assert it stays that way).
- **No PDF claim** — the PDF button is unchanged: disabled-looking
  (`opacity: 0.6`), `toast.info('PDF export — coming soon')`. CSV/Excel
  export functions (`exportCSV`/`exportExcel`) are untouched.

## Rankings mobile behavior

Both `BranchCohortTable` and `PharmacistCohortTable` now render a
`sm:hidden` card list (via `MobileRankCard`) directly above their
`hidden sm:block`-wrapped `<table>`, mapping over the **same `snapshots`
array** the table already receives — no new sort, no new filter, no
second ranking computed:
- **Branch cards**: rank (`s.currentRank`, the official rank — never a
  recomputed "mobile rank"), branch name, score (primary metric),
  achievement %/pharmacist count/previous rank (secondary metrics),
  movement badge, classification label (subtitle).
- **Pharmacist cards**: rank, pharmacist name, branch name (via the
  existing `pharmacyNameById` canonical resolver — no "Unknown Branch"
  regression), score, achievement %/KPIs≥100/previous rank, movement
  badge.

The "Showing X of Y eligible" diagnostics line and the cohort
section/tab structure are unchanged and remain visible at every width.

## Shared responsive components

**New: `src/components/ui/MobileRankCard.jsx`** — one presentation-only
card (no Firestore/engine/ranking imports), reused by 3 sites (Reports'
Branch Comparison, Rankings' Branch cohort table, Rankings' Pharmacist
cohort table), satisfying the "only create when ≥2 pages reuse it" rule.
Uses existing `.card`/`.card-p` tokens — not a new design system. Props
(`rank`, `title`, `subtitle`, `primaryMetric`, `secondaryMetrics`,
`status`, `movement`) are intentionally generic so each caller supplies
its own already-computed fields rather than the component inventing any
value.

## Loading/empty/error states

Not modified in this section — all three pages already had mobile-safe
loading/empty/error states verified in PR-1A/PR-1D (Dashboard's
`scopeLoading`/`fetchError`/`ErrorState`, Reports' empty-range card,
Rankings' `subLoading` spinner). No new state was needed for the
table→card conversion since the card list and the table render from the
exact same already-loaded array — there is no separate loading state to
add.

## Accessibility

- `MobileRankCard` renders all text content as real DOM text (no
  color-only signaling) — status/score color is additive to visible text
  in every usage.
- The Reports mobile filter summary and Dashboard reorder are pure
  layout/CSS — no new interactive control was added that would need new
  ARIA wiring.
- Reduced-motion: no new animation/transition was introduced by any
  change in this section.
- **Not claimed**: formal WCAG certification.

## Performance

- No new dependency. No virtualization added — Rankings already renders
  every snapshot in the array without pagination (pre-existing, unchanged
  by this section); the mobile card list is the same length as the table
  body, not an additional render pass over a larger dataset.
- `MobileRankCard` is a small, stateless function component — no new
  memoization was needed (it receives plain already-computed props, no
  expensive internal derivation).

## Files changed

**New:**
- `src/components/ui/MobileRankCard.jsx`
- `src/pages/admin/PR1E3_dashboardReportsRankingsMobile.test.ts` — 24 focused tests
- `docs/production/PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md` (this file)

**Modified:**
- `src/pages/dashboard/DashboardPage.jsx` — Tailwind `order-*` utilities
  on the Analytics Row's three children (Trend/Distribution/Alerts);
  no other change.
- `src/pages/shared/ReportsPage.jsx` — mobile filter summary line;
  Branch Comparison table wrapped `hidden sm:block` with a new
  `sm:hidden` `MobileRankCard` list above it using the same
  `branchSummary` data.
- `src/pages/admin/RankingsPage.tsx` — both cohort tables wrapped
  `hidden sm:block` with a new `sm:hidden` `MobileRankCard` list above
  each, using the same `snapshots` array each table already received.
- `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md` — PR-1E3 marked closed.
- `docs/production/MOBILE_PAGE_BEHAVIOR.md` — Dashboard/Reports/Rankings
  sections added.
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — PR-1E section updated.

## Tests

- **Focused PR-1E3 tests**: 24/24 passing
  (`PR1E3_dashboardReportsRankingsMobile.test.ts`)
- **Regression** (5 files run directly): 119/119 passing —
  `PR1D_uiCleanup.test.ts`, `PR1E1_mobileShellNavigation.test.ts`,
  `PR1E2_kpiEntryMobile.test.ts`, `claimedRecertification.pr1b.test.ts`,
  `debugUidMasking.pr1a.test.ts`
- **PR-1A correctness regression** (4 files run directly): 1,437/1,437
  passing — `RankingsPage.pr1aCorrectness.test.ts`,
  `ReportsPage.pr1aCorrectness.test.ts`,
  `uiFoundation.certification.test.ts`,
  `ui3ProductSurfaces.certification.test.ts`
- **Full suite**: 340/340 test files, 25,125/25,125 tests passing (up
  from PR-1E2's 339 files / 25,101 tests — net +1 file / +24 tests, all
  additive). One unrelated test (`phase4aCertification.test.ts`, Profile
  Studio simulation determinism, comparing two `Date.now()`-derived
  timestamps) timed out on a millisecond boundary once under full-suite
  load and passed cleanly in isolation immediately after — a
  pre-existing flake unrelated to this change (Profile Studio was not
  touched), not a regression.

## TypeScript

- Baseline (PR-1E2 close): single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors** (including the new `.tsx` edits
  to `RankingsPage.tsx`)

## Build result

`npm run build` — **passed**. Only the same pre-existing chunk-size and
ineffective-dynamic-import warnings present before this section started.

## Firestore / Auth changes

**None.** Every change in this section is presentation-only: a new
client-side component, CSS `order` utilities, and `hidden`/`sm:hidden`
breakpoint wrappers around data the pages already loaded and already
computed. No Firestore rule, index, or schema change; no Auth change;
no ranking/report calculation function was modified.

## Documentation created

- `docs/production/PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md` (this file)
- Updated `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md`,
  `docs/production/MOBILE_PAGE_BEHAVIOR.md`,
  `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

PR-1A/PR-1B/PR-1C/PR-1D/PR-1E0/PR-1E1/PR-1E2 closure evidence was not
overwritten. **PR-1E as a whole is not marked closed** — see
`PR1E_MOBILE_REDESIGN_CLOSURE.md`.

## Known limitations

- **No live-browser/device screenshot certification** for this section —
  verified via the focused suite, full regression suite, TypeScript
  check, and production build, consistent with how PR-1D/PR-1E1/PR-1E2
  disclosed the same limitation. Deferred to PR-1E6.
- **Dashboard's other sections** (Executive Hero's 4-card row, Pilot KPI
  section, Executive Intelligence Row, Run Rate Forecast, Branch
  Ranking/Month-vs-Target) were audited and found already responsive
  (existing `auto-fit`/Tailwind breakpoints) — not modified, since no
  defect was found in them. Only the Analytics Row's visual order needed
  a fix.
- **Rankings' top diagnostics strip** (Input/Ranked/Excluded/Cohorts
  stat chips, the `isPreview: true`/rule-version debug line) was left
  unchanged — it is an admin-only surface that predates this section and
  was not flagged as a mobile defect by the audit; revisiting it is not
  part of PR-1E3's scope.
- Deferred to PR-1E4: Admin/Data Exchange/Export mobile behavior (the
  large remaining raw-`<table>` inventory from PR-1E0 — Users,
  Targets/PersonalTargets, ImportCenter, ExportStudio, DynamicKpiShadow,
  AuditLogs, EvaluationRunPage).

## Final decision

PR-1E3 DASHBOARD, REPORTS & RANKINGS MOBILE LAYOUTS FORMALLY CLOSED
