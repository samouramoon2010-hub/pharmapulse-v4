// ============================================================
// Data Exchange Studio — Import Job Foundation (DX-1)
//
// Generic contracts for the Import Job Engine. Nothing in this file
// is coupled to a specific entity or to the legacy Core-5 KPIs — the
// only domain wired up to these contracts in DX-1 is KPI_ACTUALS
// (see adapters/kpiActualsAdapter.ts), but the shapes here are meant
// to carry every domain listed in docs/dx/DX_STUDIO_ARCHITECTURE_V1.md
// without modification.
// ============================================================

// ── 1. Domain identifiers ──────────────────────────────────────
// One entry per import domain from the approved architecture (Part 2,
// A–I). Only KPI_ACTUALS has an adapter implementation in DX-1.
export type ImportDomain =
  | 'GROUP'
  | 'BRANCH'
  | 'PHARMACIST'
  | 'ASSIGNMENT'
  | 'KPI_REGISTRY'
  | 'BRANCH_TARGET'
  | 'PHARMACIST_TARGET'
  | 'KPI_ACTUALS'
  // DX-6 (Actuals & Large Files Bundle): split out of the generic,
  // intentionally-permissive KPI_ACTUALS legacy domain (see
  // adapters/kpiActualsAdapter.ts) — these two have REAL conflict
  // detection and never silently overwrite, the opposite of that
  // legacy adapter's documented design, so they are new domains
  // rather than a change to it. Same split pattern as BRANCH_TARGET/
  // PHARMACIST_TARGET being split out of a generic "targets" concept.
  | 'BRANCH_ACTUALS'
  | 'PHARMACIST_ACTUALS'
  | 'HISTORICAL'

// ── 2. Job lifecycle ───────────────────────────────────────────
export type ImportJobStatus =
  | 'DRAFT'
  | 'PARSING'
  | 'MAPPED'
  | 'VALIDATING'
  | 'READY'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ROLLED_BACK'

// ── 3. File metadata ───────────────────────────────────────────
export interface ImportFileMetadata {
  fileName:    string
  sizeBytes:   number
  checksum:    string          // sha256 of file content — drives re-upload detection
  sheetName?:  string
  mimeType?:   string
}

// ── 4. Column mapping ──────────────────────────────────────────
export interface ColumnMapping {
  sourceHeader:  string
  targetField:   string
  matchedVia:    'STRUCTURAL_ALIAS' | 'REGISTRY_KEY' | 'REGISTRY_LABEL' | 'LEGACY_ALIAS' | 'UNRESOLVED'
}

// ── 5. Row classification (Part 4) ─────────────────────────────
export type RowClassification =
  | 'VALID'
  | 'WARNING'
  | 'ERROR'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'UPDATE'
  | 'SKIP'

// ── 6. Validation issue (Part 4) ────────────────────────────────
export interface ValidationIssue {
  rowIndex:            number
  column?:             string
  entity?:             string
  code:                string
  message:             string
  suggestedCorrection?: string
  blocksCommit:        boolean
  /** Identity conflicts (Part 3 closure patch) default to REVIEW_REQUIRED
   *  rather than ERROR — they require a human decision about existing
   *  Firestore records, not a file correction. Optional/additive; adapters
   *  that never set it behave exactly as before. */
  requiresReview?:     boolean
}

export interface ValidationSummary {
  totalRows:  number
  valid:      number
  warning:    number
  error:      number
  conflict:   number
  duplicate:  number
  update:     number
  skip:       number
}

export function emptyValidationSummary(totalRows = 0): ValidationSummary {
  return { totalRows, valid: 0, warning: 0, error: 0, conflict: 0, duplicate: 0, update: 0, skip: 0 }
}

// ── 7. Staged row state (post-classification, pre/post commit) ─
export type ImportRowState =
  | 'STAGED'
  | 'COMMITTED'
  | 'FAILED'
  | 'SKIPPED'

