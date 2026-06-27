// ============================================================
// Import Error Taxonomy (DX-9, Data Exchange Studio Closure)
//
// Standardizes every adapter's technical ValidationIssue.code (and a
// few runner-level outcomes — stale preview, retry limits) into one
// of a small set of user-facing categories. Never exposes a raw
// exception message or stack trace to the end user — the detailed
// technical code/message is still preserved in the row's own
// `issues` array (and in audit logs) for support/debugging, this
// module only adds a friendly label on top of it.
// ============================================================

export type ImportErrorCategory =
  | 'File Format Error'
  | 'Template Version Error'
  | 'Missing Required Column'
  | 'Invalid Identifier'
  | 'Duplicate Row'
  | 'Existing Record Conflict'
  | 'Permission Denied'
  | 'Stale Preview'
  | 'Partial Commit Failure'
  | 'Retry Not Safe'
  | 'System Error'

// Built from every real ValidationIssue.code emitted by the adapters
// in src/services/dataExchange/adapters/*.ts — not invented. A code
// not present here falls back to 'System Error', never a crash.
const ISSUE_CODE_CATEGORY: Record<string, ImportErrorCategory> = {
  // Missing Required Column
  MISSING_REQUIRED_FIELD: 'Missing Required Column',
  MISSING_EMPLOYEE_ID: 'Missing Required Column',
  MISSING_GROUP_IDENTITY: 'Missing Required Column',
  MISSING_ARABIC_LABEL: 'Missing Required Column',

  // Invalid Identifier / reference / business-rule rejection
  UNKNOWN_BRANCH: 'Invalid Identifier',
  UNKNOWN_KPI: 'Invalid Identifier',
  UNKNOWN_PARENT_ORGANIZATION: 'Invalid Identifier',
  UNKNOWN_PHARMACIST: 'Invalid Identifier',
  INVALID_EMAIL: 'Invalid Identifier',
  INVALID_MANAGER_EMAIL: 'Invalid Identifier',
  INVALID_KEY: 'Invalid Identifier',
  INVALID_STATUS: 'Invalid Identifier',
  INVALID_DATE: 'Invalid Identifier',
  INVALID_MONTH: 'Invalid Identifier',
  INVALID_ASSIGNMENT_DATE: 'Invalid Identifier',
  INVALID_EMPLOYMENT_DATE: 'Invalid Identifier',
  FUTURE_DATE: 'Invalid Identifier',
  INVALID_CATEGORY: 'Invalid Identifier',
  INVALID_DIRECTION: 'Invalid Identifier',
  INVALID_LIFECYCLE_STAGE: 'Invalid Identifier',
  INVALID_AGGREGATION_METHOD: 'Invalid Identifier',
  INVALID_SORT_ORDER: 'Invalid Identifier',
  INVALID_MIN_MAX: 'Invalid Identifier',
  INVALID_TARGET_VALUE: 'Invalid Identifier',
  INVALID_ACTUAL_VALUE: 'Invalid Identifier',
  NEGATIVE_TARGET_VALUE: 'Invalid Identifier',
  NEGATIVE_ACTUAL_VALUE: 'Invalid Identifier',
  UNSUPPORTED_ASSIGNMENT_TYPE: 'Invalid Identifier',
  UNSUPPORTED_ROLE: 'Invalid Identifier',
  INACTIVE_BRANCH: 'Invalid Identifier',
  INACTIVE_KPI: 'Invalid Identifier',
  INACTIVE_PHARMACIST: 'Invalid Identifier',
  ARCHIVED_KPI: 'Invalid Identifier',
  KPI_NOT_PRODUCTION_EVALUATION: 'Invalid Identifier',
  DASHBOARD_IMPORT_NOT_ENABLED: 'Invalid Identifier',
  TARGET_NOT_ENABLED: 'Invalid Identifier',
  BRANCH_HAS_NO_MANAGER: 'Invalid Identifier',
  PHARMACIST_BRANCH_MISMATCH: 'Invalid Identifier',
  TEST_KEY_PROMOTION_BLOCKED: 'Invalid Identifier',
  DEPENDENCY_BLOCKED: 'Invalid Identifier',

  // Existing Record Conflict
  NORMALIZED_KEY_COLLISION: 'Existing Record Conflict',
  DUPLICATE_EMAIL: 'Existing Record Conflict',
  DUPLICATE_EMPLOYEE_ID_DIFFERENT_EMAIL: 'Existing Record Conflict',
  EMAIL_LINKED_TO_ANOTHER_EMPLOYEE: 'Existing Record Conflict',
  OVERLAPPING_PRIMARY_ASSIGNMENT: 'Existing Record Conflict',
  IDENTITY_REVIEW_REQUIRED: 'Existing Record Conflict',

  // Permission Denied
  UNAUTHORIZED_ROW: 'Permission Denied',

  // File-level (DX-7)
  FILE_TOO_LARGE: 'File Format Error',

  // Non-blocking advisory notices (blocksCommit: false) — surfaced as
  // Missing Required Column's softer sibling rather than System Error,
  // since these never block a commit and are never a crash condition.
  MISSING_OPTIONAL_FIELD: 'Missing Required Column',
  FIELD_NOT_PERSISTED: 'Missing Required Column',
  EVALUATION_FLAG_IGNORED: 'Invalid Identifier',
}

