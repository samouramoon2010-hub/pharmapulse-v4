# Dashboard Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the official structure for the main Dashboard surface. Future implementation bundles (UI 3.1+) must follow this layout exactly — no invented sections, no reordering, no extra widgets.

Design direction: **Linear + Bloomberg + Palantir + Apple + Microsoft Fabric** — dense but readable, action-driven, premium enterprise. No oversized sparse cards, no tiny insights, no passive dashboards, no decorative widgets without value, no random layouts.

## Top-to-bottom structure

1. **52px Command Header** — see [header-blueprint.md](./header-blueprint.md). Fixed height, sticky, never duplicated on the page below it.
2. **Linear-style Sidebar** — see [sidebar-blueprint.md](./sidebar-blueprint.md). Persistent left rail, collapsible.
3. **Daily Mission Hero** — a single, compact banner-style section (not a giant empty panel) that frames "today's mission": the single most important thing to act on, derived from already-computed report data only. No new scoring logic — this is a display/formatting layer over existing fields.
4. **KPI Cards Row** — see [kpi-card-blueprint.md](./kpi-card-blueprint.md). One row, horizontally scannable, using the one official KPI card template. No mixed card sizes in this row.
5. **Trend Chart + KPI Distribution** — two-up layout: a primary trend chart (see [charts-blueprint.md](./charts-blueprint.md)) paired with a distribution view (e.g. achievement spread across KPIs). Side-by-side on desktop, stacked on mobile.
6. **Heatmap + Executive Summary** — a compact heatmap (branch/KPI grid, see [tables-blueprint.md](./tables-blueprint.md) density rules) paired with a condensed executive summary callout (not the full Executive Dashboard — see [executive-dashboard-blueprint.md](./executive-dashboard-blueprint.md) for that surface).
7. **Smart Alerts / Activities** — a single feed of action-relevant alerts and recent activity. Each entry must be actionable or informative; no filler entries.

## The dashboard must always answer

* What needs attention today?
* What is behind?
* What is on track?
* What action is required?
* What is projected finish?

Every section above exists in service of one or more of these five questions. A section that cannot be tied to at least one of these questions does not belong on this dashboard.

## Non-negotiables

* No section may be a large card with little or no content ("oversized sparse card").
* No section is purely decorative — every widget must carry a value, trend, or action.
* No insight text below 13px (see [implementation-rules.md](./implementation-rules.md)).
* All color usage must come from theme tokens (`ThemeProvider`, `useTheme()`, `themeCssVars.ts`), never hardcoded hex values, so the dashboard automatically supports every theme (Corporate/Executive/Futuristic/Medical/AMOLED/Apple/Cyber) and every density/radius/font-scale mode already shipped in Theme T1/T2/T3.

## Out of scope for this document

This blueprint defines layout and content only. It does not change:
* scoring, ranking, or evaluation logic
* Firestore schema or queries
* routing or permissions

Those remain governed by the existing engine and route configuration, untouched by this bundle.
