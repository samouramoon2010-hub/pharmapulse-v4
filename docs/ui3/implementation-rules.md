# Implementation Rules — UI 3.0 Blueprint Lock

Status: **LOCKED**. This is the binding rulebook for every future UI migration bundle (UI 3.1 and beyond). Every blueprint document in `docs/ui3/` is governed by these rules. A future Claude session implementing against these blueprints must treat this file as non-negotiable unless the user explicitly amends it.

## Hard rules

* **DO NOT invent layouts.** Every surface's structure is defined in its blueprint document ([dashboard-blueprint.md](./dashboard-blueprint.md), [executive-dashboard-blueprint.md](./executive-dashboard-blueprint.md), [header-blueprint.md](./header-blueprint.md), [sidebar-blueprint.md](./sidebar-blueprint.md)). Implementation must match the documented structure, not a freely redesigned alternative.
* **DO NOT add new dashboard widgets unless specified.** A widget not named in [dashboard-blueprint.md](./dashboard-blueprint.md)'s section list does not get added without a blueprint amendment first.
* **DO NOT change hierarchy.** Section order, sidebar group order, and header item order are fixed as documented.
* **DO NOT use hardcoded colors when theme tokens exist.** Every color must resolve through `ThemeProvider` / `useTheme()` / `themeCssVars.ts` / `--color-*` / `--status-*` / `--chart-*` tokens. A hardcoded hex value where a token already exists for that purpose is a blueprint violation.
* **DO NOT use giant cards with little content.** Card and panel height is driven by content (see [kpi-card-blueprint.md](./kpi-card-blueprint.md), [executive-dashboard-blueprint.md](./executive-dashboard-blueprint.md): "No giant empty panels").
* **DO NOT put insights below 13px.** The critical-insight floor (`CRITICAL_INSIGHT_FLOOR_PX = 13` in `src/design/appearanceTokens.ts`) applies to every KPI value, score, or numeric insight across every surface. Captions and field labels are exempt.
* **DO NOT replace tables with only narratives.** Tables remain tables (see [tables-blueprint.md](./tables-blueprint.md)); a narrative summary may accompany a table but never substitutes for the underlying row-level data.
* **DO NOT add canvas, particles, WebGL, or heavy animations.** Charts stay SVG-based (Recharts); transitions stay CSS-only and short (the existing 150ms theme-switch convention from Theme T3 is the reference ceiling for chrome-level transitions).

## Required token usage

Every future implementation bundle must consume, not bypass, the existing token systems:

| Concern | Source of truth |
|---|---|
| Active theme / color tokens | `ThemeProvider`, `useTheme()`, `src/design/themeRegistry.ts`, `src/design/themeCssVars.ts` |
| Density / corner radius / font scale | `src/design/appearanceTokens.ts` (`buildDensityCssVars`, `buildRadiusCssVars`, `buildFontScaleCssVars`) |
| Chart colors | `src/design/chartThemes.ts` (`getChartTheme`) |
| Premium surface shadows / glass / ambient background | `src/design/themeEffects.ts`, `src/design/glassTokens.ts`, `src/design/backgroundLayers.ts` |
| Theme-switch motion | `src/design/themeMotion.ts` |

A bundle that introduces a parallel color, spacing, or motion system instead of using the above is non-compliant with this lock.

## Scope boundary (unchanged by this bundle)

This blueprint-lock bundle is documentation only. It does not, and future bundles implementing against it must not silently assume it does, change:

* Business logic, scoring, or ranking
* The Evaluation Engine
* AI architecture / Assistant logic
* Profile Studio kernels
* Firestore schema or security rules
* Permissions / role configuration
* Routing (`App.jsx` route table)

Any future bundle that needs to touch one of the above must say so explicitly and get separate approval — blueprint-lock approval is not approval for those changes.

## Amendment process

These documents are locked, not immutable. If a future bundle's spec explicitly asks to change a blueprint (e.g. "redefine the KPI card template"), that bundle must update the relevant `docs/ui3/*.md` file as part of its own deliverables and call out the change explicitly in its summary — silent drift between the documented blueprint and the implemented UI is not acceptable.
