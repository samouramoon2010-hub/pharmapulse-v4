// ============================================================
// Actuals & Large Files Bundle — single-domain import runner
// (DX-6 Branch/Pharmacist Actuals, DX-7 Large File Processing)
//
// Mirrors kpiTargetsImportRunner.ts's single-domain Validate/Preview/
// Confirm/Commit shape — these two domains have no inter-dependency on
// each other or on Groups/Branches/Pharmacists/Assignments, so they
// don't need onboardingOrchestrator.ts's 4-domain dependency-ordered
// pipeline either.
//
// DX-7 additions over the DX-4/5 runner pattern (all additive, the
// underlying Import Job Engine is unchanged except for the
// onBatchComplete/shouldCancel hooks added to commitJob() this bundle):
//   - chunked, yielding parse pass for large files (keeps the tab
//     responsive; validateRow itself still runs in one synchronous
//     pass inside runValidation — see Known Limitations in
//     docs/dx/DX6_DX7_ACTUALS_LARGE_FILES_BUNDLE.md).
//   - a hard row-count ceiling (DX7_CONFIG.MAX_ROWS_PER_FILE) enforced
//     BEFORE validation runs, so an oversized file fails fast with a
//     clear reason instead of attempting to hold it all in memory.
//   - per-row Firestore checkpointing during commit, via commitJob's
//     onBatchComplete hook — persists a partial ImportJob snapshot
//     after every committed/failed row so an interrupted commit can
//     resume, and a partial failure can be retried, without replaying
//     already-committed rows.
//   - resumeOrRetryActualsJob(): the SAME mechanism serves both
//     "browser closed mid-commit" (resume) and "some rows failed"
//     (retry) — both cases reduce to "continue from the first
//     not-yet-committed row," computed from the job's own
//     commitBatches, never replaying a confirmed batch.
// ============================================================

import { collection, getDocs } from 'firebase/firestore'
import type { GuardContext } from '../security/accessGuard'
import { createImportJob, runValidation, commitJob } from './importJobEngine'
import { computeRowsSignature } from './onboardingOrchestrator'
import { db, COL } from './dxFirebaseTypes'
import { DX7_CONFIG } from './dx7Config'
import type { ImportDomain, ImportJob, StagedImportRow, ImportJobResult, CommitBatchResult, ValidationIssue, ImportFileMetadata } from './importJobTypes'
import type { ImportValidationContext, ImportAuthorizationContext, ImportCommitContext } from './importDomainAdapter'
import type { FirestoreStagingRepository } from './firestoreStagingRepository'
import { findJobByChecksum } from './firestoreStagingRepository'
import { stripUndefinedDeep } from './firestoreSanitize'

import { fetchKpiRegistryOnce } from '../kpiRegistryService'
import { fetchExistingOnboardingData } from './fetchExistingOnboardingData'
import type { KpiRegistry } from '../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './adapters/pharmacistsAdapter'

import { createBranchActualsAdapter } from './adapters/branchActualsAdapter'
import type { ExistingBranchActualsRecord } from './adapters/branchActualsAdapter'
import { createPharmacistActualsAdapter } from './adapters/pharmacistActualsAdapter'
import type { ExistingBranchRecordRef } from './adapters/pharmacistActualsAdapter'

export type ActualsDomain = 'BRANCH_ACTUALS' | 'PHARMACIST_ACTUALS'

export interface ActualsExistingData {
  branchesWithManager:     ExistingBranchActualsRecord[]
  branchesPlain:           ExistingBranchRecordRef[]
  registry:                KpiRegistry
  pharmacistsByEmployeeId: Map<string, ExistingPharmacistRecord>
  pharmacistsByEmail:      Map<string, ExistingPharmacistRecord>
}

/** Pre-fetches reference data once per run. Branch records here carry
 *  managerUid (needed for BRANCH_ACTUALS' attribution decision) — a
 *  field fetchExistingOnboardingData()'s shared `branches` shape does
 *  not carry, so this is its own small fetch rather than widening that
 *  shared, already-closed onboarding type. */
