# PR-1E2 — KPI Entry Mobile Workflow — Closure Report

## Scope completed

PR-1E2 only. PR-1E3 (Dashboard/Reports/Rankings mobile layouts), PR-1E4
(admin/Data Exchange/Export mobile work), PR-1E5 (PWA/accessibility/
performance certification), PR-1E6 (device certification), PR-1F (Login
V3), PR-1G (Production Data Reset), and any backend/evaluation-engine/
permissions redesign were **not started**.

## Audit findings (Phase 0)

Confirmed by reading `KpiEntryPage.jsx`, `kpiUiAdapter.ts`,
`kpiRegistryLogic.ts`, `kpiStore.js`, `kpiAnalyticsEngine.ts`, and the
existing write-path/blank-vs-zero test suite:

1. All KPI inputs were plain `type="number" min="0"` with no
   `inputMode`, no `step`, and no `max` — precision/min/max data already
   existed in the registry (`toKpiUiConfig()`, used by the Target form)
   but was never read by KPI Entry.
2. Decimals are precision-derived: currency → 2, percentage → 1,
   count/number → 0 (`derivePrecision()` in `kpiUiAdapter.ts`).
3. **No KPI permits negative actuals** — `minAllowedValue` is hardcoded
   `0` for every KPI in `toKpiUiConfig()`.
4. Existing-value reload was already correct (verified, untouched).
5. Target context loading: `useKpiStore.subscribeMyTargets()` +
   `getTargetForMonth()` + `getTargetFieldName()` already existed and
   are used by `TargetsPage`/`PerformancePage`, but **KPI Entry never
   loaded or displayed target data at all** before this section.
6. Unsaved values survive re-render (plain component state).
7. No category collapse existed.
8. Validation errors were a flat `{ [key]: message }` object covering
   only NaN/negative — no max-value check existed.
9. Inputs already used `text-base` (16px) — no iOS-zoom risk existed.
10. **No navigation-away guard exists anywhere in this codebase** — no
    `useBlocker`/router prompt. `window.confirm()` is treated as banned
    "debug scaffolding" by an existing certification test elsewhere in
    the design suite, so the existing `ConfirmModal.jsx` pattern (used
    by 6 other pages) was reused instead.
11. The date-change effect (`[selectedDate, existingEntry?.id, emptyForm]`)
    unconditionally reset `form`/`errors`/`saveState` — **unsaved edits
    were silently discarded on date change**, with no guard.
12. No item required a backend, schema, or permission change. **No stop
    condition was triggered.**

## Mobile header and context

Below `sm` (640px), a compact `role="status" aria-live="polite"` line
renders under the title: selected date + the same live save-status text
the sticky bar shows. Desktop header layout (title, pharmacy name,
display name) is unchanged. The dev-only diagnostic line remains gated
behind `NODE_ENV === 'development'` (already production-safe).

## Category behavior

Real registry `category` field, unchanged grouping logic
(`groupByCategory()`). New: collapsible header per category (only when
>1 category exists) with item count, dirty-dot, error-icon,
`aria-expanded`/`aria-controls`. All categories default **open** (chosen
over "first open, rest closed" specifically to avoid hiding a
previously-always-visible field as a regression). A category containing
a current validation error is force-reopened by an effect on
`[errors, entryFields]`. Collapse toggles a `Set` membership only —
`group.items` is never filtered/sliced, so no value can be hidden from
the form or payload by collapsing.

## KPI input behavior

`buildEntryFields()` now also calls the registry's own `toKpiUiConfig()`
per KPI (the same function the Target form already uses) and exposes
`precision`/`minAllowedValue`/`maxAllowedValue`/`valueType` on each
field descriptor. The input now sets `inputMode`, `step`
(`stepForPrecision()`), `min`, `max`, a real `id`/`htmlFor` pair, and
`aria-invalid`/`aria-describedby`. No decimal/min/max rule was invented —
every value comes from the registry.

## Keyboard workflow

On failed validation, the page scrolls to and focuses the first invalid
field in registry render order, respecting `prefers-reduced-motion` via
an inline `window.matchMedia` check (no new hook/dependency). No custom
virtual-keyboard logic; no Enter-to-submit handling added.

## Sticky save behavior

Unchanged offset/safe-area logic from PR-1E0/E1
(`.sticky-save-bar`). Duplicate-save prevention
(`disabled={saving || !pharmacyId || !uid}`) unchanged. Status text now
lives in a `role="status" aria-live="polite"` region. Root container
gained a defensive `pb-4` so the sticky bar can never trap the final
field/notes textarea.

## Blank-versus-zero guarantee

**Unchanged.** The payload loop still skips `''`/`null` before
`Number(form[key])`; `setField()` still writes the raw typed string into
`form`. New dirty-tracking (`dirtyKeys`) is additive only — verified by
a dedicated regression suite in
`src/pages/admin/PR1E2_kpiEntryMobile.test.ts` (section 4) plus the full
existing write-path/blank-vs-zero regression files, all green.

## Validation UX

Existing NaN/negative checks unchanged. New: registry `maxAllowedValue`
enforcement (previously percentage-type KPIs had no client-side cap at
all). Error copy stays concise Arabic business language — verified by a
regex test that no error string contains an internal field/registry
name. `aria-invalid`/`aria-describedby` added.

## Target/progress context

New capability — KPI Entry previously showed no target data.
`resolveTargetContext()` (pure function, unit-tested) reuses the
existing `getTargetForMonth()`/`getTargetFieldName()`/
`computeAchievementPct()` and resolves to exactly one of: `none` (no
target → "بدون هدف", never a fabricated 0%), `zero` (target ≤ 0 →
shown as a value, no percentage, no divide-by-zero), `target-only`
(valid target but actual not yet entered, or KPI is percentage-typed —
no ratio-of-a-ratio shown), or `achievement` (valid target + a real
entered actual on a non-percentage KPI → real `computeAchievementPct()`
result, including for an explicitly-entered `0`).

