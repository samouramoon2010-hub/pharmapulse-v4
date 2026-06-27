# KPI & Targets Bundle (DX-4 / DX-5) — Implementation Record

Status: **Implemented and closed.** Builds on the closed DX-1/DX-2/DX-3 Organization
Onboarding bundle (`docs/dx/DX_STUDIO_ARCHITECTURE_V1.md`). Does not modify, redesign,
or depend on any change to that closed work.

## Scope

- **DX-4** — KPI Registry Import (Excel `KPI Registry` sheet -> `kpi_registry` collection).
- **DX-5a** — Branch Targets Import (Excel `Branch Targets` sheet -> `targets` collection).
- **DX-5b** — Pharmacist Targets Import (Excel `Pharmacist Targets` sheet -> `personal_targets` collection).

DX-6 and later bundles are explicitly out of scope and were not started.

## Architecture

All three domains implement the existing `ImportDomainAdapter<TRaw, TStaged, TCommitResult>`
contract (`src/services/dataExchange/importDomainAdapter.ts`) and run through the
unmodified DX-1 Import Job Engine (`createImportJob` / `runValidation` / `commitJob`,
`src/services/dataExchange/importJobEngine.ts`) — no engine changes were made.

DX-4/DX-5 have no inter-dependency on each other or on Groups/Branches/Pharmacists/
Assignments, so they do not go through `onboardingOrchestrator.ts`'s 4-domain
dependency-ordered pipeline. Instead, `src/services/dataExchange/kpiTargetsImportRunner.ts`
provides a single-domain validate/commit runner reusing:
- the same chunkSize:1 per-row commit convention as the onboarding adapters,
- the same `computeRowsSignature()` preview-staleness guard (imported from
  `onboardingOrchestrator.ts`, not duplicated),
- the same `import_jobs` Firestore staging collection via `FirestoreStagingRepository`.

### Adapters

| File | Domain | Commits via |
|---|---|---|
| `adapters/kpiRegistryAdapter.ts` | `KPI_REGISTRY` | `kpiRegistryService.saveKpiDefinition()` |
| `adapters/branchTargetsAdapter.ts` | `BRANCH_TARGET` | `kpiService.saveTarget()` (via `dxKpiTargetTypes.ts` wrapper) |
| `adapters/pharmacistTargetsAdapter.ts` | `PHARMACIST_TARGET` | `personalTargetService.savePersonalTarget()` |

No new Firestore collection was created. No parallel schema was introduced. Every
commit path delegates to the real, already-tested production service.

### Reference data

`kpiTargetsImportRunner.fetchKpiTargetsExistingData()` pre-fetches, once per run:
- the live KPI registry (`fetchKpiRegistryOnce()`),
- branches, and the CLAIMED-excluding pharmacist-by-employeeId/email maps
  (`fetchExistingOnboardingData()` — reused, not re-implemented).

`fetchExistingOnboardingData()`'s `ExistingPharmacistRecord` gained one additive field,
`active: boolean` (defaults to `true` for legacy docs without the field), so the
Pharmacist Targets adapter can distinguish "deactivated employee" from "unknown
identifier" without a second Firestore read or a parallel lookup.

## Target document integrity (confirmed before implementation)

- **Branch targets**: ONE document per branch+month, `targets/{pharmacyId}_{month}`,
  with dynamic `[kpiKey]Target` fields merged in via `setDoc(..., {merge:true})`
  (`kpiService.js` `saveTarget()`). Each import row writes exactly one KPI field;
  multiple rows for the same branch+month accumulate safely because Firestore merge
  only touches the fields present in that specific write.
- **Pharmacist targets**: ONE document per pharmacist+branch+month,
  `personal_targets/{userId}_{pharmacyId}_{month}`, holding a single
  `targets: Record<targetField, number>` map (`personalTargetService.ts`). Firestore
  `merge:true` on a nested object field REPLACES it wholesale, not deep-merges it — so
  naively calling `savePersonalTarget()` once per KPI row would silently clobber every
  other KPI target already on the doc. `pharmacistTargetsAdapter.ts` avoids this with
  an in-memory per-job cache (`targetsByDocId`) seeded from the existing doc and mutated
  cumulatively as each row for the same doc commits, always writing the full accumulated
  map. Verified by the "accumulates multiple KPI rows... without clobbering" test.
- Neither contract was redesigned. No second targets collection was introduced.

## Template field mapping and known deviations

