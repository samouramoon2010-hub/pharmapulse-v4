// ============================================================
// Secure kpi_entries Rules + KPI Mapping — Regression Tests
//
// Task 1: permanent secure rules verified (no isAuth() remnant)
// Task 2: no diagnostic code in source files
// Task 3: KPI alias mapping correct end-to-end
//   omnihealth → engineKey 'omni' → entry field 'omni'  ✓
//   wellnessCard → engineKey 'wellness' → entry field 'wellness'  ✓
//   crossSelling → engineKey 'crossSelling' → entry field 'crossSelling'  ✓
//   basket → engineKey 'basket' → entry field 'basket' (requires data entry)
//   Missing basket/sl/ndf/inbody are data gaps, not code bugs
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDocs } from 'firebase/firestore'
import { DEFAULT_KPI_REGISTRY }          from '../../engine/kpiRegistry'
import { buildAllowedEntryKeys }          from '../../services/kpiRegistryLogic'

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: '0C8hPmFvHRXp2sst2k41DBe3uV72' } },
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
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn((...args) => args[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  deleteDoc:       vi.fn(async () => {}),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))
vi.mock('../../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

// ── Rule simulation ───────────────────────────────────────────

type SimUser = { uid: string; role: string; pharmacyId: string | null }
type SimPayload = { userId: string; pharmacyId: string }
type SimDoc = { userId: string; pharmacyId: string } | null

const isMgr  = (u: SimUser) => ['admin','manager','branch_manager'].includes(u.role)
const isAdmin = (u: SimUser) => u.role === 'admin'
const pharmId = (u: SimUser) => u.pharmacyId

const isOwnData     = (u: SimUser, p: SimPayload) => p.userId === u.uid
const isOwnPharmacy = (u: SimUser, p: SimPayload) =>
  p.pharmacyId === pharmId(u) || isAdmin(u)
const ownsPharmacy  = (u: SimUser, pid: string | null) =>
  isAdmin(u) || (isMgr(u) && pharmId(u) === pid)

const canCreate = (u: SimUser, p: SimPayload) =>
  isOwnData(u, p) && (isOwnPharmacy(u, p) || isMgr(u))

const canUpdate = (u: SimUser, p: SimPayload, existing: SimDoc) =>
  !!(
    (existing?.userId === u.uid && isOwnData(u, p)) ||
    ownsPharmacy(u, existing?.pharmacyId ?? null)
  )

// ── 1. Permanent secure rules ─────────────────────────────────

describe('Permanent secure kpi_entries rules', () => {
  it('manager can create own entry', () => {
    const u: SimUser = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: '0C8h', pharmacyId: 'OuPy4' }
    expect(canCreate(u, p)).toBe(true)
  })

  it('branch_manager can create own entry', () => {
    const u: SimUser = { uid: 'bm-uid', role: 'branch_manager', pharmacyId: 'ph-abc' }
    const p: SimPayload = { userId: 'bm-uid', pharmacyId: 'ph-abc' }
    expect(canCreate(u, p)).toBe(true)
  })

  it('pharmacist with matching pharmacy can create', () => {
    const u: SimUser = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: 'ph-uid', pharmacyId: 'OuPy4' }
    expect(canCreate(u, p)).toBe(true)
  })

  it('manager CANNOT create entry for another user', () => {
    const u: SimUser = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: 'OTHER-UID', pharmacyId: 'OuPy4' }
    expect(canCreate(u, p)).toBe(false)
  })

  it('pharmacist CANNOT create for another user', () => {
    const u: SimUser = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: 'OTHER', pharmacyId: 'OuPy4' }
    expect(canCreate(u, p)).toBe(false)
  })

  it('pharmacist CANNOT create for wrong pharmacy', () => {
    const u: SimUser = { uid: 'ph-uid', role: 'pharmacist', pharmacyId: 'MY-PH' }
    const p: SimPayload = { userId: 'ph-uid', pharmacyId: 'OTHER-PH' }
    // isMgr fails, isOwnPharmacy fails
    expect(canCreate(u, p)).toBe(false)
  })

  it('manager with null pharmacyId still allowed via isMgr()', () => {
    const u: SimUser = { uid: '0C8h', role: 'manager', pharmacyId: null }
    const p: SimPayload = { userId: '0C8h', pharmacyId: 'OuPy4' }
    expect(canCreate(u, p)).toBe(true)
  })
})

