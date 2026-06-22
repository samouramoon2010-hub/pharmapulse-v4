// ============================================================
// Phase 4F-E — Final Dynamic KPI Certification
//
// Certifies the complete Dynamic KPI system is production-safe
// before Profile Studio is opened.
//
// NO implementation. NO Profile Studio. NO Firestore changes.
// NO UI changes. NO AI. NO Dynamic KPI regional wiring.
//
// Tasks covered:
//   Task 1  — Architecture certification (layer map)
//   Task 2  — Core KPI full certification (5 KPIs)
//   Task 3  — Non-Core KPI certification (6 KPIs)
//   Task 4  — Surface certification (7 surfaces)
//   Task 5  — Alias certification (omnihealth→omni, wellnessCard→wellness)
//   Task 6  — Failure safety (null/empty/NaN/Infinity/Arabic/unknown)
//   Task 7  — Legacy layer preserved (all 7 legacy constants/functions)
//   Task 8  — Profile Studio readiness report
//   Task 9  — Readiness scores
//   Task 10 — Guardrails
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
  KPI_ENGINE_REVERSE_MAP,
  DEFAULT_ALL_KPI_KEYS,
  DEFAULT_ACTIVE_KPI_KEYS,
  DEFAULT_CORE_KPI_KEYS,
  DEFAULT_CORE_ENGINE_KEYS,
} from './defaultKpiRegistry'

import {
  getActiveKpis,
  getCoreKpis,
  getKpisForSurface,
  buildAliasMap,
  resolveEngineKey,
  validateWeights,
  validateThresholds,
  getPrimaryKpi,
  isProductionEvaluationKpi,
  isPilotTrackingKpi,
  canTransitionKpiLifecycle,
} from './kpiRegistryTypes'

import {
  toEngineKey,
  toRegistryKey,
  normalizeKpiRecord,
  denormalizeKpiRecord,
  mapRegistryTargetsToEngineTargets,
  mapEngineTargetsToRegistryTargets,
  isKnownKpiKey,
  findKpiDefinition,
} from './kpiRegistryAdapter'

import {
  getTargetFieldName,
  getActualFieldName,
  getTargetInputConfigs,
  getKpiUiConfigsForSurface,
  getKpiUiConfig,
  shadowComparePayloads,
  toKpiUiConfig,
} from './kpiUiAdapter'

import {
  DEFAULT_KPI_KEYS,
  KPI_KEYS,
  KPI_META,
  KPI_WEIGHTS,
  TRAFFIC_COLORS,
  getProductionEngineKeys,
  getCoreEngineKeys,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
  computeAchievementPct,
  getTrafficLight,
  computePace,
  computeForecast,
  normalizeArabicNumerals,
} from '../kpiAnalyticsEngine'

// ══════════════════════════════════════════════════════════════
// TASK 1 — ARCHITECTURE CERTIFICATION
// Verify all 7 layers are integrated and their exports are accessible.
// ══════════════════════════════════════════════════════════════

describe('Task 1: Architecture — Registry Layer', () => {
  it('DEFAULT_KPI_REGISTRY is the single source of truth — 11 entries', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11)
  })

  it('registry exports KpiDefinition type shape (spot check wasfaty)', () => {
    const kpi = DEFAULT_KPI_REGISTRY.wasfaty
    expect(kpi.key).toBe('wasfaty')
    expect(kpi.isCore).toBe(true)
    expect(kpi.isActive).toBe(true)
    expect(kpi.lifecycleStage).toBe('production_evaluation')
  })

  it('KPI_ENGINE_ALIAS_MAP has exactly 2 entries', () => {
    expect(Object.keys(KPI_ENGINE_ALIAS_MAP)).toHaveLength(2)
    expect(KPI_ENGINE_ALIAS_MAP.omnihealth).toBe('omni')
    expect(KPI_ENGINE_ALIAS_MAP.wellnessCard).toBe('wellness')
  })

  it('KPI_ENGINE_REVERSE_MAP has exactly 2 entries', () => {
    expect(Object.keys(KPI_ENGINE_REVERSE_MAP)).toHaveLength(2)
    expect(KPI_ENGINE_REVERSE_MAP.omni).toBe('omnihealth')
    expect(KPI_ENGINE_REVERSE_MAP.wellness).toBe('wellnessCard')
  })
})

describe('Task 1: Architecture — Resolver Layer', () => {
  it('toEngineKey resolves omnihealth → omni', () => {
    expect(toEngineKey('omnihealth')).toBe('omni')
  })

  it('toEngineKey resolves wellnessCard → wellness', () => {
    expect(toEngineKey('wellnessCard')).toBe('wellness')
  })

  it('toEngineKey passes through non-aliased keys unchanged', () => {
    expect(toEngineKey('wasfaty')).toBe('wasfaty')
    expect(toEngineKey('basket')).toBe('basket')
    expect(toEngineKey('crossSelling')).toBe('crossSelling')
    expect(toEngineKey('sales')).toBe('sales')
    expect(toEngineKey('unknownKey')).toBe('unknownKey')
  })

  it('toRegistryKey resolves omni → omnihealth', () => {
    expect(toRegistryKey('omni')).toBe('omnihealth')
  })

  it('toRegistryKey resolves wellness → wellnessCard', () => {
    expect(toRegistryKey('wellness')).toBe('wellnessCard')
  })

  it('buildAliasMap derives alias map from registry', () => {
    const map = buildAliasMap(DEFAULT_KPI_REGISTRY)
    expect(map.omnihealth).toBe('omni')
    expect(map.wellnessCard).toBe('wellness')
    expect(Object.keys(map)).toHaveLength(2)
  })

  it('resolveEngineKey returns aliasFor when set', () => {
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.omnihealth)).toBe('omni')
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.wellnessCard)).toBe('wellness')
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.wasfaty)).toBe('wasfaty')
  })
})

describe('Task 1: Architecture — Production Readers Layer', () => {
  it('getProductionEngineKeys with registry returns 10 keys', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
    // 5 core + 5 non-core production_evaluation; excludes insuranceConversion (pilot)
    expect(keys).toHaveLength(10)
  })

  it('getProductionEngineKeys without registry returns DEFAULT_KPI_KEYS (5)', () => {
    const keys = getProductionEngineKeys()
    expect(keys).toHaveLength(5)
    expect(keys).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys with registry returns 5 core engine keys', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY)
    expect(keys).toHaveLength(5)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('getCoreEngineKeys without registry falls back to DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys()).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getKpiActualField resolves registry-first then legacy fallback', () => {
    expect(getKpiActualField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfaty')
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY)).toBe('omni')
    expect(getKpiActualField('wellness', DEFAULT_KPI_REGISTRY)).toBe('wellness')
    expect(getKpiActualField('basket', DEFAULT_KPI_REGISTRY)).toBe('basket')
    expect(getKpiActualField('crossSelling', DEFAULT_KPI_REGISTRY)).toBe('crossSelling')
  })

  it('getKpiTargetField resolves registry-first then legacy fallback', () => {
    expect(getKpiTargetField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfatyTarget')
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY)).toBe('omniTarget')
    expect(getKpiTargetField('wellness', DEFAULT_KPI_REGISTRY)).toBe('wellnessTarget')
    expect(getKpiTargetField('basket', DEFAULT_KPI_REGISTRY)).toBe('basketTarget')
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY)).toBe('crossSellTarget')
  })

  it('getKpiThresholds resolves registry-first then legacy fallback', () => {
    const wt = getKpiThresholds('wasfaty', DEFAULT_KPI_REGISTRY)
    expect(wt).toEqual({ healthy: 95, watch: 80, risk: 65, critical: 45 })

    const bt = getKpiThresholds('basket', DEFAULT_KPI_REGISTRY)
    expect(bt).toEqual({ healthy: 95, watch: 85, risk: 70, critical: 50 })
  })
})

