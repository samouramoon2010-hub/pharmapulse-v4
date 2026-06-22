// ============================================================
// Reports Dynamic KPI Stale Registry — Regression Test
//
// Bug:
//   ReportsPage fetch useEffect did NOT include liveRegistry in
//   its dependency array. On mount, liveRegistry = DEFAULT_KPI_REGISTRY
//   (useState initial value). DEFAULT_KPI_REGISTRY does not contain
//   testdynamickpi (it's a Firestore-only dynamic KPI).
//
//   Timeline:
//     t=0  Component mounts → useEffect fires → liveRegistry = DEFAULT_KPI_REGISTRY
//          → extraEngineKeys = [] → adapter strips testdynamickpi
//          → fetchedEntries has no testdynamickpi → Reports actual = 0
//     t=1  subscribeKpiRegistry fires → liveRegistry = Firestore registry
//          (now contains testdynamickpi)
//          → useEffect does NOT re-fire (liveRegistry not in deps)
//          → fetchedEntries remain stale → Reports actual = 0 forever
//
// Fix:
//   Add liveRegistry to the fetch useEffect dependency array.
//   When Firestore registry arrives with testdynamickpi, the fetch
//   re-runs with the updated registry → extraEngineKeys = ['testdynamickpi']
//   → adapter preserves the field → Reports actual = correct value.
//
// This file tests the data-path logic without React component rendering.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  mapDynamicToLegacy,
  mapDynamicToLegacyBatch,
} from '../../engine/kpiCompatibility/legacyEntryAdapter'
import { KPI_ENGINE_ALIAS_MAP, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { getProductionEngineKeys, DEFAULT_KPI_KEYS, computeAchievementPct } from '../../engine/kpiAnalyticsEngine'
import type { KpiRegistry } from '../../engine/kpiRegistry'

// ── Dynamic KPI that exists only in Firestore (not in DEFAULT_KPI_REGISTRY) ──
const DYNAMIC_KPI_KEY = 'testdynamickpi'

function makeFirestoreRegistry(): KpiRegistry {
  return {
    ...DEFAULT_KPI_REGISTRY,
    [DYNAMIC_KPI_KEY]: {
      key:            DYNAMIC_KPI_KEY,
      label:          'test dynamic kpi',
      shortLabel:     'testdynamickpi',
      labelAr:        'مؤشر تجريبي',
      isActive:       true,
      isCore:         false,
      lifecycleStage: 'production_evaluation',
      aliasFor:       undefined,
      sortOrder:      999,
      category:       'commercial',
      valueType:      'count',
      unit:           'units',
      unitAr:         'وحدة',
      direction:      'higher_is_better',
      targetType:     'absolute',
      weight:         0,
      thresholds:     { healthy: 90, watch: 70, risk: 50, critical: 30 },
      visibility:     { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
      isPrimary:      false,
      coachingAction:   '',
      coachingActionAr: '',
      description:    '',
    },
  }
}

// Raw Firestore entry document — as it exists in the database
const RAW_FIRESTORE_ENTRY = {
  id:             'entry-001',
  userId:         'user-1',
  pharmacyId:     'pharm-1',
  date:           '2025-06-15',
  wasfaty:        100,
  omni:           90,
  wellness:       80,
  basket:         70,
  crossSelling:   60,
  testdynamickpi: 100,   // written by saveKpiEntry → safeKpiValues spread
  kpiValues: {
    wasfaty:        100,
    omnihealth:      90,
    wellnessCard:    80,
    basket:          70,
    crossSelling:    60,
    testdynamickpi: 100,
  },
}

const TARGET_VALUE = 50  // testdynamickpiTarget = 50

// ─────────────────────────────────────────────────────────────
// 1. Reproduce the bug: DEFAULT_KPI_REGISTRY → extraEngineKeys = []
// ─────────────────────────────────────────────────────────────
describe('1 — BUG REPRODUCED: DEFAULT_KPI_REGISTRY causes actual = 0', () => {
  // This is what happens at t=0 when liveRegistry = DEFAULT_KPI_REGISTRY
  const defaultKeys     = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
  const legacySet       = new Set(DEFAULT_KPI_KEYS)
  const extraEngineKeys = defaultKeys.filter((k) => !legacySet.has(k))

  it('testdynamickpi is NOT in DEFAULT_KPI_REGISTRY production keys', () => {
    expect(defaultKeys).not.toContain(DYNAMIC_KPI_KEY)
  })

  it('extraEngineKeys does NOT include testdynamickpi with DEFAULT_KPI_REGISTRY', () => {
    expect(extraEngineKeys).not.toContain(DYNAMIC_KPI_KEY)
  })

  it('adapter with empty extraEngineKeys strips testdynamickpi from entry', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, [])
    expect((adapted as any)[DYNAMIC_KPI_KEY]).toBeUndefined()
  })

  it('Reports actual = 0 when adapted entry has no testdynamickpi', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, [])
    const actual = Number((adapted as any)[DYNAMIC_KPI_KEY]) || 0
    expect(actual).toBe(0)
  })

  it('Reports achievement = 0% (actual=0, target=50) — the bug', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, [])
    const actual = Number((adapted as any)[DYNAMIC_KPI_KEY]) || 0
    expect(computeAchievementPct(actual, TARGET_VALUE)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Reproduce the fix: Firestore registry → extraEngineKeys includes testdynamickpi
// ─────────────────────────────────────────────────────────────
describe('2 — FIX VERIFIED: Firestore registry causes actual = 100, achievement = 200%', () => {
  // This is what happens after liveRegistry re-triggers the fetch
  const firestoreRegistry = makeFirestoreRegistry()
  const prodKeys          = getProductionEngineKeys(firestoreRegistry)
  const legacySet         = new Set(DEFAULT_KPI_KEYS)
  const extraEngineKeys   = prodKeys.filter((k) => !legacySet.has(k))

  it('testdynamickpi IS in Firestore registry production keys', () => {
    expect(prodKeys).toContain(DYNAMIC_KPI_KEY)
  })

  it('extraEngineKeys includes testdynamickpi with Firestore registry', () => {
    expect(extraEngineKeys).toContain(DYNAMIC_KPI_KEY)
  })

  it('adapter with extraEngineKeys preserves testdynamickpi in entry', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, extraEngineKeys)
    expect((adapted as any)[DYNAMIC_KPI_KEY]).toBe(100)
  })

  it('Reports actual = 100 after fix', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, extraEngineKeys)
    const actual = Number((adapted as any)[DYNAMIC_KPI_KEY]) || 0
    expect(actual).toBe(100)
  })

  it('Reports achievement = 200% after fix (actual=100, target=50)', () => {
    const adapted = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, extraEngineKeys)
    const actual = Number((adapted as any)[DYNAMIC_KPI_KEY]) || 0
    expect(computeAchievementPct(actual, TARGET_VALUE)).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Before/after parity: legacy 5 KPIs identical in both paths
// ─────────────────────────────────────────────────────────────
describe('3 — Legacy 5 KPI values identical before and after fix', () => {
  const defaultAdapted   = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, [])
  const firestoreRegistry = makeFirestoreRegistry()
  const prodKeys         = getProductionEngineKeys(firestoreRegistry)
  const legacySet        = new Set(DEFAULT_KPI_KEYS)
  const extraKeys        = prodKeys.filter((k) => !legacySet.has(k))
  const fixedAdapted     = mapDynamicToLegacy(RAW_FIRESTORE_ENTRY, KPI_ENGINE_ALIAS_MAP, extraKeys)

  it('wasfaty identical', ()    => expect(fixedAdapted.wasfaty).toBe(defaultAdapted.wasfaty))
  it('omni identical', ()       => expect(fixedAdapted.omni).toBe(defaultAdapted.omni))
  it('wellness identical', ()   => expect(fixedAdapted.wellness).toBe(defaultAdapted.wellness))
  it('basket identical', ()     => expect(fixedAdapted.basket).toBe(defaultAdapted.basket))
  it('crossSelling identical', ()=> expect(fixedAdapted.crossSelling).toBe(defaultAdapted.crossSelling))
})

