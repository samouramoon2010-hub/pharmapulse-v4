# Maintenance Quick Wins — Security & Preview Cleanup

Part 2 of the Maintenance Quick Wins phase.

## A. Dead credentials fixture — `src/data/dummyData.js`

**Finding: already resolved, prior to this phase.**

`src/data/dummyData.js` does not exist on disk — `src/data/` is an
empty directory. Git history confirms it was deleted in commit
`477121e` ("chore: remove dead code and unlinked login preview routes"),
which is already on this branch, 3 commits behind current `HEAD`
(`c5b5d59`). Its commit message states the same verification this
phase would have performed: "confirmed unimported dead code with test
credentials."

- **Verified not imported anywhere:** `grep -rln "dummyData" .` across
  the whole repo (excluding `node_modules`) returns only comments/docs
  that mention the string historically (see below) — zero `import`/
  `require` statements.
- **No runtime or test depends on it:** the only remaining references
  are negative assertions in existing certification tests (e.g.
  `ui3CleanupBundleC1.test.ts`, `ui3CleanupMegaBundleC2/C3/C4.test.ts`,
  `actionsDesignerModePass1.test.ts`, `alertsCenterDesignerModePass1.test.ts`,
  `loginV3IdentityGateway.test.ts`) — each checks `expect(src).not.toContain('dummyData')`,
  i.e. they assert the fixture stays *out* of specific live pages. These
  assertions do not require the file to exist and continue to pass.
  Documentation files (`docs/production/*.md`) mention it only in
  historical audit/register entries — informational, not executable.
- **No credential strings found in the current codebase** referencing
  this fixture (confirmed via repo-wide `grep`).

**Action taken:** none required — no file to delete, no regression
test needed for a file that is already absent. Re-verified as part of
this phase rather than re-deleted.

## B. Preview route cleanup

**Finding: mostly already resolved; one real cleanup item found and fixed.**

| Route | Status before this phase | Action |
|---|---|---|
| `/login-concept-a` | Removed in commit `477121e` — no route, no page file | None needed |
| `/login-concept-b` | Removed in commit `477121e` — no route, no page file | None needed |
| `/login-concept-c` | Removed in commit `477121e` — no route, no page file | None needed |
| `/login-network-preview` | Route + page removed in `477121e` | **Orphaned public asset folder found and removed (see below)** |
| `/login-vortex-preview` | Route + page removed in `477121e` | **Orphaned public asset folder found and removed (see below)** |
| `/login-static-preview` | Never existed as a route in `App.jsx`; no matching page component found | None needed |
| `/login-v3` | **Still active, intentionally.** Route present (`App.jsx:143`), page `src/pages/auth/LoginPageV3.jsx` present, fully wired and hardened (PR-1F Gate 3), tests present (`loginV3IdentityGateway.test.ts` and others). Documented in `PR1H_DEFERRED_LIMITATIONS.md` item #1 as "the final Login V3 design — explicitly deferred to the end of the roadmap." It is the actual cutover candidate for `/login`, not a dead preview — awaiting product-owner-approved cutover (see PR-1F Gate 3 items in the task backlog). | **Explicitly preserved — this is not preview/dead code, it is a pending-cutover production candidate. Removing it would destroy real, tested forward progress and contradicts prior explicit direction. Not modified in this phase, per instruction not to touch `/login`-adjacent cutover work outside scope.** |

### Real finding: orphaned public assets

`App.jsx` and the source tree confirmed **zero code references** to
`public/login-network-preview/` or `public/login-vortex-preview/` — the
pages that consumed them (`LoginNetworkPreview.jsx`, `LoginVortexPreview.jsx`)
were already deleted in `477121e`, but their static asset folders under
`public/` were left behind:

```
public/login-network-preview/login-bg-desktop-1920x1080.mp4
public/login-network-preview/login-bg-desktop-1920x1080.webp
public/login-network-preview/login-bg-mobile-1080x1920.mp4
public/login-network-preview/login-bg-mobile-1080x1920.webp
public/login-vortex-preview/login-bg-vortex-desktop-1920x1080.webp
public/login-vortex-preview/login-bg-vortex-mobile-1080x1920.webp
```

**Why this matters:** Vite copies the entire `public/` directory
verbatim into the production build output — files there are served at
their exact path regardless of whether any route or component
references them. With the consuming pages gone, these ~1.46MB of media
files were dead weight, still reachable at those exact URLs in the
deployed production bundle, contributing zero functional value.

**Action taken:** deleted both folders (`rm -rf public/login-network-preview
public/login-vortex-preview`). Confirmed via `grep -rn "login-network-preview\|login-vortex-preview" src/`
returning zero matches before deletion — safe to remove, not referenced
by `LoginPageV3.jsx` or any other live page.

**Verification of production-bundle non-reachability:** re-run in Part 5
(production build) — build output directory listing confirms no
`login-network-preview`/`login-vortex-preview` paths are present.

## C. Governance reference fix — `AGENTS.md`

**Finding: confirmed dangling typo, fixed.**

`AGENTS.md` and `CLAUDE.md` are near-identical governance files (same
"Principal Product Designer and Staff Engineer" workflow instructions).
`CLAUDE.md` correctly ends with `@CLAUDE.design.md`, referencing the
real, present file `CLAUDE.design.md` (repo root). `AGENTS.md` instead
ended with `@Codex.design.md` — a file that has never existed in this
repository (confirmed: `find . -iname "Codex.design.md"` returns
nothing, and `git log --all -- "*Codex.design.md"` returns no history).

This is unambiguously a copy/typo error, not an intentional distinct
contract — every other line in the two files is byte-for-byte
identical.

**Action taken:**
- Replaced `@Codex.design.md` with `@CLAUDE.design.md` in `AGENTS.md`.
- **Did not** create a fake `Codex.design.md` file to satisfy the old
  (wrong) reference.
- Added `docs/production/governanceReferences.test.ts` (4 new tests —
  no equivalent governance-reference test existed before this phase):
  1. `CLAUDE.design.md` exists in the repo root.
  2. `AGENTS.md` references `@CLAUDE.design.md` and no longer contains
     the string `Codex.design.md`.
  3. `CLAUDE.md` still references `@CLAUDE.design.md` (unchanged,
     already correct — regression guard).
  4. No `Codex.design.md` file was fabricated anywhere in the repo
     root.

All 4 pass (`npx vitest run docs/production/governanceReferences.test.ts`
— 4/4 passed).

## Summary of Part 2 changes

| File/path | Change |
|---|---|
| `public/login-network-preview/` | Deleted (orphaned, unreferenced static assets) |
| `public/login-vortex-preview/` | Deleted (orphaned, unreferenced static assets) |
| `AGENTS.md` | 1-line fix: `@Codex.design.md` → `@CLAUDE.design.md` |
| `docs/production/governanceReferences.test.ts` | New — 4 regression tests |

No route changed in `App.jsx`. No production page deleted. `/login`
untouched. `/login-v3` untouched and explicitly preserved as an active,
pending-cutover candidate, not preview/dead code.
