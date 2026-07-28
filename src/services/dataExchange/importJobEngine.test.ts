import { describe, it, expect } from 'vitest'
import {
  createImportJob,
  runValidation,
  commitJob,
  planCommitBatches,
  computeProgress,
  summarizeRows,
} from './importJobEngine'
import type {
  ImportDomainAdapter,
  ImportValidationContext,
  ImportAuthorizationContext,
  ImportCommitContext,
  RowValidationOutcome,
  DuplicateDetectionResult,
  AuthorizationOutcome,
  RowDecision,
} from './importDomainAdapter'
import type { RowClassification, ValidationIssue, StagedImportRow } from './importJobTypes'

// ── A minimal, domain-agnostic fake adapter for pure engine tests ──
// Deliberately NOT KPI-shaped — proves the engine has no coupling to any
// specific entity. KPI-Actuals-specific parity is covered separately in
// adapters/kpiActualsAdapter.parity.test.ts.

interface FakeRaw   { id: string; value: number; restricted?: boolean; existingMatch?: 'CONFLICT' | 'UPDATE' | 'SKIP' }
interface FakeStaged { id: string; value: number }
interface FakeCommitResult { ok: boolean }

function makeFakeAdapter(): ImportDomainAdapter<FakeRaw, FakeStaged, FakeCommitResult> {
  return {
    domain: 'BRANCH',

    resolveColumns: () => [],

    parseRow: (rawRow) => rawRow as unknown as FakeRaw,

    validateRow(raw: FakeRaw, _ctx: ImportValidationContext): RowValidationOutcome<FakeStaged> {
      if (raw.value < 0) {
        return {
          classification: 'ERROR',
          issues: [{ rowIndex: 0, code: 'NEGATIVE_VALUE', message: 'value is negative', blocksCommit: true }],
        }
      }
      if (raw.value === 0) {
        return {
          classification: 'WARNING',
          issues: [{ rowIndex: 0, code: 'ZERO_VALUE', message: 'value is zero', blocksCommit: false }],
          staged: { id: raw.id, value: raw.value },
        }
      }
      return { classification: 'VALID', issues: [], staged: { id: raw.id, value: raw.value } }
    },

    identityKey: (staged) => staged.id,

    detectFileDuplicates(staged: FakeStaged[]): DuplicateDetectionResult<FakeStaged> {
      const seen = new Map<string, FakeStaged>()
      for (const s of staged) seen.set(s.id, s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(staged: FakeStaged[], _ctx): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const s of staged) {
        if (s.id.startsWith('conflict-')) map.set(s.id, { tag: 'CONFLICT' })
        if (s.id.startsWith('update-'))   map.set(s.id, { tag: 'UPDATE' })
        if (s.id.startsWith('skip-'))     map.set(s.id, { tag: 'SKIP' })
      }
      return map
    },

    diffAgainstExisting(staged: FakeStaged, existing: unknown | null): RowDecision {
      const tag = (existing as { tag?: string } | null)?.tag
      if (tag === 'CONFLICT') return 'CONFLICT'
      if (tag === 'UPDATE')   return 'UPDATE'
      if (tag === 'SKIP')     return 'SKIP'
      return 'CREATE'
    },

    authorizeRow(staged: FakeStaged, _ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (staged.id.startsWith('forbidden-')) return { allowed: false, reason: 'out of scope' }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<FakeStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`,
        jobId,
        rowIndex,
        identityKey: staged ? staged.id : `unknown-${rowIndex}`,
        classification,
        issues,
        staged,
        state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<FakeStaged>[], _ctx: ImportCommitContext): Promise<FakeCommitResult> {
      if (rows.some((r) => r.staged?.id === 'fail-batch')) {
        throw new Error('Simulated commit failure')
      }
      return { ok: true }
    },
  }
}

const validationCtx: ImportValidationContext = { actorUid: 'uid-1', actorRole: 'admin' }
const authCtx: ImportAuthorizationContext     = { actorUid: 'uid-1', actorRole: 'admin' }
const commitCtx: ImportCommitContext          = { actorUid: 'uid-1', actorRole: 'admin', jobId: 'job-x' }

describe('DX-1 — Import Job Engine (domain-agnostic)', () => {
  it('createImportJob omits fileMeta and mappingVersion entirely when not provided — never assigns them undefined', () => {
    const job = createImportJob({ jobId: 'job-no-meta', domain: 'BRANCH', createdBy: 'uid-1' })
    expect('fileMeta' in job).toBe(false)
    expect('mappingVersion' in job).toBe(false)
  })

  it('createImportJob includes fileMeta/mappingVersion when explicitly provided', () => {
    const job = createImportJob({
      jobId: 'job-with-meta', domain: 'BRANCH', createdBy: 'uid-1',
      fileMeta: { fileName: 'x.xlsx', sizeBytes: 10 },
      mappingVersion: 'v1',
    })
    expect(job.fileMeta).toEqual({ fileName: 'x.xlsx', sizeBytes: 10 })
    expect(job.mappingVersion).toBe('v1')
  })

  it('classifies VALID, WARNING, and ERROR rows from a fake adapter', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-x', domain: 'BRANCH', createdBy: 'uid-1' })

    const raw: FakeRaw[] = [
      { id: 'a', value: 10 },
      { id: 'b', value: 0 },
      { id: 'c', value: -5 },
    ]

    const { job: validated, rows, summary } = await runValidation(job, adapter, raw, validationCtx, authCtx)

    expect(validated.status).toBe('READY')
    expect(rows.find((r) => r.identityKey === 'a')?.classification).toBe('VALID')
    expect(rows.find((r) => r.identityKey === 'b')?.classification).toBe('WARNING')
    // Row 'c' failed validation before a staged value existed, so its
    // identityKey falls back to the row-index placeholder — find by index.
    expect(rows[2].classification).toBe('ERROR')
    expect(summary).toEqual({ totalRows: 3, valid: 1, warning: 1, error: 1, conflict: 0, duplicate: 0, update: 0, skip: 0 })
  })

  it('classifies CONFLICT, UPDATE, and SKIP via diffAgainstExisting', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-y', domain: 'BRANCH', createdBy: 'uid-1' })

    const raw: FakeRaw[] = [
      { id: 'conflict-1', value: 5 },
      { id: 'update-1', value: 5 },
      { id: 'skip-1', value: 5 },
      { id: 'new-1', value: 5 },
    ]

    const { rows } = await runValidation(job, adapter, raw, validationCtx, authCtx)

    expect(rows.find((r) => r.identityKey === 'conflict-1')?.classification).toBe('CONFLICT')
    expect(rows.find((r) => r.identityKey === 'update-1')?.classification).toBe('UPDATE')
    expect(rows.find((r) => r.identityKey === 'skip-1')?.classification).toBe('SKIP')
    expect(rows.find((r) => r.identityKey === 'new-1')?.classification).toBe('VALID')
  })

  it('classifies within-file duplicates as DUPLICATE without dropping the row from the report', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-dup', domain: 'BRANCH', createdBy: 'uid-1' })

    const raw: FakeRaw[] = [
      { id: 'dup-1', value: 1 },
      { id: 'dup-1', value: 2 },  // same identity — later row should be DUPLICATE, not silently merged
    ]

    const { rows, summary } = await runValidation(job, adapter, raw, validationCtx, authCtx)
    expect(rows).toHaveLength(2)
    expect(summary.duplicate).toBe(1)
  })

  it('rejects rows that fail row-level authorization, never silently dropping them', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-auth', domain: 'BRANCH', createdBy: 'uid-1' })

    const raw: FakeRaw[] = [{ id: 'forbidden-1', value: 5 }]
    const { rows } = await runValidation(job, adapter, raw, validationCtx, authCtx)

    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('fails the job when every row is a blocking error', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-allbad', domain: 'BRANCH', createdBy: 'uid-1' })
    const raw: FakeRaw[] = [{ id: 'a', value: -1 }, { id: 'b', value: -2 }]
    const { job: validated } = await runValidation(job, adapter, raw, validationCtx, authCtx)
    expect(validated.status).toBe('FAILED')
  })

  it('fails the job on an empty file', async () => {
    const adapter = makeFakeAdapter()
    const job = createImportJob({ jobId: 'job-empty', domain: 'BRANCH', createdBy: 'uid-1' })
    const { job: validated } = await runValidation(job, adapter, [], validationCtx, authCtx)
    expect(validated.status).toBe('FAILED')
  })

  it('commits all committable rows and reaches COMPLETED', async () => {
    const adapter = makeFakeAdapter()
    let job = createImportJob({ jobId: 'job-commit-ok', domain: 'BRANCH', createdBy: 'uid-1' })
    const raw: FakeRaw[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]
    const validation = await runValidation(job, adapter, raw, validationCtx, authCtx)
    job = validation.job

    const { job: committed, result } = await commitJob(job, adapter, validation.rows, { ...commitCtx, jobId: job.jobId })
    expect(committed.status).toBe('COMPLETED')
    expect(result.committed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('reaches PARTIALLY_COMPLETED when one batch fails and another succeeds', async () => {
    const adapter = makeFakeAdapter()
    let job = createImportJob({ jobId: 'job-partial', domain: 'BRANCH', createdBy: 'uid-1' })
    const raw: FakeRaw[] = [{ id: 'ok-1', value: 1 }, { id: 'fail-batch', value: 1 }]
    const validation = await runValidation(job, adapter, raw, validationCtx, authCtx)
    job = validation.job

    // Force two separate batches (chunk size 1) so one batch's failure does
    // not take down the other — proves "one invalid row must not fail the
    // whole job" at the commit layer too.
    const { job: committed, result } = await commitJob(
      job, adapter, validation.rows, { ...commitCtx, jobId: job.jobId }, { chunkSize: 1 },
    )

    expect(committed.status).toBe('PARTIALLY_COMPLETED')
    expect(result.committed).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('resumes an interrupted commit from the last confirmed batch without re-committing it', async () => {
    const adapter = makeFakeAdapter()
    let job = createImportJob({ jobId: 'job-resume', domain: 'BRANCH', createdBy: 'uid-1' })
    const raw: FakeRaw[] = [{ id: 'a', value: 1 }, { id: 'b', value: 1 }, { id: 'c', value: 1 }]
    const validation = await runValidation(job, adapter, raw, validationCtx, authCtx)
    job = validation.job

    // Simulate: batch 0 already confirmed (chunkSize 1 -> 3 batches total).
    const firstBatches = planCommitBatches(validation.rows, 1)
    expect(firstBatches).toHaveLength(3)

    const { result } = await commitJob(
      job, adapter, validation.rows, { ...commitCtx, jobId: job.jobId },
      {
        chunkSize: 1,
        startBatchIndex: 1,
        existingBatches: [{
          batchIndex: 0, attempted: 1, committed: 1, skipped: 0, failed: 0, errors: [],
          startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        }],
      },
    )

    // Total committed across resumed + already-confirmed batches = 3, and
    // exactly 3 batch records exist (no duplicate re-run of batch 0).
    expect(result.committed).toBe(3)
    expect(result.batches).toHaveLength(3)
    expect(result.batches[0].batchIndex).toBe(0)
  })

  it('planCommitBatches only includes committable rows, never ERROR/CONFLICT/SKIP/DUPLICATE', () => {
    const rows: StagedImportRow<FakeStaged>[] = [
      { rowId: '1', jobId: 'j', rowIndex: 1, identityKey: 'a', classification: 'VALID', issues: [], staged: { id: 'a', value: 1 }, state: 'STAGED' },
      { rowId: '2', jobId: 'j', rowIndex: 2, identityKey: 'b', classification: 'ERROR', issues: [], state: 'STAGED' },
      { rowId: '3', jobId: 'j', rowIndex: 3, identityKey: 'c', classification: 'CONFLICT', issues: [], state: 'STAGED' },
      { rowId: '4', jobId: 'j', rowIndex: 4, identityKey: 'd', classification: 'UPDATE', issues: [], staged: { id: 'd', value: 1 }, state: 'STAGED' },
    ]
    const batches = planCommitBatches(rows, 10)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((r) => r.identityKey)).toEqual(['a', 'd'])
  })

  it('computeProgress reports an accurate breakdown including percentComplete', async () => {
    const adapter = makeFakeAdapter()
    let job = createImportJob({ jobId: 'job-progress', domain: 'BRANCH', createdBy: 'uid-1' })
    const raw: FakeRaw[] = [{ id: 'a', value: 1 }, { id: 'b', value: -1 }]
    const validation = await runValidation(job, adapter, raw, validationCtx, authCtx)
    job = validation.job

    const before = computeProgress(validation.rows)
    expect(before.validRows).toBe(1)
    expect(before.errorRows).toBe(1)
    expect(before.percentComplete).toBe(0)

    const { rows: committedRows } = await commitJob(job, adapter, validation.rows, { ...commitCtx, jobId: job.jobId })
    const after = computeProgress(committedRows)
    expect(after.committedRows).toBe(1)
    expect(after.percentComplete).toBe(50)  // 1 committed of 2 total rows
  })

  it('summarizeRows matches manual counts for a mixed classification set', () => {
    const rows: StagedImportRow<unknown>[] = (
      ['VALID', 'VALID', 'WARNING', 'ERROR', 'CONFLICT', 'DUPLICATE', 'UPDATE', 'SKIP'] as RowClassification[]
    ).map((classification, i) => ({
      rowId: String(i), jobId: 'j', rowIndex: i, identityKey: String(i),
      classification, issues: [] as ValidationIssue[], state: 'STAGED' as const,
    }))
    const summary = summarizeRows(rows)
    expect(summary).toEqual({ totalRows: 8, valid: 2, warning: 1, error: 1, conflict: 1, duplicate: 1, update: 1, skip: 1 })
  })
})
