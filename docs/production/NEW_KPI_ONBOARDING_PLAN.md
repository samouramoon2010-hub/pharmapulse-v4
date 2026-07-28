# New KPI Onboarding Plan

The exact, safe sequence for introducing each future KPI into the now-empty (0 active) `kpi_registry`. Follow this order for every new KPI — do not skip steps or batch "just create it active" shortcuts.

## Hard rule: never reuse an archived KPI's ID or alias

All 18 previous KPI keys (`wasfaty`, `omnihealth`, `wellnessCard`, `basket`, `crossSelling`, `BSU`, `NPS`, `SLC`, `guestConversion`, `holista`, `inbody`, `insuranceConversion`, `liberation`, `manuka`, `ndf`, `sales`, `sl`, `testdynamickpi`) remain in `kpi_registry` as archived documents, preserved forever alongside their historical `kpi_entries`, `targets`, and `evaluation_results` data. **A new KPI must use a new, never-before-used `key`** (and, if applicable, a new `aliasFor` engine field name). Reusing an old key for a different business meaning would silently corrupt the historical record's meaning — old evaluation results and reports referencing that key would appear to be about the new KPI's business concept when they are not.

## Sequence

1. **Owner defines the KPI.** Fill out `NEW_KPI_DEFINITION_TEMPLATE.md` completely — every field, no placeholders left for "decide later" on anything that affects evaluation math (weight, thresholds, direction).

2. **Schema validation.** Engineering checks the filled template against `NEW_KPI_SCHEMA_REFERENCE.md`'s field matrix: confirm the `key` is genuinely new (not in the 18 archived keys or any other existing key), confirm `weight` plus every other currently-active weighted KPI's weight will not exceed 1.0 once this one is added, confirm thresholds satisfy `healthy ≥ watch ≥ risk ≥ critical`, confirm `lifecycleStage` starts at `draft` or `pilot_tracking` only.

3. **Create as draft/inactive.** Write the `kpi_registry/{key}` document with `lifecycleStage: 'draft'`, `isActive: false` is NOT how draft works in this schema — draft KPIs still have `isActive` derived from `uiStatus` per `buildDocPayloadSync()` (`isActive: uiStatus !== 'ARCHIVED'`), so a draft KPI is technically `isActive: true` but `lifecycleStage: 'draft'` — the lifecycle stage, not `isActive`, is what excludes it from official actuals (`buildAllowedEntryKeys()` only admits `production_evaluation` stage). This distinction matters: do not rely on `isActive: false` to keep a draft KPI out of production — rely on `lifecycleStage`.

4. **Assign alias and immutable document ID.** Confirmed in step 2 — the Firestore document ID and the `key` field are set together at creation and the `key` field becomes immutable (Firestore rules block changing it on any subsequent update).

5. **Set sort order.** Assign an explicit `sortOrder` value now (the July 2026 fix means omitting it no longer hides the KPI, but an explicit, intentional value avoids an unpredictable position at the end of every list).

6. **Configure entry behavior.** Decide whether this KPI ever needs `visibility.targetInputEnabled` for the Monthly Target form, and confirm its `valueType`/`unit` render correctly in the KPI Entry form (verify via a test entry in a lower environment or a temporary `pilot_tracking` stage — pilot-stage KPIs are collected and displayed but never affect evaluation/rankings, exactly the safe testing state this lifecycle stage exists for).

7. **Configure target behavior.** If targets will be entered for this KPI, set `visibility.targetInputEnabled: true` and confirm `targetField` (or the default derivation) resolves correctly against the `targets`/`personal_targets` collections.

8. **Configure dashboard/report behavior.** Set `visibility.dashboardEnabled`/`teamEnabled`/`executiveEnabled`/`regionalEnabled` per the definition template's Product Behavior section.

9. **Add focused tests.** At minimum: a `buildAllowedEntryKeys()` test proving the new KPI is excluded while in `draft`/`pilot_tracking`/`shadow_evaluation` and included only once it reaches `production_evaluation`; a weight-sum regression test if this KPI carries evaluation weight; any KPI Entry/Target UI test relevant to its `valueType`.

10. **Activate the KPI.** Transition `draft → pilot_tracking → shadow_evaluation → production_evaluation` via `transitionKpiLifecycle()`, following the existing enforced transition graph (`canTransitionKpiLifecycle()`) — never skip a stage. Each transition should be a deliberate, separate decision, not automatic. `shadow_evaluation` specifically routes results to `shadow_evaluation_logs` only (invisible to pharmacists/managers) — use this stage to validate scoring behavior with zero production risk before the final promotion to `production_evaluation`.

11. **Add it to a new Evaluation Profile if required.** Only once the KPI is confirmed stable in `production_evaluation`. Create a new **draft** evaluation profile (or a new version of an existing one via `createNewVersion()`) that references this KPI in its `baskets.*.elements[]`.

12. **Publish the profile only after owner approval.** This task's scope explicitly excludes publishing any profile — that decision belongs to a future, separate authorization once the owner reviews the draft profile's full KPI set and weights.

13. **Enter real targets.** Once a profile is ready to go live, real monthly targets must exist for every branch/pharmacist this KPI applies to before the first live evaluation run — an evaluation against a missing target produces a meaningless (usually zero or undefined) achievement percentage.

14. **Smoke test.** Before declaring the new KPI live: `/entry` shows it correctly for a real pharmacist, `/targets` accepts a real target, `/dashboard`/`/reports`/`/admin/rankings` render it without error, and a real evaluation run (in `shadow_evaluation` first, then `production_evaluation`) produces a sane, expected score — not zero, not an error, not NaN.

15. **Deploy once, at the end.** All of the above (steps 1–14) can happen entirely within the existing Firestore + application code with no deployment required, since KPI Registry changes are pure data, not code. A deployment is only needed if step-9's tests required an application code change (e.g. a new `valueType` the UI doesn't yet render) — in that case, batch all such code changes together and deploy once, not incrementally per KPI.

## What this plan does not cover

- **Publishing an evaluation profile** — always a separate, explicit owner decision (step 12), never bundled into KPI creation itself.
- **Reactivating any of the 18 archived KPIs** — out of scope for this plan; reactivation (if ever needed) is a distinct decision with its own review, since these were archived deliberately.
- **Bulk/automated KPI creation** — this plan assumes one KPI at a time, reviewed individually. A batch-import path for many new KPIs at once is a distinct, larger feature, not assumed here.
