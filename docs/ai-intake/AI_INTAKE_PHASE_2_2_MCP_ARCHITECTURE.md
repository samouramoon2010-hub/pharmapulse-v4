# Universal AI Intake — Phase 2.2 MCP Architecture

## Objective

Expose the existing 8 connector tools (Phase 2 foundation, Phase 2.1
Admin SDK execution) through a real MCP (Model Context Protocol)
endpoint, so an external MCP client (eventually a real ChatGPT
connector session) can discover and call them, without rebuilding the
connector or duplicating any business logic.

## Layering — one new thin layer above everything that already exists

```
MCP client (ChatGPT, local verification client, ...)
        │  JSON-RPC 2.0 over HTTP
        ▼
netlify/functions/pharmapulse-mcp.ts        (thin Netlify adapter — NEW)
        │
        ▼
src/services/connector/mcp/mcpProtocolHandler.ts   (JSON-RPC/MCP framing — NEW)
        │  builds a ConnectorHttpRequest, calls the EXISTING handler
        ▼
src/services/connector/connectorHttpHandler.ts     (Phase 2, UNCHANGED)
        │  auth → replay → rate-limit → scope → idempotency → dispatch → audit
        ▼
src/services/connector/connectorToolRegistry.ts + connectorIntakeService.ts  (Phase 2/2.1, UNCHANGED)
        │
        ▼
buildCommitPlan() → AdminFirestoreCommitExecutor   (Phase 2.1, UNCHANGED)
```

Every box below `mcpProtocolHandler.ts` is completely unmodified by
Phase 2.2 (aside from the Phase 2.2 side-effect parity fix documented
in the test report, which lives in `buildCommitPlan.ts`/
`adminFirestoreCommitExecutor.ts` and is orthogonal to the MCP work
itself). The MCP layer's `tools/call` handler does exactly one thing
with business consequence: it builds a `ConnectorHttpRequest` from the
JSON-RPC `params` and calls `handleConnectorRequest()` — the same
function the existing HTTP tool-call transport
(`pharmapulse-connector.ts`) already calls. There is no second
connector implementation anywhere in this phase.

## New modules (Phase 2.2)

All under `src/services/connector/mcp/` (pure, framework-agnostic, zero
firebase-admin/firebase-firestore import — safe for the Vite client
build, though nothing here is ever imported from `src/pages/` or
`src/components/`):

| Module | Responsibility |
|---|---|
| `mcpTypes.ts` | JSON-RPC 2.0 envelope types + the MCP subset this server implements (initialize/tools-list/tools-call) |
| `mcpToolSchemas.ts` | Builds real JSON Schema `tools/list` descriptors directly from the existing `connectorToolRegistry.ts` manifest — one source of truth for scope/confirmation/idempotency/entity-type metadata |
| `mcpSchemaValidator.ts` | Layer-1 (MCP schema) structural validation + request-limit ceilings — never re-implements Layer-2 (Phase 1 adapter) business validation |
| `mcpErrorAdapter.ts` | Maps connector errors into MCP-compliant tool-call results vs. genuine JSON-RPC protocol errors |
| `mcpAuditCorrelation.ts` | Builds a unique, traceable connector `requestId` from each MCP call without colliding with JSON-RPC id reuse |
| `mcpAuthBridge.ts` | Verifies "any valid connector identity" for `initialize`/`tools/list` (no anonymous access), reusing `connectorTokenService.ts` unchanged |
| `mcpProtocolHandler.ts` | The core dispatcher: `handleMcpRequest(rawBody, headers, env, repo)` — pure function, fully unit-tested |

Plus one shared Netlify-only module, `netlify/functions/connectorEnvFactory.ts`
(extracted from the pre-existing `pharmapulse-connector.ts` in this
phase), so both transports (`pharmapulse-connector.ts` for direct
HTTP tool calls, `pharmapulse-mcp.ts` for MCP) build the *identical*
`HandlerEnv` from the same environment variables — one source of truth,
zero duplicated env-wiring logic between the two Netlify Functions.

## No new npm dependency

The MCP JSON-RPC envelope and protocol subset are hand-rolled types +
a dispatcher function — no `@modelcontextprotocol/sdk` or similar
package was added. This mirrors the existing repo convention
established in Phase 2 (`connectorTokenService.ts`'s hand-rolled HMAC
tokens instead of `jsonwebtoken`): the protocol surface this server
actually needs (3 methods, no resources/prompts/sampling) is small
enough that a dependency-free implementation is both simpler to audit
and has zero new supply-chain surface.

## What is explicitly NOT exposed

Per the spec's restriction list, this server exposes tool-calling only:

- no `resources/list` / `resources/read`
- no `prompts/list` / `prompts/get`
- no arbitrary filesystem access
- no arbitrary HTTP proxying
- no arbitrary Firestore query capability (every write still goes
  through `buildCommitPlan()`'s closed collection allowlist — see
  `AI_INTAKE_PHASE_2_1_COMMIT_PLAN.md`)

Any MCP method other than `initialize`, `tools/list`, `tools/call`, and
the `notifications/initialized` fire-and-forget notification returns a
JSON-RPC `METHOD_NOT_FOUND` (-32601) error.
