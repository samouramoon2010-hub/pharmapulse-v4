// ============================================================
// PR-1I — Evaluation Compliance Regression Tests (V1 engine)
//
// Two approved business-rule compliance fixes for
// src/engine/evaluationEngine/evaluationEngine.ts (V1 production
// engine / V1 fallback):
//
//   Rule A — Missing-data exclusion + proportional weight
//            redistribution within a basket.
//   Rule B — Final score rounded to exactly 2 decimal places
//            at the official boundary (finalScore +
//            trace.normalizedFinalScorePct), raw precision
//            preserved separately in the trace.
//
// These tests are written BEFORE the fix and are expected to FAIL
// against the pre-fix implementation — see PR1I_TEST_EVIDENCE.md
// for the captured red run. After the fix lands, every test below
// must pass alongside the full pre-existing suite (er2aEngine.test.ts,
// achievementCap.test.ts, etc.) with no unexplained behavioural delta.
//
// Section 1 — Weight redistribution (12 cases)
// Section 2 — Final score rounding (10 cases)
// ============================================================

import { describe, it, expect } from 'vitest'
import { runEvaluation } from '../../engine/evaluationEngine/evaluationEngine'
import { roundToTwoDecimals } from '../evaluationShared/scoreRounding'
import type { EvaluationEngineInput } from '../../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket, BasketElement }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'

// ── Shared fixture helpers ─────────────────────────────────────

const THREE_BAND = {
  id: 'three-band', name: 'Three Band',
  bands: [
    { min: 0,  max: 70,  label: 'Below',  score: 1, color: '#dc2626' },
    { min: 70, max: 100, label: 'Meet',   score: 2, color: '#f59e0b' },
    { min: 100, max: 999, label: 'Exceed', score: 3, color: '#22c55e' },
  ],
}

const COMPOSITE_RULE = {
  id: 'composite', name: 'Composite',
  bands: [
    { min: 0,  max: 50,  label: 'SBelow',  score: 1 },
    { min: 50, max: 70,  label: 'Below',   score: 2 },
    { min: 70, max: 85,  label: 'Meet',    score: 3 },
    { min: 85, max: 95,  label: 'Exceed',  score: 4 },
    { min: 95, max: 101, label: 'SExceed', score: 5 },
  ],
}

function makeElement(
  kpiKey: string,
  weight: number,
  required = false,
  achievementCapPct?: number | null,
): BasketElement {
  return { kpiKey, weight, required, achievementCapPct }
}

function makeBasket(
  elements: BasketElement[],
  weight = 1.0,
  achievementCapPct?: number | null,
  thresholdRule = THREE_BAND,
): EvaluationBasket {
  return {
    id: 'b1', name: 'Test Basket', weight, elements,
    thresholdRule, sortOrder: 1, active: true, achievementCapPct,
  }
}

function makeProfile(
  baskets: Record<string, EvaluationBasket>,
  basketIds = Object.keys(baskets),
): EvaluationProfile {
  return {
    id: 'p1', name: 'Test Profile', version: 1, role: 'pharmacist',
    effectiveFrom: '2026-01', effectiveTo: null, status: 'published',
    basketIds, baskets,
    defaultThresholdRule: COMPOSITE_RULE,
    createdBy: null, createdAt: null, updatedAt: null,
    publishedAt: null, archivedAt: null, previousVersionId: null,
  }
}

function makeInput(
  profile: EvaluationProfile,
  actuals: Record<string, number>,
  targets: Record<string, number>,
): EvaluationEngineInput {
  const allKeys = new Set<string>()
  Object.values(profile.baskets).forEach((b) =>
    b.elements.forEach((el) => allKeys.add(el.kpiKey)))
  const branchTarget = { pharmacyId: 'ph1', month: '2026-06', ...targets } as any
  return {
    userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
    profile, kpiActuals: actuals, branchTarget,
    registry: Object.fromEntries(
      [...allKeys].map((k) => [k, { key: k, label: k, isActive: true, unit: 'units' }])
    ) as any,
  }
}

// ════════════════════════════════════════════════════════════════
// SECTION 1 — Weight redistribution on missing data (12 cases)
// ════════════════════════════════════════════════════════════════

