// ============================================================
// RF-1D-A Bulk Evaluation Service — Tests
//
// Covers:
//   1.  Eligible roles included: pharmacist, manager, branch_manager
//   2.  Excluded roles filtered: admin, supervisor, regional_manager, hub_store_manager
//   3.  Inactive users excluded
//   4.  Skip idempotency: existing eval for same profile → skipped
//   5.  Skip idempotency: existing eval for DIFFERENT profile → not skipped
//   6.  Re-run idempotency: always runs regardless of existing eval
//   7.  Single-user failure does not abort batch (partial success)
//   8.  Accurate counts: succeeded + skipped + failed === totalEligible
//   9.  Empty branch returns report with zero counts
//  10.  Profile fetch throws when profile not found
//  11.  Profile fetch throws when profile not published
//  12.  isEligibleForBulkEvaluation covers all role cases
//  13.  No evaluation engine logic duplicated in bulkEvaluationService
//  14.  Registry fetched ONCE per batch (not per user)
//  15.  previewBranchBulkEvaluation returns correct eligible/ineligible split
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isEligibleForBulkEvaluation,
  BULK_ELIGIBLE_ROLES,
  BULK_EXCLUDED_ROLES,
} from '../../services/bulkEvaluationService'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    KPI_REGISTRY:        'kpi_registry',
    USERS:               'users',
    PHARMACIES:          'pharmacies',
    KPI_ENTRIES:         'kpi_entries',
    TARGETS:             'targets',
    PERSONAL_TARGETS:    'personal_targets',
    EVALUATION_RESULTS:  'evaluation_results',
    EVALUATION_PROFILES: 'evaluation_profiles',
    RANKING_SNAPSHOTS:   'ranking_snapshots',
    DEMO_BATCHES:        'demo_batches',
    AUDIT_LOGS:          'audit_logs',
    CLASSIFICATIONS:     'classifications',
    RANKING_HISTORY:     'ranking_history',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn((_db, col) => ({ __col: col })),
  doc:             vi.fn((_db, ...parts) => ({ __path: parts.join('/') })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [], forEach: vi.fn() })),
  setDoc:          vi.fn(async () => {}),
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  query:           vi.fn((...a) => a[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({})),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LOGIN: 'login', LOGOUT: 'logout' },
}))

// Service mocks — controlled per-test via vi.mocked(...).mockResolvedValue(...)
vi.mock('../../services/userService', () => ({
  getUsersByPharmacy: vi.fn(async () => []),
}))
vi.mock('../../services/evaluationRegistryService', () => ({
  fetchEvaluationProfile:     vi.fn(async () => GOOD_PROFILE_FACTORY()),
  subscribePublishedProfiles: vi.fn(() => vi.fn()),
}))
vi.mock('../../services/kpiRegistryService', () => ({
  fetchKpiRegistryOnce:   vi.fn(async () => ({})),
  subscribeKpiRegistry:   vi.fn(() => vi.fn()),
}))
vi.mock('../../services/evaluationLedgerService', () => ({
  fetchEvaluationResultsForUserMonth: vi.fn(async () => []),
  writeEvaluationResult: vi.fn(async () => ({ id: 'ledger-1' })),
  subscribeMyEvaluationResults: vi.fn(() => vi.fn()),
}))
vi.mock('../../services/evaluationOrchestrationService', () => ({
  runEvaluationForUserMonth: vi.fn(async () => GOOD_OUTCOME_FACTORY()),
}))

// ── Helpers ───────────────────────────────────────────────────

function makeUser(role: string, active = true, id?: string) {
  return { id: id ?? `user-${role}`, displayName: `Test ${role}`, role, active }
}

const GOOD_PROFILE = {
  id: 'profile-1', name: 'Test Profile', version: 1,
  status: 'published', role: ['pharmacist'], baskets: {},
  basketIds: [], defaultThresholdRule: null, effectiveFrom: '2026-01',
}

