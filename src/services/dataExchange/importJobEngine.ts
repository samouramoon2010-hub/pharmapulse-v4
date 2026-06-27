// ============================================================
// Import Job Engine (DX-1, Part 3)
//
// Pure orchestration. Never touches Firestore directly — all
// persistence happens behind the adapter (commitBatch) or the
// staging repository (see stagingRepository.ts). The engine's job
// is sequencing: create -> validate -> classify -> summarize ->
// plan commit batches -> track progress -> produce a result.
// ============================================================

import type {
  ImportJob,
  ImportDomain,
  ImportFileMetadata,
  StagedImportRow,
  ValidationSummary,
  ImportProgress,
  ImportJobResult,
  CommitBatchResult,
  RowClassification,
} from './importJobTypes'
import { emptyValidationSummary, emptyRowCounts } from './importJobTypes'
import { transitionJob } from './importJobStateMachine'
import type {
  ImportDomainAdapter,
  ImportValidationContext,
  ImportAuthorizationContext,
  ImportCommitContext,
} from './importDomainAdapter'

// Firestore writeBatch hard limit is 500 ops; stay safely under it,
// matching the chunk size already used by the legacy KPI import path.
export const DEFAULT_COMMIT_CHUNK_SIZE = 400

export interface CreateImportJobParams {
  jobId:       string
  domain:      ImportDomain
  createdBy:   string
  orgScope?:   string | null
  fileMeta?:   ImportFileMetadata
  mappingVersion?: string
  now?:        string
}

export function createImportJob(params: CreateImportJobParams): ImportJob {
  const now = params.now ?? new Date().toISOString()
  return {
    jobId:          params.jobId,
    domain:         params.domain,
    status:         'DRAFT',
    orgScope:       params.orgScope ?? null,
    createdBy:      params.createdBy,
    createdAt:      now,
    updatedAt:      now,
    fileMeta:       params.fileMeta,
    mappingVersion: params.mappingVersion,
    rowCounts:      emptyRowCounts(),
    commitBatches:  [],
    rollbackStatus: 'NOT_ATTEMPTED',
    statusHistory:  [{ from: null, to: 'DRAFT', at: now }],
  }
}

export interface ValidationRunResult<TStaged> {
  job:     ImportJob
  rows:    StagedImportRow<TStaged>[]
  summary: ValidationSummary
}

/**
 * Runs the full validate→classify→authorize→dedupe→diff pipeline for a
 * domain adapter over a set of already-parsed raw rows, and advances the
 * job through PARSING -> MAPPED -> VALIDATING -> (READY | FAILED).
 */
export async function runValidation<TRaw, TStaged, TCommitResult>(
  job:        ImportJob,
  adapter:    ImportDomainAdapter<TRaw, TStaged, TCommitResult>,
  rawRows:    TRaw[],
  validationCtx: ImportValidationContext,
  authCtx:    ImportAuthorizationContext,
): Promise<ValidationRunResult<TStaged>> {
  let working = transitionJob(job, 'PARSING')
  working = transitionJob(working, 'MAPPED')
  working = transitionJob(working, 'VALIDATING')

  const outcomes = rawRows.map((raw) => adapter.validateRow(raw, validationCtx))

  // Identity-based within-file duplicate detection (Part 5/6) — only across
  // rows that parsed/validated into a staged value.
  const candidateStaged = outcomes
    .map((o) => o.staged)
    .filter((s): s is TStaged => s != null)
  const { deduplicated } = adapter.detectFileDuplicates(candidateStaged)
  const dedupedKeys = new Set(deduplicated.map((s) => adapter.identityKey(s)))

  const existing = await adapter.loadExistingRecords(deduplicated, validationCtx)

  const rows: StagedImportRow<TStaged>[] = []
  let rowIndex = 0
  let seenKeys = new Set<string>()

  for (const outcome of outcomes) {
    rowIndex++
    let classification: RowClassification = outcome.classification
    const issues = [...outcome.issues]

    if (outcome.staged != null) {
      const key = adapter.identityKey(outcome.staged)

      if (!dedupedKeys.has(key) || seenKeys.has(key)) {
        // This exact identity already appeared earlier in the file —
        // last-row-wins (matches existing deduplicateStaged behavior),
        // but every duplicate row is still reported, never hidden.
        classification = 'DUPLICATE'
      } else {
        seenKeys.add(key)

        const authOutcome = adapter.authorizeRow(outcome.staged, authCtx)
        if (!authOutcome.allowed) {
          classification = 'ERROR'
          issues.push({
            rowIndex,
            code: 'UNAUTHORIZED_ROW',
            message: authOutcome.reason ?? 'Row is outside the caller\'s authorized scope',
            blocksCommit: true,
          })
        } else if (classification === 'VALID' || classification === 'WARNING') {
          const decision = adapter.diffAgainstExisting(outcome.staged, existing.get(key) ?? null)
          if (decision === 'CONFLICT') classification = 'CONFLICT'
          else if (decision === 'UPDATE') classification = 'UPDATE'
          else if (decision === 'SKIP') classification = 'SKIP'
          // CREATE keeps VALID/WARNING as computed by the adapter
        }
      }
    }

    rows.push(adapter.toStagedRow(outcome.staged as TStaged, working.jobId, rowIndex, classification, issues))
  }

  const summary = summarizeRows(rows)

  working = {
    ...working,
    validationSummary: summary,
    rowCounts: {
      ...working.rowCounts,
      parsed:    rawRows.length,
      validated: rows.length,
      remaining: rows.filter((r) => isCommittable(r.classification)).length,
    },
  }

  const hasBlockingFailure = rows.some((r) =>
    r.issues.some((i) => i.blocksCommit) && r.classification === 'ERROR',
  )

  // A job with zero committable rows, or where every row is a blocking
  // error, cannot reach READY — matches assessBatchSafety's posture that
  // an empty/fully-broken batch is not committable, without re-implementing
  // its specific thresholds here (those remain inside the KPI adapter).
  const committableCount = rows.filter((r) => isCommittable(r.classification)).length

  if (rawRows.length === 0 || (hasBlockingFailure && committableCount === 0)) {
    working = transitionJob(working, 'FAILED')
  } else {
    working = transitionJob(working, 'READY')
  }

  return { job: working, rows, summary }
}

