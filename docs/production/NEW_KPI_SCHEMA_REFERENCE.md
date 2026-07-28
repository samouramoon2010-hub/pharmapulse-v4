# New KPI Schema Reference

**Purpose:** the authoritative field matrix for creating a new KPI definition, derived directly from the existing codebase (`src/engine/kpiRegistry/kpiRegistryTypes.ts`'s `KpiDefinition` interface, `src/services/kpiRegistryLogic.ts`'s `docToKpiDefinition()`/`buildDocPayloadSync()`, and `firestore.rules`'s `kpi_registry` rule). No field below was invented — every row maps to a real, currently-supported field. Where the task's requested field list names a concept the architecture does **not** support today, that is stated explicitly rather than filled in with an invented field.

## Firestore document shape

- **Collection:** `kpi_registry`
- **Document ID:** the KPI's business `key` itself (e.g. `kpi_registry/wasfaty`) — the doc ID and the `key` field must match (`firestore.rules` enforces `request.resource.data.key == kpiKey` on create).
- **Write access:** admin only (create/update). **No delete** — `allow delete: if false` unconditionally; a KPI is retired via `lifecycleStage: 'archived'`, never removed.
- **Read access:** any authenticated user (`allow read: if isAuth()`).

## Field matrix

| Field | Type | Required/Optional | Allowed values | Default | Validation rule | Downstream consumers |
|---|---|---|---|---|---|---|
| `key` | string | **Required** | Any unique, stable string. Immutable after creation (Firestore rules block changing it on update). | none | Must equal the document ID on create. Never reuse an archived KPI's key for a different business meaning (see onboarding plan). | Everything — this is the join key across `kpi_entries`, `targets`, `evaluation_results`, `ranking_snapshots`. |
| `label` | string | **Required** | Any non-empty string | none | `docToKpiDefinition()` treats a doc with empty `key` or `label` as invalid and skips it entirely (silently, by design — see `mergeRemoteRegistryWithDefaults`). | KPI Entry, Targets, Dashboard, Reports, Rankings, admin KPI Management table |
| `shortLabel` | string | Optional | Any string | `label` | none | Compact displays (mobile cards, dense tables) |
| `labelAr` | string | Optional | Any string | `''` | none | Arabic-locale UI |
| `aliasFor` | string | Optional | Any existing engine field key | none (registry key IS the engine key) | Only set when the business-facing key differs from the internal engine field name (e.g. `omnihealth.aliasFor = 'omni'`). Must be read back on every edit — omitting it on an update regresses entry field resolution. | `buildAllowedEntryKeys()`, `buildKpiValuesMap()`, evaluation actuals resolution |
| `category` | `KpiCategory` | Optional | `'prescription' \| 'digital' \| 'wellness' \| 'commercial' \| 'operational' \| 'health_program'` | `'commercial'` | none enforced beyond the type union | Admin grouping/filtering |
| `valueType` | `KpiValueType` | Optional | `'number' \| 'currency' \| 'percentage' \| 'count'` | `'count'` | Drives formatting throughout the platform | KPI Entry input rendering, Dashboard/Reports number formatting |
| `unit` | string | Optional | Free text (e.g. `'SAR'`, `'units'`, `'prescriptions'`, `'%'`) | `'units'` | none | Display suffix everywhere the value is shown |
| `unitAr` | string | Optional | Free text | `'وحدة'` | none | Arabic-locale display suffix |
| `direction` | `KpiDirection` | Optional | `'higher_is_better' \| 'lower_is_better'` | `'higher_is_better'` | none | Trend arrows, achievement-color logic |
| `targetType` | `KpiTargetType` | Optional | `'absolute' \| 'percentage' \| 'ratio'` | `'absolute'` | none | Target-entry form validation |
| `weight` | number | Optional | 0–1 (fraction) | `0` | **All active core KPI weights must sum to 1.0** (enforced by `validateWeights()`, checked at registry health-check time, not at write time — see Known limitations) | Composite score calculation |
| `isActive` | boolean | **Required** (has a default, but is the primary lifecycle gate) | `true \| false` | `true` on create | Derived automatically from `uiStatus`/`lifecycleStage` by `buildDocPayloadSync()` — never set independently in the current write paths | `buildAllowedEntryKeys()` (KPI Entry + Targets allowlist), KPI Management active/archived counts |
| `isCore` | boolean | Optional | `true \| false` | `false` | Core KPIs are subject to `hideKpiDefinition()`'s restriction (cannot be hidden from input) but, as of 2026-07-07, **can** be archived like any other KPI | Admin "Protected" badge, `hideKpiDefinition()` guard, `KpiEditorModal.jsx`'s 10-key immutable-field list (a separate, wider list — see below) |
| `thresholds.healthy/watch/risk/critical` | number (0–200 each) | Optional | Any number; invariant `healthy >= watch >= risk >= critical >= 0` | `90/75/55/35` | `validateThresholds()` checks the ordering invariant at registry health-check time | Traffic-light achievement coloring across Dashboard/Reports/Rankings |
| `visibility.dashboardEnabled` | boolean | Optional | `true \| false` | `true` | none | Dashboard KPI card visibility |
| `visibility.teamEnabled` | boolean | Optional | `true \| false` | `false` | none | Team Intelligence surface |
| `visibility.executiveEnabled` | boolean | Optional | `true \| false` | `false` | none | Executive BI surface |
| `visibility.regionalEnabled` | boolean | Optional | `true \| false` | `false` | none | Regional Intelligence surface |
| `visibility.targetInputEnabled` | boolean | Optional | `true \| false` | `false` | none | Whether the Monthly Target form shows an input field for this KPI |
| `sortOrder` | number | Optional | Any number, lower = first | `999` | **Fixed 2026-07-07**: no longer enforced by a server-side Firestore `orderBy` — always assign an explicit value for any new KPI so it displays where you intend, but omitting it no longer hides the document | Display order in KPI Entry, Targets, and admin KPI Management |
| `description` | string | Optional | Free text | `''` | none | Admin tooltip / editor field |
| `lifecycleStage` | `KpiLifecycleStage` | **Required** (has a safe default for legacy docs) | `'draft' \| 'pilot_tracking' \| 'shadow_evaluation' \| 'production_evaluation' \| 'archived'` | `'production_evaluation'` (legacy-doc default only — new KPIs should start at `'draft'`) | Transitions enforced by `canTransitionKpiLifecycle()`: `draft→{pilot_tracking,archived}`, `pilot_tracking→{shadow_evaluation,archived}`, `shadow_evaluation→{production_evaluation,pilot_tracking}`, `production_evaluation→{archived}`, `archived→{pilot_tracking}` | `buildAllowedEntryKeys()` (only `production_evaluation` KPIs enter official actuals), evaluation engine inclusion, ranking eligibility |
| `isPrimary` | boolean | Optional | `true \| false` | `false` | **Invariant: exactly one KPI in the whole registry must have `isPrimary: true`, and it must be `isActive: true`.** Currently unenforced at write time — only surfaced as a health-check blocker in `KpiManagementPage.jsx` ("must have exactly one primary KPI"). With all 18 KPIs archived, this invariant is **currently violated** (0 primary active KPIs) — see readiness report. | Momentum-direction and consistency-scoring proxies (Phase 1A: registry field only, engine still hardcodes `'wasfaty'`) |
| `coachingAction` / `coachingActionAr` | string | Optional | Free text | `''` | none | Pharmacist-facing coaching guidance (Phase 1A: registry field only, UI still uses hardcoded strings) |
| `aggregationType` | `'SUM' \| 'AVG' \| 'RATIO' \| 'NOT_AGGREGATED'` | Optional | as listed | derived from `valueType` when absent | none | Executive BI aggregation |
| `polarity` | `'HIGHER_IS_BETTER' \| 'LOWER_IS_BETTER'` | Optional | as listed | derived from `direction` when absent | none | Executive scoring |
| `portfolioWeight` | number | Optional | 0–1 | `weight` | Core KPI portfolio weights must sum to 1.0 | Executive composite score |
| `actualField` | string | Optional | Any Firestore field name | `aliasFor ?? key` | none | Actuals resolution from `kpi_entries` |
| `targetField` | string | Optional | Any Firestore field name | Not auto-derived — must be set explicitly if it differs from a simple `${key}Target` pattern | none | Target resolution from `targets`/`personal_targets` |
| `defaultCap` | number | Optional | Any number | global `ACHIEVEMENT_CAP` (200) | none | Achievement percentage capping |
| `icon` | string | Optional | Any icon key (e.g. `'pill'`, `'heart'`, `'trending-up'`) | none | none | UI icon rendering |
| `colorHex` | string | Optional | Any hex color | none | none | KPI branding accent |
| `tags` | string[] | Optional | Any strings | `[]` | none | Admin search/grouping |
| `updatedBy` | string | Written automatically | admin's uid | current admin's uid | Always the currently-authenticated admin — never set manually | `kpi_audit_logs`, `audit_logs` |
| `updatedAt` / `createdAt` | Firestore Timestamp | Written automatically | `serverTimestamp()` | now | Always server-generated | Audit trail, sort tie-breaking |

## Fields requested in this task that do **not** exist in the current architecture

The task's Part 3 field list names several concepts not present in `KpiDefinition` today. Per the explicit instruction not to invent unsupported fields, these are reported as gaps rather than fabricated:

- **`scope` (pharmacist / branch / shared)** — no discrete enum field exists. Scope is expressed today only indirectly, through the `visibility` flags (`dashboardEnabled`/`teamEnabled`/`executiveEnabled`/`regionalEnabled`/`targetInputEnabled`) plus which collections a KPI's actuals are written to (`kpi_entries` is pharmacist-level; there is no first-class branch-level KPI entry collection distinct from aggregation of pharmacist entries). If the owner needs an explicit per-KPI scope classification, that is a schema addition, not a documentation gap — flagged here for a future decision, not implemented.
- **`input type`** — no dedicated field. `valueType` (`number`/`currency`/`percentage`/`count`) implicitly determines input rendering; there is no separate "input widget type" (e.g. dropdown vs. numeric field vs. slider) concept.
- **`ranking eligibility`** as a distinct flag — not separate from `lifecycleStage`. Only `production_evaluation` KPIs are processed by evaluation/ranking engines; there is no separate boolean.
- **`evaluation eligibility`** as a distinct flag — same as above, governed entirely by `lifecycleStage === 'production_evaluation'`.
- **`parent KPI` / `sub-elements` / `composite behavior`** — no such relationship exists in `KpiDefinition`. Every KPI is a flat, independent definition. Evaluation profiles reference KPIs via `baskets.*.elements[].kpiKey` (a profile-level grouping), but this is not a KPI-to-KPI parent/child relationship — it's profile authoring structure, unrelated to the registry schema itself.
- **`effective start period` / `effective end period`** — no such fields exist. A KPI's "start" is implicitly whenever its `lifecycleStage` first reaches `production_evaluation`; there is no explicit date-range field, and no automatic end-dating — retirement is manual (archive it).
- **`owner` (governance)** — no per-KPI ownership field exists in the schema. `updatedBy` records who last edited it, but that is an audit trail, not a designated business owner.
- **`approval status`** — no separate approval workflow field. The closest existing concept is `lifecycleStage` itself (`draft` → ... → `production_evaluation` requires "GO/NO-GO sign-off" per the type's own documentation comment, but this is a process convention, not an enforced Firestore field or workflow gate).

## Additional governance constant: `PROTECTED_CORE_KEYS`

A hard-coded `Set` in `src/services/kpiRegistryLogic.ts` (currently empty of practical effect for archival as of 2026-07-07, but still enforced for `hideKpiDefinition()`) and a separate, wider 10-key `PROTECTED_KEYS` list in `KpiEditorModal.jsx` that locks the `key`/category/lifecycle/`isCore` fields from editing for those specific keys. **New KPIs are never added to either list automatically** — this is a manual, code-level decision, not a registry field. If the owner wants a new KPI similarly protected, that requires a separate, explicit code change (out of scope for KPI creation itself).
