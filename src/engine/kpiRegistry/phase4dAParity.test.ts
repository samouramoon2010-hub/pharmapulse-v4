// ============================================================
// Phase 4D-A — Surface Migration Parity Tests
//
// Verifies that the registry-driven read path (getCoreEngineKeys,
// readKpiActual, readKpiTarget, getKpiMetaForKey) produces identical
// results to the legacy static path (KPI_KEYS, entry[k], KPI_META)
// for all 5 core engine keys.
//
// Covers:
//   1.  getCoreEngineKeys is exported
//   2.  getCoreEngineKeys fallback === DEFAULT_KPI_KEYS (order match)
//   3.  getCoreEngineKeys(registry) returns exactly the 5 core keys
//   4.  getCoreEngineKeys excludes non-core production KPIs
//   5.  getCoreEngineKeys excludes pilot KPIs
//   6-10. actual parity  — readKpiActual(entry, k, registry) === Number(entry[k]) || 0
//  11-15. target parity  — readKpiTarget(target, k, registry) === target[KPI_META[k].targetField]
//  16-20. achievement parity — computeKpiStats paths agree on achievementPct
//  21-25. status parity  — same TrafficLightStatus from both paths
//  26-30. label parity   — getKpiMetaForKey(k).en === KPI_META[k].en
//  31.    sorting parity — getCoreEngineKeys order matches DEFAULT_KPI_KEYS order
//  32.    getCoreEngineKeys is idempotent (multiple calls return same list)
//  33-34. guardrail: getCoreEngineKeys not imported from kpiRegistryService / UI
//  35.    getKpiMetaForKey ultimate fallback returns non-empty en for unknown key
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  getCoreEngineKeys,
  getKpiMetaForKey,
  readKpiActual,
  readKpiTarget,
  computeKpiStats,
  getDayProgress,
  KPI_META,
  KPI_KEYS,
  DEFAULT_KPI_KEYS,
} from '../kpiAnalyticsEngine'

const CORE_ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// Realistic fixture — same values used in Phase 4C shadow reader tests
const SAMPLE_ENTRY = {
  wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45,
  // non-core fields present but must not interfere
  sales: 9000, sl: 70, ndf: 12,
}
const SAMPLE_TARGET = {
  wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80,
  basketTarget: 300, crossSellTarget: 60,
}
const TEST_DATE = new Date('2025-01-15')

// ════════════════════════════════════════════════════════════
// 1-5. getCoreEngineKeys existence and filtering
// ════════════════════════════════════════════════════════════

describe('4D-A: getCoreEngineKeys basics', () => {
  it('getCoreEngineKeys is exported (test 1)', () => {
    expect(typeof getCoreEngineKeys).toBe('function')
  })

  it('getCoreEngineKeys() without registry returns DEFAULT_KPI_KEYS (test 2)', () => {
    const result = getCoreEngineKeys()
    expect(result).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys(registry) returns exactly 5 core engine keys (test 3)', () => {
    const result = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(result).toHaveLength(5)
    for (const k of CORE_ENGINE_KEYS) {
      expect(result, `should contain ${k}`).toContain(k)
    }
  })

  it('getCoreEngineKeys excludes non-core production KPIs: sales, sl, ndf, inbody, liberation (test 4)', () => {
    const result = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    for (const nonCore of ['sales', 'sl', 'ndf', 'inbody', 'liberation']) {
      expect(result, `should not contain ${nonCore}`).not.toContain(nonCore)
    }
  })

  it('getCoreEngineKeys excludes pilot KPI insuranceConversion (test 5)', () => {
    const result = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(result).not.toContain('insuranceConversion')
  })
})

// ════════════════════════════════════════════════════════════
// 6-10. actual parity
// ════════════════════════════════════════════════════════════

