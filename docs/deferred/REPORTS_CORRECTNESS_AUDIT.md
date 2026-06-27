# Reports Page Correctness Audit (DEFERRED)

> **Status: DEFERRED — not part of the Organization Onboarding bundle.**
> This document preserves findings from an uncommitted, in-progress correctness
> pass on [src/pages/shared/ReportsPage.jsx](../../src/pages/shared/ReportsPage.jsx).
> That implementation has been reverted to its committed `HEAD` state so it does
> not block Organization Onboarding closure. The findings below remain valid and
> should be re-applied during the **Production Readiness & UI Cleanup** phase.
> Do not treat this document as scoped to, or required by, DX-1 / DX-2 / DX-3 /
> CLAIMED-record closure work.

## Confirmed findings

1. **All Branches Executive Summary fell back to the first active branch** instead of
   computing a true cross-branch portfolio summary.
2. **Branch Comparison mixed incompatible KPI units** in the Actual, Target, and Gap
   totals — summing values across KPIs with different units produced numbers with
   no real-world meaning.
3. **Top 5, Bottom 5, and Branch Comparison rank branches by weighted overall
   achievement**, which was not made explicit in the UI — the basis for ranking
   needs an explicit label so users don't mistake it for a single-KPI ranking.
4. **Specific branch selection could render unrelated branches with false zero
   values** — a selection edge case where the wrong branch's data (or no data)
   was displayed as a hard zero instead of an empty/unavailable state.
5. **MTD Trend mixed actual values from incompatible KPIs**, producing a trend line
   that combines unrelated units into one series.
6. **14-Day Entry Volume summed KPI values instead of counting records** — the
   metric's label implies a count of entries, but the implementation summed
   numeric KPI values.
7. **Export semantics and scopes were inconsistent** with what was shown on screen
   — exported report packs did not reliably match the currently selected scope
   and metric definitions visible in the UI.

## Future required fixes

- Build a true portfolio summary for "All Branches" (real aggregation, not a
  first-branch fallback).
- Add explicit weighted-achievement labels everywhere rankings are shown, so the
  ranking basis is unambiguous to the reader.
- Implement KPI-specific MTD trend with explicit unit labeling and equivalent
  (like-for-like) period comparisons.
- Replace the summed-KPI-value entry volume metric with a correct entry-count
  metric (count of records, not sum of values).
- Align UI scope and export scope so exported report packs always match what is
  currently displayed.
- Add explicit empty states for branch selections and scopes with no data,
  instead of rendering false zero values.
- Perform a mobile review of the Reports page once the above corrections land.

## Relationship to Organization Onboarding

None of the above findings originate from, or affect, the DX-1 / DX-2 / DX-3
onboarding engine, the CLAIMED-record visibility boundary, or any other
Organization Onboarding closure work. They were discovered as a side effect of
running the full test suite during Organization Onboarding closure validation,
where 6 pre-existing, unrelated test failures pointed at this in-progress,
uncommitted Reports work. This document exists solely to avoid losing those
findings while the Reports implementation itself is deferred.
