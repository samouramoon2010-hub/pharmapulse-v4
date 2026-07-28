# RC1 Deployment Baseline — Pre-Deployment Verification

Captured immediately before any deployment action in this phase.

## Git state

- Local `pharmapulse-rc1` tag → commit `5f10971886e7b1aafa624282502f51370db79a4e`.
- Remote (`origin`) `pharmapulse-rc1` tag → tag object `d7003df864fb42a783668b89cc5a2f4e201b1a58`
  → same commit `5f10971886e7b1aafa624282502f51370db79a4e`. Local and remote match exactly.
- Current branch: `feature/data-exchange-studio-v1`. Local HEAD and `origin/feature/data-exchange-studio-v1`
  both at `98b8a4908dd0846c3569baac0d8884d36c264b74` (the RC1 docs-evidence commit), 0 ahead / 0 behind.
- Working tree: clean except four pre-existing, already-documented untracked scratch/reference
  directories (`.claude/`, `.render-tmp/`, `design-assets/`, `design-reference/`) — same as recorded
  in `RC1_PACKAGING_REPORT.md`. No unintended source changes.
- `.env`: confirmed not tracked (`git ls-files .env` empty).
- No scratch/render directory was staged or deployed.

## Deployment-source decision

The production deployment must use the exact RC1 code commit
`5f10971886e7b1aafa624282502f51370db79a4e`, not the later documentation-only commit
(`98b8a4908dd0846c3569baac0d8884d36c264b74`, which only adds two `docs/production/*.md` files —
no application source changed between the two commits).

**Path used:** an isolated `git worktree` was created at
`5f10971886e7b1aafa624282502f51370db79a4e` (detached HEAD), dependencies installed there with
`npm ci`, and the production build run from that exact worktree. The deploy artifact therefore
comes from the tagged commit's source tree, not the branch head. The worktree was removed after
the build was published.

This sidesteps a second, separable decision the deployment spec did not authorize: the Netlify
production site is Git-linked to `main` only (see `RC1_DEPLOYMENT_REPORT.md` — "Deployment
method"), and `main` does not contain the RC1 commit. Merging the feature branch into `main` would
change a branch this program has explicitly never touched and was not requested. Instead, the
build was produced locally from the exact RC1 commit and deployed directly to the existing
production site via the Netlify API/CLI, without altering any Git branch.

## Pre-deployment build

- `npm ci` in the RC1 worktree: succeeded, no errors (636 packages; 2 pre-existing dependency
  vulnerability advisories, unrelated to this phase and not remediated here).
- `npm run build` (via `netlify deploy`'s default build step): succeeded. Output: standard Vite/PWA
  bundle (`dist/`), 13-entry-class precache shape consistent with every prior phase's build result.
- TypeScript/test re-verification: not re-run in this phase. `npx tsc --noEmit` (zero errors) and the
  full 354-file / 25,532-test suite were already verified against this exact commit during RC1
  Packaging (see `RC1_PACKAGING_REPORT.md`) and the commit has not changed since. No code was
  modified in this deployment phase.

## Netlify environment variable names (values not read or printed)

Confirmed present on the linked production site (`pharmapluse`, site ID
`842fdc4a-ee93-44b7-9bc0-08d3804331fc`) via `netlify env:list` (table view, values withheld):

`NODE_VERSION`, `VITE_DEMO_MODE`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`.

All nine names match `.env.example` exactly. No variable required manual owner input — none were
missing.

## Observation (non-blocking)

Local Node.js is `v24.15.0`; the Netlify site's configured `NODE_VERSION` is `20.19.0`
(`netlify.toml`). The local build used for this deployment ran on the locally installed Node
version since the build was performed in a local CLI worktree rather than Netlify's own build
image. The build succeeded regardless; no Node-version-dependent failure was observed. Recorded
for awareness, not treated as a defect.
