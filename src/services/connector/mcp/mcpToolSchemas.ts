// ============================================================
// Universal AI Intake — Phase 2.2 MCP Tool JSON Schemas
//
// Real, discoverable JSON Schema for each of the 8 existing connector
// tools, built directly from connectorTypes.ts's input/output
// interfaces (field-for-field, no new business rules). This is
// LAYER 1 validation ("MCP tool input schema") — layer 2 remains
// Phase 1's existing adapter/entity validation, unchanged, reached via
// dispatchConnectorTool() -> connectorIntakeService.ts.
//
// Request-limit ceilings (Step "Request limits") are enforced by
// mcpSchemaValidator.ts using the `maxItems`/custom bounds declared
// here, not by silently truncating anything.
// ============================================================

import type { JsonSchemaObject, McpToolDescriptor } from './mcpTypes'
import { MCP_TOOL_MANIFEST } from '../connectorToolRegistry'

// Request-limit ceilings — see AI_INTAKE_PHASE_2_2_SECURITY_LIMITS.md
export const MCP_LIMITS = {
  MAX_ROWS_PER_CREATE:      2000,
  MAX_PREVIEW_PAGE_SIZE:    500,
  MAX_REFERENCE_RESULT_SIZE: 200,
} as const

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    clientRowId:        { type: 'string' },
    sourceRowNumber:    { type: 'number' },
    rawValues:          { type: 'object' },
    normalizedValues:   { type: 'object' },
    entityType:         { type: 'string' },
    confidence:         { type: 'number' },
    extractionWarnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['clientRowId', 'rawValues'],
} as const

const INPUT_SCHEMAS: Record<string, JsonSchemaObject> = {
  pharmapulse_create_intake_session: {
    type: 'object',
    properties: {
      entityType:     { type: 'string' },
      sourceType:     { type: 'string' },
      sourceName:     { type: 'string' },
      rows:           { type: 'array', items: ROW_SCHEMA, maxItems: MCP_LIMITS.MAX_ROWS_PER_CREATE },
      metadata:       { type: 'object' },
      idempotencyKey: { type: 'string' },
    },
    required: ['entityType', 'sourceType', 'rows', 'idempotencyKey'],
    additionalProperties: false,
  } as any,
  pharmapulse_validate_intake_session: {
    type: 'object',
    properties: { sessionId: { type: 'string' } },
    required: ['sessionId'],
    additionalProperties: false,
  },
  pharmapulse_get_intake_preview: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      filter:    { type: 'string' },
      limit:     { type: 'number', maximum: MCP_LIMITS.MAX_PREVIEW_PAGE_SIZE },
      offset:    { type: 'number' },
    },
    required: ['sessionId'],
    additionalProperties: false,
  } as any,
  pharmapulse_approve_intake_session: {
    type: 'object',
    properties: {
      sessionId:        { type: 'string' },
      previewSignature: { type: 'string' },
      approvalPhrase:   { type: 'string' },
      selectedRowIds:   { type: 'array', items: { type: 'string' } },
      excludedRowIds:   { type: 'array', items: { type: 'string' } },
      idempotencyKey:   { type: 'string' },
    },
    required: ['sessionId', 'previewSignature', 'idempotencyKey'],
    additionalProperties: false,
  },
  pharmapulse_execute_intake_session: {
    type: 'object',
    properties: {
      sessionId:      { type: 'string' },
      approvalToken:  { type: 'string' },
      idempotencyKey: { type: 'string' },
    },
    required: ['sessionId', 'approvalToken', 'idempotencyKey'],
    additionalProperties: false,
  },
  pharmapulse_get_intake_status: {
    type: 'object',
    properties: { sessionId: { type: 'string' } },
    required: ['sessionId'],
    additionalProperties: false,
  },
  pharmapulse_cancel_intake_session: {
    type: 'object',
    properties: { sessionId: { type: 'string' }, reason: { type: 'string' } },
    required: ['sessionId', 'reason'],
    additionalProperties: false,
  },
  pharmapulse_get_reference_data: {
    type: 'object',
    properties: {
      referenceType: { type: 'string' },
      exactCode:     { type: 'string' },
      searchText:    { type: 'string' },
      limit:         { type: 'number', maximum: MCP_LIMITS.MAX_REFERENCE_RESULT_SIZE },
    },
    required: ['referenceType'],
    additionalProperties: false,
  } as any,
}

const OUTPUT_SCHEMAS: Record<string, JsonSchemaObject> = {
  pharmapulse_create_intake_session: { type: 'object', properties: {
    sessionId: { type: 'string' }, status: { type: 'string' }, detectedEntityType: { type: 'string' },
    acceptedRowCount: { type: 'number' }, rejectedRowCount: { type: 'number' },
    validationSummary: { type: 'object' }, nextAction: { type: 'string' },
  } },
  pharmapulse_validate_intake_session: { type: 'object', properties: {
    status: { type: 'string' }, validationSummary: { type: 'object' }, rowClassifications: { type: 'array' },
    duplicateSummary: { type: 'object' }, unresolvedReferences: { type: 'array' }, previewSignature: { type: 'string' },
  } },
  pharmapulse_get_intake_preview: { type: 'object', properties: {
    createCount: { type: 'number' }, updateCount: { type: 'number' }, skipCount: { type: 'number' },
    conflictCount: { type: 'number' }, invalidCount: { type: 'number' }, warningCount: { type: 'number' },
    rows: { type: 'array' }, executionEligible: { type: 'boolean' }, previewSignature: { type: 'string' },
  } as any },
  pharmapulse_approve_intake_session: { type: 'object', properties: {
    approvalId: { type: 'string' }, approvalToken: { type: 'string' }, approvedRowCount: { type: 'number' },
    excludedRowCount: { type: 'number' }, expiresAt: { type: 'string' }, status: { type: 'string' },
  } },
  pharmapulse_execute_intake_session: { type: 'object', properties: {
    executionId: { type: 'string' }, status: { type: 'string' }, created: { type: 'number' }, updated: { type: 'number' },
    skipped: { type: 'number' }, failed: { type: 'number' }, failureDetails: { type: 'array' }, auditReference: { type: 'string' },
  } },
  pharmapulse_get_intake_status: { type: 'object', properties: {
    lifecycleStatus: { type: 'string' }, validationState: { type: 'string' }, approvalState: { type: 'string' },
    executionState: { type: 'string' }, counts: { type: 'object' }, timestamps: { type: 'object' },
  } },
  pharmapulse_cancel_intake_session: { type: 'object', properties: { status: { type: 'string' } } },
  pharmapulse_get_reference_data: { type: 'object', properties: {
    referenceType: { type: 'string' }, records: { type: 'array' },
  } },
}

/** Builds the full MCP tools/list payload directly from the existing
 *  connector tool manifest (connectorToolRegistry.ts) — no duplicate
 *  source of truth for scope/confirmation/idempotency/entity-type
 *  metadata, only the JSON Schema shape is new (MCP-specific). */
export function buildMcpToolDescriptors(): McpToolDescriptor[] {
  return MCP_TOOL_MANIFEST.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: INPUT_SCHEMAS[tool.name],
    outputSchema: OUTPUT_SCHEMAS[tool.name],
    _meta: {
      requiredScope: tool.requiredScope,
      destructive: tool.destructive,
      requiresConfirmation: tool.requiresConfirmation,
      requiresIdempotencyKey: tool.requiresIdempotencyKey,
      supportedEntityTypes: tool.supportedEntityTypes,
    },
  }))
}

export function getInputSchema(toolName: string): JsonSchemaObject | undefined {
  return INPUT_SCHEMAS[toolName]
}