## Unsaved-change handling

KPI Entry has no branch/context selector of its own — date is the only
context change the page can discard data through. `requestDateChange()`
now defers behind the existing `ConfirmModal.jsx` whenever
`saveState === 'unsaved'`; confirming applies the date, cancelling leaves
it untouched. No `window.confirm()`; no new global navigation-blocking
subsystem was built (none exists in this codebase — disclosed as a known
limitation, not silently worked around).

## Accessibility

Category toggle semantics, `aria-invalid`/`aria-describedby` on inputs,
`role="status" aria-live="polite"` save status (both in the header and
the sticky bar), `sr-only` text equivalents for the dirty/error dots, no
`maximum-scale`/`user-scalable=no` anywhere in the file. **Not claimed**:
formal WCAG certification.

## Performance

`entryFields`/`categoryGroups`/`emptyForm`/`monthTarget` remain/are
`useMemo`d; `setField`/`toggleCategory` are `useCallback`d with stable
empty dependency arrays (both only call `useState` setters, which are
themselves stable). No virtualization, no new dependency. Per-field
target lookup is a single object-property read per render, not a
repeated registry scan.

## Files changed

**New:**
- `src/pages/admin/PR1E2_kpiEntryMobile.test.ts` — 44 focused tests
- `docs/production/PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md` (this file)
- `docs/production/MOBILE_PAGE_BEHAVIOR.md`

**Modified:**
- `src/pages/pharmacist/KpiEntryPage.jsx` — registry-derived input
  semantics, category collapse + dirty/error indicators, target/progress
  context, max-value validation, focus-first-error, date-change guard
  (`ConfirmModal`), mobile header status line, accessibility attributes.
  Two pure helpers (`stepForPrecision`, `resolveTargetContext`) are now
  named exports so they can be unit-tested directly.
- `docs/production/UI_STATE_MATRIX.md` — KPI Entry mobile-workflow
  states section added.
- `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md` — PR-1E2 marked
  closed; carried-forward items updated.
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — PR-1E section
  updated with PR-1E2.

## Tests

- **Focused PR-1E2 tests**: 44/44 passing (`PR1E2_kpiEntryMobile.test.ts`)
- **Regression** (10 files run directly): 1,189/1,189 passing —
  `PR1D_uiCleanup.test.ts`, `PR1E1_mobileShellNavigation.test.ts`,
  `uiFoundation.certification.test.ts`, `kpiEntryPersistence.test.ts`,
  `kpiEntryDynamic.test.ts`, `kpiEntryLiveRegistry.test.ts`,
  `pharmacistDashboardOwnershipRegression.test.ts`, `phase4dC.test.ts`,
  `finalGlobalSweep.test.ts`, `claimedRecertification.pr1b.test.ts`
- **Full suite**: 339/339 test files, 25,101/25,101 tests passing (up
  from PR-1E1's 338 files / 25,057 tests — net +1 file / +44 tests, all
  additive). One unrelated test
  (`fixBatch5Tasks2to5.test.ts`) timed out once under full-parallel load
  and passed cleanly in isolation immediately after — a pre-existing
  flake unrelated to this change, not a regression.

## TypeScript

- Baseline (PR-1E1 close): single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only the same pre-existing chunk-size and
ineffective-dynamic-import warnings present before this section started.

## Firestore / Auth changes

**None.** Every change in this section is presentation/client-side
(registry reads already supported by existing services, a new
client-side validation rule, a new client-side confirmation flow). No
Firestore rule, index, or schema change; no Auth change; the save
payload construction loop is byte-identical to before this section.

## Documentation created

- `docs/production/PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md` (this file)
- `docs/production/MOBILE_PAGE_BEHAVIOR.md`
- Updated `docs/production/UI_STATE_MATRIX.md`,
  `docs/production/PR1E_MOBILE_REDESIGN_CLOSURE.md`,
  `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

PR-1A/PR-1B/PR-1C/PR-1D/PR-1E0/PR-1E1 closure evidence was not
overwritten. **PR-1E as a whole is not marked closed** — see
`PR1E_MOBILE_REDESIGN_CLOSURE.md`.

## Known limitations

- **No live-browser/device screenshot certification** for this section —
  verified via the focused suite, full regression suite, TypeScript
  check, and build, consistent with how PR-1D/PR-1E1 disclosed the same
  limitation. Deferred to PR-1E6.
- **No global "unsaved changes" navigation guard exists.** Only the
  page-controlled date-change flow is guarded (via the existing
  `ConfirmModal.jsx`) — per this section's explicit instruction not to
  build a new global routing-blocking subsystem. Browser back/refresh/
  tab-close with unsaved KPI Entry changes is still unguarded, same as
  before this section.
- **All categories default open** rather than "first open, rest
  closed" — a deliberate, disclosed deviation from the spec's literal
  wording ("first category may be open by default") chosen to avoid any
  risk of a previously-visible field becoming hidden by default.
- Target/progress context depends on a target document already existing
  for the pharmacy/month (`subscribeMyTargets`) — if no admin/manager has
  ever set a target, every field correctly shows "بدون هدف" rather than
  a fabricated value; this is expected behavior, not a gap.

## Addendum

A later visual-refinement addendum redesigned this page's render tree
(operational table/card layout, daily-pace methodology, Discard +
keyboard-shortcut footer) on top of the functional behavior closed
here, without altering any payload/calculation/permission contract
documented above. See
[`PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md`](PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md).

## Final decision

PR-1E2 KPI ENTRY MOBILE WORKFLOW FORMALLY CLOSED
