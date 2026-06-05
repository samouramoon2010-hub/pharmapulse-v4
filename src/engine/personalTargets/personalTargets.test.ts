// ============================================================
// PT-1 Regression Tests — Personal Targets Foundation
//
// Categories:
//   1. Equal split — correctness and rounding safety
//   2. Custom allocation — build and validate
//   3. Validation — sum enforcement, per-field errors
//   4. Dynamic KPI support — registry-driven, no hardcoding
//   5. Achievement calculation — pure function correctness
//   6. Service layer — CRUD guards and doc ID format
//   7. Firestore rules simulation — access control
//   8. Route and navigation — correct guards applied
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import {
  getAllocatableTargetFields,
  allocateEqual,
  allocateCustom,
  validateCustomAllocation,
  calculatePersonalAchievement,
  calculateAllPersonalAchievements,
} from '../../engine/personalTargets/allocationEngine'
import type { KpiRegistry } from '../../engine/kpiRegistry'
import type { PersonalAllocation } from '../../engine/personalTargets/allocationEngine'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'test-uid' } },
  COL: {
    KPI_ENTRIES: 'kpi_entries', TARGETS: 'targets', USERS: 'users',
    PHARMACIES: 'pharmacies', AUDIT_LOGS: 'audit_logs',
    KPI_REGISTRY: 'kpi_registry', PERSONAL_TARGETS: 'personal_targets',
    NOTIFICATIONS: 'notifications', LEADERBOARD: 'leaderboard',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  deleteDoc:       vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({})),
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Fixtures ──────────────────────────────────────────────────

const USERS = ['uid-alice', 'uid-bob', 'uid-carol']
const PID   = 'pharmacy-001'
const MONTH = '2025-05'

/** Branch target with the five core legacy fields */
const BRANCH: Record<string, number> = {
  wasfatyTarget:   300000,
  omniTarget:      1500,
  wellnessTarget:  900,
  basketTarget:    750,
  crossSellTarget: 600,
}

// ── 1. Equal split ────────────────────────────────────────────