function isCommittable(classification: RowClassification): boolean {
  return classification === 'VALID' || classification === 'WARNING' ||
         classification === 'UPDATE'
}

export function summarizeRows(rows: StagedImportRow<unknown>[]): ValidationSummary {
  const summary = emptyValidationSummary(rows.length)
  for (const row of rows) {
    switch (row.classification) {
      case 'VALID':     summary.valid++; break
      case 'WARNING':   summary.warning++; break
      case 'ERROR':     summary.error++; break
      case 'CONFLICT':  summary.conflict++; break
      case 'DUPLICATE': summary.duplicate++; break
      case 'UPDATE':    summary.update++; break
      case 'SKIP':      summary.skip++; break
    }
  }
  return summary
}

export function planCommitBatches<TStaged>(
  rows: StagedImportRow<TStaged>[],
  chunkSize: number = DEFAULT_COMMIT_CHUNK_SIZE,
): StagedImportRow<TStaged>[][] {
  const committable = rows.filter((r) => isCommittable(r.classification))
  const batches: StagedImportRow<TStaged>[][] = []
  for (let i = 0; i < committable.length; i += chunkSize) {
    batches.push(committable.slice(i, i + chunkSize))
  }
  return batches
}

export interface CommitRunResult<TStaged> {
  job:      ImportJob
  rows:     StagedImportRow<TStaged>[]
  result:   ImportJobResult
}

/**
 * Commits all committable rows in chunks via adapter.commitBatch, advancing
 * the job READY -> COMMITTING -> (COMPLETED | PARTIALLY_COMPLETED | FAILED).
 * Supports resuming from a startBatchIndex so an interrupted commit can
 * continue from the last confirmed batch instead of restarting.
 *
 * DX-7 (Large File Processing) additions — both optional and additive,
 * existing callers (onboardingOrchestrator, kpiTargetsImportRunner, every
 * existing test) are unaffected and behave identically without them:
 *   - `onBatchComplete(batchResult, runningTotals)`: invoked after each
 *     chunk commits (success or failure), BEFORE the next chunk starts.
 *     Callers persist a checkpoint here (`repo.saveJob()`) and/or report
 *     progress — the engine itself never touches Firestore.
 *   - `shouldCancel()`: checked before each chunk; when true, the loop
 *     stops without starting the next chunk. Already-committed chunks
 *     are never rolled back — the job ends at PARTIALLY_COMPLETED (or
 *     COMPLETED if every started chunk finished) with an accurate
 *     committed/remaining count, exactly like a real interruption.
 */
