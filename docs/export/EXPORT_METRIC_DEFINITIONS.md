# Export Studio — Metric Definitions (DX-10)

Every exported workbook includes its own Definitions sheet with the metrics relevant to that workbook. This document is the human-readable consolidation across all 4 available templates — the workbook's own Definitions sheet is the canonical, generated version.

## Overall Achievement %
**Definition:** Weighted average of per-KPI achievement %, weighted by each KPI's registry weight.
**Formula:** `sum(achievementPct_k * weight_k)` for each KPI `k`.
**Unit:** %.
**Source:** `generateBranchSummary()` / `score.kpiBreakdown`.
**Missing-target behavior:** A KPI with no target contributes 0 to achievement for that KPI only — never a fabricated 100% or a crash.
**Cap behavior:** Not capped at 100% — a branch that exceeds target shows the true value.
**Period logic:** Current month-to-date, per the selected month.

## Per-KPI Actual / Target / Achievement %
**Definition:** A single KPI's actual value, target value, and resulting achievement % for one branch.
**Formula:** `achievementPct = (actual / target) * 100`, computed only when target > 0.
**Unit:** Whatever that KPI's own unit is (prescriptions, units, SAR, transactions, etc.) — **never** combined with another KPI's unit in the same total.
**Exclusions:** Archived/inactive KPIs are excluded upstream by the registry before this calculation runs.
**Missing-target behavior:** Gap is left blank (`null`), never a false zero-target gap.

## Portfolio KPI Analysis (Executive Performance Workbook only)
**Definition:** Total Actual and Total Target for one KPI, summed **only across branches**, never across different KPIs.
**Formula:** `sum(branch.actual)` for KPI `k`; `sum(branch.target)` for KPI `k` — only branches with a valid, positive target for that KPI contribute, to avoid numerator/denominator asymmetry.
**Unit:** That KPI's own unit.
**Ranking scope:** All branches the requester is authorized to see (`scopeResolver.filterAllowedPharmacies`) — never broadened.

## Risk Level
**Definition:** A branch's composite risk classification.
**Values:** ON_TRACK, LOW_RISK, MEDIUM_RISK, HIGH_RISK.
**Source:** `computeBranchRiskProfile()` (existing risk engine, unmodified by Export Studio).

## Import Job Status / Retry Eligible (Import Audit Workbook only)
**Definition:** The current state of an import job, and whether its remaining failed rows can be retried.
**Retry Eligible formula:** `domain in {BRANCH_ACTUALS, PHARMACIST_ACTUALS} AND status = PARTIALLY_COMPLETED` — matches `DATA_EXCHANGE_CLOSURE_MATRIX.md` exactly; never broadened to a domain that doesn't actually support retry.

## What Export Studio never does

- Never sums SAR with prescription counts, transaction counts, or any other incompatible unit.
- Never labels a single branch's data as "All Branches" — Executive Performance always reflects every branch in the requester's scope.
- Never converts a blank actual/target to a computed zero — blanks and zeros are tracked distinctly through every dataset builder.
- Never includes a CLAIMED pharmacist as an active roster member (inherited from the upstream engines' existing CLAIMED-exclusion boundary).