// ─────────────────────────────────────────────────────────────
// 4. Root cause confirmed: liveRegistry in useEffect deps
// ─────────────────────────────────────────────────────────────
describe('4 — Root cause: liveRegistry must be in fetch useEffect dependency array', () => {
  it('ReportsPage source includes liveRegistry in fetch useEffect deps (Phase 2F-3: scope replaces isAdmin/pharmacyId)', async () => {
    const src = (await import('../../pages/shared/ReportsPage.jsx?raw')).default
    // Phase 2F-3 updated deps: isAdmin/pharmacyId replaced by scope, liveRegistry remains
    expect(src).toContain(
      '[userProfile?.uid, scope, dateRange.from, dateRange.to, liveRegistry]'
    )
  })

  it('ReportsPage passes liveRegistry to fetchEntriesRange', async () => {
    const src = (await import('../../pages/shared/ReportsPage.jsx?raw')).default
    // Phase 2F-3 renamed options → fetchOptions; liveRegistry still passed as 4th arg
    expect(src).toContain('fetchEntriesRange(effectiveFrom, effectiveTo, fetchOptions, liveRegistry)')
  })

  it('WITHOUT liveRegistry in deps, fetch would use DEFAULT_KPI_REGISTRY at t=0', () => {
    // Simulate what the stale closure contains at t=0:
    const staleRegistry = DEFAULT_KPI_REGISTRY  // what useState initial value gives
    const staleKeys     = getProductionEngineKeys(staleRegistry)
    expect(staleKeys).not.toContain(DYNAMIC_KPI_KEY)
    // This is why Reports showed 0% — the fetch ran once with DEFAULT_KPI_REGISTRY
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Batch path — multiple entries all get testdynamickpi
// ─────────────────────────────────────────────────────────────
describe('5 — Batch path correctly threads extraEngineKeys', () => {
  const firestoreRegistry = makeFirestoreRegistry()
  const prodKeys          = getProductionEngineKeys(firestoreRegistry)
  const legacySet         = new Set(DEFAULT_KPI_KEYS)
  const extraKeys         = prodKeys.filter((k) => !legacySet.has(k))

  const docs = [
    { ...RAW_FIRESTORE_ENTRY, testdynamickpi: 100 },
    { ...RAW_FIRESTORE_ENTRY, date: '2025-06-16', testdynamickpi: 150 },
  ]

  it('both entries get testdynamickpi when Firestore registry used', () => {
    const results = mapDynamicToLegacyBatch(docs, KPI_ENGINE_ALIAS_MAP, extraKeys)
    expect((results[0] as any)[DYNAMIC_KPI_KEY]).toBe(100)
    expect((results[1] as any)[DYNAMIC_KPI_KEY]).toBe(150)
  })

  it('Reports total actual = 250 across 2 entries', () => {
    const results = mapDynamicToLegacyBatch(docs, KPI_ENGINE_ALIAS_MAP, extraKeys)
    const total = results.reduce((s, e) => s + (Number((e as any)[DYNAMIC_KPI_KEY]) || 0), 0)
    expect(total).toBe(250)
  })
})