export interface StagedImportRow<TStaged = unknown> {
  rowId:           string          // deterministic — see idempotency helpers
  jobId:           string
  rowIndex:         number
  identityKey:      string         // domain-specific natural key, drives idempotent commit
  classification:   RowClassification
  issues:           ValidationIssue[]
  staged?:          TStaged
  state:            ImportRowState
  committedAt?:     string
  failureReason?:   string
  /** The adapter's own commitBatch() return value for the batch this row
   *  was committed in. Populated only when commitBatch succeeds. Used by
   *  multi-domain orchestration (e.g. onboarding) to resolve a
   *  newly-created entity's real ID for a dependent row later in the same
   *  job, without re-querying Firestore. Optional/additive — existing
   *  adapters and tests are unaffected if they never read it. */
  committedResult?: unknown
}

// ── 8. Commit batches ───────────────────────────────────────────
export interface CommitBatchResult {
  batchIndex:   number
  attempted:    number
  committed:    number
  skipped:      number
  failed:       number
  errors:       Array<{ rowId: string; error: string }>
  startedAt:    string
  endedAt:      string
}

export interface ImportJobResult {
  jobId:        string
  status:       ImportJobStatus
  totalRows:    number
  committed:    number
  skipped:      number
  failed:       number
  remaining:    number
  batches:      CommitBatchResult[]
  startedAt?:   string
  endedAt?:     string
}

// ── 9. Progress (Part 6) ────────────────────────────────────────
export interface ImportProgress {
  totalRows:        number
  parsedRows:       number
  validatedRows:    number
  validRows:        number
  warningRows:      number
  errorRows:        number
  duplicateRows:    number
  conflictRows:     number
  committedRows:    number
  failedRows:       number
  remainingRows:    number
  percentComplete:  number   // 0–100, based on committed+failed+skipped / totalRows
}

// ── 10. Audit metadata ───────────────────────────────────────────
export interface ImportAuditMetadata {
  jobId:      string
  domain:     ImportDomain
  actorUid:   string
  actorRole:  string
  orgScope?:  string | null
  action:     'JOB_CREATED' | 'VALIDATED' | 'COMMITTED' | 'PARTIALLY_COMMITTED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK'
  timestamp:  string
  meta?:      Record<string, unknown>
}

// ── 11. Idempotency metadata ─────────────────────────────────────
export interface ImportIdempotencyMetadata {
  fileChecksum:       string
  jobId:              string
  domain:             ImportDomain
  rowIdentityKey:      string
  commitOperationKey:  string   // `${jobId}:${rowIdentityKey}` — stable across retries
}

export function buildCommitOperationKey(jobId: string, rowIdentityKey: string): string {
  return `${jobId}:${rowIdentityKey}`
}

// ── 12. Import Job model ──────────────────────────────────────────
export interface ImportJob {
  jobId:            string
  domain:            ImportDomain
  status:            ImportJobStatus
  orgScope?:         string | null
  createdBy:          string
  createdAt:          string
  updatedAt:          string
  fileMeta?:          ImportFileMetadata
  mappingVersion?:    string
  columnMapping?:     ColumnMapping[]
  validationSummary?:  ValidationSummary
  rowCounts: {
    parsed:    number
    validated: number
    committed: number
    failed:    number
    skipped:   number
    remaining: number
  }
  commitBatches:      CommitBatchResult[]
  rollbackStatus:     'NOT_ATTEMPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_POSSIBLE'
  startedAt?:         string
  endedAt?:           string
  statusHistory:      Array<{ from: ImportJobStatus | null; to: ImportJobStatus; at: string }>
  /** Closure-patch Part 4/6 addition: a deterministic fingerprint of this
   *  job's staged rows at the moment it reached READY. Recomputed and
   *  compared just before commit to detect a stale preview (Firestore
   *  records changed between Preview and Commit) without adding a new
   *  ImportJobStatus or touching the generic state machine. Optional/
   *  additive — jobs that never set it (DX-1 KPI Actuals path) are
   *  unaffected. */
  previewSignature?: string

  /** DX-7 (Large File Processing): how many times this job's
   *  COMMITTING phase has been (re-)entered — incremented on every
   *  resume or retry, never on the first commit attempt. Optional/
   *  additive; jobs that never resume/retry never set it. Used only
   *  to enforce DX7_CONFIG.MAX_RETRY_ATTEMPTS — never read by the
   *  state machine or the commit logic itself. */
  retryCount?: number
}

export function emptyRowCounts() {
  return { parsed: 0, validated: 0, committed: 0, failed: 0, skipped: 0, remaining: 0 }
}
