// ============================================================
// 2026-07-07 fix — KPI Registry visibility for documents missing
// `sortOrder`.
//
// Root cause (confirmed): subscribeKpiRegistry() and
// fetchKpiRegistryOnce() both used `query(registryCol(), orderBy(
// 'sortOrder', 'asc'))`. Firestore's orderBy() silently excludes any
// document that lacks the ordered field entirely — a KPI written
// before `sortOrder` existed (e.g. `BSU`) never reached either
// function's result at all, not even as an "unknown" entry.
//
// Fix: both functions now read the collection with no server-side
// orderBy. docToKpiDefinition() (kpiRegistryLogic.ts) already defaults
// a missing sortOrder to 999, and every consumer (KpiManagementPage.jsx)
// sorts the resulting array client-side by that same field — so no
// document is ever silently dropped, and ordering stays deterministic.
//
// Proves:
//   1. a KPI document WITH sortOrder appears in subscribeKpiRegistry()
//   2. a KPI document WITHOUT sortOrder also appears
//   3. client-side ordering (the same sort KpiManagementPage.jsx uses)
//      remains deterministic across repeated calls
//   4. archived KPIs remain visible regardless of sortOrder presence
//   5. active/archived counts are accurate regardless of sortOrder presence
//   6. fetchKpiRegistryOnce() (used by bulk evaluation) has the same fix
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registryDocs = new Map<string, Record<string, unknown>>()

vi.mock('./firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-admin-uid' } },
  COL: { KPI_REGISTRY: 'kpi_registry', KPI_AUDIT_LOGS: 'kpi_audit_logs' },
}))

vi.mock('./auditService', () => ({
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
  logAction: vi.fn(async () => {}),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, _col: string, key: string) => ({ key })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  // No `query`/`orderBy` mock provided at all — if either subscribeKpiRegistry()
  // or fetchKpiRegistryOnce() still imported/called them, this suite would
  // fail to even load (proving the fix removed those calls, not just hid them).
  getDocs: vi.fn(async (ref: { name: string }) => {
    const entries = Array.from(registryDocs.entries())
    return {
      size: entries.length,
      forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) =>
        entries.forEach(([, data]) => cb({ data: () => data })),
    }
  }),
  onSnapshot: vi.fn((_ref: { name: string }, onNext: (snap: unknown) => void) => {
    const entries = Array.from(registryDocs.entries())
    onNext({
      size: entries.length,
      forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) =>
        entries.forEach(([, data]) => cb({ data: () => data })),
    })
    return () => {}
  }),
}))

import { subscribeKpiRegistry, fetchKpiRegistryOnce } from './kpiRegistryService'

function seedKpi(key: string, overrides: Record<string, unknown> = {}) {
  registryDocs.set(key, {
    key, label: key, isActive: true, uiStatus: 'ACTIVE',
    lifecycleStage: 'production_evaluation',
    ...overrides,
  })
}

beforeEach(() => { registryDocs.clear() })

describe('1 — KPI with sortOrder appears in subscribeKpiRegistry()', () => {
  it('is present in the merged registry', async () => {
    seedKpi('withOrder', { sortOrder: 10 })
    const merged = await new Promise<Record<string, any>>((resolve) => {
      subscribeKpiRegistry((registry) => resolve(registry))
    })
    expect(merged.withOrder).toBeDefined()
    expect(merged.withOrder.sortOrder).toBe(10)
  })
})

describe('2 — KPI WITHOUT sortOrder also appears (the BSU regression)', () => {
  it('is present in the merged registry, defaulted to sortOrder 999', async () => {
    seedKpi('BSU') // no sortOrder field at all, matching the real BSU document
    const merged = await new Promise<Record<string, any>>((resolve) => {
      subscribeKpiRegistry((registry) => resolve(registry))
    })
    expect(merged.BSU).toBeDefined()
    expect(merged.BSU.sortOrder).toBe(999)
  })

  it('appears alongside KPIs that do have sortOrder, not instead of them', async () => {
    seedKpi('BSU')
    seedKpi('wasfaty', { sortOrder: 10 })
    const merged = await new Promise<Record<string, any>>((resolve) => {
      subscribeKpiRegistry((registry) => resolve(registry))
    })
    expect(merged.BSU).toBeDefined()
    expect(merged.wasfaty).toBeDefined()
  })
})

describe('3 — client-side ordering remains deterministic', () => {
  it('sorting the merged registry by sortOrder produces a stable, repeatable order', async () => {
    seedKpi('c', { sortOrder: 30 })
    seedKpi('a', { sortOrder: 10 })
    seedKpi('noOrder') // defaults to 999, sorts last
    seedKpi('b', { sortOrder: 20 })

    async function getSortedKeys() {
      const merged = await new Promise<Record<string, any>>((resolve) => {
        subscribeKpiRegistry((registry) => resolve(registry))
      })
      return Object.values(merged)
        .filter((k: any) => ['c', 'a', 'noOrder', 'b'].includes(k.key))
        .sort((x: any, y: any) => x.sortOrder - y.sortOrder)
        .map((k: any) => k.key)
    }

    const run1 = await getSortedKeys()
    const run2 = await getSortedKeys()
    expect(run1).toEqual(['a', 'b', 'c', 'noOrder'])
    expect(run2).toEqual(run1) // deterministic across repeated calls
  })
})

describe('4 — archived KPIs remain visible regardless of sortOrder presence', () => {
  it('an archived KPI without sortOrder is still returned', async () => {
    seedKpi('archivedNoOrder', { isActive: false, uiStatus: 'ARCHIVED', lifecycleStage: 'archived' })
    const merged = await new Promise<Record<string, any>>((resolve) => {
      subscribeKpiRegistry((registry) => resolve(registry))
    })
    expect(merged.archivedNoOrder).toBeDefined()
    expect(merged.archivedNoOrder.isActive).toBe(false)
  })
})

describe('5 — active/archived counts are accurate regardless of sortOrder presence', () => {
  it('counts every seeded KPI exactly once, whether or not it has sortOrder', async () => {
    seedKpi('active1', { sortOrder: 1 })
    seedKpi('active2') // no sortOrder
    seedKpi('archived1', { isActive: false, uiStatus: 'ARCHIVED', sortOrder: 2 })
    seedKpi('archived2', { isActive: false, uiStatus: 'ARCHIVED' }) // no sortOrder

    const [merged, uiStatuses] = await new Promise<[Record<string, any>, Record<string, string>]>((resolve) => {
      subscribeKpiRegistry((registry, statuses) => resolve([registry, statuses]))
    })

    const seededKeys = ['active1', 'active2', 'archived1', 'archived2']
    const activeCount = seededKeys.filter((k) => uiStatuses[k] === 'ACTIVE').length
    const archivedCount = seededKeys.filter((k) => uiStatuses[k] === 'ARCHIVED').length

    expect(activeCount).toBe(2)
    expect(archivedCount).toBe(2)
    seededKeys.forEach((k) => expect(merged[k]).toBeDefined())
  })
})

describe('6 — fetchKpiRegistryOnce() (bulk evaluation path) has the same fix', () => {
  it('includes a KPI document missing sortOrder', async () => {
    seedKpi('BSU')
    seedKpi('wasfaty', { sortOrder: 10 })
    const merged = await fetchKpiRegistryOnce()
    expect(merged.BSU).toBeDefined()
    expect(merged.wasfaty).toBeDefined()
  })
})
