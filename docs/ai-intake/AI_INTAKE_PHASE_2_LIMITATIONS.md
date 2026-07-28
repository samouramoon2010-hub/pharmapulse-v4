# Universal AI Intake — Phase 2 Known Limitations

## ChatGPT is not connected — external steps still required

Building this foundation does **not** mean ChatGPT can call PharmaPulse
today. See "External steps still required" in the final report — this
phase delivers the server-side contract and Netlify Function, not an
MCP server registration or a live ChatGPT-side connector configuration.

**Phase 2.2 update:** an actual MCP-protocol endpoint now exists
(`netlify/functions/pharmapulse-mcp.ts`, backed by
`src/services/connector/mcp/mcpProtocolHandler.ts`) and is proven,
in-process, against an 18-item external-verification checklist (see
`AI_INTAKE_PHASE_2_2_EXTERNAL_VERIFICATION.md`). This is real protocol
readiness, not a real ChatGPT connection — no deployment occurred, no
credentials were provisioned, and no actual ChatGPT connector session
has ever called this endpoint. See
`AI_INTAKE_PHASE_2_2_CHATGPT_REGISTRATION.md` for the concrete list of
external steps (deployment, credentials, ChatGPT-side registration,
owner admin-mapping decision) still required before a real connection
can exist.

## RESOLVED in Phase 2.1 — production write path now uses the Admin SDK

The limitation described in Phase 2 (below, struck through for history)
is closed as of Phase 2.1. `executeIntakeSession` no longer calls
`commitJob()`/`adapter.commitBatch()` (the client-SDK pipeline) at all.
It now builds a framework-neutral `CommitPlan` (`buildCommitPlan.ts`)
from the same validated `StagedImportRow[]` and executes it through
`AdminFirestoreCommitExecutor` (`netlify/functions/adminFirestoreCommitExecutor.ts`),
which uses `firebase-admin/firestore` exclusively — no client SDK
anywhere in the connector's execute path. See
`AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md` and
`AI_INTAKE_PHASE_2_1_ADMIN_EXECUTOR.md` for the full design, and
`AI_INTAKE_PHASE_2_1_TEST_REPORT.md` for the proof (129 focused tests,
all 8 domains covered, idempotency and partial-failure verified against
an isolated in-memory Firestore-compatible fake — not a live emulator,
see that report's honest disclosure).

~~Production write path is architected but not fully implemented for
all 8 domains~~ — superseded. The browser Data Exchange Studio /
`/ai-intake` client path is untouched and still uses the client SDK
(`commitJob()`/`adapter.commitBatch()`) exactly as before; only the
connector's server-side execute path was replaced.

## No live verification against real Firestore or a deployed Function this session

Per the task's own restrictions ("no production Firestore mutation,"
"test with mocks, local repository, or emulator only," "keep
production writes disabled"): every connector test and the local
simulator run entirely offline, against the in-memory repository, with
`firebase/firestore` mocked. No `netlify deploy` was run. No
`FIREBASE_SERVICE_ACCOUNT_JSON` was created or used.

**Phase 2.1 update:** the new Admin-SDK write path
(`adminFirestoreCommitExecutor.test.ts`) is proven against a hand-built,
faithful in-memory fake of the Admin SDK's Firestore surface — not a
live Firebase Emulator Suite (this repo has no `emulators` block in
`firebase.json` and no Java/`firebase-tools` toolchain confirmed
available). This is the spec's own explicitly-permitted alternative
("isolated in-memory Firestore-compatible repository for unit tests").
Running against a real emulator or real Firestore remains a documented
follow-up — see `AI_INTAKE_PHASE_2_1_TEST_REPORT.md`.

## Browser UI live smoke test not completed this pass

The `/ai-intake` page's new read-only "Connector Sessions" section is
covered by 6 source-scan tests (`aiIntakePhase2Certification.test.ts`)
but was not visually verified in the live browser preview this
session — the browser session had signed out (fresh preview instance)
and re-authenticating requires entering a password, which is outside
what this process is permitted to do. The underlying read (`listRecentImportJobs`)
is unchanged, already-proven code reused from Data Exchange Studio's
existing Import History section.

## Authentication is an interim/local adapter, not final production design

See `AI_INTAKE_PHASE_2_AUTHENTICATION.md` — the self-issued HMAC token
is explicitly documented as the local development adapter. A real
external ChatGPT MCP connection would likely require OAuth 2.0 +
PKCE, which is a separate, larger piece of infrastructure not built
this phase. **Still true in Phase 2.2** — the MCP layer's
`mcpAuthBridge.ts` reuses the same HMAC token verification unchanged;
see `AI_INTAKE_PHASE_2_2_AUTH.md` for the documented OAuth 2.0
production direction (not implemented).

## Rate limiting and idempotency stores are per-repository-instance

The in-memory implementations (tests/simulator) don't persist across
process restarts — expected and correct for a test double. The
production Firestore-backed implementation persists correctly, but
was never exercised against live Firestore this session (see above).

## No live Firebase Emulator Suite or real MCP client library this phase either

Consistent with Phase 2.1: Phase 2.2's MCP protocol verification
(`scripts/mcpVerify.demo.test.ts`) calls `handleMcpRequest()` directly
in-process rather than through a real deployed HTTP endpoint or a real
`@modelcontextprotocol/sdk`-based client — see
`AI_INTAKE_PHASE_2_2_EXTERNAL_VERIFICATION.md`'s explicit statement of
what this does and does not prove.

## Streaming (SSE) MCP transport not implemented

Only the single-request/response subset of MCP's Streamable HTTP
transport is implemented — no server-initiated notifications, no
streamed tool-call progress. See
`AI_INTAKE_PHASE_2_2_PROTOCOL.md`'s "Transport" section for why this
is an appropriate scope for a serverless Netlify Function (which
cannot hold a long-lived connection open) rather than a gap.

## Branch-to-district linkage fixed this phase; three other side effects remain deferred

Phase 2.2's side-effect parity review found and fixed a genuine
correctness gap (connector-imported branches were never linked to
their parent district, breaking district_supervisor/regional_manager
KPI query scope) — see `AI_INTAKE_PHASE_2_2_TEST_REPORT.md`'s
"Side-effect parity implementation" section. The three other Phase
2.1-documented omissions (assigned-pharmacy cache recompute, history
snapshot generation, `kpi_audit_logs` dual-write) were re-reviewed and
remain deferred/read-repairable, with reasoning recorded in the same
section — notably, an existing manual repair tool
(`territoryBackfill.ts`) already covers the assigned-pharmacy cache
case, which is why it was not replicated in the Admin path.
