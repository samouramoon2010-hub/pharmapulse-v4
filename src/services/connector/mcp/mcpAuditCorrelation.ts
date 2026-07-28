// ============================================================
// Universal AI Intake — Phase 2.2 Audit Correlation
//
// Builds the connector-level `requestId` used by the existing replay
// guard / audit trail (connectorAuditService.ts, unchanged) from an
// incoming MCP call, so one request can be traced end-to-end:
//   MCP call (jsonrpc id) -> connector requestId -> session -> audit record
//
// Deliberately does NOT reuse the raw JSON-RPC `id` as the connector
// requestId 1:1 — JSON-RPC ids are scoped per client exchange and are
// commonly small sequential integers (1, 2, 3...) that different
// tool calls, or even different MCP sessions, may reuse. Feeding that
// directly into the replay guard (which requires every requestId to be
// globally unique, ever) would cause spurious replay rejections on the
// SECOND tool call a client ever makes. Instead each connector
// requestId embeds the MCP id + tool name (for human traceability in
// audit logs) plus a random suffix (for the uniqueness the replay
// guard actually needs).
// ============================================================

import { randomUUID } from 'crypto'
import type { JsonRpcId } from './mcpTypes'

export interface McpCorrelationIds {
  mcpRequestId:       string
  connectorRequestId: string
}

export function buildCorrelationIds(mcpId: JsonRpcId, toolName: string): McpCorrelationIds {
  const mcpRequestId = mcpId === null || mcpId === undefined ? randomUUID() : String(mcpId)
  const connectorRequestId = `mcp:${mcpRequestId}:${toolName}:${randomUUID()}`
  return { mcpRequestId, connectorRequestId }
}
