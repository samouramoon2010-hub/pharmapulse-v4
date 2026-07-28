// ============================================================
// Universal AI Intake — Phase 2.2 MCP Protocol Types
//
// Pure types for the JSON-RPC 2.0 envelope and the subset of the
// Model Context Protocol this server implements (initialize,
// tools/list, tools/call). No firebase-admin, no Node-only APIs —
// safe to import from anywhere.
// ============================================================

export const MCP_PROTOCOL_VERSION = '2025-06-18'

// ── JSON-RPC 2.0 envelope ──────────────────────────────────────

export type JsonRpcId = string | number | null

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?:     JsonRpcId
  method:  string
  params?: unknown
}

export interface JsonRpcErrorObject {
  code:    number
  message: string
  data?:   unknown
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0'
  id:      JsonRpcId
  result:  unknown
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  id:      JsonRpcId
  error:   JsonRpcErrorObject
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

// Standard JSON-RPC 2.0 error codes (protocol-level only — a failed
// TOOL CALL is never reported this way, see McpToolCallResult below).
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR:      -32700,
  INVALID_REQUEST:  -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS:   -32602,
  INTERNAL_ERROR:   -32603,
  // Implementation-defined server errors (JSON-RPC 2.0 reserves
  // -32000 to -32099 for this) — used ONLY for `initialize`/`tools/list`
  // auth failures, since there is no "tool result" to carry the error
  // for those two methods. `tools/call` NEVER uses these — auth/scope
  // failures during a tool call are always a tool result with
  // `isError: true` instead, see mcpErrorAdapter.ts.
  UNAUTHENTICATED:  -32001,
  UNAUTHORIZED:     -32002,
} as const

// ── MCP initialize ──────────────────────────────────────────────

export interface McpInitializeParams {
  protocolVersion: string
  capabilities?:   Record<string, unknown>
  clientInfo?:     { name: string; version: string }
}

export interface McpServerCapabilities {
  tools: { listChanged: boolean }
  // Deliberately no `resources`, `prompts`, or `logging` capability —
  // this server is tool-only (see AI_INTAKE_PHASE_2_2_PROTOCOL.md).
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities:    McpServerCapabilities
  serverInfo:      { name: string; version: string }
}

// ── MCP tools/list ──────────────────────────────────────────────

export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface McpToolDescriptor {
  name:         string
  description:  string
  inputSchema:  JsonSchemaObject
  outputSchema?: JsonSchemaObject
  /** Non-standard but widely-supported passthrough field for
   *  connector-specific metadata a caller may want to inspect
   *  (required scope, confirmation/idempotency behavior, supported
   *  entity types, destructive classification). Never used by the
   *  protocol handler itself for authorization decisions — those are
   *  always enforced server-side regardless of what a client reads
   *  here. */
  _meta: {
    requiredScope:          string
    destructive:            false
    requiresConfirmation:   boolean
    requiresIdempotencyKey: boolean
    supportedEntityTypes:   string[]
  }
}

export interface McpToolsListResult {
  tools: McpToolDescriptor[]
}

// ── MCP tools/call ──────────────────────────────────────────────

export interface McpToolCallParams {
  name:      string
  arguments?: Record<string, unknown>
}

export interface McpContentBlock {
  type: 'text'
  text: string
}

/** Tool-level outcomes (including business errors like
 *  SESSION_NOT_FOUND, PREVIEW_STALE, RATE_LIMITED, ...) are ALWAYS
 *  returned inside a JSON-RPC `result` — never as a JSON-RPC `error`.
 *  This lets an MCP client (an LLM) see and reason about the failure
 *  text rather than treating it as an opaque transport fault.
 *  JSON-RPC `error` is reserved for genuine protocol-level problems:
 *  malformed request, unknown method, unknown tool name, schema-invalid
 *  arguments before any business logic runs. */
export interface McpToolCallResult {
  content:           McpContentBlock[]
  structuredContent?: unknown
  isError?:          boolean
}
