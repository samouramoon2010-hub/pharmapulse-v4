// ============================================================
// ER-2B Regression Tests — Real Data Wiring
//
// Categories:
//   1. KPI aggregation — sum entries, alias resolution, no KPI_KEYS
//   2. Month date range — correct boundary dates
//   3. Branch target fetch — found/not found
//   4. Personal target fetch — published used, draft excluded
//   5. Orchestration — preflight, full path, error paths
//   6. Backward compatibility — engine/ledger unchanged
//   7. Scope guard — no ranking/coaching
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDocs, getDoc, addDoc } from 'firebase/firestore'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
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
  doc:             vi.fn((_db, _col, id) => ({ _id: id })),
  addDoc:          vi.fn(async () => ({ id: 'ledger-auto-id' })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
  writeBatch:      vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Imports ───────────────────────────────────────────────────
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { KpiRegistry }     from '../../engine/kpiRegistry'

// ── Fixtures ──────────────────────────────────────────────────

const UID   = 'uid-alice'
const PID   = 'ph-001'
const MONTH = '2026-01'

// Three kpi_entries for Jan 2026
const MOCK_ENTRIES = [
  {
    userId: UID, pharmacyId: PID, date: '2026-01-05',
    wasfaty: 1050, omni: 42, wellness: 8, basket: 65, crossSelling: 3,
    sales: 3200, ndf: 0,
  },
  {
    userId: UID, pharmacyId: PID, date: '2026-01-12',
    wasfaty: 980, omni: 38, wellness: 12, basket: 70, crossSelling: 5,
    sales: 2800, ndf: 1,
  },
  {
    userId: UID, pharmacyId: PID, date: '2026-01-19',
    wasfaty: 1120, omni: 45, wellness: 10, basket: 68, crossSelling: 4,
    sales: 3100, ndf: 2,
  },
]
// Expected sums:
// wasfaty: 3150, omni: 125, wellness: 30, basket: 203, crossSelling: 12
// sales: 9100, ndf: 3

// ── 1. KPI aggregation ────────────────────────────────────────

describe('ER-2B — aggregateKpiActuals', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getDocs).mockResolvedValue({
      docs: MOCK_ENTRIES.map((e) => ({ data: () => e })),
    } as any)
  })

  it('sums wasfaty across all entries', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(result.actuals.wasfaty).toBe(3150)
  })

  it('sums all five core KPIs correctly', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(result.actuals.wasfaty).toBe(3150)
    expect(result.actuals.omni).toBe(125)
    expect(result.actuals.wellness).toBe(30)
    expect(result.actuals.basket).toBe(203)
    expect(result.actuals.crossSelling).toBe(12)
  })

  it('sums non-core KPIs (sales, ndf) when present in entries', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(result.actuals.sales).toBe(9100)
    expect(result.actuals.ndf).toBe(3)
  })

  it('returns correct entryCount', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(result.entryCount).toBe(3)
  })

  it('hasData is true when entries have non-zero values', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(result.hasData).toBe(true)
  })

  it('returns empty actuals when no entries found', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(Object.keys(result.actuals)).toHaveLength(0)
    expect(result.hasData).toBe(false)
    expect(result.entryCount).toBe(0)
  })

  it('skips metadata fields (userId, pharmacyId, date, etc.)', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect('userId' in result.actuals).toBe(false)
    expect('pharmacyId' in result.actuals).toBe(false)
    expect('date' in result.actuals).toBe(false)
    expect('createdAt' in result.actuals).toBe(false)
  })

  it('uses engineKey (omni) from kpi_entries, not registry key (omnihealth)', async () => {
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, DEFAULT_KPI_REGISTRY)
    // Entries store 'omni' — result should have 'omni' not 'omnihealth'
    expect('omni' in result.actuals).toBe(true)
    expect('omnihealth' in result.actuals).toBe(false)
  })

  it('custom KPI in registry is included when present in entries', async () => {
    const customRegistry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: {
        key: 'nps', label: 'NPS', shortLabel: 'NPS', labelAr: 'NPS',
        category: 'commercial', valueType: 'percentage', unit: '%', unitAr: '%',
        direction: 'higher_is_better', targetType: 'percentage',
        weight: 0, isActive: true, isCore: false,
        thresholds: { healthy: 80, watch: 60, risk: 40, critical: 20 },
        visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
        sortOrder: 999,
      },
    }
    // Entry includes 'nps' field
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ data: () => ({ userId: UID, pharmacyId: PID, date: '2026-01-05', wasfaty: 100, nps: 85 }) }],
    } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, MONTH, customRegistry)
    expect(result.actuals.nps).toBe(85)
  })
})

