// ============================================================
// Territory Sync Engine — Phase 1B-3A Regression Tests
//
// Verifies that territorySync.ts correctly:
//  - returns null for all-access roles (admin, general_manager)
//  - returns null for not-applicable roles (branch_manager, pharmacist)
//  - returns [] for district_supervisor with no district
//  - returns [] for regional_manager with no regions
//  - returns [] when district/region documents are missing (safe fallback)
//  - returns district.pharmacyIds for district_supervisor
//  - returns deduplicated union for regional_manager
//  - deduplicates pharmacies that appear in multiple districts
//  - uses order-insensitive comparison (prevents false changed:true)
//  - returns changed:false and skips updateDoc when value is unchanged
//  - returns changed:true and calls updateDoc when value differs
//  - contains NO automatic sync hooks (no subscriptions)
//  - contains NO backfill function
//  - contains NO validation utilities
//
// Source-level tests (tests 15-17) use ?raw imports.
// Behavioral tests (1-14) call functions with Firestore mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (hoisted before imports) ────────────────────────────

vi.mock('../../services/firebase', () => ({
  db:  {},
  COL: {
    USERS:       'users',
    PHARMACIES:  'pharmacies',
    DISTRICTS:   'districts',
    REGIONS:     'regions',
    AUDIT_LOGS:  'audit_logs',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ empty: true, docs: [] })),
  updateDoc:       vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
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

import { getDoc, getDocs, updateDoc } from 'firebase/firestore'
import {
  computeAssignedPharmacyIdsForUser,
  recomputeAssignedPharmacyIds,
} from '../../services/territorySync'

// ── Helpers ───────────────────────────────────────────────────

function userSnap(data: Record<string, unknown>) {
  return { exists: () => true, data: () => data }
}

function districtSnap(pharmacyIds: string[]) {
  return { exists: () => true, data: () => ({ pharmacyIds }) }
}

function missingSnap() {
  return { exists: () => false, data: () => null }
}

function districtDocsSnap(entries: Array<{ pharmacyIds: string[] }>) {
  return {
    empty: entries.length === 0,
    docs:  entries.map((e) => ({ data: () => e })),
  }
}

// ── Reset mock call history between tests ─────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ════════════════════════════════════════════════════════════
// 1. admin → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — admin returns null', () => {
  it('admin role produces null (all-access sentinel)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(userSnap({ role: 'admin' }) as any)
    const result = await computeAssignedPharmacyIdsForUser('uid-admin')
    expect(result).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 2. general_manager → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — general_manager returns null', () => {
  it('general_manager role produces null (all-access sentinel)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(userSnap({ role: 'general_manager' }) as any)
    const result = await computeAssignedPharmacyIdsForUser('uid-gm')
    expect(result).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 3. pharmacist → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — pharmacist returns null', () => {
  it('pharmacist role produces null (not-applicable sentinel)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'pharmacist', pharmacyId: 'ph-1' }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-pharm')
    expect(result).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 4. branch_manager → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — branch_manager returns null', () => {
  it('branch_manager role produces null (not-applicable sentinel)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'branch_manager', pharmacyId: 'ph-1' }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-bm')
    expect(result).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 5. district_supervisor with no district → []
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — district_supervisor with no district', () => {
  it('districtId null → returns []', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor', districtId: null }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-sup')
    expect(result).toEqual([])
  })

  it('districtId undefined → returns []', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor' }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-sup')
    expect(result).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 6. regional_manager with no regions → []
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — regional_manager with no regions', () => {
  it('regionIds empty array → returns []', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', regionIds: [] }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toEqual([])
  })

  it('regionIds undefined → returns []', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager' }) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 7. missing district → [] (safe fallback)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — missing district safe fallback', () => {
  it('district document missing → [] not null', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', districtId: 'dist-gone' }) as any)
      .mockResolvedValueOnce(missingSnap() as any) // district not found
    const result = await computeAssignedPharmacyIdsForUser('uid-sup')
    expect(result).toEqual([])
    expect(result).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 8. missing region → [] (safe fallback)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — missing region safe fallback', () => {
  it('no districts found for regionId → [] not null', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', regionIds: ['reg-gone'] }) as any,
    )
    vi.mocked(getDocs).mockResolvedValueOnce(districtDocsSnap([]) as any) // no districts
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toEqual([])
    expect(result).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// 9. district_supervisor returns district.pharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — district_supervisor returns district.pharmacyIds', () => {
  it('returns the pharmacyIds array from the assigned district', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', districtId: 'dist-1' }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-1', 'ph-2', 'ph-3']) as any)
    const result = await computeAssignedPharmacyIdsForUser('uid-sup')
    expect(result).toEqual(['ph-1', 'ph-2', 'ph-3'])
  })

  it('returns [] when district has no pharmacies yet', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', districtId: 'dist-empty' }) as any)
      .mockResolvedValueOnce(districtSnap([]) as any)
    const result = await computeAssignedPharmacyIdsForUser('uid-sup')
    expect(result).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 10. regional_manager returns union of region pharmacies
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — regional_manager returns union across all assigned regions', () => {
  it('union of pharmacyIds from all districts in all regions', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', regionIds: ['reg-1', 'reg-2'] }) as any,
    )
    vi.mocked(getDocs)
      .mockResolvedValueOnce(districtDocsSnap([{ pharmacyIds: ['ph-1', 'ph-2'] }]) as any) // reg-1
      .mockResolvedValueOnce(districtDocsSnap([{ pharmacyIds: ['ph-3', 'ph-4'] }]) as any) // reg-2
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toHaveLength(4)
    expect(result).toContain('ph-1')
    expect(result).toContain('ph-2')
    expect(result).toContain('ph-3')
    expect(result).toContain('ph-4')
  })

  it('multiple districts within one region are all included', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', regionIds: ['reg-1'] }) as any,
    )
    vi.mocked(getDocs).mockResolvedValueOnce(
      districtDocsSnap([
        { pharmacyIds: ['ph-1', 'ph-2'] },
        { pharmacyIds: ['ph-3'] },
      ]) as any,
    )
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toHaveLength(3)
    expect(result).toContain('ph-1')
    expect(result).toContain('ph-2')
    expect(result).toContain('ph-3')
  })
})