export async function fetchActualsExistingData(): Promise<ActualsExistingData> {
  const [registry, onboarding, pharmaciesSnap] = await Promise.all([
    fetchKpiRegistryOnce(),
    fetchExistingOnboardingData(),
    getDocs(collection(db, COL.PHARMACIES)),
  ])

  const branchesWithManager: ExistingBranchActualsRecord[] = pharmaciesSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id:         d.id,
      code:       (data.code as string) ?? '',
      name:       (data.name as string) ?? '',
      active:     (data.active as boolean | undefined) ?? true,
      managerUid: (data.managerUid as string | null | undefined) ?? null,
    }
  })

  return {
    branchesWithManager,
    branchesPlain:           onboarding.branches,
    registry,
    pharmacistsByEmployeeId: onboarding.pharmacistsByEmployeeId,
    pharmacistsByEmail:      onboarding.pharmacistsByEmail,
  }
}

export interface ActualsDomainSummary {
  domain:     ActualsDomain
  totalRows:  number
  creates:    number
  updates:    number
  unchanged:  number
  duplicates: number
  conflicts:  number
  errors:     number
}

export function summarizeActualsRows(domain: ActualsDomain, rows: StagedImportRow<unknown>[]): ActualsDomainSummary {
  const summary: ActualsDomainSummary = { domain, totalRows: rows.length, creates: 0, updates: 0, unchanged: 0, duplicates: 0, conflicts: 0, errors: 0 }
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

type AnyActualsAdapter =
  | ReturnType<typeof createBranchActualsAdapter>
  | ReturnType<typeof createPharmacistActualsAdapter>

function buildAdapter(domain: ActualsDomain, existing: ActualsExistingData, actorRole: string): AnyActualsAdapter {
  switch (domain) {
    case 'BRANCH_ACTUALS':
      return createBranchActualsAdapter({ actorRole, existingBranches: existing.branchesWithManager, registry: existing.registry })
    case 'PHARMACIST_ACTUALS':
      return createPharmacistActualsAdapter({
        actorRole, existingBranches: existing.branchesPlain, registry: existing.registry,
        pharmacistsByEmployeeId: existing.pharmacistsByEmployeeId, pharmacistsByEmail: existing.pharmacistsByEmail,
      })
  }
}

export function jobIdForActualsDomain(jobIdPrefix: string, domain: ActualsDomain): string {
  switch (domain) {
    case 'BRANCH_ACTUALS':      return `${jobIdPrefix}-branch-actuals`
    case 'PHARMACIST_ACTUALS':  return `${jobIdPrefix}-pharmacist-actuals`
  }
}

export interface ActualsRunParams {
  jobIdPrefix: string
  domain:      ActualsDomain
  guardCtx:    GuardContext
  actorRole:   string
  rawRows:     Record<string, unknown>[]
  existing:    ActualsExistingData
  /** Real, caller-supplied file metadata (name/size/mimeType/sheet/
   *  checksum) captured from the actual uploaded File object — see
   *  DataExchangeStudioPage.jsx. Takes precedence over the legacy
   *  `fileChecksum`-only shape below when present. Any field this
   *  object is missing (e.g. an empty `mimeType` on mobile Safari, a
   *  checksum that failed to compute) is simply absent — never
   *  written as `undefined` (see firestoreSanitize.ts and §"fileMeta
   *  assembly" below). */
  fileMeta?: ImportFileMetadata
  fileChecksum?: string
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/** Parses rawRows -> adapter raw shape in chunks, yielding to the event
 *  loop between chunks so a large file doesn't freeze the tab. */
async function parseRowsChunked(
  adapter:  AnyActualsAdapter,
  domain:   ActualsDomain,
  rawRows:  Record<string, unknown>[],
): Promise<unknown[]> {
  const parsed: unknown[] = []
  for (let i = 0; i < rawRows.length; i += DX7_CONFIG.VALIDATION_CHUNK_SIZE) {
    const chunk = rawRows.slice(i, i + DX7_CONFIG.VALIDATION_CHUNK_SIZE)
    for (let j = 0; j < chunk.length; j++) {
      parsed.push(adapter.parseRow(chunk[j], i + j + 1, { domain }))
    }
    if (i + DX7_CONFIG.VALIDATION_CHUNK_SIZE < rawRows.length) await yieldToEventLoop()
  }
  return parsed
}

async function runOneActualsDomain(params: ActualsRunParams): Promise<{ job: ImportJob; rows: StagedImportRow<unknown>[] }> {
  const { jobIdPrefix, domain, guardCtx, actorRole, rawRows, existing } = params
  const jobId   = jobIdForActualsDomain(jobIdPrefix, domain)
  const adapter = buildAdapter(domain, existing, actorRole)

  const job0 = createImportJob({ jobId, domain: domain as ImportDomain, createdBy: guardCtx.uid })

  if (rawRows.length > DX7_CONFIG.MAX_ROWS_PER_FILE) {
    const issue: ValidationIssue = {
      rowIndex: 0, code: 'FILE_TOO_LARGE', blocksCommit: true,
      message: `File has ${rawRows.length} rows, exceeding the ${DX7_CONFIG.MAX_ROWS_PER_FILE}-row limit per import. Split it into smaller files.`,
    }
    const { job: failed } = await runValidation(job0, adapter as never, [] as never, { actorUid: guardCtx.uid, actorRole }, { actorUid: guardCtx.uid, actorRole })
    return { job: { ...failed, validationSummary: { totalRows: 0, valid: 0, warning: 0, error: 1, conflict: 0, duplicate: 0, update: 0, skip: 0 } }, rows: [{ rowId: `${jobId}-0`, jobId, rowIndex: 0, identityKey: 'unresolved-0', classification: 'ERROR', issues: [issue], state: 'STAGED' }] }
  }

  const parsedRaw = await parseRowsChunked(adapter, domain, rawRows)

  const validationCtx: ImportValidationContext = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId, batchId: jobId }
  const authCtx: ImportAuthorizationContext     = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId }

  const { job: validated, rows } = await runValidation(job0, adapter as never, parsedRaw as never, validationCtx, authCtx)
  return { job: validated, rows: rows as StagedImportRow<unknown>[] }
}

