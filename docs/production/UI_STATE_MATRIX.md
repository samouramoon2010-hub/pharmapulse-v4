# UI State Matrix — PR-1D

States audited across the pages in PR-1D's scope. "Pre-existing" means the
state already existed before PR-1D and was verified, not built new.

| Page | Loading | Empty / No data | Error / Failed | Permission-denied | Notes |
|---|---|---|---|---|---|
| Global shell (`AppLayout.jsx`) | n/a (shell, not data-bound) | n/a | n/a | Route guards (`<PR roles={...}>` in `App.jsx`) — pre-existing, unchanged | Header/sidebar are presentation-only; no data-fetch states of their own |
| KPI Entry (`KpiEntryPage.jsx`) | Pre-existing (registry subscribe falls back to `DEFAULT_KPI_REGISTRY` while live data loads) | "No pharmacy" / "No uid" warning cards — pre-existing | Sticky save bar now shows an explicit **failed** state with a retry-labeled button (new in PR-1D2); toast on error — pre-existing | Pharmacist-only route guard — pre-existing | Save state machine (`idle/unsaved/saving/saved/failed`) added in PR-1D2. Closure update: pilot-tracking KPI inputs removed (see below) — they had no truthful save state to give. |
| Reports (`ReportsPage.jsx`) | Pre-existing | Pre-existing (verified, not modified) | Pre-existing | Pre-existing route guard | No changes made — already correct from PR-1A |
| Rankings (`RankingsPage.tsx`) | Pre-existing (`subLoading` spinner) | Pre-existing ("No ranking snapshots yet" card with a checklist) | Pre-existing (red error banner) | Admin-only route guard — pre-existing | Classification label humanized (PR-1D3); no new states added — existing ones were already complete |
| Data Exchange Studio / Export Studio | Pre-existing (out of PR-1D's active edit scope this section; verified present, not modified) | Pre-existing | Pre-existing | Pre-existing | No changes made in PR-1D |

## Shared state components reused (not rebuilt)

- `EmptyState.jsx` — tone-aware empty/error states (`EmptyTodayEntries`,
  `EmptyNoTargets`, `EmptyNoForecast`, `EmptyNoBranch`, `EmptyNoAlerts`,
  `EmptyMissionNotReady`, `ErrorState`, `EmptyCell`).
- `Toast.jsx` — 4 semantic toast types for save/error feedback.
- `ConfirmModal.jsx` — confirmation dialogs (e.g. KPI archive in PR-1C).
- `DataTable.jsx` — built-in loading/empty/sort row patterns.

No new shared state component was created in PR-1D; the existing
inventory already covered the pages in scope.

## KPI Entry — pilot-tracking field row (closure update)

`KpiEntryPage.jsx`'s pilot-tracking KPI input section (editable inputs
for `lifecycleStage: 'pilot_tracking'` KPIs) has been **removed**, not
given a state. Investigation found no row in this matrix could honestly
apply to it: the save action could not produce a real "saved" state
because no write path ever persisted the value (see
[`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md#pilot-tracking-field-classification-pr-1d-closure)
for the full trace). An editable field with no truthful saved/failed
state is not a state-handling gap to fix — it is unsupported UI to
remove, which is what was done. Pilot KPIs remain visible (display-only)
on Dashboard and Reports through their own untouched code paths, and
pilot KPI *targets* remain editable on Targets (a separate, working
write path). No state was added or removed from any other page as part
of this fix.

## KPI Entry — mobile workflow states (PR-1E2 update)

PR-1E2 added states without changing any of the rows above:
- **Per-category dirty/error indicator** — a category header shows an
  amber dot if any of its fields are in the existing `dirtyKeys` set
  (changed since load) and a red alert icon if any of its fields are in
  `errors`. Purely derived/presentational; never affects `form` or the
  save payload.
- **Date-change-with-unsaved-changes confirmation** — new state
  (`pendingDate`), surfaced via the existing `ConfirmModal.jsx` rather
  than a new dialog component. Previously, changing the date while
  `saveState === 'unsaved'` silently discarded the in-progress edit; now
  it asks first.
- **Target/progress context per field** — `resolveTargetContext()`
  introduces four explicit states (`none`/`zero`/`target-only`/
  `achievement`) so "no target," "target exists but unusable for a
  percentage," and "real achievement" are never collapsed into a single
  ambiguous 0%/blank rendering.

## KPI Entry — daily-pace / Discard states (Visual Refinement Addendum)

Added on top of the PR-1E2 states above, without changing any of them:
- **Daily-pace context per field** (`resolveDailyPaceContext()`) — six
  explicit states: No Target, Target Completed, Daily Pace Unavailable,
  and (only when a live actual is typed) Ahead/On Track/Behind via
  `resolvePaceStatus()`. Applies only to `count`/`currency` KPIs; a
  percentage-type KPI never gets a "0/day" or pace state, only a direct
  actual-vs-target delta. Never invents a number when the underlying
  data (target, remaining days) can't support one.
- **Discard Changes confirmation** — new state (`discardConfirmOpen`),
  surfaced via the existing `ConfirmModal.jsx` (the same component the
  date-change guard already uses, a separate instance/state). Restores
  `lastLoadedFormRef.current` only on confirmation; never an immediate
  reset, never `window.confirm()`.

## Known gap (not built in PR-1D)

No dedicated `useReducedMotion` React hook or focus-trap library exists.
PR-1D5 addressed motion preference at the CSS layer only (global
`prefers-reduced-motion` media query in `src/index.css`) rather than
building component-level JS hooks — see the PR-1D closure report's Known
Limitations for the full reasoning.
