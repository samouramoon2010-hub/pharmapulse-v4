// ============================================================
// KPI UI Adapter Tests
// Covers: target input config generation, field mapping,
//         target payload shape, inactive KPI exclusion,
//         archived KPI readability, field order stability,
//         no duplicates, shadow comparison.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  getTargetInputConfigs,
  getTargetFieldName,
  getKpiUiConfig,
  buildTargetPayload,
  buildFormInitialState,
  shadowComparePayloads,
  toKpiUiConfig,
} from './kpiUiAdapter'

import {
  DEFAULT_KPI_REGISTRY,
} from './defaultKpiRegistry'

// ─────────────────────────────────────────────────────────────
// 1. TARGET INPUT CONFIGS — generation
// ─────────────────────────────────────────────────────────────

describe('getTargetInputConfigs — generation', () => {
  it('returns exactly 5 configs (core active KPIs only)', () => {
    const configs = getTargetInputConfigs()
    expect(configs).toHaveLength(5)
  })

  it('all returned configs have isVisibleForTargetInput = true', () => {
    getTargetInputConfigs().forEach((cfg) => {
      expect(cfg.isVisibleForTargetInput).toBe(true)
    })
  })

  it('all returned configs have uiStatus = ACTIVE', () => {
    getTargetInputConfigs().forEach((cfg) => {
      expect(cfg.uiStatus).toBe('ACTIVE')
    })
  })

  it('configs contain required shape fields', () => {
    getTargetInputConfigs().forEach((cfg) => {
      expect(cfg.key).toBeTruthy()
      expect(cfg.engineKey).toBeTruthy()
      expect(cfg.targetFieldName).toBeTruthy()
      expect(cfg.label).toBeTruthy()
      expect(cfg.shortLabel).toBeTruthy()
      expect(cfg.inputPlaceholder).toBeDefined()
      expect(cfg.inputHint).toBeTruthy()
      expect(typeof cfg.precision).toBe('number')
      expect(cfg.displayFormat).toBeTruthy()
      expect(cfg.uiSection).toBeTruthy()
    })
  })

  it('no duplicate registry keys in configs', () => {
    const keys = getTargetInputConfigs().map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('no duplicate targetFieldNames in configs', () => {
    const fields = getTargetInputConfigs().map((c) => c.targetFieldName)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('no duplicate engineKeys in configs', () => {
    const engineKeys = getTargetInputConfigs().map((c) => c.engineKey)
    expect(new Set(engineKeys).size).toBe(engineKeys.length)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. FIELD ORDER STABILITY
// ─────────────────────────────────────────────────────────────

describe('getTargetInputConfigs — field order stability', () => {
  it('returns configs in stable sortOrder', () => {
    const configs = getTargetInputConfigs()
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i].inputOrder).toBeGreaterThan(configs[i - 1].inputOrder)
    }
  })

  it('calling twice returns the same order', () => {
    const c1 = getTargetInputConfigs().map((c) => c.key)
    const c2 = getTargetInputConfigs().map((c) => c.key)
    expect(c1).toEqual(c2)
  })

  it('wasfaty is first in the target form', () => {
    const configs = getTargetInputConfigs()
    expect(configs[0].key).toBe('wasfaty')
  })

  it('crossSelling is last of the core KPIs', () => {
    const configs = getTargetInputConfigs()
    expect(configs[configs.length - 1].key).toBe('crossSelling')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. FIELD MAPPING — omnihealth → omniTarget
// ─────────────────────────────────────────────────────────────

describe('field mapping — omnihealth → omniTarget', () => {
  it('omnihealth registry key maps to engineKey "omni"', () => {
    const configs = getTargetInputConfigs()
    const omni = configs.find((c) => c.key === 'omnihealth')
    expect(omni).toBeDefined()
    expect(omni?.engineKey).toBe('omni')
  })

  it('omnihealth maps to targetFieldName "omniTarget"', () => {
    const configs = getTargetInputConfigs()
    const omni = configs.find((c) => c.key === 'omnihealth')
    expect(omni?.targetFieldName).toBe('omniTarget')
  })

  it('getTargetFieldName("omnihealth") returns "omniTarget"', () => {
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// 4. FIELD MAPPING — wellnessCard → wellnessTarget
// ─────────────────────────────────────────────────────────────

describe('field mapping — wellnessCard → wellnessTarget', () => {
  it('wellnessCard registry key maps to engineKey "wellness"', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'wellnessCard')
    expect(cfg?.engineKey).toBe('wellness')
  })

  it('wellnessCard maps to targetFieldName "wellnessTarget"', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'wellnessCard')
    expect(cfg?.targetFieldName).toBe('wellnessTarget')
  })

  it('getTargetFieldName("wellnessCard") returns "wellnessTarget"', () => {
    expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. FIELD MAPPING — other core KPIs
// ─────────────────────────────────────────────────────────────

describe('field mapping — other core KPIs (no alias)', () => {
  it('wasfaty → wasfatyTarget (no alias)', () => {
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
  })

  it('basket → basketTarget (no alias)', () => {
    expect(getTargetFieldName('basket')).toBe('basketTarget')
  })

  it('crossSelling → crossSellTarget (no alias)', () => {
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })

  it('wasfaty engineKey is "wasfaty" (identity — no alias)', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'wasfaty')
    expect(cfg?.engineKey).toBe('wasfaty')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. INACTIVE / NON-CORE KPI EXCLUSION
// ─────────────────────────────────────────────────────────────

describe('inactive and non-core KPI exclusion', () => {
  it('sales is not visible in target input (non-core, isCore=false)', () => {
    const configs = getTargetInputConfigs()
    expect(configs.find((c) => c.key === 'sales')).toBeUndefined()
  })

  it('sl is not visible in target input', () => {
    expect(getTargetInputConfigs().find((c) => c.key === 'sl')).toBeUndefined()
  })

  it('ndf is not visible in target input', () => {
    expect(getTargetInputConfigs().find((c) => c.key === 'ndf')).toBeUndefined()
  })

  it('inbody is not visible in target input', () => {
    expect(getTargetInputConfigs().find((c) => c.key === 'inbody')).toBeUndefined()
  })

  it('liberation is not visible in target input', () => {
    expect(getTargetInputConfigs().find((c) => c.key === 'liberation')).toBeUndefined()
  })

  it('inactive KPI with isActive=false would also be excluded', () => {
    const testRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      wasfaty: { ...DEFAULT_KPI_REGISTRY.wasfaty, isActive: false, isCore: false },
    }
    const configs = getTargetInputConfigs(testRegistry)
    expect(configs.find((c) => c.key === 'wasfaty')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 7. ARCHIVED KPI READABILITY
// ─────────────────────────────────────────────────────────────

describe('archived KPI — historical readability', () => {
  it('getKpiUiConfig finds any KPI by registry key (including inactive)', () => {
    // Even if a KPI becomes inactive, getKpiUiConfig can still return its config
    // for historical display (e.g. showing old target documents)
    const salesCfg = getKpiUiConfig('sales')
    expect(salesCfg).toBeDefined()
    expect(salesCfg?.key).toBe('sales')
    expect(salesCfg?.targetFieldName).toBe('salesTarget')
  })

  it('archived KPI uiStatus is ARCHIVED when isActive=false', () => {
    const testRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      sales: { ...DEFAULT_KPI_REGISTRY.sales, isActive: false },
    }
    const cfg = getKpiUiConfig('sales', testRegistry)
    expect(cfg?.uiStatus).toBe('ARCHIVED')
  })

  it('ACTIVE KPI uiStatus is ACTIVE', () => {
    const cfg = getKpiUiConfig('wasfaty')
    expect(cfg?.uiStatus).toBe('ACTIVE')
  })

  it('getKpiUiConfig returns undefined for unknown key', () => {
    expect(getKpiUiConfig('totallyUnknownKpi')).toBeUndefined()
  })

  it('getKpiUiConfig finds KPI by engine key alias (omni → omnihealth config)', () => {
    const cfg = getKpiUiConfig('omni')  // engine key
    expect(cfg).toBeDefined()
    expect(cfg?.key).toBe('omnihealth')  // returns the registry key
    expect(cfg?.engineKey).toBe('omni')
  })
})

// ─────────────────────────────────────────────────────────────
// 8. TARGET PAYLOAD — preserves existing Firestore shape
// ─────────────────────────────────────────────────────────────

describe('buildTargetPayload — preserves existing shape', () => {
  const configs = getTargetInputConfigs()

  const formValues = {
    wasfatyTarget:   200,
    omniTarget:      160,
    wellnessTarget:  120,
    basketTarget:    100,
    crossSellTarget: 80,
  }

  it('produces a payload with all 5 core target fields', () => {
    const payload = buildTargetPayload('p1', '2025-05', formValues, configs)
    expect(payload.wasfatyTarget).toBe(200)
    expect(payload.omniTarget).toBe(160)
    expect(payload.wellnessTarget).toBe(120)
    expect(payload.basketTarget).toBe(100)
    expect(payload.crossSellTarget).toBe(80)
  })

  it('includes pharmacyId and month', () => {
    const payload = buildTargetPayload('p42', '2025-06', formValues, configs)
    expect(payload.pharmacyId).toBe('p42')
    expect(payload.month).toBe('2025-06')
  })

  it('defaults missing values to 0 (no NaN)', () => {
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload.wasfatyTarget).toBe(0)
    expect(payload.omniTarget).toBe(0)
    expect(isNaN(payload.wasfatyTarget)).toBe(false)
  })

  it('handles negative values safely (clamps to 0)', () => {
    const payload = buildTargetPayload('p1', '2025-05', { wasfatyTarget: -10 }, configs)
    expect(payload.wasfatyTarget).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 9. SHADOW COMPARISON — registry vs legacy payload
// ─────────────────────────────────────────────────────────────

describe('shadowComparePayloads — registry matches legacy shape', () => {
  it('registry-driven payload matches legacy hardcoded payload', () => {
    const configs = getTargetInputConfigs()
    const formValues = {
      wasfatyTarget: 200, omniTarget: 160, wellnessTarget: 120,
      basketTarget: 100, crossSellTarget: 80,
    }

    // Legacy hardcoded payload (as in old TargetsPage.jsx handleSave)
    const legacy = {
      pharmacyId:      'p1',
      month:           '2025-05',
      wasfatyTarget:   200,
      omniTarget:      160,
      wellnessTarget:  120,
      basketTarget:    100,
      crossSellTarget: 80,
    }

    const registryPayload = buildTargetPayload('p1', '2025-05', formValues, configs)
    const { matches, diffs } = shadowComparePayloads(legacy, registryPayload)

    expect(diffs).toHaveLength(0)
    expect(matches).toBe(true)
  })

  it('detects differences between payloads', () => {
    const legacy = { pharmacyId: 'p1', month: '2025-05', wasfatyTarget: 200 }
    const wrong  = { pharmacyId: 'p1', month: '2025-05', wasfatyTarget: 999 }
    const { matches, diffs } = shadowComparePayloads(legacy, wrong)
    expect(matches).toBe(false)
    expect(diffs.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 10. buildFormInitialState
// ─────────────────────────────────────────────────────────────

describe('buildFormInitialState', () => {
  const configs = getTargetInputConfigs()

  it('returns zero values when no existing target', () => {
    const state = buildFormInitialState(null, configs)
    configs.forEach((cfg) => {
      expect(state[cfg.targetFieldName]).toBe(0)
    })
  })

  it('reads values from existing target document', () => {
    const existing = { wasfatyTarget: 200, omniTarget: 160 }
    const state = buildFormInitialState(existing, configs)
    expect(state.wasfatyTarget).toBe(200)
    expect(state.omniTarget).toBe(160)
  })

  it('defaults missing fields to 0', () => {
    const state = buildFormInitialState({ wasfatyTarget: 100 }, configs)
    expect(state.omniTarget).toBe(0)
    expect(state.wellnessTarget).toBe(0)
  })

  it('handles NaN values safely', () => {
    const state = buildFormInitialState({ wasfatyTarget: NaN }, configs)
    expect(state.wasfatyTarget).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 11. PRECISION & FORMAT DERIVATION
// ─────────────────────────────────────────────────────────────

describe('precision and displayFormat', () => {
  it('currency KPI (basket) has precision=2 and displayFormat=currency_sar', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'basket')
    expect(cfg?.precision).toBe(2)
    expect(cfg?.displayFormat).toBe('currency_sar')
  })

  it('count KPI (wasfaty) has precision=0 and displayFormat=number', () => {
    const cfg = getTargetInputConfigs().find((c) => c.key === 'wasfaty')
    expect(cfg?.precision).toBe(0)
    expect(cfg?.displayFormat).toBe('number')
  })

  it('percentage KPI (sl) has precision=1 and displayFormat=percent_1', () => {
    const slDef = DEFAULT_KPI_REGISTRY['sl']
    const cfg = toKpiUiConfig(slDef, 1)
    expect(cfg.precision).toBe(1)
    expect(cfg.displayFormat).toBe('percent_1')
  })
})

// ─────────────────────────────────────────────────────────────
// 12. getTargetFieldName — unknown key fallback
// ─────────────────────────────────────────────────────────────

describe('getTargetFieldName — unknown key fallback', () => {
  it('falls back to ${engineKey}Target for unknown keys', () => {
    expect(getTargetFieldName('someNewKpi')).toBe('someNewKpiTarget')
  })

  it('respects alias when engine key differs from registry key', () => {
    // omnihealth → engine key is 'omni' → omniTarget
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
  })
})
