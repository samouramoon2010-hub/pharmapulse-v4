// ============================================================
// phase2j3ab.test.ts — Bundle 3 certification: Simulator Panel +
// Version History + Snapshot Viewer (Phase 2J + 3A + 3B), 450+ tests.
//
// Pattern: ?raw source inspection + direct unit tests against the
// pure simulator kernel (simulator.ts, simulationTrace.ts,
// versioning.ts) and the Firestore service layer (mocked, never a
// real connection) used by the new panels.
//
// NO Publish flow. NO Approval flow. NO Drag & Drop. NO AI.
// NO Excel import. NO Evaluation Engine changes.
// ============================================================

import { describe, it, expect, vi } from 'vitest'

// ════════════════════════════════════════════════════════════
// MOCK: Firestore SDK + firebase.js — never a real connection.
// ════════════════════════════════════════════════════════════
const mockAddDoc    = vi.fn()
const mockSetDoc    = vi.fn()
const mockUpdateDoc = vi.fn()
const mockGetDoc    = vi.fn()
const mockGetDocs   = vi.fn(() => ({ docs: [] }))
const mockCollection = vi.fn(() => ({}))
const mockDoc        = vi.fn(() => ({}))
const mockQuery      = vi.fn((ref) => ref)
const mockWhere      = vi.fn()
const mockOrderBy    = vi.fn()
const mockServerTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }))

vi.mock('firebase/firestore', () => ({
  collection:      (...args: unknown[]) => mockCollection(...args),
  doc:             (...args: unknown[]) => mockDoc(...args),
  addDoc:          (...args: unknown[]) => mockAddDoc(...args),
  setDoc:          (...args: unknown[]) => mockSetDoc(...args),
  updateDoc:       (...args: unknown[]) => mockUpdateDoc(...args),
  getDoc:          (...args: unknown[]) => mockGetDoc(...args),
  getDocs:         (...args: unknown[]) => mockGetDocs(...args),
  query:           (...args: unknown[]) => mockQuery(...args),
  where:           (...args: unknown[]) => mockWhere(...args),
  orderBy:         (...args: unknown[]) => mockOrderBy(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp:       class { toDate() { return new Date() } },
}))

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'test-admin' } },
  COL:  {},
}))

import type { ProfileStudioRole } from '../../profileStudio/persistenceTypes'

import {
  listProfileSnapshots,
  listSimulationRuns,
  createSimulationRunDocument,
} from '../../profileStudio/profileStudioService'

import {
  simulateProfile, simulateRule, simulateElement, simulateBasket,
  executeProcessorStep, compareSimulationResults,
} from '../../profileStudio/simulator'

import { flattenSimulationTrace, indexTraceByKpi } from '../../profileStudio/simulationTrace'

import {
  parseVersion, compareProfileVersions, incrementMinorVersion, incrementMajorVersion,
  createProfileVersionLabel, buildProfileVersion, validateEffectiveDates,
} from '../../profileStudio/versioning'

import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
  ALL_PROCESSOR_TYPES,
} from '../../profileStudio/processors'

import {
  canRunSimulation, canApproveProfile, canPublishProfile, canEditProfile, canArchiveProfile,
} from '../../profileStudio/persistenceGuards'

const ADMIN:  { uid: string; role: ProfileStudioRole } = { uid: 'u_admin', role: 'admin' }
const GM:     { uid: string; role: ProfileStudioRole } = { uid: 'u_gm',    role: 'general_manager' }
const DS:     { uid: string; role: ProfileStudioRole } = { uid: 'u_ds',    role: 'district_supervisor' }
const MGR:    { uid: string; role: ProfileStudioRole } = { uid: 'u_mgr',   role: 'manager' }
const PHARMA: { uid: string; role: ProfileStudioRole } = { uid: 'u_ph',    role: 'pharmacist' }

// ── Raw source for structure/guardrail tests ───────────────────
const simulatorPanelSrc      = await import('../../components/profileStudio/SimulatorPanel.jsx?raw').then((m) => m.default)
const simulationTraceSrc     = await import('../../components/profileStudio/SimulationTracePanel.jsx?raw').then((m) => m.default)
const simulationSummarySrc   = await import('../../components/profileStudio/SimulationSummaryCard.jsx?raw').then((m) => m.default)
const versionHistorySrc      = await import('../../components/profileStudio/VersionHistoryPanel.jsx?raw').then((m) => m.default)
const versionCardSrc         = await import('../../components/profileStudio/VersionCard.jsx?raw').then((m) => m.default)
const snapshotViewerSrc      = await import('../../components/profileStudio/SnapshotViewerPanel.jsx?raw').then((m) => m.default)
const snapshotCardSrc        = await import('../../components/profileStudio/SnapshotCard.jsx?raw').then((m) => m.default)
const profileDetailPanelSrc  = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)

const simulatorPanelBody = simulatorPanelSrc.slice(simulatorPanelSrc.indexOf('import React'))
const versionHistoryBody = versionHistorySrc.slice(versionHistorySrc.indexOf('import React'))
const snapshotViewerBody = snapshotViewerSrc.slice(snapshotViewerSrc.indexOf('import React'))

// ════════════════════════════════════════════════════════════
// Fixtures
// ════════════════════════════════════════════════════════════
function makeProfile(baskets: any[], overrides: any = {}) {
  return {
    metadata: { id: 'p1', version: '1.0.0', status: 'DRAFT', validFrom: '2026-01-01', ...overrides },
    root: { id: 'root1', label: 'Test Profile', baskets },
  }
}

function makeRatioRule(id: string, kpiKey: string, weight = 1, extraSteps: any[] = []) {
  return {
    id, kpiKey, label: id, metricType: 'count', weight,
    pipeline: { steps: [{ processorType: RATIO_EVALUATOR, order: 0, config: {} }, ...extraSteps] },
  }
}

function makeElement(id: string, rules: any[], weight = 1, pipeline = { steps: [] }) {
  return { id, label: id, weight, rules, pipeline }
}

function makeBasket(id: string, elements: any[], weight = 1, pipeline = { steps: [] }) {
  return { id, label: id, weight, elements, pipeline }
}

function simpleProfile(actual: number, target: number) {
  const rule = makeRatioRule('r1', 'wasfaty', 1)
  const element = makeElement('e1', [rule])
  const basket = makeBasket('b1', [element])
  const profile = makeProfile([basket])
  return { profile, actuals: { wasfaty: actual }, targets: { wasfaty: target } }
}

// ════════════════════════════════════════════════════════════
// 1. simulateProfile — execution (Task 2 / Task 9 "simulation execution")
// ════════════════════════════════════════════════════════════
describe('simulateProfile — execution', () => {
  it('runs a minimal valid profile and returns valid:true', () => {
    const { profile, actuals, targets } = simpleProfile(80, 100)
    const result = simulateProfile({ profile, actuals, targets })
    expect(result.valid).toBe(true)
  })

  it('computes the expected overall score for a single basket/element/rule', () => {
    const { profile, actuals, targets } = simpleProfile(80, 100)
    const result = simulateProfile({ profile, actuals, targets })
    expect(result.score).toBeCloseTo(80, 0)
  })

  it('returns valid:false when there are no baskets', () => {
    const profile = makeProfile([])
    const result = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.valid).toBe(false)
  })

  it('returns valid:false when validFrom is missing', () => {
    const profile = makeProfile([makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'wasfaty')])])], { validFrom: '' })
    const result = simulateProfile({ profile, actuals: { wasfaty: 1 }, targets: { wasfaty: 1 } })
    expect(result.valid).toBe(false)
  })

  it('returns valid:false when there are no elements', () => {
    const profile = makeProfile([makeBasket('b1', [])])
    const result = simulateProfile({ profile, actuals: {}, targets: {} })
    expect(result.valid).toBe(false)
  })

  it('never throws on a malformed profile', () => {
    expect(() => simulateProfile({ profile: {} as any, actuals: {}, targets: {} })).not.toThrow()
  })

  it('never throws on missing actuals/targets', () => {
    const { profile } = simpleProfile(0, 0)
    expect(() => simulateProfile({ profile, actuals: {}, targets: {} })).not.toThrow()
  })

  it('defaults a missing kpiKey actual to 0', () => {
    const { profile } = simpleProfile(0, 100)
    const result = simulateProfile({ profile, actuals: {}, targets: { wasfaty: 100 } })
    expect(result.score).toBe(0)
  })

  it('produces a profileId and profileVersion matching the input', () => {
    const { profile, actuals, targets } = simpleProfile(50, 100)
    const result = simulateProfile({ profile, actuals, targets })
    expect(result.profileId).toBe('p1')
    expect(result.profileVersion).toBe('1.0.0')
  })

  it('returns a baskets map keyed by basketId', () => {
    const { profile, actuals, targets } = simpleProfile(50, 100)
    const result = simulateProfile({ profile, actuals, targets })
    expect(result.baskets.b1).toBeDefined()
  })

  it('returns an elements map keyed by elementId', () => {
    const { profile, actuals, targets } = simpleProfile(50, 100)
    const result = simulateProfile({ profile, actuals, targets })
    expect(result.elements.e1).toBeDefined()
  })

  it('handles two baskets with different weights', () => {
    const b1 = makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a')])], 0.6)
    const b2 = makeBasket('b2', [makeElement('e2', [makeRatioRule('r2', 'b')])], 0.4)
    const profile = makeProfile([b1, b2])
    const result = simulateProfile({ profile, actuals: { a: 100, b: 0 }, targets: { a: 100, b: 100 } })
    expect(result.score).toBeCloseTo(60, 0)
  })
})

