// ============================================================
// KPI & Targets Bundle — single-domain import runner (DX-4/DX-5)
//
// DX-4 (KPI Registry) and DX-5 (Branch/Pharmacist Targets) have no
// inter-dependency on each other or on Groups/Branches/Pharmacists/
// Assignments — each is a self-contained single-domain job. Rather
// than forcing them through onboardingOrchestrator.ts's 4-domain
// dependency-ordered pipeline (built specifically for Group -> Branch
// -> Pharmacist -> Assignment), this module reuses the SAME unmodified
// DX-1 Import Job Engine primitives (createImportJob/runValidation/
// commitJob), the same chunkSize:1 per-row commit convention, and the
// same preview-signature staleness guard (computeRowsSignature, from
// onboardingOrchestrator.ts — not re-implemented) for a single domain
// at a time.
// ============================================================

import type { GuardContext } from '../security/accessGuard'
import { createImportJob, runValidation, commitJob } from './importJobEngine'
import { computeRowsSignature } from './onboardingOrchestrator'
import type { ImportDomain, ImportJob, StagedImportRow, ImportJobResult, ImportFileMetadata } from './importJobTypes'
import type { ImportValidationContext, ImportAuthorizationContext, ImportCommitContext } from './importDomainAdapter'
import type { FirestoreStagingRepository } from './firestoreStagingRepository'
import { stripUndefinedDeep } from './firestoreSanitize'

import { fetchKpiRegistryOnce } from '../kpiRegistryService'
import { fetchExistingOnboardingData } from './fetchExistingOnboardingData'
import type { KpiRegistry } from '../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './adapters/pharmacistsAdapter'

import { createKpiRegistryAdapter } from './adapters/kpiRegistryAdapter'
import { createBranchTargetsAdapter } from './adapters/branchTargetsAdapter'
import { createPharmacistTargetsAdapter } from './adapters/pharmacistTargetsAdapter'

export type KpiTargetsDomain = 'KPI_REGISTRY' | 'BRANCH_TARGET' | 'PHARMACIST_TARGET'

export interface KpiTargetsExistingData {
  branches:                Array<{ id: string; code: string; name: string; active: boolean }>
  registry:                KpiRegistry
  pharmacistsByEmployeeId: Map<string, ExistingPharmacistRecord>
  pharmacistsByEmail:      Map<string, ExistingPharmacistRecord>
}

/** Pre-fetches reference data once per run — mirrors the established
 *  fetchExistingOnboardingData() convention rather than letting each
 *  adapter issue its own ad hoc queries. */
export async function fetchKpiTargetsExistingData(): Promise<KpiTargetsExistingData> {
  const [registry, onboarding] = await Promise.all([
    fetchKpiRegistryOnce(),
    fetchExistingOnboardingData(),
  ])
  return {
    branches:                onboarding.branches,
    registry,
    pharmacistsByEmployeeId: onboarding.pharmacistsByEmployeeId,
    pharmacistsByEmail:      onboarding.pharmacistsByEmail,
  }
}

export interface KpiTargetsDomainSummary {
  domain:     KpiTargetsDomain
  totalRows:  number
  creates:    number
  updates:    number
  unchanged:  number
  duplicates: number
  conflicts:  number
  errors:     number
}

export function summarizeKpiTargetsRows(domain: KpiTargetsDomain, rows: StagedImportRow<unknown>[]): KpiTargetsDomainSummary {
  const summary: KpiTargetsDomainSummary = { domain, totalRows: rows.length, creates: 0, updates: 0, unchanged: 0, duplicates: 0, conflicts: 0, errors: 0 }
  for (const row of rows) {
    switch (row.classification) {
      case 'VALID':     summary.creates++; break
      case 'WARNING':   summary.creates++; break
      case 'UPDATE':     summary.updates++; break
      case 'SKIP':       summary.unchanged++; break
      case 'DUPLICATE':  summary.duplicates++; break
      case 'CONFLICT':   summary.conflicts++; break
      case 'ERROR':      summary.errors++; break
    }
  }
  return summary
}

export interface KpiTargetsRunParams {
  jobIdPrefix: string
  domain:      KpiTargetsDomain
  guardCtx:    GuardContext
  actorRole:   string
  rawRows:     Record<string, unknown>[]
  existing:    KpiTargetsExistingData
  /** Real, caller-supplied file metadata — see ActualsRunParams.fileMeta
   *  for the full rationale. Optional; any missing property is simply
   *  absent from the persisted job, never written as `undefined`. */
  fileMeta?: ImportFileMetadata
}

type AnyKpiTargetsAdapter =
  | ReturnType<typeof createKpiRegistryAdapter>
  | ReturnType<typeof createBranchTargetsAdapter>
  | ReturnType<typeof createPharmacistTargetsAdapter>

function buildAdapter(domain: KpiTargetsDomain, existing: KpiTargetsExistingData, actorRole: string): AnyKpiTargetsAdapter {
  switch (domain) {
    case 'KPI_REGISTRY':
      return createKpiRegistryAdapter({ actorRole, existingRegistry: existing.registry })
    case 'BRANCH_TARGET':
      return createBranchTargetsAdapter({ actorRole, existingBranches: existing.branches, registry: existing.registry })
    case 'PHARMACIST_TARGET':
      return createPharmacistTargetsAdapter({
        actorRole, existingBranches: existing.branches, registry: existing.registry,
        pharmacistsByEmployeeId: existing.pharmacistsByEmployeeId, pharmacistsByEmail: existing.pharmacistsByEmail,
      })
  }
}

