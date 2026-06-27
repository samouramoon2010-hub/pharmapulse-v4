# PharmaPulse Data Exchange Studio V1 — Architecture Review

Status: **Architecture & planning only. No production code, no Firestore changes, no collections created.**
Baseline: `feature/data-exchange-studio-v1` @ `2d978fc56e522320a789cfee767424c52c71f1c8`, derived from tag `foundation-closed-v1.0`.

---

## 1. Existing-System Audit

Full file-level audit performed (file:line references retained in PR history / agent transcript). Summary table:

| Path | File(s) | Input | Volume today | Commit model | Validation | Preview | Duplicate handling | Audit |
|---|---|---|---|---|---|---|---|---|
| Pharmacies bulk | `pharmacyService.js` (`bulkImportPharmacies`), `ImportCenterPage.jsx` | Excel | ~100–500 | sequential `addDoc` one-at-a-time | required fields only | flat table, no gate | code-uniqueness query, skip | per-record `logAction` |
| Users bulk | `userService.js` (`createUser`), `ImportCenterPage.jsx` | Excel | ~50–100 | sequential Firebase-Auth REST + `setDoc`, one-at-a-time | Auth-layer only (email/password) | flat table, no gate | email-uniqueness query, skip | per-record `logAction` |
| Targets bulk | `kpiService.js` (`saveTarget`), `ImportCenterPage.jsx` | Excel | ~100–500 | sequential `setDoc(merge)` one-at-a-time | numeric coercion only | flat table, no gate | none — overwrites `pharmacyId_month` | per-record `logAction` |
| KPI entries bulk | `kpiImportService.ts`, `ingestion/stagingValidator.ts`, `ingestion/ingestionSafetyGuards.ts` | Excel | **2,000 rows hard cap** (`INGESTION_LIMITS.MAX_ROWS_PER_BATCH`) | `writeBatch()` chunked at 400 | full: date range (90-day lookback), numeric bounds, registry lookup, unknown-column flagging | **staged preview + safety report + explicit commit gate** | within-batch dedup by `submittedBy:pharmacyId:date`, deterministic doc-ID upsert | one batch-level `logAction` + fire-and-forget history recompute |
| Personal targets | `personalTargets/allocationEngine.ts`, `personalTargetService.ts` | API (no file) | 1–100 | `Promise.all()` (not batched) for save; `writeBatch()` for publish | numeric only | none | overwrites `userId_pharmacyId_month` | per-op `logAction` |
| KPI Registry | `kpiRegistryService.ts`, `KpiEditorModal.jsx` | UI form only | 1 | single `setDoc(merge)` | full (key format, thresholds, lifecycle transitions, core-key immutability) | none | key is doc ID, immutable | dual: `kpi_audit_logs` + `audit_logs` |
| KPI entry manual | `KpiEntryPage.jsx`, `kpiService.js` (`saveKpiEntry`) | UI form | 1 | single `setDoc(merge)`, deterministic doc ID `userId_pharmacyId_date` | numeric sanitize via live registry | none (immediate) | overwrite via merge | per-entry `logAction` |
| Historical/migration | `src/migration/0001_add_branch_classification.ts` | none (internal schema migration) | all docs | `writeBatch()` chunked at 450, idempotent, dry-run + rollback supported | schema-version gated | dry-run report | idempotent (schemaVersion check) | none beyond migration's own return value |

**What is directly reusable (no need to reinvent):**
- The **staging → validate → preview → safety-gate → commit** pattern from `stagingValidator.ts` / `ingestionSafetyGuards.ts` is the single best existing primitive in the codebase and should become the *generic* backbone for every Data Exchange Studio domain, not just KPI entries.
- `kpiImportService.ts`'s column-resolution strategy (`COLUMN_MAP` → `LEGACY_KPI_COLUMN_MAP` → `resolveDynamicKpiColumn()` against the live Registry, with explicit `unknownKpiColumns` flagging) is exactly the registry-driven mapping model the new domains (Targets, Actuals, KPI Registry import) should follow — generalize, don't replace.
- `XLSX` (SheetJS) is already the parsing library in use; no new dependency needed.
- `writeBatch()` chunked at 400–450 is the established Firestore batching convention; reuse it.
- `auditService.logAction()` is the established audit primitive; reuse it, but it needs to become **row-aware for bulk jobs** (see Part 7).
- `accessGuard.ts` role/scope primitives (`isAdmin`, `isManager`, `guardPharmacyAccess`, territory guards) are the correct base for Studio permission checks — Phase 1 territory scoping (district/regional) exists structurally but isn't fully enforced yet; Data Exchange Studio must not assume it's complete (see Part 9 / Hard Stops).

**What is technical debt to be aware of, not fixed in this review:**
- Pharmacies/Users/Targets bulk paths are **sequential, unbatched, un-previewed, non-resumable** — they work today only because volumes are small. They must NOT be silently reused as-is for "thousands of rows"; they need the same staging treatment KPI entries already have.
- No cross-batch deduplication anywhere (only within-batch for KPI entries).
- No rollback mechanism exists anywhere in the system today — `audit_logs` and `kpi_audit_logs` are both append-only with no undo endpoint.
- No historical-data import path exists; importing the past means importing `kpi_entries` with past dates (subject to the 90-day lookback guard, which would need a domain-specific exception — see Part 2-I).
- `staging_entries` collection already exists in `firestore.rules` and `COL` — it's allocated but, per the audit, used narrowly; this is the natural seed for a generalized Import Job staging area.

---

## 2. Data Exchange Studio Architecture (overview)

**Core principle:** one generic **Import Job Engine** + **N domain adapters**, not N bespoke import pipelines.

```
                    ┌─────────────────────────────────────────┐
                    │           Import Job Engine               │
                    │  (file parse · staging · validation       │
                    │   orchestration · batching · progress ·   │
                    │   audit · job lifecycle)                  │
                    └───────────────┬─────────────────────────┘
                                    │ implements common interface
        ┌─────────────┬────────────┼────────────┬─────────────┬──────────────┐
        ▼             ▼            ▼            ▼             ▼              ▼
   Org/Group      Branch        Pharmacist   Assignment   KPI Registry   Target /
   Adapter        Adapter       Adapter      Adapter      Adapter        Actual /
                                                                          Historical
                                                                          Adapters
```

Each **Domain Adapter** is a small, independently testable module implementing:
```ts
interface ImportDomainAdapter<TRaw, TStaged, TCommitResult> {
  domainId: string                                  // 'branch', 'pharmacist', 'kpi-registry', ...
  parseRow(rawRow: Record<string, unknown>, ctx: MappingContext): TRaw
  resolveColumns(headerRow: string[], ctx: MappingContext): ColumnMapping
  validateRow(raw: TRaw, ctx: ValidationContext): ValidationResult<TStaged>
  identityKey(staged: TStaged): string              // idempotency / duplicate key
  diffAgainstExisting(staged: TStaged, existing: unknown | null): RowDecision
  commitBatch(staged: TStaged[], ctx: CommitContext): Promise<TCommitResult>
}
```
This mirrors exactly what `kpiImportService.ts` already does informally for KPI entries — the change is making the same shape explicit and reusable so Branches/Pharmacists/Assignments/Registry/Targets/Actuals/Historical don't each reinvent validation, batching, and audit.