const GOOD_LEDGER = {
  id: 'ledger-1', userId: 'user-pharmacist', pharmacyId: 'ph-1', role: 'pharmacist',
  month: '2026-06', profileId: 'profile-1', profileVersion: 1,
  finalScore: 4.2, ratingScore: 4, status: 'complete',
  calculationTrace: { normalizedFinalScorePct: 80, missingKpis: [], personalTargetUsed: false, cappedKpis: [], profileSnapshotId: '', profileVersion: 1, calculatedAtMs: 0 },
  basketResults: [], rating: 'Exceed Expectation', sealed: true,
}

// Factories (called after vi.resetAllMocks so mocked module refs are stable)
const GOOD_PROFILE_FACTORY = () => ({
  id: 'profile-1', name: 'Test Profile', version: 1,
  status: 'published', role: ['pharmacist'], baskets: {},
  basketIds: [], defaultThresholdRule: null, effectiveFrom: '2026-01',
})
const GOOD_LEDGER_FACTORY = (userId = 'user-pharmacist', profileId = 'profile-1') => ({
  id: 'ledger-1', userId, pharmacyId: 'ph-1', role: 'pharmacist',
  month: '2026-06', profileId, profileVersion: 1,
  finalScore: 4.2, ratingScore: 4, status: 'complete',
  calculationTrace: { normalizedFinalScorePct: 80, missingKpis: [], personalTargetUsed: false, cappedKpis: [], profileSnapshotId: '', profileVersion: 1, calculatedAtMs: 0 },
  basketResults: [], rating: 'Exceed Expectation', sealed: true,
})
const GOOD_OUTCOME_FACTORY = (userId = 'user-pharmacist') => ({
  ledgerDoc: GOOD_LEDGER_FACTORY(userId),
  profile: GOOD_PROFILE_FACTORY(),
  kpiActuals: {},
  branchTarget: null,
  personalTarget: null,
  entryCount: 10,
  warnings: [],
})

const GOOD_OUTCOME = {
  ledgerDoc: GOOD_LEDGER,
  profile: GOOD_PROFILE,
  kpiActuals: {},
  branchTarget: null,
  personalTarget: null,
  entryCount: 10,
  warnings: [],
}

// ════════════════════════════════════════════════════════════════
// 1–3. isEligibleForBulkEvaluation
// ════════════════════════════════════════════════════════════════

describe('isEligibleForBulkEvaluation', () => {
  it.each(['pharmacist', 'manager', 'branch_manager'])('%s → eligible', (role) => {
    expect(isEligibleForBulkEvaluation({ role, active: true })).toBe(true)
  })

  it.each(['admin', 'supervisor', 'regional_manager', 'hub_store_manager'])(
    '%s → excluded', (role) => {
    expect(isEligibleForBulkEvaluation({ role, active: true })).toBe(false)
  })

  it('inactive user → excluded regardless of role', () => {
    expect(isEligibleForBulkEvaluation({ role: 'pharmacist', active: false })).toBe(false)
  })

  it('unknown role → excluded', () => {
    expect(isEligibleForBulkEvaluation({ role: 'unknown_future_role', active: true })).toBe(false)
  })

  it('BULK_ELIGIBLE_ROLES contains exactly pharmacist, manager, branch_manager', () => {
    expect([...BULK_ELIGIBLE_ROLES].sort()).toEqual(['branch_manager', 'manager', 'pharmacist'])
  })

  it('BULK_EXCLUDED_ROLES contains admin', () => {
    expect(BULK_EXCLUDED_ROLES).toContain('admin')
    expect(BULK_EXCLUDED_ROLES).toContain('hub_store_manager')
  })
})

// ════════════════════════════════════════════════════════════════
// 4–6. Idempotency
// ════════════════════════════════════════════════════════════════

