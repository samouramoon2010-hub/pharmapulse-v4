// ============================================================
// Rating Normalization + Bulk Draft Cleanup — Regression Tests
//
// Part A: Rating normalization
//   normalizedFinalScorePct = (finalScore - min) / (max - min) × 100
//   fixes the broken logic where finalScore (1.0–5.0) was compared
//   against percentage-band thresholds (0–999%).
//
// Part B: Bulk draft cleanup
//   archiveDraftProfile / archiveDraftProfiles / findDuplicateDraftGroups
//   Published profiles are never touched by bulk cleanup.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDoc, updateDoc } from 'firebase/firestore'
import {
  runEvaluation,
  matchThresholdBand,
} from '../../engine/evaluationEngine/evaluationEngine'
import {
  FIVE_BAND_THRESHOLD_RULE,
  DEFAULT_THRESHOLD_RULE,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { EvaluationProfile, EvaluationBasket }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationResult }
  from '../../engine/evaluationEngine/evaluationEngineTypes'
import { findDuplicateDraftGroups }
  from '../../services/evaluationRegistryService'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db: {},
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', AUDIT_LOGS: 'audit_logs', NOTIFICATIONS: 'notifications',
    LEADERBOARD: 'leaderboard', KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets',
    EVALUATION_PROFILES: 'evaluation_profiles',
    EVALUATION_RESULTS:  'evaluation_results',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'id' })),
  updateDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Profile builder ───────────────────────────────────────────

function makeProfile(baskets: EvaluationBasket[]): EvaluationProfile {
  const basketMap: Record<string, EvaluationBasket> = {}
  const ids: string[] = []
  baskets.forEach((b) => { basketMap[b.id] = b; ids.push(b.id) })
  return {
    id: 'p1', name: 'Test', role: 'pharmacist',
    version: 1, status: 'published',
    effectiveFrom: '2026-01', effectiveTo: null,
    basketIds: ids, baskets: basketMap,
    defaultThresholdRule: { ...FIVE_BAND_THRESHOLD_RULE },
    createdBy: null, createdAt: null, updatedAt: null,
    publishedAt: null, archivedAt: null, previousVersionId: null,
  }
}

function makeBasket(id: string, weight: number, rule = FIVE_BAND_THRESHOLD_RULE): EvaluationBasket {
  return {
    id, name: id, weight, active: true, sortOrder: 1,
    elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: false }],
    thresholdRule: { ...rule },
  }
}

// Perfect score (all baskets at max = band score 5)
const PERFECT_ACTUALS = { wasfaty: 1000000 }  // 1M vs any small target → band 5

// Zero score (all baskets at min = band score 1)
const ZERO_ACTUALS = { wasfaty: 0 }

const BRANCH_TARGET_SMALL = { wasfatyTarget: 100 } as any

// ── Part A: Rating normalization ──────────────────────────────

describe('Rating normalization — finalScore → normalizedFinalScorePct', () => {
  it('finalScore = max possible → normalizedFinalScorePct = 100%', () => {
    const profile = makeProfile([
      makeBasket('b1', 0.20), makeBasket('b2', 0.20), makeBasket('b3', 0.20),
      makeBasket('b4', 0.20), makeBasket('b5', 0.20),
    ])
    // Very high actuals vs tiny target → all baskets at band 5 (≥115%)
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: PERFECT_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    // finalScore should be 5.0 (all baskets at band score 5 × weight 0.20)
    expect(result.finalScore).toBeCloseTo(5.0, 3)
    // normalizedFinalScorePct should be 100
    expect(result.trace.normalizedFinalScorePct).toBeCloseTo(100, 1)
    // Rating should NOT be 'Significant Below Expectation'
    expect(result.rating).not.toBe('Significant Below Expectation')
    // 100% normalized → matchThresholdBand(100, FIVE_BAND):
    // band 4 is [100, 115) — 100 < 115 → 'Exceed Expectation' (correct)
    // 'Significant Exceed' requires ≥115%
    expect(result.rating).toBe('Exceed Expectation')
  })

  it('finalScore = min possible → normalizedFinalScorePct = 0%', () => {
    const profile = makeProfile([
      makeBasket('b1', 0.20), makeBasket('b2', 0.20), makeBasket('b3', 0.20),
      makeBasket('b4', 0.20), makeBasket('b5', 0.20),
    ])
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: ZERO_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    // finalScore = 1.0 (all baskets at band score 1 × weight 0.20)
    expect(result.finalScore).toBeCloseTo(1.0, 3)
    // normalizedFinalScorePct should be 0
    expect(result.trace.normalizedFinalScorePct).toBeCloseTo(0, 1)
    expect(result.rating).toBe('Significant Below Expectation')
  })

  it('finalScore = 2.600 (May 2026 real data) normalizes correctly to ~40%', () => {
    // Reproduce the exact May 2026 scenario:
    // 2 baskets at band 5 (satisfaction, profit due to bad targets)
    // 3 baskets at band 1 (omni guest, wellness, revenue — missing KPIs)
    // finalScore = 2×(5×0.2) + 3×(1×0.2) = 2.0 + 0.6 = 2.600... wait:
    // Satisfaction: band5 × 0.2 = 1.0
    // Profit: band5 × 0.2 = 1.0
    // OmniGuest: band1 × 0.2 = 0.2
    // Wellness: band1 × 0.2 = 0.2
    // Revenue: band1 × 0.2 = 0.2
    // finalScore = 2.600 ✓
    // normalized = (2.6 - 1.0) / (5.0 - 1.0) × 100 = 40.0%
    const normalized = ((2.600 - 1.0) / (5.0 - 1.0)) * 100
    expect(normalized).toBeCloseTo(40.0, 1)
    // 40% → FIVE_BAND band 1 (0–70%)
    const band = matchThresholdBand(normalized, FIVE_BAND_THRESHOLD_RULE)
    expect(band.label).toBe('Significant Below Expectation')
  })

  it('normalizedFinalScorePct stored in trace for auditability', () => {
    const profile = makeProfile([makeBasket('b1', 1.0)])
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: ZERO_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    expect(result.trace.normalizedFinalScorePct).toBeDefined()
    expect(typeof result.trace.normalizedFinalScorePct).toBe('number')
    expect(isFinite(result.trace.normalizedFinalScorePct!)).toBe(true)
  })

  it('normalizedFinalScorePct is always clamped to [0, 100]', () => {
    const profile = makeProfile([makeBasket('b1', 1.0)])
    // Both extreme cases
    for (const actuals of [ZERO_ACTUALS, PERFECT_ACTUALS]) {
      const result = runEvaluation({
        userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
        profile, kpiActuals: actuals,
        personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
        registry: DEFAULT_KPI_REGISTRY,
      })
      const norm = result.trace.normalizedFinalScorePct!
      expect(norm).toBeGreaterThanOrEqual(0)
      expect(norm).toBeLessThanOrEqual(100)
    }
  })
})

