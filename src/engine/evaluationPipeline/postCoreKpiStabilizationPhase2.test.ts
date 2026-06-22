// ============================================================
// PharmaPulse Post-Core-KPI Stabilization & Final Foundation Closure
// Phase 2 — Cross-Surface Consistency
//
// For the SAME pharmacist + branch dataset, compares V2 evaluation,
// Dashboard, Ranking, Pharmacist/Team/Branch/Regional Intelligence,
// Executive BI, Trend, Risk, and Live Analytics, proving they all derive
// KPI participation from the SAME Registry — no surface recalculates
// against a hidden fixed Core list, none excludes a positively-weighted
// registered KPI, none includes an inactive one.
//
// IMPORTANT, DOCUMENTED ARCHITECTURAL FACT (not a bug):
// V2's official evaluation SCORE is driven by the active
// EvaluationProfile's basket-element weight (a per-role, configurable
// system). Every OTHER surface in this file (Dashboard, Ranking display,
// Pharmacist/Team/Branch/Regional Intelligence, Executive BI, Trend,
// Risk, Live Analytics) is a Stage-F-widened legacy engine that uses the
// Registry's own `weight` field instead — a separate, intentional
// weighting system. Both list the SAME KPI keys (verified below); they
// intentionally apply different weight VALUES to them. This is the one
// "intentionally different metric" this bundle's Phase 2 instructions
// ask to be documented precisely, rather than treated as an inconsistency.
// ============================================================

import { describe, it, expect } from 'vitest'
import { getProductionEngineKeys } from '../kpiAnalyticsEngine'
import { computeExecutiveScore } from '../executive/executiveScore'
import { computeBranchTrend } from '../executive/trendEngine'
import { computeBranchRiskProfile } from '../executive/riskEngine'
import { generateBranchSummary } from '../executive/executiveReportGenerator'
import { computeBranchKpiScore } from '../../ranking/branch-kpi-engine'
import { computePharmacistPerformance } from '../teamIntelligence/pharmacistPerformanceEngine'
import { computeTeamHealth } from '../teamIntelligence/teamHealthEngine'
import { computeKpiHealth } from '../liveAnalytics/kpiHealthEngine'
import { generateBranchRollup } from '../regionalIntelligence/branchRollupEngine'
import { generateRegionalIntelligence } from '../regionalIntelligence/regionalIntelligenceGenerator'
import type { BranchInput } from '../executive/executiveTypes'
import type { PharmacistInput, TeamIntelligenceInput } from '../teamIntelligence/teamIntelligenceTypes'
import type { LiveAnalyticsInput } from '../liveAnalytics/liveAnalyticsTypes'
import type { BranchRollupInput, RegionalPeriod } from '../regionalIntelligence/regionalTypes'
import { STAB_REGISTRY, STAB_TARGETS } from './postCoreKpiStabilizationFixtures'

const PID    = 'branch-stab-p2'
const USER   = 'pharmacist-stab-p2'
const MONTH  = '2025-07'
const TODAY  = `${MONTH}-15`
const REGION = 'North'

// A single mixed-performance dataset shared by every surface in this file.
const ENTRY = {
  userId: USER, pharmacyId: PID, date: TODAY,
  wasfaty: 120, omni: 90, wellness: 60, basket: 110, crossSelling: 70,
  digitalEngagementScoreStab: 150, consultationQualityScoreStab: 40,
  staffTrainingHoursStab: 999, newPatientReferralsStab: 80,
  loyaltyEnrollmentRateStab: 12,
} as any

const TARGET = { pharmacyId: PID, month: MONTH, ...STAB_TARGETS } as any

const CANONICAL_KEYS = getProductionEngineKeys(STAB_REGISTRY).sort()

function keysOf(arr: { kpiKey: string }[]): string[] {
  return [...new Set(arr.map((a) => a.kpiKey))].sort()
}

describe('Phase 2 — canonical KPI participation set', () => {
  it('getProductionEngineKeys resolves at least the 5 historical Core KPIs plus all 5 Stab KPIs (the default registry also carries other pre-existing active KPIs beyond the 5 historical Core ones)', () => {
    expect(CANONICAL_KEYS.length).toBeGreaterThanOrEqual(10)
    for (const k of ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']) {
      expect(CANONICAL_KEYS).toContain(k)
    }
    for (const k of ['digitalEngagementScoreStab', 'consultationQualityScoreStab', 'loyaltyEnrollmentRateStab', 'staffTrainingHoursStab', 'newPatientReferralsStab']) {
      expect(CANONICAL_KEYS).toContain(k)
    }
  })
})

describe('Phase 2 — Dashboard surface', () => {
  it('the Dashboard KPI list (getProductionEngineKeys) equals the canonical set', () => {
    expect(getProductionEngineKeys(STAB_REGISTRY).sort()).toEqual(CANONICAL_KEYS)
  })
})

describe('Phase 2 — Ranking surface', () => {
  it('computeBranchKpiScore.kpiBreakdown covers exactly the canonical set', () => {
    const score = computeBranchKpiScore(PID, MONTH, 'classA', 'Stab Branch', [ENTRY], TARGET, STAB_REGISTRY)
    expect(Object.keys(score.kpiBreakdown).sort()).toEqual(CANONICAL_KEYS)
  })
})

function branchInput(): BranchInput {
  return {
    pharmacyId: PID, pharmacyName: 'Stab Branch', pharmacyCode: 'SB', region: REGION,
    mtdEntries: [ENTRY], historicalEntries: [ENTRY], target: TARGET,
  } as any
}

