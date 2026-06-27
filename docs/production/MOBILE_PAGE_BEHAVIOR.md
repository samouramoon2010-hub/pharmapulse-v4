# Mobile Page Behavior

Per-page mobile workflow documentation for the PharmaPulse Mobile
Production Redesign (PR-1E). Started with KPI Entry (PR-1E2); other
pages are added as their own PR-1E sub-stages close.

## KPI Entry (`src/pages/pharmacist/KpiEntryPage.jsx`) — PR-1E2

### Mobile header
Below `sm` (640px), a compact context line renders under the page title:
selected date, a calendar icon, and the same live save-status text the
sticky bar shows (`role="status" aria-live="polite"`). No raw IDs, no
internal registry/route terminology. Desktop layout (title + pharmacy
name + display name) is unchanged; the dev-only `uid`/`pharmacyId`/`kpis`
diagnostic line is still gated behind `NODE_ENV === 'development'` (was
already production-safe before this section).

### Category behavior
Categories come from the registry's real `category` field via the
existing `groupByCategory()` (unchanged). New in PR-1E2:
- A single "Other" group still renders with no header/toggle at all
  (`showHeader = categoryGroups.length > 1`) — unchanged from PR-1D.
- Multi-category registries get a collapsible header per category:
  label, item count, an amber dirty-dot if any field in that category is
  in `dirtyKeys`, a red alert icon if any field has a validation error,
  `aria-expanded`/`aria-controls` on the toggle button.
- All categories default **open** (not just the first) — this was a
  deliberate choice over "first open, rest closed" to avoid any
  regression where a field a user could previously always see becomes
  hidden by default.
- A category containing a current validation error is force-reopened by
  an effect keyed on `[errors, entryFields]`, regardless of its prior
  collapsed state. This covers both the initial validate-on-save failure
  and any error state left over from a failed save.
- Collapsing/expanding a category only toggles membership in a `Set`
  (`closedCategories`) — `group.items` is never filtered, sliced, or
  otherwise touched, so collapse can never discard or hide a value from
  the form/payload.

### KPI input behavior
Each input's `inputMode`, `step`, `min`, and `max` are derived from the
registry's own `toKpiUiConfig()` (the same function the Target form
already uses) via `buildEntryFields()` — not a new mobile-only rule set:
- `inputMode="decimal"` for currency/percentage KPIs (precision > 0),
  `"numeric"` for count/number KPIs.
- `step` is `1` at precision 0, `0.1` at precision 1 (percentage), `0.01`
  at precision 2 (currency).
