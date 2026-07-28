// ============================================================
// PHARMACIST_ACTUALS Domain Adapter (DX-6, Actuals & Large Files Bundle)
//
// Writes pharmacist-level KPI actuals through the SAME production
// kpi_entries contract used by manual pharmacist entry. Pharmacist
// identity resolution reuses fetchExistingOnboardingData()'s
// CLAIMED-excluding employeeId/email maps — the same authoritative
// "active operational pharmacist" boundary already established for
// Pharmacist Targets (DX-5b). A CLAIMED record never appears in those
// maps, so it can never resolve here either; it reads as "unknown
// pharmacist", the correct, auditable outcome — never a separate or
// weaker code path.
//
// This is a NEW adapter, not a modification of the legacy
// kpiActualsAdapter.ts (KPI_ACTUALS domain) — see branchActualsAdapter.ts
// header for why that legacy adapter's silent-upsert design is
// deliberately left unchanged.
//
// Commits via saveKpiActualEntry() one row at a time (chunkSize:1),
// the same per-row convention as pharmacistTargetsAdapter.ts.
// ============================================================

import { doc, getDoc } from 'firebase/firestore'
import { db, COL } from '../dxFirebaseTypes'
import { saveKpiActualEntry } from '../dxKpiEntryTypes'
import { getActualFieldName } from '../../../engine/kpiRegistry/kpiUiAdapter'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './pharmacistsAdapter'
import { pickField, findAliasMatch } from './columnAliasUtils'
import { normalizeDateInput } from './branchActualsAdapter'
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
import type { ColumnMapping, ValidationIssue, StagedImportRow } from '../importJobTypes'

export interface PharmacistActualRaw {
  rowIndex:         number
  dateRaw?:         string
  pharmacistIdRaw?: string
  branchCode?:      string
  kpiKey?:          string
  valueRaw?:        string
}

export interface PharmacistActualStaged {
  userId:      string
  pharmacyId:  string
  date:        string
  kpiKey:      string
  actualField: string
  value:       number
}

export interface ExistingBranchRecordRef {
  id:     string
  code:   string
  active: boolean
}

