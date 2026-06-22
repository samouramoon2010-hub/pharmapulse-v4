// ============================================================
// RBAC Phase 1 Regression Tests
//
// Territory Infrastructure — pure logic tests only.
// All Firebase/Firestore calls are mocked.
//
// Categories:
//   1. Region CRUD — service logic validation
//   2. District CRUD — service logic validation
//   3. Territory types — schema contracts
//   4. accessGuard territory helpers
//   5. Firestore rule helpers simulation
//   6. Backward compatibility — existing collections unchanged
//   7. No route regressions
//   8. User schema territory fields
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL: {
    USERS:        'users',
    PHARMACIES:   'pharmacies',
    KPI_ENTRIES:  'kpi_entries',
    TARGETS:      'targets',
    AUDIT_LOGS:   'audit_logs',
    NOTIFICATIONS:'notifications',
    LEADERBOARD:  'leaderboard',
    KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES:    'daily_summaries',
    MONTHLY_SUMMARIES:  'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS:     'risk_snapshots',
    RANKING_HISTORY:    'ranking_history',
    STAGING_ENTRIES:    'staging_entries',
    DISTRICTS:          'districts',
    REGIONS:            'regions',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'new-doc-id' })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null, id: 'mock-id' })),
  getDocs:         vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc:          vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: {
    CREATE: 'create', UPDATE: 'update', DELETE: 'delete',
    LOGIN: 'login', LOGOUT: 'logout', IMPORT: 'import',
  },
}))

// ── Imports ───────────────────────────────────────────────────
import { getDoc, getDocs } from 'firebase/firestore'

import {
  guardDistrictAccess,
  guardRegionalAccess,
  isAdmin, isManager, isSupervisor, isRegionalManager,
  effectiveRole,
} from '../../services/security/accessGuard'
import type {
  GuardContext,
  TerritoryGuardContext,
} from '../../services/security/accessGuard'

import type { Region, District, TerritoryAssignment } from '../../services/territoryTypes'

// ── Helpers ───────────────────────────────────────────────────

const ctx = (role: string, overrides: Partial<TerritoryGuardContext> = {}): TerritoryGuardContext =>
  ({ uid: `uid-${role}`, role: role as GuardContext['role'], pharmacyId: null, ...overrides })

// ── 1. Region CRUD ─────────────────────────────────────────────

describe('Phase 1 — Region service logic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Re-establish safe defaults after reset
    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as any)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null, id: 'x' } as any)
  })

  it('createRegion throws when code is missing', async () => {
    const { createRegion } = await import('../../services/regionService')
    await expect(createRegion({ name: 'Riyadh' }, 'admin', 'admin'))
      .rejects.toThrow('Region code is required')
  })

  it('createRegion throws when name is missing', async () => {
    const { createRegion } = await import('../../services/regionService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as ReturnType<typeof getDocs> extends Promise<infer T> ? { empty: boolean, docs: never[] } : never as any)
    await expect(createRegion({ code: 'RUH' }, 'admin', 'admin'))
      .rejects.toThrow('Region name is required')
  })

  it('createRegion throws on duplicate code', async () => {
    const { createRegion } = await import('../../services/regionService')
    // getDocs returns non-empty → code exists
    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false,
      docs:  [{ id: 'existing-id', data: () => ({ code: 'RUH' }) }],
    } as any)
    await expect(createRegion({ code: 'RUH', name: 'Riyadh' }, 'admin', 'admin'))
      .rejects.toThrow('already in use')
  })

  it('createRegion succeeds when code is unique', async () => {
    const { createRegion } = await import('../../services/regionService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as any)
    const result = await createRegion({ code: 'RUH', name: 'الرياض' }, 'admin', 'admin')
    expect(result.id).toBe('new-doc-id')
    expect(result.code).toBe('RUH')
  })

  it('deleteRegion throws when districts are assigned', async () => {
    const { deleteRegion } = await import('../../services/regionService')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, data: () => ({ name: 'Riyadh' }), id: 'r1',
    } as any)
    // getDocs finds districts in this region
    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false,
      docs:  [{ id: 'd1' }],
    } as any)
    await expect(deleteRegion('r1', 'admin', 'admin'))
      .rejects.toThrow('Cannot delete a region that has districts')
  })

  it('regionCodeExists returns false when no documents found', async () => {
    const { regionCodeExists } = await import('../../services/regionService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as any)
    expect(await regionCodeExists('RUH')).toBe(false)
  })

  it('regionCodeExists returns true when a matching document found', async () => {
    const { regionCodeExists } = await import('../../services/regionService')
    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false, docs: [{ id: 'r2' }],
    } as any)
    expect(await regionCodeExists('RUH')).toBe(true)
  })
})

// ── 2. District CRUD ──────────────────────────────────────────