**Why this shape, not a rewrite:** `parseExcelRowsToRaw` / `validateBatch` / `partitionForCommit` / `stagedToKpiEntry` already are 4 of these 6 interface methods for the KPI-entries domain. Extracting the interface lets that exact code become `KpiActualAdapter` with zero behavior change, while giving the other 8 domains the same safety properties they currently lack.

---

## 3. Import-Domain Contracts (Part 2)

For every domain: required/optional columns, identity key, validation, duplicate/update/conflict rules, commit destination, permissions, audit, rollback feasibility.

### A. Organization / Group Import
- **Required:** `groupId` (or auto-generate), `groupName`
- **Optional:** `region`, `district`, `managerEmail`, `status`, `parentGroupId`
- **Identity key:** `groupId` if supplied, else slug of `groupName` + region (must be deterministic, never random, to keep re-imports idempotent)
- **Validation:** name non-empty; manager email (if present) must resolve to an existing user with manager-eligible role, else **warning**, not error (manager can be assigned later); `parentGroupId` must reference an existing group or be absent — unknown parent is a **blocking error** (no silent orphan groups)
- **Duplicate rule:** existing `groupId` with different `groupName` → **conflict**, requires explicit Update/Skip/Reject decision, never silent overwrite
- **Update rule:** if row's `groupId` matches an existing doc and only non-identity fields differ → classified `Update`, previewed as a diff
- **Commit destination:** new `groups` collection (does not exist yet — design only; not created in this task)
- **Permissions:** org admin only
- **Audit:** one `logAction` per created/updated group (small N, no need for batch summarization)
- **Rollback:** feasible — group creation is additive and low-volume; a rollback simply marks `status='archived'` (soft) since branches may already reference the group by the time deletion is requested

### B. Branch Import
- **Required:** `branchCode`, `branchName`, `region` or `groupId`
- **Optional:** `district`, `address`, `managerEmail`, `status`, `effectiveFrom`, `effectiveTo`
- **Identity key:** `branchCode` (matches existing `pharmacyCodeExists()` uniqueness check already in `pharmacyService.js`)
- **Validation:** code format (alnum, no whitespace); `groupId`/`region` must resolve; `managerEmail` must resolve to a user or be blank (manager can be assigned later, same as A)
- **Duplicate rule:** existing `branchCode` with different `branchName`/`region` → **conflict**, never silently renamed (this directly matches a rule the task explicitly calls out)
- **Update rule:** matching code + only metadata changed → `Update`
- **Commit destination:** existing `pharmacies` collection — **reuse**, do not fork a new collection
- **Permissions:** org admin, regional manager (own region only)
- **Audit:** per-record `logAction` (existing pattern), reused as-is
- **Rollback:** feasible for newly created branches with zero dependent records (no kpi_entries/targets yet); **not safely reversible** once a branch has dependent KPI/target data — must be disclosed in the UI, not silently allowed

