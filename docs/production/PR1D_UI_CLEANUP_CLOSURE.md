# PR-1D — Core Application UI Cleanup — Closure Report

## Scope completed

PR-1D only. PR-1E (Mobile Production Redesign), PR-1F (Login V3), PR-1G
(Production Data Reset), AI Assistant activation, Evaluation Engine
changes, and broad architecture refactoring were not started. Work was
done sequentially (PR-1D0 audit → PR-1D1 shell → PR-1D2 KPI Entry →
PR-1D3 Rankings/Reports → PR-1D4 shared consistency → PR-1D5
accessibility), each validated against the full suite before the next
began.

## PR-1D0 — Audit (no code)

A file-level audit of `AppLayout.jsx`, `Sidebar.jsx`, `KpiEntryPage.jsx`,
`ReportsPage.jsx`, `RankingsPage.tsx`, the shared UI component inventory
(`DataTable.jsx`, `Toast.jsx`, `ConfirmModal.jsx`, `EmptyState.jsx`), and
the existing design-token layers found:

- A genuine duplicate "Live" indicator in the header (hardcoded pill +
  `SyncStatusIndicator`).
- A missing Profile dropdown menu (avatar button navigated directly to
  `/settings` with no menu).
- A verified UI-state bug in KPI Entry's blank-vs-zero handling (see
  below).
- No category-explicit grouping in KPI Entry; no sticky save bar.
- A raw, lowercase `classificationId` string in the Rankings branch
  table.
- No `prefers-reduced-motion` support anywhere in the codebase; sparse
  `aria-label` usage (mostly `title=""` instead).
- Sidebar grouping, Reports labeling/hierarchy, and the shared component
  inventory (DataTable/Toast/ConfirmModal/EmptyState) were all already
  compliant with PR-1D's bar — no defects found, so no changes were made
  to avoid an unrelated diff on already-correct surfaces.
- No item required a Firestore, business-logic, or architecture change —
  nothing was deferred to a "stop and report" path beyond what's listed
  in Known Limitations below.

## Global shell (PR-1D1)

- Removed the duplicate hardcoded "Live" pill from `AppLayout.jsx`.
  `SyncStatusIndicator` is now the single consolidated connectivity
  control.
- Added a real `ProfileMenu` dropdown component (Profile / Settings /
  Sign out), replacing the bare avatar button. Shows the canonical role
  label via `getRoleLabel()` from
  [`roleScope.js`](../../src/constants/roleScope.js) (PR-1B's single
  source of truth — not a new or duplicated label map). Theme switching
  remains in its existing header controls rather than being duplicated
  inside the menu.
- Added `aria-label`/`aria-haspopup`/`aria-expanded` to the notification
  bell, theme switcher, mobile-nav trigger, and account menu.
- Sidebar was audited and left unchanged — already compliant (grouping,
  active-state, `devOnly` filtering from PR-1C).
- Quick Actions / notification-count honesty: left as-is. No fabricated
  counts or capability existed before PR-1D, and no new role-aware Quick
  Actions row was added (that would be new scope, not cleanup).

## KPI Entry (PR-1D2)

- **Verified UI-state bug fixed**: `handleSave` built the payload with
  `payload[key] = Number(form[key]) || 0`, which collapsed a blank input
  and an explicit `0` into the same stored value. The registry-level
  sanitizer (`sanitizeKpiEntryFields` in `kpiRegistryLogic.ts`) was
  already written to treat an absent key as "not entered" rather than
  zero, and the Firestore write is `merge:true` — so the fix (skip blank
  fields entirely) is safe: it cannot lose a previously-saved value on
  edit, and it lets the existing lower-layer distinction actually reach
  storage. No other part of the save path changed.
- Added category-based grouping using the KPI registry's own `category`
  field, with an unlabeled single-group fallback for KPIs with no
  category (never an invented category, never dropped).
- Replaced the plain save button with a sticky save bar showing an
  explicit state label (idle / unsaved / saving / saved / failed, with a
  retry-labeled button on failure). The save call site
  (`saveEntry(payload, liveRegistry)`) and payload contract are
  unchanged.

## Reports (PR-1D3)

Audited against PR-1D's full requirement list (section hierarchy, raw
IDs, unclear labels, mixed-unit risk, quick-export vs. Export Studio
distinction). Found already correct from PR-1A — no raw IDs render
outside React `key` props, sections are already ordered and labeled, and
the single-KPI/no-mixed-unit MTD Trend rule already holds. **No changes
were made** to avoid an unrelated diff on a page with no defect.

## Rankings (PR-1D3)

- Humanized the branch-classification cell (`hub` → `Hub`) via a new
  `classificationLabel()` helper, matching the casing already used for
  cohort section headers. Same underlying value — not a fabricated or
  guessed label.
- Rank order, scope label ("Company-Wide"), "Showing X of Y eligible"
  diagnostics, and the loading/empty/error states were already present
  from PR-1A and were verified, not modified.

## Shared UI consistency (PR-1D4)

