// ============================================================
// Phase 5A + 5B — Evaluation Ledger + Execution Layer
//
// Covers:
//   1. evaluationLedgerTypes / Validation / Factory (5A)
//   2. evaluationLedgerService — append-only, RBAC (5A)
//   3. evaluationRunner / evaluationBatchRunner / evaluationSnapshot (5B)
//
// NO Profile Studio changes — only consumes its existing exports
// (simulateProfile, persistenceGuards). NO new collections beyond
// evaluationLedgerEntries.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { validateLedgerEntry, isLedgerEntryValid } from './evaluationLedgerValidation'
import { createLedgerEntry, generateEvaluationId, cloneLedgerEntry } from './evaluationLedgerFactory'
import { runEvaluation } from './evaluationRunner'
import { runEvaluationBatch, MAX_BATCH_SIZE } from './evaluationBatchRunner'
import { createLedgerEntrySnapshot, exportLedgerEntryJson, compareLedgerEntries } from './evaluationSnapshot'
import type { CreateLedgerEntryInput } from './evaluationLedgerTypes'
import type { EvaluationProfileDraft } from '../profileStudio/types'

// ── Firestore mocking (same convention as profileStudio tests) ──
const mockAddDoc = vi.fn(() => Promise.resolve({ id: 'led1' }))
const mockGetDocs = vi.fn(() => Promise.resolve({ docs: [] }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => ({ __collection: args })),
  doc: vi.fn((...args) => ({ __doc: args })),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: vi.fn((...args) => ({ __query: args })),
  where: vi.fn((...args) => ({ __where: args })),
  orderBy: vi.fn((...args) => ({ __orderBy: args })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: class { toDate() { return new Date() } },
}))
vi.mock('../services/firebase', () => ({ db: {}, auth: {} }))

import { createLedgerEntryDocument, listLedgerEntries, EL_COL } from './evaluationLedgerService'

function makeEntryInput(overrides: Partial<CreateLedgerEntryInput> = {}): CreateLedgerEntryInput {
  return {
    entityId: 'br-001',
    entityType: 'branch',
    profileId: 'p1',
    profileVersion: '1.0.0',
    periodId: '2026-06',
    score: 82.5,
    basketScores: { b1: 80 },
    elementScores: { e1: 85 },
    ruleScores: { r1: 90 },
    trace: { profileId: 'p1', profileVersion: '1.0.0', overallScore: 82.5, baskets: [], timestamp: '2026-06-01T00:00:00.000Z' },
    ...overrides,
  }
}

function makePublishedProfile(): EvaluationProfileDraft {
  return {
    metadata: { id: 'p1', name: 'P', version: '1.0.0', status: 'PUBLISHED', scope: 'PHARMACY', validFrom: '2026-01-01' } as any,
    root: {
      id: 'root1', label: 'P',
      baskets: [{
        id: 'b1', label: 'B1', weight: 1, pipeline: { steps: [] },
        elements: [{
          id: 'e1', label: 'E1', weight: 1, pipeline: { steps: [] },
          rules: [{ id: 'r1', kpiKey: 'wasfaty', label: 'R1', metricType: 'count', weight: 1, pipeline: { steps: [{ processorType: 'RATIO_EVALUATOR', order: 0, config: {} }] } }],
        }],
      }],
    },
  } as any
}

beforeEach(() => {
  mockAddDoc.mockClear()
  mockGetDocs.mockClear()
})

// ════════════════════════════════════════════════════════════
// 5A — Validation
// ════════════════════════════════════════════════════════════

