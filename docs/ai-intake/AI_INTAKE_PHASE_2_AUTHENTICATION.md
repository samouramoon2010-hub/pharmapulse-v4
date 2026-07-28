# Universal AI Intake — Phase 2 Authentication

## Current model: self-issued HMAC access tokens (interim/local adapter)

`src/services/connector/connectorTokenService.ts` issues a compact,
dependency-free signed token (base64url header + payload + HMAC-SHA256
signature over Node's built-in `crypto`) with claims:

```
sub (connector client id), scope[], aud, iss, exp, iat, jti
```

Verification checks signature (constant-time compare via
`timingSafeEqual`), expiry, audience, issuer, and required scopes.
Explicitly **not** a JWT library dependency — this repo has no
existing JWT tooling, and a hand-rolled HMAC token is sufficient for a
first-party, server-issued token that is never constructed by an
untrusted party.

## Why this is the interim model, not the final production design

The spec's preferred production model is OAuth 2.0 authorization-code
flow with PKCE, "if the repo and deployment environment make this
realistic." As of this phase, no ChatGPT MCP registration exists yet
to test against, and standing up a full OAuth authorization server
(consent screen, code exchange, refresh tokens) is a separate,
larger infrastructure investment than this foundation phase's scope.

**Production upgrade path (documented, not built this phase):**
1. Register the connector as an OAuth client with whatever MCP
   registration flow ChatGPT ultimately requires.
2. Replace `connectorTokenService.issueConnectorToken()`'s call site
   with the OAuth provider's token issuance — `verifyConnectorToken()`'s
   *shape* (claims: sub/scope/aud/iss/exp) is designed to be
   compatible with standard JWT claims, so the verification logic
   would need minimal change (swap HMAC verify for the OAuth
   provider's public-key/JWKS verify).
2. Retire the local `CONNECTOR_TOKEN_SECRET` env var once the OAuth
   flow is live.

## Local development

`CONNECTOR_TOKEN_SECRET` / `CONNECTOR_APPROVAL_SECRET` are read from
environment variables, **disabled by default** (the connector as a
whole is gated behind `CONNECTOR_ENABLED`, checked before any token is
even parsed). These must never be logged (confirmed:
`connectorAuditService.ts`'s `redact()` strips `token`, and no log
statement anywhere in the connector code path prints a raw token) and
must never be committed (`.env.example` documents names only).

## Approval tokens (separate secret, separate purpose)

`connectorApprovalService.ts` uses the same HMAC primitive but a
*different* secret (`CONNECTOR_APPROVAL_SECRET`) and a narrower claim
set bound to `sessionId` + `previewSignature` + approved/excluded row
sets + expiry — see `AI_INTAKE_PHASE_2_APPROVAL_MODEL.md`.
