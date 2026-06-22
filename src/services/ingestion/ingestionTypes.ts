// ============================================================
// Ingestion Types
// Upload → Staging → Validation → Clean Write pipeline.
// Supports Excel, CSV, OCR (future), API push (future).
// ============================================================

// ══════════════════════════════════════════════════════════════
// 1. SOURCE TYPES
// ══════════════════════════════════════════════════════════════

export type IngestionSource =
  | 'EXCEL_UPLOAD'    // current: ImportCenter xlsx
  | 'CSV_UPLOAD'      // future
  | 'OCR_SCAN'        // future: image → KPI data
  | 'API_PUSH'        // future: external system integration
  | 'MANUAL_ENTRY'    // current: KpiEntryPage

export type IngestionStatus =
  | 'PENDING'         // uploaded, not yet validated
  | 'VALIDATING'      // validation in progress
  | 'VALID'           // passed all validation rules
  | 'INVALID'         // failed validation
  | 'COMMITTED'       // written to kpi_entries
  | 'REJECTED'        // rejected by manager
  | 'CANCELLED'       // cancelled by submitter

// ══════════════════════════════════════════════════════════════
// 2. RAW INGESTION RECORD
// ══════════════════════════════════════════════════════════════

/** One raw row as parsed from Excel/CSV/OCR — may be dirty */
export interface RawIngestionRow {
  // Source context
  rowIndex:     number
  sourceFile?:  string

  // Raw field values (strings — not yet coerced)
  rawDate?:         string
  rawPharmacyId?:   string
  rawPharmacyCode?: string
  rawWasfaty?:      string
  rawOmni?:         string
  rawWellness?:     string
  rawBasket?:       string
  rawCrossSelling?: string

  // ── Core KPI Dependency Removal — Stage C ──
  // Dynamic KPI columns, keyed by engine key, for any active KPI Registry
  // entry beyond the 5 legacy fields above. Populated by parseExcelRowsToRaw
  // when a column header resolves to an active registry KPI — no hardcoded
  // switch on KPI name required to support a newly registered KPI.
  rawKpiValues?: Record<string, string>

  // Column headers that looked like an attempted KPI reading (numeric value)
  // but did not resolve to any active KPI Registry key. Surfaced as
  // UNKNOWN_KPI_KEY warnings during validation instead of disappearing
  // silently into rawExtras.
  unknownKpiColumns?: string[]

  // Any additional raw columns
  rawExtras?: Record<string, string>
}

// ══════════════════════════════════════════════════════════════
// 3. STAGED RECORD
// ══════════════════════════════════════════════════════════════

/** A staged record ready for validation */
export interface StagedKpiRecord {
  // Staging identity
  stagingId:    string          // auto-generated
  batchId:      string          // groups rows from same upload

  // Ownership (set at ingest time)
  submittedBy:  string          // UID
  pharmacyId:   string          // resolved from code or raw field
  status:       IngestionStatus

  // Source
  source:       IngestionSource
  sourceFile?:  string
  rowIndex:     number

  // Coerced data (after parsing)
  date:         string          // "yyyy-MM-dd"
  wasfaty:      number
  omni:         number
  wellness:     number
  basket:       number
  crossSelling: number

  // ── Core KPI Dependency Removal — Stage C ──
  // Dynamic engine-key → value map covering the 5 legacy fields above PLUS
  // any other active KPI Registry entry present in this import. Mirrors the
  // shape buildKpiValuesMap() already produces for the manual-entry write
  // path, so import and manual entry share one dynamic storage model.
  kpiValues: Record<string, number>

  // Timestamps
  stagedAt:     string          // ISO
  validatedAt?: string
  committedAt?: string

  // Validation results (populated by stagingValidator)
  errors:        ValidationError[]
  warnings:      ValidationWarning[]
}

// ══════════════════════════════════════════════════════════════
// 4. VALIDATION RESULTS
// ══════════════════════════════════════════════════════════════

export type ValidationErrorCode =
  | 'INVALID_DATE'
  | 'FUTURE_DATE'
  | 'MISSING_PHARMACY_ID'
  | 'UNKNOWN_PHARMACY'
  | 'INVALID_KPI_VALUE'
  | 'NEGATIVE_KPI_VALUE'
  | 'DUPLICATE_ENTRY'
  | 'MISSING_REQUIRED_FIELD'
  | 'UNAUTHORIZED_BRANCH'
  | 'EXCEEDS_DAILY_LIMIT'

export type ValidationWarningCode =
  | 'ZERO_VALUE_KPI'        // KPI is 0 — may be intentional
  | 'HIGH_VALUE_KPI'        // KPI unusually high vs historical
  | 'OVERWRITE_EXISTING'    // would overwrite an existing entry
  | 'MISSING_OPTIONAL_FIELD'
  | 'UNKNOWN_KPI_KEY'       // column looked like a KPI reading but matched no active registry key

export interface ValidationError {
  code:     ValidationErrorCode
  field?:   string
  message:  string
  value?:   unknown
}

export interface ValidationWarning {
  code:     ValidationWarningCode
  field?:   string
  message:  string
  value?:   unknown
}

export interface ValidationResult {
  stagingId:  string
  isValid:    boolean
  errors:     ValidationError[]
  warnings:   ValidationWarning[]
  coerced?:   Partial<StagedKpiRecord>   // parsed clean values
}

// ══════════════════════════════════════════════════════════════
// 5. INGESTION BATCH
// ══════════════════════════════════════════════════════════════

export interface IngestionBatch {
  batchId:      string
  source:       IngestionSource
  submittedBy:  string
  pharmacyId?:  string          // null = multi-branch batch

  // Stats
  totalRows:    number
  validRows:    number
  invalidRows:  number
  committedRows: number

  // Staged records
  records:      StagedKpiRecord[]

  // Timestamps
  startedAt:    string
  completedAt?: string

  status:       'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'COMMITTED' | 'FAILED'
}

// ══════════════════════════════════════════════════════════════
// 6. COMMIT RESULT
// ══════════════════════════════════════════════════════════════

export interface IngestionCommitResult {
  batchId:      string
  committed:    number
  skipped:      number
  failed:       number
  errors:       Array<{ stagingId: string; error: string }>
}

// ══════════════════════════════════════════════════════════════
// 7. CONSTANTS
// ══════════════════════════════════════════════════════════════

export const INGESTION_LIMITS = {
  MAX_ROWS_PER_BATCH:     2000,
  MAX_FILE_SIZE_MB:         10,
  MAX_KPI_VALUE:         99999,
  MIN_KPI_VALUE:             0,
  HISTORICAL_LOOKBACK_DAYS:  90,  // reject entries older than 90 days
} as const
