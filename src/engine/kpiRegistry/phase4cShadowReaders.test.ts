// ============================================================
// Phase 4C — Shadow Readers
//
// Verifies:
//  1.  readKpiActual is exported
//  2.  readKpiTarget is exported
//  3.  computeKpiStatsDynamic is exported
//  4.  compareStaticVsDynamicKpi is exported
//  5.  readKpiActual reads registry actualField correctly
//  6.  readKpiTarget reads registry targetField correctly
//  7.  Arabic numeral strings convert before numeric conversion
//  8.  Invalid / non-numeric values return 0
//  9.  Missing / undefined values return 0
// 10.  Dynamic achievement === static achievement for wasfaty
// 11.  Dynamic achievement === static achievement for omni
// 12.  Dynamic achievement === static achievement for wellness
// 13.  Dynamic achievement === static achievement for basket
// 14.  Dynamic achievement === static achievement for crossSelling
// 15.  compareStaticVsDynamicKpi.actualMatches === true
// 16.  compareStaticVsDynamicKpi.targetMatches === true
// 17.  compareStaticVsDynamicKpi.achievementMatches === true
// 18.  Existing computeKpiStats signature unchanged
// 19.  Existing computeAchievementPct signature unchanged
// 20.  No surface migration in engine
// 21.  No dashboard changes in engine
// 22.  No UI imports in engine
// 23.  No Firestore writes in engine
// 24.  No dynamic KPI regional wiring imports
// 25.  dynamicKpiRegionalWiring.test.ts untouched
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  readKpiActual,
  readKpiTarget,
  computeKpiStatsDynamic,
  compareStaticVsDynamicKpi,
  computeKpiStats,
  computeAchievementPct,
  getDayProgress,
} from '../kpiAnalyticsEngine'

const engineSrc = () => import('../kpiAnalyticsEngine?raw').then((m) => m.default)

// ── Fixed test fixtures ───────────────────────────────────────

// KpiEntry-shaped doc: engine keys as field names
const SAMPLE_ENTRY: Record<string, unknown> = {
  wasfaty:      150,
  omni:         80,
  wellness:     60,
  basket:       250,
  crossSelling: 45,
}

// MonthlyTarget-shaped doc: target fields
const SAMPLE_TARGET: Record<string, unknown> = {
  wasfatyTarget:   200,
  omniTarget:      100,
  wellnessTarget:  80,
  basketTarget:    300,
  crossSellTarget: 60,   // intentional abbreviation — matches KPI_META
}

// Deterministic date mid-month
const TEST_DATE = new Date('2025-01-15')
const dp = getDayProgress(TEST_DATE)

// ════════════════════════════════════════════════════════════
// 1-4. Exports exist
// ════════════════════════════════════════════════════════════

describe('4C — Shadow reader exports', () => {
  it('readKpiActual is exported (test 1)', () => {
    expect(typeof readKpiActual).toBe('function')
  })

  it('readKpiTarget is exported (test 2)', () => {
    expect(typeof readKpiTarget).toBe('function')
  })

  it('computeKpiStatsDynamic is exported (test 3)', () => {
    expect(typeof computeKpiStatsDynamic).toBe('function')
  })

  it('compareStaticVsDynamicKpi is exported (test 4)', () => {
    expect(typeof compareStaticVsDynamicKpi).toBe('function')
  })
})

// ════════════════════════════════════════════════════════════
// 5-6. readKpiActual / readKpiTarget field resolution
// ════════════════════════════════════════════════════════════

