// ============================================================
// RF-1B Ranking Repository + Service — Tests
//
// Covers:
//   1. Repository — snapshot ID determinism, overwrites, query helpers
//   2. Service — evaluation→input mapping, exclusion, report shape
//   3. Service — empty ledger handling
//   4. Module boundary — repository is only Firestore file
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDocs, getDoc, writeBatch, onSnapshot, getDocs as _getDocs } from 'firebase/firestore'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    RANKING_SNAPSHOTS:   'ranking_snapshots',
    EVALUATION_RESULTS:  'evaluation_results',
    PHARMACIES:          'pharmacies',
    AUDIT_LOGS:          'audit_logs',
    USERS:               'users',
    KPI_ENTRIES:         'kpi_entries',
    TARGETS:             'targets',
    NOTIFICATIONS:       'notifications',
    LEADERBOARD:         'leaderboard',
    KPI_REGISTRY:        'kpi_registry',
    DAILY_SUMMARIES:     'daily_summaries',
    MONTHLY_SUMMARIES:   'monthly_summaries',
    FORECAST_SNAPSHOTS:  'forecast_snapshots',
    RISK_SNAPSHOTS:      'risk_snapshots',
    RANKING_HISTORY:     'ranking_history',
    STAGING_ENTRIES:     'staging_entries',
    DISTRICTS:           'districts',
    REGIONS:             'regions',
    PERSONAL_TARGETS:    'personal_targets',
    EVALUATION_PROFILES: 'evaluation_profiles',
    EVALUATION_RESULTS:  'evaluation_results',
    CLASSIFICATIONS:     'classifications',
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
  writeBatch:      vi.fn(() => ({
    set:    vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Fixtures ──────────────────────────────────────────────────

function makeSnapshot(overrides = {}) {
  return {
    snapshotId:          '2026-06#smarts-v1#1#destination#ph-001',
    entityType:          'branch' as const,
    entityId:            'ph-001',
    entityName:          'Branch 001',
    cohortId:            '2026-06::smarts-v1::1::destination',
    periodId:            '2026-06',
    profileId:           'smarts-v1',
    profileVersion:      1,
    classificationId:    'destination',
    currentRank:         1,
    cohortSize:          3,
    cappedScore:         85,
    uncappedScore:       4.4,
    tieBreakTrace:       { rule: 'noTie' as const, decidingValue: 85, description: 'Ranked #1' },
    sourceEvaluationId:  'eval-001',
    generatedAt:         '2026-06-06T00:00:00.000Z',
    ...overrides,
  }
}

function makeLedgerDoc(overrides: Record<string, unknown> = {}) {
  return {
    id:             'eval-001',
    userId:         'user-001',
    pharmacyId:     'ph-001',
    role:           'pharmacist',
    month:          '2026-06',
    profileId:      'smarts-v1',
    profileVersion: 1,
    finalScore:     4.4,
    ratingScore:    4,
    status:         'complete',
    calculationTrace: { normalizedFinalScorePct: 85 },
    basketResults:  [],
    profileSnapshot: {},
    personalTargetSnapshot: null,
    branchTargetSnapshot: null,
    actualsSnapshot: {},
    rating: 'Exceed Expectation',
    calculatedAt: new Date().toISOString(),
    calculatedBy: 'admin-uid',
    recalculationOf: null,
    sealed: true,
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// 1. REPOSITORY
// ════════════════════════════════════════════════════════════════

describe('writeRankingSnapshots', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls writeBatch and commit', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    await writeRankingSnapshots([makeSnapshot()], 'admin-uid', true)
    expect(batch.set).toHaveBeenCalledTimes(1)
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('uses snapshotId as document ID', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const { doc } = await import('firebase/firestore')
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    const snap = makeSnapshot()
    await writeRankingSnapshots([snap], 'admin-uid')
    // doc() should be called with the snapshotId
    expect(vi.mocked(doc).mock.calls.some(
      (args) => args.includes(snap.snapshotId)
    )).toBe(true)
  })

  it('writes nothing for empty array', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    await writeRankingSnapshots([], 'admin-uid')
    expect(writeBatch).not.toHaveBeenCalled()
  })

  it('adds generationMode and isPreview to stored payload', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    await writeRankingSnapshots([makeSnapshot()], 'admin-uid', true)
    const payload = batch.set.mock.calls[0][1]
    expect(payload.generationMode).toBe('manual')
    expect(payload.isPreview).toBe(true)
    expect(payload.generatedBy).toBe('admin-uid')
  })
})

describe('getRankingSnapshots', () => {
  beforeEach(() => vi.resetAllMocks())

  it('queries by periodId, profileId, profileVersion', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { getRankingSnapshots } = await import('../../ranking/repository')
    await getRankingSnapshots('2026-06', 'smarts-v1', 1)
    const { where } = await import('firebase/firestore')
    expect(vi.mocked(where)).toHaveBeenCalledWith('periodId',       '==', '2026-06')
    expect(vi.mocked(where)).toHaveBeenCalledWith('profileId',      '==', 'smarts-v1')
    expect(vi.mocked(where)).toHaveBeenCalledWith('profileVersion', '==', 1)
  })

  it('returns empty array for no results', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { getRankingSnapshots } = await import('../../ranking/repository')
    const result = await getRankingSnapshots('2026-06', 'p', 1)
    expect(result).toEqual([])
  })

  it('maps docs to snapshot objects', async () => {
    const stored = { ...makeSnapshot(), generatedBy: 'admin', generationMode: 'manual', isPreview: true }
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{ data: () => stored }],
    } as any)
    const { getRankingSnapshots } = await import('../../ranking/repository')
    const result = await getRankingSnapshots('2026-06', 'p', 1)
    expect(result[0].entityId).toBe('ph-001')
    expect(result[0].isPreview).toBe(true)
  })
})