describe('Permanent secure kpi_entries update rules', () => {
  it('user can update their own entry', () => {
    const u: SimUser = { uid: '0C8h', role: 'manager', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: '0C8h', pharmacyId: 'OuPy4' }
    const existing: SimDoc = { userId: '0C8h', pharmacyId: 'OuPy4' }
    expect(canUpdate(u, p, existing)).toBe(true)
  })

  it('manager can update any entry at their branch', () => {
    const u: SimUser = { uid: 'mgr', role: 'manager', pharmacyId: 'OuPy4' }
    const p: SimPayload = { userId: 'ph-uid', pharmacyId: 'OuPy4' }
    const existing: SimDoc = { userId: 'ph-uid', pharmacyId: 'OuPy4' }
    expect(canUpdate(u, p, existing)).toBe(true)
  })

  it('manager CANNOT update entry at different branch', () => {
    const u: SimUser = { uid: 'mgr', role: 'manager', pharmacyId: 'MY-PH' }
    const p: SimPayload = { userId: 'ph-uid', pharmacyId: 'OTHER-PH' }
    const existing: SimDoc = { userId: 'ph-uid', pharmacyId: 'OTHER-PH' }
    expect(canUpdate(u, p, existing)).toBe(false)
  })

  it('no isAuth() diagnostic rule remains in production rules', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    // No bare isAuth() on any operation
    expect(block).not.toMatch(/allow (create|update|read|delete):\s*if\s*isAuth\(\)\s*;/)
  })

  it('no specific UID bypass remains in rules', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).not.toContain('0C8hPmFvHRXp2sst2k41DBe3uV72')
  })
})

// ── 2. KPI alias mapping ──────────────────────────────────────

describe('KPI alias mapping — aggregation → engine', () => {
  it('omni entry field resolves to omnihealth in engine via engineKey=omni', () => {
    const kpi = DEFAULT_KPI_REGISTRY['omnihealth']
    expect(kpi).toBeDefined()
    expect(kpi.aliasFor).toBe('omni')
    // Entry stores 'omni', engine reads kpiActuals['omni'] ✓
    const engineKey = kpi.aliasFor ?? kpi.key
    expect(engineKey).toBe('omni')
  })

  it('wellness entry field resolves to wellnessCard in engine via engineKey=wellness', () => {
    const kpi = DEFAULT_KPI_REGISTRY['wellnessCard']
    expect(kpi.aliasFor).toBe('wellness')
    const engineKey = kpi.aliasFor ?? kpi.key
    expect(engineKey).toBe('wellness')
  })

  it('crossSelling has no alias — engineKey is crossSelling (same as entry field)', () => {
    const kpi = DEFAULT_KPI_REGISTRY['crossSelling']
    expect(kpi.aliasFor).toBeUndefined()
    const engineKey = kpi.aliasFor ?? kpi.key
    expect(engineKey).toBe('crossSelling')
  })

  it('basket has no alias — engineKey is basket (same as entry field)', () => {
    const kpi = DEFAULT_KPI_REGISTRY['basket']
    expect(kpi.aliasFor).toBeUndefined()
    const engineKey = kpi.aliasFor ?? kpi.key
    expect(engineKey).toBe('basket')
  })

  it('buildAllowedEntryKeys includes all expected engine keys', () => {
    const allowed = buildAllowedEntryKeys(DEFAULT_KPI_REGISTRY)
    expect(allowed.has('wasfaty')).toBe(true)
    expect(allowed.has('omni')).toBe(true)       // omnihealth alias
    expect(allowed.has('wellness')).toBe(true)   // wellnessCard alias
    expect(allowed.has('basket')).toBe(true)
    expect(allowed.has('crossSelling')).toBe(true)
    // Original registry keys are NOT in allowedKeys (they use engine keys)
    expect(allowed.has('omnihealth')).toBe(false)
    expect(allowed.has('wellnessCard')).toBe(false)
  })
})

