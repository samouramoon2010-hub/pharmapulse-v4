// ============================================================
// Universal AI Intake — Phase 2.2 MCP Error Adapter
//
// Two distinct error surfaces, per the MCP spec:
//  - JSON-RPC protocol errors (malformed request, unknown method,
//    unknown tool name, structurally-invalid arguments) -> the
//    top-level `error` field of the JSON-RPC response.
//  - Tool-call business errors (SESSION_NOT_FOUND, PREVIEW_STALE,
//    RATE_LIMITED, ...) -> ALWAYS a successful JSON-RPC `result` with
//    `isError: true`, so an LLM client can read and reason about the
//    failure. Never leaks a stack trace, credential, or Firestore path
//    — reuses connectorErrorMapper.ts's existing redaction guarantee.
// ============================================================

import { JSON_RPC_ERROR_CODES } from './mcpTypes'
import type { JsonRpcErrorObject, JsonRpcId, JsonRpcErrorResponse, McpToolCallResult } from './mcpTypes'
import type { ConnectorError } from '../connectorTypes'
import type { McpValidationError } from './mcpSchemaValidator'

export function protocolError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  const error: JsonRpcErrorObject = { code, message, ...(data !== undefined ? { data } : {}) }
  return { jsonrpc: '2.0', id, error }
}

export function methodNotFoundError(id: JsonRpcId, method: string): JsonRpcErrorResponse {
  return protocolError(id, JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: "${method}"`)
}

export function invalidRequestError(id: JsonRpcId, message: string): JsonRpcErrorResponse {
  return protocolError(id, JSON_RPC_ERROR_CODES.INVALID_REQUEST, message)
}

export function invalidParamsError(id: JsonRpcId, message: string, data?: unknown): JsonRpcErrorResponse {
  return protocolError(id, JSON_RPC_ERROR_CODES.INVALID_PARAMS, message, data)
}

export function parseError(): JsonRpcErrorResponse {
  return protocolError(null, JSON_RPC_ERROR_CODES.PARSE_ERROR, 'Invalid JSON was received by the server')
}

/** Business/connector-level failure -> a tool result the MCP client
 *  (an LLM) can see and reason about, never a JSON-RPC protocol error.
 *  `body` is the already-redacted ConnectorError from
 *  connectorErrorMapper.ts (no stack trace, no credential, no raw
 *  Firestore path — guaranteed by mapConnectorError()). */
export function toolCallErrorResult(body: ConnectorError): McpToolCallResult {
  return {
    content: [{ type: 'text', text: `Error [${body.code}]: ${body.message}` }],
    structuredContent: body,
    isError: true,
  }
}

export function toolCallSuccessResult(result: unknown): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: false,
  }
}

/** Layer-1 (MCP schema) validation failures — surfaced as a tool
 *  result, not a protocol error, so the pattern is consistent with
 *  Layer-2 (domain) validation failures the caller already sees this
 *  way (VALIDATION_FAILED). Uses the same INVALID_PAYLOAD code the
 *  rest of the connector uses for malformed input. */
export function toolCallSchemaErrorResult(toolName: string, errors: McpValidationError[]): McpToolCallResult {
  const body: ConnectorError = {
    code: 'INVALID_PAYLOAD',
    message: `Arguments for tool "${toolName}" failed schema validation: ${errors.map((e) => e.message).join('; ')}`,
    retryable: false,
    fieldErrors: errors,
    timestamp: new Date().toISOString(),
  }
  return toolCallErrorResult(body)
}
