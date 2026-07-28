// ============================================================
// PHARMACIST_TARGET Domain Adapter (DX-5b, KPI & Targets Bundle)
//
// Thin wrapper around the existing savePersonalTarget() (personal
// TargetService.ts) — no new collection, no parallel schema. Production
// personal-target storage is ONE document per pharmacist+branch+month
// (`personal_targets/{userId}_{pharmacyId}_{month}`) holding a single
// `targets: Record<targetField, number>` map, written via setDoc(...,
// {merge:true}). Firestore merge:true REPLACES a nested object field
// wholesale rather than deep-merging it — calling savePersonalTarget()
// once per KPI row with only that one field would silently clobber
// every other KPI target already on the same doc. This adapter avoids
// that by keeping an in-memory per-job cache of each doc's full targets
// map (seeded from the existing doc, mutated as each row commits) and
// always writing the FULL accumulated map, never a single-field slice.
//
// Pharmacist identity reuses fetchExistingOnboardingData()'s
// CLAIMED-excluding employeeId/email maps — the same authoritative
// boundary already established for "active operational pharmacist"
// elsewhere in this codebase. A CLAIMED record is never in that map,
// so it can never resolve here either; it simply reads as "unknown
// pharmacist", which is the correct, auditable outcome.
// ============================================================

import { doc, getDoc } from 'firebase/firestore'
import { db, COL } from '../dxFirebaseTypes'
import { savePersonalTarget } from '../../personalTargetService'
import { getTargetFieldName } from '../../../engine/kpiRegistry/kpiUiAdapter'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './pharmacistsAdapter'
import { pickField, findAliasMatch } from './columnAliasUtils'
import { normalizeMonthInput } from './branchTargetsAdapter'
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

export interface PharmacistTargetRaw {
  rowIndex:         number
  monthRaw?:        string
  pharmacistIdRaw?: string
  branchCode?:      string
  kpiKey?:          string
  targetValueRaw?:  string
}

export interface PharmacistTargetStaged {
  userId:       string
  pharmacyId:   string
  month:        string
  kpiKey:       string
  targetField:  string
  value:        number
}

export interface ExistingBranchRecordRef {
  id:     string
  code:   string
  active: boolean
}