describe('subscribeRankingSnapshots', () => {
  it('returns unsubscribe function', async () => {
    const { subscribeRankingSnapshots } = await import('../../ranking/repository')
    const unsubFn = vi.fn()
    vi.mocked(onSnapshot).mockReturnValue(unsubFn as any)
    const unsub = subscribeRankingSnapshots('2026-06', 'p', 1, 'branch', vi.fn())
    expect(typeof unsub).toBe('function')
  })
})

describe('getPreviousPeriodSnapshots', () => {
  it('queries the month before the current period', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { getPreviousPeriodSnapshots } = await import('../../ranking/repository')
    await getPreviousPeriodSnapshots('2026-06', 'p', 1)
    const { where } = await import('firebase/firestore')
    expect(vi.mocked(where)).toHaveBeenCalledWith('periodId', '==', '2026-05')
  })

  it('wraps year boundary correctly (Jan → Dec prev year)', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { getPreviousPeriodSnapshots } = await import('../../ranking/repository')
    await getPreviousPeriodSnapshots('2026-01', 'p', 1)
    const { where } = await import('firebase/firestore')
    expect(vi.mocked(where)).toHaveBeenCalledWith('periodId', '==', '2025-12')
  })
})

// ════════════════════════════════════════════════════════════════
// 2. RANKING SERVICE
// ════════════════════════════════════════════════════════════════

