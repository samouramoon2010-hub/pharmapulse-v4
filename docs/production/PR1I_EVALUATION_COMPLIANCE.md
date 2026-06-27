# PR-1I — Evaluation Compliance Fix

## 1. Scope

Two approved business-rule compliance gaps, both previously identified
and deliberately deferred in
[`PR1H_DEFERRED_LIMITATIONS.md`](PR1H_DEFERRED_LIMITATIONS.md) item 13:

- **Rule A** — missing-data exclusion + proportional weight
  redistribution within a basket.
- **Rule B** — final official score rounded to exactly 2 decimal
  places at the final boundary.

Fixed in **both** production-connected scoring implementations (see
[`PR1I_BASELINE.md`](PR1I_BASELINE.md) §"Two engines in scope"):

- V1 — `src/engine/evaluationEngine/evaluationEngine.ts`
- V2 — `src/engine/evaluationPipeline/processors.ts`
  (legacy-flow `WEIGHTED_AVERAGE_AGGREGATOR` and SMARTS-flow
  `WEIGHT_CONTRIBUTION_APPLIER` + `SUM_AGGREGATOR`)

via two new shared, pure utility modules under `src/engine/evaluationShared/`
(the existing precedent for code shared between V1 and V2 — see
`thresholdUtils.ts`):

- [`weightRedistribution.ts`](../../src/engine/evaluationShared/weightRedistribution.ts)
  — `computeApplicableWeightSum()`, `normalizedElementWeight()`
- [`scoreRounding.ts`](../../src/engine/evaluationShared/scoreRounding.ts)
  — `roundToTwoDecimals()`

## 2. Rule A — weight redistribution implementation

**Formula (as specified):**

```
normalizedWeight_i      = originalWeight_i / Σ(originalWeight of all applicable elements)
weightedContribution_i  = elementScore_i × normalizedWeight_i
```

**Applicability signal reused, not reinvented:** both engines already
had a correct `dataAvailable` flag
(`rawActual != null && isFinite(rawActual)`) that already distinguished
missing data from an actual `0`. This existing, correct signal is the
sole input to applicability — no new "is this KPI missing" logic was
introduced.

**V1 (`scoreBasket` in `evaluationEngine.ts`):**

```ts
const applicableWeightSum = computeApplicableWeightSum(elementResults)
// each element: normalizedWeight = normalizedElementWeight(weight, dataAvailable, applicableWeightSum)
const aggregateAchievementPct = applicableWeightSum > 0
  ? elementResultsWithWeights.reduce(
      (sum, el) => sum + el.cappedAchievementPct * (el.normalizedWeight ?? 0), 0)
  : 0   // no applicable elements → safe no-data state, never NaN
```

**V2 legacy flow (`WEIGHTED_AVERAGE_AGGREGATOR`):** identical formula,
applied per-basket before the existing weighted-average reduce.

**V2 SMARTS flow (`WEIGHT_CONTRIBUTION_APPLIER`):** the SMARTS flow
computes each element's `contribution` independently (consumed later by
`SUM_AGGREGATOR`), so the same `applicableWeightSum` /
`normalizedElementWeight` calls were placed inside this processor,
per-basket, before computing `contribution = cappedAchievementPct ×
normalizedWeight`.

**Worked examples (matches the three examples in the original spec):**

1. Weights 50/30/20%, the 20% element missing → applicable total 80%,
   the remaining two elements normalize to 62.5%/37.5%. Verified by
   `pr1iEvaluationCompliance.test.ts` case (1) and
   `pr1iPipelineCompliance.test.ts` (legacy + SMARTS).
2. An element with real data and an actual achievement of 0% stays
   applicable and is **not** redistributed (`dataAvailable=true`
   because `0 != null && isFinite(0)`). Verified by case (3).
3. All elements in a basket missing → `applicableWeightSum = 0` →
   `aggregateAchievementPct = 0`, no divide-by-zero, no invented score.
   Verified by case (5) (V1) and the equivalent V2 pipeline case.

## 3. Rule B — rounding implementation

```ts
export function roundToTwoDecimals(value: number): number {
  if (!isFinite(value)) return value
  return Math.round((value + Number.EPSILON) * 100) / 100
}
```

Applied **once**, at the final official boundary, in both engines:

- `finalScore` — rounded from the raw `Σ basket.weightedScore`.
- `trace.normalizedFinalScorePct` — rounded from the raw normalization
  result, computed from the **unrounded** `rawFinalScore` (rounding
  `finalScore` first, then normalizing from the rounded value, would
  degrade the normalization math's precision — the spec explicitly
  calls this out, and it is why `rawFinalScore` is computed and held
  separately before either rounding step runs).
- The top-level rating band is matched against the **rounded**
  `normalizedFinalScorePct`, since that is the official value going
  forward.

