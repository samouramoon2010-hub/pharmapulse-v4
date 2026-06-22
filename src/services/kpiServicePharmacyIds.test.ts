// ============================================================
// kpiService — fetchKpiEntriesRange pharmacyIds extension
// Phase 2F-3: Scope-driven multi-branch fetch
//
// Tests cover:
//   1. pharmacyIds=[] returns [] without calling getDocs
//   2. pharmacyIds length <= 30 uses single 'in' query
//   3. pharmacyIds length > 30 chunks into multiple queries
//   4. duplicate docs from chunk overlap are deduplicated by id
//   5. existing pharmacyId single-branch behavior unchanged
//   6. no-options all-branches behavior unchanged
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'test-uid' } },
  COL: {
    KPI_ENTRIES:        'kpi_entries',
    TARGETS:            'targets',
    AUDIT_LOGS:         'audit_logs',
    USERS:              'users',
    PHARMACIES:         'pharmacies',
    NOTIFICATIONS:      'notifications',
    LEADERBOARD:        'leaderboard',
    KPI_REGISTRY:       'kpi_registry',
    DAILY_SUMMARIES:    'daily_summaries',
    MONTHLY_SUMMARIES:  'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS:     'risk_snapshots',
    RANKING_HISTORY:    'ranking_history',
    STAGING_ENTRIES:    'staging_entries',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({ _type: 'colRef' })),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  deleteDoc:       vi.fn(async () => {}),
  query:           vi.fn((...args) => ({ _query: true, _args: args })),
  where:           vi.fn((field, op, val) => ({ _where: `${field}${op}${String(val)}` })),
  orderBy:         vi.fn((field, dir)     => ({ _orderBy: `${field}:${dir}` })),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'mock-id' })),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE:'create', UPDATE:'update', DELETE:'delete',
                  LOGIN:'login', LOGOUT:'logout', IMPORT:'import' },
}))

vi.mock('../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

import { fetchKpiEntriesRange } from '../services/kpiService'
import { getDocs, where, orderBy } from 'firebase/firestore'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
})

// ════════════════════════════════════════════════════════════
// 1. pharmacyIds = [] → early return, no fetch
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — pharmacyIds=[]', () => {
  it('returns [] immediately without calling getDocs', async () => {
    const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: [] })
    expect(result).toEqual([])
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('returns a resolved Promise (not a rejection)', async () => {
    await expect(
      fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: [] })
    ).resolves.toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 2. pharmacyIds length <= 30 → single 'in' query
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — pharmacyIds <=30 (single in-query)', () => {
  it('calls getDocs exactly once for a list of 3 pharmacy ids', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', {
      pharmacyIds: ['ph-1', 'ph-2', 'ph-3'],
    })
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it("uses where('pharmacyId', 'in', ...) clause", async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', {
      pharmacyIds: ['ph-1', 'ph-2'],
    })
    expect(where).toHaveBeenCalledWith('pharmacyId', 'in', ['ph-1', 'ph-2'])
  })

  it('calls getDocs once for exactly 30 pharmacy ids (boundary)', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `ph-${i}`)
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ids })
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('still applies date range filters', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ['ph-1'] })
    expect(where).toHaveBeenCalledWith('date', '>=', '2025-04-01')
    expect(where).toHaveBeenCalledWith('date', '<=', '2025-04-30')
  })

  it('resolves to an array', async () => {
    const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30', {
      pharmacyIds: ['ph-1'],
    })
    expect(Array.isArray(result)).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 3. pharmacyIds length > 30 → multiple chunked queries
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — pharmacyIds >30 (chunked queries)', () => {
  it('calls getDocs twice for 31 pharmacy ids (one full chunk + one remainder)', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `ph-${i}`)
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ids })
    expect(getDocs).toHaveBeenCalledTimes(2)
  })

  it('calls getDocs three times for 61 pharmacy ids', async () => {
    const ids = Array.from({ length: 61 }, (_, i) => `ph-${i}`)
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ids })
    expect(getDocs).toHaveBeenCalledTimes(3)
  })

  it('first chunk uses exactly 30 ids', async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `ph-${i}`)
    const inCalls: unknown[][] = []
    vi.mocked(where).mockImplementation((field, op, val) => {
      if (field === 'pharmacyId' && op === 'in') inCalls.push(val as unknown[])
      return { _where: `${field}${op}${String(val)}` } as any
    })
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ids })
    expect(inCalls[0]).toHaveLength(30)
    expect(inCalls[1]).toHaveLength(5)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Deduplication by document id
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — duplicate doc deduplication', () => {
  it('deduplicates docs with the same id appearing in multiple chunk results', async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `ph-${i}`)
    const dupDoc = { id: 'entry-dup', data: () => ({ userId: 'u1', date: '2025-04-10', wasfaty: 5 }) }

    vi.mocked(getDocs).mockImplementation(async () => {
      // Both chunks return the same doc to simulate overlap
      return { docs: [dupDoc] } as any
    })

    const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyIds: ids })
    // Deduplication by id means only 1 entry, not 2
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('entry-dup')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Existing pharmacyId behavior unchanged
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — pharmacyId single-branch (unchanged)', () => {
  it('still uses == query for pharmacyId', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyId: 'ph-001' })
    expect(where).toHaveBeenCalledWith('pharmacyId', '==', 'ph-001')
  })

  it('does NOT use in query for pharmacyId', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyId: 'ph-001' })
    const inCalls = vi.mocked(where).mock.calls.filter(([, op]) => op === 'in')
    expect(inCalls).toHaveLength(0)
  })

  it('calls getDocs exactly once', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyId: 'ph-001' })
    expect(getDocs).toHaveBeenCalledTimes(1)
  })
})

// ════════════════════════════════════════════════════════════
// 6. No-options all-branches behavior unchanged
// ════════════════════════════════════════════════════════════

describe('fetchKpiEntriesRange — no options (all-branches, unchanged)', () => {
  it('calls getDocs once with no pharmacyId filter', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
    expect(getDocs).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(where).mock.calls
    expect(calls.some(([field]) => field === 'pharmacyId')).toBe(false)
  })

  it('still applies orderBy date desc', async () => {
    await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
    expect(orderBy).toHaveBeenCalledWith('date', 'desc')
  })
})
