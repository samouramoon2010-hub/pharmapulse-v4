// ============================================================
// Firestore-backed Staging Repository (DX-2/DX-3, Part 1)
//
// Real implementation of DX-1's StagingRepository interface against
// the new `import_jobs` collection + `rows` subcollection (schema
// documented in docs/dx/DX1_IMPORT_JOB_SCHEMA.md, now applied).
//
// Does NOT touch the existing `staging_entries` collection — that
// collection's contract (KPI Actuals legacy path) is unmodified, per
// "prefer backward-compatible extension over replacement."
//
// No raw uploaded file binary is ever written here — only
// `ImportFileMetadata` (name/size/checksum/sheet), matching the
// explicit "do not store raw uploaded file binaries in Firestore"
// requirement.
// ============================================================

import {
  doc, setDoc, getDoc, getDocs, collection, query, where,
  orderBy, limit as fbLimit, writeBatch, serverTimestamp, deleteDoc,
} from 'firebase/firestore'
import { db, COL } from './dxFirebaseTypes'
import type { StagingRepository } from './stagingRepository'
import type { ImportJob, StagedImportRow, ImportDomain } from './importJobTypes'
import { stripUndefinedDeep } from './firestoreSanitize'

function jobsCol() {
  return collection(db, COL.IMPORT_JOBS)
}
function rowsCol(jobId: string) {
  return collection(db, COL.IMPORT_JOBS, jobId, 'rows')
}

export class FirestoreStagingRepository<TStaged = unknown> implements StagingRepository<TStaged> {
  async saveJob(job: ImportJob): Promise<void> {
    await setDoc(doc(db, COL.IMPORT_JOBS, job.jobId), stripUndefinedDeep({
      ...job,
      updatedAt: serverTimestamp(),
    }), { merge: false })
  }

  async loadJob(jobId: string): Promise<ImportJob | null> {
    const snap = await getDoc(doc(db, COL.IMPORT_JOBS, jobId))
    if (!snap.exists()) return null
    return snap.data() as ImportJob
  }

  async saveStagedRows(jobId: string, rows: StagedImportRow<TStaged>[]): Promise<void> {
    // Firestore writeBatch limit is 500 ops — chunk at 400, matching the
    // convention already used by the legacy KPI commit path.
    const CHUNK = 400
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = writeBatch(db)
      for (const row of rows.slice(i, i + CHUNK)) {
        batch.set(doc(rowsCol(jobId), row.rowId), stripUndefinedDeep(row), { merge: false })
      }
      await batch.commit()
    }
  }

  async loadStagedRows(jobId: string): Promise<StagedImportRow<TStaged>[]> {
    const snap = await getDocs(query(rowsCol(jobId), orderBy('rowIndex')))
    return snap.docs.map((d) => d.data() as StagedImportRow<TStaged>)
  }

  async updateRowState(jobId: string, rowId: string, patch: Partial<StagedImportRow<TStaged>>): Promise<void> {
    await setDoc(doc(rowsCol(jobId), rowId), stripUndefinedDeep(patch), { merge: true })
  }

  async loadLastConfirmedBatchIndex(jobId: string): Promise<number> {
    const job = await this.loadJob(jobId)
    if (!job || job.commitBatches.length === 0) return -1
    return Math.max(...job.commitBatches.map((b) => b.batchIndex))
  }

  async deleteAbandonedDraft(jobId: string): Promise<boolean> {
    const job = await this.loadJob(jobId)
    if (!job) return false
    if (job.rowCounts.committed > 0) return false
    if (job.status !== 'DRAFT' && job.status !== 'FAILED' && job.status !== 'CANCELLED') return false

    const rowsSnap = await getDocs(rowsCol(jobId))
    const batch = writeBatch(db)
    rowsSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    await deleteDoc(doc(db, COL.IMPORT_JOBS, jobId))
    return true
  }
}

/**
 * Re-upload detection (Part 5/6): finds a prior job for the same domain,
 * same uploader, with an identical file checksum. Used to warn — never
 * to silently block — a re-upload of the same file.
 */
export async function findJobByChecksum(
  domain:    ImportDomain,
  checksum:  string,
  createdBy: string,
): Promise<ImportJob | null> {
  const snap = await getDocs(query(
    jobsCol(),
    where('domain', '==', domain),
    where('createdBy', '==', createdBy),
    where('fileMeta.checksum', '==', checksum),
    orderBy('createdAt', 'desc'),
    fbLimit(1),
  ))
  if (snap.empty) return null
  return snap.docs[0].data() as ImportJob
}

/**
 * Import history (DX-9 closure): the most recent import_jobs documents,
 * newest first. Admin-only by convention — the matching Firestore rule
 * (`import_jobs` read: `createdBy == uid() || isAdmin()`) already scopes
 * a non-admin caller to their own jobs only, but this function is meant
 * to back the Data Exchange Studio admin history view, not a per-user
 * "my uploads" view, so callers are expected to gate on isAdmin() before
 * invoking it (see DataExchangeStudioPage.jsx's ImportHistorySection).
 * No raw row payloads are read here — only the job summary document.
 */
export async function listRecentImportJobs(maxResults = 25): Promise<ImportJob[]> {
  const snap = await getDocs(query(
    jobsCol(),
    orderBy('createdAt', 'desc'),
    fbLimit(maxResults),
  ))
  return snap.docs.map((d) => d.data() as ImportJob)
}
