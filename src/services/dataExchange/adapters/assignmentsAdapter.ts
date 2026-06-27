// ============================================================
// ASSIGNMENTS Domain Adapter (DX-2/DX-3, Part 6)
//
// Scope: primary pharmacist/manager/branch_manager <-> branch
// assignment only. The current data model has exactly ONE field for
// this relationship — `users/{uid}.pharmacyId` (a single value, not a
// list) — so "one primary branch per pharmacist" is already a
// structural invariant, not something this adapter has to enforce
// with new state. There is no existing field for a "secondary" branch
// on an ordinary pharmacist, so secondary-assignment rows are reported
// as unsupported rather than inventing a new array field. Reuses the
// existing transferUser() service call — no parallel assignment schema.
//
// district_supervisor / regional_manager territory assignment
// (districtId / regionIds) is a different existing mechanism, already
// covered by the GROUPS adapter's `supervisorUid` field — not
// duplicated here.
// ============================================================

import { transferUser } from '../dxUserTypes'
import type { GuardContext } from '../../security/accessGuard'
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

export interface AssignmentRaw {
  rowIndex:       number
  employeeId?:    string
  branchCode?:    string
  assignmentType?: string
  startDateRaw?:  string
  endDateRaw?:    string
}

export interface AssignmentStaged {
  employeeId:  string
  pharmacyId:  string
  startDate:   string | null
  endDate:     string | null
}

