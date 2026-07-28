// ============================================================
// Universal AI Intake — Phase 2 Connector Foundation
//
// Shared types for the secure ChatGPT/MCP connector layer. Pure
// types only — no firebase-admin, no Node-only APIs — safe to import
// from anywhere, including (if ever needed) the client bundle.
// ============================================================

import type { ImportDomain, ValidationSummary } from '../dataExchange/importJobTypes'

// ── Scopes ──────────────────────────────────────────────────────

export const CONNECTOR_SCOPES = [
  'intake:create',
  'intake:read',
  'intake:validate',
  'intake:approve',
  'intake:execute',
  'intake:cancel',
  'reference:read',
] as const

export type ConnectorScope = typeof CONNECTOR_SCOPES[number]

// ── Error contract ───────────────────────────────────────────────

export const CONNECTOR_ERROR_CODES = [
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'INVALID_SCOPE',
  'INVALID_PAYLOAD',
  'UNSUPPORTED_ENTITY',
  'SESSION_NOT_FOUND',
  'SESSION_STATE_CONFLICT',
  'PREVIEW_STALE',
  'APPROVAL_REQUIRED',
  'APPROVAL_EXPIRED',
  'APPROVAL_ALREADY_USED',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'EXECUTION_PARTIAL',
  'INTERNAL_ERROR',
] as const

export type ConnectorErrorCode = typeof CONNECTOR_ERROR_CODES[number]

export interface ConnectorFieldError {
  field:   string
  message: string
}

export interface ConnectorError {
  code:       ConnectorErrorCode
  message:    string
  retryable:  boolean
  fieldErrors?: ConnectorFieldError[]
  sessionId?: string
  requestId?: string
  timestamp:  string
}

export class ConnectorFailure extends Error {
  readonly error: ConnectorError
  constructor(error: Omit<ConnectorError, 'timestamp'>) {
    super(error.message)
    this.error = { ...error, timestamp: new Date().toISOString() }
  }
}

// ── Connector identity ────────────────────────────────────────────

export interface ConnectorIdentity {
  clientId:    string
  scopes:      ConnectorScope[]
  /** The Firestore admin uid this connector identity is mapped to —
   *  never an arbitrary/impersonated user. */
  mappedAdminUid: string
  mappedAdminRole: 'admin'
}

// ── Tool I/O contracts ────────────────────────────────────────────

export type ConnectorSourceType =
  | 'chatgpt_structured' | 'excel_extracted' | 'csv_extracted'
  | 'pdf_extracted' | 'image_extracted' | 'plain_text_extracted'

export interface ConnectorRawRow {
  clientRowId:        string
  sourceRowNumber?:   number
  rawValues:          Record<string, unknown>
  normalizedValues?:  Record<string, unknown>
  entityType?:        ImportDomain
  confidence?:        number
  extractionWarnings?: string[]
}

export interface CreateIntakeSessionInput {
  entityType:      ImportDomain
  sourceType:      ConnectorSourceType
  sourceName?:      string
  rows:            ConnectorRawRow[]
  metadata?:        Record<string, unknown>
  idempotencyKey:  string
}

export interface CreateIntakeSessionOutput {
  sessionId:            string
  status:               string
  detectedEntityType:   ImportDomain
  acceptedRowCount:     number
  rejectedRowCount:     number
  validationSummary:    ValidationSummary
  nextAction:           string
}

export interface ValidateIntakeSessionInput { sessionId: string }
export interface ValidateIntakeSessionOutput {
  status:            string
  validationSummary: ValidationSummary
  rowClassifications: Array<{ clientRowId: string; classification: string }>
  duplicateSummary:  { inFile: number; againstRepository: number }
  unresolvedReferences: string[]
  previewSignature:  string
}

export interface GetIntakePreviewInput {
  sessionId:  string
  filter?:    string
  limit?:     number
  offset?:    number
}
export interface GetIntakePreviewRow {
  clientRowId:      string
  proposedAction:   string
  normalizedValues: Record<string, unknown>
  warnings:         string[]
  errors:           string[]
}
export interface GetIntakePreviewOutput {
  createCount:   number
  updateCount:   number
  skipCount:     number
  conflictCount: number
  invalidCount:  number
  warningCount:  number
  rows:          GetIntakePreviewRow[]
  executionEligible: boolean
  previewSignature: string
}

export interface ApproveIntakeSessionInput {
  sessionId:         string
  previewSignature:  string
  approvalPhrase?:   string
  selectedRowIds?:   string[]
  excludedRowIds?:   string[]
  idempotencyKey:    string
}
export interface ApproveIntakeSessionOutput {
  approvalId:        string
  approvalToken:     string
  approvedRowCount:  number
  excludedRowCount:  number
  expiresAt:         string
  status:            string
}

export interface ExecuteIntakeSessionInput {
  sessionId:      string
  approvalToken:  string
  idempotencyKey: string
}
export interface ExecuteIntakeSessionOutput {
  executionId:      string
  status:           string
  created:          number
  updated:          number
  skipped:          number
  failed:           number
  failureDetails:   Array<{ clientRowId: string; reason: string }>
  auditReference:   string
}

export interface GetIntakeStatusInput { sessionId: string }
export interface GetIntakeStatusOutput {
  lifecycleStatus:  string
  validationState:  string | null
  approvalState:    string | null
  executionState:   string | null
  counts:           Record<string, number>
  timestamps:       Record<string, string | undefined>
  failureReason?:   string
}

export interface CancelIntakeSessionInput { sessionId: string; reason: string }
export interface CancelIntakeSessionOutput { status: string }

export type ReferenceType =
  | 'regions' | 'groups' | 'pharmacies' | 'users' | 'kpi_definitions'
  | 'roles' | 'scopes' | 'periods'

export interface GetReferenceDataInput {
  referenceType:  ReferenceType
  exactCode?:     string
  searchText?:    string
  limit?:         number
}
export interface GetReferenceDataOutput {
  referenceType: ReferenceType
  records:       Array<Record<string, unknown>>
}

// ── Tool name union ────────────────────────────────────────────

export const CONNECTOR_TOOL_NAMES = [
  'pharmapulse_create_intake_session',
  'pharmapulse_validate_intake_session',
  'pharmapulse_get_intake_preview',
  'pharmapulse_approve_intake_session',
  'pharmapulse_execute_intake_session',
  'pharmapulse_get_intake_status',
  'pharmapulse_cancel_intake_session',
  'pharmapulse_get_reference_data',
] as const

export type ConnectorToolName = typeof CONNECTOR_TOOL_NAMES[number]
