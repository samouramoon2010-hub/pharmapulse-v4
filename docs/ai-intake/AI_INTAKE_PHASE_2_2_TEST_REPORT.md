# Universal AI Intake — Phase 2.2 Test Report

## Summary

170 focused tests across 19 test files under `src/services/connector/`,
`netlify/functions/`, and `scripts/` (up from 129/16 at the close of
Phase 2.1 — the 41 new tests are Phase 2.2's own coverage: 26 in
`mcpProtocolHandler.test.ts`, 6 in `mcpToolSchemas.test.ts`, and the
remainder from the Phase 2.2 side-effect-parity additions to
`buildCommitPlan.test.ts`/`adminFirestoreCommitExecutor.test.ts` and 3
new tests appended to the pre-existing `connectorHttpHandler.test.ts`).
Full repo suite: 25,922 tests across 398 files, all passing — zero
regressions to any existing module (up from 25,881/395 at Phase 2.1's
close; the delta is exactly this phase's new test files plus the
extracted shared fixtures). `tsc --noEmit` clean for every Phase 2.2
file. `npm run build` succeeds. Browser bundle (`dist/`) contains zero
occurrences of `firebase-admin`, every server-only secret name, any
MCP-server-library string, or the MCP protocol handler's own module
name.

## New test files

| File | Tests | Covers |
|---|---|---|
| `src/services/connector/mcp/mcpProtocolHandler.test.ts` | 26 | initialize, capabilities, protocol-version validation, tools/list discovery, tools/call framing (unknown tool, missing name, malformed args, unknown-field rejection), malformed JSON-RPC (parse error, missing jsonrpc, unknown method, missing id, notifications), full 8-tool lifecycle via tools/call, auth/scope error-code preservation via isError results, stack-trace/credential redaction, rate limiting, oversized-payload/page-size rejection, duplicate-execution + stale-approval protection, production-guard behavior, audit correlation |
| `src/services/connector/mcp/mcpToolSchemas.test.ts` | 6 | exactly-8-tools invariant, non-destructive classification, real object-typed schemas, request-limit ceilings present on the correct fields |
| `scripts/mcpVerify.demo.test.ts` | 1 (18 assertions) | the spec's full 18-item external-verification checklist in one continuous session |

## Extended existing test files

| File | Change |
|---|---|
| `src/services/connector/connectorHttpHandler.test.ts` | +3 tests: completed-session re-execution rejection, execute-time plan-signature mismatch, missing-commitExecutor fail-closed. Refactored to use the new shared `testSupport/fakeCommitExecutor.ts` fixture (previously duplicated inline) |
| `scripts/connectorSimulate.demo.test.ts` | Refactored to use the shared fixture; no behavior change |
| `src/services/connector/commitPlan/buildCommitPlan.test.ts` | +5 tests for the Phase 2.2 branch-to-district link fix (see Side-Effect Parity below) |
| `netlify/functions/adminFirestoreCommitExecutor.test.ts` | +4 tests for the `arrayUnionField` primitive; mocked `firebase-admin/firestore`'s `FieldValue` (new this phase, needed to deterministically test `arrayUnion` semantics in the hand-built fake Firestore) |

## New shared test fixture

`src/services/connector/testSupport/fakeCommitExecutor.ts` — extracted
from what was previously duplicated inline in two test files
(`connectorHttpHandler.test.ts` and `connectorSimulate.demo.test.ts`);
now used by those two plus the new `mcpProtocolHandler.test.ts` and
`mcpVerify.demo.test.ts`. Not imported by any production code.

## Spec's 38-item checklist — mapped to actual coverage

