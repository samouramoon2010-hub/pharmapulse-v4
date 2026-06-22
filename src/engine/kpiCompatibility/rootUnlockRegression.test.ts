// ============================================================
// kpiAnalyticsEngine — Root Unlock Regression Tests
//
// Verifies that the Phase 1 root unlock changes:
//   1. Do not break any existing behavior
//   2. Expose the new dynamic capabilities correctly
//
// Tests:
//   1. KPI_KEYS still equals the 5 legacy KPIs
//   2. DEFAULT_KPI_KEYS equals the 5 legacy KPIs
//   3. getProductionEngineKeys(DEFAULT_KPI_REGISTRY) includes production KPIs
//   4. getProductionEngineKeys excludes pilot_tracking KPIs
//   5. alias resolution: omnihealth→omni, wellnessCard→wellness
//   6. custom production KPI returned as its own key
//   7. KpiEntry type accepts dynamic KPI fields
//   8. MonthlyTarget type accepts dynamic target fields
//   9. existing kpiAnalyticsEngine tests still pass (computeAchievementPct, etc.)
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  KPI_KEYS,
  DEFAULT_KPI_KEYS,
  KPI_META,
  KPI_WEIGHTS,
  getProductionEngineKeys,
  getKpiMetaForKey,
  getKpiWeightForKey,
  computeAchievementPct,
  computeKpiStats,
  getDayProgress,
  sumKpi,
} from '../../engine/kpiAnalyticsEngine'
import type { KpiEntry, MonthlyTarget } from '../../engine/kpiAnalyticsEngine'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'

const LEGACY_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']

