// ============================================================
// Universal AI Intake — Phase 2 MCP Tool Manifest + Dispatch
//
// MCP-ready tool definitions (name, description, schema stubs,
// required scope, destructive flag) for all 8 tools, plus the
// dispatch table connectorHttpHandler.ts uses to route a parsed
// request to its handler. All tools are destructive:false — none
// can delete a record; execution can only create/update rows already
// shown in a preview the caller approved.
// ============================================================

import {
  createIntakeSession, validateIntakeSession, getIntakePreview, approveIntakeSession,
  executeIntakeSession, getIntakeStatus, cancelIntakeSession, getReferenceData,
} from './connectorIntakeService'
import type { IntakeServiceEnv } from './connectorIntakeService'
import { TOOL_REQUIRED_SCOPE } from './connectorScopeService'
import type { ConnectorIdentity, ConnectorToolName } from './connectorTypes'
import type { ConnectorRepository } from './repositories/connectorRepository'

export interface McpToolDefinition {
  name:                     ConnectorToolName
  description:              string
  inputSchemaSummary:       string
  outputSchemaSummary:      string
  requiredScope:             string
  destructive:               false
  requiresConfirmation:      boolean
  requiresIdempotencyKey:    boolean
  supportedEntityTypes:      string[]
}

const SUPPORTED_ENTITIES = [
  'REGION', 'GROUP', 'BRANCH', 'PHARMACIST', 'ASSIGNMENT',
  'KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET', 'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS',
]

export const MCP_TOOL_MANIFEST: McpToolDefinition[] = [
  {
    name: 'pharmapulse_create_intake_session',
    description: 'Create a remote intake session from structured rows already extracted by the caller (not raw binary files).',
    inputSchemaSummary: 'entityType, sourceType, sourceName?, rows[], metadata?, idempotencyKey',
    outputSchemaSummary: 'sessionId, status, detectedEntityType, acceptedRowCount, rejectedRowCount, validationSummary, nextAction',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_create_intake_session,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: true,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_validate_intake_session',
    description: 'Re-check the current validation state of an intake session.',
    inputSchemaSummary: 'sessionId',
    outputSchemaSummary: 'status, validationSummary, rowClassifications[], duplicateSummary, unresolvedReferences[], previewSignature',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_validate_intake_session,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: false,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_get_intake_preview',
    description: 'Retrieve the filterable, paginated row-level preview for an intake session.',
    inputSchemaSummary: 'sessionId, filter?, limit?, offset?',
    outputSchemaSummary: 'createCount, updateCount, skipCount, conflictCount, invalidCount, warningCount, rows[], executionEligible, previewSignature',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_get_intake_preview,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: false,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_approve_intake_session',
    description: 'Explicitly approve a subset of rows for execution. Issues a short-lived, single-use, preview-bound approval token. Never writes data itself.',
    inputSchemaSummary: 'sessionId, previewSignature, approvalPhrase?, selectedRowIds?, excludedRowIds?, idempotencyKey',
    outputSchemaSummary: 'approvalId, approvalToken, approvedRowCount, excludedRowCount, expiresAt, status',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_approve_intake_session,
    destructive: false, requiresConfirmation: true, requiresIdempotencyKey: true,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_execute_intake_session',
    description: 'Execute a previously approved intake session. Controlled, non-destructive import — can only create/update rows already shown in the approved preview; cannot delete anything.',
    inputSchemaSummary: 'sessionId, approvalToken, idempotencyKey',
    outputSchemaSummary: 'executionId, status, created, updated, skipped, failed, failureDetails[], auditReference',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_execute_intake_session,
    destructive: false, requiresConfirmation: true, requiresIdempotencyKey: true,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_get_intake_status',
    description: 'Read the current lifecycle/validation/approval/execution state of a session.',
    inputSchemaSummary: 'sessionId',
    outputSchemaSummary: 'lifecycleStatus, validationState, approvalState, executionState, counts, timestamps, failureReason?',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_get_intake_status,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: false,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_cancel_intake_session',
    description: 'Cancel a session before it has been executed.',
    inputSchemaSummary: 'sessionId, reason',
    outputSchemaSummary: 'status',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_cancel_intake_session,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: false,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
  {
    name: 'pharmapulse_get_reference_data',
    description: 'Resolve existing regions/groups/pharmacies/users/KPI definitions before submitting rows. Returns minimized, non-sensitive fields only.',
    inputSchemaSummary: 'referenceType, exactCode?, searchText?, limit?',
    outputSchemaSummary: 'referenceType, records[]',
    requiredScope: TOOL_REQUIRED_SCOPE.pharmapulse_get_reference_data,
    destructive: false, requiresConfirmation: false, requiresIdempotencyKey: false,
    supportedEntityTypes: SUPPORTED_ENTITIES,
  },
]

export interface DispatchContext {
  identity: ConnectorIdentity
  env:      IntakeServiceEnv
  repo:     ConnectorRepository
}

/** Dispatches a tool call by name. Scope/replay/rate-limit/idempotency
 *  checks happen in connectorHttpHandler.ts BEFORE this is called —
 *  this function assumes the caller is already authorized. */
export async function dispatchConnectorTool(
  tool: ConnectorToolName, input: unknown, ctx: DispatchContext,
): Promise<unknown> {
  switch (tool) {
    case 'pharmapulse_create_intake_session':
      return createIntakeSession(input as any, ctx.identity, ctx.env, ctx.repo)
    case 'pharmapulse_validate_intake_session':
      return validateIntakeSession(input as any, ctx.repo)
    case 'pharmapulse_get_intake_preview':
      return getIntakePreview(input as any, ctx.repo)
    case 'pharmapulse_approve_intake_session':
      return approveIntakeSession(input as any, ctx.env, ctx.repo)
    case 'pharmapulse_execute_intake_session':
      return executeIntakeSession(input as any, ctx.identity, ctx.env, ctx.repo)
    case 'pharmapulse_get_intake_status':
      return getIntakeStatus(input as any, ctx.repo)
    case 'pharmapulse_cancel_intake_session':
      return cancelIntakeSession(input as any, ctx.repo)
    case 'pharmapulse_get_reference_data':
      return getReferenceData(input as any, ctx.repo)
    default: {
      const _exhaustive: never = tool
      throw new Error(`Unhandled tool: ${_exhaustive}`)
    }
  }
}
