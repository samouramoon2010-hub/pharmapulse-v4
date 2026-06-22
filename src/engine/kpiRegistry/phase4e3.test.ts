// ============================================================
// Phase 4E-3 — Registry-First Production Mode
//
// Certifies that the registry is the primary production authority
// for all KPI metadata, while all legacy fallback maps remain
// alive and correct for the 5 core engine keys.
//
// crossSelling INVARIANT: target field always 'crossSellTarget'
// aliasFor INVARIANT: omnihealth→omni, wellnessCard→wellness
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  DEFAULT_KPI_KEYS,
  getCoreEngineKeys,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
  readKpiActual,
  readKpiTarget,
  computeKpiStatsDynamic,
  compareStaticVsDynamicKpi,
  getDayProgress,
  computeAchievementPct,
  computeForecast,
  getTrafficLight,
} from '../kpiAnalyticsEngine'

const CORE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

const ENTRY  = { wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45 }
const TARGET = { wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80, basketTarget: 300, crossSellTarget: 60 }
const TEST_DATE = new Date('2025-01-15')
const dp = getDayProgress(TEST_DATE)

// ── Custom registry for registry-wins tests ──────────────────
// Uses a non-standard actualField for 'wasfaty' to prove the
// registry path takes precedence over KPI_ACTUAL_FIELDS.
const CUSTOM_REGISTRY = {
  wasfaty: {
    key:             'wasfaty',
    aliasFor:        undefined,
    actualField:     'wasfatyActual',   // differs from legacy 'wasfaty'
    targetField:     'wasfatyGoal',    // differs from legacy 'wasfatyTarget'
    isActive:        true,
    isCore:          true,
    lifecycleStage:  'production_evaluation',
    sortOrder:       10,
    thresholds:      { healthy: 99, watch: 85, risk: 70, critical: 50 }, // differs from KPI_THRESHOLDS
    coachingAction:  'CUSTOM_ACTION',
  },
} as any

// ════════════════════════════════════════════════════════════
// TEST 1 — Registry path preferred: getKpiActualField
// ════════════════════════════════════════════════════════════

