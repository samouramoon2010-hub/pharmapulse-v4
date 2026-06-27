# PR-1G-A — Approval Package

**No action in this table may proceed while its Owner Approval reads
"Pending."** This table is the explicit gate between PR-1G-A (read-only,
complete) and PR-1G-B (destructive, not authorized in this run, not
executed).

| Action Group | Recommended | Risk | Backup Required | Owner Approval |
|---|---|---|---|---|
| Demo operational data (Group 1: `pharmacies`/`users`/`targets`/`personal_targets`/`kpi_entries`/`evaluation_results`/`demo_batches` where `isDemoData===true`) | Approve | Low | Yes | Pending |
| Test users (Group 2: demo-pattern Auth+Firestore accounts, plus any owner-identified test accounts) | Approve | Medium (Auth deletion is irreversible without backup) | Yes (incl. `firebase auth:export`) | Pending |
| Staging/import artifacts (Group 3: `import_staging_entries` for terminal jobs; `import_jobs` metadata deferral recommended) | Approve staging rows only; defer `import_jobs` metadata deletion | High for `import_jobs` metadata (unchecked `importBatchRef` dependency), Low for staging rows | Yes | Pending |
| Evaluation/ranking demo output (Group 4: demo-tagged `evaluation_results`/`ranking_history`/`shadow_evaluation_logs`) | Approve | Low | Yes | Pending |
| Preview routes/assets (`/login-v3`, `/login-concept-a/b/c`, `/login-network-preview`, `/login-vortex-preview` and their asset folders) | Hide from production nav now (already true); remove before public launch | Low | No (not a data action) | Pending |
| Legacy/dead code (`src/data/dummyData.js`, `.render-tmp/`, `design-assets/`, `design-reference/`) | Remove `dummyData.js` before launch (P1); archive the design folders outside the app tree (P3) | Low | No | Pending |

## Final decision gate

This audit (PR-1G-A) is complete. **No row above has been approved by
the product owner as of this report.** Per the explicit instruction
governing this phase, PR-1G-B (any reset, any group, any execution) is
**not authorized** until:

1. A verified, tested backup exists (Firestore export + Auth export).
2. The product owner sets each row above from "Pending" to an explicit
   decision.
3. A separate, explicit approval is given to begin PR-1G-B.

Nothing in this checklist constitutes that approval.
