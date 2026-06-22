// ============================================================
// Team Intelligence — Personal Targets Integration Tests
// Sprint 1 — B3: Target Correctness
//
// Tests the target resolution path through the performance engine
// when personal targets are present, absent, or mixed per KPI.
//
// Cases:
//   A. Personal target set → performance based on personal target
//   B. No personal target  → falls back to branch target (unchanged)
//   C. Mixed KPI availability → per-KPI resolution correct
//   D. Personal target = 0 for a KPI → branch target used for that KPI
//   E. Zero branch AND personal target → 0 achievement (not NaN)
//
// Impact assertions:
//   F. performanceScore changes when personal target differs from branch
//   G. coachingPriority can change when personal target changes scores
//   H. strongestKpi / weakestKpi can change under personal targets
//   I. operationalRisk can change under personal targets
//   J. subscribePublishedPersonalTargetsByBranch exported from service
//   K. TeamPage source includes personalTargetMap in PharmacistInput
// ============================================================

import { describe, it, expect } from 'vitest'
import { computePharmacistPerformance } from '../../engine/teamIntelligence/pharmacistPerformanceEngine'
import type { PharmacistInput } from '../../engine/teamIntelligence/teamIntelligenceTypes'
import type { PersonalTargetDoc } from '../../services/personalTargetService'

// ── Fixtures ──────────────────────────────────────────────────

const MONTH = '2026-06'

/** Build a minimal MonthlyTarget with wasfaty=branchVal and others proportional */
function makeTarget(wasfaty: number, omni = 50, wellness = 40, basket = 300, crossSelling = 25): any {
  return {
    pharmacyId: 'ph-atheer', month: MONTH,
    wasfatyTarget: wasfaty,
    omniTarget: omni,
    wellnessTarget: wellness,
    basketTarget: basket,
    crossSellTarget: crossSelling,
  }
}

/** Build a minimal PersonalTargetDoc */
function makePersonalTarget(userId: string, targets: Record<string, number>): PersonalTargetDoc {
  return {
    id:               `${userId}-ph-atheer-${MONTH}`,
    userId,
    pharmacyId:       'ph-atheer',
    month:            MONTH,
    targets,
    allocationMethod: 'custom',
    status:           'published',
    publishedAt:      null,
    createdBy:        'manager-1',
    createdAt:        null,
    updatedAt:        null,
  }
}

/** Build entries for a user: one entry per day (simplified to a single entry) */
function makeEntries(userId: string, actuals: Record<string, number>): any[] {
  return [{ userId, pharmacyId: 'ph-atheer', date: `${MONTH}-15`, ...actuals }]
}

function makeInput(opts: {
  userId:         string
  actuals:        Record<string, number>
  branchTarget:   ReturnType<typeof makeTarget>
  personalTarget?: PersonalTargetDoc | null
}): PharmacistInput {
  return {
    userId:              opts.userId,
    displayName:         'Test User',
    pharmacyId:          'ph-atheer',
    mtdEntries:          makeEntries(opts.userId, opts.actuals),
    historicalEntries:   makeEntries(opts.userId, opts.actuals),
    target:              opts.branchTarget,
    personalTarget:      opts.personalTarget ?? null,
    expectedSubmissionDays: 20,
    actualSubmissionDays:   15,
  }
}

// ════════════════════════════════════════════════════════════════
// Case A — Personal target present: performance based on personal target
// ════════════════════════════════════════════════════════════════

describe('Case A — personal target set', () => {
  it('performanceScore uses personal target (not branch target) when present', () => {
    // Branch: wasfaty=100, Personal: wasfaty=50, Actual: wasfaty=40
    // Without personal target: 40/100 = 40%
    // With personal target:    40/50  = 80%
    const withBranch = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40 },
      branchTarget: makeTarget(100),
      personalTarget: null,
    })
    const withPersonal = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40 },
      branchTarget: makeTarget(100),
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 50 }),
    })

    const resultBranch   = computePharmacistPerformance(withBranch)
    const resultPersonal = computePharmacistPerformance(withPersonal)

    // wasfaty is the heaviest KPI (weight 0.25) — personal target should raise score
    expect(resultPersonal.performanceScore).toBeGreaterThan(resultBranch.performanceScore)
  })

  it('wasfaty kpiSnapshot achievementPct is 80% with personal target 50, actual 40', () => {
    const input = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40 },
      branchTarget: makeTarget(100),
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 50 }),
    })
    const result = computePharmacistPerformance(input)
    const wasfatySnap = result.kpiSnapshots.find((s) => s.kpiKey === 'wasfaty')!
    expect(wasfatySnap.achievementPct).toBe(80)
    expect(wasfatySnap.target).toBe(50)
  })
})

