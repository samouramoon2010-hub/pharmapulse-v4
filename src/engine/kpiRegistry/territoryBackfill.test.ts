// ============================================================
// Territory Backfill Engine — Phase 1B-3E Regression Tests
//
// Verifies backfillAllAssignedPharmacyIds():
//
//  Role scope:
//   - only district_supervisor and regional_manager are processed
//   - admin, branch_manager, pharmacist are skipped (query filter)
//
//  Algorithm:
//   - calls recomputeAssignedPharmacyIds for each user
//   - counts updated / unchanged correctly
//   - captures per-user failures in failures[]
//   - never stops on a per-user failure
//   - throws only if the initial Firestore query fails
//   - idempotent: second run with no changes produces updated=0
//
//  Scope guardrails (source-level):
//   - no validation utilities
//   - no Scope Resolver
//   - no UI imports / JSX
//   - no automatic execution (setInterval / cron)
//
// Behavioral tests use vi.mock for Firestore + territorySync.
// Source-level tests use ?raw imports.
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
  getDocs:         vi.fn(async () => ({ empty: true, docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/territorySync', () => ({
  recomputeAssignedPharmacyIds: vi.fn(async () => ({
    changed: false, previous: null, current: null,
  })),
}))

// ── Imports after mocks ────────────────────────────────────────

import { getDocs }                          from 'firebase/firestore'
import { recomputeAssignedPharmacyIds }     from '../../services/territorySync'
import { backfillAllAssignedPharmacyIds }   from '../../services/territoryBackfill'

// ── Helpers ───────────────────────────────────────────────────

function makeUserDoc(uid: string, role: string, displayName = `User-${uid}`) {
  return { id: uid, data: () => ({ role, displayName }) }
}

function makeDocsSnap(users: ReturnType<typeof makeUserDoc>[]) {
  return { empty: users.length === 0, docs: users }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ════════════════════════════════════════════════════════════
// 1. district_supervisor users are processed
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — district_supervisor is processed', () => {
  it("TERRITORY_ROLES includes 'district_supervisor'", async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).toContain("'district_supervisor'")
  })

  it('recompute is called for a district_supervisor user', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([makeUserDoc('sup-1', 'district_supervisor')]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds).mockResolvedValueOnce(
      { changed: true, previous: null, current: ['ph-1'] },
    )
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(1)
    expect(vi.mocked(recomputeAssignedPharmacyIds)).toHaveBeenCalledWith('sup-1', 'actor', 'admin')
  })
})

// ════════════════════════════════════════════════════════════
// 2. regional_manager users are processed
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — regional_manager is processed', () => {
  it("TERRITORY_ROLES includes 'regional_manager'", async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).toContain("'regional_manager'")
  })

  it('recompute is called for a regional_manager user', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([makeUserDoc('mgr-1', 'regional_manager')]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds).mockResolvedValueOnce(
      { changed: false, previous: ['ph-1'], current: ['ph-1'] },
    )
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(1)
    expect(vi.mocked(recomputeAssignedPharmacyIds)).toHaveBeenCalledWith('mgr-1', 'actor', 'admin')
  })
})

