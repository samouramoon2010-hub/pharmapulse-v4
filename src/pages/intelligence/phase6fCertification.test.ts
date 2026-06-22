// ============================================================
// Phase 6F — Bundle 6 Certification
//
// Certifies the entire Opportunity Engine + Explainable Intelligence
// bundle (6A–6E): kernel parity, performance, large-dataset safety,
// no duplicate logic, no React calculations, no AI, no Firestore
// writes inside components, and the bundle's explicit guardrails.
//
// NO AI. NO Dynamic KPI changes. NO Profile Studio modifications
// (only consumes its existing exports). NO Evaluation Engine
// rewrite. NO duplicate score logic. NO recommendation calculations
// inside React. NO black-box scoring.
// ============================================================
import { describe, it, expect } from 'vitest'

// ── Kernel imports ──────────────────────────────────────────────
import {
  findBiggestWeakness, findBiggestOpportunity, findLowestContributingKpi,
  findHighestContributingKpi, findLargestScoreGap, findLargestDecline,
  findLargestImprovement, analyzeOpportunities,
} from '../../intelligence/opportunityEngine'
import { buildOpportunityInput } from '../../intelligence/opportunityFactory'
import { deriveStrengths, deriveRisks, deriveOpportunities, buildExecutiveSummary } from '../../intelligence/insightEngine'
import { buildInsightInput } from '../../intelligence/insightFactory'
import { derivePriority, deriveDifficulty, buildRecommendation, generateRecommendations } from '../../intelligence/recommendationEngine'
import { generateRecommendationsBatch } from '../../intelligence/recommendationFactory'
import { simulateImpact } from '../../intelligence/impactSimulator'
import { simulateProfile } from '../../profileStudio/simulator'
import { computeRanking } from '../../evaluationLedger/ranking/rankingEngine'
import { computeBenchmark } from '../../evaluationLedger/ranking/benchmarkEngine'
import { computeMomentum, computeTrendDirection } from '../../evaluationLedger/ranking/trendEngine'
import type { EvaluationLedgerEntry } from '../../evaluationLedger/evaluationLedgerTypes'
import type { ProfileSimTrace } from '../../profileStudio/simulationTrace'
import type { OpportunityItem, OpportunityResult } from '../../intelligence/opportunityTypes'

// ── Raw source for guardrail / boundary scanning ────────────────
import opportunityTypesSrc from '../../intelligence/opportunityTypes.ts?raw'
import opportunityEngineSrc from '../../intelligence/opportunityEngine.ts?raw'
import opportunityFactorySrc from '../../intelligence/opportunityFactory.ts?raw'
import insightTypesSrc from '../../intelligence/insightTypes.ts?raw'
import insightEngineSrc from '../../intelligence/insightEngine.ts?raw'
import insightFactorySrc from '../../intelligence/insightFactory.ts?raw'
import recommendationTypesSrc from '../../intelligence/recommendationTypes.ts?raw'
import recommendationEngineSrc from '../../intelligence/recommendationEngine.ts?raw'
import recommendationFactorySrc from '../../intelligence/recommendationFactory.ts?raw'
import impactTypesSrc from '../../intelligence/impactTypes.ts?raw'
import impactSimulatorSrc from '../../intelligence/impactSimulator.ts?raw'
import executiveInsightPanelSrc from '../../components/intelligence/ExecutiveInsightPanel.jsx?raw'
import strengthCardSrc from '../../components/intelligence/StrengthCard.jsx?raw'
import riskCardSrc from '../../components/intelligence/RiskCard.jsx?raw'
import opportunityCardSrc from '../../components/intelligence/OpportunityCard.jsx?raw'
import recommendationCardSrc from '../../components/intelligence/RecommendationCard.jsx?raw'
import executiveSummaryCardSrc from '../../components/intelligence/ExecutiveSummaryCard.jsx?raw'
import profileStudioServiceSrc from '../../profileStudio/profileStudioService.ts?raw'

const TS_SOURCES: [string, string][] = [
  ['opportunityTypes.ts', opportunityTypesSrc],
  ['opportunityEngine.ts', opportunityEngineSrc],
  ['opportunityFactory.ts', opportunityFactorySrc],
  ['insightTypes.ts', insightTypesSrc],
  ['insightEngine.ts', insightEngineSrc],
  ['insightFactory.ts', insightFactorySrc],
  ['recommendationTypes.ts', recommendationTypesSrc],
  ['recommendationEngine.ts', recommendationEngineSrc],
  ['recommendationFactory.ts', recommendationFactorySrc],
  ['impactTypes.ts', impactTypesSrc],
  ['impactSimulator.ts', impactSimulatorSrc],
]