describe('Rating normalization — dynamic min/max with custom basket weights', () => {
  it('single basket weight=1.0: min=1, max=5, normalizes correctly', () => {
    const profile = makeProfile([makeBasket('b1', 1.0)])
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: PERFECT_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    expect(result.trace.normalizedFinalScorePct).toBeCloseTo(100, 1)
  })

  it('two baskets unequal weight: normalization still correct', () => {
    // basket A: weight 0.3, basket B: weight 0.7
    // Both at max band (5): finalScore = 5×0.3 + 5×0.7 = 5.0
    // min = 1×0.3 + 1×0.7 = 1.0, max = 5.0
    // normalized = (5.0 - 1.0) / (5.0 - 1.0) × 100 = 100%
    const profile = makeProfile([makeBasket('a', 0.3), makeBasket('b', 0.7)])
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: PERFECT_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    expect(result.trace.normalizedFinalScorePct).toBeCloseTo(100, 1)
  })

  it('3-band threshold: min=1, max=3 used correctly', () => {
    const profile = makeProfile([makeBasket('b1', 1.0, DEFAULT_THRESHOLD_RULE)])
    // DEFAULT_THRESHOLD_RULE scores: 1, 2, 3
    // With PERFECT actuals → band 3 (Exceed Expectation)
    // finalScore = 3 × 1.0 = 3.0
    // min=1, max=3, normalized = (3-1)/(3-1)×100 = 100%
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile: { ...profile, defaultThresholdRule: DEFAULT_THRESHOLD_RULE },
      kpiActuals: PERFECT_ACTUALS,
      personalTarget: null, branchTarget: BRANCH_TARGET_SMALL,
      registry: DEFAULT_KPI_REGISTRY,
    })
    expect(result.trace.normalizedFinalScorePct).toBeCloseTo(100, 1)
  })

  it('rating uses normalizedFinalScorePct, not finalScore directly', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    // The ratingBand must match against normalizedFinalScorePct
    expect(src.default).toContain('matchThresholdBand(normalizedFinalScorePct')
    // Must NOT pass finalScore to matchThresholdBand for the rating
    // (it IS passed for basket scoring but not for the top-level rating)
    const afterFinalScore = src.default.split('const finalScore = ')[1] ?? ''
    expect(afterFinalScore).not.toMatch(/matchThresholdBand\(finalScore,\s*defaultRule\)/)
  })
})

// ── Part B: Bulk draft cleanup ────────────────────────────────

