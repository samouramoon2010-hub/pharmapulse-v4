# PR-1I — Baseline

Scope: **Evaluation Compliance Fix.** Correct exactly two approved
business-rule compliance gaps in the Evaluation Engine (Rule A —
missing-data weight redistribution; Rule B — final score rounding to 2
decimals). No methodology redesign, no V3, no schema/UI/permission
changes beyond the smallest backward-compatible extension required for
these two fixes.

## Carried-forward program status (unchanged by this phase)

- PR-1A, PR-1B, PR-1C, PR-1D, PR-1E, PR-1G-A: **closed.**
- PR-1G-B0: security cleanup closed; **official live Firestore backup
  still unverified** (Google Cloud billing disabled on
  `pharmapulse-646de` — out of scope for this phase, not touched).
- PR-1H: **closed — Release Candidate ready** (no tag created). PR-1H's
  bug register deliberately deferred exactly the two findings this phase
  now fixes — see
  [`PR1H_DEFERRED_LIMITATIONS.md`](PR1H_DEFERRED_LIMITATIONS.md) item 13.

## Explicit constraints carried into this phase

Do not create a release tag. Do not deploy. Do not reset production
data. Do not redesign Login. Do not add features. Do not redesign
evaluation methodology. Do not introduce Evaluation Engine V3. Do not
change KPI definitions, caps, thresholds, profile structure, routing,
UI, permissions, or data schemas beyond what these two fixes strictly
require.

## Git baseline

- **Branch:** `feature/data-exchange-studio-v1`
- **Baseline commit (HEAD at start of this phase):**
  `2d978fc56e522320a789cfee767424c52c71f1c8` — unchanged from PR-1H's
  baseline/final commit (no commit has been created in this program since
  before PR-1G-A; all phases remain in the uncommitted working tree).
- The working tree already carried ~114 pre-existing uncommitted paths
  before PR-1I began (unrelated to this phase, accumulated across
  PR-1A through PR-1H).

## Pre-fix test baseline

- **Before PR-1I's new test files were added:** 352 files / 25,501 tests
  passed (PR-1H's final count, unchanged).
- **After adding the new RED compliance test files, before any
  implementation change:** 353 files, **11 of 22** new assertions in
  [`pr1iEvaluationCompliance.test.ts`](../../src/engine/evaluationEngine/pr1iEvaluationCompliance.test.ts)
  failed (25,512 passed / 25,523 total) — this is the required
  before-the-fix failure evidence. Full detail in
  [`PR1I_TEST_EVIDENCE.md`](PR1I_TEST_EVIDENCE.md).
- TypeScript: zero errors (one pre-existing informational TS5101 notice
  about `tsconfig.json`'s deprecated `baseUrl`, unrelated, unchanged).
- Build: succeeds, unchanged in shape (13-entry PWA precache manifest,
  same pre-existing `INEFFECTIVE_DYNAMIC_IMPORT`/chunk-size warnings).

## Two engines in scope

Both an architectural audit (this phase) and `evaluationPipeline/index.ts`
confirm there are **two independent production-connected scoring
implementations**, not one:

1. **V1 — `src/engine/evaluationEngine/evaluationEngine.ts`**
   (`runEvaluation`). Used as the official engine by default and as the
   automatic fallback when V2 fails or is not active for a scope.
2. **V2 — `src/engine/evaluationPipeline/processors.ts`** (the
   `WEIGHTED_AVERAGE_AGGREGATOR` legacy-flow and
   `WEIGHT_CONTRIBUTION_APPLIER` + `SUM_AGGREGATOR` SMARTS-flow
   processors, orchestrated by `pipelineExecutor.ts` /
   `pipelinePresets.ts`). Promoted to official per-scope via
   `evaluationOrchestrationService.ts` + `getActiveEngine()`
   (`'v1'` default, `'v2'` for limited-rollout scopes) — this is
   genuinely production-connected, not merely a parallel shadow
   experiment (the comment in `evaluationPipeline/types.ts` claiming
   "this pipeline module runs IN PARALLEL to the v1 engine... migration
   is a future phase" is stale; `index.ts`'s own header comment already
   corrects this).

Both implementations independently reimplement the identical
weighted-aggregation formula (`cappedAchievementPct × element.weight`,
summed, with no missing-data exclusion or weight redistribution) and
both leave `finalScore` / `normalizedFinalScorePct` unrounded. **Both
require the same two fixes** — fixing only V1 would leave any
limited-rollout pharmacy on V2 non-compliant.
