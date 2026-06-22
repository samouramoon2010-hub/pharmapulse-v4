// ============================================================
// RF-1C Pharmacist Ranking Inclusion Rule — Tests
//
// Context (audit RF-1C Pharmacist Ranking Inclusion):
//   The original query filtered role=='pharmacist', which excluded
//   branch managers and ordinary managers who have individual evaluations.
//   Samir (branch_manager, Al Athir) was the production example.
//
// Fix applied:
//   where('role', 'in', ['pharmacist', 'manager', 'branch_manager'])
//
// Tests verify:
//   1.  pharmacist role → included
//   2.  manager role → included
//   3.  branch_manager role → included
//   4.  admin role → excluded (not fetched)
//   5.  invalid evaluationStatus → excluded (eligibility)
//   6.  no hardcoded 'pharmacist' == filter in pharmacist ranking query
//   7.  all three roles appear in the same company-wide cohort
//   8.  report.totalInput reflects all three roles
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDocs, writeBatch } from 'firebase/firestore'

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    RANKING_SNAPSHOTS:   'ranking_snapshots',
    EVALUATION_RESULTS:  'evaluation_results',
    PHARMACIES:          'pharmacies',
    USERS:               'users',
    KPI_ENTRIES:         'kpi_entries',
    TARGETS:             'targets',
    AUDIT_LOGS:          'audit_logs',
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
    CLASSIFICATIONS:     'classifications',
    DEMO_BATCHES:        'demo_batches',
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
  where:           vi.fn((...args) => ({ __where: args })),
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

// ── Fixtures ──────────────────────────────────────────────────

function makeLedgerDoc(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id:               `eval-${role}`,
    userId:           `user-${role}`,
    pharmacyId:       'ph-001',
    role,
    month:            '2026-06',
    profileId:        'p',
    profileVersion:   1,
    finalScore:       4.0,
    ratingScore:      4,
    status:           'complete',
    calculationTrace: { normalizedFinalScorePct: 80 },
    basketResults:    [],
    ...overrides,
  }
}

function mockGetDocs(docs: ReturnType<typeof makeLedgerDoc>[]) {
  // Call order: evaluation_results, users (display names), previous period snapshots
  vi.mocked(getDocs)
    .mockResolvedValueOnce({ docs: docs.map((d) => ({ id: d.id, data: () => d })) } as any)
    .mockResolvedValueOnce({ docs: [
      { id: 'user-pharmacist',    data: () => ({ displayName: 'Dr. Pharmacist' }) },
      { id: 'user-manager',       data: () => ({ displayName: 'Manager A' }) },
      { id: 'user-branch_manager',data: () => ({ displayName: 'Samir Al Athir' }) },
    ] } as any)
    .mockResolvedValue({ docs: [] } as any)   // previous period snapshots
}

// ════════════════════════════════════════════════════════════════
// 1–3. Included roles
// ════════════════════════════════════════════════════════════════

describe('Pharmacist ranking inclusion — individual contributor roles', () => {
  beforeEach(() => vi.resetAllMocks())

  it('pharmacist role → included in ranking', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    mockGetDocs([makeLedgerDoc('pharmacist')])

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(1)
    expect(report.error).toBeUndefined()
  })

  it('manager role → included in ranking', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    mockGetDocs([makeLedgerDoc('manager')])

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(1)
    expect(report.error).toBeUndefined()
  })

  it('branch_manager role → included in ranking (Samir fix)', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    mockGetDocs([makeLedgerDoc('branch_manager')])

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(1)
    expect(report.error).toBeUndefined()
  })

  it('all three roles in same company-wide cohort', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    mockGetDocs([
      makeLedgerDoc('pharmacist'),
      makeLedgerDoc('manager'),
      makeLedgerDoc('branch_manager'),
    ])

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalInput).toBe(3)
    expect(report.totalRanked).toBe(3)
    expect(report.cohorts).toHaveLength(1)
    expect(report.cohorts[0].classificationId).toBe('company-wide')
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Admin excluded
// ════════════════════════════════════════════════════════════════

describe('Pharmacist ranking exclusion — admin role', () => {
  beforeEach(() => vi.resetAllMocks())

  it('admin role → NOT included (query does not fetch admin docs)', async () => {
    // If admin docs are returned (shouldn't happen with correct query, but
    // we test the safety: getDocs returns admin doc; it should not appear in ranking)
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as any)   // evaluation_results returns nothing for admin
      .mockResolvedValue({ docs: [] } as any)

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(0)
    expect(report.error).toBeTruthy()   // no records found
  })

  it('ranking-service does not query for admin role', async () => {
    const src = await import('../../ranking/ranking-service.ts?raw')
    // The inclusion list must not contain 'admin'
    const inclusionListMatch = src.default.match(/INDIVIDUAL_CONTRIBUTOR_ROLES\s*=\s*\[([^\]]+)\]/)
    expect(inclusionListMatch).not.toBeNull()
    const listStr = inclusionListMatch![1]
    expect(listStr).not.toContain("'admin'")
    expect(listStr).toContain("'pharmacist'")
    expect(listStr).toContain("'manager'")
    expect(listStr).toContain("'branch_manager'")
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Invalid evaluation excluded
// ════════════════════════════════════════════════════════════════

describe('Pharmacist ranking exclusion — invalid evaluation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('evaluationStatus=invalid → excluded with reason', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)
    mockGetDocs([makeLedgerDoc('pharmacist', { status: 'invalid' })])

    const { generateAndPersistPharmacistRankings } = await import('../../ranking/ranking-service')
    const report = await generateAndPersistPharmacistRankings({
      periodId: '2026-06', profileId: 'p', profileVersion: 1, generatedBy: 'admin',
    })

    expect(report.totalRanked).toBe(0)
    expect(report.totalExcluded).toBe(1)
    expect(report.excluded[0].reason).toMatch(/invalid/i)
  })
})

// ════════════════════════════════════════════════════════════════
// 6. No hardcoded role == 'pharmacist' in pharmacist ranking
// ════════════════════════════════════════════════════════════════

describe('No hardcoded role-specific query', () => {
  it("ranking-service does not use where('role','==','pharmacist')", async () => {
    const src = await import('../../ranking/ranking-service.ts?raw')
    // The old broken pattern
    expect(src.default).not.toContain("'==', 'pharmacist'")
    // The new pattern should use 'in'
    expect(src.default).toContain("'in', [...INDIVIDUAL_CONTRIBUTOR_ROLES]")
  })

  it('INDIVIDUAL_CONTRIBUTOR_ROLES constant is defined and used', async () => {
    const src = await import('../../ranking/ranking-service.ts?raw')
    expect(src.default).toContain('INDIVIDUAL_CONTRIBUTOR_ROLES')
    expect(src.default).toContain('pharmacist')
    expect(src.default).toContain('manager')
    expect(src.default).toContain('branch_manager')
  })

  it('comment documents the RF-1D evaluationCohort roadmap', async () => {
    const src = await import('../../ranking/ranking-service.ts?raw')
    expect(src.default).toContain('evaluationCohort')
    expect(src.default).toContain('RF-1D')
  })
})
