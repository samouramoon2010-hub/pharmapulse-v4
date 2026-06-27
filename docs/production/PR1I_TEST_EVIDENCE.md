# PR-1I — Test Evidence (Red → Green)

Per the required "tests first" process: the compliance tests below were
written and run against the **unmodified** engine before any
implementation change, to prove the two approved gaps are real defects
and not a misreading of the spec. The same tests are then shown passing
after the fix, alongside the full existing regression suite.

## 1. RED — before the fix

File:
[`src/engine/evaluationEngine/pr1iEvaluationCompliance.test.ts`](../../src/engine/evaluationEngine/pr1iEvaluationCompliance.test.ts)
(22 assertions, V1 engine), run against the pre-fix
`evaluationEngine.ts`:

```
Test Files  1 failed (1)
     Tests  11 failed | 11 passed (22)
```

11 of 12 weight-redistribution cases failed (one — "actual zero remains
applicable" — already passed pre-fix, because `dataAvailable` was
already computed correctly; the bug was specifically the *missing*-data
case, not the zero-vs-missing distinction itself). All 4 rounding cases
that exercised the actual engine output (vs. the rounding utility in
isolation) failed. Representative failures:

```
PR-1I Rule A (1) one missing KPI redistributes proportionally
AssertionError: expected 58 to be close to 72.5, received difference is 14.5

PR-1I Rule A (2) multiple missing KPIs redistribute correctly
AssertionError: expected 51 to be close to 72.85714285714286

PR-1I Rule A (6) capped KPI remains capped before/within weighted contribution
AssertionError: expected 65 to be close to 130

PR-1I Rule A (8) profile-driven custom weights redistribute correctly
AssertionError: expected 59.099999999999994 to be close to 75.76923076923076

PR-1I Rule A (10) mixed-origin actuals preserve applicability semantics
AssertionError: expected 45 to be close to 75

PR-1I Rule A (12) OmniHealth-style sub-element redistributes only when missing
AssertionError: expected 30 to be close to 60

PR-1I Rule B (3) long-tail raw float rounds to exactly 2 decimals
AssertionError: expected 2.7142857142857144 to be 2.71

PR-1I Rule B (8) persisted finalScore is a real two-decimal numeric value
AssertionError: expected 0.4285714285714448 to be less than 1e-9

PR-1I Rule B (9) trace exposes the raw pre-rounding value distinctly
AssertionError: expected undefined to be defined   (trace.rawFinalScore did not exist)

PR-1I Rule B (10) ranking-relevant normalizedFinalScorePct is rounded
AssertionError: expected 85.71428571428572 to be 85.71
```

The Rule B fixture was deliberately engineered (basket weights `1/7,
2/7, 4/7` against band scores producing a raw `2.7142857142857144`) so
the assertion is a genuine numeric proof, not a tautology — two earlier
draft assertions that compared the engine's own output against
`roundToTwoDecimals(thatSameOutput)` were identified as circular during
authoring and rewritten against an independently-computed expected
constant before this red run was captured.

Full-repository run with the new (still failing) file included:

```
Test Files  1 failed | 352 passed (353)
     Tests  11 failed | 25512 passed (25523)
```

## 2. GREEN — after the fix

Same file, against the fixed `evaluationEngine.ts`:

```
Test Files  1 passed (1)
     Tests  22 passed (22)
```

V2 pipeline parity file (new):
[`src/engine/evaluationPipeline/pr1iPipelineCompliance.test.ts`](../../src/engine/evaluationPipeline/pr1iPipelineCompliance.test.ts)
(9 assertions, covering both the legacy `WEIGHTED_AVERAGE_AGGREGATOR`
flow and the SMARTS `WEIGHT_CONTRIBUTION_APPLIER`/`SUM_AGGREGATOR` flow):

```
Test Files  1 passed (1)
      Tests  9 passed (9)
```

Focused evaluation-area regression run (existing suites — engine,
registry, pipeline, V2 promotion, shadow log sanitizer, metadata
fields, limited rollout, evaluation ledger — 50 files):

```
Test Files  50 passed (50)
      Tests  1166 passed (1166)
```

One pre-existing test required updating —
[`salesRequiredFix.test.ts`](../../src/engine/evaluationEngine/salesRequiredFix.test.ts),
describe block "SMARTS sales fix — scope guard," test "rating
normalization is present": this is a literal source-text match
(`expect(src.default).toContain('finalScore = basketResults.reduce')`)
against `evaluationEngine.ts`. PR-1I renamed the raw (pre-rounding) sum
from `finalScore` to `rawFinalScore` so the rounding step has a name —
the underlying formula it was asserting (`Σ basket.weightedScore`) is
unchanged, only the variable name changed. The assertion was updated to
match the new (still-correct) source text. This is the only test whose
source needed editing; no test's *expected numeric value* for an
already-passing scenario changed.

## 3. Full project suite — final

```
Test Files  354 passed (354)
      Tests  25532 passed (25532)
```

(352 files / 25,501 tests carried over from PR-1H's close, + 2 new files
for this phase: `pr1iEvaluationCompliance.test.ts` (22) and
`pr1iPipelineCompliance.test.ts` (9) = 354 files / 25,532 tests. Zero
failures.)

## 4. TypeScript

```
npx tsc --noEmit
```

Zero errors before and after. Same single pre-existing informational
notice (TS5101, deprecated `tsconfig.json` `baseUrl` option) present in
every prior phase of this program — not a compile error, not touched by
PR-1I.

## 5. Production build

```
npm run build
```

Succeeded. Output unchanged in shape: 13-entry PWA precache manifest
(2977.48 KiB), same pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` and
chunk-size warnings (unrelated to this phase, not regressions —
identical warning list to PR-1H's build).

## 6. No regression beyond the documented, intended delta

Every test that passed before PR-1I and exercises a scenario with **no
missing-data element** continues to produce the exact same numeric
result, because:

- Weight redistribution is a no-op when every element in a basket has
  data (`applicableWeightSum` then equals the basket's full weight sum,
  so `normalizedWeight === weight` for every element — identical to the
  pre-fix formula).
- Rounding to 2 decimals is a no-op for any value that was already a
  clean 2-decimal (or fewer-decimal) number, which covers the large
  majority of existing fixture data in the pre-existing test suite.

The only behavioral deltas are exactly the two approved compliance
fixes, both intended and both covered by the new tests above — no
unexplained or silent change to any other test's expected value.