describe('KPI aggregation — resolves correctly from entry fields', () => {
  beforeEach(() => vi.resetAllMocks())

  it('crossSelling from entry is found in kpiActuals', async () => {
    // Entry with crossSelling = 50
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{
        id:   'uid_ph_2026-06-04',
        data: () => ({
          userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04',
          wasfaty: 8500, omni: 42, wellness: 6, crossSelling: 50,
        }),
      }],
    } as any)

    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals('0C8h', 'OuPy4', '2026-06', DEFAULT_KPI_REGISTRY)
    expect(result.actuals['crossSelling']).toBe(50)
    expect(result.actuals['omni']).toBe(42)
    expect(result.actuals['wellness']).toBe(6)
    expect(result.actuals['wasfaty']).toBe(8500)
  })

  it('omni entry field lands as kpiActuals["omni"] — engine finds it via omnihealth alias', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ id: 'e1', data: () => ({ userId: 'u', pharmacyId: 'p', date: '2026-06-01', omni: 21 }) }],
    } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals('u', 'p', '2026-06', DEFAULT_KPI_REGISTRY)
    // aggregation stores as 'omni' — engine resolves omnihealth.aliasFor='omni' → reads 'omni'
    expect(result.actuals['omni']).toBe(21)
    expect(result.actuals['omnihealth']).toBeUndefined()
  })

  it('wellness entry field lands as kpiActuals["wellness"]', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ id: 'e1', data: () => ({ userId: 'u', pharmacyId: 'p', date: '2026-06-01', wellness: 4900 }) }],
    } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals('u', 'p', '2026-06', DEFAULT_KPI_REGISTRY)
    expect(result.actuals['wellness']).toBe(4900)
    expect(result.actuals['wellnessCard']).toBeUndefined()
  })

  it('missing basket is a DATA gap not a mapping bug — actuals has no basket key', async () => {
    // Entry without basket (manager only entered core 4)
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{
        id: 'e1',
        data: () => ({
          userId: '0C8h', pharmacyId: 'OuPy4', date: '2026-06-04',
          wasfaty: 8500, omni: 42, wellness: 6, crossSelling: 50,
          // basket: not entered
        }),
      }],
    } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals('0C8h', 'OuPy4', '2026-06', DEFAULT_KPI_REGISTRY)
    expect(result.actuals['basket']).toBeUndefined()
    // The engine will report 'basket' in missingKpis — this is correct behaviour
  })

  it('two entries accumulate correctly', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: 'e1', data: () => ({ userId: 'u', pharmacyId: 'p', date: '2026-06-01', wasfaty: 100, omni: 10 }) },
        { id: 'e2', data: () => ({ userId: 'u', pharmacyId: 'p', date: '2026-06-02', wasfaty: 150, omni: 12 }) },
      ],
    } as any)
    const { aggregateKpiActuals } = await import('../../services/evaluationActualsService')
    const result = await aggregateKpiActuals('u', 'p', '2026-06', DEFAULT_KPI_REGISTRY)
    expect(result.actuals['wasfaty']).toBe(250)
    expect(result.actuals['omni']).toBe(22)
    expect(result.entryCount).toBe(2)
    expect(result.hasData).toBe(true)
  })
})

// ── 3. No diagnostic code remaining ──────────────────────────

describe('Clean state — no diagnostic code', () => {
  it('evaluationActualsService has no console.debug', async () => {
    const src = await import('../../services/evaluationActualsService.ts?raw')
    expect(src.default).not.toContain('console.debug')
    expect(src.default).not.toContain('DIAGNOSTIC')
  })

  it('DashboardPage has no diagnostic console.debug blocks', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain('data source trace')
    expect(src.default).not.toContain('DIAGNOSTIC')
  })

  it('ReportsPage has no diagnostic console.debug blocks', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    expect(src.default).not.toContain('fetchedEntries breakdown')
    expect(src.default).not.toContain('DIAGNOSTIC')
  })
})