Audited spacing/radius/shadow/typography/color-semantics/buttons/badges/
tables/cards across the touched pages. All reuse existing tokens and
components (`DataTable.jsx`, `Toast.jsx`, `ConfirmModal.jsx`,
`EmptyState.jsx`, `.card`/`.btn` classes, CSS variables). No new design
system, no duplicate components, and no color-only status indicators
were introduced or found.

## Loading / empty / error / permission states (PR-1D4)

See [`UI_STATE_MATRIX.md`](UI_STATE_MATRIX.md) for the full per-page
matrix. Every page in scope already had loading/empty/error/permission
states before PR-1D; KPI Entry's save bar adds one new explicit state
(failed, with retry) that did not exist before.

## Accessibility (PR-1D5)

- Added a global `prefers-reduced-motion: reduce` CSS override
  (`src/index.css`) that collapses all animations/transitions to
  effectively instant.
- Added `aria-label`s to icon-only header controls (notifications, theme
  switcher, mobile-nav trigger, account menu) plus `aria-haspopup`/
  `aria-expanded` on the two dropdown triggers, and `role="menu"`/
  `role="menuitem"` on the new Profile dropdown with Escape-to-close
  support.
- **Not built**: a `useReducedMotion` JS hook, a focus-trap library,
  skip-links, or a formal WCAG audit. This section does **not** claim
  WCAG certification — see Known Limitations.

## Closure check — pilot-tracking field investigation

The Known Limitations below originally flagged that
`KpiEntryPage.jsx`'s pilot-tracking KPI inputs were rendered but never
included in the save payload. This was investigated to closure rather
than left open, since an editable field that silently discards user
input is a defect, not a cosmetic gap.

**Investigation** — traced `rendered field → form state → save payload →
sanitizer/service → Firestore → readers`:
- Rendered fields: `insuranceConversion` (the only default pilot-tracking
  KPI) via `getPilotTrackingKpis()`, with form keys identical in shape to
  production fields.
- Save payload: never included — `handleSave`'s payload loop only ever
  iterated `entryFields` (production KPIs).
- Sanitizer/service: even if added to the payload, `sanitizeKpiEntryFields()`
  → `buildAllowedEntryKeys()` in `kpiRegistryLogic.ts` structurally
  excludes any KPI whose `lifecycleStage !== 'production_evaluation'`.
  This is a deliberate, separately tested hardening boundary
  (`buildAllowedEntryKeysHardening.test.ts`) — its own comment states the
  exclusion exists so "a misconfigured evaluation profile that tried to
  include a pilot KPI would receive 0 from kpiActuals rather than the
  pilot KPI's actual value." Not an oversight.
- Firestore: no pilot actual has ever been persisted via this write path.
- Other readers: `ReportsPage.jsx`, `DashboardPage.jsx` (pilot display
  sections), and `TargetsPage.jsx` (pilot *target* input, a separate
  write path) all operate independently of KPI Entry's actuals write
  path and were not touched.

**Classification**: Deprecated/Unsupported (Resolution B) — no valid
production storage contract exists for pilot KPI actuals via
`saveKpiEntry`. Not Resolution A (the only storage path is intentionally,
structurally blocked — wiring around it would mean weakening a tested
safety boundary protecting the evaluation engine, which is out of this
section's scope and not requested). Not Resolution C (no evidence pilot
inputs were ever meant to be read-only — `targetInputEnabled: true` and
full numeric `<input>`s indicate intended editability, just never wired
to a working actuals write path).

