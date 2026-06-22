// ============================================================
// Territory Validation Utilities — Phase 1B-3F Regression Tests
//
// Verifies validateAssignedPharmacyIds():
//   - not_applicable for non-territory roles
//   - missing for territory users with null cache
//   - ok when cache matches hierarchy (order-insensitive)
//   - stale when cache differs from hierarchy
//   - drift.leaked = ids in cache but not hierarchy (access expansion)
//   - drift.missing = ids in hierarchy but not cache
//   - error for missing user or compute failure
//
// Verifies auditAllAssignedPharmacyIds():
//   - processes only territory roles
//   - counts ok / missing / stale / errors correctly
//   - individual failure does not stop audit loop
//
// Scope guardrails (source-level):
//   - no UI
//   - no Scope Resolver
//   - no automatic repair / backfill call
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db:  {},
  COL: {
    USERS:      'users',
    DISTRICTS:  'districts',
    REGIONS:    'regions',
    PHARMACIES: 'pharmacies',
    AUDIT_LOGS: 'audit_logs',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ empty: true, docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/territorySync', () => ({
  computeAssignedPharmacyIdsForUser: vi.fn(async () => null),
  recomputeAssignedPharmacyIds:      vi.fn(async () => ({
    changed: false, previous: null, current: null,
  })),
}))

// ── Imports after mocks ────────────────────────────────────────

import { getDoc, getDocs }                      from 'firebase/firestore'
import { computeAssignedPharmacyIdsForUser }    from '../../services/territorySync'
import {
  validateAssignedPharmacyIds,
  auditAllAssignedPharmacyIds,
} from '../../services/territoryValidation'

// ── Helpers ───────────────────────────────────────────────────

function userSnap(data: Record<string, unknown>) {
  return { exists: () => true, data: () => data }
}

function missingSnap() {
  return { exists: () => false, data: () => null }
}

function docsSnap(users: Array<{ id: string; data: () => Record<string, unknown> }>) {
  return { empty: users.length === 0, docs: users }
}

function userDoc(id: string, role: string, assignedPharmacyIds: string[] | null = null) {
  return { id, data: () => ({ role, assignedPharmacyIds }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ════════════════════════════════════════════════════════════
// 1. admin returns not_applicable
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — admin returns not_applicable', () => {
  it('status is not_applicable for admin', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'admin', assignedPharmacyIds: null }) as any,
    )
    const result = await validateAssignedPharmacyIds('uid-admin')
    expect(result.status).toBe('not_applicable')
    expect(result.role).toBe('admin')
  })

  it('computeAssignedPharmacyIdsForUser is NOT called for admin', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'admin' }) as any,
    )
    await validateAssignedPharmacyIds('uid-admin')
    expect(vi.mocked(computeAssignedPharmacyIdsForUser)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════
// 2. general_manager returns not_applicable
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — general_manager returns not_applicable', () => {
  it('status is not_applicable for general_manager', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'general_manager' }) as any,
    )
    const result = await validateAssignedPharmacyIds('uid-gm')
    expect(result.status).toBe('not_applicable')
  })
})

// ════════════════════════════════════════════════════════════
// 3. manager returns not_applicable
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — manager returns not_applicable', () => {
  it('status is not_applicable for manager', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'manager' }) as any,
    )
    const result = await validateAssignedPharmacyIds('uid-mgr')
    expect(result.status).toBe('not_applicable')
  })
})

// ════════════════════════════════════════════════════════════
// 4. branch_manager returns not_applicable
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — branch_manager returns not_applicable', () => {
  it('status is not_applicable for branch_manager', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'branch_manager' }) as any,
    )
    const result = await validateAssignedPharmacyIds('uid-bm')
    expect(result.status).toBe('not_applicable')
  })
})

// ════════════════════════════════════════════════════════════
// 5. pharmacist returns not_applicable
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — pharmacist returns not_applicable', () => {
  it('status is not_applicable for pharmacist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'pharmacist', pharmacyId: 'ph-1' }) as any,
    )
    const result = await validateAssignedPharmacyIds('uid-pharm')
    expect(result.status).toBe('not_applicable')
  })
})

// ════════════════════════════════════════════════════════════
// 6. district_supervisor with null cache returns missing
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — district_supervisor missing cache', () => {
  it('null assignedPharmacyIds → status missing', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor', assignedPharmacyIds: null }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('missing')
    expect(result.current).toBeNull()
  })

  it('missing cache drift.missing = expected array', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor', assignedPharmacyIds: null }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.drift.missing).toEqual(['ph-1', 'ph-2'])
    expect(result.drift.leaked).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 7. regional_manager with null cache returns missing
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — regional_manager missing cache', () => {
  it('null assignedPharmacyIds → status missing', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'regional_manager', assignedPharmacyIds: null }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-3', 'ph-4'])
    const result = await validateAssignedPharmacyIds('uid-mgr')
    expect(result.status).toBe('missing')
    expect(result.expected).toEqual(['ph-3', 'ph-4'])
  })
})

