# KPI Registry Archive — Execution Report

**Authorization phrase received exactly:** `Archive All Current KPIs — Safe Registry Reset` (following an explicit refusal of the prior `CONFIRM DELETE ALL 18 KPI REGISTRY DEFINITIONS AND INVALIDATE DEPENDENT PROFILES` request, which asked for hard deletion of the registry — refused because it contradicted this project's own established "never delete `kpi_registry`" protection and would have broken the live application for real, active users).

**Project:** `pharmapulse-646de`
**Executed:** 2026-07-07, inside the confirmed real admin's own authenticated browser session (masked uid `2hs9***`, `role: admin`, `active: true`).
**Scope:** Archive (not delete) all current KPI definitions to the extent the existing schema safely allows, invalidate the evaluation profiles that depended on them, and preserve all history.

## Pre-execution verification

1. Project confirmed: `pharmapulse-646de`.
2. Authenticated user confirmed: masked uid `2hs9***`, `role: admin`, `active: true`.
3. `kpi_registry` recount: exactly 18 documents, matching the authorized scope.
4. Read all 18 KPI definitions in full (cached in the local snapshot).
5. Identified the existing lifecycle contract: `kpi_registry` documents use `isActive` (boolean), `uiStatus` (`ACTIVE`/`ARCHIVED`/`HIDDEN_FROM_INPUT`), and `lifecycleStage` (`draft` → `pilot_tracking` → `shadow_evaluation` → `production_evaluation` → `archived`, with `archived` reversible back to `pilot_tracking`). This is the same contract already implemented in `src/services/kpiRegistryService.ts`'s `archiveKpiDefinition()` — no new schema was invented.
6. Identified dependencies: all 21 `evaluation_profiles` documents reference at least one of the 18 KPI keys. Of these, 3 were `published` and 1 was `draft` (the only non-archived profiles); the remaining 17 were already `archived`. `src/services/kpiArchiveGuard.ts` defines "safe to archive" as zero published/draft profile references — targets, actuals (`kpi_entries`), and `evaluation_results` references are informational only and never block archiving, since they are preserved automatically.
7. **Constraint found in the existing schema:** `src/services/kpiRegistryLogic.ts` hard-codes `PROTECTED_CORE_KEYS = new Set(['wasfaty','omnihealth','wellnessCard','basket','crossSelling'])`, and `archiveKpiDefinition()` in `kpiRegistryService.ts` explicitly throws `Error('KPI "..." is a protected core KPI and cannot be archived.')` for any of these 5 keys. This is an intentional, pre-existing guard — not something introduced by this operation. Per the task's own instruction ("Do not invent a new schema if an existing lifecycle contract exists"), this guard was respected rather than bypassed.
8. **Active-profile-pointer check:** verified that `system_config` contains no separate "active profile pointer" document — `system_config/evaluation` is a V1/V2 evaluation-engine routing flag only (`src/services/evaluationEngineConfigService.ts`), unrelated to KPI Registry or profile selection. A profile's selectability is governed purely by its own `status === 'published'` field. This finding is documented honestly in `local-backups/.../active_profile_pointers.json` rather than inventing a pointer that doesn't exist.

## Local snapshot

**Path:** `local-backups/kpi-registry-archive-2026-07-07T00-55-00Z/` (git-ignored; `.gitignore` updated to exclude `local-backups/`).

| File | Contents | Verified |
|---|---|---|
| `kpi_registry.json` | Full contents of all 18 `kpi_registry` documents, pre-archive (Firestore Timestamps converted to ISO, tagged `__firestoreTimestamp`) | 18/18 present — confirmed by script count |
| `dependent_profiles.json` | Full contents of all 21 `evaluation_profiles` documents, pre-archive | 21/21 present — confirmed by script count |
| `active_profile_pointers.json` | Documents the finding that no separate active-profile pointer exists in `system_config` | N/A (informational) |
| `dependency_map.json` | Profile → referenced-KPI-key map for all 21 profiles, plus the 5 protected-core keys and the 5 non-protected keys that were blocked by active/draft profiles before those profiles were archived | N/A (informational) |
| `README.md` | Restore instructions and scope notes | N/A |

Snapshot completeness was verified by an independent script (`node -e ...`) counting entries in both JSON files before any mutation began: `kpi_registry.json count: 18 OK`, `dependent_profiles.json count: 21 OK`.

## Dependent profiles invalidated

Archived (in this order, before any KPI was touched):

| Profile ID (masked) | Name | Before | After |
|---|---|---|---|
| `ChR611F***` | Dynamic Test Profile v2 | published | archived |
| `HWEmbLm***` | SMARTS 2026 — Pharmacist Evaluation v1 | draft | archived |
| `Pz5M8Sm***` | Dynamic Test Profile v1 | published | archived |
| `gL61UfB***` | SMARTS 2026 — Pharmacist Evaluation v1 | published | archived |

Post-archive recount of `evaluation_profiles`: 21 total, **0 published, 0 draft, 21 archived** — confirmed no active/selectable profile remains that could reference any KPI. Each archive used the exact write shape already implemented in `evaluationRegistryService.ts`'s `archiveEvaluationProfile()`/`archiveDraftProfile()` (`status: 'archived'`, `archivedAt`, `updatedAt`, `updatedBy`), plus an `audit_logs` entry recording the before/after status per the existing `logAction()` convention. No profile document was deleted; no historical profile content was altered.

## Active profile pointers

None existed to clear. See pre-execution verification item 8 — this was verified, not assumed, before proceeding.

## KPI definitions archived

Of the 18 current KPI definitions, **13 were archived**, **5 were left active** because the existing `PROTECTED_CORE_KEYS` guard in `kpiRegistryLogic.ts`/`kpiRegistryService.ts` refuses to archive them:

| KPI key | Result | Note |
|---|---|---|
| `BSU`, `NPS`, `SLC`, `guestConversion`, `holista`, `inbody`, `insuranceConversion`, `liberation`, `manuka`, `ndf`, `sales`, `sl`, `testdynamickpi` | **Archived** | `isActive: false`, `uiStatus: 'ARCHIVED'`, `lifecycleStage: 'archived'` written via the same shape as `archiveKpiDefinition()`, plus a `kpi_audit_logs` entry and an `audit_logs` entry per KPI |
| `wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling` | **NOT archived — blocked by existing `PROTECTED_CORE_KEYS` guard** | These 5 remain `isActive: true`, `uiStatus: 'ACTIVE'`. This is the existing application's own permanent safeguard on its 5 highest-weight, longest-standing KPIs, not a limitation introduced by this operation |

Before archiving, all 4 dependent profiles were confirmed archived (0 published/draft remaining), satisfying the `kpiArchiveGuard.ts` "safe" condition for every one of the 13 KPIs archived.

**Document IDs are the KPI keys themselves** (not opaque IDs) — they are shown in full above per this task's own instruction to mask only where appropriate; these are short, non-sensitive business labels, not user identifiers.

## Protected data verification

| Item | Before | After |
|---|---:|---:|
| `kpi_registry` total documents | 18 | **18** (unchanged — no document deleted, only field updates) |
| `kpi_registry` active | 18 | **5** (the 5 protected-core KPIs) |
| `kpi_registry` archived | 0 | **13** |
| `evaluation_profiles` total | 21 | **21** (unchanged) |
| `evaluation_profiles` published/draft | 3 / 1 | **0 / 0** |
| `evaluation_results` | 111 | **111** (unchanged — never touched) |
| `users` | 10 | **10** (unchanged) |
| `pharmacies` | 4 | **4** (unchanged) |
| Protected admin | active, `role: admin` | **confirmed still active, still `role: admin`, still signed in** |
| `audit_logs` | 851 | **869** (+18: 4 profile-archive entries + 13 KPI-archive entries + 1 incidental login/logout event from re-establishing the session) |
| `kpi_audit_logs` | 0 | **13** (one append-only entry per archived KPI, per the existing `logKpiAudit()` convention) |

## Post-archive smoke test (live)

| Page | Result |
|---|---|
| `/entry` (KPI Entry) | Loads cleanly, zero console errors. Only the 5 protected-core KPIs (Wasfaty, OmniHealth, Wellness Card, Basket Size, Cross Selling) are shown for new entry — the 13 archived KPIs no longer appear (`"kpis: 5"` shown in the page's own diagnostic line, down from 14 before this operation) |
| `/targets` | Loads cleanly, zero console errors |
| `/dashboard` | Loads cleanly, zero console errors |
| `/reports` | Loads cleanly, zero console errors |
| `/admin/rankings` | Loads cleanly, zero console errors, shows the expected "⚠ No published evaluation profiles found. Publish a profile first." empty state — exactly the "clear no-active-profile" state required |
| `/data-exchange` | Loads cleanly, zero console errors |
| `/admin/kpis` (KPI Management) | Loads without crashing. Header shows "17 definitions · 5 active" (12 archived) instead of the expected 18/5/13 — see **Defect found** below |

## Defect found (pre-existing, NOT caused by this operation)

`src/services/kpiRegistryService.ts:89` — `subscribeKpiRegistry()`'s live listener uses `query(registryCol(), orderBy('sortOrder', 'asc'))`. Firestore's `orderBy` silently excludes any document that lacks the ordered field entirely. The `BSU` KPI document has never had a `sortOrder` field (confirmed by reading its raw document both before and after this operation), so it has always been invisible to this specific query — and therefore invisible on the `/admin/kpis` management page — regardless of this archive operation. Verified directly: `getDoc(doc(db,'kpi_registry','BSU'))` confirms the document exists, was correctly archived (`isActive: false`, `uiStatus: 'ARCHIVED'`, `lifecycleStage: 'archived'`), and simply has `hasSortOrder: false`. This is a pre-existing list-completeness gap in an unrelated query, not a crash, and not something this task's restrictions permit fixing (no application-code changes were made). Reported here per the task's own instruction to report page defects rather than silently work around them.

## Orphan/reference check

- No `kpi_entries`, `targets`, or `personal_targets` document was touched — all historical actuals/targets referencing the now-archived KPI keys remain exactly as they were, still resolvable in Reports.
- All 21 `evaluation_profiles` documents remain intact with their full `baskets`/`elements` content unchanged — archiving only changed their `status` field, never their KPI references.
- `evaluation_results` (111 documents) untouched — every historical score computed against any of the 13 now-archived KPIs remains fully intact and traceable.

## Errors or skips

- **0 errors** on the 4 profile archives and the 13 KPI archives — all completed successfully.
- **5 KPIs intentionally not archived** (`wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling`) — blocked by the existing `PROTECTED_CORE_KEYS` guard, not attempted via any bypass.
- **1 pre-existing defect surfaced** (`BSU` missing `sortOrder`, causing it to be invisible on `/admin/kpis`) — documented above, not fixed (out of scope for a data-only operation).

## Files changed

- [.gitignore](.gitignore) — added `local-backups/`
- `local-backups/kpi-registry-archive-2026-07-07T00-55-00Z/` (5 new files — git-ignored, not part of the tracked repo)
- [docs/production/KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md](docs/production/KPI_REGISTRY_ARCHIVE_EXECUTION_REPORT.md) (this file)
- [docs/production/FULL_RESET_DELETE_MANIFEST.md](docs/production/FULL_RESET_DELETE_MANIFEST.md)
- [docs/production/FULL_RESET_EXECUTION_REPORT.md](docs/production/FULL_RESET_EXECUTION_REPORT.md)
- [docs/production/FULL_RESET_POST_CHECKLIST.md](docs/production/FULL_RESET_POST_CHECKLIST.md)

No application source file was modified.

## Auth changes

**None.** No Firebase Auth account was created, modified, or deleted.

## Deployment

**None.** No `firestore.rules` change, no index change, no application code change, no commit, no push, no deploy.

## Final decision

**KPI REGISTRY ARCHIVE PARTIALLY COMPLETED** — 13 of 18 KPI definitions archived exactly as authorized, all 4 dependent (published/draft) evaluation profiles archived first, zero active/selectable profiles remain, all history preserved, zero errors. 5 of 18 KPIs (`wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling`) could not be archived because the application's own existing `PROTECTED_CORE_KEYS` safeguard explicitly forbids it — this is a deliberate, pre-existing design decision in the codebase, not a limitation of this operation, and per the task's instruction not to invent a new schema or bypass an existing safety mechanism, it was respected rather than overridden. If the owner wants these 5 archived too, that requires a separate, explicit decision to first modify the `PROTECTED_CORE_KEYS` constant in application code — which is a code change, out of scope for this data-only operation. Additionally, one pre-existing, unrelated product defect was surfaced (the `BSU` KPI's missing `sortOrder` field hiding it from the `/admin/kpis` page) and is reported above rather than fixed.

---

## UPDATE (2026-07-07, follow-up pass): remaining 5 core KPIs archived

The owner subsequently authorized "Archive Remaining 5 Protected Core KPIs" — a code change lifting the `PROTECTED_CORE_KEYS` archival restriction for exactly these 5 keys (tests-first, full validation, then live archive). All 5 (`wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling`) are now archived. `kpi_registry` final state: **18 total, 0 active, 18 archived**. Full detail — code change, 165 new/extended focused tests, full 25,651-test suite pass, build pass, and the live execution — is in `docs/production/KPI_CORE_ARCHIVE_COMPLETION_REPORT.md`.

**Final decision for that follow-up pass: ALL 18 KPI DEFINITIONS ARCHIVED — READY FOR NEW KPI SETUP.**
