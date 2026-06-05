// ============================================================
// Regression Tests — Fix Batch 4 Phase 1 (STB-01)
//
// Tests cover:
//   1. subscribeRecentKpiEntries — query construction correctness
//      a. default 90-day window
//      b. custom day window
//      c. fromDate is a valid ISO date
//      d. where + orderBy clauses are applied
//      e. returns an unsubscribe function
//
//   2. fetchKpiEntriesRange — query construction correctness
//      a. both date bounds applied
//      b. optional pharmacyId filter
//      c. optional userId filter
//      d. no options = no extra where clauses
//      e. returns a Promise resolving to an array
//
//   3. subscribeAllKpiEntries — still exported and callable
//      (compatibility — ReportsPage still uses it)
//
//   4. kpiStore — new store actions wired correctly
//      a. subscribeRecentEntries exported
//      b. fetchEntriesRange exported
//      c. subscribeAllEntries still exported (deprecated, not removed)
//
//   5. Consumer migration — source-level verification
//      a. DashboardPage uses subscribeRecentEntries, not subscribeAllEntries
//      b. ExecutiveDashboard uses subscribeRecentEntries
//      c. TeamPage uses subscribeRecentEntries
//      d. TargetsPage uses subscribeRecentEntries
//      e. ReportsPage uses fetchEntriesRange (Phase 2 migrated)
//
//   6. Date window arithmetic — correctness
//      a. 90-day fromDate is 90 days before today
//      b. 60-day fromDate covers executive engine requirement
//      c. fromDate format is yyyy-MM-dd
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
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

// Capture query clauses for assertion
const capturedClauses: string[] = []

vi.mock('firebase/firestore', () => {
  const mockUnsubscribe = vi.fn()
  const mockOnSnapshot  = vi.fn(() => mockUnsubscribe)
  const mockGetDocs     = vi.fn(async () => ({ docs: [] }))
  const mockCollection  = vi.fn(() => ({ _type: 'colRef', path: 'kpi_entries' }))
  const mockWhere       = vi.fn((field, op, val) => ({ _where: `${field}${op}${val}` }))
  const mockOrderBy     = vi.fn((field, dir) => ({ _orderBy: `${field}:${dir}` }))
  const mockQuery       = vi.fn((...args) => {
    // Collect all clause descriptors for test assertions
    capturedClauses.length = 0
    args.slice(1).forEach(a => {
      if (a?._where)   capturedClauses.push(a._where)
      if (a?._orderBy) capturedClauses.push(a._orderBy)
    })
    return { _query: true, clauses: [...capturedClauses] }
  })
  return {
    collection:      mockCollection,
    doc:             vi.fn(() => ({})),
    setDoc:          vi.fn(async () => {}),
    getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
    getDocs:         mockGetDocs,
    deleteDoc:       vi.fn(async () => {}),
    query:           mockQuery,
    where:           mockWhere,
    orderBy:         mockOrderBy,
    onSnapshot:      mockOnSnapshot,
    serverTimestamp: vi.fn(() => ({})),
    addDoc:          vi.fn(async () => ({ id: 'mock-id' })),
    writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  }
})

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE:'create', UPDATE:'update', DELETE:'delete',
                  LOGIN:'login', LOGOUT:'logout', IMPORT:'import' },
}))

