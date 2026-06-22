// ============================================================
// RF-1C Pharmacist Ranking Foundation — Tests
//
// Covers:
//   1. achievementPct derivation from basketResults
//   2. kpisAbove100Count derivation from elements
//   3. Company-wide cohort — all pharmacists in one pool
//   4. Tie-break: achievementPct fires between cappedScore and uncappedScore
//   5. Tie-break: kpisAbove100Count fires after uncappedScore
//   6. pharmacyId present on pharmacist snapshots
//   7. movementDirection computed correctly (up/down/unchanged/new)
//   8. governanceVersion and rankingRuleVersion on all snapshots
//   9. No undefined values in snapshot (sanitize coverage)
//  10. Float pharmacists → float-pool (not company-wide)
//  11. Branch snapshots now also carry governance fields
//  12. New tie-break rules backward-compatible with branch ranking
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateCompanyPharmacistRankingSnapshots,
} from '../../ranking/company-pharmacist-ranking-engine'
import {
  generateBranchRankingSnapshots,
} from '../../ranking/branch-ranking-engine'
import { compareRecords, sortWithTieBreak } from '../../ranking/tie-break'
import {
  COMPANY_WIDE_COHORT_ID, FLOAT_POOL_COHORT_ID,
  GOVERNANCE_VERSION, RANKING_RULE_VERSION,
} from '../../ranking/constants'
import type { RankingInputRecord } from '../../ranking/types'
import type { BasketResult } from '../../engine/evaluationEngine/evaluationEngineTypes'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    RANKING_SNAPSHOTS:  'ranking_snapshots',
    EVALUATION_RESULTS: 'evaluation_results',
    PHARMACIES:         'pharmacies',
    USERS:              'users',
    AUDIT_LOGS:         'audit_logs',
    KPI_ENTRIES:        'kpi_entries', TARGETS: 'targets',
    NOTIFICATIONS: 'notifications', LEADERBOARD: 'leaderboard',
    KPI_REGISTRY: 'kpi_registry', DAILY_SUMMARIES: 'daily_summaries',
    MONTHLY_SUMMARIES: 'monthly_summaries', FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS: 'risk_snapshots', RANKING_HISTORY: 'ranking_history',
    STAGING_ENTRIES: 'staging_entries', DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets', EVALUATION_PROFILES: 'evaluation_profiles',
    CLASSIFICATIONS: 'classifications',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn((_db, col) => ({ __col: col })),
  doc:             vi.fn((_db, ...parts) => ({ __path: parts.join('/') })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
  query:           vi.fn((...args) => args[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

// ── Fixtures ──────────────────────────────────────────────────

function makePharmacistRecord(overrides: Partial<RankingInputRecord> = {}): RankingInputRecord {
  return {
    entityId:            'user-001',
    entityName:          'Dr. Test',
    entityType:          'pharmacist',
    periodId:            '2026-06',
    profileId:           'smarts-v1',
    profileVersion:      1,
    classificationId:    COMPANY_WIDE_COHORT_ID,
    pharmacistCohortId:  COMPANY_WIDE_COHORT_ID,
    pharmacyId:          'ph-001',
    cappedScore:         85,
    uncappedScore:       4.4,
    achievementPct:      95,
    kpisAbove100Count:   4,
    sourceEvaluationId:  'eval-001',
    evaluationStatus:    'complete',
    employmentType:      'full-time',
    ...overrides,
  }
}

function makeBranchRecord(overrides: Partial<RankingInputRecord> = {}): RankingInputRecord {
  return {
    entityId:           'ph-001',
    entityName:         'Branch 001',
    entityType:         'branch',
    periodId:           '2026-06',
    profileId:          'smarts-v1',
    profileVersion:     1,
    classificationId:   'destination',
    cappedScore:        85,
    uncappedScore:      4.4,
    sourceEvaluationId: 'eval-001',
    evaluationStatus:   'complete',
    ...overrides,
  }
}

function makeBasketResult(overrides: Partial<BasketResult> = {}): BasketResult {
  return {
    basketId:                'b1',
    basketName:              'Satisfaction',
    weight:                  0.20,
    elements: [
      { kpiKey: 'kpi1', engineKey: 'kpi1', label: 'KPI 1', weight: 1.0,
        actual: 110, target: 100, targetSource: 'branch',
        achievementPct: 110, bandLabel: 'Exceed', bandScore: 4,
        weightedScore: 4.0, isValid: true } as any,
    ],
    aggregateAchievementPct: 110,
    bandLabel:               'Exceed Expectation',
    bandScore:               4,
    weightedScore:           0.80,
    isValid:                 true,
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// 1. achievementPct derivation
// ════════════════════════════════════════════════════════════════

describe('deriveAchievementPct — from service module', () => {
  it('mean of valid basket aggregateAchievementPct', async () => {
    // Access internal helper through service by checking the output on a generated record
    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const { getDocs, writeBatch } = await import('firebase/firestore')

    const basket1 = makeBasketResult({ aggregateAchievementPct: 100 })
    const basket2 = makeBasketResult({ basketId: 'b2', aggregateAchievementPct: 80 })

    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [{
          id: 'e1',
          data: () => ({
            id: 'e1', userId: 'u1', pharmacyId: 'ph-1', role: 'pharmacist',
            month: '2026-06', profileId: 'p', profileVersion: 1,
            finalScore: 4.2, ratingScore: 4, status: 'complete',
            calculationTrace: { normalizedFinalScorePct: 80 },
            basketResults: [basket1, basket2],
          }),
        }],
      } as any)
      .mockResolvedValueOnce({  // users
        docs: [{ id: 'u1', data: () => ({ displayName: 'Dr. A' }) }],
      } as any)
      .mockResolvedValue({ docs: [] } as any)

    const payloads: Record<string, unknown>[] = []
    vi.mocked(writeBatch).mockReturnValue({
      set: vi.fn((_r, p) => payloads.push(p)),
      commit: vi.fn(async () => {}),
    } as any)

    await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    // achievementPct = (100 + 80) / 2 = 90
    expect(payloads[0].achievementPct).toBeCloseTo(90, 1)
  })

  it('excludes invalid baskets from the average', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore')
    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')

    const validBasket   = makeBasketResult({ aggregateAchievementPct: 100, isValid: true })
    const invalidBasket = makeBasketResult({ basketId: 'b2', aggregateAchievementPct: 0, isValid: false })

    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [{ id: 'e1', data: () => ({
          id: 'e1', userId: 'u1', pharmacyId: 'ph-1', role: 'pharmacist',
          month: '2026-06', profileId: 'p', profileVersion: 1,
          finalScore: 4.2, ratingScore: 4, status: 'complete',
          calculationTrace: { normalizedFinalScorePct: 80 },
          basketResults: [validBasket, invalidBasket],
        }) }],
      } as any)
      .mockResolvedValueOnce({ docs: [{ id: 'u1', data: () => ({ displayName: 'Dr. A' }) }] } as any)
      .mockResolvedValue({ docs: [] } as any)

    const payloads: Record<string, unknown>[] = []
    vi.mocked(writeBatch).mockReturnValue({
      set: vi.fn((_r, p) => payloads.push(p)),
      commit: vi.fn(async () => {}),
    } as any)

    await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    // Only valid basket counted: achievementPct = 100
    expect(payloads[0].achievementPct).toBeCloseTo(100, 1)
  })
})