Canonical templates (downloadable via `templateGenerator.ts`) use exactly the columns
the task requested. Columns with no field in the real production contract are accepted
as input (so nothing in a user's file is silently dropped without explanation) but are
**never persisted**, and the user is told so explicitly in the generated Instructions
sheet and in the row-level preview (`FIELD_NOT_PERSISTED` issue code):

| Requested column | Real field | Note |
|---|---|---|
| KPI Key | `key` | Required, camelCase, immutable after creation |
| KPI Name English | `label` | |
| KPI Name Arabic | `labelAr` | |
| Description English | `description` | |
| Description Arabic | — | **No field exists.** Registry has one English-only description. Accepted, not stored. |
| Unit | `unit` | `unitAr` defaults to `unit` on create, preserved on update — no separate input column |
| Category | `category` | Enum-validated |
| Lifecycle Stage | `lifecycleStage` | Authoritative governance field |
| Dashboard Enabled | `visibility.dashboardEnabled` | |
| Evaluation Enabled | — | **No field exists.** Used only as a hint to default a blank Lifecycle Stage; an explicit Lifecycle Stage always wins |
| Target Enabled | `visibility.targetInputEnabled` | |
| Direction | `direction` | Enum-validated |
| Aggregation Method | `aggregationType` | Enum-validated, optional |
| Decimal Precision | — | **No field exists.** Sanity-checked (0–6), never stored |
| Minimum Value / Maximum Value | — | **No field exists** — registry uses achievement-% thresholds (healthy/watch/risk/critical), not raw value clamps. Cross-checked (min ≤ max) if both present, never stored |
| Active | `isActive` | |
| Sort Order | `sortOrder` | |

Required-but-not-templated `KpiDefinition` fields (`shortLabel`, `weight`, `isCore`,
`thresholds`, `isPrimary`, `coachingAction`, `coachingActionAr`) get safe defaults on
CREATE (weight 0, isCore false, isPrimary false, standard thresholds, empty coaching
text) and are **preserved from the existing record on UPDATE** — bulk import never
strips governance metadata it has no column for.

Branch/Pharmacist Targets templates use exactly the 4/5 requested columns with no
deviation — `Notes`, `Source`, `Effective Date`, and `Status` were considered (per the
task's "optional valid fields only if supported by current production model") but have
no field in the real `targets`/`personal_targets` document contracts, so they were
excluded rather than invented.

## Validation rules (implemented)

**KPI Registry** (`kpiRegistryAdapter.ts`): required key/label, camelCase key format,
case-insensitive normalized-key uniqueness and cross-row duplicate detection, category/
direction/lifecycle-stage/aggregation-method enum validation, boolean normalization,
test/demo-pattern key promotion blocking, protected-core-key blocking (`wasfaty`,
`omnihealth`, `wellnessCard`, `basket`, `crossSelling` — any change is a CONFLICT),
illegal lifecycle-transition blocking (reuses `canTransitionKpiLifecycle()`, no
duplicated transition table), structural-vs-metadata change split (unit/direction/
aggregation/lifecycle/target-enabled changes are CONFLICT; label/description/category/
dashboard/active/sort-order changes are UPDATE).

**Branch Targets** (`branchTargetsAdapter.ts`): month format normalization (`YYYY-MM`,
`YYYY/MM`, and zero-padded `YYYY-M` accepted), branch existence + active check, KPI
existence + target-enabled + not-archived check, numeric/non-negative target value
(explicit zero is distinct from a missing/omitted row), within-file duplicate detection,
old-vs-new value diff (UPDATE) vs unchanged (SKIP).

**Pharmacist Targets** (`pharmacistTargetsAdapter.ts`): all of the above, plus
pharmacist identifier resolution (Employee ID -> email -> UID, in that order), CLAIMED
exclusion (inherited from `fetchExistingOnboardingData()` — a CLAIMED record simply
never appears in the lookup maps, so it reads as "unknown pharmacist", not a separate
code path), inactive-pharmacist rejection, identity-ambiguity CONFLICT (mirrors the
Pharmacists onboarding adapter), pharmacist/branch mismatch rejection.

## Commit semantics

Validate (zero writes) -> Preview (with a `previewSignature` fingerprint) -> explicit
user confirmation -> Commit. `commitKpiTargetsJob()` refuses to commit if (a) the job
already finished committing (status COMPLETED/PARTIALLY_COMPLETED), or (b) a fresh
re-validation's signature no longer matches what was previewed and confirmed — both
guards mirror `commitOnboardingJob()`'s existing pattern. Idempotency is verified by
dedicated tests: re-importing an identical file a second time always classifies as
SKIP and never creates a duplicate document.

## Security model

All three adapters require `actorRole === 'admin'` in `authorizeRow()` — matching the
existing `import_jobs` Firestore rule (admin-only create/update) and the established
Organization Onboarding adapters. **No permission was broadened.** No Firestore rules
or indexes were changed — `kpi_registry`, `targets`, and `personal_targets` writes
already route through their existing, unmodified production services and rules; no new
collection or compound query was introduced.

## Known limitations

- Pharmacist Targets import writes draft personal targets; publishing to make them
  pharmacist-visible remains a separate, existing, unchanged step
  (`publishPersonalTargets()` on the Personal Targets page).
- Decimal Precision and Minimum/Maximum Value are accepted for transparency but never
  persisted — see the deviation table above. If the production contract gains these
  fields in a future bundle, this adapter should be revisited.
- KPI key changes are never treated as an update — an exact-key match is required;
  renaming a KPI key is out of scope for this bundle (same posture the architecture doc
  recommends for "no current approved migration mechanism").

## Test/build/typecheck evidence

See the final closure report message in the session transcript for exact counts. In
summary: all new focused adapter/runner/template tests pass, the full suite is green,
the production build passes, and the TypeScript error count is at or below the DX-2/
DX-3 closure baseline with zero new errors.
