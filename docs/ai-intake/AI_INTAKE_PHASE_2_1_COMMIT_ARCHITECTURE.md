# Universal AI Intake — Phase 2.1 Commit Architecture

## Root cause of the Phase 2 gap

Phase 2's `executeIntakeSession` called Phase 1's `commitJob()`, which
calls each domain adapter's `commitBatch()`. Every adapter's
`commitBatch()` is hard-wired to the **client** `firebase/firestore`
SDK (`addDoc`, `updateDoc`, `setDoc`, `getDoc` imported from
`firebase/firestore`, operating on the `db` singleton from
`src/services/firebase.js`, which is initialized with a browser API
key and relies on `auth.currentUser` for Firestore Security Rules to
authorize the write). A Netlify Function has no browser session and no
signed-in Firebase Auth user, so every one of those calls would be
rejected by Firestore Security Rules (`isAdmin() && ...` checks that
read `request.auth`) — a genuine production execute would fail with a
`PERMISSION_DENIED` the moment it reached Firestore.

## Commit-pipeline audit (dependency map, produced before code changes)

Traced every one of the 8 domains' `commitBatch()` to its terminal
Firestore call:

| Domain | Adapter | Service call | Collection | Doc-ID strategy | Merge behavior |
|---|---|---|---|---|---|
| REGION | `regionsAdapter.ts` | `regionService.createRegion`/`updateRegion` | `regions` | auto-ID (create) / existing lookup (update) | `setDoc(merge:true)` |
| GROUP | `groupsAdapter.ts` | `districtService.createDistrict`/`updateDistrict` | `districts` | auto-ID / existing lookup | `setDoc(merge:true)` |
| BRANCH | `branchesAdapter.ts` | `pharmacyService`/`dxPharmacyTypes` | `pharmacies` | auto-ID / existing lookup | `setDoc(merge:true)` |
| PHARMACIST | `pharmacistsAdapter.ts` | inline `users/{docId}` write | `users` | `pending_<employeeId>` (create) / existing UID (update) | `setDoc(merge:true)` |
| ASSIGNMENT | `assignmentsAdapter.ts` | `userService.transferUser` | `users` | existing UID only (never creates) | `updateDoc` |
| KPI_REGISTRY | `kpiRegistryAdapter.ts` | `kpiRegistryService.saveKpiDefinition` | `kpi_registry` | KPI `key` | `setDoc(merge:true)` |
| BRANCH_TARGET | `branchTargetsAdapter.ts` | `kpiService.saveTarget` | `targets` | `{pharmacyId}_{month}` | `setDoc(merge:true)`, flat field |
| PHARMACIST_TARGET | `pharmacistTargetsAdapter.ts` | `personalTargetService.savePersonalTarget` | `personal_targets` | `{userId}_{pharmacyId}_{month}` | `setDoc(merge:true)`, **nested `targets` sub-map** |
| BRANCH_ACTUALS | `branchActualsAdapter.ts` | `kpiService.saveKpiEntry` | `kpi_entries` | `{managerUid}_{pharmacyId}_{date}` | `setDoc(merge:true)`, **nested `kpiValues` sub-map** |
| PHARMACIST_ACTUALS | `pharmacistActualsAdapter.ts` | `kpiService.saveKpiEntry` | `kpi_entries` | `{userId}_{pharmacyId}_{date}` | `setDoc(merge:true)`, **nested `kpiValues` sub-map** |

Also confirmed: audit-log integration is `logAction()` (client SDK,
`addDoc` to `audit_logs`, plus a duplicate `kpi_audit_logs` write for
KPI Registry specifically); idempotency is `buildCommitOperationKey(jobId, identityKey)`
(pure function, SDK-agnostic — reused as-is); execution-result mapping
is the engine's `committed`/`skipped`/`failed` counters (create/update
were not split apart in Phase 1's result shape — Phase 2.1's new result
shape does split them, see below).

**Critical nuance discovered during the audit:** Firestore's
`setDoc(ref, data, {merge:true})` merges at the **top level** of the
document only. If `data` contains a nested object field (e.g.
`{targets: {wasfatyTarget: 100}}`), that entire `targets` map
**replaces** whatever `targets` map was already on the document — it
does **not** deep-merge individual keys inside it. KPI Targets
(`personal_targets.targets`) and KPI Actuals (`kpi_entries.kpiValues`)
depend on this NOT happening (multiple KPIs' values must coexist on
one document), so the original client-SDK adapters read the existing
sub-map first, merge in one key, and write the whole sub-map back.
This exact pattern had to be replicated in the new Admin path (see
`AI_INTAKE_PHASE_2_1_ADMIN_EXECUTOR.md`).

