// ============================================================
// Ingestion Safety Guards
// Pre-commit safety checks before writing staged records to Firestore.
// All checks are pure and synchronous — network checks done separately.
// ============================================================

import type { StagedKpiRecord, IngestionCommitResult } from './ingestionTypes'
import type { GuardContext } from '../security/accessGuard'
import { guardPharmacyAccess, guardNotFutureDate, assertGuard } from '../security/accessGuard'

// ══════════════════════════════════════════════════════════════
// 1. PRE-COMMIT GUARDS
// ══════════════════════════════════════════════════════════════

export interface CommitGuardResult {
  safe:     boolean
  record:   StagedKpiRecord
  reason?:  string
}

/** Check a single staged record is safe to commit */
export function guardStagedRecord(
  record:  StagedKpiRecord,
  ctx:     GuardContext,
): CommitGuardResult {
  // Must be VALID status
  if (record.status !== 'VALID') {
    return { safe: false, record, reason: `Record status is ${record.status}, expected VALID` }
  }

  // Must have no errors
  if (record.errors.length > 0) {
    return { safe: false, record, reason: `Record has ${record.errors.length} validation error(s)` }
  }

  // Branch access check
  const branchGuard = guardPharmacyAccess(ctx, record.pharmacyId)
  if (!branchGuard.allowed) {
    return { safe: false, record, reason: branchGuard.reason }
  }

  // Date guard
  const dateGuard = guardNotFutureDate(record.date)
  if (!dateGuard.allowed) {
    return { safe: false, record, reason: dateGuard.reason }
  }

  // Submitter must match caller (or admin)
  if (record.submittedBy !== ctx.uid && ctx.role !== 'admin') {
    return { safe: false, record, reason: 'Submitter mismatch — cannot commit another user\'s records' }
  }

  return { safe: true, record }
}

/** Filter and partition records: safe vs unsafe */
export function partitionForCommit(
  records: StagedKpiRecord[],
  ctx:     GuardContext,
): { safe: StagedKpiRecord[]; unsafe: CommitGuardResult[] } {
  const safe:   StagedKpiRecord[]   = []
  const unsafe: CommitGuardResult[] = []

  for (const record of records) {
    const result = guardStagedRecord(record, ctx)
    if (result.safe) safe.push(record)
    else             unsafe.push(result)
  }

  return { safe, unsafe }
}

// ══════════════════════════════════════════════════════════════
// 2. DEDUPLICATION GUARD
// ══════════════════════════════════════════════════════════════

/** Deduplicate staged records within the same batch.
 *  Within a batch, the LAST row for userId+pharmacyId+date wins. */
export function deduplicateStaged(records: StagedKpiRecord[]): StagedKpiRecord[] {
  const seen = new Map<string, StagedKpiRecord>()

  for (const record of records) {
    const key = `${record.submittedBy}:${record.pharmacyId}:${record.date}`
    seen.set(key, record)   // last one wins
  }

  return Array.from(seen.values())
}

// ══════════════════════════════════════════════════════════════
// 3. BATCH SAFETY GUARD
// ══════════════════════════════════════════════════════════════

export interface BatchSafetyReport {
  batchId:       string
  safeToCommit:  boolean
  totalRecords:  number
  safeRecords:   number
  unsafeRecords: number
  duplicates:    number
  blockers:      string[]          // reasons why batch cannot be committed
}

/** Full safety report for a batch before commit */
export function assessBatchSafety(
  batchId:  string,
  records:  StagedKpiRecord[],
  ctx:      GuardContext,
): BatchSafetyReport {
  const { safe, unsafe } = partitionForCommit(records, ctx)
  const deduplicated      = deduplicateStaged(safe)
  const duplicateCount    = safe.length - deduplicated.length

  const blockers: string[] = []

  if (records.length === 0) {
    blockers.push('Batch is empty')
  }

  if (unsafe.length > 0) {
    blockers.push(`${unsafe.length} record(s) failed safety checks`)
  }

  // Warn about high-percentage failures
  const failurePct = records.length > 0 ? (unsafe.length / records.length) : 0
  if (failurePct > 0.5) {
    blockers.push(`More than 50% of records failed validation (${Math.round(failurePct * 100)}%)`)
  }

  return {
    batchId,
    safeToCommit:  blockers.length === 0,
    totalRecords:  records.length,
    safeRecords:   deduplicated.length,
    unsafeRecords: unsafe.length,
    duplicates:    duplicateCount,
    blockers,
  }
}

// ══════════════════════════════════════════════════════════════
// 4. KPI ENTRY BUILDER
// ══════════════════════════════════════════════════════════════

/** Convert a validated staged record → kpi_entries payload */
export function stagedToKpiEntry(
  record:   StagedKpiRecord,
  actorUid: string,
): Record<string, unknown> {
  return {
    userId:       record.submittedBy,
    pharmacyId:   record.pharmacyId,
    date:         record.date,
    wasfaty:      record.wasfaty,
    omni:         record.omni,
    wellness:     record.wellness,
    basket:       record.basket,
    crossSelling: record.crossSelling,
    // Source tracking
    importedFrom: record.source,
    importBatchId: record.batchId,
    // Ownership
    createdBy:    actorUid,
    updatedBy:    actorUid,
    // Notes
    notes:        `Imported via ${record.source} — batch ${record.batchId}`,
  }
}

// ══════════════════════════════════════════════════════════════
// 5. RESULT BUILDER
// ══════════════════════════════════════════════════════════════

export function buildCommitResult(
  batchId:   string,
  committed: number,
  skipped:   number,
  errors:    Array<{ stagingId: string; error: string }>,
): IngestionCommitResult {
  return {
    batchId,
    committed,
    skipped,
    failed: errors.length,
    errors,
  }
}
