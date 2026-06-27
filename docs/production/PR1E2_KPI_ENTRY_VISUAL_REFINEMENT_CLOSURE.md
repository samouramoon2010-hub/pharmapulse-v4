# PR-1E2 Visual Refinement Addendum — KPI Entry Redesign — Closure Report

## Scope completed

A visual and interaction refinement of `src/pages/pharmacist/KpiEntryPage.jsx`
only, built on the approved KPI Entry reference image. PR-1E4, PR-1E5,
PR-1E6, PR-1F (Login V3), PR-1G (Production Reset), and any backend/
Firestore/evaluation-engine/permission/save-contract change were **not
started**.

## Phase 0 — audit findings

Confirmed by reading the current implementation before editing:

1. **Category data shape** — real, registry-driven (`kpi.category`),
   grouped by `groupByCategory()`; unchanged.
2. **Target source/scope** — `useKpiStore.getTargetForMonth(pharmacyId, month)`
   reads `subscribeMyTargets(pharmacyId)`, which queries the `targets`
   collection filtered **only by `pharmacyId`** (`kpiService.subscribeTargets`).
   There is no `userId` field on a target document — **every target this
   page reads is branch-level, never personal**. No fallback chain exists
   to disclose (there's only one source), so every row now labels it
   explicitly **"هدف الفرع الشهري" (Branch Monthly Target)**, never a
   bare "Target".
3. **Remaining-days logic** — none existed in this page before this
   section. The canonical version already exists and is already shipped
   elsewhere: `getDayProgress()` (`src/engine/kpiAnalyticsEngine.ts`,
   exported via `src/engine/index.ts`) — `currentDay`/`totalDays`/
   `daysRemaining` calendar arithmetic, the exact function Dashboard's
   Run Rate Forecast and `KpiCard` already use.
4. **Daily-pace helper** — also already exists and is already shipped:
   `computeRequiredDailyPace(remainingGap, remainingDays)`
   (`src/components/kpi/kpiVisualHelpers.js`), the same guarded
   `gap / days` formula `KpiCard`, `FocusKpiCommandCard`, and `KpiTile`
   already render, with an existing regression suite
   (`requiredDailyPace.test.ts`) covering every divide-by-zero/NaN/
   Infinity edge case. **Both helpers are reused as-is — no new date or
   division formula was written.**
5. **Displayed actual value** — the form's value for the selected date is
   a **single day's entry** (`saveKpiEntry` writes one document per
   `userId+pharmacyId+date`), not a cumulative MTD figure. A true MTD
   actual had to be derived separately by summing the already-subscribed
   `entries` array for the month — mirroring the exact same inline
   sum-by-date-range pattern Reports' MTD Trend and the Executive Summary
   already use (no new aggregation methodology, no new Firestore read).
6. **Which KPIs can show a daily requirement** — only `count`/`currency`
   valueType KPIs (the registry has exactly three value types: `count`,
   `currency`, `percentage` — confirmed via `defaultKpiRegistry.ts`).
7. **Which KPIs must not** — `percentage`-type KPIs. Dividing a
   percentage target by remaining days, or computing a ratio-of-a-ratio
   against a percentage actual, would mislead — the same guard
   `resolveTargetContext` already enforced for the achievement-%
   calculation. Percentage KPIs instead get a **direct actual-vs-target
   delta** (e.g. "+1% أعلى من المطلوب"), which is a plain comparison, not
   a pace-by-day calculation, and is explicitly permitted by the spec.
8. **Shared components reusable** — `ConfirmModal` (already used for the
   date-change guard, reused again for Discard), the existing `.card`/
   `.badge`/`.btn` token classes, `formatNumber()` (`src/utils/helpers.js`).
   No new shared component file was created (a redesign of a single page
   does not meet the "≥2 pages reuse it" bar from PR-1E3).

No item required new backend data, a new charting library, new
permissions, a calculation change, or a destructive route change. **No
stop condition was triggered** — a truthful daily requirement is
calculable from already-loaded data for count/currency KPIs.

## Visual direction applied

