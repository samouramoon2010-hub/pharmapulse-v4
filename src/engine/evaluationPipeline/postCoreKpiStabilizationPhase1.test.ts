// ============================================================
// PharmaPulse Post-Core-KPI Stabilization & Final Foundation Closure
// Phase 1 — Production-Style Evaluation Smoke Tests
//
// Verifies the official V2 evaluation pipeline (legacy-band-score preset
// — the default V1-parity formula) computes the overall score strictly
// from the active EvaluationProfile's basket-element weights, with zero
// special treatment for the 5 historical Core KPIs.
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeBranchKpiScore } from '../../ranking/branch-kpi-engine'
import { computeBranchTrend } from '../executive/trendEngine'
import { computeBranchRiskProfile } from '../executive/riskEngine'
import { getProductionEngineKeys, getKpiWeightForKey } from '../kpiAnalyticsEngine'
import type { BranchInput } from '../executive/executiveTypes'
import {
  STAB_REGISTRY, STAB_PROFILE, STAB_TARGETS, runV2,
  DIGITAL, CONSULT, LOYALTY, TRAINING, NEW_REFERRAL,
} from './postCoreKpiStabilizationFixtures'

const PID   = 'branch-stab-p1'
const USER  = 'pharmacist-stab-p1'
const MONTH = '2025-07'

function elementOf(result: ReturnType<typeof runV2>['result'], kpiKey: string) {
  return result.basketResults[0].elements.find((e: any) => e.kpiKey === kpiKey)
}

const v2 = (actuals: Record<string, number>) => runV2(USER, PID, MONTH, actuals, STAB_TARGETS)

describe('Phase 1 — Scenario A: strong historical Core, weak everything else', () => {
  it('overall score reflects the weighted reality, not the strong Core KPIs', () => {
    const { result } = v2({
      wasfaty: 180, omni: 180, wellness: 180, basket: 180, crossSelling: 180,
      [DIGITAL]: 35, [CONSULT]: 35, [NEW_REFERRAL]: 35, [TRAINING]: 35,
    })
    // Core (0.25 weight) is at 180%, but the 0.75-weighted KPIs are at 35%.
    expect(result.basketResults[0].aggregateAchievementPct).toBeLessThan(90)
    expect(result.ratingScore).toBeLessThanOrEqual(2)
  })
})

describe('Phase 1 — Scenario B: weak historical Core, strong everything else', () => {
  it('the pharmacist receives credit per the active Profile weights', () => {
    const { result } = v2({
      wasfaty: 30, omni: 30, wellness: 30, basket: 30, crossSelling: 30,
      [DIGITAL]: 140, [CONSULT]: 140, [NEW_REFERRAL]: 140, [TRAINING]: 140,
    })
    expect(result.basketResults[0].aggregateAchievementPct).toBeGreaterThan(110)
    expect(result.ratingScore).toBeGreaterThanOrEqual(4)
  })
})

describe('Phase 1 — Scenario C: one high-performer with a very low weight among weaker, higher-weighted KPIs', () => {
  it('the low-weight KPI does not dominate the overall score', () => {
    const { result: extreme } = v2({
      wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 500,
      [DIGITAL]: 50, [CONSULT]: 50, [NEW_REFERRAL]: 50, [TRAINING]: 50,
    })
    const { result: baseline } = v2({
      wasfaty: 50, omni: 50, wellness: 50, basket: 50, crossSelling: 50,
      [DIGITAL]: 50, [CONSULT]: 50, [NEW_REFERRAL]: 50, [TRAINING]: 50,
    })
    const delta = extreme.basketResults[0].aggregateAchievementPct - baseline.basketResults[0].aggregateAchievementPct
    expect(delta).toBeLessThan(25)
    expect(extreme.ratingScore).toBe(baseline.ratingScore)
  })
})

describe('Phase 1 — Scenario D: KPI registered but NOT included in the active Profile', () => {
  it('loyaltyEnrollmentRateStab does not affect the score even though it is registered and active', () => {
    const common = {
      wasfaty: 90, omni: 90, wellness: 90, basket: 90, crossSelling: 90,
      [DIGITAL]: 90, [CONSULT]: 90, [NEW_REFERRAL]: 90, [TRAINING]: 90,
    }
    const { result: lowLoyalty }  = v2({ ...common, [LOYALTY]: 5 })
    const { result: highLoyalty } = v2({ ...common, [LOYALTY]: 999 })
    expect(lowLoyalty.finalScore).toBe(highLoyalty.finalScore)
    expect(lowLoyalty.basketResults[0].aggregateAchievementPct).toBe(highLoyalty.basketResults[0].aggregateAchievementPct)
    expect(elementOf(lowLoyalty, LOYALTY)).toBeUndefined()
  })

  it('it may still appear in a permitted display surface (registry-resolved engine keys) without affecting evaluation', () => {
    expect(getProductionEngineKeys(STAB_REGISTRY)).toContain(LOYALTY)
  })
})

