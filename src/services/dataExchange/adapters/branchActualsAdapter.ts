// ============================================================
// BRANCH_ACTUALS Domain Adapter (DX-6, Actuals & Large Files Bundle)
//
// Writes branch-level KPI actuals through the SAME production
// kpi_entries contract used by manual pharmacist entry — there is no
// branch-only (non-user-attributed) actuals contract in this codebase.
// Resolved ambiguity (documented, not invented): a branch actual is
// attributed to the branch's managerUid (PharmacyRecord.managerUid).
// A branch with no manager assigned cannot receive a Branch Actual
// import row — surfaced as an explicit blocking error, never silently
// dropped or attributed to the wrong identity.
//
// This is a NEW adapter, not a modification of the legacy
// kpiActualsAdapter.ts (KPI_ACTUALS domain), whose silent-upsert
// design (loadExistingRecords always empty, diffAgainstExisting
// always CREATE) is a deliberate, documented architecture decision
// that this bundle does not change. BRANCH_ACTUALS has REAL conflict
// detection — never a silent overwrite.
//
// Commits via saveKpiActualEntry() (dxKpiEntryTypes.ts wrapper around
// the real saveKpiEntry()), one row at a time (chunkSize:1), exactly
// the same per-row convention as branchTargetsAdapter.ts. The matching
// Firestore rule bypass (kpi_entries create, firestore.rules) requires
// importedViaDataExchange:true + a non-empty importBatchRef — both are
// set automatically by saveKpiActualEntry()/saveKpiEntry().
// ============================================================

import { doc, getDoc } from 'firebase/firestore'
import { db, COL } from '../dxFirebaseTypes'
import { saveKpiActualEntry } from '../dxKpiEntryTypes'
import { getActualFieldName } from '../../../engine/kpiRegistry/kpiUiAdapter'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import { pickField, findAliasMatch } from './columnAliasUtils'
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Accepts 'YYYY-MM-DD' and 'YYYY/MM/DD', zero-pads a missing leading
 *  zero on month/day. Returns null if unparseable. No broader date-text
 *  parsing exists anywhere in this codebase (verified) — not invented here. */
export function normalizeDateInput(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/\//g, '-')
  if (DATE_RE.test(cleaned)) return cleaned
  const m = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const month = m[2].padStart(2, '0')
    const day   = m[3].padStart(2, '0')
    const candidate = `${m[1]}-${month}-${day}`
    return DATE_RE.test(candidate) ? candidate : null
  }
  return null
}

export interface BranchActualRaw {
  rowIndex:   number
  dateRaw?:   string
  branchCode?: string
  kpiKey?:    string
  valueRaw?:  string
}

export interface BranchActualStaged {
  branchCode:  string
  pharmacyId:  string
  managerUid:  string
  date:        string
  kpiKey:      string
  actualField: string
  value:       number
}

export interface ExistingBranchActualsRecord {
  id:         string
  code:       string
  name:       string
  active:     boolean
  managerUid: string | null
}

export const HEADER_ALIASES = {
  date:   ['date', 'entry date', 'التاريخ'],
  branch: ['branch code', 'branchcode', 'branch', 'branch id', 'كود الفرع', 'الفرع'],
  kpi:    ['kpi key', 'kpikey', 'kpi code', 'kpi', 'مفتاح المؤشر', 'المؤشر'],
  value:  ['actual value', 'actualvalue', 'actual', 'value', 'القيمة الفعلية', 'القيمة'],
}

export interface BranchActualsAdapterDeps {
  actorRole:        string
  existingBranches: ExistingBranchActualsRecord[]
  registry:         KpiRegistry
  today?:           string
}

