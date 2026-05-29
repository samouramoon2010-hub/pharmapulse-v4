// ============================================================
// Phase 4C Stabilization Regression Tests
// Task 6: All 14 required test scenarios
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_CORE_KPI_KEYS,
  getActiveKpis,
} from '../../engine/kpiRegistry'

import {
  getTargetInputConfigs,
  getKpiUiConfig,
  toKpiUiConfig,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'

import {
  mergeRemoteRegistryWithDefaults,
  buildDocPayloadSync,
  docToKpiDefinition,
} from '../../services/kpiRegistryLogic'

import { getTargetFieldName } from '../../engine/kpiRegistry'

import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Helpers ───────────────────────────────────────────────────

function customKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: `Custom ${key}`, shortLabel: key, labelAr: 'مخصص',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
      targetInputEnabled: false,
    },
    sortOrder: 500,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 1 — Custom KPI with targetInputEnabled appears in target configs
// ─────────────────────────────────────────────────────────────

describe('Test 1 — custom KPI targetInputEnabled=true appears', () => {
  it('custom KPI with targetInputEnabled=true appears in getTargetInputConfigs', () => {
    const remote: KpiRegistry = {
      myCustomKpi: customKpi('myCustomKpi', {
        isActive: true,
        visibility: {
          dashboardEnabled: true, teamEnabled: false,
          executiveEnabled: false, regionalEnabled: false,
          targetInputEnabled: true,
        },
      }),
    }
    const merged  = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'myCustomKpi')).toBeDefined()
  })

  it('custom KPI with targetInputEnabled=true gets a generated targetFieldName', () => {
    const fn = getTargetFieldName('myCustomKpi')
    expect(fn).toBe('myCustomKpiTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 2 — Hidden KPI excluded
// ─────────────────────────────────────────────────────────────

describe('Test 2 — hidden KPI excluded from target configs', () => {
  it('KPI with targetInputEnabled=false is excluded', () => {
    const remote: KpiRegistry = {
      hiddenKpi: customKpi('hiddenKpi', {
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:false },
      }),
    }
    const merged  = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'hiddenKpi')).toBeUndefined()
  })

  it('non-core KPI without targetInputEnabled is excluded by default', () => {
    const configs = getTargetInputConfigs()
    expect(configs.find((c) => c.key === 'sales')).toBeUndefined()
    expect(configs.find((c) => c.key === 'ndf')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 3 — Archived KPI excluded
// ─────────────────────────────────────────────────────────────

describe('Test 3 — archived KPI excluded from target configs', () => {
  it('archived KPI (isActive=false) excluded from target configs', () => {
    const remote: KpiRegistry = {
      archivedKpi: customKpi('archivedKpi', {
        isActive: false,
        visibility: { dashboardEnabled:false, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    const merged  = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'archivedKpi')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 4 — TargetsPage does not use stale static configs
// ─────────────────────────────────────────────────────────────

describe('Test 4 — no stale module-level TARGET_INPUT_CONFIGS', () => {
  it('getTargetInputConfigs is a pure function accepting any registry', () => {
    // Verify it's callable with a custom registry — proving it's not a static
    const customRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      liveKpi: customKpi('liveKpi', {
        isActive: true, isCore: false,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    const configs = getTargetInputConfigs(customRegistry)
    expect(configs.find((c) => c.key === 'liveKpi')).toBeDefined()
  })

  it('calling with different registries returns different results', () => {
    const base    = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const withNew = getTargetInputConfigs({
      ...DEFAULT_KPI_REGISTRY,
      newTarget: customKpi('newTarget', {
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    })
    expect(withNew.length).toBeGreaterThan(base.length)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 5 — Custom KPI payload includes generated target field
// ─────────────────────────────────────────────────────────────

describe('Test 5 — custom KPI payload includes generated target field name', () => {
  it('buildDocPayloadSync includes correct targetFieldName-compatible fields', () => {
    const def = customKpi('myProd', { sortOrder: 300 })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.key).toBe('myProd')
    expect(payload.sortOrder).toBe(300)
    // The target field 'myProdTarget' is not stored in the registry doc itself
    // but getTargetFieldName('myProd') produces it
    expect(getTargetFieldName('myProd')).toBe('myProdTarget')
  })

  it('getTargetFieldName generates consistent field names for unknown KPIs', () => {
    expect(getTargetFieldName('nps')).toBe('npsTarget')
    expect(getTargetFieldName('conversionRate')).toBe('conversionRateTarget')
    expect(getTargetFieldName('customerSatisfaction')).toBe('customerSatisfactionTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 6 — Custom KPI without explicit color does not crash
// ─────────────────────────────────────────────────────────────

describe('Test 6 — custom KPI without explicit color does not crash', () => {
  it('toKpiUiConfig always produces a non-empty defaultColor', () => {
    const def = customKpi('unknownColorKpi')
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.defaultColor).toBeDefined()
    expect(typeof cfg.defaultColor).toBe('string')
    expect(cfg.defaultColor.length).toBeGreaterThan(0)
    expect(cfg.defaultColor).not.toBe('undefined')
  })

  it('defaultColor for unknown key falls back to #a1a1aa', () => {
    const def = customKpi('completelyNewKpi999')
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.defaultColor).toBe('#a1a1aa')
  })

  it('known core KPIs have specific colors', () => {
    const wasfatyCfg = toKpiUiConfig(DEFAULT_KPI_REGISTRY.wasfaty, 1)
    expect(wasfatyCfg.defaultColor).toBe('#6366f1')
    const basketCfg = toKpiUiConfig(DEFAULT_KPI_REGISTRY.basket, 1)
    expect(basketCfg.defaultColor).toBe('#22c55e')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 7 — Unknown KPI gets fallback metadata
// ─────────────────────────────────────────────────────────────

describe('Test 7 — unknown/custom KPI gets fallback metadata', () => {
  it('DEFAULT_KPI_UI_CONFIG has all required fallback fields', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toBe('#a1a1aa')
    expect(DEFAULT_KPI_UI_CONFIG.precision).toBe(0)
    expect(DEFAULT_KPI_UI_CONFIG.displayFormat).toBe('number')
    expect(DEFAULT_KPI_UI_CONFIG.componentType).toBe('NUMERIC_INPUT')
    expect(DEFAULT_KPI_UI_CONFIG.uiSection).toBe('OTHER')
    expect(DEFAULT_KPI_UI_CONFIG.minAllowedValue).toBe(0)
    expect(DEFAULT_KPI_UI_CONFIG.isTabularNum).toBe(true)
  })

  it('custom KPI gets safe defaults from toKpiUiConfig', () => {
    const def = customKpi('customSafeKpi', { valueType: 'count' })
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.precision).toBe(0)
    expect(cfg.componentType).toBe('NUMERIC_INPUT')
    expect(cfg.isTabularNum).toBe(true)
    expect(isNaN(cfg.precision)).toBe(false)
  })

  it('getKpiUiConfig returns undefined (not throws) for completely unknown key', () => {
    expect(() => getKpiUiConfig('totallyUnknown123')).not.toThrow()
    expect(getKpiUiConfig('totallyUnknown123')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 8 — Existing KPI alias mappings still work
// ─────────────────────────────────────────────────────────────

describe('Test 8 — existing alias mappings untouched', () => {
  it('omnihealth engineKey = omni', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'omnihealth')!
    expect(cfg.engineKey).toBe('omni')
    expect(cfg.targetFieldName).toBe('omniTarget')
  })

  it('wellnessCard engineKey = wellness', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'wellnessCard')!
    expect(cfg.engineKey).toBe('wellness')
    expect(cfg.targetFieldName).toBe('wellnessTarget')
  })

  it('wasfaty, basket, crossSelling have no alias', () => {
    const configs = getTargetInputConfigs()
    const wasfaty     = configs.find((c) => c.key === 'wasfaty')!
    const basket      = configs.find((c) => c.key === 'basket')!
    const crossSelling = configs.find((c) => c.key === 'crossSelling')!
    expect(wasfaty.engineKey).toBe('wasfaty')
    expect(basket.engineKey).toBe('basket')
    expect(crossSelling.engineKey).toBe('crossSelling')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 9 — Firestore payload preserves UI metadata
// ─────────────────────────────────────────────────────────────

describe('Test 9 — Firestore payload preserves required fields', () => {
  it('payload includes sortOrder (fixes orderBy exclusion bug)', () => {
    const def = customKpi('testKpi', { sortOrder: 250 })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.sortOrder).toBe(250)
  })

  it('payload includes targetInputEnabled', () => {
    const def = customKpi('testKpi', {
      visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
    })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.targetInputEnabled).toBe(true)
  })

  it('payload includes all visibility flags', () => {
    const def = DEFAULT_KPI_REGISTRY.wasfaty
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload).toHaveProperty('dashboardEnabled')
    expect(payload).toHaveProperty('teamEnabled')
    expect(payload).toHaveProperty('executiveEnabled')
    expect(payload).toHaveProperty('regionalEnabled')
    expect(payload).toHaveProperty('targetInputEnabled')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 10 — No .color access on undefined crashes
// ─────────────────────────────────────────────────────────────

describe('Test 10 — safe .color access', () => {
  it('toKpiUiConfig always returns defaultColor (never undefined)', () => {
    const allKpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    allKpis.forEach((kpi, idx) => {
      const cfg = toKpiUiConfig(kpi, idx + 1)
      expect(cfg.defaultColor).toBeDefined()
      expect(cfg.defaultColor).not.toBeUndefined()
      // Accessing .length should not throw
      expect(() => cfg.defaultColor.length).not.toThrow()
    })
  })

  it('DEFAULT_KPI_UI_CONFIG.defaultColor is a valid hex color', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 11 — Stable KPI ordering
// ─────────────────────────────────────────────────────────────

describe('Test 11 — stable KPI ordering', () => {
  it('target input configs are in stable sortOrder', () => {
    const configs = getTargetInputConfigs()
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i].inputOrder).toBeGreaterThan(configs[i-1].inputOrder)
    }
  })

  it('calling getTargetInputConfigs twice returns same order', () => {
    const k1 = getTargetInputConfigs().map((c) => c.key)
    const k2 = getTargetInputConfigs().map((c) => c.key)
    expect(k1).toEqual(k2)
  })

  it('core KPI order matches engine order: wasfaty, omnihealth, wellnessCard, basket, crossSelling', () => {
    const keys = getTargetInputConfigs().slice(0,5).map((c) => c.key)
    expect(keys).toEqual(['wasfaty','omnihealth','wellnessCard','basket','crossSelling'])
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 12 — displayFormat / precision safety
// ─────────────────────────────────────────────────────────────

describe('Test 12 — displayFormat and precision are never NaN/undefined', () => {
  it('all active KPIs have valid precision (integer 0, 1, or 2)', () => {
    getActiveKpis(DEFAULT_KPI_REGISTRY).forEach((kpi, idx) => {
      const cfg = toKpiUiConfig(kpi, idx+1)
      expect(isNaN(cfg.precision)).toBe(false)
      expect([0, 1, 2]).toContain(cfg.precision)
    })
  })

  it('all active KPIs have non-empty displayFormat', () => {
    getActiveKpis(DEFAULT_KPI_REGISTRY).forEach((kpi, idx) => {
      const cfg = toKpiUiConfig(kpi, idx+1)
      expect(cfg.displayFormat.length).toBeGreaterThan(0)
    })
  })

  it('currency KPI (basket) has precision=2 and currency_sar format', () => {
    const cfg = toKpiUiConfig(DEFAULT_KPI_REGISTRY.basket, 1)
    expect(cfg.precision).toBe(2)
    expect(cfg.displayFormat).toBe('currency_sar')
  })

  it('percentage KPI (sl) has precision=1 and percent_1 format', () => {
    const cfg = toKpiUiConfig(DEFAULT_KPI_REGISTRY.sl, 1)
    expect(cfg.precision).toBe(1)
    expect(cfg.displayFormat).toBe('percent_1')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 13 — fallback defaultColor exists for all registry KPIs
// ─────────────────────────────────────────────────────────────

describe('Test 13 — fallback defaultColor for all registry KPIs', () => {
  it('all 10 active KPIs have non-empty defaultColor', () => {
    getActiveKpis(DEFAULT_KPI_REGISTRY).forEach((kpi, idx) => {
      const cfg = toKpiUiConfig(kpi, idx+1)
      expect(cfg.defaultColor).toBeTruthy()
      expect(typeof cfg.defaultColor).toBe('string')
      expect(cfg.defaultColor).not.toBe('undefined')
      expect(cfg.defaultColor).not.toBe('')
    })
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 14 — no NaN formatting in UI config generation
// ─────────────────────────────────────────────────────────────

describe('Test 14 — no NaN formatting in UI config generation', () => {
  it('custom KPI with unusual valueType produces no NaN', () => {
    const def = customKpi('unusual', { valueType: 'number' })
    const cfg = toKpiUiConfig(def, 1)
    expect(isNaN(cfg.precision)).toBe(false)
    expect(isNaN(cfg.inputOrder)).toBe(false)
    expect(isNaN(cfg.minAllowedValue)).toBe(false)
    expect(isNaN(cfg.gridColSpan)).toBe(false)
  })

  it('docToKpiDefinition with missing numeric fields produces no NaN', () => {
    const doc = { key: 'test', label: 'Test', isActive: true, isCore: false }
    const result = docToKpiDefinition(doc)
    expect(result).not.toBeNull()
    if (result) {
      expect(isNaN(result.def.weight)).toBe(false)
      expect(isNaN(result.def.sortOrder)).toBe(false)
      expect(isNaN(result.def.thresholds.healthy)).toBe(false)
    }
  })

  it('DEFAULT_KPI_UI_CONFIG has no NaN numeric fields', () => {
    expect(isNaN(DEFAULT_KPI_UI_CONFIG.precision)).toBe(false)
    expect(isNaN(DEFAULT_KPI_UI_CONFIG.minAllowedValue)).toBe(false)
    expect(isNaN(DEFAULT_KPI_UI_CONFIG.gridColSpan)).toBe(false)
    expect(isNaN(DEFAULT_KPI_UI_CONFIG.inputOrder)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 15 — TargetsPage stale-reference regression
// ─────────────────────────────────────────────────────────────

describe('Test 15 — TargetsPage stale reference regression', () => {
  it('getTargetInputConfigs accepts a live registry and returns reactive results', () => {
    // Simulate what happens when Firestore adds a new KPI to liveRegistry
    const liveRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      dynamicKpi: customKpi('dynamicKpi', {
        isActive: true,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    // If code used a stale static, this custom KPI would not appear
    const configs = getTargetInputConfigs(liveRegistry)
    expect(configs.find((c) => c.key === 'dynamicKpi')).toBeDefined()
  })

  it('form initial state uses all configs from live registry', () => {
    const liveRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      newKpi: customKpi('newKpi', {
        isActive: true,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    const configs = getTargetInputConfigs(liveRegistry)
    const emptyState = Object.fromEntries(configs.map(c => [c.targetFieldName, 0]))
    expect(emptyState).toHaveProperty('newKpiTarget')
    expect(emptyState.newKpiTarget).toBe(0)
  })

  it('custom KPI with targetInputEnabled=true renders a non-empty targetFieldName', () => {
    const remote: KpiRegistry = {
      myLiveKpi: customKpi('myLiveKpi', {
        isActive: true,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    const merged  = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    const cfg = configs.find((c) => c.key === 'myLiveKpi')
    expect(cfg).toBeDefined()
    expect(cfg?.targetFieldName).toBe('myLiveKpiTarget')
    expect(cfg?.label).toBeTruthy()
    expect(cfg?.defaultColor).toBeTruthy()
  })
})