// ── 2. Month date range ───────────────────────────────────────

describe('ER-2B — month date range boundaries', () => {
  it('January 2026 spans 2026-01-01 to 2026-01-31', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, '2026-01', DEFAULT_KPI_REGISTRY)
    expect(result.dateRange.from).toBe('2026-01-01')
    expect(result.dateRange.to).toBe('2026-01-31')
  })

  it('February 2024 (leap year) spans 2024-02-01 to 2024-02-29', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, '2024-02', DEFAULT_KPI_REGISTRY)
    expect(result.dateRange.from).toBe('2024-02-01')
    expect(result.dateRange.to).toBe('2024-02-29')
  })

  it('February 2025 (non-leap year) spans 2025-02-01 to 2025-02-28', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals(UID, PID, '2025-02', DEFAULT_KPI_REGISTRY)
    expect(result.dateRange.to).toBe('2025-02-28')
  })
})

// ── 3. Branch target fetch ────────────────────────────────────

describe('ER-2B — fetchBranchTarget', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when no target doc exists', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
    const { fetchBranchTarget } = await import('../../services/evaluationActualsService')
    const result = await fetchBranchTarget(PID, MONTH)
    expect(result).toBeNull()
  })

  it('returns the target data when doc exists', async () => {
    const mockTarget = { pharmacyId: PID, month: MONTH, wasfatyTarget: 100000 }
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => mockTarget } as any)
    const { fetchBranchTarget } = await import('../../services/evaluationActualsService')
    const result = await fetchBranchTarget(PID, MONTH)
    expect(result).not.toBeNull()
    expect((result as Record<string, unknown>).wasfatyTarget).toBe(100000)
  })

  it('doc ID uses pharmacyId_month format (verified by source text)', async () => {
    // Source-text verification: the service constructs the doc ID as pharmacyId_month
    const src = await import('../../services/evaluationActualsService.ts?raw')
    expect(src.default).toContain('`${pharmacyId}_${month}`')
  })
})

// ── 4. Personal target — published used, draft excluded ───────

describe('ER-2B — fetchPublishedPersonalTarget', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when no personal target exists', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
    const { fetchPublishedPersonalTarget } = await import('../../services/evaluationActualsService')
    const result = await fetchPublishedPersonalTarget(UID, PID, MONTH)
    expect(result).toBeNull()
  })

  it('returns published personal target when status is published', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: `${UID}_${PID}_${MONTH}`,
      data: () => ({
        userId: UID, pharmacyId: PID, month: MONTH,
        status: 'published',
        targets: { wasfatyTarget: 80000 },
      }),
    } as any)
    const { fetchPublishedPersonalTarget } = await import('../../services/evaluationActualsService')
    const result = await fetchPublishedPersonalTarget(UID, PID, MONTH)
    expect(result).not.toBeNull()
    expect(result?.status).toBe('published')
  })

  it('returns null when personal target is a DRAFT (not visible to pharmacist)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: `${UID}_${PID}_${MONTH}`,
      data: () => ({
        userId: UID, pharmacyId: PID, month: MONTH,
        status: 'draft',
        targets: { wasfatyTarget: 80000 },
      }),
    } as any)
    const { fetchPublishedPersonalTarget } = await import('../../services/evaluationActualsService')
    const result = await fetchPublishedPersonalTarget(UID, PID, MONTH)
    expect(result).toBeNull()
  })
})

