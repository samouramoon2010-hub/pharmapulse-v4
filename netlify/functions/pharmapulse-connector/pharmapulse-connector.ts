// ============================================================
// Universal AI Intake — Phase 2 Netlify Function
//
// Thin HTTP adapter only. All real logic lives in
// src/services/connector/connectorHttpHandler.ts (framework-agnostic,
// fully unit-tested). This file's only job: translate Netlify's
// request/response shape to/from ConnectorHttpRequest/Response, and
// wire environment variables + the Admin-SDK-backed repository (via
// netlify/lib/connectorEnvFactory.ts, shared with pharmapulse-mcp.ts
// since Phase 2.2).
//
// Lives in its own subfolder (netlify/functions/pharmapulse-connector/)
// so Netlify's function discovery only treats this one file as a
// deployable function — see AI_INTAKE_PHASE_2_3_DEPLOYMENT.md for why
// (every top-level file directly under netlify/functions/ used to be
// discovered as its own function, including test/helper files, which
// produced an invalid function name and a 422 on deploy).
//
// NOT deployed to production this session — see
// AI_INTAKE_PHASE_2_LIMITATIONS.md.
// ============================================================

import { handleConnectorRequest } from '../../../src/services/connector/connectorHttpHandler'
import { buildProductionHandlerEnv, isConnectorEnabled } from '../../lib/connectorEnvFactory'

// Minimal local types — avoids adding @netlify/functions as a new
// dependency just for its type declarations.
interface NetlifyEvent {
  httpMethod: string
  headers:    Record<string, string | undefined>
  body:       string | null
}
interface NetlifyResponse {
  statusCode: number
  headers:    Record<string, string>
  body:       string
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const jsonHeaders = { 'Content-Type': 'application/json' }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'Only POST is supported' }) }
  }

  // Connector disabled by default — checked again inside
  // executeIntakeSession via assertProductionWriteAllowed(), but every
  // other tool is gated here too so a misconfigured deploy can't even
  // create/read sessions.
  if (!isConnectorEnabled()) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Connector is disabled' }) }
  }

  let parsedBody: any
  try {
    parsedBody = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ code: 'INVALID_PAYLOAD', message: 'Malformed JSON body' }) }
  }

  const { env, repo } = buildProductionHandlerEnv()

  const response = await handleConnectorRequest(
    { authorizationHeader: event.headers.authorization ?? event.headers.Authorization, body: parsedBody },
    env,
    repo,
  )

  return { statusCode: response.status, headers: jsonHeaders, body: JSON.stringify(response.body) }
}
