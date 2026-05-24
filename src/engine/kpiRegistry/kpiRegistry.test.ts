// ============================================================
// KPI Registry Tests
// Covers: production key completeness, active/core status,
//         alias mapping, weights, uniqueness, thresholds,
//         backward compatibility with existing engines.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_ACTIVE_KPI_KEYS,
  DEFAULT_CORE_KPI_KEYS,
  DEFAULT_CORE_ENGINE_KEYS,
  DEFAULT_ALL_KPI_KEYS,
  KPI_ENGINE_ALIAS_MAP,
  KPI_ENGINE_REVERSE_MAP,
} from './defaultKpiRegistry'

import {
  getActiveKpis,
  getCoreKpis,
  getKpisForSurface,
  buildAliasMap,
  resolveEngineKey,
  validateWeights,
  validateThresholds,
} from './kpiRegistryTypes'

import type { KpiDefinition } from './kpiRegistryTypes'

// ── Key sets ──────────────────────────────────────────────────

/** All production KPI keys that must be ACTIVE in the registry */
const PRODUCTION_KEYS = [
  'wasfaty', 'omnihealth', 'wellnessCard',
  'basket', 'crossSelling',
  'sales', 'sl', 'ndf', 'inbody', 'liberation',
] as const

/** Core KPI keys — must be active AND carry weight */
const CORE_KEYS = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'] as const

