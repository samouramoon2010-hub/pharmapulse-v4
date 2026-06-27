// ============================================================
// PR-1I — Evaluation Compliance Regression Tests (V2 pipeline)
//
// The same two approved compliance fixes applied to the V1 engine
// (evaluationEngine.ts) also apply to the V2 pipeline
// (evaluationPipeline/processors.ts), because the V2 pipeline is
// production-connected (see evaluationPipeline/index.ts) and
// independently reimplements the same weighted-aggregation and
// final-score math for both the legacy flow
// (WEIGHTED_AVERAGE_AGGREGATOR) and the SMARTS flow
// (WEIGHT_CONTRIBUTION_APPLIER + SUM_AGGREGATOR).
//
//   Rule A — missing-data exclusion + proportional weight redistribution
//   Rule B — final score rounded to exactly 2 decimal places
//
// These tests cover both pipeline presets so neither flow silently
// regresses relative to the V1 fix.
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildPipelineContext, extractCapConfig } from './contextBuilder'
import { executePipeline } from './pipelineExecutor'
import { buildLegacyPipeline, buildSmartsPipeline } from './pipelinePresets'
import { pipelineResultToEvaluationResult } from './pipelineAdapter'
import type { EvaluationEngineInput } from '../evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket, BasketElement }
  from '../evaluationRegistry/evaluationRegistryTypes'

