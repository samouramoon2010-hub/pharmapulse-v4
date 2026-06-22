// ============================================================
// Limited Rollout Preparatory Fix — Tests
//
// Task 1 — system_config Firestore rules
//   1.  system_config rule block exists in firestore.rules
//   2.  admin has read access
//   3.  admin has write access
//   4.  non-admin roles are not granted access
//   5.  rule block documents the security invariant
//
// Task 2 — scoped getActiveEngine
//   6.  no scope + no document → 'v1'
//   7.  no scope + activeEngine='v1' → 'v1'
//   8.  no scope + activeEngine='v2' → 'v2' (global promotion)
//   9.  no scope + unknown value → 'v1'
//  10.  Firestore error → 'v1' (safe fallback)
//  11.  scope + no rollout object → 'v1'
//  12.  scope + rollout.engine='v2' + matching branch + matching month → 'v2'
//  13.  scope + rollout.engine='v2' + matching branch + WRONG month → 'v1'
//  14.  scope + rollout.engine='v2' + WRONG branch + matching month → 'v1'
//  15.  scope + rollout.engine='v2' + no branches array → 'v1'
//  16.  scope + rollout.engine='v1' (explicit v1 rollout) → 'v1'
//  17.  scope + rollout engine + multiple branches, month in list → 'v2'
//  18.  scope + rollout engine + multiple months, branch in list → 'v2'
//  19.  isValidActiveEngine covers 'v1', 'v2', and rejects others
//  20.  system_config rule does NOT use isMgr or isAny
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActiveEngine, isValidActiveEngine } from './evaluationEngineConfigService'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('./firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL:  { SYSTEM_CONFIG: 'system_config' },
}))

vi.mock('firebase/firestore', () => ({
  doc:    vi.fn((_db: unknown, path: string) => ({ __path: path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
}))

function mockFirestoreDoc(data: Record<string, unknown> | null) {
  return async () => ({
    exists: () => data !== null,
    data:   () => data,
  })
}

// ════════════════════════════════════════════════════════════════
// Task 1 — system_config Firestore rules
// ════════════════════════════════════════════════════════════════

describe('Task 1 — system_config Firestore rules', () => {
  async function getRules() {
    const src = await import('../../firestore.rules?raw')
    return src.default
  }

  it('system_config rule block exists', async () => {
    const rules = await getRules()
    expect(rules).toContain("match /system_config/{document}")
  })

  it('admin has read access', async () => {
    const rules = await getRules()
    const idx   = rules.indexOf('match /system_config/{document}')
    const block = rules.slice(idx, idx + 400)
    expect(block).toContain('allow read:')
    expect(block).toContain('isAdmin()')
  })

  it('admin has write access', async () => {
    const rules = await getRules()
    const idx   = rules.indexOf('match /system_config/{document}')
    const block = rules.slice(idx, idx + 400)
    expect(block).toContain('allow write:')
    // Write must also be gated on isAdmin
    const writeBlock = block.slice(block.indexOf('allow write:'))
    expect(writeBlock).toContain('isAdmin()')
  })

  it('rule block does not grant access to isMgr or isAny', async () => {
    const rules = await getRules()
    const idx   = rules.indexOf('match /system_config/{document}')
    const block = rules.slice(idx, idx + 500)
    expect(block).not.toContain('isMgr()')
    expect(block).not.toContain('isAny()')
  })

  it('rule comment documents the security invariant', async () => {
    const rules = await getRules()
    const idx   = rules.indexOf('RUNTIME FEATURE FLAGS')
    expect(idx).toBeGreaterThan(0)
    const comment = rules.slice(idx, idx + 300)
    expect(comment.toLowerCase()).toMatch(/admin.*only|no access|feature flag/i)
  })
})

// ════════════════════════════════════════════════════════════════
// Task 2 — getActiveEngine: global (no scope) behaviour
// ════════════════════════════════════════════════════════════════

describe('getActiveEngine — global (no scope)', () => {
  beforeEach(() => vi.resetAllMocks())

  it("document missing → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc(null))
    expect(await getActiveEngine()).toBe('v1')
  })

  it("activeEngine = 'v1' → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v1' }))
    expect(await getActiveEngine()).toBe('v1')
  })

  it("activeEngine = 'v2' (global promotion) → 'v2'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v2' }))
    expect(await getActiveEngine()).toBe('v2')
  })

  it("activeEngine = unknown value → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v99' }))
    expect(await getActiveEngine()).toBe('v1')
  })

  it("Firestore error → 'v1' (safe fallback)", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('permission-denied'))
    expect(await getActiveEngine()).toBe('v1')
  })
})

