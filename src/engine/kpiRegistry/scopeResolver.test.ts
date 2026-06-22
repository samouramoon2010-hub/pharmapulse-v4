// ============================================================
// Phase 2B — Scope Resolver Tests
//
// Covers:
//   resolveAllowedPharmacyIdsSync  — all roles, cache states
//   resolveAllowedPharmacyIds      — fast path + cache-miss path
//   isPharmacyAllowed              — all scope types
//   filterAllowedPharmacies        — all scope types
//   assertPharmacyAccess           — allow + deny + error shape
//
// Behavioral tests using vi.mock — no DOM, no Firestore.
// territorySync is mocked so computeAssigned… is controllable.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module-level mocks (must be hoisted before imports) ───────

vi.mock('../../services/firebase', () => ({
  db:  {},
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies',
    DISTRICTS: 'districts', REGIONS: 'regions',
  },
}))

vi.mock('../../services/territorySync', () => ({
  computeAssignedPharmacyIdsForUser: vi.fn(),
  recomputeAssignedPharmacyIds:      vi.fn(),
  getDistrictPharmacyIds:            vi.fn(),
  getRegionPharmacyIds:              vi.fn(),
}))

import {
  resolveAllowedPharmacyIdsSync,
  resolveAllowedPharmacyIds,
  isPharmacyAllowed,
  filterAllowedPharmacies,
  assertPharmacyAccess,
  AccessDeniedError,
  type PharmacyScope,
} from '../../services/scopeResolver'

import { computeAssignedPharmacyIdsForUser } from '../../services/territorySync'

// ════════════════════════════════════════════════════════════
// 1. resolveAllowedPharmacyIdsSync — role dispatch
// ════════════════════════════════════════════════════════════

describe('resolveAllowedPharmacyIdsSync — all-access roles', () => {
  it('admin → { type: all }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'admin' })
    expect(result).toEqual({ type: 'all' })
  })

  it('general_manager → { type: all }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'general_manager' })
    expect(result).toEqual({ type: 'all' })
  })
})

describe('resolveAllowedPharmacyIdsSync — single-branch roles', () => {
  it('manager with pharmacyId → { type: single }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'manager', pharmacyId: 'ph1' })
    expect(result).toEqual({ type: 'single', id: 'ph1' })
  })

  it('manager without pharmacyId → { type: none }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'manager' })
    expect(result).toEqual({ type: 'none' })
  })

  it('manager with null pharmacyId → { type: none }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'manager', pharmacyId: null })
    expect(result).toEqual({ type: 'none' })
  })

  it('branch_manager with pharmacyId → { type: single }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'branch_manager', pharmacyId: 'ph2' })
    expect(result).toEqual({ type: 'single', id: 'ph2' })
  })

  it('pharmacist with pharmacyId → { type: single }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'pharmacist', pharmacyId: 'ph3' })
    expect(result).toEqual({ type: 'single', id: 'ph3' })
  })

  it('pharmacist without pharmacyId → { type: none }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'pharmacist' })
    expect(result).toEqual({ type: 'none' })
  })
})

describe('resolveAllowedPharmacyIdsSync — territory roles', () => {
  it('district_supervisor with populated cache → { type: list }', () => {
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'district_supervisor',
      assignedPharmacyIds: ['ph1', 'ph2', 'ph3'],
    })
    expect(result).toEqual({ type: 'list', ids: ['ph1', 'ph2', 'ph3'] })
  })

  it('district_supervisor with empty cache → { type: list, ids: [] } (not all)', () => {
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'district_supervisor',
      assignedPharmacyIds: [],
    })
    expect(result).toEqual({ type: 'list', ids: [] })
    expect(result).not.toEqual({ type: 'all' })
  })

  it('district_supervisor with null cache → null (cache miss signal)', () => {
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'district_supervisor',
      assignedPharmacyIds: null,
    })
    expect(result).toBeNull()
  })

  it('district_supervisor without assignedPharmacyIds field → null (cache miss signal)', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'district_supervisor' })
    expect(result).toBeNull()
  })

  it('regional_manager with populated cache → { type: list }', () => {
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'regional_manager',
      assignedPharmacyIds: ['ph10', 'ph11'],
    })
    expect(result).toEqual({ type: 'list', ids: ['ph10', 'ph11'] })
  })

  it('regional_manager with null cache → null (cache miss signal)', () => {
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'regional_manager',
      assignedPharmacyIds: null,
    })
    expect(result).toBeNull()
  })

  it('list scope ids are a copy — mutation does not affect original', () => {
    const ids = ['ph1', 'ph2']
    const result = resolveAllowedPharmacyIdsSync({
      uid: 'u1', role: 'district_supervisor', assignedPharmacyIds: ids,
    }) as Extract<PharmacyScope, { type: 'list' }>
    result.ids.push('ph99')
    expect(ids).toHaveLength(2)
  })
})

describe('resolveAllowedPharmacyIdsSync — unknown role', () => {
  it('unknown role → { type: none }', () => {
    const result = resolveAllowedPharmacyIdsSync({ uid: 'u1', role: 'intern' })
    expect(result).toEqual({ type: 'none' })
  })
})

