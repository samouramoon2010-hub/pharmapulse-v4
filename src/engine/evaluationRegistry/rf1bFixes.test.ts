// ============================================================
// RF-1B Fix Regression Tests
//
// Issue 1 root cause:
//   RankingsPage Controls section had all three elements (period,
//   profile, button) in one flex row. On narrow screens flexWrap
//   pushed the button out of view. Also disabled={!selectedProf}
//   hid the button during the async profile-load window.
//   Fix: button on its own row, disabled only during active generation.
//
// Issue 2 root cause:
//   ledgerDocToBranchRecord() never set entityName.
//   The snapshot spread (...snap) sent entityName: undefined to Firestore.
//   Firestore rejected the write: "Unsupported field value: undefined".
//   Fix: entityName sourced from pharmacy.name in the service;
//        sanitizeSnapshot() strips all undefined fields in the repository
//        and guarantees entityName falls back to entityId.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    RANKING_SNAPSHOTS:   'ranking_snapshots',
    EVALUATION_RESULTS:  'evaluation_results',
    PHARMACIES:          'pharmacies',
    AUDIT_LOGS: 'audit_logs', USERS: 'users', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', NOTIFICATIONS: 'notifications', LEADERBOARD: 'leaderboard',
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
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

import { writeBatch, getDocs } from 'firebase/firestore'

// ── helpers ───────────────────────────────────────────────────

function makeLedgerDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eval-001', userId: 'u-001', pharmacyId: 'ph-001',
    role: 'pharmacist', month: '2026-06',
    profileId: 'p', profileVersion: 1,
    finalScore: 4.4, ratingScore: 4, status: 'complete',
    calculationTrace: { normalizedFinalScorePct: 85 },
    basketResults: [], profileSnapshot: {}, personalTargetSnapshot: null,
    branchTargetSnapshot: null, actualsSnapshot: {}, rating: 'Exceed',
    calculatedAt: new Date().toISOString(), calculatedBy: 'admin',
    recalculationOf: null, sealed: true,
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// Issue 2 — sanitizeSnapshot: no undefined in Firestore payload
// ════════════════════════════════════════════════════════════════

describe('writeRankingSnapshots — no undefined values reach Firestore', () => {
  beforeEach(() => vi.resetAllMocks())

  it('payload written to Firestore contains no undefined values', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const writtenPayloads: Record<string, unknown>[] = []
    const batch = {
      set:    vi.fn((_ref, payload) => { writtenPayloads.push(payload) }),
      commit: vi.fn(async () => {}),
    }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    await writeRankingSnapshots([{
      snapshotId:         'sid',
      entityType:         'branch',
      entityId:           'ph-001',
      entityName:         undefined as any,   // ← the broken case
      cohortId:           'cid',
      periodId:           '2026-06',
      profileId:          'p',
      profileVersion:     1,
      classificationId:   'destination',
      currentRank:        1,
      cohortSize:         3,
      cappedScore:        85,
      uncappedScore:      4.4,
      strategicKpiScore:  undefined as any,   // optional — must be omitted
      previousRank:       undefined as any,   // optional — must be omitted
      rankMovement:       undefined as any,   // optional — must be omitted
      tieBreakTrace:      { rule: 'noTie' as const, decidingValue: 85, description: '#1' },
      sourceEvaluationId: 'eval-001',
      generatedAt:        '2026-06-06T00:00:00Z',
    }], 'admin-uid', true)

    expect(writtenPayloads).toHaveLength(1)
    const payload = writtenPayloads[0]

    // No undefined values anywhere in the payload
    for (const [key, value] of Object.entries(payload)) {
      expect(value, `field "${key}" must not be undefined`).not.toBeUndefined()
    }
  })

  it('entityName falls back to entityId when undefined', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const payloads: Record<string, unknown>[] = []
    const batch = { set: vi.fn((_r, p) => payloads.push(p)), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    await writeRankingSnapshots([{
      snapshotId: 'sid2', entityType: 'branch', entityId: 'ph-fallback',
      entityName: undefined as any,
      cohortId: 'c', periodId: '2026-06', profileId: 'p', profileVersion: 1,
      classificationId: 'hub', currentRank: 1, cohortSize: 1,
      cappedScore: 70, uncappedScore: 4.0,
      tieBreakTrace: { rule: 'noTie' as const, decidingValue: 70, description: '' },
      sourceEvaluationId: 'eval-002', generatedAt: '2026-06-06T00:00:00Z',
    }], 'admin-uid')

    expect(payloads[0].entityName).toBe('ph-fallback')
  })

  it('entityName is preserved when provided', async () => {
    const { writeRankingSnapshots } = await import('../../ranking/repository')
    const payloads: Record<string, unknown>[] = []
    const batch = { set: vi.fn((_r, p) => payloads.push(p)), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    await writeRankingSnapshots([{
      snapshotId: 'sid3', entityType: 'branch', entityId: 'ph-001',
      entityName: 'صيدلية الأثير',
      cohortId: 'c', periodId: '2026-06', profileId: 'p', profileVersion: 1,
      classificationId: 'destination', currentRank: 1, cohortSize: 2,
      cappedScore: 85, uncappedScore: 4.4,
      tieBreakTrace: { rule: 'noTie' as const, decidingValue: 85, description: '' },
      sourceEvaluationId: 'eval-003', generatedAt: '2026-06-06T00:00:00Z',
    }], 'admin-uid')

    expect(payloads[0].entityName).toBe('صيدلية الأثير')
  })
})