describe('generateAndPersistBranchRankings — happy path (RF-1C-B: KPI-based)', () => {
  // RF-1C-B ARCHITECTURE:
  //   Branch ranking now reads kpi_entries + targets, NOT evaluation_results.
  //   getDocs mock order:
  //     Call 1: pharmacies (classification + name)
  //     Calls 2..N: kpi_entries per pharmacy (one getDocs per pharmacy, per month range)
  //     Calls N+1..M: targets via getDoc (one per pharmacy)
  //     Final: previous period ranking_snapshots
  //
  // Because the service uses Promise.all per pharmacy and getDoc (not getDocs) for targets,
  // we mock getDocs for pharmacies + kpi_entries, and getDoc for targets.

  beforeEach(() => vi.resetAllMocks())

  it('returns report with totalInput = pharmacy count when pharmacies exist with KPI data', async () => {
    const { getDoc } = await import('firebase/firestore')

    // pharmacies — 3 classified branches
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [
          { id: 'ph-1', data: () => ({ branchClassification: 'destination', name: 'Branch 1' }) },
          { id: 'ph-2', data: () => ({ branchClassification: 'destination', name: 'Branch 2' }) },
          { id: 'ph-3', data: () => ({ branchClassification: 'destination', name: 'Branch 3' }) },
        ],
      } as any)
      // kpi_entries for each pharmacy (3 queries)
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u1', pharmacyId: 'ph-1', date: '2026-06-15',
          wasfaty: 100, omni: 100, wellness: 100, basket: 100, crossSelling: 100 }) },
      ] } as any)
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u2', pharmacyId: 'ph-2', date: '2026-06-15',
          wasfaty: 80, omni: 80, wellness: 80, basket: 80, crossSelling: 80 }) },
      ] } as any)
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u3', pharmacyId: 'ph-3', date: '2026-06-15',
          wasfaty: 60, omni: 60, wellness: 60, basket: 60, crossSelling: 60 }) },
      ] } as any)
      // previous period snapshots
      .mockResolvedValue({ docs: [] } as any)

    // targets — one getDoc per pharmacy
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        pharmacyId: 'ph-1', month: '2026-06',
        wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
        basketTarget: 100, crossSellingTarget: 100,
      }) } as any)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        pharmacyId: 'ph-2', month: '2026-06',
        wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
        basketTarget: 100, crossSellingTarget: 100,
      }) } as any)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        pharmacyId: 'ph-3', month: '2026-06',
        wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
        basketTarget: 100, crossSellingTarget: 100,
      }) } as any)

    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'smarts-v1', profileVersion: 1,
      generatedBy: 'admin-uid',
    })

    expect(report.totalInput).toBe(3)
    expect(report.totalRanked).toBe(3)
    expect(report.totalExcluded).toBe(0)
    expect(report.cohorts).toHaveLength(1)
    expect(report.error).toBeUndefined()
  })

  it('excludes unclassified branches — no target/entries needed, classification is the gate', async () => {
    const { getDoc } = await import('firebase/firestore')

    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [
          { id: 'ph-ok',  data: () => ({ branchClassification: 'destination', name: 'OK' }) },
          { id: 'ph-unc', data: () => ({ branchClassification: 'unclassified',  name: 'UNC' }) },
        ],
      } as any)
      // kpi_entries for ph-ok
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u1', pharmacyId: 'ph-ok', date: '2026-06-15',
          wasfaty: 100, omni: 100, wellness: 100, basket: 100, crossSelling: 100 }) },
      ] } as any)
      // kpi_entries for ph-unc
      .mockResolvedValueOnce({ docs: [] } as any)
      .mockResolvedValue({ docs: [] } as any)

    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        pharmacyId: 'ph-ok', month: '2026-06',
        wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
        basketTarget: 100, crossSellingTarget: 100,
      }) } as any)
      .mockResolvedValue({ exists: () => false } as any)

    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(1)
    expect(report.totalExcluded).toBeGreaterThanOrEqual(1)
    // The unclassified branch is excluded either by scoring engine or ranking engine
    const uncExcluded = report.excluded.find((e: any) => e.entityId === 'ph-unc')
    expect(uncExcluded).toBeTruthy()
  })

  it('returns error in report when no pharmacies exist', async () => {
    // RF-1C-B: branch ranking source is kpi_entries+targets, not evaluation_results.
    // Error condition is now "no pharmacies found", not "no evaluation records".
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })
    expect(report.error).toBeTruthy()
    expect(report.totalRanked).toBe(0)
  })

  it('report has correct periodId, profileId, profileVersion', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'smarts-v1', profileVersion: 2, generatedBy: 'admin',
    })
    expect(report.periodId).toBe('2026-06')
    expect(report.profileId).toBe('smarts-v1')
    expect(report.profileVersion).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════════
// 3. MODULE BOUNDARY
// ════════════════════════════════════════════════════════════════

describe('RF-1B module boundary', () => {
  it('repository is the only ranking file that imports firebase', async () => {
    const pureFiles = [
      '../../ranking/types.ts?raw',
      '../../ranking/ranking-key.ts?raw',
      '../../ranking/eligibility.ts?raw',
      '../../ranking/tie-break.ts?raw',
      '../../ranking/branch-ranking-engine.ts?raw',
    ]
    for (const path of pureFiles) {
      const src = await import(path)
      expect(src.default, `${path} must not import firebase`).not.toMatch(/from ['"]firebase/)
    }
  })

  it('repository imports COL from services/firebase', async () => {
    const src = await import('../../ranking/repository.ts?raw')
    expect(src.default).toContain("from '../services/firebase'")
    expect(src.default).toContain('COL.RANKING_SNAPSHOTS')
  })

  it('ranking-service does not contain tie-break logic', async () => {
    const src = await import('../../ranking/ranking-service.ts?raw')
    // No direct score comparisons — those belong in tie-break.ts
    expect(src.default).not.toMatch(/\.sort\(\(a, b\) => b\.cappedScore/)
    expect(src.default).not.toMatch(/compareRecords|sortWithTieBreak.*inline/)
  })

  it('Firestore rules contain ranking_snapshots rule', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('match /ranking_snapshots/')
    expect(src.default).toContain('allow read:   if isAdmin()')
  })
})