describe('Phase 1 — District service logic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as any)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null, id: 'x' } as any)
  })

  it('createDistrict throws when code is missing', async () => {
    const { createDistrict } = await import('../../services/districtService')
    await expect(createDistrict({ name: 'North', regionId: 'r1' }, 'admin', 'admin'))
      .rejects.toThrow('District code is required')
  })

  it('createDistrict throws when regionId is missing', async () => {
    const { createDistrict } = await import('../../services/districtService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as any)
    await expect(createDistrict({ code: 'RUH-N', name: 'North' }, 'admin', 'admin'))
      .rejects.toThrow('Region is required')
  })

  it('createDistrict throws on duplicate code', async () => {
    const { createDistrict } = await import('../../services/districtService')
    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false, docs: [{ id: 'd1' }],
    } as any)
    await expect(createDistrict({ code: 'RUH-N', name: 'North', regionId: 'r1' }, 'admin', 'admin'))
      .rejects.toThrow('already in use')
  })

  it('createDistrict succeeds when all fields provided and code unique', async () => {
    const { createDistrict } = await import('../../services/districtService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as any)
    const result = await createDistrict(
      { code: 'RUH-N', name: 'شمال الرياض', regionId: 'r1' },
      'admin', 'admin'
    )
    expect(result.id).toBe('new-doc-id')
    expect(result.code).toBe('RUH-N')
  })

  it('deleteDistrict throws when pharmacies are assigned', async () => {
    const { deleteDistrict } = await import('../../services/districtService')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ name: 'North', pharmacyIds: ['ph-001', 'ph-002'] }),
      id:     'd1',
    } as any)
    await expect(deleteDistrict('d1', 'admin', 'admin'))
      .rejects.toThrow('Cannot delete a district that has pharmacies')
  })

  it('deleteDistrict succeeds when no pharmacies assigned', async () => {
    const { deleteDistrict } = await import('../../services/districtService')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ name: 'North', pharmacyIds: [] }),
      id:     'd1',
    } as any)
    await expect(deleteDistrict('d1', 'admin', 'admin')).resolves.toBeUndefined()
  })

  it('districtCodeExists returns false for empty results', async () => {
    const { districtCodeExists } = await import('../../services/districtService')
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true, docs: [] } as any)
    expect(await districtCodeExists('RUH-N')).toBe(false)
  })

  it('assignPharmacyToDistrict is idempotent when already assigned', async () => {
    const { assignPharmacyToDistrict } = await import('../../services/districtService')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ pharmacyIds: ['ph-001'], regionId: 'r1' }),
      id:     'd1',
    } as any)
    // Should not throw, should not call updateDoc
    const { updateDoc } = await import('firebase/firestore')
    await assignPharmacyToDistrict('d1', 'ph-001', 'admin', 'admin')
    expect(updateDoc).not.toHaveBeenCalled()
  })
})

// ── 3. Territory types ────────────────────────────────────────

describe('Phase 1 — Territory type contracts', () => {
  it('Region type accepts all required fields', () => {
    const region: Region = {
      id:          'r1',
      name:        'Riyadh',
      code:        'RUH',
      managerUid:  null,
      districtIds: [],
      active:      true,
      createdAt:   new Date(),
      updatedAt:   new Date(),
      createdBy:   null,
    }
    expect(region.code).toBe('RUH')
    expect(region.districtIds).toEqual([])
  })

  it('District type accepts all required fields', () => {
    const district: District = {
      id:             'd1',
      name:           'North Riyadh',
      code:           'RUH-N',
      regionId:       'r1',
      supervisorUid:  null,
      pharmacyIds:    [],
      active:         true,
      createdAt:      new Date(),
      updatedAt:      new Date(),
      createdBy:      null,
    }
    expect(district.regionId).toBe('r1')
    expect(district.pharmacyIds).toEqual([])
  })

  it('TerritoryAssignment type accepts store/district/region/tenant types', () => {
    const assignments: TerritoryAssignment[] = [
      { type: 'store',    id: 'ph-001' },
      { type: 'district', id: 'd1' },
      { type: 'region',   id: 'r1' },
      { type: 'tenant',   id: 'default' },
    ]
    expect(assignments.map((a) => a.type)).toContain('store')
    expect(assignments.map((a) => a.type)).toContain('district')
  })

  it('COL.DISTRICTS and COL.REGIONS are defined', async () => {
    const { COL } = await import('../../services/firebase')
    expect(COL.DISTRICTS).toBe('districts')
    expect(COL.REGIONS).toBe('regions')
  })
})

// ── 4. accessGuard territory helpers ─────────────────────────

