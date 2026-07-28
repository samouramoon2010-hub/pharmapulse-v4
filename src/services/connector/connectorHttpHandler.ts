// ============================================================
// Universal AI Intake — Phase 2 Framework-Agnostic Request Handler
//
// Pure function: (ConnectorHttpRequest, environment, repository) ->
// ConnectorHttpResponse. No Netlify/Express/Node-http types here —
// netlify/functions/pharmapulse-connector/pharmapulse-connector.ts is a ~20-line adapter
// that translates the real Netlify `Handler` request/response into
// this shape and back. This is what makes the entire connector
// pipeline testable with vitest without spinning up a server.
//
// Order of checks (deny-by-default at every step):
//   1. verify connector access token (auth)
//   2. replay guard (requestId/timestamp)
//   3. rate limit (per client+admin+tool)
//   4. required scope for the requested tool
//   5. admin mapping (never impersonate an arbitrary user)
//   6. idempotency (session create / approve / execute only)
//   7. dispatch to the tool handler
//   8. audit log (success or failure)
// ============================================================

import { verifyConnectorToken } from './connectorTokenService'
import { assertNotReplayed } from './connectorReplayGuard'
import { assertWithinRateLimit, buildRateLimitBucketKey } from './connectorRateLimitService'
import { assertToolScope, assertAdminMapping, TOOL_REQUIRED_SCOPE } from './connectorScopeService'
import { withIdempotency } from './connectorIdempotencyService'
import { recordConnectorAudit, hashIdempotencyKey } from './connectorAuditService'
import { mapConnectorError } from './connectorErrorMapper'
import { dispatchConnectorTool } from './connectorToolRegistry'
import { ConnectorFailure, CONNECTOR_TOOL_NAMES } from './connectorTypes'
import type { ConnectorIdentity, ConnectorToolName } from './connectorTypes'
import type { ConnectorRepository } from './repositories/connectorRepository'
import type { IntakeServiceEnv } from './connectorIntakeService'

export interface ConnectorHttpRequest {
  authorizationHeader?: string  // "Bearer <token>"
  body: {
    tool:           string
    requestId:      string
    timestamp:      string
    idempotencyKey?: string
    input:          unknown
  }
}

export interface ConnectorHttpResponse {
  status: number
  body:   unknown
}

export interface HandlerEnv extends IntakeServiceEnv {
  tokenSecret: string
  audience:    string
  issuer:      string
  /** Resolves a verified connector clientId to its protected admin
   *  mapping. Never trusts a client-supplied uid. */
  resolveAdminMapping: (clientId: string) => { mappedAdminUid: string; mappedAdminRole: 'admin' } | null
}

const IDEMPOTENT_TOOLS = new Set<ConnectorToolName>([
  'pharmapulse_create_intake_session', 'pharmapulse_approve_intake_session', 'pharmapulse_execute_intake_session',
])

function isValidToolName(name: string): name is ConnectorToolName {
  return (CONNECTOR_TOOL_NAMES as readonly string[]).includes(name)
}

export async function handleConnectorRequest(
  request: ConnectorHttpRequest, env: HandlerEnv, repo: ConnectorRepository,
): Promise<ConnectorHttpResponse> {
  const { tool, requestId, timestamp, idempotencyKey, input } = request.body ?? ({} as any)

  try {
    if (!tool || !requestId || !timestamp) {
      throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: 'tool, requestId, and timestamp are required', retryable: false, requestId })
    }
    if (!isValidToolName(tool)) {
      throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: `Unknown tool "${tool}"`, retryable: false, requestId })
    }

    // 1. Authenticate
    const bearer = request.authorizationHeader?.startsWith('Bearer ') ? request.authorizationHeader.slice(7) : undefined
    if (!bearer) {
      throw new ConnectorFailure({ code: 'UNAUTHENTICATED', message: 'Missing Authorization: Bearer <token> header', retryable: false, requestId })
    }
    const claims = verifyConnectorToken({
      token: bearer, audience: env.audience, issuer: env.issuer, secret: env.tokenSecret,
      requiredScopes: [TOOL_REQUIRED_SCOPE[tool]],
    })

    // 2. Replay
    await assertNotReplayed({ clientId: claims.sub, requestId, timestamp }, repo)

    // 3. Rate limit
    const bucketKey = buildRateLimitBucketKey(claims.sub, claims.sub, tool)
    await assertWithinRateLimit(bucketKey, repo)

    // 4/5. Scope + admin mapping (never impersonate an arbitrary user —
    // the mapping is resolved server-side from the verified clientId,
    // never taken from the request body).
    const mapping = env.resolveAdminMapping(claims.sub)
    if (!mapping) {
      throw new ConnectorFailure({ code: 'UNAUTHORIZED', message: 'Connector client is not mapped to a protected admin', retryable: false, requestId })
    }
    const identity: ConnectorIdentity = { clientId: claims.sub, scopes: claims.scope, ...mapping }
    assertToolScope(identity, tool)
    assertAdminMapping(identity)

    // 6. Idempotency (only for state-mutating tools)
    const ctx = { identity, env, repo }
    let result: unknown
    if (IDEMPOTENT_TOOLS.has(tool)) {
      if (!idempotencyKey) {
        throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: `idempotencyKey is required for tool "${tool}"`, retryable: false, requestId })
      }
      result = await withIdempotency(idempotencyKey, { tool, input }, repo, () => dispatchConnectorTool(tool, input, ctx))
    } else {
      result = await dispatchConnectorTool(tool, input, ctx)
    }

    await recordConnectorAudit(repo, {
      connectorClientId: claims.sub, mappedAdminUid: mapping.mappedAdminUid, tool, requestId,
      timestamp: new Date().toISOString(), outcome: 'SUCCESS',
      sessionId: (result as any)?.sessionId, idempotencyKeyHash: idempotencyKey ? hashIdempotencyKey(idempotencyKey) : undefined,
    })

    return { status: 200, body: result }
  } catch (err) {
    const mapped = mapConnectorError(err, { requestId })
    // Server-side-only diagnostic logging — mapConnectorError() already
    // redacts everything sent back to the client (never a stack trace,
    // credential, or Firestore path in the response body). This log
    // line exists purely so a real failure (e.g. a misconfigured
    // FIREBASE_SERVICE_ACCOUNT_JSON, a Firestore permission error) is
    // diagnosable from Netlify's function logs instead of being a
    // silent, unexplained INTERNAL_ERROR.
    if (mapped.body.code === 'INTERNAL_ERROR') {
      console.error(`[connector] ${tool ?? 'unknown'} failed:`, err instanceof Error ? err.stack ?? err.message : err)
    }
    // Best-effort audit on failure too — never let an audit failure mask the original error.
    try {
      await recordConnectorAudit(repo, {
        connectorClientId: 'unknown', mappedAdminUid: 'unknown', tool: String(tool ?? 'unknown'), requestId: requestId ?? 'unknown',
        timestamp: new Date().toISOString(), outcome: 'FAILURE', errorCode: mapped.body.code,
      })
    } catch { /* never let audit failure mask the real error */ }
    return { status: mapped.status, body: mapped.body }
  }
}