// ════════════════════════════════════════════════════════════
// 8. matching current and expected returns ok
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — matching cache returns ok', () => {
  it('current equals expected → status ok', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor', assignedPharmacyIds: ['ph-1', 'ph-2'] }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('ok')
    expect(result.drift.leaked).toEqual([])
    expect(result.drift.missing).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 9. extra ids in current appear in drift.leaked
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — drift.leaked = extra ids in cache', () => {
  it('extra ids in current are reported as leaked', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({
        role: 'district_supervisor',
        assignedPharmacyIds: ['ph-1', 'ph-2', 'ph-EXTRA'],
      }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('stale')
    expect(result.drift.leaked).toContain('ph-EXTRA')
    expect(result.drift.leaked).toHaveLength(1)
  })

  it('leaked ids are not in expected', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({
        role: 'regional_manager',
        assignedPharmacyIds: ['ph-1', 'ph-X', 'ph-Y'],
      }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1'])
    const result = await validateAssignedPharmacyIds('uid-mgr')
    expect(result.drift.leaked).toEqual(expect.arrayContaining(['ph-X', 'ph-Y']))
    expect(result.drift.missing).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 10. missing expected ids appear in drift.missing
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — drift.missing = ids absent from cache', () => {
  it('ids in expected but not in current appear in drift.missing', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({
        role: 'district_supervisor',
        assignedPharmacyIds: ['ph-1'],
      }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-NEW'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('stale')
    expect(result.drift.missing).toContain('ph-NEW')
    expect(result.drift.leaked).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 11. different arrays return stale
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — different arrays return stale', () => {
  it('completely different sets → stale', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({
        role: 'district_supervisor',
        assignedPharmacyIds: ['ph-old-1', 'ph-old-2'],
      }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-new-1', 'ph-new-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('stale')
    expect(result.drift.leaked).toEqual(['ph-old-1', 'ph-old-2'])
    expect(result.drift.missing).toEqual(['ph-new-1', 'ph-new-2'])
  })
})

// ════════════════════════════════════════════════════════════
// 12. comparison is order-insensitive
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — order-insensitive comparison', () => {
  it("['ph-2','ph-1'] vs ['ph-1','ph-2'] → ok", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({
        role: 'district_supervisor',
        assignedPharmacyIds: ['ph-2', 'ph-1'],
      }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1', 'ph-2'])
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('ok')
    expect(result.drift.leaked).toEqual([])
    expect(result.drift.missing).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 13. missing user returns error
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — missing user returns error', () => {
  it('user document not found → status error', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(missingSnap() as any)
    const result = await validateAssignedPharmacyIds('uid-ghost')
    expect(result.status).toBe('error')
    expect(result.uid).toBe('uid-ghost')
  })

  it('error result has empty drift arrays', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(missingSnap() as any)
    const result = await validateAssignedPharmacyIds('uid-ghost')
    expect(result.drift.leaked).toEqual([])
    expect(result.drift.missing).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 14. compute failure returns error
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — compute failure returns error', () => {
  it('computeAssignedPharmacyIdsForUser throws → status error', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      userSnap({ role: 'district_supervisor', assignedPharmacyIds: null }) as any,
    )
    vi.mocked(computeAssignedPharmacyIdsForUser).mockRejectedValueOnce(
      new Error('hierarchy read failed'),
    )
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('error')
  })

  it('getDoc throws → status error (overall try/catch)', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('Firestore timeout'))
    const result = await validateAssignedPharmacyIds('uid-sup')
    expect(result.status).toBe('error')
  })
})

// ════════════════════════════════════════════════════════════
// 15. audit processes only territory roles
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — audit processes only territory roles', () => {
  it("source contains TERRITORY_ROLES with 'district_supervisor'", async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    const rolesIdx  = src.indexOf('TERRITORY_ROLES')
    const rolesLine = src.slice(rolesIdx, rolesIdx + 80)
    expect(rolesLine).toContain("'district_supervisor'")
  })

  it("source contains TERRITORY_ROLES with 'regional_manager'", async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    const rolesIdx  = src.indexOf('TERRITORY_ROLES')
    const rolesLine = src.slice(rolesIdx, rolesIdx + 80)
    expect(rolesLine).toContain("'regional_manager'")
  })

  it("TERRITORY_ROLES does not include 'admin' or 'pharmacist'", async () => {
    const src       = (await import('../../services/territoryValidation.ts?raw')).default
    const rolesIdx  = src.indexOf("TERRITORY_ROLES =")
    const rolesLine = src.slice(rolesIdx, rolesIdx + 80)
    expect(rolesLine).not.toContain("'admin'")
    expect(rolesLine).not.toContain("'pharmacist'")
  })

  it('audit uses where filter on role', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(docsSnap([]) as any)
    await auditAllAssignedPharmacyIds()
    expect(vi.mocked(getDocs)).toHaveBeenCalledOnce()
  })
})

