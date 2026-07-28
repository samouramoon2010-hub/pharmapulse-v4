// ============================================================
// Universal AI Intake — Phase 2.1 Commit Planning
//
// Turns already-validated StagedImportRow[] (produced by Phase 1's
// runValidation() — REUSED, not duplicated) into a canonical
// CommitPlan of framework-neutral CommitOperations. No Firestore
// write happens here — this module never imports firebase/firestore
// or firebase-admin.
//
// Per-domain "operation builders" below construct the SAME payload
// shape each Phase 1 adapter's commitBatch() already builds (see
// AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md for the byte-for-byte
// audit this was built from) — this is I/O-shape mapping, not
// business/validation logic, which stays 100% in the adapters.
//
// Deliberate deviation from Phase 1 (documented, not a bug): REGION/
// GROUP/BRANCH use a DETERMINISTIC document ID (the entity's own
// code) in the Admin path, instead of the browser path's Firestore
// auto-generated ID. Both are valid, queryable Firestore documents;
// this avoids needing a second "resolve the real existing doc ID"
// lookup pass and satisfies Step 4's "deterministic document ID
// behavior" requirement directly.
// ============================================================

import { buildCommitOperationKey } from '../../dataExchange/importJobTypes'
import { resolveCollectionKey } from './commitOperationTypes'
import type { ImportDomain, RowClassification, StagedImportRow } from '../../dataExchange/importJobTypes'
import type { CommitOperation, CommitPlan, CommitPlanFailure } from './commitOperationTypes'

export interface BuildCommitPlanCtx {
  jobId:     string
  entityType: ImportDomain
  actorUid:   string
  actorRole:  string
  /** Reused from Phase 1 — same fingerprint the approval token is
   *  bound to, so planSignature always matches the approved preview
   *  by construction. */
  planSignature: string
}

function auditMeta(ctx: BuildCommitPlanCtx, sourceRowId: string) {
  return { entityType: ctx.entityType, sourceRowId, actorUid: ctx.actorUid, actorRole: ctx.actorRole }
}

function opKey(ctx: BuildCommitPlanCtx, identityKey: string) {
  return buildCommitOperationKey(ctx.jobId, identityKey)
}

// ── Per-domain operation builders ──────────────────────────────
// Each takes the row's already-validated `staged` object (produced
// by the Phase 1 adapter's validateRow()) and the row's classification
// (CREATE-eligible: VALID/WARNING, or UPDATE), and returns the
// collection/documentId/payload — never re-deriving or re-validating
// business data.