describe('Phase 1 — Scenario E: KPI included in Profile with weight = 0', () => {
  it('staffTrainingHoursStab does not affect evaluation despite being a basket element', () => {
    const common = {
      wasfaty: 90, omni: 90, wellness: 90, basket: 90, crossSelling: 90,
      [DIGITAL]: 90, [CONSULT]: 90, [NEW_REFERRAL]: 90,
    }
    const { result: lowTraining }  = v2({ ...common, [TRAINING]: 1 })
    const { result: highTraining } = v2({ ...common, [TRAINING]: 999 })
    expect(lowTraining.finalScore).toBe(highTraining.finalScore)
    expect(elementOf(lowTraining, TRAINING)).toBeDefined()
    expect(elementOf(lowTraining, TRAINING)!.weight).toBe(0)
  })

  it('the Registry weight (the separate legacy-engine weighting system) also agrees this KPI is non-contributing', () => {
    expect(getKpiWeightForKey(TRAINING, STAB_REGISTRY)).toBe(0)
  })
})

describe('Phase 1 — Scenario F: brand-new arbitrary KPI with positive weight participates end-to-end', () => {
  it('newPatientReferralsStab moves the score, the ranking breakdown, the trend, and the risk profile — with zero source-code recognition', () => {
    const common = {
      wasfaty: 90, omni: 90, wellness: 90, basket: 90, crossSelling: 90,
      [DIGITAL]: 90, [CONSULT]: 90, [TRAINING]: 90,
    }
    const { result: weakReferral }   = v2({ ...common, [NEW_REFERRAL]: 20 })
    const { result: strongReferral } = v2({ ...common, [NEW_REFERRAL]: 200 })
    expect(strongReferral.finalScore).toBeGreaterThan(weakReferral.finalScore)
    expect(elementOf(weakReferral, NEW_REFERRAL)).toBeDefined()

    const el = elementOf(strongReferral, NEW_REFERRAL)!
    expect((el as any).cappedAchievementPct).toBe((el as any).achievementPct)

    expect(strongReferral.trace.profileSnapshotId).toBe(STAB_PROFILE.id)
    expect(strongReferral.trace.missingKpis).not.toContain(NEW_REFERRAL)

    const rankScore = computeBranchKpiScore(
      PID, MONTH, 'classA', 'Stab Branch',
      [{ userId: USER, pharmacyId: PID, date: `${MONTH}-15`, [NEW_REFERRAL]: 20 } as any],
      { pharmacyId: PID, month: MONTH, [`${NEW_REFERRAL}Target`]: 100 } as any,
      STAB_REGISTRY,
    )
    expect(rankScore.kpiBreakdown[NEW_REFERRAL as any]).toBeDefined()

    const branchInput: BranchInput = {
      pharmacyId: PID, pharmacyName: 'Stab Branch', pharmacyCode: 'SB', region: 'North',
      mtdEntries: [{ userId: USER, pharmacyId: PID, date: `${MONTH}-15`, [NEW_REFERRAL]: 20 } as any],
      historicalEntries: [],
      target: { pharmacyId: PID, month: MONTH, [`${NEW_REFERRAL}Target`]: 100 } as any,
    } as any
    const trend = computeBranchTrend(branchInput, STAB_REGISTRY)
    expect(trend.kpiTrends.some((t) => t.kpiKey === NEW_REFERRAL)).toBe(true)
    const risk = computeBranchRiskProfile({
      ...branchInput,
      target: { ...branchInput.target, [`${NEW_REFERRAL}Target`]: 1000 },
    }, STAB_REGISTRY)
    expect(risk.flags.some((f) => f.kpiKey === NEW_REFERRAL)).toBe(true)
  })

  it('the new KPI name appears nowhere in non-test pipeline/ranking/executive source', async () => {
    const sources = await Promise.all([
      import('./contextBuilder?raw').then((m) => m.default),
      import('./processors?raw').then((m) => m.default),
      import('../../ranking/branch-kpi-engine?raw').then((m) => m.default),
      import('../executive/trendEngine?raw').then((m) => m.default),
      import('../executive/riskEngine?raw').then((m) => m.default),
    ])
    for (const src of sources) {
      expect(src).not.toContain(NEW_REFERRAL)
      expect(src).not.toContain('New Patient Referrals')
    }
  })
})
