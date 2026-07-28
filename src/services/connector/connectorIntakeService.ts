// ============================================================
// Universal AI Intake — Phase 2 Tool Handlers
//
// Business logic for all 8 MCP tools. Reuses Phase 1's engine
// directly — createImportJob/runValidation/commitJob from
// importJobEngine.ts, adapters from intakeDomainRegistry.ts,
// computeRowsSignature from onboardingOrchestrator.ts. No parallel
// import engine. All Firestore access goes through the injected
// ConnectorRepository — this module never imports firebase/firestore
// or firebase-admin.
// ============================================================

import { randomUUID } from 'crypto'
import { createImportJob, runValidation } from '../dataExchange/importJobEngine'
import { computeRowsSignature } from '../dataExchange/onboardingOrchestrator'
import { createAdapterForDomain, INTAKE_DOMAIN_LABELS } from '../dataExchange/intakeDomainRegistry'
import type { IntakeExistingData } from '../dataExchange/intakeDomainRegistry'
import { withIntakeMeta, withApproval, withExecution, toProposedAction } from '../dataExchange/intakeSessionTypes'
import { issueApprovalToken, verifyApprovalToken, assertApprovalNotConsumed } from './connectorApprovalService'
import { assertProductionWriteAllowed } from './connectorProductionGuard'
import type { ProductionGuardFlags } from './connectorProductionGuard'
import { buildCommitPlan } from './commitPlan/buildCommitPlan'
import { ConnectorFailure } from './connectorTypes'
import type { CommitExecutor } from './commitPlan/commitExecutor'
import type {
  ConnectorIdentity,
  CreateIntakeSessionInput, CreateIntakeSessionOutput,
  ValidateIntakeSessionInput, ValidateIntakeSessionOutput,
  GetIntakePreviewInput, GetIntakePreviewOutput,
  ApproveIntakeSessionInput, ApproveIntakeSessionOutput,
  ExecuteIntakeSessionInput, ExecuteIntakeSessionOutput,
  GetIntakeStatusInput, GetIntakeStatusOutput,
  CancelIntakeSessionInput, CancelIntakeSessionOutput,
  GetReferenceDataInput, GetReferenceDataOutput,
} from './connectorTypes'
import type { ConnectorRepository } from './repositories/connectorRepository'

const APPROVAL_TTL_SECONDS = 600 // 10 minutes
const APPROVE_PHRASE_THRESHOLD = 50
const APPROVE_PHRASE = 'APPROVE IMPORT'

/**
 * getExistingData(): abstracts the reference-data read (which
 * collections' worth of regions/groups/branches/pharmacists/registry
 * an adapter needs to validate against) away from any specific
 * Firestore SDK. Tests and the local simulator inject a fake/seeded
 * IntakeExistingData; the Netlify Function injects a real one built
 * with firebase-admin (see netlify/lib/firestoreConnectorRepository.ts).
 * This keeps connectorIntakeService.ts free of any firebase-admin or
 * firebase/firestore import — safe for the Vite client build and
 * fully unit-testable.
 */
export interface IntakeServiceEnv {
  approvalSecret:  string
  getExistingData: () => Promise<IntakeExistingData>
  /** Read by executeIntakeSession only — every other tool is read/
   *  validate-only and never needs this. Defaults to "everything
   *  unset" (fail closed) when omitted, so existing callers that only
   *  exercise create/validate/preview/approve/status/cancel/reference
   *  never need to think about it. */
  productionGuardFlags?: ProductionGuardFlags
  /** Phase 2.1 — the Admin SDK commit executor. Only executeIntakeSession
   *  reads this. Required whenever execute is actually reachable (the
   *  production guard above already blocks execute when unset/disabled,
   *  but this is checked explicitly too so a misconfiguration fails
   *  with a clear error rather than a null-reference deep in the call). */
  commitExecutor?: CommitExecutor
}

// ── 1. create ──────────────────────────────────────────────────