function buildRegionOperation(staged: any, isUpdate: boolean, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = String(staged.code).toUpperCase()
  const data: Record<string, unknown> = {
    code: staged.code, name: staged.name, managerUid: staged.managerUid ?? null, active: staged.active !== false,
    ...(isUpdate ? {} : { districtIds: [] }),
  }
  return {
    type: isUpdate ? 'update' : 'create', entityType: 'REGION', collectionKey: resolveCollectionKey('REGION'),
    documentId: identityKey, data, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildGroupOperation(staged: any, isUpdate: boolean, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = String(staged.code).toUpperCase()
  const data: Record<string, unknown> = {
    code: staged.code, name: staged.name, regionId: staged.regionId, supervisorUid: staged.supervisorUid ?? null,
    active: staged.active !== false, ...(isUpdate ? {} : { pharmacyIds: [] }),
  }
  return {
    type: isUpdate ? 'update' : 'create', entityType: 'GROUP', collectionKey: resolveCollectionKey('GROUP'),
    documentId: identityKey, data, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildBranchOperation(
  staged: any, isUpdate: boolean, districtLink: { districtId: string; regionId: string | null } | null,
  ctx: BuildCommitPlanCtx, sourceRowId: string,
): CommitOperation[] {
  const identityKey = String(staged.code).toUpperCase()
  const data: Record<string, unknown> = {
    code: staged.code, name: staged.name, region: staged.region ?? null, city: staged.city ?? null,
    managerEmail: staged.managerEmail ?? null, active: staged.active !== false,
    ...(isUpdate ? {} : { managerUid: null, branchClassification: 'unclassified', schemaVersion: 1 }),
    // Denormalized onto the pharmacy doc when a group/district code was
    // resolved — mirrors districtService.assignPharmacyToDistrict()'s
    // exact field names (Phase 2.2 side-effect parity fix).
    ...(districtLink ? { districtId: districtLink.districtId, regionId: districtLink.regionId } : {}),
  }
  const branchOp: CommitOperation = {
    type: isUpdate ? 'update' : 'create', entityType: 'BRANCH', collectionKey: resolveCollectionKey('BRANCH'),
    documentId: identityKey, data, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }

  if (!districtLink) return [branchOp]

  // Mirrors the OTHER half of assignPharmacyToDistrict(): pushes this
  // branch's id into districts/{districtId}.pharmacyIds. Firestore's
  // arrayUnion is atomic and idempotent — safe to re-run without a
  // preceding read, unlike the nestedMapField (KPI targets/actuals)
  // pattern which genuinely needs read-modify-write.
  const districtLinkIdentityKey = `${districtLink.districtId}:pharmacyIds:${identityKey}`
  const districtLinkOp: CommitOperation = {
    type: 'update', entityType: 'BRANCH', collectionKey: resolveCollectionKey('GROUP'),
    documentId: districtLink.districtId, data: {},
    arrayUnionField: { path: 'pharmacyIds', value: identityKey },
    merge: true, identityKey: districtLinkIdentityKey,
    sourceRowId, idempotencyKey: opKey(ctx, districtLinkIdentityKey), audit: auditMeta(ctx, sourceRowId),
  }
  return [branchOp, districtLinkOp]
}

function buildPharmacistOperation(staged: any, isUpdate: boolean, existingId: string | null, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = staged.employeeId
  const documentId = existingId ?? `pending_${staged.employeeId}`
  const data: Record<string, unknown> = isUpdate
    ? {
        displayName: staged.displayName, role: staged.role, pharmacyId: staged.pharmacyId ?? null,
        phone: staged.phone || '', email: staged.email ?? null, joiningDate: staged.joiningDate ?? null,
        leavingDate: staged.leavingDate ?? null, active: staged.active,
        status: staged.active ? 'active' : 'inactive',
      }
    : {
        displayName: staged.displayName, email: staged.email ?? null, role: staged.role,
        status: staged.active ? 'active' : 'inactive', active: staged.active, pharmacyId: staged.pharmacyId ?? null,
        phone: staged.phone || '', employeeId: staged.employeeId, joiningDate: staged.joiningDate ?? null,
        leavingDate: staged.leavingDate ?? null, authStatus: 'PENDING_INVITATION',
        tenantId: 'default', accessScopes: [], temporaryScopes: [], scopeVersion: 1,
      }
  return {
    type: isUpdate ? 'update' : 'create', entityType: 'PHARMACIST', collectionKey: resolveCollectionKey('PHARMACIST'),
    documentId, data, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildAssignmentOperation(staged: any, existingUid: string, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = `${staged.employeeId}:${staged.pharmacyId}`
  return {
    type: 'update', entityType: 'ASSIGNMENT', collectionKey: resolveCollectionKey('ASSIGNMENT'),
    documentId: existingUid, data: { pharmacyId: staged.pharmacyId }, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildKpiRegistryOperation(staged: any, isUpdate: boolean, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = staged.normalizedKey ?? staged.key
  // isActive/lifecycleStage are already forced to false/'draft' by
  // kpiRegistryDraftOnlyAdapter upstream (Phase 2 guard, unchanged) —
  // this builder just forwards the already-validated staged object.
  const data: Record<string, unknown> = { ...staged, uiStatus: staged.isActive ? 'ACTIVE' : 'ARCHIVED' }
  delete data.normalizedKey
  return {
    type: isUpdate ? 'update' : 'create', entityType: 'KPI_REGISTRY', collectionKey: resolveCollectionKey('KPI_REGISTRY'),
    documentId: staged.key, data, merge: true, identityKey,
    sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildBranchTargetOperation(staged: any, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = `${staged.pharmacyId}_${staged.month}_${staged.kpiKey}`
  const documentId = `${staged.pharmacyId}_${staged.month}`
  return {
    type: 'upsert', entityType: 'BRANCH_TARGET', collectionKey: resolveCollectionKey('BRANCH_TARGET'),
    documentId, data: { pharmacyId: staged.pharmacyId, month: staged.month },
    nestedMapField: { path: '', key: staged.targetField, value: Math.max(0, Number(staged.value) || 0) },
    merge: true, identityKey, sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildPharmacistTargetOperation(staged: any, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const identityKey = `${staged.userId}_${staged.pharmacyId}_${staged.month}_${staged.kpiKey}`
  const documentId = `${staged.userId}_${staged.pharmacyId}_${staged.month}`
  return {
    type: 'upsert', entityType: 'PHARMACIST_TARGET', collectionKey: resolveCollectionKey('PHARMACIST_TARGET'),
    documentId, data: { userId: staged.userId, pharmacyId: staged.pharmacyId, month: staged.month, allocationMethod: 'custom' },
    nestedMapField: { path: 'targets', key: staged.targetField, value: Math.max(0, Number(staged.value) || 0) },
    merge: true, identityKey, sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildBranchActualOperation(staged: any, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const userId = staged.managerUid
  const identityKey = `${userId}_${staged.pharmacyId}_${staged.date}_${staged.kpiKey}`
  const documentId = `${userId}_${staged.pharmacyId}_${staged.date}`
  return {
    type: 'upsert', entityType: 'BRANCH_ACTUALS', collectionKey: resolveCollectionKey('BRANCH_ACTUALS'),
    documentId,
    data: { userId, pharmacyId: staged.pharmacyId, date: staged.date, [staged.actualField]: staged.value, importedViaDataExchange: true, importBatchRef: ctx.jobId },
    nestedMapField: { path: 'kpiValues', key: staged.kpiKey, value: staged.value },
    merge: true, identityKey, sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

function buildPharmacistActualOperation(staged: any, ctx: BuildCommitPlanCtx, sourceRowId: string): CommitOperation {
  const userId = staged.userId
  const identityKey = `${userId}_${staged.pharmacyId}_${staged.date}_${staged.kpiKey}`
  const documentId = `${userId}_${staged.pharmacyId}_${staged.date}`
  return {
    type: 'upsert', entityType: 'PHARMACIST_ACTUALS', collectionKey: resolveCollectionKey('PHARMACIST_ACTUALS'),
    documentId,
    data: { userId, pharmacyId: staged.pharmacyId, date: staged.date, [staged.actualField]: staged.value, importedViaDataExchange: true, importBatchRef: ctx.jobId },
    nestedMapField: { path: 'kpiValues', key: staged.kpiKey, value: staged.value },
    merge: true, identityKey, sourceRowId, idempotencyKey: opKey(ctx, identityKey), audit: auditMeta(ctx, sourceRowId),
  }
}

// ── Plan builder ────────────────────────────────────────────────

export interface BuildCommitPlanDeps {
  /** For ASSIGNMENT/PHARMACIST-update rows: resolve the real existing
   *  user doc id for an employeeId, if one exists. Injected (not a
   *  Firestore call here) — the connector supplies this from the same
   *  `existing.onboarding.pharmacistsByEmployeeId` map the adapters
   *  themselves already use. */
  resolveExistingUserId?: (employeeId: string) => string | null
  /** For BRANCH rows carrying a group/district code: resolve the
   *  district's id + regionId, mirroring branchesAdapter.ts's
   *  `resolvableGroupCodes` map + districtService.assignPharmacyToDistrict()
   *  (Phase 2.2 side-effect parity — see
   *  AI_INTAKE_PHASE_2_2_TEST_REPORT.md's side-effect review). The
   *  connector supplies this from the same `existing.onboarding.groups`
   *  array the browser adapter reads. */
  resolveDistrictByGroupCode?: (groupCode: string) => { districtId: string; regionId: string | null } | null
}

export function buildCommitPlan(
  ctx: BuildCommitPlanCtx,
  rows: StagedImportRow<any>[],
  deps: BuildCommitPlanDeps = {},
): CommitPlan {
  const operations: CommitOperation[] = []
  const skips: CommitPlanFailure[] = []
  const conflicts: CommitPlanFailure[] = []
  const validationFailures: CommitPlanFailure[] = []

  for (const row of rows) {
    const sourceRowId = (row as any)._clientRowId ?? row.rowId
    const c: RowClassification = row.classification

    if (c === 'ERROR') { validationFailures.push({ sourceRowId, reason: row.issues.map((i) => i.message).join('; ') }); continue }
    if (c === 'SKIP' || c === 'DUPLICATE') { skips.push({ sourceRowId, reason: c }); continue }
    if (c === 'CONFLICT') { conflicts.push({ sourceRowId, reason: 'Existing record differs — requires manual review' }); continue }
    if (!row.staged) { validationFailures.push({ sourceRowId, reason: 'No staged data available' }); continue }

    const isUpdate = c === 'UPDATE'
    const staged = row.staged

    switch (ctx.entityType) {
      case 'REGION': operations.push(buildRegionOperation(staged, isUpdate, ctx, sourceRowId)); break
      case 'GROUP': operations.push(buildGroupOperation(staged, isUpdate, ctx, sourceRowId)); break
      case 'BRANCH': {
        const districtLink = staged.groupCode ? (deps.resolveDistrictByGroupCode?.(staged.groupCode) ?? null) : null
        operations.push(...buildBranchOperation(staged, isUpdate, districtLink, ctx, sourceRowId))
        break
      }
      case 'PHARMACIST': {
        const existingId = deps.resolveExistingUserId?.(staged.employeeId) ?? null
        operations.push(buildPharmacistOperation(staged, isUpdate, existingId, ctx, sourceRowId))
        break
      }
      case 'ASSIGNMENT': {
        const existingUid = deps.resolveExistingUserId?.(staged.employeeId) ?? null
        if (!existingUid) { validationFailures.push({ sourceRowId, reason: `No existing user found for employeeId "${staged.employeeId}"` }); break }
        operations.push(buildAssignmentOperation(staged, existingUid, ctx, sourceRowId))
        break
      }
      case 'KPI_REGISTRY': operations.push(buildKpiRegistryOperation(staged, isUpdate, ctx, sourceRowId)); break
      case 'BRANCH_TARGET': operations.push(buildBranchTargetOperation(staged, ctx, sourceRowId)); break
      case 'PHARMACIST_TARGET': operations.push(buildPharmacistTargetOperation(staged, ctx, sourceRowId)); break
      case 'BRANCH_ACTUALS': operations.push(buildBranchActualOperation(staged, ctx, sourceRowId)); break
      case 'PHARMACIST_ACTUALS': operations.push(buildPharmacistActualOperation(staged, ctx, sourceRowId)); break
      default:
        validationFailures.push({ sourceRowId, reason: `Unsupported entity type "${ctx.entityType}" for commit planning` })
    }
  }

  return {
    jobId: ctx.jobId, entityType: ctx.entityType, operations, skips, conflicts, validationFailures,
    expectedCreateCount: operations.filter((o) => o.type === 'create').length,
    expectedUpdateCount: operations.filter((o) => o.type === 'update' || o.type === 'upsert').length,
    planSignature: ctx.planSignature,
  }
}