describe('validateLedgerEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(validateLedgerEntry(makeEntryInput()).valid).toBe(true)
  })
  it.each(['entityId', 'profileId', 'profileVersion', 'periodId'] as const)('rejects a missing %s', (field) => {
    const input: any = makeEntryInput()
    delete input[field]
    expect(validateLedgerEntry(input).valid).toBe(false)
  })
  it('rejects a non-finite score', () => {
    expect(validateLedgerEntry(makeEntryInput({ score: NaN })).valid).toBe(false)
  })
  it('rejects an invalid entityType', () => {
    expect(validateLedgerEntry(makeEntryInput({ entityType: 'company' as any })).valid).toBe(false)
  })
  it('rejects a non-map basketScores', () => {
    expect(validateLedgerEntry(makeEntryInput({ basketScores: [1, 2] as any })).valid).toBe(false)
  })
  it('rejects a missing trace', () => {
    const input: any = makeEntryInput()
    delete input.trace
    expect(validateLedgerEntry(input).valid).toBe(false)
  })
  it('never throws on null input', () => {
    expect(() => validateLedgerEntry(null)).not.toThrow()
  })
  it('never throws on undefined input', () => {
    expect(() => validateLedgerEntry(undefined)).not.toThrow()
  })
  it('isLedgerEntryValid mirrors validateLedgerEntry().valid', () => {
    expect(isLedgerEntryValid(makeEntryInput())).toBe(true)
    expect(isLedgerEntryValid({})).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 5A — Factory
// ════════════════════════════════════════════════════════════

describe('createLedgerEntry / generateEvaluationId', () => {
  it('builds a complete entry from a valid input', () => {
    const entry = createLedgerEntry(makeEntryInput())
    expect(entry.entityId).toBe('br-001')
    expect(entry.score).toBe(82.5)
    expect(entry.evaluationId).toBeTruthy()
    expect(entry.timestamp).toBeTruthy()
  })
  it('generates a unique evaluationId on each call', () => {
    const ids = new Set([generateEvaluationId(), generateEvaluationId(), generateEvaluationId()])
    expect(ids.size).toBe(3)
  })
  it('deep-copies basketScores/elementScores/ruleScores (mutating output does not affect input)', () => {
    const input = makeEntryInput()
    const entry = createLedgerEntry(input)
    entry.basketScores.b1 = 999
    expect(input.basketScores.b1).toBe(80)
  })
  it('never throws on malformed input', () => {
    expect(() => createLedgerEntry({} as any)).not.toThrow()
    expect(() => createLedgerEntry(null as any)).not.toThrow()
  })
  it('cloneLedgerEntry produces a deep copy', () => {
    const entry = createLedgerEntry(makeEntryInput())
    const clone = cloneLedgerEntry(entry)
    clone.score = 0
    expect(entry.score).toBe(82.5)
  })
})

// ════════════════════════════════════════════════════════════
// 5A — Service (RBAC + append-only)
// ════════════════════════════════════════════════════════════

describe('evaluationLedgerService — RBAC and append-only behavior', () => {
  it('EL_COL points at the single new collection', () => {
    expect(EL_COL.LEDGER_ENTRIES).toBe('evaluationLedgerEntries')
  })
  it.each(['admin', 'district_supervisor', 'manager'])('%s can write a ledger entry', async (role) => {
    const entry = createLedgerEntry(makeEntryInput())
    await expect(createLedgerEntryDocument(entry, { uid: 'u1', role: role as any })).resolves.toBeTruthy()
  })
  it.each(['general_manager', 'pharmacist'])('%s cannot write a ledger entry', async (role) => {
    const entry = createLedgerEntry(makeEntryInput())
    await expect(createLedgerEntryDocument(entry, { uid: 'u1', role: role as any })).rejects.toThrow(/PERMISSION_DENIED/)
  })
  it('rejects a schema-invalid entry even for admin', async () => {
    const entry: any = createLedgerEntry(makeEntryInput())
    delete entry.entityId
    await expect(createLedgerEntryDocument(entry, { uid: 'u1', role: 'admin' })).rejects.toThrow(/SCHEMA_INVALID/)
  })
  it('writes via addDoc only (append-only, no setDoc/updateDoc)', async () => {
    const entry = createLedgerEntry(makeEntryInput())
    await createLedgerEntryDocument(entry, { uid: 'u1', role: 'admin' })
    expect(mockAddDoc).toHaveBeenCalledTimes(1)
  })
  it.each(['admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist'])('%s can list ledger entries (read is universal)', async (role) => {
    await expect(listLedgerEntries({ uid: 'u1', role: role as any })).resolves.toEqual([])
  })
  it('listLedgerEntries applies entityId/entityType/profileId/periodId filters without throwing', async () => {
    await expect(listLedgerEntries({ uid: 'u1', role: 'admin' }, {
      entityId: 'br-001', entityType: 'branch', profileId: 'p1', periodId: '2026-06',
    })).resolves.toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 5B — Runner
// ════════════════════════════════════════════════════════════

describe('runEvaluation', () => {
  it('succeeds for a PUBLISHED profile and produces a ledger entry input', () => {
    const result = runEvaluation({
      profile: makePublishedProfile(), entityId: 'br-001', entityType: 'branch',
      periodId: '2026-06', actuals: { wasfaty: 100 }, targets: { wasfaty: 100 },
    })
    expect(result.success).toBe(true)
    expect(result.entry?.entityId).toBe('br-001')
    expect(result.entry?.profileId).toBe('p1')
    expect(result.entry?.basketScores).toHaveProperty('b1')
    expect(result.entry?.elementScores).toHaveProperty('e1')
    expect(result.entry?.ruleScores).toHaveProperty('r1')
  })
  it.each(['DRAFT', 'VALIDATED', 'SIMULATED', 'APPROVED', 'ARCHIVED'])('fails for a %s (non-PUBLISHED) profile', (status) => {
    const profile = makePublishedProfile()
    ;(profile.metadata as any).status = status
    const result = runEvaluation({ profile, entityId: 'br-001', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} })
    expect(result.success).toBe(false)
  })
  it('fails when entityId is missing', () => {
    const result = runEvaluation({ profile: makePublishedProfile(), entityId: '', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} })
    expect(result.success).toBe(false)
  })
  it('never throws on a malformed profile', () => {
    expect(() => runEvaluation({ profile: {} as any, entityId: 'x', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} })).not.toThrow()
  })
  it('uses simulateProfile internally — score matches a direct simulateProfile call', async () => {
    const { simulateProfile } = await import('../profileStudio/simulator')
    const profile = makePublishedProfile()
    const direct = simulateProfile({ profile, actuals: { wasfaty: 100 }, targets: { wasfaty: 100 } })
    const result = runEvaluation({ profile, entityId: 'br-001', entityType: 'branch', periodId: '2026-06', actuals: { wasfaty: 100 }, targets: { wasfaty: 100 } })
    expect(result.entry?.score).toBe(direct.score)
  })
})

// ════════════════════════════════════════════════════════════
// 5B — Batch Runner
// ════════════════════════════════════════════════════════════

describe('runEvaluationBatch', () => {
  it('runs multiple entities and aggregates success/failure counts', () => {
    const profile = makePublishedProfile()
    const result = runEvaluationBatch({
      runs: [
        { profile, entityId: 'br-001', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} },
        { profile, entityId: 'br-002', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} },
      ],
    })
    expect(result.total).toBe(2)
    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(0)
  })
  it('isolates one failing run from the rest of the batch', () => {
    const profile = makePublishedProfile()
    const badProfile = makePublishedProfile()
    ;(badProfile.metadata as any).status = 'DRAFT'
    const result = runEvaluationBatch({
      runs: [
        { profile, entityId: 'br-001', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} },
        { profile: badProfile, entityId: 'br-002', entityType: 'branch', periodId: '2026-06', actuals: {}, targets: {} },
      ],
    })
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
  })
  it('never throws on an empty batch', () => {
    expect(() => runEvaluationBatch({ runs: [] })).not.toThrow()
    expect(runEvaluationBatch({ runs: [] }).total).toBe(0)
  })
  it('never throws on a malformed batch input', () => {
    expect(() => runEvaluationBatch({} as any)).not.toThrow()
  })
  it('truncates a batch larger than MAX_BATCH_SIZE and flags truncated=true', () => {
    const profile = makePublishedProfile()
    const runs = Array.from({ length: MAX_BATCH_SIZE + 5 }, (_, i) => ({
      profile, entityId: `br-${i}`, entityType: 'branch' as const, periodId: '2026-06', actuals: {}, targets: {},
    }))
    const result = runEvaluationBatch({ runs })
    expect(result.truncated).toBe(true)
    expect(result.total).toBe(MAX_BATCH_SIZE)
  })
})

