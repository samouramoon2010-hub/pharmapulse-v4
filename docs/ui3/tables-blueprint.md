# Tables Blueprint — UI 3.0 Lock

Status: **LOCKED**. This document defines the official density and layout rules for every data table in the application (`DataTable.jsx` and any page-specific table markup using `.tbl`/`.tbl-wrap`). Style: **Bloomberg-style density** — dense, scannable, numerically precise.

## Required rules

* **Sticky header** — the table header row remains visible while the body scrolls.
* **Compact rows** — row height follows the active density mode (`--density-row-height`); the existing `.tbl.dense` / `.tbl.relaxed` modifiers remain the mechanism for density variants, layered on top of the density token rather than replacing it.
* **Right-aligned numbers** — every numeric column (counts, percentages, currency, scores) is right-aligned.
* **Left-aligned text** — every text column (names, labels, descriptions) is left-aligned (mirrored to right-aligned under `dir="rtl"`, consistent with the app's existing RTL handling).
* **Tabular numbers** — every numeric column uses `font-variant-numeric: tabular-nums` so digits align vertically across rows.
* **Subtle hover** — row hover uses the existing low-opacity `--bg-hover` tint (`.tbl tbody tr:hover`), never a heavy highlight or border change.
* **Minimal borders** — only a bottom border per row (`--border-subtle`), no vertical column borders, no double borders.

## Mobile exception

On mobile/narrow viewports, tables convert to a card-per-row layout rather than shrinking columns illegibly — see [mobile-blueprint.md](./mobile-blueprint.md). This is the **only** layout transformation tables are permitted; tables are never replaced with prose/narrative summaries in place of real row-level data (see [implementation-rules.md](./implementation-rules.md): "DO NOT replace tables with only narratives").

## Non-negotiables

* No table may omit the sticky header once a table exceeds one viewport's worth of rows.
* No table column order/alignment is "fixed" with hardcoded `text-align` overrides that bypass the text/number alignment rule above.
* Border and hover colors resolve through theme tokens (`--border-subtle`, `--bg-hover`) only.
