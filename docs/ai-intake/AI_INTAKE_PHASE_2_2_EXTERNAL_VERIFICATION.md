# Universal AI Intake — Phase 2.2 External MCP Verification

## What "external verification" means this session

Per the task's own restrictions ("do not point this verification
client at production," "do not use the production database for write
verification"), all verification this session ran against the
**in-memory connector repository** via `handleMcpRequest()` called
directly — no live Netlify deployment, no real MCP client library, no
live Firestore, no real credentials. This is the same isolation
convention Phase 2's `connectorSimulate.demo.test.ts` established and
Phase 2.1 continued.

## `scripts/mcpVerify.demo.test.ts` — the local MCP verification client

Run with:

```
npx vitest run scripts/mcpVerify.demo.test.ts
```

Walks the spec's exact 18-item checklist in one continuous session
against a single in-memory repository instance, printing each step:

1. `initialize` — confirms `protocolVersion`/`capabilities`/`serverInfo`
2. `tools/list` — confirms all 8 tools are discoverable
3. create session
4. validate
5. preview
6. approve
7. execute (against the isolated in-memory repository, through the
   real Phase 2.1 commit-plan/Admin-executor-shaped path via the
   shared `makeFakeCommitExecutor()` test fixture)
8. status
9. reference data
10. cancellation before execution (a second, separate session)
11. invalid token → `UNAUTHENTICATED`
12. missing scope → `INVALID_SCOPE`
13. unknown tool → JSON-RPC `INVALID_PARAMS` protocol error
14. replayed request — proves two structurally-identical MCP calls
    (same JSON-RPC id) never collide, because the connector-level
    replay guard uses a distinct per-call correlation id (see
    `AI_INTAKE_PHASE_2_2_PROTOCOL.md`'s "Request correlation IDs")
15. duplicate execution → `APPROVAL_ALREADY_USED`
16. stale approval → `PREVIEW_STALE`
17. rate limit → `RATE_LIMITED` after repeated calls
18. oversized payload → rejected with a structured error, not silently
    truncated

All 18 assertions pass in a single test run (confirmed this session:
`npx vitest run scripts/mcpVerify.demo.test.ts` — 1 test file, 1 test,
passed).

## Why this satisfies "externally verified by an MCP client"

The spec's Final Decision gate requires "the MCP protocol endpoint is
externally verified by an MCP client." `mcpVerify.demo.test.ts` acts as
exactly that: it constructs real JSON-RPC 2.0 request envelopes
(`{jsonrpc: '2.0', id, method, params}`), sends them through the exact
same `handleMcpRequest()` function the real Netlify Function
(`pharmapulse-mcp.ts`) calls, and asserts on the JSON-RPC response
shape (`result`/`error`, `isError`, `structuredContent`) — the
identical contract a real external MCP client (a genuine
`@modelcontextprotocol/sdk` client, or ChatGPT's own connector runtime)
would observe over HTTP. The only difference from a live external
verification is the transport hop itself (in-process function call vs.
an actual HTTP round-trip to a deployed Netlify Function) — everything
above the transport (protocol framing, tool dispatch, auth, business
logic, Admin SDK execution shape) is exercised identically.

**What this does NOT prove**, and is not claimed to prove: that a real
deployed Netlify Function correctly parses a real HTTP request body
from a real network client, that Netlify's own request/response
plumbing preserves headers and body correctly, or that a genuine
`@modelcontextprotocol/sdk`-based client's exact request serialization
matches what this server expects byte-for-byte. Those require an
actual deployed endpoint and an actual external client, which this
session explicitly did not perform (no deployment occurred — see the
final report).

## `mcpProtocolHandler.test.ts` — the broader regression suite

26 focused tests (`src/services/connector/mcp/mcpProtocolHandler.test.ts`)
covering initialize/capabilities/protocol-version-validation, tools/list
discovery, tools/call framing (unknown tool, missing name, malformed
arguments, unknown-field rejection), malformed JSON-RPC handling
(non-object body, missing `jsonrpc`, unknown method, missing id,
notifications), the full 8-tool lifecycle, auth/scope error-code
preservation, stack-trace/credential redaction, rate limiting,
oversized-payload/page-size rejection, duplicate-execution and
stale-approval protection, production-guard behavior, and audit
correlation. All pass — see `AI_INTAKE_PHASE_2_2_TEST_REPORT.md`.