export interface ActualsPreviewResult {
  previewSignature: string
  job:              ImportJob
  rows:             StagedImportRow<unknown>[]
  previewRows:      StagedImportRow<unknown>[]
  totalRowCount:    number
  summary:          ActualsDomainSummary
  readyToCommit:    boolean
}

/** Validates (never commits), persists the job + ALL staged rows to
 *  import_jobs (full audit trail — never truncated), and returns a
 *  structured preview. `previewRows` is capped at
 *  DX7_CONFIG.PREVIEW_ROW_CAP for UI rendering only — `rows`/summary/
 *  totalRowCount always reflect the complete file. */
export async function validateActualsJob(
  params: ActualsRunParams,
  repo:   FirestoreStagingRepository,
): Promise<ActualsPreviewResult> {
  if (params.fileChecksum) {
    const priorJob = await findJobByChecksum(params.domain as ImportDomain, params.fileChecksum, params.guardCtx.uid)
    if (priorJob && (priorJob.status === 'COMPLETED' || priorJob.status === 'PARTIALLY_COMPLETED')) {
      // Warn-only re-upload detection (Part 5/6 convention) — never blocks.
      // Surfaced to the caller via the job's own fileMeta on the new job;
      // the UI decides whether to show a "you already imported this file" banner.
    }
  }

  const { job, rows } = await runOneActualsDomain(params)
  const previewSignature = computeRowsSignature(rows)

  // Prefer the real, caller-supplied file metadata. Fall back to the
  // legacy checksum-only shape only when the caller passed a bare
  // checksum without the fuller object. Never assign `fileMeta` (or
  // any of its properties) `undefined` — see firestoreSanitize.ts.
  const rawFileMeta: ImportFileMetadata | undefined =
    params.fileMeta ?? (params.fileChecksum
      ? { fileName: 'upload.xlsx', sizeBytes: 0, checksum: params.fileChecksum }
      : undefined)
  const cleanFileMeta = rawFileMeta ? stripUndefinedDeep(rawFileMeta) : undefined

  const jobWithSignature: ImportJob = {
    ...job,
    previewSignature,
    ...(cleanFileMeta && Object.keys(cleanFileMeta).length > 0 ? { fileMeta: cleanFileMeta } : {}),
  }

  await repo.saveJob(jobWithSignature)
  if (rows.length > 0) await repo.saveStagedRows(job.jobId, rows)

  const summary = summarizeActualsRows(params.domain, rows)
  const readyToCommit = job.status === 'READY' && rows.every((r) => r.classification !== 'ERROR' && r.classification !== 'CONFLICT')

  return {
    previewSignature, job: jobWithSignature, rows,
    previewRows:   rows.slice(0, DX7_CONFIG.PREVIEW_ROW_CAP),
    totalRowCount: rows.length,
    summary, readyToCommit,
  }
}