describe('4D-A: actual parity — readKpiActual vs legacy direct read', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: readKpiActual matches Number(entry[k]) || 0 (test ${CORE_ENGINE_KEYS.indexOf(k) + 6})`, () => {
      const legacyActual  = Number(SAMPLE_ENTRY[k]) || 0
      const dynamicActual = readKpiActual(SAMPLE_ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      expect(dynamicActual).toBe(legacyActual)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 11-15. target parity
// ════════════════════════════════════════════════════════════

describe('4D-A: target parity — readKpiTarget vs legacy KPI_META lookup', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: readKpiTarget matches legacy target field read (test ${CORE_ENGINE_KEYS.indexOf(k) + 11})`, () => {
      const legacyTargetField = KPI_META[k].targetField
      const legacyTarget      = Number((SAMPLE_TARGET as any)[legacyTargetField]) || 0
      const dynamicTarget     = readKpiTarget(SAMPLE_TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(dynamicTarget).toBe(legacyTarget)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 16-20. achievement parity
// ════════════════════════════════════════════════════════════

describe('4D-A: achievement parity — computeKpiStats paths agree', () => {
  const dp = getDayProgress(TEST_DATE)

  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: achievementPct matches between static and dynamic read path (test ${CORE_ENGINE_KEYS.indexOf(k) + 16})`, () => {
      // Static (legacy) path
      const legacyActual  = Number(SAMPLE_ENTRY[k]) || 0
      const legacyTarget  = Number((SAMPLE_TARGET as any)[KPI_META[k].targetField]) || 0
      const legacyStats   = computeKpiStats(legacyActual, legacyTarget, dp, k)

      // Dynamic (registry) path
      const dynActual = readKpiActual(SAMPLE_ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      const dynTarget = readKpiTarget(SAMPLE_TARGET, k, DEFAULT_KPI_REGISTRY as any)
      const dynStats  = computeKpiStats(dynActual, dynTarget, dp, k)

      expect(dynStats.achievementPct).toBe(legacyStats.achievementPct)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 21-25. status parity
// ════════════════════════════════════════════════════════════

describe('4D-A: status parity — same TrafficLightStatus from both paths', () => {
  const dp = getDayProgress(TEST_DATE)

  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: trafficLight status matches between paths (test ${CORE_ENGINE_KEYS.indexOf(k) + 21})`, () => {
      const legacyStats = computeKpiStats(
        Number(SAMPLE_ENTRY[k]) || 0,
        Number((SAMPLE_TARGET as any)[KPI_META[k].targetField]) || 0,
        dp, k,
      )
      const dynStats = computeKpiStats(
        readKpiActual(SAMPLE_ENTRY, k, DEFAULT_KPI_REGISTRY as any),
        readKpiTarget(SAMPLE_TARGET, k, DEFAULT_KPI_REGISTRY as any),
        dp, k,
      )
      expect(dynStats.status).toBe(legacyStats.status)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 26-30. label parity
// ════════════════════════════════════════════════════════════

describe('4D-A: label parity — getKpiMetaForKey(k).en === KPI_META[k].en', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiMetaForKey(k).en equals KPI_META[k].en (test ${CORE_ENGINE_KEYS.indexOf(k) + 26})`, () => {
      expect(getKpiMetaForKey(k).en).toBe(KPI_META[k].en)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 31-32. sorting and idempotence
// ════════════════════════════════════════════════════════════

describe('4D-A: sorting and idempotence', () => {
  it('getCoreEngineKeys order matches DEFAULT_KPI_KEYS for the 5 core keys (test 31)', () => {
    const result = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    // DEFAULT_KPI_KEYS = ['wasfaty','omni','wellness','basket','crossSelling']
    // Registry sortOrder 10,20,30,40,50 — same order
    expect(result).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys is idempotent — two calls return the same list (test 32)', () => {
    const first  = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    const second = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(first).toEqual(second)
  })
})

// ════════════════════════════════════════════════════════════
// 33-34. Guardrails — getCoreEngineKeys is a pure engine export
// ════════════════════════════════════════════════════════════

describe('4D-A: guardrails', () => {
  it('getCoreEngineKeys is in kpiAnalyticsEngine, not a service (test 33)', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export function getCoreEngineKeys(')
    expect(src).not.toContain("from '../services/kpiRegistryService'")
  })

  it('getCoreEngineKeys fallback never breaks for empty registry (test 34)', () => {
    expect(() => getCoreEngineKeys({}  as any)).not.toThrow()
    expect(getCoreEngineKeys({} as any)).toEqual(DEFAULT_KPI_KEYS)
  })
})

// ════════════════════════════════════════════════════════════
// 35. getKpiMetaForKey fallback for unknown key
// ════════════════════════════════════════════════════════════

describe('4D-A: getKpiMetaForKey fallback', () => {
  it('returns non-empty en for an unknown engine key (test 35)', () => {
    const meta = getKpiMetaForKey('someNewDynamicKpi')
    expect(meta.en).toBeTruthy()
    expect(meta.en.length).toBeGreaterThan(0)
  })

  it('returns non-empty en for all 5 core keys without registry (test 35b)', () => {
    for (const k of CORE_ENGINE_KEYS) {
      expect(getKpiMetaForKey(k).en, `${k} label`).toBeTruthy()
    }
  })
})
