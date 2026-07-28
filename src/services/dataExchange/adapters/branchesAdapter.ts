// ============================================================
// BRANCHES Domain Adapter (DX-2/DX-3, Part 4)
//
// Thin wrapper around the existing pharmacyService.ts (createPharmacy/
// updatePharmacy/pharmacyCodeExists) and districtService.assignPharmacyToDistrict
// — no new collection, no parallel schema. "Group" (district) assignment
// is optional, matching the current model where a pharmacy's districtId/
// regionId are optional Phase-1 additions (territoryTypes.ts
// PharmacyTerritoryFields), not a required foreign key.
// ============================================================

import { createPharmacy, updatePharmacy } from '../dxPharmacyTypes'
import { assignPharmacyToDistrict } from '../../districtService'
import type { GuardContext } from '../../security/accessGuard'
import { pickField, parseStatusToActive, findAliasMatch } from './columnAliasUtils'
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

export interface BranchRaw {
  rowIndex:    number
  code?:       string
  name?:       string
  region?:     string
  city?:       string
  groupCode?:  string
  managerEmail?: string
  statusRaw?:  string
}

export interface BranchStaged {
  code:        string
  name:        string
  region:      string | null
  city:        string | null
  groupCode:   string | null
  managerEmail: string | null
  active:      boolean
}

export interface ExistingBranchRecord {
  id:     string
  code:   string
  name:   string
  active: boolean
}

export const HEADER_ALIASES = {
  code:   ['code', 'branch code', 'branch id', 'pharmacy code', 'store code', 'كود الفرع', 'كود'],
  name:   ['name', 'branch name', 'pharmacy name', 'store name', 'اسم الفرع', 'الاسم'],
  region: ['region', 'region code', 'المنطقة'],
  city:   ['city', 'المدينة'],
  group:  ['group', 'group code', 'district', 'district code', 'المجموعة', 'كود المجموعة'],
  manager: ['manager', 'manager email', 'branch manager', 'مدير الفرع'],
  status:  ['status', 'active', 'الحالة', 'نشط'],
}

export interface BranchesAdapterDeps {
  guardCtx:        GuardContext
  actorRole:       string
  existingBranches: ExistingBranchRecord[]
  /** Group (district) codes resolvable for this job — pre-existing districts
   *  UNION any district rows already committed earlier in the same
   *  multi-domain onboarding job. Drives the "parent group must not be
   *  invalid or failed in the same job" rule without engine changes. */
  resolvableGroupCodes: Map<string, string>   // code (uppercased) -> districtId
}

export function createBranchesAdapter(
  deps: BranchesAdapterDeps,
): ImportDomainAdapter<BranchRaw, BranchStaged, { id: string }> {
  const existingByCode = new Map(deps.existingBranches.map((b) => [b.code, b]))

  function identityKey(staged: BranchStaged): string {
    return staged.code
  }

  return {
    domain: 'BRANCH',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const match = findAliasMatch(header, HEADER_ALIASES)
        return { sourceHeader: header, targetField: match ?? header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): BranchRaw {
      return {
        rowIndex,
        code:         pickField(rawRow, HEADER_ALIASES.code),
        name:         pickField(rawRow, HEADER_ALIASES.name),
        region:       pickField(rawRow, HEADER_ALIASES.region),
        city:         pickField(rawRow, HEADER_ALIASES.city),
        groupCode:    pickField(rawRow, HEADER_ALIASES.group),
        managerEmail: pickField(rawRow, HEADER_ALIASES.manager),
        statusRaw:    pickField(rawRow, HEADER_ALIASES.status),
      }
    },

    validateRow(raw: BranchRaw, _ctx: ImportValidationContext): RowValidationOutcome<BranchStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.code) {
        issues.push({ rowIndex: raw.rowIndex, column: 'code', entity: 'BRANCH', code: 'MISSING_REQUIRED_FIELD', message: 'Branch code is required', blocksCommit: true })
      }
      if (!raw.name) {
        issues.push({ rowIndex: raw.rowIndex, column: 'name', entity: 'BRANCH', code: 'MISSING_REQUIRED_FIELD', message: 'Branch name is required', blocksCommit: true })
      }

      const active = parseStatusToActive(raw.statusRaw)
      if (active === null) {
        issues.push({ rowIndex: raw.rowIndex, column: 'status', entity: 'BRANCH', code: 'INVALID_STATUS', message: `Unrecognized status "${raw.statusRaw}"`, blocksCommit: true })
      }

      let resolvedGroupCode: string | null = null
      if (raw.groupCode) {
        const upper = raw.groupCode.toUpperCase()
        if (!deps.resolvableGroupCodes.has(upper)) {
          issues.push({
            rowIndex: raw.rowIndex, column: 'group', entity: 'BRANCH', code: 'DEPENDENCY_BLOCKED',
            message: `Group "${raw.groupCode}" was not found or failed earlier in this job — branch cannot be committed`,
            blocksCommit: true,
          })
        } else {
          resolvedGroupCode = upper
        }
      }

      // Unknown manager is a warning, not a blocker — a branch manager
      // can be assigned after onboarding, matching the existing
      // createPharmacy() contract where managerEmail is optional.
      if (raw.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.managerEmail)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'manager', entity: 'BRANCH', code: 'INVALID_MANAGER_EMAIL', message: `"${raw.managerEmail}" is not a valid email`, blocksCommit: false })
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: BranchStaged = {
        code: raw.code!, name: raw.name!,
        region: raw.region || null, city: raw.city || null,
        groupCode: resolvedGroupCode, managerEmail: raw.managerEmail || null,
        active: active ?? true,
      }

      return { classification: issues.length > 0 ? 'WARNING' : 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: BranchStaged[]): DuplicateDetectionResult<BranchStaged> {
      const seen = new Map<string, BranchStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const [code, record] of existingByCode) map.set(code, record)
      return map
    },

    diffAgainstExisting(staged: BranchStaged, existing: unknown | null): RowDecision {
      const record = existing as ExistingBranchRecord | null
      if (!record) return 'CREATE'
      if (record.name !== staged.name) return 'CONFLICT'
      return 'UPDATE'
    },

    authorizeRow(_staged: BranchStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      // Pharmacies are admin-only-write per firestore.rules — bulk branch
      // onboarding is restricted identically, no weaker than the rules.
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Branch import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<BranchStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<BranchStaged>[], _ctx: ImportCommitContext): Promise<{ id: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const existing = existingByCode.get(staged.code)
      let pharmacyId: string

      if (existing) {
        await updatePharmacy(existing.id, {
          name: staged.name, region: staged.region, city: staged.city,
          managerEmail: staged.managerEmail, active: staged.active,
        }, deps.guardCtx.uid, deps.actorRole)
        pharmacyId = existing.id
      } else {
        const created = await createPharmacy({
          code: staged.code, name: staged.name, region: staged.region,
          city: staged.city, managerEmail: staged.managerEmail, active: staged.active,
        }, deps.guardCtx.uid, deps.actorRole)
        pharmacyId = created.id
      }

      if (staged.groupCode) {
        const districtId = deps.resolvableGroupCodes.get(staged.groupCode)
        if (districtId) {
          await assignPharmacyToDistrict(districtId, pharmacyId, deps.guardCtx.uid, deps.actorRole)
        }
      }

      return { id: pharmacyId }
    },
  }
}