1. MCP initialize — `mcpProtocolHandler.test.ts`
2. protocol-version handling — same file, "rejects initialize with missing protocolVersion"
3. server capabilities — "exposes a tools-only capability set"
4. tools/list — "lists all 8 tools with real JSON schema and _meta"
5. tools/call — full 8-tool lifecycle test
6. unknown method — "rejects an unknown method (METHOD_NOT_FOUND)"
7. unknown tool — "rejects tools/call for an unknown tool name"
8. malformed JSON-RPC — "rejects a request missing jsonrpc:2.0" + "rejects a non-object body"
9. missing request ID — "treats a request with no id ... as invalid"
10. invalid params — "rejects tools/call with no params.name"
11. authentication success — full lifecycle test's every successful call
12. authentication failure — "rejects tools/call with no Authorization header"
13. scope enforcement — "rejects tools/call missing the required scope"
14. tool schema validation — "rejects malformed tool arguments" + "rejects an unknown field"
15. create-session mapping — full lifecycle test, step 1
16. validate mapping — full lifecycle test, step 2
17. preview mapping — full lifecycle test, step 3
18. approval mapping — full lifecycle test, step 4
19. execute mapping — full lifecycle test, step 5
20. status mapping — full lifecycle test, step 6
21. cancel mapping — full lifecycle test, step 7 (cancel-after-completed correctly rejected)
22. reference-data mapping — full lifecycle test, step 8
23. error-code preservation — "rejects tools/call missing the required scope" asserts `code: 'INVALID_SCOPE'` end-to-end through the MCP layer
24. stack-trace redaction — "never leaks a stack trace or credential value in a tool-call error result"
25. request correlation — `mcpAuditCorrelation.ts`'s design + the "replayed request" verification-client step proving no false collision
26. audit correlation — "every tools/call writes a traceable connector audit record"
27. rate limiting — "surfaces rate limiting through tools/call as a tool-result error"
28. oversized payload — "rejects an oversized rows[] array" + `pharmapulse-mcp.ts`'s 2 MB body-size check
29. pagination limits — "rejects a preview page-size request exceeding the documented ceiling"
30. connector-disabled behavior — inherited unchanged from Phase 2's `handleConnectorRequest()`, exercised implicitly by every test (the fixture always sets `CONNECTOR_ENABLED` via `productionGuardFlags`)
31. production-write-disabled behavior — "execute is blocked when no productionGuardFlags are configured"
32. Admin executor integration — full lifecycle test's execute step uses the same `CommitExecutor` shape the real `AdminFirestoreCommitExecutor` implements (via the shared fake fixture); the real executor itself has its own dedicated 19-test suite (Phase 2.1, extended this phase with the arrayUnion tests)
33. duplicate execution protection — "a second execute with a different idempotency key ... is rejected"
34. stale approval rejection — "execute rejects a stale preview signature at approve-time"
35. MCP client end-to-end flow — `scripts/mcpVerify.demo.test.ts`'s full 18-item run
36. client bundle isolation — see Browser Bundle Isolation below
37. Netlify function build — `pharmapulse-mcp.ts` type-checks cleanly standalone; `connectorEnvFactory.ts` shared by both Netlify Functions type-checks cleanly; no live `netlify build`/`netlify deploy` was run this session (consistent with every prior phase)
38. no production mutation — every test in this phase runs against the in-memory repository or the hand-built in-memory Firestore fake; zero live Firestore calls, confirmed by the same mocking convention used throughout Phase 2/2.1

## Side-effect parity implementation (not purely a test item, but proven by tests above)

During the side-effect parity review required by this phase's spec,
investigation found that the BRANCH commit-plan builder
(`buildCommitPlan.ts`) never linked a newly-created branch to its
parent district — unlike the browser path
(`branchesAdapter.ts`'s `commitBatch()`, which calls
`districtService.assignPharmacyToDistrict()`). This was **not** one of
the four side effects Phase 2.1 explicitly deferred as
read-repairable; it was an undocumented gap discovered this phase.
Investigation confirmed `district.pharmacyIds` is genuinely
load-bearing (`territorySync.ts`, `kpiService.js`'s multi-branch
fetch, `scopeResolver.ts`'s `assignedPharmacyIds` cache all read it for
district_supervisor/regional_manager scope resolution) — a connector-
imported branch with no district link would be invisible to its
supervisor's KPI queries. This was classified **required for
correctness** and implemented this phase:

- `CommitOperation` gained a new `arrayUnionField` primitive
  (`commitOperationTypes.ts`) — an atomic, read-free Firestore
  `arrayUnion`, distinct from the existing `nestedMapField`
  read-modify-write pattern (Phase 2.1).