// ════════════════════════════════════════════════════════════
// 5B — Snapshot & Comparison
// ════════════════════════════════════════════════════════════

describe('evaluationSnapshot', () => {
  it('createLedgerEntrySnapshot deep-copies the entry', () => {
    const entry = createLedgerEntry(makeEntryInput())
    const snap = createLedgerEntrySnapshot(entry)
    snap.entry.score = 0
    expect(entry.score).toBe(82.5)
  })
  it('exportLedgerEntryJson tags the format and exportedAt', () => {
    const entry = createLedgerEntry(makeEntryInput())
    const bundle = exportLedgerEntryJson(entry)
    expect(bundle.format).toBe('evaluation-ledger-entry-v1')
    expect(bundle.exportedAt).toBeTruthy()
  })
  it('compareLedgerEntries computes scoreDelta and per-map deltas', () => {
    const a = createLedgerEntry(makeEntryInput({ score: 70, basketScores: { b1: 60 } }))
    const b = createLedgerEntry(makeEntryInput({ score: 80, basketScores: { b1: 75 } }))
    const cmp = compareLedgerEntries(a, b)
    expect(cmp.scoreDelta).toBe(10)
    expect(cmp.basketDeltas.find((d) => d.id === 'b1')?.delta).toBe(15)
  })
  it('never throws on malformed entries', () => {
    expect(() => compareLedgerEntries(null as any, undefined as any)).not.toThrow()
  })
})