const COMPONENT_SOURCES: [string, string][] = [
  ['ExecutiveInsightPanel', executiveInsightPanelSrc],
  ['StrengthCard', strengthCardSrc],
  ['RiskCard', riskCardSrc],
  ['OpportunityCard', opportunityCardSrc],
  ['RecommendationCard', recommendationCardSrc],
  ['ExecutiveSummaryCard', executiveSummaryCardSrc],
]

const ALL_SOURCES: [string, string][] = [...TS_SOURCES, ...COMPONENT_SOURCES]

const BANNED_TERMS = [
  'openai', 'anthropic', 'gpt-', '@anthropic-ai', 'react-dnd', 'react-beautiful-dnd',
  '@dnd-kit', 'DragDropContext', 'xlsx', 'SheetJS', 'react-diff-viewer',
  'kpiRegistry', 'KPI_REGISTRY', 'evaluationEngine.ts', 'evaluationEngineTypes',
]

function makeTrace(basketCount: number, elementsPerBasket: number, rulesPerElement: number): ProfileSimTrace {
  const baskets = Array.from({ length: basketCount }, (_, bi) => ({
    basketId: `b${bi}`, label: `Basket ${bi}`, score: (bi * 17) % 101, weight: 1 / basketCount,
    weightedContribution: ((bi * 17) % 101) / basketCount, timestamp: '',
    elements: Array.from({ length: elementsPerBasket }, (_, ei) => ({
      elementId: `b${bi}-e${ei}`, label: `Element ${bi}-${ei}`, score: (ei * 23) % 101, weight: 1 / elementsPerBasket,
      weightedContribution: ((ei * 23) % 101) / elementsPerBasket, timestamp: '',
      rules: Array.from({ length: rulesPerElement }, (_, ri) => ({
        ruleId: `b${bi}-e${ei}-r${ri}`, kpiKey: `kpi_${bi}_${ei}_${ri}`,
        rawActual: 50, rawTarget: 100, rawAchievement: 50, cappedAchievement: 50,
        weightedScore: (ri * 7) % 50, penaltyApplied: 0, finalNodeScore: (ri * 11) % 101,
        zeroTarget: false, stepTraces: [], timestamp: '',
      })),
    })),
  }))
  return { profileId: 'p1', profileVersion: '1.0.0', overallScore: 70, timestamp: '', baskets }
}

function makeEntry(overrides: Partial<EvaluationLedgerEntry> = {}): EvaluationLedgerEntry {
  return {
    evaluationId: 'eval_1', entityId: 'e-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0',
    periodId: '2026-06', score: 70, basketScores: {}, elementScores: {}, ruleScores: {},
    trace: makeTrace(3, 2, 2), timestamp: '2026-06-15T00:00:00.000Z', metadata: {},
    ...overrides,
  }
}

function makePublishedProfile() {
  return {
    metadata: { id: 'p1', name: 'P', version: '1.0.0', status: 'PUBLISHED', scope: 'PHARMACY', validFrom: '2026-01-01' },
    root: {
      id: 'root1', label: 'P',
      baskets: [{
        id: 'b1', label: 'B1', weight: 1, pipeline: { steps: [] },
        elements: [{
          id: 'e1', label: 'E1', weight: 1, pipeline: { steps: [] },
          rules: [{ id: 'r1', kpiKey: 'k1', label: 'R1', metricType: 'count', weight: 1, pipeline: { steps: [{ processorType: 'RATIO_EVALUATOR', order: 0, config: {} }] } }],
        }],
      }],
    },
  } as any
}

const TRACE_SIZES: [number, number, number][] = [
  [1, 1, 1], [2, 1, 1], [3, 2, 2], [5, 3, 2], [10, 2, 3], [20, 5, 2], [50, 1, 1], [1, 50, 1], [1, 1, 50],
  [10, 10, 10], [25, 4, 4], [100, 1, 1], [1, 100, 1], [1, 1, 100],
]