// ════════════════════════════════════════════════════════════
// 11. duplicate pharmacies are deduplicated
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — duplicate pharmacies deduplicated', () => {
  it('pharmacy appearing in multiple districts is counted once', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', regionIds: ['reg-1', 'reg-2'] }) as any,
    )
    vi.mocked(getDocs)
      .mockResolvedValueOnce(districtDocsSnap([{ pharmacyIds: ['ph-1', 'ph-2'] }]) as any)
      .mockResolvedValueOnce(districtDocsSnap([{ pharmacyIds: ['ph-2', 'ph-3'] }]) as any)
    const result = await computeAssignedPharmacyIdsForUser('uid-mgr')
    expect(result).toHaveLength(3)
    expect(result).toContain('ph-1')
    expect(result).toContain('ph-2')
    expect(result).toContain('ph-3')
    // ph-2 must not appear twice
    expect(result!.filter((id) => id === 'ph-2')).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════
// 12. order-insensitive comparison
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — order-insensitive array comparison', () => {
  it("['ph-2','ph-1'] vs ['ph-1','ph-2'] → changed:false", async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({
        role:                'district_supervisor',
        districtId:          'dist-1',
        assignedPharmacyIds: ['ph-2', 'ph-1'],  // reversed order in cache
      }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-1', 'ph-2']) as any) // canonical order
    const result = await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
    expect(result.changed).toBe(false)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('null vs null → changed:false (admin all-access unchanged)', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'admin', assignedPharmacyIds: null }) as any,
    )
    const result = await recomputeAssignedPharmacyIds('uid-admin', 'actor', 'admin')
    expect(result.changed).toBe(false)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════
