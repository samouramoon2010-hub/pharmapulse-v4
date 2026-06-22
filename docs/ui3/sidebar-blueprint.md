# Sidebar Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the required grouping and visual style for the persistent left sidebar (`Sidebar.jsx`). Group membership for individual nav items is governed by the existing role-based route configuration (`App.jsx`'s `ADMIN`/`EXEC_ROLES`/`MGR_UP`/`ALL`/`PS_ROLES` arrays) — this blueprint does not change which roles see which items, only how items are grouped and styled.

## Required groups, in order

1. **Intelligence Operations** — Dashboard, Executive Dashboard, Branch Intelligence, Pharmacist Intelligence, Team, Performance, Reports.
2. **Data Architecture** — Pharmacies, Users, Regions, Districts, Branch Classifications, Import Center, Evaluation Registry, Evaluation Run, Rankings, Demo Data.
3. **Actions / Work** — My Actions, Tasks, KPI Entry, Targets, Personal Targets.
4. **Platform** — Profile Studio, Assistant, Notifications, Settings, Audit Logs, About.

A nav item not explicitly listed above is placed in the group whose purpose it most closely matches; this blueprint does not require an exhaustive enumeration of every current and future route, only the grouping taxonomy.

## Visual style

* **Linear-like** — compact rows, minimal chrome, no heavy borders or card-style nav items.
* **Compact** — row height respects the active density mode (`--density-row-height`), never hardcoded.
* **Clear active state** — the existing `.nav-item.active` treatment (background tint + left accent + brand-colored text/icon) is the official active-state pattern; no alternative active-state styling is introduced.
* **No visual noise** — no decorative icons without semantic meaning, no badges/counters unless they convey real, actionable counts (e.g. unread notifications, pending actions).

## Collapse behavior

The sidebar supports a collapsed (icon-only) mode and an expanded mode, per the existing `sidebarMode` / `SIDEBAR_MODE` toggle already wired into the Settings Center's General section (Theme T2 bundle). This blueprint does not change that toggle's behavior, only requires that the four groups above remain intact and in order in both collapsed and expanded states (collapsed mode may hide group labels but must preserve grouping via spacing/dividers).

## Non-negotiables

* No group reordering once implemented under this blueprint, without a future blueprint-lock amendment.
* No new top-level groups beyond the four listed, without a future blueprint-lock amendment.
* Background, border, and text colors resolve through theme tokens only.
