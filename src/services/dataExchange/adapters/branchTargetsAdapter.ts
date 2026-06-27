// ============================================================
// BRANCH_TARGET Domain Adapter (DX-5a, KPI & Targets Bundle)
//
// Thin wrapper around the existing saveTarget() (kpiService.js) —
// no new collection, no parallel schema. Production target storage is
// ONE document per branch+month (`targets/{pharmacyId}_{month}`) with
// dynamic `[kpiKey]Target` fields, merged in via setDoc(...,{merge:
// true}). Each staged row writes exactly one KPI field on that shared
// doc — multiple rows for the same branch+month safely accumulate
// without clobbering each other (saveTarget() already merges).
//
// Canonical template: Month, Branch Code, KPI Key, Target Value.
// Notes/Source/Effective Date/Status were considered but have no field
// in the real `targets` document contract — excluded, not invented.
// ============================================================

import { doc, getDoc } from 'firebase/firestore'
import { db, COL } from '../dxFirebaseTypes'
import { saveTarget } from '../dxKpiTargetTypes'
import { getTargetFieldName } from '../../../engine/kpiRegistry/kpiUiAdapter'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import { pickField } from './columnAliasUtils'
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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Accepts 'YYYY-MM', 'YYYY/MM', and zero-pads a missing leading zero
 *  ('2026-6' -> '2026-06'). Returns null if unparseable. No broader
 *  month-name parsing exists anywhere in this codebase (verified) —
 *  not invented here either. */
export function normalizeMonthInput(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().replace('/', '-')
  if (MONTH_RE.test(cleaned)) return cleaned
  const m = cleaned.match(/^(\d{4})-(\d{1,2})$/)
  if (m) {
    const month = m[2].padStart(2, '0')
    const candidate = `${m[1]}-${month}`
    return MONTH_RE.test(candidate) ? candidate : null
  }
  return null
}

export interface BranchTargetRaw {
  rowIndex:       number
  monthRaw?:      string
  branchCode?:    string
  kpiKey?:        string
  targetValueRaw?: string
}

export interface BranchTargetStaged {
  branchCode:   string
  pharmacyId:   string
  month:        string
  kpiKey:       string
  targetField:  string
  value:        number
}

export interface ExistingBranchRecord {
  id:     string
  code:   string
  name:   string
  active: boolean
}

const HEADER_ALIASES = {
  month:  ['month', 'الشهر'],
  branch: ['branch code', 'branchcode', 'كود الفرع'],
  kpi:    ['kpi key', 'kpikey', 'مفتاح المؤشر'],
  value:  ['target value', 'targetvalue', 'قيمة الهدف'],
}

export interface BranchTargetsAdapterDeps {
  actorRole:        string
  existingBranches: ExistingBranchRecord[]
  registry:         KpiRegistry
}