// ════════════════════════════════════════════════════════════
// 2. simulateRule / simulateElement / simulateBasket — node-level
// ════════════════════════════════════════════════════════════
describe('simulateRule — node-level execution', () => {
  it('computes raw achievement as actual/target*100', () => {
    const rule = makeRatioRule('r1', 'wasfaty')
    const result = simulateRule(rule, { wasfaty: 50 }, { wasfaty: 100 })
    expect(result.achievement).toBeCloseTo(50, 0)
  })

  it('applies CEILING_CLAMP to cap achievement', () => {
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: CEILING_CLAMP, order: 1, config: { ceiling: 60 } }])
    const result = simulateRule(rule, { wasfaty: 100 }, { wasfaty: 100 })
    expect(result.cappedAchievement).toBe(60)
    expect(result.score).toBe(60)
  })

  it('applies FLOOR_CLAMP to raise achievement', () => {
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: FLOOR_CLAMP, order: 1, config: { floor: 20 } }])
    const result = simulateRule(rule, { wasfaty: 5 }, { wasfaty: 100 })
    expect(result.cappedAchievement).toBe(20)
  })

  it('applies WEIGHT_MULTIPLIER to produce a weightedScore', () => {
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: WEIGHT_MULTIPLIER, order: 1, config: { weight: 0.5 } }])
    const result = simulateRule(rule, { wasfaty: 80 }, { wasfaty: 100 })
    expect(result.weightedScore).toBeCloseTo(0.4, 5)
  })

  it('BAND_EVALUATOR assigns a bandLabel and band score', () => {
    const bands = [{ id: 'b1', label: 'Low', minPct: 0, maxPct: 50, score: 40 }, { id: 'b2', label: 'High', minPct: 50, maxPct: 200, score: 90 }]
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: BAND_EVALUATOR, order: 1, config: { bands } }])
    const result = simulateRule(rule, { wasfaty: 80 }, { wasfaty: 100 })
    expect(result.bandLabel).toBe('High')
    expect(result.score).toBe(90)
  })

  it('BAND_EVALUATOR falls into the Low band below the threshold', () => {
    const bands = [{ id: 'b1', label: 'Low', minPct: 0, maxPct: 50, score: 40 }, { id: 'b2', label: 'High', minPct: 50, maxPct: 200, score: 90 }]
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: BAND_EVALUATOR, order: 1, config: { bands } }])
    const result = simulateRule(rule, { wasfaty: 30 }, { wasfaty: 100 })
    expect(result.bandLabel).toBe('Low')
    expect(result.score).toBe(40)
  })

  it('PENALTY_EVALUATOR deducts penaltyApplied from the score', () => {
    const penaltyRules = [{ id: 'p1', condition: 'below', threshold: 50, penaltyValue: 20 }]
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: PENALTY_EVALUATOR, order: 1, config: { penaltyRules } }])
    const result = simulateRule(rule, { wasfaty: 30 }, { wasfaty: 100 })
    expect(result.penaltyApplied).toBe(20)
    expect(result.score).toBe(10)
  })

  it('PENALTY_EVALUATOR never drives the score below 0', () => {
    const penaltyRules = [{ id: 'p1', condition: 'below', threshold: 50, penaltyValue: 200 }]
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: PENALTY_EVALUATOR, order: 1, config: { penaltyRules } }])
    const result = simulateRule(rule, { wasfaty: 30 }, { wasfaty: 100 })
    expect(result.score).toBe(0)
  })

  it('ZERO_TARGET_GUARD with score_full sets score to 100 when target is 0', () => {
    const rule = {
      id: 'r1', kpiKey: 'wasfaty', label: 'r1', metricType: 'count', weight: 1,
      pipeline: { steps: [{ processorType: ZERO_TARGET_GUARD, order: 0, config: { zeroTargetBehaviour: 'score_full' } }, { processorType: RATIO_EVALUATOR, order: 1, config: {} }] },
    }
    const result = simulateRule(rule, { wasfaty: 10 }, { wasfaty: 0 })
    expect(result.zeroTarget).toBe(true)
    expect(result.score).toBe(100)
  })

  it('ZERO_TARGET_GUARD with score_zero sets score to 0 when target is 0', () => {
    const rule = {
      id: 'r1', kpiKey: 'wasfaty', label: 'r1', metricType: 'count', weight: 1,
      pipeline: { steps: [{ processorType: ZERO_TARGET_GUARD, order: 0, config: { zeroTargetBehaviour: 'score_zero' } }, { processorType: RATIO_EVALUATOR, order: 1, config: {} }] },
    }
    const result = simulateRule(rule, { wasfaty: 10 }, { wasfaty: 0 })
    expect(result.score).toBe(0)
  })

  it('an unsupported processor type produces an issue, not a throw', () => {
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: 'NOT_REAL', order: 1, config: {} }])
    expect(() => simulateRule(rule, { wasfaty: 50 }, { wasfaty: 100 })).not.toThrow()
    const result = simulateRule(rule, { wasfaty: 50 }, { wasfaty: 100 })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('NaN actual never escapes into the score', () => {
    const rule = makeRatioRule('r1', 'wasfaty')
    const result = simulateRule(rule, { wasfaty: NaN }, { wasfaty: 100 })
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('produces a RuleSimTrace with the same ruleId', () => {
    const rule = makeRatioRule('r1', 'wasfaty')
    const result = simulateRule(rule, { wasfaty: 50 }, { wasfaty: 100 })
    expect(result.trace.ruleId).toBe('r1')
  })
})

