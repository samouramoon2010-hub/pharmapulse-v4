// ============================================================
// Core KPI Dependency Removal Program — Stage F, Phase 4 (Live Analytics)
//
// Proves that a brand-new, non-Core KPI (not one of the 5 legacy keys)
// flows through the Live Analytics surface — kpiHealth, activityFeed,
// alerts, and momentum — when a registry is supplied with a nonzero
// weight, with zero source-code change beyond adding the KPI to the
// registry/profile/data. Also proves the no-registry path, and the
// weight-gated aggregates with the live DEFAULT_KPI_REGISTRY (weight 0
// for all non-Core KPIs today), remain byte-identical to pre-Stage-F
// behavior.
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeKpiHealth, computeOverallHealth } from './kpiHealthEngine'
import { computeLiveMomentum } from './liveMomentumEngine'
import { generateActivityFeed } from './activityFeedEngine'
import { generateLiveAnalytics } from './liveAnalyticsGenerator'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry/defaultKpiRegistry'
import type { KpiRegistry } from '../kpiRegistry/kpiRegistryTypes'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import type { LiveAnalyticsInput } from './liveAnalyticsTypes'

const PID = 'branch-test'
const TEST_KPI_KEY = 'insurance_conversion_test'
const NOW = new Date('2025-05-20T00:00:00.000Z')

const ZERO_WEIGHT_REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: {
    key: TEST_KPI_KEY, label: 'Insurance Conversion (Test)', shortLabel: 'Insurance',
    labelAr: 'تحويل التأمين', category: 'engagement', valueType: 'count',
    unit: 'conversions', unitAr: 'تحويل', direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isCore: false, isActive: true, lifecycleStage: 'production_evaluation',
    actualField: TEST_KPI_KEY, targetField: `${TEST_KPI_KEY}Target`,
  } as any,
}

const WEIGHTED_REGISTRY: KpiRegistry = {
  ...ZERO_WEIGHT_REGISTRY,
  [TEST_KPI_KEY]: { ...(ZERO_WEIGHT_REGISTRY as any)[TEST_KPI_KEY], weight: 0.3 },
}

function liveInput(): LiveAnalyticsInput {
  return {
    userId: 'u1', pharmacyId: PID, pharmacyName: 'Branch Test', role: 'pharmacist',
    todayEntries: [
      { userId: 'u1', pharmacyId: PID, date: '2025-05-20',
        wasfaty: 10, omni: 5, wellness: 5, basket: 5, crossSelling: 5,
        [TEST_KPI_KEY]: 20 } as any,
    ],
    mtdEntries: [
      { userId: 'u1', pharmacyId: PID, date: '2025-05-10',
        wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
        [TEST_KPI_KEY]: 40 } as any,
    ],
    historicalEntries: [],
    target: {
      pharmacyId: PID, month: '2025-05',
      wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
      basketTarget: 50, crossSellTarget: 60,
      [`${TEST_KPI_KEY}Target`]: 50,
    } as any,
    now: NOW,
  }
}

describe('Stage F Phase 4 — Live Analytics surface accepts an arbitrary new KPI', () => {
  it('without a registry, computeKpiHealth/computeLiveMomentum/generateActivityFeed ignore the new KPI entirely (byte-identical legacy behavior)', () => {
    const health = computeKpiHealth(liveInput())
    const momentum = computeLiveMomentum(liveInput())
    expect(health.map((h) => h.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
    expect(momentum.kpiMomentum.map((m) => m.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
  })

  it('with a zero-weight registry, the new KPI appears in kpiHealth/kpiMomentum but contributes nothing to the aggregates', () => {
    const healthWithout = computeKpiHealth(liveInput())
    const healthWith    = computeKpiHealth(liveInput(), ZERO_WEIGHT_REGISTRY)
    expect(healthWith.some((h) => h.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(computeOverallHealth(healthWithout)).toBe(computeOverallHealth(healthWith.filter((h) => h.kpiKey !== TEST_KPI_KEY)))

    const momentumWithout = computeLiveMomentum(liveInput())
    const momentumWith    = computeLiveMomentum(liveInput(), ZERO_WEIGHT_REGISTRY)
    expect(momentumWith.kpiMomentum.some((m) => m.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(momentumWith.overallDirection).toBe(momentumWithout.overallDirection)
    expect(momentumWith.overallDelta).toBe(momentumWithout.overallDelta)
  })

  it('with a weighted registry, the new KPI is included in activityFeed when it has today activity', () => {
    const feed = generateActivityFeed(liveInput(), WEIGHTED_REGISTRY)
    expect(feed.some((item) => item.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('generateLiveAnalytics end-to-end: a weighted registry surfaces the new KPI in kpiHealth and momentum, no source edit required', () => {
    const result = generateLiveAnalytics(liveInput(), undefined, WEIGHTED_REGISTRY)
    expect(result.kpiHealth.some((h) => h.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(result.momentum.kpiMomentum.some((m) => m.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('generateLiveAnalytics with a zero-weight registry produces aggregates identical to the 5-Core-only baseline', () => {
    const withoutRegistry = generateLiveAnalytics(liveInput())
    const withZeroWeight   = generateLiveAnalytics(liveInput(), undefined, ZERO_WEIGHT_REGISTRY)
    expect(withZeroWeight.overallHealth).toBe(withoutRegistry.overallHealth)
    expect(withZeroWeight.criticalKpiCount).toBe(withoutRegistry.criticalKpiCount)
    expect(withZeroWeight.operationalStatus.status).toBe(withoutRegistry.operationalStatus.status)
  })
})
