// ============================================================
// GROUPS Domain Adapter (DX-2/DX-3, Part 3)
//
// "Group" in the approved architecture maps onto the ONE existing
// entity in this codebase that groups branches under a manager with a
// parent organization: the `districts` collection (territoryTypes.ts
// District + districtService.ts). There is no separate `groups`
// collection in the data model, and Part 3 explicitly forbids
// inventing hierarchy concepts that aren't derivable from existing
// Firestore types — so this adapter is a thin wrapper around
// createDistrict()/updateDistrict(), not a new schema.
//
// "Parent organization" = the existing District.regionId field.
// Region itself is NOT imported by this adapter — regions are
// expected to pre-exist (created via the existing Regions admin page)
// since there is no second hierarchy level above region in the
// current model. Effective-start/end dates are NOT part of this
// contract — District has no such fields, and none are invented here.
// Circular-hierarchy validation is structurally moot: a District has
// exactly one parent (a Region), and Regions have no parent of their
// own, so a hierarchy cycle is not representable in the existing model.
// ============================================================

import { createDistrict, updateDistrict } from '../../districtService'
import { guardDistrictAccess } from '../../security/accessGuard'
import type { GuardContext, TerritoryGuardContext } from '../../security/accessGuard'
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
import type { ColumnMapping, RowClassification, ValidationIssue, StagedImportRow } from '../importJobTypes'

export interface GroupRaw {
  rowIndex:   number
  code?:      string
  name?:      string
  regionCode?: string
  managerUid?: string
  statusRaw?:  string
}

export interface GroupStaged {
  code:          string
  name:          string
  regionId:      string
  regionCode:    string
  supervisorUid: string | null
  active:        boolean
}

export interface ExistingGroupRecord {
  id:       string
  code:     string
  name:     string
  regionId: string
  active:   boolean
}

export interface ExistingRegionRecord {
  id:   string
  code: string
}

export const HEADER_ALIASES = {
  code:   ['code', 'group code', 'group id', 'district code', 'district id', 'كود المجموعة', 'كود'],
  name:   ['name', 'group name', 'district name', 'اسم المجموعة', 'الاسم'],
  region: ['region', 'region code', 'region id', 'parent', 'parent organization', 'parent region', 'المنطقة', 'كود المنطقة'],
  manager: ['manager', 'manager uid', 'manager id', 'supervisor', 'supervisor uid', 'المدير', 'المشرف'],
  status:  ['status', 'active', 'الحالة', 'نشط'],
}

export interface GroupsAdapterDeps {
  guardCtx:         GuardContext
  actorRole:        string
  existingGroups:   ExistingGroupRecord[]
  existingRegions:  ExistingRegionRecord[]
}

export function createGroupsAdapter(
  deps: GroupsAdapterDeps,
): ImportDomainAdapter<GroupRaw, GroupStaged, { id: string }> {
  const regionByCode = new Map(deps.existingRegions.map((r) => [r.code.toUpperCase(), r]))
  const existingByCode = new Map(deps.existingGroups.map((g) => [g.code.toUpperCase(), g]))

  function identityKey(staged: GroupStaged): string {
    return staged.code.toUpperCase()
  }

  return {
    domain: 'GROUP',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const match = findAliasMatch(header, HEADER_ALIASES)
        return {
          sourceHeader: header,
          targetField:  match ?? header,
          matchedVia:   match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED',
        }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): GroupRaw {
      return {
        rowIndex,
        code:       pickField(rawRow, HEADER_ALIASES.code),
        name:       pickField(rawRow, HEADER_ALIASES.name),
        regionCode: pickField(rawRow, HEADER_ALIASES.region),
        managerUid: pickField(rawRow, HEADER_ALIASES.manager),
        statusRaw:  pickField(rawRow, HEADER_ALIASES.status),
      }
    },

    validateRow(raw: GroupRaw, _ctx: ImportValidationContext): RowValidationOutcome<GroupStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.code) {
        issues.push({ rowIndex: raw.rowIndex, column: 'code', entity: 'GROUP', code: 'MISSING_GROUP_IDENTITY', message: 'Group code is required', blocksCommit: true })
      }
      if (!raw.name) {
        issues.push({ rowIndex: raw.rowIndex, column: 'name', entity: 'GROUP', code: 'MISSING_REQUIRED_FIELD', message: 'Group name is required', blocksCommit: true })
      }
      if (!raw.regionCode) {
        issues.push({ rowIndex: raw.rowIndex, column: 'region', entity: 'GROUP', code: 'UNKNOWN_PARENT_ORGANIZATION', message: 'Parent region is required', blocksCommit: true })
      }

      const active = parseStatusToActive(raw.statusRaw)
      if (active === null) {
        issues.push({ rowIndex: raw.rowIndex, column: 'status', entity: 'GROUP', code: 'INVALID_STATUS', message: `Unrecognized status "${raw.statusRaw}"`, blocksCommit: true })
      }

      let region: ExistingRegionRecord | undefined
      if (raw.regionCode) {
        region = regionByCode.get(raw.regionCode.toUpperCase())
        if (!region) {
          issues.push({ rowIndex: raw.rowIndex, column: 'region', entity: 'GROUP', code: 'UNKNOWN_PARENT_ORGANIZATION', message: `Region "${raw.regionCode}" was not found`, blocksCommit: true })
        }
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: GroupStaged = {
        code:          raw.code!.toUpperCase(),
        name:          raw.name!,
        regionId:      region!.id,
        regionCode:    region!.code,
        supervisorUid: raw.managerUid || null,
        active:        active ?? true,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: GroupStaged[]): DuplicateDetectionResult<GroupStaged> {
      const seen = new Map<string, GroupStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const [code, record] of existingByCode) map.set(code, record)
      return map
    },

    diffAgainstExisting(staged: GroupStaged, existing: unknown | null): RowDecision {
      const record = existing as ExistingGroupRecord | null
      if (!record) return 'CREATE'
      // Never overwrite a group name, manager, or hierarchy silently.
      if (record.name !== staged.name || record.regionId !== staged.regionId) return 'CONFLICT'
      return 'UPDATE'
    },

    authorizeRow(_staged: GroupStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      // Bulk Group/District onboarding is Organization-Admin-only in this
      // bundle — Firestore rules already restrict districts/regions writes
      // to admin, and territory-manager scope enforcement for BULK writes
      // is not yet proven complete (Part 10: restrict rather than weaken).
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Group import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<GroupStaged> {
      return {
        rowId:        `${jobId}-${rowIndex}`,
        jobId, rowIndex,
        identityKey:  staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged,
        state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<GroupStaged>[], _ctx: ImportCommitContext): Promise<{ id: string }> {
      // One row per call is expected — see DX-2/DX-3 report ("chunkSize: 1
      // for onboarding domains") — createDistrict/updateDistrict are
      // existing single-document service calls, reused unmodified.
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const existing = existingByCode.get(staged.code)
      if (existing) {
        await updateDistrict(existing.id, {
          name: staged.name, regionId: staged.regionId,
          supervisorUid: staged.supervisorUid, active: staged.active,
        }, deps.guardCtx.uid, deps.actorRole)
        return { id: existing.id }
      }

      const created = await createDistrict({
        code: staged.code, name: staged.name, regionId: staged.regionId,
        supervisorUid: staged.supervisorUid, active: staged.active,
      }, deps.guardCtx.uid, deps.actorRole)
      return { id: created.id }
    },
  }
}

// Re-exported for row-level territory checks where the caller already has
// a TerritoryGuardContext available (not used by default admin-only auth above).
export { guardDistrictAccess }
export type { TerritoryGuardContext }