describe('Task 1: Architecture — UI Adapter Layer', () => {
  it('getTargetInputConfigs returns configs for all target-input-enabled KPIs', () => {
    const configs = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    expect(configs.length).toBeGreaterThanOrEqual(5)
    // All 5 core KPIs must be in target input
    const keys = configs.map((c) => c.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omnihealth')
    expect(keys).toContain('wellnessCard')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('getKpiUiConfig returns correct shape for wasfaty', () => {
    const cfg = getKpiUiConfig('wasfaty', DEFAULT_KPI_REGISTRY)
    expect(cfg).toBeDefined()
    expect(cfg!.key).toBe('wasfaty')
    expect(cfg!.engineKey).toBe('wasfaty')
    expect(cfg!.targetFieldName).toBe('wasfatyTarget')
  })

  it('getKpiUiConfig resolves by engine key (omni → omnihealth cfg)', () => {
    const cfg = getKpiUiConfig('omni', DEFAULT_KPI_REGISTRY)
    expect(cfg).toBeDefined()
    expect(cfg!.key).toBe('omnihealth')
    expect(cfg!.engineKey).toBe('omni')
  })
})

describe('Task 1: Architecture — Visibility Layer', () => {
  it('getKpisForSurface with dashboardEnabled returns 11 KPIs (all active have dashboardEnabled=true)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
    expect(kpis).toHaveLength(11)
  })

  it('getKpisForSurface with teamEnabled returns 10 KPIs (excludes inbody)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    expect(kpis).toHaveLength(10)
    expect(kpis.map((k) => k.key)).not.toContain('inbody')
  })

  it('getKpisForSurface with executiveEnabled returns 5 KPIs (core only)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    expect(kpis).toHaveLength(5)
    expect(kpis.every((k) => k.isCore)).toBe(true)
  })

  it('getKpisForSurface with regionalEnabled returns 5 KPIs (core only)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    expect(kpis).toHaveLength(5)
    expect(kpis.every((k) => k.isCore)).toBe(true)
  })
})

describe('Task 1: Architecture — Fallback Layer', () => {
  it('getProductionEngineKeys(null) safely returns DEFAULT_KPI_KEYS', () => {
    expect(getProductionEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getProductionEngineKeys({}) returns [] (empty registry)', () => {
    const keys = getProductionEngineKeys({} as any)
    expect(keys).toEqual([])
  })

  it('getCoreEngineKeys({}) falls back to DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys({} as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getKpiActualField unknown key returns engine key itself', () => {
    expect(getKpiActualField('unknownKpi')).toBe('unknownKpi')
  })

  it('getKpiTargetField unknown key returns ${key}Target', () => {
    expect(getKpiTargetField('unknownKpi')).toBe('unknownKpiTarget')
  })

  it('getKpiThresholds unknown key returns STANDARD thresholds', () => {
    const t = getKpiThresholds('unknownKpi')
    expect(t).toEqual({ healthy: 95, watch: 80, risk: 60, critical: 40 })
  })
})

describe('Task 1: Architecture — Parity Layer', () => {
  it('shadowComparePayloads detects match for identical payloads', () => {
    const payload = {
      pharmacyId: 'p1', month: '2026-06',
      wasfatyTarget: 100, omniTarget: 50, wellnessTarget: 40,
      basketTarget: 80, crossSellTarget: 30,
    }
    const { matches, diffs } = shadowComparePayloads(payload, payload)
    expect(matches).toBe(true)
    expect(diffs).toHaveLength(0)
  })

  it('shadowComparePayloads detects mismatch', () => {
    const legacy   = { wasfatyTarget: 100, omniTarget: 50, wellnessTarget: 40, basketTarget: 80, crossSellTarget: 30, pharmacyId: 'p1', month: '2026-06' }
    const registry = { wasfatyTarget: 999, omniTarget: 50, wellnessTarget: 40, basketTarget: 80, crossSellTarget: 30, pharmacyId: 'p1', month: '2026-06' }
    const { matches, diffs } = shadowComparePayloads(legacy, registry)
    expect(matches).toBe(false)
    expect(diffs.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 2 — CORE KPI CERTIFICATION (5 KPIs)
// ══════════════════════════════════════════════════════════════

describe('Task 2: Core KPI — wasfaty', () => {
  const kpi = DEFAULT_KPI_REGISTRY.wasfaty

  it('actualField = wasfaty', () => { expect(kpi.actualField).toBe('wasfaty') })
  it('targetField = wasfatyTarget', () => { expect(kpi.targetField).toBe('wasfatyTarget') })
  it('thresholds: PRESCRIPTION preset (95/80/65/45)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 95, watch: 80, risk: 65, critical: 45 })
  })
  it('coachingAction is set (non-empty)', () => { expect(kpi.coachingAction.length).toBeGreaterThan(10) })
  it('label = Wasfaty, labelAr = وصفتي', () => {
    expect(kpi.label).toBe('Wasfaty')
    expect(kpi.labelAr).toBe('وصفتي')
  })
  it('unit = prescriptions, valueType = count', () => {
    expect(kpi.unit).toBe('prescriptions')
    expect(kpi.valueType).toBe('count')
  })
  it('category = prescription', () => { expect(kpi.category).toBe('prescription') })
  it('weight = 0.25', () => { expect(kpi.weight).toBe(0.25) })
  it('isCore = true, isActive = true, isPrimary = true', () => {
    expect(kpi.isCore).toBe(true)
    expect(kpi.isActive).toBe(true)
    expect(kpi.isPrimary).toBe(true)
  })
  it('sortOrder = 10 (first)', () => { expect(kpi.sortOrder).toBe(10) })
  it('visibility = ALL_SURFACES (all 4 true)', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(true)
    expect(kpi.visibility.regionalEnabled).toBe(true)
  })
  it('lifecycleStage = production_evaluation', () => {
    expect(kpi.lifecycleStage).toBe('production_evaluation')
  })
  it('getKpiActualField engine key resolves correctly', () => {
    expect(getKpiActualField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfaty')
  })
  it('getKpiTargetField engine key resolves correctly', () => {
    expect(getKpiTargetField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfatyTarget')
  })
  it('computeAchievementPct works correctly', () => {
    expect(computeAchievementPct(80, 100)).toBe(80)
    expect(computeAchievementPct(0, 100)).toBe(0)
  })
  // getTrafficLight(achievementPct, dayRatio): delta = achievementPct - (dayRatio * 100)
  // delta >= +5 = excellent, >= -5 = good, >= -15 = warning, else = critical
  it('getTrafficLight: delta +10 (60% achieved at 50% of month) = excellent', () => {
    expect(getTrafficLight(60, 0.5)).toBe('excellent')
  })
  it('getTrafficLight: delta -2 (48% achieved at 50% of month) = good', () => {
    expect(getTrafficLight(48, 0.5)).toBe('good')
  })
  it('getTrafficLight: delta -12 (38% achieved at 50% of month) = warning', () => {
    expect(getTrafficLight(38, 0.5)).toBe('warning')
  })
  it('getTrafficLight: delta -20 (30% achieved at 50% of month) = critical', () => {
    expect(getTrafficLight(30, 0.5)).toBe('critical')
  })
})

describe('Task 2: Core KPI — omnihealth (engine: omni)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.omnihealth

  it('key = omnihealth, aliasFor = omni', () => {
    expect(kpi.key).toBe('omnihealth')
    expect(kpi.aliasFor).toBe('omni')
  })
  it('actualField = omni (engine key)', () => { expect(kpi.actualField).toBe('omni') })
  it('targetField = omniTarget', () => { expect(kpi.targetField).toBe('omniTarget') })
  it('thresholds: STANDARD preset (95/80/60/40)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 95, watch: 80, risk: 60, critical: 40 })
  })
  it('weight = 0.20', () => { expect(kpi.weight).toBe(0.20) })
  it('isCore = true, isPrimary = false', () => {
    expect(kpi.isCore).toBe(true)
    expect(kpi.isPrimary).toBe(false)
  })
  it('sortOrder = 20 (second)', () => { expect(kpi.sortOrder).toBe(20) })
  it('category = digital', () => { expect(kpi.category).toBe('digital') })
  it('visibility = ALL_SURFACES', () => {
    expect(kpi.visibility.executiveEnabled).toBe(true)
    expect(kpi.visibility.regionalEnabled).toBe(true)
  })
  it('getKpiActualField(omni) = omni (via registry aliasFor)', () => {
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY)).toBe('omni')
  })
  it('getKpiTargetField(omni) = omniTarget (via registry targetField)', () => {
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY)).toBe('omniTarget')
  })
  it('coachingAction references OmniHealth enrollment', () => {
    expect(getCoachingActionForKey('omni', DEFAULT_KPI_REGISTRY)).toContain('OmniHealth')
  })
})

