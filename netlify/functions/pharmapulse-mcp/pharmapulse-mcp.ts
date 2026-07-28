// ============================================================
// Universal AI Intake — Phase 2.2 MCP Netlify Function
//
// Thin HTTP adapter for the MCP (Model Context Protocol) transport.
// All real protocol logic lives in
// src/services/connector/mcp/mcpProtocolHandler.ts (framework-agnostic,
// fully unit-tested) — this file's only job is to translate Netlify's
// request/response shape to/from the MCP handler's shape, enforce
// transport-level limits (payload size, HTTP method, content-type),
// and wire the SAME environment/repository/commit-executor factory
// pharmapulse-connector.ts uses (netlify/lib/connectorEnvFactory.ts) —
// no duplicated business logic and no parallel connector implementation.
//
// Lives in its own subfolder (netlify/functions/pharmapulse-mcp/) so
// Netlify's function discovery only treats this one file as a
// deployable function — see AI_INTAKE_PHASE_2_3_DEPLOYMENT.md.
//
// Transport: Streamable HTTP (a single JSON-RPC request per HTTP POST,
// JSON response body) — see AI_INTAKE_PHASE_2_2_PROTOCOL.md for why
// this repo does not implement the full SSE/streaming variant of the
// MCP Streamable HTTP transport (Netlify Functions are not
// long-lived processes) and why stdio is documented as a local-testing-
// only fallback, never the production transport.
//
// NOT deployed to production this session — see
// AI_INTAKE_PHASE_2_LIMITATIONS.md.
// ============================================================

import { handleMcpRequest } from '../../../src/services/connector/mcp/mcpProtocolHandler'
import { buildProductionHandlerEnv, isConnectorEnabled } from '../../lib/connectorEnvFactory'

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

// Request-limit ceiling (Netlify Functions themselves also enforce a
// hard platform limit; this is PharmaPulse's own, tighter, documented
// ceiling — see AI_INTAKE_PHASE_2_2_SECURITY_LIMITS.md).
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2 MB

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    // Defensive headers — this endpoint is never meant to be framed
    // or content-sniffed by a browser; it is called only by MCP
    // clients over server-to-server HTTP.
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Only POST is supported' } }) }
  }

  const contentType = event.headers['content-type'] ?? event.headers['Content-Type']
  if (contentType && !contentType.includes('application/json')) {
    return { statusCode: 415, headers: jsonHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Content-Type must be application/json' } }) }
  }

  const rawBody = event.body ?? ''
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: jsonHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Request body exceeds the maximum allowed size (${MAX_BODY_BYTES} bytes)` } }) }
  }

  // Connector disabled by default — same top-level kill switch the
  // HTTP transport uses. A misconfigured deploy cannot even complete
  // an `initialize` handshake while this is unset.
  if (!isConnectorEnabled()) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Connector is disabled' } }) }
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody || '{}')
  } catch {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON was received by the server' } }) }
  }

  const { env, repo } = buildProductionHandlerEnv()

  const response = await handleMcpRequest(
    parsedBody,
    { authorization: event.headers.authorization ?? event.headers.Authorization },
    env,
    repo,
  )

  // A JSON-RPC notification (e.g. notifications/initialized) has no
  // response body at all — return an empty 202 exactly once, never a
  // JSON body, per the JSON-RPC 2.0 spec.
  if (response.body === null) {
    return { statusCode: response.status, headers: jsonHeaders, body: '' }
  }

  return { statusCode: response.status, headers: jsonHeaders, body: JSON.stringify(response.body) }
}
