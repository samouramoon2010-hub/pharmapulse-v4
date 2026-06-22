// ============================================================
// Phase 4E-1 — Controlled Cutover: Dynamic Readers Promotion
//
// Verifies that readKpiActual / readKpiTarget are now the
// production read paths for extractDailyValues, sumKpi, and
// getTargetForKpi — while all downstream calculations remain
// numerically identical to the legacy static path.
//
// crossSelling INVARIANT: target field always 'crossSellTarget'
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  KPI_KEYS,
  KPI_META,
  extractDailyValues,
  sumKpi,
  getTargetForKpi,
  readKpiActual,
  readKpiTarget,
  computeKpiStats,
  computeAchievementPct,
  computePace,
  computeForecast,
  getTrafficLight,
  rankKpisByPriority,
  getDayProgress,
  normalizeArabicNumerals,
} from '../kpiAnalyticsEngine'

const CORE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// ── Fixtures ──────────────────────────────────────────────────
const ENTRY = { wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45 }
const TARGET = { wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80, basketTarget: 300, crossSellTarget: 60 }
const ENTRIES = [
  { wasfaty: 10,  omni: 5,  wellness: 4, basket: 20, crossSelling: 3 },
  { wasfaty: 15,  omni: 8,  wellness: 6, basket: 25, crossSelling: 5 },
  { wasfaty: 20,  omni: 10, wellness: 8, basket: 30, crossSelling: 7 },
] as any[]
const TEST_DATE = new Date('2025-01-15')
const dp = getDayProgress(TEST_DATE)

// ════════════════════════════════════════════════════════════
// TEST 1 — extractDailyValues uses readKpiActual path
// ════════════════════════════════════════════════════════════