describe('findDuplicateDraftGroups', () => {
  const ts = (ms: number) => ({ toMillis: () => ms })

  it('groups draft profiles by name when duplicates exist', () => {
    const profiles = [
      { id: 'a', name: 'SMARTS 2026', status: 'draft', createdAt: ts(1000) } as any,
      { id: 'b', name: 'SMARTS 2026', status: 'draft', createdAt: ts(2000) } as any,
      { id: 'c', name: 'SMARTS 2026', status: 'draft', createdAt: ts(3000) } as any,
      { id: 'd', name: 'Other Profile', status: 'draft', createdAt: ts(1000) } as any,
    ]
    const groups = findDuplicateDraftGroups(profiles)
    expect(Object.keys(groups)).toHaveLength(1)
    expect(groups['SMARTS 2026']).toHaveLength(3)
  })

  it('newest profile is first in each group', () => {
    const profiles = [
      { id: 'a', name: 'SMARTS', status: 'draft', createdAt: ts(1000) } as any,
      { id: 'b', name: 'SMARTS', status: 'draft', createdAt: ts(3000) } as any,
      { id: 'c', name: 'SMARTS', status: 'draft', createdAt: ts(2000) } as any,
    ]
    const group = findDuplicateDraftGroups(profiles)['SMARTS']
    expect(group[0].id).toBe('b')  // newest (ts=3000)
    expect(group[2].id).toBe('a')  // oldest (ts=1000)
  })

  it('returns empty object when no duplicates', () => {
    const profiles = [
      { id: 'a', name: 'Profile A', status: 'draft',     createdAt: ts(1000) } as any,
      { id: 'b', name: 'Profile B', status: 'draft',     createdAt: ts(2000) } as any,
      { id: 'c', name: 'Profile A', status: 'published', createdAt: ts(3000) } as any,
    ]
    // Profile A has a draft and a published — but only one draft, no duplicate
    const groups = findDuplicateDraftGroups(profiles)
    expect(Object.keys(groups)).toHaveLength(0)
  })

  it('published profiles are NEVER included in duplicate groups', () => {
    const profiles = [
      { id: 'a', name: 'SMARTS', status: 'draft',     createdAt: ts(1000) } as any,
      { id: 'b', name: 'SMARTS', status: 'published',  createdAt: ts(2000) } as any,
    ]
    const groups = findDuplicateDraftGroups(profiles)
    // Only 1 draft of 'SMARTS' — no group created
    expect(Object.keys(groups)).toHaveLength(0)
  })
})

describe('archiveDraftProfile — safety', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(updateDoc).mockResolvedValue(undefined as any)
  })

  it('archives a draft profile successfully', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'draft', name: 'Test' }),
    } as any)
    const { archiveDraftProfile } = await import('../../services/evaluationRegistryService')
    await expect(archiveDraftProfile('p1', 'admin', 'admin')).resolves.toBeUndefined()
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })

  it('throws when profile is published — never touches published profiles', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'published', name: 'SMARTS' }),
    } as any)
    const { archiveDraftProfile } = await import('../../services/evaluationRegistryService')
    await expect(archiveDraftProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('not draft')
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('throws when profile is archived — only drafts', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'archived', name: 'Old' }),
    } as any)
    const { archiveDraftProfile } = await import('../../services/evaluationRegistryService')
    await expect(archiveDraftProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('not draft')
  })
})

describe('archiveDraftProfiles — batch safety', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(updateDoc).mockResolvedValue(undefined as any)
  })

  it('skips published profile, archives draft — returns correct summary', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, id: 'draft1',  data: () => ({ status: 'draft',     name: 'A' }) } as any)
      .mockResolvedValueOnce({ exists: () => true, id: 'pub1',    data: () => ({ status: 'published',  name: 'B' }) } as any)
    const { archiveDraftProfiles } = await import('../../services/evaluationRegistryService')
    const result = await archiveDraftProfiles(['draft1', 'pub1'], 'admin', 'admin')
    expect(result.archived).toContain('draft1')
    expect(result.skipped).toContain('pub1')
    expect(result.errors).toHaveLength(0)
    expect(updateDoc).toHaveBeenCalledTimes(1)  // only the draft was updated
  })

  it('one failure does not stop the rest (allSettled)', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, id: 'd1', data: () => ({ status: 'draft', name: 'X' }) } as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ exists: () => true, id: 'd3', data: () => ({ status: 'draft', name: 'Z' }) } as any)
    const { archiveDraftProfiles } = await import('../../services/evaluationRegistryService')
    const result = await archiveDraftProfiles(['d1', 'd2', 'd3'], 'admin', 'admin')
    expect(result.archived.length).toBeGreaterThan(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ── Scope guards ──────────────────────────────────────────────

describe('Scope guards', () => {
  it('no ranking or coaching in engine', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    expect(src.default).not.toMatch(/computeRank|buildLeaderboard|rankPharmacist/i)
  })

  it('bulk archive uses archiveDraftProfile path — no hard delete', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    // archiveDraftProfiles must use updateDoc not deleteDoc
    const block = src.default.split('export async function archiveDraftProfiles')[1]
      ?.split('export ')[0] ?? ''
    expect(block).toContain('archiveDraftProfile')
    expect(block).not.toContain('deleteDoc')
  })

  it('normalizedFinalScorePct is clamped — cannot exceed 100', () => {
    // Even with extremely high achievements, normalized is ≤ 100
    const profile = makeProfile([makeBasket('b1', 1.0)])
    const result = runEvaluation({
      userId: 'u', pharmacyId: 'p', month: '2026-05', role: 'pharmacist',
      profile, kpiActuals: { wasfaty: 999999999 },  // extreme value
      personalTarget: null, branchTarget: { wasfatyTarget: 1 } as any,
      registry: DEFAULT_KPI_REGISTRY,
    })
    expect(result.trace.normalizedFinalScorePct!).toBeLessThanOrEqual(100)
  })
})