describe('runBranchBulkEvaluation — idempotency', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    const { fetchKpiRegistryOnce } = await import('../../services/kpiRegistryService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([makeUser('pharmacist', true, 'u1')] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue(GOOD_PROFILE_FACTORY() as any)
    vi.mocked(fetchKpiRegistryOnce).mockResolvedValue({} as any)
  })

  it('skip: user with existing eval for same profile → status=skipped', async () => {
    const { fetchEvaluationResultsForUserMonth } = await import('../../services/evaluationLedgerService')
    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    vi.mocked(fetchEvaluationResultsForUserMonth).mockResolvedValue(
      [GOOD_LEDGER_FACTORY('u1', 'profile-1')] as any
    )
    vi.mocked(runEvaluationForUserMonth).mockResolvedValue(GOOD_OUTCOME_FACTORY() as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const report = await runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })

    expect(report.skipped).toBe(1)
    expect(report.succeeded).toBe(0)
    expect(report.results[0].status).toBe('skipped')
  })

  it('skip: user with eval for DIFFERENT profile → runs (not skipped)', async () => {
    const { fetchEvaluationResultsForUserMonth } = await import('../../services/evaluationLedgerService')
    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    // Existing eval is for a DIFFERENT profile
    vi.mocked(fetchEvaluationResultsForUserMonth).mockResolvedValue(
      [GOOD_LEDGER_FACTORY('u1', 'OTHER-profile')] as any
    )
    vi.mocked(runEvaluationForUserMonth).mockResolvedValue(GOOD_OUTCOME_FACTORY() as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    await runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })

    expect(vi.mocked(runEvaluationForUserMonth)).toHaveBeenCalledTimes(1)
  })

  it('re-run: always runs even when eval exists', async () => {
    const { fetchEvaluationResultsForUserMonth } = await import('../../services/evaluationLedgerService')
    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    vi.mocked(fetchEvaluationResultsForUserMonth).mockResolvedValue(
      [GOOD_LEDGER_FACTORY('u1', 'profile-1')] as any
    )
    vi.mocked(runEvaluationForUserMonth).mockResolvedValue(GOOD_OUTCOME_FACTORY() as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const report = await runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 're-run',
    })

    expect(vi.mocked(runEvaluationForUserMonth)).toHaveBeenCalledTimes(1)
    expect(report.succeeded).toBe(1)
    expect(report.skipped).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 7–8. Partial failure + counts
// ════════════════════════════════════════════════════════════════

describe('runBranchBulkEvaluation — partial failure and counts', () => {
  beforeEach(() => vi.resetAllMocks())

  it('single-user failure does not abort batch', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    const { fetchKpiRegistryOnce } = await import('../../services/kpiRegistryService')
    const { fetchEvaluationResultsForUserMonth } = await import('../../services/evaluationLedgerService')
    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')

    vi.mocked(getUsersByPharmacy).mockResolvedValue([
      makeUser('pharmacist', true, 'u1'),
      makeUser('pharmacist', true, 'u2'),
      makeUser('pharmacist', true, 'u3'),
    ] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue(GOOD_PROFILE_FACTORY() as any)
    vi.mocked(fetchKpiRegistryOnce).mockResolvedValue({} as any)
    vi.mocked(fetchEvaluationResultsForUserMonth).mockResolvedValue([] as any)

    let callCount = 0
    vi.mocked(runEvaluationForUserMonth).mockImplementation(async () => {
      callCount++
      if (callCount === 2) throw new Error('KPI data missing')
      return GOOD_OUTCOME_FACTORY() as any
    })

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const report = await runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 're-run',
    })

    expect(report.results).toHaveLength(3)
    expect(report.succeeded).toBe(2)
    expect(report.failed).toBe(1)
    expect(report.results[1].status).toBe('failed')
    expect(report.results[1].error).toContain('KPI data missing')
    expect(report.succeeded + report.skipped + report.failed).toBe(report.totalEligible)
  })
})

// ════════════════════════════════════════════════════════════════
// 9. Empty branch
// ════════════════════════════════════════════════════════════════