Both raw values are preserved, not discarded, in `CalculationTrace`
(`trace.rawFinalScore`, `trace.rawNormalizedFinalScorePct`) — see §5.

No element-level or basket-level intermediate value is rounded.
`cappedAchievementPct`, `achievementPct`, `aggregateAchievementPct`, and
`weightedScore` all retain full floating-point precision exactly as
before; only the two final, official, top-level numbers are rounded,
matching "rounding occurs once at the final official boundary."

## 4. Applicability semantics audit (required, §5 of spec)

| Input state | `dataAvailable` | Redistributed? | Where decided |
|---|---|---|---|
| Missing field (`kpiActuals[engineKey]` absent) | `false` | Yes | `rawActual != null` is `false` |
| `null` | `false` | Yes | same check |
| `undefined` | `false` | Yes | same check |
| Blank string (coerced to `NaN` upstream, or simply absent from the map) | `false` | Yes | `isFinite(NaN)` is `false`, or absent entirely |
| Invalid numeric value (`NaN`, `Infinity`) | `false` | Yes | `isFinite(rawActual)` is `false` |
| Zero (`0`) | **`true`** | **No** | `0 != null && isFinite(0)` is `true` — this is the existing, correct `0 !== missing` contract, reused unchanged |
| Negative value | `true` (engine does not treat negative as invalid — pre-existing, unchanged behavior, out of this phase's scope) | No | same check; not part of either approved rule |
| Excluded by profile (basket `active: false`) | n/a — the whole basket is filtered out of `activeBaskets` before any element is scored | n/a | unchanged, pre-existing `profile.basketIds.map(...).filter(b => b.active !== false)` |
| Archived KPI (registry `isActive: false`) | V1: not checked at all (no exclusion); V2: contextBuilder records an `integrityWarnings` diagnostic but still evaluates it ("evaluated for historical compatibility") | No (unchanged, pre-existing, not part of this phase) | `contextBuilder.ts` integrity diagnostics, pre-existing |
| No target (target resolves to 0) | independent of `dataAvailable` — `achievementPct` becomes `0` via the existing `target > 0` guard, but `dataAvailable` is still determined solely by the actual value | depends only on actual | `resolveTarget()` / `achievementPct = target > 0 ? ... : 0` — unchanged |
| No actual, target present | `false` | Yes | covered above |
| Target present, zero target | `achievementPct = 0` regardless of actual (pre-existing divide-by-zero guard) | applicability still driven by actual's presence, independent of target | unchanged |
| Combined-element partial data (e.g. Wasfaty NPS/Yusr style) | Determined per-element by the same `dataAvailable` check; the engine has no special-casing for "combined" elements — any combination/aggregation across raw KPI fields is the caller's responsibility before populating `kpiActuals` | per-element, same rule | `pr1iEvaluationCompliance.test.ts` case (11) |
| Branch-level shared data vs. pharmacist-level individual data | The engine reads only `kpiActuals[engineKey]`; it has no concept of who produced that number. Applicability is identical regardless of conceptual origin. | per-element, same rule | `pr1iEvaluationCompliance.test.ts` case (10) |

**Canonical contract (single source of truth, both engines):**
`dataAvailable = rawActual != null && isFinite(rawActual)`. This was
already correct before PR-1I and is unchanged by this phase — PR-1I's
only change is to make the *consequence* of `dataAvailable=false`
(weight redistribution) compliant; the *determination* of
`dataAvailable` itself required no fix. `0 !== missing` was already
true in the code; it is now also true in the aggregate math (previously
a missing element's weight silently evaporated rather than being
redistributed, which is the actual bug this phase fixes).

## 5. Traceability (required, §6 of spec)

Smallest backward-compatible extension, following the established
`CalculationTrace.normalizedFinalScorePct?` / `integrityWarnings?`
optional-field pattern (both already documented "Backwards-compatible:
absent on ledger docs written before this field was added"):

**`ElementResult` (and the V2 `ElementContext`/mapper):**
- `normalizedWeight?: number` — the element's weight after redistribution.
- `exclusionReason?: 'no-data'` — set when the element was excluded.
- Pre-existing fields already cover: original weight (`weight`),
  applicability status (`dataAvailable`), raw element score
  (`achievementPct`), capped element score (`cappedAchievementPct`).

**`BasketResult` (and the V2 `BasketContext`/mapper):**
- `applicableWeightSum?: number` — the denominator used for this
  basket's redistribution.
- Pre-existing fields already cover: raw aggregate score
  (`aggregateAchievementPct`).

**`CalculationTrace`:**
- `rawFinalScore?: number` — unrounded final score.
- `rawNormalizedFinalScorePct?: number` — unrounded normalized score.
- Pre-existing `normalizedFinalScorePct` now holds the **rounded**
  official value.

No existing trace field was removed, renamed, or repurposed in a
breaking way (the `salesRequiredFix.test.ts` source-text update is a
local-variable rename inside the implementation, not a trace schema
change). No Firestore migration, no stored-profile-format change.

## 6. Persistence and consumers (required, §7 of spec)

Audited every consumer that reads `EvaluationResult.finalScore` or
`trace.normalizedFinalScorePct`:

| Consumer | File | Reads | Change needed? |
|---|---|---|---|
| Ledger writer | `evaluationLedgerService.ts:175,225` | `result.finalScore` | **None** — persists whatever `runEvaluation`/the pipeline returns, which is now already rounded. |
| Ranking service | `ranking-service.ts:354-371` | `trace.normalizedFinalScorePct` (→ `cappedScore`), `doc.finalScore` (→ `uncappedScore`) | **None** — reads the field directly with no parallel rounding logic to reconcile. |
| Shadow comparison | `shadowEvaluationLogService.ts` | `finalScore`, `normalizedFinalScorePct`, compared with a 0.01 numeric tolerance | **None** — the tolerance already accommodates the rounding delta; V1 and V2 now both round the same way, so genuine non-compliance-related shadow mismatches are unaffected. |
| `EvaluationRunPage.tsx` | display only | `.toFixed(3)` in JSX | **None** — display formatting is independent of and unaffected by the now-rounded stored value. |
| `RankingsPage.tsx` | display only | `.toFixed(1)` in JSX | **None.** |
| Pharmacist Intelligence (`usePharmacistIntelligenceData.js`, `PharmacistIntelligencePage.jsx`, `pharmacistIntelligenceViewModelBuilder.ts`) | reads `finalScore` raw, displays as `${value}%` | **None** — now displays the rounded value automatically. |

No UI wording or layout change was required anywhere — every consumer
already read the score field directly with no intermediate rounding of
its own to conflict with, so the fix lands transparently the moment the
engines return rounded numbers. Regression coverage:
`pr1iEvaluationCompliance.test.ts` Rule B case (10) directly asserts
`trace.normalizedFinalScorePct` (the field `ranking-service.ts` reads)
equals the expected rounded value, not the raw float.

## 7. Parity and compatibility (required, §8 of spec)

Full regression run across every parity-relevant existing suite — see
[`PR1I_TEST_EVIDENCE.md`](PR1I_TEST_EVIDENCE.md) — 100% green except the
one documented, intentional source-text rename in
`salesRequiredFix.test.ts`. No snapshot was silently updated; the single
test edit is explained in the evidence doc with its exact before/after
diff and reasoning.

**Intended compliance delta vs. regression, explicitly distinguished:**
any historical evaluation result that included a basket with at least
one missing optional KPI will, if recomputed, now produce a different
`aggregateAchievementPct` (because that KPI's weight is redistributed
rather than silently dropped) and a `finalScore`/`normalizedFinalScorePct`
rounded to 2 decimals rather than a raw float. This is the **intended,
approved compliance correction**, not a regression — it only changes
results for evaluations that actually hit the two non-compliant
conditions; any evaluation where every element had data and the raw
score already happened to be a clean 2-decimal value is bit-for-bit
unchanged (see Test Evidence §6).

## 8. No-data behavior (required, §9 of spec)

| Scenario | Result |
|---|---|
| One applicable element | Aggregate = that element's score; `normalizedWeight = 1` (its full basket weight). Unchanged from pre-fix when it was already the only element. |
| Several applicable elements, none missing | Aggregate unchanged from pre-fix (redistribution is a no-op when `applicableWeightSum` already equals the basket's full weight). |
| No applicable elements | `aggregateAchievementPct = 0`, no `NaN`, no divide-by-zero — the existing, already-approved no-data numeric contract, now reached via an explicit guard rather than incidentally. |
| Only zero-achievement applicable elements | All elements `dataAvailable=true`, none redistributed; aggregate reflects the genuine 0% achievements weighted normally — e.g. two elements at 0% each still aggregate to 0%, but for the *correct* reason (real zero, not missing-data evaporation). |
| Missing target, present actual | `achievementPct` follows the pre-existing `target > 0` guard (→ 0), independent of `dataAvailable`, which is driven solely by the actual value. |
| Present target, missing actual | `dataAvailable=false` → excluded + redistributed. |
| Combined element partially available | No engine-level special case exists for "combined" elements (see §4); partial availability is handled by the caller's `kpiActuals` aggregation before the engine runs. |
| Excluded profile element | Basket-level `active: false` exclusion is unchanged and unaffected by this phase — verified by `pr1iEvaluationCompliance.test.ts` case (9). |

No fabricated zero score is returned for a true no-data evaluation
beyond the existing, already-shipped contract (0 for a no-data basket
aggregate) — this phase did not change *that* contract, only fixed the
arithmetic that surrounds it (the missing-data weight evaporation bug).