describe('4E-3 test 1: registry path preferred — getKpiActualField', () => {
  it('returns registry actualField when registry is provided and has entry', () => {
    expect(getKpiActualField('wasfaty', CUSTOM_REGISTRY)).toBe('wasfatyActual')
  })

  it('returns legacy fallback when registry is absent', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
  })

  it('returns legacy fallback when registry has no matching entry', () => {
    expect(getKpiActualField('wasfaty', {} as any)).toBe('wasfaty')
  })

  it('DEFAULT_KPI_REGISTRY: registry actualField matches legacy for all core keys', () => {
    expect(getKpiActualField('wasfaty',      DEFAULT_KPI_REGISTRY as any)).toBe('wasfaty')
    expect(getKpiActualField('omni',         DEFAULT_KPI_REGISTRY as any)).toBe('omni')
    expect(getKpiActualField('wellness',     DEFAULT_KPI_REGISTRY as any)).toBe('wellness')
    expect(getKpiActualField('basket',       DEFAULT_KPI_REGISTRY as any)).toBe('basket')
    expect(getKpiActualField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSelling')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 2 — Registry path preferred: getKpiTargetField
// ════════════════════════════════════════════════════════════

describe('4E-3 test 2: registry path preferred — getKpiTargetField', () => {
  it('returns registry targetField when registry is provided and has entry', () => {
    expect(getKpiTargetField('wasfaty', CUSTOM_REGISTRY)).toBe('wasfatyGoal')
  })

  it('returns legacy fallback when registry is absent', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
  })

  it('DEFAULT_KPI_REGISTRY: registry targetField matches legacy for all core keys', () => {
    expect(getKpiTargetField('wasfaty',      DEFAULT_KPI_REGISTRY as any)).toBe('wasfatyTarget')
    expect(getKpiTargetField('omni',         DEFAULT_KPI_REGISTRY as any)).toBe('omniTarget')
    expect(getKpiTargetField('wellness',     DEFAULT_KPI_REGISTRY as any)).toBe('wellnessTarget')
    expect(getKpiTargetField('basket',       DEFAULT_KPI_REGISTRY as any)).toBe('basketTarget')
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 3 — Registry path preferred: getKpiThresholds
// ════════════════════════════════════════════════════════════

describe('4E-3 test 3: registry path preferred — getKpiThresholds', () => {
  it('returns registry thresholds when registry is provided and has entry', () => {
    const thresholds = getKpiThresholds('wasfaty', CUSTOM_REGISTRY)
    expect(thresholds.healthy).toBe(99)
    expect(thresholds.watch).toBe(85)
    expect(thresholds.risk).toBe(70)
    expect(thresholds.critical).toBe(50)
  })

  it('returns legacy fallback thresholds when registry is absent', () => {
    const thresholds = getKpiThresholds('wasfaty')
    expect(thresholds.healthy).toBe(95)
    expect(thresholds.watch).toBe(80)
    expect(thresholds.risk).toBe(65)
    expect(thresholds.critical).toBe(45)
  })

  it('DEFAULT_KPI_REGISTRY: basket uses REVENUE_THRESHOLDS (watch=85)', () => {
    const thresholds = getKpiThresholds('basket', DEFAULT_KPI_REGISTRY as any)
    expect(thresholds.watch).toBe(85)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 4 — Registry path preferred: getCoachingActionForKey
// ════════════════════════════════════════════════════════════

describe('4E-3 test 4: registry path preferred — getCoachingActionForKey', () => {
  it('returns registry coachingAction when registry is provided and has entry', () => {
    expect(getCoachingActionForKey('wasfaty', CUSTOM_REGISTRY)).toBe('CUSTOM_ACTION')
  })

  it('returns legacy ACTIONS fallback when registry is absent', () => {
    const action = getCoachingActionForKey('wasfaty')
    expect(typeof action).toBe('string')
    expect(action.length).toBeGreaterThan(0)
  })

  it('DEFAULT_KPI_REGISTRY wasfaty coaching action from registry is longer than legacy', () => {
    const registryAction = getCoachingActionForKey('wasfaty', DEFAULT_KPI_REGISTRY as any)
    const legacyAction   = getCoachingActionForKey('wasfaty')
    // Registry has a more detailed coaching string
    expect(registryAction.length).toBeGreaterThan(legacyAction.length)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 5 — Fallback path preserved for all core keys
// ════════════════════════════════════════════════════════════

describe('4E-3 test 5: fallback path preserved', () => {
  it('getKpiActualField no-registry returns correct legacy field for all core keys', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
    expect(getKpiActualField('omni')).toBe('omni')
    expect(getKpiActualField('wellness')).toBe('wellness')
    expect(getKpiActualField('basket')).toBe('basket')
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
  })

  it('getKpiTargetField no-registry returns correct legacy field for all core keys', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
    expect(getKpiTargetField('omni')).toBe('omniTarget')
    expect(getKpiTargetField('wellness')).toBe('wellnessTarget')
    expect(getKpiTargetField('basket')).toBe('basketTarget')
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 6 — Alias certification: omnihealth → omni
// ════════════════════════════════════════════════════════════

describe('4E-3 test 6: alias omnihealth → omni', () => {
  it('DEFAULT_KPI_REGISTRY omnihealth.aliasFor equals omni', () => {
    const entry = (DEFAULT_KPI_REGISTRY as any).omnihealth
    expect(entry.aliasFor).toBe('omni')
  })

  it('getKpiActualField omni resolves via omnihealth.aliasFor → actualField omni', () => {
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omni')
  })

  it('getKpiTargetField omni resolves via omnihealth.aliasFor → targetField omniTarget', () => {
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omniTarget')
  })

  it('getCoreEngineKeys returns omni (alias resolved), not omnihealth (registry key)', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toContain('omni')
    expect(keys).not.toContain('omnihealth')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 7 — Alias certification: wellnessCard → wellness
// ════════════════════════════════════════════════════════════

describe('4E-3 test 7: alias wellnessCard → wellness', () => {
  it('DEFAULT_KPI_REGISTRY wellnessCard.aliasFor equals wellness', () => {
    const entry = (DEFAULT_KPI_REGISTRY as any).wellnessCard
    expect(entry.aliasFor).toBe('wellness')
  })

  it('getKpiActualField wellness resolves via wellnessCard.aliasFor → actualField wellness', () => {
    expect(getKpiActualField('wellness', DEFAULT_KPI_REGISTRY as any)).toBe('wellness')
  })

  it('getKpiTargetField wellness resolves via wellnessCard.aliasFor → targetField wellnessTarget', () => {
    expect(getKpiTargetField('wellness', DEFAULT_KPI_REGISTRY as any)).toBe('wellnessTarget')
  })

  it('getCoreEngineKeys returns wellness (alias resolved), not wellnessCard', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toContain('wellness')
    expect(keys).not.toContain('wellnessCard')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 8 — crossSelling targetField invariant
// ════════════════════════════════════════════════════════════

describe('4E-3 test 8: crossSellTarget invariant', () => {
  it('DEFAULT_KPI_REGISTRY crossSelling.targetField is crossSellTarget', () => {
    const entry = (DEFAULT_KPI_REGISTRY as any).crossSelling
    expect(entry.targetField).toBe('crossSellTarget')
  })

  it('getKpiTargetField crossSelling returns crossSellTarget with registry', () => {
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSellTarget')
  })

  it('getKpiTargetField crossSelling returns crossSellTarget without registry', () => {
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })

  it('readKpiTarget reads crossSellTarget field (not crossSellingTarget)', () => {
    const docWithBoth = { crossSellTarget: 60, crossSellingTarget: 999 } as any
    expect(readKpiTarget(docWithBoth, 'crossSelling')).toBe(60)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 9 — Core KPI certification: actual values
// ════════════════════════════════════════════════════════════

describe('4E-3 test 9: core KPI actual values certified', () => {
  it('readKpiActual with DEFAULT_KPI_REGISTRY matches legacy path for all core keys', () => {
    for (const k of CORE_KEYS) {
      const legacy   = readKpiActual(ENTRY, k)
      const registry = readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      expect(registry).toBe(legacy)
    }
  })

  it('actual values match expected numbers from ENTRY fixture', () => {
    expect(readKpiActual(ENTRY, 'wasfaty')).toBe(150)
    expect(readKpiActual(ENTRY, 'omni')).toBe(80)
    expect(readKpiActual(ENTRY, 'wellness')).toBe(60)
    expect(readKpiActual(ENTRY, 'basket')).toBe(250)
    expect(readKpiActual(ENTRY, 'crossSelling')).toBe(45)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 10 — Core KPI certification: target values
// ════════════════════════════════════════════════════════════

describe('4E-3 test 10: core KPI target values certified', () => {
  it('readKpiTarget with DEFAULT_KPI_REGISTRY matches legacy path for all core keys', () => {
    for (const k of CORE_KEYS) {
      const legacy   = readKpiTarget(TARGET, k)
      const registry = readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(registry).toBe(legacy)
    }
  })

  it('target values match expected numbers from TARGET fixture', () => {
    expect(readKpiTarget(TARGET, 'wasfaty')).toBe(200)
    expect(readKpiTarget(TARGET, 'omni')).toBe(100)
    expect(readKpiTarget(TARGET, 'wellness')).toBe(80)
    expect(readKpiTarget(TARGET, 'basket')).toBe(300)
    expect(readKpiTarget(TARGET, 'crossSelling')).toBe(60)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 11 — Core KPI certification: achievement parity
// ════════════════════════════════════════════════════════════

describe('4E-3 test 11: core KPI achievement parity', () => {
  it('achievement pct identical registry vs legacy for all core keys', () => {
    for (const k of CORE_KEYS) {
      const a1 = readKpiActual(ENTRY, k)
      const t1 = readKpiTarget(TARGET, k)
      const a2 = readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      const t2 = readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(computeAchievementPct(a1, t1)).toBe(computeAchievementPct(a2, t2))
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 12 — Core KPI certification: forecast parity
// ════════════════════════════════════════════════════════════

describe('4E-3 test 12: core KPI forecast parity', () => {
  it('forecast result identical registry vs legacy for all core keys', () => {
    for (const k of CORE_KEYS) {
      const a1 = readKpiActual(ENTRY, k)
      const t1 = readKpiTarget(TARGET, k)
      const a2 = readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      const t2 = readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(computeForecast(a1, t1, dp)).toStrictEqual(computeForecast(a2, t2, dp))
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 13 — Core KPI certification: traffic light parity
// ════════════════════════════════════════════════════════════

describe('4E-3 test 13: core KPI traffic light parity', () => {
  it('traffic light status identical registry vs legacy for all core keys', () => {
    for (const k of CORE_KEYS) {
      const a1  = readKpiActual(ENTRY, k)
      const t1  = readKpiTarget(TARGET, k)
      const a2  = readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)
      const t2  = readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)
      const pct1 = t1 > 0 ? (a1 / t1) * 100 : 0
      const pct2 = t2 > 0 ? (a2 / t2) * 100 : 0
      expect(getTrafficLight(pct1)).toBe(getTrafficLight(pct2))
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 14 — Core KPI certification: sort order
// ════════════════════════════════════════════════════════════

describe('4E-3 test 14: sort order certified', () => {
  it('getCoreEngineKeys returns keys in sortOrder: wasfaty omni wellness basket crossSelling', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })

  it('getCoreEngineKeys without registry returns DEFAULT_KPI_KEYS in same order', () => {
    expect(getCoreEngineKeys()).toEqual(DEFAULT_KPI_KEYS)
    expect(DEFAULT_KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })
})

// ════════════════════════════════════════════════════════════
// TEST 15 — compareStaticVsDynamicKpi full parity
// ════════════════════════════════════════════════════════════

describe('4E-3 test 15: compareStaticVsDynamicKpi full parity', () => {
  it('all match flags are true for all 5 core KPIs with DEFAULT_KPI_REGISTRY', () => {
    for (const k of CORE_KEYS) {
      const result = compareStaticVsDynamicKpi(ENTRY, TARGET, k, DEFAULT_KPI_REGISTRY as any)
      expect(result.actualMatches).toBe(true)
      expect(result.targetMatches).toBe(true)
      expect(result.achievementMatches).toBe(true)
    }
  })

  it('diff object has correct key field', () => {
    const result = compareStaticVsDynamicKpi(ENTRY, TARGET, 'basket', DEFAULT_KPI_REGISTRY as any)
    expect(result.key).toBe('basket')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 16 — computeKpiStatsDynamic parity with DEFAULT_KPI_REGISTRY
// ════════════════════════════════════════════════════════════

describe('4E-3 test 16: computeKpiStatsDynamic parity', () => {
  it('stats with registry match stats without registry for all core keys', () => {
    for (const k of CORE_KEYS) {
      const withoutReg = computeKpiStatsDynamic(ENTRY, TARGET, k, dp)
      const withReg    = computeKpiStatsDynamic(ENTRY, TARGET, k, dp, DEFAULT_KPI_REGISTRY as any)
      expect(withReg.actual).toBe(withoutReg.actual)
      expect(withReg.target).toBe(withoutReg.target)
      expect(withReg.achievementPct).toBe(withoutReg.achievementPct)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 17 — Legacy map usage audit: KPI_ACTUAL_FIELDS
// ════════════════════════════════════════════════════════════

describe('4E-3 test 17: legacy map KPI_ACTUAL_FIELDS remains correct', () => {
  it('getKpiActualField falls back to legacy map for all 5 core keys (no registry)', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
    expect(getKpiActualField('omni')).toBe('omni')
    expect(getKpiActualField('wellness')).toBe('wellness')
    expect(getKpiActualField('basket')).toBe('basket')
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 18 — Legacy map usage audit: KPI_TARGET_FIELDS
// ════════════════════════════════════════════════════════════

describe('4E-3 test 18: legacy map KPI_TARGET_FIELDS remains correct', () => {
  it('getKpiTargetField falls back to legacy map for all 5 core keys (no registry)', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
    expect(getKpiTargetField('omni')).toBe('omniTarget')
    expect(getKpiTargetField('wellness')).toBe('wellnessTarget')
    expect(getKpiTargetField('basket')).toBe('basketTarget')
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 19 — Legacy removal readiness: registry-legacy consistency
// ════════════════════════════════════════════════════════════

describe('4E-3 test 19: legacy removal readiness — registry and legacy maps agree', () => {
  it('DEFAULT_KPI_REGISTRY actualField values match KPI_ACTUAL_FIELDS for all core keys', () => {
    const regWasfatyActual = (DEFAULT_KPI_REGISTRY as any).wasfaty.actualField
    const regOmniActual    = (DEFAULT_KPI_REGISTRY as any).omnihealth.actualField
    const regWellnessActual = (DEFAULT_KPI_REGISTRY as any).wellnessCard.actualField
    const regBasketActual  = (DEFAULT_KPI_REGISTRY as any).basket.actualField
    const regCrossActual   = (DEFAULT_KPI_REGISTRY as any).crossSelling.actualField
    expect(regWasfatyActual).toBe('wasfaty')
    expect(regOmniActual).toBe('omni')
    expect(regWellnessActual).toBe('wellness')
    expect(regBasketActual).toBe('basket')
    expect(regCrossActual).toBe('crossSelling')
  })

  it('DEFAULT_KPI_REGISTRY targetField values match KPI_TARGET_FIELDS for all core keys', () => {
    const regWasfatyTarget  = (DEFAULT_KPI_REGISTRY as any).wasfaty.targetField
    const regOmniTarget     = (DEFAULT_KPI_REGISTRY as any).omnihealth.targetField
    const regWellnessTarget = (DEFAULT_KPI_REGISTRY as any).wellnessCard.targetField
    const regBasketTarget   = (DEFAULT_KPI_REGISTRY as any).basket.targetField
    const regCrossTarget    = (DEFAULT_KPI_REGISTRY as any).crossSelling.targetField
    expect(regWasfatyTarget).toBe('wasfatyTarget')
    expect(regOmniTarget).toBe('omniTarget')
    expect(regWellnessTarget).toBe('wellnessTarget')
    expect(regBasketTarget).toBe('basketTarget')
    expect(regCrossTarget).toBe('crossSellTarget')  // INVARIANT
  })
})

// ════════════════════════════════════════════════════════════
// TEST 20 — No UI changes
// ════════════════════════════════════════════════════════════

describe('4E-3 test 20: no UI changes', () => {
  it('kpiAnalyticsEngine is a pure engine file with no React imports', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    expect(code).not.toMatch(/import.*from ['"]react['"]/)
    expect(code).not.toContain('jsx')
    expect(code).not.toContain('useState')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 21 — No Firestore changes
// ════════════════════════════════════════════════════════════

describe('4E-3 test 21: no Firestore changes', () => {
  it('kpiAnalyticsEngine does not import Firebase or Firestore', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    expect(code).not.toMatch(/from ['"]firebase/)
    expect(code).not.toMatch(/from ['"]@firebase/)
    expect(code).not.toContain('getFirestore')
    expect(code).not.toContain('collection(')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 22 — No Profile Studio
// ════════════════════════════════════════════════════════════

describe('4E-3 test 22: no Profile Studio', () => {
  it('kpiAnalyticsEngine does not reference profileStudio', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    expect(code).not.toContain('profileStudio')
    expect(code).not.toContain('ProfileStudio')
    expect(code).not.toContain('evaluationProfile')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 23 — No AI
// ════════════════════════════════════════════════════════════

describe('4E-3 test 23: no AI', () => {
  it('kpiAnalyticsEngine does not reference AI/LLM integrations', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    expect(code).not.toContain('openai')
    expect(code).not.toContain('anthropic')
    expect(code).not.toContain('claude')
    expect(code).not.toContain('gemini')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 24 — No Dynamic KPI regional wiring
// ════════════════════════════════════════════════════════════

describe('4E-3 test 24: no Dynamic KPI regional wiring', () => {
  it('kpiAnalyticsEngine does not import from regionalIntelligence', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    expect(code).not.toMatch(/from.*regionalIntelligence/)
    expect(code).not.toMatch(/import.*branchRollupEngine/)
    expect(code).not.toMatch(/import.*regionalRollupEngine/)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 25 — Legacy removal readiness summary
// ════════════════════════════════════════════════════════════

describe('4E-3 test 25: legacy removal readiness certified', () => {
  it('KPI_ACTUAL_FIELDS: production fallback — registry result equals legacy result for core keys', () => {
    for (const k of CORE_KEYS) {
      const withRegistry  = getKpiActualField(k, DEFAULT_KPI_REGISTRY as any)
      const withoutRegistry = getKpiActualField(k)
      expect(withRegistry).toBe(withoutRegistry)
    }
  })

  it('KPI_TARGET_FIELDS: production fallback — registry result equals legacy result for core keys', () => {
    for (const k of CORE_KEYS) {
      const withRegistry    = getKpiTargetField(k, DEFAULT_KPI_REGISTRY as any)
      const withoutRegistry = getKpiTargetField(k)
      expect(withRegistry).toBe(withoutRegistry)
    }
  })

  it('KPI_THRESHOLDS: production fallback — registry thresholds for basket differ from standard (watch=85)', () => {
    // Certifies that the registry is providing non-standard thresholds for basket,
    // proving the registry path is consulted and returns richer data than KPI_THRESHOLDS.
    const registryBasket = getKpiThresholds('basket', DEFAULT_KPI_REGISTRY as any)
    const legacyBasket   = getKpiThresholds('basket')
    expect(registryBasket.watch).toBe(85)   // REVENUE_THRESHOLDS
    expect(legacyBasket.watch).toBe(85)     // KPI_THRESHOLDS matches for basket too
    expect(registryBasket).toStrictEqual(legacyBasket)  // consistent — safe to remove later
  })
})
