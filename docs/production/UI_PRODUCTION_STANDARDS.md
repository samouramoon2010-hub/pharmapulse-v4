# UI Production Standards — PR-1D

Canonical reference for the visual/interaction rules established or
reaffirmed during PR-1D Core Application UI Cleanup. This documents what
was standardized; it does not introduce a new design system — every rule
below reuses existing UI3 tokens and components (`src/design/tokens.ts`,
`src/design/themeCssVars.ts`, `src/design/appearanceTokens.ts`).

## Global shell

- Exactly one connectivity/sync indicator (`SyncStatusIndicator`) in the
  top bar. The previous hardcoded "Live" pill duplicating it has been
  removed (`AppLayout.jsx`).
- The account control in the top bar is a real dropdown menu (`ProfileMenu`
  in `AppLayout.jsx`), not a bare button that navigates away on click. It
  shows the canonical role label (from
  [`roleScope.js`](../../src/constants/roleScope.js), not an invented or
  duplicated label map) alongside the user's name, and exposes
  Profile / Settings / Sign out. Theme switching stays in its existing
  header controls (`ThemeSwitcher`, `ThemeT1QuickToggle`) rather than being
  duplicated inside the menu.
- Icon-only header controls (`Menu`, `Bell`, `Palette`/theme, account menu)
  carry `aria-label`/`aria-haspopup`/`aria-expanded` as appropriate.

## KPI Entry

- KPI input fields are grouped by the KPI registry's own `category` field
  (`prescription`, `digital`, `wellness`, `commercial`, `operational`,
  `health_program`). A KPI with no category falls back to a single
  unlabeled group rather than inventing a category or being dropped. A
  category header is only rendered once there is more than one real
  group — a single fallback group never shows a no-op heading.
- Blank vs. zero is preserved end-to-end: a blank input is never written
  as a stored `0`. See [`KPI_REGISTRY_GOVERNANCE.md`](KPI_REGISTRY_GOVERNANCE.md)
  for the underlying bug and fix.
- The save action is a sticky bar with an explicit state label: unsaved
  changes / saving / saved / failed (with a retry-labeled button on
  failure) / idle. The write path and payload contract are unchanged —
  this is presentation only.

## Rankings

- Branch classification values (e.g. `hub`) are title-cased for display
  (`classificationLabel()` in `RankingsPage.tsx`) consistently with the
  cohort section headers — the same underlying value, never an invented
  label.
- Scope, rank order, and "Showing X of Y eligible" counts (already present
  from PR-1A) are unchanged.

## Accessibility

- `prefers-reduced-motion: reduce` is now respected globally
  (`src/index.css`) — all animations/transitions collapse to effectively
  instant for users who request it. This is the one new accessibility
  primitive added in PR-1D; see Known Limitations in the closure report
  for what was not attempted (no formal WCAG audit, no focus-trap library,
  no skip-links).

## What was not touched

- No new design tokens, color values, spacing scale, or component
  variants were introduced. No new button/badge/table/card components —
  every change above reuses `.btn`, `.card`, existing CSS variables, and
  existing components (`SyncStatusIndicator`, `DataTable`, `EmptyState`,
  `Toast`, `ConfirmModal`).
- Reports page text/labels were audited and found already correct from
  PR-1A (no raw IDs, no unclear titles found) — no changes were made
  there to avoid an unrelated diff on a page that was already compliant.