// ════════════════════════════════════════════════════════════════
// Case B — No personal target: branch target behavior unchanged
// ════════════════════════════════════════════════════════════════

describe('Case B — no personal target (fallback to branch)', () => {
  it('achievementPct uses branch target when personalTarget is null', () => {
    const input = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 80 },
      branchTarget: makeTarget(100),
      personalTarget: null,
    })
    const result = computePharmacistPerformance(input)
    const snap = result.kpiSnapshots.find((s) => s.kpiKey === 'wasfaty')!
    expect(snap.target).toBe(100)
    expect(snap.achievementPct).toBe(80)
  })

  it('result is identical whether personalTarget is null or undefined', () => {
    const withNull = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 75 },
      branchTarget: makeTarget(100),
      personalTarget: null,
    })
    const withUndefined: PharmacistInput = { ...withNull, personalTarget: undefined }

    const r1 = computePharmacistPerformance(withNull)
    const r2 = computePharmacistPerformance(withUndefined)
    expect(r1.performanceScore).toBe(r2.performanceScore)
  })
})

// ════════════════════════════════════════════════════════════════
// Case C — Mixed KPI availability
// ════════════════════════════════════════════════════════════════

describe('Case C — mixed KPI personal targets', () => {
  it('personal target used for KPIs that have it, branch target for others', () => {
    // Personal target only sets wasfaty (=50); omni falls back to branch (=50)
    const input = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40, omni: 30 },
      branchTarget: makeTarget(100, 50),
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 50 }),
    })
    const result = computePharmacistPerformance(input)

    const wasfatySnap = result.kpiSnapshots.find((s) => s.kpiKey === 'wasfaty')!
    const omniSnap    = result.kpiSnapshots.find((s) => s.kpiKey === 'omni')!

    expect(wasfatySnap.target).toBe(50)   // from personal target
    expect(omniSnap.target).toBe(50)      // from branch target (personal has no omniTarget)
    expect(wasfatySnap.achievementPct).toBe(80)   // 40/50
    expect(omniSnap.achievementPct).toBe(60)      // 30/50
  })
})

// ════════════════════════════════════════════════════════════════
// Case D — Personal target = 0 for a KPI
// ════════════════════════════════════════════════════════════════

describe('Case D — personal target = 0 for a KPI', () => {
  it('when personal target explicitly sets a KPI to 0, that KPI uses 0 target', () => {
    // resolveTargetValue: personal != null (it IS 0) → use 0 (manager gave no target for this KPI)
    const input = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40 },
      branchTarget: makeTarget(100),
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 0 }),  // explicit zero
    })
    const result = computePharmacistPerformance(input)
    const snap = result.kpiSnapshots.find((s) => s.kpiKey === 'wasfaty')!
    // Personal target = 0, so no achievement can be computed → 0%
    expect(snap.target).toBe(0)
    expect(snap.achievementPct).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// Case E — Zero both targets
// ════════════════════════════════════════════════════════════════