// ════════════════════════════════════════════════════════════
// 3. admin users are excluded from the query
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — admin is excluded', () => {
  it("TERRITORY_ROLES does not include 'admin'", async () => {
    const src     = (await import('../../services/territoryBackfill.ts?raw')).default
    // The TERRITORY_ROLES array definition must not contain 'admin'
    const rolesIdx = src.indexOf('TERRITORY_ROLES')
    const rolesLine = src.slice(rolesIdx, rolesIdx + 120)
    expect(rolesLine).not.toContain("'admin'")
  })

  it('backfill with zero matching users returns scanned=0', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(makeDocsSnap([]) as any)
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(0)
    expect(vi.mocked(recomputeAssignedPharmacyIds)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════
// 4. branch_manager is excluded from the query
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — branch_manager is excluded', () => {
  it("TERRITORY_ROLES does not include 'branch_manager'", async () => {
    const src      = (await import('../../services/territoryBackfill.ts?raw')).default
    const rolesIdx = src.indexOf('TERRITORY_ROLES')
    const rolesLine = src.slice(rolesIdx, rolesIdx + 120)
    expect(rolesLine).not.toContain("'branch_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 5. pharmacist is excluded from the query
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — pharmacist is excluded', () => {
  it("TERRITORY_ROLES does not include 'pharmacist'", async () => {
    const src      = (await import('../../services/territoryBackfill.ts?raw')).default
    const rolesIdx = src.indexOf('TERRITORY_ROLES')
    const rolesLine = src.slice(rolesIdx, rolesIdx + 120)
    expect(rolesLine).not.toContain("'pharmacist'")
  })
})

// ════════════════════════════════════════════════════════════
// 6. recompute called once per user
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — recompute called once per user', () => {
  it('two users → recompute called twice', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-1', 'district_supervisor'),
        makeUserDoc('mgr-1', 'regional_manager'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockResolvedValueOnce({ changed: true,  previous: null,     current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: false, previous: ['ph-2'], current: ['ph-2'] })
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(2)
    expect(vi.mocked(recomputeAssignedPharmacyIds)).toHaveBeenCalledTimes(2)
  })
})

// ════════════════════════════════════════════════════════════
// 7. updated counted correctly
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — updated counted', () => {
  it('changed=true increments updated', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-1', 'district_supervisor'),
        makeUserDoc('sup-2', 'district_supervisor'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockResolvedValueOnce({ changed: true, previous: null, current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: true, previous: null, current: ['ph-2'] })
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.updated).toBe(2)
    expect(result.unchanged).toBe(0)
    expect(result.failed).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 8. unchanged counted correctly
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — unchanged counted', () => {
  it('changed=false increments unchanged', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-1', 'district_supervisor'),
        makeUserDoc('mgr-1', 'regional_manager'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockResolvedValueOnce({ changed: false, previous: ['ph-1'], current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: false, previous: ['ph-2'], current: ['ph-2'] })
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.unchanged).toBe(2)
    expect(result.updated).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 9. failures collected per failing user
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — failures collected', () => {
  it('thrown error captured in failures[] with uid and message', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([makeUserDoc('sup-bad', 'district_supervisor', 'BadUser')]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds).mockRejectedValueOnce(
      new Error('Firestore timeout'),
    )
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.failed).toBe(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].uid).toBe('sup-bad')
    expect(result.failures[0].displayName).toBe('BadUser')
    expect(result.failures[0].error).toContain('Firestore timeout')
  })

  it('updated + unchanged + failed sums to scanned', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-1', 'district_supervisor'),
        makeUserDoc('sup-2', 'district_supervisor'),
        makeUserDoc('mgr-1', 'regional_manager'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockResolvedValueOnce({ changed: true,  previous: null,     current: ['ph-1'] })
      .mockRejectedValueOnce(new Error('oops'))
      .mockResolvedValueOnce({ changed: false, previous: ['ph-2'], current: ['ph-2'] })
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(3)
    expect(result.updated + result.unchanged + result.failed).toBe(3)
  })
})

// ════════════════════════════════════════════════════════════
// 10. partial failures do not stop the loop
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — partial failures do not stop processing', () => {
  it('first user fails, remaining users are still processed', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-fail', 'district_supervisor', 'FailUser'),
        makeUserDoc('sup-ok',   'district_supervisor', 'OkUser'),
        makeUserDoc('mgr-ok',   'regional_manager',    'OkMgr'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce({ changed: true,  previous: null,     current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: false, previous: ['ph-2'], current: ['ph-2'] })
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(3)
    expect(result.failed).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.unchanged).toBe(1)
    expect(vi.mocked(recomputeAssignedPharmacyIds)).toHaveBeenCalledTimes(3)
  })

  it('last user fails, earlier users are counted correctly', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      makeDocsSnap([
        makeUserDoc('sup-1', 'district_supervisor'),
        makeUserDoc('sup-2', 'district_supervisor'),
        makeUserDoc('mgr-fail', 'regional_manager', 'FailMgr'),
      ]) as any,
    )
    vi.mocked(recomputeAssignedPharmacyIds)
      .mockResolvedValueOnce({ changed: true,  previous: null,  current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: true,  previous: null,  current: ['ph-2'] })
      .mockRejectedValueOnce(new Error('last fails'))
    const result = await backfillAllAssignedPharmacyIds('actor', 'admin')
    expect(result.scanned).toBe(3)
    expect(result.updated).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.failures[0].uid).toBe('mgr-fail')
  })
})

