# Executive Dashboard Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the official structure for the Executive Dashboard surface (`/executive`). It builds on the existing `ExecutiveSummaryPanel` wiring delivered in the UI 3.0 Product Surface Bundle — that wiring is the reference implementation for the "Executive Summary" section below; this blueprint formalizes it as the required structure for the rest of the page.

## Required sections, in order

1. **Executive Summary** — the top-of-page panel. Must surface, at minimum:
   * **Overall score** — `report.portfolioScore`, already computed by the engine.
   * **Rank** — the portfolio's relative standing (where available from existing report fields).
   * **Momentum** — improving / stable / declining, from existing trend fields.
   * **Primary risk** — `report.portfolioInsights.find(i => i.type === 'RISK')`.
   * **Top opportunity** — `report.portfolioInsights.find(i => i.type === 'OPPORTUNITY')`.
   * **Best KPI** — `report.allBranches[0].strongestKpi` (or equivalent existing field).
   * **Focus KPI** — `report.allBranches[0].weakestKpi` (or equivalent existing field).
   * **Narrative recommendation** — a template-string narrative composed purely from the fields above. No new scoring or NLP — pure display formatting over already-computed report fields, exactly as implemented in the UI 3.0 bundle.
2. **Portfolio trend** — a trend chart over time for the overall score (see [charts-blueprint.md](./charts-blueprint.md)).
3. **Branch ranking** — the existing `BranchLeaderboard`-style ranked list, Bloomberg-density table rules apply (see [tables-blueprint.md](./tables-blueprint.md)).
4. **Heatmap** — the existing `PortfolioKpiHeatmap` / branch×KPI grid, compact and information-dense, never a giant panel with sparse cells.

## Non-negotiables

* **No giant empty panels.** Every panel on this page must be sized to its content. A panel with one number and excessive whitespace around it is a violation of this blueprint.
* Every field listed under "Executive Summary" must come from data the engine has already computed — this page performs **no scoring, ranking, or aggregation** of its own. It is a presentation layer only.
* All visual styling (colors, density, radius, typography scale) must resolve through the active theme/appearance tokens — never hardcoded.
* The narrative recommendation is generated client-side from existing fields via simple template strings — it is not an AI-generated narrative, and this blueprint does not authorize adding one.

## Relationship to the Dashboard

The main Dashboard's "Heatmap + Executive Summary" row (see [dashboard-blueprint.md](./dashboard-blueprint.md)) shows a **condensed** version of section 1 above — not a duplicate of this full Executive Dashboard page. The two surfaces share data and tone but are not the same component re-rendered twice.