describe('PR-1I Rule A — weight redistribution (1) one missing KPI redistributes proportionally', () => {
  it('weights 50/30/20%, C missing → applicable total 80%, A/B normalized to 62.5%/37.5%', () => {
    const basket = makeBasket([
      makeElement('a', 0.5),
      makeElement('b', 0.3),
      makeElement('c', 0.2),
    ])
    const profile = makeProfile({ b1: basket })
    // a: 80% achievement, b: 60% achievement, c: missing entirely
    const input = makeInput(profile, { a: 80, b: 60 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]

    // Redistributed: 80×(0.5/0.8) + 60×(0.3/0.8) = 80×0.625 + 60×0.375 = 50 + 22.5 = 72.5
    expect(b1.aggregateAchievementPct).toBeCloseTo(72.5, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (2) multiple missing KPIs redistribute correctly', () => {
  it('weights 40/30/20/10%, two missing → remaining 70% redistributed proportionally', () => {
    const basket = makeBasket([
      makeElement('a', 0.4),
      makeElement('b', 0.3),
      makeElement('c', 0.2),
      makeElement('d', 0.1),
    ])
    const profile = makeProfile({ b1: basket })
    // a: 90%, b: 50%; c and d missing
    const input = makeInput(profile, { a: 90, b: 50 }, { aTarget: 100, bTarget: 100, cTarget: 100, dTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]

    // applicable weight sum = 0.7; normalized a = 0.4/0.7, b = 0.3/0.7
    const expected = 90 * (0.4 / 0.7) + 50 * (0.3 / 0.7)
    expect(b1.aggregateAchievementPct).toBeCloseTo(expected, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (3) actual zero remains applicable, not redistributed', () => {
  it('element with actual=0 (real data) keeps its own weight in the denominator', () => {
    const basket = makeBasket([
      makeElement('a', 0.5),
      makeElement('b', 0.5),
    ])
    const profile = makeProfile({ b1: basket })
    // a: 0% achievement (real zero, target present), b: 80%
    const input = makeInput(profile, { a: 0, b: 80 }, { aTarget: 100, bTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    const aEl = b1.elements.find((e) => e.kpiKey === 'a')!

    expect(aEl.dataAvailable).toBe(true)
    // No redistribution: 0×0.5 + 80×0.5 = 40 (NOT 80, which is what a naive
    // "treat zero like missing" redistribution would incorrectly produce)
    expect(b1.aggregateAchievementPct).toBeCloseTo(40, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (4) blank/missing distinct from zero', () => {
  it('a missing element and a zero-achievement element produce different aggregates', () => {
    const basket = makeBasket([
      makeElement('a', 0.5),
      makeElement('b', 0.5),
    ])
    const profile = makeProfile({ b1: basket })

    const missingInput = makeInput(profile, { b: 80 }, { aTarget: 100, bTarget: 100 }) // a missing
    const zeroInput     = makeInput(profile, { a: 0, b: 80 }, { aTarget: 100, bTarget: 100 }) // a = 0

    const missingResult = runEvaluation(missingInput).basketResults[0]
    const zeroResult     = runEvaluation(zeroInput).basketResults[0]

    // missing → b's weight is redistributed to 100%: aggregate = 80
    expect(missingResult.aggregateAchievementPct).toBeCloseTo(80, 5)
    // zero → a stays applicable at 0%, no redistribution: aggregate = 0×0.5 + 80×0.5 = 40
    expect(zeroResult.aggregateAchievementPct).toBeCloseTo(40, 5)
    expect(missingResult.aggregateAchievementPct).not.toBeCloseTo(zeroResult.aggregateAchievementPct, 1)
  })
})

describe('PR-1I Rule A — weight redistribution (5) all KPIs missing returns no-data safely', () => {
  it('no applicable elements → aggregate = 0, no NaN, no divide-by-zero', () => {
    const basket = makeBasket([
      makeElement('a', 0.5),
      makeElement('b', 0.5),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, {}, { aTarget: 100, bTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]

    expect(isNaN(b1.aggregateAchievementPct)).toBe(false)
    expect(isFinite(b1.aggregateAchievementPct)).toBe(true)
    expect(b1.aggregateAchievementPct).toBe(0)
    expect(isNaN(result.finalScore)).toBe(false)
  })
})

describe('PR-1I Rule A — weight redistribution (6) capped KPI remains capped before/within weighted contribution', () => {
  it('cap is applied to the element BEFORE its (redistributed) weight is applied', () => {
    const basket = makeBasket([
      makeElement('a', 0.5, false, 130), // element cap 130%
      makeElement('b', 0.5),
    ])
    const profile = makeProfile({ b1: basket })
    // a: raw 200% (capped to 130%); b missing → full weight to a
    const input = makeInput(profile, { a: 200 }, { aTarget: 100, bTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    const aEl = b1.elements.find((e) => e.kpiKey === 'a')!

    expect(aEl.achievementPct).toBe(200)        // raw preserved
    expect(aEl.cappedAchievementPct).toBe(130)  // capped
    // b missing → a gets 100% of the applicable weight; aggregate uses the CAPPED value
    expect(b1.aggregateAchievementPct).toBeCloseTo(130, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (7) normalized weights sum to ~100% within float tolerance', () => {
  it('three applicable elements with uneven weights normalize to sum 1.0', () => {
    const basket = makeBasket([
      makeElement('a', 0.45),
      makeElement('b', 0.35),
      makeElement('c', 0.2),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { a: 100, b: 100, c: 100 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    // All applicable, all 100% achievement → aggregate must be exactly 100
    // regardless of how weights were internally normalized.
    expect(b1.aggregateAchievementPct).toBeCloseTo(100, 9)
  })
})

describe('PR-1I Rule A — weight redistribution (8) profile-driven custom weights redistribute correctly', () => {
  it('arbitrary non-round custom weights (e.g. 0.37/0.41/0.22) redistribute correctly when one is missing', () => {
    const basket = makeBasket([
      makeElement('a', 0.37),
      makeElement('b', 0.41),
      makeElement('c', 0.22),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { a: 60, b: 90 }, { aTarget: 100, bTarget: 100, cTarget: 100 }) // c missing
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    const applicableSum = 0.37 + 0.41
    const expected = 60 * (0.37 / applicableSum) + 90 * (0.41 / applicableSum)
    expect(b1.aggregateAchievementPct).toBeCloseTo(expected, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (9) inactive baskets remain fully excluded (regression safety)', () => {
  it('an inactive basket contributes nothing to finalScore — unaffected by the redistribution fix', () => {
    const activeBasket   = makeBasket([makeElement('a', 1.0)], 0.6)
    const inactiveBasket: EvaluationBasket = {
      id: 'b2', name: 'Inactive', weight: 0.4, active: false, sortOrder: 2,
      elements: [makeElement('z', 1.0)], thresholdRule: THREE_BAND,
    }
    const profile = makeProfile({ b1: activeBasket, b2: inactiveBasket }, ['b1', 'b2'])
    const input = makeInput(profile, { a: 100 }, { aTarget: 100, zTarget: 100 })
    const result = runEvaluation(input)

    expect(result.basketResults).toHaveLength(1)
    expect(result.basketResults[0].basketId).toBe('b1')
  })
})

describe('PR-1I Rule A — weight redistribution (10) mixed-origin actuals preserve applicability semantics', () => {
  it('an individual-level actual present + a branch-shared actual missing redistributes correctly', () => {
    // Engine reads only kpiActuals[engineKey]; the caller is responsible for
    // pre-aggregating branch-shared vs individual values into that single map.
    // This proves applicability is determined purely by data presence, not by
    // the conceptual source of the value.
    const basket = makeBasket([
      makeElement('individualKpi', 0.6),
      makeElement('branchSharedKpi', 0.4),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { individualKpi: 75 }, { individualKpiTarget: 100, branchSharedKpiTarget: 100 })
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    // branchSharedKpi missing → individualKpi gets 100% of applicable weight
    expect(b1.aggregateAchievementPct).toBeCloseTo(75, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (11) Wasfaty-style combined element unchanged when fully present', () => {
  it('wasfaty + a secondary guest-experience element both present → no redistribution, unchanged math', () => {
    const basket = makeBasket([
      makeElement('wasfaty', 0.7),
      makeElement('npsGuestExperience', 0.3),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile,
      { wasfaty: 75000, npsGuestExperience: 85 },
      { wasfatyTarget: 100000, npsGuestExperienceTarget: 100 },
    )
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    // wasfaty 75%, nps 85% — both applicable, no redistribution
    expect(b1.aggregateAchievementPct).toBeCloseTo(75 * 0.7 + 85 * 0.3, 5)
  })
})

describe('PR-1I Rule A — weight redistribution (12) OmniHealth-style sub-element redistributes only when missing', () => {
  it('omnihealth element missing data → its weight redistributes to the remaining sub-element', () => {
    const basket = makeBasket([
      makeElement('omnihealth', 0.5),
      makeElement('sales', 0.5),
    ])
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { sales: 60 }, { omnihealthTarget: 100, salesTarget: 100 }) // omnihealth missing
    const result = runEvaluation(input)
    const b1 = result.basketResults[0]
    expect(b1.aggregateAchievementPct).toBeCloseTo(60, 5) // 100% of applicable weight to sales
  })
})

// ════════════════════════════════════════════════════════════════
// SECTION 2 — Final score rounding to 2 decimal places (10 cases)
// ════════════════════════════════════════════════════════════════

function basketForFinalScore(weight: number): EvaluationBasket {
  return makeBasket([makeElement('a', 1.0)], weight)
}

// Fixture deliberately chosen so the RAW computation is NOT a clean decimal:
// weights 1/7, 2/7, 4/7 with band scores 1, 3, 3 →
//   raw finalScore            = 2.7142857142857144  → rounds to 2.71
//   raw normalizedFinalScorePct = 85.71428571428572 → rounds to 85.71
// (THREE_BAND: <70%→score1, 70–100%→score2, ≥100%→score3; minScore=1, maxScore=3)
function buildMessyFloatProfile(): EvaluationProfile {
  const b1: EvaluationBasket = { ...basketForFinalScore(1 / 7), id: 'b1', elements: [makeElement('a', 1.0)] }
  const b2: EvaluationBasket = { ...basketForFinalScore(2 / 7), id: 'b2', elements: [makeElement('b', 1.0)] }
  const b3: EvaluationBasket = { ...basketForFinalScore(4 / 7), id: 'b3', elements: [makeElement('c', 1.0)] }
  return makeProfile({ b1, b2, b3 }, ['b1', 'b2', 'b3'])
}
function buildMessyFloatInput(): EvaluationEngineInput {
  const profile = buildMessyFloatProfile()
  // a: 50% (→ band score 1, below 70%)
  // b: 120%, c: 150% (→ band score 3, at/above 100%)
  return makeInput(profile, { a: 50, b: 120, c: 150 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
}

describe('PR-1I Rule B — rounding (1) integer-equivalent result stays a clean 2-decimal value', () => {
  it('finalScore that lands on an integer band score is exactly X.00 (no float drift)', () => {
    const profile = makeProfile({ b1: basketForFinalScore(1.0) })
    const input = makeInput(profile, { a: 100 }, { aTarget: 100 }) // → band score 3
    const result = runEvaluation(input)
    expect(result.finalScore).toBe(3)
    expect(result.finalScore.toFixed(2)).toBe('3.00')
  })
})

describe('PR-1I Rule B — rounding (2) one-decimal result rounds correctly', () => {
  it('fractional basket weights producing one meaningful decimal place', () => {
    const b1 = basketForFinalScore(0.5)
    const b2: EvaluationBasket = { ...basketForFinalScore(0.5), id: 'b2', elements: [makeElement('b', 1.0)] }
    const profile = makeProfile({ b1, b2 }, ['b1', 'b2'])
    const input = makeInput(profile, { a: 100, b: 50 }, { aTarget: 100, bTarget: 100 }) // band 3 + band 1
    const result = runEvaluation(input)
    expect(result.finalScore).toBe(2)
  })
})

describe('PR-1I Rule B — rounding (3) long-tail raw float rounds to exactly 2 decimals', () => {
  it('weights 1/7, 2/7, 4/7 produce a raw value with 16+ decimal digits — must round to 2.71', () => {
    const result = runEvaluation(buildMessyFloatInput())
    // Pre-fix the engine returns the raw, unrounded 2.7142857142857144.
    // Post-fix it must return exactly 2.71.
    expect(result.finalScore).toBe(2.71)
    const decimals = (result.finalScore.toString().split('.')[1] ?? '').length
    expect(decimals).toBeLessThanOrEqual(2)
  })
})

describe('PR-1I Rule B — rounding (4) floating-point artifacts round deterministically', () => {
  it('roundToTwoDecimals fixes classic float artifacts', () => {
    expect(roundToTwoDecimals(89.999999999999)).toBe(90)
    expect(roundToTwoDecimals(74.5550001)).toBe(74.56)
    expect(roundToTwoDecimals(100.005)).toBeCloseTo(100.01, 2)
    expect(roundToTwoDecimals(1.005)).toBeCloseTo(1.01, 2)
  })
})

describe('PR-1I Rule B — rounding (5) value below cap rounds correctly', () => {
  it('an uncapped achievement value flows through to a correctly rounded finalScore', () => {
    const profile = makeProfile({ b1: basketForFinalScore(1.0) })
    const input = makeInput(profile, { a: 65 }, { aTarget: 100 }) // below cap, below-band
    const result = runEvaluation(input)
    expect(result.finalScore).toBe(roundToTwoDecimals(result.finalScore))
  })
})

describe('PR-1I Rule B — rounding (6) value at cap remains exact after rounding', () => {
  it('an element exactly at its cap is unaffected by the rounding step', () => {
    const basket = makeBasket([makeElement('a', 1.0, false, 130)], 1.0)
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { a: 130 }, { aTarget: 100 }) // exactly at cap
    const result = runEvaluation(input)
    const aEl = result.basketResults[0].elements[0]
    expect(aEl.cappedAchievementPct).toBe(130)
    expect(aEl.capApplied).toBe(false) // not clamped, exactly at the boundary
  })
})

describe('PR-1I Rule B — rounding (7) cap is applied before rounding, per existing engine order', () => {
  it('capping happens at element-score time; only the FINAL aggregate score is rounded', () => {
    const basket = makeBasket([makeElement('a', 1.0, false, 130)], 1.0)
    const profile = makeProfile({ b1: basket })
    const input = makeInput(profile, { a: 250 }, { aTarget: 100 }) // raw 250%, capped to 130%
    const result = runEvaluation(input)
    const aEl = result.basketResults[0].elements[0]
    // Intermediate element-level values stay full precision — never pre-rounded
    expect(aEl.cappedAchievementPct).toBe(130)
    expect(aEl.achievementPct).toBe(250)
  })
})

describe('PR-1I Rule B — rounding (8) persisted finalScore is a real two-decimal numeric value', () => {
  it('finalScore never carries more than 2 decimal digits of precision', () => {
    const result = runEvaluation(buildMessyFloatInput())
    const cents = Math.round(result.finalScore * 100)
    expect(Math.abs(result.finalScore * 100 - cents)).toBeLessThan(1e-9)
    expect(result.finalScore).toBe(2.71)
  })
})

describe('PR-1I Rule B — rounding (9) trace exposes the raw pre-rounding value distinctly from the official score', () => {
  it('trace.rawFinalScore (new, backward-compatible field) holds full precision; finalScore holds the rounded official value', () => {
    const result = runEvaluation(buildMessyFloatInput())

    const rawCandidate = (result.trace as { rawFinalScore?: number }).rawFinalScore
    expect(rawCandidate).toBeDefined()
    expect(rawCandidate).toBeCloseTo(2.7142857142857144, 10)
    expect(result.finalScore).toBe(2.71)
    expect(rawCandidate).not.toBe(result.finalScore)
  })
})

describe('PR-1I Rule B — rounding (10) ranking-relevant normalizedFinalScorePct is rounded', () => {
  it('trace.normalizedFinalScorePct (the value ranking-service.ts reads) is exactly 85.71, not the raw 85.71428571428572', () => {
    const result = runEvaluation(buildMessyFloatInput())
    expect(result.trace.normalizedFinalScorePct).toBe(85.71)
  })
})
