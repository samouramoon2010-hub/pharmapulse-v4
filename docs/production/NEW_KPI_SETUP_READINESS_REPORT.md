# New KPI Setup Readiness Report

**Scope of this pass:** fix KPI Registry visibility/lifecycle inconsistencies, align UI lifecycle controls with the already-lifted `PROTECTED_CORE_KEYS` archival restriction, and produce the schema/template/onboarding documentation needed before any new KPI is created. **No new KPI was created. No archived KPI was reactivated. No evaluation profile was created or published. No deployment occurred.**

## Part 1 — BSU visibility fix

**Root cause confirmed:** `subscribeKpiRegistry()` and `fetchKpiRegistryOnce()` (both in `src/services/kpiRegistryService.ts`) queried Firestore with `query(registryCol(), orderBy('sortOrder', 'asc'))`. Firestore's `orderBy()` silently excludes any document that lacks the ordered field entirely. `BSU` has never had a `sortOrder` field, so it was excluded from both functions' results — not just hidden in the UI, but genuinely never reaching either the admin management page **or** the bulk-evaluation registry snapshot (`fetchKpiRegistryOnce()` is used by `bulkEvaluationService.ts`-adjacent code, per its own doc comment "equivalent to the first emission of subscribeKpiRegistry(), suitable for server-side service calls").

**Fix implemented (query/list logic option, not a per-document Firestore write):** removed the server-side `orderBy` from both functions. `docToKpiDefinition()` (`kpiRegistryLogic.ts`) already defaults a missing `sortOrder` to `999`, and the sole consumer that needs ordering (`KpiManagementPage.jsx`) already sorts the resulting array client-side by that same field. Result: no document is ever silently excluded, ordering stays deterministic, and **zero Firestore documents were mutated** — this was a pure code fix.

**Regression tests added** (`src/services/kpiRegistrySortOrderVisibility.test.ts`, 10 tests):
1. KPI with `sortOrder` appears ✓
2. KPI without `sortOrder` also appears (defaults to 999) ✓
3. Client-side ordering is deterministic across repeated calls ✓
4. Archived KPIs remain visible regardless of `sortOrder` presence ✓
5. Active/archived counts are accurate regardless of `sortOrder` presence ✓
6. `fetchKpiRegistryOnce()` (the bulk-evaluation path) has the identical fix ✓

**Live verification:** `/admin/kpis` now shows **"18 definitions · 0 active"** (was "17 definitions · 0 active" before this fix). `BSU` is now present in the rendered list alongside the other 17.

## Registry query behavior

Both `subscribeKpiRegistry()` (real-time, used by the admin UI) and `fetchKpiRegistryOnce()` (one-shot, used server-side by bulk evaluation) now read the full `kpi_registry` collection with no server-side filter or sort, then rely on `docToKpiDefinition()`'s existing safe defaults and the consumer's own client-side sort. This is a strictly more permissive read — no document that was previously visible can become hidden by this change; only previously-hidden documents (missing `sortOrder`) become visible. No malformed document is silently dropped: `docToKpiDefinition()` only excludes a doc if it lacks a `key` or `label` entirely (pre-existing, intentional corrupt-doc handling, unchanged by this fix).

## UI lifecycle alignment

**Audited:** `KpiRegistryTable.jsx` (both mobile-card and desktop-table renderings), `KpiManagementPage.jsx`'s `requestArchive()`/`handleHide()` handlers, `KpiEditorModal.jsx` (reviewed, not modified — see below).

**Fixed:**
- `KpiRegistryTable.jsx` — the Archive button was gated on `!kpi.isCore && uiStatus === 'ACTIVE'` (combined with Hide). Split so **Archive now renders for any active KPI regardless of `isCore`**, while **Hide remains gated on `!kpi.isCore`** (that restriction was deliberately not lifted). The "Protected" badge text changed from "cannot be archived or hidden" to "cannot be hidden from input forms," matching the new, narrower restriction.
- `KpiManagementPage.jsx`'s `requestArchive()` — removed the `if (PROTECTED_CORE_KEYS.has(key) && mergedRegistry[key]?.isCore) return` silent no-op. `handleHide()`'s identical guard was **left in place** — hiding a core KPI from input is still blocked.