export async function createIntakeSession(
  input: CreateIntakeSessionInput, identity: ConnectorIdentity, env: IntakeServiceEnv, repo: ConnectorRepository,
): Promise<CreateIntakeSessionOutput> {
  if (!input.rows || input.rows.length === 0) {
    throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: 'At least one row is required', retryable: false })
  }
  if (!(input.entityType in INTAKE_DOMAIN_LABELS)) {
    throw new ConnectorFailure({ code: 'UNSUPPORTED_ENTITY', message: `Entity type "${input.entityType}" is not supported`, retryable: false })
  }

  const sessionId = randomUUID()
  const existing = await env.getExistingData()
  const adapter = createAdapterForDomain(
    input.entityType, existing,
    { uid: identity.mappedAdminUid, role: identity.mappedAdminRole, pharmacyId: null },
    identity.mappedAdminRole,
  )

  let job = createImportJob({ jobId: sessionId, domain: input.entityType, createdBy: identity.mappedAdminUid })
  job = withIntakeMeta(job, { sourceType: input.sourceType, sourceFileName: input.sourceName })

  // Server never trusts client-provided normalization — every row is
  // re-parsed through the adapter's own parseRow()/validateRow(), same
  // as the browser UI does. clientRowId is preserved as a correlation
  // id only, never used to construct a Firestore path.
  const rawRows = input.rows.map((row, i) => adapter.parseRow(row.rawValues, i + 1, { domain: input.entityType }))
  const vCtx = { actorUid: identity.mappedAdminUid, actorRole: identity.mappedAdminRole }
  const aCtx = { actorUid: identity.mappedAdminUid, actorRole: identity.mappedAdminRole }
  const { job: validatedJob, rows, summary } = await runValidation(job, adapter, rawRows, vCtx, aCtx)

  // Correlate staged rows back to the caller's clientRowId by position
  // (same order as input.rows -> rawRows -> rows).
  const withClientIds = rows.map((r, i) => ({ ...r, _clientRowId: input.rows[i]?.clientRowId ?? r.rowId }))

  await repo.saveSession({ job: validatedJob, rows: withClientIds as any })

  return {
    sessionId,
    status: validatedJob.status,
    detectedEntityType: input.entityType,
    acceptedRowCount: summary.valid + summary.warning + summary.update,
    rejectedRowCount: summary.error,
    validationSummary: summary,
    nextAction: 'pharmapulse_get_intake_preview',
  }
}

// ── 2. validate (re-run against the current live reference data) ──

export async function validateIntakeSession(
  input: ValidateIntakeSessionInput, repo: ConnectorRepository,
): Promise<ValidateIntakeSessionOutput> {
  const session = await requireSession(repo, input.sessionId)
  const previewSignature = computeRowsSignature(session.rows as any)

  const duplicateInFile = session.rows.filter((r: any) => r.classification === 'DUPLICATE').length
  const duplicateAgainstRepo = session.rows.filter((r: any) => r.classification === 'UPDATE' || r.classification === 'CONFLICT').length
  const unresolved = session.rows.flatMap((r: any) => r.issues.filter((i: any) => i.code?.includes('UNKNOWN')).map((i: any) => i.message))

  return {
    status: session.job.status,
    validationSummary: session.job.validationSummary ?? { totalRows: 0, valid: 0, warning: 0, error: 0, conflict: 0, duplicate: 0, update: 0, skip: 0 },
    rowClassifications: session.rows.map((r: any) => ({ clientRowId: r._clientRowId ?? r.rowId, classification: r.classification })),
    duplicateSummary: { inFile: duplicateInFile, againstRepository: duplicateAgainstRepo },
    unresolvedReferences: [...new Set(unresolved)],
    previewSignature,
  }
}

// ── 3. preview ──────────────────────────────────────────────────

export async function getIntakePreview(
  input: GetIntakePreviewInput, repo: ConnectorRepository,
): Promise<GetIntakePreviewOutput> {
  const session = await requireSession(repo, input.sessionId)
  let rows = session.rows as any[]

  if (input.filter && input.filter !== 'all') {
    rows = rows.filter((r) => toProposedAction(r.classification) === input.filter || r.classification.toLowerCase() === input.filter)
  }
  const offset = input.offset ?? 0
  const limit = input.limit ?? 200
  const pageRows = rows.slice(offset, offset + limit)

  const summary = session.job.validationSummary
  const previewSignature = computeRowsSignature(session.rows as any)

  return {
    createCount: summary?.valid ?? 0,
    updateCount: summary?.update ?? 0,
    skipCount: (summary?.skip ?? 0) + (summary?.duplicate ?? 0),
    conflictCount: summary?.conflict ?? 0,
    invalidCount: summary?.error ?? 0,
    warningCount: summary?.warning ?? 0,
    rows: pageRows.map((r) => ({
      clientRowId: r._clientRowId ?? r.rowId,
      proposedAction: toProposedAction(r.classification),
      normalizedValues: (r.staged ?? {}) as Record<string, unknown>,
      warnings: r.issues.filter((i: any) => !i.blocksCommit).map((i: any) => i.message),
      errors: r.issues.filter((i: any) => i.blocksCommit).map((i: any) => i.message),
    })),
    executionEligible: session.job.status === 'READY' && (summary?.error ?? 0) < (summary?.totalRows ?? 0),
    previewSignature,
  }
}

// ── 4. approve ──────────────────────────────────────────────────

