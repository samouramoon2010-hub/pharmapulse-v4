# KPI Card Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the **one** official KPI card template. Every surface that renders a KPI card (Dashboard, Performance pages, Branch/Pharmacist Intelligence, Executive Dashboard's "Best KPI"/"Focus KPI" callouts) must use this same template — no per-page variants, no ad-hoc card shapes.

## Required fields, in order

1. **KPI name** — the human label (respecting the active KPI registry / i18n label).
2. **Status badge** — semantic tone (excellent / good / warning / critical), driven by existing status-token logic (`getStatusToken`, `--status-*` tokens). Never a hardcoded color.
3. **Large achievement %** — the dominant number on the card. Tabular numerals (`font-variant-numeric: tabular-nums`), large display size from the active font-scale tier (`--font-display` / `--font-title`, see Theme T2's `appearanceTokens.ts`).
4. **Actual** — the raw actual value, with unit.
5. **Target** — the raw target value, with unit.
6. **Remaining gap** — actual vs. target delta, signed and unit-labeled (e.g. "−12 to target").
7. **Required daily pace** — the pace needed for the remainder of the period to hit target, derived from existing pacing logic only (no new calculation introduced by this card; this field simply surfaces a value the engine already knows how to compute, or is omitted if that value isn't currently exposed).
8. **Trajectory / delta** — directional indicator (improving / stable / declining) plus the delta vs. the prior period.
9. **Mini trend / sparkline** — a small, theme-aware sparkline using the active chart palette (`chartThemes.ts`). Decorative-but-informative: it must reflect real historical data, never a placeholder shape.

## Sizing and density rules

* **No oversized empty cards.** Card height is driven by content, not padding inflation. If a field above has no value, the card collapses gracefully — it does not pad itself out to match a fixed height with empty space.
* **No text below 13px for insights.** Field labels (name, "Actual", "Target", etc.) may use the caption scale (11–12px, exempt as labels), but any number or insight conveying the actual KPI value must be ≥13px (`CRITICAL_INSIGHT_FLOOR_PX` in `appearanceTokens.ts`).
* **Tabular numbers everywhere.** All numeric fields (%, actual, target, gap, pace) use `.tabular-nums` / `font-variant-numeric: tabular-nums` so columns of cards align visually when scanned in a row.
* **Density-aware.** Card padding and internal spacing follow the active density mode (`--density-card-padding`, compact/comfortable/spacious) — the card template itself does not hardcode padding values.
* **Radius-aware.** Card corner radius follows the active radius mode (`--radius-card`) — sharp/soft/rounded per the user's Appearance setting, not hardcoded per-theme.

## Status badge tone mapping

| Achievement vs. target | Tone |
|---|---|
| ≥105% (ahead of schedule by ≥5%) | Excellent |
| Within ±5% of expected | Good |
| Behind by 5–15% | Warning |
| Behind by >15% | Critical |

This mapping is the existing traffic-light convention already in use across the app (see `--traffic-excellent/good/warning/critical` and the Settings Center's "Traffic Light Thresholds" reference) — this blueprint does not redefine it, only requires the KPI card to surface it consistently.

## What this card must never do

* Never invent a new metric not already computed by the engine.
* Never use a hardcoded color for the status badge — always resolve via theme/status tokens.
* Never omit the sparkline by replacing it with decorative filler.
* Never grow taller than its content requires to "look fuller."