export function jobIdForKpiTargetsDomain(jobIdPrefix: string, domain: KpiTargetsDomain): string {
  switch (domain) {
    case 'KPI_REGISTRY':       return `${jobIdPrefix}-kpi-registry`
    case 'BRANCH_TARGET':      return `${jobIdPrefix}-branch-targets`
    case 'PHARMACIST_TARGET':  return `${jobIdPrefix}-pharmacist-targets`
  }
}

export interface KpiTargetsPreviewResult {
  previewSignature: string
  job:              ImportJob
  rows:             StagedImportRow<unknown>[]
  summary:          KpiTargetsDomainSummary
  readyToCommit:    boolean
}

async function runOneKpiTargetsDomain(params: KpiTargetsRunParams): Promise<{ job: ImportJob; rows: StagedImportRow<unknown>[] }> {
  const { jobIdPrefix, domain, guardCtx, actorRole, rawRows, existing } = params
  const jobId   = jobIdForKpiTargetsDomain(jobIdPrefix, domain)
  const adapter = buildAdapter(domain, existing, actorRole)

  const job0 = createImportJob({ jobId, domain: domain as ImportDomain, createdBy: guardCtx.uid })
  const parsedRaw = rawRows.map((row, i) => adapter.parseRow(row, i + 1, { domain: domain as ImportDomain }))

  const validationCtx: ImportValidationContext = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId, batchId: jobId }
  const authCtx: ImportAuthorizationContext     = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId }

  const { job: validated, rows } = await runValidation(job0, adapter as never, parsedRaw as never, validationCtx, authCtx)
  return { job: validated, rows: rows as StagedImportRow<unknown>[] }
}

/** Validates (never commits) one KPI/Targets domain job, persists the
 *  job + staged rows to the same import_jobs staging collection used by
 *  DX-1/DX-2/DX-3, and returns a structured preview. Zero production
 *  writes — matches the existing Validate/Preview/Confirm/Commit gate. */
export async function validateKpiTargetsJob(
  params: KpiTargetsRunParams,
  repo:   FirestoreStagingRepository,
): Promise<KpiTargetsPreviewResult> {
  const { job, rows } = await runOneKpiTargetsDomain(params)
  const previewSignature = computeRowsSignature(rows)
  const cleanFileMeta = params.fileMeta ? stripUndefinedDeep(params.fileMeta) : undefined
  const jobWithSignature: ImportJob = {
    ...job,
    previewSignature,
    ...(cleanFileMeta && Object.keys(cleanFileMeta).length > 0 ? { fileMeta: cleanFileMeta } : {}),
  }

  await repo.saveJob(jobWithSignature)
  if (rows.length > 0) await repo.saveStagedRows(job.jobId, rows)

  const summary = summarizeKpiTargetsRows(params.domain, rows)
  const readyToCommit = job.status === 'READY' && rows.every((r) => r.classification !== 'ERROR' && r.classification !== 'CONFLICT')

  return { previewSignature, job: jobWithSignature, rows, summary, readyToCommit }
}

export interface KpiTargetsCommitParams extends KpiTargetsRunParams {
  expectedPreviewSignature: string
}

export interface KpiTargetsCommitOutcome {
  stale:        boolean
  staleReason?: string
  result?:      ImportJobResult
  rows?:        StagedImportRow<unknown>[]
}

/** Confirm/Commit. Refuses to write anything if a fresh re-validation no
 *  longer matches what the user actually previewed and confirmed, and
 *  refuses to commit a job that already finished committing — same two
 *  guards as commitOnboardingJob(), reused conceptually, not duplicated
 *  in spirit (each domain here is single-step, so there is no dependency
 *  re-resolution to repeat). */
export async function commitKpiTargetsJob(
  params: KpiTargetsCommitParams,
  repo:   FirestoreStagingRepository,
): Promise<KpiTargetsCommitOutcome> {
  const jobId = jobIdForKpiTargetsDomain(params.jobIdPrefix, params.domain)
  const persisted = await repo.loadJob(jobId)
  if (persisted && (persisted.status === 'COMPLETED' || persisted.status === 'PARTIALLY_COMPLETED')) {
    return { stale: true, staleReason: `Job ${jobId} already committed (status ${persisted.status}) — refusing to commit twice.` }
  }

  const { job: fresh, rows } = await runOneKpiTargetsDomain(params)
  const freshSignature = computeRowsSignature(rows)
  if (freshSignature !== params.expectedPreviewSignature) {
    return { stale: true, staleReason: 'Existing Firestore records changed since this preview was generated. Revalidate before committing.' }
  }

  if (fresh.status !== 'READY') {
    return { stale: false, result: { jobId, status: fresh.status, totalRows: rows.length, committed: 0, skipped: 0, failed: 0, remaining: 0, batches: [] } }
  }

  const adapter = buildAdapter(params.domain, params.existing, params.actorRole)
  const commitCtx: ImportCommitContext = { actorUid: params.guardCtx.uid, actorRole: params.actorRole, jobId: fresh.jobId }
  // chunkSize: 1 — these domains commit through existing single-document
  // services (saveKpiDefinition/saveTarget/savePersonalTarget), not a
  // Firestore writeBatch — matches the onboarding adapters' convention.
  const { job: committed, rows: finalRows, result } = await commitJob(fresh, adapter as never, rows as never, commitCtx, { chunkSize: 1 })

  await repo.saveJob(committed)
  return { stale: false, result, rows: finalRows }
}
