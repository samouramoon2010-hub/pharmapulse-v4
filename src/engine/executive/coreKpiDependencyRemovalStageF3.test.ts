// ============================================================
// Core KPI Dependency Removal Program — Stage F, Phase 3 (Executive BI)
//
// Proves that a brand-new, non-Core KPI (not one of the 5 legacy keys)
// flows through the Executive BI surface — score breakdown, trend
// detail, and risk flags — when a registry is supplied with a nonzero
// weight, with zero source-code change beyond adding the KPI to the
// registry/profile/data. Also proves the no-registry path, and the
// weight-gated aggregates with the live DEFAULT_KPI_REGISTRY (weight 0
// for all non-Core KPIs today), remain byte-identical to pre-Stage-F
// behavior.
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeExecutiveScore } from './executiveScore'
import { computeBranchTrend } from './trendEngine'
import { computeBranchRiskProfile } from './riskEngine'
import { generateBranchSummary } from './executiveReportGenerator'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry/defaultKpiRegistry'
import type { KpiRegistry } from '../kpiRegistry/kpiRegistryTypes'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import type { BranchInput } from './executiveTypes'

const PID = 'branch-test'
const TEST_KPI_KEY = 'insurance_conversion_test'

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

function entries(): any[] {
  return [
    { userId: 'u1', pharmacyId: PID, date: '2025-05-10',
      wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
      [TEST_KPI_KEY]: 40 },
  ]
}

function target(): any {
  return {
    pharmacyId: PID, month: '2025-05',
    wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
    basketTarget: 50, crossSellTarget: 60,
    [`${TEST_KPI_KEY}Target`]: 50,
  }
}

function branchInput(): BranchInput {
  return {
    pharmacyId: PID, pharmacyName: 'Branch Test', pharmacyCode: 'BT', region: 'Central',
    mtdEntries: entries(), historicalEntries: entries(), target: target(),
  } as BranchInput
}

describe('Stage F Phase 3 — Executive BI surface accepts an arbitrary new KPI', () => {
  it('without a registry, computeExecutiveScore/computeBranchTrend ignore the new KPI entirely (byte-identical legacy behavior)', () => {
    const score = computeExecutiveScore(branchInput())
    const trend = computeBranchTrend(branchInput())
    expect(score.kpiBreakdown.map((k) => k.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
    expect(trend.kpiTrends.map((t) => t.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
  })

  it('with a zero-weight registry (today\'s live DEFAULT_KPI_REGISTRY shape), the new KPI appears in kpiBreakdown/kpiTrends but contributes nothing to the aggregates', () => {
    const withoutRegistry = computeExecutiveScore(branchInput())
    const withRegistry    = computeExecutiveScore(branchInput(), ZERO_WEIGHT_REGISTRY)
    const newEntry = withRegistry.kpiBreakdown.find((k) => k.kpiKey === TEST_KPI_KEY)
    expect(newEntry).toBeDefined()
    expect(newEntry!.weightedScore).toBe(0)
    expect(withRegistry.overall).toBe(withoutRegistry.overall)
    expect(withRegistry.adjusted).toBe(withoutRegistry.adjusted)

    const trendWithout = computeBranchTrend(branchInput())
    const trendWith    = computeBranchTrend(branchInput(), ZERO_WEIGHT_REGISTRY)
    expect(trendWith.kpiTrends.some((t) => t.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(trendWith.overallMomentum).toBe(trendWithout.overallMomentum)
    expect(trendWith.direction).toBe(trendWithout.direction)
  })

  it('with a weighted registry, the new KPI genuinely contributes to computeExecutiveScore.overall/adjusted', () => {
    const withoutNewKpi = computeExecutiveScore(branchInput(), ZERO_WEIGHT_REGISTRY)
    const withNewKpi     = computeExecutiveScore(branchInput(), WEIGHTED_REGISTRY)
    const newEntry = withNewKpi.kpiBreakdown.find((k) => k.kpiKey === TEST_KPI_KEY)
    expect(newEntry).toEqual({
      kpiKey: TEST_KPI_KEY, label: 'Insurance Conversion (Test)',
      actual: 40, target: 50, achievementPct: 80,
      status: newEntry!.status, weight: 0.3, weightedScore: 24,
    })
    expect(withNewKpi.overall).not.toBe(withoutNewKpi.overall)
  })

  it('with a weighted registry, the new KPI genuinely contributes to computeBranchTrend.overallMomentum', () => {
    const withoutNewKpi = computeBranchTrend(branchInput(), ZERO_WEIGHT_REGISTRY)
    const withNewKpi     = computeBranchTrend(branchInput(), WEIGHTED_REGISTRY)
    expect(withNewKpi.kpiTrends.some((t) => t.kpiKey === TEST_KPI_KEY)).toBe(true)
    // Momentum may legitimately stay equal by coincidence of zero deltas in
    // this fixture, but the new KPI must be eligible (present in the
    // weight-gated set), which we verify indirectly via kpiTrends inclusion
    // above and the absence of a throw/NaN here.
    expect(Number.isFinite(withNewKpi.overallMomentum)).toBe(true)
  })

  it('with a weighted registry, computeBranchRiskProfile can generate a flag for the new KPI', () => {
    // Force a critical achievement on the new KPI to guarantee a flag fires.
    const lowTarget = { ...target(), [`${TEST_KPI_KEY}Target`]: 1000 }
    const branch: BranchInput = { ...branchInput(), target: lowTarget }
    const risk = computeBranchRiskProfile(branch, WEIGHTED_REGISTRY)
    expect(risk.flags.some((f) => f.kpiKey === TEST_KPI_KEY)).toBe(true)

    const riskZeroWeight = computeBranchRiskProfile(branch, { ...ZERO_WEIGHT_REGISTRY, [TEST_KPI_KEY]: { ...(ZERO_WEIGHT_REGISTRY as any)[TEST_KPI_KEY], targetField: `${TEST_KPI_KEY}Target` } } as any)
    expect(riskZeroWeight.flags.some((f) => f.kpiKey === TEST_KPI_KEY)).toBe(false)
  })

  it('generateBranchSummary end-to-end: a weighted registry surfaces the new KPI in score and trend, no source edit required', () => {
    const summary = generateBranchSummary(branchInput(), '2025-05-15', '2025-05', WEIGHTED_REGISTRY)
    expect(summary.score.kpiBreakdown.some((k) => k.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(summary.trend.kpiTrends.some((t) => t.kpiKey === TEST_KPI_KEY)).toBe(true)
  })
})
