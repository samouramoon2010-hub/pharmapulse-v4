// ============================================================
// Profile Studio Phase 0A — Certification Tests
//
// Covers:
//   Group 1  (1-7):   File existence
//   Group 2  (8-16):  Processor type constants
//   Group 3  (17-24): Processor definitions — deterministic flag
//   Group 4  (25-30): Lifecycle valid transitions
//   Group 5  (31-37): Lifecycle invalid transitions
//   Group 6  (38-40): Lifecycle terminal/backward rules
//   Group 7  (41-44): Versioning labels and parsing
//   Group 8  (45-48): Version increments
//   Group 9  (49-53): Effective date validation
//   Group 10 (54-59): Profile factory
//   Group 11 (60-64): Node factories and unique IDs
//   Group 12 (65-68): Validation — metadata
//   Group 13 (69-71): Validation — hierarchy
//   Group 14 (72-75): Validation — weights
//   Group 15 (76-79): Validation — duplicate detection
//   Group 16 (80-83): Validation — processor pipeline
//   Group 17 (84-87): Validation — bands / cap / penalty
//   Group 18 (88-90): validateProfile never throws
//   Group 19 (91-93): Trace types structural check
//   Group 20 (94-101): Guardrails — no Firestore, React, UI, AI, etc.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Live imports (for behavior tests) ────────────────────────

import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
  ALL_PROCESSOR_TYPES, PROCESSOR_DEFINITIONS,
  isSupportedProcessorType, getProcessorDefinition,
} from './processors'

import {
  PROFILE_STATUS,
  canTransitionProfileStatus,
  assertProfileStatusTransition,
  isTerminalStatus,
  isPublishedStatus,
  isEditableStatus,
} from './lifecycle'

import {
  createProfileVersionLabel,
  incrementMinorVersion,
  incrementMajorVersion,
  compareProfileVersions,
  validateEffectiveDates,
  parseVersion,
} from './versioning'

import {
  createEmptyEvaluationProfile,
  createBasketNode,
  createElementNode,
  createRuleNode,
  generateProfileId,
  generateNodeId,
} from './profileFactory'

import {
  validateProfile,
  validateProfileMetadata,
  validateProfileHierarchy,
  validateProfileWeights,
  validateProcessorPipeline,
  validateThresholdBands,
  validateProfileHierarchyUniqueness,
} from './validation'

import type {
  EvaluationProfileDraft,
  BasketNode,
  ElementNode,
  RuleNode,
} from './types'

// ── Raw imports (for guardrail tests) ────────────────────────

const typesSrc       = () => import('./types.ts?raw').then((m) => m.default)
const processorsSrc  = () => import('./processors.ts?raw').then((m) => m.default)
const lifecycleSrc   = () => import('./lifecycle.ts?raw').then((m) => m.default)
const versioningSrc  = () => import('./versioning.ts?raw').then((m) => m.default)
const validationSrc  = () => import('./validation.ts?raw').then((m) => m.default)
const factorySrc     = () => import('./profileFactory.ts?raw').then((m) => m.default)
const traceSrc       = () => import('./traceTypes.ts?raw').then((m) => m.default)

// ── Helpers ───────────────────────────────────────────────────

function makeMinimalProfile(): EvaluationProfileDraft {
  const profile = createEmptyEvaluationProfile({
    name: 'Test Profile', validFrom: '2026-01-01',
  })
  const basket = createBasketNode({ label: 'Commercial', weight: 1.0 })
  const element = createElementNode({ label: 'KPI Element', weight: 1.0 })
  const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Wasfaty', weight: 1.0 })
  element.rules.push(rule)
  basket.elements.push(element)
  profile.root.baskets.push(basket)
  return profile
}

