// ============================================================
// Universal AI Intake — Phase 2.4 GPT Actions REST Adapter
//
// A thin REST adapter for OpenAI Custom GPT "Actions" (which call a
// plain OpenAPI-described HTTP API, not the MCP/JSON-RPC transport).
// Every route below is a direct 1:1 mapping onto the EXACT SAME
// `handleConnectorRequest()` used by pharmapulse-connector.ts and
// pharmapulse-mcp.ts — same auth, same scope checks, same replay
// guard, same rate limiting, same idempotency, same audit trail, same
// production-write guard. No business logic is duplicated here; this
// file only translates REST request/response shapes to/from the
// connector's existing `{tool, requestId, timestamp, idempotencyKey,
// input}` -> `{status, body}` contract.
//
// Phase 2.4 scope (explicitly limited): reference reads + intake
// session preparation only. `approve`/`execute` routes are
// deliberately NOT exposed here yet — see
// AI_INTAKE_PHASE_2_4_ACTIVATION_POLICY.md. Adding them later is a
// routing-table addition only, not a new architecture.
//
// Lives in its own subfolder (netlify/functions/pharmapulse-action/)
// for the same Netlify function-discovery reason as the other two
// functions — see AI_INTAKE_PHASE_2_3_DEPLOYMENT.md.
// ============================================================

import { randomUUID } from 'crypto'
import { handleConnectorRequest } from '../../../src/services/connector/connectorHttpHandler'
import { buildProductionHandlerEnv, isConnectorEnabled } from '../../lib/connectorEnvFactory'
import type { ConnectorToolName } from '../../../src/services/connector/connectorTypes'
import { buildOpenApiSchema } from './openapiSchema'

interface NetlifyEvent {
  httpMethod: string
  path: string
  headers: Record<string, string | undefined>
  body: string | null
  queryStringParameters?: Record<string, string | undefined> | null
}
interface NetlifyResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const MAX_BODY_BYTES = 2 * 1024 * 1024
const FUNCTION_PREFIX = '/.netlify/functions/pharmapulse-action'

interface Route {
  method: 'GET' | 'POST'
  suffix: string
  tool: ConnectorToolName
  /** GET routes read `input` from the query string; POST routes read
   *  it from the JSON body. */
  source: 'query' | 'body'
}

// Phase 2.4 routing table — read + intake-preparation only. Adding
// approve/execute later is exactly one more row each, reusing the
// same tools those MCP/JSON-RPC transports already call.
const ROUTES: Route[] = [
  { method: 'POST', suffix: '/reference-data', tool: 'pharmapulse_get_reference_data', source: 'body' },
  { method: 'POST', suffix: '/intake-sessions', tool: 'pharmapulse_create_intake_session', source: 'body' },
  { method: 'POST', suffix: '/intake-sessions/validate', tool: 'pharmapulse_validate_intake_session', source: 'body' },
  { method: 'POST', suffix: '/intake-sessions/preview', tool: 'pharmapulse_get_intake_preview', source: 'body' },
  { method: 'GET', suffix: '/intake-sessions/status', tool: 'pharmapulse_get_intake_status', source: 'query' },
]

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }

  const subPath = event.path.startsWith(FUNCTION_PREFIX) ? (event.path.slice(FUNCTION_PREFIX.length) || '/') : event.path

  // Serve the OpenAPI schema — lets ChatGPT's "Import from URL" fetch
  // it directly instead of the operator pasting it by hand. The
  // server URL is derived from the incoming request's own host, so it
  // never goes stale across redeploys (draft deploy URLs change every
  // time) without needing a manually-updated env var.
  if (event.httpMethod === 'GET' && (subPath === '/openapi.json' || subPath === '/')) {
    const host = event.headers['x-forwarded-host'] ?? event.headers.host
    const proto = event.headers['x-forwarded-proto'] ?? 'https'
    const baseUrl = host ? `${proto}://${host}${FUNCTION_PREFIX}` : undefined
    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify(buildOpenApiSchema(baseUrl)) }
  }

  if (!isConnectorEnabled()) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Connector is disabled' }) }
  }

  const route = ROUTES.find((r) => r.method === event.httpMethod && r.suffix === subPath)
  if (!route) {
    return { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ code: 'INVALID_PAYLOAD', message: `No such action route: ${event.httpMethod} ${subPath}` }) }
  }

  const rawBody = event.body ?? ''
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: jsonHeaders, body: JSON.stringify({ code: 'INVALID_PAYLOAD', message: `Request body exceeds the maximum allowed size (${MAX_BODY_BYTES} bytes)` }) }
  }

  let input: Record<string, unknown>
  if (route.source === 'query') {
    input = { ...(event.queryStringParameters ?? {}) }
  } else {
    try {
      input = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'Malformed JSON body' }) }
    }
  }

  const { env, repo } = buildProductionHandlerEnv()

  // Diagnostic only — never logs the header's actual content, only
  // its shape (length, delimiter count, whether it starts with
  // "Bearer "). Added because ChatGPT's GPT Actions "API Key" auth
  // field was observed stripping every '.' from a pasted token before
  // it reached here — confirmed via this same log (0 dots, wrong
  // length arrived server-side even though the value was pasted
  // correctly). The token format was changed from '.' to '~' as the
  // segment delimiter specifically to avoid whatever client-side
  // mangling singled out '.' (autocorrect / smart punctuation /
  // password-manager field heuristics) — see connectorTokenService.ts.
  const authHeader = event.headers.authorization ?? event.headers.Authorization
  console.log('[action-auth-diagnostic]', JSON.stringify({
    present: !!authHeader,
    length: authHeader?.length ?? 0,
    startsWithBearer: authHeader?.startsWith('Bearer ') ?? false,
    tildeCountAfterBearerStrip: authHeader?.startsWith('Bearer ') ? (authHeader.slice(7).match(/~/g) ?? []).length : null,
  }))

  const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined
  const response = await handleConnectorRequest(
    {
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization,
      body: {
        tool: route.tool,
        requestId: `action:${randomUUID()}`,
        timestamp: new Date().toISOString(),
        idempotencyKey,
        input,
      },
    },
    env,
    repo,
  )

  return { statusCode: response.status, headers: jsonHeaders, body: JSON.stringify(response.body) }
}
