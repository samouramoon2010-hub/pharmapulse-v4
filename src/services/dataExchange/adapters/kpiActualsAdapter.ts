// ============================================================
// KPI Actuals Import Domain Adapter (DX-1, Part 2)
//
// This is NOT a reimplementation of KPI Actual import — it is a thin
// wrapper around the existing, production kpiImportService /
// stagingValidator / ingestionSafetyGuards pipeline so that pipeline can
// be driven by the generic Import Job Engine without any change to its
// validation rules, duplicate handling, or Firestore payload shape.
//
// Deliberate no-ops, and why:
//   - loadExistingRecords() always returns an empty map, and
//     diffAgainstExisting() always returns 'CREATE'. The legacy commit
//     path (`stagedToKpiEntry` + `doc.set(..., {merge:true})` on a
//     deterministic id) IS the update mechanism — it silently upserts by
//     design (Architecture doc, Part 2-H: "intentionally permissive").
//     Adding a pre-commit conflict check here would be a behavior change,
//     which Part 7 of this bundle explicitly forbids.
//   - resolveColumns() returns a best-effort, display-only mapping.
//     The real column resolution (structural aliases → legacy KPI aliases
//     → dynamic registry-key/label matching) lives inside
//     parseExcelRowsToRaw() and is reused unmodified by parseRow() below;
//     duplicating that cascade here would risk the two falling out of
//     sync, which is exactly what Part 2 says not to do.
// ============================================================

import {
  parseExcelRowsToRaw,
  buildPharmacyCodeMap,
  resolvePharmacyId,
  commitValidatedKpiBatch,
  type ImportPreview,
} from '../../kpiImportService'
import { validateRow as legacyValidateRow } from '../../ingestion/stagingValidator'
import { deduplicateStaged, assessBatchSafety, guardStagedRecord } from '../../ingestion/ingestionSafetyGuards'
import { guardPharmacyAccess } from '../../security/accessGuard'
import type { GuardContext } from '../../security/accessGuard'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type {
  RawIngestionRow,
  StagedKpiRecord,
  IngestionSource,
} from '../../ingestion/ingestionTypes'

import type {
  ImportDomainAdapter,
  ImportMappingContext,
  ImportValidationContext,
  ImportAuthorizationContext,
  ImportCommitContext,
  RowValidationOutcome,
  DuplicateDetectionResult,
  AuthorizationOutcome,
  RowDecision,
} from '../importDomainAdapter'
import type {
  ColumnMapping,
  RowClassification,
  ValidationIssue,
  StagedImportRow,
} from '../importJobTypes'
import type { IngestionCommitResult } from '../../ingestion/ingestionTypes'

export interface KpiActualsAdapterDeps {
  guardCtx:    GuardContext
  actorRole:   string
  registry?:   KpiRegistry
  pharmacies:  Array<{ id: string; code: string }>
  sourceFile?: string
  source?:     IngestionSource
}

export function createKpiActualsAdapter(
  deps: KpiActualsAdapterDeps,
): ImportDomainAdapter<RawIngestionRow, StagedKpiRecord, IngestionCommitResult> {
  const registry   = deps.registry ?? DEFAULT_KPI_REGISTRY
  const codeMap     = buildPharmacyCodeMap(deps.pharmacies)
  const source: IngestionSource = deps.source ?? 'EXCEL_UPLOAD'

  function identityKey(staged: StagedKpiRecord): string {
    return `${staged.submittedBy}:${staged.pharmacyId}:${staged.date}`
  }

  return {
    domain: 'KPI_ACTUALS',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => ({
        sourceHeader: header,
        targetField:  header,
        matchedVia:   'UNRESOLVED',
      }))
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): RawIngestionRow {
      const [parsed] = parseExcelRowsToRaw([rawRow], deps.sourceFile ?? 'import-job', registry)
      const resolvedPharmacyId = resolvePharmacyId(parsed, codeMap, deps.guardCtx.pharmacyId ?? '') ?? parsed.rawPharmacyId
      return { ...parsed, rowIndex, rawPharmacyId: resolvedPharmacyId }
    },

    validateRow(raw: RawIngestionRow, ctx: ImportValidationContext): RowValidationOutcome<StagedKpiRecord> {
      const result = legacyValidateRow(
        raw,
        ctx.actorUid,
        ctx.pharmacyId ?? deps.guardCtx.pharmacyId ?? '',
        source,
        ctx.batchId ?? 'import-job',
        ctx.knownIds,
      )

      const issues: ValidationIssue[] = [
        ...result.errors.map((e) => ({
          rowIndex: raw.rowIndex, column: e.field, entity: 'KPI_ACTUAL',
          code: e.code, message: e.message, blocksCommit: true,
        })),
        ...result.warnings.map((w) => ({
          rowIndex: raw.rowIndex, column: w.field, entity: 'KPI_ACTUAL',
          code: w.code, message: w.message, blocksCommit: false,
        })),
      ]

      const classification: RowClassification =
        !result.isValid ? 'ERROR' : result.warnings.length > 0 ? 'WARNING' : 'VALID'

      return { classification, issues, staged: result.coerced as StagedKpiRecord | undefined }
    },

    identityKey,

    detectFileDuplicates(staged: StagedKpiRecord[]): DuplicateDetectionResult<StagedKpiRecord> {
      const deduplicated = deduplicateStaged(staged)
      return { deduplicated, duplicateCount: staged.length - deduplicated.length }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      // Deliberate no-op — see module header.
      return new Map()
    },

    diffAgainstExisting(_staged: StagedKpiRecord, _existing: unknown | null): RowDecision {
      // Deliberate no-op — see module header.
      return 'CREATE'
    },

    authorizeRow(staged: StagedKpiRecord, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      const branchGuard = guardPharmacyAccess(deps.guardCtx, staged.pharmacyId)
      if (!branchGuard.allowed) return { allowed: false, reason: branchGuard.reason }

      if (staged.submittedBy !== ctx.actorUid && ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Submitter mismatch — cannot import another user\'s records' }
      }

      return { allowed: true }
    },

    toStagedRow(
      staged: StagedKpiRecord,
      jobId: string,
      rowIndex: number,
      classification: RowClassification,
      issues: ValidationIssue[],
    ): StagedImportRow<StagedKpiRecord> {
      return {
        rowId:          `${jobId}-${rowIndex}`,
        jobId,
        rowIndex,
        identityKey:    staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification,
        issues,
        staged,
        state:          'STAGED',
      }
    },

    async commitBatch(
      rows: StagedImportRow<StagedKpiRecord>[],
      ctx: ImportCommitContext,
    ): Promise<IngestionCommitResult> {
      const staged = rows.map((r) => r.staged).filter((s): s is StagedKpiRecord => s != null)

      const safetyReport = assessBatchSafety(ctx.jobId, staged, deps.guardCtx)

      const preview: ImportPreview = {
        batchId:      ctx.jobId,
        totalRows:    staged.length,
        validRows:    [],
        invalidRows:  [],
        warningRows:  [],
        duplicates:   0,
        safetyReport,
        staged,
      }

      return commitValidatedKpiBatch(preview, deps.guardCtx, deps.actorRole)
    },
  }
}

// Re-exported for tests that need to assert against the exact same guard
// used by the legacy path (parity proofs).
export { guardStagedRecord }