/** Categorize one adapter ValidationIssue.code. Unknown codes never
 *  throw — they fall back to a generic, still-honest category. */
export function categorizeIssueCode(code: string): ImportErrorCategory {
  return ISSUE_CODE_CATEGORY[code] ?? 'System Error'
}

/** Row classification carries information a single issue code
 *  doesn't (e.g. DUPLICATE is a within-file dedup outcome, not a
 *  validation issue at all). */
export function categorizeRowClassification(classification: string): ImportErrorCategory | null {
  if (classification === 'DUPLICATE') return 'Duplicate Row'
  if (classification === 'CONFLICT') return 'Existing Record Conflict'
  return null
}

/** Best-effort categorization of a runner-level stale/retry outcome
 *  reason string (commitActualsJob/resumeOrRetryActualsJob/
 *  commitKpiTargetsJob/commitOnboardingJob's `staleReason`). These are
 *  already hand-written, non-technical sentences (never a raw
 *  exception) — this only adds the matching category label on top. */
export function categorizeStaleReason(reason: string): ImportErrorCategory {
  const lower = reason.toLowerCase()
  if (lower.includes('retried') || lower.includes('retry limit')) return 'Retry Not Safe'
  if (lower.includes('already committ') || lower.includes('already finished') || lower.includes('already committing')) return 'Retry Not Safe'
  if (lower.includes('changed since') || lower.includes('revalidate')) return 'Stale Preview'
  if (lower.includes('not found') || lower.includes('only an interrupted') || lower.includes('nothing to resume')) return 'Retry Not Safe'
  return 'Stale Preview'
}

/** A single, presentable label + category for one row's issues — the
 *  category of its FIRST blocking issue (or its classification, for
 *  DUPLICATE/CONFLICT rows that may carry no blocking issue at all). */
export function categorizeRow(classification: string, issueCodes: string[]): ImportErrorCategory {
  const fromClassification = categorizeRowClassification(classification)
  if (fromClassification) return fromClassification
  const firstCode = issueCodes[0]
  return firstCode ? categorizeIssueCode(firstCode) : 'System Error'
}

export const IMPORT_ERROR_CATEGORIES: ImportErrorCategory[] = [
  'File Format Error', 'Template Version Error', 'Missing Required Column', 'Invalid Identifier',
  'Duplicate Row', 'Existing Record Conflict', 'Permission Denied', 'Stale Preview',
  'Partial Commit Failure', 'Retry Not Safe', 'System Error',
]
