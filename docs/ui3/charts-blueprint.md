# Charts Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the official visual rules for every chart in the application (`PerformanceChart.jsx` and any future chart component). It does not change chart logic or chart libraries — `PerformanceChart.jsx` keeps its existing behavior, per the Theme T3 guardrail that already established this boundary.

## Required rules

* **Minimal grid** — only horizontal gridlines where necessary for readability (`.recharts-cartesian-grid line`), never a dense grid in both axes.
* **Clear trend** — the primary series must be visually dominant (line weight/color saturation); secondary/comparison series are visually subordinate.
* **Muted axis** — axis labels and tick values use `--text-muted`, never full-contrast text, and respect the 13px critical-insight floor only when an axis label itself conveys a critical value (ordinary tick labels may use the caption scale).
* **Strong tooltip** — the hover/tooltip surface uses full-contrast text on a solid (non-glass) background, even on Apple/Executive themes, so the tooltip is always legible regardless of the page's ambient transparency.
* **Theme-aware palettes** — every chart consumes its color set from `chartThemes.ts` (`getChartTheme(activeThemeId)`), never a hardcoded color array. The 7 existing chart palettes (Corporate, Executive, Futuristic, Medical, AMOLED, Apple, Cyber) are already defined and must be reused, not redefined per chart.
* **No heavy visual clutter** — no 3D effects, no drop shadows on data series, no excessive legend entries (collapse/group when a series count would otherwise clutter the legend).

## Non-negotiables

* No chart introduces canvas-based or WebGL-based rendering — the existing SVG-based charting approach (Recharts) is retained.
* No chart palette is hardcoded per-component; all palette lookups go through `chartThemes.ts`.
* No new chart-logic changes are authorized by this document — palette/styling only, consistent with the Theme T3 boundary ("No chart logic changes. Only colors.").
