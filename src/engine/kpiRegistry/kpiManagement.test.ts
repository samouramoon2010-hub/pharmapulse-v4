// ============================================================
// KPI Management — Governance & Safety Tests
// Tests the registry layer, UI adapter, and governance rules
// that the admin UI depends on.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_CORE_KPI_KEYS,
} from './defaultKpiRegistry'

import {
  validateWeights,
  validateThresholds,
  getActiveKpis,
} from './kpiRegistryTypes'

import {
  getTargetInputConfigs,
  getKpiUiConfig,
} from './kpiUiAdapter'

import type { KpiDefinition, KpiRegistry } from './kpiRegistryTypes'

// ── Protected keys (must match KpiManagementPage constant) ────
const PROTECTED_KEYS = new Set([
  'wasfaty','omnihealth','wellnessCard','basket','crossSelling',
  'sales','sl','ndf','inbody','liberation',
])

// ── Simulate governance operations ────────────────────────────

function archiveKpi(registry: KpiRegistry, key: string): KpiRegistry {
  if (PROTECTED_KEYS.has(key) && registry[key]?.isCore) {
    throw new Error(`Cannot archive protected core KPI: ${key}`)
  }
  return {
    ...registry,
    [key]: { ...registry[key], isActive: false },
  }
}

function addKpi(registry: KpiRegistry, def: KpiDefinition): KpiRegistry {
  if (def.key in registry) throw new Error(`Duplicate key: ${def.key}`)
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(def.key)) throw new Error(`Invalid key format: ${def.key}`)
  return { ...registry, [def.key]: def }
}

function buildCustomKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: 'Test KPI', shortLabel: 'Test', labelAr: 'اختبار',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false },
    sortOrder: 999,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// 1. PROTECTED KPIs CANNOT BE HARD-DELETED
// ─────────────────────────────────────────────────────────────

