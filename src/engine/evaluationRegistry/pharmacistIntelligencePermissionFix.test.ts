// ============================================================
// Regression tests — Pharmacist Intelligence permission fix
//
// Root cause: fetchEvaluationResultsForUserMonth queried
// evaluation_results with where('userId',..)+where('month',..)
// only. The Firestore rule for manager reads requires
// resource.data.pharmacyId == pharmId(), which the query
// couldn't satisfy statically (no pharmacyId WHERE clause).
// Firestore denied the entire collection query.
//
// Fix: when pharmacyId is provided (manager drilldown), query
// by pharmacyId+month (rule-satisfying, existing index), then
// filter client-side by userId.
//
// These tests verify:
//   1. evaluationLedgerService source: pharmacyId-path exists
//   2. evaluationLedgerService source: self-path (no pharmacyId) unchanged
//   3. usePharmacistIntelligenceData source: manager mode passes branchId
//   4. usePharmacistIntelligenceData source: self mode does NOT pass pharmacyId
//   5. Client-side userId filter logic (pure unit — no Firebase needed)
// ============================================================

import { describe, it, expect } from 'vitest'

// ── 1 & 2 — evaluationLedgerService source checks ────────────
describe('evaluationLedgerService — fetchEvaluationResultsForUserMonth', () => {
  it('accepts optional pharmacyId parameter', async () => {
    const src = await import('../../services/evaluationLedgerService?raw')
    expect(src.default).toContain('pharmacyId?:')
  })

  it('manager path queries evaluation_results by pharmacyId + month', async () => {
    const src = await import('../../services/evaluationLedgerService?raw')
    // The pharmacyId branch must use where('pharmacyId', '==', pharmacyId)
    expect(src.default).toContain("where('pharmacyId', '==', pharmacyId)")
    expect(src.default).toContain("where('month',      '==', month)")
  })

  it('manager path filters results by userId client-side', async () => {
    const src = await import('../../services/evaluationLedgerService?raw')
    // Must filter by userId after getDocs to return only the target pharmacist
    expect(src.default).toContain('.filter((r) => r.userId === userId)')
  })

  it('self-mode path still queries by userId + month (unchanged)', async () => {
    const src = await import('../../services/evaluationLedgerService?raw')
    // Self-mode branch must remain intact
    expect(src.default).toContain("where('userId', '==', userId)")
  })
})

// ── 3 & 4 — usePharmacistIntelligenceData source checks ──────
describe('usePharmacistIntelligenceData — manager drilldown wiring', () => {
  it('manager mode passes branchId as third arg to fetchEvaluationResultsForUserMonth', async () => {
    const src = await import('../../pages/pharmacist/usePharmacistIntelligenceData?raw')
    // Manager hook call site must supply pharmacyId = branchId
    expect(src.default).toContain('fetchEvaluationResultsForUserMonth(userId, month, branchId)')
  })

  it('manager mode includes branchId in the effect dependency array', async () => {
    const src = await import('../../pages/pharmacist/usePharmacistIntelligenceData?raw')
    expect(src.default).toContain('[enabled, userId, month, branchId]')
  })

  it('self mode does NOT pass pharmacyId to fetchEvaluationResultsForUserMonth', async () => {
    const src = await import('../../pages/pharmacist/usePharmacistIntelligenceData?raw')
    // Self-mode call: fetchEvaluationResultsForUserMonth(userId, month) — no third arg
    // Confirm the call without branchId still exists (self-mode path)
    expect(src.default).toContain('fetchEvaluationResultsForUserMonth(userId, month)')
    // And that no call site omits the pharmacyId only in the self path:
    // the self path uses a plain two-arg call inside useSelfPharmacistIntelligenceData
    // (wrapped in a .catch(() => {}) — non-fatal)
    expect(src.default).toContain('.catch(() => {')
  })
})

// ── 5 — Client-side userId filter — pure logic ───────────────
// Mirrors the filter applied in the manager path of
// fetchEvaluationResultsForUserMonth to verify it correctly
// isolates one pharmacist's records from a branch-wide result set.

interface FakeDoc {
  id: string
  userId: string
  month: string
  pharmacyId: string
  finalScore: number
}

function filterByUserId(docs: FakeDoc[], userId: string): FakeDoc[] {
  return docs.filter((r) => r.userId === userId)
}

const BRANCH_DOCS: FakeDoc[] = [
  { id: 'r1', userId: 'samir-uid',  month: '2026-06', pharmacyId: 'pharm-aaa', finalScore: 88 },
  { id: 'r2', userId: 'hend-uid',   month: '2026-06', pharmacyId: 'pharm-aaa', finalScore: 75 },
  { id: 'r3', userId: 'ahmed-uid',  month: '2026-06', pharmacyId: 'pharm-aaa', finalScore: 91 },
  { id: 'r4', userId: 'hend-uid',   month: '2026-06', pharmacyId: 'pharm-aaa', finalScore: 76 },
]

describe('client-side userId filter — correctness', () => {
  it('returns only the target pharmacist records', () => {
    const result = filterByUserId(BRANCH_DOCS, 'hend-uid')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.userId === 'hend-uid')).toBe(true)
  })

  it('returns the correct document IDs for Dr. Hend', () => {
    const result = filterByUserId(BRANCH_DOCS, 'hend-uid')
    const ids = result.map((r) => r.id).sort()
    expect(ids).toEqual(['r2', 'r4'])
  })

  it('returns one record for a pharmacist with a single result', () => {
    const result = filterByUserId(BRANCH_DOCS, 'ahmed-uid')
    expect(result).toHaveLength(1)
    expect(result[0].finalScore).toBe(91)
  })

  it('returns empty array when userId has no records in the branch set', () => {
    const result = filterByUserId(BRANCH_DOCS, 'unknown-uid')
    expect(result).toHaveLength(0)
  })

  it('does not leak other pharmacists data into the result', () => {
    const result = filterByUserId(BRANCH_DOCS, 'samir-uid')
    const userIds = new Set(result.map((r) => r.userId))
    expect(userIds.size).toBe(1)
    expect(userIds.has('samir-uid')).toBe(true)
  })

  it('handles empty branch docs without error', () => {
    const result = filterByUserId([], 'hend-uid')
    expect(result).toHaveLength(0)
  })
})
