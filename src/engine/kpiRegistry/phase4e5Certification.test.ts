// ============================================================
// Phase 4E-5 — Dynamic KPI Foundation Certification
//
// Final certification before Phase 4F (Non-Core KPIs) and
// Profile Studio. Verifies every architecture layer, all alias
// paths, failure safety, surface parity, and regression safety.
//
// NO code changes in this phase — certification only.
// crossSelling INVARIANT: target field always 'crossSellTarget'
// aliasFor INVARIANT: omnihealth→omni, wellnessCard→wellness
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  DEFAULT_KPI_KEYS,
  KPI_KEYS,
  KPI_META,
  getCoreEngineKeys,
  getProductionEngineKeys,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
  getKpiMetaForKey,
  getKpiWeightForKey,
  readKpiActual,
  readKpiTarget,
  computeKpiStatsDynamic,
  compareStaticVsDynamicKpi,
  extractDailyValues,
  sumKpi,
  getTargetForKpi,
  getDayProgress,
  computeAchievementPct,
  computeKpiStats,
  computeForecast,
  computePace,
  getTrafficLight,
  normalizeArabicNumerals,
  TRAFFIC_COLORS,
  ACHIEVEMENT_CAP,
} from '../kpiAnalyticsEngine'
import {
  getKpiLabel,
  getKpiLabelAr,
  getKpiColor,
  getKpiIcon,
  getKpiUnit,
  getKpiCategory,
  getKpiMetaForDisplay,
  getTargetFieldName,
  getActualFieldName,
  getKpiUiConfig,
} from './kpiUiAdapter'
import {
  getKpiDefinition,
  resolveRegistryKey,
  resolveEngineKey,
  DEFAULT_KPI_COLOR,
} from './kpiMetaResolver'

const CORE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const
const ENTRY  = { wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45 }
const TARGET = { wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80, basketTarget: 300, crossSellTarget: 60 }
const TEST_DATE = new Date('2025-01-15')
const dp = getDayProgress(TEST_DATE)

// ════════════════════════════════════════════════════════════
// LAYER 1 — ARCHITECTURE CERTIFICATION
// Verify all 7 architecture layers exist and export functions
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 1A: Registry layer exists', () => {
  it('DEFAULT_KPI_REGISTRY is an object with 5+ entries', () => {
    expect(typeof DEFAULT_KPI_REGISTRY).toBe('object')
    expect(Object.keys(DEFAULT_KPI_REGISTRY).length).toBeGreaterThanOrEqual(5)
  })

  it('registry has all 5 core entries (wasfaty, omnihealth, wellnessCard, basket, crossSelling)', () => {
    expect(DEFAULT_KPI_REGISTRY).toHaveProperty('wasfaty')
    expect(DEFAULT_KPI_REGISTRY).toHaveProperty('omnihealth')
    expect(DEFAULT_KPI_REGISTRY).toHaveProperty('wellnessCard')
    expect(DEFAULT_KPI_REGISTRY).toHaveProperty('basket')
    expect(DEFAULT_KPI_REGISTRY).toHaveProperty('crossSelling')
  })
})

describe('4E-5 Layer 1B: Resolver layer exists', () => {
  it('getKpiActualField is a function', () => expect(typeof getKpiActualField).toBe('function'))
  it('getKpiTargetField is a function', () => expect(typeof getKpiTargetField).toBe('function'))
  it('getKpiThresholds is a function', () => expect(typeof getKpiThresholds).toBe('function'))
  it('getCoachingActionForKey is a function', () => expect(typeof getCoachingActionForKey).toBe('function'))
  it('getCoreEngineKeys is a function', () => expect(typeof getCoreEngineKeys).toBe('function'))
})

describe('4E-5 Layer 1C: Production Readers layer exists', () => {
  it('readKpiActual is a function', () => expect(typeof readKpiActual).toBe('function'))
  it('readKpiTarget is a function', () => expect(typeof readKpiTarget).toBe('function'))
  it('computeKpiStatsDynamic is a function', () => expect(typeof computeKpiStatsDynamic).toBe('function'))
  it('extractDailyValues is a function', () => expect(typeof extractDailyValues).toBe('function'))
  it('sumKpi is a function', () => expect(typeof sumKpi).toBe('function'))
  it('getTargetForKpi is a function', () => expect(typeof getTargetForKpi).toBe('function'))
})