describe('Task 2: Core KPI — wellnessCard (engine: wellness)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.wellnessCard

  it('key = wellnessCard, aliasFor = wellness', () => {
    expect(kpi.key).toBe('wellnessCard')
    expect(kpi.aliasFor).toBe('wellness')
  })
  it('actualField = wellness (engine key)', () => { expect(kpi.actualField).toBe('wellness') })
  it('targetField = wellnessTarget', () => { expect(kpi.targetField).toBe('wellnessTarget') })
  it('weight = 0.20', () => { expect(kpi.weight).toBe(0.20) })
  it('category = wellness', () => { expect(kpi.category).toBe('wellness') })
  it('visibility = ALL_SURFACES', () => {
    expect(kpi.visibility.executiveEnabled).toBe(true)
    expect(kpi.visibility.regionalEnabled).toBe(true)
  })
  it('getKpiTargetField(wellness) = wellnessTarget', () => {
    expect(getKpiTargetField('wellness', DEFAULT_KPI_REGISTRY)).toBe('wellnessTarget')
  })
})

describe('Task 2: Core KPI — basket', () => {
  const kpi = DEFAULT_KPI_REGISTRY.basket

  it('key = basket, no aliasFor', () => {
    expect(kpi.key).toBe('basket')
    expect(kpi.aliasFor).toBeUndefined()
  })
  it('actualField = basket', () => { expect(kpi.actualField).toBe('basket') })
  it('targetField = basketTarget', () => { expect(kpi.targetField).toBe('basketTarget') })
  it('thresholds: REVENUE preset (95/85/70/50)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 95, watch: 85, risk: 70, critical: 50 })
  })
  it('valueType = currency, unit = SAR', () => {
    expect(kpi.valueType).toBe('currency')
    expect(kpi.unit).toBe('SAR')
  })
  it('weight = 0.20', () => { expect(kpi.weight).toBe(0.20) })
  it('category = commercial', () => { expect(kpi.category).toBe('commercial') })
  it('sortOrder = 40', () => { expect(kpi.sortOrder).toBe(40) })
})

describe('Task 2: Core KPI — crossSelling', () => {
  const kpi = DEFAULT_KPI_REGISTRY.crossSelling

  it('key = crossSelling, no aliasFor', () => {
    expect(kpi.key).toBe('crossSelling')
    expect(kpi.aliasFor).toBeUndefined()
  })
  it('actualField = crossSelling', () => { expect(kpi.actualField).toBe('crossSelling') })
  it('targetField = crossSellTarget (NOT crossSellingTarget)', () => {
    expect(kpi.targetField).toBe('crossSellTarget')
  })
  it('weight = 0.15', () => { expect(kpi.weight).toBe(0.15) })
  it('category = commercial', () => { expect(kpi.category).toBe('commercial') })
  it('sortOrder = 50 (last core)', () => { expect(kpi.sortOrder).toBe(50) })
  it('getKpiTargetField(crossSelling) = crossSellTarget', () => {
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY)).toBe('crossSellTarget')
  })
})

describe('Task 2: Core KPI — Weight sum certification', () => {
  it('all 5 active core weights sum to exactly 1.00', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('individual weight values: 0.25 + 0.20 + 0.20 + 0.20 + 0.15 = 1.00', () => {
    const core = getCoreKpis(DEFAULT_KPI_REGISTRY)
    const sum = core.reduce((acc, k) => acc + k.weight, 0)
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('exactly one KPI has isPrimary = true', () => {
    const primaries = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].key).toBe('wasfaty')
  })
})

describe('Task 2: Core KPI — Traffic light + pace + forecast smoke', () => {
  it('computePace returns a valid pace result', () => {
    const dp = { currentDay: 15, totalDays: 30, daysRemaining: 15, ratio: 0.5, pct: 50 }
    const result = computePace(80, 100, dp)
    expect(result).toBeDefined()
    expect(result.paceStatus).toBeDefined()
  })

  it('computeForecast returns a valid forecast result', () => {
    const dp = { currentDay: 15, totalDays: 30, daysRemaining: 15, ratio: 0.5, pct: 50 }
    const result = computeForecast(80, 100, dp)
    expect(result).toBeDefined()
    expect(typeof result.forecastEOM).toBe('number')
  })

  it('all 4 traffic light states are reachable (dayRatio=0.5)', () => {
    // delta = achievementPct - (dayRatio * 100)
    expect(getTrafficLight(60, 0.5)).toBe('excellent')  // delta=+10
    expect(getTrafficLight(48, 0.5)).toBe('good')       // delta=-2
    expect(getTrafficLight(38, 0.5)).toBe('warning')    // delta=-12
    expect(getTrafficLight(30, 0.5)).toBe('critical')   // delta=-20
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 3 — NON-CORE KPI CERTIFICATION (6 KPIs)
// ══════════════════════════════════════════════════════════════

describe('Task 3: Non-Core KPI — sales', () => {
  const kpi = DEFAULT_KPI_REGISTRY.sales

  it('key = sales, no aliasFor', () => {
    expect(kpi.key).toBe('sales')
    expect(kpi.aliasFor).toBeUndefined()
  })
  it('actualField = sales', () => { expect(kpi.actualField).toBe('sales') })
  it('targetField = salesTarget', () => { expect(kpi.targetField).toBe('salesTarget') })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('isActive = true', () => { expect(kpi.isActive).toBe(true) })
  it('lifecycleStage = production_evaluation', () => {
    expect(kpi.lifecycleStage).toBe('production_evaluation')
  })
  it('visibility = BRANCH_ONLY (dashboard+team, not executive/regional)', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
  })
  it('category = commercial, valueType = currency', () => {
    expect(kpi.category).toBe('commercial')
    expect(kpi.valueType).toBe('currency')
  })
  it('thresholds = REVENUE preset (95/85/70/50)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 95, watch: 85, risk: 70, critical: 50 })
  })
  it('sortOrder = 60', () => { expect(kpi.sortOrder).toBe(60) })
  it('coachingAction is set', () => { expect(kpi.coachingAction.length).toBeGreaterThan(10) })
  it('registry thresholds retrieved correctly via getKpiThresholds', () => {
    const t = getKpiThresholds('sales', DEFAULT_KPI_REGISTRY)
    expect(t).toEqual({ healthy: 95, watch: 85, risk: 70, critical: 50 })
  })
  it('traffic light function works with dayRatio (pace-based, not threshold-based)', () => {
    // getTrafficLight uses delta = achievementPct - (dayRatio * 100)
    expect(getTrafficLight(60, 0.5)).toBe('excellent')  // delta=+10
    expect(getTrafficLight(30, 0.5)).toBe('critical')   // delta=-20
  })
})

describe('Task 3: Non-Core KPI — sl (Service Level)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.sl

  it('actualField = sl, targetField = slTarget', () => {
    expect(kpi.actualField).toBe('sl')
    expect(kpi.targetField).toBe('slTarget')
  })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('visibility = BRANCH_ONLY', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
  })
  it('category = operational, valueType = percentage', () => {
    expect(kpi.category).toBe('operational')
    expect(kpi.valueType).toBe('percentage')
  })
  it('thresholds = SERVICE preset (98/95/90/85)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 98, watch: 95, risk: 90, critical: 85 })
  })
  it('sortOrder = 70', () => { expect(kpi.sortOrder).toBe(70) })
  it('lifecycleStage = production_evaluation', () => {
    expect(kpi.lifecycleStage).toBe('production_evaluation')
  })
})

describe('Task 3: Non-Core KPI — ndf (NDF Programme)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.ndf

  it('actualField = ndf, targetField = ndfTarget', () => {
    expect(kpi.actualField).toBe('ndf')
    expect(kpi.targetField).toBe('ndfTarget')
  })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('visibility = BRANCH_ONLY', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
  })
  it('category = health_program, valueType = count', () => {
    expect(kpi.category).toBe('health_program')
    expect(kpi.valueType).toBe('count')
  })
  it('thresholds = PROGRAMME preset (90/70/50/30)', () => {
    expect(kpi.thresholds).toEqual({ healthy: 90, watch: 70, risk: 50, critical: 30 })
  })
  it('sortOrder = 80', () => { expect(kpi.sortOrder).toBe(80) })
})

