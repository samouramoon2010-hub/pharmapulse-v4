// ============================================================
// Staging Repository (DX-1, Part 4)
//
// Firestore access boundary for staged import rows and job records.
// The engine and adapters never call Firestore directly — they go
// through this interface, so a Firestore-backed implementation can be
// swapped in without touching engine/adapter code.
//
// DX-1 ships only the in-memory implementation (used by the engine's
// own tests and by shadow-mode runs, which by design must never
// perform a second production write). No new Firestore collection is
// created in this bundle — see docs/dx/DX1_IMPORT_JOB_SCHEMA.md for
// the proposed `import_jobs` schema, which is documented but
// deliberately NOT applied to firestore.rules/firestore.indexes.json
// here. The existing `staging_entries` collection (used today by the
// KPI Actuals legacy path) is read-only audited in this bundle, not
// modified — see that doc for the audit findings.
// ============================================================

import type { ImportJob, StagedImportRow } from './importJobTypes'

export interface StagingRepository<TStaged = unknown> {
  saveJob(job: ImportJob): Promise<void>
  loadJob(jobId: string): Promise<ImportJob | null>

  saveStagedRows(jobId: string, rows: StagedImportRow<TStaged>[]): Promise<void>
  loadStagedRows(jobId: string): Promise<StagedImportRow<TStaged>[]>

  updateRowState(jobId: string, rowId: string, patch: Partial<StagedImportRow<TStaged>>): Promise<void>

  /** Returns the most recently confirmed batch index for a job, or -1 if none. */
  loadLastConfirmedBatchIndex(jobId: string): Promise<number>

  /** Soft-cleanup hook for draft jobs abandoned before validation — never
   *  deletes a job that has any committed rows. */
  deleteAbandonedDraft(jobId: string): Promise<boolean>
}

/**
 * In-memory implementation. Used by DX-1 tests and by shadow-mode runs.
 * A real Firestore-backed implementation is deferred — see module header.
 */
export class InMemoryStagingRepository<TStaged = unknown> implements StagingRepository<TStaged> {
  private jobs   = new Map<string, ImportJob>()
  private rows   = new Map<string, StagedImportRow<TStaged>[]>()

  async saveJob(job: ImportJob): Promise<void> {
    this.jobs.set(job.jobId, { ...job })
  }

  async loadJob(jobId: string): Promise<ImportJob | null> {
    const job = this.jobs.get(jobId)
    return job ? { ...job } : null
  }

  async saveStagedRows(jobId: string, rows: StagedImportRow<TStaged>[]): Promise<void> {
    this.rows.set(jobId, rows.map((r) => ({ ...r })))
  }

  async loadStagedRows(jobId: string): Promise<StagedImportRow<TStaged>[]> {
    return (this.rows.get(jobId) ?? []).map((r) => ({ ...r }))
  }

  async updateRowState(jobId: string, rowId: string, patch: Partial<StagedImportRow<TStaged>>): Promise<void> {
    const rows = this.rows.get(jobId)
    if (!rows) return
    const idx = rows.findIndex((r) => r.rowId === rowId)
    if (idx >= 0) rows[idx] = { ...rows[idx], ...patch }
  }

  async loadLastConfirmedBatchIndex(jobId: string): Promise<number> {
    const job = this.jobs.get(jobId)
    if (!job || job.commitBatches.length === 0) return -1
    return Math.max(...job.commitBatches.map((b) => b.batchIndex))
  }

  async deleteAbandonedDraft(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) return false
    if (job.rowCounts.committed > 0) return false
    if (job.status !== 'DRAFT' && job.status !== 'FAILED' && job.status !== 'CANCELLED') return false
    this.jobs.delete(jobId)
    this.rows.delete(jobId)
    return true
  }
}
