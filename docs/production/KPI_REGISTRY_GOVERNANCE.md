# KPI Registry Governance — PR-1C

Canonical reference for the `isCore` field, the production UI presentation
rules around it, the archive dependency model, and the registry's current
demo/test-data status.

## `isCore` — what it means and where it still matters

`isCore` is an internal protection flag on five KPI keys:

```
wasfaty, omnihealth, wellnessCard, basket, crossSelling
```

(`PROTECTED_CORE_KEYS` in [`kpiRegistryLogic.ts`](../../src/services/kpiRegistryLogic.ts).)

Before PR-1C, `isCore` also drove a visible "Core" badge, a dedicated
table column, and a "Core"/"Custom" pill shown to every user in Settings —
none of that reflected anything about the KPI's actual importance; it was
simply whichever five keys happened to predate the dynamic KPI registry.
That presentation has been removed. **The field itself, and every place it
drives real runtime behavior, is unchanged:**

| Where `isCore` is read | What it does | Status |
|---|---|---|
| `kpiRegistryService.archiveKpiDefinition` / `hideKpiDefinition` | Blocks archive/hide for protected keys | **Preserved** — real protection, not cosmetic |
| `KpiRegistryTable.jsx` Target-input dot | `enabled={uiStatus==='ACTIVE' && kpi.isCore}` — only protected KPIs get manual target-input by default | **Preserved** — real behavior; the dot has never said "Core" |
| `kpiUiAdapter.ts` (`isHighlighted`/`isRequired`/`isMandatoryInput`) | Forces protected KPIs into mandatory-input/highlighted state in entry forms | **Preserved** — not a registry-screen concern, out of scope for this section |
| `dynamicExecutiveAdapter.ts` (executive heatmap filter + core-first sort) | Restricts the executive heatmap to `isCore` KPIs and sorts them first | **Preserved, documented as a known limitation** — this conflates "protected" with "executive-worthy," which is a real architectural overlap worth revisiting in a future section, but rewiring the executive heatmap's KPI selection is outside PR-1C's registry-cleanup scope |

What changed (presentation only, in this section):
- `KpiRegistryTable.jsx` — removed the `ProtectedBadge` ("Core") column entirely.
- `KpiEditorModal.jsx` — protected-KPI subtitle no longer says the literal field name `isCore`; uses "protection status" instead.
- `SettingsPage.jsx` — removed the Core/Custom badge and the `isCore`-driven dot color from the per-user "Active KPIs" list (this was shown to **every** user, not just admins — the most user-facing instance of the misleading distinction).

No persisted document field was renamed, removed, or migrated.

## Pilot-tracking field classification (PR-1D closure)

A KPI Entry closure check found editable pilot-tracking KPI inputs
(`lifecycleStage: 'pilot_tracking'`, e.g. `insuranceConversion`) rendered
on `KpiEntryPage.jsx` whose typed values could never reach Firestore.
Traced the full path:

```
rendered field → form state → save payload → sanitizer/service → Firestore → readers
```

| Step | Finding |
|---|---|
| Rendered field | Pilot KPI inputs rendered via `getPilotTrackingKpis()`, with a `TrackingOnlyBadge` |
| Form-state key | Engine key, same shape as production fields |
| Save payload | **Excluded** — `handleSave`'s payload-building loop only ever iterated `entryFields` (production KPIs); pilot keys were never added |
| Sanitizer/service | Even if added, `sanitizeKpiEntryFields()` → `buildAllowedEntryKeys()` (`kpiRegistryLogic.ts`) structurally excludes any KPI whose `lifecycleStage !== 'production_evaluation'` — a deliberate, tested hardening boundary (`buildAllowedEntryKeysHardening.test.ts`), not an oversight. Its own comment: "A misconfigured evaluation profile that tried to include a pilot KPI would receive 0 from kpiActuals rather than the pilot KPI's actual value." |
| Firestore | No pilot actual value has ever been written to `kpi_entries` via this write path |
| Readers | `ReportsPage.jsx`'s pilot section, `DashboardPage.jsx`'s pilot section, and `TargetsPage.jsx`'s pilot *target* section all read/write independently of KPI Entry's actuals write path — none were touched by this investigation |

