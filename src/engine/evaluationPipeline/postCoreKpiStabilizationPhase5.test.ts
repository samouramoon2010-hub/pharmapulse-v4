// ============================================================
// PharmaPulse Post-Core-KPI Stabilization & Final Foundation Closure
// Phase 5 — Realistic Data Review Pack
//
// 5 pharmacists across 2 branches, 10 KPIs (5 historical Core + 5
// arbitrary/Stab), mixed weights, 1 zero-weight KPI
// (staffTrainingHoursStab), 1 Registry-only/non-Profile KPI
// (loyaltyEnrollmentRateStab). Produces a per-pharmacist breakdown
// (actual, target, achievement, effective weight, weighted contribution,
// overall score, band, ranking position, strengths, risks) and verifies
// no pharmacist with strong historical Core + weak remaining weighted
// KPIs is misclassified as high-performing.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  runV2, STAB_REGISTRY, STAB_TARGETS, DIGITAL, CONSULT, NEW_REFERRAL, TRAINING, LOYALTY,
} from './postCoreKpiStabilizationFixtures'
import { computeBranchRiskProfile } from '../executive/riskEngine'
import type { BranchInput } from '../executive/executiveTypes'

const MONTH = new Date().toISOString().slice(0, 7)
const TODAY = `${MONTH}-15`

interface PharmacistScenario {
  userId: string
  displayName: string
  branchId: string
  branchName: string
  actuals: Record<string, number>
}

const PHARMACISTS: PharmacistScenario[] = [
  {
    userId: 'p5-u1', displayName: 'Ahmed (strong Core, weak weighted-other)', branchId: 'p5-branch-A', branchName: 'Branch A',
    actuals: {
      wasfaty: 170, omni: 170, wellness: 170, basket: 170, crossSelling: 170,
      [DIGITAL]: 30, [CONSULT]: 30, [NEW_REFERRAL]: 30, [TRAINING]: 30,
    },
  },
  {
    userId: 'p5-u2', displayName: 'Sara (balanced, strong everywhere)', branchId: 'p5-branch-A', branchName: 'Branch A',
    actuals: {
      wasfaty: 110, omni: 110, wellness: 110, basket: 110, crossSelling: 110,
      [DIGITAL]: 130, [CONSULT]: 130, [NEW_REFERRAL]: 130, [TRAINING]: 130,
    },
  },
  {
    userId: 'p5-u3', displayName: 'Mona (weak Core, strong weighted-other)', branchId: 'p5-branch-A', branchName: 'Branch A',
    actuals: {
      wasfaty: 35, omni: 35, wellness: 35, basket: 35, crossSelling: 35,
      [DIGITAL]: 145, [CONSULT]: 145, [NEW_REFERRAL]: 145, [TRAINING]: 145,
    },
  },
  {
    userId: 'p5-u4', displayName: 'Khalid (average across the board)', branchId: 'p5-branch-B', branchName: 'Branch B',
    actuals: {
      wasfaty: 90, omni: 90, wellness: 90, basket: 90, crossSelling: 90,
      [DIGITAL]: 90, [CONSULT]: 90, [NEW_REFERRAL]: 90, [TRAINING]: 90,
    },
  },
  {
    userId: 'p5-u5', displayName: 'Layla (new-referral star)', branchId: 'p5-branch-B', branchName: 'Branch B',
    actuals: {
      wasfaty: 80, omni: 80, wellness: 80, basket: 80, crossSelling: 80,
      [DIGITAL]: 80, [CONSULT]: 80, [NEW_REFERRAL]: 190, [TRAINING]: 80,
    },
  },
]

interface PharmacistReportRow {
  userId: string
  displayName: string
  branchName: string
  finalScore: number
  ratingLabel: string
  ratingScore: number
  kpis: Array<{
    kpiKey: string
    actual: number
    target: number
    achievementPct: number
    weight: number
    weightedContribution: number
  }>
  strengths: string[]
  risks: string[]
  rankPosition?: number
}

function buildReport(p: PharmacistScenario): PharmacistReportRow {
  const { result } = runV2(p.userId, p.branchId, MONTH, p.actuals, STAB_TARGETS)
  const kpis = result.basketResults[0].elements.map((e: any) => ({
    kpiKey: e.kpiKey,
    actual: e.actual,
    target: e.target,
    achievementPct: e.achievementPct ?? 0,
    weight: e.weight,
    weightedContribution: (e.cappedAchievementPct ?? e.achievementPct ?? 0) * e.weight,
  }))
  const sorted = [...kpis].sort((a, b) => b.achievementPct - a.achievementPct)
  const strengths = sorted.filter((k) => k.weight > 0).slice(0, 2).map((k) => k.kpiKey)
  const risks = sorted.filter((k) => k.weight > 0).slice(-2).map((k) => k.kpiKey)
  return {
    userId: p.userId, displayName: p.displayName, branchName: p.branchName,
    finalScore: result.finalScore, ratingLabel: (result as any).rating, ratingScore: result.ratingScore,
    kpis, strengths, risks,
  }
}

