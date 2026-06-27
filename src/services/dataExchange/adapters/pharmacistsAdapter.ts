// ============================================================
// PHARMACISTS Domain Adapter (DX-2/DX-3, Part 5)
//
// Approved account-creation decision: bulk import NEVER creates a
// Firebase Auth account or admin-supplied password. It writes the
// operational `users/{docId}` Firestore profile only, with
// `authStatus: 'PENDING_INVITATION'` and a synthetic, deterministic
// doc ID (`pending_${employeeId}` — never a real Auth UID, so it can
// never collide with one). Activation to a real Firebase Auth account
// remains the existing manual createUser() flow's job — out of scope
// here, documented as a known limitation in the DX-2/DX-3 report.
//
// Existing users created by the legacy createUser() flow have NO
// `authStatus` field at all. Any existing record without that field is
// treated as the safe default 'ACTIVE' (Auth-backed) — never silently
// overwritten — so this adapter never weakens protection for
// already-real accounts.
// ============================================================

import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, COL } from '../dxFirebaseTypes'
import { logAction, AUDIT_ACTION } from '../dxAuditTypes'
import type { GuardContext } from '../../security/accessGuard'
import { pickField, parseStatusToActive } from './columnAliasUtils'
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

const ALLOWED_BULK_ROLES = ['pharmacist', 'manager', 'branch_manager', 'district_supervisor', 'regional_manager']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PharmacistRaw {
  rowIndex:      number
  employeeId?:   string
  name?:         string
  email?:        string
  phone?:        string
  role?:         string
  branchCode?:   string
  joiningDateRaw?: string
  leavingDateRaw?: string
  statusRaw?:    string
}

export interface PharmacistStaged {
  employeeId:   string
  displayName:  string
  email:        string | null
  phone:        string | null
  role:         string
  pharmacyId:   string | null
  joiningDate:  string | null
  leavingDate:  string | null
  active:       boolean
}

export interface ExistingPharmacistRecord {
  id:           string
  employeeId:   string
  email:        string | null
  role:         string
  pharmacyId:   string | null
  authStatus:   'ACTIVE' | 'PENDING_INVITATION'
  /** True when more than one non-CLAIMED user document shares this
   *  employeeId (e.g. a pending record AND an active Auth-linked record
   *  both exist) — Part 3 closure patch: this is itself an identity
   *  conflict, never silently resolved by picking one. */
  hasIdentityAmbiguity?: boolean
  /** KPI & Targets Bundle (DX-5) addition: operational active flag —
   *  distinct from authStatus. A pharmacist can be authStatus 'ACTIVE'
   *  (real Auth-linked record) but `active: false` (deactivated
   *  employee). Defaults to true for any existing record without an
   *  explicit `active` field, matching docToKpiDefinition-style
   *  backward-compat defaults elsewhere in this codebase. Additive
   *  field — existing PHARMACIST adapter logic never reads it. */
  active:       boolean
}

const HEADER_ALIASES = {
  employeeId: ['employee id', 'employeeid', 'الرقم الوظيفي'],
  name:       ['name', 'full name', 'الاسم'],
  email:      ['email', 'البريد الإلكتروني'],
  phone:      ['phone', 'mobile', 'الهاتف'],
  role:       ['role', 'الدور'],
  branch:     ['branch', 'branch code', 'pharmacyid', 'الفرع', 'كود الفرع'],
  joining:    ['joining date', 'joiningdate', 'تاريخ الالتحاق'],
  leaving:    ['leaving date', 'leavingdate', 'تاريخ المغادرة'],
  status:     ['status', 'employment status', 'الحالة'],
}

export interface PharmacistsAdapterDeps {
  guardCtx:            GuardContext
  actorRole:           string
  existingByEmployeeId: Map<string, ExistingPharmacistRecord>
  existingByEmail:      Map<string, ExistingPharmacistRecord>
  resolvableBranchCodes: Map<string, string>   // code -> pharmacyId
}

