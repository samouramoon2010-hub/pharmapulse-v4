# Universal AI Intake — Phase 2.2 MCP Protocol Support

## Transport: Streamable HTTP (single request/response, no SSE)

Each MCP call is one HTTP POST to `/.netlify/functions/pharmapulse-mcp`
carrying one JSON-RPC 2.0 request body; the response is one JSON body.
This is the "single-exchange" subset of MCP's Streamable HTTP
transport — it does **not** implement the optional Server-Sent Events
(SSE) streaming variant of Streamable HTTP (multiple server-to-client
messages over one long-lived connection), because Netlify Functions
are not long-lived processes — each invocation runs, returns, and
terminates. This server never claims to support server-initiated
notifications or streaming tool-call progress; every `tools/call`
response is a single, complete JSON-RPC result.

stdio was explicitly rejected as the production transport (per the
spec's own instruction) — it requires a persistent local process
attached to the client's stdin/stdout, which has no equivalent on a
stateless serverless Function. `scripts/mcpVerify.demo.test.ts` is the
repo's local-testing-only stand-in: it calls `handleMcpRequest()`
directly in-process (no stdio, no HTTP), proving the protocol handler
itself works correctly without needing either transport wired up for
local iteration.

## Protocol version

`MCP_PROTOCOL_VERSION = '2025-06-18'` (`mcpTypes.ts`). The server
always responds with this exact version regardless of what the client
requests in `initialize` — this is a intentionally simple
single-version server (no version negotiation matrix), matching the
spec's ask for "protocol-version validation" in its minimal form:
`initialize` requires `params.protocolVersion` to be present and
non-empty (a genuinely missing/malformed value is rejected as
`INVALID_PARAMS`), and the server's response always states the one
version it actually implements.

## Methods implemented

| Method | Auth required | Behavior |
|---|---|---|
| `initialize` | any valid connector token (no specific scope) | Returns `protocolVersion`, `capabilities: {tools: {listChanged: false}}`, `serverInfo` |
| `tools/list` | any valid connector token | Returns all 8 tool descriptors with real JSON Schema + `_meta` |
| `tools/call` | full connector auth/scope/replay/rate-limit/idempotency (delegated to `handleConnectorRequest()`) | Dispatches to the named tool, returns a tool-call result |
| `notifications/initialized` | none (fire-and-forget, no response body) | Accepted, HTTP 202, empty body — per JSON-RPC 2.0's notification semantics |
| anything else | — | `METHOD_NOT_FOUND` (-32601) |

## Server capabilities

```json
{ "tools": { "listChanged": false } }
```

No `resources`, `prompts`, `logging`, `sampling`, or `completions`
capability is advertised — this server is tool-only, and its 8-tool
set is fixed (no dynamic tool registration, hence `listChanged: false`).

## Two distinct error surfaces (critical design decision)

**JSON-RPC protocol errors** (`error` field, no `result`) — reserved
for genuinely malformed requests that never reach business logic:
malformed JSON (`-32700`), missing/wrong `jsonrpc`/`method`
(`-32600`), unknown method (`-32601`), missing `params.name` or an
unknown tool name in `tools/call` (`-32602`), and `initialize`/
`tools/list` authentication failures (`-32001`/`-32002`, an
implementation-defined range per JSON-RPC 2.0's reserved `-32000` to
`-32099` block).

**Tool-call results** (`result.isError: true`, never a JSON-RPC
`error`) — every business/connector failure that occurs *during* a
named, schema-valid tool call: `UNAUTHENTICATED`, `UNAUTHORIZED`,
`INVALID_SCOPE`, `SESSION_NOT_FOUND`, `PREVIEW_STALE`,
`APPROVAL_ALREADY_USED`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`, and
schema-validation failures for a *known* tool with bad arguments. This
choice is deliberate and spec-driven ("map existing connector errors
into MCP-compliant tool errors," implying the tool-result path, not
protocol-error path) — it lets an MCP client (an LLM) see the failure
text and decide how to respond (retry, ask the user, adjust
arguments), rather than treating every failure as an opaque transport
fault.

## Unsupported-method handling

Anything outside the 4 methods above (e.g. `resources/list`,
`prompts/get`, `completion/complete`) returns `METHOD_NOT_FOUND`
immediately — no partial handling, no silent no-op.

## Request correlation IDs

Every `tools/call` gets a connector-level `requestId` built by
`mcpAuditCorrelation.ts`'s `buildCorrelationIds()`:
`mcp:<jsonRpcId>:<toolName>:<randomUuid>` — embeds the caller's
JSON-RPC id and the tool name for human traceability in audit logs,
while the random suffix guarantees the uniqueness Phase 2's replay
guard actually requires (JSON-RPC ids are commonly small, client-reused
sequential integers, so reusing them directly as the connector
`requestId` would cause false replay rejections on a client's very
second tool call — see the module's own doc comment for the full
reasoning).