/** Engine field names used by kpiAnalyticsEngine (KpiKey type) */
const ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// ─────────────────────────────────────────────────────────────
// 1. PRODUCTION KEY COMPLETENESS
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — production key completeness', () => {
  it('contains all 10 production KPI keys', () => {
    PRODUCTION_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY).toHaveProperty(key)
    })
  })

  it('has exactly 10 KPI definitions', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(10)
  })

  it('DEFAULT_ALL_KPI_KEYS contains all 10 keys', () => {
    expect(DEFAULT_ALL_KPI_KEYS).toHaveLength(10)
    PRODUCTION_KEYS.forEach((key) => {
      expect(DEFAULT_ALL_KPI_KEYS).toContain(key)
    })
  })

  it('does not contain internal engine alias keys as top-level entries', () => {
    // omni and wellness are engine-internal aliases — they must NOT be
    // standalone registry entries. The business keys omnihealth and wellnessCard
    // represent them instead.
    expect(DEFAULT_KPI_REGISTRY).not.toHaveProperty('omni')
    expect(DEFAULT_KPI_REGISTRY).not.toHaveProperty('wellness')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. ALL PRODUCTION KPIs ARE ACTIVE
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — all production KPIs are active', () => {
  it('every production KPI is active (isActive = true)', () => {
    PRODUCTION_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].isActive).toBe(true)
    })
  })

  it('DEFAULT_ACTIVE_KPI_KEYS contains all 10 production keys', () => {
    expect(DEFAULT_ACTIVE_KPI_KEYS).toHaveLength(10)
    PRODUCTION_KEYS.forEach((key) => {
      expect(DEFAULT_ACTIVE_KPI_KEYS).toContain(key)
    })
  })

  it('getActiveKpis() returns all 10 production KPIs', () => {
    const active = getActiveKpis(DEFAULT_KPI_REGISTRY)
    expect(active).toHaveLength(10)
    PRODUCTION_KEYS.forEach((key) => {
      expect(active.map((k) => k.key)).toContain(key)
    })
  })

  it('no production KPI is accidentally inactive', () => {
    PRODUCTION_KEYS.forEach((key) => {
      const kpi = DEFAULT_KPI_REGISTRY[key]
      expect(kpi.isActive).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 3. CORE STATUS
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — core status', () => {
  it('all 5 core KPIs are both active and core', () => {
    CORE_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].isActive).toBe(true)
      expect(DEFAULT_KPI_REGISTRY[key].isCore).toBe(true)
    })
  })

  it('non-core production KPIs have isCore = false', () => {
    const nonCoreKeys = ['sales', 'sl', 'ndf', 'inbody', 'liberation']
    nonCoreKeys.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].isCore).toBe(false)
    })
  })

  it('DEFAULT_CORE_KPI_KEYS has exactly 5 entries', () => {
    expect(DEFAULT_CORE_KPI_KEYS).toHaveLength(5)
    CORE_KEYS.forEach((key) => {
      expect(DEFAULT_CORE_KPI_KEYS).toContain(key)
    })
  })

  it('getCoreKpis() returns exactly the 5 core KPIs', () => {
    const core = getCoreKpis(DEFAULT_KPI_REGISTRY)
    expect(core).toHaveLength(5)
    CORE_KEYS.forEach((key) => {
      expect(core.map((k) => k.key)).toContain(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 4. ALIAS MAPPING
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — alias mapping', () => {
  it('omnihealth.aliasFor maps to "omni" (engine field name)', () => {
    expect(DEFAULT_KPI_REGISTRY.omnihealth.aliasFor).toBe('omni')
  })

  it('wellnessCard.aliasFor maps to "wellness" (engine field name)', () => {
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.aliasFor).toBe('wellness')
  })

  it('non-aliased KPIs have no aliasFor field', () => {
    const nonAliased = ['wasfaty', 'basket', 'crossSelling', 'sales', 'sl', 'ndf', 'inbody', 'liberation']
    nonAliased.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].aliasFor).toBeUndefined()
    })
  })

  it('KPI_ENGINE_ALIAS_MAP contains omnihealth → omni and wellnessCard → wellness', () => {
    expect(KPI_ENGINE_ALIAS_MAP['omnihealth']).toBe('omni')
    expect(KPI_ENGINE_ALIAS_MAP['wellnessCard']).toBe('wellness')
  })

  it('KPI_ENGINE_ALIAS_MAP has exactly 2 entries', () => {
    expect(Object.keys(KPI_ENGINE_ALIAS_MAP)).toHaveLength(2)
  })

  it('KPI_ENGINE_REVERSE_MAP inverts the alias map correctly', () => {
    expect(KPI_ENGINE_REVERSE_MAP['omni']).toBe('omnihealth')
    expect(KPI_ENGINE_REVERSE_MAP['wellness']).toBe('wellnessCard')
  })

  it('buildAliasMap() produces the same map as KPI_ENGINE_ALIAS_MAP', () => {
    const built = buildAliasMap(DEFAULT_KPI_REGISTRY)
    expect(built).toEqual(KPI_ENGINE_ALIAS_MAP)
  })

  it('resolveEngineKey() returns aliasFor when set', () => {
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.omnihealth)).toBe('omni')
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.wellnessCard)).toBe('wellness')
  })

  it('resolveEngineKey() returns the key itself when no alias', () => {
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.wasfaty)).toBe('wasfaty')
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.basket)).toBe('basket')
  })

  it('aliases do not create duplicate engine keys', () => {
    const engineKeys = Object.values(DEFAULT_KPI_REGISTRY)
      .map((kpi) => kpi.aliasFor ?? kpi.key)
    const unique = new Set(engineKeys)
    expect(unique.size).toBe(engineKeys.length)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. BACKWARD COMPATIBILITY WITH EXISTING ENGINE
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — backward compatibility with kpiAnalyticsEngine', () => {
  it('DEFAULT_CORE_ENGINE_KEYS resolves to the 5 engine KpiKey values', () => {
    expect(DEFAULT_CORE_ENGINE_KEYS).toHaveLength(5)
    ENGINE_KEYS.forEach((key) => {
      expect(DEFAULT_CORE_ENGINE_KEYS).toContain(key)
    })
  })

  it('ENGINE_KEYS are all present in DEFAULT_CORE_ENGINE_KEYS', () => {
    ENGINE_KEYS.forEach((key) => {
      expect(DEFAULT_CORE_ENGINE_KEYS).toContain(key)
    })
  })

  it('engine key order matches existing KPI_KEYS order: wasfaty, omni, wellness, basket, crossSelling', () => {
    const ENGINE_ORDER = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    expect(DEFAULT_CORE_ENGINE_KEYS).toEqual(ENGINE_ORDER)
  })

  it('wasfaty registry key IS the engine key (no alias)', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.aliasFor).toBeUndefined()
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.wasfaty)).toBe('wasfaty')
  })

  it('basket registry key IS the engine key (no alias)', () => {
    expect(DEFAULT_KPI_REGISTRY.basket.aliasFor).toBeUndefined()
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.basket)).toBe('basket')
  })

  it('crossSelling registry key IS the engine key (no alias)', () => {
    expect(DEFAULT_KPI_REGISTRY.crossSelling.aliasFor).toBeUndefined()
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.crossSelling)).toBe('crossSelling')
  })

  it('omnihealth resolves to engine key "omni" (backward compat)', () => {
    const engineKey = resolveEngineKey(DEFAULT_KPI_REGISTRY.omnihealth)
    expect(engineKey).toBe('omni')
  })

  it('wellnessCard resolves to engine key "wellness" (backward compat)', () => {
    const engineKey = resolveEngineKey(DEFAULT_KPI_REGISTRY.wellnessCard)
    expect(engineKey).toBe('wellness')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. WEIGHT VALIDITY
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — weights', () => {
  it('validateWeights() returns true for the default registry', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('active core KPI weights sum to exactly 1.0', () => {
    const sum = Object.values(DEFAULT_KPI_REGISTRY)
      .filter((kpi) => kpi.isActive && kpi.isCore)
      .reduce((s, kpi) => s + kpi.weight, 0)
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('each core KPI has a positive weight', () => {
    CORE_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].weight).toBeGreaterThan(0)
    })
  })

  it('non-core KPIs have weight 0', () => {
    const nonCoreKeys = ['sales', 'sl', 'ndf', 'inbody', 'liberation']
    nonCoreKeys.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key].weight).toBe(0)
    })
  })

  it('individual core weights match documented distribution', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.weight).toBe(0.25)
    expect(DEFAULT_KPI_REGISTRY.omnihealth.weight).toBe(0.20)
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.weight).toBe(0.20)
    expect(DEFAULT_KPI_REGISTRY.basket.weight).toBe(0.20)
    expect(DEFAULT_KPI_REGISTRY.crossSelling.weight).toBe(0.15)
  })

  it('validateWeights fails when weights do not sum to 1.0', () => {
    const badRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      wasfaty: { ...DEFAULT_KPI_REGISTRY.wasfaty, weight: 0.50 },
    }
    expect(validateWeights(badRegistry)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. KEY UNIQUENESS
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — key uniqueness', () => {
  it('all registry keys are unique', () => {
    const keys = Object.keys(DEFAULT_KPI_REGISTRY)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('each KpiDefinition.key matches its map key', () => {
    Object.entries(DEFAULT_KPI_REGISTRY).forEach(([mapKey, def]) => {
      expect(def.key).toBe(mapKey)
    })
  })

  it('sortOrder values are all unique', () => {
    const orders = Object.values(DEFAULT_KPI_REGISTRY).map((k) => k.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

// ─────────────────────────────────────────────────────────────
// 8. THRESHOLD VALIDITY
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — thresholds', () => {
  it('validateThresholds() passes for every KPI in the default registry', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(validateThresholds(kpi)).toBe(true)
    })
  })

  it('thresholds are ordered: healthy >= watch >= risk >= critical for all KPIs', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      const { healthy, watch, risk, critical } = kpi.thresholds
      expect(healthy).toBeGreaterThanOrEqual(watch)
      expect(watch).toBeGreaterThanOrEqual(risk)
      expect(risk).toBeGreaterThanOrEqual(critical)
    })
  })

  it('all threshold values are within 0..200', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      Object.values(kpi.thresholds).forEach((val) => {
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThanOrEqual(200)
      })
    })
  })

  it('validateThresholds fails for inverted thresholds', () => {
    const badDef: KpiDefinition = {
      ...DEFAULT_KPI_REGISTRY.wasfaty,
      thresholds: { healthy: 60, watch: 80, risk: 90, critical: 95 },
    }
    expect(validateThresholds(badDef)).toBe(false)
  })

  it('validateThresholds fails for out-of-range value', () => {
    const badDef: KpiDefinition = {
      ...DEFAULT_KPI_REGISTRY.wasfaty,
      thresholds: { healthy: 300, watch: 80, risk: 60, critical: 40 },
    }
    expect(validateThresholds(badDef)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 9. FIELD COMPLETENESS
// ─────────────────────────────────────────────────────────────

describe('defaultKpiRegistry — field completeness', () => {
  it('every KPI has a non-empty label, shortLabel, and Arabic label', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(kpi.label.length).toBeGreaterThan(0)
      expect(kpi.shortLabel.length).toBeGreaterThan(0)
      expect(kpi.labelAr.length).toBeGreaterThan(0)
    })
  })

  it('every KPI has a valid category', () => {
    const VALID = ['prescription','digital','wellness','commercial','operational','health_program']
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(VALID).toContain(kpi.category)
    })
  })

  it('every KPI has a valid valueType', () => {
    const VALID = ['number','currency','percentage','count']
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(VALID).toContain(kpi.valueType)
    })
  })

  it('every KPI has a valid direction', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(['higher_is_better','lower_is_better']).toContain(kpi.direction)
    })
  })

  it('every KPI has a valid targetType', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(['absolute','percentage','ratio']).toContain(kpi.targetType)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 10. UTILITY FUNCTION CORRECTNESS
// ─────────────────────────────────────────────────────────────

describe('kpiRegistryTypes — utility functions', () => {
  it('getActiveKpis returns all 10 active KPIs sorted by sortOrder', () => {
    const active = getActiveKpis(DEFAULT_KPI_REGISTRY)
    expect(active).toHaveLength(10)
    for (let i = 1; i < active.length; i++) {
      expect(active[i].sortOrder).toBeGreaterThan(active[i - 1].sortOrder)
    }
  })

  it('getCoreKpis returns exactly the 5 core KPIs', () => {
    expect(getCoreKpis(DEFAULT_KPI_REGISTRY)).toHaveLength(5)
  })

  it('getKpisForSurface("executiveEnabled") returns only active executive-enabled KPIs', () => {
    const exec = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    exec.forEach((kpi) => {
      expect(kpi.isActive).toBe(true)
      expect(kpi.visibility.executiveEnabled).toBe(true)
    })
    expect(exec).toHaveLength(5) // only core KPIs have executiveEnabled
  })

  it('getKpisForSurface("regionalEnabled") returns only regional-enabled active KPIs', () => {
    const regional = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    expect(regional).toHaveLength(5)
    regional.forEach((kpi) => {
      expect(kpi.visibility.regionalEnabled).toBe(true)
    })
  })

  it('getKpisForSurface("dashboardEnabled") returns all active dashboard-enabled KPIs', () => {
    const dash = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
    dash.forEach((kpi) => {
      expect(kpi.isActive).toBe(true)
      expect(kpi.visibility.dashboardEnabled).toBe(true)
    })
    // All 10 production KPIs have dashboardEnabled = true
    expect(dash).toHaveLength(10)
  })

  it('validateWeights returns false for empty registry', () => {
    expect(validateWeights({})).toBe(false)
  })

  it('validateWeights returns false for registry with no active core KPIs', () => {
    const allInactive = Object.fromEntries(
      Object.entries(DEFAULT_KPI_REGISTRY).map(([k, v]) => [k, { ...v, isActive: false }])
    )
    expect(validateWeights(allInactive)).toBe(false)
  })
})
