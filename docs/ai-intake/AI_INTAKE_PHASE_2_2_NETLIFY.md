# Universal AI Intake — Phase 2.2 Netlify Configuration

## Function route

`netlify/functions/pharmapulse-mcp.ts` — Netlify auto-detects any file
in the configured `functions = "netlify/functions"` directory
(`netlify.toml`, unchanged since Phase 2) and exposes it at
`/.netlify/functions/pharmapulse-mcp`. **No `netlify.toml` change was
needed** for Phase 2.2 — the existing `functions` directory
declaration already covers the new file.

## Environment variables — identical set to Phase 2/2.1, no new secrets

The MCP transport reuses every environment variable the HTTP transport
already used (via the new shared `connectorEnvFactory.ts`):
`CONNECTOR_ENABLED`, `CONNECTOR_PRODUCTION_WRITES_ENABLED`,
`CONNECTOR_ENVIRONMENT`, `CONNECTOR_TOKEN_SECRET`,
`CONNECTOR_APPROVAL_SECRET`, `CONNECTOR_AUDIENCE`, `CONNECTOR_ISSUER`,
`CONNECTOR_CLIENT_ADMIN_MAP`, `FIREBASE_SERVICE_ACCOUNT_JSON`. No new
secret name was introduced — see `AI_INTAKE_PHASE_2_1_NETLIFY_CREDENTIALS.md`
for the full existing table, unchanged.

## Request timeout

Not independently configured — inherits Netlify Functions' platform
default execution timeout. No change from Phase 2/2.1.

## Payload size boundary

`pharmapulse-mcp.ts` enforces its own **2 MB** ceiling
(`MAX_BODY_BYTES`) on the raw request body, checked before JSON
parsing — a request over this returns HTTP 413 with a structured
JSON-RPC error, never a silent truncation. This is in addition to (not
a replacement for) the row-count/page-size ceilings enforced inside
`mcpSchemaValidator.ts` (see `AI_INTAKE_PHASE_2_2_SECURITY_LIMITS.md`).
Netlify's own platform-level request size limit still applies as an
outer bound regardless.

## CORS policy

Not enabled. This endpoint is called server-to-server by an MCP client
(ChatGPT's connector infrastructure, or a local verification script),
never from a browser page — there is no `Access-Control-Allow-Origin`
header, and no browser-originated cross-origin call is expected to
succeed against it.

## Allowed methods

Only `POST`. Any other HTTP method (`GET`, `PUT`, `DELETE`, ...)
returns HTTP 405 immediately, before any body parsing or auth check.

## Content-type validation

Requires `Content-Type: application/json` when the header is present
(a request with no `Content-Type` header at all is still accepted and
parsed as JSON, matching common MCP client behavior); any other
declared content type is rejected with HTTP 415.

## Security headers

`X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` are set
on every response — defensive headers appropriate for an API endpoint
that is never meant to be framed or content-sniffed, even though no
browser is expected to reach it directly.

## Logging policy

No change from Phase 2/2.1: no raw token, no service-account JSON, no
credential value is ever logged. Connector audit records
(`connector_audit_logs`, written via `recordConnectorAudit()`, Phase 2,
unchanged) capture only `connectorClientId`, `mappedAdminUid`, `tool`,
`requestId`, `timestamp`, `outcome`, and an `idempotencyKeyHash` (never
the raw key) — identical for MCP-originated and direct-HTTP-originated
tool calls, since both funnel through the same
`handleConnectorRequest()` → `recordConnectorAudit()` path.

## Function bundling / `firebase-admin` externalization

No new bundling configuration was needed. `pharmapulse-mcp.ts` imports
`firebase-admin`-touching modules (`connectorEnvFactory.ts` →
`firestoreConnectorRepository.ts`/`adminFirestoreCommitExecutor.ts`)
exactly the same way `pharmapulse-connector.ts` already did — Netlify's
own Function bundler (esbuild, at actual deploy time) resolves
`firebase-admin` as a real Node dependency for that Function's bundle,
completely separate from Vite's client build. This isolation was
verified this session by grepping `dist/` (the Vite output) for
`firebase-admin` and finding zero occurrences — see
`AI_INTAKE_PHASE_2_2_TEST_REPORT.md`'s "Browser bundle isolation"
section.

## Not deployed this session

Consistent with every prior phase: `netlify.toml` points to this
directory, but no `netlify deploy` was run. No preview deployment was
created either (see the final report's "Deployment" section).