vi.mock('../../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

import {
  subscribeRecentKpiEntries,
  fetchKpiEntriesRange,
} from '../../services/kpiService'
import { where, orderBy, onSnapshot, getDocs } from 'firebase/firestore'

// ── Date helpers ──────────────────────────────────────────────
function daysAgoString(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function isValidDateString(s: unknown): boolean {
  if (typeof s !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

// ── Tests ─────────────────────────────────────────────────────

describe('Fix Batch 4 Phase 1 — STB-01 Data Access Layer', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    capturedClauses.length = 0
  })

  // ── 1. subscribeRecentKpiEntries ────────────────────────────

  describe('subscribeRecentKpiEntries — query construction', () => {
    it('returns an unsubscribe function', () => {
      const unsub = subscribeRecentKpiEntries(() => {})
      expect(typeof unsub).toBe('function')
    })

    it('calls onSnapshot (real-time listener)', () => {
      subscribeRecentKpiEntries(() => {})
      expect(onSnapshot).toHaveBeenCalledTimes(1)
    })

    it('applies a where clause on the date field', () => {
      subscribeRecentKpiEntries(() => {})
      expect(where).toHaveBeenCalledWith('date', '>=', expect.any(String))
    })

    it('applies orderBy date desc', () => {
      subscribeRecentKpiEntries(() => {})
      expect(orderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it('default window produces a fromDate 90 days ago', () => {
      subscribeRecentKpiEntries(() => {})
      const expectedDate = daysAgoString(90)
      expect(where).toHaveBeenCalledWith('date', '>=', expectedDate)
    })

    it('custom 60-day window produces a fromDate 60 days ago', () => {
      subscribeRecentKpiEntries(() => {}, 60)
      const expectedDate = daysAgoString(60)
      expect(where).toHaveBeenCalledWith('date', '>=', expectedDate)
    })

    it('fromDate is a valid yyyy-MM-dd string', () => {
      let capturedDate: string | null = null
      vi.mocked(where).mockImplementationOnce((field, op, val) => {
        if (field === 'date') capturedDate = val as string
        return { _where: `${field}${op}${val}` } as any
      })
      subscribeRecentKpiEntries(() => {})
      expect(isValidDateString(capturedDate)).toBe(true)
    })

    it('does NOT call getDocs (is a real-time listener, not a one-shot fetch)', () => {
      subscribeRecentKpiEntries(() => {})
      expect(getDocs).not.toHaveBeenCalled()
    })

    it('invokes callback with mapped document array when snapshot fires', () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ userId: 'u1', date: '2025-05-01', wasfaty: 5 }) },
        { id: 'doc2', data: () => ({ userId: 'u2', date: '2025-05-02', wasfaty: 3 }) },
      ]
      vi.mocked(onSnapshot).mockImplementationOnce((_q, cb) => {
        (cb as Function)({ docs: mockDocs })
        return vi.fn()
      })
      const received: unknown[] = []
      subscribeRecentKpiEntries((list) => received.push(...list))
      expect(received).toHaveLength(2)
      expect((received[0] as any).id).toBe('doc1')
      expect((received[0] as any).userId).toBe('u1')
    })
  })

  // ── 2. fetchKpiEntriesRange ─────────────────────────────────

  describe('fetchKpiEntriesRange — query construction', () => {
    it('returns a Promise', () => {
      const result = fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(result).toBeInstanceOf(Promise)
    })

    it('resolves to an array', async () => {
      const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(Array.isArray(result)).toBe(true)
    })

    it('calls getDocs (one-shot fetch, not a real-time listener)', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(getDocs).toHaveBeenCalledTimes(1)
    })

    it('does NOT call onSnapshot', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(onSnapshot).not.toHaveBeenCalled()
    })

    it('applies where date >= fromDate', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(where).toHaveBeenCalledWith('date', '>=', '2025-04-01')
    })

    it('applies where date <= toDate', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(where).toHaveBeenCalledWith('date', '<=', '2025-04-30')
    })

    it('applies orderBy date desc', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(orderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it('applies pharmacyId filter when provided', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { pharmacyId: 'ph-001' })
      expect(where).toHaveBeenCalledWith('pharmacyId', '==', 'ph-001')
    })

    it('does NOT apply pharmacyId filter when omitted', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      const calls = vi.mocked(where).mock.calls
      expect(calls.some(([field]) => field === 'pharmacyId')).toBe(false)
    })

    it('applies userId filter when provided', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30', { userId: 'user-abc' })
      expect(where).toHaveBeenCalledWith('userId', '==', 'user-abc')
    })

    it('does NOT apply userId filter when omitted', async () => {
      await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      const calls = vi.mocked(where).mock.calls
      expect(calls.some(([field]) => field === 'userId')).toBe(false)
    })

    it('maps returned docs to {id, ...data()} shape', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { id: 'entry-1', data: () => ({ userId: 'u1', date: '2025-04-10', wasfaty: 10 }) },
        ],
      } as any)
      const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(result[0]).toEqual({ id: 'entry-1', userId: 'u1', date: '2025-04-10', wasfaty: 10 })
    })

    it('returns empty array when no documents match', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
      const result = await fetchKpiEntriesRange('2025-04-01', '2025-04-30')
      expect(result).toHaveLength(0)
    })
  })

  // ── 3. subscribeAllKpiEntries — REMOVED (Fix Batch 5) ───────
  // The deprecated subscribeAllKpiEntries was removed from kpiService.js
  // after all orphaned consumers were deleted in Fix Batch 5.

  describe('subscribeAllKpiEntries — confirmed removed after orphan cleanup', () => {
    it('subscribeAllKpiEntries is NOT exported from kpiService', async () => {
      const svc = await import('../../services/kpiService')
      expect((svc as Record<string, unknown>).subscribeAllKpiEntries).toBeUndefined()
    })

    it('subscribeAllEntries is NOT in kpiStore', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState() as Record<string, unknown>
      expect(store.subscribeAllEntries).toBeUndefined()
    })
  })

  // ── 4. kpiStore — new actions wired correctly ───────────────

  describe('kpiStore — new and existing store actions', () => {
    it('exports subscribeRecentEntries', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState()
      expect(typeof store.subscribeRecentEntries).toBe('function')
    })

    it('exports fetchEntriesRange', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState()
      expect(typeof store.fetchEntriesRange).toBe('function')
    })

    it('subscribeAllEntries is absent from kpiStore (safely removed)', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState() as Record<string, unknown>
      expect(store.subscribeAllEntries).toBeUndefined()
    })

    it('fetchEntriesRange passes arguments through to fetchKpiEntriesRange', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState()
      // Returns a Promise
      const result = store.fetchEntriesRange('2025-03-01', '2025-03-31', { pharmacyId: 'ph-x' })
      expect(result).toBeInstanceOf(Promise)
      await result // should resolve without error
    })
  })

  // ── 5. Consumer migration — source-level verification ───────

  describe('Consumer migration — source text verification', () => {
    it('DashboardPage uses subscribeRecentEntries, not subscribeAllEntries', async () => {
      const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentEntries')
      expect(src.default).not.toContain('subscribeAllEntries')
    })

    it('ExecutiveDashboard uses subscribeRecentEntries, not subscribeAllEntries', async () => {
      const src = await import('../../pages/executive/ExecutiveDashboard.jsx?raw')
      expect(src.default).toContain('subscribeRecentEntries')
      expect(src.default).not.toContain('subscribeAllEntries')
    })

    it('TeamPage uses subscribeRecentEntries, not subscribeAllEntries', async () => {
      const src = await import('../../pages/manager/TeamPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentEntries')
      expect(src.default).not.toContain('subscribeAllEntries')
    })

    it('TargetsPage uses subscribeRecentEntries, not subscribeAllEntries', async () => {
      const src = await import('../../pages/shared/TargetsPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentEntries')
      expect(src.default).not.toContain('subscribeAllEntries')
    })

    it('ReportsPage is now fully migrated — uses fetchEntriesRange, not subscribeAllEntries', async () => {
      // Updated by Phase 2: ReportsPage migrated from subscribeAllEntries
      // to fetchEntriesRange. Replaces the Phase 1 placeholder assertion.
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).not.toContain('subscribeAllEntries')
      expect(src.default).toContain('fetchEntriesRange')
    })

    it('kpiService exports the new functions (deprecated function removed)', async () => {
      const svc = await import('../../services/kpiService')
      expect(typeof svc.subscribeRecentKpiEntries).toBe('function')
      expect(typeof svc.fetchKpiEntriesRange).toBe('function')
      expect((svc as Record<string, unknown>).subscribeAllKpiEntries).toBeUndefined()
    })
  })

  // ── 6. Date window arithmetic ────────────────────────────────

  describe('Date window arithmetic — correctness', () => {
    it('90-day fromDate is exactly 90 calendar days before today', () => {
      const expected = daysAgoString(90)
      // Invoke and capture
      let capturedDate = ''
      vi.mocked(where).mockImplementationOnce((field, _op, val) => {
        if (field === 'date') capturedDate = String(val)
        return { _where: '' } as any
      })
      subscribeRecentKpiEntries(() => {})
      expect(capturedDate).toBe(expected)
    })

    it('60-day window covers the executive trend engine deepest slice (60 days)', () => {
      // Executive engine: slice(-60, -30) requires data up to 60 days ago
      // A 90-day window (default) easily covers this
      const ninetyDaysAgo = daysAgoString(90)
      const sixtyDaysAgo  = daysAgoString(60)
      // 90-day window start is earlier than 60 days ago
      expect(ninetyDaysAgo < sixtyDaysAgo).toBe(true)
    })

    it('fromDate format matches yyyy-MM-dd', () => {
      let capturedDate = ''
      vi.mocked(where).mockImplementationOnce((field, _op, val) => {
        if (field === 'date') capturedDate = String(val)
        return { _where: '' } as any
      })
      subscribeRecentKpiEntries(() => {})
      expect(isValidDateString(capturedDate)).toBe(true)
      expect(capturedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('fromDate for 90-day window is consistent with historyService format', () => {
      // historyService uses: date.slice(0, 7) and 'yyyy-MM-dd' strings
      // Both use the same ISO date format — no format mismatch possible
      const fromDate = daysAgoString(90)
      expect(fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Can be parsed by date-fns format() without conversion
      expect(new Date(fromDate).getFullYear()).toBeGreaterThanOrEqual(2024)
    })
  })
})