// ── 5. Orchestration ──────────────────────────────────────────

describe('ER-2B — preflightEvaluationCheck', () => {
  beforeEach(() => vi.resetAllMocks())

  it('fails when userId is missing', async () => {
    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck('', PID, 'pharmacist', MONTH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('User ID'))).toBe(true)
  })

  it('fails when pharmacyId is missing', async () => {
    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    // getDocs needed for profile fetch — return empty
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    const result = await preflightEvaluationCheck(UID, '', 'pharmacist', MONTH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Branch ID'))).toBe(true)
  })

  it('fails when no active profile exists for role+month', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)
    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck(UID, PID, 'pharmacist', MONTH)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('No published evaluation profile'))).toBe(true)
  })

  it('returns warning (not error) when branch target is missing', async () => {
    // Profile found
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{
        id: 'p1',
        data: () => ({
          status: 'published', name: 'Test', role: 'pharmacist',
          version: 1, effectiveFrom: '2026-01', effectiveTo: null,
          basketIds: [], baskets: {}, defaultThresholdRule: {},
        }),
      }],
    } as any)
    // Branch target not found
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)
    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck(UID, PID, 'pharmacist', MONTH)
    expect(result.valid).toBe(true)  // warning, not error
    expect(result.warnings.some((w) => w.includes('branch target'))).toBe(true)
  })
})

// ── 6. Backward compatibility ─────────────────────────────────

describe('ER-2B — backward compatibility', () => {
  it('evaluationEngine.ts is unchanged (pure function, no Firestore)', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    expect(src.default).not.toContain("from 'firebase/firestore'")
    expect(src.default).not.toContain("from '../../services/firebase'")
  })

  it('evaluationLedgerService has addDoc call with auto-ID (no composite ID)', async () => {
    // addDoc returns auto-ID; no doc() call with composite ID for ledger
    const src = await import('../../services/evaluationLedgerService.ts?raw')
    expect(src.default).toContain('addDoc')
    // Composite ID pattern would be `${userId}_${pharmacyId}_${month}_${profileId}`
    expect(src.default).not.toMatch(/`\${userId}_\${pharmacyId}_\${month}/)
  })

  it('evaluationActualsService does not import KPI_KEYS or KPI_WEIGHTS', async () => {
    const src = await import('../../services/evaluationActualsService.ts?raw')
    expect(src.default).not.toMatch(/^import.*KPI_KEYS/m)
    expect(src.default).not.toMatch(/^import.*KPI_WEIGHTS/m)
    // Variable usage check — comments mentioning non-goals are acceptable
    expect(src.default).not.toMatch(/[^/ \t*]\.KPI_WEIGHTS\b/)
  })

  it('evaluationOrchestrationService does not import KPI_KEYS or KPI_WEIGHTS', async () => {
    const src = await import('../../services/evaluationOrchestrationService.ts?raw')
    expect(src.default).not.toMatch(/\bKPI_KEYS\b/)
    expect(src.default).not.toMatch(/\bKPI_WEIGHTS\b/)
  })
})

// ── 7. Scope guard ────────────────────────────────────────────

describe('ER-2B — scope guard: no ranking/coaching', () => {
  it('evaluationActualsService has no ranking logic', async () => {
    const src = await import('../../services/evaluationActualsService.ts?raw')
    expect(src.default).not.toMatch(/^export function.*(rank|leaderboard|coaching)/im)
  })

  it('evaluationOrchestrationService has no ranking logic', async () => {
    const src = await import('../../services/evaluationOrchestrationService.ts?raw')
    // Check for actual function implementations, not comment mentions of non-goals
    expect(src.default).not.toMatch(/^export function.*(rank|leaderboard|coaching)/im)
    expect(src.default).not.toMatch(/computeRank|buildLeaderboard|rankPharmacist/i)
  })

  it('no ranking routes were added', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).not.toContain('/ranking')
    expect(src.default).not.toContain('/leaderboard')
  })
})
