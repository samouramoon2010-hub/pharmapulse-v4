// ============================================================
// Evaluation Engine — Achievement Cap Tests (Phase 1)
//
// Business rule:
//   Profile defines an optional achievementCapPct on BasketElement
//   and/or EvaluationBasket.
//   When set, raw achievement is clamped before threshold matching
//   and basket aggregation.
//   Raw achievementPct is always preserved for reporting.
//
// Cap precedence:
//   element-level achievementCapPct  > basket-level achievementCapPct > uncapped
//
// Covers:
//   1.  No cap → existing behaviour unchanged (backwards-compatible)
//   2.  Element cap limits contribution
//   3.  Basket cap applies when no element cap
//   4.  Element cap overrides basket cap
//   5.  Raw achievementPct preserved when cap applied
//   6.  cappedAchievementPct used in basket aggregate (not raw)
//   7.  cappedKpis trace populated with correct fields
//   8.  capApplied = false when achievement ≤ cap
//   9.  capApplied = false when no cap configured
//  10.  Multiple elements: only the one that exceeds cap appears in cappedKpis
//  11.  Basket-level cap trace source = 'basket'
//  12.  Element-level cap trace source = 'element'
//  13.  Cap at 0 is treated as no cap (guard against accidental zero)
//  14.  cappedKpis is empty when no elements breach their cap
// ============================================================

import { describe, it, expect } from 'vitest'
import { runEvaluation } from '../../engine/evaluationEngine/evaluationEngine'
import type { EvaluationEngineInput } from '../../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket, BasketElement }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'

// ── Fixture helpers ───────────────────────────────────────────

const FIVE_BAND = {
  id: 'five-band', name: 'Five Band',
  bands: [
    { min: 0,   max: 70,  label: 'Below',   score: 1, color: '#dc2626' },
    { min: 70,  max: 90,  label: 'Near',    score: 2, color: '#ef4444' },
    { min: 90,  max: 100, label: 'Meet',    score: 3, color: '#f59e0b' },
    { min: 100, max: 115, label: 'Exceed',  score: 4, color: '#22c55e' },
    { min: 115, max: 999, label: 'SExceed', score: 5, color: '#16a34a' },
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
  weight = 1.0,
  required = true,
  achievementCapPct?: number | null,
): BasketElement {
  return { kpiKey, weight, required, achievementCapPct }
}

function makeBasket(
  elements: BasketElement[],
  weight = 1.0,
  achievementCapPct?: number | null,
): EvaluationBasket {
  return {
    id: 'b1', name: 'Test Basket', weight, elements,
    thresholdRule: FIVE_BAND, sortOrder: 1, active: true,
    achievementCapPct,
  }
}

function makeProfile(basket: EvaluationBasket): EvaluationProfile {
  return {
    id: 'p1', name: 'Test Profile', version: 1, role: 'pharmacist',
    effectiveFrom: '2026-01', effectiveTo: null, status: 'published',
    basketIds: ['b1'], baskets: { b1: basket },
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
  const branchTarget = { pharmacyId: 'ph1', month: '2026-06', ...targets } as any
  return {
    userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
    profile, kpiActuals: actuals, branchTarget,
    registry: Object.fromEntries(
      Object.keys(actuals).map((k) => [k, { key: k, label: k, isActive: true, unit: 'units' }])
    ) as any,
  }
}

// ── Tests ─────────────────────────────────────────────────────

describe('Achievement cap — backwards compatibility', () => {
  it('no cap on element or basket → achievementPct = cappedAchievementPct', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    expect(el.achievementPct).toBe(200)
    expect(el.cappedAchievementPct).toBe(200)
    expect(el.capApplied).toBe(false)
    expect(el.capPct).toBeNull()
  })

  it('no cap → cappedKpis trace is empty', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    expect(result.trace.cappedKpis).toHaveLength(0)
  })

  it('no cap → basket aggregate unchanged from prior behaviour', () => {
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 0.6),
      makeElement('omni',    0.4),
    ]))
    const input = makeInput(profile,
      { wasfaty: 150, omni: 80 },
      { wasfatyTarget: 100, omniTarget: 100 },
    )
    const result = runEvaluation(input)
    const basket = result.basketResults[0]
    // 150% × 0.6 + 80% × 0.4 = 90 + 32 = 122 — same as old weighted avg behaviour
    expect(basket.aggregateAchievementPct).toBe(122)
  })
})

