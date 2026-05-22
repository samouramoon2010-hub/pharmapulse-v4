// ============================================================
// History Service — Integration Logic Tests
// Tests the trigger orchestration logic WITHOUT Firebase
// by mocking the engine generators.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Firebase to avoid real connections ──────────────────
vi.mock('../services/firebase', () => ({
  db:  {},
  COL: {
    KPI_ENTRIES:        'kpi_entries',
    TARGETS:            'targets',
    USERS:              'users',
    DAILY_SUMMARIES:    'daily_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS:     'risk_snapshots',
    RANKING_HISTORY:    'ranking_history',
    AUDIT_LOGS:         'audit_logs',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:       vi.fn(() => ({})),
  doc:              vi.fn(() => ({})),
  getDoc:           vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:          vi.fn(async () => ({ docs: [] })),
  setDoc:           vi.fn(async () => {}),
  query:            vi.fn(() => ({})),
  where:            vi.fn(() => ({})),
  orderBy:          vi.fn(() => ({})),
  limit:            vi.fn(() => ({})),
  serverTimestamp:  vi.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch:       vi.fn(() => ({
    set:    vi.fn(),
    commit: vi.fn(async () => {}),
  })),
}))

vi.mock('./auditService', () => ({
  logAction: vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

// ── Engine generators — test the function signatures
describe('History Engine generators (pure functions)', () => {
  it('generateDailySummary produces correct id', async () => {
    const { generateDailySummary } = await import('../engine/historyEngine')
    const summary = generateDailySummary('u1', 'p1', '2025-05-15', [], null, new Date(2025, 4, 15))
    expect(summary.id).toBe('u1_p1_2025-05-15')
    expect(summary.userId).toBe('u1')
    expect(summary.pharmacyId).toBe('p1')
    expect(summary.month).toBe('2025-05')
  })

  it('generateForecastSnapshot produces correct id', async () => {
    const { generateForecastSnapshot } = await import('../engine/historyEngine')
    const snap = generateForecastSnapshot('u1', 'p1', '2025-05-15', [], null, new Date(2025, 4, 15))
    expect(snap.id).toBe('u1_p1_2025-05-15')
    expect(Object.keys(snap.kpis)).toHaveLength(5)
  })

  it('generateRiskSnapshot with no pharmacists', async () => {
    const { generateRiskSnapshot } = await import('../engine/historyEngine')
    const snap = generateRiskSnapshot('p1', '2025-05-15', [], [], null, [], new Date(2025, 4, 15))
    expect(snap.id).toBe('p1_2025-05-15')
    expect(snap.submissionRate).toBe(0)
    expect(snap.missingPharmacists).toHaveLength(0)
  })
})

// ── getSummaryWriteTargets ────────────────────────────────────
describe('getSummaryWriteTargets', () => {
  it('returns all 4 correct document IDs', async () => {
    const { getSummaryWriteTargets } = await import('../engine/historyEngine')
    const t = getSummaryWriteTargets('u1', 'p1', '2025-05-15')
    expect(t.dailySummaryId).toBe('u1_p1_2025-05-15')
    expect(t.riskSnapshotId_).toBe('p1_2025-05-15')
    expect(t.rankingHistoryId_).toBe('p1_2025-05')
    expect(t.month).toBe('2025-05')
  })
})

// ── triggerHistorySnapshots — fire-and-forget behaviour ──────
describe('triggerHistorySnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves without throwing even with empty data', async () => {
    const { triggerHistorySnapshots } = await import('./historyService')
    // Should not throw — failures are caught internally
    await expect(
      triggerHistorySnapshots('u1', 'p1', '2025-05-15', 'u1', 'pharmacist')
    ).resolves.toBeUndefined()
  })

  it('calls writeBatch commit for batch 1', async () => {
    const { writeBatch } = await import('firebase/firestore')
    const { triggerHistorySnapshots } = await import('./historyService')

    await triggerHistorySnapshots('u1', 'p1', '2025-05-15', 'u1', 'pharmacist')

    expect(writeBatch).toHaveBeenCalled()
  })

  it('does not throw when Firestore calls fail', async () => {
    const firestoreMod = await import('firebase/firestore')
    // Make getDocs throw
    vi.mocked(firestoreMod.getDocs).mockRejectedValueOnce(new Error('Network error'))

    const { triggerHistorySnapshots } = await import('./historyService')

    // Must not propagate error to caller
    await expect(
      triggerHistorySnapshots('u1', 'p1', '2025-05-15', 'u1', 'pharmacist')
    ).resolves.toBeUndefined()
  })
})