// 13. unchanged run returns changed:false
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — unchanged run is idempotent', () => {
  it('same pharmacyIds in cache and hierarchy → changed:false, no write', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({
        role:                'district_supervisor',
        districtId:          'dist-1',
        assignedPharmacyIds: ['ph-1', 'ph-2'],
      }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-1', 'ph-2']) as any)
    const result = await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
    expect(result.changed).toBe(false)
    expect(result.previous).toEqual(['ph-1', 'ph-2'])
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('second call with same state still returns changed:false', async () => {
    // Simulate two sequential calls — both see the same hierarchy
    for (let i = 0; i < 2; i++) {
      vi.clearAllMocks()
      vi.mocked(getDoc)
        .mockResolvedValueOnce(userSnap({
          role: 'district_supervisor', districtId: 'dist-1',
          assignedPharmacyIds: ['ph-A'],
        }) as any)
        .mockResolvedValueOnce(districtSnap(['ph-A']) as any)
      const result = await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
      expect(result.changed).toBe(false)
    }
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════
// 14. changed run returns changed:true and writes
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — changed run writes updated cache', () => {
  it('stale cache → changed:true, updateDoc called once', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({
        role:                'district_supervisor',
        districtId:          'dist-1',
        assignedPharmacyIds: ['ph-1'],  // stale: missing ph-2
      }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-1', 'ph-2']) as any) // hierarchy has 2 now
    const result = await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
    expect(result.changed).toBe(true)
    expect(result.previous).toEqual(['ph-1'])
    expect(result.current).toEqual(['ph-1', 'ph-2'])
    expect(vi.mocked(updateDoc)).toHaveBeenCalledOnce()
  })

  it('null cache for district_supervisor → changed:true, writes []', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({
        role:                'district_supervisor',
        districtId:          'dist-1',
        assignedPharmacyIds: null,  // never been computed
      }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-1']) as any)
    const result = await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
    expect(result.changed).toBe(true)
    expect(result.previous).toBeNull()
    expect(result.current).toEqual(['ph-1'])
    expect(vi.mocked(updateDoc)).toHaveBeenCalledOnce()
  })

  it('updateDoc is called with assignedPharmacyIds in the payload', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({
        role:                'district_supervisor',
        districtId:          'dist-1',
        assignedPharmacyIds: [],
      }) as any)
      .mockResolvedValueOnce(districtSnap(['ph-X']) as any)
    await recomputeAssignedPharmacyIds('uid-sup', 'actor', 'admin')
    const [, updatePayload] = vi.mocked(updateDoc).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(updatePayload).toHaveProperty('assignedPharmacyIds')
    expect(updatePayload.assignedPharmacyIds).toContain('ph-X')
  })
})

// ════════════════════════════════════════════════════════════
// 15. no automatic hooks exist (source-level)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — no automatic sync hooks', () => {
  it('territorySync does not contain onSnapshot subscriptions', async () => {
    const src = (await import('../../services/territorySync?raw')).default
    expect(src).not.toContain('onSnapshot')
  })

  it('territorySync does not subscribe to any collection', async () => {
    const src = (await import('../../services/territorySync?raw')).default
    expect(src).not.toContain('subscribeToDistricts')
    expect(src).not.toContain('subscribeToRegions')
    expect(src).not.toContain('subscribeToPharmacies')
  })
})

// ════════════════════════════════════════════════════════════
// 16. no backfill function exists (source-level)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — no backfill function (Sprint 1B-3E)', () => {
  it('backfillAllAssignedPharmacyIds is not exported', async () => {
    const src = (await import('../../services/territorySync?raw')).default
    expect(src).not.toContain('backfillAllAssignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 17. no validation utilities exist (source-level)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3A — no validation utilities (Sprint 1B-3F)', () => {
  it('validateAssignedPharmacyIds is not exported', async () => {
    const src = (await import('../../services/territorySync?raw')).default
    expect(src).not.toContain('validateAssignedPharmacyIds')
  })

  it('auditAllAssignedPharmacyIds is not exported', async () => {
    const src = (await import('../../services/territorySync?raw')).default
    expect(src).not.toContain('auditAllAssignedPharmacyIds')
  })
})
