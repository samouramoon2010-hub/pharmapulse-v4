// ============================================================
// Evaluation Ledger — Core Types (Phase 5A)
//
// TypeScript-only data model for the immutable evaluation ledger.
// A ledger entry is the permanent record of one evaluation run —
// produced by feeding a PUBLISHED Profile Studio profile's actuals
// through the existing simulateProfile() kernel.
//
// No Firestore. No React. No executable logic. No engine coupling.
// ============================================================

import type { ProfileSimTrace } from '../profileStudio/simulationTrace'

// ── Entity model ────────────────────────────────────────────────

/** The kind of organisational entity an evaluation run scores. */
export type EvaluationEntityType = 'pharmacist' | 'branch' | 'district' | 'region'

// ── Ledger entry ──────────────────────────────────────────────

/**
 * One immutable record of a published profile being evaluated
 * against a single entity for a single period.
 *
 * Append-only: once written, a ledger entry is never updated or
 * deleted. Re-running an evaluation for the same entity/period
 * produces a new entry with a new evaluationId — it never
 * overwrites the prior one.
 */
export interface EvaluationLedgerEntry {
  evaluationId:   string
  entityId:       string
  entityType:     EvaluationEntityType
  profileId:      string
  profileVersion: string
  /** Period the evaluation covers, e.g. '2026-06'. */
  periodId:       string
  /** Overall 0–100 profile score, as produced by simulateProfile(). */
  score:          number
  /** Basket id → basket score. */
  basketScores:   Record<string, number>
  /** Element id → element score. */
  elementScores:  Record<string, number>
  /** Rule id → rule score. */
  ruleScores:     Record<string, number>
  /** Full calculation trace, reused verbatim from the simulator kernel. */
  trace:          ProfileSimTrace
  /** ISO timestamp of when this entry was recorded. */
  timestamp:      string
  metadata:       Record<string, unknown>
}

/** Input used by evaluationLedgerFactory to build a new entry. */
export interface CreateLedgerEntryInput {
  entityId:       string
  entityType:     EvaluationEntityType
  profileId:      string
  profileVersion: string
  periodId:       string
  score:          number
  basketScores:   Record<string, number>
  elementScores:  Record<string, number>
  ruleScores:     Record<string, number>
  trace:          ProfileSimTrace
  metadata?:      Record<string, unknown>
}

// ── Validation result shape ─────────────────────────────────────

export interface LedgerValidationIssue {
  code:     string
  field?:   string
  message:  string
  severity: 'error' | 'warning'
}

export interface LedgerValidationResult {
  valid:  boolean
  issues: LedgerValidationIssue[]
}

// ── Query filters ────────────────────────────────────────────────

export interface LedgerQueryFilters {
  entityId?:   string
  entityType?: EvaluationEntityType
  profileId?:  string
  periodId?:   string
}