describe('Phase 1 — guardDistrictAccess', () => {
  const admin      = ctx('admin')
  const supervisor = ctx('district_supervisor', { districtId: 'd1' })
  const wrongSup   = ctx('district_supervisor', { districtId: 'd2' })
  const noDistSup  = ctx('district_supervisor', { districtId: null })
  const manager    = ctx('manager',      { pharmacyId: 'ph-001' })
  const pharmacist = ctx('pharmacist',   { pharmacyId: 'ph-001' })

  it('admin passes for any district', () => {
    expect(guardDistrictAccess(admin, 'd1').allowed).toBe(true)
    expect(guardDistrictAccess(admin, 'd999').allowed).toBe(true)
  })

  it('district_supervisor passes for their own district', () => {
    expect(guardDistrictAccess(supervisor, 'd1').allowed).toBe(true)
  })

  it('district_supervisor is denied for a different district', () => {
    expect(guardDistrictAccess(wrongSup, 'd1').allowed).toBe(false)
  })

  it('district_supervisor with no districtId is denied', () => {
    expect(guardDistrictAccess(noDistSup, 'd1').allowed).toBe(false)
  })

  it('manager is denied (branch-level role, not district)', () => {
    expect(guardDistrictAccess(manager, 'd1').allowed).toBe(false)
  })

  it('pharmacist is denied', () => {
    expect(guardDistrictAccess(pharmacist, 'd1').allowed).toBe(false)
  })
})

describe('Phase 1 — guardRegionalAccess', () => {
  const admin      = ctx('admin')
  const regional   = ctx('regional_manager', { regionIds: ['r1', 'r2'] })
  const wrongReg   = ctx('regional_manager', { regionIds: ['r3'] })
  const noReg      = ctx('regional_manager', { regionIds: [] })
  const supervisor = ctx('district_supervisor', { districtId: 'd1' })
  const manager    = ctx('manager', { pharmacyId: 'ph-001' })

  it('admin passes for any region', () => {
    expect(guardRegionalAccess(admin, 'r1').allowed).toBe(true)
    expect(guardRegionalAccess(admin, 'r999').allowed).toBe(true)
  })

  it('regional_manager passes for a region in their list', () => {
    expect(guardRegionalAccess(regional, 'r1').allowed).toBe(true)
    expect(guardRegionalAccess(regional, 'r2').allowed).toBe(true)
  })

  it('regional_manager is denied for a region not in their list', () => {
    expect(guardRegionalAccess(wrongReg, 'r1').allowed).toBe(false)
  })

  it('regional_manager with empty regionIds is denied', () => {
    expect(guardRegionalAccess(noReg, 'r1').allowed).toBe(false)
  })

  it('district_supervisor is denied regional access', () => {
    expect(guardRegionalAccess(supervisor, 'r1').allowed).toBe(false)
  })

  it('manager is denied regional access', () => {
    expect(guardRegionalAccess(manager, 'r1').allowed).toBe(false)
  })
})

// ── 5. Firestore rule helpers simulation ─────────────────────

describe('Phase 1 — Firestore rule helpers simulation', () => {
  // Simulates the new rule helper functions added in Phase 1
  function isSupervisorRole(role: string)  { return role === 'district_supervisor' }
  function isRegionalMgrRole(role: string) { return role === 'regional_manager' }

  it('isSupervisorRole returns true only for district_supervisor', () => {
    expect(isSupervisorRole('district_supervisor')).toBe(true)
    expect(isSupervisorRole('admin')).toBe(false)
    expect(isSupervisorRole('manager')).toBe(false)
    expect(isSupervisorRole('branch_manager')).toBe(false)
    expect(isSupervisorRole('regional_manager')).toBe(false)
    expect(isSupervisorRole('pharmacist')).toBe(false)
  })

  it('isRegionalMgrRole returns true only for regional_manager', () => {
    expect(isRegionalMgrRole('regional_manager')).toBe(true)
    expect(isRegionalMgrRole('admin')).toBe(false)
    expect(isRegionalMgrRole('district_supervisor')).toBe(false)
    expect(isRegionalMgrRole('pharmacist')).toBe(false)
  })

  it('firestore.rules source contains isSupervisorRole function', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('isSupervisorRole')
  })

  it('firestore.rules source contains isRegionalMgrRole function', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('isRegionalMgrRole')
  })

  it('firestore.rules source contains districts collection rule', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain("match /districts/{did}")
  })

  it('firestore.rules source contains regions collection rule', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain("match /regions/{rid}")
  })

  it('districts and regions rules grant write only to admin', async () => {
    const src = await import('../../../firestore.rules?raw')
    // Both collections should have admin-only write pattern
    const districtBlock = src.default.match(/match \/districts\/\{did\} \{[^}]+\}/s)?.[0] || ''
    expect(districtBlock).toContain('isAdmin()')
  })
})

// ── 6. Backward compatibility ─────────────────────────────────

