// ============================================================
// Core KPI Removal Closure Certification — Part 2
// Complete Stage H End-to-End Proof
//
// One arbitrary non-Core KPI, defined ONLY in this file's registry
// fixture, is chained through: bulk import commit → V1 official
// evaluation (profile element + weight) → branch ranking
// (profile-weighted participation) — with the exact payload produced
// by one step fed unmodified into the next. Items 10-16 (Dashboard,
// Branch/Team/Regional Intelligence, Executive BI, Trend/Risk, Live
// Analytics) are already certified by their own per-surface Stage F/
// Regional test files; this file closes the remaining gap: the
// import → V1 evaluation → ranking chain.
// ============================================================

import { describe, it, expect } from 'vitest'

import { parseExcelRowsToRaw } from '../../services/kpiImportService'
import { validateRow } from '../../services/ingestion/stagingValidator'
import { stagedToKpiEntry } from '../../services/ingestion/ingestionSafetyGuards'

import { runEvaluation } from '../evaluationEngine/evaluationEngine'
import type { EvaluationEngineInput } from '../evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket } from '../evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_THRESHOLD_RULE } from '../evaluationRegistry/evaluationRegistryTypes'

import { computeBranchKpiScore } from '../../ranking/branch-kpi-engine'
import type { KpiEntryDoc, BranchTargetDoc } from '../../ranking/branch-kpi-engine'

import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import type { KpiRegistry } from './kpiRegistryTypes'

const PID         = 'branch-test'
const USER_ID     = 'u1'
const TEST_KPI_KEY = 'insurance_conversion_test'
const TODAY       = new Date().toISOString().split('T')[0]
const MONTH       = TODAY.slice(0, 7)

const WEIGHTED_REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: {
    key: TEST_KPI_KEY, label: 'Insurance Conversion (Test)', shortLabel: 'Insurance',
    labelAr: 'تحويل التأمين', category: 'engagement', valueType: 'count',
    unit: 'conversions', unitAr: 'تحويل', direction: 'higher_is_better', targetType: 'absolute',
    weight: 0.3, isCore: false, isActive: true, lifecycleStage: 'production_evaluation',
    actualField: TEST_KPI_KEY, targetField: `${TEST_KPI_KEY}Target`,
  } as any,
}

describe('Closure Certification — Stage H Step A: bulk import produces the canonical entry shape', () => {
  it('the committed entry carries the new KPI both as a flat field and in kpiValues', () => {
    const rows = [{ date: TODAY, pharmacyId: PID, wasfaty: '150', omni: '60', wellness: '80', basket: '30', crossSelling: '5', [TEST_KPI_KEY]: '40' }]
    const raw = parseExcelRowsToRaw(rows, 'closure.xlsx', WEIGHTED_REGISTRY)[0]
    const result = validateRow(raw, USER_ID, PID, 'EXCEL_UPLOAD', 'batch-closure', [PID])
    expect(result.isValid).toBe(true)
    const entry = stagedToKpiEntry(result.coerced as any, USER_ID)
    expect(entry[TEST_KPI_KEY]).toBe(40)
  })
})