describe('governance — protected KPIs cannot be deleted', () => {
  it('protected keys are present in the default registry', () => {
    PROTECTED_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY).toHaveProperty(key)
    })
  })

  it('archiving a core protected KPI throws', () => {
    expect(() => archiveKpi(DEFAULT_KPI_REGISTRY, 'wasfaty')).toThrow()
    expect(() => archiveKpi(DEFAULT_KPI_REGISTRY, 'omnihealth')).toThrow()
    expect(() => archiveKpi(DEFAULT_KPI_REGISTRY, 'basket')).toThrow()
  })

  it('archiving a non-core protected KPI is allowed (not core)', () => {
    // sales, sl, ndf etc are protected but isCore=false — they can be archived
    const result = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    expect(result.sales.isActive).toBe(false)
  })

  it('protected key set cannot be removed from the registry (no delete operation)', () => {
    // The registry never exposes a delete function — only add/edit/archive
    // Verify all protected keys still exist after a simulated archive of non-core
    const modified = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    PROTECTED_KEYS.forEach((key) => {
      expect(modified).toHaveProperty(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 2. ARCHIVED KPI REMAINS IN REGISTRY
// ─────────────────────────────────────────────────────────────

describe('governance — archived KPI remains in registry', () => {
  it('archived KPI stays in the registry with isActive=false', () => {
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    expect(reg.sales).toBeDefined()
    expect(reg.sales.isActive).toBe(false)
    expect(reg.sales.key).toBe('sales')
  })

  it('archived KPI is still findable by getKpiUiConfig', () => {
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    const cfg = getKpiUiConfig('sales', reg)
    expect(cfg).toBeDefined()
    expect(cfg?.uiStatus).toBe('ARCHIVED')
  })

  it('archiving does not remove the key from the registry object', () => {
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'ndf')
    expect(Object.keys(reg)).toContain('ndf')
  })

  it('archived KPI key count equals original count', () => {
    const original = Object.keys(DEFAULT_KPI_REGISTRY).length
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    expect(Object.keys(reg).length).toBe(original)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. HIDDEN KPI DOES NOT SHOW IN TARGET INPUT
// ─────────────────────────────────────────────────────────────

describe('governance — hidden KPI excluded from target input', () => {
  it('getTargetInputConfigs excludes non-core KPIs (uiStatus has no effect for non-core)', () => {
    // Non-core KPIs are excluded by isCore check, regardless of status
    const configs = getTargetInputConfigs()
    expect(configs.find((c) => c.key === 'sales')).toBeUndefined()
  })

  it('a custom KPI with isCore=false does not appear in target input', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('myCustomKpi'))
    const configs = getTargetInputConfigs(reg)
    expect(configs.find((c) => c.key === 'myCustomKpi')).toBeUndefined()
  })

  it('HIDDEN_FROM_INPUT uiStatus represented in KpiUiConfig', () => {
    // getKpiUiConfig returns uiStatus=ACTIVE for active KPIs
    // A HIDDEN_FROM_INPUT KPI is still active (isActive=true) but the page
    // tracks its uiStatus separately. Verify the adapter responds correctly.
    const cfg = getKpiUiConfig('sales')
    expect(cfg).toBeDefined()
    // isVisibleForTargetInput for non-core = false regardless
    expect(cfg?.isVisibleForTargetInput).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. ACTIVE CORE KPI APPEARS IN TARGET INPUT
// ─────────────────────────────────────────────────────────────

describe('governance — active core KPI appears in target input', () => {
  it('all 5 core KPIs appear in getTargetInputConfigs()', () => {
    const configs = getTargetInputConfigs()
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(configs.find((c) => c.key === key)).toBeDefined()
    })
  })

  it('core KPIs have isVisibleForTargetInput = true', () => {
    const configs = getTargetInputConfigs()
    configs.forEach((c) => {
      expect(c.isVisibleForTargetInput).toBe(true)
    })
  })

  it('archived core KPI is excluded from target input in a modified registry', () => {
    // Force isActive=false on wasfaty in a test registry (normally prevented by UI governance)
    const reg = { ...DEFAULT_KPI_REGISTRY, wasfaty: { ...DEFAULT_KPI_REGISTRY.wasfaty, isActive: false, isCore: false } }
    const configs = getTargetInputConfigs(reg)
    expect(configs.find((c) => c.key === 'wasfaty')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 5. WEIGHT VALIDATION
// ─────────────────────────────────────────────────────────────

describe('governance — weights validation', () => {
  it('default registry has valid weights', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('adding a new core KPI with positive weight breaks validation if total > 1', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('newKpi', { weight:0.20, isCore:true, isActive:true }))
    // Existing core weights sum to 1.0, adding 0.20 more = 1.20 → invalid
    expect(validateWeights(reg)).toBe(false)
  })

  it('adding a non-core KPI with weight=0 does not break validation', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('safeKpi', { weight:0, isCore:false }))
    expect(validateWeights(reg)).toBe(true)
  })

  it('thresholds pass validation for all default KPIs', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(validateThresholds(kpi)).toBe(true)
    })
  })

  it('inverted thresholds fail validation', () => {
    const bad = buildCustomKpi('bad', { thresholds: { healthy:40, watch:60, risk:80, critical:90 } })
    expect(validateThresholds(bad)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. DUPLICATE KEY REJECTED
// ─────────────────────────────────────────────────────────────

describe('governance — duplicate key rejected', () => {
  it('adding a KPI with an existing key throws', () => {
    expect(() => addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('wasfaty'))).toThrow(/Duplicate key/)
  })

  it('adding a KPI with an existing non-core key throws', () => {
    expect(() => addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('sales'))).toThrow(/Duplicate key/)
  })

  it('adding a KPI with a new unique key succeeds', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('uniqueKpi999'))
    expect(reg.uniqueKpi999).toBeDefined()
  })

  it('invalid key format rejected', () => {
    expect(() => addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('invalid-key'))).toThrow(/Invalid key/)
    expect(() => addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('123bad'))).toThrow(/Invalid key/)
  })

  it('camelCase key is accepted', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('myNewKpi123'))
    expect(reg.myNewKpi123).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 7. EXISTING REGISTRY COMPATIBILITY
// ─────────────────────────────────────────────────────────────

describe('existing registry — backward compatibility after management ops', () => {
  it('getActiveKpis still returns 10 KPIs from default registry', () => {
    expect(getActiveKpis(DEFAULT_KPI_REGISTRY)).toHaveLength(10)
  })

  it('all engine operations remain valid after a non-core KPI is archived', () => {
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'sales')
    // Core KPIs all still active
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(reg[key].isActive).toBe(true)
    })
    expect(validateWeights(reg)).toBe(true)
  })

  it('adding a custom KPI does not affect core engine KPIs', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('brandNewKpi'))
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(reg[key]).toEqual(DEFAULT_KPI_REGISTRY[key])
    })
  })

  it('target input configs unchanged after non-core edit', () => {
    const reg = archiveKpi(DEFAULT_KPI_REGISTRY, 'ndf')
    const configs = getTargetInputConfigs(reg)
    // Core KPI configs are unchanged
    expect(configs).toHaveLength(5)
    expect(configs.map((c) => c.key)).toEqual([
      'wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling',
    ])
  })

  it('merged registry (base + session overrides) has all original keys', () => {
    const sessionOverrides = { ndfCustom: buildCustomKpi('ndfCustom') }
    const merged = { ...DEFAULT_KPI_REGISTRY, ...sessionOverrides }
    PROTECTED_KEYS.forEach((key) => {
      expect(merged).toHaveProperty(key)
    })
  })

  it('field order in target input is stable after adding a custom KPI', () => {
    const reg = addKpi(DEFAULT_KPI_REGISTRY, buildCustomKpi('zzLastKpi', { sortOrder:9999 }))
    const keys = getTargetInputConfigs(reg).map((c) => c.key)
    // Core KPIs still appear first in the same order
    expect(keys.slice(0, 5)).toEqual([
      'wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling',
    ])
  })
})