// ════════════════════════════════════════════════════════════
// 16. audit summary counts ok / missing / stale / errors
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — audit summary counts', () => {
  it('counts ok, missing, stale, errors across 4 users', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      docsSnap([
        userDoc('u1', 'district_supervisor', ['ph-1']),
        userDoc('u2', 'district_supervisor', null),
        userDoc('u3', 'regional_manager',    ['ph-OLD']),
        userDoc('u4', 'regional_manager',    ['ph-2']),
      ]) as any,
    )
    // u1: ok — current ['ph-1'] matches expected ['ph-1']
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', assignedPharmacyIds: ['ph-1'] }) as any)
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1'])
    // u2: missing — current null
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', assignedPharmacyIds: null }) as any)
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-2'])
    // u3: stale — current ['ph-OLD'] but expected ['ph-NEW']
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'regional_manager', assignedPharmacyIds: ['ph-OLD'] }) as any)
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-NEW'])
    // u4: error — getDoc throws
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('read error'))

    const summary = await auditAllAssignedPharmacyIds()
    expect(summary.total).toBe(4)
    expect(summary.ok).toBe(1)
    expect(summary.missing).toBe(1)
    expect(summary.stale).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.reports).toHaveLength(4)
  })

  it('empty user set returns all zeros', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(docsSnap([]) as any)
    const summary = await auditAllAssignedPharmacyIds()
    expect(summary.total).toBe(0)
    expect(summary.ok).toBe(0)
    expect(summary.missing).toBe(0)
    expect(summary.stale).toBe(0)
    expect(summary.errors).toBe(0)
    expect(summary.reports).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// 17. individual validation failure does not stop audit
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — per-user failure does not stop audit', () => {
  it('first user errors, second and third still processed', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      docsSnap([
        userDoc('u-fail', 'district_supervisor', null),
        userDoc('u-ok',   'district_supervisor', ['ph-1']),
        userDoc('u-miss', 'regional_manager',    null),
      ]) as any,
    )
    // u-fail: getDoc throws → error
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('oops'))
    // u-ok: ok
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'district_supervisor', assignedPharmacyIds: ['ph-1'] }) as any)
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce(['ph-1'])
    // u-miss: missing
    vi.mocked(getDoc)
      .mockResolvedValueOnce(userSnap({ role: 'regional_manager', assignedPharmacyIds: null }) as any)
    vi.mocked(computeAssignedPharmacyIdsForUser).mockResolvedValueOnce([])

    const summary = await auditAllAssignedPharmacyIds()
    expect(summary.total).toBe(3)
    expect(summary.errors).toBe(1)
    expect(summary.ok).toBe(1)
    expect(summary.missing).toBe(1)
  })

  it('audit does NOT throw when individual validation fails', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      docsSnap([userDoc('u-bad', 'district_supervisor', null)]) as any,
    )
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('boom'))
    await expect(auditAllAssignedPharmacyIds()).resolves.not.toThrow()
  })

  it('audit throws only if initial getDocs query fails', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('Firestore down'))
    await expect(auditAllAssignedPharmacyIds()).rejects.toThrow('Firestore down')
  })
})

// ════════════════════════════════════════════════════════════
// 18. No UI
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — no UI', () => {
  it('territoryValidation has no React imports', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain("from 'react'")
    expect(src).not.toContain('useState')
    expect(src).not.toContain('useEffect')
  })

  it('territoryValidation has no JSX elements', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain('</div>')
    expect(src).not.toContain('<button')
    expect(src).not.toContain('onClick')
  })
})

// ════════════════════════════════════════════════════════════
// 19. No Scope Resolver
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — no Scope Resolver', () => {
  it('territoryValidation does not contain resolveScope', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain('resolveScope')
    expect(src).not.toContain('accessScopes')
  })
})

// ════════════════════════════════════════════════════════════
// 20. No Firestore rules changes
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — no Firestore rules logic', () => {
  it('territoryValidation does not reference security rules', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain('security.rules')
    expect(src).not.toContain('firestore.rules')
    expect(src).not.toContain('allow read')
    expect(src).not.toContain('allow write')
  })
})

// ════════════════════════════════════════════════════════════
// 21. No automatic repair / backfill call
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3F — no automatic repair or backfill', () => {
  it('territoryValidation does not call recomputeAssignedPharmacyIds', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain('recomputeAssignedPharmacyIds')
  })

  it('territoryValidation does not call backfillAllAssignedPharmacyIds', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    expect(src).not.toContain('backfillAllAssignedPharmacyIds')
  })

  it('validateAssignedPharmacyIds does not write to Firestore', async () => {
    const src = (await import('../../services/territoryValidation.ts?raw')).default
    // No updateDoc or setDoc in this file
    expect(src).not.toContain('updateDoc')
    expect(src).not.toContain('setDoc')
  })
})
