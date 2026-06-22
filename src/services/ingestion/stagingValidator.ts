// ============================================================
// Staging Validator
// Validates RawIngestionRow → StagedKpiRecord.
// Pure functions — no Firebase, no React.
// ============================================================

import { format, subDays, isValid, parseISO } from 'date-fns'
import type {
  RawIngestionRow,
  StagedKpiRecord,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  IngestionSource,
} from './ingestionTypes'
import { INGESTION_LIMITS } from './ingestionTypes'

// ── Date parsing ──────────────────────────────────────────────
const DATE_FORMATS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,           // yyyy-MM-dd
  /^(\d{2})\/(\d{2})\/(\d{4})$/,          // dd/MM/yyyy
  /^(\d{2})-(\d{2})-(\d{4})$/,            // dd-MM-yyyy
]

function parseDate(raw: string | undefined): { date: string | null; error: string | null } {
  if (!raw?.trim()) return { date: null, error: 'Date is empty' }

  const trimmed = raw.trim()

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = parseISO(trimmed)
    if (isValid(d)) return { date: trimmed, error: null }
    return { date: null, error: `Invalid date: ${trimmed}` }
  }

  // dd/MM/yyyy
  const ddmm = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (ddmm) {
    const iso = `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`
    const d   = parseISO(iso)
    if (isValid(d)) return { date: iso, error: null }
  }

  // dd-MM-yyyy
  const ddmmDash = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (ddmmDash) {
    const iso = `${ddmmDash[3]}-${ddmmDash[2]}-${ddmmDash[1]}`
    const d   = parseISO(iso)
    if (isValid(d)) return { date: iso, error: null }
  }

  return { date: null, error: `Cannot parse date: ${trimmed}` }
}

// ── KPI value parsing ─────────────────────────────────────────
function parseKpiValue(
  raw:   string | undefined,
  field: string,
): { value: number; errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors:   ValidationError[]   = []
  const warnings: ValidationWarning[] = []

  if (raw == null || raw === '') {
    return { value: 0, errors, warnings: [{
      code: 'MISSING_OPTIONAL_FIELD',
      field,
      message: `${field} is empty — defaulting to 0`,
    }] }
  }

  const n = Number(String(raw).replace(/,/g, '').trim())

  if (isNaN(n)) {
    errors.push({ code: 'INVALID_KPI_VALUE', field, message: `${field} is not a number: "${raw}"`, value: raw })
    return { value: 0, errors, warnings }
  }

  if (n < INGESTION_LIMITS.MIN_KPI_VALUE) {
    errors.push({ code: 'NEGATIVE_KPI_VALUE', field, message: `${field} cannot be negative`, value: n })
    return { value: 0, errors, warnings }
  }

  if (n > INGESTION_LIMITS.MAX_KPI_VALUE) {
    errors.push({ code: 'EXCEEDS_DAILY_LIMIT', field, message: `${field} exceeds max value (${INGESTION_LIMITS.MAX_KPI_VALUE})`, value: n })
    return { value: 0, errors, warnings }
  }

  if (n === 0) {
    warnings.push({ code: 'ZERO_VALUE_KPI', field, message: `${field} is 0 — verify this is correct` })
  }

  return { value: Math.round(n), errors, warnings }
}