export function createBranchActualsAdapter(
  deps: BranchActualsAdapterDeps,
): ImportDomainAdapter<BranchActualRaw, BranchActualStaged, { id: string; field: string }> {
  const existingByCode = new Map(deps.existingBranches.map((b) => [b.code.toUpperCase(), b]))
  const existingDocCache = new Map<string, Record<string, unknown> | null>()
  const today = deps.today ?? new Date().toISOString().split('T')[0]

  function identityKey(staged: BranchActualStaged): string {
    return `${staged.managerUid}_${staged.pharmacyId}_${staged.date}_${staged.kpiKey}`
  }

  function docId(staged: BranchActualStaged): string {
    return `${staged.managerUid}_${staged.pharmacyId}_${staged.date}`
  }

  return {
    domain: 'BRANCH_ACTUALS',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const match = findAliasMatch(header, HEADER_ALIASES)
        return { sourceHeader: header, targetField: match ?? header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): BranchActualRaw {
      return {
        rowIndex,
        dateRaw:    pickField(rawRow, HEADER_ALIASES.date),
        branchCode: pickField(rawRow, HEADER_ALIASES.branch),
        kpiKey:     pickField(rawRow, HEADER_ALIASES.kpi),
        valueRaw:   pickField(rawRow, HEADER_ALIASES.value),
      }
    },

    validateRow(raw: BranchActualRaw, _ctx: ImportValidationContext): RowValidationOutcome<BranchActualStaged> {
      const issues: ValidationIssue[] = []

      const date = normalizeDateInput(raw.dateRaw)
      if (!date) {
        issues.push({ rowIndex: raw.rowIndex, column: 'date', entity: 'BRANCH_ACTUALS', code: 'INVALID_DATE', message: `Date "${raw.dateRaw ?? ''}" must be in YYYY-MM-DD format`, blocksCommit: true })
      } else if (date > today) {
        issues.push({ rowIndex: raw.rowIndex, column: 'date', entity: 'BRANCH_ACTUALS', code: 'FUTURE_DATE', message: `Date "${date}" is in the future — actuals cannot be back-dated forward`, blocksCommit: true })
      }

      let branch: ExistingBranchActualsRecord | undefined
      if (!raw.branchCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'Branch Code is required', blocksCommit: true })
      } else {
        branch = existingByCode.get(raw.branchCode.toUpperCase())
        if (!branch) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_ACTUALS', code: 'UNKNOWN_BRANCH', message: `Branch "${raw.branchCode}" was not found`, blocksCommit: true })
        } else if (!branch.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_ACTUALS', code: 'INACTIVE_BRANCH', message: `Branch "${raw.branchCode}" is inactive`, blocksCommit: true })
        } else if (!branch.managerUid) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_ACTUALS', code: 'BRANCH_HAS_NO_MANAGER', message: `Branch "${raw.branchCode}" has no assigned manager — a Branch Actual cannot be attributed to anyone`, blocksCommit: true })
        }
      }

      let actualField: string | null = null
      if (!raw.kpiKey) {
        issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'KPI Key is required', blocksCommit: true })
      } else {
        const kpi = deps.registry[raw.kpiKey]
        if (!kpi) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'UNKNOWN_KPI', message: `KPI "${raw.kpiKey}" was not found in the registry`, blocksCommit: true })
        } else if (!kpi.isActive) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'INACTIVE_KPI', message: `KPI "${raw.kpiKey}" is inactive`, blocksCommit: true })
        } else if (kpi.lifecycleStage === 'archived') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'ARCHIVED_KPI', message: `KPI "${raw.kpiKey}" is archived and cannot receive new actuals`, blocksCommit: true })
        } else if ((kpi.lifecycleStage ?? 'production_evaluation') !== 'production_evaluation') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'KPI_NOT_PRODUCTION_EVALUATION', message: `KPI "${raw.kpiKey}" is not in production_evaluation — only production KPIs accept bulk actuals`, blocksCommit: true })
        } else if (!kpi.visibility.dashboardEnabled) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_ACTUALS', code: 'DASHBOARD_IMPORT_NOT_ENABLED', message: `KPI "${raw.kpiKey}" is not dashboard-enabled and cannot receive bulk actuals`, blocksCommit: true })
        } else {
          actualField = getActualFieldName(raw.kpiKey, deps.registry)
        }
      }

      let value: number | null = null
      if (raw.valueRaw == null || raw.valueRaw.trim() === '') {
        issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'BRANCH_ACTUALS', code: 'MISSING_REQUIRED_FIELD', message: 'Actual Value is required — omit the row entirely to leave an actual untouched', blocksCommit: true })
      } else {
        const n = Number(raw.valueRaw)
        if (isNaN(n) || !isFinite(n)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'BRANCH_ACTUALS', code: 'INVALID_ACTUAL_VALUE', message: `Actual Value "${raw.valueRaw}" must be numeric`, blocksCommit: true })
        } else if (n < 0) {
          issues.push({ rowIndex: raw.rowIndex, column: 'actualValue', entity: 'BRANCH_ACTUALS', code: 'NEGATIVE_ACTUAL_VALUE', message: 'Actual Value cannot be negative', blocksCommit: true })
        } else {
          value = n
        }
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: BranchActualStaged = {
        branchCode: raw.branchCode!.toUpperCase(), pharmacyId: branch!.id, managerUid: branch!.managerUid!,
        date: date!, kpiKey: raw.kpiKey!, actualField: actualField!, value: value!,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: BranchActualStaged[]): DuplicateDetectionResult<BranchActualStaged> {
      const seen = new Map<string, BranchActualStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: BranchActualStaged[]): Promise<Map<string, unknown>> {
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

    diffAgainstExisting(staged: BranchActualStaged, existing: unknown | null): RowDecision {
      const record = existing as { value: number } | null
      if (!record) return 'CREATE'
      if (record.value === staged.value) return 'SKIP'
      return 'UPDATE'
    },

    authorizeRow(_staged: BranchActualStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Branch Actuals import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<BranchActualStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<BranchActualStaged>[], ctx: ImportCommitContext): Promise<{ id: string; field: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const result = await saveKpiActualEntry({
        userId:         staged.managerUid,
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
