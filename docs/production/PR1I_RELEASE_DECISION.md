# PR-1I — Release Decision

## Scope completed

Both approved compliance fixes, in both production-connected scoring
engines:

- **Rule A** — missing-data exclusion + proportional weight
  redistribution (V1 `scoreBasket`; V2 `WEIGHTED_AVERAGE_AGGREGATOR` and
  `WEIGHT_CONTRIBUTION_APPLIER`).
- **Rule B** — final score (and `normalizedFinalScorePct`) rounded to
  exactly 2 decimal places at the final official boundary, raw precision
  preserved separately in the trace.

## Baseline

Branch `feature/data-exchange-studio-v1`, commit
`2d978fc56e522320a789cfee767424c52c71f1c8` (unchanged — no commit
created this phase). See [`PR1I_BASELINE.md`](PR1I_BASELINE.md).

## Current defect evidence

Captured before any code change: 11 of 22 new compliance assertions
failed against the unmodified V1 engine, with concrete numeric proof
(e.g. expected `72.5`, got `58`; expected `85.71`, got
`85.71428571428572`). Full detail in
[`PR1I_TEST_EVIDENCE.md`](PR1I_TEST_EVIDENCE.md) §1.

## Weight redistribution implementation

New shared utility
[`evaluationShared/weightRedistribution.ts`](../../src/engine/evaluationShared/weightRedistribution.ts),
consumed by both engines. Detail and worked examples in
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §2.

## Missing versus zero behavior

Unchanged, pre-existing, already-correct `dataAvailable = rawActual !=
null && isFinite(rawActual)` reused as the sole applicability signal —
`0 !== missing` was already true in the code; PR-1I makes it also true
in the aggregate math. Full audit table in
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §4.

## Final rounding implementation

New shared utility
[`evaluationShared/scoreRounding.ts`](../../src/engine/evaluationShared/scoreRounding.ts)
(`Math.round((value + Number.EPSILON) * 100) / 100`), applied once at
the final boundary in both engines. Detail in
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §3.

## Cap behavior

Unchanged. Caps are still applied at element-scoring time, before
weight redistribution and before final rounding — capping happens
first, redistribution operates on the already-capped value, rounding
happens last, exactly matching the existing engine order. Verified by
`pr1iEvaluationCompliance.test.ts` Rule A case (6) and Rule B cases
(6)-(7).

## Traceability

`ElementResult.normalizedWeight?`, `ElementResult.exclusionReason?`,
`BasketResult.applicableWeightSum?`, `CalculationTrace.rawFinalScore?`,
`CalculationTrace.rawNormalizedFinalScorePct?` — all optional,
backward-compatible, following the existing
`normalizedFinalScorePct?`/`integrityWarnings?` precedent. No schema
migration. Detail in
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §5.

## Persistence and consumers