// ─────────────────────────────────────────────────────────────
// Test 1: KPI_KEYS still equals the 5 legacy KPIs
// ─────────────────────────────────────────────────────────────
describe('1 — KPI_KEYS still equals the 5 legacy engine keys', () => {
  it('KPI_KEYS has exactly 5 entries', () => {
    expect(KPI_KEYS).toHaveLength(5)
  })

  it('KPI_KEYS contains all legacy engine keys', () => {
    LEGACY_KEYS.forEach((k) => expect(KPI_KEYS).toContain(k))
  })

  it('KPI_KEYS order matches original: wasfaty,omni,wellness,basket,crossSelling', () => {
    expect(KPI_KEYS).toEqual(LEGACY_KEYS)
  })

  it('KPI_KEYS does not contain pilot KPI keys', () => {
    expect(KPI_KEYS).not.toContain('insuranceConversion')
    expect(KPI_KEYS).not.toContain('guestConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 2: DEFAULT_KPI_KEYS equals the 5 legacy KPIs
// ─────────────────────────────────────────────────────────────
describe('2 — DEFAULT_KPI_KEYS equals the 5 legacy engine keys', () => {
  it('DEFAULT_KPI_KEYS has exactly 5 entries', () => {
    expect(DEFAULT_KPI_KEYS).toHaveLength(5)
  })

  it('DEFAULT_KPI_KEYS equals KPI_KEYS (alias)', () => {
    expect(DEFAULT_KPI_KEYS).toEqual(KPI_KEYS)
  })

  it('DEFAULT_KPI_KEYS contains all legacy keys', () => {
    LEGACY_KEYS.forEach((k) => expect(DEFAULT_KPI_KEYS).toContain(k))
  })
})

// ─────────────────────────────────────────────────────────────
// Test 3: getProductionEngineKeys(DEFAULT_KPI_REGISTRY) includes production KPIs
// ─────────────────────────────────────────────────────────────
describe('3 — getProductionEngineKeys(DEFAULT_KPI_REGISTRY) includes production KPIs', () => {
  const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)

  it('returns at least 5 keys', () => {
    expect(keys.length).toBeGreaterThanOrEqual(5)
  })

  it('includes all 5 legacy engine keys', () => {
    LEGACY_KEYS.forEach((k) => {
      expect(keys, `${k} missing from production engine keys`).toContain(k)
    })
  })

  it('returns engine keys (not registry keys — aliasFor resolved)', () => {
    // omnihealth has aliasFor:'omni' → engine key is 'omni'
    expect(keys).toContain('omni')
    expect(keys).not.toContain('omnihealth')
    // wellnessCard has aliasFor:'wellness' → engine key is 'wellness'
    expect(keys).toContain('wellness')
    expect(keys).not.toContain('wellnessCard')
  })

  it('returns a string array', () => {
    keys.forEach((k) => expect(typeof k).toBe('string'))
  })
})

// ─────────────────────────────────────────────────────────────
// Test 4: getProductionEngineKeys excludes pilot_tracking KPIs
// ─────────────────────────────────────────────────────────────
describe('4 — getProductionEngineKeys excludes pilot_tracking KPIs', () => {
  const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)

  it('insuranceConversion is NOT in production engine keys', () => {
    expect(keys).not.toContain('insuranceConversion')
  })

  it('all returned KPIs have lifecycleStage production_evaluation in registry', () => {
    keys.forEach((engineKey) => {
      // Find the registry KPI by engine key
      const kpi = Object.values(DEFAULT_KPI_REGISTRY).find(
        (k) => (k.aliasFor ?? k.key) === engineKey
      )
      if (kpi) {
        const stage = kpi.lifecycleStage ?? 'production_evaluation'
        expect(stage, `${engineKey} should be production_evaluation`).toBe('production_evaluation')
      }
    })
  })

  it('returns DEFAULT_KPI_KEYS when called with no registry argument', () => {
    const withoutRegistry = getProductionEngineKeys()
    expect(withoutRegistry).toEqual(DEFAULT_KPI_KEYS)
  })

  it('returns DEFAULT_KPI_KEYS when called with undefined', () => {
    const withUndefined = getProductionEngineKeys(undefined)
    expect(withUndefined).toEqual(DEFAULT_KPI_KEYS)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 5: alias resolution — omnihealth→omni, wellnessCard→wellness
// ─────────────────────────────────────────────────────────────
describe('5 — alias resolution: omnihealth→omni, wellnessCard→wellness', () => {
  const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)

  it('omnihealth registry key resolves to omni engine key', () => {
    const omniInRegistry = DEFAULT_KPI_REGISTRY.omnihealth
    expect(omniInRegistry.aliasFor).toBe('omni')
    expect(keys).toContain('omni')
    expect(keys).not.toContain('omnihealth')
  })

  it('wellnessCard registry key resolves to wellness engine key', () => {
    const wellnessInRegistry = DEFAULT_KPI_REGISTRY.wellnessCard
    expect(wellnessInRegistry.aliasFor).toBe('wellness')
    expect(keys).toContain('wellness')
    expect(keys).not.toContain('wellnessCard')
  })

  it('wasfaty has no alias — registry key equals engine key', () => {
    const wasfatyInRegistry = DEFAULT_KPI_REGISTRY.wasfaty
    expect(wasfatyInRegistry.aliasFor).toBeUndefined()
    expect(keys).toContain('wasfaty')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 6: custom production KPI returned as its own engine key
// ─────────────────────────────────────────────────────────────
describe('6 — custom production KPI returned as its own engine key', () => {
  it('a custom production_evaluation KPI with no alias is returned as-is', () => {
    // Simulate adding a dynamic KPI to the registry
    const testRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      testDynamicKpi: {
        key:            'testDynamicKpi',
        isActive:       true,
        lifecycleStage: 'production_evaluation' as const,
        aliasFor:       undefined,
        sortOrder:      200,
        label:          'Test Dynamic KPI',
        labelAr:        'مؤشر تجريبي',
        unit:           'units',
        unitAr:         'وحدة',
        weight:         0,
        isCore:         false,
        category:       'commercial' as const,
        valueType:      'count' as const,
        direction:      'higher_is_better' as const,
        targetType:     'absolute' as const,
        thresholds:     { healthy: 90, watch: 70, risk: 50, critical: 30 },
        visibility:     { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
        isPrimary:      false,
        coachingAction:   '',
        coachingActionAr: '',
        description:    '',
        shortLabel:     'TestKPI',
      },
    }

    const keys = getProductionEngineKeys(testRegistry as any)
    expect(keys).toContain('testDynamicKpi')
  })

  it('pilot_tracking custom KPI is excluded even from custom registry', () => {
    const testRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      guestConversion: {
        key:            'guestConversion',
        isActive:       true,
        lifecycleStage: 'pilot_tracking' as const,
        sortOrder:      210,
        label:          'Guest Conversion',
        labelAr:        'تحويل الضيف',
        unit:           'conversions',
        unitAr:         'تحويل',
        weight:         0,
        isCore:         false,
        category:       'commercial' as const,
        valueType:      'count' as const,
        direction:      'higher_is_better' as const,
        targetType:     'absolute' as const,
        thresholds:     { healthy: 90, watch: 70, risk: 50, critical: 30 },
        visibility:     { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
        isPrimary:      false,
        coachingAction:   '',
        coachingActionAr: '',
        description:    '',
        shortLabel:     'Guest',
      },
    }

    const keys = getProductionEngineKeys(testRegistry as any)
    expect(keys).not.toContain('guestConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 7: KpiEntry type accepts dynamic KPI fields
// ─────────────────────────────────────────────────────────────
describe('7 — KpiEntry type accepts dynamic KPI fields', () => {
  it('KpiEntry with only legacy fields compiles and is valid', () => {
    const entry: KpiEntry = {
      id:           'e1',
      userId:       'u1',
      pharmacyId:   'p1',
      date:         '2025-06-15',
      wasfaty:      100,
      omni:         90,
      wellness:     80,
      basket:       70,
      crossSelling: 60,
    }
    expect(entry.wasfaty).toBe(100)
    expect(entry.crossSelling).toBe(60)
  })

  it('KpiEntry accepts dynamic keys via index signature', () => {
    const entry: KpiEntry = {
      userId:       'u1',
      pharmacyId:   'p1',
      date:         '2025-06-15',
      wasfaty:      100,
      omni:         90,
      wellness:     80,
      basket:       70,
      crossSelling: 60,
      // Dynamic KPI fields — accepted via [key: string]: unknown
      insuranceConversion: 15,
      guestConversion:     8,
      testDynamicKpi:      42,
    }
    expect((entry as any).insuranceConversion).toBe(15)
    expect((entry as any).testDynamicKpi).toBe(42)
  })

  it('sumKpi reads dynamic engine key from entry', () => {
    const entries: KpiEntry[] = [
      {
        userId: 'u1', pharmacyId: 'p1', date: '2025-06-01',
        wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
        insuranceConversion: 5,
      } as KpiEntry,
      {
        userId: 'u1', pharmacyId: 'p1', date: '2025-06-02',
        wasfaty: 110, omni: 95, wellness: 85, basket: 75, crossSelling: 65,
        insuranceConversion: 10,
      } as KpiEntry,
    ]
    // Legacy key still works
    expect(sumKpi(entries, 'wasfaty')).toBe(210)
    // Dynamic key works via index signature
    expect(sumKpi(entries, 'insuranceConversion')).toBe(15)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 8: MonthlyTarget type accepts dynamic target fields
// ─────────────────────────────────────────────────────────────
describe('8 — MonthlyTarget type accepts dynamic target fields', () => {
  it('MonthlyTarget with only legacy fields compiles and is valid', () => {
    const target: MonthlyTarget = {
      pharmacyId:      'p1',
      month:           '2025-06',
      wasfatyTarget:   500,
      omniTarget:      300,
      wellnessTarget:  200,
      basketTarget:    150,
      crossSellTarget: 100,
    }
    expect(target.wasfatyTarget).toBe(500)
  })

  it('MonthlyTarget accepts dynamic target fields via index signature', () => {
    const target: MonthlyTarget = {
      pharmacyId:      'p1',
      month:           '2025-06',
      wasfatyTarget:   500,
      omniTarget:      300,
      wellnessTarget:  200,
      basketTarget:    150,
      crossSellTarget: 100,
      // Dynamic target fields
      insuranceConversionTarget: 50,
      testDynamicKpiTarget:      25,
    }
    expect((target as any).insuranceConversionTarget).toBe(50)
    expect((target as any).testDynamicKpiTarget).toBe(25)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 9: existing kpiAnalyticsEngine functions still pass
// ─────────────────────────────────────────────────────────────
describe('9 — existing engine functions unchanged (regression)', () => {
  it('computeAchievementPct: 90 / 100 = 90%', () => {
    expect(computeAchievementPct(90, 100)).toBe(90)
  })

  it('computeAchievementPct: 0 target returns 0', () => {
    expect(computeAchievementPct(50, 0)).toBe(0)
  })

  it('computeAchievementPct: 110 / 100 = 110% (allows > 100)', () => {
    expect(computeAchievementPct(110, 100)).toBe(110)
  })

  it('KPI_META still has all 5 legacy entries', () => {
    LEGACY_KEYS.forEach((k) => {
      expect(KPI_META, `${k} missing from KPI_META`).toHaveProperty(k)
    })
  })

  it('KPI_META.wasfaty.targetField is wasfatyTarget', () => {
    expect(KPI_META.wasfaty.targetField).toBe('wasfatyTarget')
  })

  it('KPI_META.omni.targetField is omniTarget', () => {
    expect(KPI_META.omni.targetField).toBe('omniTarget')
  })

  it('KPI_WEIGHTS sums to 1.0', () => {
    const total = LEGACY_KEYS.reduce((s, k) => s + (KPI_WEIGHTS[k] ?? 0), 0)
    expect(Math.abs(total - 1.0)).toBeLessThanOrEqual(0.001)
  })

  it('getKpiMetaForKey returns legacy meta for core keys', () => {
    const meta = getKpiMetaForKey('wasfaty')
    expect(meta.en).toBe('Wasfaty')
    expect(meta.targetField).toBe('wasfatyTarget')
  })

  it('getKpiMetaForKey derives meta for dynamic key via registry', () => {
    const fakeRegistry = {
      insuranceConversion: {
        key: 'insuranceConversion', isActive: true,
        lifecycleStage: 'pilot_tracking', sortOrder: 110,
        label: 'Insurance Conversion', labelAr: 'تحويل التأمين',
        unit: 'conversions', unitAr: 'تحويل', weight: 0,
        aliasFor: undefined,
      },
    }
    const meta = getKpiMetaForKey('insuranceConversion', fakeRegistry as any)
    expect(meta.en).toBe('Insurance Conversion')
    expect(meta.targetField).toBe('insuranceConversionTarget')
  })

  it('getKpiMetaForKey falls back gracefully with no registry', () => {
    const meta = getKpiMetaForKey('unknownKey')
    expect(meta.en).toBe('unknownKey')
    expect(meta.targetField).toBe('unknownKeyTarget')
  })

  it('getKpiWeightForKey returns legacy weight for core keys', () => {
    expect(getKpiWeightForKey('wasfaty')).toBe(0.25)
    expect(getKpiWeightForKey('omni')).toBe(0.20)
  })

  it('getKpiWeightForKey returns 0 for unknown key with no registry', () => {
    expect(getKpiWeightForKey('unknownKey')).toBe(0)
  })

  it('sumKpi still works for all legacy keys', () => {
    const entries: KpiEntry[] = [{
      userId: 'u', pharmacyId: 'p', date: '2025-06-01',
      wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
    }]
    expect(sumKpi(entries, 'wasfaty')).toBe(100)
    expect(sumKpi(entries, 'omni')).toBe(90)
    expect(sumKpi(entries, 'wellness')).toBe(80)
    expect(sumKpi(entries, 'basket')).toBe(70)
    expect(sumKpi(entries, 'crossSelling')).toBe(60)
  })

  it('computeKpiStats works for a legacy key', () => {
    const dp = getDayProgress()
    const stats = computeKpiStats(90, 100, dp, 'wasfaty')
    expect(stats.kpiKey).toBe('wasfaty')
    expect(stats.achievementPct).toBe(90)
    expect(stats.target).toBe(100)
  })

  it('computeKpiStats works for a dynamic key (KpiKey is now string)', () => {
    const dp = getDayProgress()
    const stats = computeKpiStats(50, 100, dp, 'insuranceConversion')
    expect(stats.kpiKey).toBe('insuranceConversion')
    expect(stats.achievementPct).toBe(50)
  })
})