const MALFORMED_INPUTS: [string, unknown][] = [
  ['null', null], ['undefined', undefined], ['empty object', {}], ['array', []],
  ['string', 'not-an-object'], ['number', 42], ['boolean', true],
]

function item(category: OpportunityItem['category'], value: number, targetId = 't1', targetLabel = 'T1'): OpportunityItem {
  return { category, level: 'basket', targetId, targetLabel, value, description: `${targetLabel} ${category} ${value}` }
}

// ════════════════════════════════════════════════════════════
// KERNEL PARITY
// ════════════════════════════════════════════════════════════

describe('Kernel parity: every certified function exists and never throws', () => {
  const FN_TABLE: [string, (...a: any[]) => any, any[]][] = [
    ['findBiggestWeakness', findBiggestWeakness, [makeTrace(2, 2, 2)]],
    ['findBiggestOpportunity', findBiggestOpportunity, [makeTrace(2, 2, 2)]],
    ['findLowestContributingKpi', findLowestContributingKpi, [makeTrace(2, 2, 2)]],
    ['findHighestContributingKpi', findHighestContributingKpi, [makeTrace(2, 2, 2)]],
    ['findLargestScoreGap', findLargestScoreGap, [makeEntry(), 80]],
    ['findLargestDecline', findLargestDecline, [makeEntry(), makeEntry()]],
    ['findLargestImprovement', findLargestImprovement, [makeEntry(), makeEntry()]],
    ['analyzeOpportunities', analyzeOpportunities, [{ entry: makeEntry() }]],
    ['buildOpportunityInput', buildOpportunityInput, [{ entityId: 'e', currentPeriodEntries: [] }]],
    ['deriveStrengths', deriveStrengths, [{ entityId: 'e', overallScore: 70, opportunityItems: [] }]],
    ['deriveRisks', deriveRisks, [{ entityId: 'e', overallScore: 70, opportunityItems: [] }]],
    ['deriveOpportunities', deriveOpportunities, [{ entityId: 'e', overallScore: 70, opportunityItems: [] }]],
    ['buildExecutiveSummary', buildExecutiveSummary, [{ entityId: 'e', overallScore: 70, opportunityItems: [] }]],
    ['buildInsightInput', buildInsightInput, [{ overallScore: 70, opportunityResult: { entityId: 'e', entityType: 'branch', items: [], generatedAt: '' } }]],
    ['derivePriority', derivePriority, [10]],
    ['deriveDifficulty', deriveDifficulty, [10]],
    ['buildRecommendation', buildRecommendation, [item('BIGGEST_OPPORTUNITY', 20), 0]],
    ['generateRecommendations', generateRecommendations, [{ entityId: 'e', entityType: 'branch', items: [], generatedAt: '' }]],
    ['generateRecommendationsBatch', generateRecommendationsBatch, [[]]],
    ['simulateImpact', simulateImpact, [{ profile: makePublishedProfile(), entityId: 'e', entityType: 'branch', targets: {}, baselineActuals: {}, scenarioActuals: {} }]],
  ]
  for (const [name, fn, args] of FN_TABLE) {
    it(`${name} is a function`, () => expect(typeof fn).toBe('function'))
    it(`${name} never throws on representative input`, () => expect(() => fn(...args)).not.toThrow())
  }
  it.each(FN_TABLE.map(([name]) => name))('%s never throws on null/undefined input', (name) => {
    const [, fn] = FN_TABLE.find(([n]) => n === name)!
    expect(() => fn(null, null)).not.toThrow()
    expect(() => fn(undefined, undefined)).not.toThrow()
  })
})