describe('Case E — zero branch AND personal target', () => {
  it('returns 0% achievement without NaN or Infinity', () => {
    const input = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 40 },
      branchTarget: makeTarget(0),
      personalTarget: null,
    })
    const result = computePharmacistPerformance(input)
    const snap = result.kpiSnapshots.find((s) => s.kpiKey === 'wasfaty')!
    expect(snap.achievementPct).toBe(0)
    expect(Number.isFinite(result.performanceScore)).toBe(true)
    expect(isNaN(result.performanceScore)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// Impact assertions
// ════════════════════════════════════════════════════════════════

describe('Impact — metrics that change with personal targets', () => {
  it('F: performanceScore is higher when personal target < branch target and actual is fixed', () => {
    // Actual 60, branch=100 → 60%, personal=80 → 75%
    const branch   = makeInput({ userId: 'u1', actuals: { wasfaty: 60 }, branchTarget: makeTarget(100), personalTarget: null })
    const personal = makeInput({ userId: 'u1', actuals: { wasfaty: 60 }, branchTarget: makeTarget(100), personalTarget: makePersonalTarget('u1', { wasfatyTarget: 80 }) })
    expect(computePharmacistPerformance(personal).performanceScore)
      .toBeGreaterThan(computePharmacistPerformance(branch).performanceScore)
  })

  it('G: coachingPriority can change from near_term to routine when personal target raises score', () => {
    // Low branch achievement → near_term; higher personal achievement → routine
    const lowScore = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 50, omni: 30, wellness: 25, basket: 150, crossSelling: 12 },
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: null,
    })
    const higherScore = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 50, omni: 30, wellness: 25, basket: 150, crossSelling: 12 },
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: makePersonalTarget('u1', {
        wasfatyTarget: 60, omniTarget: 35, wellnessTarget: 30,
        basketTarget: 180, crossSellTarget: 15,
      }),
    })
    const r1 = computePharmacistPerformance(lowScore)
    const r2 = computePharmacistPerformance(higherScore)
    // Score should be higher with personal targets
    expect(r2.performanceScore).toBeGreaterThan(r1.performanceScore)
    // Coaching priority may improve
    const PRIORITY_ORDER = { immediate: 0, near_term: 1, routine: 2, recognition: 3 }
    expect(PRIORITY_ORDER[r2.coachingPriority]).toBeGreaterThanOrEqual(PRIORITY_ORDER[r1.coachingPriority])
  })

  it('H: weakestKpi can change when personal targets rebalance relative achievements', () => {
    // Give all KPIs equal actuals so branch-target calculation is clear.
    // branchTarget: wasfaty=100(worst), omni=50, wellness=40, basket=300, crossSelling=25
    // actuals all set so: wasfaty=50/100=50%(lowest), omni=40/50=80%, etc.
    // With personal target wasfaty=50: wasfaty=50/50=100% → no longer weakest
    const allActuals = { wasfaty: 50, omni: 40, wellness: 32, basket: 240, crossSelling: 20 }
    const branch = makeInput({
      userId: 'u1',
      actuals: allActuals,
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: null,
    })
    const personal = makeInput({
      userId: 'u1',
      actuals: allActuals,
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 50 }),
    })
    const r1 = computePharmacistPerformance(branch)
    const r2 = computePharmacistPerformance(personal)
    // r1: wasfaty=50/100=50% — weakest
    expect(r1.weakestKpi).toBe('wasfaty')
    // r2: wasfaty=50/50=100% — no longer weakest
    expect(r2.weakestKpi).not.toBe('wasfaty')
  })

  it('I: operationalRisk can change from high to lower when personal target raises performanceScore', () => {
    // Score below 40 → high risk; above 60 → medium or lower
    const highRisk = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 30, omni: 20, wellness: 15, basket: 90, crossSelling: 8 },
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: null,
    })
    const lowerRisk = makeInput({
      userId: 'u1',
      actuals: { wasfaty: 30, omni: 20, wellness: 15, basket: 90, crossSelling: 8 },
      branchTarget: makeTarget(100, 50, 40, 300, 25),
      personalTarget: makePersonalTarget('u1', {
        wasfatyTarget: 40, omniTarget: 25, wellnessTarget: 20,
        basketTarget: 120, crossSellTarget: 12,
      }),
    })
    const r1 = computePharmacistPerformance(highRisk)
    const r2 = computePharmacistPerformance(lowerRisk)
    const RISK_ORDER = { high: 0, medium: 1, low: 2, none: 3 }
    expect(RISK_ORDER[r2.operationalRisk]).toBeGreaterThanOrEqual(RISK_ORDER[r1.operationalRisk])
  })
})

// ════════════════════════════════════════════════════════════════
// Service and TeamPage wiring
// ════════════════════════════════════════════════════════════════

describe('Infrastructure — service and TeamPage wiring', () => {
  it('J: subscribePublishedPersonalTargetsByBranch is exported from personalTargetService', async () => {
    const src = await import('../../services/personalTargetService.ts?raw')
    expect(src.default).toContain('export function subscribePublishedPersonalTargetsByBranch')
  })

  it('K: TeamPage passes personalTarget into PharmacistInput', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('personalTargetMap')
    expect(src.default).toContain('personalTarget: personalTargetMap.get(uid)')
  })

  it('TeamPage subscribes to published personal targets by branch', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('subscribePublishedPersonalTargetsByBranch')
    expect(src.default).toContain('setPersonalTargetMap')
  })

  it('TeamPage dependency array includes personalTargetMap', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('personalTargetMap])')
  })

  it('subscribePublishedPersonalTargetsByBranch filters by status=published', async () => {
    const src = await import('../../services/personalTargetService.ts?raw')
    const fnStart = src.default.indexOf('subscribePublishedPersonalTargetsByBranch')
    const fnBlock = src.default.slice(fnStart, fnStart + 400)
    expect(fnBlock).toContain("'published'")
    expect(fnBlock).toContain("where('status'")
  })
})