export async function commitJob<TRaw, TStaged, TCommitResultRaw>(
  job:      ImportJob,
  adapter:  ImportDomainAdapter<TRaw, TStaged, TCommitResultRaw>,
  rows:     StagedImportRow<TStaged>[],
  commitCtx: ImportCommitContext,
  options?: {
    chunkSize?: number
    startBatchIndex?: number
    existingBatches?: CommitBatchResult[]
    onBatchComplete?: (batchResult: CommitBatchResult, totals: { committed: number; failed: number; skipped: number }) => void | Promise<void>
    shouldCancel?: () => boolean | Promise<boolean>
  },
): Promise<CommitRunResult<TStaged>> {
  // Re-entering COMMITTING (resume) or retrying from PARTIALLY_COMPLETED
  // are both legal per importJobStateMachine.ts — transitionJob() throws
  // on any other starting status, exactly as before.
  let working = transitionJob(job, 'COMMITTING')

  const chunkSize = options?.chunkSize ?? DEFAULT_COMMIT_CHUNK_SIZE
  const batches    = planCommitBatches(rows, chunkSize)
  const startIndex = options?.startBatchIndex ?? 0
  const batchResults: CommitBatchResult[] = [...(options?.existingBatches ?? [])]

  const updatedRows = [...rows]
  let committedTotal = batchResults.reduce((s, b) => s + b.committed, 0)
  let failedTotal     = batchResults.reduce((s, b) => s + b.failed, 0)
  let skippedTotal    = batchResults.reduce((s, b) => s + b.skipped, 0)

  for (let i = startIndex; i < batches.length; i++) {
    if (options?.shouldCancel && await options.shouldCancel()) {
      // Stop before starting the next chunk. Already-committed chunks are
      // never rolled back — finalStatus below correctly reflects the
      // remaining un-attempted rows as PARTIALLY_COMPLETED, never COMPLETED.
      break
    }

    const chunk = batches[i]
    const startedAt = new Date().toISOString()
    let batchResult: CommitBatchResult

    try {
      const commitResult = await adapter.commitBatch(chunk, commitCtx)

      for (const row of chunk) {
        const idx = updatedRows.findIndex((r) => r.rowId === row.rowId)
        if (idx >= 0) {
          updatedRows[idx] = { ...updatedRows[idx], state: 'COMMITTED', committedAt: new Date().toISOString(), committedResult: commitResult }
        }
      }

      const endedAt = new Date().toISOString()
      batchResult = { batchIndex: i, attempted: chunk.length, committed: chunk.length, skipped: 0, failed: 0, errors: [], startedAt, endedAt }
      committedTotal += chunk.length
    } catch (e) {
      const endedAt = new Date().toISOString()
      const message = (e as Error).message
      for (const row of chunk) {
        const idx = updatedRows.findIndex((r) => r.rowId === row.rowId)
        if (idx >= 0) {
          updatedRows[idx] = { ...updatedRows[idx], state: 'FAILED', failureReason: message }
        }
      }
      batchResult = { batchIndex: i, attempted: chunk.length, committed: 0, skipped: 0, failed: chunk.length, errors: chunk.map((r) => ({ rowId: r.rowId, error: message })), startedAt, endedAt }
      failedTotal += chunk.length
    }

    batchResults.push(batchResult)
    if (options?.onBatchComplete) {
      await options.onBatchComplete(batchResult, { committed: committedTotal, failed: failedTotal, skipped: skippedTotal })
    }
  }

  const totalCommittable = batches.reduce((s, b) => s + b.length, 0)
  const remainingTotal = Math.max(0, totalCommittable - committedTotal - failedTotal)
  const finalStatus =
    failedTotal === 0 && remainingTotal === 0
      ? 'COMPLETED'
      : committedTotal === 0 && failedTotal > 0
        ? 'FAILED'
        : 'PARTIALLY_COMPLETED'

  working = transitionJob(working, finalStatus)
  working = {
    ...working,
    commitBatches: batchResults,
    rowCounts: {
      ...working.rowCounts,
      committed: committedTotal,
      failed:    failedTotal,
      skipped:   skippedTotal,
      remaining: Math.max(0, totalCommittable - committedTotal - failedTotal),
    },
    endedAt: new Date().toISOString(),
  }

  const result: ImportJobResult = {
    jobId:      working.jobId,
    status:     working.status,
    totalRows:  rows.length,
    committed:  committedTotal,
    skipped:    skippedTotal,
    failed:     failedTotal,
    remaining:  Math.max(0, totalCommittable - committedTotal - failedTotal),
    batches:    batchResults,
    startedAt:  working.startedAt,
    endedAt:    working.endedAt,
  }

  return { job: working, rows: updatedRows, result }
}

export function computeProgress(rows: StagedImportRow<unknown>[]): ImportProgress {
  const totalRows     = rows.length
  const validRows     = rows.filter((r) => r.classification === 'VALID').length
  const warningRows   = rows.filter((r) => r.classification === 'WARNING').length
  const errorRows     = rows.filter((r) => r.classification === 'ERROR').length
  const duplicateRows = rows.filter((r) => r.classification === 'DUPLICATE').length
  const conflictRows  = rows.filter((r) => r.classification === 'CONFLICT').length
  const committedRows = rows.filter((r) => r.state === 'COMMITTED').length
  const failedRows    = rows.filter((r) => r.state === 'FAILED').length
  const remainingRows = rows.filter((r) => r.state === 'STAGED' && isCommittable(r.classification)).length
  const parsedRows    = totalRows
  const validatedRows = totalRows

  const decided = committedRows + failedRows
  const percentComplete = totalRows === 0 ? 0 : Math.round((decided / totalRows) * 100)

  return {
    totalRows, parsedRows, validatedRows, validRows, warningRows, errorRows,
    duplicateRows, conflictRows, committedRows, failedRows, remainingRows,
    percentComplete,
  }
}