describe('4C — readKpiActual field resolution (test 5)', () => {
  it('reads wasfaty from entry.wasfaty', () => {
    expect(readKpiActual({ wasfaty: 150 }, 'wasfaty')).toBe(150)
    expect(readKpiActual({ wasfaty: 150 }, 'wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe(150)
  })

  it('reads omni from entry.omni (via omnihealth.actualField)', () => {
    expect(readKpiActual({ omni: 80 }, 'omni')).toBe(80)
    expect(readKpiActual({ omni: 80 }, 'omni', DEFAULT_KPI_REGISTRY as any)).toBe(80)
  })

  it('reads wellness from entry.wellness (via wellnessCard.actualField)', () => {
    expect(readKpiActual({ wellness: 60 }, 'wellness')).toBe(60)
    expect(readKpiActual({ wellness: 60 }, 'wellness', DEFAULT_KPI_REGISTRY as any)).toBe(60)
  })

  it('reads basket from entry.basket', () => {
    expect(readKpiActual({ basket: 250 }, 'basket')).toBe(250)
  })

  it('reads crossSelling from entry.crossSelling', () => {
    expect(readKpiActual({ crossSelling: 45 }, 'crossSelling')).toBe(45)
  })
})

describe('4C — readKpiTarget field resolution (test 6)', () => {
  it('reads wasfatyTarget from target.wasfatyTarget', () => {
    expect(readKpiTarget({ wasfatyTarget: 200 }, 'wasfaty')).toBe(200)
    expect(readKpiTarget({ wasfatyTarget: 200 }, 'wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe(200)
  })

  it('reads omniTarget from target.omniTarget (alias resolution)', () => {
    expect(readKpiTarget({ omniTarget: 100 }, 'omni')).toBe(100)
    expect(readKpiTarget({ omniTarget: 100 }, 'omni', DEFAULT_KPI_REGISTRY as any)).toBe(100)
  })

  it('reads crossSellTarget from target.crossSellTarget (intentional abbreviation)', () => {
    expect(readKpiTarget({ crossSellTarget: 60 }, 'crossSelling')).toBe(60)
    expect(readKpiTarget({ crossSellTarget: 60 }, 'crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe(60)
  })

  it('reads non-core KPI target from registry targetField', () => {
    expect(readKpiTarget({ salesTarget: 500000 }, 'sales', DEFAULT_KPI_REGISTRY as any)).toBe(500000)
    expect(readKpiTarget({ inbodyTarget: 40 },    'inbody', DEFAULT_KPI_REGISTRY as any)).toBe(40)
  })
})

// ════════════════════════════════════════════════════════════
// 7. Arabic numeral normalisation
// ════════════════════════════════════════════════════════════

describe('4C — Arabic numeral normalisation (test 7)', () => {
  it('readKpiActual converts Arabic-Indic string to number', () => {
    expect(readKpiActual({ wasfaty: '١٥٠' }, 'wasfaty')).toBe(150)
  })

  it('readKpiTarget converts Arabic-Indic string to number', () => {
    expect(readKpiTarget({ wasfatyTarget: '٢٠٠' }, 'wasfaty')).toBe(200)
  })

  it('readKpiActual handles Arabic decimal (٣٠٫٥)', () => {
    expect(readKpiActual({ basket: '٣٠٫٥' }, 'basket')).toBeCloseTo(30.5)
  })

  it('ASCII string numerals pass through as-is', () => {
    expect(readKpiActual({ wasfaty: '150' }, 'wasfaty')).toBe(150)
  })
})

// ════════════════════════════════════════════════════════════
// 8-9. Invalid / missing values return 0
// ════════════════════════════════════════════════════════════

describe('4C — Invalid and missing values return 0 (tests 8-9)', () => {
  it('readKpiActual returns 0 for undefined field (test 9)', () => {
    expect(readKpiActual({}, 'wasfaty')).toBe(0)
    expect(readKpiActual({ wasfaty: undefined }, 'wasfaty')).toBe(0)
    expect(readKpiActual({ wasfaty: null },      'wasfaty')).toBe(0)
  })

  it('readKpiActual returns 0 for NaN string (test 8)', () => {
    expect(readKpiActual({ wasfaty: 'not-a-number' }, 'wasfaty')).toBe(0)
    expect(readKpiActual({ wasfaty: '' },             'wasfaty')).toBe(0)
  })

  it('readKpiActual returns 0 for Infinity (test 8b)', () => {
    expect(readKpiActual({ wasfaty: Infinity }, 'wasfaty')).toBe(0)
    expect(readKpiActual({ wasfaty: NaN },      'wasfaty')).toBe(0)
  })

  it('readKpiActual returns 0 (not negative) for negative values (test 8c)', () => {
    expect(readKpiActual({ wasfaty: -50 }, 'wasfaty')).toBe(0)
  })

  it('readKpiTarget returns 0 for missing field (test 9b)', () => {
    expect(readKpiTarget({}, 'wasfaty')).toBe(0)
    expect(readKpiTarget({ wasfatyTarget: null }, 'wasfaty')).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 10-14. Achievement parity: dynamic === static for 5 core KPIs
// ════════════════════════════════════════════════════════════

describe('4C — Dynamic achievement parity (tests 10-14)', () => {
  it('wasfaty: dynamic achievementPct === static (test 10)', () => {
    const stat = computeKpiStats(150, 200, dp, 'wasfaty')
    const dyn  = computeKpiStatsDynamic(SAMPLE_ENTRY, SAMPLE_TARGET, 'wasfaty', dp, DEFAULT_KPI_REGISTRY as any)
    expect(dyn.achievementPct).toBe(stat.achievementPct)
    expect(dyn.actual).toBe(stat.actual)
    expect(dyn.target).toBe(stat.target)
    expect(dyn.status).toBe(stat.status)
  })

  it('omni: dynamic achievementPct === static (test 11)', () => {
    const stat = computeKpiStats(80, 100, dp, 'omni')
    const dyn  = computeKpiStatsDynamic(SAMPLE_ENTRY, SAMPLE_TARGET, 'omni', dp, DEFAULT_KPI_REGISTRY as any)
    expect(dyn.achievementPct).toBe(stat.achievementPct)
    expect(dyn.actual).toBe(stat.actual)
    expect(dyn.target).toBe(stat.target)
  })

  it('wellness: dynamic achievementPct === static (test 12)', () => {
    const stat = computeKpiStats(60, 80, dp, 'wellness')
    const dyn  = computeKpiStatsDynamic(SAMPLE_ENTRY, SAMPLE_TARGET, 'wellness', dp, DEFAULT_KPI_REGISTRY as any)
    expect(dyn.achievementPct).toBe(stat.achievementPct)
    expect(dyn.actual).toBe(stat.actual)
    expect(dyn.target).toBe(stat.target)
  })

  it('basket: dynamic achievementPct === static (test 13)', () => {
    const stat = computeKpiStats(250, 300, dp, 'basket')
    const dyn  = computeKpiStatsDynamic(SAMPLE_ENTRY, SAMPLE_TARGET, 'basket', dp, DEFAULT_KPI_REGISTRY as any)
    expect(dyn.achievementPct).toBe(stat.achievementPct)
    expect(dyn.actual).toBe(stat.actual)
    expect(dyn.target).toBe(stat.target)
  })

  it('crossSelling: dynamic achievementPct === static (test 14)', () => {
    const stat = computeKpiStats(45, 60, dp, 'crossSelling')
    const dyn  = computeKpiStatsDynamic(SAMPLE_ENTRY, SAMPLE_TARGET, 'crossSelling', dp, DEFAULT_KPI_REGISTRY as any)
    expect(dyn.achievementPct).toBe(stat.achievementPct)
    expect(dyn.actual).toBe(stat.actual)
    expect(dyn.target).toBe(stat.target)
  })
})

// ════════════════════════════════════════════════════════════
// 15-17. compareStaticVsDynamicKpi parity flags
// ════════════════════════════════════════════════════════════

describe('4C — compareStaticVsDynamicKpi parity flags (tests 15-17)', () => {
  const CORE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

  for (const key of CORE_KEYS) {
    it(`${key}: actualMatches === true (test 15)`, () => {
      const result = compareStaticVsDynamicKpi(SAMPLE_ENTRY, SAMPLE_TARGET, key, DEFAULT_KPI_REGISTRY as any)
      expect(result.actualMatches).toBe(true)
    })

    it(`${key}: targetMatches === true (test 16)`, () => {
      const result = compareStaticVsDynamicKpi(SAMPLE_ENTRY, SAMPLE_TARGET, key, DEFAULT_KPI_REGISTRY as any)
      expect(result.targetMatches).toBe(true)
    })

    it(`${key}: achievementMatches === true (test 17)`, () => {
      const result = compareStaticVsDynamicKpi(SAMPLE_ENTRY, SAMPLE_TARGET, key, DEFAULT_KPI_REGISTRY as any)
      expect(result.achievementMatches).toBe(true)
    })
  }

  it('compareStaticVsDynamicKpi returns correct shape', () => {
    const result = compareStaticVsDynamicKpi(SAMPLE_ENTRY, SAMPLE_TARGET, 'wasfaty', DEFAULT_KPI_REGISTRY as any)
    expect(result).toHaveProperty('key')
    expect(result).toHaveProperty('staticActual')
    expect(result).toHaveProperty('dynamicActual')
    expect(result).toHaveProperty('staticTarget')
    expect(result).toHaveProperty('dynamicTarget')
    expect(result).toHaveProperty('staticAchievement')
    expect(result).toHaveProperty('dynamicAchievement')
    expect(result).toHaveProperty('actualMatches')
    expect(result).toHaveProperty('targetMatches')
    expect(result).toHaveProperty('achievementMatches')
  })

  it('compareStaticVsDynamicKpi returns key field with engine key value', () => {
    const result = compareStaticVsDynamicKpi(SAMPLE_ENTRY, SAMPLE_TARGET, 'wasfaty')
    expect(result.key).toBe('wasfaty')
  })
})

// ════════════════════════════════════════════════════════════
// 18-19. Existing engine functions unchanged
// ════════════════════════════════════════════════════════════

describe('4C — Existing engine functions unchanged (tests 18-19)', () => {
  it('computeKpiStats still produces correct output (test 18)', () => {
    const result = computeKpiStats(160, 200, dp, 'wasfaty')
    expect(result.achievementPct).toBe(computeAchievementPct(160, 200))
    expect(result.kpiKey).toBe('wasfaty')
    expect(result.actual).toBe(160)
    expect(result.target).toBe(200)
  })

  it('computeAchievementPct signature unchanged (test 19)', () => {
    expect(computeAchievementPct(100, 200)).toBe(50)
    expect(computeAchievementPct(200, 200)).toBe(100)
    expect(computeAchievementPct(0, 200)).toBe(0)
    expect(computeAchievementPct(500, 200)).toBe(200)  // capped at ACHIEVEMENT_CAP
    expect(computeAchievementPct(100, 0)).toBe(0)       // zero target → 0
  })
})

// ════════════════════════════════════════════════════════════
// 20-25. Guardrails
// ════════════════════════════════════════════════════════════

describe('4C — Guardrails (tests 20-25)', () => {
  it('kpiAnalyticsEngine has no surface migration (test 20)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('PerformancePage')
    expect(src).not.toContain('BranchIntelligencePage')
    expect(src).not.toContain('PharmacistIntelligencePage')
  })

  it('kpiAnalyticsEngine has no dashboard imports (test 21)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('DashboardPage')
    expect(src).not.toContain("from '../pages/dashboard'")
  })

  it('kpiAnalyticsEngine has no React or UI imports (test 22)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain("from 'react'")
    expect(src).not.toContain('useState')
    expect(src).not.toContain('useEffect')
  })

  it('kpiAnalyticsEngine has no Firestore writes (test 23)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain("from 'firebase/firestore'")
    expect(src).not.toContain('setDoc')
    expect(src).not.toContain('addDoc')
    expect(src).not.toContain('updateDoc')
  })

  it('kpiAnalyticsEngine has no dynamic regional wiring imports (test 24)', async () => {
    const src = await engineSrc()
    expect(src).not.toMatch(/^import[^'"]*dynamicKpiRegional/m)
    expect(src).not.toContain("from './dynamicKpiRegionalWiring'")
    expect(src).not.toContain("from '../regionalIntelligence/dynamicKpiRegionalWiring'")
  })

  it('dynamicKpiRegionalWiring not referenced in engine source (test 25)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('dynamicKpiRegionalWiring')
  })
})
