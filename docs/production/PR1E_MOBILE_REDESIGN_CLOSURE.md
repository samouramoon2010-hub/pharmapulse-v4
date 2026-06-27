# PR-1E — Mobile Production Redesign — In-Progress Tracker

**This document is not a closure report.** PR-1E is not formally closed.
It tracks sub-stage progress across PR-1E0–E6 so each closed sub-stage
has one place pointing to its own evidence, without re-litigating
already-closed work.

## Sub-stage status

| Stage | Scope | Status | Evidence |
|---|---|---|---|
| PR-1E0 | Mobile audit & responsive architecture map (read-only) | **Closed** | [`PR1E0_MOBILE_AUDIT.md`](PR1E0_MOBILE_AUDIT.md) |
| PR-1E1 | Mobile application shell & role-aware navigation | **Closed** | [`PR1E1_MOBILE_SHELL_CLOSURE.md`](PR1E1_MOBILE_SHELL_CLOSURE.md), [`MOBILE_NAVIGATION_MATRIX.md`](MOBILE_NAVIGATION_MATRIX.md) |
| PR-1E2 | KPI Entry mobile workflow | **Closed** (+ Visual Refinement Addendum) | [`PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md`](PR1E2_KPI_ENTRY_MOBILE_CLOSURE.md), [`PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md`](PR1E2_KPI_ENTRY_VISUAL_REFINEMENT_CLOSURE.md), [`MOBILE_PAGE_BEHAVIOR.md`](MOBILE_PAGE_BEHAVIOR.md) |
| PR-1E3 | Dashboard / Reports / Rankings mobile layouts | **Closed** | [`PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md`](PR1E3_DASHBOARD_REPORTS_RANKINGS_MOBILE_CLOSURE.md), [`MOBILE_PAGE_BEHAVIOR.md`](MOBILE_PAGE_BEHAVIOR.md) |
| PR-1E4 | Admin / Data Exchange / Export mobile behavior | **Closed** | [`PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md`](PR1E4_ADMIN_OPERATIONAL_MOBILE_CLOSURE.md) |
| PR-1E5 | PWA, safe-area, accessibility, performance certification | **Closed** | [`PR1E5_PWA_ACCESSIBILITY_PERFORMANCE_CLOSURE.md`](PR1E5_PWA_ACCESSIBILITY_PERFORMANCE_CLOSURE.md) |
| PR-1E6 | Device certification and closure | **Not closed** (3 passes landed — critical-page phone+tablet+desktop coverage at every breakpoint, modal/offline/RTL evidence, 9 real defects + 1 nav/permission defect found and fixed; physical-device review, non-admin live role testing, and a disclosed RTL/LTR visual-mirroring gap remain the open items) | [`PR1E6_DEVICE_VISUAL_CERTIFICATION.md`](PR1E6_DEVICE_VISUAL_CERTIFICATION.md), [`MOBILE_CERTIFICATION_MATRIX.md`](MOBILE_CERTIFICATION_MATRIX.md) |

## Carried-forward, not-yet-resolved items

- PR-1E6's certification matrix is now complete for viewport coverage
  after three Gate 3 passes (see
  [`MOBILE_CERTIFICATION_MATRIX.md`](MOBILE_CERTIFICATION_MATRIX.md)):
  all 7 explicitly-critical pages (Dashboard, KPI Entry, Reports,
  Rankings, Users, Data Exchange Studio, Export Studio) now have
  coverage at every required breakpoint, including the exact extra
  pixel values (390/430/820/1024-landscape/1440/1920) the original
  spec called for; Profile Studio, Evaluation Registry, Audit Logs,
  Run Evaluation, and Targets were also certified; genuine modal,
  offline-state, and RTL evidence were captured live; Rankings'
  Rank/Score/Achievement/Δ/Classification consistency was verified
  from the live-rendered table. 12 real defects total have been found
  and fixed across all three Gate 3 passes (4 overflow defects, Users'
  clipped table, Profile Studio's and Run Evaluation's crushed-column
  grids, 2 raw-ID fallbacks, 1 nav/permission-guard mismatch for
  branch_manager/regional_manager, the AppLayout sidebar-overlap
  clamp() ramp, the `.cmd-trigger` display-vs-Tailwind conflict, and
  the app-wide `ConfirmModal` accessibility gap). Remaining gaps: no
  physical-device review; no live-browser role-switch test for
  non-admin roles (verified via source/route-guard audit instead, due
  to no available test credentials — an explicit, accepted decision);
  a newly-found, disclosed-but-unfixed RTL/LTR visual-mirroring gap on
  the Settings page; Import Center and Personal Targets remain
  uncertified. No browser-automation tooling is committed to this repo
  (confirmed via package.json) — all evidence gathered used an
  interactive session tool, not a repeatable test suite, and no
  screenshot files were committed (no export-to-disk mechanism was
  available).
- Route-level code-splitting was flagged but deliberately not built in
  PR-1E5 (out of scope for a safe-area/accessibility pass; the build's
  large single-chunk warning predates PR-1E entirely) — not assigned to
  any further PR-1E sub-stage; would need its own scoped initiative.
- The large raw-`<table>` → card-conversion work flagged in PR-1E0 is
  now resolved for Reports (Branch Comparison) and Rankings (both
  cohort tables) per PR-1E3, and for KPI Registry, Export Studio,
  Evaluation Run (basket + bulk), Audit Logs, and Data Exchange Studio
  per PR-1E4. Targets/PersonalTargets/ImportCenter's editable or
  arbitrary-schema grids were deliberately classified
  Desktop-preferred-with-safe-fallback (kept as horizontal-scroll
  tables with an advisory notice) rather than converted, per PR-1E4.
- No global unsaved-changes/navigation-blocking subsystem exists —
  PR-1E2 deliberately did not build one (out of scope per its own
  spec); only page-controlled flows (KPI Entry's date change) are
  guarded today via the existing `ConfirmModal.jsx`.

## Do not close PR-1E from this document

PR-1E's overall final closure report (covering every sub-stage through
PR-1E6) has not been written and must not be inferred from this tracker
or from any individual sub-stage's "FORMALLY CLOSED" decision string.