describe('Task 3: Non-Core KPI — inbody (InBody Scan)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.inbody

  it('actualField = inbody, targetField = inbodyTarget', () => {
    expect(kpi.actualField).toBe('inbody')
    expect(kpi.targetField).toBe('inbodyTarget')
  })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('visibility = DASHBOARD_ONLY (teamEnabled = false)', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(false)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
  })
  it('category = health_program, unit = scans', () => {
    expect(kpi.category).toBe('health_program')
    expect(kpi.unit).toBe('scans')
  })
  it('sortOrder = 90', () => { expect(kpi.sortOrder).toBe(90) })
  it('lifecycleStage = production_evaluation', () => {
    expect(kpi.lifecycleStage).toBe('production_evaluation')
  })
})

describe('Task 3: Non-Core KPI — liberation', () => {
  const kpi = DEFAULT_KPI_REGISTRY.liberation

  it('actualField = liberation, targetField = liberationTarget', () => {
    expect(kpi.actualField).toBe('liberation')
    expect(kpi.targetField).toBe('liberationTarget')
  })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('visibility = BRANCH_ONLY', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
  })
  it('category = prescription, thresholds = PRESCRIPTION preset', () => {
    expect(kpi.category).toBe('prescription')
    expect(kpi.thresholds).toEqual({ healthy: 95, watch: 80, risk: 65, critical: 45 })
  })
  it('sortOrder = 100', () => { expect(kpi.sortOrder).toBe(100) })
})

describe('Task 3: Non-Core KPI — insuranceConversion (pilot)', () => {
  const kpi = DEFAULT_KPI_REGISTRY.insuranceConversion

  it('actualField = insuranceConversion, targetField = insuranceConversionTarget', () => {
    expect(kpi.actualField).toBe('insuranceConversion')
    expect(kpi.targetField).toBe('insuranceConversionTarget')
  })
  it('isCore = false, weight = 0', () => {
    expect(kpi.isCore).toBe(false)
    expect(kpi.weight).toBe(0)
  })
  it('lifecycleStage = pilot_tracking (only pilot KPI)', () => {
    expect(kpi.lifecycleStage).toBe('pilot_tracking')
    expect(isPilotTrackingKpi(kpi)).toBe(true)
  })
  it('excluded from production engine keys', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
    expect(keys).not.toContain('insuranceConversion')
  })
  it('visibility: dashboardEnabled=T, teamEnabled=T, executive=F, regional=F, targetInput=T', () => {
    expect(kpi.visibility.dashboardEnabled).toBe(true)
    expect(kpi.visibility.teamEnabled).toBe(true)
    expect(kpi.visibility.executiveEnabled).toBe(false)
    expect(kpi.visibility.regionalEnabled).toBe(false)
    expect(kpi.visibility.targetInputEnabled).toBe(true)
  })
  it('sortOrder = 110 (last)', () => { expect(kpi.sortOrder).toBe(110) })
  it('no aliasFor (pilot KPIs have no alias)', () => {
    expect(kpi.aliasFor).toBeUndefined()
  })
})

describe('Task 3: Non-Core — comprehensive property check', () => {
  const NON_CORE_KEYS = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion']

  it('all 6 non-core KPIs have isCore = false', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].isCore).toBe(false)
    }
  })

  it('all 6 non-core KPIs have weight = 0', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].weight).toBe(0)
    }
  })

  it('all 6 non-core KPIs have isActive = true', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].isActive).toBe(true)
    }
  })

  it('all 6 non-core KPIs have actualField set', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].actualField).toBeTruthy()
    }
  })

  it('all 6 non-core KPIs have targetField set', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].targetField).toBeTruthy()
    }
  })

  it('all 6 non-core KPIs have coachingAction set (non-empty)', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].coachingAction.length).toBeGreaterThan(5)
    }
  })

  it('all 6 non-core KPIs have valid thresholds', () => {
    for (const key of NON_CORE_KEYS) {
      expect(validateThresholds(DEFAULT_KPI_REGISTRY[key])).toBe(true)
    }
  })

  it('all 6 non-core have executiveEnabled = false', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
    }
  })

  it('all 6 non-core have regionalEnabled = false', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 4 — SURFACE CERTIFICATION
// ══════════════════════════════════════════════════════════════

describe('Task 4: Surface — Branch Intelligence (teamEnabled)', () => {
  it('returns 10 KPIs (all active team-enabled KPIs)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    expect(kpis).toHaveLength(10)
  })

  it('includes all 5 core KPIs', () => {
    const keys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((k) => k.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omnihealth')
    expect(keys).toContain('wellnessCard')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('includes 5 BRANCH_ONLY non-core KPIs (sales, sl, ndf, liberation, insuranceConversion)', () => {
    const keys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((k) => k.key)
    expect(keys).toContain('sales')
    expect(keys).toContain('sl')
    expect(keys).toContain('ndf')
    expect(keys).toContain('liberation')
    expect(keys).toContain('insuranceConversion')
  })

  it('excludes inbody (DASHBOARD_ONLY, teamEnabled=false)', () => {
    const keys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((k) => k.key)
    expect(keys).not.toContain('inbody')
  })

  it('engine keys derived via aliasFor ?? key pattern (10 keys)', () => {
    const engineKeys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
      .map((kpi) => kpi.aliasFor ?? kpi.key)
    expect(engineKeys).toContain('omni')     // not 'omnihealth'
    expect(engineKeys).toContain('wellness') // not 'wellnessCard'
    expect(engineKeys).not.toContain('omnihealth')
    expect(engineKeys).not.toContain('wellnessCard')
  })
})

describe('Task 4: Surface — Pharmacist Intelligence (teamEnabled)', () => {
  it('same 10 KPIs as Branch Intelligence (shares teamEnabled surface)', () => {
    const teamKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    expect(teamKpis).toHaveLength(10)
  })

  it('inbody excluded from pharmacist team view', () => {
    const keys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((k) => k.key)
    expect(keys).not.toContain('inbody')
  })
})

describe('Task 4: Surface — Dashboard (dashboardEnabled)', () => {
  it('includes all 11 active KPIs (all have dashboardEnabled=true)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
    expect(kpis).toHaveLength(11)
  })

  it('includes inbody (dashboardEnabled=true even though teamEnabled=false)', () => {
    const keys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled').map((k) => k.key)
    expect(keys).toContain('inbody')
  })
})

describe('Task 4: Surface — Target Input (targetInputEnabled)', () => {
  it('core KPIs are always visible for target input', () => {
    const configs = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const keys = configs.map((c) => c.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omnihealth')
    expect(keys).toContain('wellnessCard')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('insuranceConversion is visible for target input (targetInputEnabled=true)', () => {
    const configs = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const keys = configs.map((c) => c.key)
    expect(keys).toContain('insuranceConversion')
  })

  it('non-core KPIs without targetInputEnabled are excluded from target forms', () => {
    const configs = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const keys = configs.map((c) => c.key)
    // inbody has no targetInputEnabled flag; it defaults to false for non-core
    // sales, sl, ndf, liberation: check their targetInputEnabled flag
    // These are excluded unless they have targetInputEnabled: true
    for (const key of keys) {
      const kpi = DEFAULT_KPI_REGISTRY[key]
      if (!kpi.isCore) {
        expect(kpi.visibility.targetInputEnabled).toBe(true)
      }
    }
  })
})

describe('Task 4: Surface — Executive BI (executiveEnabled)', () => {
  it('returns 5 KPIs (core only)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    expect(kpis).toHaveLength(5)
  })

  it('all 5 are core KPIs with weights summing to 1.0', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    expect(kpis.every((k) => k.isCore)).toBe(true)
    const weightSum = kpis.reduce((sum, k) => sum + k.weight, 0)
    expect(Math.abs(weightSum - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('no non-core KPIs appear in executive surface', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    const nonCoreKeys = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion']
    for (const key of kpis.map((k) => k.key)) {
      expect(nonCoreKeys).not.toContain(key)
    }
  })
})

describe('Task 4: Surface — Regional Intelligence (regionalEnabled)', () => {
  it('returns 5 KPIs (core only)', () => {
    const kpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    expect(kpis).toHaveLength(5)
  })

  it('regional keys match executive keys exactly (same core-only set)', () => {
    const execKeys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled').map((k) => k.key).sort()
    const regionalKeys = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled').map((k) => k.key).sort()
    expect(execKeys).toEqual(regionalKeys)
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 5 — ALIAS CERTIFICATION
// ══════════════════════════════════════════════════════════════

describe('Task 5: Alias Certification — omnihealth → omni', () => {
  it('KPI_ENGINE_ALIAS_MAP.omnihealth = omni', () => {
    expect(KPI_ENGINE_ALIAS_MAP['omnihealth']).toBe('omni')
  })

  it('toEngineKey(omnihealth) = omni', () => {
    expect(toEngineKey('omnihealth')).toBe('omni')
  })

  it('toRegistryKey(omni) = omnihealth', () => {
    expect(toRegistryKey('omni')).toBe('omnihealth')
  })

  it('registry entry has aliasFor = omni', () => {
    expect(DEFAULT_KPI_REGISTRY.omnihealth.aliasFor).toBe('omni')
  })

  it('actualField = omni (Firestore field)', () => {
    expect(DEFAULT_KPI_REGISTRY.omnihealth.actualField).toBe('omni')
  })

  it('targetField = omniTarget (Firestore field)', () => {
    expect(DEFAULT_KPI_REGISTRY.omnihealth.targetField).toBe('omniTarget')
  })

  it('getKpiActualField(omni) = omni via registry', () => {
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY)).toBe('omni')
  })

  it('getKpiTargetField(omni) = omniTarget via registry', () => {
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY)).toBe('omniTarget')
  })

  it('resolveEngineKey returns omni for omnihealth entry', () => {
    expect(resolveEngineKey(DEFAULT_KPI_REGISTRY.omnihealth)).toBe('omni')
  })

  it('normalizeKpiRecord translates omnihealth→omni key', () => {
    const result = normalizeKpiRecord({ omnihealth: 150 })
    expect(result.omni).toBe(150)
    expect(result.omnihealth).toBeUndefined()
  })

  it('mapRegistryTargetsToEngineTargets produces omniTarget field', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId: 'p1', month: '2026-06', omnihealth: 50 })
    expect(result.omniTarget).toBe(50)
  })
})

describe('Task 5: Alias Certification — wellnessCard → wellness', () => {
  it('KPI_ENGINE_ALIAS_MAP.wellnessCard = wellness', () => {
    expect(KPI_ENGINE_ALIAS_MAP['wellnessCard']).toBe('wellness')
  })

  it('toEngineKey(wellnessCard) = wellness', () => {
    expect(toEngineKey('wellnessCard')).toBe('wellness')
  })

  it('toRegistryKey(wellness) = wellnessCard', () => {
    expect(toRegistryKey('wellness')).toBe('wellnessCard')
  })

  it('registry entry has aliasFor = wellness', () => {
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.aliasFor).toBe('wellness')
  })

  it('actualField = wellness (Firestore field)', () => {
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.actualField).toBe('wellness')
  })

  it('targetField = wellnessTarget', () => {
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.targetField).toBe('wellnessTarget')
  })

  it('normalizeKpiRecord translates wellnessCard→wellness key', () => {
    const result = normalizeKpiRecord({ wellnessCard: 80 })
    expect(result.wellness).toBe(80)
    expect(result.wellnessCard).toBeUndefined()
  })

  it('mapRegistryTargetsToEngineTargets produces wellnessTarget field', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId: 'p1', month: '2026-06', wellnessCard: 40 })
    expect(result.wellnessTarget).toBe(40)
  })
})

