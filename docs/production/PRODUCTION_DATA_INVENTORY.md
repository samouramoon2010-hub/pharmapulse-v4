# PR-1G-A — Production Data Inventory & Classification

Code-level inventory only (no live Firestore connection was used). Every
collection name below is taken from a literal `collection(db, '...')` /
`doc(db, '...', ...)` call found in `src/services/*`, `src/engine/*`,
`src/ranking/*`, or `src/demo/*`. Subcollections are nested under their
parent.

Classification key — **A** must retain, **B** retain unless explicitly
approved, **C** safe reset candidate, **D** ambiguous/manual review
required. Per the audit instruction, no collection below is classified
solely from its name; each line cites the code path that justifies it.

| Collection | Purpose (from code) | Prod-critical | Retention | Class | Why |
|---|---|---|---|---|---|
| `users` | Identity, role, scope, territory assignment (`userService.js`) | Yes | Indefinite | A | Core identity record; deleting breaks auth-to-profile linkage app-wide |
| `pharmacies` | Branch master data (`territoryValidation.ts`) | Yes | Indefinite | A | Referenced by users, targets, entries, evaluation, ranking |
| `districts` | Territory tier (`DistrictsPage.tsx`) | Yes | Indefinite | A | Referenced by pharmacies/users; territory hierarchy root |
| `regions` | Territory tier (`RegionsPage.tsx`) | Yes | Indefinite | A | Same as districts, one tier up |
| `groups` | Pharmacy grouping/classification (`BranchClassificationsPage.jsx`, RF-0) | Yes | Indefinite | A | Drives ranking/leaderboard cohorting |
| `kpi_entries` | Daily/period actuals entered by pharmacists (`kpiService.js`) | Yes | Indefinite | A (real) / C (demo-tagged only) | Core operational data; only `isDemoData:true` rows are reset candidates |
| `targets` | Branch-level KPI targets (`TargetsPage.jsx`, `kpiService.js`) | Yes | Indefinite | A (real) / C (demo-tagged) | Same split as `kpi_entries` |
| `personal_targets` | Individual manager targets (`PersonalTargetsPage.tsx`) | Yes | Indefinite | A (real) / C (demo-tagged) | Same split |
| `kpi_registry` | KPI definitions, formulas, lifecycle state (`KpiManagementPage.jsx`, `KPI_REGISTRY_GOVERNANCE.md`) | Yes | Indefinite | A | Single source of truth for every KPI calculation; archived KPIs are soft-deleted, never hard-deleted by design |
| `evaluation_profiles` | Versioned scoring-rule profiles (`EvaluationRegistryPage.tsx`, `EVALUATION_PROFILE_LIFECYCLE.md`) | Yes | Indefinite | A | Published profiles are the legal record of how scores were computed historically; never reset |
| `evaluation_profiles/{id}/drafts` (subcollection) | Unpublished draft edits | No | Until published/discarded | B | Drafts have no production effect but represent in-progress admin work — do not assume safe to delete without checking for an active edit session |
| `evaluation_results` | Computed evaluation scores per period (`EvaluationRunPage.tsx`) | Yes | Indefinite (real) | A (real) / C (demo-tagged) | Historical scoring record for real periods; demo-tagged rows only are reset candidates |
| `shadow_evaluation_logs` | Dynamic-KPI shadow-mode diagnostic output (`DynamicKpiShadowPage.jsx`) | No | Diagnostic/rolling | B | Not user-facing, but currently the only audit trail for shadow-mode behavior — confirm with owner before clearing |
| `ranking_history` / ranking snapshots | Computed leaderboard snapshots (`ranking-service.ts`) | Yes | Indefinite (real) | A (real) / C (demo-tagged) | Historical ranking record; same demo-split rule |
| `import_jobs` | Data Exchange bulk-import job metadata (`ImportCenterPage.jsx`, `DataExchangeStudioPage.jsx`) | Yes (process integrity) | Per retention policy (none documented) | B | Deleting breaks the `importBatchRef` provenance trail for any `kpi_entries`/`targets` rows written via DX-6 import bypass — see referential-integrity finding |
| `import_staging_entries` (or equivalent staging records under `import_jobs`) | Pre-commit staged rows awaiting admin review | No | Transient | C | By design, transient working data — safe to clear once a job is committed or abandoned, but only for jobs in a terminal state |
| `audit_logs` | Immutable action log (`auditService.js`) | Yes | Indefinite (compliance-style) | A | Audit trail; resetting destroys the only record of who-did-what |
| `notifications` | User-facing notification records (`NotificationsPage.jsx`) | No | Rolling/per-user | B | Not business-critical, but real user notification history — do not assume safe without confirming no active "unread" UX dependency |
| `demo_batches` | Seeder’s own batch metadata (`demo-seeder.ts`) | No | Until cleanup | C | Exists purely to track demo batches for `demo-cleanup.ts`; safe to clear alongside its batch |
| `profile_studio_*` collections (profile drafts/snapshots under Profile Studio) | Personal performance profile drafts (`ProfileStudioPage.jsx`) | Yes (user-owned content) | Indefinite | A | User-authored content; no evidence it is regenerable |

