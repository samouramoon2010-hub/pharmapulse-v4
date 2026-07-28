# Maintenance Quick Wins — Release Decision

## Scope completed

All 5 parts of the Maintenance Quick Wins phase, in the required order:

1. Current-work preservation audit
2. Security and preview cleanup
3. Flaky-test stabilization
4. `importBatchRef` integrity protection
5. Validation

## Full proposed commit manifest

```
 M AGENTS.md
 M docs/production/PRODUCTION_READINESS_ARCHITECTURE.md
 D public/login-network-preview/login-bg-desktop-1920x1080.mp4
 D public/login-network-preview/login-bg-desktop-1920x1080.webp
 D public/login-network-preview/login-bg-mobile-1080x1920.mp4
 D public/login-network-preview/login-bg-mobile-1080x1920.webp
 D public/login-vortex-preview/login-bg-vortex-desktop-1920x1080.webp
 D public/login-vortex-preview/login-bg-vortex-mobile-1080x1920.webp
 M src/App.jsx
 M src/components/layout/Sidebar.jsx
 M src/pages/actions/phase3c3e.test.ts
 M src/pages/assistant/AssistantPage.jsx
 M src/pages/profileStudio/phase4aCertification.test.ts
 M src/services/dataExchange/adapters/branchActualsAdapter.test.ts
 M src/services/dataExchange/adapters/pharmacistActualsAdapter.test.ts
 M src/services/kpiService.d.ts
 M src/services/kpiService.js
?? docs/production/MAINTENANCE_QUICK_WINS_BASELINE.md
?? docs/production/MAINTENANCE_QUICK_WINS_FLAKY_TEST.md
?? docs/production/MAINTENANCE_QUICK_WINS_IMPORT_INTEGRITY.md
?? docs/production/MAINTENANCE_QUICK_WINS_SECURITY.md
?? docs/production/governanceReferences.test.ts
?? src/engine/itemSales/
?? src/pages/smartList/
?? src/services/importBatchRefIntegrity.test.ts
?? src/services/itemSalesService.ts
```

Nothing has been staged or committed. Per Part 1's classification, this
manifest spans two distinct efforts and should be split into two
commits, as proposed below.

## Proposed commits

### Commit 1 — Preserve existing intended work (pre-dates this phase)

Two already-in-progress, already-tested efforts that were sitting
uncommitted when this phase started (see
[`MAINTENANCE_QUICK_WINS_BASELINE.md`](MAINTENANCE_QUICK_WINS_BASELINE.md)):

```
 M src/App.jsx
 M src/components/layout/Sidebar.jsx
 M src/pages/actions/phase3c3e.test.ts
 M src/pages/assistant/AssistantPage.jsx
?? src/engine/itemSales/
?? src/pages/smartList/
?? src/services/itemSalesService.ts
```

Proposed message:
```
feat(assistant,smart-list): branch picker for multi-branch roles + item sales analytics

- AssistantPage: add a branch selector for admin/general_manager/
  district_supervisor (previously got empty grounded evidence because
  their profile has no single pharmacyId)
- Item Sales Analytics (DX-12b): new /item-sales page + engine reading
  the Smart List monthly aggregates already ingested by DX-12
```

### Commit 2 — Maintenance Quick Wins

```
 M AGENTS.md
 M docs/production/PRODUCTION_READINESS_ARCHITECTURE.md
 D public/login-network-preview/login-bg-desktop-1920x1080.mp4
 D public/login-network-preview/login-bg-desktop-1920x1080.webp
 D public/login-network-preview/login-bg-mobile-1080x1920.mp4
 D public/login-network-preview/login-bg-mobile-1080x1920.webp
 D public/login-vortex-preview/login-bg-vortex-desktop-1920x1080.webp
 D public/login-vortex-preview/login-bg-vortex-mobile-1080x1920.webp
 M src/pages/profileStudio/phase4aCertification.test.ts
 M src/services/dataExchange/adapters/branchActualsAdapter.test.ts
 M src/services/dataExchange/adapters/pharmacistActualsAdapter.test.ts
 M src/services/kpiService.d.ts
 M src/services/kpiService.js
?? docs/production/MAINTENANCE_QUICK_WINS_BASELINE.md
?? docs/production/MAINTENANCE_QUICK_WINS_FLAKY_TEST.md
?? docs/production/MAINTENANCE_QUICK_WINS_IMPORT_INTEGRITY.md
?? docs/production/MAINTENANCE_QUICK_WINS_SECURITY.md
?? docs/production/MAINTENANCE_QUICK_WINS_RELEASE_DECISION.md
?? docs/production/governanceReferences.test.ts
?? src/services/importBatchRefIntegrity.test.ts
```

Proposed message:
```
chore: maintenance quick wins — dead assets, flaky test, import integrity

- Remove ~1.46MB of orphaned public/login-{network,vortex}-preview
  static assets (pages already deleted in 477121e, assets left behind
  and still reachable by direct URL in production builds)
- Fix dangling AGENTS.md reference (@Codex.design.md, a typo, never a
  real file → @CLAUDE.design.md, the real existing file) + 4 regression tests
- Stabilize the one flaky test from the July 2026 review
  (phase4aCertification.test.ts: simulateProfile's live trace timestamp
  made two back-to-back calls only match in the same millisecond) by
  freezing the clock for that test only — 20/20 repeated runs clean
- Close PR-1G-A P1-3: saveKpiEntry() now verifies importBatchRef
  references a real import_jobs document before writing an
  isDataExchangeImport entry, closing a latent dangling-reference risk
  — 10 new tests + 2 adapter test fixtures updated to model the
  import_jobs collection (no assertion weakened)

No production data changes. No Firestore rules deployed. No Auth
mutation. dummyData.js and the login-concept-a/b/c preview
pages/routes were already removed in a prior commit — confirmed still
absent, no action needed here.
```

Both commits are reviewed and ready; neither has been created. Awaiting
explicit go-ahead to commit (and separately, to push — not requested).

## Test evidence summary

| Check | Result |
|---|---|
| Full test suite | 365 files, 25,584 tests, **0 failures** |
| Flaky test — 20x repeat | **0/20 failures** |
| `tsc --noEmit` | Clean (exit 0; only a pre-existing, unrelated `baseUrl` deprecation notice) |
| Production build | Succeeded, 3.4MB `dist/` |
| Removed preview assets in `dist/` | **Absent** (confirmed via `find dist`) |
| Secrets in changed files | None found |
| `.env` tracked | No (only `.env.example`) |
| `dist/` staged or tracked | No |
| Firestore/Auth mutation | **None** — all test runs against mocked Firestore only |
| Firestore rules deployed | **None** |
| Production data changed | **None** |
| Netlify/deploy triggered | **None** |

## Final decision

**MAINTENANCE QUICK WINS CLOSED — READY FOR COMMIT REVIEW**
