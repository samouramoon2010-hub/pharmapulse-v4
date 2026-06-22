// ============================================================
// Evaluation Ledger — Validation (Phase 5A)
//
// Pure validation for evaluation ledger entries before they are
// written. Never throws — returns a LedgerValidationResult.
//
// No Firestore. No React. No UI.
// ============================================================

import type {
  CreateLedgerEntryInput,
  LedgerValidationIssue,
  LedgerValidationResult,
  EvaluationEntityType,
} from './evaluationLedgerTypes'

const ENTITY_TYPES: EvaluationEntityType[] = ['pharmacist', 'branch', 'district', 'region']

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPlainScoreMap(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v as Record<string, unknown>).every(isFiniteNumber)
}

/**
 * Validates a ledger entry input before it is persisted.
 * Never throws — always returns a result object.
 */
export function validateLedgerEntry(input: unknown): LedgerValidationResult {
  const issues: LedgerValidationIssue[] = []

  try {
    const entry = (input ?? {}) as Partial<CreateLedgerEntryInput>

    if (!entry.entityId || typeof entry.entityId !== 'string') {
      issues.push({ code: 'MISSING_ENTITY_ID', field: 'entityId', message: 'entityId is required', severity: 'error' })
    }
    if (!entry.entityType || !ENTITY_TYPES.includes(entry.entityType)) {
      issues.push({ code: 'INVALID_ENTITY_TYPE', field: 'entityType', message: `entityType must be one of: ${ENTITY_TYPES.join(', ')}`, severity: 'error' })
    }
    if (!entry.profileId || typeof entry.profileId !== 'string') {
      issues.push({ code: 'MISSING_PROFILE_ID', field: 'profileId', message: 'profileId is required', severity: 'error' })
    }
    if (!entry.profileVersion || typeof entry.profileVersion !== 'string') {
      issues.push({ code: 'MISSING_PROFILE_VERSION', field: 'profileVersion', message: 'profileVersion is required', severity: 'error' })
    }
    if (!entry.periodId || typeof entry.periodId !== 'string') {
      issues.push({ code: 'MISSING_PERIOD_ID', field: 'periodId', message: 'periodId is required', severity: 'error' })
    }
    if (!isFiniteNumber(entry.score)) {
      issues.push({ code: 'INVALID_SCORE', field: 'score', message: 'score must be a finite number', severity: 'error' })
    } else if (entry.score! < 0 || entry.score! > 100) {
      issues.push({ code: 'SCORE_OUT_OF_RANGE', field: 'score', message: 'score should fall within 0–100', severity: 'warning' })
    }
    if (!isPlainScoreMap(entry.basketScores)) {
      issues.push({ code: 'INVALID_BASKET_SCORES', field: 'basketScores', message: 'basketScores must be a map of id → number', severity: 'error' })
    }
    if (!isPlainScoreMap(entry.elementScores)) {
      issues.push({ code: 'INVALID_ELEMENT_SCORES', field: 'elementScores', message: 'elementScores must be a map of id → number', severity: 'error' })
    }
    if (!isPlainScoreMap(entry.ruleScores)) {
      issues.push({ code: 'INVALID_RULE_SCORES', field: 'ruleScores', message: 'ruleScores must be a map of id → number', severity: 'error' })
    }
    if (!entry.trace || typeof entry.trace !== 'object') {
      issues.push({ code: 'MISSING_TRACE', field: 'trace', message: 'trace is required for full traceability', severity: 'error' })
    }

    return { valid: issues.every((i) => i.severity !== 'error'), issues }
  } catch (e) {
    return {
      valid: false,
      issues: [{
        code: 'VALIDATION_THREW',
        message: `Ledger validation failed: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
      }],
    }
  }
}

/** True when an entry has no error-severity issues. Never throws. */
export function isLedgerEntryValid(input: unknown): boolean {
  try {
    return validateLedgerEntry(input).valid
  } catch {
    return false
  }
}
