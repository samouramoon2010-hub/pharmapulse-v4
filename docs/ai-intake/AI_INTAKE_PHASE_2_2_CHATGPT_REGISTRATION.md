# Universal AI Intake — Phase 2.2 ChatGPT Registration Readiness

**This document is preparation only. ChatGPT is NOT connected to
PharmaPulse as of this session — see the final report's "Real ChatGPT
connection status" section, stated explicitly as not connected.**

## What exists today

- A framework-agnostic MCP protocol handler (`mcpProtocolHandler.ts`)
  proven by 26 focused tests + an 18-item external verification
  checklist, all run in-process against an isolated in-memory
  repository.
- A Netlify Function (`pharmapulse-mcp.ts`) that would expose this at
  `/.netlify/functions/pharmapulse-mcp` — **not deployed** this
  session.
- Full request/response framing for `initialize`, `tools/list`,
  `tools/call`.

## What does NOT exist yet — genuine external steps required

1. **An actual `netlify deploy`** — the function code exists in the
   repository but has never been pushed to a live Netlify site this
   session (or, per the git history, at all).
2. **Production credentials provisioned** — no `FIREBASE_SERVICE_ACCOUNT_JSON`,
   no `CONNECTOR_TOKEN_SECRET`/`CONNECTOR_APPROVAL_SECRET`, no
   `CONNECTOR_CLIENT_ADMIN_MAP` have been set in any real Netlify
   environment. Every one of these is required before the endpoint
   would do anything besides return 403 "Connector is disabled."
3. **A real MCP client registration inside ChatGPT** — ChatGPT's
   connector/MCP registration flow (owner-performed, outside this
   repository's control) needs the deployed endpoint URL and an
   authentication mechanism it can actually use (see
   `AI_INTAKE_PHASE_2_2_AUTH.md`'s OAuth 2.0 discussion — the current
   HMAC token model is not something ChatGPT's connector UI can drive
   interactively; a real registration will very likely require the
   OAuth integration point documented there, not implemented this
   phase).
4. **A connector client id + admin mapping decision by the owner** —
   who inside PharmaPulse's admin roster does a ChatGPT-driven import
   act as? This is a real access-control decision only the product
   owner can make, encoded into `CONNECTOR_CLIENT_ADMIN_MAP`.

## Endpoint URL pattern (once deployed)

```
https://<your-netlify-site>.netlify.app/.netlify/functions/pharmapulse-mcp
```

(Or the equivalent path under a custom domain, if one is configured
for the Netlify site.)

## Authentication type

Interim: `Authorization: Bearer <HMAC connector token>` (see
`AI_INTAKE_PHASE_2_2_AUTH.md`). Production-target: OAuth 2.0, not yet
implemented.

## Required scopes for a typical ChatGPT read+import session

`intake:create`, `intake:read`, `intake:validate`, `intake:approve`,
`intake:execute`, `intake:cancel`, `reference:read` — the full set, if
ChatGPT is meant to eventually drive the whole lifecycle. Per the
Activation Policy (`AI_INTAKE_PHASE_2_2_ACTIVATION_POLICY.md`),
`intake:execute` should be withheld from the token initially even
though the tool itself supports it end-to-end.

## Tool list

The 8 tools documented in `AI_INTAKE_PHASE_2_2_TOOL_REGISTRY.md`.

## Security expectations for the owner performing registration

- Never paste `FIREBASE_SERVICE_ACCOUNT_JSON`, `CONNECTOR_TOKEN_SECRET`,
  or `CONNECTOR_APPROVAL_SECRET` into ChatGPT's connector configuration
  UI, documentation, or any chat transcript — these are server-side
  secrets the MCP endpoint never expects a client to know.
- The Bearer token ChatGPT's connector session presents should be a
  connector *access* token (short-lived, scoped) — never a raw copy of
  `CONNECTOR_TOKEN_SECRET` itself.
- Confirm `CONNECTOR_ENVIRONMENT` is set to the intended value before
  ChatGPT's first real call — a misconfigured environment name fails
  closed (production guard blocks writes) rather than silently
  defaulting to production.

## Environment configuration checklist

See `AI_INTAKE_PHASE_2_2_NETLIFY.md`'s environment variable table —
identical variables for both transports.

## Owner/admin mapping

`CONNECTOR_CLIENT_ADMIN_MAP='{"<chatgpt-client-id>":"<real-admin-uid>"}'`
— the owner must decide, and configure, exactly which existing
PharmaPulse admin account a ChatGPT-driven session acts as.

## Connector enable flag / production-write flag

`CONNECTOR_ENABLED=true` is required for ANY tool to respond.
`CONNECTOR_PRODUCTION_WRITES_ENABLED=true` is additionally required
for `execute` specifically — see the Activation Policy for why these
should be enabled in stages, not both at once on day one.

## Test procedure (before declaring ChatGPT genuinely connected)

1. Deploy the function to a preview or production Netlify environment
   with `CONNECTOR_ENABLED=true` but `CONNECTOR_PRODUCTION_WRITES_ENABLED`
   left **unset**.
2. Register the MCP endpoint in ChatGPT's connector configuration with
   a scoped token that has only `reference:read`, `intake:create`,
   `intake:read`, `intake:validate` (no `approve`/`execute`/`cancel`).
3. From an actual ChatGPT session, call (in order):
   `pharmapulse_get_reference_data`, `pharmapulse_create_intake_session`,
   `pharmapulse_get_intake_preview`. Confirm each returns a real,
   correctly-shaped result and that the created session appears in the
   Firestore `import_jobs` collection with the connector's own
   `intakeSourceType` (e.g. `chatgpt_structured`).
4. Only after step 3 succeeds and is reviewed, proceed to the
   Activation Policy's staged enablement of `approve`/`execute`.

## Rollback procedure

1. Set `CONNECTOR_ENABLED=false` in the Netlify environment
   (immediately blocks every tool, no redeploy needed — the flag is
   read at request time).
2. If a specific connector client/token is suspected compromised,
   remove its entry from `CONNECTOR_CLIENT_ADMIN_MAP` and rotate
   `CONNECTOR_TOKEN_SECRET`/`CONNECTOR_APPROVAL_SECRET` (invalidates
   every previously-issued token immediately, including legitimate
   ones — reissue a new token to `resolveAdminMapping`'s mapped
   client(s) afterward).
3. Any Firestore writes already made via `execute` are NOT
   auto-reverted (no rollback tooling exists for committed connector
   imports, same limitation as the browser Data Exchange Studio path)
   — manual data correction via the existing admin UI is the only
   remedy, exactly as for any other bulk import mistake.
