# Mobile Certification Matrix — PR-1E6

This is the evidence matrix for PR-1E6 (Device & Visual Certification),
covering the original Gate 3 pass and the PR-1E6 Gate 3 Completion Pass.
It records exactly what was checked, at what viewport, with what
result — not a claim of exhaustive certification. See
[`PR1E6_DEVICE_VISUAL_CERTIFICATION.md`](PR1E6_DEVICE_VISUAL_CERTIFICATION.md)
for the narrative report and final decision.

Tooling: Claude Preview (Chrome DevTools Protocol against a real local
`npm run dev` server), authenticated as `admin@pharmapulse.com`. No
committed browser-automation devDependency exists in this repo. Pass/
fail per cell was `document.documentElement.scrollWidth ===
clientWidth` (no page-level horizontal overflow) **plus** a visual
screenshot review (column-starvation/text-clipping inside a
non-overflowing container does not show up in `scrollWidth` alone —
this is how the Profile Studio and Run Evaluation defects below were
actually found).

## Legend
✅ checked, clean · 🔧 defect found and fixed, reconfirmed clean · — not checked this round

## Critical pages (required: ≥1 phone, ≥1 tablet, ≥1 desktop)

| Page | 320px | 375px | 768px | 1280px |
|---|---|---|---|---|
| Dashboard (`/dashboard`) | ✅ | 🔧 (4 defects, original Gate 3) | ✅ | ✅ |
| KPI Entry (`/entry`) | ✅ | 🔧 (raw-ID fallback removed) | ✅ | — (no defect risk; unchanged grid) |
| Reports (`/reports`) | ✅ | ✅ | ✅ | — |
| Rankings (`/admin/rankings`) | ✅ | ✅ | ✅ | — |
| Users (`/users`) | ✅ | 🔧 (table→cards, was 1213px in a 342px wrapper) | ✅ | ✅ |
| Data Exchange Studio (`/data-exchange`) | ✅ | ✅ | ✅ | ✅ |
| Export Studio (`/export-studio`) | ✅ | ✅ | ✅ | ✅ |

## Other required pages

| Page | 320px | 375px | 768px | 1280px |
|---|---|---|---|---|
| KPI Registry (`/admin/kpis`) | — | ✅ (original Gate 3) | — | — |
| Profile Studio (`/profile-studio`) | ✅ | 🔧 (`1fr 320px` grid crushed the list to ~39px) | ✅ | ✅ |
| Evaluation Registry (`/admin/evaluation-registry`) | — | ✅ | — | — |
| Audit Logs (`/audit`) | — | ✅ | — | — |
| Run Evaluation — Single User (`/admin/evaluation-run`) | ✅ | 🔧 (4-col grid clipped select text) | — | ✅ |
| Run Evaluation — Bulk Branch | — | 🔧 (3-col grid, same fix) | — | ✅ |
| Targets (`/targets`) | — | ✅ | — | — |

## States and surfaces

| Item | Result |
|---|---|
| Loading state | ✅ captured organically (PharmaPulse splash, Profile Studio route transition) |
| Empty state | ✅ captured (Profile Studio "No profiles found") |
| Error/warning state | ✅ captured (KPI Entry "account not linked to a branch") |
| Profile menu | ✅ clean — Profile/Settings/Sign out, no clipping |
| More drawer (admin) | ✅ clean — full role-grouped nav, scrolls correctly |
| A representative modal | — not opened this round (e.g. Users "Add User") |
| Offline state | — not reproduced (requires network-condition emulation not exercised this round) |
| Bottom nav (5 items) | ✅ confirmed clean in the original Gate 3 pass |

## Role/navigation-visibility audit (source-level, not live-browser)

| Check | Method | Result |
|---|---|---|
| `branch_manager` Profile Studio/Assistant nav vs. route guard | Source: `App.jsx` `PS_ROLES` vs. `Sidebar.jsx` `NAV_CONFIG.branch_manager` | 🔧 defect found (nav showed it, route guard blocked it) and fixed |
| `regional_manager` Profile Studio/Assistant nav vs. route guard | Same | 🔧 defect found and fixed |
| `manager`/`district_supervisor` (already in `PS_ROLES`) | Same | ✅ confirmed still shown — fix did not remove valid access |
| `admin` Profile Studio/More-drawer access | Live browser | ✅ confirmed reachable, renders cleanly |
| Live browser test of `branch_manager`/`regional_manager`/`pharmacist` nav | Live browser | — not performed; no test credentials available for these roles this session |
| KPI Entry uid/pharmacyId/kpi-count debug line | Source: `process.env.NODE_ENV !== 'production'` gate | ✅ confirmed production-safe (visible only because the dev server itself runs in development mode) |
| Evaluation Registry debug panel | Same gate, same file pattern | ✅ confirmed production-safe |
| Audit Logs truncated `userId` | Pre-existing, explicit authorized-diagnostics exception (PR-1E4) | ✅ unchanged, not a leak |

## Raw-ID / debug-metadata sweep

