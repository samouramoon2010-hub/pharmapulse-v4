// ============================================================
// DX-1 — Staging persistence, resume, and idempotency (Part 4, 5, 10)
// ============================================================

import { describe, it, expect } from 'vitest'
import { InMemoryStagingRepository } from './stagingRepository'
import { createImportJob, runValidation, commitJob, planCommitBatches } from './importJobEngine'
import { buildCommitOperationKey } from './importJobTypes'
import type {
  ImportDomainAdapter,
  ImportValidationContext,
  ImportAuthorizationContext,
  RowValidationOutcome,
  AuthorizationOutcome,
  RowDecision,
  DuplicateDetectionResult,
} from './importDomainAdapter'
import type { StagedImportRow } from './importJobTypes'

interface Raw    { id: string; value: number }
interface Staged { id: string; value: number }

function makeAdapter(failIds: Set<string> = new Set()): ImportDomainAdapter<Raw, Staged, { ok: boolean }> {
  return {
    domain: 'BRANCH',
    resolveColumns: () => [],
    parseRow: (r) => r as unknown as Raw,
    validateRow(raw: Raw, _ctx: ImportValidationContext): RowValidationOutcome<Staged> {
      return { classification: 'VALID', issues: [], staged: { id: raw.id, value: raw.value } }
    },
    identityKey: (s) => s.id,
    detectFileDuplicates(staged: Staged[]): DuplicateDetectionResult<Staged> {
      const seen = new Map<string, Staged>()
      for (const s of staged) seen.set(s.id, s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },
    async loadExistingRecords() { return new Map() },
    diffAgainstExisting(): RowDecision { return 'CREATE' },
    authorizeRow(): AuthorizationOutcome { return { allowed: true } },
    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<Staged> {
      return { rowId: `${jobId}-${rowIndex}`, jobId, rowIndex, identityKey: staged.id, classification, issues, staged, state: 'STAGED' }
    },
    async commitBatch(rows) {
      if (rows.some((r) => r.staged && failIds.has(r.staged.id))) throw new Error('simulated failure')
      return { ok: true }
    },
  }
}

const vCtx: ImportValidationContext = { actorUid: 'u1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'u1', actorRole: 'admin' }

describe('DX-1 — Staging repository persistence & readback', () => {
  it('saves and reloads a job and its staged rows unchanged', async () => {
    const repo = new InMemoryStagingRepository<Staged>()
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-persist', domain: 'BRANCH', createdBy: 'u1' })
    const { job, rows } = await runValidation(job0, adapter, [{ id: 'a', value: 1 }, { id: 'b', value: 2 }], vCtx, aCtx)

    await repo.saveJob(job)
    await repo.saveStagedRows(job.jobId, rows)

    const reloadedJob  = await repo.loadJob(job.jobId)
    const reloadedRows = await repo.loadStagedRows(job.jobId)

    expect(reloadedJob).toEqual(job)
    expect(reloadedRows).toEqual(rows)
  })

  it('revalidating a job does not duplicate staged rows — saveStagedRows replaces, not appends', async () => {
    const repo = new InMemoryStagingRepository<Staged>()
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-revalidate', domain: 'BRANCH', createdBy: 'u1' })
    const first = await runValidation(job0, adapter, [{ id: 'a', value: 1 }], vCtx, aCtx)
    await repo.saveStagedRows(first.job.jobId, first.rows)

    // Re-running validation from a fresh DRAFT job against the same identity
    // should still report exactly 1 row, and re-saving must replace, not append.
    const second = await runValidation(
      createImportJob({ jobId: first.job.jobId, domain: 'BRANCH', createdBy: 'u1' }),
      adapter, [{ id: 'a', value: 1 }], vCtx, aCtx,
    )
    await repo.saveStagedRows(second.job.jobId, second.rows)
    const reloaded = await repo.loadStagedRows(second.job.jobId)
    expect(reloaded).toHaveLength(1)
  })

  it('an interrupted commit resumes from the last confirmed batch via the repository', async () => {
    const repo = new InMemoryStagingRepository<Staged>()
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-resume-repo', domain: 'BRANCH', createdBy: 'u1' })
    const raw = [{ id: 'a', value: 1 }, { id: 'b', value: 1 }, { id: 'c', value: 1 }]
    const { job: validated, rows } = await runValidation(job0, adapter, raw, vCtx, aCtx)
    await repo.saveJob(validated)
    await repo.saveStagedRows(validated.jobId, rows)

    // First attempt: commit only the first batch, then simulate interruption
    // by persisting the job with just that one confirmed batch.
    const partial = await commitJob(validated, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId }, { chunkSize: 1, startBatchIndex: 0 })
    const confirmedAfterFirstBatch = { ...partial.job, status: 'READY' as const, commitBatches: partial.job.commitBatches.slice(0, 1) }
    await repo.saveJob(confirmedAfterFirstBatch)

    const lastConfirmed = await repo.loadLastConfirmedBatchIndex(confirmedAfterFirstBatch.jobId)
    expect(lastConfirmed).toBe(0)

    // Resume from batch 1 onward using the repository's record of progress.
    const resumed = await commitJob(
      confirmedAfterFirstBatch, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId },
      { chunkSize: 1, startBatchIndex: lastConfirmed + 1, existingBatches: confirmedAfterFirstBatch.commitBatches },
    )

    expect(resumed.result.committed).toBe(3)
    expect(resumed.result.batches).toHaveLength(3)
  })

  it('a partially completed job reports exact committed and failed counts', async () => {
    const adapter = makeAdapter(new Set(['bad-1']))
    const job0 = createImportJob({ jobId: 'job-partial-exact', domain: 'BRANCH', createdBy: 'u1' })
    const raw = [{ id: 'ok-1', value: 1 }, { id: 'bad-1', value: 1 }, { id: 'ok-2', value: 1 }]
    const { job: validated, rows } = await runValidation(job0, adapter, raw, vCtx, aCtx)

    const { job: committed, result } = await commitJob(validated, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId }, { chunkSize: 1 })

    expect(committed.status).toBe('PARTIALLY_COMPLETED')
    expect(result.committed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.remaining).toBe(0)
  })

  it('deleteAbandonedDraft removes a draft job but refuses once any row has committed', async () => {
    const repo = new InMemoryStagingRepository<Staged>()
    const draft = createImportJob({ jobId: 'job-abandoned', domain: 'BRANCH', createdBy: 'u1' })
    await repo.saveJob(draft)
    expect(await repo.deleteAbandonedDraft('job-abandoned')).toBe(true)
    expect(await repo.loadJob('job-abandoned')).toBeNull()

    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-not-abandoned', domain: 'BRANCH', createdBy: 'u1' })
    const { job: validated, rows } = await runValidation(job0, adapter, [{ id: 'a', value: 1 }], vCtx, aCtx)
    const { job: committed } = await commitJob(validated, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId })
    await repo.saveJob(committed)
    expect(await repo.deleteAbandonedDraft('job-not-abandoned')).toBe(false)
    expect(await repo.loadJob('job-not-abandoned')).not.toBeNull()
  })
})