Dark navy/charcoal workspace tokens, restrained blue accent, and the
existing `.card`/`.badge`/`.btn` system are reused unchanged (no new
color tokens, no neon). The page title was renamed from "إدخال KPI" to
**"السجل التشغيلي اليومي"** (Daily Operational Log) to match the
approved reference's framing. Translated into the current design
system rather than reproduced pixel-for-pixel:
- The reference's 4-column table (KPI / Target / Actual / Required-
  Status) becomes **one responsive row template** (Tailwind
  `sm:grid sm:grid-cols-[1.5fr_1fr_0.9fr_1.1fr]`) reused at every
  breakpoint — not two parallel JSX trees for mobile vs. desktop.
- Each category is now a bordered surface (`rounded-lg border ...`)
  instead of a bare heading, matching the reference's "category
  container" look.

## Desktop/tablet structure

At `sm`+ (≥640px), a column header strip (`hidden sm:grid`) reads
right-to-left in this RTL app: مؤشر الأداء (KPI) → الهدف الشهري →
الإدخال الفعلي → المطلوب لليوم / الحالة. Every KPI row below it uses the
identical grid template, so columns stay aligned automatically — no
manual column-width bookkeeping per row. Hover/focus styling is
unchanged from the existing input/button tokens (no new glow effects).

## Mobile structure

Below `sm`, the same row markup (no `sm:grid` classes active) falls
back to plain block stacking, and **DOM source order already matches
the required mobile content order**: KPI label → target summary →
actual input → required-today/status. No 12-column compressed grid, no
horizontal scroll, no fixed pixel widths were introduced (verified by
the focused suite). Inputs remain full-width with the existing 16px-
equivalent `text-base` class (no iOS-zoom regression).

## Target scope behavior

Every row's target line reads **"هدف الفرع الشهري: <value>"** (Branch
Monthly Target). This is the only target scope this page's data source
supports — there is no personal/district/organization target collection
wired to this page — so no scope-selection UI or fallback-disclosure
banner was added; the label itself is the disclosure. A KPI with no
target document shows "بدون هدف" (no target), never an invented 0.

## Daily requirement methodology

For a `count`/`currency` KPI with a real positive branch target:

1. `mtdActual` = sum of this user+pharmacy's persisted entries for the
   KPI's key, over every date in the selected date's month up to and
   including the selected date (derived from the already-subscribed
   `entries` array — no new Firestore read).
2. `gap = max(target - mtdActual, 0)`.
3. `{ daysRemaining } = getDayProgress(referenceDate)`, where
   `referenceDate` is built from the selected date's own year/month/day
   components (not `new Date(isoString)`, which parses as UTC and can
   shift a day in negative-offset timezones).
4. `requiredDaily = computeRequiredDailyPace(gap, daysRemaining)`.

Resulting states (exactly the six required, no others):
- **No Target** — `target` missing → "بدون هدف".
- (folded into the same row as Target: a target of exactly `0` is shown
  as a target value with no comparison, matching the existing
  `resolveTargetContext` "zero" state.)
- **Target Completed** — `gap <= 0`, or `requiredDaily` rounds to `0` at
  the same 1-decimal precision `computeRequiredDailyPace` already uses
  (a negligible residual gap is treated as done, never displayed as
  "0/day").
- **Daily Pace Unavailable** — `daysRemaining <= 0` (the month is
  already fully elapsed as of the selected date) and the target is not
  yet met.
- **Ahead / On Track / Behind** — only computed when the live typed
  actual for the row is non-blank, comparing it against `requiredDaily`
  (count/currency) or directly against the target (percentage, in
  percentage points). On Track is an exact match after the same
  1-decimal rounding (a tolerance, not a new severity threshold). A
  single Behind tier is used throughout — no official moderate/material
  distinction exists, so none was invented.

A blank (not-yet-entered) actual never produces a status badge — only
the informational "Required today" figure is shown, with no fabricated
comparison.

## Status semantics

`STATUS_TONE` maps `ahead`/`onTrack`/`behind` to an icon + visible text
label + color (e.g. "+50 أعلى من المطلوب"), never color alone. Behind
uses amber (`#f59e0b`), not red — there is no official severity
threshold to justify an error tone for a single day's variance.

## Input behavior