**Resolution applied**: removed the pilot-tracking input section,
`buildPilotEntryFields()`, and the `pilotEntryFields` memo from
`KpiEntryPage.jsx`. No label in KPI Entry now implies pilot data can be
saved there. Full details and the data-flow table:
[`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md#pilot-tracking-field-classification-pr-1d-closure).
State-matrix update: [`UI_STATE_MATRIX.md`](UI_STATE_MATRIX.md#kpi-entry--pilot-tracking-field-row-closure-update).

**Unaffected by design**: `getPilotTrackingKpis()`, the `pilot_tracking`
lifecycle stage, the Legacy Adapter's pilot-stripping behavior, Dashboard
and Reports' pilot display sections, and Targets' pilot target input —
none were modified.

**Tests added** (`PR1D_uiCleanup.test.ts`, 8 new cases): pilot fields
absent from KPI Entry rendering; dead form state removed; save payload
loop unchanged (still `entryFields`-only); Reports/Dashboard/Targets
pilot sections confirmed untouched; the write-path hardening confirmed
untouched; no "Tracking Only" label remains visible in KPI Entry.

## Visual evidence

No browser-automation/screenshot tooling was available in this session.
Visual correctness for the changes above was verified by reading the
rendered JSX/CSS directly and by the focused + full regression suite,
**not** by pixel screenshots at 1280/1440/1920px as originally specified.
This is disclosed as a known limitation, not silently skipped.

## Files changed

**New:**
- `src/pages/admin/PR1D_uiCleanup.test.ts`
- `docs/production/PR1D_UI_CLEANUP_CLOSURE.md`
- `docs/production/UI_PRODUCTION_STANDARDS.md`
- `docs/production/UI_STATE_MATRIX.md`

**Modified:**
- `src/components/layout/AppLayout.jsx` — duplicate Live indicator
  removed; `ProfileMenu` added; aria-labels added.
- `src/pages/pharmacist/KpiEntryPage.jsx` — blank-vs-zero fix; category
  grouping; sticky save bar with explicit states; closure update:
  removed the unsupported pilot-tracking input section,
  `buildPilotEntryFields()`, and the `pilotEntryFields` memo.
- `src/pages/admin/RankingsPage.tsx` — `classificationLabel()` helper.
- `src/index.css` — global `prefers-reduced-motion` override.
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — PR-1D section
  + known limitations added.
- `src/design/uiFoundation.certification.test.ts`,
  `src/engine/kpiRegistry/phase4dC.test.ts` (x2 assertions),
  `src/engine/kpiAnalyticsEngine/demoReadinessIdFix.test.ts` — updated
  stale assertions that pattern-matched the exact old (in one case
  buggy) source lines intentionally changed above. Assertion-only
  updates; no other behavior in those test files was touched.
- `docs/production/KPI_REGISTRY_GOVERNANCE.md` — added pilot-tracking
  field classification section (closure update).
- `docs/production/UI_STATE_MATRIX.md` — added KPI Entry pilot-field row
  note (closure update).

## Tests

- **Focused PR-1D tests**: 23/23 passing (`PR1D_uiCleanup.test.ts`,
  up from 15 — +8 pilot-tracking closure tests)
- **Full suite**: 337/337 test files, 25,013/25,013 tests passing
  (up from PR-1C's 336 files / 24,988 tests — net +1 file, all additive)
- Pilot-field-specific regression: `pilotKpiSafety.test.ts` (24 tests)
  and `buildAllowedEntryKeysHardening.test.ts` (16 tests) both green —
  confirm the hardening boundary this investigation traced through is
  unchanged
- KPI Entry write-path regression: `kpiEntryPersistence.test.ts`,
  `kpiEntryDynamic.test.ts`, `kpiEntryLiveRegistry.test.ts`,
  `kpiEntryWritePath.test.ts`, `kpiEntryUserIdFix.test.ts`,
  `pharmacistDashboardOwnershipRegression.test.ts`, `phase4dC.test.ts`,
  `finalGlobalSweep.test.ts` — all green (402 tests across these 10 files)
- PR-1A/PR-1B/PR-1C regression: all remain green
- Data Exchange / Export Studio regression: all remain green (untouched)
- Evaluation Engine / Ranking-logic regression: all remain green
  (untouched)
- CLAIMED visibility regression: all remain green (untouched)
- Route-guard regression: all remain green (untouched — `App.jsx` was
  not modified)

## TypeScript

- Baseline (PR-1C close): single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this
  section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only the same pre-existing chunk-size and
ineffective-dynamic-import warnings present before PR-1D started.

## Firestore / Auth changes

**None.** Every change in this section is presentation-only or a
client-side payload-construction fix (the blank-vs-zero correction).
No Firestore rule, index, or schema change was made or required.

## Documentation created

- `docs/production/PR1D_UI_CLEANUP_CLOSURE.md` (this file)
- `docs/production/UI_PRODUCTION_STANDARDS.md`
- `docs/production/UI_STATE_MATRIX.md`
- Updated `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

PR-1A/PR-1B/PR-1C closure evidence was not overwritten — all three
remain intact as separate sections in `PRODUCTION_READINESS_ARCHITECTURE.md`
and their own closure documents.

## Known limitations

- **No formal WCAG audit.** A global `prefers-reduced-motion` CSS rule
  and a round of `aria-label`s were added; a `useReducedMotion` hook,
  focus-trap library, skip-links, and a structured accessibility audit
  tool run were not built/performed. Disclosed, not claimed as done.
- **No live-browser screenshot certification.** No browser-automation
  tooling was available in this session; visual correctness was verified
  by source inspection and the regression suite instead of pixel
  screenshots at 1280/1440/1920px. Recommended as the principal follow-up
  before claiming full visual sign-off.
- ~~KPI Entry's pilot-tracking fields are not written to the save
  payload~~ — **Resolved in this closure check.** Investigated to a
  decisive classification (Deprecated/Unsupported) and removed the
  unsupported editable UI rather than leaving it open. See "Closure
  check — pilot-tracking field investigation" above and
  [`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md#pilot-tracking-field-classification-pr-1d-closure).
  The underlying hardening that makes this unsupported
  (`buildAllowedEntryKeys()` excluding non-production lifecycle stages)
  is intentional and was not touched — it remains a correct safety
  boundary, not a defect.
- **No role-aware Quick Actions row exists** (none existed before
  PR-1D either) — not built, since adding one is new scope rather than
  cleanup of an existing element.
- Carried forward unchanged from PR-1C: no Profile Studio → Evaluation
  Registry compiler; `dynamicExecutiveAdapter.ts`'s core-first
  sort/filter; `usePermission.js` dead code; Dynamic KPI Shadow route
  reachable by direct URL for any admin.

## Final decision

PR-1D CORE APPLICATION UI CLEANUP FORMALLY CLOSED
