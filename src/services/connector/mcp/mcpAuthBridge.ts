// ============================================================
// Universal AI Intake — Phase 2.2 MCP Auth Bridge
//
// The MCP endpoint is NOT anonymous — every method (including
// `initialize` and `tools/list`) requires a valid connector access
// token (the same self-issued HMAC token from connectorTokenService.ts,
// Phase 2, unchanged). This module is deliberately thin: it verifies
// the token is genuine (signature/expiry/audience/issuer) without
// requiring any specific scope for `initialize`/`tools/list` (those are
// discovery-only, no data is read or written); `tools/call` performs
// its OWN full auth+scope+replay+rate-limit+idempotency check inside
// handleConnectorRequest() (Phase 2, unchanged) — this bridge never
// duplicates that.
//
// Never allows arbitrary user impersonation: the verified token's
// `sub` (connector clientId) is the only identity signal trusted; the
// mapped PharmaPulse admin identity is always resolved server-side via
// `env.resolveAdminMapping(clientId)`, never taken from the request.
// ============================================================

import { verifyConnectorToken } from '../connectorTokenService'
import { ConnectorFailure } from '../connectorTypes'
import type { ConnectorTokenClaims } from '../connectorTokenService'

export interface McpAuthEnv {
  tokenSecret: string
  audience:    string
  issuer:      string
}

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Missing Authorization: Bearer <token> header', retryable: false })
  }
  return authorizationHeader.slice(7)
}

/** Verifies the caller holds a genuine, unexpired connector token —
 *  used for `initialize` and `tools/list`, which need "not anonymous"
 *  but no specific scope (they read no PharmaPulse data). */
export function verifyAnyConnectorIdentity(authorizationHeader: string | undefined, env: McpAuthEnv): ConnectorTokenClaims {
  const bearer = extractBearerToken(authorizationHeader)
  return verifyConnectorToken({ token: bearer, audience: env.audience, issuer: env.issuer, secret: env.tokenSecret })
}