// ════════════════════════════════════════════════════════════
// 2. resolveAllowedPharmacyIds — async fast path + cache miss
// ════════════════════════════════════════════════════════════

describe('resolveAllowedPharmacyIds — fast path (no Firestore call)', () => {
  beforeEach(() => {
    vi.mocked(computeAssignedPharmacyIdsForUser).mockReset()
  })

  it('admin resolves without calling computeAssignedPharmacyIdsForUser', async () => {
    const profile = await resolveAllowedPharmacyIds({ uid: 'u1', role: 'admin' })
    expect(profile.scope).toEqual({ type: 'all' })
    expect(computeAssignedPharmacyIdsForUser).not.toHaveBeenCalled()
  })

  it('manager with pharmacyId resolves without calling compute', async () => {
    const profile = await resolveAllowedPharmacyIds({
      uid: 'u1', role: 'manager', pharmacyId: 'ph5',
    })
    expect(profile.scope).toEqual({ type: 'single', id: 'ph5' })
    expect(computeAssignedPharmacyIdsForUser).not.toHaveBeenCalled()
  })

  it('territory role with cache hit resolves without calling compute', async () => {
    const profile = await resolveAllowedPharmacyIds({
      uid: 'u1', role: 'district_supervisor', assignedPharmacyIds: ['ph1'],
    })
    expect(profile.scope).toEqual({ type: 'list', ids: ['ph1'] })
    expect(computeAssignedPharmacyIdsForUser).not.toHaveBeenCalled()
  })

  it('returns UserScopeProfile with uid and role', async () => {
    const profile = await resolveAllowedPharmacyIds({ uid: 'myuid', role: 'admin' })
    expect(profile.uid).toBe('myuid')
    expect(profile.role).toBe('admin')
  })
})

describe('resolveAllowedPharmacyIds — cache miss path', () => {
  beforeEach(() => {
    vi.mocked(computeAssignedPharmacyIdsForUser).mockReset()
  })

  it('territory role with null cache calls computeAssignedPharmacyIdsForUser', async () => {
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph7', 'ph8'])
    await resolveAllowedPharmacyIds({
      uid: 'u2', role: 'regional_manager', assignedPharmacyIds: null,
    })
    expect(computeAssignedPharmacyIdsForUser).toHaveBeenCalledWith('u2')
  })

  it('cache miss resolves to list with computed ids', async () => {
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph7', 'ph8'])
    const profile = await resolveAllowedPharmacyIds({
      uid: 'u2', role: 'regional_manager', assignedPharmacyIds: null,
    })
    expect(profile.scope).toEqual({ type: 'list', ids: ['ph7', 'ph8'] })
  })

  it('cache miss where compute returns null → list with empty ids (safe fallback)', async () => {
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(null)
    const profile = await resolveAllowedPharmacyIds({
      uid: 'u3', role: 'district_supervisor', assignedPharmacyIds: null,
    })
    expect(profile.scope).toEqual({ type: 'list', ids: [] })
    expect(profile.scope.type).not.toBe('all')
  })
})

// ════════════════════════════════════════════════════════════
// 3. isPharmacyAllowed
// ════════════════════════════════════════════════════════════

describe('isPharmacyAllowed — all scope', () => {
  it('always returns true', () => {
    expect(isPharmacyAllowed({ type: 'all' }, 'anything')).toBe(true)
    expect(isPharmacyAllowed({ type: 'all' }, '')).toBe(true)
  })
})

describe('isPharmacyAllowed — none scope', () => {
  it('always returns false', () => {
    expect(isPharmacyAllowed({ type: 'none' }, 'anything')).toBe(false)
  })
})

describe('isPharmacyAllowed — single scope', () => {
  it('returns true for exact match', () => {
    expect(isPharmacyAllowed({ type: 'single', id: 'ph1' }, 'ph1')).toBe(true)
  })

  it('returns false for mismatch', () => {
    expect(isPharmacyAllowed({ type: 'single', id: 'ph1' }, 'ph2')).toBe(false)
  })
})