export function createPharmacistsAdapter(
  deps: PharmacistsAdapterDeps,
): ImportDomainAdapter<PharmacistRaw, PharmacistStaged, { id: string }> {
  const seenEmailsInFile = new Map<string, string>()   // email(lower) -> employeeId
  const seenEmployeeIdsInFile = new Map<string, string>()   // employeeId -> email(lower)

  function identityKey(staged: PharmacistStaged): string {
    return staged.employeeId
  }

  return {
    domain: 'PHARMACIST',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const lower = header.trim().toLowerCase()
        const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(lower))
        return { sourceHeader: header, targetField: match ? match[0] : header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): PharmacistRaw {
      return {
        rowIndex,
        employeeId:     pickField(rawRow, HEADER_ALIASES.employeeId),
        name:           pickField(rawRow, HEADER_ALIASES.name),
        email:          pickField(rawRow, HEADER_ALIASES.email)?.toLowerCase(),
        phone:          pickField(rawRow, HEADER_ALIASES.phone),
        role:           pickField(rawRow, HEADER_ALIASES.role),
        branchCode:     pickField(rawRow, HEADER_ALIASES.branch),
        joiningDateRaw: pickField(rawRow, HEADER_ALIASES.joining),
        leavingDateRaw: pickField(rawRow, HEADER_ALIASES.leaving),
        statusRaw:      pickField(rawRow, HEADER_ALIASES.status),
      }
    },

    validateRow(raw: PharmacistRaw, _ctx: ImportValidationContext): RowValidationOutcome<PharmacistStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.employeeId) {
        issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'PHARMACIST', code: 'MISSING_EMPLOYEE_ID', message: 'Employee ID is required', blocksCommit: true })
      }
      if (!raw.name) {
        issues.push({ rowIndex: raw.rowIndex, column: 'name', entity: 'PHARMACIST', code: 'MISSING_REQUIRED_FIELD', message: 'Name is required', blocksCommit: true })
      }

      if (raw.email && !EMAIL_RE.test(raw.email)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'email', entity: 'PHARMACIST', code: 'INVALID_EMAIL', message: `"${raw.email}" is not a valid email`, blocksCommit: true })
      } else if (!raw.email) {
        issues.push({ rowIndex: raw.rowIndex, column: 'email', entity: 'PHARMACIST', code: 'MISSING_OPTIONAL_FIELD', message: 'Email is empty — record will remain usable, but cannot be invited until an email is added', blocksCommit: false })
      }

      if (!raw.role || !ALLOWED_BULK_ROLES.includes(raw.role)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'role', entity: 'PHARMACIST', code: 'UNSUPPORTED_ROLE', message: `Role "${raw.role ?? ''}" is not permitted for bulk import`, blocksCommit: true })
      }

      let pharmacyId: string | null = null
      if (raw.branchCode) {
        pharmacyId = deps.resolvableBranchCodes.get(raw.branchCode) ?? null
        if (!pharmacyId) {
          issues.push({ rowIndex: raw.rowIndex, column: 'branch', entity: 'PHARMACIST', code: 'DEPENDENCY_BLOCKED', message: `Branch "${raw.branchCode}" was not found or failed earlier in this job`, blocksCommit: true })
        }
      }

      const active = parseStatusToActive(raw.statusRaw)
      if (active === null) {
        issues.push({ rowIndex: raw.rowIndex, column: 'status', entity: 'PHARMACIST', code: 'INVALID_STATUS', message: `Unrecognized employment status "${raw.statusRaw}"`, blocksCommit: true })
      }

      let joiningDate: string | null = null
      let leavingDate: string | null = null
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
      if (raw.joiningDateRaw) {
        if (!DATE_RE.test(raw.joiningDateRaw)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'joining', entity: 'PHARMACIST', code: 'INVALID_EMPLOYMENT_DATE', message: `Joining date "${raw.joiningDateRaw}" must be yyyy-MM-dd`, blocksCommit: true })
        } else joiningDate = raw.joiningDateRaw
      }
      if (raw.leavingDateRaw) {
        if (!DATE_RE.test(raw.leavingDateRaw)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'leaving', entity: 'PHARMACIST', code: 'INVALID_EMPLOYMENT_DATE', message: `Leaving date "${raw.leavingDateRaw}" must be yyyy-MM-dd`, blocksCommit: true })
        } else leavingDate = raw.leavingDateRaw
      }
      if (joiningDate && leavingDate && leavingDate < joiningDate) {
        issues.push({ rowIndex: raw.rowIndex, column: 'leaving', entity: 'PHARMACIST', code: 'INVALID_EMPLOYMENT_DATE', message: 'Leaving date cannot be before joining date', blocksCommit: true })
      }

      // Duplicate email — within this file (employee identity may differ).
      if (raw.email && EMAIL_RE.test(raw.email)) {
        const earlierEmployeeId = seenEmailsInFile.get(raw.email)
        if (earlierEmployeeId && earlierEmployeeId !== raw.employeeId) {
          issues.push({ rowIndex: raw.rowIndex, column: 'email', entity: 'PHARMACIST', code: 'DUPLICATE_EMAIL', message: `Email "${raw.email}" is already used by employee ${earlierEmployeeId} in this file`, blocksCommit: true, requiresReview: true })
        } else if (raw.employeeId) {
          seenEmailsInFile.set(raw.email, raw.employeeId)
        }

        // Same employeeId appearing twice in this file with two DIFFERENT
        // emails — without this check, detectFileDuplicates()'s "last one
        // wins" dedup would silently pick whichever row happened to be
        // last, discarding the other email as if it never existed.
        if (raw.employeeId) {
          const earlierEmail = seenEmployeeIdsInFile.get(raw.employeeId)
          if (earlierEmail && earlierEmail !== raw.email) {
            issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'PHARMACIST', code: 'DUPLICATE_EMPLOYEE_ID_DIFFERENT_EMAIL', message: `Employee ${raw.employeeId} appears twice in this file with different emails ("${earlierEmail}" and "${raw.email}")`, blocksCommit: true, requiresReview: true })
          } else {
            seenEmployeeIdsInFile.set(raw.employeeId, raw.email)
          }
        }

        // Existing email already linked to a DIFFERENT employee — identity
        // conflict, never silently merged.
        const existingForEmail = deps.existingByEmail.get(raw.email)
        if (existingForEmail && existingForEmail.employeeId !== raw.employeeId) {
          issues.push({ rowIndex: raw.rowIndex, column: 'email', entity: 'PHARMACIST', code: 'EMAIL_LINKED_TO_ANOTHER_EMPLOYEE', message: `Email "${raw.email}" is already linked to employee ${existingForEmail.employeeId}`, blocksCommit: true, requiresReview: true })
        }
      }

      // Part 3 closure patch: multiple non-CLAIMED user docs already share
      // this employeeId (e.g. a pending record AND an active Auth-linked
      // record) — an identity conflict that must never be silently
      // resolved by picking whichever one fetchExistingOnboardingData.ts
      // happened to keep in its lookup map.
      const existingForEmployeeId = deps.existingByEmployeeId.get(raw.employeeId ?? '')
      if (existingForEmployeeId?.hasIdentityAmbiguity) {
        issues.push({ rowIndex: raw.rowIndex, column: 'employeeId', entity: 'PHARMACIST', code: 'IDENTITY_REVIEW_REQUIRED', message: `Employee ${raw.employeeId} has more than one existing user record — requires manual review before import`, blocksCommit: true, requiresReview: true })
      }

      // Identity-conflict issues default to REVIEW_REQUIRED (mapped onto the
      // existing CONFLICT classification) — never ERROR, because ERROR
      // implies "fix the file", while these require a human decision about
      // existing Firestore records the file itself did nothing wrong to cause.
      const reviewRequired = issues.some((i) => i.requiresReview)
      if (reviewRequired) return { classification: 'CONFLICT', issues }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: PharmacistStaged = {
        employeeId: raw.employeeId!, displayName: raw.name!,
        email: raw.email || null, phone: raw.phone || null,
        role: raw.role!, pharmacyId, joiningDate, leavingDate,
        active: active ?? true,
      }

      return { classification: issues.length > 0 ? 'WARNING' : 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: PharmacistStaged[]): DuplicateDetectionResult<PharmacistStaged> {
      const seen = new Map<string, PharmacistStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const [employeeId, record] of deps.existingByEmployeeId) map.set(employeeId, record)
      return map
    },

    diffAgainstExisting(staged: PharmacistStaged, existing: unknown | null): RowDecision {
      const record = existing as ExistingPharmacistRecord | null
      if (!record) return 'CREATE'

      // Never replace an existing role or branch assignment silently —
      // and never touch an Auth-linked ("ACTIVE") identity without review.
      if (record.authStatus === 'ACTIVE') {
        if (record.role !== staged.role || record.pharmacyId !== staged.pharmacyId) return 'CONFLICT'
        return 'UPDATE'
      }
      // PENDING_INVITATION records are our own staging artifact — safe to update freely.
      return 'UPDATE'
    },

    authorizeRow(_staged: PharmacistStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Pharmacist import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<PharmacistStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<PharmacistStaged>[], ctx: ImportCommitContext): Promise<{ id: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const existing = deps.existingByEmployeeId.get(staged.employeeId)
      const docId = existing ? existing.id : `pending_${staged.employeeId}`

      if (existing) {
        const before = { ...existing }
        await updateDoc(doc(db, COL.USERS, docId), {
          displayName: staged.displayName, role: staged.role,
          pharmacyId: staged.pharmacyId, phone: staged.phone || '',
          email: staged.email || existing.email,
          joiningDate: staged.joiningDate, leavingDate: staged.leavingDate,
          active: staged.active, status: staged.active ? 'active' : 'inactive',
          updatedAt: serverTimestamp(),
        })
        await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId, userId: ctx.actorUid, userRole: ctx.actorRole, before, after: staged })
        return { id: docId }
      }

      const profile = {
        displayName:  staged.displayName,
        email:        staged.email,
        role:         staged.role,
        status:       staged.active ? 'active' : 'inactive',
        active:       staged.active,
        pharmacyId:   staged.pharmacyId,
        phone:        staged.phone || '',
        employeeId:   staged.employeeId,
        joiningDate:  staged.joiningDate,
        leavingDate:  staged.leavingDate,
        // Approved account-creation decision: never a real Firebase Auth
        // account here. PENDING_INVITATION marks this as an operational-only
        // record awaiting future activation via the existing createUser() flow.
        authStatus:   'PENDING_INVITATION',
        createdAt:    serverTimestamp(),
        createdBy:    ctx.actorUid,
        updatedAt:    serverTimestamp(),
        tenantId:        'default',
        accessScopes:    [],
        temporaryScopes: [],
        scopeVersion:    1,
      }

      await setDoc(doc(db, COL.USERS, docId), profile)
      await logAction({ action: AUDIT_ACTION.CREATE, collection: COL.USERS, docId, userId: ctx.actorUid, userRole: ctx.actorRole, after: profile })
      return { id: docId }
    },
  }
}
