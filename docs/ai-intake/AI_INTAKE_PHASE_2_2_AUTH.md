# Universal AI Intake — Phase 2.2 MCP Authentication and Authorization

## Not anonymous — every method requires a valid connector token

`mcpAuthBridge.ts`'s `verifyAnyConnectorIdentity()` is called for
`initialize` and `tools/list` (both are discovery-only, read no
PharmaPulse data, so no *specific* scope is required — but the caller
still must present a genuine, unexpired, correctly-signed connector
access token, or the call is rejected with a JSON-RPC protocol error
before any response body is returned).

`tools/call` performs its own **full** auth check inside the
pre-existing `handleConnectorRequest()` — token signature/expiry/
audience/issuer, replay guard, rate limit, the specific scope that
named tool requires, and admin-mapping resolution — nothing in the MCP
layer bypasses or duplicates any of this.

## Token model — same interim adapter as Phase 2, not re-designed here

The self-issued HMAC token (`connectorTokenService.ts`, unchanged) is
still the only implemented authentication mechanism. Phase 2.2's
instructions explicitly permit keeping this "signed-token bridge for
isolated testing" while documenting the production direction
separately, rather than building a full OAuth 2.0 authorization server
inside this repository (a large, separate piece of infrastructure —
see `AI_INTAKE_PHASE_2_AUTHENTICATION.md` for the same conclusion
reached in Phase 2 and not revisited here).

### Documented production direction: OAuth 2.0

A real external ChatGPT MCP connector registration is expected to
require:

- OAuth 2.0 authorization code flow (or a comparable delegated-auth
  flow ChatGPT's connector platform requires at registration time)
- short-lived access tokens issued by an actual authorization server
  (not this repo's HMAC token issuer)
- scoped authorization mapped 1:1 onto the existing `ConnectorScope`
  union (`intake:create`, `intake:read`, `intake:validate`,
  `intake:approve`, `intake:execute`, `intake:cancel`,
  `reference:read`) — no new scope vocabulary needed, just a different
  issuer
- token revocation support (an OAuth authorization server's token
  endpoint typically provides this natively; the current HMAC tokens
  have no revocation list — they simply expire, which is a real
  limitation for a case like "immediately cut off a compromised
  ChatGPT connector session")

**This is a clearly separated production integration point, not
implemented in this repository this phase.** `mcpAuthBridge.ts` is
deliberately thin and isolated specifically so that swapping
`verifyConnectorToken()` for a real OAuth token-introspection call
later is a contained change — the rest of the MCP layer
(`mcpProtocolHandler.ts`, `mcpToolSchemas.ts`, etc.) has no dependency
on the token format itself, only on the verified `ConnectorTokenClaims`
shape (`sub`, `scope`).

## Identity mapping — no impersonation, ever

The verified token's `sub` (connector client id) is the only identity
signal ever trusted from the request. The actual PharmaPulse admin
identity a call executes as is always resolved server-side via
`env.resolveAdminMapping(clientId)` — a static, env-configured
`CONNECTOR_CLIENT_ADMIN_MAP` lookup (Phase 2, unchanged). No tool
input field, no MCP `_meta`, no client-supplied `uid` anywhere in any
tool's arguments is ever used to determine which admin identity a call
executes as. Proven structurally (no such field exists in any input
schema) and by test (`connectorHttpHandler.test.ts`'s existing
"rejects a connector client with no admin mapping").

## Environment mapping

Auth state maps cleanly onto the existing environment-separation model
(see `AI_INTAKE_PHASE_2_2_NETLIFY.md`): `CONNECTOR_TOKEN_SECRET`,
`CONNECTOR_AUDIENCE`, `CONNECTOR_ISSUER` are per-environment secrets:
a token minted for the `local`/`test` audience/issuer pair will not
verify against a `production` environment's different secret —
there is no cross-environment token reuse possible.