export const HEADER_ALIASES = {
  date:         ['date', 'entry date', 'التاريخ'],
  pharmacistId: ['pharmacist identifier', 'pharmacistidentifier', 'employee id', 'employeeid', 'staff id', 'الرقم الوظيفي'],
  branch:       ['branch code', 'branchcode', 'branch', 'branch id', 'كود الفرع', 'الفرع'],
  kpi:          ['kpi key', 'kpikey', 'kpi code', 'kpi', 'مفتاح المؤشر', 'المؤشر'],
  value:        ['actual value', 'actualvalue', 'actual', 'value', 'القيمة الفعلية', 'القيمة'],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PharmacistActualsAdapterDeps {
  actorRole:               string
  existingBranches:        ExistingBranchRecordRef[]
  registry:                KpiRegistry
  pharmacistsByEmployeeId: Map<string, ExistingPharmacistRecord>
  pharmacistsByEmail:      Map<string, ExistingPharmacistRecord>
  today?:                  string
}

export function createPharmacistActualsAdapter(
  deps: PharmacistActualsAdapterDeps,
): ImportDomainAdapter<PharmacistActualRaw, PharmacistActualStaged, { id: string; field: string }> {
  const existingByCode = new Map(deps.existingBranches.map((b) => [b.code.toUpperCase(), b]))
  const pharmacistsByUid = new Map(
    [...deps.pharmacistsByEmployeeId.values()].map((r) => [r.id, r]),
  )
  const existingDocCache = new Map<string, Record<string, unknown> | null>()
  const today = deps.today ?? new Date().toISOString().split('T')[0]

  function resolvePharmacist(identifier: string): ExistingPharmacistRecord | null {
    if (deps.pharmacistsByEmployeeId.has(identifier)) return deps.pharmacistsByEmployeeId.get(identifier)!
    if (EMAIL_RE.test(identifier) && deps.pharmacistsByEmail.has(identifier.toLowerCase())) {
      return deps.pharmacistsByEmail.get(identifier.toLowerCase())!
    }
    if (pharmacistsByUid.has(identifier)) return pharmacistsByUid.get(identifier)!
    return null
  }

  function identityKey(staged: PharmacistActualStaged): string {
    return `${staged.userId}_${staged.pharmacyId}_${staged.date}_${staged.kpiKey}`
  }

  function docId(staged: PharmacistActualStaged): string {
    return `${staged.userId}_${staged.pharmacyId}_${staged.date}`
  }

  return {
    domain: 'PHARMACIST_ACTUALS',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const match = findAliasMatch(header, HEADER_ALIASES)
        return { sourceHeader: header, targetField: match ?? header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): PharmacistActualRaw {
      return {
        rowIndex,
        dateRaw:         pickField(rawRow, HEADER_ALIASES.date),
        pharmacistIdRaw: pickField(rawRow, HEADER_ALIASES.pharmacistId),
        branchCode:      pickField(rawRow, HEADER_ALIASES.branch),
        kpiKey:          pickField(rawRow, HEADER_ALIASES.kpi),
        valueRaw:        pickField(rawRow, HEADER_ALIASES.value),
      }
    },

    validateRow(raw: PharmacistActualRaw, _ctx: ImportValidationContext): RowValidationOutcome<PharmacistActualStaged> {
      const issues: ValidationIssue[] = []

      const date = normalizeDateInput(raw.dateRaw)
      if (!date) {
        issues.push({ rowIndex: raw.rowIndex, column: 'date', entity: 'PHARMACIST_ACTUALS', code: 'INVALID_DATE', message: `Date "${raw.dateRaw ?? ''}" must be in YYYY-MM-DD format`, blocksCommit: true })
      } else if (date > today) {
        issues.push({ rowIndex: raw.rowIndex, column: 'date', entity: 'PHARMACIST_ACTUALS', code: 'FUTURE_DATE', message: `Date "${date}" is in the future — actuals cannot be back-dated forward`, blocksCommit: true })
      }

      let branch: ExistingBranchRecordRef | undefined
      if (!raw.branchCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'Branch Code is required', blocksCommit: true })
      } else {
        branch = existingByCode.get(raw.branchCode.toUpperCase())
        if (!branch) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_ACTUALS', code: 'UNKNOWN_BRANCH', message: `Branch "${raw.branchCode}" was not found`, blocksCommit: true })
        } else if (!branch.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_ACTUALS', code: 'INACTIVE_BRANCH', message: `Branch "${raw.branchCode}" is inactive`, blocksCommit: true })
        }
      }

      let pharmacist: ExistingPharmacistRecord | null = null
      if (!raw.pharmacistIdRaw) {
        issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'Pharmacist Identifier is required', blocksCommit: true })
      } else {
        pharmacist = resolvePharmacist(raw.pharmacistIdRaw)
        if (!pharmacist) {
          // A CLAIMED record never appears in pharmacistsByEmployeeId/
          // pharmacistsByEmail/pharmacistsByUid — this same branch covers
          // both "truly unknown" and "superseded CLAIMED record".
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_ACTUALS', code: 'UNKNOWN_PHARMACIST', message: `Pharmacist "${raw.pharmacistIdRaw}" was not found as an active or pending-invitation operational record`, blocksCommit: true })
        } else if (!pharmacist.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_ACTUALS', code: 'INACTIVE_PHARMACIST', message: `Pharmacist "${raw.pharmacistIdRaw}" is deactivated`, blocksCommit: true })
        } else if (pharmacist.hasIdentityAmbiguity) {
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_ACTUALS', code: 'IDENTITY_REVIEW_REQUIRED', message: `Pharmacist "${raw.pharmacistIdRaw}" has more than one existing user record — requires manual review`, blocksCommit: true, requiresReview: true })
        } else if (branch && pharmacist.pharmacyId && pharmacist.pharmacyId !== branch.id) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_ACTUALS', code: 'PHARMACIST_BRANCH_MISMATCH', message: `Pharmacist "${raw.pharmacistIdRaw}" does not belong to branch "${raw.branchCode}"`, blocksCommit: true })
        }
      }

      let actualField: string | null = null
      if (!raw.kpiKey) {
        issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'KPI Key is required', blocksCommit: true })
      } else {
        const kpi = deps.registry[raw.kpiKey]
        if (!kpi) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'UNKNOWN_KPI', message: `KPI "${raw.kpiKey}" was not found in the registry`, blocksCommit: true })
        } else if (!kpi.isActive) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'INACTIVE_KPI', message: `KPI "${raw.kpiKey}" is inactive`, blocksCommit: true })
        } else if (kpi.lifecycleStage === 'archived') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'ARCHIVED_KPI', message: `KPI "${raw.kpiKey}" is archived and cannot receive new actuals`, blocksCommit: true })
        } else if ((kpi.lifecycleStage ?? 'production_evaluation') !== 'production_evaluation') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'KPI_NOT_PRODUCTION_EVALUATION', message: `KPI "${raw.kpiKey}" is not in production_evaluation — only production KPIs accept bulk actuals`, blocksCommit: true })
        } else if (!kpi.visibility.dashboardEnabled) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_ACTUALS', code: 'DASHBOARD_IMPORT_NOT_ENABLED', message: `KPI "${raw.kpiKey}" is not dashboard-enabled and cannot receive bulk actuals`, blocksCommit: true })
        } else {
          actualField = getActualFieldName(raw.kpiKey, deps.registry)
        }
      }

      let value: number | null = null
      if (raw.valueRaw == null || raw.valueRaw.trim() === '') {
        issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'PHARMACIST_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'Actual Value is required — omit the row entirely to leave an actual untouched', blocksCommit: true })
      } else {
        const n = Number(raw.valueRaw)
        if (isNaN(n) || !isFinite(n)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'PHARMACIST_ACTUALS', code: 'INVALID_ACTUAL_VALUE', message: `Actual Value "${raw.valueRaw}" must be numeric`, blocksCommit: true })
        } else if (n < 0) {
          issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'PHARMACIST_ACTUALS', code: 'NEGATIVE_ACTUAL_VALUE', message: 'Actual Value cannot be negative', blocksCommit: true })
        } else {
          value = n
        }
      }

      const reviewRequired = issues.some((i) => i.requiresReview)
      if (reviewRequired) return { classification: 'CONFLICT', issues }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: PharmacistActualStaged = {
        userId: pharmacist!.id, pharmacyId: branch!.id,
        date: date!, kpiKey: raw.kpiKey!, actualField: actualField!, value: value!,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: PharmacistActualStaged[]): DuplicateDetectionResult<PharmacistActualStaged> {
      const seen = new Map<string, PharmacistActualStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: PharmacistActualStaged[]): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      const distinctDocIds = new Set(staged.map(docId))

      await Promise.all([...distinctDocIds].map(async (id) => {
        if (existingDocCache.has(id)) return
        const snap = await getDoc(doc(db, COL.KPI_ENTRIES, id))
        existingDocCache.set(id, snap.exists() ? (snap.data() as Record<string, unknown>) : null)
      }))

      for (const s of staged) {
        const docData = existingDocCache.get(docId(s))
        const existingValue = docData ? docData[s.actualField] : undefined
        map.set(identityKey(s), existingValue === undefined ? null : { value: Number(existingValue) })
      }
      return map
    },

    diffAgainstExisting(staged: PharmacistActualStaged, existing: unknown | null): RowDecision {
      const record = existing as { value: number } | null
      if (!record) return 'CREATE'
      if (record.value === staged.value) return 'SKIP'
      return 'UPDATE'
    },

    authorizeRow(_staged: PharmacistActualStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Pharmacist Actuals import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<PharmacistActualStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<PharmacistActualStaged>[], ctx: ImportCommitContext): Promise<{ id: string; field: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const result = await saveKpiActualEntry({
        userId:         staged.userId,
        pharmacyId:     staged.pharmacyId,
        date:           staged.date,
        actorId:        ctx.actorUid,
        actorRole:      ctx.actorRole,
        importBatchRef: ctx.jobId,
        [staged.actualField]: staged.value,
      })
      return { id: result.id, field: staged.actualField }
    },
  }
}