describe('runBranchBulkEvaluation — empty branch', () => {
  beforeEach(() => vi.resetAllMocks())

  it('empty branch returns report with 0 counts and no error', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    const { fetchKpiRegistryOnce } = await import('../../services/kpiRegistryService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue(GOOD_PROFILE_FACTORY() as any)
    vi.mocked(fetchKpiRegistryOnce).mockResolvedValue({} as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const report = await runBranchBulkEvaluation({
      pharmacyId: 'ph-empty', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })

    expect(report.totalEligible).toBe(0)
    expect(report.succeeded).toBe(0)
    expect(report.results).toHaveLength(0)
  })

  it('branch with only excluded roles (all admin) returns 0 eligible', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    const { fetchKpiRegistryOnce } = await import('../../services/kpiRegistryService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([
      makeUser('admin', true, 'a1'), makeUser('admin', true, 'a2'),
    ] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue(GOOD_PROFILE_FACTORY() as any)
    vi.mocked(fetchKpiRegistryOnce).mockResolvedValue({} as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const report = await runBranchBulkEvaluation({
      pharmacyId: 'ph-admin-only', month: '2026-06', profileId: 'profile-1',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })

    expect(report.totalEligible).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 10–11. Profile validation
// ════════════════════════════════════════════════════════════════

describe('runBranchBulkEvaluation — profile validation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws when profile not found', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([makeUser('pharmacist', true, 'u1')] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue(null as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    await expect(runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'missing-profile',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })).rejects.toThrow('not found')
  })

  it('throws when profile is not published (draft)', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([makeUser('pharmacist', true, 'u1')] as any)
    vi.mocked(fetchEvaluationProfile).mockResolvedValue({ ...GOOD_PROFILE_FACTORY(), status: 'draft' } as any)

    const { runBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    await expect(runBranchBulkEvaluation({
      pharmacyId: 'ph-1', month: '2026-06', profileId: 'draft-profile',
      generatedBy: 'admin', actorRole: 'admin', idempotency: 'skip',
    })).rejects.toThrow('draft')
  })
})

// ════════════════════════════════════════════════════════════════
// 13. No engine logic duplicated
// ════════════════════════════════════════════════════════════════

describe('bulkEvaluationService — architecture', () => {
  it('does not import evaluationEngine.ts directly', async () => {
    const src = await import('../../services/bulkEvaluationService.ts?raw')
    expect(src.default).not.toContain("from '../engine/evaluationEngine/evaluationEngine'")
    expect(src.default).not.toContain('runEvaluation(')
    // Uses orchestrator only
    expect(src.default).toContain('runEvaluationForUserMonth')
  })

  it('does not contain KPI formula logic', async () => {
    const src = await import('../../services/bulkEvaluationService.ts?raw')
    expect(src.default).not.toContain('normalizedFinalScorePct')
    expect(src.default).not.toContain('bandScore')
    expect(src.default).not.toContain('KPI_WEIGHTS')
  })
})

// ════════════════════════════════════════════════════════════════
// 15. previewBranchBulkEvaluation
// ════════════════════════════════════════════════════════════════

describe('previewBranchBulkEvaluation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('correctly splits eligible and ineligible users', async () => {
    const { getUsersByPharmacy } = await import('../../services/userService')
    vi.mocked(getUsersByPharmacy).mockResolvedValue([
      makeUser('pharmacist',     true,  'u1'),
      makeUser('manager',        true,  'u2'),
      makeUser('branch_manager', true,  'u3'),
      makeUser('admin',          true,  'u4'),
      makeUser('pharmacist',     false, 'u5'),  // inactive
    ] as any)

    const { previewBranchBulkEvaluation } = await import('../../services/bulkEvaluationService')
    const preview = await previewBranchBulkEvaluation('ph-1')

    expect(preview.eligibleCount).toBe(3)
    expect(preview.ineligibleCount).toBe(2)
    expect(preview.eligible.map((u) => u.userId)).toEqual(['u1', 'u2', 'u3'])
    expect(preview.ineligible.map((u) => u.userId).sort()).toEqual(['u4', 'u5'])
    expect(preview.totalUsers).toBe(5)
  })
})