describe('PT-1 — Equal split', () => {
  it('produces one allocation per user', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(allocs).toHaveLength(3)
  })

  it('each allocation has the correct userId, pharmacyId, month', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    allocs.forEach((a, i) => {
      expect(a.userId).toBe(USERS[i])
      expect(a.pharmacyId).toBe(PID)
      expect(a.month).toBe(MONTH)
    })
  })

  it('allocationMethod is "equal"', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    allocs.forEach((a) => expect(a.allocationMethod).toBe('equal'))
  })

  it('sum of personal targets equals branch target for every field', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    fields.forEach((field) => {
      const branchVal = BRANCH[field] ?? 0
      if (branchVal === 0) return
      const total = allocs.reduce((s, a) => s + (a.targets[field] ?? 0), 0)
      expect(total).toBe(branchVal)
    })
  })

  it('300000 / 3 = 100000 each (clean integer split)', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    allocs.forEach((a) => expect(a.targets.wasfatyTarget).toBe(100000))
  })

  it('rounding-safe: 1000 / 3 → 334, 333, 333 (sum = 1000)', () => {
    const b = { wasfatyTarget: 1000 }
    const allocs = allocateEqual(b, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    const vals = allocs.map((a) => a.targets.wasfatyTarget)
    expect(vals[0]).toBe(334)
    expect(vals[1]).toBe(333)
    expect(vals[2]).toBe(333)
    expect(vals.reduce((s, v) => s + v, 0)).toBe(1000)
  })

  it('rounding-safe: 100 / 3 remainder distributed to first users', () => {
    const b = { wasfatyTarget: 100 }
    const allocs = allocateEqual(b, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    const total = allocs.reduce((s, a) => s + a.targets.wasfatyTarget, 0)
    expect(total).toBe(100)
  })

  it('returns empty array when no users', () => {
    const allocs = allocateEqual(BRANCH, [], PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(allocs).toHaveLength(0)
  })

  it('zero branch target → all allocations are zero for that field', () => {
    const b = { wasfatyTarget: 0, omniTarget: 1500 }
    const allocs = allocateEqual(b, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    allocs.forEach((a) => expect(a.targets.wasfatyTarget ?? 0).toBe(0))
  })

  it('single user gets the full branch target', () => {
    const allocs = allocateEqual(BRANCH, ['uid-solo'], PID, MONTH, DEFAULT_KPI_REGISTRY)
    expect(allocs[0].targets.wasfatyTarget).toBe(300000)
  })

  it('fractional target: sum preserved to 2 decimal places', () => {
    // Use a non-integer total that would drift with naive division
    const b = { wasfatyTarget: 100.01 }
    const allocs = allocateEqual(b, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    const total = allocs.reduce((s, a) => s + (a.targets.wasfatyTarget ?? 0), 0)
    expect(Math.abs(total - 100.01)).toBeLessThanOrEqual(0.01)
  })
})

// ── 2. Custom allocation ──────────────────────────────────────

describe('PT-1 — Custom allocation', () => {
  it('builds allocations from provided custom values', () => {
    const custom = {
      'uid-alice': { wasfatyTarget: 120000, omniTarget: 600 },
      'uid-bob':   { wasfatyTarget: 100000, omniTarget: 500 },
      'uid-carol': { wasfatyTarget:  80000, omniTarget: 400 },
    }
    const allocs = allocateCustom(custom, PID, MONTH)
    expect(allocs).toHaveLength(3)
    expect(allocs.find((a) => a.userId === 'uid-alice')?.targets.wasfatyTarget).toBe(120000)
  })

  it('allocationMethod is "custom"', () => {
    const allocs = allocateCustom({ 'uid-a': { wasfatyTarget: 100 } }, PID, MONTH)
    expect(allocs[0].allocationMethod).toBe('custom')
  })

  it('clamps negative values to zero', () => {
    const custom = { 'uid-a': { wasfatyTarget: -5000 } }
    const allocs = allocateCustom(custom, PID, MONTH)
    expect(allocs[0].targets.wasfatyTarget).toBe(0)
  })

  it('non-numeric strings coerce to zero', () => {
    const custom = { 'uid-a': { wasfatyTarget: NaN } }
    const allocs = allocateCustom(custom, PID, MONTH)
    expect(allocs[0].targets.wasfatyTarget).toBe(0)
  })
})

// ── 3. Validation ─────────────────────────────────────────────

describe('PT-1 — Validation', () => {
  it('valid when sums match branch target for all fields', () => {
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    const result = validateCustomAllocation(allocs, BRANCH, DEFAULT_KPI_REGISTRY)
    expect(result.valid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  it('invalid when wasfatyTarget sum does not match', () => {
    const allocs: PersonalAllocation[] = USERS.map((uid) => ({
      userId: uid, pharmacyId: PID, month: MONTH,
      targets: { wasfatyTarget: 99999 }, allocationMethod: 'custom',
    }))
    const result = validateCustomAllocation(allocs, { wasfatyTarget: 300000 }, DEFAULT_KPI_REGISTRY)
    expect(result.valid).toBe(false)
    expect(result.errors.wasfatyTarget).toBeDefined()
  })

  it('error message includes sum and branch target values', () => {
    const allocs: PersonalAllocation[] = [
      { userId: 'u1', pharmacyId: PID, month: MONTH, targets: { wasfatyTarget: 100 }, allocationMethod: 'custom' },
    ]
    const result = validateCustomAllocation(allocs, { wasfatyTarget: 300 }, DEFAULT_KPI_REGISTRY)
    expect(result.errors.wasfatyTarget).toContain('100')
    expect(result.errors.wasfatyTarget).toContain('300')
  })

  it('valid when sum matches within 0.01 epsilon (float safety)', () => {
    const allocs: PersonalAllocation[] = [
      { userId: 'u1', pharmacyId: PID, month: MONTH, targets: { wasfatyTarget: 33.34 }, allocationMethod: 'custom' },
      { userId: 'u2', pharmacyId: PID, month: MONTH, targets: { wasfatyTarget: 33.33 }, allocationMethod: 'custom' },
      { userId: 'u3', pharmacyId: PID, month: MONTH, targets: { wasfatyTarget: 33.33 }, allocationMethod: 'custom' },
    ]
    const result = validateCustomAllocation(allocs, { wasfatyTarget: 33.33 + 33.33 + 33.34 }, DEFAULT_KPI_REGISTRY)
    expect(result.valid).toBe(true)
  })

  it('provides aggregate message on failure', () => {
    const allocs: PersonalAllocation[] = [
      { userId: 'u1', pharmacyId: PID, month: MONTH, targets: { wasfatyTarget: 1 }, allocationMethod: 'custom' },
    ]
    const result = validateCustomAllocation(allocs, { wasfatyTarget: 300000 }, DEFAULT_KPI_REGISTRY)
    expect(result.message).toBeDefined()
  })
})

// ── 4. Dynamic KPI support ────────────────────────────────────

describe('PT-1 — Dynamic KPI support', () => {
  it('getAllocatableTargetFields uses registry, not hardcoded list', () => {
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    expect(Array.isArray(fields)).toBe(true)
    expect(fields.length).toBeGreaterThan(0)
  })

  it('all returned fields end in "Target"', () => {
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    fields.forEach((f) => expect(f.endsWith('Target')).toBe(true))
  })

  it('wasfatyTarget is in the allocatable fields', () => {
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    expect(fields).toContain('wasfatyTarget')
  })

  it('crossSellTarget (not crossSellingTarget) for crossSelling KPI', () => {
    // Verifies TARGET_FIELD_MAP override is respected
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    expect(fields).toContain('crossSellTarget')
    expect(fields).not.toContain('crossSellingTarget')
  })

  it('custom KPI in registry produces its targetFieldName automatically', () => {
    const customRegistry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: {
        key: 'nps', label: 'NPS', shortLabel: 'NPS', labelAr: 'NPS',
        category: 'commercial', valueType: 'percentage', unit: '%', unitAr: '%',
        direction: 'higher_is_better', targetType: 'percentage',
        weight: 0, isActive: true, isCore: false,
        thresholds: { healthy: 80, watch: 60, risk: 40, critical: 20 },
        visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
        sortOrder: 999,
      },
    }
    const fields = getAllocatableTargetFields(customRegistry)
    // 'nps' has no alias → engineKey = 'nps' → targetFieldName = 'npsTarget'
    expect(fields).toContain('npsTarget')
  })

  it('allocateEqual distributes all fields from the live registry', () => {
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    const allocs = allocateEqual(BRANCH, USERS, PID, MONTH, DEFAULT_KPI_REGISTRY)
    // Every field in the registry appears in every allocation
    allocs.forEach((a) => {
      fields.forEach((f) => {
        expect(f in a.targets).toBe(true)
      })
    })
  })

  it('new field in custom registry appears in equal split', () => {
    const customRegistry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      myKpi: {
        key: 'myKpi', label: 'My KPI', shortLabel: 'MyKPI', labelAr: 'كيبي',
        category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
        direction: 'higher_is_better', targetType: 'absolute',
        weight: 0, isActive: true, isCore: false,
        thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
        visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
        sortOrder: 998,
      },
    }
    const b = { ...BRANCH, myKpiTarget: 300 }
    const allocs = allocateEqual(b, USERS, PID, MONTH, customRegistry)
    const total = allocs.reduce((s, a) => s + (a.targets.myKpiTarget ?? 0), 0)
    expect(total).toBe(300)
  })
})

// ── 5. Achievement calculation ────────────────────────────────

describe('PT-1 — calculatePersonalAchievement', () => {
  it('returns correct percentage for normal case', () => {
    expect(calculatePersonalAchievement(100000, 87500)).toBe(87.5)
  })

  it('returns 100 when actual equals target', () => {
    expect(calculatePersonalAchievement(100000, 100000)).toBe(100)
  })

  it('returns >100 when actual exceeds target (overachievement)', () => {
    expect(calculatePersonalAchievement(100, 120)).toBe(120)
  })

  it('returns null when personal target is zero', () => {
    expect(calculatePersonalAchievement(0, 5000)).toBeNull()
  })

  it('returns null when personal target is negative', () => {
    expect(calculatePersonalAchievement(-1, 5000)).toBeNull()
  })

  it('returns null when personal target is undefined/null', () => {
    expect(calculatePersonalAchievement(undefined as unknown as number, 5000)).toBeNull()
    expect(calculatePersonalAchievement(null as unknown as number, 5000)).toBeNull()
  })

  it('rounds to 1 decimal place', () => {
    expect(calculatePersonalAchievement(3, 1)).toBe(33.3)
  })

  it('returns 0 when actual is zero', () => {
    expect(calculatePersonalAchievement(100000, 0)).toBe(0)
  })
})

describe('PT-1 — calculateAllPersonalAchievements', () => {
  it('calculates achievement for all registry KPIs', () => {
    const personalTargets = { wasfatyTarget: 100000, omniTarget: 500 }
    const actual          = { wasfaty: 80000, omni: 400 }
    const result = calculateAllPersonalAchievements(
      personalTargets, actual, DEFAULT_KPI_REGISTRY
    )
    expect(result.wasfatyTarget).toBe(80)
    expect(result.omniTarget).toBe(80)
  })

  it('returns null for KPIs with zero personal target', () => {
    const personalTargets = { wasfatyTarget: 0 }
    const actual          = { wasfaty: 5000 }
    const result = calculateAllPersonalAchievements(
      personalTargets, actual, DEFAULT_KPI_REGISTRY
    )
    expect(result.wasfatyTarget).toBeNull()
  })
})

// ── 6. Service layer ──────────────────────────────────────────

describe('PT-1 — personalTargetService', () => {
  beforeEach(() => vi.resetAllMocks())

  it('savePersonalTarget writes to COL.PERSONAL_TARGETS', async () => {
    const { setDoc, getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
    const { savePersonalTarget } = await import('../../services/personalTargetService')
    const alloc: PersonalAllocation = {
      userId: 'u1', pharmacyId: 'ph-1', month: '2025-05',
      targets: { wasfatyTarget: 100000 }, allocationMethod: 'equal',
    }
    await savePersonalTarget(alloc, 'admin-uid', 'admin')
    expect(setDoc).toHaveBeenCalledTimes(1)
  })

  it('doc ID format is userId_pharmacyId_month', async () => {
    const { doc } = await import('firebase/firestore')
    vi.mocked(doc).mockImplementation((_db, _col, id) => ({ _id: id }) as any)
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
    const { savePersonalTarget } = await import('../../services/personalTargetService')
    await savePersonalTarget(
      { userId: 'u1', pharmacyId: 'ph-1', month: '2025-05', targets: {}, allocationMethod: 'equal' },
      'admin', 'admin'
    )
    const docCalls = vi.mocked(doc).mock.calls
    const personalTargetCall = docCalls.find((c) => String(c[2]).includes('u1_ph-1_2025-05'))
    expect(personalTargetCall).toBeDefined()
  })

  it('saveBranchPersonalTargets calls savePersonalTarget for each allocation', async () => {
    const { setDoc, getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)
    const { saveBranchPersonalTargets } = await import('../../services/personalTargetService')
    const allocs: PersonalAllocation[] = USERS.map((uid) => ({
      userId: uid, pharmacyId: PID, month: MONTH,
      targets: { wasfatyTarget: 100000 }, allocationMethod: 'equal',
    }))
    await saveBranchPersonalTargets(allocs, 'admin', 'admin')
    expect(setDoc).toHaveBeenCalledTimes(3)
  })

  it('deletePersonalTarget calls deleteDoc', async () => {
    const { deleteDoc, getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({}) } as any)
    const { deletePersonalTarget } = await import('../../services/personalTargetService')
    await deletePersonalTarget('u1', PID, MONTH, 'admin', 'admin')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })
})

// ── 7. Firestore rules simulation ─────────────────────────────

describe('PT-1 — Firestore rules access control simulation', () => {
  function canRead(role: string, targetPharmacyId: string, targetUserId: string, callerPharmacyId: string, callerUid: string): boolean {
    const isAdmin = role === 'admin'
    const isMgr   = ['admin', 'manager', 'branch_manager'].includes(role)
    return isAdmin
      || (isMgr && targetPharmacyId === callerPharmacyId)
      || targetUserId === callerUid
  }

  function canWrite(role: string, targetPharmacyId: string, callerPharmacyId: string): boolean {
    const isAdmin = role === 'admin'
    const isMgr   = ['admin', 'manager', 'branch_manager'].includes(role)
    return isAdmin || (isMgr && targetPharmacyId === callerPharmacyId)
  }

  it('admin can read any personal target', () => {
    expect(canRead('admin', 'ph-999', 'u-999', 'ph-000', 'uid-admin')).toBe(true)
  })

  it('manager can read own-branch personal targets', () => {
    expect(canRead('manager', 'ph-001', 'u-other', 'ph-001', 'uid-mgr')).toBe(true)
  })

  it('manager cannot read another-branch personal targets', () => {
    expect(canRead('manager', 'ph-999', 'u-other', 'ph-001', 'uid-mgr')).toBe(false)
  })

  it('branch_manager behaves identically to manager', () => {
    expect(canRead('branch_manager', 'ph-001', 'u-other', 'ph-001', 'uid-bm')).toBe(true)
    expect(canRead('branch_manager', 'ph-999', 'u-other', 'ph-001', 'uid-bm')).toBe(false)
  })

  it('pharmacist can read only their own personal target', () => {
    expect(canRead('pharmacist', 'ph-001', 'uid-ph', 'ph-001', 'uid-ph')).toBe(true)
    expect(canRead('pharmacist', 'ph-001', 'uid-other', 'ph-001', 'uid-ph')).toBe(false)
  })

  it('pharmacist cannot write (create/update/delete)', () => {
    expect(canWrite('pharmacist', 'ph-001', 'ph-001')).toBe(false)
  })

  it('district_supervisor cannot write in PT-1', () => {
    expect(canWrite('district_supervisor', 'ph-001', 'ph-001')).toBe(false)
  })

  it('regional_manager cannot write in PT-1', () => {
    expect(canWrite('regional_manager', 'ph-001', 'ph-001')).toBe(false)
  })

  it('admin can write to any branch', () => {
    expect(canWrite('admin', 'ph-999', 'ph-000')).toBe(true)
  })

  it('manager can write only to own branch', () => {
    expect(canWrite('manager', 'ph-001', 'ph-001')).toBe(true)
    expect(canWrite('manager', 'ph-999', 'ph-001')).toBe(false)
  })

  it('firestore.rules source contains personal_targets collection rule', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('personal_targets')
  })

  it('personal_targets rules include isMgr and pharmacyId == pharmId() guard', async () => {
    const src = await import('../../../firestore.rules?raw')
    const rulesText = src.default
    const ptBlock = rulesText.match(/match \/personal_targets\/\{docId\} \{[\s\S]+?\}/)?.[0] ?? ''
    expect(ptBlock).toContain('isMgr()')
    expect(ptBlock).toContain('pharmId()')
  })

  it('personal_targets rule allows pharmacist to read own target', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('resource.data.userId == uid()')
  })
})

// ── 8. Route and navigation ───────────────────────────────────

describe('PT-1 — Route and navigation', () => {
  it('App.jsx contains /personal-targets route', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).toContain('/personal-targets')
  })

  it('/personal-targets is gated to MGR_UP (not ADMIN-only)', async () => {
    const src = await import('../../App.jsx?raw')
    const line = src.default.split('\n').find((l) => l.includes('/personal-targets'))
    expect(line).toContain('MGR_UP')
    expect(line).not.toContain('ADMIN')
  })

  it('Sidebar contains Personal Targets for both admin and manager nav', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    // Count occurrences
    const matches = (src.default.match(/Personal Targets/g) || []).length
    expect(matches).toBeGreaterThanOrEqual(2)
  })

  it('No ranking, evaluation execution, or coaching routes added', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).not.toContain('/ranking')
    // /admin/evaluation-registry is the admin registry page (ER-0), not execution
    expect(src.default).not.toContain('/evaluation-dashboard')
    expect(src.default).not.toContain('/evaluation-results')
    expect(src.default).not.toContain('/coaching')
  })

  it('COL.PERSONAL_TARGETS is defined', async () => {
    const { COL } = await import('../../services/firebase')
    expect(COL.PERSONAL_TARGETS).toBe('personal_targets')
  })
})