// ── Validate one raw row ──────────────────────────────────────
export function validateRow(
  raw:          RawIngestionRow,
  submittedBy:  string,
  pharmacyId:   string,
  source:       IngestionSource,
  batchId:      string,
  knownPharmacyIds?: string[],
): ValidationResult {
  const stagingId = `stg-${batchId}-${raw.rowIndex}`
  const errors:   ValidationError[]   = []
  const warnings: ValidationWarning[] = []

  // ── Date validation ──
  const { date, error: dateError } = parseDate(raw.rawDate)
  if (dateError || !date) {
    errors.push({ code: 'INVALID_DATE', field: 'date', message: dateError || 'Missing date', value: raw.rawDate })
  } else {
    const today      = new Date().toISOString().split('T')[0]
    const cutoffDate = format(subDays(new Date(), INGESTION_LIMITS.HISTORICAL_LOOKBACK_DAYS), 'yyyy-MM-dd')

    if (date > today) {
      errors.push({ code: 'FUTURE_DATE', field: 'date', message: `Date ${date} is in the future`, value: date })
    }
    if (date < cutoffDate) {
      errors.push({ code: 'INVALID_DATE', field: 'date', message: `Date ${date} is older than ${INGESTION_LIMITS.HISTORICAL_LOOKBACK_DAYS} days`, value: date })
    }
  }

  // ── PharmacyId validation ──
  const resolvedPharmacyId = raw.rawPharmacyId || pharmacyId
  if (!resolvedPharmacyId) {
    errors.push({ code: 'MISSING_PHARMACY_ID', field: 'pharmacyId', message: 'Pharmacy ID is required' })
  } else if (knownPharmacyIds && !knownPharmacyIds.includes(resolvedPharmacyId)) {
    errors.push({ code: 'UNKNOWN_PHARMACY', field: 'pharmacyId', message: `Pharmacy "${resolvedPharmacyId}" not found`, value: resolvedPharmacyId })
  }

  // ── KPI values ──
  // The 5 legacy Core fields — byte-identical to prior behavior.
  const kpiFields = [
    { raw: raw.rawWasfaty,      field: 'wasfaty'      },
    { raw: raw.rawOmni,         field: 'omni'         },
    { raw: raw.rawWellness,     field: 'wellness'     },
    { raw: raw.rawBasket,       field: 'basket'       },
    { raw: raw.rawCrossSelling, field: 'crossSelling' },
  ]

  const kpiValues: Record<string, number> = {}
  for (const { raw: rawVal, field } of kpiFields) {
    const result = parseKpiValue(rawVal, field)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
    kpiValues[field] = result.value
  }

  // Core KPI Dependency Removal — Stage C: any other active KPI Registry
  // entry whose column was present in this import. rawKpiValues is only
  // populated (by parseExcelRowsToRaw) for headers that resolved to an
  // active registry key, so no further registry lookup is needed here —
  // no hardcoded switch on KPI name, arbitrary kpiKey values are accepted.
  for (const [engineKey, rawVal] of Object.entries(raw.rawKpiValues ?? {})) {
    if (engineKey in kpiValues) continue
    const result = parseKpiValue(rawVal, engineKey)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
    kpiValues[engineKey] = result.value
  }

  // Flag columns that looked like an attempted KPI reading but matched no
  // active registry key — explicit "reject or flag" per Stage C, instead
  // of disappearing silently into rawExtras.
  for (const col of raw.unknownKpiColumns ?? []) {
    warnings.push({
      code:    'UNKNOWN_KPI_KEY',
      field:   col,
      message: `Column "${col}" did not match any active KPI in the registry — value was not imported`,
    })
  }

  const isValid = errors.length === 0

  return {
    stagingId,
    isValid,
    errors,
    warnings,
    coerced: isValid ? {
      stagingId,
      batchId,
      submittedBy,
      pharmacyId:   resolvedPharmacyId || pharmacyId,
      status:       'VALID',
      source,
      rowIndex:     raw.rowIndex,
      date:         date!,
      wasfaty:      kpiValues.wasfaty,
      omni:         kpiValues.omni,
      wellness:     kpiValues.wellness,
      basket:       kpiValues.basket,
      crossSelling: kpiValues.crossSelling,
      kpiValues,
      stagedAt:     new Date().toISOString(),
      errors:       [],
      warnings,
    } : undefined,
  }
}

// ── Validate a full batch ─────────────────────────────────────
export function validateBatch(
  rows:             RawIngestionRow[],
  submittedBy:      string,
  pharmacyId:       string,
  source:           IngestionSource,
  batchId:          string,
  knownPharmacyIds?: string[],
): { results: ValidationResult[]; summary: { total: number; valid: number; invalid: number } } {
  if (rows.length > INGESTION_LIMITS.MAX_ROWS_PER_BATCH) {
    throw new Error(`Batch exceeds maximum size: ${rows.length} > ${INGESTION_LIMITS.MAX_ROWS_PER_BATCH}`)
  }

  const results = rows.map((row) =>
    validateRow(row, submittedBy, pharmacyId, source, batchId, knownPharmacyIds)
  )

  return {
    results,
    summary: {
      total:   results.length,
      valid:   results.filter((r) => r.isValid).length,
      invalid: results.filter((r) => !r.isValid).length,
    },
  }
}