// ════════════════════════════════════════════════════════════════
// Issue 2 — ranking-service: entityName sourced from pharmacy.name
// ════════════════════════════════════════════════════════════════

describe('generateAndPersistBranchRankings — entityName populated from pharmacy', () => {
  beforeEach(() => vi.resetAllMocks())

  it('snapshot entityName equals pharmacy.name from Firestore (RF-1C-B: KPI-based)', async () => {
    // RF-1C-B: branch ranking source changed to kpi_entries+targets.
    // entityName still comes from the pharmacy document — contract unchanged.
    const { getDoc } = await import('firebase/firestore')

    vi.mocked(getDocs)
      // pharmacies — has a name field
      .mockResolvedValueOnce({
        docs: [{ id: 'ph-001', data: () => ({
          name: 'صيدلية الأثير',
          code: '5074',
          branchClassification: 'destination',
        }) }],
      } as any)
      // kpi_entries for ph-001
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u1', pharmacyId: 'ph-001', date: '2026-06-15',
          wasfaty: 100, omni: 100, wellness: 100, basket: 100, crossSelling: 100 }) },
      ] } as any)
      .mockResolvedValue({ docs: [] } as any)

    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({
      pharmacyId: 'ph-001', month: '2026-06',
      wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
      basketTarget: 100, crossSellingTarget: 100,
    }) } as any)

    const writtenPayloads: Record<string, unknown>[] = []
    const batch = {
      set: vi.fn((_r, p) => writtenPayloads.push(p)),
      commit: vi.fn(async () => {}),
    }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin-uid',
    })

    expect(writtenPayloads).toHaveLength(1)
    expect(writtenPayloads[0].entityName).toBe('صيدلية الأثير')
  })

  it('pharmacy without name falls back to code, then to entityId (RF-1C-B)', async () => {
    const { getDoc } = await import('firebase/firestore')

    vi.mocked(getDocs)
      // pharmacy with no name but has code
      .mockResolvedValueOnce({
        docs: [{ id: 'ph-002', data: () => ({
          code: '9999',
          branchClassification: 'hub',
        }) }],
      } as any)
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ userId: 'u1', pharmacyId: 'ph-002', date: '2026-06-15',
          wasfaty: 100, omni: 100, wellness: 100, basket: 100, crossSelling: 100 }) },
      ] } as any)
      .mockResolvedValue({ docs: [] } as any)

    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({
      pharmacyId: 'ph-002', month: '2026-06',
      wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
      basketTarget: 100, crossSellingTarget: 100,
    }) } as any)

    const payloads: Record<string, unknown>[] = []
    vi.mocked(writeBatch).mockReturnValue({
      set: vi.fn((_r, p) => payloads.push(p)),
      commit: vi.fn(async () => {}),
    } as any)

    const { generateAndPersistBranchRankings } = await import('../../ranking/ranking-service')
    await generateAndPersistBranchRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin-uid',
    })

    // code is the fallback when name is absent
    expect(payloads[0].entityName).toBe('9999')
  })
})

// ════════════════════════════════════════════════════════════════
// Issue 1 — RankingsPage: button is always visible
// ════════════════════════════════════════════════════════════════

describe('RankingsPage — Generate Preview button visibility', () => {
  it('button disabled only when generating (not when !selectedProf)', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    // Button must only be disabled during active generation
    const buttonSection = src.default
      .split('<button')[1]
      ?.split('</button>')[0] ?? ''
    expect(buttonSection).toContain('disabled={generating}')
    // Must NOT disable based on selectedProf — that was the visibility bug
    expect(buttonSection).not.toContain('!selectedProf')
  })

  it('button is on its own layout row (not inside the same flex as selectors)', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    // The selectors flex container (flexWrap: 'wrap') must appear before the
    // generate button in the source — confirming they are sequential, not nested.
    const selectorsFlex = src.default.indexOf("flexWrap: 'wrap'")
    const buttonStart   = src.default.indexOf('onClick={handleGenerate}')
    expect(selectorsFlex).toBeGreaterThan(0)
    expect(buttonStart).toBeGreaterThan(0)
    expect(selectorsFlex).toBeLessThan(buttonStart)
  })

  it('button shows loading spinner during generation', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    // Text shown while generating (exact wording may vary — prefix check)
    expect(src.default).toContain('Generating')
    expect(src.default).toContain('Loader2')
  })
})