const HEADER_ALIASES = {
  employeeId: ['employee id', 'employeeid', 'الرقم الوظيفي'],
  branch:     ['branch', 'branch code', 'الفرع', 'كود الفرع'],
  type:       ['assignment type', 'type', 'primary/secondary', 'نوع التكليف'],
  start:      ['start date', 'startdate', 'effective start', 'تاريخ البدء'],
  end:        ['end date', 'enddate', 'effective end', 'تاريخ الانتهاء'],
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface AssignmentsAdapterDeps {
  guardCtx:               GuardContext
  actorRole:              string
  resolvablePharmacistIds: Map<string, string>   // employeeId -> uid/docId
  resolvableBranchCodes:   Map<string, string>   // branch code -> pharmacyId
  /** Existing primary pharmacyId per employeeId, for conflict/no-op detection. */
  existingPrimaryByEmployeeId: Map<string, string>
}

export function createAssignmentsAdapter(
  deps: AssignmentsAdapterDeps,
): ImportDomainAdapter<AssignmentRaw, AssignmentStaged, { id: string }> {
  // Tracks open primary intervals seen so far in this file, per employee,
  // to detect "two active primary branches" within the same upload.
  const primaryIntervalsSeen = new Map<string, Array<{ start: string | null; end: string | null; pharmacyId: string }>>()

  function overlaps(a: { start: string | null; end: string | null }, b: { start: string | null; end: string | null }): boolean {
    const aStart = a.start ?? '0000-01-01', aEnd = a.end ?? '9999-12-31'
    const bStart = b.start ?? '0000-01-01', bEnd = b.end ?? '9999-12-31'
    return aStart <= bEnd && bStart <= aEnd
  }

  function identityKey(staged: AssignmentStaged): string {
    return `${staged.employeeId}:${staged.pharmacyId}:${staged.startDate ?? 'open'}`
  }

  return {
    domain: 'ASSIGNMENT',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const lower = header.trim().toLowerCase()
        const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(lower))
        return { sourceHeader: header, targetField: match ? match[0] : header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): AssignmentRaw {
      return {
        rowIndex,
        employeeId:     pickField(rawRow, HEADER_ALIASES.employeeId),
        branchCode:     pickField(rawRow, HEADER_ALIASES.branch),
        assignmentType: (pickField(rawRow, HEADER_ALIASES.type) || 'primary').toLowerCase(),
        startDateRaw:   pickField(rawRow, HEADER_ALIASES.start),
        endDateRaw:     pickField(rawRow, HEADER_ALIASES.end),
      }
    },

    validateRow(raw: AssignmentRaw, _ctx: ImportValidationContext): RowValidationOutcome<AssignmentStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.employeeId) {
        issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'ASSIGNMENT', code: 'UNKNOWN_PHARMACIST', message: 'Employee ID is required', blocksCommit: true })
      } else if (!deps.resolvablePharmacistIds.has(raw.employeeId)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'ASSIGNMENT', code: 'DEPENDENCY_BLOCKED', message: `Pharmacist "${raw.employeeId}" was not found or failed earlier in this job`, blocksCommit: true })
      }

      let pharmacyId: string | null = null
      if (!raw.branchCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'branch', entity: 'ASSIGNMENT', code: 'UNKNOWN_BRANCH', message: 'Branch code is required', blocksCommit: true })
      } else {
        pharmacyId = deps.resolvableBranchCodes.get(raw.branchCode) ?? null
        if (!pharmacyId) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branch', entity: 'ASSIGNMENT', code: 'DEPENDENCY_BLOCKED', message: `Branch "${raw.branchCode}" was not found or failed earlier in this job`, blocksCommit: true })
        }
      }

      if (raw.assignmentType && raw.assignmentType !== 'primary') {
        issues.push({
          rowIndex: raw.rowIndex, column: 'type', entity: 'ASSIGNMENT', code: 'UNSUPPORTED_ASSIGNMENT_TYPE',
          message: `Assignment type "${raw.assignmentType}" is not supported — the current data model has no secondary/float branch field for pharmacists`,
          blocksCommit: true,
        })
      }

      let startDate: string | null = null, endDate: string | null = null
      if (raw.startDateRaw) {
        if (!DATE_RE.test(raw.startDateRaw)) issues.push({ rowIndex: raw.rowIndex, column: 'start', entity: 'ASSIGNMENT', code: 'INVALID_ASSIGNMENT_DATE', message: `Start date "${raw.startDateRaw}" must be yyyy-MM-dd`, blocksCommit: true })
        else startDate = raw.startDateRaw
      }
      if (raw.endDateRaw) {
        if (!DATE_RE.test(raw.endDateRaw)) issues.push({ rowIndex: raw.rowIndex, column: 'end', entity: 'ASSIGNMENT', code: 'INVALID_ASSIGNMENT_DATE', message: `End date "${raw.endDateRaw}" must be yyyy-MM-dd`, blocksCommit: true })
        else endDate = raw.endDateRaw
      }
      if (startDate && endDate && endDate < startDate) {
        issues.push({ rowIndex: raw.rowIndex, column: 'end', entity: 'ASSIGNMENT', code: 'INVALID_ASSIGNMENT_DATE', message: 'End date cannot be before start date', blocksCommit: true })
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      // Overlapping primary assignments for the same employee within this
      // file. An exact repeat of the SAME branch+interval is not a conflict
      // — it's an exact duplicate, left to the generic identity-key dedup
      // below (Part 5: "duplicate rows... last-row-wins, shown not hidden").
      // Only a different branch with an overlapping date range is a real
      // "two active primary branches" conflict.
      if (raw.employeeId && pharmacyId) {
        const interval = { start: startDate, end: endDate, pharmacyId }
        const prior = primaryIntervalsSeen.get(raw.employeeId) ?? []
        const exactRepeat = prior.some((p) => p.pharmacyId === pharmacyId && p.start === startDate && p.end === endDate)
        const overlappingDifferentBranch = !exactRepeat && prior.some((p) => p.pharmacyId !== pharmacyId && overlaps(p, interval))
        if (overlappingDifferentBranch) {
          issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'ASSIGNMENT', code: 'OVERLAPPING_PRIMARY_ASSIGNMENT', message: `Employee ${raw.employeeId} already has an overlapping primary assignment to a different branch in this file`, blocksCommit: true })
          return { classification: 'ERROR', issues }
        }
        if (!exactRepeat) primaryIntervalsSeen.set(raw.employeeId, [...prior, interval])
      }

      const staged: AssignmentStaged = { employeeId: raw.employeeId!, pharmacyId: pharmacyId!, startDate, endDate }
      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: AssignmentStaged[]): DuplicateDetectionResult<AssignmentStaged> {
      const seen = new Map<string, AssignmentStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: AssignmentStaged[]): Promise<Map<string, unknown>> {
      // Keyed by each row's own identityKey (not bare employeeId) so the
      // engine's `existing.get(identityKey(staged))` lookup actually hits.
      const map = new Map<string, unknown>()
      for (const s of staged) {
        const existingPharmacyId = deps.existingPrimaryByEmployeeId.get(s.employeeId)
        if (existingPharmacyId !== undefined) map.set(identityKey(s), existingPharmacyId)
      }
      return map
    },

    diffAgainstExisting(staged: AssignmentStaged, existing: unknown | null): RowDecision {
      const existingPharmacyId = existing as string | null
      if (existingPharmacyId == null) return 'CREATE'
      if (existingPharmacyId === staged.pharmacyId) return 'SKIP'   // idempotent re-import, no-op
      return 'UPDATE'   // re-assigning to a different branch — explicit, never silent
    },

    authorizeRow(_staged: AssignmentStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Assignment import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<AssignmentStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<AssignmentStaged>[], ctx: ImportCommitContext): Promise<{ id: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const uid = deps.resolvablePharmacistIds.get(staged.employeeId)
      if (!uid) throw new Error(`Pharmacist "${staged.employeeId}" could not be resolved at commit time`)

      await transferUser(uid, staged.pharmacyId, ctx.actorUid, ctx.actorRole)
      return { id: uid }
    },
  }
}
