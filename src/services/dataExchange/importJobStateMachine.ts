// ============================================================
// Import Job — Status State Machine (DX-1, Part 1)
//
// Pure, synchronous, no Firestore. Defines exactly which
// ImportJobStatus transitions are legal and rejects everything else
// with a controlled diagnostic (never a generic crash).
// ============================================================

import type { ImportJob, ImportJobStatus } from './importJobTypes'

export class InvalidImportJobTransitionError extends Error {
  readonly from: ImportJobStatus
  readonly to:   ImportJobStatus

  constructor(from: ImportJobStatus, to: ImportJobStatus) {
    super(`Invalid import job transition: ${from} -> ${to}`)
    this.name = 'InvalidImportJobTransitionError'
    this.from = from
    this.to   = to
  }
}

// Adjacency list of legal forward transitions.
//
// DX-7 (Large File Processing) addition: two new edges, no new states —
//   COMMITTING -> COMMITTING        resuming a commit interrupted before
//                                    it reached a terminal status (e.g.
//                                    browser closed mid-chunk-loop). The
//                                    job doc was checkpointed after each
//                                    completed chunk (see
//                                    importJobEngine.ts commitJob()'s
//                                    onBatchComplete hook), so re-entering
//                                    COMMITTING and resuming from
//                                    loadLastConfirmedBatchIndex()+1 is
//                                    safe and duplicate-free.
//   PARTIALLY_COMPLETED -> COMMITTING   retrying the rows that failed or
//                                    never ran in a prior commit attempt.
//                                    PARTIALLY_COMPLETED already carries
//                                    the per-row STAGED/FAILED/COMMITTED
//                                    state needed to retry only what
//                                    didn't succeed — this is the existing
//                                    "PARTIAL_FAILURE is retryable" state,
//                                    not a new one (see DX-7 doc).
const TRANSITIONS: Record<ImportJobStatus, ImportJobStatus[]> = {
  DRAFT:                ['PARSING', 'CANCELLED'],
  PARSING:               ['MAPPED', 'FAILED', 'CANCELLED'],
  MAPPED:                ['VALIDATING', 'FAILED', 'CANCELLED'],
  VALIDATING:            ['READY', 'FAILED', 'CANCELLED'],
  READY:                 ['COMMITTING', 'CANCELLED'],
  COMMITTING:            ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'COMMITTING'],
  COMPLETED:             ['ROLLED_BACK'],
  PARTIALLY_COMPLETED:   ['ROLLED_BACK', 'COMMITTING'],
  FAILED:                [],
  CANCELLED:             [],
  ROLLED_BACK:           [],
}

export const TERMINAL_STATUSES: ReadonlySet<ImportJobStatus> = new Set([
  'FAILED', 'CANCELLED', 'ROLLED_BACK',
])

export function isTerminalStatus(status: ImportJobStatus): boolean {
  return TERMINAL_STATUSES.has(status) ||
    // COMPLETED/PARTIALLY_COMPLETED are terminal for commit purposes,
    // even though ROLLED_BACK remains reachable from them.
    false
}

export function canTransition(from: ImportJobStatus, to: ImportJobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

/** Throws InvalidImportJobTransitionError on an illegal transition. */
export function assertTransition(from: ImportJobStatus, to: ImportJobStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidImportJobTransitionError(from, to)
  }
}

/** Returns a new ImportJob with the transition applied and statusHistory updated. */
export function transitionJob(job: ImportJob, to: ImportJobStatus, at: string = new Date().toISOString()): ImportJob {
  assertTransition(job.status, to)
  return {
    ...job,
    status:    to,
    updatedAt: at,
    statusHistory: [...job.statusHistory, { from: job.status, to, at }],
  }
}