describe('isPharmacyAllowed — list scope', () => {
  it('returns true when id is in the list', () => {
    expect(isPharmacyAllowed({ type: 'list', ids: ['ph1', 'ph2', 'ph3'] }, 'ph2')).toBe(true)
  })

  it('returns false when id is not in the list', () => {
    expect(isPharmacyAllowed({ type: 'list', ids: ['ph1', 'ph2'] }, 'ph9')).toBe(false)
  })

  it('returns false for empty list', () => {
    expect(isPharmacyAllowed({ type: 'list', ids: [] }, 'ph1')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 4. filterAllowedPharmacies
// ════════════════════════════════════════════════════════════

const PH_LIST = [
  { id: 'ph1', name: 'Alpha' },
  { id: 'ph2', name: 'Beta' },
  { id: 'ph3', name: 'Gamma' },
]

describe('filterAllowedPharmacies — all scope', () => {
  it('returns the full list unchanged', () => {
    const result = filterAllowedPharmacies({ type: 'all' }, PH_LIST)
    expect(result).toHaveLength(3)
    expect(result).toEqual(PH_LIST)
  })
})

describe('filterAllowedPharmacies — none scope', () => {
  it('returns empty array', () => {
    const result = filterAllowedPharmacies({ type: 'none' }, PH_LIST)
    expect(result).toHaveLength(0)
  })
})

describe('filterAllowedPharmacies — single scope', () => {
  it('returns only the matching pharmacy', () => {
    const result = filterAllowedPharmacies({ type: 'single', id: 'ph2' }, PH_LIST)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ph2')
  })

  it('returns empty when the id is not in the list', () => {
    const result = filterAllowedPharmacies({ type: 'single', id: 'ph99' }, PH_LIST)
    expect(result).toHaveLength(0)
  })
})

describe('filterAllowedPharmacies — list scope', () => {
  it('returns intersection of list and pharmacies', () => {
    const result = filterAllowedPharmacies(
      { type: 'list', ids: ['ph1', 'ph3'] }, PH_LIST,
    )
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.id)).toEqual(['ph1', 'ph3'])
  })

  it('returns empty for empty ids list', () => {
    const result = filterAllowedPharmacies({ type: 'list', ids: [] }, PH_LIST)
    expect(result).toHaveLength(0)
  })

  it('excludes pharmacies not in ids', () => {
    const result = filterAllowedPharmacies(
      { type: 'list', ids: ['ph2'] }, PH_LIST,
    )
    expect(result.every((p) => p.id === 'ph2')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 5. assertPharmacyAccess
// ════════════════════════════════════════════════════════════

describe('assertPharmacyAccess — allowed access', () => {
  it('does not throw when access is permitted (all scope)', () => {
    expect(() => assertPharmacyAccess({ type: 'all' }, 'ph1')).not.toThrow()
  })

  it('does not throw when access is permitted (single match)', () => {
    expect(() => assertPharmacyAccess({ type: 'single', id: 'ph1' }, 'ph1')).not.toThrow()
  })

  it('does not throw when access is permitted (list contains)', () => {
    expect(() =>
      assertPharmacyAccess({ type: 'list', ids: ['ph1', 'ph2'] }, 'ph1'),
    ).not.toThrow()
  })
})

describe('assertPharmacyAccess — denied access', () => {
  it('throws AccessDeniedError when none scope', () => {
    expect(() => assertPharmacyAccess({ type: 'none' }, 'ph1')).toThrow(AccessDeniedError)
  })

  it('throws AccessDeniedError when single mismatch', () => {
    expect(() =>
      assertPharmacyAccess({ type: 'single', id: 'ph2' }, 'ph1'),
    ).toThrow(AccessDeniedError)
  })

  it('error message contains the denied pharmacyId', () => {
    try {
      assertPharmacyAccess({ type: 'single', id: 'ph2' }, 'ph-denied')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AccessDeniedError)
      expect((e as AccessDeniedError).message).toContain('ph-denied')
    }
  })

  it('AccessDeniedError carries pharmacyId property', () => {
    try {
      assertPharmacyAccess({ type: 'none' }, 'target-ph')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AccessDeniedError).pharmacyId).toBe('target-ph')
    }
  })

  it('throws AccessDeniedError for empty list', () => {
    expect(() =>
      assertPharmacyAccess({ type: 'list', ids: [] }, 'ph1'),
    ).toThrow(AccessDeniedError)
  })
})

// ════════════════════════════════════════════════════════════
// 6. Source-level guardrails
// ════════════════════════════════════════════════════════════

async function src(): Promise<string> {
  return (await import('../../services/scopeResolver.ts?raw')).default
}

describe('Phase 2B — scopeResolver scope guardrails', () => {
  it('does not contain UI rendering (JSX / import React)', async () => {
    const s = await src()
    expect(s).not.toContain('import React')
    expect(s).not.toContain('return <')
  })

  it('does not import from firebase/firestore directly', async () => {
    const s = await src()
    expect(s).not.toContain("from 'firebase/firestore'")
  })

  it('does not contain resolveScope (old naming from prior design iterations)', async () => {
    const s = await src()
    expect(s).not.toContain('resolveScope(')
  })

  it('does not contain Backfill or Validation logic', async () => {
    const s = await src()
    expect(s).not.toContain('backfillAll')
    expect(s).not.toContain('auditAll')
    expect(s).not.toContain('validateAssigned')
  })

  it('exports resolveAllowedPharmacyIdsSync', async () => {
    const s = await src()
    expect(s).toContain('export function resolveAllowedPharmacyIdsSync')
  })

  it('exports resolveAllowedPharmacyIds', async () => {
    const s = await src()
    expect(s).toContain('export async function resolveAllowedPharmacyIds')
  })

  it('exports isPharmacyAllowed, filterAllowedPharmacies, assertPharmacyAccess', async () => {
    const s = await src()
    expect(s).toContain('export function isPharmacyAllowed')
    expect(s).toContain('export function filterAllowedPharmacies')
    expect(s).toContain('export function assertPharmacyAccess')
  })

  it('exports AccessDeniedError class', async () => {
    const s = await src()
    expect(s).toContain('export class AccessDeniedError')
  })
})
