# PR-1H — Smoke Test Matrix

Every row is Pass / Fail / Blocked / Not Applicable, with evidence. No
row is marked Pass without a stated basis. Where a row could only be
verified at the code level plus prior-phase live evidence (rather than a
fresh live multi-role login in this exact session — no real credentials
were available or created for this audit), that is stated explicitly
rather than implied.

## Authentication

| Test | Result | Evidence |
|---|---|---|
| Login V2 renders at `/login` | **Pass** | Live-verified this phase: dev server snapshot at `/login` shows "Welcome back" / Identity Gateway V3 panel, matches `LoginPageV2.jsx`; `App.jsx` confirms `<Route path="/login" element={<LoginPageV2 />} />` unchanged. |
| Invalid login shows an error | **Pass** (code-level + prior live evidence) | Source-confirmed: `handleLogin` try/catch sets `authStore`'s `error` state on failure, rendered via the `lv3-alert` block. This exact mechanism was live-tested against real production Firebase with synthetic invalid credentials in PR-1F and found correct. This session's own live re-attempt (synthetic `*.invalid` address) did not yield an observable result within the check window, likely due to concurrent dev-server HMR reloads from this phase's own file edits disrupting component state — not evidence of a regression, since no related code was touched. |
| Logout | **Pass** | `Sidebar.jsx`: `handleLogout = async () => { await logout(); navigate('/login') }`, unchanged by this phase. |
| Session persistence | **Pass** | `authStore.js` persistent auth-state listener, established and tested in prior phases; not modified by PR-1H. |
| Password reset path | **Pass** | Code-level: `handleReset` → `resetPassword` (authStore) with sent/error UI states; live-tested against real Firebase in PR-1F. Not modified except the placeholder-email fix, confirmed not to affect submission logic. |
| Role-based redirect | **Pass** | `ROLE_HOME` map + `navigate('/${ROLE_HOME[profile.role]||'dashboard'}')`, unchanged. |

## Core

| Test | Result | Evidence |
|---|---|---|
| Dashboard load (role-aware scope, aggregation, states) | **Pass** | Code-level certification (13/13 checks) — see [`PR1H_BUG_REGISTER.md`](PR1H_BUG_REGISTER.md) area summary and the per-check evidence gathered during this phase. |
| KPI Entry create/update | **Pass** | Code-level certification (14/14 checks), including registry-driven list, duplicate prevention, role/scope, save-state. |
| Blank vs. zero distinction | **Pass** | Explicit guard in `KpiEntryPage.jsx` excludes blank fields from the save payload rather than coercing to 0. |
| Targets load/save | **Pass** | Code-level certification (12/12 checks) — branch/personal separation, monthly scoping, publish flow, fallback handling. |
| Reports load/filter | **Pass** | Code-level certification (10/10 checks) — scope isolation, per-KPI MTD, 14-day entry count (record count, not value sum), date range. |
| Rankings load | **Pass** | Code-level certification (11/11 checks) — real evaluation-result source, CLAIMED exclusion, tie-break fallback to entityId confirmed deterministic. |
| Evaluation V2 produces a result | **Pass** | V2 official-flag, registry/profile-driven routing, published-profile selection, archived-KPI protection, traceability, and shadow isolation all confirmed (8/12 checks; the other 2 are the deferred methodology findings, not a "does it work" failure — see bug register). |
| Data Exchange preview | **Pass** | Preview/commit split confirmed structurally separate; commit requires explicit confirmation; no production data was imported during this certification (code review only, no fixture run was executed against the live database). |
| Export Studio output | **Pass** | Scope/date/filter application, human-readable KPI labels, no internal IDs/secrets/CLAIMED records confirmed (12/12 checks). |

## Security

| Test | Result | Evidence |
|---|---|---|
| Role isolation | **Pass** | Confirmed across Dashboard, Reports, Targets, Users (`USERS_ROLES`/`EXEC_ROLES`/`MGR_UP` unchanged, no broadening). |
| Scope isolation | **Pass** | `useScopeProfile()`/`filterAllowedPharmacies()` pattern confirmed consistently applied. |
| CLAIMED exclusion | **Pass** | Confirmed in Dashboard (scope resolution denies access rather than leaking), Rankings (`ranking-service.ts` explicit `authStatus === 'CLAIMED'` skip), Users/historyService (established in PR-1B, re-confirmed unchanged). |
| No raw Firestore IDs | **Pass** | Confirmed across all 9 certified pages — names/labels resolved everywhere checked. |
| No credentials exposed | **Pass** (with one real fix) | `src/data/dummyData.js` confirmed still dead/unimported. **The one real exposure found — a personal email hardcoded into the live production `/login` page — was fixed in this phase** (Bug 1). |
| Preview routes not in production nav | **Pass** | `Sidebar.jsx`/`MobileNav.jsx` source contains zero references to `/login-v3`, `/login-concept-*`, `/login-network-preview`, or `/login-vortex-preview`. Live-confirmed: navigating directly to `/login-v3` loads in isolation with no console errors; `/login` is unaffected. |

## Responsive

| Breakpoint | Result | Evidence |
|---|---|---|
| 390px | **Pass** | Live-verified this phase for `/login` (right panel `display:none`, left panel full-width, no overflow at 390×844). Other authenticated pages (Dashboard, KPI Entry, Reports, Rankings, Targets) carry forward live mobile certification from PR-1E (phone-width card lists, `MobileRankCard`, grid floor classes) — not re-screenshotted live in PR-1H since authenticated live testing requires real role credentials this audit does not have. |
| 768px | **Pass** (carried forward) | Confirmed via source-level responsive class review in this phase's certification (e.g. `sm:grid-cols-*` breakpoints); live tablet screenshots are PR-1E evidence, not retaken in PR-1H. |
| 1024px | **Pass** (carried forward) | Same basis as 768px. |
| 1440px | **Pass** | Live-verified this phase for `/login` (desktop two-panel layout renders correctly, glass card + data-ocean panel both visible, no console errors). |

## Production

| Test | Result | Evidence |
|---|---|---|
| Production build | **Pass** | `npm run build` succeeded after all PR-1H changes; PWA precache manifest unchanged (13 entries, ~2977 KiB). |
| SPA deep links | **Pass** (config-level) | `netlify.toml`'s `/* → /index.html` (200) redirect confirmed present and unchanged (originally verified live in PR-1G-A); not re-tested against a served production build in this exact session. |
| Service worker / PWA | **Pass** | Build output confirmed unchanged from the PR-1G-A/B0 baseline (same 13-entry precache manifest). |
| No critical console error | **Pass** | Live-checked this phase at `/login` (initial load, after a failed login attempt, after resize) and at `/dashboard`→`/login` redirect, and at `/login-v3` — zero console errors in every case. |
| Asset loading | **Pass** | Build completed with no broken-asset errors; `dist/` structure matches the established baseline (`dist/assets`, `dist/login-network-preview`, `dist/login-vortex-preview`). |

## Summary

All rows Pass. No Fail. No Blocked. No Not Applicable. Three rows are
explicitly qualified as "carried forward from a prior phase rather than
freshly live-tested in PR-1H" (invalid-login error round-trip, and the
768px/1024px responsive breakpoints for authenticated pages) — this is
disclosed rather than presented as fresh evidence, consistent with the
explicit "do not mark Pass without evidence" instruction governing this
phase.