function makeTwoBasketProfile(): EvaluationProfileDraft {
  const profile = createEmptyEvaluationProfile({ name: 'Two Basket', validFrom: '2026-01-01' })
  const b1 = createBasketNode({ label: 'A', weight: 0.6 })
  const b2 = createBasketNode({ label: 'B', weight: 0.4 })
  const e1 = createElementNode({ label: 'E1', weight: 1.0 })
  const e2 = createElementNode({ label: 'E2', weight: 1.0 })
  e1.rules.push(createRuleNode({ kpiKey: 'wasfaty', label: 'W', weight: 1.0 }))
  e2.rules.push(createRuleNode({ kpiKey: 'omni', label: 'O', weight: 1.0 }))
  b1.elements.push(e1)
  b2.elements.push(e2)
  profile.root.baskets.push(b1, b2)
  return profile
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — File existence
// ════════════════════════════════════════════════════════════

describe('Phase 0A › File existence', () => {
  it('types.ts file exists and is non-empty (test 1)', async () => {
    const s = await typesSrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('processors.ts file exists and is non-empty (test 2)', async () => {
    const s = await processorsSrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('lifecycle.ts file exists and is non-empty (test 3)', async () => {
    const s = await lifecycleSrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('versioning.ts file exists and is non-empty (test 4)', async () => {
    const s = await versioningSrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('validation.ts file exists and is non-empty (test 5)', async () => {
    const s = await validationSrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('profileFactory.ts file exists and is non-empty (test 6)', async () => {
    const s = await factorySrc()
    expect(s.length).toBeGreaterThan(100)
  })

  it('traceTypes.ts file exists and is non-empty (test 7)', async () => {
    const s = await traceSrc()
    expect(s.length).toBeGreaterThan(100)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — Processor type constants
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Processor type constants', () => {
  it('RATIO_EVALUATOR constant is defined (test 8)', () => {
    expect(RATIO_EVALUATOR).toBe('RATIO_EVALUATOR')
  })

  it('CEILING_CLAMP constant is defined (test 9)', () => {
    expect(CEILING_CLAMP).toBe('CEILING_CLAMP')
  })

  it('FLOOR_CLAMP constant is defined (test 10)', () => {
    expect(FLOOR_CLAMP).toBe('FLOOR_CLAMP')
  })

  it('WEIGHT_MULTIPLIER constant is defined (test 11)', () => {
    expect(WEIGHT_MULTIPLIER).toBe('WEIGHT_MULTIPLIER')
  })

  it('BAND_EVALUATOR constant is defined (test 12)', () => {
    expect(BAND_EVALUATOR).toBe('BAND_EVALUATOR')
  })

  it('PENALTY_EVALUATOR constant is defined (test 13)', () => {
    expect(PENALTY_EVALUATOR).toBe('PENALTY_EVALUATOR')
  })

  it('NODE_AGGREGATOR constant is defined (test 14)', () => {
    expect(NODE_AGGREGATOR).toBe('NODE_AGGREGATOR')
  })

  it('ZERO_TARGET_GUARD constant is defined (test 15)', () => {
    expect(ZERO_TARGET_GUARD).toBe('ZERO_TARGET_GUARD')
  })

  it('ALL_PROCESSOR_TYPES contains all 8 types (test 16)', () => {
    expect(ALL_PROCESSOR_TYPES).toHaveLength(8)
    expect(ALL_PROCESSOR_TYPES).toContain(RATIO_EVALUATOR)
    expect(ALL_PROCESSOR_TYPES).toContain(CEILING_CLAMP)
    expect(ALL_PROCESSOR_TYPES).toContain(ZERO_TARGET_GUARD)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — Processor definitions: deterministic + no arbitrary JS
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Processor definitions', () => {
  it('every processor definition has deterministic: true (test 17)', () => {
    for (const type of ALL_PROCESSOR_TYPES) {
      const def = getProcessorDefinition(type)
      expect(def.deterministic, `${type} should be deterministic`).toBe(true)
    }
  })

  it('every processor definition has a label (test 18)', () => {
    for (const type of ALL_PROCESSOR_TYPES) {
      const def = getProcessorDefinition(type)
      expect(def.label.length, `${type} missing label`).toBeGreaterThan(0)
    }
  })

  it('every processor has a description (test 19)', () => {
    for (const type of ALL_PROCESSOR_TYPES) {
      const def = getProcessorDefinition(type)
      expect(def.description.length, `${type} missing description`).toBeGreaterThan(0)
    }
  })

  it('every processor has an inputShape and outputShape (test 20)', () => {
    for (const type of ALL_PROCESSOR_TYPES) {
      const def = getProcessorDefinition(type)
      expect(def.inputShape.length).toBeGreaterThan(0)
      expect(def.outputShape.length).toBeGreaterThan(0)
    }
  })

  it('CEILING_CLAMP requires ceiling config field (test 21)', () => {
    const def = getProcessorDefinition(CEILING_CLAMP)
    expect(def.requiredConfigFields).toContain('ceiling')
  })

  it('BAND_EVALUATOR requires bands config field (test 22)', () => {
    const def = getProcessorDefinition(BAND_EVALUATOR)
    expect(def.requiredConfigFields).toContain('bands')
  })

  it('isSupportedProcessorType returns true for known types (test 23)', () => {
    expect(isSupportedProcessorType(RATIO_EVALUATOR)).toBe(true)
    expect(isSupportedProcessorType(NODE_AGGREGATOR)).toBe(true)
  })

  it('isSupportedProcessorType returns false for unknown strings (test 24)', () => {
    expect(isSupportedProcessorType('CUSTOM_FORMULA')).toBe(false)
    expect(isSupportedProcessorType('eval')).toBe(false)
    expect(isSupportedProcessorType('')).toBe(false)
    expect(isSupportedProcessorType(42)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — Lifecycle valid transitions
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Lifecycle valid transitions', () => {
  it('DRAFT → VALIDATED is allowed (test 25)', () => {
    expect(canTransitionProfileStatus('DRAFT', 'VALIDATED')).toBe(true)
  })

  it('VALIDATED → SIMULATED is allowed (test 26)', () => {
    expect(canTransitionProfileStatus('VALIDATED', 'SIMULATED')).toBe(true)
  })

  it('SIMULATED → APPROVED is allowed (test 27)', () => {
    expect(canTransitionProfileStatus('SIMULATED', 'APPROVED')).toBe(true)
  })

  it('APPROVED → PUBLISHED is allowed (test 28)', () => {
    expect(canTransitionProfileStatus('APPROVED', 'PUBLISHED')).toBe(true)
  })

  it('PUBLISHED → ARCHIVED is allowed (test 29)', () => {
    expect(canTransitionProfileStatus('PUBLISHED', 'ARCHIVED')).toBe(true)
  })

  it('any pre-published state → ARCHIVED is allowed (test 30)', () => {
    expect(canTransitionProfileStatus('DRAFT',     'ARCHIVED')).toBe(true)
    expect(canTransitionProfileStatus('VALIDATED', 'ARCHIVED')).toBe(true)
    expect(canTransitionProfileStatus('SIMULATED', 'ARCHIVED')).toBe(true)
    expect(canTransitionProfileStatus('APPROVED',  'ARCHIVED')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — Lifecycle invalid transitions
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Lifecycle invalid transitions', () => {
  it('PUBLISHED → DRAFT is blocked (test 31)', () => {
    expect(canTransitionProfileStatus('PUBLISHED', 'DRAFT')).toBe(false)
  })

  it('PUBLISHED → APPROVED is blocked (test 32)', () => {
    expect(canTransitionProfileStatus('PUBLISHED', 'APPROVED')).toBe(false)
  })

  it('SIMULATED → PUBLISHED is blocked (test 33)', () => {
    expect(canTransitionProfileStatus('SIMULATED', 'PUBLISHED')).toBe(false)
  })

  it('DRAFT → PUBLISHED is blocked (test 34)', () => {
    expect(canTransitionProfileStatus('DRAFT', 'PUBLISHED')).toBe(false)
  })

  it('same-state transitions are blocked (test 35)', () => {
    for (const s of ['DRAFT', 'VALIDATED', 'SIMULATED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const) {
      expect(canTransitionProfileStatus(s, s), `${s} → ${s} should be false`).toBe(false)
    }
  })

  it('assertProfileStatusTransition throws for blocked transitions (test 36)', () => {
    expect(() => assertProfileStatusTransition('PUBLISHED', 'DRAFT')).toThrow()
    expect(() => assertProfileStatusTransition('SIMULATED', 'PUBLISHED')).toThrow()
  })

  it('assertProfileStatusTransition does NOT throw for allowed transitions (test 37)', () => {
    expect(() => assertProfileStatusTransition('DRAFT', 'VALIDATED')).not.toThrow()
    expect(() => assertProfileStatusTransition('APPROVED', 'PUBLISHED')).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Terminal / backward rules
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Lifecycle terminal and predicates', () => {
  it('ARCHIVED is a terminal state (test 38)', () => {
    expect(isTerminalStatus('ARCHIVED')).toBe(true)
  })

  it('ARCHIVED → anything is blocked (test 39)', () => {
    for (const s of ['DRAFT', 'VALIDATED', 'SIMULATED', 'APPROVED', 'PUBLISHED'] as const) {
      expect(canTransitionProfileStatus('ARCHIVED', s)).toBe(false)
    }
  })

  it('isPublishedStatus and isEditableStatus predicates are correct (test 40)', () => {
    expect(isPublishedStatus('PUBLISHED')).toBe(true)
    expect(isPublishedStatus('DRAFT')).toBe(false)
    expect(isEditableStatus('DRAFT')).toBe(true)
    expect(isEditableStatus('PUBLISHED')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — Versioning labels and parsing
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Versioning labels', () => {
  it('createProfileVersionLabel produces correct label (test 41)', () => {
    const label = createProfileVersionLabel('Pharmacy Standard', 1, 2)
    expect(label).toBe('Pharmacy Standard v1.2.0')
  })

  it('createProfileVersionLabel with patch included (test 42)', () => {
    const label = createProfileVersionLabel('My Profile', 2, 0, 5)
    expect(label).toBe('My Profile v2.0.5')
  })

  it('parseVersion correctly splits major.minor.patch (test 43)', () => {
    const parsed = parseVersion('1.4.3')
    expect(parsed).toEqual({ major: 1, minor: 4, patch: 3 })
  })

  it('parseVersion returns null for invalid strings (test 44)', () => {
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('abc')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('1.2.3.4')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — Version increments
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Version increments', () => {
  it('incrementMinorVersion increments minor and resets patch (test 45)', () => {
    expect(incrementMinorVersion('1.2.3')).toBe('1.3.0')
    expect(incrementMinorVersion('0.1.0')).toBe('0.2.0')
  })

  it('incrementMajorVersion increments major and resets minor and patch (test 46)', () => {
    expect(incrementMajorVersion('1.2.3')).toBe('2.0.0')
    expect(incrementMajorVersion('0.1.0')).toBe('1.0.0')
  })

  it('compareProfileVersions returns correct ordering (test 47)', () => {
    expect(compareProfileVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareProfileVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareProfileVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareProfileVersions('1.0.0', '1.1.0')).toBe(-1)
  })

  it('incrementMinorVersion throws for invalid input (test 48)', () => {
    expect(() => incrementMinorVersion('not-a-version')).toThrow()
    expect(() => incrementMajorVersion('1.2')).toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — Effective date validation
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Effective date validation', () => {
  it('valid validFrom without validTo passes (test 49)', () => {
    const r = validateEffectiveDates('2026-01-01')
    expect(r.valid).toBe(true)
  })

  it('valid validFrom + validTo passes when validTo > validFrom (test 50)', () => {
    const r = validateEffectiveDates('2026-01-01', '2026-12-31')
    expect(r.valid).toBe(true)
  })

  it('missing validFrom fails (test 51)', () => {
    const r = validateEffectiveDates('')
    expect(r.valid).toBe(false)
    expect(r.reason).toBeTruthy()
  })

  it('validTo before validFrom fails (test 52)', () => {
    const r = validateEffectiveDates('2026-06-01', '2026-01-01')
    expect(r.valid).toBe(false)
  })

  it('validTo equal to validFrom fails (test 53)', () => {
    const r = validateEffectiveDates('2026-06-01', '2026-06-01')
    expect(r.valid).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Profile factory
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Profile factory', () => {
  it('createEmptyEvaluationProfile returns a DRAFT profile (test 54)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
    expect(p.metadata.status).toBe('DRAFT')
  })

  it('createEmptyEvaluationProfile defaults version to 0.1.0 (test 55)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
    expect(p.metadata.version).toBe('0.1.0')
  })

  it('createEmptyEvaluationProfile includes root with empty baskets (test 56)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
    expect(p.root).toBeDefined()
    expect(Array.isArray(p.root.baskets)).toBe(true)
    expect(p.root.baskets).toHaveLength(0)
  })

  it('createEmptyEvaluationProfile propagates name and validFrom (test 57)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Pharmacy KPI 2026', validFrom: '2026-06-01' })
    expect(p.metadata.name).toBe('Pharmacy KPI 2026')
    expect(p.metadata.validFrom).toBe('2026-06-01')
  })

  it('createEmptyEvaluationProfile defaults scope to PHARMACY (test 58)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
    expect(p.metadata.scope).toBe('PHARMACY')
  })

  it('createEmptyEvaluationProfile accepts custom scope (test 59)', () => {
    const p = createEmptyEvaluationProfile({ name: 'T', validFrom: '2026-01-01', scope: 'REGION' })
    expect(p.metadata.scope).toBe('REGION')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Node factories and unique IDs
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Node factories and ID uniqueness', () => {
  it('createBasketNode returns a basket with empty elements (test 60)', () => {
    const b = createBasketNode({ label: 'Commercial', weight: 0.5 })
    expect(b.label).toBe('Commercial')
    expect(b.weight).toBe(0.5)
    expect(b.elements).toHaveLength(0)
  })

  it('createElementNode returns an element with empty rules (test 61)', () => {
    const e = createElementNode({ label: 'KPI Group', weight: 0.3 })
    expect(e.label).toBe('KPI Group')
    expect(e.rules).toHaveLength(0)
  })

  it('createRuleNode returns a rule with the given kpiKey (test 62)', () => {
    const r = createRuleNode({ kpiKey: 'wasfaty', label: 'Wasfaty', weight: 1.0 })
    expect(r.kpiKey).toBe('wasfaty')
    expect(r.weight).toBe(1.0)
  })

  it('createRuleNode defaults metricType to count (test 63)', () => {
    const r = createRuleNode({ kpiKey: 'basket', label: 'Basket', weight: 1.0 })
    expect(r.metricType).toBe('count')
  })

  it('generateProfileId produces unique IDs across calls (test 64)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateProfileId()))
    expect(ids.size).toBe(20)
  })

  it('generateNodeId produces unique IDs across calls (test 65)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateNodeId('rule')))
    expect(ids.size).toBe(20)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — Validation: metadata
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — metadata', () => {
  it('valid profile passes metadata validation (test 66)', () => {
    const p = makeMinimalProfile()
    const r = validateProfileMetadata(p)
    expect(r.valid).toBe(true)
    expect(r.issues).toHaveLength(0)
  })

  it('missing profile id fails metadata validation (test 67)', () => {
    const p = makeMinimalProfile()
    p.metadata.id = ''
    const r = validateProfileMetadata(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'MISSING_ID')).toBe(true)
  })

  it('missing profile name fails metadata validation (test 68)', () => {
    const p = makeMinimalProfile()
    p.metadata.name = ''
    const r = validateProfileMetadata(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'MISSING_NAME')).toBe(true)
  })

  it('invalid version string fails metadata validation (test 69)', () => {
    const p = makeMinimalProfile()
    p.metadata.version = 'v1.2'   // not major.minor.patch
    const r = validateProfileMetadata(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'INVALID_VERSION')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — Validation: hierarchy
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — hierarchy', () => {
  it('minimal valid profile passes hierarchy validation (test 70)', () => {
    const p = makeMinimalProfile()
    const r = validateProfileHierarchy(p)
    expect(r.valid).toBe(true)
  })

  it('profile without root fails hierarchy validation (test 71)', () => {
    const p = makeMinimalProfile()
    // @ts-expect-error intentional null for testing
    p.root = null
    const r = validateProfileHierarchy(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'MISSING_ROOT')).toBe(true)
  })

  it('profile with no baskets fails hierarchy validation (test 72)', () => {
    const p = makeMinimalProfile()
    p.root.baskets = []
    const r = validateProfileHierarchy(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'NO_BASKETS')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — Validation: weights
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — weights', () => {
  it('two baskets summing to 1.0 passes weight validation (test 73)', () => {
    const p = makeTwoBasketProfile()
    const r = validateProfileWeights(p)
    expect(r.issues.filter((i) => i.code === 'BASKET_WEIGHT_SUM')).toHaveLength(0)
  })

  it('basket weights not summing to 1.0 fails (test 74)', () => {
    const p = makeTwoBasketProfile()
    p.root.baskets[0].weight = 0.7  // 0.7 + 0.4 = 1.1
    const r = validateProfileWeights(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'BASKET_WEIGHT_SUM')).toBe(true)
  })

  it('negative rule weight fails weight validation (test 75)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].weight = -0.1
    const r = validateProfileWeights(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'NEGATIVE_RULE_WEIGHT')).toBe(true)
  })

  it('element weights not summing to 1.0 inside basket fails (test 76)', () => {
    const p = makeTwoBasketProfile()
    // Add a second element to basket 0 without adjusting weight
    const e2 = createElementNode({ label: 'E_extra', weight: 0.5 }) // now sums to 1.5
    p.root.baskets[0].elements.push(e2)
    const r = validateProfileWeights(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'ELEMENT_WEIGHT_SUM')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — Validation: duplicate detection
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — duplicate detection', () => {
  it('valid profile has no duplicate node id issues (test 77)', () => {
    const p = makeMinimalProfile()
    const r = validateProfileHierarchyUniqueness(p)
    expect(r.issues.filter((i) => i.code === 'DUPLICATE_NODE_ID')).toHaveLength(0)
  })

  it('duplicate node ids across baskets are detected (test 78)', () => {
    const p = makeMinimalProfile()
    const dupId = 'dup_id_001'
    p.root.baskets[0].id                           = dupId
    p.root.baskets[0].elements[0].id               = dupId  // same id = duplicate
    const r = validateProfileHierarchyUniqueness(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'DUPLICATE_NODE_ID')).toBe(true)
  })

  it('duplicate kpiKey in same element is detected (test 79)', () => {
    const p = makeMinimalProfile()
    const rule2 = createRuleNode({ kpiKey: 'wasfaty', label: 'Wasfaty 2', weight: 0 })
    p.root.baskets[0].elements[0].rules.push(rule2)
    const r = validateProfileHierarchyUniqueness(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'DUPLICATE_KPI_KEY')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — Validation: processor pipeline
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — processor pipeline', () => {
  it('valid profile with no processors passes pipeline validation (test 80)', () => {
    const p = makeMinimalProfile()
    const r = validateProcessorPipeline(p)
    expect(r.valid).toBe(true)
  })

  it('unknown processor type is detected (test 81)', () => {
    const p = makeMinimalProfile()
    // @ts-expect-error intentional invalid type for testing
    p.root.baskets[0].elements[0].rules[0].pipeline.steps = [
      { processorType: 'CUSTOM_FORMULA', config: {}, order: 1 },
    ]
    const r = validateProcessorPipeline(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'UNSUPPORTED_PROCESSOR')).toBe(true)
  })

  it('CEILING_CLAMP missing required ceiling config is detected (test 82)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].pipeline.steps = [
      { processorType: CEILING_CLAMP, config: {}, order: 1 },  // missing ceiling
    ]
    const r = validateProcessorPipeline(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'MISSING_PROCESSOR_CONFIG')).toBe(true)
  })

  it('CEILING_CLAMP with ceiling config passes (test 83)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].pipeline.steps = [
      { processorType: CEILING_CLAMP, config: { ceiling: 200 }, order: 1 },
    ]
    const r = validateProcessorPipeline(p)
    expect(r.valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — Validation: bands / cap / penalty
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Validation — bands, cap, penalty', () => {
  it('overlapping bands are detected (test 84)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].thresholdBands = [
      { label: 'High', minPct: 80, maxPct: 100, score: 100 },
      { label: 'Med',  minPct: 60, maxPct: 90,  score: 75 },  // overlaps with High
    ]
    const r = validateThresholdBands(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'BAND_OVERLAP')).toBe(true)
  })

  it('band with minPct >= maxPct is detected (test 85)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].thresholdBands = [
      { label: 'Bad', minPct: 90, maxPct: 80, score: 50 },  // min > max
    ]
    const r = validateThresholdBands(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'BAND_INVALID_RANGE')).toBe(true)
  })

  it('negative cap value is detected (test 86)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].cap = -10
    const r = validateThresholdBands(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'INVALID_CAP')).toBe(true)
  })

  it('negative floor value is detected (test 87)', () => {
    const p = makeMinimalProfile()
    p.root.baskets[0].elements[0].rules[0].floor = -5
    const r = validateThresholdBands(p)
    expect(r.valid).toBe(false)
    expect(r.issues.some((i) => i.code === 'INVALID_FLOOR')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — validateProfile never throws
// ════════════════════════════════════════════════════════════

describe('Phase 0A › validateProfile does not throw', () => {
  it('validateProfile returns issues for completely broken input without throwing (test 88)', () => {
    // @ts-expect-error intentional bad input
    const r = validateProfile({ metadata: {}, root: null })
    expect(r).toBeDefined()
    expect(r.valid).toBe(false)
    expect(Array.isArray(r.issues)).toBe(true)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('validateProfile returns valid=true for a well-formed profile (test 89)', () => {
    const r = validateProfile(makeMinimalProfile())
    expect(r.valid).toBe(true)
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('validateProfile accumulates issues from all sub-validators (test 90)', () => {
    const p = makeMinimalProfile()
    p.metadata.id   = ''          // metadata error
    p.root.baskets[0].weight = 0  // weight error
    const r = validateProfile(p)
    expect(r.valid).toBe(false)
    const codes = r.issues.map((i) => i.code)
    expect(codes).toContain('MISSING_ID')
    expect(codes).toContain('NEGATIVE_BASKET_WEIGHT')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — Trace types structural check
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Trace types structure', () => {
  it('traceTypes.ts defines rawAchievement in AchievementTrace (test 91)', async () => {
    const s = await traceSrc()
    expect(s).toContain('rawAchievement')
  })

  it('traceTypes.ts defines cappedAchievement in CapTrace/NodeExecutionTrace (test 92)', async () => {
    const s = await traceSrc()
    expect(s).toContain('cappedAchievement')
  })

  it('traceTypes.ts defines weightedScore in WeightTrace (test 93)', async () => {
    const s = await traceSrc()
    expect(s).toContain('weightedScore')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — Guardrails
// ════════════════════════════════════════════════════════════

describe('Phase 0A › Guardrails', () => {
  const allSrcs = () => Promise.all([
    typesSrc(), processorsSrc(), lifecycleSrc(), versioningSrc(),
    validationSrc(), factorySrc(), traceSrc(),
  ])

  it('no Firestore imports in any Profile Studio file (test 94)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('firebase/firestore')
      expect(s).not.toContain('from firebase')
      expect(s).not.toContain("from 'firebase")
    }
  })

  it('no React imports in any Profile Studio file (test 95)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain("from 'react'")
      expect(s).not.toContain('import React')
      expect(s).not.toContain('useState')
      expect(s).not.toContain('useEffect')
    }
  })

  it('no UI component imports in any Profile Studio file (test 96)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('components/')
      expect(s).not.toContain('pages/')
    }
  })

  it('no route definitions in any Profile Studio file (test 97)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('<Route')
      expect(s).not.toContain("path='/")
    }
  })

  it('no Sidebar changes in any Profile Studio file (test 98)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('Sidebar')
      expect(s).not.toContain('NAV_CONFIG')
    }
  })

  it('no AI / LLM imports in any Profile Studio file (test 99)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
      expect(s).not.toContain('gemini')
      expect(s).not.toContain('gpt')
    }
  })

  it('no Excel import references in any Profile Studio file (test 100)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('xlsx')
      expect(s).not.toContain('ExcelJS')
      expect(s).not.toContain('sheetjs')
    }
  })

  it('Profile Studio is isolated — no imports from Evaluation Engine V2 behavior files (test 101)', async () => {
    const files = await allSrcs()
    for (const s of files) {
      expect(s).not.toContain('evaluationEngine')
      expect(s).not.toContain('kpiAnalyticsEngine')
      expect(s).not.toContain('executiveScore')
      expect(s).not.toContain('App.jsx')
    }
  })
})
