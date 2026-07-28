// ============================================================
// Universal AI Intake — Phase 2 Connector Auth Tokens
//
// Self-issued, short-lived, HMAC-signed access tokens. Deliberately
// dependency-free (Node's built-in `crypto`, no `jsonwebtoken`
// package) — this repo has no existing JWT dependency and a compact
// hand-rolled format is sufficient for a first-party, server-issued
// token that's never handed to an untrusted third party to construct.
//
// Format: base64url(header) + '~' + base64url(payload) + '~' +
// base64url(HMAC-SHA256(header + '~' + payload, secret))
//
// Uses '~' rather than the JWT-conventional '.' as the segment
// delimiter: a real external client (ChatGPT's GPT Actions "API Key"
// auth field) was observed silently stripping every '.' from a pasted
// 401-char token before it ever reached this connector — 0 dots and a
// different length arrived server-side even though the caller pasted
// the value correctly. '~' is not a common target for autocorrect,
// "smart punctuation," password-manager field heuristics, or
// markdown/URL auto-linking, all of which single out '.'. This is a
// deliberate divergence from JWT's dot convention for exactly that
// reason — this token was never a real JWT (no external JWT verifier
// ever needs to parse it), so nothing depends on the dot separator.
//
// This is the LOCAL/INTERIM auth adapter, not a claim that this is
// production-final — see AI_INTAKE_PHASE_2_AUTHENTICATION.md for the
// documented OAuth2/PKCE upgrade path for a real external ChatGPT MCP
// registration.
// ============================================================

import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import { ConnectorFailure } from './connectorTypes'
import type { ConnectorScope } from './connectorTypes'

export interface ConnectorTokenClaims {
  sub:   string            // connector client id
  scope: ConnectorScope[]
  aud:   string
  iss:   string
  exp:   number             // unix seconds
  iat:   number
  jti:   string             // nonce, replay-checked by the caller
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function sign(headerAndPayload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(headerAndPayload).digest())
}

export interface IssueTokenParams {
  clientId: string
  scopes:   ConnectorScope[]
  audience: string
  issuer:   string
  ttlSeconds: number
  secret:   string
  now?:     number
}

export function issueConnectorToken(params: IssueTokenParams): string {
  const nowSec = params.now ?? Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'PHC1' } // "PharmaHmacConnector v1"
  const claims: ConnectorTokenClaims = {
    sub: params.clientId, scope: params.scopes, aud: params.audience,
    iss: params.issuer, exp: nowSec + params.ttlSeconds, iat: nowSec,
    jti: randomUUID(),
  }
  const headerAndPayload = `${base64url(JSON.stringify(header))}~${base64url(JSON.stringify(claims))}`
  const signature = sign(headerAndPayload, params.secret)
  return `${headerAndPayload}~${signature}`
}

export interface VerifyTokenParams {
  token:       string
  audience:    string
  issuer:      string
  secret:      string
  requiredScopes?: ConnectorScope[]
  now?:        number
}

export function verifyConnectorToken(params: VerifyTokenParams): ConnectorTokenClaims {
  const parts = params.token.split('~')
  if (parts.length !== 3) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Malformed connector token', retryable: false })
  }
  const [headerPart, payloadPart, signaturePart] = parts
  const expectedSig = sign(`${headerPart}~${payloadPart}`, params.secret)

  const a = Buffer.from(signaturePart)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Invalid connector token signature', retryable: false })
  }

  let claims: ConnectorTokenClaims
  try {
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
  } catch {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Malformed connector token payload', retryable: false })
  }

  const nowSec = params.now ?? Math.floor(Date.now() / 1000)
  if (claims.exp < nowSec) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Connector token expired', retryable: false })
  }
  if (claims.aud !== params.audience) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Connector token audience mismatch', retryable: false })
  }
  if (claims.iss !== params.issuer) {
    throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Connector token issuer mismatch', retryable: false })
  }
  if (params.requiredScopes) {
    const missing = params.requiredScopes.filter((s) => !claims.scope.includes(s))
    if (missing.length > 0) {
      throw new ConnectorFailure({
        code: 'INVALID_SCOPE', message: `Missing required scope(s): ${missing.join(', ')}`, retryable: false,
      })
    }
  }

  return claims
}