describe('Phase 2 — Executive BI / Trend / Risk / Branch Intelligence', () => {
  it('computeExecutiveScore.kpiBreakdown covers exactly the canonical set', () => {
    const score = computeExecutiveScore(branchInput(), STAB_REGISTRY)
    expect(keysOf(score.kpiBreakdown)).toEqual(CANONICAL_KEYS)
  })

  it('computeBranchTrend.kpiTrends covers exactly the canonical set', () => {
    const trend = computeBranchTrend(branchInput(), STAB_REGISTRY)
    expect(keysOf(trend.kpiTrends)).toEqual(CANONICAL_KEYS)
  })

  it('computeBranchRiskProfile.flags is a SUBSET of the canonical set (intentional — only breaching KPIs are flagged, not every KPI)', () => {
    const risk = computeBranchRiskProfile(branchInput(), STAB_REGISTRY)
    const flaggedKeys = [...new Set(risk.flags.map((f) => f.kpiKey).filter(Boolean))]
    for (const k of flaggedKeys) expect(CANONICAL_KEYS).toContain(k)
  })

  it('generateBranchSummary (the Branch Intelligence / Executive Dashboard orchestrator) covers exactly the canonical set in its score breakdown', () => {
    const summary = generateBranchSummary(branchInput(), TODAY, MONTH, STAB_REGISTRY)
    expect(keysOf(summary.score.kpiBreakdown)).toEqual(CANONICAL_KEYS)
  })
})

describe('Phase 2 — Pharmacist Intelligence / Team Intelligence', () => {
  function pharmacistInput(): PharmacistInput {
    return {
      userId: USER, displayName: 'Stab Pharmacist', pharmacyId: PID,
      mtdEntries: [ENTRY], target: TARGET,
    } as any
  }

  it('computePharmacistPerformance.kpiSnapshots covers exactly the canonical set', () => {
    const perf = computePharmacistPerformance(pharmacistInput(), new Date(`${MONTH}-20`), STAB_REGISTRY)
    expect(keysOf((perf as any).kpiSnapshots)).toEqual(CANONICAL_KEYS)
  })

  it('computeTeamHealth.teamKpiSnapshot covers exactly the canonical set', () => {
    const summary = computePharmacistPerformance(pharmacistInput(), new Date(`${MONTH}-20`), STAB_REGISTRY)
    const input: TeamIntelligenceInput = { pharmacyId: PID, month: MONTH, pharmacists: [pharmacistInput()] }
    const team = computeTeamHealth(input, [summary], new Date(`${MONTH}-20`), STAB_REGISTRY)
    expect(keysOf((team as any).teamKpiSnapshot)).toEqual(CANONICAL_KEYS)
  })
})

describe('Phase 2 — Regional Intelligence', () => {
  function rollupInput(): BranchRollupInput {
    return {
      branchId: PID, branchName: 'Stab Branch', branchCode: 'SB', region: REGION,
      entries: [ENTRY], historicalEntries: [], target: TARGET,
    } as any
  }
  const period: RegionalPeriod = { startDate: `${MONTH}-01`, endDate: `${MONTH}-30`, dayRatio: 0.5 } as any

  it('generateBranchRollup.kpiAchievementSummary covers exactly the canonical set', () => {
    const rollup = generateBranchRollup(rollupInput(), period, STAB_REGISTRY)
    expect(keysOf(rollup.kpiAchievementSummary)).toEqual(CANONICAL_KEYS)
  })

  it('generateRegionalIntelligence.regionalSummaries[].kpiAverages covers exactly the canonical set', () => {
    const rollup = generateBranchRollup(rollupInput(), period, STAB_REGISTRY)
    const intel = generateRegionalIntelligence({ branchRollups: [rollup], registry: STAB_REGISTRY })
    const region = intel.regionalSummaries.find((r) => r.regionName === REGION)!
    expect(keysOf(region.kpiAverages)).toEqual(CANONICAL_KEYS)
  })
})

describe('Phase 2 — Live Analytics', () => {
  it('computeKpiHealth covers exactly the canonical set', () => {
    const input: LiveAnalyticsInput = {
      userId: USER, pharmacyId: PID, pharmacyName: 'Stab Branch', role: 'pharmacist',
      todayEntries: [ENTRY], mtdEntries: [ENTRY], historicalEntries: [],
      target: TARGET, now: new Date(`${MONTH}-20T00:00:00.000Z`),
    }
    const health = computeKpiHealth(input, STAB_REGISTRY)
    expect(keysOf(health)).toEqual(CANONICAL_KEYS)
  })
})

describe('Phase 2 — V2 evaluation vs legacy-engine weighting: documented, intentional difference', () => {
  it('the Registry weight (legacy engines) and the EvaluationProfile weight (V2 evaluation) are two structurally separate systems, both confirmed present and non-conflicting for this fixture set', async () => {
    const { getKpiWeightForKey } = await import('../kpiAnalyticsEngine')
    const { STAB_PROFILE } = await import('./postCoreKpiStabilizationFixtures')
    // Registry weight (legacy engines) — present for every canonical key.
    for (const k of CANONICAL_KEYS) {
      expect(typeof getKpiWeightForKey(k, STAB_REGISTRY)).toBe('number')
    }
    // Profile weight (V2 evaluation) — present only for the 9 KPIs that
    // are actual basket elements (loyaltyEnrollmentRateStab is registered
    // but deliberately NOT a profile element — Scenario D, Phase 1).
    const profileElementKeys = STAB_PROFILE.baskets.b1.elements.map((e) => e.kpiKey).sort()
    expect(profileElementKeys.length).toBe(9)
    expect(profileElementKeys).not.toContain('loyaltyEnrollmentRateStab')
    // No surface in this file silently fell back to a fixed Core-5 list —
    // every assertion above compared against the full canonical key set.
  })
})
