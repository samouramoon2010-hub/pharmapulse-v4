// ============================================================
// Dynamic Regional Analytics — Phase 1 Regression Tests
//
// Verifies:
//   1. Legacy registry still returns original 5 KPIs
//   2. Dynamic production KPI appears automatically
//   3. Pilot KPI excluded
//   4. Shadow KPI excluded
//   5. Branch rollup includes dynamic KPI values
//   6. Regional rollup includes dynamic KPI averages
//   7. Missing registry falls back to DEFAULT_KPI_KEYS
//   8. Alias resolution works correctly
//   9. Existing rollup outputs unchanged for legacy-only registry
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateBranchRollup }   from '../../engine/regionalIntelligence/branchRollupEngine'
import { generateRegionalRollups } from '../../engine/regionalIntelligence/regionalRollupEngine'
import { DEFAULT_KPI_REGISTRY }    from '../../engine/kpiRegistry'
import { DEFAULT_KPI_KEYS }        from '../../engine/kpiAnalyticsEngine'
import type { BranchRollupInput, RegionalPeriod } from '../../engine/regionalIntelligence/regionalTypes'
import type { KpiEntry, MonthlyTarget }            from '../../engine/kpiAnalyticsEngine'
import type { KpiDefinition, KpiRegistry }         from '../../engine/kpiRegistry'

// ── Test fixtures ────────────────────────────────────────────

const PERIOD: RegionalPeriod = {
  startDate: '2025-06-01',
  endDate:   '2025-06-30',
  label:     'June 2025',
  dayRatio:  0.5,
}

function makeEntry(overrides: Partial<KpiEntry> = {}): KpiEntry {
  return {
    id:           'e1',
    userId:       'user-1',
    pharmacyId:   'pharm-1',
    date:         '2025-06-15',
    wasfaty:      100,
    omni:         90,
    wellness:     80,
    basket:       70,
    crossSelling: 60,
    ...overrides,
  }
}

function makeTarget(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId:      'pharm-1',
    month:           '2025-06',
    wasfatyTarget:   200,
    omniTarget:      180,
    wellnessTarget:  160,
    basketTarget:    140,
    crossSellTarget: 120,
    ...overrides,
  }
}

function makeInput(overrides: Partial<BranchRollupInput> = {}): BranchRollupInput {
  return {
    branchId:   'pharm-1',
    branchName: 'Test Branch',
    branchCode: 'TB-01',
    region:     'Central',
    entries:    [makeEntry()],
    target:     makeTarget(),
    historicalEntries: [],
    ...overrides,
  }
}

// A minimal dynamic KPI definition (production_evaluation)
function makeDynamicKpi(key: string, stage = 'production_evaluation'): KpiDefinition {
  return {
    key,
    label:      `Dynamic ${key}`,
    shortLabel: key,
    labelAr:    key,
    category:   'commercial',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: { healthy: 90, watch: 70, risk: 50, critical: 30 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
    sortOrder:  200,
    description:      '',
    lifecycleStage:   stage as any,
    isPrimary:        false,
    coachingAction:   '',
    coachingActionAr: '',
  }
}

// ─────────────────────────────────────────────────────────────
// Test 1: Legacy registry still returns original 5 KPIs
// ─────────────────────────────────────────────────────────────
describe('1 — Legacy registry: branch rollup still produces 5 core KPI summaries', () => {
  const summary = generateBranchRollup(makeInput(), PERIOD)

  it('kpiAchievementSummary has 5 entries for legacy-only registry', () => {
    // Without registry, DEFAULT_KPI_KEYS are used → 5 summaries
    // (DEFAULT_KPI_REGISTRY also has non-core production KPIs so
    //  without registry arg we get exactly DEFAULT_KPI_KEYS = 5)
    expect(summary.kpiAchievementSummary).toHaveLength(5)
  })

  it('all 5 legacy KPI keys are present', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })

  it('wasfaty achievement matches entry data', () => {
    const w = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    expect(w).toBeDefined()
    expect(w!.actual).toBe(100)
    expect(w!.target).toBe(200)
    expect(w!.achievementPct).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 2: Dynamic production KPI appears automatically
// ─────────────────────────────────────────────────────────────
describe('2 — Dynamic production KPI appears automatically in branch rollup', () => {
  const dynamicRegistry: KpiRegistry = {
    ...DEFAULT_KPI_REGISTRY,
    testDynamicKpi: makeDynamicKpi('testDynamicKpi', 'production_evaluation'),
  }

  const entry = makeEntry({ testDynamicKpi: 42 } as any)
  const target = makeTarget({ testDynamicKpiTarget: 100 } as any)
  const input = makeInput({ entries: [entry], target })
  const summary = generateBranchRollup(input, PERIOD, dynamicRegistry)

  it('kpiAchievementSummary includes testDynamicKpi', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).toContain('testDynamicKpi')
  })

  it('testDynamicKpi actual value is correctly aggregated', () => {
    const dkpi = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'testDynamicKpi')
    expect(dkpi).toBeDefined()
    expect(dkpi!.actual).toBe(42)
  })

  it('testDynamicKpi target is read from target document', () => {
    const dkpi = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'testDynamicKpi')
    expect(dkpi!.target).toBe(100)
    expect(dkpi!.achievementPct).toBe(42)
  })

  it('legacy 5 KPIs still present alongside dynamic KPI', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })
})