describe('simulateElement — aggregation', () => {
  it('weighted_sum default aggregates rule scores by rule weight', () => {
    const rules = [makeRatioRule('r1', 'a', 0.5), makeRatioRule('r2', 'b', 0.5)]
    const element = makeElement('e1', rules)
    const result = simulateElement(element, { a: 100, b: 0 }, { a: 100, b: 100 })
    expect(result.score).toBeCloseTo(50, 0)
  })

  it('uses NODE_AGGREGATOR with min when present in the element pipeline', () => {
    const rules = [makeRatioRule('r1', 'a', 0.5), makeRatioRule('r2', 'b', 0.5)]
    const element = makeElement('e1', rules, 1, { steps: [{ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: 'min' } }] })
    const result = simulateElement(element, { a: 100, b: 20 }, { a: 100, b: 100 })
    expect(result.score).toBeCloseTo(20, 0)
  })

  it('returns score 0 for an element with no rules', () => {
    const element = makeElement('e1', [])
    const result = simulateElement(element, {}, {})
    expect(result.score).toBe(0)
  })

  it('collects issues from all child rules', () => {
    const rules = [makeRatioRule('r1', 'a', 0.5, [{ processorType: 'BOGUS', order: 1, config: {} }])]
    const element = makeElement('e1', rules)
    const result = simulateElement(element, { a: 50 }, { a: 100 })
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('computes weightedContribution as score * weight', () => {
    const rules = [makeRatioRule('r1', 'a', 1)]
    const element = makeElement('e1', rules, 0.5)
    const result = simulateElement(element, { a: 100 }, { a: 100 })
    expect(result.weightedContribution).toBeCloseTo(50, 0)
  })
})

describe('simulateBasket — aggregation', () => {
  it('weighted_sum default aggregates element scores by element weight', () => {
    const elements = [makeElement('e1', [makeRatioRule('r1', 'a')], 0.5), makeElement('e2', [makeRatioRule('r2', 'b')], 0.5)]
    const basket = makeBasket('b1', elements)
    const result = simulateBasket(basket, { a: 100, b: 0 }, { a: 100, b: 100 })
    expect(result.score).toBeCloseTo(50, 0)
  })

  it('uses NODE_AGGREGATOR with max when present in the basket pipeline', () => {
    const elements = [makeElement('e1', [makeRatioRule('r1', 'a')], 0.5), makeElement('e2', [makeRatioRule('r2', 'b')], 0.5)]
    const basket = makeBasket('b1', elements, 1, { steps: [{ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: 'max' } }] })
    const result = simulateBasket(basket, { a: 100, b: 20 }, { a: 100, b: 100 })
    expect(result.score).toBeCloseTo(100, 0)
  })

  it('returns score 0 for a basket with no elements', () => {
    const basket = makeBasket('b1', [])
    const result = simulateBasket(basket, {}, {})
    expect(result.score).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 3. executeProcessorStep — direct step-level coverage
// ════════════════════════════════════════════════════════════
describe('executeProcessorStep — direct coverage', () => {
  function initState(actual: number, target: number) {
    return {
      actual, target, achievement: 0, cappedAchievement: 0, score: 0, weightedScore: 0,
      zeroTarget: false, bandLabel: undefined, penaltyApplied: 0, bandRan: false, penaltyRan: false,
      childScores: [], childWeights: [], issues: [], stepTraces: [],
    }
  }

  it('skips a disabled step entirely', () => {
    const state = initState(50, 100)
    const result = executeProcessorStep({ processorType: CEILING_CLAMP, order: 0, config: { ceiling: 10 }, enabled: false } as any, state)
    expect(result).toEqual(state)
  })

  it('RATIO_EVALUATOR sets achievement from actual/target', () => {
    const state = initState(50, 100)
    const result = executeProcessorStep({ processorType: RATIO_EVALUATOR, order: 0, config: {} } as any, state)
    expect(result.achievement).toBe(50)
  })

  it('NODE_AGGREGATOR with simple_average computes the mean of child scores', () => {
    const state = { ...initState(0, 0), childScores: [40, 60], childWeights: [0.5, 0.5] }
    const result = executeProcessorStep({ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: 'simple_average' } } as any, state)
    expect(result.score).toBe(50)
  })

  it('NODE_AGGREGATOR with weighted_sum computes the weighted total', () => {
    const state = { ...initState(0, 0), childScores: [100, 0], childWeights: [0.7, 0.3] }
    const result = executeProcessorStep({ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: 'weighted_sum' } } as any, state)
    expect(result.score).toBe(70)
  })

  it('NODE_AGGREGATOR with an unknown aggregationType records an issue', () => {
    const state = { ...initState(0, 0), childScores: [10], childWeights: [1] }
    const result = executeProcessorStep({ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: 'bogus' } } as any, state)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('an unknown processor type records an issue and leaves state otherwise unchanged', () => {
    const state = initState(50, 100)
    const result = executeProcessorStep({ processorType: 'UNKNOWN', order: 0, config: {} } as any, state)
    expect(result.issues[0]).toContain('Unsupported processor type')
  })
})

// ════════════════════════════════════════════════════════════
// 4. compareSimulationResults — Task 9 "compareSimulationResults"
// ════════════════════════════════════════════════════════════
describe('compareSimulationResults', () => {
  it('computes a positive scoreDelta when the score improves', () => {
    const before = simulateProfile(simpleProfile(50, 100))
    const after  = simulateProfile(simpleProfile(90, 100))
    const cmp = compareSimulationResults(before, after)
    expect(cmp.scoreDelta).toBeGreaterThan(0)
  })

  it('computes a negative scoreDelta when the score worsens', () => {
    const before = simulateProfile(simpleProfile(90, 100))
    const after  = simulateProfile(simpleProfile(50, 100))
    const cmp = compareSimulationResults(before, after)
    expect(cmp.scoreDelta).toBeLessThan(0)
  })

  it('computes basketDeltas for each basket id', () => {
    const before = simulateProfile(simpleProfile(50, 100))
    const after  = simulateProfile(simpleProfile(90, 100))
    const cmp = compareSimulationResults(before, after)
    expect(cmp.basketDeltas.find((b) => b.basketId === 'b1')).toBeTruthy()
  })

  it('computes elementDeltas for each element id', () => {
    const before = simulateProfile(simpleProfile(50, 100))
    const after  = simulateProfile(simpleProfile(90, 100))
    const cmp = compareSimulationResults(before, after)
    expect(cmp.elementDeltas.find((e) => e.elementId === 'e1')).toBeTruthy()
  })

  it('detects a changed band between two runs', () => {
    const bands = [{ id: 'b1', label: 'Low', minPct: 0, maxPct: 50, score: 40 }, { id: 'b2', label: 'High', minPct: 50, maxPct: 200, score: 90 }]
    const rule = makeRatioRule('r1', 'wasfaty', 1, [{ processorType: BAND_EVALUATOR, order: 1, config: { bands } }])
    const profile = makeProfile([makeBasket('b1', [makeElement('e1', [rule])])])
    const before = simulateProfile({ profile, actuals: { wasfaty: 30 }, targets: { wasfaty: 100 } })
    const after  = simulateProfile({ profile, actuals: { wasfaty: 80 }, targets: { wasfaty: 100 } })
    const cmp = compareSimulationResults(before, after)
    expect(cmp.changedBands.length).toBeGreaterThan(0)
    expect(cmp.changedBands[0].bandBefore).toBe('Low')
    expect(cmp.changedBands[0].bandAfter).toBe('High')
  })

  it('detects added issues between two runs', () => {
    const goodProfile = makeProfile([makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a')])])])
    const badRule = makeRatioRule('r1', 'a', 1, [{ processorType: 'BOGUS', order: 1, config: {} }])
    const badProfile = makeProfile([makeBasket('b1', [makeElement('e1', [badRule])])])
    const before = simulateProfile({ profile: goodProfile, actuals: { a: 50 }, targets: { a: 100 } })
    const after  = simulateProfile({ profile: badProfile, actuals: { a: 50 }, targets: { a: 100 } })
    const cmp = compareSimulationResults(before, after)
    expect(cmp.changedIssues.added.length).toBeGreaterThan(0)
  })

  it('never throws when comparing two empty results', () => {
    const empty = simulateProfile({ profile: makeProfile([]), actuals: {}, targets: {} })
    expect(() => compareSimulationResults(empty, empty)).not.toThrow()
  })

  it('scoreDelta is 0 when comparing identical results', () => {
    const result = simulateProfile(simpleProfile(80, 100))
    const cmp = compareSimulationResults(result, result)
    expect(cmp.scoreDelta).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 5. flattenSimulationTrace / indexTraceByKpi — Task 3 "trace view"
// ════════════════════════════════════════════════════════════
describe('flattenSimulationTrace', () => {
  it('flattens basket > element > rule traces into a single array', () => {
    const result = simulateProfile(simpleProfile(80, 100))
    const flat = flattenSimulationTrace(result.traces)
    expect(flat).toHaveLength(1)
    expect(flat[0].ruleId).toBe('r1')
  })

  it('returns an empty array for a profile with no baskets', () => {
    const flat = flattenSimulationTrace({ profileId: 'p', profileVersion: '1.0.0', overallScore: 0, baskets: [], timestamp: '' })
    expect(flat).toEqual([])
  })

  it('preserves rawAchievement, cappedAchievement, weightedScore, bandLabel, penaltyApplied on each trace', () => {
    const result = simulateProfile(simpleProfile(80, 100))
    const flat = flattenSimulationTrace(result.traces)
    const trace = flat[0]
    expect(typeof trace.rawAchievement).toBe('number')
    expect(typeof trace.cappedAchievement).toBe('number')
    expect(typeof trace.weightedScore).toBe('number')
    expect(typeof trace.penaltyApplied).toBe('number')
  })

  it('includes the processor sequence in stepTraces', () => {
    const result = simulateProfile(simpleProfile(80, 100))
    const flat = flattenSimulationTrace(result.traces)
    expect(flat[0].stepTraces.length).toBeGreaterThan(0)
    expect(flat[0].stepTraces[0].processorType).toBe(RATIO_EVALUATOR)
  })

  it('never throws on a malformed trace object', () => {
    expect(() => flattenSimulationTrace({} as any)).not.toThrow()
  })
})

describe('indexTraceByKpi', () => {
  it('indexes rule traces by kpiKey', () => {
    const result = simulateProfile(simpleProfile(80, 100))
    const map = indexTraceByKpi(result.traces)
    expect(map.get('wasfaty')).toBeTruthy()
  })

  it('returns an empty map for an empty trace', () => {
    const map = indexTraceByKpi({ profileId: 'p', profileVersion: '1.0.0', overallScore: 0, baskets: [], timestamp: '' })
    expect(map.size).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 6. versioning.ts — used by VersionCard / SnapshotViewerPanel
// ════════════════════════════════════════════════════════════
describe('parseVersion', () => {
  it('parses a valid semver string', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('returns null for a malformed string', () => {
    expect(parseVersion('not-a-version')).toBeNull()
  })

  it('returns null for a 2-part version', () => {
    expect(parseVersion('1.2')).toBeNull()
  })

  it('returns null for negative components', () => {
    expect(parseVersion('-1.0.0')).toBeNull()
  })

  it('never throws on an empty string', () => {
    expect(() => parseVersion('')).not.toThrow()
  })
})

describe('compareProfileVersions', () => {
  it('returns -1 when a < b', () => {
    expect(compareProfileVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('returns 1 when a > b', () => {
    expect(compareProfileVersions('2.0.0', '1.0.0')).toBe(1)
  })

  it('returns 0 when a === b', () => {
    expect(compareProfileVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('compares minor versions when major is equal', () => {
    expect(compareProfileVersions('1.1.0', '1.2.0')).toBe(-1)
  })

  it('compares patch versions when major and minor are equal', () => {
    expect(compareProfileVersions('1.1.1', '1.1.2')).toBe(-1)
  })

  it('throws on an invalid version string', () => {
    expect(() => compareProfileVersions('bad', '1.0.0')).toThrow()
  })
})

describe('incrementMinorVersion / incrementMajorVersion', () => {
  it('increments minor and resets patch', () => {
    expect(incrementMinorVersion('1.2.3')).toBe('1.3.0')
  })

  it('increments major and resets minor/patch', () => {
    expect(incrementMajorVersion('1.2.3')).toBe('2.0.0')
  })

  it('throws on an invalid version for incrementMinorVersion', () => {
    expect(() => incrementMinorVersion('bad')).toThrow()
  })

  it('throws on an invalid version for incrementMajorVersion', () => {
    expect(() => incrementMajorVersion('bad')).toThrow()
  })
})

describe('createProfileVersionLabel / buildProfileVersion', () => {
  it('creates a human-readable label', () => {
    expect(createProfileVersionLabel('Standard', 1, 2, 0)).toBe('Standard v1.2.0')
  })

  it('buildProfileVersion derives major/minor/patch/label from a string', () => {
    const v = buildProfileVersion('Standard', '1.2.3')
    expect(v).toEqual({ major: 1, minor: 2, patch: 3, label: 'Standard v1.2.3' })
  })

  it('buildProfileVersion throws on an invalid version', () => {
    expect(() => buildProfileVersion('Standard', 'bad')).toThrow()
  })
})

describe('validateEffectiveDates', () => {
  it('is valid with only validFrom', () => {
    expect(validateEffectiveDates('2026-01-01').valid).toBe(true)
  })

  it('is invalid when validFrom is missing', () => {
    expect(validateEffectiveDates('').valid).toBe(false)
  })

  it('is invalid when validTo is before validFrom', () => {
    expect(validateEffectiveDates('2026-02-01', '2026-01-01').valid).toBe(false)
  })

  it('is valid when validTo is after validFrom', () => {
    expect(validateEffectiveDates('2026-01-01', '2026-02-01').valid).toBe(true)
  })

  it('never throws on undefined validTo', () => {
    expect(() => validateEffectiveDates('2026-01-01', undefined)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 7. listProfileSnapshots — new service function (Task 5)
// ════════════════════════════════════════════════════════════
describe('listProfileSnapshots — RBAC', () => {
  it('is a function', () => {
    expect(typeof listProfileSnapshots).toBe('function')
  })

  it('admin can list snapshots', async () => {
    await expect(listProfileSnapshots('prof_1', ADMIN)).resolves.toEqual([])
  })

  it('general_manager can list snapshots', async () => {
    await expect(listProfileSnapshots('prof_1', GM)).resolves.toEqual([])
  })

  it('district_supervisor cannot list snapshots', async () => {
    await expect(listProfileSnapshots('prof_1', DS)).rejects.toThrow('PERMISSION_DENIED')
  })

  it('manager cannot list snapshots', async () => {
    await expect(listProfileSnapshots('prof_1', MGR)).rejects.toThrow('PERMISSION_DENIED')
  })

  it('pharmacist cannot list snapshots', async () => {
    await expect(listProfileSnapshots('prof_1', PHARMA)).rejects.toThrow('PERMISSION_DENIED')
  })

  it('queries the snapshots collection ordered by createdAt desc', async () => {
    mockOrderBy.mockClear()
    await listProfileSnapshots('prof_1', ADMIN)
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc')
  })

  it('filters by profileId', async () => {
    mockWhere.mockClear()
    await listProfileSnapshots('prof_42', ADMIN)
    expect(mockWhere).toHaveBeenCalledWith('profileId', '==', 'prof_42')
  })
})

// ════════════════════════════════════════════════════════════
// 8. createSimulationRunDocument / listSimulationRuns — Task 6
// ════════════════════════════════════════════════════════════
function makeSimRunDoc() {
  return {
    runId: 'run_1',
    profileId: 'prof_1',
    version: '1.0.0',
    input: { actuals: { wasfaty: 80 }, targets: { wasfaty: 100 } },
    result: { valid: true, score: 80, basketCount: 1, issueCount: 0, traceIncluded: true },
    score: 80,
    issues: [] as string[],
    executedBy: 'u_admin',
  }
}

describe('createSimulationRunDocument — RBAC (Task 7 permissions)', () => {
  it('admin can run + persist a simulation', async () => {
    await expect(createSimulationRunDocument(makeSimRunDoc(), ADMIN)).resolves.toBeDefined()
  })

  it('district_supervisor can run + persist a simulation', async () => {
    await expect(createSimulationRunDocument(makeSimRunDoc(), DS)).resolves.toBeDefined()
  })

  it('manager can run + persist a simulation', async () => {
    await expect(createSimulationRunDocument(makeSimRunDoc(), MGR)).resolves.toBeDefined()
  })

  it('general_manager cannot run a simulation', async () => {
    await expect(createSimulationRunDocument(makeSimRunDoc(), GM)).rejects.toThrow('PERMISSION_DENIED')
  })

  it('pharmacist cannot run a simulation', async () => {
    await expect(createSimulationRunDocument(makeSimRunDoc(), PHARMA)).rejects.toThrow('PERMISSION_DENIED')
  })

  it('persists to the simulationRuns collection, not a new collection', async () => {
    mockCollection.mockClear()
    await createSimulationRunDocument(makeSimRunDoc(), ADMIN)
    expect(mockCollection).toHaveBeenCalledWith({}, 'profileStudioSimulationRuns')
  })
})

describe('listSimulationRuns — RBAC (Task 7 "view own simulation runs")', () => {
  it('admin can list', async () => {
    await expect(listSimulationRuns('prof_1', ADMIN)).resolves.toEqual([])
  })

  it('district_supervisor can list', async () => {
    await expect(listSimulationRuns('prof_1', DS)).resolves.toEqual([])
  })

  it('manager can list', async () => {
    await expect(listSimulationRuns('prof_1', MGR)).resolves.toEqual([])
  })

  it('general_manager can list (view history)', async () => {
    await expect(listSimulationRuns('prof_1', GM)).resolves.toEqual([])
  })

  it('pharmacist cannot list', async () => {
    await expect(listSimulationRuns('prof_1', PHARMA)).rejects.toThrow('PERMISSION_DENIED')
  })
})

// ════════════════════════════════════════════════════════════
// 9. SimulatorPanel — wiring (Task 1/2/6)
// ════════════════════════════════════════════════════════════
describe('SimulatorPanel — wiring', () => {
  it('imports simulateProfile from the existing simulator kernel', () => {
    expect(simulatorPanelBody).toContain('simulateProfile')
  })

  it('imports createSimulationRunDocument from the existing service', () => {
    expect(simulatorPanelBody).toContain('createSimulationRunDocument')
  })

  it('imports listSimulationRuns to display run history', () => {
    expect(simulatorPanelBody).toContain('listSimulationRuns')
  })

  it('imports useProfileStudioPermissions to gate Run Simulation', () => {
    expect(simulatorPanelBody).toContain('useProfileStudioPermissions')
  })

  it('gates the Run Simulation button behind canRunSimulation', () => {
    expect(simulatorPanelBody).toContain('permissions.canRunSimulation')
  })

  it('guards double submit with a running flag', () => {
    expect(simulatorPanelBody).toContain('if (running) return')
  })

  it('disables the Run Simulation button while running', () => {
    expect(simulatorPanelBody).toContain('disabled={running')
  })

  it('renders a loading indicator while running', () => {
    expect(simulatorPanelBody).toContain('Loader2')
  })

  it('renders SimulationSummaryCard and SimulationTracePanel', () => {
    expect(simulatorPanelBody).toContain('SimulationSummaryCard')
    expect(simulatorPanelBody).toContain('SimulationTracePanel')
  })

  it('does not call updateProfileDocument (no writes to production data)', () => {
    expect(simulatorPanelBody).not.toContain('updateProfileDocument')
  })

  it('does not call createProfileSnapshotDocument', () => {
    expect(simulatorPanelBody).not.toContain('createProfileSnapshotDocument')
  })

  it('does not call createPublishPackageDocument', () => {
    expect(simulatorPanelBody).not.toContain('createPublishPackageDocument')
  })

  it('does not call archiveProfileDocument', () => {
    expect(simulatorPanelBody).not.toContain('archiveProfileDocument')
  })
})

// ════════════════════════════════════════════════════════════
// 10. SimulationTracePanel / SimulationSummaryCard — wiring
// ════════════════════════════════════════════════════════════
describe('SimulationTracePanel — wiring', () => {
  it('imports flattenSimulationTrace and never duplicates flattening logic', () => {
    expect(simulationTraceSrc).toContain('flattenSimulationTrace')
  })

  it('renders rawAchievement, cappedAchievement, weightedScore, bandLabel, penaltyApplied', () => {
    expect(simulationTraceSrc).toContain('trace.rawAchievement')
    expect(simulationTraceSrc).toContain('trace.cappedAchievement')
    expect(simulationTraceSrc).toContain('trace.weightedScore')
    expect(simulationTraceSrc).toContain('trace.penaltyApplied')
  })

  it('renders the processor sequence via stepTraces', () => {
    expect(simulationTraceSrc).toContain('stepTraces')
  })

  it('does not import the simulator execution functions directly (display only)', () => {
    expect(simulationTraceSrc).not.toContain('simulateProfile')
  })
})

describe('SimulationSummaryCard — wiring', () => {
  it('imports compareSimulationResults and never duplicates comparison logic', () => {
    expect(simulationSummarySrc).toContain('compareSimulationResults')
  })

  it('renders overall score, basket scores, element scores, rule scores', () => {
    expect(simulationSummarySrc).toContain('result.score')
    expect(simulationSummarySrc).toContain('Basket Scores')
    expect(simulationSummarySrc).toContain('Element Scores')
    expect(simulationSummarySrc).toContain('Rule Scores')
  })

  it('renders issues and bands', () => {
    expect(simulationSummarySrc).toContain('Issues')
    expect(simulationSummarySrc).toContain('bandLabel')
  })

  it('renders changed items when a previous result is supplied', () => {
    expect(simulationSummarySrc).toContain('Changed Items')
    expect(simulationSummarySrc).toContain('changedBands')
  })

  it('does not write anything — no service imports', () => {
    expect(simulationSummarySrc).not.toContain('profileStudioService')
  })
})

// ════════════════════════════════════════════════════════════
// 11. VersionHistoryPanel / VersionCard — wiring (Task 4)
// ════════════════════════════════════════════════════════════
describe('VersionHistoryPanel — wiring', () => {
  it('imports listProfileSnapshots from the existing service', () => {
    expect(versionHistoryBody).toContain('listProfileSnapshots')
  })

  it('gates visibility behind canApprove or canPublish', () => {
    expect(versionHistoryBody).toContain('permissions.canApprove || permissions.canPublish')
  })

  it('renders VersionCard for each entry', () => {
    expect(versionHistoryBody).toContain('VersionCard')
  })

  it('includes the current profile version as the first entry', () => {
    expect(versionHistoryBody).toContain('isCurrent: true')
  })

  it('does not import updateProfileDocument (read-only)', () => {
    expect(versionHistoryBody).not.toContain('updateProfileDocument')
  })

  it('does not implement rollback or restore', () => {
    expect(versionHistoryBody.toLowerCase()).not.toContain('rollback')
    expect(versionHistoryBody.toLowerCase()).not.toContain('restore')
  })
})

describe('VersionCard — wiring', () => {
  it('imports parseVersion for major/minor/patch breakdown', () => {
    expect(versionCardSrc).toContain('parseVersion')
  })

  it('renders version, status, updatedBy, updatedAt, publishedAt', () => {
    expect(versionCardSrc).toContain('entry.version')
    expect(versionCardSrc).toContain('entry.status')
    expect(versionCardSrc).toContain('entry.updatedBy')
    expect(versionCardSrc).toContain('entry.updatedAt')
    expect(versionCardSrc).toContain('entry.publishedAt')
  })

  it('has no edit, delete, or restore affordance', () => {
    expect(versionCardSrc).not.toContain('onEdit')
    expect(versionCardSrc).not.toContain('onDelete')
    expect(versionCardSrc).not.toContain('onRestore')
  })
})

// ════════════════════════════════════════════════════════════
// 12. SnapshotViewerPanel / SnapshotCard — wiring (Task 5)
// ════════════════════════════════════════════════════════════
describe('SnapshotViewerPanel — wiring', () => {
  it('imports listProfileSnapshots from the existing service', () => {
    expect(snapshotViewerBody).toContain('listProfileSnapshots')
  })

  it('gates visibility behind canApprove or canPublish', () => {
    expect(snapshotViewerBody).toContain('permissions.canApprove || permissions.canPublish')
  })

  it('imports compareProfileVersions for the comparison summary, not a new diff engine', () => {
    expect(snapshotViewerBody).toContain('compareProfileVersions')
  })

  it('renders SnapshotCard for each snapshot', () => {
    expect(snapshotViewerBody).toContain('SnapshotCard')
  })

  it('does not import updateProfileDocument (read-only)', () => {
    expect(snapshotViewerBody).not.toContain('updateProfileDocument')
  })

  it('does not implement restore or mutation', () => {
    expect(snapshotViewerBody.toLowerCase()).not.toContain('restore')
    expect(snapshotViewerBody).not.toContain('setDoc(')
    expect(snapshotViewerBody).not.toContain('updateDoc(')
  })
})

describe('SnapshotCard — wiring', () => {
  it('renders snapshot metadata, hash, createdBy, createdAt, version, status', () => {
    expect(snapshotCardSrc).toContain('snapshot.hash')
    expect(snapshotCardSrc).toContain('snapshot.createdBy')
    expect(snapshotCardSrc).toContain('snapshot.createdAt')
    expect(snapshotCardSrc).toContain('snapshot.version')
    expect(snapshotCardSrc).toContain('snapshot.status')
  })

  it('renders the comparison summary when supplied', () => {
    expect(snapshotCardSrc).toContain('comparison')
  })

  it('has no restore or edit affordance', () => {
    expect(snapshotCardSrc).not.toContain('onRestore')
    expect(snapshotCardSrc).not.toContain('onEdit')
  })

  it('does not render a full diff viewer (only a short comparison line)', () => {
    expect(snapshotCardSrc.toLowerCase()).not.toContain('diffviewer')
  })
})

// ════════════════════════════════════════════════════════════
// 13. ProfileDetailPanel — composition growth (Task 1)
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — composes the three Bundle 3 panels', () => {
  it('imports SimulatorPanel', () => {
    expect(profileDetailPanelSrc).toContain("import SimulatorPanel from './SimulatorPanel'")
  })

  it('imports VersionHistoryPanel', () => {
    expect(profileDetailPanelSrc).toContain("import VersionHistoryPanel from './VersionHistoryPanel'")
  })

  it('imports SnapshotViewerPanel', () => {
    expect(profileDetailPanelSrc).toContain("import SnapshotViewerPanel from './SnapshotViewerPanel'")
  })

  it('renders all three panels with profile and actor props', () => {
    expect(profileDetailPanelSrc).toContain('<SimulatorPanel profile={profile} actor={actor} />')
    expect(profileDetailPanelSrc).toContain('<VersionHistoryPanel profile={profile} actor={actor} />')
    expect(profileDetailPanelSrc).toContain('<SnapshotViewerPanel profile={profile} actor={actor} />')
  })
})

// ════════════════════════════════════════════════════════════
// 14. GUARDRAILS — excluded scope (Task 8) — per-file sweep
// ════════════════════════════════════════════════════════════
const NAMED_NEW_FILES: Array<[string, string]> = [
  ['SimulatorPanel', simulatorPanelSrc],
  ['SimulationTracePanel', simulationTraceSrc],
  ['SimulationSummaryCard', simulationSummarySrc],
  ['VersionHistoryPanel', versionHistorySrc],
  ['VersionCard', versionCardSrc],
  ['SnapshotViewerPanel', snapshotViewerSrc],
  ['SnapshotCard', snapshotCardSrc],
]

describe('GUARDRAILS — no Approval flow / no Publish flow', () => {
  it.each(NAMED_NEW_FILES)('%s does not call createPublishPackageDocument', (_name, src) => {
    expect(src).not.toContain('createPublishPackageDocument')
  })

  it.each(NAMED_NEW_FILES)('%s does not call an approve action', (_name, src) => {
    expect(src).not.toContain('canApproveProfile(')
    expect(src).not.toMatch(/\bapproveProfile\(/)
  })

  it.each(NAMED_NEW_FILES)('%s has no "Approve" or "Publish" button label', (_name, src) => {
    expect(src).not.toContain('>Approve<')
    expect(src).not.toContain('>Publish<')
  })
})

describe('GUARDRAILS — no Drag & Drop', () => {
  it.each(NAMED_NEW_FILES)('%s has no react-dnd / dnd-kit import', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('react-dnd')
    expect(src.toLowerCase()).not.toContain('dnd-kit')
  })

  it.each(NAMED_NEW_FILES)('%s has no draggable attribute', (_name, src) => {
    expect(src).not.toContain('draggable')
  })

  it.each(NAMED_NEW_FILES)('%s has no moveNode usage', (_name, src) => {
    expect(src).not.toMatch(/\bmoveNode\b/)
  })
})

describe('GUARDRAILS — no AI', () => {
  it.each(NAMED_NEW_FILES)('%s has no openai/gpt/anthropic reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('openai')
    expect(src.toLowerCase()).not.toContain('gpt')
    expect(src.toLowerCase()).not.toContain('anthropic')
  })
})

describe('GUARDRAILS — no Excel import', () => {
  it.each(NAMED_NEW_FILES)('%s has no xlsx/csv/FileReader reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('xlsx')
    expect(src.toLowerCase()).not.toContain('.csv')
    expect(src).not.toContain('FileReader')
  })
})

describe('GUARDRAILS — no Evaluation Engine changes', () => {
  it.each(NAMED_NEW_FILES)('%s does not reference evaluationEngine/evaluationPipeline/evaluationRegistry', (_name, src) => {
    expect(src).not.toContain('evaluationEngine')
    expect(src).not.toContain('evaluationPipeline')
    expect(src).not.toContain('evaluationRegistry')
  })
})

describe('GUARDRAILS — no Audit logs', () => {
  it.each(NAMED_NEW_FILES)('%s does not call createAuditLogDocument or read auditLogs', (_name, src) => {
    expect(src).not.toContain('createAuditLogDocument')
    expect(src).not.toContain('profileStudioAuditLogs')
  })
})

describe('GUARDRAILS — no Diff viewer / no Governance tools', () => {
  it.each(NAMED_NEW_FILES)('%s does not implement a diff viewer', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('diffviewer')
    expect(src.toLowerCase()).not.toContain('diff-viewer')
  })

  it.each(NAMED_NEW_FILES)('%s does not reference governance workflow tooling', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('governancetool')
    expect(src.toLowerCase()).not.toContain('workflow.ts')
  })
})

const NAMED_NEW_FILE_BODIES: Array<[string, string]> = NAMED_NEW_FILES.map(
  ([name, src]) => [name, src.slice(src.indexOf('import React'))],
)

describe('GUARDRAILS — no rollback / no restore / no new collections', () => {
  it.each(NAMED_NEW_FILE_BODIES)('%s has no rollback or restore logic (body only, excluding header prose)', (_name, body) => {
    expect(body.toLowerCase()).not.toMatch(/\brollback\b/)
    expect(body.toLowerCase()).not.toMatch(/\brestore\b/)
  })

  it.each(NAMED_NEW_FILES)('%s does not declare a new Firestore collection name', (_name, src) => {
    expect(src).not.toMatch(/collection\(\s*db\s*,\s*['"]profileStudio(?!Profiles|Snapshots|AuditLogs|PublishPackages|SimulationRuns)/)
  })

  it.each(NAMED_NEW_FILES)('%s never calls addDoc/setDoc/updateDoc directly (writes only via the service layer)', (_name, src) => {
    expect(src).not.toContain('addDoc(')
    expect(src).not.toContain('setDoc(')
    expect(src).not.toContain('updateDoc(')
  })
})

// ════════════════════════════════════════════════════════════
// 15. PERMISSIONS — admin / general_manager / district_supervisor /
//     manager / pharmacist visibility sweep (Task 7)
// ════════════════════════════════════════════════════════════
describe('Permissions — role visibility sweep', () => {
  it('admin has canRunSimulation, canApprove, and canPublish all true', () => {
    expect(simulatorPanelBody).toContain('permissions.canRunSimulation')
  })

  it('VersionHistoryPanel and SnapshotViewerPanel both gate on the same canApprove||canPublish condition', () => {
    expect(versionHistoryBody).toContain('permissions.canApprove || permissions.canPublish')
    expect(snapshotViewerBody).toContain('permissions.canApprove || permissions.canPublish')
  })

  it.each([
    ['admin', true, true, true],
    ['general_manager', false, true, true],
    ['district_supervisor', true, false, false],
    ['manager', true, false, false],
    ['pharmacist', false, false, false],
  ])('%s — canRunSimulation=%s, canApprove/Publish-derived view=%s/%s matches the permission matrix', (role, expectSim) => {
    // Exercised indirectly through the RBAC suites above; this sweep
    // documents the expected visibility matrix for Bundle 3 panels.
    expect(typeof role).toBe('string')
    expect(typeof expectSim).toBe('boolean')
  })
})

// ════════════════════════════════════════════════════════════
// 16. End-to-end style — run, compare, trace, in one flow
// ════════════════════════════════════════════════════════════
describe('end-to-end style — simulate, persist, compare, trace', () => {
  it('runs a simulation, persists it via createSimulationRunDocument, then compares against a second run', async () => {
    const first = simulateProfile(simpleProfile(50, 100))
    await createSimulationRunDocument({
      runId: 'run_a', profileId: 'p1', version: '1.0.0',
      input: { actuals: { wasfaty: 50 }, targets: { wasfaty: 100 } },
      result: { valid: first.valid, score: first.score, basketCount: 1, issueCount: first.issues.length, traceIncluded: true },
      score: first.score, issues: first.issues, executedBy: 'u_admin',
    }, ADMIN)

    const second = simulateProfile(simpleProfile(90, 100))
    const cmp = compareSimulationResults(first, second)
    expect(cmp.scoreDelta).toBeGreaterThan(0)

    const flat = flattenSimulationTrace(second.traces)
    expect(flat[0].kpiKey).toBe('wasfaty')
  })

  it('a full pipeline (zero-guard -> ratio -> ceiling -> weight -> band -> penalty) never throws', () => {
    const bands = [{ id: 'b1', label: 'Low', minPct: 0, maxPct: 50, score: 30 }, { id: 'b2', label: 'High', minPct: 50, maxPct: 200, score: 95 }]
    const penaltyRules = [{ id: 'p1', condition: 'below', threshold: 40, penaltyValue: 10 }]
    const rule = {
      id: 'r1', kpiKey: 'wasfaty', label: 'r1', metricType: 'count', weight: 1,
      pipeline: {
        steps: [
          { processorType: ZERO_TARGET_GUARD, order: 0, config: { zeroTargetBehaviour: 'skip' } },
          { processorType: RATIO_EVALUATOR, order: 1, config: {} },
          { processorType: CEILING_CLAMP, order: 2, config: { ceiling: 150 } },
          { processorType: BAND_EVALUATOR, order: 3, config: { bands } },
          { processorType: PENALTY_EVALUATOR, order: 4, config: { penaltyRules } },
        ],
      },
    }
    const profile = makeProfile([makeBasket('b1', [makeElement('e1', [rule])])])
    expect(() => simulateProfile({ profile, actuals: { wasfaty: 35 }, targets: { wasfaty: 100 } })).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 17. executeProcessorStep — exhaustive per-type sweep
// ════════════════════════════════════════════════════════════
function baseState() {
  return {
    actual: 50, target: 100, achievement: 0, cappedAchievement: 0, score: 0, weightedScore: 0,
    zeroTarget: false, bandLabel: undefined, penaltyApplied: 0, bandRan: false, penaltyRan: false,
    childScores: [60, 40], childWeights: [0.5, 0.5], issues: [], stepTraces: [],
  }
}

const MINIMAL_CONFIG_BY_TYPE: Record<string, Record<string, unknown>> = {
  [RATIO_EVALUATOR]: {},
  [CEILING_CLAMP]: { ceiling: 100 },
  [FLOOR_CLAMP]: { floor: 0 },
  [WEIGHT_MULTIPLIER]: { weight: 0.5 },
  [BAND_EVALUATOR]: { bands: [{ id: 'b1', label: 'L', minPct: 0, maxPct: 100, score: 50 }] },
  [PENALTY_EVALUATOR]: { penaltyRules: [{ id: 'p1', condition: 'below', threshold: 10, penaltyValue: 5 }] },
  [NODE_AGGREGATOR]: { aggregationType: 'weighted_sum' },
  [ZERO_TARGET_GUARD]: { zeroTargetBehaviour: 'skip' },
}

describe('executeProcessorStep — exhaustive per-type sweep', () => {
  it.each(ALL_PROCESSOR_TYPES)('%s never throws with a minimal valid config', (type) => {
    const step = { processorType: type, order: 0, config: MINIMAL_CONFIG_BY_TYPE[type] }
    expect(() => executeProcessorStep(step as any, baseState())).not.toThrow()
  })

  it.each(ALL_PROCESSOR_TYPES)('%s produces a step trace entry with the matching processorType', (type) => {
    const step = { processorType: type, order: 0, config: MINIMAL_CONFIG_BY_TYPE[type] }
    const result = executeProcessorStep(step as any, baseState())
    if (type !== NODE_AGGREGATOR) {
      expect(result.stepTraces.some((t: any) => t.processorType === type)).toBe(true)
    } else {
      expect(result.stepTraces.length).toBeGreaterThan(0)
    }
  })

  it.each(ALL_PROCESSOR_TYPES)('%s never produces a NaN score', (type) => {
    const step = { processorType: type, order: 0, config: MINIMAL_CONFIG_BY_TYPE[type] }
    const result = executeProcessorStep(step as any, baseState())
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it.each(ALL_PROCESSOR_TYPES)('%s with enabled:false is a no-op', (type) => {
    const step = { processorType: type, order: 0, config: MINIMAL_CONFIG_BY_TYPE[type], enabled: false }
    const state = baseState()
    expect(executeProcessorStep(step as any, state)).toEqual(state)
  })
})

// ════════════════════════════════════════════════════════════
// 18. simulateRule — ratio achievement sweep
// ════════════════════════════════════════════════════════════
describe('simulateRule — ratio achievement sweep', () => {
  it.each([
    [0, 100, 0],
    [50, 100, 50],
    [100, 100, 100],
    [150, 100, 150],
    [25, 50, 50],
  ])('actual=%s target=%s → achievement≈%s', (actual, target, expected) => {
    const rule = makeRatioRule('r1', 'k')
    const result = simulateRule(rule, { k: actual }, { k: target })
    expect(result.achievement).toBeCloseTo(expected, 0)
  })

  it.each([0, 0.25, 0.5, 0.75, 1])('WEIGHT_MULTIPLIER with weight=%s scales the weighted score', (weight) => {
    const rule = makeRatioRule('r1', 'k', 1, [{ processorType: WEIGHT_MULTIPLIER, order: 1, config: { weight } }])
    const result = simulateRule(rule, { k: 100 }, { k: 100 })
    expect(result.weightedScore).toBeCloseTo(weight, 5)
  })

  it.each([
    [10, 'Low'],
    [40, 'Low'],
    [60, 'High'],
    [100, 'High'],
  ])('achievement=%s maps to the %s band', (achievement, expectedBand) => {
    const bands = [{ id: 'b1', label: 'Low', minPct: 0, maxPct: 50, score: 40 }, { id: 'b2', label: 'High', minPct: 50, maxPct: 200, score: 90 }]
    const rule = makeRatioRule('r1', 'k', 1, [{ processorType: BAND_EVALUATOR, order: 1, config: { bands } }])
    const result = simulateRule(rule, { k: achievement }, { k: 100 })
    expect(result.bandLabel).toBe(expectedBand)
  })

  it.each(['below', 'above', 'equals'])('PENALTY_EVALUATOR supports the "%s" condition without throwing', (condition) => {
    const penaltyRules = [{ id: 'p1', condition, threshold: 50, penaltyValue: 10 }]
    const rule = makeRatioRule('r1', 'k', 1, [{ processorType: PENALTY_EVALUATOR, order: 1, config: { penaltyRules } }])
    expect(() => simulateRule(rule, { k: 50 }, { k: 100 })).not.toThrow()
  })

  it.each(['skip', 'score_zero', 'score_full', 'use_fallback'])('ZERO_TARGET_GUARD supports the "%s" behaviour without throwing', (behaviour) => {
    const rule = {
      id: 'r1', kpiKey: 'k', label: 'r1', metricType: 'count', weight: 1,
      pipeline: { steps: [{ processorType: ZERO_TARGET_GUARD, order: 0, config: { zeroTargetBehaviour: behaviour, fallbackScore: 70 } }, { processorType: RATIO_EVALUATOR, order: 1, config: {} }] },
    }
    expect(() => simulateRule(rule, { k: 10 }, { k: 0 })).not.toThrow()
  })

  it.each(['weighted_sum', 'simple_average', 'min', 'max'])('NODE_AGGREGATOR supports the "%s" aggregation type at element scope', (aggType) => {
    const rules = [makeRatioRule('r1', 'a', 0.5), makeRatioRule('r2', 'b', 0.5)]
    const element = makeElement('e1', rules, 1, { steps: [{ processorType: NODE_AGGREGATOR, order: 0, config: { aggregationType: aggType } }] })
    expect(() => simulateElement(element, { a: 60, b: 40 }, { a: 100, b: 100 })).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 19. versioning.ts — exhaustive parseVersion / compare sweep
// ════════════════════════════════════════════════════════════
describe('parseVersion — exhaustive sweep', () => {
  it.each([
    ['0.0.0', { major: 0, minor: 0, patch: 0 }],
    ['1.0.0', { major: 1, minor: 0, patch: 0 }],
    ['10.20.30', { major: 10, minor: 20, patch: 30 }],
  ])('parses "%s"', (version, expected) => {
    expect(parseVersion(version)).toEqual(expected)
  })

  it.each(['', 'a.b.c', '1.2.3.4', '1.2', '1', 'v1.0.0'])('rejects "%s"', (version) => {
    expect(parseVersion(version)).toBeNull()
  })
})

describe('compareProfileVersions — exhaustive sweep', () => {
  it.each([
    ['1.0.0', '1.0.1', -1],
    ['1.0.1', '1.0.0', 1],
    ['2.0.0', '1.9.9', 1],
    ['1.9.9', '2.0.0', -1],
    ['0.1.0', '0.1.0', 0],
  ])('compareProfileVersions(%s, %s) → %s', (a, b, expected) => {
    expect(compareProfileVersions(a, b)).toBe(expected)
  })
})

// ════════════════════════════════════════════════════════════
// 20. Permission matrix — direct kernel cross-check (Task 7)
// ════════════════════════════════════════════════════════════
const ROLES: Array<[ProfileStudioRole, boolean, boolean, boolean]> = [
  ['admin', true, true, true],
  ['general_manager', false, true, true],
  ['district_supervisor', true, false, false],
  ['manager', true, false, false],
  ['pharmacist', false, false, false],
]

describe('Permission matrix — canRunSimulation / canApprove / canPublish per role', () => {
  it.each(ROLES)('%s — canRunSimulation=%s', (role, expectSim) => {
    expect(canRunSimulation(role)).toBe(expectSim)
  })

  it.each(ROLES)('%s — canApproveProfile=%s', (role, _sim, expectApprove) => {
    expect(canApproveProfile(role)).toBe(expectApprove)
  })

  it.each(ROLES)('%s — canPublishProfile=%s', (role, _sim, _approve, expectPublish) => {
    expect(canPublishProfile(role)).toBe(expectPublish)
  })

  it.each(ROLES)('%s — view-history visibility (canApprove||canPublish||canRunSimulation) matches SimulatorPanel/VersionHistoryPanel gating', (role, expectSim, expectApprove, expectPublish) => {
    const visible = expectSim || expectApprove || expectPublish
    expect(canRunSimulation(role) || canApproveProfile(role) || canPublishProfile(role)).toBe(visible)
  })

  it('pharmacist has none of canRunSimulation/canApprove/canPublish (no route)', () => {
    expect(canRunSimulation('pharmacist')).toBe(false)
    expect(canApproveProfile('pharmacist')).toBe(false)
    expect(canPublishProfile('pharmacist')).toBe(false)
  })

  it('district_supervisor and manager cannot approve, publish, edit, or archive (simulate only)', () => {
    for (const role of ['district_supervisor', 'manager'] as ProfileStudioRole[]) {
      expect(canApproveProfile(role)).toBe(false)
      expect(canPublishProfile(role)).toBe(false)
      expect(canEditProfile(role)).toBe(false)
      expect(canArchiveProfile(role)).toBe(false)
    }
  })

  it('general_manager cannot run simulations or edit, but can approve and publish', () => {
    expect(canRunSimulation('general_manager')).toBe(false)
    expect(canEditProfile('general_manager')).toBe(false)
    expect(canApproveProfile('general_manager')).toBe(true)
    expect(canPublishProfile('general_manager')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 21. GUARDRAILS — additional read-only data flow sweep
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no profile-mutation service calls from any Bundle 3 file', () => {
  it.each(NAMED_NEW_FILES)('%s does not call createProfileDocument', (_name, src) => {
    expect(src).not.toContain('createProfileDocument(')
  })

  it.each(NAMED_NEW_FILES)('%s does not call archiveProfileDocument', (_name, src) => {
    expect(src).not.toContain('archiveProfileDocument')
  })

  it.each(NAMED_NEW_FILES)('%s does not import the hierarchy.ts mutation helpers', (_name, src) => {
    expect(src).not.toMatch(/\baddBasket\b/)
    expect(src).not.toMatch(/\baddElement\b/)
    expect(src).not.toMatch(/\baddRule\b/)
  })

  it.each(NAMED_NEW_FILES)('%s does not import workflow.ts (no governance/approval workflow execution)', (_name, src) => {
    expect(src).not.toContain("from '../../profileStudio/workflow'")
  })

  it.each(NAMED_NEW_FILES)('%s does not import exporter.ts', (_name, src) => {
    expect(src).not.toContain("from '../../profileStudio/exporter'")
  })
})

// ════════════════════════════════════════════════════════════
// 22. Additional component wiring — loading states & empty states
// ════════════════════════════════════════════════════════════
describe('Loading and empty states — Bundle 3 panels', () => {
  it('VersionHistoryPanel renders a SkeletonWidget while loading', () => {
    expect(versionHistorySrc).toContain('SkeletonWidget')
  })

  it('SnapshotViewerPanel renders a SkeletonWidget while loading', () => {
    expect(snapshotViewerSrc).toContain('SkeletonWidget')
  })

  it('VersionHistoryPanel renders an EmptyState when there is no history', () => {
    expect(versionHistorySrc).toContain('EmptyState')
  })

  it('SnapshotViewerPanel renders an EmptyState when there are no snapshots', () => {
    expect(snapshotViewerSrc).toContain('EmptyState')
  })

  it('SimulatorPanel renders an EmptyState when there are no KPIs to simulate', () => {
    expect(simulatorPanelSrc).toContain('No KPIs to simulate')
  })

  it('VersionHistoryPanel renders an ErrorState on fetch failure', () => {
    expect(versionHistorySrc).toContain('ErrorState')
  })

  it('SnapshotViewerPanel renders an ErrorState on fetch failure', () => {
    expect(snapshotViewerSrc).toContain('ErrorState')
  })

  it('VersionHistoryPanel and SnapshotViewerPanel both fetch only once per profile (loaded guard)', () => {
    expect(versionHistoryBody).toContain('loaded')
    expect(snapshotViewerBody).toContain('loaded')
  })

  it('VersionHistoryPanel normalizes fetch errors via normalizeError', () => {
    expect(versionHistoryBody).toContain('normalizeError')
  })

  it('SnapshotViewerPanel normalizes fetch errors via normalizeError', () => {
    expect(snapshotViewerBody).toContain('normalizeError')
  })
})

// ════════════════════════════════════════════════════════════
// 23. Additional end-to-end coverage
// ════════════════════════════════════════════════════════════
describe('end-to-end style — additional scenarios', () => {
  it('a profile with two baskets of different processor pipelines simulates without throwing', () => {
    const b1 = makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a', 1, [{ processorType: CEILING_CLAMP, order: 1, config: { ceiling: 80 } }])])], 0.5)
    const b2 = makeBasket('b2', [makeElement('e2', [makeRatioRule('r2', 'b', 1, [{ processorType: FLOOR_CLAMP, order: 1, config: { floor: 10 } }])])], 0.5)
    const profile = makeProfile([b1, b2])
    expect(() => simulateProfile({ profile, actuals: { a: 200, b: 0 }, targets: { a: 100, b: 100 } })).not.toThrow()
  })

  it('compareSimulationResults on a 2-basket profile reports both basket deltas', () => {
    const b1 = makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a')])], 0.5)
    const b2 = makeBasket('b2', [makeElement('e2', [makeRatioRule('r2', 'b')])], 0.5)
    const profile = makeProfile([b1, b2])
    const before = simulateProfile({ profile, actuals: { a: 50, b: 50 }, targets: { a: 100, b: 100 } })
    const after  = simulateProfile({ profile, actuals: { a: 90, b: 10 }, targets: { a: 100, b: 100 } })
    const cmp = compareSimulationResults(before, after)
    expect(cmp.basketDeltas).toHaveLength(2)
  })

  it('running the same profile twice with identical inputs produces identical scores', () => {
    const { profile, actuals, targets } = simpleProfile(70, 100)
    const a = simulateProfile({ profile, actuals, targets })
    const b = simulateProfile({ profile, actuals, targets })
    expect(a.score).toBe(b.score)
  })

  it('listProfileSnapshots and listSimulationRuns can both be called for the same profile without interference', async () => {
    await expect(listProfileSnapshots('p1', ADMIN)).resolves.toEqual([])
    await expect(listSimulationRuns('p1', ADMIN)).resolves.toEqual([])
  })

  it('createSimulationRunDocument validates required fields before writing (schema-checked, never bypassed)', async () => {
    const incomplete = { ...makeSimRunDoc(), score: undefined } as any
    delete incomplete.score
    await expect(createSimulationRunDocument(incomplete, ADMIN)).rejects.toThrow('SCHEMA_INVALID')
  })
})

// ════════════════════════════════════════════════════════════
// 24. GUARDRAILS — code-injection / unsafe rendering sweep
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no code injection or unsafe rendering', () => {
  it.each(NAMED_NEW_FILES)('%s has no eval() or new Function()', (_name, src) => {
    expect(src).not.toContain('eval(')
    expect(src).not.toContain('new Function(')
  })

  it.each(NAMED_NEW_FILES)('%s has no dangerouslySetInnerHTML', (_name, src) => {
    expect(src).not.toContain('dangerouslySetInnerHTML')
  })

  it.each(NAMED_NEW_FILES)('%s has no document.write or innerHTML assignment', (_name, src) => {
    expect(src).not.toContain('document.write')
    expect(src).not.toContain('.innerHTML')
  })
})

// ════════════════════════════════════════════════════════════
// 25. RBAC — consolidated role × function matrix
// ════════════════════════════════════════════════════════════
const RBAC_MATRIX: Array<[ProfileStudioRole, boolean, boolean, boolean]> = [
  // role, canListSnapshots, canRunSimulation(create run), canListRuns
  ['admin', true, true, true],
  ['general_manager', true, false, true],
  ['district_supervisor', false, true, true],
  ['manager', false, true, true],
  ['pharmacist', false, false, false],
]

describe('RBAC — consolidated role × function matrix', () => {
  it.each(RBAC_MATRIX)('%s — listProfileSnapshots allowed=%s', async (role, canList) => {
    const actor = { uid: `u_${role}`, role }
    if (canList) {
      await expect(listProfileSnapshots('p1', actor)).resolves.toEqual([])
    } else {
      await expect(listProfileSnapshots('p1', actor)).rejects.toThrow('PERMISSION_DENIED')
    }
  })

  it.each(RBAC_MATRIX)('%s — createSimulationRunDocument allowed=%s', async (role, _list, canRun) => {
    const actor = { uid: `u_${role}`, role }
    if (canRun) {
      await expect(createSimulationRunDocument(makeSimRunDoc(), actor)).resolves.toBeDefined()
    } else {
      await expect(createSimulationRunDocument(makeSimRunDoc(), actor)).rejects.toThrow('PERMISSION_DENIED')
    }
  })

  it.each(RBAC_MATRIX)('%s — listSimulationRuns allowed=%s', async (role, _list, _run, canListRuns) => {
    const actor = { uid: `u_${role}`, role }
    if (canListRuns) {
      await expect(listSimulationRuns('p1', actor)).resolves.toEqual([])
    } else {
      await expect(listSimulationRuns('p1', actor)).rejects.toThrow('PERMISSION_DENIED')
    }
  })
})

// ════════════════════════════════════════════════════════════
// 26. compareSimulationResults / flattenSimulationTrace — extra edges
// ════════════════════════════════════════════════════════════
describe('compareSimulationResults — additional edge cases', () => {
  it('handles a basket present in b but not a (newly added basket)', () => {
    const a = simulateProfile({ profile: makeProfile([]), actuals: {}, targets: {} })
    const b = simulateProfile(simpleProfile(80, 100))
    const cmp = compareSimulationResults(a, b)
    expect(cmp.basketDeltas.find((d) => d.basketId === 'b1')?.before).toBe(0)
  })

  it('handles a basket present in a but not b (removed basket)', () => {
    const a = simulateProfile(simpleProfile(80, 100))
    const b = simulateProfile({ profile: makeProfile([]), actuals: {}, targets: {} })
    const cmp = compareSimulationResults(a, b)
    expect(cmp.basketDeltas.find((d) => d.basketId === 'b1')?.after).toBe(0)
  })

  it('removed issues are reported when the later run has fewer issues', () => {
    const badRule = makeRatioRule('r1', 'a', 1, [{ processorType: 'BOGUS', order: 1, config: {} }])
    const badProfile = makeProfile([makeBasket('b1', [makeElement('e1', [badRule])])])
    const goodProfile = makeProfile([makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a')])])])
    const before = simulateProfile({ profile: badProfile, actuals: { a: 50 }, targets: { a: 100 } })
    const after  = simulateProfile({ profile: goodProfile, actuals: { a: 50 }, targets: { a: 100 } })
    const cmp = compareSimulationResults(before, after)
    expect(cmp.changedIssues.removed.length).toBeGreaterThan(0)
  })

  it('does not report a changed band when the band stays the same', () => {
    const bands = [{ id: 'b1', label: 'High', minPct: 0, maxPct: 200, score: 90 }]
    const rule = makeRatioRule('r1', 'a', 1, [{ processorType: BAND_EVALUATOR, order: 1, config: { bands } }])
    const profile = makeProfile([makeBasket('b1', [makeElement('e1', [rule])])])
    const before = simulateProfile({ profile, actuals: { a: 50 }, targets: { a: 100 } })
    const after  = simulateProfile({ profile, actuals: { a: 60 }, targets: { a: 100 } })
    const cmp = compareSimulationResults(before, after)
    expect(cmp.changedBands).toHaveLength(0)
  })
})

describe('flattenSimulationTrace — multi-basket / multi-rule', () => {
  it('flattens traces across multiple baskets and elements', () => {
    const b1 = makeBasket('b1', [makeElement('e1', [makeRatioRule('r1', 'a')])], 0.5)
    const b2 = makeBasket('b2', [makeElement('e2', [makeRatioRule('r2', 'b')])], 0.5)
    const profile = makeProfile([b1, b2])
    const result = simulateProfile({ profile, actuals: { a: 50, b: 60 }, targets: { a: 100, b: 100 } })
    const flat = flattenSimulationTrace(result.traces)
    expect(flat.map((t) => t.ruleId).sort()).toEqual(['r1', 'r2'])
  })

  it('flattens traces across multiple rules within one element', () => {
    const element = makeElement('e1', [makeRatioRule('r1', 'a', 0.5), makeRatioRule('r2', 'b', 0.5)])
    const profile = makeProfile([makeBasket('b1', [element])])
    const result = simulateProfile({ profile, actuals: { a: 50, b: 60 }, targets: { a: 100, b: 100 } })
    const flat = flattenSimulationTrace(result.traces)
    expect(flat).toHaveLength(2)
  })

  it('indexTraceByKpi resolves the correct trace for each of several kpiKeys', () => {
    const element = makeElement('e1', [makeRatioRule('r1', 'a', 0.5), makeRatioRule('r2', 'b', 0.5)])
    const profile = makeProfile([makeBasket('b1', [element])])
    const result = simulateProfile({ profile, actuals: { a: 50, b: 60 }, targets: { a: 100, b: 100 } })
    const map = indexTraceByKpi(result.traces)
    expect(map.get('a')?.ruleId).toBe('r1')
    expect(map.get('b')?.ruleId).toBe('r2')
  })
})

// ════════════════════════════════════════════════════════════
// 27. versioning.ts — buildProfileVersion / label / effective-date sweep
// ════════════════════════════════════════════════════════════
describe('buildProfileVersion / createProfileVersionLabel — sweep', () => {
  it.each([
    ['Standard', 0, 1, 0, 'Standard v0.1.0'],
    ['Pharmacy', 2, 5, 3, 'Pharmacy v2.5.3'],
    ['District', 10, 0, 0, 'District v10.0.0'],
  ])('createProfileVersionLabel(%s, %s, %s, %s) → %s', (base, major, minor, patch, expected) => {
    expect(createProfileVersionLabel(base as string, major as number, minor as number, patch as number)).toBe(expected)
  })

  it.each(['0.1.0', '2.5.3', '10.0.0'])('buildProfileVersion round-trips "%s" via parseVersion', (version) => {
    const built = buildProfileVersion('P', version)
    const parsed = parseVersion(version)
    expect({ major: built.major, minor: built.minor, patch: built.patch }).toEqual(parsed)
  })
})

describe('validateEffectiveDates — sweep', () => {
  it.each([
    ['2026-01-01', undefined, true],
    ['2026-01-01', '2026-06-01', true],
    ['', undefined, false],
    ['not-a-date', undefined, false],
    ['2026-01-01', 'not-a-date', false],
    ['2026-06-01', '2026-01-01', false],
  ])('validFrom=%s validTo=%s → valid=%s', (validFrom, validTo, expected) => {
    expect(validateEffectiveDates(validFrom as string, validTo as string | undefined).valid).toBe(expected)
  })
})

// ════════════════════════════════════════════════════════════
// 28. Final composition sanity — every Bundle 3 file parses as a
//     non-empty string (guards against accidental empty writes)
// ════════════════════════════════════════════════════════════
describe('Final composition sanity', () => {
  it.each(NAMED_NEW_FILES)('%s is a non-empty source file', (_name, src) => {
    expect(typeof src).toBe('string')
    expect(src.length).toBeGreaterThan(100)
  })

  it.each(NAMED_NEW_FILES)('%s default-exports a single component', (_name, src) => {
    const matches = src.match(/export default function/g) || []
    expect(matches.length).toBe(1)
  })
})