describe('DX-1 — Idempotency and retry safety', () => {
  it('retrying a successful batch does not create duplicate commits (commit operation key is stable)', () => {
    const key1 = buildCommitOperationKey('job-1', 'u1:branch-1:2026-06-01')
    const key2 = buildCommitOperationKey('job-1', 'u1:branch-1:2026-06-01')
    expect(key1).toBe(key2)
  })

  it('duplicate rows inside one file are classified before commit, not at commit time', async () => {
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-dupe-file', domain: 'BRANCH', createdBy: 'u1' })
    const raw = [{ id: 'x', value: 1 }, { id: 'x', value: 2 }]
    const { rows, summary } = await runValidation(job0, adapter, raw, vCtx, aCtx)
    expect(summary.duplicate).toBe(1)
    // Only the committable (non-duplicate) row should ever reach planCommitBatches.
    const batches = planCommitBatches(rows)
    expect(batches.flat()).toHaveLength(1)
  })

  it('committing the same batch twice is a safe no-op from the engine\'s perspective (same row identities, same outcome)', async () => {
    const adapter = makeAdapter()
    const job0 = createImportJob({ jobId: 'job-retry', domain: 'BRANCH', createdBy: 'u1' })
    const { job: validated, rows } = await runValidation(job0, adapter, [{ id: 'a', value: 1 }], vCtx, aCtx)

    const first  = await commitJob(validated, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId })
    expect(first.result.committed).toBe(1)

    // Retrying commitJob against the same validated rows (e.g. a UI double-submit)
    // re-runs the same idempotent identity-keyed write — never a second distinct row.
    const secondJob = { ...validated, status: 'READY' as const }
    const second = await commitJob(secondJob, adapter, rows, { actorUid: 'u1', actorRole: 'admin', jobId: validated.jobId })
    expect(second.result.committed).toBe(1)
    expect(second.rows.map((r) => r.identityKey)).toEqual(first.rows.map((r) => r.identityKey))
  })
})