| Location | Before | After |
|---|---|---|
| KPI Entry subtitle (`pharmacy?.name \|\| pharmacyId \|\| '—'`) | Fell back to the raw Firestore document ID if pharmacy lookup failed | 🔧 falls back to `'—'` only |
| Targets BulkModal row label (`rows[id]?.name \|\| id`, set at `ph?.name \|\| id`) | Same raw-ID fallback, two call sites | 🔧 falls back to `'Unnamed branch'` |
| Users table `employeeId` column | Demo seed data renders an odd-looking synthetic ID (`demo_user_DEMO_...`) as a real field value | Not a defect — this is real `employeeId` field content from demo seed data, not a debug artifact; no fabrication or masking applied |

## Known gaps not closed by the Gate 3 Completion Pass (resolved below unless noted)

- No physical device or native-PWA-shell review (still Chromium viewport emulation only). **Still open.**
- ~~Phone breakpoints 390px/430px, tablet 820px/1024px-landscape, and desktop 1440px/1920px were never explicitly tested at those exact pixel values~~ — **Resolved by the Final Evidence Completion Pass below.**
- No live-browser role-switch test for `branch_manager`, `regional_manager`, or `pharmacist` — the nav-visibility fix was verified by source/route-guard audit and a focused regression test, not by logging in as those roles. **Still open** (no test credentials available; proceeded admin-only per explicit instruction).
- ~~No modal opened at a mobile viewport this round~~ — **Resolved below.**
- ~~No offline/online transition reproduced~~ — **Resolved below.**
- Screenshots were reviewed inline during this session via the preview tool; no static image files were committed to `docs/production/evidence/pr1e6/` (no export mechanism from the preview tool to disk was available) — the directory exists but is empty. **Still open** (same tooling limitation in every pass).

## Final Evidence Completion Pass — exact-breakpoint matrix

All 7 explicitly-critical pages (Dashboard `/dashboard`, KPI Entry `/entry`, Reports `/reports`, Rankings `/admin/rankings`, Users `/users`, Data Exchange Studio `/data-exchange`, Export Studio `/export-studio`), checked for `document.documentElement.scrollWidth === clientWidth` (no horizontal overflow) and, at ≥1024px, `<aside>`/`<main>` boundary non-overlap via `getBoundingClientRect()`:

| Viewport | Class | Dashboard | KPI Entry | Reports | Rankings | Users | Data Exchange | Export Studio |
|---|---|---|---|---|---|---|---|---|
| 390×844 | phone | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 430×932 | phone | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 820×1180 | tablet portrait | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1024×768 | tablet landscape | 🔧→✅ | 🔧→✅ | 🔧→✅ | 🔧→✅ | 🔧→✅ | 🔧→✅ | 🔧→✅ |
| 1440×900 | desktop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1920×1080 | desktop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

🔧→✅ = all 7 pages shared one root cause (`AppLayout.jsx`'s `clamp()` padding-right ramp), fixed once, then all 7 re-verified clean. See [`PR1E6_DEVICE_VISUAL_CERTIFICATION.md`](PR1E6_DEVICE_VISUAL_CERTIFICATION.md) Defect 1 for full detail.

## Final Evidence Completion Pass — modal, offline, RTL/LTR

| Item | Result |
|---|---|
| KPI Entry Discard/date-change `ConfirmModal` at 390px | ✅ no overflow, correct RTL, both buttons visible — but 🔧 found and fixed: no `role="dialog"`, no focus management, no Escape handling (app-wide, shared component) |
| Offline state (real `online`/`offline` events) | ✅ single connectivity indicator, banner's "saved locally and will sync automatically" claim verified genuine (Firestore `persistentLocalCache`, not fabricated) |
| KPI Entry unsaved value during offline | ✅ remained visible/editable throughout |
| Save attempt while offline | ✅ honest — existing `pharmacyId` guard fired, no false "Saved" state |
| Reconnect (`online` event) | ✅ banner cleared, layout restored, unsaved value intact |
| RTL (Dashboard/KPI Entry/modal/Rankings) | ✅ reading order, icon placement, badge alignment all correct |
| LTR (`dir` attribute via Settings → English) | ✅ `dir`/`lang` flip correctly, 🔧 found, **not fixed**: Settings page visual layout (alignment, icon placement, punctuation) does not follow the `dir` flip — disclosed as a real, unresolved limitation, not fabricated evidence |

## Final Evidence Completion Pass — Rankings consistency (live, not deferred)

Read the already-rendered Rankings table directly (no button-click ambiguity this time): headers `Rank, Branch, Score, Achievement%, Pharmacists, Prev, Δ, Classification`; rows show Arabic branch names, numeric Score/Achievement%, textual `Δ` (`"NEW"`), humanized `Classification` (`"Hub"`). No internal ID as primary display, no color-only status.

## Final Evidence Completion Pass — debug/security recheck

Grepped `src/pages/**/*.{jsx,tsx}` for the raw-ID-fallback pattern (`|| pharmacyId`, `|| branchId`, etc.) fixed in the prior pass: **zero matches**, no regression. KPI Entry's `uid`/`pharmacyId`/`kpis` debug line reconfirmed correctly gated behind `process.env.NODE_ENV === 'development'`.