**Legacy/migration artifacts:** No collection was found in code that is
referenced only by a migration script with zero current readers — i.e.
no clearly "legacy and abandoned" collection was identified. Anything
demo/test is captured by the `isDemoData` tagging convention above, not by
a separate legacy collection.

**Demo/test candidates (§4 cross-reference):** the 7 collections written
by `demo-seeder.ts` — `pharmacies`, `users`, `targets`, `personal_targets`,
`kpi_entries`, `evaluation_results`, `demo_batches` — are the only
collections where individual *documents* (not whole collections) can be
confidently identified as test data, via the `isDemoData === true` field.
Confidence: **high** for all 7 — the field is set unconditionally by the
seeder and checked unconditionally by the cleanup tool, so there is no
ambiguity about which documents it applies to. Dependencies: a demo
`pharmacies` document, if deleted, would orphan any demo `users`/`targets`/
`kpi_entries` rows that reference its ID — `demo-cleanup.ts` deletes
referencing collections before the referenced `pharmacies` row to avoid
this, per its own ordering (confirmed by reading the file's delete
sequence). Recommended action for all 7: covered in
[`PRODUCTION_RESET_PROPOSAL.md`](PRODUCTION_RESET_PROPOSAL.md) Group 1.

## Referential integrity — full findings

| Reference | Enforced by rule? | Enforced by app code? | Orphan risk found |
|---|---|---|---|
| `users.pharmacyId` → `pharmacies` | No | Yes, at creation time (`territoryValidation.ts`) | Low — validated on write, not on the referenced doc's later deletion |
| `users.districtId`/`regionId` → `districts`/`regions` | No | Yes, at creation time | Low, same as above |
| `targets.kpiKey` / `kpi_entries.kpiKey` → `kpi_registry` | No | Yes, via `kpiArchiveGuard.ts` (UI-side, on-demand) | Medium — guard only runs when a human opens the archive-conflict check; no continuous enforcement |
| `evaluation_results.profileId`+`version` → `evaluation_profiles` | No | Partial — read path resolves by ID, no existence check before write | Low in practice (results are written by the engine immediately after reading the profile, narrow race window) |
| `ranking_history` entries → `users`/`pharmacies` | No | Display-only resolution (`ranking-service.fetchUserDisplayNames`), with CLAIMED-exclusion already applied | Low — a missing user resolves to a display fallback, not a crash (confirmed in PR-1B work) |
| `import_jobs` → committed `kpi_entries`/`targets` (`importBatchRef`) | Partially — DX-6 rule requires the field to be a non-empty string | No existence check anywhere | **Medium-high if `import_jobs` is ever reset** — see §6 in the main audit |
| `audit_logs.userId` → `users` | No | No | Low/acceptable — audit logs are expected to outlive the actor, see §6 |
| `evaluation_profiles` draft → registry profile parent | Yes, structurally (subcollection path) | Yes | None — subcollection path makes orphaning structurally impossible |
| Published profile → "active version" pointer | N/A (single doc field) | Yes (`EvaluationRegistryPage.tsx` publish flow) | Low |
| Archived KPI → active target/entry dependants | No | Yes, `kpiArchiveGuard.ts`, on-demand only | Medium — same as `kpiKey` row above; this is the same underlying gap surfaced twice because it touches two reference types |

No orphan, duplicate, or legacy-alias condition was found that indicates
**existing** broken data — every finding above is a description of what
*would* break if a given reset group were approved without the listed
prerequisite, not a report of current corruption. This audit had no live
database connection to run an actual orphan scan; that is precisely why
§13 (dry run) proposes a read-only counting tool rather than asserting
current counts here.