## Required architectural outcome — delivered

```
Phase 1 adapters (StagedImportRow.staged, already validated)
        │
        ▼
buildCommitPlan()  ──────────────────►  CommitPlan (operations[], skips[], conflicts[], validationFailures[])
        │                                        │
        │  (pure, SDK-agnostic, no Firestore     │
        │   write — I/O-shape mapping only,      │
        │   reuses Phase 1's validation 100%)     │
        │                                        │
        ▼                                        ▼
Client path (unchanged):              Admin path (new):
commitJob() → adapter.commitBatch()   AdminFirestoreCommitExecutor.execute(plan)
→ firebase/firestore (client SDK)     → firebase-admin/firestore
```

- **Shared**: domain validation, normalization, duplicate/update/conflict
  classification — 100% Phase 1, zero duplication. `buildCommitPlan.ts`
  reads only the already-validated `StagedImportRow.staged` object; it
  never re-derives business rules.
- **Client executor**: the existing `commitJob()`/`adapter.commitBatch()`
  pipeline **is** the client executor — no new class was introduced
  for it (see `AI_INTAKE_PHASE_2_1_COMMIT_PLAN.md`'s "why no
  `ClientFirestoreCommitExecutor` class" note). Still used, unchanged,
  by the browser `/ai-intake` and Data Exchange Studio pages.
- **Admin executor**: `AdminFirestoreCommitExecutor`
  (`netlify/functions/adminFirestoreCommitExecutor.ts`), the ONLY new
  code path that performs a real Firestore write for connector
  execution. See `AI_INTAKE_PHASE_2_1_ADMIN_EXECUTOR.md`.

## Deliberate architectural deviation: deterministic document IDs

Phase 1's browser adapters use Firestore auto-generated IDs (`addDoc`)
for REGION/GROUP/BRANCH creates, then look up the real existing
document ID for updates (a `where('code','==',...)` query). The Admin
path instead uses the entity's own `code` (uppercased) as the document
ID directly, for both create and update:

```ts
documentId: String(staged.code).toUpperCase()  // e.g. "RUH"
```

This is an intentional deviation, not a bug — it satisfies Step 4's
"deterministic document ID behavior" requirement directly and avoids a
second existing-ID-resolution read per row. Both conventions produce
valid, queryable Firestore documents; nothing downstream depends on
REGION/GROUP/BRANCH IDs being auto-generated (KPI Registry, Targets,
and Actuals reference regions/branches by `code`/`pharmacyId`, not by
Firestore auto-ID). PHARMACIST and ASSIGNMENT still use a real
resolved user UID (via `resolveExistingUserId`) — a pharmacist's
Firestore doc ID must eventually match their Firebase Auth UID once
they accept their invitation, so a deterministic-but-wrong ID here
would be actively harmful; the deviation is scoped to REGION/GROUP/BRANCH only.

## Deliberately deferred side effects (documented, not silently omitted)

The following best-effort UX enhancements from the original client-SDK
adapters are **not** replicated by the Admin path in Phase 2.1:

- `recomputeAssignedPharmacyIds` — manager/supervisor assigned-pharmacy
  cache recompute (triggered after ASSIGNMENT writes)
- `triggerHistorySnapshots` — fire-and-forget history snapshot trigger
  on KPI actuals writes
- the pharmacy↔district array denormalization
  (`assignPharmacyToDistrict`) in `branchesAdapter.ts`
- the dual-write to `kpi_audit_logs` that `saveKpiDefinition` performs
  alongside the standard `audit_logs` write (the Admin path writes only
  to `audit_logs`)

**Rationale:** these are all secondary caches/denormalizations layered
on top of the core write, not core to "was the record created/updated
correctly, idempotently, with an audit trail" — which is what Phase
2.1 was scoped to close. They are read-repair-able (a subsequent
browser-side save/re-save recomputes them) and do not affect
correctness of the primary entity documents. This is an explicit,
disclosed scoping decision, tracked as a Phase 2.1 limitation, not an
oversight.
