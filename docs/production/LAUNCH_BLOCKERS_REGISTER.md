# PR-1G-A — Launch Blockers Register

Severity scale per the governing instruction: **P0** blocks any launch,
**P1** must fix before public launch, **P2** can launch with a documented
limitation, **P3** post-launch improvement.

## P0 — Blocks any launch

| # | Finding | Source | Why P0 |
|---|---|---|---|
| P0-1 | No verified production backup/export capability exists | [`BACKUP_RESTORE_RUNBOOK.md`](BACKUP_RESTORE_RUNBOOK.md) | Per the explicit governing rule, reset cannot proceed without one; more importantly, *any* future accidental mutation (not just a planned reset) has no recovery path today |
| P0-2 | `.env` (containing live Firebase project config) is tracked in git, with an existing remote | [`PR1G_READ_ONLY_LAUNCH_AUDIT.md`](PR1G_READ_ONLY_LAUNCH_AUDIT.md) §1 | Credential-hygiene exposure; while Firestore access is still rules-gated, this should be rotated/scrubbed before treating the repo as launch-ready, since the remote could be (or become) more widely accessible than intended |

## P1 — Must fix before public launch

| # | Finding | Source | Why P1 |
|---|---|---|---|
| P1-1 | No documented "create the first production admin" procedure | Audit §5 | The product owner has no scripted bootstrap path; without a written step they could be stranded at go-live with no admin account |
| P1-2 | `src/data/dummyData.js` contains hardcoded literal credentials, even though unused/unimported | Audit §4 | Hygiene risk — a future contributor could wire it in by mistake; should be deleted before launch |
| P1-3 | `importBatchRef` has no existence check against `import_jobs` | Audit §6 | Currently latent (no group has been reset), but becomes a real dangling-reference risk the moment Reset Group 3 is ever approved — must be addressed before that group is executed, and is worth fixing independent of reset timing |
| P1-4 | Disabling a user (`active:false`) does not disable the underlying Firebase Auth account | Audit §5 | A "disabled" user's credentials remain technically valid at the Auth layer; defense-in-depth via rules still holds, but this gap should be disclosed and ideally closed (would require an Admin SDK / Cloud Function call) before relying on "disable" as a security control |

## P2 — Can launch with documented limitation

| # | Finding | Source | Why P2 |
|---|---|---|---|
| P2-1 | Login V3 redesign / `/login-v3` cutover deferred | Prior PR-1F closure (carried forward, not re-litigated here) | Already an accepted, documented limitation; `/login` remains on Login V2 |
| P2-2 | `VITE_DEMO_MODE` Netlify env var is configured but read nowhere in `src/` | Audit §1/§10 | Configuration no-op, not a functional or security risk; should be resolved (wire it up or remove it) but does not block launch |
| P2-3 | No physical-device certification beyond Chromium viewport emulation (carried forward from PR-1E) | Prior PR-1E closure | Already an accepted, documented limitation |

## P3 — Post-launch improvement

| # | Finding | Source | Why P3 |
|---|---|---|---|
| P3-1 | Preview/dead-code routes (`/login-concept-a/b/c`, `/login-network-preview`, `/login-vortex-preview`, `/login-v3`) remain reachable by direct URL though unlinked from nav | Audit §11 | Cosmetic/cleanup; not linked anywhere a real user would find them, but should eventually be archived or removed |
| P3-2 | `design-assets/`, `design-reference/`, `.render-tmp/` are untracked-by-gitignore repo bloat | Audit §11 | Not a deployment risk (Vite never bundles them), pure repo hygiene |
| P3-3 | `shadow_evaluation_logs` retention policy undocumented | Inventory doc | Worth defining a retention window eventually; not blocking |

## Explicitly not a blocker (re-affirmed, not re-litigated)

- CLAIMED-record visibility — confirmed still correctly enforced everywhere
  audited (Audit §6). No new finding.
- Firestore rules — no open/`if true` patterns found; both admin bypasses
  are narrowly scoped and already documented inline (Audit §8).
- Firestore indexes — no missing index found for any query pattern
  located in code (Audit §8).