export interface ActualsCommitParams extends ActualsRunParams {
  expectedPreviewSignature: string
  onProgress?:   (totals: { committed: number; failed: number; skipped: number; totalCommittable: number }) => void
  shouldCancel?: () => boolean | Promise<boolean>
}

export interface ActualsCommitOutcome {
  stale:        boolean
  staleReason?: string
  result?:      ImportJobResult
  rows?:        StagedImportRow<unknown>[]
}

function makeCheckpointHook(
  repo: FirestoreStagingRepository,
  baseJob: ImportJob,
  existingBatches: CommitBatchResult[],
  onProgress?: ActualsCommitParams['onProgress'],
) {
  const runningBatches: CommitBatchResult[] = [...existingBatches]
  return async (batchResult: CommitBatchResult, totals: { committed: number; failed: number; skipped: number }) => {
    runningBatches.push(batchResult)
    const checkpointJob: ImportJob = {
      ...baseJob,
      status: 'COMMITTING',
      commitBatches: runningBatches,
      rowCounts: { ...baseJob.rowCounts, committed: totals.committed, failed: totals.failed, skipped: totals.skipped },
      updatedAt: new Date().toISOString(),
    }
    await repo.saveJob(checkpointJob)
    onProgress?.({ ...totals, totalCommittable: baseJob.rowCounts.remaining })
  }
}

/** Confirm/Commit, fresh (job currently READY). Refuses to commit a
 *  stale preview (Firestore records changed since Preview) or a job
 *  that already finished committing — same two guards as
 *  commitKpiTargetsJob()/commitOnboardingJob(). Checkpoints after every
 *  committed/failed row via commitJob's onBatchComplete hook, so an
 *  interruption here is always resumable via resumeOrRetryActualsJob(). */
export async function commitActualsJob(
  params: ActualsCommitParams,
  repo:   FirestoreStagingRepository,
): Promise<ActualsCommitOutcome> {
  const jobId = jobIdForActualsDomain(params.jobIdPrefix, params.domain)
  const persisted = await repo.loadJob(jobId)
  if (persisted && (persisted.status === 'COMPLETED' || persisted.status === 'PARTIALLY_COMPLETED' || persisted.status === 'COMMITTING')) {
    return { stale: true, staleReason: `Job ${jobId} already committing or committed (status ${persisted.status}) — use resumeOrRetryActualsJob() instead of starting a new commit.` }
  }

  const { job: fresh, rows } = await runOneActualsDomain(params)
  const freshSignature = computeRowsSignature(rows)
  if (freshSignature !== params.expectedPreviewSignature) {
    return { stale: true, staleReason: 'Existing Firestore records changed since this preview was generated. Revalidate before committing.' }
  }

  if (fresh.status !== 'READY') {
    return { stale: false, result: { jobId, status: fresh.status, totalRows: rows.length, committed: 0, skipped: 0, failed: 0, remaining: 0, batches: [] } }
  }

  const adapter = buildAdapter(params.domain, params.existing, params.actorRole)
  const commitCtx: ImportCommitContext = { actorUid: params.guardCtx.uid, actorRole: params.actorRole, jobId: fresh.jobId }
  const onBatchComplete = makeCheckpointHook(repo, fresh, [], params.onProgress)

  const { job: committed, rows: finalRows, result } = await commitJob(
    fresh, adapter as never, rows as never, commitCtx,
    { chunkSize: DX7_CONFIG.COMMIT_CHUNK_SIZE, onBatchComplete, shouldCancel: params.shouldCancel },
  )

  await repo.saveJob(committed)
  await repo.saveStagedRows(jobId, finalRows)
  return { stale: false, result, rows: finalRows }
}