describe('Achievement cap — element-level cap', () => {
  it('element cap limits cappedAchievementPct but raw achievementPct is preserved', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 130)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    expect(el.achievementPct).toBe(200)       // raw preserved
    expect(el.cappedAchievementPct).toBe(130)  // capped
    expect(el.capApplied).toBe(true)
    expect(el.capPct).toBe(130)
  })

  it('element cap affects basket aggregate (uses cappedAchievementPct, not raw)', () => {
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 0.6, true, 130),  // actual 200%, capped 130%
      makeElement('omni',    0.4),              // actual 80%, no cap
    ]))
    const input = makeInput(profile,
      { wasfaty: 200, omni: 80 },
      { wasfatyTarget: 100, omniTarget: 100 },
    )
    const result = runEvaluation(input)
    const basket = result.basketResults[0]
    // 130% × 0.6 + 80% × 0.4 = 78 + 32 = 110
    expect(basket.aggregateAchievementPct).toBe(110)
  })

  it('capApplied = false when achievement does not reach the cap', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 150)]))
    const input   = makeInput(profile, { wasfaty: 120 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    expect(el.achievementPct).toBe(120)
    expect(el.cappedAchievementPct).toBe(120)  // below cap → unchanged
    expect(el.capApplied).toBe(false)
  })

  it('element cap trace source is "element"', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 130)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    expect(result.trace.cappedKpis).toHaveLength(1)
    expect(result.trace.cappedKpis[0].source).toBe('element')
    expect(result.trace.cappedKpis[0].capPct).toBe(130)
    expect(result.trace.cappedKpis[0].actualAchievementPct).toBe(200)
    expect(result.trace.cappedKpis[0].cappedAchievementPct).toBe(130)
    expect(result.trace.cappedKpis[0].kpiKey).toBe('wasfaty')
  })
})

describe('Achievement cap — basket-level cap', () => {
  it('basket cap applies to element when no element-level cap', () => {
    // basket cap = 140, no element cap
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0)], 1.0, 140))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    expect(el.cappedAchievementPct).toBe(140)
    expect(el.capApplied).toBe(true)
    expect(el.capPct).toBe(140)
  })

  it('basket cap trace source is "basket"', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0)], 1.0, 140))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    expect(result.trace.cappedKpis[0].source).toBe('basket')
  })

  it('basket cap affects aggregate for all uncapped elements', () => {
    // basket cap = 110; both elements exceed it
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 0.5),
      makeElement('omni',    0.5),
    ], 1.0, 110))
    const input = makeInput(profile,
      { wasfaty: 200, omni: 150 },
      { wasfatyTarget: 100, omniTarget: 100 },
    )
    const result = runEvaluation(input)
    const basket = result.basketResults[0]
    // Both capped to 110: 110×0.5 + 110×0.5 = 110
    expect(basket.aggregateAchievementPct).toBe(110)
    expect(result.trace.cappedKpis).toHaveLength(2)
  })
})

describe('Achievement cap — element cap overrides basket cap', () => {
  it('element cap = 120 overrides basket cap = 150', () => {
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 1.0, true, 120),  // element cap = 120
    ], 1.0, 150))   // basket cap = 150
    const input = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    // Element cap takes precedence → capped at 120, not 150
    expect(el.cappedAchievementPct).toBe(120)
    expect(el.capPct).toBe(120)
  })

  it('mixed: one element has own cap, another uses basket cap', () => {
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 0.5, true, 120),  // own cap = 120
      makeElement('omni',    0.5),              // no element cap → uses basket cap
    ], 1.0, 140))   // basket cap = 140
    const input = makeInput(profile,
      { wasfaty: 200, omni: 200 },
      { wasfatyTarget: 100, omniTarget: 100 },
    )
    const result = runEvaluation(input)
    const basket = result.basketResults[0]
    const [wasfatyEl, omniEl] = basket.elements

    expect(wasfatyEl.cappedAchievementPct).toBe(120)   // element cap
    expect(omniEl.cappedAchievementPct).toBe(140)       // basket cap fallback
    // aggregate: 120×0.5 + 140×0.5 = 130
    expect(basket.aggregateAchievementPct).toBe(130)
  })
})

describe('Achievement cap — trace completeness', () => {
  it('only elements that actually breach their cap appear in cappedKpis', () => {
    const profile = makeProfile(makeBasket([
      makeElement('wasfaty', 0.5, true, 130),  // actual = 200%, breaches cap
      makeElement('omni',    0.5, true, 130),  // actual = 80%, does NOT breach cap
    ]))
    const input = makeInput(profile,
      { wasfaty: 200, omni: 80 },
      { wasfatyTarget: 100, omniTarget: 100 },
    )
    const result = runEvaluation(input)

    expect(result.trace.cappedKpis).toHaveLength(1)
    expect(result.trace.cappedKpis[0].kpiKey).toBe('wasfaty')
  })

  it('cappedKpis trace includes all required fields', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 130)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const trace = result.trace.cappedKpis[0]
    expect(trace.kpiKey).toBe('wasfaty')
    expect(trace.engineKey).toBe('wasfaty')
    expect(trace.actualAchievementPct).toBe(200)
    expect(trace.cappedAchievementPct).toBe(130)
    expect(trace.capPct).toBe(130)
    expect(trace.source).toBe('element')
  })

  it('cappedKpis is empty when all elements are below their cap', () => {
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 200)]))
    const input   = makeInput(profile, { wasfaty: 150 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    expect(result.trace.cappedKpis).toHaveLength(0)
  })
})

describe('Achievement cap — guard: cap = 0 treated as no cap', () => {
  it('achievementCapPct = 0 is ignored (treated as uncapped)', () => {
    // 0 would zero-out every KPI — treated as "not configured"
    const profile = makeProfile(makeBasket([makeElement('wasfaty', 1.0, true, 0)]))
    const input   = makeInput(profile, { wasfaty: 200 }, { wasfatyTarget: 100 })
    const result  = runEvaluation(input)

    const el = result.basketResults[0].elements[0]
    expect(el.cappedAchievementPct).toBe(200)   // no cap applied
    expect(el.capApplied).toBe(false)
  })
})