### C. Pharmacist / User Import
- **Required:** `employeeId` or `email`, `name`, `role`
- **Optional:** `branchCode`, `groupId`, `managerEmail`, `employmentStatus`, `joiningDate`, `leavingDate`
- **Identity key:** `email` (Firebase Auth's own identity) — `employeeId` is a secondary uniqueness check, both enforced
- **Authentication behavior:** this is the single highest-risk domain. Current `createUser()` creates a **live Firebase Auth account with a password** synchronously per row. At bulk scale this is unacceptable as-is (rate limits, no password-delivery channel, no email verification flow). **Architecture decision:** Data Exchange Studio must NOT create Auth accounts with an admin-supplied password. Instead: stage the Firestore `users/{uid}` profile in a **pending-invitation** state with no Auth account yet, and either (a) trigger Firebase Auth's own invite/passwordless-link flow per user post-commit, or (b) require the org admin to use the existing one-by-one `createUser()` flow for actual account activation, with bulk import only pre-populating profile + role + branch assignment. This is flagged explicitly in Hard Stops (Part 13) as a decision the user must confirm before DX-2 implementation.
- **Validation:** role must be one of the existing `UserRole` enum values from `accessGuard.ts`; branch/group must resolve; territory-role creation guard (district/regional managers limited to assigned branches) must be enforced identically to the existing one-by-one path
- **Duplicate rule:** existing email or employeeId → **conflict**, requires explicit decision (most commonly Update role/branch, rarely Skip)
- **Update rule:** matching identity + only role/branch/status differ → `Update`, previewed as diff, **never silently changes a password or re-triggers invitation** on update
- **Commit destination:** existing `users` collection — reuse
- **Permissions:** org admin; territory managers limited to their assigned scope (existing guard, reused)
- **Audit:** per-record `logAction`, reused
- **Rollback:** profile-only rollback is safe (soft-deactivate); rollback of an already-activated Auth account is **out of scope** — Auth account lifecycle is not git-trackable/reversible by this system, must be disclosed as a hard limitation

### D. Assignment Import
- **Required:** `pharmacistIdentity` (email or employeeId), `branchCode`, `assignmentType` (primary/secondary)
- **Optional:** `effectiveFrom`, `effectiveTo`, float/joker flag (flagged as **not supported in V1** — no existing data model for it; explicitly deferred, not silently dropped)
- **Identity key:** `pharmacistId + branchId + effectiveFrom`
- **Validation:** pharmacist and branch must both resolve (unknown reference is a **blocking error**, never silently skipped); a pharmacist may have at most one **primary** assignment active at a time — a second primary for an overlapping date range is a **conflict**, not an error (the user may intend a transfer)
- **Duplicate rule:** identical `(pharmacistId, branchId, effectiveFrom)` already staged/committed → exact duplicate, auto-skip with notice
- **Update rule:** same pharmacist+branch, different `effectiveTo` → `Update` (e.g., closing out an assignment)
- **Commit destination:** today this is represented as a *field on the user document* (`pharmacyId`, and Phase-1B fields `assignedPharmacyIds`/`assignedDistrictIds`) rather than a separate assignment record. **Architecture decision:** V1 of Assignment Import writes to the existing user-document fields (no new collection), but the *staged* representation is row-level so a future "true assignment history" collection can be introduced later without re-touching this import path's contract.
- **Permissions:** org admin, regional/group manager for their own scope
- **Audit:** per-record `logAction` against the `users` collection (reused)
- **Rollback:** feasible — reassign back to prior values, since prior value is recorded in the diff at staging time

### E. KPI Registry Import
- **Required:** `kpiKey`, `label`, `unit`, `dataType`, `direction`
- **Optional:** `engineKey`/`aliasFor`, `labelAr`, `description`, `category`, `targetSupport` (bool), `dashboardVisible` (bool), `isActive`, `allowedScope`, display metadata (icon, color, sortOrder)
- **Identity key:** `kpiKey` (matches existing doc-ID-is-key convention in `kpiRegistryService.ts`)
- **Validation:** reuses **all** existing `saveKpiDefinition()` validation rules verbatim (key format, weight bounds, lifecycle-stage transition legality, core-key immutability) — Data Exchange Studio must call the *same* service function per row, not duplicate its rules
- **Duplicate rule:** existing key with different metadata → **conflict** (diff shown field-by-field); core keys (`wasfaty`, `omni`, `wellness`, `basket`, `crossSelling`) can never be created/altered via import — hard block, matching `PROTECTED_CORE_KEYS` guard already in the service
- **Update rule:** existing key, compatible field changes only → `Update`
- **Explicit non-goal, stated by the task and enforced architecturally:** creating a KPI Registry entry **never** touches any `evaluation_profiles` document. The import adapter must not import, merge, or write basket/element data of any kind. This is a hard boundary between Registry import and Profile Studio, preserved intentionally.
- **Commit destination:** existing `kpi_registry` collection — reuse, route through `saveKpiDefinition()`
- **Permissions:** admin only (matches existing rule)
- **Audit:** dual audit already exists (`kpi_audit_logs` + `audit_logs`) — reused, made batch-aware (see Part 7)
- **Rollback:** registry entries are soft-archived only (matches existing `archiveKpiDefinition()`); a newly-imported, never-used key can be hard-deleted only if Firestore rules are changed (they currently deny delete) — **not proposed**, rollback = archive

### F. Branch Target Import
- **Required:** `branchCode`, `period` (month), `kpiKey`, `targetValue`
- **Optional:** `version`/`source`, `effectiveDate`
- **Identity key:** `branchId + kpiKey + period`
- **Validation:** `kpiKey` must resolve to an **active** Registry KPI (registry-driven, reusing `getAllocatableTargetFields`/registry lookup, not the legacy 5-field hardcode); branch must resolve; `targetValue` numeric, finite, non-negative (reusing `parseKpiValue`-style bounds)
- **Duplicate rule:** existing target for the same `(branch, kpi, period)` → **conflict**, not silent overwrite (current `saveTarget()` silently overwrites — this is the one place Data Exchange Studio's behavior is intentionally *stricter* than the existing one-by-one path, by design, since bulk overwrite risk is much higher)
- **Update rule:** explicit user confirmation of "replace existing target" vs "keep existing, skip"
- **Commit destination:** existing `targets` collection — reuse, but written via batched `writeBatch` (not `saveTarget()`'s one-by-one) once validated
- **Permissions:** branch manager (own branch), regional/group manager (own scope), admin
- **Audit:** per-record audit linked to job ID (Part 7), not just batch-level
- **Rollback:** feasible if the prior value was captured at staging time (store `previousValue` in the diff) — restore is a direct write of the prior value, audited as a rollback action

### G. Pharmacist Target Import
- Same shape as F, scoped to `pharmacistId` instead of `branchId`. **Identity key:** `pharmacistId + branchId + kpiKey + period`.
- **Distinct rule:** must respect the existing allocation invariant from `allocationEngine.ts` — `Σ personalTargets[field] === branchTargets[field]`. Bulk-imported personal targets that do not sum to the branch target for that KPI/period are a **warning**, not a blocking error (the branch target may not exist yet, or may be intentionally distributed unevenly) — but the discrepancy must be surfaced in the preview, never silently accepted.
- **Commit destination:** existing `personal_targets` collection, written via the existing `status: 'draft'` → `publishPersonalTargets()` two-step lifecycle (reused, not bypassed) so bulk-imported targets go through the same draft/publish safety gate as manually-allocated ones.
- **Permissions, audit, rollback:** same posture as F.

### H. KPI Actual Import
- This domain **is** today's KPI-entries bulk import (`kpiImportService.ts`). **Architecture decision: do not rebuild it — wrap it.** Promote its existing logic into the `KpiActualAdapter` implementation of the common interface with no behavioral change, then let Studio's job/staging/audit layer sit on top.
- **Required:** scope identity (`pharmacistId` or `branchId`), `kpiKey`, `date`, `actualValue`
- **Optional:** `source`, `referenceId` (for reconciliation against external systems)
- **Identity key:** unchanged — `submittedBy:pharmacyId:date` (entry-level), extended with `kpiKey` when actuals are imported as one-row-per-KPI rather than one-row-per-day-with-many-columns (both shapes must be supported at the mapping layer — see Part 3).
- **Validation, duplicate, commit:** unchanged from current `validateRow`/`partitionForCommit`/`stagedToKpiEntry`/`writeBatch(400)`.
- **Permissions, audit:** unchanged.
- **Rollback:** unchanged limitation — none today; Part 7 proposes the minimum viable rollback for *this* domain specifically since it's the highest-volume one.

### I. Historical Data Import
- **Required:** same as H, plus an explicit `isHistorical: true` row classification
- **Key architectural conflict to flag now:** `stagingValidator.ts`'s `HISTORICAL_LOOKBACK_DAYS = 90` guard exists specifically to prevent ordinary KPI-actual imports from injecting old/backdated data unnoticed. A Historical Data Import domain **must bypass this guard intentionally** — but only under a separate permission gate and a separate, explicitly-labeled job type, never by silently raising or removing the constant for all imports.
- **Compatibility rules:** legacy column aliases (`LEGACY_KPI_COLUMN_MAP`) apply identically; this domain is the one place those aliases matter most (historical files are the most likely to use old header names).
- **Classification:** read-mostly / migration-classified data — historical rows should be marked `source: 'HISTORICAL_IMPORT'` (extending the existing `IngestionSource` union, additive) so downstream history-engine recomputation can treat them distinctly from live daily entry if ever needed.
- **Commit destination:** existing `kpi_entries` (same collection as H — no fork), then the existing fire-and-forget history-snapshot recompute is **required**, not optional, since historical rows are exactly the case where `daily_summaries`/`monthly_summaries` must be backfilled, not just the live entry.
- **Permissions:** admin only (highest-risk domain after Pharmacist/User import) — bypassing the lookback guard must never be available to branch/regional managers.
- **Rollback:** same limitation as H — flagged, not solved, in V1.

---

## 4. File & Mapping Experience (Part 3)

**Flow:** Upload → Detect structure → Select import type → Map columns → Validate → Preview → Resolve conflicts → Confirm → Commit → Audit report. This generalizes the existing KPI-entries flow (already implements 5 of these 9 steps) to all 9 domains uniformly.

- **File types:** `.xlsx`, `.xls`, `.csv` — unchanged, `XLSX` (SheetJS) already handles all three; no new library needed.
- **Multi-sheet support:** new capability — for domains where one workbook plausibly contains multiple related entities (e.g., a single onboarding workbook with `Branches`, `Pharmacists`, `Assignments` sheets), the upload step must let the user pick "one sheet = one domain" or "auto-detect by sheet name match against domain templates." Auto-detect is a convenience, never a silent commitment — the user always confirms the sheet→domain mapping before validation runs.
- **Column mapping:** generalizes `kpiImportService.ts`'s existing `COLUMN_MAP` → registry-key-matching cascade into a **per-domain mapping resolver**: structural-field aliases (explicit map, like today) → registry-key matching (`kpiKey`, `engineKey`/`aliasFor`, `label`, `labelAr`) for KPI-bearing domains → unmatched numeric-looking columns flagged, never silently dropped (existing `unknownKpiColumns` pattern, generalized to `unknownColumns` for every domain).
- **Saved mapping templates:** a mapping (source-header → target-field) can be saved per org per domain so repeat imports (e.g., a payroll system's monthly export) don't require re-mapping. Stored as a small JSON blob keyed by `(orgId, domainId, mappingName)`.
- **Arabic/English headers:** both must resolve via the same alias table — this already works for the 5 legacy KPIs (`'Wasfaty'`/`'وصفتي'`) and must extend identically to every new structural/domain field (e.g., `'Branch Name'`/`'اسم الفرع'`).
- **Date/number locale parsing:** reuse the existing multi-format date parser (`stagingValidator.ts` already tries ISO, `dd/MM/yyyy`, `dd-MM-yyyy`) and extend the same tolerance to comma-decimal numbers (e.g., `"1,234.56"` vs `"1.234,56"`) — detect by sampling the column, not by a global locale switch, since a single file may mix admin-entered and system-exported columns.
- **Excel-formula values:** SheetJS already returns *computed* values for formula cells by default (`cellFormula: false` is the default read mode) — no special handling needed beyond confirming the read option is consistent across all domains (currently set ad hoc per call site; should be centralized in the shared parser).
- **Empty-row cleanup:** rows that are 100% blank across all mapped columns are silently dropped pre-validation (not even shown as Skip) — rows with *some* data but missing required fields are real validation errors, never silently dropped.
- **Hard rule preserved:** no direct file→Firestore path exists anywhere in this design. Every domain passes through staging + preview + explicit confirm, matching the task's explicit requirement and the one existing pattern (KPI entries) that already enforces it.

---

## 5. Validation Architecture (Part 4)

Nine layers, applied in order, matching the request exactly:

1. **File validation** — size (`MAX_FILE_SIZE_MB`, currently defined but not enforced client-side — must become enforced), format, header-row presence, sheet selection confirmed.
2. **Schema validation** — required columns present per domain contract (Part 3).
3. **Field-type validation** — date parse, numeric parse/bounds (reusing `parseKpiValue`'s rejection of NaN/Infinity/negative/out-of-range, generalized to a typed-field validator usable by every domain, not just KPI values).
4. **Registry/entity reference validation** — KPI key, branch code, group ID, pharmacist identity, manager email must each resolve against a live lookup (Registry, or a freshly-fetched snapshot of branches/users for the org). **No unknown reference is ever silently ignored** — this is a named requirement and is enforced by making "reference does not resolve" always at least a `Warning` that blocks commit by default, with `Conflict`/`Error` for the cases the task specifically calls out (unknown KPI, unknown pharmacist, unknown branch, unknown group).
5. **Business-rule validation** — domain-specific rules from Part 2 (core-KPI immutability, allocation-sum invariant, single-primary-assignment rule, etc.).
6. **Duplicate validation** — within-file (existing `deduplicateStaged` pattern, generalized by identity key per domain).
7. **Database conflict validation** — against existing committed records (new capability for every domain except KPI entries, which partially has this via doc-ID upsert).
8. **Authorization validation** — `accessGuard.ts` scope checks, evaluated per row against the *target* entity's scope (a regional manager importing 500 branches must have every single branch's region checked, not just the job-level actor role).
9. **Commit-readiness validation** — the existing `assessBatchSafety()` gate (>50% failure rate blocks the whole batch, etc.), generalized per domain with domain-appropriate thresholds (e.g., the failure-rate threshold for a Pharmacist import touching live Auth accounts should arguably be stricter than for a Target import).

**Result classification** (exactly as requested): `Valid | Warning | Error | Conflict | Duplicate | Update | Skip`. Every issue carries: row number, column, entity, error code, human-readable message (bilingual), suggested correction where mechanically derivable (e.g., "did you mean KPI key `wasfaty`?"), and an explicit `blocksCommit: boolean`.

---

## 6. Duplicate & Conflict Policy (Part 5)

| Scenario | Default behavior | User decisions offered |
|---|---|---|
| Duplicate rows in same file | Last-row-wins within file (matches existing `deduplicateStaged`), but **shown** in preview as a collapsed group, not silently hidden | Accept last, or pick a specific row |
| Existing DB record, identical values | Classified `Skip` (no-op) automatically | none needed, shown for transparency |
| Existing DB record, different values | Classified `Update`, diff shown field-by-field | Update / Skip / Review manually |
| Existing DB record, identity conflict (e.g., same branch code, different name) | Classified `Conflict` — **never auto-resolved** | Update / Reject / Review manually |
| Same employee on multiple branches | Allowed only via Assignment domain's secondary-assignment type; a second *primary* in an overlapping window is a `Conflict` | Replace primary / Keep both as primary+secondary / Reject |
| Reused email or employee ID across rows in the same file | `Error` — blocks commit for those rows (data integrity, not a preference) | Fix in file and re-upload |
| Existing KPI key, different metadata | `Conflict`, diff shown | Update / Skip / Reject — core keys: hard block, no decision offered |
| Existing target, same entity/KPI/period | `Conflict` by design (intentionally stricter than today's silent overwrite) | Replace / Skip / Merge (only meaningful for personal-target allocation, where "merge" means re-run `allocateEqual` only for missing pharmacists) |
| Existing actual, same entity/KPI/date | `Update` (matches existing deterministic-doc-ID upsert behavior — this one *is* intentionally permissive, since same-day corrections are a normal workflow) | Update / Skip |
| Re-uploading the same file | Detected via file checksum stored on the prior Job; **warns** "this file (or an identical one) was already imported in Job #X on [date]" — does not block, since legitimate re-imports happen, but never silent | Proceed anyway / Cancel |
| Retry after network interruption | Idempotency key (Part 7) ensures re-running commit for the same staged batch does not double-write; safe to retry automatically | none needed — automatic |

**Decisions vocabulary, exactly as requested:** Create, Update, Skip, Merge, Replace, Review manually, Reject — every domain's conflict UI uses this same vocabulary, not domain-specific synonyms, so the experience is consistent.

**Idempotency keys, per domain:** Group → `groupId`; Branch → `branchCode`; Pharmacist → `email`; Assignment → `pharmacistId+branchId+effectiveFrom`; KPI Registry → `kpiKey`; Branch Target → `branchId+kpiKey+period`; Pharmacist Target → `pharmacistId+branchId+kpiKey+period`; KPI Actual → `submittedBy:pharmacyId:date[:kpiKey]`; Historical → same as Actual plus `source='HISTORICAL_IMPORT'`. Every commit operation is a `set(..., {merge: true})` or batched-equivalent keyed by this identity, never a blind `add()` — this is what makes retries safe.

---

## 7. Large-Volume Processing (Part 6)

| Volume | Strategy |
|---|---|
| ~1,000 rows | Fully client-side, synchronous-feeling; matches current KPI-import experience already in production. |
| ~10,000 rows | Client-side parse + validate, **moved to a Web Worker** (new — today's `XLSX.read()`/`validateBatch()` run on the main thread, which would visibly freeze the UI at this volume). Commit proceeds in `writeBatch()` chunks of 400, sequential chunk-by-chunk from the main thread (Firestore SDK calls aren't easily worker-friendly without extra plumbing) with a visible progress bar. |
| 50,000+ rows | Client-side parsing of a single 50k-row `.xlsx` is *technically feasible* (SheetJS can handle it, browser memory permitting — realistically fine up to ~100k rows of flat tabular data on a modern machine) but **committing** 50,000 rows means ~125 sequential `writeBatch()` round-trips at 400/batch. At typical latency this is minutes, not seconds, and a closed laptop lid or tab refresh mid-commit is a real risk. **Recommendation: persist staged, validated rows to the existing `staging_entries` collection *before* committing**, so the commit phase becomes resumable — if interrupted, the next session re-fetches `staging_entries` for the job and continues from the first un-committed chunk, rather than re-parsing the file or losing progress. This is the single most load-bearing design decision in this section. |

**Client-side vs server-side recommendation: hybrid, client-led, no mandatory new server infrastructure in V1.**
- Parsing, validation, mapping, preview, and conflict resolution: **client-side** (Web Worker for files above ~2,000 rows). No justification exists yet for moving this server-side — it's CPU-bound work the browser already does today for the 2,000-row KPI case without issue.
- Commit: **client-side, chunked, resumable via staged persistence** as described above. This avoids introducing Cloud Functions as a hard dependency for V1.
- **When a server-side commit worker becomes justified (not now):** if real-world usage routinely exceeds ~20,000–30,000 rows per job, or if commits need to survive the browser tab closing entirely (not just refreshing), a Cloud Function that drains `staging_entries` for a job in the background becomes the right next step — this is flagged as a **DX-7 candidate**, not a V1 requirement, and is explicitly *not* introduced now per the Hard Stop against unjustified server infrastructure.

**Progress visibility (exactly as requested):** parsed rows, valid rows, errors, warnings, committed rows, failed rows, remaining rows — all derivable from the staged-rows-by-status count already modeled in `StagedKpiRecord.status` (`IngestionStatus`), generalized to every domain's staged record shape.

**Partial failure policy:** one invalid row never fails an entire file, **unless** a global integrity condition is broken — defined precisely as: (a) more than the existing `assessBatchSafety()` failure-rate threshold, (b) a structural problem (wrong sheet selected, no rows parsed at all), or (c) an authorization failure at the job level (user has no permission for this domain at all, vs. a per-row scope mismatch). Everything else is row-level partial commit: valid rows commit, invalid rows are reported, and the job ends in `Partially Completed`, never silently `Completed` with hidden failures.

**Cost/rate-limit note:** Firestore write costs scale linearly with row count regardless of batching strategy — batching reduces round-trips and improves reliability, not write cost. No rate-limit conflict expected at the volumes discussed; Firestore's per-project write quota is far above what a single org's onboarding import would generate.

---

## 8. Staging, Commit, Audit & Rollback (Part 7)

**Lifecycle (exactly as requested):**
```
Draft Import Job → Parsed → Mapped → Validated → Ready
  → Committing → Completed | Partially Completed | Failed | Rolled Back
```

**Import Job model (design, not yet implemented):**
```
ImportJob {
  jobId, domainId, orgScope,
  fileMeta: { name, sizeBytes, checksum (sha256), sheetName },
  createdBy, createdAt,
  mappingTemplateId?, mappingVersion,
  validationSummary: { total, valid, warning, error, conflict, duplicate, update, skip },
  rowCounts: { parsed, validated, committed, failed, skipped, remaining },
  commitBatches: [{ batchIndex, status, committedAt?, error? }],
  status: 'draft'|'parsed'|'mapped'|'validated'|'ready'|'committing'|'completed'|'partially_completed'|'failed'|'rolled_back',
  rollbackStatus: 'not_attempted'|'in_progress'|'completed'|'not_possible',
  startedAt?, endedAt?
}
```
This is a generalization of the *already-existing* `StagedKpiRecord`/`IngestionStatus` shape (Part 1) plus the audit-log shape — not a new concept, a consolidation of two existing concepts into one job-level record.

- **What is staged:** every parsed row, in its domain-specific staged shape, written to (the existing, currently underused) `staging_entries` collection, tagged with `jobId`. This persists across browser refresh — a job can be resumed.
- **What is persisted permanently:** the `ImportJob` record itself (new collection, design only), plus the final committed domain documents, plus one audit-log entry **per row** linked to `jobId` (a change from today's batch-level-only audit for KPI imports) so a specific row's history is traceable without re-deriving it from the original file.
- **How a failed batch is retried:** because every commit write is keyed by the domain's idempotency key (Part 6), retrying a `writeBatch()` chunk that partially succeeded is safe — already-written docs get the same merge, not a duplicate.
- **What can be rolled back, precisely:**
  - **Always rollback-safe:** newly-created rows where the *prior state was "did not exist."* Rollback = delete (or soft-archive, where the collection's rules deny hard delete, e.g. `kpi_registry`).
  - **Rollback-safe with care:** `Update` rows where the prior value was captured in the staged diff at validation time — rollback = write the prior value back, itself an audited operation.
  - **Not safely rollback-able, and must be disclosed as such in the UI, never silently promised:**
    - Pharmacist/User rows once a Firebase Auth account has been activated (Auth lifecycle isn't transactional with Firestore).
    - Any row whose downstream data has already been *used* — e.g., a branch target that an evaluation has already run against, or a KPI actual that has already fed a published evaluation result. Rollback must check for downstream dependency before being offered, and refuse (not silently allow) if dependent published data exists.
    - Historical imports, once history snapshots have been recomputed from them (recomputing "back" is not a true inverse operation without re-deriving from a clean baseline).
- **How duplicate re-import is prevented:** the file-checksum-on-Job pattern (Part 6) plus per-row idempotency keys (Part 6) together mean a true re-import of an unchanged file is a safe no-op, and a changed file re-import only touches the actually-changed rows.
- **No rollback claim is made unless technically guaranteed** — this is enforced architecturally by computing `rollbackStatus: 'not_possible'` per job up front (at validation time, by checking for the disclosed non-rollback-safe conditions above), not as an afterthought when a user clicks "Undo" and it fails.

---

## 9. Template Library (Part 8)

- **Strategy: hybrid.** A static, versioned base template per domain (column headers, instructions, allowed-value lists, examples) ships with the app — but the KPI-bearing templates (Branch Target, Pharmacist Target, KPI Actual, Historical) have their **KPI columns generated dynamically** from the live Registry at download time (mirroring the existing registry-driven dynamic-KPI-column behavior already present in `kpiImportService.ts`).
- **Versioning:** every template embeds a `templateVersion` in a hidden/first column or sheet metadata; on upload, the mapping step checks this against the current version and **warns** (not blocks) "this template is outdated — columns may have changed" if older.
- **Bilingual headers:** every template has English and Arabic header rows (or a header-aliasing legend sheet) — matches the existing bilingual alias pattern already used for the 5 legacy KPIs, extended to every domain.
- **No confidential data:** templates ship with synthetic example rows only, never real org data, never real registry secrets (there are none, registry contains no credentials).
- **Domains needing templates:** Groups, Branches, Pharmacists, Assignments, KPI Registry, Branch Targets, Pharmacist Targets, KPI Actuals, Historical Data — all nine, one workbook each (multi-sheet combined onboarding template is a documented convenience built from the same nine, not a tenth contract).

---

## 10. Security & Permissions (Part 9)

Reuses `accessGuard.ts` role taxonomy (`admin | manager/branch_manager | district_supervisor | regional_manager | general_manager | pharmacist`) — no new roles invented.

| Role | Import scope |
|---|---|
| Org admin | All domains, all scope — only role permitted to bypass the historical-lookback guard (Part 2-I) and the only role permitted to import KPI Registry definitions |
| Regional manager | Branches/Pharmacists/Assignments/Targets/Actuals **within own region only** — every row checked individually against region membership, not just the job-level actor role |
| Group/district manager (`district_supervisor`) | Same as regional manager, scoped to assigned districts/branches (Phase 1 fields `assignedPharmacyIds`/`assignedDistrictIds`, already defined on the user doc, reused) |
| Branch manager | Pharmacist Targets/Actuals for **own branch only**; cannot import Branches, Groups, or other branches' Pharmacists |
| Pharmacist | No import access — bulk import is an admin/manager surface, individual KPI entry remains the existing manual page |
| Read-only auditor | View Import Jobs, validation reports, and audit history for their authorized scope; **no upload, no commit** capability anywhere |

**Cross-organization isolation:** every domain adapter's row-level authorization check (Validation Layer 8, Part 5) must resolve the *target* entity's org/region/branch and compare against the actor's scope — a regional manager cannot import a branch that resolves to a different region, even if the file is well-formed. This is the same posture as existing Firestore rules (`ownsPharmacy`, district/regional guards) — reused, not reinvented, but must now be evaluated **per row**, not just at the page-entry gate.

**Note — Phase-1 territory scoping is not fully enforced today** (per the audit: district/regional manager guards exist structurally but data-scope enforcement is described in the codebase's own comments as not-yet-complete). Data Exchange Studio for Branches/Pharmacists/Assignments at the regional/district-manager level **depends on that enforcement being real**, not just present in shape. This is called out explicitly in Hard Stops below.

**Sensitive data handling:** uploaded files (which may contain employee PII — names, emails, employee IDs) are processed client-side and only the *parsed, validated rows* are staged to Firestore — the raw file itself is not uploaded to Firestore or Cloud Storage in V1 (no file-storage bucket integration proposed). **File retention policy:** none needed in V1 because no raw file is retained server-side; staged rows in `staging_entries` should have a defined TTL/cleanup policy (e.g., purge completed jobs' staging rows after N days) — flagged as a DX-9 (stabilization) task, not solved here.

---

## 11. User Experience (Part 10)

**Navigation (matches the requested structure):**
```
Data Exchange Studio
├── New Import
├── Import Jobs        (list + detail, status, resume, rollback where eligible)
├── Templates           (download per domain, versioned)
├── Saved Mappings       (per org, per domain)
├── Error Reports        (downloadable, per job)
├── Audit History        (per job, per row where applicable)
└── Export Studio — future (placeholder entry, no functionality)
```

**Wizard steps (matches the requested 8 steps exactly):** Choose data type → Upload file → Map columns → Validate → Preview changes → Resolve conflicts → Confirm import → View results.

**Result categories shown separately (as requested):** New records, Updates, Skipped rows, Errors, Warnings, Conflicts — each its own filterable section/tab in the Preview and Results screens, not merged into one generic "issues" list (this is a deliberate UX choice distinguishing it from the current flat error/valid split in `ImportCenterPage.jsx`).

**Scaling from 20 rows to 20,000 rows in one UX:** the wizard's *steps* never change — what changes is presentation density:
- ≤500 rows: full row-level table shown inline at every step.
- 500–5,000 rows: paginated/virtualized table (no library change needed beyond what the existing `DataTable.jsx` likely already supports — reuse).
- 5,000+ rows: **summary-first** view (counts + a sample of first/worst N rows per category), with full detail available via the downloadable error/validation report rather than rendered in the DOM — this is necessary to avoid the browser choking on rendering tens of thousands of table rows, independent of the parsing/validation performance question in Part 7.

---

## 12. Testing & Certification Strategy (Part 11)

Coverage areas with measurable acceptance criteria:

| Area | Acceptance criteria |
|---|---|
| Each import domain (9) | ≥1 happy-path test proving Create, ≥1 proving Update, ≥1 proving the domain's specific conflict rule, per domain — minimum 27 tests |
| Header aliases | Every documented EN/AR alias for every structural and KPI column resolves correctly; ≥1 test per alias pair |
| Arabic/English files | Full end-to-end import using an all-Arabic-header fixture file per domain succeeds identically to its English equivalent |
| Unknown entities | Unknown KPI key, unknown branch, unknown pharmacist, unknown group each produce a non-silent, commit-blocking issue — explicit test per case, asserting the issue is present in the result, not just that the row is "skipped" |
| Duplicates | Within-file duplicate resolution (last-wins, shown not hidden); cross-batch duplicate (file re-upload) detection via checksum |
| Conflicts | Every conflict rule in Part 6's table has at least one test proving it is classified `Conflict` and is never auto-resolved |
| Invalid formats | Wrong file type, corrupted file, wrong sheet selected — each produces a file-validation-layer error, not a crash |
| Missing values | Required-field-missing → row-level error with correct row/column identification |
| Large files | A 10,000-row synthetic fixture completes parsing+validation within an agreed time budget (to be set in DX-7) without freezing (proxy-tested via Worker-offload assertion, not wall-clock in CI) |
| Interrupted commits | Simulated mid-batch failure → job lands in `Partially Completed`, re-running commit completes only the remaining rows, no duplicates created |
| Retry/idempotency | Re-running an identical commit batch twice produces the same end-state as running it once (doc count and field values identical) |
| Partial failures | A file with 10% deliberately-broken rows commits the other 90% and reports the 10% precisely, without failing the whole job |
| Authorization | Regional manager attempting to import a branch outside their region is blocked at validation, not just at a UI-level disabled button |
| Audit records | Every committed row produces a traceable audit entry linked to its `jobId` |
| Rollback | Rollback-eligible job rolls back to the exact prior state (re-diffed and compared, not just "no error thrown"); rollback-ineligible job correctly reports `rollbackStatus: 'not_possible'` before rollback is even attempted |
| Registry-driven KPI import | A newly-registered, non-Core KPI imports and evaluates correctly through existing V2 pipeline cert patterns (directly reusing the `postCoreKpiStabilization*` test patterns from the Foundation Closure bundles) |
| No Core KPI fallback | Source-text/behavioral proof, in the same style as `noSilentCoreFallbackClosure.test.ts`, that no Data Exchange Studio code path falls back to a hardcoded Core-5 list |
| Existing import backward compatibility | Every currently-passing test in `kpiImportService.test.ts`, `stagingValidator`-adjacent suites, and `ImportCenterPage` tests continues to pass unmodified once the KPI-actual path is wrapped into the new adapter interface — zero behavior change is the acceptance bar, proven by running the existing suite, not by writing new tests for old behavior |

---

## 13. Phased Roadmap (Part 12)

| Bundle | Scope | Files/modules likely involved | Data-contract impact | Risks | Tests | Acceptance criteria | Dependencies | Size |
|---|---|---|---|---|---|---|---|---|
| **DX-0** | Architecture & contracts (this document) | docs only | none | low — review/approval risk only | none (review) | User approves architecture | Foundation closed | Small |
| **DX-1** | Import Job + Staging foundation: generic `ImportJob` model, generic staged-row persistence via `staging_entries`, extract the common adapter interface from existing `kpiImportService.ts` with zero behavior change | new: job model/types, adapter interface; refactor (not rewrite): `kpiImportService.ts` wrapped as `KpiActualAdapter` | new `import_jobs` collection (design pending approval); `staging_entries` usage generalized | refactor risk to existing KPI-import tests — must prove zero regression | full existing KPI-import suite must stay green + new adapter-interface unit tests | Existing KPI import behavior provably unchanged; adapter interface has ≥1 reference implementation | DX-0 approved | Medium |
| **DX-2** | Branches + Pharmacists onboarding via the new adapter pattern, **with the Pharmacist-Auth decision resolved per Part 2-C** | `BranchAdapter`, `PharmacistAdapter`, UI wizard reuse | none new beyond DX-1; writes existing `pharmacies`/`users` collections, now staged+previewed+batched instead of sequential one-at-a-time | Auth-account-creation decision is the central risk — must be explicitly confirmed by the user before this bundle starts | domain tests per Part 11 + the Auth-flow decision's own test | Branch/Pharmacist bulk import matches Part 2 contracts; old one-by-one paths untouched and still work | DX-1 | Medium |
| **DX-3** | Assignments + organization hierarchy (Groups) | `AssignmentAdapter`, `GroupAdapter` | new `groups` collection (design pending approval) | hierarchy validation complexity (parent-group resolution, single-primary-assignment rule) | domain tests per Part 11 | Assignment/Group contracts from Part 2 fully covered | DX-2 (needs Branches/Pharmacists to assign against) | Medium |
| **DX-4** | KPI Registry import | `KpiRegistryAdapter`, routes through existing `saveKpiDefinition()` | none — reuses existing collection/service | must not let import bypass any existing registry validation rule | reuse + extend `kpiRegistryService` test suite | Registry import never creates an Evaluation Profile reference; Core-key immutability holds | DX-1 | Small |
| **DX-5** | Targets import (Branch + Pharmacist) | `BranchTargetAdapter`, `PharmacistTargetAdapter` | none new — existing `targets`/`personal_targets` collections, now conflict-checked instead of silently overwritten | behavior-change risk: target overwrite becomes a conflict instead of silent — must be communicated as an intentional, approved change, not a bug | domain + allocation-invariant tests | Part 2-F/G contracts covered; allocation-sum warning surfaces correctly | DX-4 (KPI keys must be importable/known) — actually only depends on DX-1, registry already exists | Medium |
| **DX-6** | Actuals + Historical Data import | `KpiActualAdapter` (already extracted in DX-1) + new `HistoricalAdapter` with the lookback-guard bypass | none new — existing `kpi_entries`, plus `IngestionSource` enum gets an additive `HISTORICAL_IMPORT` value | the lookback-bypass permission gate is the central risk — must be admin-only and clearly audited | domain tests + explicit "bypass requires admin" authorization test | Part 2-H/I contracts covered; history-snapshot backfill triggers correctly for historical rows | DX-1, DX-5 (targets should exist before backfilling actuals against them, for evaluation context) | Medium |
| **DX-7** | Large-file processing & resilience: Web Worker offload, staged-commit resumability, progress UI | parsing/validation worker, resumable-commit orchestrator | none — operational hardening of DX-1's staging model | Web Worker + Firestore SDK interaction complexity; this is the most technically novel bundle | load tests at 1k/10k/50k rows per Part 11 | 10,000-row job completes without UI freeze; an interrupted 10,000-row commit resumes correctly | DX-1 through DX-6 (needs real domains to stress-test against) | Large |
| **DX-8** | Template Library + saved mappings | template generator (static+dynamic hybrid per Part 9), mapping-template persistence | new small collection/blob storage for saved mappings (design pending approval) | low | template-version-detection test, bilingual-header test | Part 8 deliverables met for all 9 domains | DX-2 through DX-6 (templates depend on each domain's final contract) | Medium |
| **DX-9** | Audit, rollback, stabilization | per-row audit linkage, rollback-eligibility computation, staging-row TTL/cleanup | extends existing `audit_logs`/`kpi_audit_logs` usage; no schema break | rollback-eligibility logic must be conservative — false "rollback possible" claims are the worst failure mode here | rollback tests per Part 11 (both eligible and ineligible paths) | Part 7 rollback guarantees hold exactly as documented, nothing more | DX-1 through DX-8 | Large |
| **DX-10** | Export Studio architecture (review only, no implementation) | none (docs) | none | n/a | n/a | A future architecture review, structured like this one | DX-9 | Small |

---

## 14. Risks & Hard Stops

None of the items below require stopping DX-0 itself (this review), but each must be **explicitly resolved before the named bundle starts**:

1. **Pharmacist/User Auth-account creation behavior (Part 2-C)** — current one-by-one flow creates a live Auth account with an admin-supplied password synchronously. Bulk-creating Auth accounts this way is the one place this review came closest to a Hard Stop ("Creation of user accounts in an unsafe way"). **Resolution proposed, not yet approved:** bulk import stages Firestore profile + role + branch only; Auth-account activation either happens via Firebase's invite-link flow per user post-commit, or is deliberately left to the existing one-by-one admin flow. **This must be confirmed by the user before DX-2 starts** — it is the single decision in this entire review most likely to change the shape of a bundle if answered differently.
2. **Phase-1 territory scope enforcement completeness (Part 9)** — regional/district-manager scoping exists structurally (fields on the user doc, partial guards) but the audit could not confirm full enforcement is live everywhere it would need to be for DX-2/DX-3 to safely let regional managers bulk-import within their own scope. **Recommendation:** verify/complete this enforcement as a prerequisite check at the start of DX-2, not assumed.
3. **Historical-lookback-guard bypass (Part 2-I, DX-6)** — intentionally bypassing `HISTORICAL_LOOKBACK_DAYS` is necessary for the Historical Data domain to function at all, and is explicitly scoped to admin-only, a separate job type, and clear audit labeling — not a blanket relaxation of the existing 90-day guard for ordinary actual imports. Flagged for explicit confirmation, not blocked.
4. **Large-volume server-infrastructure question (Part 7, DX-7)** — V1 deliberately avoids mandating Cloud Functions. If real usage later exceeds the ~20–30k-row comfort zone identified in Part 7, a server-side commit worker becomes the right next step — **not now**, and not without first measuring real usage against the resumable-staging approach in DX-7.
5. **Rollback guarantee scope (Part 7)** — this review is explicit that rollback is **not** universally available; Auth-activated users, evaluation-consumed targets/actuals, and recomputed historical snapshots are named non-rollback-safe cases. No bundle should ever market "full rollback" — only "rollback where technically eligible, computed and disclosed up front."

**No destructive Firestore migration is required by anything in this design.** **No change to the closed Evaluation/Foundation architecture is required** — every KPI-bearing domain (Targets, Actuals, Historical, KPI Registry) is explicitly designed to read/write through existing Registry-driven contracts (`saveKpiDefinition`, `getAllocatableTargetFields`, the existing `kpi_entries`/`targets`/`personal_targets` collections) without touching `evaluation_profiles`, the V2 pipeline, or the Profile Integrity Guard in any way. **No Core KPI dependency is reintroduced** — every domain's KPI resolution goes through the live Registry, with the same `unknownKpiColumns`-style flagging already proven in the Foundation Closure bundles, never a hardcoded Core-5 fallback.

---

## Final Deliverables Index

1. Existing-system audit — Part 1 (this doc) + full agent transcript with file:line citations
2. Data Exchange Studio architecture — Part 2 (adapter-interface diagram)
3. Import-domain contracts — Part 3 (9 domains, A–I)
4. Validation model — Part 5
5. Duplicate/conflict policy — Part 6
6. Large-volume strategy — Part 7
7. Staging/job model — Part 8
8. Security model — Part 10
9. UX structure — Part 11
10. Template strategy — Part 9
11. Testing strategy — Part 12
12. Phased implementation roadmap — Part 13 (DX-0 through DX-10)
13. Risks and hard stops — Part 14
14. Recommended first implementation bundle — **DX-1 (Import Job + Staging foundation)**, because every other bundle depends on it, it carries the lowest behavior-change risk (the existing KPI-import logic is wrapped, not rewritten), and it is the bundle that proves the adapter-interface concept before nine domains are built against it.

---

## Verdict

**`DATA EXCHANGE STUDIO ARCHITECTURE READY FOR APPROVAL`**

Subject to the one open decision flagged as a pre-DX-2 confirmation item (Pharmacist/User Auth-account creation behavior, Risk #1) and the one verification item flagged as a pre-DX-2/DX-3 prerequisite (territory-scope enforcement completeness, Risk #2). Neither blocks approving the overall architecture or starting DX-0/DX-1; both must be resolved before the bundles that depend on them begin.

---

## Addendum — DX-4/DX-5 Closure (KPI & Targets Bundle)

This section is appended after closure, not a revision of the original planning content above.

**Scope completed:** DX-4 (KPI Registry Import, Part 3-E) and DX-5 (Branch Targets / Pharmacist Targets Import, Part 3-F/3-G). See [DX4_DX5_KPI_TARGETS_BUNDLE.md](DX4_DX5_KPI_TARGETS_BUNDLE.md) for the full implementation record — adapters, validation rules, commit semantics, template field mapping, known deviations from the canonical request, and test/build/typecheck evidence.

**Key decisions, for continuity with later bundles:**
- DX-4/DX-5 have no inter-dependency on each other or on Groups/Branches/Pharmacists/Assignments — each runs as an independent single-domain job through a new `kpiTargetsImportRunner.ts`, reusing the unmodified DX-1 Import Job Engine and the same preview-signature staleness guard as the onboarding orchestrator, rather than extending the 4-domain dependency-ordered pipeline.
- KPI Registry import commits through the real `saveKpiDefinition()` — no parallel validation/audit logic duplicated.
- Targets import commits through the real `saveTarget()` (branch) and `savePersonalTarget()` (pharmacist) — both per-KPI-field merges onto the existing one-doc-per-branch/month and one-doc-per-pharmacist/month contracts confirmed in Part 1, not a new schema.
- Pharmacist identity for target import reuses `fetchExistingOnboardingData()`'s CLAIMED-excluding maps — the same boundary the Organization Onboarding closure patch established — rather than re-deriving "active operational pharmacist" a second time.

---

## Addendum — DX-6/DX-7 Closure (Actuals & Large Files Bundle)

This section is appended after closure, not a revision of any content above.

**Scope completed:** DX-6 (Branch Actuals / Pharmacist Actuals Import) and DX-7 (Large File Processing, Progress, Retry, Resume). See [DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md](DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md) for the full implementation record.

**Key decisions, for continuity with later bundles:**
- The legacy `KPI_ACTUALS` domain (`adapters/kpiActualsAdapter.ts`) was **not modified**. Its silent-upsert design (always CREATE, never CONFLICT/UPDATE) is a deliberate, documented Part 2-H decision that this bundle does not change. `BRANCH_ACTUALS`/`PHARMACIST_ACTUALS` are two **new** `ImportDomain` values with real conflict detection — the opposite intent — so they could not share that adapter.
- `kpi_entries`' `create` Firestore rule required `isOwnData()` (payload.userId === the caller's own Auth UID) — there was no existing path for an admin to write a real entry attributed to someone else. A narrow, audit-bound bypass was added (`firestore.rules`, mirrors the existing `isDemoData` bypass exactly): `isAdmin() && importedViaDataExchange:true && importBatchRef non-empty`. `saveKpiEntry()` (`kpiService.js`) gained two additive params, `isDataExchangeImport`/`importBatchRef`, that opt into this path — manual entry (the default) is byte-for-byte unchanged.
- Branch-level actuals have no branch-only entry contract in this codebase — every `kpi_entries` doc belongs to a user. Resolved (documented, not invented): a Branch Actual is attributed to the branch's `managerUid`. A branch with no manager assigned cannot receive a Branch Actual row.
- DX-7's resume/retry/cancel needed two new state-machine **edges**, not new states: `COMMITTING -> COMMITTING` (resume) and `PARTIALLY_COMPLETED -> COMMITTING` (retry) — `PARTIALLY_COMPLETED` is the existing equivalent of "partial failure," reused rather than duplicated.
- `commitJob()` (`importJobEngine.ts`) gained two additive hooks, `onBatchComplete`/`shouldCancel` — the engine itself still never touches Firestore; checkpointing happens in the runner via these hooks.

---

## Addendum — DX-8/DX-9 Closure (Template System Hardening & Studio Closure)

This section is appended after closure, not a revision of any content above.

**Scope completed:** DX-8 (Template System Hardening) and DX-9 (Data Exchange Studio Closure & Certification). No new import domain was added; DX-10 (Export Studio) was not started. See [DX8_DX9_TEMPLATES_CLOSURE.md](DX8_DX9_TEMPLATES_CLOSURE.md) for the full implementation record and [DATA_EXCHANGE_CLOSURE_MATRIX.md](DATA_EXCHANGE_CLOSURE_MATRIX.md) for the per-domain certification table.

**Key decisions, for continuity with any future bundle:**
- A real closure gap was found and fixed: Organization Onboarding (Groups/Branches/Pharmacists/Assignments) had full adapters and an orchestrator since DX-2/DX-3 but **no downloadable template at all**. `buildOrganizationOnboardingTemplate()` closes this using the adapters' own `HEADER_ALIASES` and the orchestrator's own `SHEET_NAME_ALIASES` as the source of truth, rather than inventing column names independently.
- Template versioning uses a single global string constant (`TEMPLATE_VERSION`), not per-domain versions or a migration framework — the smallest model that satisfies "detect unsupported future versions, never reject legacy files." A workbook with no Metadata sheet at all (every pre-DX-8 file) is always treated as a supported legacy version.
- The installed SheetJS Community Edition (xlsx@0.18.5) cannot write frozen header panes or in-cell data-validation dropdown lists — confirmed by reading the writer source, not assumed. Allowed-values guidance is therefore textual (Instructions sheet), sourced from real enum constants (`ALLOWED_VALUES`) rather than hardcoded strings that could drift from the adapters.
- `templateCatalog.ts` is a thin index over the existing `templateGenerator.ts` build/download functions — no template-building logic was duplicated.
- The error taxonomy (`importErrorTaxonomy.ts`) was built by enumerating every real `ValidationIssue.code` actually emitted across the adapters (via direct grep), not by guessing categories — an unmapped code always falls back to "System Error" rather than throwing.
- `listRecentImportJobs()` performs an unfiltered query and is documented as caller-gated (by the admin-only Studio page), with the existing `import_jobs` Firestore rule (`createdBy == uid() || isAdmin()`) as the defense-in-depth backstop — no new admin-bypass logic was added to the function itself.
- Closure confirmed that only Branch/Pharmacist Actuals (DX-6/DX-7) have chunking/progress/retry/resume/cancel; Organization Onboarding, KPI Registry, and Targets commit in a single pass. This is documented as an intentional, known limitation in the closure matrix, not silently presented as supported everywhere.