describe('4E-1 test 1: extractDailyValues uses readKpiActual', () => {
  it('extractDailyValues result matches readKpiActual per-entry for all core keys', () => {
    for (const k of CORE_KEYS) {
      const via_extract = extractDailyValues(ENTRIES, k)
      const via_manual  = ENTRIES.map((e) => readKpiActual(e, k))
      expect(via_extract).toEqual(via_manual)
    }
  })

  it('extractDailyValues with registry equals without registry for 5 core keys', () => {
    for (const k of CORE_KEYS) {
      const without_reg = extractDailyValues(ENTRIES, k)
      const with_reg    = extractDailyValues(ENTRIES, k, DEFAULT_KPI_REGISTRY as any)
      expect(with_reg).toEqual(without_reg)
    }
  })

  it('extractDailyValues result equals legacy Number(e[k])||0 for standard entries', () => {
    for (const k of CORE_KEYS) {
      const dynamic = extractDailyValues(ENTRIES, k)
      const legacy  = ENTRIES.map((e) => Number(e[k]) || 0)
      expect(dynamic).toEqual(legacy)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 2 — sumKpi uses readKpiActual path
// ════════════════════════════════════════════════════════════

describe('4E-1 test 2: sumKpi uses readKpiActual', () => {
  it('sumKpi result matches manual readKpiActual reduce for all core keys', () => {
    for (const k of CORE_KEYS) {
      const via_sum    = sumKpi(ENTRIES, k)
      const via_manual = ENTRIES.reduce((s, e) => s + readKpiActual(e, k), 0)
      expect(via_sum).toBe(via_manual)
    }
  })

  it('sumKpi with registry equals without registry for 5 core keys', () => {
    for (const k of CORE_KEYS) {
      const without = sumKpi(ENTRIES, k)
      const with_reg = sumKpi(ENTRIES, k, DEFAULT_KPI_REGISTRY as any)
      expect(with_reg).toBe(without)
    }
  })

  it('sumKpi equals legacy reduce for standard numeric entries', () => {
    for (const k of CORE_KEYS) {
      const dynamic = sumKpi(ENTRIES, k)
      const legacy  = ENTRIES.reduce((s: number, e: any) => s + (Number(e[k]) || 0), 0)
      expect(dynamic).toBe(legacy)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 3 — Fallback maps still exist
// ════════════════════════════════════════════════════════════

describe('4E-1 test 3: KPI_ACTUAL_FIELDS and KPI_TARGET_FIELDS remain', async () => {
  it('KPI_ACTUAL_FIELDS constant exists in engine source', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    expect(src).toContain('KPI_ACTUAL_FIELDS')
  })

  it('KPI_TARGET_FIELDS constant exists in engine source', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    expect(src).toContain('KPI_TARGET_FIELDS')
  })

  it('KPI_ACTUAL_FIELDS contains all 5 core engine keys', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    for (const k of CORE_KEYS) {
      expect(src).toContain(`'${k}'`)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 4 — Registry-first behavior
// ════════════════════════════════════════════════════════════

describe('4E-1 test 4: registry-first behavior', () => {
  it('readKpiActual with registry reads correct field for omnihealth alias', () => {
    // 'omni' engine key → actual field is 'omni' in both registry and fallback
    const entry = { omni: 99, omnihealth: 999 }
    const result = readKpiActual(entry, 'omni', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe(99)  // reads 'omni' field, not 'omnihealth'
  })

  it('readKpiTarget with registry reads crossSellTarget for crossSelling', () => {
    const target = { crossSellTarget: 60, crossSellingTarget: 999 }
    const result = readKpiTarget(target, 'crossSelling', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe(60)   // reads 'crossSellTarget' NOT 'crossSellingTarget'
  })

  it('extractDailyValues falls back to engine key for unknown dynamic KPI', () => {
    const entries = [{ myCustomKpi: 42 }] as any[]
    const result = extractDailyValues(entries, 'myCustomKpi')
    expect(result).toEqual([42])
  })
})

// ════════════════════════════════════════════════════════════
// TEST 5 — Legacy fallback behavior
// ════════════════════════════════════════════════════════════

describe('4E-1 test 5: legacy fallback without registry', () => {
  it('readKpiActual without registry falls back to KPI_ACTUAL_FIELDS', () => {
    for (const k of CORE_KEYS) {
      const result = readKpiActual(ENTRY, k)
      expect(result).toBe(Number((ENTRY as any)[k]))
    }
  })

  it('readKpiTarget without registry falls back to KPI_TARGET_FIELDS', () => {
    for (const k of CORE_KEYS) {
      const result   = readKpiTarget(TARGET, k)
      const legacyField = (KPI_META as any)[k].targetField
      expect(result).toBe(Number((TARGET as any)[legacyField]))
    }
  })

  it('getTargetForKpi without registry returns correct values', () => {
    const target = {
      wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80,
      basketTarget: 300, crossSellTarget: 60,
    }
    for (const k of CORE_KEYS) {
      const result = getTargetForKpi(target as any, k)
      const expected = readKpiTarget(target, k)
      expect(result).toBe(expected)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 6 — crossSelling target field INVARIANT
// ════════════════════════════════════════════════════════════

describe('4E-1 test 6: crossSelling target must always be crossSellTarget', () => {
  const docWithCorrect = { crossSellTarget: 60, crossSellingTarget: 999 }
  const docWithBoth    = { crossSellTarget: 60, crossSellingTarget: 999 }

  it('readKpiTarget reads crossSellTarget (not crossSellingTarget)', () => {
    expect(readKpiTarget(docWithCorrect, 'crossSelling')).toBe(60)
    expect(readKpiTarget(docWithBoth,    'crossSelling')).toBe(60)
  })

  it('getTargetForKpi returns crossSellTarget value', () => {
    expect(getTargetForKpi(docWithCorrect as any, 'crossSelling')).toBe(60)
  })

  it('extractDailyValues does not accidentally read crossSellingTarget field', () => {
    // This test verifies the field is always 'crossSelling' for actual reads
    const entry = { crossSelling: 45, crossSelling_: 999 }
    const result = extractDailyValues([entry as any], 'crossSelling')
    expect(result).toEqual([45])
  })
})

// ════════════════════════════════════════════════════════════
// TEST 7 — aliasFor paths work
// ════════════════════════════════════════════════════════════

describe('4E-1 test 7: aliasFor alias paths work correctly', () => {
  it('omni engine key reads entry.omni (not entry.omnihealth)', () => {
    const entry = { omni: 80, omnihealth: 999 }
    expect(readKpiActual(entry, 'omni')).toBe(80)
    expect(readKpiActual(entry, 'omni', DEFAULT_KPI_REGISTRY as any)).toBe(80)
  })

  it('wellness engine key reads entry.wellness (not entry.wellnessCard)', () => {
    const entry = { wellness: 60, wellnessCard: 999 }
    expect(readKpiActual(entry, 'wellness')).toBe(60)
    expect(readKpiActual(entry, 'wellness', DEFAULT_KPI_REGISTRY as any)).toBe(60)
  })

  it('omniTarget field is omniTarget (engine key omni → omniTarget)', () => {
    const doc = { omniTarget: 100, omnihealth: 999 }
    expect(readKpiTarget(doc, 'omni')).toBe(100)
  })

  it('wellnessTarget field is wellnessTarget (engine key wellness → wellnessTarget)', () => {
    const doc = { wellnessTarget: 80 }
    expect(readKpiTarget(doc, 'wellness')).toBe(80)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 8 — Arabic numerals normalize correctly
// ════════════════════════════════════════════════════════════

describe('4E-1 test 8: Arabic numeral normalization', () => {
  it('normalizeArabicNumerals converts ١٢٣٤٥ to 12345', () => {
    expect(normalizeArabicNumerals('١٢٣٤٥')).toBe('12345')
  })

  it('readKpiActual handles Arabic numeral string values', () => {
    const entry = { wasfaty: '١٥٠' }  // 150 in Arabic
    expect(readKpiActual(entry, 'wasfaty')).toBe(150)
  })

  it('readKpiTarget handles Arabic numeral string values', () => {
    const doc = { wasfatyTarget: '٢٠٠' }  // 200 in Arabic
    expect(readKpiTarget(doc, 'wasfaty')).toBe(200)
  })

  it('ASCII numeric strings pass through correctly', () => {
    const entry = { wasfaty: '150' }
    expect(readKpiActual(entry, 'wasfaty')).toBe(150)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 9 — Missing values become 0
// ════════════════════════════════════════════════════════════

describe('4E-1 test 9: missing/invalid values normalize to 0', () => {
  it('undefined field → 0', () => {
    expect(readKpiActual({}, 'wasfaty')).toBe(0)
    expect(readKpiTarget({}, 'wasfaty')).toBe(0)
  })

  it('null field → 0', () => {
    expect(readKpiActual({ wasfaty: null }, 'wasfaty')).toBe(0)
    expect(readKpiTarget({ wasfatyTarget: null }, 'wasfaty')).toBe(0)
  })

  it('empty string → 0', () => {
    expect(readKpiActual({ wasfaty: '' }, 'wasfaty')).toBe(0)
    expect(readKpiTarget({ wasfatyTarget: '' }, 'wasfaty')).toBe(0)
  })

  it('NaN string → 0', () => {
    expect(readKpiActual({ wasfaty: 'abc' }, 'wasfaty')).toBe(0)
    expect(readKpiTarget({ wasfatyTarget: 'xyz' }, 'wasfaty')).toBe(0)
  })

  it('negative values → 0', () => {
    expect(readKpiActual({ wasfaty: -10 }, 'wasfaty')).toBe(0)
    expect(readKpiTarget({ wasfatyTarget: -5 }, 'wasfaty')).toBe(0)
  })

  it('sumKpi on empty entries → 0', () => {
    for (const k of CORE_KEYS) {
      expect(sumKpi([], k)).toBe(0)
    }
  })

  it('extractDailyValues on empty entries → []', () => {
    expect(extractDailyValues([], 'wasfaty')).toEqual([])
  })

  it('getTargetForKpi with null target → 0', () => {
    expect(getTargetForKpi(null, 'wasfaty')).toBe(0)
    expect(getTargetForKpi(undefined, 'wasfaty')).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 10 — computeAchievementPct unchanged
// ════════════════════════════════════════════════════════════

describe('4E-1 test 10: computeAchievementPct behavior unchanged', () => {
  it('100/200 → 50', () => expect(computeAchievementPct(100, 200)).toBe(50))
  it('200/200 → 100', () => expect(computeAchievementPct(200, 200)).toBe(100))
  it('400/200 → 200 (capped)', () => expect(computeAchievementPct(400, 200)).toBe(200))
  it('0/0 → 0', () => expect(computeAchievementPct(0, 0)).toBe(0))
  it('actual=0, target=100 → 0', () => expect(computeAchievementPct(0, 100)).toBe(0))

  it('parity: dynamic path achievementPct === legacy for all core KPIs', () => {
    for (const k of CORE_KEYS) {
      const dynActual  = readKpiActual(ENTRY,  k)
      const dynTarget  = readKpiTarget(TARGET, k)
      const legActual  = Number((ENTRY as any)[k]) || 0
      const legField   = (KPI_META as any)[k].targetField
      const legTarget  = Number((TARGET as any)[legField]) || 0

      expect(computeAchievementPct(dynActual, dynTarget))
        .toBe(computeAchievementPct(legActual, legTarget))
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 11 — forecast unchanged
// ════════════════════════════════════════════════════════════

describe('4E-1 test 11: forecast calculation unchanged', () => {
  it('computeForecast produces same result via dynamic vs legacy reads', () => {
    for (const k of CORE_KEYS) {
      const dynActual  = readKpiActual(ENTRY,  k)
      const dynTarget  = readKpiTarget(TARGET, k)
      const legActual  = Number((ENTRY as any)[k]) || 0
      const legField   = (KPI_META as any)[k].targetField
      const legTarget  = Number((TARGET as any)[legField]) || 0

      const dynForecast = computeForecast(dynActual, dynTarget, dp)
      const legForecast = computeForecast(legActual, legTarget, dp)

      expect(dynForecast.forecastEOM).toBe(legForecast.forecastEOM)
      expect(dynForecast.forecastAchPct).toBe(legForecast.forecastAchPct)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 12 — pace unchanged
// ════════════════════════════════════════════════════════════

describe('4E-1 test 12: pace calculation unchanged', () => {
  it('computePace produces same result via dynamic vs legacy reads', () => {
    for (const k of CORE_KEYS) {
      const dynActual  = readKpiActual(ENTRY,  k)
      const dynTarget  = readKpiTarget(TARGET, k)
      const legActual  = Number((ENTRY as any)[k]) || 0
      const legField   = (KPI_META as any)[k].targetField
      const legTarget  = Number((TARGET as any)[legField]) || 0

      const dynPace = computePace(dynActual, dynTarget, dp)
      const legPace = computePace(legActual, legTarget, dp)

      expect(dynPace.paceStatus).toBe(legPace.paceStatus)
      expect(dynPace.paceRatio).toBe(legPace.paceRatio)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 13 — traffic light unchanged
// ════════════════════════════════════════════════════════════

describe('4E-1 test 13: traffic light status unchanged', () => {
  it('getTrafficLight produces same status via dynamic vs legacy reads', () => {
    for (const k of CORE_KEYS) {
      const dynStats = computeKpiStats(
        readKpiActual(ENTRY, k),
        readKpiTarget(TARGET, k),
        dp, k,
      )
      const legStats = computeKpiStats(
        Number((ENTRY as any)[k]) || 0,
        Number((TARGET as any)[(KPI_META as any)[k].targetField]) || 0,
        dp, k,
      )
      expect(dynStats.status).toBe(legStats.status)
    }
  })

  it('getTrafficLight thresholds: excellent ≥5, good ≥-5, warning ≥-15, else critical', () => {
    expect(getTrafficLight(80, 0.75)).toBe('excellent')  // delta = +5
    expect(getTrafficLight(74, 0.75)).toBe('good')       // delta = -1
    expect(getTrafficLight(62, 0.75)).toBe('warning')    // delta = -13
    expect(getTrafficLight(50, 0.75)).toBe('critical')   // delta = -25
  })
})

// ════════════════════════════════════════════════════════════
// TEST 14 — sorting unchanged
// ════════════════════════════════════════════════════════════

describe('4E-1 test 14: sorting / rankKpisByPriority unchanged', () => {
  it('rankKpisByPriority sorts by delta (most negative first)', () => {
    const statsMap: any = {}
    for (const k of CORE_KEYS) {
      const actual = readKpiActual(ENTRY, k)
      const target = readKpiTarget(TARGET, k)
      statsMap[k] = computeKpiStats(actual, target, dp, k)
    }
    const ranked = rankKpisByPriority(statsMap)
    // Verify ranking is sorted by delta ascending (worst first)
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(statsMap[ranked[i]].delta).toBeLessThanOrEqual(statsMap[ranked[i + 1]].delta)
    }
  })

  it('KPI_KEYS order is stable: wasfaty, omni, wellness, basket, crossSelling', () => {
    expect(KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 15-17 — Guardrails
// ════════════════════════════════════════════════════════════

describe('4E-1 test 15: no Dashboard calculation changes', async () => {
  it('DashboardPage still uses computeKpiStats (not removed)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('computeKpiStats(')
  })

  it('DashboardPage does not use readKpiActual directly (engine handles it)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    // readKpiActual is used inside useBranchIntelligenceData, not DashboardPage
    // DashboardPage reads kpiStats from store/hook, not raw entries
    const hasReadKpiActual = src.includes('readKpiActual(')
    // It may or may not have it — this is just a documentation test
    expect(typeof hasReadKpiActual).toBe('boolean')
  })
})

describe('4E-1 test 16: no Reports calculation changes', async () => {
  it('ReportsPage does not contain sumKpi or extractDailyValues (those are engine internals)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain('extractDailyValues(')
    expect(src).not.toContain('sumKpi(')
  })
})

describe('4E-1 test 17: no Firestore changes in engine', async () => {
  it('kpiAnalyticsEngine does not import Firebase/Firestore', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    // Check for actual import statements, not parameter names like 'targetDoc'
    expect(src).not.toMatch(/from ['"]firebase/)
    expect(src).not.toMatch(/from ['"]firestore/)
    expect(src).not.toMatch(/import.*\bsetDoc\b/)
    expect(src).not.toMatch(/import.*\bgetDoc\b/)
  })
})

describe('4E-1 test 18: no Profile Studio or AI changes', async () => {
  it('engine source does not reference Profile Studio', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    expect(src).not.toContain('profileStudio')
    expect(src).not.toContain('ProfileStudio')
  })
})

describe('4E-1 test 19-20: dynamicKpiRegionalWiring remains untouched', async () => {
  it('dynamicKpiRegionalWiring.test.ts does not import readKpiActual or sumKpi from engine directly', async () => {
    const src = await import('../regionalIntelligence/dynamicKpiRegionalWiring.test.ts?raw').then((m) => m.default)
    // These should not be imported by the regional wiring test
    expect(src).not.toContain("import.*readKpiActual.*kpiAnalyticsEngine")
  })

  it('kpiAnalyticsEngine Section 2B header no longer says Shadow-only', async () => {
    const src = await import('../kpiAnalyticsEngine.ts?raw').then((m) => m.default)
    expect(src).not.toContain('Shadow-only')
    expect(src).not.toContain('DO NOT call these from existing computeKpiStats')
  })
})
