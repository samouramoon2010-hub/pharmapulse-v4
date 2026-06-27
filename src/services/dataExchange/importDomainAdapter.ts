// ============================================================
// Generic Import Domain Adapter (DX-1, Part 2)
//
// Every import domain (Branches, Pharmacists, Targets, ...) implements
// this interface. The Import Job Engine only ever talks to an adapter
// through these methods — it never knows about kpi_entries, pharmacies,
// or any other Firestore collection directly. DX-1 ships exactly one
// implementation: adapters/kpiActualsAdapter.ts.
// ============================================================

import type {
  ImportDomain,
  ColumnMapping,
  RowClassification,
  ValidationIssue,
  StagedImportRow,
} from './importJobTypes'

export interface ImportMappingContext {
  domain: ImportDomain
}

export interface ImportValidationContext {
  actorUid:    string
  actorRole:   string
  orgScope?:   string | null
  pharmacyId?: string | null
  knownIds?:   string[]
  /** Identifier for the validation run (e.g. job id) — used by adapters that
   *  need a stable batch/staging identifier, without coupling this generic
   *  context to any one domain's staging-ID format. */
  batchId?:    string
}

export interface ImportAuthorizationContext {
  actorUid:    string
  actorRole:   string
  orgScope?:   string | null
  pharmacyId?: string | null
}

export interface ImportCommitContext {
  actorUid:   string
  actorRole:  string
  jobId:      string
}

export interface RowValidationOutcome<TStaged> {
  classification: RowClassification
  issues:         ValidationIssue[]
  staged?:        TStaged
}

export type RowDecision = 'CREATE' | 'UPDATE' | 'CONFLICT' | 'SKIP'

export interface DuplicateDetectionResult<TStaged> {
  deduplicated:      TStaged[]
  duplicateCount:    number
}

export interface AuthorizationOutcome {
  allowed:  boolean
  reason?:  string
}

export interface ImportDomainAdapter<TRaw, TStaged, TCommitResult> {
  readonly domain: ImportDomain

  /** Resolve uploaded header row → target fields. Display/diagnostic use only —
   *  adapters that already embed column resolution in parseRow (e.g. the
   *  KPI Actuals legacy pipeline) may return a best-effort mapping without
   *  re-implementing that resolution logic here. */
  resolveColumns(headerRow: string[], ctx: ImportMappingContext): ColumnMapping[]

  /** Parse one raw uploaded row into the domain's raw shape. */
  parseRow(rawRow: Record<string, unknown>, rowIndex: number, ctx: ImportMappingContext): TRaw

  /** Validate + coerce one raw row. Pure — no Firestore reads. */
  validateRow(raw: TRaw, ctx: ImportValidationContext): RowValidationOutcome<TStaged>

  /** Domain-specific natural/idempotency key for a staged row. */
  identityKey(staged: TStaged): string

  /** Within-file duplicate detection, by identityKey. Last-row-wins, never silent. */
  detectFileDuplicates(staged: TStaged[]): DuplicateDetectionResult<TStaged>

  /** Load existing committed records that staged rows might conflict/update against. */
  loadExistingRecords(staged: TStaged[], ctx: ImportValidationContext): Promise<Map<string, unknown>>

  /** Decide Create / Update / Conflict / Skip against an existing record (or null). */
  diffAgainstExisting(staged: TStaged, existing: unknown | null): RowDecision

  /** Row-level authorization — must never depend on UI-only filtering. */
  authorizeRow(staged: TStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome

  /** Wrap a validated staged value into the generic StagedImportRow envelope. */
  toStagedRow(staged: TStaged, jobId: string, rowIndex: number, classification: RowClassification, issues: ValidationIssue[]): StagedImportRow<TStaged>

  /** Commit one batch of staged rows. The ONLY place Firestore writes happen. */
  commitBatch(rows: StagedImportRow<TStaged>[], ctx: ImportCommitContext): Promise<TCommitResult>
}
