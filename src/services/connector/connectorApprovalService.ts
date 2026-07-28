// ============================================================
// Universal AI Intake — Phase 2 Approval Tokens
//
// Approval tokens use the same HMAC signing primitive as connector
// access tokens (connectorTokenService.ts) but bind a different,
// narrower claim set: sessionId + previewSignature + approved/
// excluded row-id sets + expiry. Any session mutation after approval
// changes previewSignature (Phase 1's existing stale-preview
// fingerprint — not reinvented here), which invalidates the token
// automatically at verify time. Single-use is enforced via an
// injected ConsumedApprovalStore, checked at execute time.
// ============================================================

import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import { ConnectorFailure } from './connectorTypes'

export interface ApprovalTokenClaims {
  approvalId:       string
  sessionId:        string
  previewSignature: string
  approvedRowIds:   string[]
  excludedRowIds:   string[]
  exp:              number  // unix seconds
  iat:              number
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}
function sign(data: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest())
}

export interface IssueApprovalTokenParams {
  sessionId:        string
  previewSignature: string
  approvedRowIds:   string[]
  excludedRowIds:   string[]
  ttlSeconds:       number
  secret:           string
  now?:             number
}

export interface IssuedApprovalToken {
  approvalId: string
  token:      string
  expiresAt:  string
}

export function issueApprovalToken(params: IssueApprovalTokenParams): IssuedApprovalToken {
  const nowSec = params.now ?? Math.floor(Date.now() / 1000)
  const claims: ApprovalTokenClaims = {
    approvalId: randomUUID(),
    sessionId: params.sessionId,
    previewSignature: params.previewSignature,
    approvedRowIds: params.approvedRowIds,
    excludedRowIds: params.excludedRowIds,
    exp: nowSec + params.ttlSeconds,
    iat: nowSec,
  }
  const payload = base64url(JSON.stringify(claims))
  const signature = sign(payload, params.secret)
  return {
    approvalId: claims.approvalId,
    token: `${payload}.${signature}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  }
}

export interface ConsumedApprovalStore {
  isApprovalConsumed(approvalId: string): Promise<boolean>
  markApprovalConsumed(approvalId: string): Promise<void>
}

export interface VerifyApprovalTokenParams {
  token:            string
  sessionId:        string
  currentPreviewSignature: string
  secret:           string
  now?:             number
}

/** Verifies signature, expiry, session binding, and — critically —
 *  that the session's CURRENT previewSignature still matches the one
 *  the approval was issued against. Does NOT check single-use here;
 *  call `assertApprovalNotConsumed` separately so callers can decide
 *  ordering (e.g. verify before touching the store). */
export function verifyApprovalToken(params: VerifyApprovalTokenParams): ApprovalTokenClaims {
  const parts = params.token.split('.')
  if (parts.length !== 2) {
    throw new ConnectorFailure({ code: 'APPROVAL_REQUIRED', message: 'Malformed approval token', retryable: false, sessionId: params.sessionId })
  }
  const [payloadPart, signaturePart] = parts
  const expectedSig = sign(payloadPart, params.secret)
  const a = Buffer.from(signaturePart)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ConnectorFailure({ code: 'APPROVAL_REQUIRED', message: 'Invalid approval token signature', retryable: false, sessionId: params.sessionId })
  }

  let claims: ApprovalTokenClaims
  try {
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
  } catch {
    throw new ConnectorFailure({ code: 'APPROVAL_REQUIRED', message: 'Malformed approval token payload', retryable: false, sessionId: params.sessionId })
  }

  const nowSec = params.now ?? Math.floor(Date.now() / 1000)
  if (claims.exp < nowSec) {
    throw new ConnectorFailure({ code: 'APPROVAL_EXPIRED', message: 'Approval token has expired', retryable: false, sessionId: params.sessionId })
  }
  if (claims.sessionId !== params.sessionId) {
    throw new ConnectorFailure({ code: 'APPROVAL_REQUIRED', message: 'Approval token does not match this session', retryable: false, sessionId: params.sessionId })
  }
  if (claims.previewSignature !== params.currentPreviewSignature) {
    throw new ConnectorFailure({
      code: 'PREVIEW_STALE',
      message: 'The intake session changed after approval — re-approve against the current preview',
      retryable: false, sessionId: params.sessionId,
    })
  }

  return claims
}

export async function assertApprovalNotConsumed(approvalId: string, store: ConsumedApprovalStore, sessionId: string): Promise<void> {
  const consumed = await store.isApprovalConsumed(approvalId)
  if (consumed) {
    throw new ConnectorFailure({ code: 'APPROVAL_ALREADY_USED', message: 'This approval has already been used to execute an import', retryable: false, sessionId })
  }
}
