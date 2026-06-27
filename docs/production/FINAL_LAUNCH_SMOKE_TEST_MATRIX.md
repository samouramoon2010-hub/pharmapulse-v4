# PR-1G-A — Final Launch Smoke-Test Plan

This is a **plan** for manual/scripted smoke testing to run before public
launch — it has not been executed against a live environment as part of
this read-only audit (no browser/live-app session was driven here for
production data; UI was not exercised against real auth in this pass).
Each row should be checked off by a human (or a future scripted pass) with
real credentials before go-live.

## Authentication

| Test | Expected result | Status |
|---|---|---|
| Login at `/login` with a real admin account | Reaches `/dashboard`, role-correct nav renders | Not run (plan only) |
| Logout | Returns to `/login`, session cleared, protected routes redirect | Not run |
| Session persistence across reload | Stays logged in after a hard refresh | Not run |
| Password reset email flow | Reset email sends, link works, new password logs in | Not run |
| Admin access to `/users`, `/admin/*` | Full access granted | Not run |
| Pharmacist access to admin routes | `ProtectedRoute` redirects to `/unauthorized` | Not run |
| Branch manager access to `/team`, `/targets` | Granted per `MGR_UP` role list | Not run |
| Route guard on direct URL entry (no nav click) | Same enforcement as nav-driven access | Not run |

## Core workflows

| Test | Expected result | Status |
|---|---|---|
| KPI Entry — save a blank value vs. an explicit 0 | Distinguishable persisted states (per existing blank-vs-zero handling in `KpiEntryPage.jsx`) | Not run |
| Targets — create/edit a branch target | Saves, reflects in Reports | Not run |
| Personal Targets — manager sets own target | Saves, scoped to that manager only | Not run |
| Reports — load for a real branch/period | Renders without raw IDs or debug text | Not run |
| Rankings — real-data leaderboard loads | No demo-tagged rows visible | Not run |
| Dashboard — loads for each role | Role-appropriate widgets only | Not run |
| User creation/invitation flow | Auth + Firestore doc created together, temp password emailed (not displayed) | Not run |
| Data Exchange — import a real batch | Stages, admin reviews, commits with `importBatchRef` set | Not run |
| Export Studio — export a real report | File generated, no internal metadata leaked | Not run |
| Evaluation Engine V2 — run a real evaluation | Produces results tied to the active published profile | Not run |
| Profile publishing — publish a profile draft | Becomes the active version, registry reflects it | Not run |

## Security

| Test | Expected result | Status |
|---|---|---|
| CLAIMED placeholder users excluded from all user-list views | Confirmed by code audit (§6) — re-verify live before launch | Not run live |
| Role/scope isolation (district vs. region vs. branch) | Each role sees only its territory | Not run |
| No raw Firestore document IDs visible in any production-facing UI | Confirmed by code review pattern (no `doc.id` rendering found in audited pages); re-verify visually | Not run |
| No debug/test metadata visible (e.g. `isDemoData`, `demoBatchId`) | Should never render in any UI label | Not run |
| No test/preview route reachable from production nav | Confirmed — `/login-v3`, `/login-concept-*`, `/login-network-preview`, `/login-vortex-preview` are not linked from any nav component (code-reviewed) | Not run live |
| No hardcoded temp credentials reachable | Confirmed `dummyData.js` is unimported dead code (§4); recommend deleting before launch regardless | Not run live |

## Deployment

| Test | Expected result | Status |
|---|---|---|
| Production domain loads `/` and redirects per auth state | Works | Not run |
| SPA deep link (e.g. refresh on `/reports`) | Loads correctly, not a 404 | Not run |
| PWA installs/loads | Manifest valid, icons present | Not run |
| Offline behavior is honest (no silent stale data) | Service worker shows an offline indicator rather than stale-looking live data | Not run |
| No console-critical errors on first load | Clean console on `/login` and `/dashboard` | Not run |
| Asset loading — no 404s for JS/CSS chunks | Clean network tab | Not run |

## Data integrity

| Test | Expected result | Status |
|---|---|---|
| Retained config (kpi_registry, districts, regions) present after any approved reset | Counts match pre-reset minus only the approved groups | Not run (depends on PR-1G-B, not yet authorized) |
| No orphaned references introduced by reset | Re-run referential-integrity dry-run, zero new orphans | Not run |
| Official (published) evaluation profiles intact | Unaffected by any reset group | Not run |
| Admin account intact and able to log in post-reset | Confirmed manually by owner | Not run |

**Summary:** this matrix is a plan, not a result set. Every row reads
"Not run" because this audit was read-only and did not drive the live
application against production data or credentials. Recommend running
this matrix in full immediately before public launch, ideally right after
any approved PR-1G-B reset and its post-reset validation.