export const HEADER_ALIASES = {
  month:        ['month', 'period', 'الشهر'],
  pharmacistId: ['pharmacist identifier', 'pharmacistidentifier', 'employee id', 'employeeid', 'staff id', 'الرقم الوظيفي'],
  branch:       ['branch code', 'branchcode', 'branch', 'branch id', 'كود الفرع', 'الفرع'],
  kpi:          ['kpi key', 'kpikey', 'kpi code', 'kpi', 'مفتاح المؤشر', 'المؤشر'],
  value:        ['target value', 'targetvalue', 'target', 'value', 'قيمة الهدف', 'الهدف'],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PharmacistTargetsAdapterDeps {
  actorRole:               string
  existingBranches:        ExistingBranchRecordRef[]
  registry:                KpiRegistry
  pharmacistsByEmployeeId: Map<string, ExistingPharmacistRecord>
  pharmacistsByEmail:      Map<string, ExistingPharmacistRecord>
}

export function createPharmacistTargetsAdapter(
  deps: PharmacistTargetsAdapterDeps,
): ImportDomainAdapter<PharmacistTargetRaw, PharmacistTargetStaged, { id: string; field: string }> {
  const existingByCode = new Map(deps.existingBranches.map((b) => [b.code.toUpperCase(), b]))
  const pharmacistsByUid = new Map(
    [...deps.pharmacistsByEmployeeId.values()].map((r) => [r.id, r]),
  )
  // Per-job cache of each personal_targets doc's full `targets` map —
  // seeded from Firestore once, then mutated cumulatively as rows for
  // the SAME doc commit one KPI field at a time within this job run.
  const targetsByDocId = new Map<string, Record<string, number>>()

  function resolvePharmacist(identifier: string): ExistingPharmacistRecord | null {
    if (deps.pharmacistsByEmployeeId.has(identifier)) return deps.pharmacistsByEmployeeId.get(identifier)!
    if (EMAIL_RE.test(identifier) && deps.pharmacistsByEmail.has(identifier.toLowerCase())) {
      return deps.pharmacistsByEmail.get(identifier.toLowerCase())!
    }
    if (pharmacistsByUid.has(identifier)) return pharmacistsByUid.get(identifier)!
    return null
  }

  function identityKey(staged: PharmacistTargetStaged): string {
    return `${staged.userId}_${staged.pharmacyId}_${staged.month}_${staged.kpiKey}`
  }

  function docId(staged: PharmacistTargetStaged): string {
    return `${staged.userId}_${staged.pharmacyId}_${staged.month}`
  }

  return {
    domain: 'PHARMACIST_TARGET',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const match = findAliasMatch(header, HEADER_ALIASES)
        return { sourceHeader: header, targetField: match ?? header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): PharmacistTargetRaw {
      return {
        rowIndex,
        monthRaw:        pickField(rawRow, HEADER_ALIASES.month),
        pharmacistIdRaw: pickField(rawRow, HEADER_ALIASES.pharmacistId),
        branchCode:      pickField(rawRow, HEADER_ALIASES.branch),
        kpiKey:          pickField(rawRow, HEADER_ALIASES.kpi),
        targetValueRaw:  pickField(rawRow, HEADER_ALIASES.value),
      }
    },

    validateRow(raw: PharmacistTargetRaw, _ctx: ImportValidationContext): RowValidationOutcome<PharmacistTargetStaged> {
      const issues: ValidationIssue[] = []

      const month = normalizeMonthInput(raw.monthRaw)
      if (!month) {
        issues.push({ rowIndex: raw.rowIndex, column: 'month', entity: 'PHARMACIST_TARGET', code: 'INVALID_MONTH', message: `Month "${raw.monthRaw ?? ''}" must be in YYYY-MM format`, blocksCommit: true })
      }

      let branch: ExistingBranchRecordRef | undefined
      if (!raw.branchCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'Branch Code is required', blocksCommit: true })
      } else {
        branch = existingByCode.get(raw.branchCode.toUpperCase())
        if (!branch) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_TARGET', code: 'UNKNOWN_BRANCH', message: `Branch "${raw.branchCode}" was not found`, blocksCommit: true })
        } else if (!branch.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_TARGET', code: 'INACTIVE_BRANCH', message: `Branch "${raw.branchCode}" is inactive`, blocksCommit: true })
        }
      }

      let pharmacist: ExistingPharmacistRecord | null = null
      if (!raw.pharmacistIdRaw) {
        issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'Pharmacist Identifier is required', blocksCommit: true })
      } else {
        pharmacist = resolvePharmacist(raw.pharmacistIdRaw)
        if (!pharmacist) {
          // A CLAIMED record never appears in pharmacistsByEmployeeId/
          // pharmacistsByEmail/pharmacistsByUid (fetchExistingOnboardingData
          // excludes it) — this same branch covers both "truly unknown" and
          // "identifier only matches a superseded CLAIMED record".
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_TARGET', code: 'UNKNOWN_PHARMACIST', message: `Pharmacist "${raw.pharmacistIdRaw}" was not found as an active or pending-invitation operational record`, blocksCommit: true })
        } else if (!pharmacist.active) {
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_TARGET', code: 'INACTIVE_PHARMACIST', message: `Pharmacist "${raw.pharmacistIdRaw}" is deactivated`, blocksCommit: true })
        } else if (pharmacist.hasIdentityAmbiguity) {
          issues.push({ rowIndex: raw.rowIndex, column: 'pharmacistId', entity: 'PHARMACIST_TARGET', code: 'IDENTITY_REVIEW_REQUIRED', message: `Pharmacist "${raw.pharmacistIdRaw}" has more than one existing user record — requires manual review`, blocksCommit: true, requiresReview: true })
        } else if (branch && pharmacist.pharmacyId && pharmacist.pharmacyId !== branch.id) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branchCode', entity: 'PHARMACIST_TARGET', code: 'PHARMACIST_BRANCH_MISMATCH', message: `Pharmacist "${raw.pharmacistIdRaw}" does not belong to branch "${raw.branchCode}"`, blocksCommit: true })
        }
      }

      let targetField: string | null = null
      if (!raw.kpiKey) {
        issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'KPI Key is required', blocksCommit: true })
      } else {
        const kpi = deps.registry[raw.kpiKey]
        if (!kpi) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_TARGET', code: 'UNKNOWN_KPI', message: `KPI "${raw.kpiKey}" was not found in the registry`, blocksCommit: true })
        } else if (kpi.lifecycleStage === 'archived') {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_TARGET', code: 'ARCHIVED_KPI', message: `KPI "${raw.kpiKey}" is archived and cannot receive new targets`, blocksCommit: true })
        } else if (!kpi.visibility.targetInputEnabled) {
          issues.push({ rowIndex: raw.rowIndex, column: 'kpiKey', entity: 'PHARMACIST_TARGET', code: 'TARGET_NOT_ENABLED', message: `KPI "${raw.kpiKey}" is not target-enabled`, blocksCommit: true })
        } else {
          targetField = getTargetFieldName(raw.kpiKey, deps.registry)
        }
      }

      let value: number | null = null
      if (raw.targetValueRaw == null || raw.targetValueRaw.trim() === '') {
        issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'PHARMACIST_TARGET', code: 'MISSING_REQUIRED_FIELD', message: 'Target Value is required — omit the row entirely to leave a target untouched', blocksCommit: true })
      } else {
        const n = Number(raw.targetValueRaw)
        if (isNaN(n) || !isFinite(n)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'PHARMACIST_TARGET', code: 'INVALID_TARGET_VALUE', message: `Target Value "${raw.targetValueRaw}" must be numeric`, blocksCommit: true })
        } else if (n < 0) {
          issues.push({ rowIndex: raw.rowIndex, column: 'targetValue', entity: 'PHARMACIST_TARGET', code: 'NEGATIVE_TARGET_VALUE', message: 'Target Value cannot be negative', blocksCommit: true })
        } else {
          value = n
        }
      }

      const reviewRequired = issues.some((i) => i.requiresReview)
      if (reviewRequired) return { classification: 'CONFLICT', issues }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: PharmacistTargetStaged = {
        userId: pharmacist!.id, pharmacyId: branch!.id,
        month: month!, kpiKey: raw.kpiKey!, targetField: targetField!, value: value!,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: PharmacistTargetStaged[]): DuplicateDetectionResult<PharmacistTargetStaged> {
      const seen = new Map<string, PharmacistTargetStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: PharmacistTargetStaged[]): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      const distinctDocIds = new Set(staged.map(docId))

      await Promise.all([...distinctDocIds].map(async (id) => {
        if (targetsByDocId.has(id)) return
        const snap = await getDoc(doc(db, COL.PERSONAL_TARGETS, id))
        const data = snap.exists() ? (snap.data() as { targets?: Record<string, number> }) : null
        targetsByDocId.set(id, { ...(data?.targets ?? {}) })
      }))

      for (const s of staged) {
        const existingTargets = targetsByDocId.get(docId(s)) ?? {}
        const existingValue = existingTargets[s.targetField]
        map.set(identityKey(s), existingValue === undefined ? null : { value: existingValue })
      }
      return map
    },

    diffAgainstExisting(staged: PharmacistTargetStaged, existing: unknown | null): RowDecision {
      const record = existing as { value: number } | null
      if (!record) return 'CREATE'
      if (record.value === staged.value) return 'SKIP'
      return 'UPDATE'
    },

    authorizeRow(_staged: PharmacistTargetStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Pharmacist Target import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<PharmacistTargetStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<PharmacistTargetStaged>[], ctx: ImportCommitContext): Promise<{ id: string; field: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const id = docId(staged)
      const current = targetsByDocId.get(id) ?? {}
      current[staged.targetField] = staged.value
      targetsByDocId.set(id, current)

      const result = await savePersonalTarget(
        { userId: staged.userId, pharmacyId: staged.pharmacyId, month: staged.month, targets: { ...current }, allocationMethod: 'custom' },
        ctx.actorUid, ctx.actorRole,
      )
      return { id: result.id, field: staged.targetField }
    },
  }
}