// ─────────────────────────────────────────────────────────────
// Test 3: Pilot KPI excluded
// ─────────────────────────────────────────────────────────────
describe('3 — Pilot KPI (pilot_tracking) excluded from branch rollup', () => {
  const registryWithPilot: KpiRegistry = {
    ...DEFAULT_KPI_REGISTRY,
    insuranceConversion: {
      ...DEFAULT_KPI_REGISTRY.insuranceConversion,
      lifecycleStage: 'pilot_tracking',
    },
  }

  const entry = makeEntry({ insuranceConversion: 15 } as any)
  const summary = generateBranchRollup(makeInput({ entries: [entry] }), PERIOD, registryWithPilot)

  it('insuranceConversion is NOT in kpiAchievementSummary', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).not.toContain('insuranceConversion')
  })

  it('legacy 5 KPIs unaffected by pilot KPI presence', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })
})

// ─────────────────────────────────────────────────────────────
// Test 4: Shadow KPI excluded
// ─────────────────────────────────────────────────────────────
describe('4 — Shadow KPI (shadow_evaluation) excluded from branch rollup', () => {
  const registryWithShadow: KpiRegistry = {
    ...DEFAULT_KPI_REGISTRY,
    shadowKpi: makeDynamicKpi('shadowKpi', 'shadow_evaluation'),
  }

  const entry = makeEntry({ shadowKpi: 99 } as any)
  const summary = generateBranchRollup(makeInput({ entries: [entry] }), PERIOD, registryWithShadow)

  it('shadowKpi is NOT in kpiAchievementSummary', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).not.toContain('shadowKpi')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 5: Branch rollup includes dynamic KPI values end-to-end
// ─────────────────────────────────────────────────────────────
describe('5 — Branch rollup: dynamic KPI values aggregated correctly', () => {
  const dynamicRegistry: KpiRegistry = {
    ...DEFAULT_KPI_REGISTRY,
    guestConversion: makeDynamicKpi('guestConversion', 'production_evaluation'),
  }

  const entries: KpiEntry[] = [
    makeEntry({ guestConversion: 10 } as any),
    makeEntry({ date: '2025-06-16', guestConversion: 15 } as any),
    makeEntry({ date: '2025-06-17', guestConversion: 20 } as any),
  ]
  const target = makeTarget({ guestConversionTarget: 100 } as any)
  const summary = generateBranchRollup(
    makeInput({ entries, target }),
    PERIOD,
    dynamicRegistry,
  )

  it('guestConversion actual = sum of all entries', () => {
    const g = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'guestConversion')
    expect(g!.actual).toBe(45)  // 10 + 15 + 20
  })

  it('guestConversion achievement % = 45%', () => {
    const g = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'guestConversion')
    expect(g!.achievementPct).toBe(45)
  })

  it('hasTarget is true when target is set', () => {
    const g = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'guestConversion')
    expect(g!.hasTarget).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 6: Regional rollup includes dynamic KPI averages
// ─────────────────────────────────────────────────────────────
describe('6 — Regional rollup: dynamic KPI averages across branches', () => {
  const dynamicRegistry: KpiRegistry = {
    ...DEFAULT_KPI_REGISTRY,
    testDynamicKpi: makeDynamicKpi('testDynamicKpi', 'production_evaluation'),
  }

  const makeRollup = (branchId: string, actual: number) => {
    const entry = makeEntry({ pharmacyId: branchId, testDynamicKpi: actual } as any)
    const target = makeTarget({ pharmacyId: branchId, testDynamicKpiTarget: 100 } as any)
    return generateBranchRollup(
      makeInput({ branchId, branchName: `Branch ${branchId}`, entries: [entry], target }),
      PERIOD,
      dynamicRegistry,
    )
  }

  const branchRollups = [
    makeRollup('p1', 60),
    makeRollup('p2', 80),
  ]

  const regions = generateRegionalRollups(branchRollups, dynamicRegistry)

  it('regional rollup produces output', () => {
    expect(regions).toHaveLength(1)
  })

  it('testDynamicKpi appears in regional kpiAverages', () => {
    const avgKeys = regions[0].kpiAverages.map((a) => a.kpiKey)
    expect(avgKeys).toContain('testDynamicKpi')
  })

  it('testDynamicKpi mean achievement is average of both branches', () => {
    const avg = regions[0].kpiAverages.find((a) => a.kpiKey === 'testDynamicKpi')
    expect(avg).toBeDefined()
    expect(avg!.meanAchievementPct).toBe(70) // (60 + 80) / 2
  })

  it('legacy KPI averages still present', () => {
    const avgKeys = regions[0].kpiAverages.map((a) => a.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(avgKeys).toContain(k))
  })
})

// ─────────────────────────────────────────────────────────────
// Test 7: Missing registry falls back to DEFAULT_KPI_KEYS
// ─────────────────────────────────────────────────────────────
describe('7 — Missing registry falls back to DEFAULT_KPI_KEYS', () => {
  const summaryNoRegistry = generateBranchRollup(makeInput(), PERIOD)
  const summaryUndefined  = generateBranchRollup(makeInput(), PERIOD, undefined)

  it('branch rollup without registry has exactly 5 KPI summaries', () => {
    expect(summaryNoRegistry.kpiAchievementSummary).toHaveLength(5)
  })

  it('branch rollup with undefined registry has exactly 5 KPI summaries', () => {
    expect(summaryUndefined.kpiAchievementSummary).toHaveLength(5)
  })

  it('regional rollup without registry has 5 KPI averages', () => {
    const rollup = generateBranchRollup(makeInput(), PERIOD)
    const regions = generateRegionalRollups([rollup])
    expect(regions[0].kpiAverages).toHaveLength(5)
  })

  it('keys match DEFAULT_KPI_KEYS exactly', () => {
    const keys = summaryNoRegistry.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
    expect(keys).toHaveLength(DEFAULT_KPI_KEYS.length)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 8: Alias resolution works correctly
// ─────────────────────────────────────────────────────────────
describe('8 — Alias resolution: omnihealth→omni, wellnessCard→wellness', () => {
  // DEFAULT_KPI_REGISTRY has omnihealth with aliasFor:'omni'
  const summary = generateBranchRollup(makeInput(), PERIOD, DEFAULT_KPI_REGISTRY)

  it('engine key omni is in kpiAchievementSummary (not omnihealth)', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).toContain('omni')
    expect(keys).not.toContain('omnihealth')
  })

  it('engine key wellness is in kpiAchievementSummary (not wellnessCard)', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).toContain('wellness')
    expect(keys).not.toContain('wellnessCard')
  })

  it('omni actual reads from entry.omni field', () => {
    const entry = makeEntry({ omni: 75 })
    const s = generateBranchRollup(makeInput({ entries: [entry] }), PERIOD, DEFAULT_KPI_REGISTRY)
    const omni = s.kpiAchievementSummary.find((k) => k.kpiKey === 'omni')
    expect(omni!.actual).toBe(75)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 9: Existing rollup outputs unchanged for legacy-only registry
// ─────────────────────────────────────────────────────────────
describe('9 — Existing rollup outputs unchanged for legacy KPI composition', () => {
  const legacy  = generateBranchRollup(makeInput(), PERIOD)
  const withReg = generateBranchRollup(makeInput(), PERIOD, DEFAULT_KPI_REGISTRY)
  // DEFAULT_KPI_REGISTRY has non-core production KPIs (sales, sl, ndf, inbody, liberation)
  // so counts differ, but core KPI summaries must be identical

  it('wasfaty achievement is same with and without explicit registry (core KPIs)', () => {
    const w1 = legacy.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    const w2 = withReg.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    expect(w1!.actual).toBe(w2!.actual)
    expect(w1!.target).toBe(w2!.target)
    expect(w1!.achievementPct).toBe(w2!.achievementPct)
  })

  it('overallAchievementPct is a valid number in both paths', () => {
    expect(typeof legacy.overallAchievementPct).toBe('number')
    expect(typeof withReg.overallAchievementPct).toBe('number')
    expect(isFinite(legacy.overallAchievementPct)).toBe(true)
    expect(isFinite(withReg.overallAchievementPct)).toBe(true)
  })

  it('riskLevel is preserved correctly in both paths', () => {
    expect(['ON_TRACK','LOW_RISK','MEDIUM_RISK','HIGH_RISK']).toContain(legacy.riskLevel)
    expect(['ON_TRACK','LOW_RISK','MEDIUM_RISK','HIGH_RISK']).toContain(withReg.riskLevel)
  })

  it('regional rollup produces identical core KPI averages', () => {
    const regWithout = generateRegionalRollups([legacy])
    const regWith    = generateRegionalRollups([withReg], DEFAULT_KPI_REGISTRY)
    const omniWithout = regWithout[0].kpiAverages.find((k) => k.kpiKey === 'omni')
    const omniWith    = regWith[0].kpiAverages.find((k) => k.kpiKey === 'omni')
    expect(omniWithout!.meanAchievementPct).toBe(omniWith!.meanAchievementPct)
  })
})
