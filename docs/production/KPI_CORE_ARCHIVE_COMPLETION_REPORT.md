# KPI Core Archive Completion Report

**Authorization phrase received exactly:** "Archive Remaining 5 Protected Core KPIs" (owner decision, following the prior "Archive All Current KPIs — Safe Registry Reset" pass, which archived 13/18 KPIs and left 5 active because the application's own `PROTECTED_CORE_KEYS` guard blocked archiving them).

**Project:** `pharmapulse-646de`
**Executed:** 2026-07-07, inside the confirmed real admin's own authenticated browser session (masked uid `2hs9***`, `role: admin`, `active: true`).
**Scope:** Lift the archival restriction for `wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling` in application code, prove it with tests, validate the whole codebase, then archive these 5 KPIs in Firestore. No deletion, no Auth changes, no deploy, no commit.

## Code change

**File:** `src/services/kpiRegistryService.ts` (3 edits, no other files changed):

1. **`archiveKpiDefinition()`** — removed the `if (PROTECTED_CORE_KEYS.has(key)) throw ...` guard. This is the single restriction the task asked to lift.
2. **`transitionKpiLifecycle()`** — removed the redundant, parallel `if (PROTECTED_CORE_KEYS.has(key) && toStage === 'archived') throw ...` guard (the generic lifecycle-transition path had its own copy of the same restriction).
3. **`hideKpiDefinition()`** — **left intentionally untouched in intent**, but a genuine, pre-existing, unrelated bug was found and fixed here: the function referenced the bare identifier `PROTECTED_CORE_KEYS`, which is only *re-exported* (`export { PROTECTED_CORE_KEYS } from './kpiRegistryLogic'`) — not locally bound — in this file. Per ES module semantics, that syntax does not create a usable local binding, so every call to `hideKpiDefinition()` for *any* key (core or not) has always thrown `ReferenceError: PROTECTED_CORE_KEYS is not defined` since this code was written, confirmed via `git show HEAD` before this session touched anything. Since preserving `hideKpiDefinition`'s safeguard was an explicit requirement of this task, and it currently doesn't preserve anything (it just crashes), the one-line fix (using the already-imported local alias `_PROTECTED` instead of the bare name) was necessary to actually satisfy "preserve all other lifecycle safeguards." This is documented here rather than silently folded in.

**Not touched (out of scope, confirmed by the task's own file list):**
- `PROTECTED_CORE_KEYS` constant itself (`kpiRegistryLogic.ts`) — still contains the same 5 keys, still used by `hideKpiDefinition()` and by the KPI editor's separate 10-key immutability list.
- `kpiArchiveGuard.ts` — no code change; it never distinguished core from non-core keys, so its existing active/draft-profile block already applied uniformly and needed no modification.
- Firestore rules, indexes, evaluation methodology, KPI IDs/aliases/schemas — none touched.
- UI residual: `KpiManagementPage.jsx`'s `requestArchive()` still no-ops for `PROTECTED_CORE_KEYS` keys with `isCore:true`, and `KpiRegistryTable.jsx` still hides the Archive button for `kpi.isCore` KPIs. This means if any of these 5 keys is ever un-archived in the future, an admin could not re-archive it *via the UI* without a further change — the service-layer function now supports it, but the UI gate was left alone since the task's named files (`kpiRegistryLogic.ts`, `kpiArchiveGuard.ts`, "related registry lifecycle services", "related certification tests") do not include UI components, and "do not broadly refactor" argued against touching two more JSX files for a scenario (re-archiving after an un-archive) outside this operation's actual scope. Flagging honestly rather than silently leaving it unexplained.

## Tests

Written **before** any Firestore mutation, per the task's "tests first" requirement:

| File | What it proves |
|---|---|
| `src/services/kpiRegistryService.archiveCoreKeys.test.ts` (new) | (1) `archiveKpiDefinition()`/`transitionKpiLifecycle()` no longer throw for any of the 5 core keys, and write the correct `isActive:false`/`uiStatus:ARCHIVED`/`lifecycleStage:archived` payload. (2) No delete path exists anywhere in the file (`deleteDoc` never appears; no `deleteKpiDefinition` export) — archiving never removes a document. (3) Non-core KPI archival (`sales`) is bit-for-bit unchanged — no regression. (4) `hideKpiDefinition()` **still** throws for all 5 core keys (restriction preserved, now actually working instead of crashing with the wrong error). (5) Archiving a core key still writes both the `kpi_audit_logs` and `audit_logs` entries. |
| `src/services/kpiArchiveGuard.test.ts` (extended) | The dependency guard treats core keys identically to any other key: still blocked by an active (published) profile, still blocked by a draft profile, becomes safe once the only referencing profile is archived, and historical targets/actuals/evaluation_results remain informational-only (never block archiving) — proven explicitly for all 5 core keys. |
| `src/engine/kpiCompatibility/buildAllowedEntryKeysHardening.test.ts` (extended) | Once archived, all 5 core keys (and their engine aliases `omni`/`wellness`) are excluded from `buildAllowedEntryKeys()` — the same allowlist used by both KPI Entry and (indirectly, via the shared merged registry) Target creation. Also proves a stale `targetInputEnabled:true` flag from the pre-archive state cannot override the exclusion. |
| `src/engine/kpiCompatibility/milestone35Registry.test.ts` (renamed/clarified) | The old test name ("protected core keys cannot be archived") was stale and misleading after this change — it never actually tested archival behavior, only that `isCore:true` is set in `DEFAULT_KPI_REGISTRY`. Renamed to state what it actually verifies, with a comment pointing to the new archive-behavior test file. |

Item 9 from the original test list ("no active profile can reference an archived KPI") was **not** implemented as a new runtime validation — no such check exists anywhere in the codebase today (publishing a profile does not cross-check KPI archival status), and adding one would be new validation logic, explicitly out of scope ("do not broadly refactor registry logic", "no unrelated refactoring"). This is reported honestly rather than invented. The invariant currently holds only because the operational sequence (archive all profiles first, then archive KPIs) was followed both in this pass and the prior one, and is re-verified below as a live fact (0 published/draft profiles exist), not as an enforced rule.

## Full suite

`npx vitest run` (entire repo): **366 test files, 25,651 tests — all passed.**
Focused subset (registry lifecycle + guard + entry-key hardening + milestone35): **165 tests — all passed**, run first before the full suite per the task's own ordering.

## TypeScript

`npx tsc --noEmit` reports a pre-existing, unrelated repo-wide condition: this project has no `typecheck` npm script and has never run a clean `tsc --noEmit` (confirmed via `git show HEAD` — the same `KpiLifecycleStage` import-resolution error and dozens of other pre-existing errors across unrelated files, e.g. `?raw` Vite-suffix imports not recognized by bare `tsc`, missing `@types/node`, existed before this session touched anything). **Zero new type errors were introduced by the 3-line service change.** The repo's actual type-safety signal is Vite's esbuild transform (used by both `vite build` and `vitest`), which succeeded cleanly.

## Build

`npm run build` — **succeeded** (`✓ built in 3.66s`). Only pre-existing, unrelated warnings (chunk-size and ineffective-dynamic-import notices already present in this codebase's dependency graph) — no errors.

## Secret scan

Grepped all 5 files this operation touched/added (`kpiRegistryService.ts`, `kpiRegistryService.archiveCoreKeys.test.ts`, `kpiArchiveGuard.test.ts`, `buildAllowedEntryKeysHardening.test.ts`, `milestone35Registry.test.ts`) for API keys, tokens, passwords, secrets — **none found.**

## Live pre-check (before Firestore mutation)

1. Project confirmed: `pharmapulse-646de`.
2. Authenticated user confirmed: masked uid `2hs9***`, `role: admin`, `active: true`.
3. `kpi_registry` recount: **18** documents (unchanged from the prior pass).
4. Exactly 5 active KPIs confirmed, matching the authorized list exactly: `basket`, `crossSelling`, `omnihealth`, `wasfaty`, `wellnessCard`.
5. `evaluation_profiles` recount: **0 published, 0 draft, 21 archived** — confirmed no active/selectable profile exists (already true from the prior pass; re-verified fresh here).
6. Local snapshot re-verified present and complete: `local-backups/kpi-registry-archive-2026-07-07T00-55-00Z/kpi_registry.json` — 18/18 KPI documents confirmed via an independent script count.

## Five KPIs archived

| KPI key | Before | After |
|---|---|---|
| `wasfaty` | `production_evaluation`, `isActive:true` | `archived`, `isActive:false`, `uiStatus:ARCHIVED` |
| `omnihealth` | `production_evaluation`, `isActive:true` | `archived`, `isActive:false`, `uiStatus:ARCHIVED` |
| `wellnessCard` | `production_evaluation`, `isActive:true` | `archived`, `isActive:false`, `uiStatus:ARCHIVED` |
| `basket` | `production_evaluation`, `isActive:true` | `archived`, `isActive:false`, `uiStatus:ARCHIVED` |
| `crossSelling` | `production_evaluation`, `isActive:true` | `archived`, `isActive:false`, `uiStatus:ARCHIVED` |

All 5 writes used the exact existing supported contract (the same field shape as `archiveKpiDefinition()`), 1 write each (no batching needed — 5 individual `setDoc(..., {merge:true})` calls), 0 errors, 0 skips. Each write was paired with a `kpi_audit_logs` entry (`action: 'ARCHIVE'`) and an `audit_logs` entry, matching the app's own audit convention exactly. **No document was deleted** — all 18 `kpi_registry` documents (including these 5) still exist, only their status fields changed.

## Final registry counts

| Metric | Before this pass | After this pass |
|---|---:|---:|
| `kpi_registry` total | 18 | **18** |
| Active KPIs | 5 | **0** |
| Archived KPIs | 13 | **18** |

Matches the task's stated expected final state exactly (`total: 18, active: 0, archived: 18`).

## Profile counts

| Metric | Before this pass | After this pass |
|---|---:|---:|
| `evaluation_profiles` total | 21 | **21** (unchanged) |
| Published | 0 | **0** |
| Draft | 0 | **0** |
| Archived | 21 | **21** |

Matches the task's stated expected final state exactly (`active profiles: 0, archived profiles: 21`). No profile was touched this pass — this state was already achieved in the prior pass and is simply re-confirmed unchanged.

## Historical-data verification

| Item | Before this pass | After this pass |
|---|---:|---:|
| `evaluation_results` | 111 | **111** (unchanged — never touched) |
| `users` | 10 | **10** (unchanged) |
| `pharmacies` | 4 | **4** (unchanged) |
| Protected admin | active, `role: admin` | **confirmed still active, still `role: admin`, still signed in** |
| `audit_logs` | 869 | **874** (+5, one per archived KPI, via `logAction()`) |
| `kpi_audit_logs` | 13 | **18** (+5, one per archived KPI, via `logKpiAudit()`) |

No `kpi_entries`, `targets`, or `personal_targets` document was touched — all historical actuals/targets referencing these 5 KPI keys remain exactly as they were, still resolvable in Reports.

## Smoke-test results

| Page | Result |
|---|---|
| `/entry` (KPI Entry) | Loads cleanly, zero console errors. `"kpis: 0"` diagnostic line confirms zero active KPIs remain — a clean, correct empty state, no crash. |
| `/targets` | Loads cleanly, zero console errors, "No targets for July 2026" clean empty state. |
| `/dashboard` | Loads cleanly, zero console errors. |
| `/reports` | Loads cleanly, zero console errors. |
| `/admin/rankings` | Loads cleanly, zero console errors, "⚠ No published evaluation profiles found. Publish a profile first." — the expected no-active-profile state. |
| `/data-exchange` | Loads cleanly, zero console errors, fully accessible. |
| `/admin/kpis` (KPI Management) | Loads without crashing. Header shows **"17 definitions · 0 active"** (all archived) — correctly reflects 0 active KPIs. The displayed count is 17, not 18, for the same pre-existing reason documented in the prior report (see BSU visibility status below) — not a regression from this pass. |

## BSU visibility status

**Still present, unchanged, confirmed not touched.** As required by this task, re-inspected directly: `getDoc(doc(db,'kpi_registry','BSU'))` confirms the document still has no `sortOrder` field, and is now correctly archived (`isActive:false`, `uiStatus:'ARCHIVED'`, `lifecycleStage:'archived'`) — its own data is entirely correct. It remains invisible specifically on the `/admin/kpis` page's live list because `subscribeKpiRegistry()` queries with `orderBy('sortOrder', 'asc')` (`kpiRegistryService.ts:89`), and Firestore's `orderBy` silently excludes any document missing the ordered field. This is the exact same pre-existing defect reported in `KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md` from the prior pass — **not modified in this operation**, per the task's own instruction to only correct it if a "one-field, clearly safe correction is separately documented and tested," which was not done here since it falls outside this task's authorized scope (archiving 5 specific KPIs, not fixing an unrelated query bug).

## Errors or skips

- **0 errors** on the code change, the 165 focused tests, the 25,651-test full suite, the build, or the 5 live archive writes.
- **1 pre-existing, unrelated bug found and fixed**: `hideKpiDefinition()`'s broken `PROTECTED_CORE_KEYS` reference (see Code change, item 3) — necessary to actually satisfy "preserve all other lifecycle safeguards," documented transparently above.
- **1 pre-existing, unrelated defect confirmed still present, not touched**: `BSU`'s missing `sortOrder` field (see above).
- **1 residual, out-of-scope UI limitation flagged, not fixed**: the UI's `isCore`-gated Archive button/guard would block re-archiving these 5 keys via the UI if they are ever un-archived in the future (see Code change, "Not touched").

## Files changed

- [src/services/kpiRegistryService.ts](src/services/kpiRegistryService.ts) — 3 edits (2 restriction removals + 1 pre-existing bug fix)
- [src/services/kpiRegistryService.archiveCoreKeys.test.ts](src/services/kpiRegistryService.archiveCoreKeys.test.ts) — new test file
- [src/services/kpiArchiveGuard.test.ts](src/services/kpiArchiveGuard.test.ts) — extended
- [src/engine/kpiCompatibility/buildAllowedEntryKeysHardening.test.ts](src/engine/kpiCompatibility/buildAllowedEntryKeysHardening.test.ts) — extended
- [src/engine/kpiCompatibility/milestone35Registry.test.ts](src/engine/kpiCompatibility/milestone35Registry.test.ts) — one test renamed/clarified
- [docs/production/KPI_CORE_ARCHIVE_COMPLETION_REPORT.md](docs/production/KPI_CORE_ARCHIVE_COMPLETION_REPORT.md) (this file)
- [docs/production/KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md](docs/production/KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md) — updated
- [docs/production/FULL_RESET_EXECUTION_REPORT.md](docs/production/FULL_RESET_EXECUTION_REPORT.md) — updated
- [docs/production/FULL_RESET_POST_CHECKLIST.md](docs/production/FULL_RESET_POST_CHECKLIST.md) — updated
- [docs/production/PRODUCTION_READINESS_ARCHITECTURE.md](docs/production/PRODUCTION_READINESS_ARCHITECTURE.md) — updated

No Firestore rules, index, or other application source file was changed.

## Auth changes

**None.** No Firebase Auth account was created, modified, or deleted.

## Deployment

**None.** No `firestore.rules` change, no index change, no commit, no push, no deploy. All code changes remain uncommitted, staged for review, exactly as this task required ("stop before commit, push, or deploy").

## Final decision

**ALL 18 KPI DEFINITIONS ARCHIVED — READY FOR NEW KPI SETUP** — all 18 `kpi_registry` documents are now archived (0 active), 0 documents deleted, all 21 evaluation profiles remain archived (0 active), all historical data (evaluation results, audit logs, kpi audit logs, users, pharmacies) unchanged and fully preserved, the full test suite (25,651 tests) and production build pass cleanly, and the owner-authorized code restriction was lifted exactly as scoped with no broader refactor. The registry is now empty of active definitions and ready for the owner to add new KPI definitions from scratch, per the original objective.