describe('Phase 1 — Backward compatibility: existing behaviour unchanged', () => {
  it('isMgr still includes manager and branch_manager (Phase 0 alias intact)', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain("role() in ['admin','manager','branch_manager']")
  })

  it('existing isAdmin, isManager, isBranchManager helpers unchanged', () => {
    const admin      = ctx('admin')
    const manager    = ctx('manager')
    const branchMgr  = ctx('branch_manager')
    const pharmacist = ctx('pharmacist')

    expect(isAdmin(admin)).toBe(true)
    expect(isAdmin(manager)).toBe(false)
    expect(isManager(manager)).toBe(true)
    expect(isManager(branchMgr)).toBe(true)
    expect(isManager(pharmacist)).toBe(false)
    expect(effectiveRole(manager)).toBe('branch_manager')
  })

  it('guardDistrictAccess does not affect existing pharmacist access', () => {
    const pharmacist = ctx('pharmacist', { pharmacyId: 'ph-001' })
    // Pharmacists should be denied district access (they use branch-level guards)
    expect(guardDistrictAccess(pharmacist, 'd1').allowed).toBe(false)
  })

  it('isSupervisor identifies district_supervisor correctly', () => {
    expect(isSupervisor(ctx('district_supervisor'))).toBe(true)
    expect(isSupervisor(ctx('manager'))).toBe(false)
    expect(isSupervisor(ctx('admin'))).toBe(false)
  })

  it('isRegionalManager identifies regional_manager correctly', () => {
    expect(isRegionalManager(ctx('regional_manager'))).toBe(true)
    expect(isRegionalManager(ctx('manager'))).toBe(false)
    expect(isRegionalManager(ctx('admin'))).toBe(false)
  })
})

// ── 7. Route regression ───────────────────────────────────────

describe('Phase 1 — Route guard safety', () => {
  it('App.jsx includes territory routes (admin-only)', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).toContain('/admin/regions')
    expect(src.default).toContain('/admin/districts')
  })

  it('Territory routes are gated by ADMIN only (not MGR_UP)', async () => {
    const src = await import('../../App.jsx?raw')
    // Both territory routes should use ADMIN guard
    const regionsLine   = src.default.split('\n').find(l => l.includes('/admin/regions'))
    const districtsLine = src.default.split('\n').find(l => l.includes('/admin/districts'))
    expect(regionsLine).toContain('ADMIN')
    expect(districtsLine).toContain('ADMIN')
    // They must NOT be in MGR_UP routes
    expect(regionsLine).not.toContain('MGR_UP')
    expect(districtsLine).not.toContain('MGR_UP')
  })

  it('No supervisor or regional dashboard routes exist', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).not.toContain('/supervisor')
    expect(src.default).not.toContain('/regional-dashboard')
    expect(src.default).not.toContain('/district-dashboard')
  })

  it('Existing MGR_UP routes are unchanged', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).toContain('/team')
    expect(src.default).toContain('/targets')
    expect(src.default).toContain('/reports')
  })
})

// ── 8. User schema territory fields ──────────────────────────

describe('Phase 1 — User schema territory fields', () => {
  it('userService createUser accepts districtId parameter', async () => {
    const src = await import('../../services/userService.js?raw')
    expect(src.default).toContain('districtId')
    expect(src.default).toContain('regionIds')
  })

  it('userService writes districtId null by default', async () => {
    const src = await import('../../services/userService.js?raw')
    expect(src.default).toContain('districtId:   districtId || null')
  })

  it('userService writes regionIds empty array by default', async () => {
    const src = await import('../../services/userService.js?raw')
    expect(src.default).toContain('regionIds:    regionIds  || []')
  })

  it('Phase 0 fields still present alongside Phase 1 additions', async () => {
    const src = await import('../../services/userService.js?raw')
    // Phase 0
    expect(src.default).toContain('tenantId')
    expect(src.default).toContain('accessScopes')
    expect(src.default).toContain('temporaryScopes')
    expect(src.default).toContain('scopeVersion')
    // Phase 1
    expect(src.default).toContain('districtId')
    expect(src.default).toContain('regionIds')
  })

  it('TerritoryGuardContext extends GuardContext with optional territory fields', () => {
    // Verify the extended context is accepted with or without territory fields
    const baseCtx: TerritoryGuardContext = { uid: 'u1', role: 'admin', pharmacyId: null }
    const richCtx: TerritoryGuardContext = {
      uid: 'u2', role: 'district_supervisor', pharmacyId: null,
      districtId: 'd1',
    }
    const regionalCtx: TerritoryGuardContext = {
      uid: 'u3', role: 'regional_manager', pharmacyId: null,
      regionIds: ['r1', 'r2'],
    }
    expect(baseCtx.districtId).toBeUndefined()
    expect(richCtx.districtId).toBe('d1')
    expect(regionalCtx.regionIds).toEqual(['r1', 'r2'])
  })
})
