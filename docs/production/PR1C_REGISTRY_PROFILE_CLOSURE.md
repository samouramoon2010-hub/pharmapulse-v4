# PR-1C — Registry, Profile Studio, Evaluation Registry & Diagnostics Cleanup — Closure Report

## Scope completed

PR-1C only. PR-1D and all later sections were not started. No broad UI
redesign, mobile redesign, Login V3, production data reset, or Assistant
AI activation was performed.

## KPI Registry

- **Core cleanup**: removed the visible "Core" badge/column from
  `KpiRegistryTable.jsx` and the Core/Custom badge + isCore-driven dot
  color from `SettingsPage.jsx`'s per-user KPI list. `KpiEditorModal.jsx`
  no longer names the raw `isCore` field in user-facing text. The `isCore`
  field and its real runtime effects (archive/hide protection,
  target-input gating in the registry table, mandatory-input enforcement
  in `kpiUiAdapter.ts`) are unchanged and documented in
  [`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md). One
  documented, deliberately-untouched overlap remains: the executive
  heatmap's core-first sort/filter in `dynamicExecutiveAdapter.ts`
  conflates "protected" with "executive-worthy" — flagged as a known
  limitation rather than rewired, since that's an executive-surface
  concern outside registry-screen cleanup scope.
- **Archive behavior**: built `src/services/kpiArchiveGuard.ts` —
  `checkKpiArchiveDependencies()` scans active/draft evaluation profiles
  (hard blockers), targets, actuals, and evaluation results
  (informational) and returns every dependency found, with an exact
  reason and recommended action per blocker. Wired into
  `KpiManagementPage.jsx` via a dependency-check modal
  (`requestArchive` → `confirmArchive`) — archiving no longer happens
  with zero visibility into what it affects.
- **Dependency model**: no cascade delete anywhere; historical
  targets/actuals/results are always preserved regardless of archive.
- **Warning cleanup**: registry health warnings split into Blockers
  (must-fix, always expanded) and Recommendations (content-completeness,
  collapsed by default), in business language naming the KPI by label.

## Profile lifecycle

- **Authoring vs official contract**: confirmed Profile Studio
  (`profileStudioProfiles` + related `PS_COL.*` collections) and the
  Evaluation Registry (`evaluation_profiles`) are genuinely separate,
  non-competing systems — Profile Studio's "publish" never writes to
  `evaluation_profiles` and the Evaluation Engine never reads Profile
  Studio's collections. The risk was that this distinction was invisible
  in the UI: Profile Studio's own `status:'PUBLISHED'` could be mistaken
  for production activation. Fixed with an explicit banner on
  `ProfileStudioPage.jsx`.
- **Compiler/adapter**: **not built this section** — see Known
  Limitations below and
  [`EVALUATION_PROFILE_LIFECYCLE.md`](EVALUATION_PROFILE_LIFECYCLE.md).
- **Validation/simulation/publish**: reviewed the existing Evaluation
  Registry flow (`publishEvaluationProfile()`) — draft → structural
  validation → cross-registry integrity check → immutable publish →
  audit log. Already correct; not modified.
- **Registry visibility / versioning**: `EvaluationRegistryPage.tsx`
  previously rendered one flat row per profile version, including every
  archived historical version. Older archived versions (beyond the most
  recent) of the same profile name are now folded into an explicit,
  on-demand "Show N older archived versions" section. Drafts and the
  active published version remain individually visible and selectable —
  bulk-select and duplicate-draft detection operate on exactly those rows
  and were not touched.
- **Optional field sanitization**: audited both systems' Firestore write
  paths; `clean()` in `evaluationRegistryService.ts` already strips
  `undefined`, and the description field already uses `?? ''`. No
  `metadata.description: undefined`-style bug was found in either system.
  No code change required.

## Diagnostics

- **Retained as admin-only (business-relevant)**: KPI Registry,
  Evaluation Registry, Evaluation Run, Branch Classifications, Rankings
  preview, Demo Data Seeder, Profile Studio (role-scoped, not admin-only).
- **Retained but gated developer-only**: Dynamic KPI Shadow Visibility —
  route stays `admin`-gated for defense-in-depth; Sidebar navigation entry
  marked `devOnly:true` and filtered out of the rendered menu in
  production builds (`resolveNav()` in `Sidebar.jsx`).
- **Retired**: none — no dependency-free dead migration tool was found.
- Full classification table: [`DIAGNOSTICS_ACCESS_MATRIX.md`](DIAGNOSTICS_ACCESS_MATRIX.md).
- No business-user-facing technical jargon (API schema, migration payload,
  raw collection names) was found outside the existing PR-1A-certified
  dev-only debug panels.

## Assistant capability

Audited `AssistantPage.jsx` and `AssistantPanel`: already states
"every answer is explained from already-computed data, never invented,"
renders with no `aiSettings` (provider-disabled, deterministic-kernel-only
mode), and makes no claim of a connected AI provider, generative behavior,
or autonomous action anywhere in the page or panel source. No wording
change was needed — added regression tests (`PR1C_registryProfileDiagnostics.test.ts`)
to keep it that way. BYOK, provider settings, voice execution, and action
approval workflows were not added, per instruction.

## Demo/test cleanup classification

`DEFAULT_KPI_REGISTRY`'s 11 KPI definitions (5 protected core + 6
standard business KPIs) were audited and found to contain zero demo,
test, or seed artifacts — every entry is a legitimate production
definition. **No cleanup action was needed or taken.** Demo *data*
(as opposed to KPI *definitions*) is handled separately by
`demo-seeder.ts`, already correctly batch-scoped and self-cleaning;
audited and found already correct, not modified.

## Security

- No plaintext data exposure introduced.
- No permission broadening — every route guard (`<PR roles={...}>` in
  `App.jsx`) is unchanged; the new Sidebar `devOnly` filter is a
  navigation-visibility convenience only, never a security boundary.
- No new Firestore writes beyond what already existed — the archive
  dependency check is read-only (`getDocs` only).
- No cascade delete, no destructive migration.

## Files changed

**New:**
- `src/services/kpiArchiveGuard.ts`
- `src/services/kpiArchiveGuard.test.ts`
- `src/pages/admin/PR1C_registryProfileDiagnostics.test.ts`
- `docs/production/PR1C_REGISTRY_PROFILE_CLOSURE.md`
- `docs/production/KPI_REGISTRY_GOVERNANCE.md`
- `docs/production/EVALUATION_PROFILE_LIFECYCLE.md`
- `docs/production/DIAGNOSTICS_ACCESS_MATRIX.md`

**Modified:**
- `src/components/admin/kpi/KpiRegistryTable.jsx` — removed Core badge/column
- `src/components/admin/kpi/KpiEditorModal.jsx` — removed raw `isCore` field-name exposure
- `src/pages/shared/SettingsPage.jsx` — removed Core/Custom badge from per-user KPI list
- `src/pages/admin/KpiManagementPage.jsx` — archive dependency guard + grouped warnings
- `src/pages/profileStudio/ProfileStudioPage.jsx` — authoring-only disclaimer banner
- `src/pages/admin/EvaluationRegistryPage.tsx` — version grouping (primaryRows/archivedHistoryRows)
- `src/components/layout/Sidebar.jsx` — `devOnly` nav filter for Dynamic KPI Shadow
- `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md` — PR-1C section added
- `src/engine/kpiRegistry/dashboardSettingsDynamicKpi.test.ts`,
  `src/engine/kpiCompatibility/milestone35Registry.test.ts`,
  `src/engine/evaluationEngine/er2bVisibility2.test.ts`,
  `src/design/loginV3ReactGlassPanelRefinement.test.ts`,
  `src/pages/admin/phase3a1c1.test.ts`, `src/pages/admin/phase3a1c2.test.ts`
  — updated stale assertions that pattern-matched the removed badge
  text/old variable names (assertion-only updates, no behavioral change
  intended by those edits themselves)

## Tests

- **Focused PR-1C tests**: 21/21 passing across 2 new test files
  (`kpiArchiveGuard.test.ts`: 6, `PR1C_registryProfileDiagnostics.test.ts`: 15)
- **Full suite**: 336/336 test files, 24,988/24,988 tests passing
  (up from PR-1B's 334 files / 24,967 tests — net +2 files / +21 tests, all additive)
- PR-1A and PR-1B regression: all PR-1A/PR-1B-specific test files remain green
- Data Exchange / Export Studio regression: all remain green
- Evaluation Engine regression: all remain green (no engine code touched)
- Profile publishing regression: all remain green (publish flow itself untouched)
- Rankings/reports regression: all remain green
- CLAIMED visibility regression: all remain green (no user-reader code touched this section)

## TypeScript

- Baseline (PR-1B close): same single pre-existing `TS5101` config
  deprecation notice (`tsconfig.json` `baseUrl`), unrelated to this section
- Final: identical — same single pre-existing notice
- Delta: **zero new TypeScript errors**

## Build result

`npm run build` — **passed**. Only pre-existing chunk-size and
ineffective-dynamic-import warnings (unrelated to this section, present
before PR-1C started).

## Firestore changes

**None.** No rule, index, or schema change was required. The KPI archive
dependency check is a read-only client-side scan of existing collections;
the Profile Studio disclaimer and version-grouping changes are
display-only.

## Documentation created

- `docs/production/PR1C_REGISTRY_PROFILE_CLOSURE.md` (this file)
- `docs/production/KPI_REGISTRY_GOVERNANCE.md`
- `docs/production/EVALUATION_PROFILE_LIFECYCLE.md`
- `docs/production/DIAGNOSTICS_ACCESS_MATRIX.md`
- Updated `docs/production/PRODUCTION_READINESS_ARCHITECTURE.md`

PR-1A and PR-1B closure evidence was not overwritten — both remain intact
as separate sections in `PRODUCTION_READINESS_ARCHITECTURE.md` and their
own closure documents.

## Known limitations

- **No Profile Studio → Evaluation Registry compiler.** The product
  brief's target flow (`Profile Studio → ... → Publish → Evaluation
  Registry → Evaluation Engine V2`) is not fully wired — a Profile-Studio-
  authored profile does not automatically become a live `EvaluationProfile`
  document. Building a correct compiler between the two independently-
  designed schemas (hierarchy/processor model vs. basket/element/threshold
  model) is a substantial mapping exercise that risks producing profiles
  which validate in Profile Studio but misbehave in the real Evaluation
  Engine if rushed. The additive, safe fix applied instead — an explicit
  "this does not activate live evaluation" banner — ensures the gap is
  disclosed rather than silently misleading, satisfying the requirement
  to "keep it explicitly as an authoring model... do not present it as a
  second official profile schema" without forcing an unsafe integration.
  This is the principal recommended follow-up for a dedicated future
  section.
- **`dynamicExecutiveAdapter.ts`'s core-first sort/filter** for the
  executive heatmap conflates "protected from archive" with
  "executive-worthy," a pre-existing architectural overlap. Documented,
  not rewired — out of registry-screen cleanup scope.
- **`usePermission.js`** remains separate, unused dead code (carried
  forward from PR-1B), not touched in this section either.
- **Dynamic KPI Shadow Visibility** is gated out of production navigation
  but its route remains reachable by direct URL for any admin (route guard
  is role-based, not environment-based) — acceptable as defense-in-depth
  since the page is read-only and feeds no value back into production, but
  noted for completeness.

## Final decision

PR-1C REGISTRY, PROFILE & DIAGNOSTICS FORMALLY CLOSED
