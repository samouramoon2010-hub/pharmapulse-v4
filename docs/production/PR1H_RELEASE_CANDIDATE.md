# PR-1H — Final Product Stabilization & Launch Candidate

**Status: closed. Release Candidate ready, pending the explicit
deferred items listed below (most notably: backup still unverified,
production reset not started).**

## Baseline and final commit

- **Baseline commit:** `2d978fc56e522320a789cfee767424c52c71f1c8`
  (branch `feature/data-exchange-studio-v1`) — see
  [`PR1H_BASELINE.md`](PR1H_BASELINE.md).
- **Final commit:** same — **no commit was created during this phase**
  (per "do not automatically push/deploy/tag," and consistent with every
  prior phase in this program, all work remains in the uncommitted
  working tree pending the owner's own commit).
- **PR-1H's own footprint**, isolated from the much larger pre-existing
  uncommitted tree (109 paths already changed before this phase began):
  - `src/services/historyService.js` — removed 4 diagnostic
    `console.log` calls + the now-dead `batch1Success` variable.
  - `src/pages/pharmacist/KpiEntryPage.jsx` — added
    `role="img" aria-label={hint}` to the KPI hint icon.
  - `src/pages/auth/LoginPageV2.jsx` — replaced a real personal email
    used as placeholder text (`samir@alathirpharmacy.com`, in 2 fields)
    with a generic example (`name@yourpharmacy.com`).
  - `src/design/pr1hBugFixes.test.ts` — new file, 8 regression tests
    covering the three fixes above.
  - This document set (`docs/production/PR1H_*.md`, 5 files) plus an
    append-only `## PR-1H` section in
    [`PRODUCTION_READINESS_ARCHITECTURE.md`](PRODUCTION_READINESS_ARCHITECTURE.md).
  - **No other file was touched.** See [`PR1H_BUG_REGISTER.md`](PR1H_BUG_REGISTER.md)
    for the exact, verified diff of each.

## Test counts

- **Baseline (before PR-1H code changes):** 351 files / 25,493 tests passed.
- **Final (after PR-1H code changes):** **352 files / 25,501 tests
  passed.** (+1 file, +8 tests — the new regression file.)
- 0 failed in the final run.

## Build result

`npm run build` — **succeeded.** Output unchanged in shape from the
established baseline: 13-entry PWA precache manifest (~2977 KiB), same
pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` and chunk-size warnings
(unrelated to this phase, not regressions).

## TypeScript result

`npx tsc --noEmit` — **zero errors**, both before and after PR-1H. One
pre-existing, unrelated informational notice about `tsconfig.json`'s
deprecated `baseUrl` option (TS5101) — not a compile error, not touched
by this phase.

## Production routes (full inventory and classification)

| Route | Classification | Notes |
|---|---|---|
| `/login` | Production | Serves `LoginPageV2` — fixed in this phase (personal email removed). |
| `/login-v3` | Preview | PR-1F Gate 2 static shell; cutover not executed; not linked from any nav. |
| `/login-concept-a`, `-b`, `-c` | Preview | Design-exploration only; not linked from any nav. |
| `/login-network-preview` | Preview | Not linked from any nav. |
| `/login-vortex-preview` | Preview | Not linked from any nav. |
| `/unauthorized` | Production | Access-denied page. |
| `/about` | Production | Public info page. |
| `/` | Production | Redirects to `/dashboard` or `/login` based on auth state. |
| `/dashboard` | Production | All roles. |
| `/entry` | Production | KPI Entry, all roles. |
| `/performance` | Production | All roles. |
| `/notifications` | Production | All roles. |
| `/settings` | Production | All roles. |
| `/my-intelligence` | Production | Pharmacist only. |
| `/actions/my` | Production | All roles. |
| `/actions/tasks` | Production | Manager-and-up roles. |
| `/team` | Production | Manager-and-up roles. |
| `/branch/:branchId/intelligence` | Production | Manager-and-up roles. |
| `/pharmacist/:userId/intelligence` | Production | All roles; page-level ownership guard for pharmacists. |
| `/targets`, `/personal-targets`, `/reports` | Production | Manager-and-up roles. |
| `/executive` | Production | Executive-tier roles. |
| `/pharmacies`, `/import`, `/data-exchange`, `/export-studio`, `/audit`, `/admin/kpis`, `/admin/evaluation-registry`, `/admin/evaluation-run`, `/admin/regions`, `/admin/districts`, `/admin/classifications`, `/admin/rankings` | Admin-only | Role-guarded to `admin` only. |
| `/users` | Admin-only | Admin full access; district/regional/GM roles get read-only list access. |
| `/admin/demo-data` | Admin-only (operational tool) | Demo seeder/cleanup; admin-only; triple-confirmation gated for destructive actions; not part of ordinary business workflow. |
| `/admin/dynamic-kpi-shadow` | Internal diagnostic | `devOnly: true` in nav config — confirmed dead-code-eliminated from the production bundle's nav filter (verified directly in the minified `dist/` output this phase); route itself remains `admin`-role-guarded regardless of nav visibility. |
| `/profile-studio`, `/assistant` | Production | `PS_ROLES` (admin, general_manager, district_supervisor, manager). |
| `*` (catch-all) | Production | Redirects to `/`. |

**Deprecated:** none — nothing has been formally superseded-and-marked
for removal yet (Login V3 cutover is "not yet executed," not
"deprecated"). **Dead:** none — every route resolves to a real,
rendering component; no broken route was found.

## Deferred limitations

See [`PR1H_DEFERRED_LIMITATIONS.md`](PR1H_DEFERRED_LIMITATIONS.md) for
the full list (15 items spanning Login V3, Passkey, device certification,
backup, reset, staging, dead-code/preview cleanup, and the two evaluation
methodology findings raised but not fixed this phase).

## Known flakes

- `src/pages/profileStudio/phase4aCertification.test.ts` ("simulateProfile
  is deterministic") failed once during the PR-1G-B0 full-suite run
  (350/351) and passed cleanly in isolation (1131/1131) at that time. It
  was **not observed to fail again** during PR-1H's full-suite runs
  (351/351 baseline, then 352/352 final) — both fully green. Documented
  here as a known, previously-confirmed intermittent flake (a
  property-based determinism check, not a regression caused by any
  phase's code change) rather than claimed as fully eliminated.

## Data-reset status

**Not started.** No reset group from PR-1G-A's proposal was touched. No
Firestore document was created, modified, or deleted during PR-1H.

## Backup status

**Unchanged from PR-1G-B0: `BACKUP PROCEDURE READY — LIVE BACKUP NOT YET
VERIFIED`.** Blocked on Google Cloud billing being disabled on the
`pharmapulse-646de` project — outside this phase's scope to resolve
("do not enable billing" is explicit current policy).

## Rollback reference

Since no commit or tag was created, "rollback" for PR-1H specifically
means: discard the 4 file changes listed under "PR-1H's own footprint"
above (`git checkout -- src/services/historyService.js
src/pages/pharmacist/KpiEntryPage.jsx src/pages/auth/LoginPageV2.jsx` and
delete `src/design/pr1hBugFixes.test.ts`), which reverts purely to the
pre-PR-1H working tree with no effect on Firestore/Auth/rules/indexes,
since none were touched. If the owner proceeds to tag and later needs a
full rollback post-tag, standard `git revert`/`git reset` against the
tag applies once one exists (none does yet — see below).

## Recommended tag (not created — owner action required)

```
pharmapulse-rc1
```

Exact commands the owner may run **after** reviewing and committing the
working tree (not run by this audit):

```
git add -A
git commit -m "PR-1H: stabilization fixes — login placeholder, history logging, KPI hint a11y"
git tag -a pharmapulse-rc1 -m "Release Candidate 1 — PR-1H stabilization closed"
# Push only when explicitly ready:
# git push origin feature/data-exchange-studio-v1
# git push origin pharmapulse-rc1
```

No `git add`, `git commit`, `git tag`, or `git push` was executed by this
phase.

## No production mutation occurred

No Firestore write/delete, no Auth change, no rules/index deploy, no
Netlify deploy, no Firestore export/import, during PR-1H. The one live
browser session used was against the local Vite dev server, not a
deployed environment, and the one login attempt used a synthetic
`*.invalid` address against the real Firebase Auth backend (consistent
with the precedent set in PR-1F) — no real user data was created,
modified, or read.
