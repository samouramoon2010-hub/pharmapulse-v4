import { describe, it, expect } from 'vitest'
import {
  canTransition,
  assertTransition,
  transitionJob,
  InvalidImportJobTransitionError,
} from './importJobStateMachine'
import { createImportJob } from './importJobEngine'
import type { ImportJobStatus } from './importJobTypes'

const ALL_STATUSES: ImportJobStatus[] = [
  'DRAFT', 'PARSING', 'MAPPED', 'VALIDATING', 'READY', 'COMMITTING',
  'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK',
]

const VALID_PATH: Array<[ImportJobStatus, ImportJobStatus]> = [
  ['DRAFT', 'PARSING'],
  ['PARSING', 'MAPPED'],
  ['MAPPED', 'VALIDATING'],
  ['VALIDATING', 'READY'],
  ['READY', 'COMMITTING'],
  ['COMMITTING', 'COMPLETED'],
  ['COMMITTING', 'PARTIALLY_COMPLETED'],
  ['COMMITTING', 'FAILED'],
  ['COMPLETED', 'ROLLED_BACK'],
  ['PARTIALLY_COMPLETED', 'ROLLED_BACK'],
  ['DRAFT', 'CANCELLED'],
  ['PARSING', 'CANCELLED'],
  ['MAPPED', 'CANCELLED'],
  ['VALIDATING', 'CANCELLED'],
  ['READY', 'CANCELLED'],
  ['PARSING', 'FAILED'],
  ['MAPPED', 'FAILED'],
  ['VALIDATING', 'FAILED'],
  // DX-7 (Large File Processing): resume an interrupted commit, or retry
  // the remaining/failed rows of a partially-completed job — no new
  // states, two new edges only (see importJobStateMachine.ts header).
  ['COMMITTING', 'COMMITTING'],
  ['PARTIALLY_COMPLETED', 'COMMITTING'],
]

describe('DX-1 — Import Job state machine', () => {
  it('accepts every documented valid transition', () => {
    for (const [from, to] of VALID_PATH) {
      expect(canTransition(from, to)).toBe(true)
      expect(() => assertTransition(from, to)).not.toThrow()
    }
  })

  it('rejects every transition not explicitly listed as valid, with a controlled diagnostic', () => {
    let rejectedCount = 0
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const isDocumentedValid = VALID_PATH.some(([f, t]) => f === from && t === to)
        if (isDocumentedValid) continue
        expect(canTransition(from, to)).toBe(false)
        expect(() => assertTransition(from, to)).toThrow(InvalidImportJobTransitionError)
        rejectedCount++
      }
    }
    expect(rejectedCount).toBeGreaterThan(0)
  })

  it('terminal statuses (FAILED, CANCELLED) have no outgoing transitions', () => {
    expect(canTransition('FAILED', 'DRAFT')).toBe(false)
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false)
    expect(canTransition('FAILED', 'READY')).toBe(false)
  })

  it('ROLLED_BACK is reachable only from COMPLETED or PARTIALLY_COMPLETED', () => {
    expect(canTransition('COMPLETED', 'ROLLED_BACK')).toBe(true)
    expect(canTransition('PARTIALLY_COMPLETED', 'ROLLED_BACK')).toBe(true)
    expect(canTransition('READY', 'ROLLED_BACK')).toBe(false)
    expect(canTransition('FAILED', 'ROLLED_BACK')).toBe(false)
  })

  it('transitionJob() records statusHistory and rejects illegal jumps', () => {
    const job = createImportJob({ jobId: 'job-1', domain: 'KPI_ACTUALS', createdBy: 'uid-1' })
    expect(job.status).toBe('DRAFT')
    expect(job.statusHistory).toHaveLength(1)

    const parsing = transitionJob(job, 'PARSING')
    expect(parsing.status).toBe('PARSING')
    expect(parsing.statusHistory).toHaveLength(2)
    expect(parsing.statusHistory[1]).toMatchObject({ from: 'DRAFT', to: 'PARSING' })

    expect(() => transitionJob(parsing, 'COMMITTING')).toThrow(InvalidImportJobTransitionError)
  })

  it('DRAFT cannot jump directly to COMMITTING (must pass through validation)', () => {
    expect(canTransition('DRAFT', 'COMMITTING')).toBe(false)
  })

  it('a job cannot leave COMPLETED except to ROLLED_BACK', () => {
    expect(canTransition('COMPLETED', 'COMMITTING')).toBe(false)
    expect(canTransition('COMPLETED', 'READY')).toBe(false)
  })

  it('DX-7: a PARTIALLY_COMPLETED job can be retried (re-enter COMMITTING), but a fully COMPLETED job cannot', () => {
    expect(canTransition('PARTIALLY_COMPLETED', 'COMMITTING')).toBe(true)
    expect(canTransition('COMPLETED', 'COMMITTING')).toBe(false)
  })

  it('DX-7: an interrupted commit can resume by re-entering COMMITTING from COMMITTING', () => {
    expect(canTransition('COMMITTING', 'COMMITTING')).toBe(true)
  })

  it('DX-7: a terminal FAILED/CANCELLED job still cannot be resumed or retried', () => {
    expect(canTransition('FAILED', 'COMMITTING')).toBe(false)
    expect(canTransition('CANCELLED', 'COMMITTING')).toBe(false)
  })
})