const THREE_BAND = {
  id: 'three-band', name: 'Three Band',
  bands: [
    { min: 0,  max: 70,  label: 'Below',  score: 1 },
    { min: 70, max: 100, label: 'Meet',   score: 2 },
    { min: 100, max: 999, label: 'Exceed', score: 3 },
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

function makeElement(kpiKey: string, weight: number, required = false): BasketElement {
  return { kpiKey, weight, required }
}

function makeBasket(elements: BasketElement[], weight = 1.0): EvaluationBasket {
  return { id: 'b1', name: 'Test Basket', weight, elements, thresholdRule: THREE_BAND, sortOrder: 1, active: true }
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
  const keys = new Set<string>()
  Object.values(profile.baskets).forEach((b) => b.elements.forEach((el) => keys.add(el.kpiKey)))
  return {
    userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
    profile, kpiActuals: actuals,
    branchTarget: { pharmacyId: 'ph1', month: '2026-06', ...targets } as any,
    registry: Object.fromEntries([...keys].map((k) => [k, { key: k, label: k, isActive: true, unit: 'units' }])) as any,
  }
}

function runLegacy(input: EvaluationEngineInput) {
  const ctx   = buildPipelineContext(input)
  const steps = buildLegacyPipeline({ defaultThresholdRule: input.profile.defaultThresholdRule, caps: extractCapConfig(input.profile) })
  const res   = executePipeline(ctx, steps)
  expect(res.success).toBe(true)
  return pipelineResultToEvaluationResult(res, { personalTargetUsed: false })
}

function runSmarts(input: EvaluationEngineInput) {
  const ctx   = buildPipelineContext(input)
  const steps = buildSmartsPipeline({ defaultThresholdRule: input.profile.defaultThresholdRule, caps: extractCapConfig(input.profile) })
  const res   = executePipeline(ctx, steps)
  expect(res.success).toBe(true)
  return pipelineResultToEvaluationResult(res, { personalTargetUsed: false })
}

// ── Rule A — legacy flow (WEIGHTED_AVERAGE_AGGREGATOR) ─────────

describe('PR-1I V2 pipeline — Rule A, legacy flow', () => {
  it('one missing KPI redistributes proportionally (50/30/20%, C missing)', () => {
    const basket  = makeBasket([makeElement('a', 0.5), makeElement('b', 0.3), makeElement('c', 0.2)])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, { a: 80, b: 60 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result  = runLegacy(input)
    // 80×(0.5/0.8) + 60×(0.3/0.8) = 72.5
    expect(result.basketResults[0].aggregateAchievementPct).toBeCloseTo(72.5, 5)
  })

  it('actual zero stays applicable, is not redistributed', () => {
    const basket  = makeBasket([makeElement('a', 0.5), makeElement('b', 0.5)])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, { a: 0, b: 80 }, { aTarget: 100, bTarget: 100 })
    const result  = runLegacy(input)
    expect(result.basketResults[0].aggregateAchievementPct).toBeCloseTo(40, 5)
  })

  it('all KPIs missing → 0, no NaN, no divide-by-zero', () => {
    const basket  = makeBasket([makeElement('a', 0.5), makeElement('b', 0.5)])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, {}, { aTarget: 100, bTarget: 100 })
    const result  = runLegacy(input)
    expect(result.basketResults[0].aggregateAchievementPct).toBe(0)
    expect(isNaN(result.finalScore)).toBe(false)
  })
})

// ── Rule A — SMARTS flow (WEIGHT_CONTRIBUTION_APPLIER + SUM_AGGREGATOR) ──

describe('PR-1I V2 pipeline — Rule A, SMARTS flow', () => {
  it('one missing KPI redistributes proportionally in the contribution sum', () => {
    const basket  = makeBasket([makeElement('a', 0.5), makeElement('b', 0.3), makeElement('c', 0.2)])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, { a: 80, b: 60 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result  = runSmarts(input)
    expect(result.basketResults[0].aggregateAchievementPct).toBeCloseTo(72.5, 5)
  })

  it('multiple missing KPIs redistribute correctly (40/30/20/10%, two missing)', () => {
    const basket  = makeBasket([
      makeElement('a', 0.4), makeElement('b', 0.3), makeElement('c', 0.2), makeElement('d', 0.1),
    ])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, { a: 90, b: 50 }, { aTarget: 100, bTarget: 100, cTarget: 100, dTarget: 100 })
    const result  = runSmarts(input)
    const expected = 90 * (0.4 / 0.7) + 50 * (0.3 / 0.7)
    expect(result.basketResults[0].aggregateAchievementPct).toBeCloseTo(expected, 5)
  })

  it('all KPIs missing → 0, no NaN, no divide-by-zero', () => {
    const basket  = makeBasket([makeElement('a', 0.5), makeElement('b', 0.5)])
    const profile = makeProfile(basket)
    const input   = makeInput(profile, {}, { aTarget: 100, bTarget: 100 })
    const result  = runSmarts(input)
    expect(result.basketResults[0].aggregateAchievementPct).toBe(0)
    expect(isNaN(result.finalScore)).toBe(false)
  })
})

// ── Rule B — rounding, both flows ───────────────────────────────

describe('PR-1I V2 pipeline — Rule B, final score rounding', () => {
  it('legacy flow: long-tail raw float rounds to exactly 2 decimals', () => {
    const b1: EvaluationBasket = { ...makeBasket([makeElement('a', 1.0)], 1 / 7), id: 'b1' }
    const b2: EvaluationBasket = { ...makeBasket([makeElement('b', 1.0)], 2 / 7), id: 'b2' }
    const b3: EvaluationBasket = { ...makeBasket([makeElement('c', 1.0)], 4 / 7), id: 'b3' }
    const profile: EvaluationProfile = {
      ...makeProfile(b1), basketIds: ['b1', 'b2', 'b3'],
      baskets: { b1, b2, b3 },
    }
    // a: 50% (band 1), b: 120% (band 3), c: 150% (band 3)
    const input  = makeInput(profile, { a: 50, b: 120, c: 150 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result = runLegacy(input)
    expect(result.finalScore).toBe(2.71)
    expect(result.trace.normalizedFinalScorePct).toBe(85.71)
  })

  it('SMARTS flow: long-tail raw float rounds to exactly 2 decimals', () => {
    const b1: EvaluationBasket = { ...makeBasket([makeElement('a', 1.0)], 1 / 7), id: 'b1' }
    const b2: EvaluationBasket = { ...makeBasket([makeElement('b', 1.0)], 2 / 7), id: 'b2' }
    const b3: EvaluationBasket = { ...makeBasket([makeElement('c', 1.0)], 4 / 7), id: 'b3' }
    const profile: EvaluationProfile = {
      ...makeProfile(b1), basketIds: ['b1', 'b2', 'b3'],
      baskets: { b1, b2, b3 },
    }
    const input  = makeInput(profile, { a: 50, b: 120, c: 150 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result = runSmarts(input)
    expect(result.finalScore).toBe(2.71)
    expect(result.trace.normalizedFinalScorePct).toBe(85.71)
  })

  it('trace.rawFinalScore preserves full precision distinct from the rounded official value', () => {
    const b1: EvaluationBasket = { ...makeBasket([makeElement('a', 1.0)], 1 / 7), id: 'b1' }
    const b2: EvaluationBasket = { ...makeBasket([makeElement('b', 1.0)], 2 / 7), id: 'b2' }
    const b3: EvaluationBasket = { ...makeBasket([makeElement('c', 1.0)], 4 / 7), id: 'b3' }
    const profile: EvaluationProfile = {
      ...makeProfile(b1), basketIds: ['b1', 'b2', 'b3'],
      baskets: { b1, b2, b3 },
    }
    const input  = makeInput(profile, { a: 50, b: 120, c: 150 }, { aTarget: 100, bTarget: 100, cTarget: 100 })
    const result = runLegacy(input)
    const raw = (result.trace as { rawFinalScore?: number }).rawFinalScore
    expect(raw).toBeCloseTo(2.7142857142857144, 10)
    expect(raw).not.toBe(result.finalScore)
  })
})