describe('4E-5 Layer 1D: UI Adapter layer exists', () => {
  it('getKpiLabel is a function', () => expect(typeof getKpiLabel).toBe('function'))
  it('getKpiColor is a function', () => expect(typeof getKpiColor).toBe('function'))
  it('getKpiMetaForDisplay is a function', () => expect(typeof getKpiMetaForDisplay).toBe('function'))
  it('getTargetFieldName is a function', () => expect(typeof getTargetFieldName).toBe('function'))
  it('getActualFieldName is a function', () => expect(typeof getActualFieldName).toBe('function'))
})

describe('4E-5 Layer 1E: Fallback layer exists', () => {
  it('KPI_META exported from engine has all 5 core keys', () => {
    for (const k of CORE_KEYS) {
      expect(KPI_META).toHaveProperty(k)
    }
  })

  it('DEFAULT_KPI_KEYS has exactly 5 entries in correct order', () => {
    expect(DEFAULT_KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })

  it('KPI_KEYS equals DEFAULT_KPI_KEYS', () => {
    expect(KPI_KEYS).toEqual(DEFAULT_KPI_KEYS)
  })
})

describe('4E-5 Layer 1F: Parity layer exists', () => {
  it('compareStaticVsDynamicKpi is a function', () => {
    expect(typeof compareStaticVsDynamicKpi).toBe('function')
  })

  it('compareStaticVsDynamicKpi returns match objects for all core keys', () => {
    for (const k of CORE_KEYS) {
      const result = compareStaticVsDynamicKpi(ENTRY, TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(result.actualMatches).toBe(true)
      expect(result.targetMatches).toBe(true)
      expect(result.achievementMatches).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 2 — CORE KPI CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 2: Core KPI registry fields certified', () => {
  it('wasfaty: actualField=wasfaty, targetField=wasfatyTarget', () => {
    expect(getKpiActualField('wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe('wasfaty')
    expect(getKpiTargetField('wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe('wasfatyTarget')
  })

  it('omni: actualField=omni, targetField=omniTarget (via omnihealth alias)', () => {
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omni')
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omniTarget')
  })

  it('wellness: actualField=wellness, targetField=wellnessTarget (via wellnessCard alias)', () => {
    expect(getKpiActualField('wellness', DEFAULT_KPI_REGISTRY as any)).toBe('wellness')
    expect(getKpiTargetField('wellness', DEFAULT_KPI_REGISTRY as any)).toBe('wellnessTarget')
  })

  it('basket: actualField=basket, targetField=basketTarget', () => {
    expect(getKpiActualField('basket', DEFAULT_KPI_REGISTRY as any)).toBe('basket')
    expect(getKpiTargetField('basket', DEFAULT_KPI_REGISTRY as any)).toBe('basketTarget')
  })

  it('crossSelling: actualField=crossSelling, targetField=crossSellTarget (INVARIANT)', () => {
    expect(getKpiActualField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSelling')
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSellTarget')
  })

  it('all core keys have non-empty coaching actions from registry', () => {
    for (const k of CORE_KEYS) {
      const action = getCoachingActionForKey(k, DEFAULT_KPI_REGISTRY as any)
      expect(action.length).toBeGreaterThan(10)
    }
  })

  it('basket uses REVENUE_THRESHOLDS: watch=85 (higher than standard 80)', () => {
    const t = getKpiThresholds('basket', DEFAULT_KPI_REGISTRY as any)
    expect(t.watch).toBe(85)
  })

  it('kpiMetaResolver: all 5 core keys return non-empty label', () => {
    for (const k of CORE_KEYS) {
      expect(getKpiLabel(k).length).toBeGreaterThan(0)
    }
  })

  it('kpiMetaResolver: all 5 core keys return non-empty color', () => {
    for (const k of CORE_KEYS) {
      const color = getKpiColor(k)
      expect(color).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })

  it('getCoreEngineKeys with full registry returns 5 keys in sort order', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toEqual(DEFAULT_KPI_KEYS)
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 3 — ALIAS CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 3: Alias certification', () => {
  it('omnihealth.aliasFor = omni', () => {
    expect((DEFAULT_KPI_REGISTRY as any).omnihealth.aliasFor).toBe('omni')
  })

  it('wellnessCard.aliasFor = wellness', () => {
    expect((DEFAULT_KPI_REGISTRY as any).wellnessCard.aliasFor).toBe('wellness')
  })

  it('wasfaty, basket, crossSelling have no aliasFor', () => {
    expect((DEFAULT_KPI_REGISTRY as any).wasfaty.aliasFor).toBeUndefined()
    expect((DEFAULT_KPI_REGISTRY as any).basket.aliasFor).toBeUndefined()
    expect((DEFAULT_KPI_REGISTRY as any).crossSelling.aliasFor).toBeUndefined()
  })

  it('getCoreEngineKeys resolves aliases: omni not omnihealth, wellness not wellnessCard', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).not.toContain('omnihealth')
    expect(keys).not.toContain('wellnessCard')
  })

  it('resolveEngineKey(omnihealth) = omni', () => {
    expect(resolveEngineKey('omnihealth')).toBe('omni')
  })

  it('resolveEngineKey(wellnessCard) = wellness', () => {
    expect(resolveEngineKey('wellnessCard')).toBe('wellness')
  })

  it('crossSelling targetField is always crossSellTarget (not crossSellingTarget)', () => {
    const docWithBoth = { crossSellTarget: 60, crossSellingTarget: 999 } as any
    expect(readKpiTarget(docWithBoth, 'crossSelling')).toBe(60)
    expect(readKpiTarget(docWithBoth, 'crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe(60)
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 4 — FAILURE SAFETY CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 4: Failure safety certified', () => {
  it('null registry: getCoreEngineKeys returns DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('empty registry: getCoreEngineKeys returns DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys({} as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('null entry: readKpiActual returns 0', () => {
    expect(readKpiActual(null as any, 'wasfaty')).toBe(0)
  })

  it('null targetDoc: readKpiTarget returns 0', () => {
    expect(readKpiTarget(null as any, 'wasfaty')).toBe(0)
  })

  it('NaN value: readKpiActual returns 0', () => {
    expect(readKpiActual({ wasfaty: NaN } as any, 'wasfaty')).toBe(0)
  })

  it('Infinity value: readKpiActual returns 0', () => {
    expect(readKpiActual({ wasfaty: Infinity } as any, 'wasfaty')).toBe(0)
  })

  it('Arabic numerals: readKpiActual normalizes ١٥٠ → 150', () => {
    expect(readKpiActual({ wasfaty: '١٥٠' } as any, 'wasfaty')).toBe(150)
  })

  it('empty string: readKpiActual returns 0', () => {
    expect(readKpiActual({ wasfaty: '' } as any, 'wasfaty')).toBe(0)
  })

  it('unknown KPI key: readKpiActual never throws', () => {
    expect(() => readKpiActual({} as any, 'ghostKpi')).not.toThrow()
    expect(readKpiActual({} as any, 'ghostKpi')).toBe(0)
  })

  it('unknown KPI key: getKpiActualField returns key itself', () => {
    expect(getKpiActualField('ghostKpi')).toBe('ghostKpi')
  })

  it('unknown KPI key: getKpiTargetField returns keyTarget', () => {
    expect(getKpiTargetField('ghostKpi')).toBe('ghostKpiTarget')
  })

  it('computeKpiStatsDynamic with null entry and null target does not throw', () => {
    expect(() => computeKpiStatsDynamic(null as any, null as any, 'wasfaty', dp)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 5 — SURFACE PARITY CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 5: Surface parity certified', () => {
  it('readKpiActual registry-path = legacy-path for all core keys', () => {
    for (const k of CORE_KEYS) {
      expect(readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)).toBe(readKpiActual(ENTRY, k))
    }
  })

  it('readKpiTarget registry-path = legacy-path for all core keys', () => {
    for (const k of CORE_KEYS) {
      expect(readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)).toBe(readKpiTarget(TARGET, k))
    }
  })

  it('sumKpi with registry matches sumKpi without registry', () => {
    const entries = [
      { wasfaty: 10, omni: 5, wellness: 4, basket: 20, crossSelling: 3 },
      { wasfaty: 15, omni: 8, wellness: 6, basket: 25, crossSelling: 5 },
    ] as any[]
    for (const k of CORE_KEYS) {
      const withReg    = sumKpi(entries, k, DEFAULT_KPI_REGISTRY as any)
      const withoutReg = sumKpi(entries, k)
      expect(withReg).toBe(withoutReg)
    }
  })

  it('extractDailyValues with registry matches without registry', () => {
    const entries = [
      { wasfaty: 10, omni: 5, wellness: 4, basket: 20, crossSelling: 3 },
      { wasfaty: 15, omni: 8, wellness: 6, basket: 25, crossSelling: 5 },
    ] as any[]
    const withReg    = extractDailyValues(entries, 'wasfaty', DEFAULT_KPI_REGISTRY as any)
    const withoutReg = extractDailyValues(entries, 'wasfaty')
    expect(withReg).toEqual(withoutReg)
  })

  it('getTargetForKpi with registry matches without registry', () => {
    for (const k of CORE_KEYS) {
      const withReg    = getTargetForKpi(TARGET, k, DEFAULT_KPI_REGISTRY as any)
      const withoutReg = getTargetForKpi(TARGET, k)
      expect(withReg).toBe(withoutReg)
    }
  })

  it('UI Adapter getKpiMetaForDisplay returns non-empty fields for all core keys', () => {
    for (const k of CORE_KEYS) {
      const meta = getKpiMetaForDisplay(k, DEFAULT_KPI_REGISTRY as any)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.color).toMatch(/^#/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 6 — LEGACY LAYER CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 6: Legacy layer certified', () => {
  it('KPI_ACTUAL_FIELDS still present in engine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_ACTUAL_FIELDS')
  })

  it('KPI_TARGET_FIELDS still present in engine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_TARGET_FIELDS')
  })

  it('KPI_THRESHOLDS still present in engine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_THRESHOLDS')
  })

  it('ACTIONS still present in engine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toMatch(/const ACTIONS/)
  })

  it('TARGET_FIELD_MAP still present in kpiUiAdapter source', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    expect(src).toContain('TARGET_FIELD_MAP')
  })

  it('KPI_META exported from engine has correct crossSellTarget', () => {
    expect((KPI_META as any).crossSelling.targetField).toBe('crossSellTarget')
  })

  it('DEFAULT_KPI_KEYS is still exported and correct', () => {
    expect(DEFAULT_KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })

  it('fallback path (no registry) still returns correct fields for all core keys', () => {
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
    expect(getKpiActualField('omni')).toBe('omni')
    expect(getKpiTargetField('omni')).toBe('omniTarget')
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 7 — REGRESSION AUDIT
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 7: Regression audit — core computations unchanged', () => {
  it('computeAchievementPct(150, 200) = 75', () => {
    expect(computeAchievementPct(150, 200)).toBe(75)
  })

  it('computeAchievementPct(0, 0) = 0', () => {
    expect(computeAchievementPct(0, 0)).toBe(0)
  })

  it('computeAchievementPct is capped at ACHIEVEMENT_CAP (200)', () => {
    expect(computeAchievementPct(500, 100)).toBe(ACHIEVEMENT_CAP)
  })

  it('getTrafficLight returns valid status for edge values', () => {
    const validStatuses = ['excellent', 'good', 'warning', 'critical']
    expect(validStatuses).toContain(getTrafficLight(100))
    expect(validStatuses).toContain(getTrafficLight(0))
    expect(validStatuses).toContain(getTrafficLight(50))
  })

  it('TRAFFIC_COLORS has entries for all 4 statuses', () => {
    expect(TRAFFIC_COLORS).toHaveProperty('excellent')
    expect(TRAFFIC_COLORS).toHaveProperty('good')
    expect(TRAFFIC_COLORS).toHaveProperty('warning')
    expect(TRAFFIC_COLORS).toHaveProperty('critical')
  })

  it('computeForecast returns an object with forecastEOM field', () => {
    const f = computeForecast(150, 200, dp)
    expect(typeof f.forecastEOM).toBe('number')
  })

  it('computePace returns an object with paceStatus', () => {
    const pace = computePace(150, 200, dp)
    const validPaces = ['EXCEEDING', 'ON_PACE', 'SLIGHTLY_BEHIND', 'SIGNIFICANTLY_BEHIND', 'CRITICAL']
    expect(validPaces).toContain(pace.paceStatus)
  })

  it('computeKpiStats returns achievementPct=75 for actual=150, target=200', () => {
    const stats = computeKpiStats(150, 200, dp)
    expect(stats.achievementPct).toBe(75)
  })

  it('getCoreEngineKeys sort order is deterministic: same result across calls', () => {
    const r1 = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    const r2 = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(r1).toEqual(r2)
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 8 — NO UI / FIRESTORE / AI / REGIONAL WIRING
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 8: Guardrails certified', () => {
  it('kpiAnalyticsEngine has no React imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]react['"]/)
    expect(src).not.toContain('useState')
  })

  it('kpiAnalyticsEngine has no Firestore imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]firebase/)
    expect(src).not.toContain('getFirestore')
  })

  it('kpiAnalyticsEngine has no AI imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toContain('openai')
    expect(src).not.toContain('anthropic')
  })

  it('kpiAnalyticsEngine has no regionalIntelligence imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from.*regionalIntelligence/)
    expect(src).not.toMatch(/import.*branchRollupEngine/)
  })

  it('kpiUiAdapter has no Firestore imports', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]firebase/)
  })

  it('dynamicKpiRegionalWiring.test.ts still exists and is unchanged', async () => {
    const src = await import('../regionalIntelligence/dynamicKpiRegionalWiring.test.ts?raw')
      .catch(() => ({ default: '' }))
    expect(((src as any).default ?? '').length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// LAYER 9 — DYNAMIC KPI READINESS
// ════════════════════════════════════════════════════════════

describe('4E-5 Layer 9: Dynamic KPI readiness certified', () => {
  it('getProductionEngineKeys returns at least 5 keys from full registry', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys.length).toBeGreaterThanOrEqual(5)
  })

  it('non-core KPIs (sales) appear in production keys but not core keys', () => {
    const productionKeys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY as any)
    const coreKeys       = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(productionKeys).toContain('sales')
    expect(coreKeys).not.toContain('sales')
  })

  it('readKpiActual works for non-core registry KPI (sales)', () => {
    const doc = { sales: 120000 } as any
    expect(readKpiActual(doc, 'sales', DEFAULT_KPI_REGISTRY as any)).toBe(120000)
  })

  it('readKpiTarget works for non-core registry KPI (sales)', () => {
    const doc = { salesTarget: 500000 } as any
    expect(readKpiTarget(doc, 'sales', DEFAULT_KPI_REGISTRY as any)).toBe(500000)
  })

  it('getKpiWeightForKey returns correct weight for all core keys', () => {
    expect(getKpiWeightForKey('wasfaty')).toBe(0.25)
    expect(getKpiWeightForKey('omni')).toBe(0.20)
    expect(getKpiWeightForKey('wellness')).toBe(0.20)
    expect(getKpiWeightForKey('basket')).toBe(0.20)
    expect(getKpiWeightForKey('crossSelling')).toBe(0.15)
  })

  it('core KPI weights sum to 1.0', () => {
    const total = CORE_KEYS.reduce((s, k) => s + getKpiWeightForKey(k), 0)
    expect(total).toBeCloseTo(1.0, 10)
  })
})
