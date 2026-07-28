# RC1 Deployment Report — Controlled Production Deployment

## Netlify configuration audit

- Site: `pharmapluse` — site ID `842fdc4a-ee93-44b7-9bc0-08d3804331fc`, plan `nf_team_pro`.
- Production URL: `https://pharmapluse.netlify.app`. Admin URL:
  `https://app.netlify.com/projects/pharmapluse`.
- Git link: GitHub repo `samouramoon2010-hub/pharmapulse-v4`, **production branch `main`**,
  `allowed_branches: ["main"]`. The site is not linked to `feature/data-exchange-studio-v1` and
  has no automation watching that branch or the `pharmapulse-rc1` tag.
- Build command: `npm run build`. Publish directory: `dist`. (Matches `netlify.toml`.)
- Build environment: `NODE_VERSION=20.19.0` (per-context). Per-context env:
  `VITE_DEMO_MODE=false` (production), `true` (deploy-preview).
- SPA redirect: `/* → /index.html` (200) — confirmed live (deep links and unknown paths both
  resolve to the app shell rather than a Netlify 404).
- PWA/service-worker: `vite-plugin-pwa`-generated `sw.js`, `registerSW.js`, `manifest.webmanifest`,
  and a Workbox runtime chunk — all present in the build output and served with 200 status.
- No preview route appears in production navigation (`Sidebar.jsx`, `MobileNav.jsx`, `AppLayout.jsx`
  contain no links to `/login-v3`, `/login-concept-*`, `/login-network-preview`, or
  `/login-vortex-preview` — confirmed by source grep against the exact RC1 commit).
- No scratch/render files were present in the build output (`dist/` contained only `assets/`,
  `favicon.svg`, `icons.svg`, `index.html`, `login-network-preview/`, `login-vortex-preview/`,
  `manifest.webmanifest`, `registerSW.js`, `sw.js`, the Workbox runtime chunk — no `.render-tmp`,
  `design-assets`, or `design-reference` content).
- Secret scan: a per-deploy secret scan is run automatically by Netlify on every deploy
  (`deploy_validations_report.secret_scan_result`); the most recent prior production deploy shows
  `secretsScanMatches: []`. The Firebase Web API key present in the bundled JS
  (`VITE_FIREBASE_API_KEY`) is the standard, intentionally public Firebase client identifier — not
  a secret by Firebase's own design; it is protected by Firebase Console API-key restrictions and
  Firestore security rules, not by secrecy. It is unchanged from the previously live build.
- Rollback capability: confirmed available (Netlify retains prior deploys; any deploy can be
  re-published without a rebuild via the "Publish deploy" action or the `restoreSiteDeploy` API
  call — see `RC1_ROLLBACK_RUNBOOK.md`).

## Deployment method (controlled, not Git-triggered)

Because the production site's continuous-deployment trigger is wired to `main` only, and `main`
does not contain the RC1 commit (merging branches was outside this phase's authorization — see
`RC1_DEPLOYMENT_BASELINE.md`), the deployment was performed as a **manual, controlled CLI/API
deploy** directly from the exact RC1 source commit:

1. Created an isolated `git worktree` at commit `5f10971886e7b1aafa624282502f51370db79a4e`
   (detached HEAD) — no existing branch or working tree was touched.
2. `npm ci` in that worktree (succeeded).
3. `netlify deploy --site 842fdc4a-ee93-44b7-9bc0-08d3804331fc --context production` — built the
   app (`npm run build`, using the linked site's production-context environment variables pulled
   securely by the CLI; no value was printed to any log) and uploaded it as a **draft** deploy
   (deploy ID `6a3f69996cc10217f4d88321`, context `deploy-preview`) for verification before going
   live.
4. Verified the draft: build succeeded, no TypeScript/build errors, correct routes, no secret/PII
   leakage beyond the expected public Firebase key (see `RC1_DEPLOYMENT_SMOKE_TEST.md`).
5. Promoted the **already-built, already-verified** draft to production — byte-for-byte, with no
   rebuild — via `netlify api restoreSiteDeploy --data '{"site_id":"842fdc4a-ee93-44b7-9bc0-08d3804331fc","deploy_id":"6a3f69996cc10217f4d88321"}'`.
6. Removed the temporary worktree.

This means the artifact verified in step 4 is identical to the artifact published in step 5 — no
second build introduced any non-determinism between "what was checked" and "what went live."

## Deployment record

| Field | Value |
|---|---|
| Deployment method | Netlify CLI build (draft) → Netlify API `restoreSiteDeploy` (promote, no rebuild) |
| Source commit | `5f10971886e7b1aafa624282502f51370db79a4e` (tag `pharmapulse-rc1`) |
| Deploy ID | `6a3f69996cc10217f4d88321` |
| Production URL | `https://pharmapluse.netlify.app` |
| Timestamp (published) | 2026-06-27T06:13:17.601Z |
| Status | `ready` — confirmed live and serving traffic |
| Previous production deploy | `6a235b65ece4e800088186ac` — commit `981a6dd8a0d64cb537082b517c12c4b803b12864` ("Evaluation stabilization complete", `main`, 2026-06-05) |

No force operation, no rebuild-on-publish, no Firestore document/rule/index deployment, and no
Firebase Auth mutation occurred at any point in this deployment.

## Pre-deployment build checks (required list)

| Check | Result |
|---|---|
| Build succeeds | Pass |
| No new TypeScript errors | Pass (commit already verified zero-error in RC1 Packaging; unchanged) |
| No unresolved imports | Pass (build would have failed otherwise) |
| No missing assets | Pass, with one **pre-existing** exception — see `RC1_DEPLOYMENT_ISSUES.md` (PWA icon files referenced by the manifest are absent from `public/`; confirmed present in the *previous* live production deploy too, so this is not a regression introduced here) |
| No personal email address in output | Pass — `samouramoon2010@gmail.com` not found anywhere in `dist/` |
| No hardcoded non-Firebase credentials | Pass |
| No source-map secret leakage | Pass — no `.map` files exist in `dist/`; requesting one returns the SPA shell (200 HTML), not a real source map |
| `/login` serves Login V2 | Pass at the HTTP/routing level (200, correct `index.html` shell); component-level confirmation relies on the unchanged, already-certified PR-1H/PR-1I routing table, since no live authenticated browser session was available in this phase (see `RC1_DEPLOYMENT_SMOKE_TEST.md`) |
| Preview routes unlinked from nav | Pass (source-grep confirmed; see above) |
| Valid service-worker manifest | Pass — `manifest.webmanifest` is valid JSON, served with 200 |
| SPA deep links covered | Pass — confirmed live for `/dashboard`, `/reports`, `/rankings`, `/kpi-entry`, `/targets`, and an arbitrary unknown path, all 200 via the SPA redirect |

No harmless pre-existing warning was modified or silenced to pass this check.

## Production data / Firestore / Auth

**None.** No Firestore document was read, written, or deleted by this phase. No Firebase Auth
user was created, modified, or deleted. No `firestore.rules` or `firestore.indexes.json` content
was deployed — this phase deployed only the static frontend bundle.