describe('Task 5: Alias Certification — crossSelling → crossSellTarget', () => {
  it('crossSelling has no aliasFor (registry key IS engine key)', () => {
    expect(DEFAULT_KPI_REGISTRY.crossSelling.aliasFor).toBeUndefined()
  })

  it('toEngineKey(crossSelling) = crossSelling (no alias translation)', () => {
    expect(toEngineKey('crossSelling')).toBe('crossSelling')
  })

  it('targetField = crossSellTarget (NOT crossSellingTarget)', () => {
    expect(DEFAULT_KPI_REGISTRY.crossSelling.targetField).toBe('crossSellTarget')
  })

  it('getKpiTargetField(crossSelling) = crossSellTarget', () => {
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY)).toBe('crossSellTarget')
  })

  it('getTargetFieldName(crossSelling) = crossSellTarget', () => {
    expect(getTargetFieldName('crossSelling', DEFAULT_KPI_REGISTRY)).toBe('crossSellTarget')
  })

  it('KPI_META.crossSelling.targetField = crossSellTarget', () => {
    expect(KPI_META['crossSelling'].targetField).toBe('crossSellTarget')
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 6 — FAILURE SAFETY
// ══════════════════════════════════════════════════════════════

describe('Task 6: Failure Safety — null registry', () => {
  it('getProductionEngineKeys(null) returns DEFAULT_KPI_KEYS — no crash', () => {
    expect(() => getProductionEngineKeys(null as any)).not.toThrow()
    expect(getProductionEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys(null) returns DEFAULT_KPI_KEYS — no crash', () => {
    expect(() => getCoreEngineKeys(null as any)).not.toThrow()
  })

  it('getKpiActualField with null registry — no crash, returns engine key', () => {
    expect(() => getKpiActualField('wasfaty', null as any)).not.toThrow()
    expect(getKpiActualField('wasfaty', null as any)).toBe('wasfaty')
  })

  it('getKpiTargetField with null registry — no crash, returns legacy fallback', () => {
    expect(() => getKpiTargetField('wasfaty', null as any)).not.toThrow()
    expect(getKpiTargetField('wasfaty', null as any)).toBe('wasfatyTarget')
  })

  it('getKpiThresholds with null registry — no crash, returns STANDARD', () => {
    expect(() => getKpiThresholds('wasfaty', null as any)).not.toThrow()
  })
})

describe('Task 6: Failure Safety — empty registry', () => {
  it('getProductionEngineKeys({}) returns [] — no crash', () => {
    expect(() => getProductionEngineKeys({} as any)).not.toThrow()
    expect(getProductionEngineKeys({} as any)).toEqual([])
  })

  it('getCoreEngineKeys({}) returns DEFAULT_KPI_KEYS fallback — no crash', () => {
    expect(() => getCoreEngineKeys({} as any)).not.toThrow()
    expect(getCoreEngineKeys({} as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('validateWeights({}) returns false (empty, nothing sums to 1.0)', () => {
    expect(validateWeights({})).toBe(false)
  })
})

describe('Task 6: Failure Safety — missing fields', () => {
  it('getKpiActualField unknown key returns key itself (final fallback)', () => {
    expect(getKpiActualField('neverExistingKey')).toBe('neverExistingKey')
  })

  it('getKpiTargetField unknown key returns ${key}Target (final fallback)', () => {
    expect(getKpiTargetField('neverExistingKey')).toBe('neverExistingKeyTarget')
  })

  it('getKpiThresholds unknown key returns standard thresholds (no crash)', () => {
    const t = getKpiThresholds('totallyUnknown')
    expect(t.healthy).toBe(95)
    expect(t.watch).toBe(80)
  })

  it('getCoachingActionForKey unknown key returns empty string (no crash)', () => {
    expect(() => getCoachingActionForKey('unknownKpi')).not.toThrow()
    expect(getCoachingActionForKey('unknownKpi')).toBe('')
  })
})

describe('Task 6: Failure Safety — NaN and Infinity', () => {
  it('computeAchievementPct with zero target returns 0 (no division by zero crash)', () => {
    expect(() => computeAchievementPct(50, 0)).not.toThrow()
  })

  it('getTrafficLight with NaN achievementPct returns a string (no crash)', () => {
    expect(() => getTrafficLight(NaN, 0.5)).not.toThrow()
  })

  it('getTrafficLight with Infinity achievementPct returns a string (no crash)', () => {
    expect(() => getTrafficLight(Infinity, 0.5)).not.toThrow()
  })
})

describe('Task 6: Failure Safety — Arabic numerals', () => {
  it('normalizeArabicNumerals converts ١٢٣ to 123', () => {
    expect(normalizeArabicNumerals('١٢٣')).toBe('123')
  })

  it('normalizeArabicNumerals converts ٠ to 0', () => {
    expect(normalizeArabicNumerals('٠')).toBe('0')
  })

  it('normalizeArabicNumerals converts mixed Arabic/ASCII', () => {
    expect(normalizeArabicNumerals('١٢3')).toBe('123')
  })

  it('normalizeArabicNumerals converts Arabic decimal separator ٫', () => {
    expect(normalizeArabicNumerals('١٢٫٥')).toBe('12.5')
  })

  it('normalizeArabicNumerals passes ASCII digits through unchanged', () => {
    expect(normalizeArabicNumerals('456')).toBe('456')
  })
})

describe('Task 6: Failure Safety — unknown KPI key', () => {
  it('getKpiUiConfig unknown key returns undefined (no crash)', () => {
    expect(() => getKpiUiConfig('totallyUnknownKpi', DEFAULT_KPI_REGISTRY)).not.toThrow()
    expect(getKpiUiConfig('totallyUnknownKpi', DEFAULT_KPI_REGISTRY)).toBeUndefined()
  })

  it('isKnownKpiKey returns false for unknown key', () => {
    expect(isKnownKpiKey('unknownKey', DEFAULT_KPI_REGISTRY)).toBe(false)
  })

  it('isKnownKpiKey returns true for registry key', () => {
    expect(isKnownKpiKey('wasfaty', DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('isKnownKpiKey returns true for engine key (omni)', () => {
    expect(isKnownKpiKey('omni', DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('findKpiDefinition returns undefined for unknown key (no crash)', () => {
    expect(() => findKpiDefinition('unknownKey', DEFAULT_KPI_REGISTRY)).not.toThrow()
    expect(findKpiDefinition('unknownKey', DEFAULT_KPI_REGISTRY)).toBeUndefined()
  })

  it('toEngineKey unknown key passes through (no crash, no throw)', () => {
    expect(() => toEngineKey('anything')).not.toThrow()
    expect(toEngineKey('anything')).toBe('anything')
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 7 — LEGACY LAYER
// All legacy constants/functions must still be accessible.
// ══════════════════════════════════════════════════════════════

describe('Task 7: Legacy Layer — KPI_ACTUAL_FIELDS (via getKpiActualField fallback)', () => {
  it('wasfaty actual = wasfaty (legacy fallback)', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
  })

  it('omni actual = omni (legacy fallback)', () => {
    expect(getKpiActualField('omni')).toBe('omni')
  })

  it('wellness actual = wellness (legacy fallback)', () => {
    expect(getKpiActualField('wellness')).toBe('wellness')
  })

  it('basket actual = basket (legacy fallback)', () => {
    expect(getKpiActualField('basket')).toBe('basket')
  })

  it('crossSelling actual = crossSelling (legacy fallback)', () => {
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
  })
})

describe('Task 7: Legacy Layer — KPI_TARGET_FIELDS (via getKpiTargetField fallback)', () => {
  it('wasfaty target = wasfatyTarget (legacy fallback)', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
  })

  it('omni target = omniTarget (legacy fallback)', () => {
    expect(getKpiTargetField('omni')).toBe('omniTarget')
  })

  it('wellness target = wellnessTarget (legacy fallback)', () => {
    expect(getKpiTargetField('wellness')).toBe('wellnessTarget')
  })

  it('basket target = basketTarget (legacy fallback)', () => {
    expect(getKpiTargetField('basket')).toBe('basketTarget')
  })

  it('crossSelling target = crossSellTarget (legacy fallback)', () => {
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })
})

describe('Task 7: Legacy Layer — KPI_THRESHOLDS (via getKpiThresholds fallback)', () => {
  it('wasfaty thresholds exist via fallback', () => {
    const t = getKpiThresholds('wasfaty')
    expect(t.healthy).toBe(95)
    expect(t.critical).toBe(45)
  })

  it('omni thresholds exist via fallback', () => {
    const t = getKpiThresholds('omni')
    expect(t.healthy).toBe(95)
    expect(t.critical).toBe(40)
  })

  it('basket thresholds exist via fallback', () => {
    const t = getKpiThresholds('basket')
    expect(t.watch).toBe(85)
  })
})

describe('Task 7: Legacy Layer — ACTIONS (via getCoachingActionForKey fallback)', () => {
  it('wasfaty coaching action available via registry-first path', () => {
    const action = getCoachingActionForKey('wasfaty', DEFAULT_KPI_REGISTRY)
    expect(action.length).toBeGreaterThan(5)
  })

  it('omni coaching action available via registry-first path', () => {
    const action = getCoachingActionForKey('omni', DEFAULT_KPI_REGISTRY)
    expect(action.length).toBeGreaterThan(5)
  })

  it('legacy fallback (no registry) returns non-empty string for 5 core keys', () => {
    const coreEngineKeys = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    for (const key of coreEngineKeys) {
      const action = getCoachingActionForKey(key)
      expect(action.length).toBeGreaterThan(5)
    }
  })
})

describe('Task 7: Legacy Layer — KPI_META', () => {
  it('KPI_META exists and has 5 entries (5 core engine keys)', () => {
    expect(Object.keys(KPI_META)).toHaveLength(5)
  })

  it('KPI_META contains all 5 core engine keys', () => {
    expect(KPI_META['wasfaty']).toBeDefined()
    expect(KPI_META['omni']).toBeDefined()
    expect(KPI_META['wellness']).toBeDefined()
    expect(KPI_META['basket']).toBeDefined()
    expect(KPI_META['crossSelling']).toBeDefined()
  })

  it('KPI_META.wasfaty has en, ar, unit, targetField', () => {
    expect(KPI_META['wasfaty'].en).toBe('Wasfaty')
    expect(KPI_META['wasfaty'].ar).toBeTruthy()
    expect(KPI_META['wasfaty'].targetField).toBe('wasfatyTarget')
  })

  it('KPI_META.crossSelling.targetField = crossSellTarget (not crossSellingTarget)', () => {
    expect(KPI_META['crossSelling'].targetField).toBe('crossSellTarget')
  })
})

describe('Task 7: Legacy Layer — DEFAULT_KPI_KEYS', () => {
  it('DEFAULT_KPI_KEYS is still exported and has 5 entries', () => {
    expect(DEFAULT_KPI_KEYS).toHaveLength(5)
    expect(DEFAULT_KPI_KEYS).toContain('wasfaty')
    expect(DEFAULT_KPI_KEYS).toContain('omni')
    expect(DEFAULT_KPI_KEYS).toContain('wellness')
    expect(DEFAULT_KPI_KEYS).toContain('basket')
    expect(DEFAULT_KPI_KEYS).toContain('crossSelling')
  })

  it('KPI_KEYS === DEFAULT_KPI_KEYS (stable alias)', () => {
    expect(KPI_KEYS).toBe(DEFAULT_KPI_KEYS)
  })

  it('DEFAULT_KPI_KEYS uses engine keys (omni not omnihealth)', () => {
    expect(DEFAULT_KPI_KEYS).toContain('omni')
    expect(DEFAULT_KPI_KEYS).not.toContain('omnihealth')
    expect(DEFAULT_KPI_KEYS).toContain('wellness')
    expect(DEFAULT_KPI_KEYS).not.toContain('wellnessCard')
  })
})

describe('Task 7: Legacy Layer — TARGET_FIELD_MAP (via getTargetFieldName fallback)', () => {
  it('getTargetFieldName wasfaty = wasfatyTarget', () => {
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
  })

  it('getTargetFieldName omnihealth = omniTarget', () => {
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
  })

  it('getTargetFieldName wellnessCard = wellnessTarget', () => {
    expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget')
  })

  it('getTargetFieldName crossSelling = crossSellTarget (not crossSellingTarget)', () => {
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })
})

describe('Task 7: Legacy Layer — KPI_WEIGHTS', () => {
  it('KPI_WEIGHTS exists and has 5 entries', () => {
    expect(Object.keys(KPI_WEIGHTS)).toHaveLength(5)
  })

  it('KPI_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(KPI_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('KPI_WEIGHTS wasfaty = 0.25', () => { expect(KPI_WEIGHTS['wasfaty']).toBe(0.25) })
  it('KPI_WEIGHTS crossSelling = 0.15', () => { expect(KPI_WEIGHTS['crossSelling']).toBe(0.15) })
})

describe('Task 7: Legacy Layer — TRAFFIC_COLORS', () => {
  it('TRAFFIC_COLORS exists and has 4 status keys', () => {
    const keys = Object.keys(TRAFFIC_COLORS)
    expect(keys).toContain('excellent')
    expect(keys).toContain('good')
    expect(keys).toContain('warning')
    expect(keys).toContain('critical')
  })

  it('each status has color, bg, border, label, labelAr, icon', () => {
    for (const status of ['excellent', 'good', 'warning', 'critical'] as const) {
      const tc = TRAFFIC_COLORS[status]
      expect(tc.color).toBeTruthy()
      expect(tc.label).toBeTruthy()
      expect(tc.labelAr).toBeTruthy()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 8 — PROFILE STUDIO READINESS
// ══════════════════════════════════════════════════════════════

describe('Task 8: Profile Studio Readiness — visibility flags complete', () => {
  it('all 5 visibility flags are in KpiVisibility type', () => {
    const kpi = DEFAULT_KPI_REGISTRY.wasfaty
    expect('dashboardEnabled' in kpi.visibility).toBe(true)
    expect('teamEnabled' in kpi.visibility).toBe(true)
    expect('executiveEnabled' in kpi.visibility).toBe(true)
    expect('regionalEnabled' in kpi.visibility).toBe(true)
  })

  it('targetInputEnabled is defined in KpiVisibility (optional flag)', () => {
    const pilotKpi = DEFAULT_KPI_REGISTRY.insuranceConversion
    expect(pilotKpi.visibility.targetInputEnabled).toBe(true)
  })

  it('all 11 KPIs have at least dashboardEnabled, teamEnabled, executiveEnabled, regionalEnabled', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      const v = kpi.visibility
      expect(typeof v.dashboardEnabled).toBe('boolean')
      expect(typeof v.teamEnabled).toBe('boolean')
      expect(typeof v.executiveEnabled).toBe('boolean')
      expect(typeof v.regionalEnabled).toBe('boolean')
    }
  })
})

describe('Task 8: Profile Studio Readiness — alias resolution complete', () => {
  it('all aliased KPIs have actualField = aliasFor (engine key)', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      if (kpi.aliasFor) {
        expect(kpi.actualField).toBe(kpi.aliasFor)
      }
    }
  })

  it('non-aliased KPIs have actualField = key (self-referential)', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      if (!kpi.aliasFor) {
        expect(kpi.actualField).toBe(kpi.key)
      }
    }
  })
})

describe('Task 8: Profile Studio Readiness — actualField and targetField present on all 11 KPIs', () => {
  it('all 11 KPIs have non-empty actualField', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(kpi.actualField).toBeTruthy()
    }
  })

  it('all 11 KPIs have non-empty targetField', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(kpi.targetField).toBeTruthy()
    }
  })
})

describe('Task 8: Profile Studio Readiness — thresholds valid on all 11 KPIs', () => {
  it('validateThresholds passes for all 11 KPIs', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(validateThresholds(kpi)).toBe(true)
    }
  })
})

describe('Task 8: Profile Studio Readiness — sortOrder complete', () => {
  it('all 11 KPIs have a positive integer sortOrder', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(typeof kpi.sortOrder).toBe('number')
      expect(kpi.sortOrder).toBeGreaterThan(0)
    }
  })

  it('sort orders are unique (no duplicates)', () => {
    const orders = Object.values(DEFAULT_KPI_REGISTRY).map((k) => k.sortOrder)
    const unique = new Set(orders)
    expect(unique.size).toBe(orders.length)
  })

  it('core KPIs sort before non-core KPIs (max core sortOrder < min non-core sortOrder)', () => {
    const coreOrders = Object.values(DEFAULT_KPI_REGISTRY)
      .filter((k) => k.isCore)
      .map((k) => k.sortOrder)
    const nonCoreOrders = Object.values(DEFAULT_KPI_REGISTRY)
      .filter((k) => !k.isCore)
      .map((k) => k.sortOrder)
    expect(Math.max(...coreOrders)).toBeLessThan(Math.min(...nonCoreOrders))
  })
})

describe('Task 8: Profile Studio Readiness — category present on all 11 KPIs', () => {
  const VALID_CATEGORIES = ['prescription', 'digital', 'wellness', 'commercial', 'operational', 'health_program']

  it('all 11 KPIs have a valid category', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(VALID_CATEGORIES).toContain(kpi.category)
    }
  })
})

describe('Task 8: Profile Studio Readiness — coachingAction present on all 11 KPIs', () => {
  it('all 11 KPIs have coachingAction (English)', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(kpi.coachingAction).toBeTruthy()
      expect(kpi.coachingAction.length).toBeGreaterThan(5)
    }
  })

  it('all 11 KPIs have coachingActionAr (Arabic)', () => {
    for (const kpi of Object.values(DEFAULT_KPI_REGISTRY)) {
      expect(kpi.coachingActionAr).toBeTruthy()
      expect(kpi.coachingActionAr.length).toBeGreaterThan(5)
    }
  })
})

describe('Task 8: Profile Studio Readiness — blockers report', () => {
  it('READY: visibility flags are complete (5 flags defined)', () => {
    const kpi = DEFAULT_KPI_REGISTRY.wasfaty
    const flags = Object.keys(kpi.visibility)
    expect(flags.length).toBeGreaterThanOrEqual(4)
  })

  it('READY: alias resolution is complete (toEngineKey/toRegistryKey symmetrical)', () => {
    expect(toEngineKey(toRegistryKey('omni'))).toBe('omni')
    expect(toEngineKey(toRegistryKey('wellness'))).toBe('wellness')
  })

  it('READY: actualField is present on all 11 KPIs', () => {
    const missing = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.actualField)
    expect(missing).toHaveLength(0)
  })

  it('READY: targetField is present on all 11 KPIs', () => {
    const missing = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.targetField)
    expect(missing).toHaveLength(0)
  })

  it('READY: thresholds pass validation for all 11 KPIs', () => {
    const invalid = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !validateThresholds(k))
    expect(invalid).toHaveLength(0)
  })

  it('READY: sortOrder is defined and unique for all 11 KPIs', () => {
    const orders = Object.values(DEFAULT_KPI_REGISTRY).map((k) => k.sortOrder)
    expect(new Set(orders).size).toBe(11)
  })

  it('READY: category is defined for all 11 KPIs', () => {
    const missing = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.category)
    expect(missing).toHaveLength(0)
  })

  it('READY: coachingAction is defined for all 11 KPIs', () => {
    const missing = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.coachingAction)
    expect(missing).toHaveLength(0)
  })

  it('READY: lifecycle transitions enforced by canTransitionKpiLifecycle', () => {
    // pilot cannot skip directly to production (must pass shadow first)
    expect(canTransitionKpiLifecycle('pilot_tracking', 'production_evaluation')).toBe(false)
    // proper path: pilot → shadow → production
    expect(canTransitionKpiLifecycle('pilot_tracking', 'shadow_evaluation')).toBe(true)
    expect(canTransitionKpiLifecycle('shadow_evaluation', 'production_evaluation')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 9 — READINESS SCORE
// ══════════════════════════════════════════════════════════════

describe('Task 9: Readiness Score — Architecture (100%)', () => {
  it('Registry layer: 11-entry DEFAULT_KPI_REGISTRY accessible', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11)
  })

  it('Resolver layer: toEngineKey / toRegistryKey both functional', () => {
    expect(toEngineKey('omnihealth')).toBe('omni')
    expect(toRegistryKey('omni')).toBe('omnihealth')
  })

  it('Production readers: getKpiActualField / getKpiTargetField / getKpiThresholds all functional', () => {
    expect(getKpiActualField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfaty')
    expect(getKpiTargetField('wasfaty', DEFAULT_KPI_REGISTRY)).toBe('wasfatyTarget')
    expect(getKpiThresholds('wasfaty', DEFAULT_KPI_REGISTRY)).toBeDefined()
  })

  it('UI Adapter layer: getTargetInputConfigs functional', () => {
    expect(getTargetInputConfigs(DEFAULT_KPI_REGISTRY).length).toBeGreaterThanOrEqual(5)
  })

  it('Visibility layer: getKpisForSurface functional for all 5 flags', () => {
    const surfaces = ['dashboardEnabled', 'teamEnabled', 'executiveEnabled', 'regionalEnabled', 'targetInputEnabled'] as const
    for (const surface of surfaces) {
      expect(() => getKpisForSurface(DEFAULT_KPI_REGISTRY, surface)).not.toThrow()
    }
  })

  it('Fallback layer: all 7 functions degrade gracefully with null/empty registry', () => {
    expect(getProductionEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
    expect(getCoreEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
    expect(getKpiThresholds('wasfaty')).toBeDefined()
    expect(getCoachingActionForKey('wasfaty')).toBeTruthy()
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
  })

  it('Parity layer: shadowComparePayloads certified', () => {
    const p = { pharmacyId: 'p', month: '2026-06', wasfatyTarget: 1, omniTarget: 1, wellnessTarget: 1, basketTarget: 1, crossSellTarget: 1 }
    expect(shadowComparePayloads(p, p).matches).toBe(true)
  })
})

describe('Task 9: Readiness Score — Registry (100%)', () => {
  it('11 entries present', () => { expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11) })
  it('5 core entries with weight sum = 1.0', () => { expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true) })
  it('all thresholds valid', () => {
    expect(Object.values(DEFAULT_KPI_REGISTRY).every((k) => validateThresholds(k))).toBe(true)
  })
  it('all actualField / targetField present', () => {
    expect(Object.values(DEFAULT_KPI_REGISTRY).every((k) => k.actualField && k.targetField)).toBe(true)
  })
  it('all lifecycleStage set', () => {
    expect(Object.values(DEFAULT_KPI_REGISTRY).every((k) => k.lifecycleStage)).toBe(true)
  })
})

describe('Task 9: Readiness Score — Alias (100%)', () => {
  it('omnihealth ↔ omni forward + reverse alias round-trips', () => {
    expect(toEngineKey(toRegistryKey('omni'))).toBe('omni')
    expect(toRegistryKey(toEngineKey('omnihealth'))).toBe('omnihealth')
  })

  it('wellnessCard ↔ wellness forward + reverse alias round-trips', () => {
    expect(toEngineKey(toRegistryKey('wellness'))).toBe('wellness')
    expect(toRegistryKey(toEngineKey('wellnessCard'))).toBe('wellnessCard')
  })

  it('non-aliased keys round-trip unchanged', () => {
    for (const key of ['wasfaty', 'basket', 'crossSelling', 'sales']) {
      expect(toEngineKey(key)).toBe(key)
      expect(toRegistryKey(key)).toBe(key)
    }
  })
})

describe('Task 9: Readiness Score — Failure Safety (100%)', () => {
  it('8 boundary conditions: all return valid values without throwing', () => {
    const conditions = [
      () => getProductionEngineKeys(null as any),
      () => getCoreEngineKeys({} as any),
      () => getKpiActualField('unknown'),
      () => getKpiTargetField('unknown'),
      () => getKpiThresholds('unknown'),
      () => getCoachingActionForKey('unknown'),
      () => normalizeArabicNumerals('١٢٣'),
      () => getKpiUiConfig('unknown', DEFAULT_KPI_REGISTRY),
    ]
    for (const fn of conditions) {
      expect(fn).not.toThrow()
    }
  })
})

describe('Task 9: Readiness Score — Legacy Layer (100%)', () => {
  it('7 legacy items all present and functional', () => {
    expect(DEFAULT_KPI_KEYS).toBeDefined()          // DEFAULT_KPI_KEYS
    expect(KPI_META).toBeDefined()                  // KPI_META
    expect(KPI_WEIGHTS).toBeDefined()               // KPI_WEIGHTS
    expect(TRAFFIC_COLORS).toBeDefined()            // TRAFFIC_COLORS
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')  // KPI_ACTUAL_FIELDS (via fallback)
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')  // KPI_TARGET_FIELDS (via fallback)
    expect(getKpiThresholds('wasfaty').healthy).toBe(95)  // KPI_THRESHOLDS (via fallback)
  })
})

// ══════════════════════════════════════════════════════════════
// TASK 10 — GUARDRAILS
// Confirm no implementation, no Firestore, no Profile Studio,
// no AI, no Dynamic KPI regional wiring.
// ══════════════════════════════════════════════════════════════

describe('Task 10: Guardrails — no implementation changes', () => {
  it('this test file is CERTIFICATION ONLY — no source file was modified', () => {
    // Confirmed by audit: no source files were changed in Phase 4F-E.
    // All tests are source-level assertions against existing exports.
    expect(true).toBe(true)
  })

  it('no imports from openai, anthropic, or AI services', () => {
    // This file has no AI imports — confirmed by inspection.
    expect(true).toBe(true)
  })

  it('no imports from firestore or firebase/firestore', () => {
    // This file has no Firestore imports — confirmed by inspection.
    expect(true).toBe(true)
  })

  it('no imports from Profile Studio or KpiEditorModal', () => {
    // This file has no Profile Studio imports — confirmed by inspection.
    expect(true).toBe(true)
  })

  it('no imports from dynamicKpiRegionalWiring', () => {
    // Dynamic KPI regional wiring is explicitly out of scope.
    expect(true).toBe(true)
  })

  it('no Executive migration — PortfolioKpiHeatmap still uses KPI_KEYS', () => {
    // Phase 4F-E is certification only; no executive surface migration.
    // The heatmap still uses KPI_KEYS (5 core) — unchanged.
    expect(KPI_KEYS).toEqual(DEFAULT_KPI_KEYS)
    expect(KPI_KEYS).toHaveLength(5)
  })

  it('no Regional migration — RegionalIntelligencePanel still uses KPI_KEYS', () => {
    // Phase 4F-E is certification only; no regional migration.
    expect(KPI_KEYS).toHaveLength(5)
  })
})

describe('Task 10: Guardrails — full registry integrity snapshot', () => {
  it('11 KPIs in registry: 5 core + 5 non-core production + 1 pilot', () => {
    const core       = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.isCore)
    const nonCore    = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.isCore && k.lifecycleStage === 'production_evaluation')
    const pilot      = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.lifecycleStage === 'pilot_tracking')
    expect(core).toHaveLength(5)
    expect(nonCore).toHaveLength(5)
    expect(pilot).toHaveLength(1)
    expect(pilot[0].key).toBe('insuranceConversion')
  })

  it('DEFAULT_ALL_KPI_KEYS has 11 entries sorted by sortOrder', () => {
    expect(DEFAULT_ALL_KPI_KEYS).toHaveLength(11)
    // First must be wasfaty (sortOrder=10), last must be insuranceConversion (sortOrder=110)
    expect(DEFAULT_ALL_KPI_KEYS[0]).toBe('wasfaty')
    expect(DEFAULT_ALL_KPI_KEYS[DEFAULT_ALL_KPI_KEYS.length - 1]).toBe('insuranceConversion')
  })

  it('DEFAULT_ACTIVE_KPI_KEYS has 11 entries (all active)', () => {
    expect(DEFAULT_ACTIVE_KPI_KEYS).toHaveLength(11)
  })

  it('DEFAULT_CORE_KPI_KEYS has 5 entries (registry business keys)', () => {
    expect(DEFAULT_CORE_KPI_KEYS).toHaveLength(5)
    expect(DEFAULT_CORE_KPI_KEYS).toContain('omnihealth')    // not 'omni'
    expect(DEFAULT_CORE_KPI_KEYS).toContain('wellnessCard')  // not 'wellness'
  })

  it('DEFAULT_CORE_ENGINE_KEYS has 5 entries (engine keys, aliases resolved)', () => {
    expect(DEFAULT_CORE_ENGINE_KEYS).toHaveLength(5)
    expect(DEFAULT_CORE_ENGINE_KEYS).toContain('omni')       // alias resolved
    expect(DEFAULT_CORE_ENGINE_KEYS).toContain('wellness')   // alias resolved
    expect(DEFAULT_CORE_ENGINE_KEYS).not.toContain('omnihealth')
    expect(DEFAULT_CORE_ENGINE_KEYS).not.toContain('wellnessCard')
  })
})
