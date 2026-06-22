# Header Blueprint — UI 3.0 Lock

Status: **LOCKED**. There is exactly **one** header in the application shell (`AppLayout.jsx`'s `<header>`). This document locks its required contents. No page may render a second, competing header.

## Required height

* **52px** fixed height (`--topbar-h: 52px`, already defined in `index.css`). Sticky to the top of the viewport.

## Required contents, left to right (RTL-aware — order mirrors for `dir="rtl"`)

1. **Logo / product identity** — the `Logo` component, always present, always links back to the dashboard/home.
2. **Live status** — a small, always-visible indicator of system/connection state (e.g. online/syncing), not a decorative dot with no meaning.
3. **Command search** — the command-bar trigger (`.cmd-trigger`) for quick navigation/search. This blueprint does not mandate a specific command-palette implementation beyond what already exists — see [implementation-rules.md](./implementation-rules.md) regarding "no real command palette yet" guardrails from prior bundles.
4. **Date / period** — the active reporting period/date context, when applicable to the current page.
5. **Notifications** — the existing notifications entry point.
6. **Theme toggle** — the existing Theme Engine quick toggle (`ThemeT1QuickToggle`, cycling through the 7 T1 themes) — this is the single source of truth for the active theme, shared with the Settings Center's Appearance section (Theme T2-I).
7. **User menu** — account/profile menu, sign-out, etc.

## Non-negotiables

* **No duplicate headers.** A page-level "page header" (`.page-header`, breadcrumb, page title) is a separate, secondary element that lives *below* this header inside the page body — it is not a second top-level header and must not duplicate items already in this header (logo, search, theme toggle, user menu).
* All chrome backgrounds (`--topbar-bg`) resolve through the active theme — including the Theme T3 glass treatment for Apple/Executive themes, which adjusts only the background opacity, never the structural layout of the header.
* Height never changes per page — 52px is constant across the entire authenticated app shell.