**Classification: Deprecated/Unsupported** (for KPI Entry's actuals
write path specifically). No valid production storage contract exists
for pilot KPI actuals via `saveKpiEntry`/`kpi_entries` — the hardening
that prevents it is intentional and remains in place. Editable inputs
that imply data is being tracked but can never be persisted are
unsupported, dead UI by the decision rule "do not leave editable fields
that are silently discarded."

**Resolution applied**: removed the pilot-tracking input section (and
its now-dead `buildPilotEntryFields()`/`pilotEntryFields` form state)
from `KpiEntryPage.jsx`. No Firestore change, no migration, no historical
data affected (none existed to begin with for this path). Pilot KPIs
remain fully visible — exactly as before — on Dashboard and Reports
(display-only there, via their own, untouched code paths), and pilot
KPI *targets* remain editable on Targets (a separate write path with no
component of this hardening). `getPilotTrackingKpis()`, the
`pilot_tracking` lifecycle stage, and the Legacy Adapter's pilot-key
stripping are all unchanged.

## Archive dependency model

Before PR-1C, `archiveKpiDefinition()` had no dependency check — a KPI
could be archived while still referenced by a published evaluation
profile. [`kpiArchiveGuard.ts`](../../src/services/kpiArchiveGuard.ts)
adds `checkKpiArchiveDependencies(kpiKey)`, wired into
`KpiManagementPage.jsx`'s archive button (`requestArchive` →
dependency-check modal → `confirmArchive`).

| Dependency type | Hard blocker? | Why |
|---|:---:|---|
| Active (published) evaluation profile references this KPI | **Yes** | Archiving would silently remove a KPI an in-production profile still scores |
| Draft evaluation profile references this KPI | **Yes** | Same risk once that draft is published |
| Monthly targets exist for this KPI | No — informational | Targets are historical records, never deleted by archive |
| Actuals (`kpi_entries`) exist for this KPI | No — informational | Actuals are historical records, never deleted by archive |
| Computed evaluation results reference this KPI | No — informational | Results are historical records, never deleted by archive |

The check performs a full scan of `evaluation_profiles`, `targets`,
`kpi_entries`, and `evaluation_results` and filters in memory — these
collections store KPI values under dynamic per-KPI fields or nested
arrays, which Firestore cannot filter server-side without a new per-KPI
index. This is acceptable because the check only runs when an admin
explicitly requests to archive one KPI, not on every page load.

No cascade delete exists or was added. Archive is a soft status
transition (`isActive:false`, `uiStatus:'ARCHIVED'`) exactly as before;
historical documents in every collection above are always preserved.

## Validation warning grouping

`KpiManagementPage.jsx`'s registry health check now splits findings into:
- **Blockers** — prevent correct evaluation (currently: "must have exactly
  one primary KPI"). Always expanded.
- **Recommendations** — content-completeness gaps (missing Arabic label,
  missing coaching action EN/AR). Collapsed by default, business-language
  messages naming the KPI by label, not by raw warning string concatenation.

## Demo/test KPI classification

Audited `DEFAULT_KPI_REGISTRY` (11 KPI definitions: 5 protected core +
6 standard business KPIs — `sales`, `sl`, `ndf`, `inbody`, `liberation`,
`insuranceConversion`). **None are demo, test, or seed artifacts** — every
entry is a legitimate production KPI definition. No cleanup action was
needed or taken.

Demo *data* (KPI entry/target values, not KPI definitions) is handled
separately by [`demo-seeder.ts`](../../src/demo/demo-seeder.ts), which
already tags every document with `isDemoData:true` + `demoBatchId` and
only cleans up matching batches — this was audited and found already
correct; no change made in this section.
