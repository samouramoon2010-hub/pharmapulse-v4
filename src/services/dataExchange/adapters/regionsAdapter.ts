// ============================================================
// REGION Domain Adapter (Universal AI Intake, Phase 1)
//
// "Region" maps onto the existing `regions` collection
// (territoryTypes.ts Region + regionService.ts). Regions have no
// parent in the current data model (Group/District is the child,
// referencing regionId — see groupsAdapter.ts), so this adapter has
// no parent-resolution step, unlike every other org-hierarchy
// adapter. Modeled directly on groupsAdapter.ts's contract shape for
// consistency with the rest of the Data Exchange pipeline.
// ============================================================

import { createRegion, updateRegion } from '../../regionService'
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

export interface RegionRaw {
  rowIndex:    number
  code?:       string
  name?:       string
  managerUid?: string
  statusRaw?:  string
}

export interface RegionStaged {
  code:        string
  name:        string
  managerUid:  string | null
  active:      boolean
}

export interface ExistingRegionRecord {
  id:     string
  code:   string
  name:   string
  active: boolean
}

export const HEADER_ALIASES = {
  code:    ['code', 'region code', 'region id', 'كود المنطقة', 'كود'],
  name:    ['name', 'region name', 'اسم المنطقة', 'الاسم'],
  manager: ['manager', 'manager uid', 'manager id', 'المدير'],
  status:  ['status', 'active', 'الحالة', 'نشط'],
}

export interface RegionsAdapterDeps {
  guardCtx:        GuardContext
  actorRole:       string
  existingRegions: ExistingRegionRecord[]
}

export function createRegionsAdapter(
  deps: RegionsAdapterDeps,
): ImportDomainAdapter<RegionRaw, RegionStaged, { id: string }> {
  const existingByCode = new Map(deps.existingRegions.map((r) => [r.code.toUpperCase(), r]))

  function identityKey(staged: RegionStaged): string {
    return staged.code.toUpperCase()
  }

  return {
    domain: 'REGION',

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

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): RegionRaw {
      return {
        rowIndex,
        code:       pickField(rawRow, HEADER_ALIASES.code),
        name:       pickField(rawRow, HEADER_ALIASES.name),
        managerUid: pickField(rawRow, HEADER_ALIASES.manager),
        statusRaw:  pickField(rawRow, HEADER_ALIASES.status),
      }
    },

    validateRow(raw: RegionRaw, _ctx: ImportValidationContext): RowValidationOutcome<RegionStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.code) {
        issues.push({ rowIndex: raw.rowIndex, column: 'code', entity: 'REGION', code: 'MISSING_REGION_IDENTITY', message: 'Region code is required', blocksCommit: true })
      }
      if (!raw.name) {
        issues.push({ rowIndex: raw.rowIndex, column: 'name', entity: 'REGION', code: 'MISSING_REQUIRED_FIELD', message: 'Region name is required', blocksCommit: true })
      }

      const active = parseStatusToActive(raw.statusRaw)
      if (active === null) {
        issues.push({ rowIndex: raw.rowIndex, column: 'status', entity: 'REGION', code: 'INVALID_STATUS', message: `Unrecognized status "${raw.statusRaw}"`, blocksCommit: true })
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: RegionStaged = {
        code:       raw.code!.trim().toUpperCase(),
        name:       raw.name!.trim(),
        managerUid: raw.managerUid || null,
        active:     active ?? true,
      }

      return { classification: 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: RegionStaged[]): DuplicateDetectionResult<RegionStaged> {
      const seen = new Map<string, RegionStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const [code, record] of existingByCode) map.set(code, record)
      return map
    },

    diffAgainstExisting(staged: RegionStaged, existing: unknown | null): RowDecision {
      const record = existing as ExistingRegionRecord | null
      if (!record) return 'CREATE'
      // Never overwrite a region name silently — surface as a conflict.
      if (record.name !== staged.name) return 'CONFLICT'
      return 'UPDATE'
    },

    authorizeRow(_staged: RegionStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      // Bulk Region onboarding is Organization-Admin-only — firestore.rules
      // already restricts `regions` writes to admin; this is defense in depth.
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk Region import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<RegionStaged> {
      return {
        rowId:        `${jobId}-${rowIndex}`,
        jobId, rowIndex,
        identityKey:  staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged,
        state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<RegionStaged>[], _ctx: ImportCommitContext): Promise<{ id: string }> {
      // chunkSize: 1 — createRegion/updateRegion are existing single-document
      // service calls, reused unmodified (same convention as groupsAdapter.ts).
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const existing = existingByCode.get(staged.code)
      if (existing) {
        await updateRegion(existing.id, {
          name: staged.name, managerUid: staged.managerUid, active: staged.active,
        }, deps.guardCtx.uid, deps.actorRole)
        return { id: existing.id }
      }

      const created = await createRegion({
        code: staged.code, name: staged.name, managerUid: staged.managerUid, active: staged.active,
      }, deps.guardCtx.uid, deps.actorRole)
      return { id: created.id }
    },
  }
}