export function createBranchTargetsAdapter(
  deps: BranchTargetsAdapterDeps,
): ImportDomainAdapter<BranchTargetRaw, BranchTargetStaged, { id: string; field: string }> {
  const existingByCode = new Map(deps.existingBranches.map((b) => [b.code.toUpperCase(), b]))
  const existingDocCache = new Map<string, Record<string, unknown> | null>()

  function identityKey(staged: BranchTargetStaged): string {
    return `${staged.pharmacyId}_${staged.kpiKey}_${staged.month}`
  }

  return {
    domain: 'BRANCH_TARGET',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const lower = header.trim().toLowerCase()
        const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(lower))
        return { sourceHeader: header, targetField: match ? match[0] : header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): BranchTargetRaw {
      return {
        rowIndex,
        monthRaw:       pickField(rawRow, HEADER_ALIASES.month),
        branchCode:     pickField(rawRow, HEADER_ALIASES.branch),
        kpiKey:         pickField(rawRow, HEADER_ALIASES.kpi),
        targetValueRaw: pickField(rawRow, HEADER_ALIASES.value),
      }
    },

    validateRow(raw: BranchTargetRaw, _ctx: ImportValidationContext): RowValidationOutcome<BranchTargetStaged> {
      const issues: ValidationIssue[] = []

      const month = normalizeMonthInput(raw.monthRaw)
      if (!month) {
        issues.push({ rowIndex: raw.rowIndex, column: 'month', entity: 'BRANCH_TARGET', code: 'INVALID_MONTH', message: `Month "${raw.monthRaw ?? ''}" must be in YYYY-MM format`, blocksCommit: true })
      }

      let branch: ExistingBranchRecord | undefined
      if (!raw.branchCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'Branch Code is required', blocksCommit: true })
      } else {
        branch = existingByCode.get(raw.branchCode.toUpperCase())
        if (!branch) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_TARGET', code: 'UNKNOWN_BRANCH', message: `Branch "${raw.branchCode}" was not found`, blocksCommit: true })
        } else if (!branch.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'BRANCH_TARGET', code: 'INACTIVE_BRANCH', message: `Branch "${raw.branchCode}" is inactive`, blocksCommit: true })
        }
      }

      let targetField: string | null = null
      if (!raw.kpiKey) {
        issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'KPI Key is required', blocksCommit: true })
      } else {
        const kpi = deps.registry[raw.kpiKey]
        if (!kpi) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_TARGET', code: 'UNKNOWN_KPI', message: `KPI "${raw.kpiKey}" was not found in the registry`, blocksCommit: true })
        } else if (kpi.lifecycleStage === 'archived') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_TARGET', code: 'ARCHIVED_KPI', message: `KPI "${raw.kpiKey}" is archived and cannot receive new targets`, blocksCommit: true })
        } else if (!kpi.visibility.targetInputEnabled) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'BRANCH_TARGET', code: 'TARGET_NOT_ENABLED', message: `KPI "${raw.kpiKey}" is not target-enabled`, blocksCommit: true })
        } else {
          targetField = getTargetFieldName(raw.kpiKey, deps.registry)
        }
      }

      let value: number | null = null
      if (raw.targetValueRaw == null || raw.targetValueRaw.trim() === '') {
        issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'BRANCH_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'Target Value is required — omit the row entirely to leave a target untouched', blocksCommit: true })
      } else {
        const n = Number(raw.targetValueRaw)
        if (isNaN(n) || !isFinite(n)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'BRANCH_TARGET', code: 'INVALID_TARGET_VALUE', message: `Target Value "${raw.targetValueRaw}" must be numeric`, blocksCommit: true })
        } else if (n < 0) {
          issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'BRANCH_TARGET', code: 'NEGATIVE_TARGET_VALUE', message: 'Target Value cannot be negative', blocksCommit: true })
        } else {
          value = n
        }
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: BranchTargetStaged = {
        branchCode: raw.branchCode!.toUpperCase(), pharmacyId: branch!.id,
        month: month!, kpiKey: raw.kpiKey!, targetField: targetField!, value: value!,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: BranchTargetStaged[]): DuplicateDetectionResult<BranchTargetStaged> {
      const seen = new Map<string, BranchTargetStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: BranchTargetStaged[]): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      const distinctDocIds = new Set(staged.map((s) => `${s.pharmacyId}_${s.month}`))

      await Promise.all([...distinctDocIds].map(async (docId) => {
        if (existingDocCache.has(docId)) return
        const snap = await getDoc(doc(db, COL.TARGETS, docId))
        existingDocCache.set(docId, snap.exists() ? (snap.data() as Record<string, unknown>) : null)
      }))

      for (const s of staged) {
        const docId = `${s.pharmacyId}_${s.month}`
        const docData = existingDocCache.get(docId)
        const existingValue = docData ? docData[s.targetField] : undefined
        map.set(identityKey(s), existingValue === undefined ? null : { value: Number(existingValue) })
      }
      return map
    },

    diffAgainstExisting(staged: BranchTargetStaged, existing: unknown | null): RowDecision {
      const record = existing as { value: number } | null
      if (!record) return 'CREATE'
      if (record.value === staged.value) return 'SKIP'
      return 'UPDATE'
    },

    authorizeRow(_staged: BranchTargetStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Branch Target import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<BranchTargetStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<BranchTargetStaged>[], ctx: ImportCommitContext): Promise<{ id: string; field: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const result = await saveTarget({
        pharmacyId: staged.pharmacyId,
        month:      staged.month,
        actorId:    ctx.actorUid,
        actorRole:  ctx.actorRole,
        [staged.targetField]: staged.value,
      })
      return { id: result.id, field: staged.targetField }
    },
  }
}