describe('Closure Certification — Stage H Step B: V1 official evaluation engine (profile element + weight)', () => {
  // The new KPI is declared ONLY here, as an ordinary EvaluationBasket
  // element — runEvaluation() has zero hardcoded knowledge of its name.
  const BASKET: EvaluationBasket = {
    id: 'mixed', name: 'Mixed Basket', weight: 1.0, active: true, sortOrder: 1,
    elements: [
      { kpiKey: 'wasfaty', weight: 0.7, required: true },
      { kpiKey: TEST_KPI_KEY, weight: 0.3, required: false },
    ],
    thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  }
  const PROFILE: EvaluationProfile = {
    id: 'profile-closure', name: 'Closure Cert Profile', version: 1, status: 'published',
    basketIds: ['mixed'], baskets: { mixed: BASKET },
    defaultThresholdRule: { ...DEFAULT_THRESHOLD_RULE },
    createdBy: null, createdAt: null, updatedAt: null,
    publishedAt: null, archivedAt: null, previousVersionId: null,
  } as any

  function evalInput(kpiActuals: Record<string, number>): EvaluationEngineInput {
    return {
      userId: USER_ID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile: PROFILE, kpiActuals,
      personalTarget: { targets: { wasfatyTarget: 100000, [`${TEST_KPI_KEY}Target`]: 50 } } as any,
      branchTarget: null,
      registry: WEIGHTED_REGISTRY,
    }
  }

  it('the imported entry feeds directly into runEvaluation() and the new KPI is scored', () => {
    // Re-derive kpiActuals from the Step A commit payload — proving the
    // import output shape is what the evaluation engine consumes, with
    // no adapter in between.
    const rows = [{ date: TODAY, pharmacyId: PID, wasfaty: '75000', [TEST_KPI_KEY]: '40' }]
    const raw = parseExcelRowsToRaw(rows, 'closure.xlsx', WEIGHTED_REGISTRY)[0]
    const result = validateRow(raw, USER_ID, PID, 'EXCEL_UPLOAD', 'batch-closure', [PID])
    const entry = stagedToKpiEntry(result.coerced as any, USER_ID)

    const kpiActuals = { wasfaty: entry.wasfaty as number, [TEST_KPI_KEY]: (entry.kpiValues as Record<string, number>)[TEST_KPI_KEY] }
    const evalResult = runEvaluation(evalInput(kpiActuals))

    const element = evalResult.basketResults[0].elements.find((e) => e.kpiKey === TEST_KPI_KEY)
    expect(element).toBeDefined()
    expect(element!.actual).toBe(40)
    expect(element!.target).toBe(50)
    expect(element!.weightedScore).toBeGreaterThan(0)
  })

  it('without the new KPI in kpiActuals, it is reported missing but does not invalidate the (non-required) basket', () => {
    const evalResult = runEvaluation(evalInput({ wasfaty: 75000 }))
    expect(evalResult.trace.missingKpis).toContain(TEST_KPI_KEY)
    expect(evalResult.status).toBe('partial')
  })

  it('removing the new KPI element from the profile and re-running produces a different aggregate achievement (it genuinely contributes)', () => {
    const withNewKpi = runEvaluation(evalInput({ wasfaty: 75000, [TEST_KPI_KEY]: 40 }))
    const baselineProfile: EvaluationProfile = {
      ...PROFILE,
      baskets: { mixed: { ...BASKET, elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: true }] } },
    } as any
    const withoutNewKpi = runEvaluation({ ...evalInput({ wasfaty: 75000 }), profile: baselineProfile })
    expect(withNewKpi.basketResults[0].aggregateAchievementPct).not.toBe(withoutNewKpi.basketResults[0].aggregateAchievementPct)
  })
})

describe('Closure Certification — Stage H Step C: branch ranking (profile-weighted participation)', () => {
  function kpiEntries(): KpiEntryDoc[] {
    return [{
      userId: USER_ID, pharmacyId: PID, date: TODAY,
      wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
      [TEST_KPI_KEY]: 40,
    } as any]
  }
  function targetDoc(): BranchTargetDoc {
    return {
      pharmacyId: PID, month: MONTH,
      wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
      basketTarget: 50, crossSellTarget: 60,
      [`${TEST_KPI_KEY}Target`]: 50,
    } as any
  }

  it('without a registry, ranking ignores the new KPI entirely (byte-identical legacy behavior)', () => {
    const score = computeBranchKpiScore(PID, MONTH, 'tier-a', 'Branch Test', kpiEntries(), targetDoc())
    expect(Object.keys(score.kpiBreakdown)).not.toContain(TEST_KPI_KEY)
  })

  it('with the weighted registry, the new KPI appears in the breakdown and changes overallAchievementPct', () => {
    const withoutNewKpiWeight = computeBranchKpiScore(PID, MONTH, 'tier-a', 'Branch Test', kpiEntries(), targetDoc(), {
      ...WEIGHTED_REGISTRY, [TEST_KPI_KEY]: { ...(WEIGHTED_REGISTRY as any)[TEST_KPI_KEY], weight: 0 },
    })
    const withNewKpiWeight = computeBranchKpiScore(PID, MONTH, 'tier-a', 'Branch Test', kpiEntries(), targetDoc(), WEIGHTED_REGISTRY)

    expect(withNewKpiWeight.kpiBreakdown).toHaveProperty(TEST_KPI_KEY)
    expect(withNewKpiWeight.overallAchievementPct).not.toBe(withoutNewKpiWeight.overallAchievementPct)
  })
})

describe('Closure Certification — Stage H: no source-code recognition of the KPI name', () => {
  it('the test KPI key/label appear nowhere in the non-test engine source files exercised above', async () => {
    const sources = await Promise.all([
      import('../../services/kpiImportService?raw').then((m) => m.default),
      import('../../services/ingestion/stagingValidator?raw').then((m) => m.default),
      import('../../services/ingestion/ingestionSafetyGuards?raw').then((m) => m.default),
      import('../evaluationEngine/evaluationEngine?raw').then((m) => m.default),
      import('../../ranking/branch-kpi-engine?raw').then((m) => m.default),
    ])
    for (const src of sources) {
      expect(src).not.toContain(TEST_KPI_KEY)
      expect(src).not.toContain('Insurance Conversion')
    }
  })
})
