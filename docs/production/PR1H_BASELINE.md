# PR-1H — Baseline Capture

Captured before any PR-1H code change was made.

## Repository state

- **Branch:** `feature/data-exchange-studio-v1`
- **Commit (HEAD):** `2d978fc56e522320a789cfee767424c52c71f1c8` — "test: normalize closure certification across line endings" (2026-06-23 01:45:02 +0300)
- **Git status at baseline:** 109 changed/untracked paths against HEAD. This is **pre-existing accumulated work from PR-1A through PR-1G-B0** that has never been committed — not something this phase introduced or should revert. It includes (non-exhaustive): modified core pages (`DashboardPage.jsx`, `KpiEntryPage.jsx`, `TargetsPage.jsx`, `ReportsPage.jsx`, `RankingsPage.tsx`, `UsersPage.jsx`, etc.), modified services (`userService.js`, `kpiService.js`, `historyService.js`, `firebase.js`, etc.), `firestore.rules`/`firestore.indexes.json`, and a large set of untracked new files (Data Exchange/Export Studio modules, Login V3/preview pages, `docs/production/`, test suites, `src/constants/roleScope.js`, etc.).
- **PR-1G-B0 additions already present at PR-1H start:** `.env` untracked (local file preserved), `.gitignore` hardened, `.env.example` complete, plus the PR-1G-A/B0 documentation set under `docs/production/`.

## Runtime/tooling versions

- **Node:** v24.15.0
- **npm:** 11.12.1
- **React:** ^19.2.6
- **react-router-dom:** ^7.15.1
- **firebase (client SDK):** ^12.13.0
- **vite:** ^8.0.12
- **vitest:** ^4.1.7
- **typescript:** ^6.0.3

## Firebase project

- **Project ID:** `pharmapulse-646de` (single production project; no staging project exists — confirmed in PR-1G-A).
- **Firestore database:** `FIRESTORE_NATIVE`, region `africa-south1` (confirmed live in PR-1G-B0's backup attempt).
- **Billing:** disabled on this GCP project (confirmed live in PR-1G-B0) — unrelated to app function, but blocks Firestore export/backup.

## Netlify configuration

- Build command: `npm run build`; publish directory: `dist`; SPA fallback `/* → /index.html` (200); Node `20.19.0` pinned in `[build.environment]`.
- Per-context env: `VITE_DEMO_MODE="false"` (production), `VITE_DEMO_MODE="true"` (deploy-preview) — confirmed in PR-1G-A to be read nowhere in `src/` (still true, unresolved no-op; tracked as a deferred item, not a PR-1H blocker).

## Test baseline (before any PR-1H code change)

- **Full suite:** 351 test files passed, 25,493 tests passed, 0 failed.
- Ran via `npm run test -- --run`. Duration ~48s.

## TypeScript baseline

- `npx tsc --noEmit`: **zero type errors.** One pre-existing, unrelated notice: `tsconfig.json(14,5): error TS5101` (deprecated `baseUrl` option, informational about a future TypeScript 7.0 change — not a compile error, not introduced by any phase, not changed by PR-1H).

## Build baseline

- `npm run build`: succeeded. Output: 13-entry PWA precache manifest (2977 KiB), largest chunk `index-*.js` ~2.5MB (a pre-existing bundle-size warning, not a PR-1H regression — `INEFFECTIVE_DYNAMIC_IMPORT` warnings for `evaluationRegistryService.ts`/`evaluationPipeline/index.ts`/`evaluationLedgerService.ts` are pre-existing Rollup chunking notices, not errors).

## Scope boundary for this phase

PR-1H changes are exactly the edits listed in
[`PR1H_BUG_REGISTER.md`](PR1H_BUG_REGISTER.md) — three source files
(`historyService.js`, `KpiEntryPage.jsx`, `LoginPageV2.jsx`) plus one new
test file (`src/design/pr1hBugFixes.test.ts`). **No other file in the
109-path pre-existing working tree was modified, reverted, or overwritten
by this phase.** `git diff --stat` against HEAD is not used to describe
PR-1H's footprint in this document set, because it would conflate these
three small edits with the much larger pre-existing uncommitted history;
the bug register states each PR-1H edit explicitly instead.