Unchanged: `inputMode`/`step`/`min`/`max` still derive from
`toKpiUiConfig()`; `id`/`htmlFor` association, `aria-invalid`/
`aria-describedby`, blank-stays-blank/zero-stays-zero in the save
payload, and the pilot-tracking exclusion are all byte-identical to
PR-1E2 (verified by the existing 44-test PR-1E2 suite, all still
passing unmodified except one literal layout-class assertion — see
Files Changed). The unit suffix now renders just below the input
(`<span>{unit}</span>`) instead of inline in the label, for cleaner
column alignment; the editable value itself is never reformatted.

## Category behavior

Unchanged: real registry categories, `{group.items.length}` count,
`aria-expanded`/`aria-controls`, dirty/error dots derived from
`dirtyKeys`/`errors` (never invented), collapse never filters/slices
`group.items`, and the error-category force-open effect are all
untouched. Visual-only changes: a bordered category surface and the
count rendered as a small badge pill instead of plain mono text.

## Save/discard footer

- **Save** — unchanged states/disabling (`disabled={saving || !pharmacyId || !uid}`),
  unchanged `sticky-save-bar` offset class (byte-identical to PR-1E2,
  no overlap regression).
- **Discard Changes** — new. Disabled unless `saveState === 'unsaved'`.
  Clicking it opens the existing `ConfirmModal` (never `window.confirm`,
  never an immediate reset). Confirming calls `confirmDiscard()`, which
  restores `lastLoadedFormRef.current` — the exact same value the
  prefill effect already computed via the shared
  `buildFilledFormFromEntry()` helper (one source of truth, not
  duplicated restore logic) — and clears errors/dirty state only at
  that point.
- **Ctrl/Cmd+S** — implemented (not just hinted): a `keydown` listener
  registered on mount/removed on unmount (never a global app-level
  binding), guarded against firing while already saving
  (`savingRef.current`), calls `preventDefault()`, and reuses
  `handleSave()` itself — so the shortcut inherits the exact same
  `validate()` call the Save button uses; it can never silently save
  invalid data. The hint text ("Ctrl / Cmd + S") is shown at `lg`+ only
  because the shortcut is genuinely implemented above it.

## Accessibility

- Status badges render visible icon + text label, never color alone.
- Category `aria-expanded`/`aria-controls`/`sr-only` equivalents,
  input `id`/`htmlFor`/`aria-invalid`/`aria-describedby`, and the
  save-state `role="status" aria-live="polite"` region are all
  preserved (the live region now also appears in a desktop/tablet
  header pill, in addition to the existing mobile line and sticky bar).
- DOM source order (KPI → target → actual → required/status) is
  identical at every breakpoint — the mobile/desktop layout difference
  is CSS-only (`sm:grid`), so screen-reader reading order never diverges
  from visual order at any width.
- No `maximum-scale`/`user-scalable=no` was introduced.
- **Not claimed**: formal WCAG certification (consistent with every
  prior PR-1D/PR-1E disclosure).

## Performance

- `monthActualSums` is a single `useMemo` over the already-subscribed
  `entries` array — no new Firestore read, no new subscription.
- One row template (a single grid-column class string) is reused per
  KPI via `.map()` — confirmed by a focused test that the template
  string appears exactly once in source, not duplicated per breakpoint
  or per device variant.
- No new npm dependency — every new import resolves to an existing
  relative module (`engine`, `components/kpi/kpiVisualHelpers`,
  `utils/helpers`) or `lucide-react` (already a dependency).

## Visual evidence

No browser-automation/screenshot tooling was available in this session.
Visual correctness was verified by reading the rendered JSX/CSS
structure and by the focused regression suite (layout/order/no-overflow
assertions), not by pixel screenshots at 375/390/430/768/1440px as the
spec's "Visual review" section describes when tooling is available.
This is the same disclosed limitation every prior PR-1D/PR-1E section
has carried — full visual/device certification remains PR-1E6.

## Files changed

**New:**
- `src/pages/admin/PR1E2_visualRefinement.test.ts` — 36 focused tests
- `docs/production/PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md` (this file)

