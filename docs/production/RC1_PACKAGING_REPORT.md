# RC1 Packaging Report — Controlled Commit, Tag, and Push

## Source branch

`feature/data-exchange-studio-v1`

## Baseline commit (before packaging)

`2d978fc56e522320a789cfee767424c52c71f1c8` — unchanged since PR-1H/PR-1I;
no commit had been created in this program until this packaging phase.

## RC1 commit

`5f10971886e7b1aafa624282502f51370db79a4e`
("release: package PharmaPulse RC1 production readiness baseline")
— parent `2d978fc56e522320a789cfee767424c52c71f1c8`, 267 files changed
(35,101 insertions, 698 deletions).

## Tag

`pharmapulse-rc1` (annotated) → tag object
`d7003df864fb42a783668b89cc5a2f4e201b1a58` → points to commit
`5f10971886e7b1aafa624282502f51370db79a4e`. No other tag was created or
moved. The only other local tag, `foundation-closed-v1.0`, was
untouched.

## Remote

`origin` = `https://github.com/samouramoon2010-hub/pharmapulse-v4.git`.
Before this phase, `origin` had no `feature/data-exchange-studio-v1`
branch (only `main`) and no `pharmapulse-rc1` tag — confirmed via a
fresh `git fetch`/`git ls-remote` immediately before pushing, so the
push created new refs rather than updating or conflicting with
anything. No force push, no rebase, no history rewrite was needed or
used.

One pre-existing, unrelated observation surfaced during the safety
audit: `origin/main` carries one commit
(`981a6dd`, "Evaluation stabilization complete," 2026-06-06) that is
not part of this branch's history. This phase never touched `main` and
the push went only to `feature/data-exchange-studio-v1` and the new
tag, so it has no bearing on RC1, but it's recorded here for owner
awareness.

## Included scope (267 files staged and committed)

Grouped by category — see the in-conversation manifest for the full
file-by-file breakdown:

- Evaluation engine V1/V2 + PR-1I compliance fix (11 files): shared
  `weightRedistribution.ts`/`scoreRounding.ts` utilities, both engines'
  aggregator/rounding logic, 31 new regression tests.
- Data Exchange Studio (59 files) and Export Studio (23 files):
  completed DX-1 through DX-10 feature work.
- Auth/Login (13 files): the approved Login V2 hygiene fix plus the
  already-accepted, unlinked Login V3/concept/network/vortex preview
  routes and their served assets.
- Mobile bundle, PR-1E (22 files).
- Production/DX/Export documentation (69 files), including all four
  new PR-1I docs and the append-only architecture-doc update.
- Project governance (3 files): `AGENTS.md`, `CLAUDE.md`,
  `CLAUDE.design.md` — included per explicit owner instruction this
  phase, after verification (see "Known limitations" below for one
  finding).
- Security hygiene: `.env` removed from tracking (deletion only, no
  content added — `.env` remains on disk, gitignored), `.gitignore`,
  `.env.example` (names only).
- Firestore config (`firestore.rules`, `firestore.indexes.json`),
  role/scope contract (PR-1B), TypeScript declaration files, and the
  remaining core application page/component/service changes
  accumulated across PR-1A–PR-1I.

## Excluded files — preserved, not deleted, not committed

- `.render-tmp/` — scratch render pipeline (composite PNGs, throwaway
  `capture.js`/`package.json`). Still on disk.
- `design-assets/`, `design-reference/` — raw source/composite images
  used only as provenance material for already-shipped, already-staged
  assets (`public/assets/`, `public/login-network-preview/`,
  `public/login-vortex-preview/`); referenced only in code *comments*,
  never loaded at runtime. Still on disk.
- `.claude/` — local Claude Code tool settings (`settings.local.json`,
  `launch.json`). Still on disk.

None of these were reverted, deleted, or modified — they remain exactly
as they were, simply untracked.

## Staged-secret scan

