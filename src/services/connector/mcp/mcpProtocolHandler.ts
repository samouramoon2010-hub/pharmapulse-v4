// ============================================================
// Universal AI Intake — Phase 2.2 MCP Protocol Handler
//
// Pure function: (rawJsonRpcBody, headers, env, repo) -> HTTP-shaped
// {status, body}. No Netlify/Express/Node-http types — same
// framework-agnostic convention as connectorHttpHandler.ts (Phase 2),
// which this module wraps rather than replaces. This is the ONLY new
// business-logic-adjacent code in Phase 2.2: it speaks JSON-RPC/MCP on
// the outside, and calls the EXISTING handleConnectorRequest() for
// every actual tool invocation — no parallel connector implementation.
//
// Supported methods: initialize, tools/list, tools/call,
// notifications/initialized (fire-and-forget). Everything else is
// METHOD_NOT_FOUND. This server exposes no `resources`, no `prompts`,
// no filesystem/HTTP-proxy/arbitrary-Firestore capability — tool-only,
// see AI_INTAKE_PHASE_2_2_PROTOCOL.md.
// ============================================================

import { handleConnectorRequest } from '../connectorHttpHandler'
import type { HandlerEnv, ConnectorHttpRequest } from '../connectorHttpHandler'
import type { ConnectorRepository } from '../repositories/connectorRepository'
import { CONNECTOR_TOOL_NAMES } from '../connectorTypes'
import type { ConnectorToolName, ConnectorError } from '../connectorTypes'
import { mapConnectorError } from '../connectorErrorMapper'
import { verifyAnyConnectorIdentity } from './mcpAuthBridge'
import { buildMcpToolDescriptors } from './mcpToolSchemas'
import { validateToolArguments } from './mcpSchemaValidator'
import { buildCorrelationIds } from './mcpAuditCorrelation'
import {
  protocolError, methodNotFoundError, invalidRequestError, invalidParamsError, parseError,
  toolCallSuccessResult, toolCallErrorResult, toolCallSchemaErrorResult,
} from './mcpErrorAdapter'
import {
  MCP_PROTOCOL_VERSION, JSON_RPC_ERROR_CODES,
} from './mcpTypes'
import type {
  JsonRpcRequest, JsonRpcResponse, JsonRpcId,
  McpInitializeParams, McpInitializeResult, McpToolsListResult, McpToolCallParams,
} from './mcpTypes'

export interface McpHttpResponse {
  status: number
  /** null only for a fire-and-forget notification, which per JSON-RPC
   *  2.0 must not receive a response body at all. */
  body:   JsonRpcResponse | null
}

function isKnownToolName(name: string): name is ConnectorToolName {
  return (CONNECTOR_TOOL_NAMES as readonly string[]).includes(name)
}

export async function handleMcpRequest(
  rawBody: unknown,
  headers: { authorization?: string },
  env: HandlerEnv,
  repo: ConnectorRepository,
): Promise<McpHttpResponse> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { status: 400, body: parseError() }
  }

  const req = rawBody as Partial<JsonRpcRequest>
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string' || !req.method) {
    return { status: 400, body: invalidRequestError((req.id as JsonRpcId) ?? null, 'Request must be a JSON-RPC 2.0 object with a string "method"') }
  }

  // Notifications (no `id`) never receive a response body.
  if (req.id === undefined) {
    if (req.method === 'notifications/initialized') {
      return { status: 202, body: null }
    }
    return { status: 400, body: invalidRequestError(null, `Method "${req.method}" requires a request id — it is not a supported notification`) }
  }
  const id = req.id as JsonRpcId

  switch (req.method) {
    case 'initialize': {
      const identityErr = checkAnyIdentity(id, headers.authorization, env)
      if (identityErr) return identityErr

      const params = req.params as Partial<McpInitializeParams> | undefined
      if (!params || typeof params.protocolVersion !== 'string' || !params.protocolVersion) {
        return { status: 400, body: invalidParamsError(id, 'params.protocolVersion (string) is required') }
      }

      const result: McpInitializeResult = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'pharmapulse-connector', version: '2.2.0' },
      }
      return { status: 200, body: { jsonrpc: '2.0', id, result } }
    }

    case 'tools/list': {
      const identityErr = checkAnyIdentity(id, headers.authorization, env)
      if (identityErr) return identityErr

      const result: McpToolsListResult = { tools: buildMcpToolDescriptors() }
      return { status: 200, body: { jsonrpc: '2.0', id, result } }
    }

    case 'tools/call': {
      const params = req.params as Partial<McpToolCallParams> | undefined
      if (!params || typeof params.name !== 'string' || !params.name) {
        return { status: 400, body: invalidParamsError(id, 'params.name (tool name) is required') }
      }
      if (!isKnownToolName(params.name)) {
        return { status: 400, body: invalidParamsError(id, `Unknown tool "${params.name}"`) }
      }

      const args = params.arguments ?? {}
      const schemaCheck = validateToolArguments(params.name, args)
      if (!schemaCheck.valid) {
        return { status: 200, body: { jsonrpc: '2.0', id, result: toolCallSchemaErrorResult(params.name, schemaCheck.errors) } }
      }

      const { connectorRequestId } = buildCorrelationIds(id, params.name)
      const chReq: ConnectorHttpRequest = {
        authorizationHeader: headers.authorization,
        body: {
          tool: params.name,
          requestId: connectorRequestId,
          timestamp: new Date().toISOString(),
          idempotencyKey: typeof args.idempotencyKey === 'string' ? args.idempotencyKey : undefined,
          input: args,
        },
      }

      const chRes = await handleConnectorRequest(chReq, env, repo)
      const result = chRes.status === 200
        ? toolCallSuccessResult(chRes.body)
        : toolCallErrorResult(chRes.body as ConnectorError)

      return { status: 200, body: { jsonrpc: '2.0', id, result } }
    }

    default:
      return { status: 400, body: methodNotFoundError(id, req.method) }
  }
}

function checkAnyIdentity(id: JsonRpcId, authorizationHeader: string | undefined, env: HandlerEnv): McpHttpResponse | null {
  try {
    verifyAnyConnectorIdentity(authorizationHeader, env)
    return null
  } catch (err) {
    const mapped = mapConnectorError(err)
    const code = mapped.body.code === 'UNAUTHORIZED' ? JSON_RPC_ERROR_CODES.UNAUTHORIZED : JSON_RPC_ERROR_CODES.UNAUTHENTICATED
    return { status: mapped.status, body: protocolError(id, code, mapped.body.message) }
  }
}