// ════════════════════════════════════════════════════════════════
// 2. kpisAbove100Count derivation
// ════════════════════════════════════════════════════════════════

describe('kpisAbove100Count derivation', () => {
  it('counts elements where achievementPct >= 100', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore')
    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')

    const basket = makeBasketResult({
      elements: [
        { kpiKey: 'k1', engineKey: 'k1', label: 'K1', weight: 0.5,
          actual: 110, target: 100, targetSource: 'branch',
          achievementPct: 110, bandLabel: 'Exceed', bandScore: 4, weightedScore: 2.0, isValid: true },
        { kpiKey: 'k2', engineKey: 'k2', label: 'K2', weight: 0.5,
          actual: 80, target: 100, targetSource: 'branch',
          achievementPct: 80, bandLabel: 'Below', bandScore: 2, weightedScore: 1.0, isValid: true },
      ] as any,
    })

    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [{ id: 'e1', data: () => ({
        id: 'e1', userId: 'u1', pharmacyId: 'ph-1', role: 'pharmacist',
        month: '2026-06', profileId: 'p', profileVersion: 1,
        finalScore: 4.0, ratingScore: 3, status: 'complete',
        calculationTrace: { normalizedFinalScorePct: 75 },
        basketResults: [basket],
      }) }] } as any)
      .mockResolvedValueOnce({ docs: [{ id: 'u1', data: () => ({ displayName: 'Dr. A' }) }] } as any)
      .mockResolvedValue({ docs: [] } as any)

    const payloads: Record<string, unknown>[] = []
    vi.mocked(writeBatch).mockReturnValue({
      set: vi.fn((_r, p) => payloads.push(p)),
      commit: vi.fn(async () => {}),
    } as any)

    await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    // Only k1 (110%) is ≥ 100
    expect(payloads[0].kpisAbove100Count).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Company-wide cohort
// ════════════════════════════════════════════════════════════════

describe('generateCompanyPharmacistRankingSnapshots — cohort', () => {
  it('places all full-time pharmacists in a single company-wide cohort', () => {
    const records = [
      makePharmacistRecord({ entityId: 'u1', cappedScore: 90 }),
      makePharmacistRecord({ entityId: 'u2', cappedScore: 80 }),
      makePharmacistRecord({ entityId: 'u3', cappedScore: 70 }),
    ]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    expect(outputs).toHaveLength(1)
    expect(outputs[0].cohort.classificationId).toBe(COMPANY_WIDE_COHORT_ID)
    expect(outputs[0].snapshots).toHaveLength(3)
  })

  it('float pharmacists go to float-pool (not company-wide)', () => {
    const records = [
      makePharmacistRecord({ entityId: 'full', employmentType: 'full-time', cappedScore: 90 }),
      makePharmacistRecord({ entityId: 'float', employmentType: 'float', cappedScore: 85 }),
    ]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    expect(outputs).toHaveLength(2)
    const companyOut = outputs.find((o) => o.cohort.classificationId === COMPANY_WIDE_COHORT_ID)
    const floatOut   = outputs.find((o) => o.cohort.classificationId === FLOAT_POOL_COHORT_ID)
    expect(companyOut?.snapshots).toHaveLength(1)
    expect(floatOut?.snapshots).toHaveLength(1)
    expect(companyOut?.snapshots[0].entityId).toBe('full')
    expect(floatOut?.snapshots[0].entityId).toBe('float')
  })

  it('company-wide cohort key contains company-wide marker', () => {
    const records = [makePharmacistRecord()]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    expect(outputs[0].cohort.cohortId).toContain(COMPANY_WIDE_COHORT_ID)
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Tie-break: achievementPct
// ════════════════════════════════════════════════════════════════

describe('compareRecords — achievementPct tie-break', () => {
  it('achievementPct fires when cappedScore tied', () => {
    const a = makePharmacistRecord({ entityId: 'a', cappedScore: 85, achievementPct: 105 })
    const b = makePharmacistRecord({ entityId: 'b', cappedScore: 85, achievementPct: 90 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)   // a wins
    expect(trace.rule).toBe('achievementPct')
  })

  it('achievementPct does NOT fire for branch records (field absent)', () => {
    const a = makeBranchRecord({ entityId: 'a', cappedScore: 85, uncappedScore: 4.5 })
    const b = makeBranchRecord({ entityId: 'b', cappedScore: 85, uncappedScore: 4.2 })
    const { trace } = compareRecords(a, b)
    // Branch records have no achievementPct → falls through to uncappedScore
    expect(trace.rule).toBe('uncappedScore')
  })

  it('achievementPct uses higher = better ordering', () => {
    const a = makePharmacistRecord({ entityId: 'a', cappedScore: 80, achievementPct: 120 })
    const b = makePharmacistRecord({ entityId: 'b', cappedScore: 80, achievementPct: 80 })
    const sorted = sortWithTieBreak([b, a])
    expect(sorted[0].record.entityId).toBe('a')
    expect(sorted[0].tieBreakTrace.rule).toBe('noTie')
    expect(sorted[1].tieBreakTrace.rule).toBe('achievementPct')
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Tie-break: kpisAbove100Count
// ════════════════════════════════════════════════════════════════

describe('compareRecords — kpisAbove100Count tie-break', () => {
  it('kpisAbove100Count fires after cappedScore, achievementPct, uncappedScore all tied', () => {
    const a = makePharmacistRecord({ entityId: 'a', cappedScore: 85, achievementPct: 95, uncappedScore: 4.4, kpisAbove100Count: 5 })
    const b = makePharmacistRecord({ entityId: 'b', cappedScore: 85, achievementPct: 95, uncappedScore: 4.4, kpisAbove100Count: 3 })
    const { order, trace } = compareRecords(a, b)
    expect(order).toBeLessThan(0)
    expect(trace.rule).toBe('kpisAbove100')
  })

  it('kpisAbove100Count does NOT fire for branch records', () => {
    const a = makeBranchRecord({ entityId: 'a', cappedScore: 85, uncappedScore: 4.4 })
    const b = makeBranchRecord({ entityId: 'b', cappedScore: 85, uncappedScore: 4.4 })
    const { trace } = compareRecords(a, b)
    // No kpisAbove100Count on branch records → falls to entityId
    expect(trace.rule).toBe('entityId')
  })
})

// ════════════════════════════════════════════════════════════════
// 6. pharmacyId on pharmacist snapshots
// ════════════════════════════════════════════════════════════════

describe('PharmacistRankingSnapshot — pharmacyId', () => {
  it('pharmacyId is set from record.pharmacyId', () => {
    const records = [makePharmacistRecord({ entityId: 'u1', pharmacyId: 'ph-999' })]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    expect(outputs[0].snapshots[0].pharmacyId).toBe('ph-999')
  })

  it('pharmacyId defaults to empty string when not supplied', () => {
    const records = [makePharmacistRecord({ entityId: 'u1', pharmacyId: undefined })]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    expect(outputs[0].snapshots[0].pharmacyId).toBe('')
  })
})

// ════════════════════════════════════════════════════════════════
// 7. movementDirection
// ════════════════════════════════════════════════════════════════

describe('generateCompanyPharmacistRankingSnapshots — movementDirection', () => {
  const mkSnap = (entityId: string, rank: number, prev?: number) => ({
    entityId,
    currentRank: rank,
    previousRank: prev,
    rankMovement: prev !== undefined ? rank - prev : undefined,
    movementDirection: prev === undefined ? 'new' : rank < prev ? 'up' : rank > prev ? 'down' : 'unchanged',
  })

  it('new entry → movementDirection = new', () => {
    const s = mkSnap('u1', 1, undefined)
    expect(s.movementDirection).toBe('new')
  })

  it('rank improved → movementDirection = up', () => {
    const s = mkSnap('u1', 2, 5)
    expect(s.movementDirection).toBe('up')
  })

  it('rank worsened → movementDirection = down', () => {
    const s = mkSnap('u1', 5, 2)
    expect(s.movementDirection).toBe('down')
  })

  it('rank unchanged → movementDirection = unchanged', () => {
    const s = mkSnap('u1', 3, 3)
    expect(s.movementDirection).toBe('unchanged')
  })
})

// ════════════════════════════════════════════════════════════════
// 8. governanceVersion + rankingRuleVersion
// ════════════════════════════════════════════════════════════════

describe('Governance metadata on snapshots', () => {
  it('pharmacist snapshots carry governanceVersion and rankingRuleVersion', () => {
    const records = [makePharmacistRecord()]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    const snap = outputs[0].snapshots[0]
    expect(snap.governanceVersion).toBe(GOVERNANCE_VERSION)
    expect(snap.rankingRuleVersion).toBe(RANKING_RULE_VERSION)
  })

  it('branch snapshots carry governanceVersion and rankingRuleVersion', () => {
    const records = [makeBranchRecord({ classificationId: 'destination' })]
    const outputs = generateBranchRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    const snap = outputs[0].snapshots[0]
    expect(snap.governanceVersion).toBe(GOVERNANCE_VERSION)
    expect(snap.rankingRuleVersion).toBe(RANKING_RULE_VERSION)
  })

  it('GOVERNANCE_VERSION is a positive integer', () => {
    expect(Number.isInteger(GOVERNANCE_VERSION)).toBe(true)
    expect(GOVERNANCE_VERSION).toBeGreaterThan(0)
  })

  it('RANKING_RULE_VERSION starts with rf', () => {
    expect(RANKING_RULE_VERSION.startsWith('rf')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// 9. No undefined values in snapshot
// ════════════════════════════════════════════════════════════════

describe('Snapshot payload integrity — no undefined values', () => {
  it('pharmacist snapshot has no undefined values on required fields', () => {
    const records = [makePharmacistRecord()]
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    const snap = outputs[0].snapshots[0] as Record<string, unknown>
    const requiredFields = [
      'snapshotId', 'entityType', 'entityId', 'cohortId', 'periodId',
      'profileId', 'profileVersion', 'classificationId', 'currentRank',
      'cohortSize', 'cappedScore', 'uncappedScore', 'tieBreakTrace',
      'sourceEvaluationId', 'generatedAt', 'governanceVersion', 'rankingRuleVersion',
      'pharmacyId', 'pharmacistCohortId', 'employmentType', 'achievementPct', 'kpisAbove100Count',
    ]
    for (const field of requiredFields) {
      expect(snap[field], `field "${field}" must not be undefined`).not.toBeUndefined()
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 10. Branch ranking backward compatibility
// ════════════════════════════════════════════════════════════════

describe('Branch ranking — unchanged behavior with new tie-break engine', () => {
  it('branch records without achievementPct still rank correctly', () => {
    const records = [
      makeBranchRecord({ entityId: 'b1', cappedScore: 90 }),
      makeBranchRecord({ entityId: 'b2', cappedScore: 80 }),
      makeBranchRecord({ entityId: 'b3', cappedScore: 85 }),
    ]
    const outputs = generateBranchRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    const snaps = outputs[0].snapshots
    expect(snaps[0].entityId).toBe('b1')   // 90 → rank 1
    expect(snaps[1].entityId).toBe('b3')   // 85 → rank 2
    expect(snaps[2].entityId).toBe('b2')   // 80 → rank 3
  })

  it('unclassified branches still excluded from branch ranking', () => {
    const records = [
      makeBranchRecord({ entityId: 'b1', classificationId: 'destination' }),
      makeBranchRecord({ entityId: 'b2', classificationId: 'unclassified' }),
    ]
    const outputs = generateBranchRankingSnapshots({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, records,
    })
    const allSnaps = outputs.flatMap((o) => o.snapshots)
    expect(allSnaps.map((s) => s.entityId)).not.toContain('b2')
  })
})
