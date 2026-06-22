// ============================================================
// Evaluation Ledger — Factory (Phase 5A)
//
// Builds immutable EvaluationLedgerEntry objects. Pure — never
// writes to Firestore, never throws on malformed input (returns
// a best-effort entry; validation is a separate concern handled
// by evaluationLedgerValidation.ts).
//
// No Firestore. No React. No UI.
// ============================================================

import type { CreateLedgerEntryInput, EvaluationLedgerEntry } from './evaluationLedgerTypes'

let _counter = 0

function nowIso(): string {
  return new Date().toISOString()
}

/** Generates a unique, monotonically distinguishable evaluation id. */
export function generateEvaluationId(): string {
  _counter++
  return `eval_${Date.now()}_${_counter}`
}

/**
 * Builds a new immutable ledger entry from a creation input.
 * Deep-copies basketScores/elementScores/ruleScores/trace so the
 * stored entry can never be mutated via the caller's references.
 *
 * Never throws.
 */
export function createLedgerEntry(input: CreateLedgerEntryInput): EvaluationLedgerEntry {
  try {
    return {
      evaluationId:   generateEvaluationId(),
      entityId:       input.entityId,
      entityType:     input.entityType,
      profileId:      input.profileId,
      profileVersion: input.profileVersion,
      periodId:       input.periodId,
      score:          input.score,
      basketScores:   { ...(input.basketScores ?? {}) },
      elementScores:  { ...(input.elementScores ?? {}) },
      ruleScores:     { ...(input.ruleScores ?? {}) },
      trace:          JSON.parse(JSON.stringify(input.trace ?? {})),
      timestamp:      nowIso(),
      metadata:       { ...(input.metadata ?? {}) },
    }
  } catch {
    return {
      evaluationId:   generateEvaluationId(),
      entityId:       input?.entityId ?? '',
      entityType:     input?.entityType ?? 'branch',
      profileId:      input?.profileId ?? '',
      profileVersion: input?.profileVersion ?? '',
      periodId:       input?.periodId ?? '',
      score:          0,
      basketScores:   {},
      elementScores:  {},
      ruleScores:     {},
      trace:          {} as EvaluationLedgerEntry['trace'],
      timestamp:      nowIso(),
      metadata:       {},
    }
  }
}

/** Deep-clones an existing ledger entry (never mutates the source). */
export function cloneLedgerEntry(entry: EvaluationLedgerEntry): EvaluationLedgerEntry {
  return JSON.parse(JSON.stringify(entry))
}
