// ============================================================
// Universal AI Intake — intake session model (Phase 1)
//
// An "intake session" IS an ImportJob (see importJobTypes.ts's
// additive intake* fields) — there is no parallel Firestore
// collection. This module holds the intake-specific derived helpers
// only: building the additive fields when a session starts, and
// mapping the existing RowClassification onto the spec's requested
// `proposedAction` vocabulary for display purposes.
// ============================================================

import type { ImportJob, RowClassification } from './importJobTypes'

// Phase 1 (browser upload) uses the format-based vocabulary; Phase 2
// (connector) uses an origin+format vocabulary (connectorTypes.ts's
// ConnectorSourceType) — both are valid values for the same
// ImportJob.intakeSourceType field, so this type accepts either.
export type IntakeSourceType =
  | 'EXCEL' | 'CSV' | 'TEXT' | 'PDF' | 'IMAGE'
  | 'chatgpt_structured' | 'excel_extracted' | 'csv_extracted' | 'pdf_extracted' | 'image_extracted' | 'plain_text_extracted'
export type ProposedAction = 'create' | 'update' | 'skip' | 'conflict' | 'invalid'

export interface IntakeSourceMeta {
  sourceType:           IntakeSourceType
  sourceFileName?:      string
  sourceMimeType?:      string
  selectedSheet?:       string
  detectionConfidence?: number
  schemaVersion?:       string
  parserVersion?:       string
}

export const INTAKE_SCHEMA_VERSION = '1.0.0'
export const INTAKE_PARSER_VERSION = '1.0.0'

/** Merge intake-session metadata onto a freshly-created ImportJob.
 *  Additive only — never assigns `undefined` (Firestore rejects it). */
export function withIntakeMeta(job: ImportJob, meta: IntakeSourceMeta): ImportJob {
  return {
    ...job,
    intakeSourceType: meta.sourceType,
    ...(meta.sourceFileName !== undefined ? { intakeSourceFileName: meta.sourceFileName } : {}),
    ...(meta.sourceMimeType !== undefined ? { intakeSourceMimeType: meta.sourceMimeType } : {}),
    ...(meta.selectedSheet !== undefined ? { intakeSelectedSheet: meta.selectedSheet } : {}),
    ...(meta.detectionConfidence !== undefined ? { intakeDetectionConfidence: meta.detectionConfidence } : {}),
    intakeSchemaVersion: meta.schemaVersion ?? INTAKE_SCHEMA_VERSION,
    intakeParserVersion: meta.parserVersion ?? INTAKE_PARSER_VERSION,
  }
}

/** Stamp the approval timestamp — called once, right when the user
 *  clicks Approve (or types APPROVE IMPORT for large imports), before
 *  execute() ever runs. */
export function withApproval(job: ImportJob, approvedAtIso: string): ImportJob {
  return { ...job, approvedAt: approvedAtIso }
}

/** Stamp the execution timestamp — called once execute() completes
 *  (success or partial failure alike; failure is reflected in the
 *  job's own status, not by omitting this field). */
export function withExecution(job: ImportJob, executedAtIso: string): ImportJob {
  return { ...job, executedAt: executedAtIso }
}

const ACTION_BY_CLASSIFICATION: Record<RowClassification, ProposedAction> = {
  VALID:     'create',
  UPDATE:    'update',
  SKIP:      'skip',
  DUPLICATE: 'skip',
  CONFLICT:  'conflict',
  ERROR:     'invalid',
  WARNING:   'create',
}

/** Maps the engine's existing RowClassification onto the spec's
 *  requested proposedAction vocabulary — display-only, never stored
 *  as a separate field (the classification remains the single source
 *  of truth the commit engine reads). */
export function toProposedAction(classification: RowClassification): ProposedAction {
  return ACTION_BY_CLASSIFICATION[classification]
}