/** Finds the earliest batchIndex not yet fully confirmed (committed,
 *  zero failures) and returns the confirmed-prefix batches to pass
 *  back into commitJob's existingBatches — every batch in that prefix
 *  is preserved verbatim, never re-executed. Handles BOTH an
 *  interrupted commit (no batch ran for that index) and a partial
 *  failure (a batch ran and failed) with the same logic: "continue
 *  from the first row that isn't confirmed committed." */
function confirmedPrefix(commitBatches: CommitBatchResult[]): { startBatchIndex: number; existingBatches: CommitBatchResult[] } {
  const sorted = [...commitBatches].sort((a, b) => a.batchIndex - b.batchIndex)
  const confirmed: CommitBatchResult[] = []
  let expectedIndex = 0
  for (const b of sorted) {
    if (b.batchIndex !== expectedIndex || b.failed > 0) break
    confirmed.push(b)
    expectedIndex++
  }
  return { startBatchIndex: expectedIndex, existingBatches: confirmed }
}

export interface ActualsResumeParams {
  jobIdPrefix: string
  domain:      ActualsDomain
  guardCtx:    GuardContext
  actorRole:   string
  existing:    ActualsExistingData
  onProgress?:   ActualsCommitParams['onProgress']
  shouldCancel?: ActualsCommitParams['shouldCancel']
}

/** Resumes an interrupted commit (job stuck in COMMITTING) or retries
 *  the failed/remaining rows of a PARTIALLY_COMPLETED job — both cases
 *  reduce to the same mechanism (see confirmedPrefix). Never replays an
 *  already-committed row; never resumes a COMPLETED or terminal job;
 *  refuses after DX7_CONFIG.MAX_RETRY_ATTEMPTS to prevent an unbounded
 *  retry loop against a structurally broken file. */
export async function resumeOrRetryActualsJob(
  params: ActualsResumeParams,
  repo:   FirestoreStagingRepository,
): Promise<ActualsCommitOutcome> {
  const jobId = jobIdForActualsDomain(params.jobIdPrefix, params.domain)
  const job = await repo.loadJob(jobId)
  if (!job) return { stale: true, staleReason: `Job ${jobId} was not found.` }

  if (job.status === 'COMPLETED') {
    return { stale: true, staleReason: `Job ${jobId} already completed — nothing to resume or retry.` }
  }
  if (job.status !== 'COMMITTING' && job.status !== 'PARTIALLY_COMPLETED') {
    return { stale: true, staleReason: `Job ${jobId} is in status ${job.status} — only an interrupted COMMITTING job or a PARTIALLY_COMPLETED job can be resumed or retried.` }
  }
  if ((job.retryCount ?? 0) >= DX7_CONFIG.MAX_RETRY_ATTEMPTS) {
    return { stale: true, staleReason: `Job ${jobId} has already been retried ${job.retryCount} times (limit ${DX7_CONFIG.MAX_RETRY_ATTEMPTS}) — re-upload a fresh file instead.` }
  }

  const rows = await repo.loadStagedRows(jobId)
  const adapter = buildAdapter(params.domain, params.existing, params.actorRole)
  const { startBatchIndex, existingBatches } = confirmedPrefix(job.commitBatches)
  const commitCtx: ImportCommitContext = { actorUid: params.guardCtx.uid, actorRole: params.actorRole, jobId }

  const jobForRetry: ImportJob = { ...job, retryCount: (job.retryCount ?? 0) + 1 }
  const onBatchComplete = makeCheckpointHook(repo, jobForRetry, existingBatches, params.onProgress)

  const { job: committed, rows: finalRows, result } = await commitJob(
    jobForRetry, adapter as never, rows as never, commitCtx,
    { chunkSize: DX7_CONFIG.COMMIT_CHUNK_SIZE, startBatchIndex, existingBatches, onBatchComplete, shouldCancel: params.shouldCancel },
  )

  await repo.saveJob(committed)
  await repo.saveStagedRows(jobId, finalRows)
  return { stale: false, result, rows: finalRows }
}
