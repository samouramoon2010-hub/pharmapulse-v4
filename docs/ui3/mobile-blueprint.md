# Mobile Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the official rules for the mobile/narrow-viewport experience. It does not introduce a new mobile framework — it formalizes how the existing desktop-first surfaces degrade gracefully.

## Required rules

* **No shrinking tables** — a table is never rendered at a width that makes its columns illegible. Below the table's minimum readable width, it converts to a card-per-row layout instead of compressing further (see [tables-blueprint.md](./tables-blueprint.md)).
* **Tables → cards** — each table row becomes a compact card showing the same fields, reordered so the most important field (typically the primary identifier and the primary metric) leads.
* **Bottom navigation** — primary navigation on mobile moves to a bottom nav bar (the existing `.mobile-nav` / `.mobile-nav-item` pattern), not a hidden hamburger-only sidebar. The sidebar groups defined in [sidebar-blueprint.md](./sidebar-blueprint.md) inform which items are promoted to the bottom nav (the most frequently used 4–5 items across the four groups).
* **Compact KPI cards** — the KPI card template from [kpi-card-blueprint.md](./kpi-card-blueprint.md) is retained on mobile but in its compact density variant; no fields are dropped, they are reflowed (e.g. stacked instead of side-by-side).
* **Offline indicator placeholder** — a placeholder UI slot exists for an offline/connectivity indicator. This blueprint reserves the slot and its visual treatment (a small status pill in the header or bottom nav area); it does not implement offline-first data behavior, which remains explicitly out of scope per prior bundle guardrails ("NO Offline First").
* **Thumb-friendly layout** — interactive targets (buttons, nav items, row actions) maintain a minimum comfortable tap target size; dense desktop row heights are not carried over verbatim to mobile.

## Non-negotiables

* No table is ever rendered with horizontally scrolling, truncated columns as the primary mobile pattern — card conversion is the required fallback.
* No mobile-only feature is added that does not also exist in some form on desktop (mobile is a re-layout of the same surfaces, not a parallel feature set).
* All colors/spacing on mobile resolve through the same theme/density/radius/font tokens as desktop.