**Modified:**
- `src/pages/pharmacist/KpiEntryPage.jsx` — redesigned render section
  (header, category containers, 4-column responsive row template,
  Discard/keyboard-shortcut footer); added `resolveDailyPaceContext()`,
  `resolvePaceStatus()`, and `buildFilledFormFromEntry()` as new pure
  functions alongside the unchanged `resolveTargetContext()`/
  `stepForPrecision()`; added `monthActualSums`/`paceReferenceDate`
  derived state and the Discard/keyboard-shortcut effects. Every
  business-logic line the PR-1E2 suite checks verbatim (`setField`,
  `validate()`, `handleSave`'s payload loop, the date-change guard, the
  category-collapse/error-force-open effects) is untouched.
- `src/pages/admin/PR1E2_kpiEntryMobile.test.ts` — one literal
  assertion updated (`max-w-2xl` → `max-w-4xl`, the container width
  needed to fit the new 4-column desktop/tablet layout); all 44 other
  PR-1E2 tests pass unmodified against the redesigned component.
- `docs/production/PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md`,
  `docs/production/MOBILE_PAGE_BEHAVIOR.md`,
  `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md`,
  `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — addendum
  cross-references added (see Documentation Created below).

## Tests

- **New focused addendum tests**: 36/36 passing
  (`PR1E2_visualRefinement.test.ts`)
- **PR-1E2 regression** (with the one disclosed literal-class update):
  44/44 passing (`PR1E2_kpiEntryMobile.test.ts`)
- **PR-1D/PR-1E1/PR-1E3 + KPI write-path regression** (5 files run
  directly): 110/110 passing — `PR1D_uiCleanup.test.ts`,
  `PR1E1_mobileShellNavigation.test.ts`,
  `PR1E3_dashboardReportsRankingsMobile.test.ts`,
  `kpiEntryWritePath.test.ts`, `kpiEntryUserIdFix.test.ts`
- **Full suite**: 341/341 test files, 25,180/25,180 tests passing (up
  from PR-1E3's 340 files / 25,125 tests — net +1 file / +55 tests, all
  additive; no flakes observed in this run).

## TypeScript

- Baseline (PR-1E3 close): single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only the same pre-existing chunk-size and
ineffective-dynamic-import warnings present before this section started.

## Firestore/Auth changes

**None.** This section is presentation-only: a redesigned render tree,
two new pure display-derivation functions (`resolveDailyPaceContext`,
`resolvePaceStatus`), one shared restore helper
(`buildFilledFormFromEntry`), and a Discard/keyboard-shortcut UI flow
built on the existing `ConfirmModal`. The save payload
(`handleSave`'s field loop), `sanitizeKpiEntryFields`, the Firestore
write path, and every permission/rule are byte-identical to PR-1E2.

## Documentation created

- `docs/production/PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md` (this file)
- Updated `docs/production/PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md`,
  `docs/production/MOBILE_PAGE_BEHAVIOR.md`,
  `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md`,
  `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

**PR-1E as a whole is not marked closed** — this addendum only refines
the already-closed PR-1E2 stage; PR-1E4 onward remain not started. See
`PR1E_MOBILE_REDESIGN_CLOSURE.md`.

## Known limitations

- **No live-browser/device screenshot certification** — same disclosed
  limitation as every prior PR-1D/PR-1E section. Deferred to PR-1E6.
- **Daily pace assumes the "today already counted" convention** that
  Dashboard's existing `KpiCard`/Run Rate Forecast already use
  (`daysRemaining` excludes the reference day; `mtdActual` may or may
  not yet include a persisted entry for that day depending on whether
  it was saved). This is not a new convention — it is the same
  asymmetry already present in shipped Dashboard code — but it means a
  user who has *not yet saved* today's entry will see the required pace
  computed as if today's contribution is "yet to come," while the
  comparison badge is evaluated against their *live, unsaved* typed
  value. This is the same interaction a user would have if they
  reasoned about pace manually; it was not flagged as a defect.
- **No formal WCAG audit performed** in this section (consistent with
  every prior section's disclosure) — DOM order/live regions/labels
  were verified, not run through a structured audit tool.
- **Notes field is unchanged** (optional, persisted via the existing
  `payload.notes` field, no effect on evaluation) — the reference
  image's notes box was not redesigned as a new feature since a valid
  contract already existed; only the helper copy was clarified to state
  explicitly that notes do not affect evaluation.

## Final decision

PR-1E2 KPI ENTRY VISUAL REFINEMENT ADDENDUM FORMALLY CLOSED