Ran across all 35,101 added lines in the staged diff: AWS key pattern
(`AKIA...`), Google API key pattern (`AIza...`), private-key headers
(`BEGIN ... PRIVATE KEY`), Stripe/Slack/GitHub token patterns, and a
generic `(api_key|secret|password|token)[:=]<value>` heuristic (with
test/placeholder/code-pattern false positives filtered) — **zero
hits**. Filename scan for `.pem`/`.key`/`.p12`/`serviceaccount`/
`credentials` — one harmless match (`SECRET_ROTATION_CHECKLIST.md`,
a names-only doc already verified in PR-1G-B0). `.env` confirmed not
tracked (`git ls-files .env` empty) and staged only as a
deletion-from-tracking with no content. 8 binaries staged, all
legitimate, code-referenced login-background assets — no scratch
renders, no duplicates.

## Known limitation found during file-content verification

`AGENTS.md` line 30 references `@Codex.design.md`, which does not
exist anywhere in the repository (only `CLAUDE.design.md` exists;
`CLAUDE.md`'s equivalent line correctly references it).
`AGENTS.md`/`CLAUDE.md` are otherwise byte-identical. Per the owner's
explicit instruction to include these files as-is after verification,
this dangling reference was **not modified** and is documented here
as a known, non-blocking content issue for a future correction pass —
it does not affect any application code, build, or test.

## Test totals

- Pre-commit (already established by PR-1I, code unchanged since):
  354 files / 25,532 tests passing.
- Post-commit re-verification: PR-1I compliance suites (31 tests) —
  31/31 passing. Full project suite re-run after the commit — **354
  files / 25,532 tests passing, 0 failures.**

## TypeScript result

`npx tsc --noEmit` — zero errors, before and after the commit. One
pre-existing, unrelated informational notice (TS5101, deprecated
`tsconfig.json` `baseUrl` option) — present in every prior phase of
this program, not introduced by this packaging.

## Build result

`npm run build` — succeeded, before and after the commit. Output
unchanged in shape: 13-entry PWA precache manifest (2977.48 KiB), same
pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` and chunk-size warnings.

## Known limitations (carried forward, unresolved by this phase)

- Official Firestore export backup: still unverified (Google Cloud
  billing disabled on `pharmapulse-646de` — PR-1G-B0).
- Login V3 final cutover: not started; `/login` remains on Login V2.
- Passkey/WebAuthn: not implemented (inert UI placeholders only).
- Staging environment: none exists; single Firebase project only.
- `AGENTS.md` dangling `@Codex.design.md` reference (this phase, see above).

## Backup status

Unchanged: **BACKUP PROCEDURE READY — LIVE BACKUP NOT YET VERIFIED.**
This packaging phase performed no Firestore export, import, or any
other backup action.

## Reset status

**Not started.** No reset group from the PR-1G-A proposal was touched.

## Deployment status

**None.** No Netlify deploy, no Firebase deploy, no Firestore/Auth
mutation. GitHub's push response only suggested opening a pull
request (a standard informational message, not a deploy trigger).
This phase has no visibility into whether any repository-level
CI/CD/webhook automation independently reacts to the new branch or
tag — none was observed in the push output, and none was initiated by
any command run in this phase.

## Rollback reference

- To remove the pushed tag (if ever needed): `git push origin
  :refs/tags/pharmapulse-rc1` (remote) and `git tag -d pharmapulse-rc1`
  (local) — **not executed, owner action only.**
- To revert the branch to its pre-RC1 state: `git revert
  5f10971886e7b1aafa624282502f51370db79a4e` (preferred — preserves
  history) or, if the branch has no other dependents,
  `git reset --hard 2d978fc56e522320a789cfee767424c52c71f1c8` followed
  by a force-push — **not executed, owner action only, and force-push
  would need explicit owner approval given it rewrites a now-public
  branch.**
- Since `origin/main` was never touched, no rollback action on `main`
  is needed regardless of any decision made about this RC1 branch/tag.