export async function approveIntakeSession(
  input: ApproveIntakeSessionInput, env: IntakeServiceEnv, repo: ConnectorRepository,
): Promise<ApproveIntakeSessionOutput> {
  const session = await requireSession(repo, input.sessionId)
  const currentSignature = computeRowsSignature(session.rows as any)
  if (currentSignature !== input.previewSignature) {
    throw new ConnectorFailure({ code: 'PREVIEW_STALE', message: 'Preview signature does not match the current session state — re-fetch the preview before approving', retryable: false, sessionId: input.sessionId })
  }

  const excluded = new Set(input.excludedRowIds ?? [])
  const committable = (session.rows as any[]).filter((r) =>
    !excluded.has(r._clientRowId ?? r.rowId) &&
    (r.classification === 'VALID' || r.classification === 'WARNING' || r.classification === 'UPDATE'),
  )

  if (committable.length === 0) {
    throw new ConnectorFailure({ code: 'VALIDATION_FAILED', message: 'No committable rows remain after exclusions', retryable: false, sessionId: input.sessionId })
  }
  if (committable.length > APPROVE_PHRASE_THRESHOLD && input.approvalPhrase !== APPROVE_PHRASE) {
    throw new ConnectorFailure({
      code: 'APPROVAL_REQUIRED',
      message: `High-volume import (${committable.length} rows) requires approvalPhrase "${APPROVE_PHRASE}"`,
      retryable: false, sessionId: input.sessionId,
    })
  }

  const approvedRowIds = committable.map((r) => r._clientRowId ?? r.rowId)
  const issued = issueApprovalToken({
    sessionId: input.sessionId, previewSignature: currentSignature,
    approvedRowIds, excludedRowIds: [...excluded],
    ttlSeconds: APPROVAL_TTL_SECONDS, secret: env.approvalSecret,
  })

  const approvedJob = withApproval(session.job, new Date().toISOString())
  await repo.saveSession({ job: approvedJob, rows: session.rows })

  return {
    approvalId: issued.approvalId, approvalToken: issued.token,
    approvedRowCount: approvedRowIds.length, excludedRowCount: excluded.size,
    expiresAt: issued.expiresAt, status: 'AWAITING_EXECUTION',
  }
}

// ── 5. execute ──────────────────────────────────────────────────

