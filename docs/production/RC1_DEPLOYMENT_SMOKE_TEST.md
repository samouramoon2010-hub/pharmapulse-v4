# RC1 Deployment Smoke Test

Production URL under test: `https://pharmapluse.netlify.app` (RC1 deploy `6a3f69996cc10217f4d88321`,
commit `5f10971886e7b1aafa624282502f51370db79a4e`).

No browser automation tool was connected in this session (Chrome extension MCP returned zero
connected browsers) and no test/owner account credentials were provided. Per the governing
instruction — **"Do not mark Pass based only on source-code inspection for post-deployment runtime
checks"** and **"Do not fabricate a Pass"** — every check below that genuinely requires an
authenticated, rendered browser session is marked **Blocked**, not Pass, regardless of how
confident prior source-level certification (PR-1H/PR-1I) makes me that it would in fact pass.

## Availability / Login V2 / Routing (HTTP-level, verified live)

| Check | Result | Evidence |
|---|---|---|
| Root `/` reachable | Pass | `curl` → 200 |
| `/login` reachable | Pass | `curl` → 200, `<title>PharmaPulse</title>` |
| `/dashboard`, `/reports`, `/rankings`, `/kpi-entry`, `/targets` reachable | Pass | `curl` → 200 for all five |
| Unknown path falls back to SPA shell (not a Netlify 404) | Pass | `curl /this-route-does-not-exist-xyz` → 200, served `index.html` |
| Preview routes (`/login-v3`, `/login-concept-a/b/c`, `/login-network-preview`, `/login-vortex-preview`, `/login-static-preview`) reachable directly but **not linked from production nav** | Pass | `curl` → 200 for each; `grep` of `Sidebar.jsx`/`MobileNav.jsx`/`AppLayout.jsx` at the RC1 commit found zero references to any of them |
| `/login` actually renders the Login V2 component (not V3) | **Blocked — not authenticated/rendered in a real browser this phase.** Routing-level evidence (correct shell, correct route table at this commit) is consistent with Login V2, but per policy that is not sufficient to mark Pass. | — |

## Authenticated smoke test (17 items)

All items below require a real login session. **No test/owner account credentials were supplied
in this conversation**, and per the write-action policy ("prefer read-only verification... mark
that row 'Blocked — write not authorized'... do not fabricate a Pass") none were guessed or
fabricated.

| # | Check | Result |
|---|---|---|
| 1 | Login with a valid pharmacist/manager/admin credential reaches `/dashboard` | Blocked — credentials not provided |
| 2 | Invalid credentials show an error and do not redirect | Blocked — credentials not provided |
| 3 | Logout clears the session and returns to `/login` | Blocked — credentials not provided |
| 4 | Dashboard renders KPI cards scoped to the logged-in user's role | Blocked — credentials not provided |
| 5 | KPI Entry page accepts and saves a value | Blocked — write action; no disposable test record authorized in this phase |
| 6 | Reports page renders with no raw document IDs or debug labels visible | Blocked — credentials not provided |
| 7 | Rankings page shows resolved branch names, not raw IDs | Blocked — credentials not provided |
| 8 | Personal Targets page loads for a manager role | Blocked — credentials not provided |
| 9 | Admin Users page loads with no plaintext password ever shown | Blocked — credentials not provided |
| 10 | Admin KPI Registry page loads | Blocked — credentials not provided |
| 11 | A non-admin role is blocked from an admin-only route (route guard) | Blocked — credentials not provided |
| 12 | Mobile nav renders correctly for an authenticated session | Blocked — credentials not provided |
| 13 | Session persists across a page reload | Blocked — credentials not provided |
| 14 | Browser network requests show no leaked Firestore service-account credential or admin SDK key | Pass (partial, static) — confirmed at the build-artifact level: no `.pem`/`.key`/`serviceAccount`/`credentials` filename exists in `dist/`; requesting `/serviceAccountKey.json`, `/firebase-adminsdk.json`, `/credentials.json`, `/.env`, `/.git/config` on the live production URL all return the SPA shell (HTML), not real file content. A live network-tab check during an authenticated session was not performed (no browser session available). |
| 15 | PWA manifest icons resolve to real image files | **Fail** — see `RC1_DEPLOYMENT_ISSUES.md` item 1: `manifest.webmanifest` references `pwa-192x192.png`/`pwa-512x512.png`, neither exists in the build output; requesting either on the live production URL returns the SPA HTML shell with `Content-Type: text/html`, not an image. Confirmed pre-existing (the previous production deploy, commit `981a6dd`, has the identical gap) — not a regression introduced by this deployment. |
| 16 | Offline fallback / service-worker registration functions | Blocked — requires a rendered browser session to observe `registerSW.js` runtime behavior; static check only confirms `sw.js`/`registerSW.js`/the Workbox runtime chunk are present and served with 200 |
| 17 | Evaluation Run page displays a real evaluation result without errors | Blocked — credentials not provided |

## Responsive checks (390 / 768 / 1024 / 1440px)

**Blocked — not performed.** No connected browser session was available in this environment to
load the live site at each breakpoint and visually inspect layout. HTTP-level availability of the
routes was already confirmed above, but that is not equivalent to a responsive-layout check and is
not reported as one.

## Security / privacy checks

| Check | Result |
|---|---|
| `.env` not published as a real file | Pass — returns SPA shell, not file content |
| No service-account/credentials file published | Pass — same evidence as item 14 above |
| No personal email in build output | Pass — `samouramoon2010@gmail.com` not found in `dist/` |
| No source-map secret leakage | Pass — no `.map` files in `dist/`; `/sw.js.map` returns the SPA shell |
| Preview routes unlinked from nav | Pass (see Routing section above) |
| No Firestore/Auth mutation performed by this phase | Pass — no write call of any kind was made against Firestore or Firebase Auth |
| Admin/role-protected routes still enforced | Blocked — enforcement is client-side route-guard logic that requires an authenticated session to exercise; not verified live this phase |
| Security response headers (CSP, X-Frame-Options, X-Content-Type-Options) | **Not applicable / pre-existing gap** — `netlify.toml` defines no `[[headers]]` block; only `Strict-Transport-Security` is present (Netlify default). Unchanged from the previous production deploy. Not in scope to add, since this phase does not modify application/config code. |

## PWA / asset checks

| Check | Result |
|---|---|
| `manifest.webmanifest` is valid, served with 200 | Pass |
| Service worker (`sw.js`) registered and served | Pass (static — file present, 200; runtime registration behavior not observed live) |
| App shell (`index.html`) loads | Pass |
| Manifest icons resolve | **Fail** — see item 15 / `RC1_DEPLOYMENT_ISSUES.md` |
| No preview-only asset precached as a production asset | Pass — `dist/login-network-preview/` and `dist/login-vortex-preview/` are static asset folders for the existing, already-accepted unlinked preview routes, not new precache entries |
| Update behavior / offline claims | Blocked — requires a live browser session |

## Summary

Deployment-level (HTTP/static/build-artifact) evidence: all Pass except one confirmed, pre-existing,
non-regression defect (manifest icon files). Authenticated/visual/responsive evidence: blocked for
lack of credentials and a connected browser session in this environment — not fabricated as Pass.