// ════════════════════════════════════════════════════════════
// 11. initial query failure throws
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — initial query failure propagates', () => {
  it('throws when getDocs fails — no partial result returned', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('Firestore unavailable'))
    await expect(
      backfillAllAssignedPharmacyIds('actor', 'admin'),
    ).rejects.toThrow('Firestore unavailable')
  })

  it('recompute is never called if initial query fails', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('network error'))
    await backfillAllAssignedPharmacyIds('actor', 'admin').catch(() => {})
    expect(vi.mocked(recomputeAssignedPharmacyIds)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════
// 12. idempotent second run — updated=0 when nothing changed
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — idempotent second run', () => {
  it('second run with no hierarchy changes returns updated=0', async () => {
    const users = makeDocsSnap([
      makeUserDoc('sup-1', 'district_supervisor'),
      makeUserDoc('mgr-1', 'regional_manager'),
    ])
    vi.mocked(getDocs)
      .mockResolvedValueOnce(users as any) // first run
      .mockResolvedValueOnce(users as any) // second run
    vi.mocked(recomputeAssignedPharmacyIds)
      // First run — some changes
      .mockResolvedValueOnce({ changed: true,  previous: null,     current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: true,  previous: null,     current: ['ph-2'] })
      // Second run — everything already up to date
      .mockResolvedValueOnce({ changed: false, previous: ['ph-1'], current: ['ph-1'] })
      .mockResolvedValueOnce({ changed: false, previous: ['ph-2'], current: ['ph-2'] })

    const first  = await backfillAllAssignedPharmacyIds('actor', 'admin')
    const second = await backfillAllAssignedPharmacyIds('actor', 'admin')

    expect(first.updated).toBe(2)
    expect(second.updated).toBe(0)
    expect(second.unchanged).toBe(2)
    expect(second.scanned).toBe(second.unchanged)
  })
})

// ════════════════════════════════════════════════════════════
// 13. No validation utilities
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — no validation utilities (Sprint 1B-3F)', () => {
  it('territoryBackfill does not export validateAssignedPharmacyIds', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('validateAssignedPharmacyIds')
  })

  it('territoryBackfill does not export auditAllAssignedPharmacyIds', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('auditAllAssignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 14. No Scope Resolver
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — no Scope Resolver', () => {
  it('territoryBackfill does not contain resolveScope', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('resolveScope')
    expect(src).not.toContain('accessScopes')
  })
})

// ════════════════════════════════════════════════════════════
// 15. No UI
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — no UI', () => {
  it('territoryBackfill has no React imports', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain("from 'react'")
    expect(src).not.toContain('useState')
    expect(src).not.toContain('useEffect')
  })

  it('territoryBackfill has no JSX', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('</div>')
    expect(src).not.toContain('<button')
    expect(src).not.toContain('onClick')
  })
})

// ════════════════════════════════════════════════════════════
// 16. No automatic execution
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3E — no automatic execution', () => {
  it('territoryBackfill does not schedule itself with setInterval', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('setInterval')
    expect(src).not.toContain('setTimeout')
    expect(src).not.toContain('cron')
  })

  it('territoryBackfill does not subscribe to Firestore events', async () => {
    const src = (await import('../../services/territoryBackfill.ts?raw')).default
    expect(src).not.toContain('onSnapshot')
  })

  it('backfillAllAssignedPharmacyIds is only called when explicitly invoked', async () => {
    // Verifies there is no top-level call to the function in the module itself.
    // The string 'backfillAllAssignedPharmacyIds(' should appear exactly once — the definition.
    const src         = (await import('../../services/territoryBackfill.ts?raw')).default
    const occurrences = [...src.matchAll(/backfillAllAssignedPharmacyIds\(/g)].length
    expect(occurrences).toBe(1)
  })
})