Audited every reader of `finalScore`/`normalizedFinalScorePct`
(ledger writer, ranking service, shadow comparison, `EvaluationRunPage`,
`RankingsPage`, Pharmacist Intelligence view model). **Zero consumer
code changes required** — every consumer reads the field directly with
no parallel rounding logic to reconcile, so the fix lands transparently.
Full table in
[`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §6.

## Parity impact

100% of the pre-existing parity-relevant test suite passes unchanged,
except one literal source-text assertion in `salesRequiredFix.test.ts`
that named a local variable PR-1I renamed (`finalScore` → `rawFinalScore`
for the pre-rounding sum) — the formula it asserts
(`Σ basket.weightedScore`) is unchanged; only the assertion's expected
substring was updated to match. No numeric expectation in any
pre-existing test changed. Intended-vs-regression distinction documented
in [`PR1I_EVALUATION_COMPLIANCE.md`](PR1I_EVALUATION_COMPLIANCE.md) §7.

## Files changed

- `src/engine/evaluationShared/weightRedistribution.ts` (new)
- `src/engine/evaluationShared/scoreRounding.ts` (new)
- `src/engine/evaluationEngine/evaluationEngineTypes.ts` (extended:
  `ElementResult`, `BasketResult`, `CalculationTrace`)
- `src/engine/evaluationEngine/evaluationEngine.ts` (`scoreBasket`,
  `runEvaluation`)
- `src/engine/evaluationPipeline/types.ts` (extended: `ElementContext`,
  `BasketContext`, `EvaluationPipelineContext`)
- `src/engine/evaluationPipeline/processors.ts`
  (`WEIGHTED_AVERAGE_AGGREGATOR`, `WEIGHT_CONTRIBUTION_APPLIER`,
  `BASKET_SCORE_AGGREGATOR`)
- `src/engine/evaluationPipeline/pipelineAdapter.ts` (map new fields
  through to the V1-shaped `EvaluationResult`)
- `src/engine/evaluationEngine/salesRequiredFix.test.ts` (one
  source-text assertion updated — see "Parity impact" above)
- `src/engine/evaluationEngine/pr1iEvaluationCompliance.test.ts` (new,
  22 tests)
- `src/engine/evaluationPipeline/pr1iPipelineCompliance.test.ts` (new,
  9 tests)
- `docs/production/PR1I_BASELINE.md`,
  `PR1I_EVALUATION_COMPLIANCE.md`, `PR1I_TEST_EVIDENCE.md`,
  `PR1I_RELEASE_DECISION.md` (new), plus append-only updates to
  `PRODUCTION_READINESS_ARCHITECTURE.md` and `PR1H_DEFERRED_LIMITATIONS.md`.

No other file was touched. No route, permission, profile schema, KPI
definition, threshold, or UI wording change anywhere.

## Tests added

31 new tests total (22 V1 + 9 V2 pipeline), covering all 12
weight-redistribution cases and all 10 rounding cases enumerated in the
governing spec, plus 3 extra V2-pipeline-flow parity checks.

## Evaluation tests

50 files / 1,166 tests (engine, registry, pipeline, V2 promotion, shadow
log sanitizer, metadata fields, limited rollout, evaluation ledger) — all
passing.

## Full suite

354 files / 25,532 tests passing, 0 failed (up from PR-1H's 352 files /
25,501 tests — the delta is exactly the 2 new test files added this
phase).

## TypeScript

Zero errors (one pre-existing, unrelated TS5101 informational notice,
unchanged from every prior phase).

## Build

`npm run build` succeeded. Output unchanged in shape (13-entry PWA
precache manifest, 2977.48 KiB; same pre-existing
`INEFFECTIVE_DYNAMIC_IMPORT`/chunk-size warnings).

## Firestore/Auth changes

**None.** No Firestore document was read, written, or deleted. No Auth
user was created, modified, or deleted. No rules or index file was
touched or deployed.

## Production data changes

**None.** This phase only changed pure, in-memory scoring logic and its
type definitions/tests/docs. No historical evaluation result was
recomputed or rewritten; no backfill or migration was run.

## Deployment

**None.** No build artifact was deployed, no Netlify deploy was
triggered, no branch was pushed.

## Recommended tag

Not created — owner action required, and still **not yet recommended**
because PR-1H's own outstanding items (live Firestore backup unverified;
production reset not started; Login V3 cutover pending) remain open
regardless of this phase's closure. If/when the owner is ready to cut a
release including this fix, the commands are:

```
git add -A
git commit -m "PR-1I: evaluation compliance — weight redistribution + score rounding"
git tag -a pharmapulse-rc1 -m "Release Candidate 1 — includes PR-1H stabilization + PR-1I evaluation compliance"
# Push only when explicitly ready:
# git push origin feature/data-exchange-studio-v1
# git push origin pharmapulse-rc1
```

No `git add`, `git commit`, `git tag`, or `git push` was executed by
this phase.

## Final decision

**PR-1I CLOSED — RELEASE CANDIDATE READY**

Do not start Login redesign. Do not reset production data. Do not
deploy.
