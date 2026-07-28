# New KPI Definition Template

Copy this template once per new KPI. Fill in every field before handing it to engineering for schema validation (see `NEW_KPI_ONBOARDING_PLAN.md` step 2). Field names in `code` map directly to `NEW_KPI_SCHEMA_REFERENCE.md`'s field matrix — cross-check there for allowed values and defaults.

---

## Identity

- **KPI name (English):** _______________  → `label`
- **KPI name (Arabic):** _______________  → `labelAr`
- **Short label (for compact displays):** _______________  → `shortLabel`
- **Alias / document ID (business key):** _______________  → `key`
  - Must be unique, stable, and **never reused from an archived KPI** (see onboarding plan — reusing an archived key/alias for a different business meaning would corrupt historical data's meaning).
  - If this KPI's engine-internal field name differs from the business key, specify it: **Engine field name:** _______________  → `aliasFor`
- **Business description:** _______________  → `description`

## Scope

- **Who enters this KPI's actuals?** (pick one — see `NEW_KPI_SCHEMA_REFERENCE.md`'s "does not exist" section: there is no dedicated `scope` field today; this is expressed via the visibility flags below)
  - [ ] Pharmacist (individual daily entry via KPI Entry)
  - [ ] Branch (aggregated across pharmacists)
  - [ ] Shared (both)

## Measurement

- **Unit:** _______________ (e.g. SAR, count, %, score) → `unit` / `unitAr`
- **Value type:** [ ] number [ ] currency [ ] percentage [ ] count → `valueType`
- **Actual data source:** where does the real value come from? (manual pharmacist entry / Data Exchange import / other system) — informs which `kpi_entries` field this maps to (`actualField`)
- **Aggregation method:** [ ] SUM [ ] AVG [ ] RATIO [ ] NOT_AGGREGATED → `aggregationType`
- **Direction:** [ ] Higher is better [ ] Lower is better → `direction`
- **Target logic:** [ ] Absolute [ ] Percentage [ ] Ratio → `targetType`
- **Achievement cap (optional):** _______________ (defaults to 200 if left blank) → `defaultCap`
- **Thresholds (0–200%, must satisfy healthy ≥ watch ≥ risk ≥ critical):**
  - Healthy: _______________
  - Watch: _______________
  - Risk: _______________
  - Critical: _______________
  → `thresholds.{healthy,watch,risk,critical}`

## Product behavior

- [ ] Show in KPI Entry → `visibility.targetInputEnabled` is unrelated; entry visibility is governed by `lifecycleStage === 'production_evaluation'` + `isActive`, not a separate flag
- [ ] Show in Dashboard → `visibility.dashboardEnabled`
- [ ] Show in Team Intelligence → `visibility.teamEnabled`
- [ ] Show in Executive BI → `visibility.executiveEnabled`
- [ ] Show in Regional Intelligence → `visibility.regionalEnabled`
- [ ] Allow target entry (Monthly Targets form) → `visibility.targetInputEnabled`
- [ ] Include in Rankings → governed entirely by `lifecycleStage === 'production_evaluation'` — no separate flag exists
- [ ] Include in Evaluation → same as above — no separate flag exists

## Evaluation

- **Weight (fraction of composite score, 0–1):** _______________ → `weight` (and `portfolioWeight` if it should differ for executive composite scoring)
  - **Reminder:** all active, weighted KPIs' weights must sum to 1.0 across the whole registry — check this against every other currently-active weighted KPI before finalizing.
- **Score method:** derived automatically from `direction` + `thresholds` — no separate field to fill in.
- **Missing-data behavior:** not owner-configurable per KPI today — the engine's existing missing-data handling applies uniformly (see engineering, not a template field).
- **Parent/sub-element relationship:** **not supported by the current schema** — every KPI is flat and independent (see schema reference). Leave blank; if this KPI conceptually depends on others, describe the relationship in free text here for engineering discussion, but it cannot be encoded as a registry field today: _______________
- **Effective period:** **not supported by the current schema** — there is no start/end date field. The KPI becomes "live" the moment its `lifecycleStage` reaches `production_evaluation`, and stays live until manually archived.

## Governance

- **Sort order (lower = displays first; must be explicit — no longer optional in practice since the July 2026 `sortOrder` visibility fix removed the old "silently missing" fallback safety net... actually it's still optional, defaults to 999, but explicit is strongly recommended):** _______________ → `sortOrder`
- **Owner (business owner of this KPI's definition — not a registry field, record here for the approval paper trail only):** _______________
- **Approval status:** [ ] Proposed [ ] Reviewed [ ] Approved by owner — **not a registry field; this is a paper-trail-only checkbox for this template, since no approval-workflow field exists in the schema**
- **Initial lifecycle state:** [ ] draft [ ] pilot_tracking — **new KPIs must never start at `production_evaluation` or `archived`** → `lifecycleStage`
- **Core KPI?** [ ] Yes [ ] No → `isCore` (if Yes, decide explicitly whether to also add this key to `PROTECTED_CORE_KEYS`/`KpiEditorModal.jsx`'s `PROTECTED_KEYS` — a separate, deliberate code change, not automatic)
- **Icon (optional):** _______________ → `icon`
- **Color (optional, hex):** _______________ → `colorHex`
- **Tags (optional, for admin search):** _______________ → `tags`

---

**Once every field above is filled in and reviewed, hand this completed template to engineering to begin `NEW_KPI_ONBOARDING_PLAN.md` step 2 (schema validation).**