export async function executeIntakeSession(
  input: ExecuteIntakeSessionInput, identity: ConnectorIdentity, env: IntakeServiceEnv, repo: ConnectorRepository,
): Promise<ExecuteIntakeSessionOutput> {
  // The ONLY tool that writes data. Fail closed by default — see
  // connectorProductionGuard.ts. This runs BEFORE the session is even
  // looked up, so a misconfigured/disabled connector never touches
  // Firestore at all, not even a read.
  assertProductionWriteAllowed(env.productionGuardFlags ?? {})

  if (!env.commitExecutor) {
    throw new ConnectorFailure({ code: 'INTERNAL_ERROR', message: 'No commit executor configured', retryable: false, sessionId: input.sessionId })
  }

  const session = await requireSession(repo, input.sessionId)
  const currentSignature = computeRowsSignature(session.rows as any)

  // Approval integrity re-check (Step 8): token signature/expiry,
  // session binding, and — critically — that the CURRENT session
  // state still matches the previewSignature the approval was issued
  // against (verifyApprovalToken throws PREVIEW_STALE otherwise).
  const claims = verifyApprovalToken({
    token: input.approvalToken, sessionId: input.sessionId,
    currentPreviewSignature: currentSignature, secret: env.approvalSecret,
  })
  await assertApprovalNotConsumed(claims.approvalId, repo, input.sessionId)

  const excluded = new Set(claims.excludedRowIds)
  const committable = (session.rows as any[]).filter((r) =>
    claims.approvedRowIds.includes(r._clientRowId ?? r.rowId) && !excluded.has(r._clientRowId ?? r.rowId),
  )

  const existing = await env.getExistingData()
  const pharmacistsByEmployeeId = existing.onboarding.pharmacistsByEmployeeId
  // Same existing.onboarding.groups array branchesAdapter.ts's
  // `resolvableGroupCodes` map is built from — reused, not
  // re-fetched, for the Phase 2.2 branch-to-district link fix.
  const districtByCode = new Map(existing.onboarding.groups.map((g) => [g.code.toUpperCase(), g]))

  const plan = buildCommitPlan(
    {
      jobId: session.job.jobId, entityType: session.job.domain,
      actorUid: identity.mappedAdminUid, actorRole: identity.mappedAdminRole,
      planSignature: currentSignature,
    },
    committable as any,
    {
      resolveExistingUserId: (employeeId) => pharmacistsByEmployeeId.get(employeeId)?.id ?? null,
      resolveDistrictByGroupCode: (groupCode) => {
        const group = districtByCode.get(groupCode)
        return group ? { districtId: group.id, regionId: group.regionId ?? null } : null
      },
    },
  )

  // Redundant-by-construction, checked explicitly anyway per Step 8:
  // the commit-plan signature must match the approved preview signature.
  if (plan.planSignature !== claims.previewSignature) {
    throw new ConnectorFailure({ code: 'PREVIEW_STALE', message: 'Commit plan signature does not match the approved preview', retryable: false, sessionId: input.sessionId })
  }

  const result = await env.commitExecutor.execute(plan)

  const status = result.failed === 0 ? 'COMPLETED' : (result.created + result.updated > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED')
  const executedJob = withExecution({ ...session.job, status: status as any }, new Date().toISOString())

  await repo.markApprovalConsumed(claims.approvalId)
  await repo.saveSession({ job: executedJob, rows: session.rows })

  return {
    executionId: randomUUID(),
    status: executedJob.status,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    failureDetails: result.executed
      .filter((r) => r.state === 'failed')
      .map((r) => ({ clientRowId: r.sourceRowId, reason: r.failureReason ?? 'Unknown failure' })),
    auditReference: session.job.jobId,
  }
}

// ── 6. status ───────────────────────────────────────────────────

export async function getIntakeStatus(input: GetIntakeStatusInput, repo: ConnectorRepository): Promise<GetIntakeStatusOutput> {
  const session = await requireSession(repo, input.sessionId)
  const job = session.job as any
  return {
    lifecycleStatus: job.status,
    validationState: job.validationSummary ? 'VALIDATED' : null,
    approvalState: job.approvedAt ? 'APPROVED' : null,
    executionState: job.executedAt ? job.status : null,
    counts: job.rowCounts ?? {},
    timestamps: { createdAt: job.createdAt, approvedAt: job.approvedAt, executedAt: job.executedAt },
    failureReason: job.status === 'FAILED' ? 'See execution result for row-level failure reasons' : undefined,
  }
}

// ── 7. cancel ───────────────────────────────────────────────────

export async function cancelIntakeSession(input: CancelIntakeSessionInput, repo: ConnectorRepository): Promise<CancelIntakeSessionOutput> {
  const session = await requireSession(repo, input.sessionId)
  if (session.job.status === 'COMMITTING' || session.job.status === 'COMPLETED' || session.job.status === 'PARTIALLY_COMPLETED') {
    throw new ConnectorFailure({
      code: 'SESSION_STATE_CONFLICT',
      message: `Cannot cancel a session in status "${session.job.status}"`,
      retryable: false, sessionId: input.sessionId,
    })
  }
  const cancelled = { ...session.job, status: 'CANCELLED' as const }
  await repo.saveSession({ job: cancelled, rows: session.rows })
  return { status: 'CANCELLED' }
}

// ── 8. reference data ───────────────────────────────────────────

const REFERENCE_FIELD_ALLOWLIST: Record<string, string[]> = {
  regions:         ['id', 'code', 'name', 'status', 'active'],
  groups:          ['id', 'code', 'name', 'regionId', 'status', 'active'],
  pharmacies:      ['id', 'code', 'name', 'groupId', 'status', 'active'],
  users:           ['id', 'employeeId', 'displayName', 'status', 'assignedPharmacyCodes', 'role'],
  kpi_definitions: ['key', 'label', 'category', 'lifecycleStage', 'isActive'],
  roles:           ['role'],
  scopes:          ['scope'],
  periods:         ['period'],
}

export async function getReferenceData(input: GetReferenceDataInput, repo: ConnectorRepository): Promise<GetReferenceDataOutput> {
  const allowlist = REFERENCE_FIELD_ALLOWLIST[input.referenceType]
  if (!allowlist) {
    throw new ConnectorFailure({ code: 'INVALID_PAYLOAD', message: `Unsupported reference type "${input.referenceType}"`, retryable: false })
  }
  const raw = await repo.getReferenceRecords(input.referenceType, {
    exactCode: input.exactCode, searchText: input.searchText, limit: input.limit ?? 50,
  })
  const minimized = raw.map((record) => {
    const out: Record<string, unknown> = {}
    for (const field of allowlist) if (field in record) out[field] = record[field]
    return out
  })
  return { referenceType: input.referenceType, records: minimized }
}

// ── shared ──────────────────────────────────────────────────────

async function requireSession(repo: ConnectorRepository, sessionId: string) {
  const session = await repo.getSession(sessionId)
  if (!session) {
    throw new ConnectorFailure({ code: 'SESSION_NOT_FOUND', message: `Intake session "${sessionId}" was not found`, retryable: false, sessionId })
  }
  return session
}