// ════════════════════════════════════════════════════════════════
// Task 2 — getActiveEngine: scoped (Limited Rollout) behaviour
// ════════════════════════════════════════════════════════════════

const SCOPE_ATHEER   = { pharmacyId: 'ph-atheer', month: '2026-06' }
const SCOPE_RIYADH   = { pharmacyId: 'ph-riyadh', month: '2026-06' }
const SCOPE_DIFF_MON = { pharmacyId: 'ph-atheer', month: '2026-07' }

const ROLLOUT_CONFIG = {
  activeEngine: 'v1',
  rollout: {
    engine:   'v2',
    branches: ['ph-atheer'],
    months:   ['2026-06'],
  },
}

describe('getActiveEngine — scoped (Limited Rollout)', () => {
  beforeEach(() => vi.resetAllMocks())

  it("scope provided + no rollout object → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v1' }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v1')
  })

  it("scope matches rollout branch AND month → 'v2'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc(ROLLOUT_CONFIG))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v2')
  })

  it("scope: matching branch but WRONG month → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc(ROLLOUT_CONFIG))
    expect(await getActiveEngine(SCOPE_DIFF_MON)).toBe('v1')
  })

  it("scope: WRONG branch but matching month → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc(ROLLOUT_CONFIG))
    expect(await getActiveEngine(SCOPE_RIYADH)).toBe('v1')
  })

  it("scope: rollout.branches missing → 'v1' (safe)", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: { engine: 'v2', months: ['2026-06'] },  // no branches array
    }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v1')
  })

  it("scope: rollout.months missing → 'v1' (safe)", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: { engine: 'v2', branches: ['ph-atheer'] },  // no months array
    }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v1')
  })

  it("scope: rollout.engine = 'v1' explicitly → 'v1'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: { engine: 'v1', branches: ['ph-atheer'], months: ['2026-06'] },
    }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v1')
  })

  it("scope: multiple branches in rollout, pharmacyId in list → 'v2'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: {
        engine:   'v2',
        branches: ['ph-other', 'ph-atheer', 'ph-another'],
        months:   ['2026-06'],
      },
    }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v2')
  })

  it("scope: multiple months in rollout, month in list → 'v2'", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: {
        engine:   'v2',
        branches: ['ph-atheer'],
        months:   ['2026-04', '2026-05', '2026-06'],
      },
    }))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v2')
  })

  it("scope provided but does NOT match → does not fall through to global 'v2'", async () => {
    // Even if activeEngine='v2' globally, if scope is provided and doesn't match rollout → 'v1'
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      activeEngine: 'v2',                   // global says v2
      rollout: {
        engine:   'v2',
        branches: ['ph-atheer'],
        months:   ['2026-06'],
      },
    }))
    // Wrong branch — should get v1 even though global activeEngine='v2'
    expect(await getActiveEngine(SCOPE_RIYADH)).toBe('v1')
  })

  it("Firestore error with scope → 'v1' (safe fallback)", async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('network-unavailable'))
    expect(await getActiveEngine(SCOPE_ATHEER)).toBe('v1')
  })
})

// ════════════════════════════════════════════════════════════════
// isValidActiveEngine
// ════════════════════════════════════════════════════════════════

describe('isValidActiveEngine', () => {
  it("'v1' is valid", () => { expect(isValidActiveEngine('v1')).toBe(true) })
  it("'v2' is valid", () => { expect(isValidActiveEngine('v2')).toBe(true) })
  it("'v3' is not valid", () => { expect(isValidActiveEngine('v3')).toBe(false) })
  it("undefined is not valid", () => { expect(isValidActiveEngine(undefined)).toBe(false) })
  it("null is not valid", () => { expect(isValidActiveEngine(null)).toBe(false) })
})