**Confirmed unchanged (deliberately not touched):**
- `KpiEditorModal.jsx`'s separate, wider 10-key `PROTECTED_KEYS` list (5 core + `sales`/`sl`/`ndf`/`inbody`/`liberation`) still locks the `key` field, category, lifecycle-stage buttons, and `isCore` toggle for those 10 keys in the editor. This is a field-immutability concern, not an archive/hide concern — out of scope for this pass.
- `kpiRegistryAdapter.ts`'s bulk-import conflict rule (any import row touching a core key is forced to `CONFLICT`) — a separate import-governance protection, not part of "no stale isCore UI rule blocks valid lifecycle actions."
- No permission was broadened beyond "core KPIs can now be archived" (already true in the service layer from the prior pass) — the UI simply stopped silently disagreeing with the service layer.
- No KPI can be deleted — confirmed no `deleteKpiDefinition` function or `deleteDoc` call exists anywhere in `kpiRegistryService.ts`, and Firestore's own rule (`allow delete: if false`) makes it structurally impossible regardless.
- Archived KPIs remain viewable (rows are dimmed via `opacity: isArchived ? 0.55 : 1`, never removed from the rendered list — confirmed via regression test, item 5 in `kpiRegistryTableLifecycleAlignment.test.ts`).

**Regression tests added** (`src/components/admin/kpi/kpiRegistryTableLifecycleAlignment.test.ts`, 8 tests, using this repo's established `?raw`-import source-assertion convention since no React component-rendering test infrastructure exists here): Archive no longer core-gated (2 tests), Hide still core-gated (2 tests), `requestArchive()` no-op removed (1 test), `handleHide()` guard unchanged (1 test), archived KPIs never filtered from the render list (2 tests).

**One pre-existing test updated:** `src/pages/admin/PR1E4_adminOperationalMobile.test.ts` asserted the old "Protected system KPI — cannot be archived or hidden" text. Updated to assert the new, narrower text — this is an intentional behavior change from the owner's own 2026-07-07 decision to lift the archive restriction, not a regression.

## New KPI schema

Full field matrix in [`NEW_KPI_SCHEMA_REFERENCE.md`](NEW_KPI_SCHEMA_REFERENCE.md), derived directly from `KpiDefinition` (`kpiRegistryTypes.ts`), the Firestore write/read shape (`kpiRegistryLogic.ts`), and `firestore.rules`. Several fields requested in this task's Part 3 list (`scope`, `input type`, distinct `ranking eligibility`/`evaluation eligibility` flags, `parent KPI`/`sub-elements`/`composite behavior`, `effective start/end period`, a dedicated `owner`/`approval status` field) **do not exist in the current architecture** and are reported as gaps in that document rather than invented.

## KPI definition template

[`NEW_KPI_DEFINITION_TEMPLATE.md`](NEW_KPI_DEFINITION_TEMPLATE.md) — a fill-in-the-blanks form covering Identity, Scope, Measurement, Product behavior, Evaluation, and Governance sections, cross-referencing the schema reference for every field's allowed values.

## Onboarding sequence

[`NEW_KPI_ONBOARDING_PLAN.md`](NEW_KPI_ONBOARDING_PLAN.md) — the 15-step safe sequence from owner definition through to a single end-of-process deployment, with an explicit hard rule against reusing any of the 18 archived KPI keys/aliases for a new business meaning.

## Known limitation carried forward (not fixed, out of scope for this pass)

**The `isPrimary` invariant is currently violated.** `KpiDefinition`'s own documented invariant is "exactly one KPI in the whole registry must have `isPrimary: true`, and it must be `isActive: true`." With all 18 KPIs now archived (0 active), there are currently **zero** active primary KPIs — a violation of this invariant. This is surfaced today only as a health-check "blocker" message in `KpiManagementPage.jsx` ("The registry must have exactly one primary KPI (found 0)"), not a hard error anywhere else in the app (confirmed via the smoke test — `/dashboard`, `/entry`, `/targets` all load without error despite this). **This is expected and correct for the current "registry emptied, awaiting new KPI definitions" state** — it will self-resolve once the first new production KPI is activated and marked `isPrimary: true`, which is exactly what `NEW_KPI_ONBOARDING_PLAN.md` step 10 anticipates. Flagged here for completeness, not treated as a defect to fix now.

## Files changed

- [src/services/kpiRegistryService.ts](src/services/kpiRegistryService.ts) — `orderBy` removed from `subscribeKpiRegistry()` and `fetchKpiRegistryOnce()`; unused `query`/`orderBy` imports removed
- [src/components/admin/kpi/KpiRegistryTable.jsx](src/components/admin/kpi/KpiRegistryTable.jsx) — Archive/Hide gating split (both mobile + desktop renderings)
- [src/pages/admin/KpiManagementPage.jsx](src/pages/admin/KpiManagementPage.jsx) — `requestArchive()` no-op removed
- [src/services/kpiRegistrySortOrderVisibility.test.ts](src/services/kpiRegistrySortOrderVisibility.test.ts) — new, 10 tests
- [src/components/admin/kpi/kpiRegistryTableLifecycleAlignment.test.ts](src/components/admin/kpi/kpiRegistryTableLifecycleAlignment.test.ts) — new, 8 tests
- [src/pages/admin/PR1E4_adminOperationalMobile.test.ts](src/pages/admin/PR1E4_adminOperationalMobile.test.ts) — 1 test updated (intentional text change, not a regression)
- [docs/production/NEW_KPI_SCHEMA_REFERENCE.md](NEW_KPI_SCHEMA_REFERENCE.md) — new
- [docs/production/NEW_KPI_DEFINITION_TEMPLATE.md](NEW_KPI_DEFINITION_TEMPLATE.md) — new
- [docs/production/NEW_KPI_ONBOARDING_PLAN.md](NEW_KPI_ONBOARDING_PLAN.md) — new
- [docs/production/NEW_KPI_SETUP_READINESS_REPORT.md](NEW_KPI_SETUP_READINESS_REPORT.md) — this file
- [docs/production/PRODUCTION_READINESS_ARCHITECTURE.md](PRODUCTION_READINESS_ARCHITECTURE.md) — append-only update

## Tests

Focused: 18 new tests (10 sort-order + 8 UI alignment) + 108 tests re-run from the prior pass (archive-core-keys, archive-guard, entry-key-hardening) — all pass. Full suite: **368 files, 25,666 tests — all pass** (1 pre-existing test's assertion text updated to match the intentional restriction change, not a failure left unresolved).

## TypeScript

Same pre-existing repo-wide condition as the prior pass (no `typecheck` npm script; `tsc --noEmit` has never been clean at `HEAD`, confirmed by `git show HEAD`). Zero new type errors introduced by this pass's changes.

## Build

`npm run build` succeeded — only pre-existing chunk-size/dynamic-import warnings, no errors.

## Firestore changes

**None.** The BSU fix was implemented entirely as a query/list-logic code change — no document was written, no `sortOrder` field was added to `BSU` or any other document.

## Auth changes

**None.**

## Deployment

**None.** No `firestore.rules` change, no index change, no commit, no push, no deploy.

## Final decision

**NEW KPI FOUNDATION READY — OWNER DEFINITIONS REQUIRED.** The KPI Registry visibility defect is fixed and regression-tested (both the admin UI and the bulk-evaluation read path), the UI's lifecycle controls now correctly match the already-lifted backend archival restriction, and the schema/template/onboarding documentation is complete and grounded entirely in the existing, verified architecture — no fields were invented. The registry stands at 18 archived KPIs, 0 active, ready for the owner to supply real KPI business definitions via `NEW_KPI_DEFINITION_TEMPLATE.md` before any new KPI is created.