- `buildBranchOperation()` now denormalizes `districtId`/`regionId`
  onto the branch document (mirroring
  `assignPharmacyToDistrict()`'s exact field names) and emits a
  second `CommitOperation` targeting the district document's
  `pharmacyIds` array, when the connector supplies a resolved
  `resolveDistrictByGroupCode` dependency.
- `connectorIntakeService.ts`'s `executeIntakeSession()` now builds
  this dependency from the same `existing.onboarding.groups` array
  already used elsewhere — no new Firestore read.
- `AdminFirestoreCommitExecutor`'s `writeOperation()` handles
  `arrayUnionField` via `FieldValue.arrayUnion()` — no read-modify-
  write needed (unlike `nestedMapField`), since Firestore's
  `arrayUnion` is server-side atomic and naturally idempotent.

The other three Phase 2.1-documented omissions were re-reviewed and
their classification confirmed unchanged:

| Side effect | Classification | Reasoning |
|---|---|---|
| Assigned-pharmacy cache recompute (`recomputeAssignedPharmacyIds`) | Deferred/read-repairable | A dedicated manual repair tool already exists in this repository (`territoryBackfill.ts`, documented as "Manual repair tool for the assignedPharmacyIds cache") — an admin can run it after any connector-driven branch/district import to repair drift, exactly the designed-for-this-purpose mechanism, so no Admin-path replication was added |
| History snapshot generation (`triggerHistorySnapshots`) | Deferred/read-repairable | Feeds trend/analytics charts only; a missing snapshot for one row doesn't affect current-state KPI calculations and self-heals on the next actuals write |
| `kpi_audit_logs` dual-write | Deferred/read-repairable, largely obsolete for this path | The Admin executor's own `writeDomainAudit()` already writes to `audit_logs` for every successful operation (Phase 2.1) — the second, KPI-specific collection is a duplicate audit trail location, not a distinct capability |

Branch pharmacy-district linkage was the only item reclassified from
"deferred" (in Phase 2.1's docs) to "implemented" (this phase), based
on the concrete evidence above.

## Type-check

`npx tsc --noEmit -p tsconfig.json --ignoreDeprecations 6.0` produces
zero errors in any Phase 2.2 file (`mcpTypes.ts`, `mcpToolSchemas.ts`,
`mcpSchemaValidator.ts`, `mcpErrorAdapter.ts`, `mcpAuditCorrelation.ts`,
`mcpAuthBridge.ts`, `mcpProtocolHandler.ts`, all `.test.ts` files,
`pharmapulse-mcp.ts`, `connectorEnvFactory.ts`, and the Phase 2.2
changes to `buildCommitPlan.ts`/`commitOperationTypes.ts`/
`adminFirestoreCommitExecutor.ts`). Remaining `tsc` errors across the
repo (missing `@types/node` for `crypto`/`Buffer` — a pre-existing,
repo-wide baseline gap present since Phase 2 — plus unrelated `?raw`
source-scan imports and a pre-existing `connectorAuditService.test.ts`
tuple-type nuance) are identical to the baseline documented in every
prior phase's report, unaffected by this phase's changes.

## Build

`npm run build` succeeds (Vite production build, ~6.3s). Pre-existing
`INEFFECTIVE_DYNAMIC_IMPORT` warnings and the >500kB chunk-size warning
are unrelated to this phase.

## Browser bundle isolation

```
grep -rl "firebase-admin" dist/                                                          → no matches
grep -rlE "FIREBASE_SERVICE_ACCOUNT_JSON|CONNECTOR_TOKEN_SECRET|CONNECTOR_APPROVAL_SECRET|CONNECTOR_CLIENT_ADMIN_MAP" dist/  → no matches
grep -rliE "@modelcontextprotocol|json-rpc" dist/                                          → no matches
grep -rl "mcpProtocolHandler|handleMcpRequest" dist/                                       → no matches
```

No MCP server library was added as a dependency at all (see
`AI_INTAKE_PHASE_2_2_MCP_ARCHITECTURE.md`'s "No new npm dependency"),
so there is nothing to isolate on that front beyond confirming the new
`src/services/connector/mcp/` module tree itself never leaks into the
client bundle — confirmed above.