describe('Phase 5 — Realistic data review pack', () => {
  const report = PHARMACISTS.map(buildReport)
  const ranked = [...report].sort((a, b) => b.finalScore - a.finalScore)
  ranked.forEach((r, i) => { r.rankPosition = i + 1 })

  it('produces a complete per-pharmacist breakdown for all required fields', () => {
    for (const row of report) {
      expect(row.kpis.length).toBeGreaterThanOrEqual(8) // every basket element
      expect(row.finalScore).toBeGreaterThanOrEqual(0)
      expect(row.ratingLabel).toBeTruthy()
      expect(row.strengths.length).toBeGreaterThan(0)
      expect(row.risks.length).toBeGreaterThan(0)
      const ranked = report.find((r) => r.userId === row.userId)
      expect(ranked).toBeDefined()
    }
    // Print the review pack for human inspection.
    // eslint-disable-next-line no-console
    console.log('\n=== Phase 5 — Realistic Data Review Pack ===')
    for (const r of ranked) {
      console.log(
        `#${r.rankPosition} ${r.displayName} [${r.branchName}] — score=${r.finalScore.toFixed(2)} `
        + `band=${r.ratingLabel}(${r.ratingScore}) strengths=${r.strengths.join(',')} risks=${r.risks.join(',')}`,
      )
    }
  })

  it('DECISIVE CHECK: the pharmacist with strong historical Core + weak remaining weighted KPIs is NOT misclassified as high-performing', () => {
    const ahmed = report.find((r) => r.userId === 'p5-u1')!
    const sara  = report.find((r) => r.userId === 'p5-u2')!
    const mona  = report.find((r) => r.userId === 'p5-u3')!

    // Ahmed has the highest historical-Core achievement of anyone (170%)
    // but the weakest weighted-other achievement (30%) — he must rank
    // BELOW both Sara (balanced-strong) and Mona (weak-Core but
    // strong-weighted-other), proving no Core bias remains.
    expect(ahmed.finalScore).toBeLessThan(sara.finalScore)
    expect(ahmed.finalScore).toBeLessThan(mona.finalScore)
    expect(ahmed.rankPosition!).toBeGreaterThan(sara.rankPosition!)
    expect(ahmed.rankPosition!).toBeGreaterThan(mona.rankPosition!)
    // And Ahmed must not be rated "Outstanding"/"Exceed" despite the
    // eye-catching 170% Core numbers.
    expect(['Critical', 'Below', 'Meet']).toContain(ahmed.ratingLabel)
  })

  it('Mona (weak Core, strong weighted-other) receives credit per the active Profile weights, not penalized for weak Core', () => {
    const mona = report.find((r) => r.userId === 'p5-u3')!
    expect(['Exceed', 'Outstanding']).toContain(mona.ratingLabel)
  })

  it('the zero-weight KPI (staffTrainingHoursStab) never appears as a "strength" or "risk" driver for any pharmacist', () => {
    for (const row of report) {
      expect(row.strengths).not.toContain(TRAINING)
      expect(row.risks).not.toContain(TRAINING)
    }
  })

  it('the Registry-only, non-Profile KPI (loyaltyEnrollmentRateStab) never appears in any pharmacist\'s evaluation breakdown', () => {
    for (const row of report) {
      expect(row.kpis.some((k) => k.kpiKey === LOYALTY)).toBe(false)
    }
  })

  it('risk classification (Branch-level, registry-driven) is also consistent with the weighted reality for the bias-check pharmacist', () => {
    const ahmedActuals = PHARMACISTS.find((p) => p.userId === 'p5-u1')!.actuals
    const branchInput: BranchInput = {
      pharmacyId: 'p5-branch-A', pharmacyName: 'Branch A', pharmacyCode: 'BA', region: 'North',
      mtdEntries: [{ userId: 'p5-u1', pharmacyId: 'p5-branch-A', date: TODAY, ...ahmedActuals }] as any,
      historicalEntries: [],
      target: { pharmacyId: 'p5-branch-A', month: MONTH, ...STAB_TARGETS } as any,
    } as any
    const risk = computeBranchRiskProfile(branchInput, STAB_REGISTRY)
    // The weighted-other KPIs (digital/consult/newReferral) are at 30% —
    // well below target — so the risk engine must flag at least one of
    // them, even though wasfaty/omni/etc. are at 170%.
    const flaggedWeak = risk.flags.some((f) => [DIGITAL, CONSULT, NEW_REFERRAL].includes(f.kpiKey as any))
    expect(flaggedWeak).toBe(true)
  })
})