- `min` is always `0` (no KPI in this registry permits negative
  actuals — confirmed via `toKpiUiConfig`'s `minAllowedValue`).
- `max` is `100` for percentage-type KPIs, otherwise uncapped.
- Inputs already used `text-base` (16px) — no iOS-zoom-on-focus
  regression existed or was introduced.
- Every input now has a real `id`/`htmlFor` pair (previously the label
  wrapped no `<input>` reference).

### Keyboard workflow
On a failed save, the page scrolls to and focuses the first invalid
field in registry render order (`entryFields.find(...)`, not error-object
key order), respecting `prefers-reduced-motion` via an inline
`window.matchMedia` check (no new hook). No custom virtual-keyboard
logic, no Enter-to-submit handling was added (native `<input type=number>`
behavior is unchanged).

### Sticky save behavior
Unchanged from PR-1E0/E1: `.sticky-save-bar` offsets above the mobile
bottom nav + `env(safe-area-inset-bottom)` below `lg`, `bottom: 8px`
at `lg`+. The save button's `disabled={saving || !pharmacyId || !uid}`
(duplicate-save prevention) is unchanged. The status text now lives in a
`role="status" aria-live="polite"` region. The root container gained a
defensive `pb-4` so the sticky bar can never trap the final field/notes
textarea against the viewport edge.

### Blank-versus-zero guarantee
Unchanged. The payload-building loop still does
`if (form[key] === '' || form[key] == null) continue` before
`payload[key] = Number(form[key])` — blank is never coerced to `0`.
`setField()` still writes the raw typed string into `form`; the new
per-field dirty-tracking (`setDirtyKeys`) is additive and never alters
what's stored in `form` or sent in the payload. Confirmed by
`src/pages/admin/PR1E2_kpiEntryMobile.test.ts`'s blank-versus-zero suite.

### Validation UX
`validate()` keeps the existing NaN/negative checks and adds one new
rule: `maxAllowedValue` (from the registry) is now enforced
client-side — previously a percentage-type KPI had no input-side cap at
all. Error messages remain concise Arabic business copy (no internal
field/registry names, confirmed by a regex test). Inputs carry
`aria-invalid`/`aria-describedby` tied to the error paragraph's id.

### Target/progress context
New in PR-1E2 — KPI Entry previously showed no target data at all.
`resolveTargetContext()` reuses `useKpiStore.getTargetForMonth()` +
`getTargetFieldName()` (already used by Targets/Performance, not new
logic) and resolves to one of four states:
- `none` — no target document for this pharmacy/month → "بدون هدف",
  never a fabricated 0%.
- `zero` — a target document exists but the field is `0` or negative →
  shown as a target value, achievement is never computed (no
  divide-by-zero, no implied underperformance).
- `target-only` — a real positive target exists, but either the actual
  hasn't been entered yet for this date, or the KPI is percentage-typed
  (computing actual/target as a percentage would be a misleading
  ratio-of-a-ratio) → target shown, no percentage.
- `achievement` — a real positive target and a real entered actual
  (including an explicit `0`) on a non-percentage KPI → reuses the
  existing, already-tested `computeAchievementPct()`.

### Unsaved-change / context-change handling
KPI Entry has no branch/pharmacist-context selector of its own
(`pharmacyId` comes from `userProfile`, fixed) — date is the only
context this page can change. `requestDateChange()` defers the date
change behind the existing `ConfirmModal.jsx` component whenever
`saveState === 'unsaved'`; confirming applies the change, cancelling
leaves `selectedDate` untouched. No `window.confirm()`, no new global
route-blocking subsystem (none exists in this codebase yet — this is the
disclosed limitation, not a workaround pretending otherwise).

### Accessibility
Category toggle: `aria-expanded`/`aria-controls`. Save status: visible
text in a `role="status"` live region (not color-only — the red text
color is additive to the text, never the only signal). Category
dirty/error dots carry an `sr-only` text equivalent. Inputs:
`aria-invalid`/`aria-describedby`. No `maximum-scale`/`user-scalable=no`
anywhere in this file. **Not claimed**: formal WCAG certification.

### Visual Refinement Addendum — operational layout, daily pace
A later addendum redesigned this page's render tree without changing
any of the behavior documented above. Full detail:
[`PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md`](PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md).
Summary:
- **One responsive row template** (`sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr]`)
  reused at every breakpoint: KPI → Target → Actual → Required/Status.
  Below `sm` the same DOM falls back to stacked rows in that exact
  order — no separate mobile/desktop markup.
- **Target is always labeled "هدف الفرع الشهري" (Branch Monthly
  Target)** — this collection only stores branch-level targets, so the
  label itself is the scope disclosure; never a bare "Target".
- **Daily requirement** — for `count`/`currency` KPIs only (percentage
  KPIs get a direct actual-vs-target delta instead, never a per-day
  ratio): `gap = target - mtdActual` (MTD actual summed from the
  already-subscribed entries, same pattern Reports' MTD Trend already
  uses), `daysRemaining` from the existing `getDayProgress()`, then the
  existing `computeRequiredDailyPace(gap, daysRemaining)` — both
  helpers already shipped and tested elsewhere (Dashboard's
  `KpiCard`/Run Rate Forecast). States: No Target, Target Completed,
  Daily Pace Unavailable, Ahead/On Track/Behind — never "0/day".
- **Discard Changes** — `ConfirmModal`-gated (never `window.confirm`),
  restores the same `lastLoadedFormRef` value the prefill effect
  already computes via a shared `buildFilledFormFromEntry()` helper;
  dirty state clears only after confirmation.
- **Ctrl/Cmd+S** — actually implemented (listener scoped to this page's
  mount/unmount, reuses `handleSave()`'s own `validate()` call, guarded
  against double-fire while saving) — the hint text is shown because
  the shortcut genuinely exists, not as a cosmetic label.

### Known limitations
- No live-browser/device screenshot certification — verified via the
  focused test suite, full regression suite, TypeScript check, and
  build, consistent with how PR-1D/PR-1E1 disclosed the same limitation.
- No global "are you sure you want to leave" browser-navigation guard —
  none exists anywhere in the app; only the page-controlled date-change
  flow is guarded, per this section's explicit instruction not to build
  a new routing subsystem.
- Category default-open-state (all categories open) means a registry
  with many categories has no collapsed-by-default density benefit on
  first load — chosen deliberately over a closed-by-default that could
  hide a previously-visible field.

## Dashboard (`src/pages/dashboard/DashboardPage.jsx`) — PR-1E3

### Mobile content order
Below `xl`, the Analytics Row reorders via Tailwind `order-*` utilities
(CSS-only, DOM unchanged): Smart Alerts (`order-1`) → Trend chart
(`order-2`) → KPI Distribution (`order-3`). At `xl`+, `order-none`
restores the original left-to-right desktop arrangement
(Trend/Distribution/Alerts). The KPI achievement tile grid — the
page's primary KPI summary — was already first in DOM order above this
row and required no change. Every other Dashboard section (Executive
Hero, Pilot KPI section, Executive Intelligence Row, Run Rate Forecast,
Branch Ranking/Month vs Target) was confirmed already responsive
(`auto-fit` grids, `<ResponsiveContainer>` charts, no fixed pixel
widths) and was not modified.

### Charts
Both Dashboard charts already used `<ResponsiveContainer width="100%" ...>`
before this section — no fixed-width chart existed, so no chart-specific
mobile work was needed.

## Reports (`src/pages/shared/ReportsPage.jsx`) — PR-1E3

### Mobile filter summary
Below `sm`, a single always-visible line shows Scope / Period / MTD KPI /
Comparison basis, built entirely from already-computed state
(`selectedBranch`, `scope`, `useCustom`/`customFrom`/`customTo`,
`reportType`, `activeMtdKpi`) — no new fetch, no new derived value. This
exists because the filter controls above it wrap at narrow widths and can
visually separate from the currently-active selection.

### Branch Comparison table → cards
The `<table>` is now `hidden sm:block`; a `sm:hidden` card list directly
above it (via the shared `MobileRankCard` component) maps over the exact
same `branchSummary` array — same order, no re-sort, no re-aggregation —
showing rank, branch name, achievement % (primary metric), valid-KPI
coverage and entry count (secondary metrics), and status. No mixed-unit
Actual/Target/Gap totals were reintroduced (this is the same defect
class PR-1A's `ReportsPage.pr1aCorrectness.test.ts` already guards).

### Export controls
Unchanged: CSV/Excel exports remain real and unchanged
(`exportCSV`/`exportExcel`); the PDF button still reads "PDF export —
coming soon" via `toast.info(...)` and stays visually de-emphasized
(`opacity: 0.6`) — no PDF capability is newly implied.

## Rankings (`src/pages/admin/RankingsPage.tsx`) — PR-1E3

### Cohort table → cards
Both `BranchCohortTable` and `PharmacistCohortTable` now render a
`sm:hidden` card list (via `MobileRankCard`) directly above their
`hidden sm:block`-wrapped `<table>`, mapping over the same `snapshots`
array the table already receives — no new sort, no new filter, no
second/unofficial rank computed. Cards always pass `s.currentRank` (the
official rank) as the rank shown.
- **Branch cards**: rank, branch name, score (primary metric),
  achievement %/pharmacist count/previous rank (secondary metrics),
  movement badge, classification label (subtitle, via the existing
  `classificationLabel()` humanizer).
- **Pharmacist cards**: rank, pharmacist name, branch name (via the
  existing `pharmacyNameById` canonical resolver — no "Unknown Branch"
  regression), score, achievement %/KPIs≥100/previous rank, movement
  badge.

The "Showing X of Y eligible" diagnostics line remains unconditionally
rendered at every width; pagination/sorting/cohort-grouping logic
(`cohortMap`/`sortedCohortKeys`) is unchanged.

### Known limitations (Dashboard/Reports/Rankings, PR-1E3)
- No live-browser/device screenshot certification — verified via the
  focused suite, full regression suite, TypeScript check, and build,
  consistent with how PR-1D/PR-1E1/PR-1E2 disclosed the same limitation.
- The Dashboard's CSS `order-*` reorder changes visual order only; it
  does not change DOM/screen-reader reading order. This is a disclosed
  minor accessibility trade-off, not a defect introduced silently.
- Rankings' admin-only top diagnostics strip (stat chips, rule-version
  debug line) was left unchanged — out of this section's scope.

## Admin & Operational Surfaces — PR-1E4

Full closure evidence: [`PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md`](PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md).

### KPI Registry (`KpiRegistryTable.jsx`)
Table `hidden sm:block`; a `sm:hidden` card list above it maps the same
`kpis` array via `MobileRankCard` (label/key/labelAr, weight %,
lifecycle/dashboard-visibility/team-visibility, status). Actions footer
reuses `onEdit`/`onHide`/`onArchive` directly. Protected/Core KPIs show
the existing blocked-archive reason instead of a missing action. No
Core badge.

### Export Studio export history
Table `hidden sm:table`; a `sm:hidden` card list maps the same `history`
array (template name, scope, row count, format). No PDF/background-
processing claim added.

### Evaluation Run — basket detail & bulk results
Both tables converted the same way, mapping `basket.elements` and
`bulkReport.results` with no recomputation.

### Audit Logs (authorized diagnostics surface)
A `sm:hidden` card list maps the same `filtered.slice(0,100)` slice,
reusing the existing `expanded` state and `ExpandedLog` component — no
second diff renderer. Truncated `userId` display is unchanged; this
page is the explicit authorized-diagnostics exception.

### Data Exchange Studio
Sheet→domain mapping table de-tabled into stacked flex rows (same data/
order, same `setMappingDomain` handler). Import-job-history table
converted to cards mapping the same `jobs` array. No import/validate/
commit orchestrator call touched.

### Dynamic KPI Shadow (developer-only, nav-hidden)
Fixed a genuine `overflow:'hidden'` clipping bug (5 wrappers) to
`overflow:'auto'`. Added a `sm:hidden` desktop-recommended note — no
card redesign, consistent with developer-only classification.

### Targets / Personal Targets / Import Center
Targets' per-branch KPI grid fixed from a fixed `repeat(5,1fr)` (illegible
below 430px) to `repeat(auto-fit, minmax(64px, 1fr))`. The BulkModal
multi-branch × multi-KPI grid, Personal Targets' per-pharmacist
allocation grid, and Import Center's arbitrary-schema preview are all
classified Desktop-preferred-with-safe-fallback — kept as
horizontal-scroll tables with a `sm:hidden` advisory notice rather than
converted to cards, since card conversion would degrade at-a-glance
comparison/editing for these genuinely matrix-shaped or arbitrary-schema
surfaces.

### Known limitations (Admin & Operational, PR-1E4)
- No live-browser/device screenshot certification — deferred to PR-1E6.
- Desktop-preferred surfaces intentionally retain horizontal-scroll
  tables — not an unaddressed gap.
- Deferred to PR-1E5: PWA/safe-area/accessibility/performance audit of
  every page touched in this section.