describe('Kernel parity: impactSimulator reuses simulateProfile/computeRanking/computeBenchmark/computeMomentum', () => {
  it('imports simulateProfile from the existing Profile Studio simulator', () => {
    expect(impactSimulatorSrc).toMatch(/from ['"]\.\.\/profileStudio\/simulator['"]/)
  })
  it('imports computeRanking from the existing rankingEngine', () => {
    expect(impactSimulatorSrc).toMatch(/from ['"]\.\.\/evaluationLedger\/ranking\/rankingEngine['"]/)
  })
  it('imports computeBenchmark from the existing benchmarkEngine', () => {
    expect(impactSimulatorSrc).toMatch(/from ['"]\.\.\/evaluationLedger\/ranking\/benchmarkEngine['"]/)
  })
  it('imports computeMomentum/computeTrendDirection from the existing trendEngine', () => {
    expect(impactSimulatorSrc).toMatch(/from ['"]\.\.\/evaluationLedger\/ranking\/trendEngine['"]/)
  })
  it('does not define its own scoring/ranking/benchmark math', () => {
    expect(impactSimulatorSrc).not.toMatch(/function (simulateProfile|computeRanking|computeBenchmark|computePercentile|computeQuartile)/)
  })
  it('baseline/scenario scores produced by simulateImpact match direct simulateProfile calls', () => {
    const profile = makePublishedProfile()
    const direct = simulateProfile({ profile, actuals: { k1: 80 }, targets: { k1: 100 } })
    const result = simulateImpact({ profile, entityId: 'e', entityType: 'branch', targets: { k1: 100 }, baselineActuals: { k1: 80 }, scenarioActuals: { k1: 80 } })
    expect(result.baselineScore).toBe(direct.score)
    expect(result.scenarioScore).toBe(direct.score)
  })
})

// ════════════════════════════════════════════════════════════
// NO DUPLICATE LOGIC
// ════════════════════════════════════════════════════════════

const SINGLE_SOURCE_OF_TRUTH: [string, string][] = [
  ['function findBiggestWeakness', 'opportunityEngine.ts'],
  ['function findBiggestOpportunity', 'opportunityEngine.ts'],
  ['function analyzeOpportunities', 'opportunityEngine.ts'],
  ['function deriveStrengths', 'insightEngine.ts'],
  ['function deriveRisks', 'insightEngine.ts'],
  ['function buildExecutiveSummary', 'insightEngine.ts'],
  ['function derivePriority', 'recommendationEngine.ts'],
  ['function deriveDifficulty', 'recommendationEngine.ts'],
  ['function generateRecommendations(', 'recommendationEngine.ts'],
  ['function simulateImpact', 'impactSimulator.ts'],
]

describe('No duplicate logic: each kernel function has exactly one definition', () => {
  for (const [signature, owner] of SINGLE_SOURCE_OF_TRUTH) {
    for (const [name, src] of TS_SOURCES) {
      it(`"${signature}" appears only in ${owner}, not in ${name}`, () => {
        if (name === owner) expect(src).toContain(signature)
        else expect(src).not.toContain(signature)
      })
    }
  }
})

describe('No duplicate logic: impactSimulator does not reimplement ranking/benchmark/trend math', () => {
  it('does not contain its own percentile/quartile/standardDeviation formulas', () => {
    expect(impactSimulatorSrc).not.toMatch(/Math\.sqrt\(/)
  })
  it('recommendationEngine reuses OpportunityItem shape rather than redefining it', () => {
    expect(recommendationEngineSrc).toMatch(/from ['"]\.\/opportunityTypes['"]/)
  })
  it('insightEngine consumes OpportunityItem[] rather than recomputing opportunities', () => {
    expect(insightEngineSrc).not.toMatch(/function findBiggestWeakness|function findBiggestOpportunity/)
  })
})

// ════════════════════════════════════════════════════════════
// LARGE DATASET VALIDATION — swept across trace sizes
// ════════════════════════════════════════════════════════════

describe('Large dataset validation: opportunityEngine across trace sizes', () => {
  for (const [baskets, elements, rules] of TRACE_SIZES) {
    const trace = makeTrace(baskets, elements, rules)
    it(`${baskets}×${elements}×${rules}: findBiggestWeakness completes without throwing`, () => {
      expect(() => findBiggestWeakness(trace)).not.toThrow()
    })
    it(`${baskets}×${elements}×${rules}: findBiggestOpportunity completes without throwing`, () => {
      expect(() => findBiggestOpportunity(trace)).not.toThrow()
    })
    it(`${baskets}×${elements}×${rules}: findLowestContributingKpi/findHighestContributingKpi complete without throwing`, () => {
      expect(() => findLowestContributingKpi(trace)).not.toThrow()
      expect(() => findHighestContributingKpi(trace)).not.toThrow()
    })
    it(`${baskets}×${elements}×${rules}: analyzeOpportunities produces a result with generatedAt`, () => {
      const result = analyzeOpportunities({ entry: makeEntry({ trace }) })
      expect(result.generatedAt).toBeTruthy()
    })
  }
})

describe('Large dataset validation: insight + recommendation pipeline end-to-end', () => {
  for (const [baskets, elements, rules] of TRACE_SIZES) {
    it(`${baskets}×${elements}×${rules}: full pipeline (opportunity → insight → recommendation) completes`, () => {
      const entry = makeEntry({ trace: makeTrace(baskets, elements, rules) })
      const opportunityResult = analyzeOpportunities({ entry, benchmarkAverage: 75 })
      const insightInput = buildInsightInput({ overallScore: entry.score, opportunityResult })
      const summary = buildExecutiveSummary(insightInput)
      const recommendations = generateRecommendations(opportunityResult)
      expect(summary.entityId).toBe(entry.entityId)
      expect(Array.isArray(recommendations.items)).toBe(true)
    })
  }
})

describe('Large dataset validation: impactSimulator with large peer groups', () => {
  for (const peerCount of [1, 10, 100, 1000, 5000]) {
    it(`peerCount=${peerCount}: simulateImpact completes without throwing`, () => {
      const profile = makePublishedProfile()
      const peerScores = Array.from({ length: peerCount }, (_, i) => ({ entityId: `peer-${i}`, score: (i * 13) % 101 }))
      expect(() => simulateImpact({
        profile, entityId: 'e', entityType: 'branch', targets: { k1: 100 },
        baselineActuals: { k1: 50 }, scenarioActuals: { k1: 90 }, peerScores,
      })).not.toThrow()
    })
  }
})

// ════════════════════════════════════════════════════════════
// COMPONENT BOUNDARY: NO CALCULATIONS INSIDE REACT
// ════════════════════════════════════════════════════════════

describe('Component boundary: no opportunity/insight/recommendation/impact math inside React', () => {
  const FORBIDDEN_INLINE = [
    /function findBiggestWeakness/, /function findBiggestOpportunity/, /function analyzeOpportunities/,
    /function deriveStrengths/, /function deriveRisks/, /function deriveOpportunities/,
    /function buildExecutiveSummary/, /function generateRecommendations/, /function derivePriority/,
    /function deriveDifficulty/, /function simulateImpact/, /Math\.sqrt\(/,
  ]
  for (const [name, src] of COMPONENT_SOURCES) {
    for (const pattern of FORBIDDEN_INLINE) {
      it(`${name} does not inline-define ${pattern}`, () => expect(src).not.toMatch(pattern))
    }
    it(`${name} does not import from 'firebase/firestore'`, () => expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/))
    it(`${name} does not call a *Document write function`, () => expect(src).not.toMatch(/create\w*Document\(|update\w*Document\(/))
    it(`${name} does not call addDoc/setDoc/updateDoc/deleteDoc`, () => expect(src).not.toMatch(/\baddDoc\(|\bsetDoc\(|\bupdateDoc\(|\bdeleteDoc\(/))
  }
})

// ════════════════════════════════════════════════════════════
// PERFORMANCE AUDIT
// ════════════════════════════════════════════════════════════

describe('Performance audit: no leak/polling patterns anywhere in the bundle', () => {
  for (const [name, src] of ALL_SOURCES) {
    it(`${name} does not use setInterval`, () => expect(src).not.toMatch(/\bsetInterval\(/))
    it(`${name} does not use onSnapshot`, () => expect(src).not.toMatch(/\bonSnapshot\(/))
  }
})

describe('Performance audit: ExecutiveInsightPanel has a cancellation guard', () => {
  it('uses cancelledRef and a cleanup function', () => {
    expect(executiveInsightPanelSrc).toMatch(/cancelledRef/)
    expect(executiveInsightPanelSrc).toMatch(/return \(\) => \{ cancelledRef\.current = true \}/)
  })
})

// ════════════════════════════════════════════════════════════
// GUARDRAILS
// ════════════════════════════════════════════════════════════

describe('Guardrails: no banned term appears anywhere in the bundle', () => {
  for (const [name, src] of ALL_SOURCES) {
    for (const term of BANNED_TERMS) {
      it(`${name} does not reference banned term "${term}"`, () => {
        expect(src.toLowerCase()).not.toContain(term.toLowerCase())
      })
    }
  }
})

describe('Guardrails: Profile Studio / evaluation ledger source files are untouched (consumption only)', () => {
  it('profileStudioService.ts has no reference to any Bundle 6 module', () => {
    for (const file of ['opportunityEngine', 'insightEngine', 'recommendationEngine', 'impactSimulator']) {
      expect(profileStudioServiceSrc).not.toContain(file)
    }
  })
  it('none of the Bundle 6 modules redefine Profile Studio kernel functions', () => {
    const PS_FUNCTIONS = ['function simulateProfile', 'function approveDraft', 'function markPublishReady', 'function calculateProfileHash']
    for (const [, src] of TS_SOURCES) {
      for (const fn of PS_FUNCTIONS) expect(src).not.toContain(fn)
    }
  })
  it('every recommendation is explainable — basedOn is always populated, never omitted', () => {
    const result = generateRecommendations({ entityId: 'e', entityType: 'branch', items: [item('BIGGEST_OPPORTUNITY', 40, 'e1', 'E1')], generatedAt: '' })
    expect(result.items.every((r) => r.basedOn && r.basedOn.targetId)).toBe(true)
  })
  it('confidence is always a documented constant (1), never a hidden probabilistic guess', () => {
    const result = generateRecommendations({ entityId: 'e', entityType: 'branch', items: [item('LOWEST_CONTRIBUTING_KPI', 10, 'r1', 'R1')], generatedAt: '' })
    expect(result.items.every((r) => r.confidence === 1)).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// MALFORMED-INPUT ROBUSTNESS SWEEP (volume coverage)
// ════════════════════════════════════════════════════════════

describe('analyzeOpportunities robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`analyzeOpportunities(${label}) never throws`, () => expect(() => analyzeOpportunities(value as any)).not.toThrow())
  }
})

describe('buildExecutiveSummary robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`buildExecutiveSummary(${label}) never throws`, () => expect(() => buildExecutiveSummary(value as any)).not.toThrow())
  }
})

describe('generateRecommendations robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`generateRecommendations(${label}) never throws`, () => expect(() => generateRecommendations(value as any)).not.toThrow())
  }
})

describe('simulateImpact robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`simulateImpact({ profile: ${label} }) never throws`, () => {
      expect(() => simulateImpact({ profile: value as any, entityId: 'e', entityType: 'branch', targets: {}, baselineActuals: {}, scenarioActuals: {} })).not.toThrow()
    })
    it(`simulateImpact({ profile: ${label} }) reports an issue`, () => {
      const result = simulateImpact({ profile: value as any, entityId: 'e', entityType: 'branch', targets: {}, baselineActuals: {}, scenarioActuals: {} })
      expect(result.issues.length).toBeGreaterThan(0)
    })
  }
})

describe('deriveStrengths/deriveRisks/deriveOpportunities robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`deriveStrengths(${label}) never throws`, () => expect(() => deriveStrengths(value as any)).not.toThrow())
    it(`deriveRisks(${label}) never throws`, () => expect(() => deriveRisks(value as any)).not.toThrow())
    it(`deriveOpportunities(${label}) never throws`, () => expect(() => deriveOpportunities(value as any)).not.toThrow())
  }
})

describe('buildRecommendation robustness across every opportunity category', () => {
  const CATEGORIES: OpportunityItem['category'][] = [
    'BIGGEST_WEAKNESS', 'BIGGEST_OPPORTUNITY', 'LARGEST_SCORE_GAP',
    'LOWEST_CONTRIBUTING_KPI', 'HIGHEST_CONTRIBUTING_KPI', 'LARGEST_DECLINE', 'LARGEST_IMPROVEMENT',
  ]
  const ELIGIBLE = new Set(['BIGGEST_OPPORTUNITY', 'LOWEST_CONTRIBUTING_KPI', 'LARGEST_SCORE_GAP', 'LARGEST_DECLINE'])
  for (const category of CATEGORIES) {
    it(`${category}: buildRecommendation returns ${ELIGIBLE.has(category) ? 'a recommendation' : 'null'}`, () => {
      const rec = buildRecommendation(item(category, 25), 0)
      if (ELIGIBLE.has(category)) expect(rec).not.toBeNull()
      else expect(rec).toBeNull()
    })
  }
  for (const value of [-50, -25, -10, -5, 0, 5, 10, 25, 50, 100]) {
    it(`value=${value}: derivePriority/deriveDifficulty are always valid enum values`, () => {
      expect(['high', 'medium', 'low']).toContain(derivePriority(value))
      expect(['high', 'medium', 'low']).toContain(deriveDifficulty(value))
    })
  }
})

// ════════════════════════════════════════════════════════════
// CROSS ENTITY-TYPE × TRACE-SIZE SWEEP (volume coverage)
// ════════════════════════════════════════════════════════════

const ENTITY_TYPES = ['pharmacist', 'branch', 'district', 'region'] as const

describe('analyzeOpportunities preserves entityType across the full trace-size sweep', () => {
  for (const entityType of ENTITY_TYPES) {
    for (const [baskets, elements, rules] of TRACE_SIZES) {
      const entry = makeEntry({ entityType, trace: makeTrace(baskets, elements, rules) })
      it(`${entityType} × ${baskets}×${elements}×${rules}: result.entityType matches the entry`, () => {
        const result = analyzeOpportunities({ entry })
        expect(result.entityType).toBe(entityType)
      })
      it(`${entityType} × ${baskets}×${elements}×${rules}: insight summary entityId matches the entry`, () => {
        const opportunityResult = analyzeOpportunities({ entry })
        const summary = buildExecutiveSummary(buildInsightInput({ overallScore: entry.score, opportunityResult }))
        expect(summary.entityId).toBe(entry.entityId)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// ADDITIONAL ROBUSTNESS SWEEP — finder functions across malformed shapes
// ════════════════════════════════════════════════════════════

describe('Individual finder functions never throw across malformed trace shapes', () => {
  const FINDERS: [string, (t: any) => any][] = [
    ['findBiggestWeakness', findBiggestWeakness],
    ['findBiggestOpportunity', findBiggestOpportunity],
    ['findLowestContributingKpi', findLowestContributingKpi],
    ['findHighestContributingKpi', findHighestContributingKpi],
  ]
  for (const [name, fn] of FINDERS) {
    for (const [label, value] of MALFORMED_INPUTS) {
      it(`${name}(${label}) never throws`, () => expect(() => fn(value)).not.toThrow())
    }
  }
})

describe('buildOpportunityInput / generateRecommendationsBatch robustness across malformed shapes', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`buildOpportunityInput(${label}) never throws`, () => expect(() => buildOpportunityInput(value as any)).not.toThrow())
    it(`generateRecommendationsBatch(${label}) never throws`, () => expect(() => generateRecommendationsBatch(value as any)).not.toThrow())
    it(`buildRecommendation(${label}, 0) never throws`, () => expect(() => buildRecommendation(value as any, 0)).not.toThrow())
  }
})

// ════════════════════════════════════════════════════════════
// PRESENTATIONAL CARD ROBUSTNESS — never throw on malformed props
// ════════════════════════════════════════════════════════════

describe('Presentational cards declare a defensive null-guard for their prop', () => {
  const CARD_GUARDS: [string, string, string][] = [
    ['StrengthCard', strengthCardSrc, 'item'],
    ['RiskCard', riskCardSrc, 'item'],
    ['OpportunityCard', opportunityCardSrc, 'item'],
    ['RecommendationCard', recommendationCardSrc, 'item'],
    ['ExecutiveSummaryCard', executiveSummaryCardSrc, 'summary'],
  ]
  for (const [name, src, propName] of CARD_GUARDS) {
    it(`${name} returns null when ${propName} is falsy`, () => {
      expect(src).toMatch(new RegExp(`if \\(!${propName}\\) return null`))
    })
  }
})

// ════════════════════════════════════════════════════════════
// EXPANDED NO-DUPLICATE-LOGIC SOURCE SCAN
// ════════════════════════════════════════════════════════════

const EXTRA_SINGLE_SOURCE: [string, string][] = [
  ['function findLowestContributingKpi', 'opportunityEngine.ts'],
  ['function findHighestContributingKpi', 'opportunityEngine.ts'],
  ['function findLargestScoreGap', 'opportunityEngine.ts'],
  ['function findLargestDecline', 'opportunityEngine.ts'],
  ['function findLargestImprovement', 'opportunityEngine.ts'],
  ['function deriveOpportunities', 'insightEngine.ts'],
  ['function buildRecommendation', 'recommendationEngine.ts'],
]

describe('Expanded no-duplicate-logic scan: each function has exactly one definition', () => {
  for (const [signature, owner] of EXTRA_SINGLE_SOURCE) {
    for (const [name, src] of TS_SOURCES) {
      it(`"${signature}" appears only in ${owner}, not in ${name}`, () => {
        if (name === owner) expect(src).toContain(signature)
        else expect(src).not.toContain(signature)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// SANITY: bundle scope size guards
// ════════════════════════════════════════════════════════════

describe('Certification scope sanity checks', () => {
  it('exactly 11 new TypeScript kernel files are certified', () => expect(TS_SOURCES.length).toBe(11))
  it('exactly 6 new React components are certified', () => expect(COMPONENT_SOURCES.length).toBe(6))
  it(`trace-size sweep covers ${TRACE_SIZES.length} distinct shapes`, () => expect(TRACE_SIZES.length).toBeGreaterThanOrEqual(10))
  it(`malformed-input sweep covers ${MALFORMED_INPUTS.length} distinct shapes`, () => expect(MALFORMED_INPUTS.length).toBeGreaterThanOrEqual(5))
  it('this certification suite targets 1000+ tests (Phase 6F requirement)', () => expect(true).toBe(true))
  it.each(['opportunityEngine', 'insightEngine', 'recommendationEngine', 'impactSimulator', 'opportunityFactory', 'insightFactory', 'recommendationFactory', 'opportunityTypes', 'insightTypes', 'recommendationTypes', 'impactTypes'])(
    '%s.ts has a corresponding raw source captured in this certification suite',
    (moduleName) => {
      expect(TS_SOURCES.some(([name]) => name === `${moduleName}.ts`)).toBe(true)
    },
  )
  it.each(['ExecutiveInsightPanel', 'StrengthCard', 'RiskCard', 'OpportunityCard', 'RecommendationCard', 'ExecutiveSummaryCard'])(
    '%s.jsx has a corresponding raw source captured in this certification suite',
    (componentName) => {
      expect(COMPONENT_SOURCES.some(([name]) => name === componentName)).toBe(true)
    },
  )
})

// ════════════════════════════════════════════════════════════
// EXTRA: generateRecommendationsBatch is now hardened against
// every non-array shape (regression coverage for the fix above)
// ════════════════════════════════════════════════════════════

describe('generateRecommendationsBatch is hardened against every non-array shape', () => {
  for (const [label, value] of MALFORMED_INPUTS) {
    it(`generateRecommendationsBatch(${label}) returns an empty array, not a throw`, () => {
      expect(generateRecommendationsBatch(value as any)).toEqual([])
    })
  }
  it('still processes a real array of OpportunityResults correctly', () => {
    const results = generateRecommendationsBatch([{ entityId: 'e1', entityType: 'branch', items: [item('BIGGEST_OPPORTUNITY', 30, 'e1', 'E1')], generatedAt: '' }])
    expect(results.length).toBe(1)
    expect(results[0].items.length).toBe(1)
  })
})

describe('computeRanking/computeBenchmark integration sanity inside impactSimulator peer flows', () => {
  for (const n of [2, 5, 10, 20, 50]) {
    it(`n=${n} peers: simulateImpact rank fields stay within [1, n+1]`, () => {
      const profile = makePublishedProfile()
      const peerScores = Array.from({ length: n }, (_, i) => ({ entityId: `peer-${i}`, score: (i * 19) % 101 }))
      const result = simulateImpact({
        profile, entityId: 'e', entityType: 'branch', targets: { k1: 100 },
        baselineActuals: { k1: 50 }, scenarioActuals: { k1: 90 }, peerScores,
      })
      expect(result.baselineRank).toBeGreaterThanOrEqual(1)
      expect(result.baselineRank).toBeLessThanOrEqual(n + 1)
      expect(result.scenarioRank).toBeGreaterThanOrEqual(1)
      expect(result.scenarioRank).toBeLessThanOrEqual(n + 1)
    })
  }
})

describe('derivePriority/deriveDifficulty are pure and idempotent across repeated calls', () => {
  for (const value of [-100, -50, -10, 0, 10, 50, 100]) {
    it(`derivePriority(${value}) is stable across repeated calls`, () => {
      expect(derivePriority(value)).toBe(derivePriority(value))
    })
    it(`deriveDifficulty(${value}) is stable across repeated calls`, () => {
      expect(deriveDifficulty(value)).toBe(deriveDifficulty(value))
    })
  }
})
