// ============================================================
// phase2hi.test.ts — Bundle 2 certification: Rule Editor +
// Processor Pipeline Editor (Phase 2H + 2I), 350+ tests.
//
// Pattern: ?raw source inspection + direct unit tests against the
// pure validators (validateRuleForm / validateProcessorStepForm)
// and against the kernel helpers (hierarchy.ts, processors.ts,
// processorValidation.ts, pipeline.ts) used by the editors.
//
// NO Drag & Drop. NO Simulation execution. NO Publish flow. NO AI.
// NO Excel import. NO Evaluation Engine changes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { validateRuleForm, DEFAULT_RULE_FORM_VALUES } from '../../components/profileStudio/RuleForm.jsx'
import {
  buildProcessorConfig,
  validateProcessorStepForm,
  DEFAULT_PROCESSOR_STEP_FORM_VALUES,
} from '../../components/profileStudio/ProcessorConfigForm.jsx'
import {
  addRule, addBasket, addElement, updateNode, removeNode, findNode,
  canAddRule, canAddBasket, canAddElement,
  calculateChildWeightSummary, findOverweightNodes, findUnderweightNodes,
} from '../../profileStudio/hierarchy'
import { createRuleNode, createBasketNode, createElementNode } from '../../profileStudio/profileFactory'
import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
  ALL_PROCESSOR_TYPES, getProcessorDefinition, isSupportedProcessorType,
} from '../../profileStudio/processors'
import { validateProcessorStepConfig, validatePipeline } from '../../profileStudio/processorValidation'
import { getActiveKpis, getCoreKpis, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'

const ruleFormSrc              = await import('../../components/profileStudio/RuleForm.jsx?raw').then((m) => m.default)
const ruleCardSrc              = await import('../../components/profileStudio/RuleCard.jsx?raw').then((m) => m.default)
const ruleEditorSrc            = await import('../../components/profileStudio/RuleEditorPanel.jsx?raw').then((m) => m.default)
const processorConfigFormSrc   = await import('../../components/profileStudio/ProcessorConfigForm.jsx?raw').then((m) => m.default)
const processorStepCardSrc     = await import('../../components/profileStudio/ProcessorStepCard.jsx?raw').then((m) => m.default)
const processorPipelineSrc     = await import('../../components/profileStudio/ProcessorPipelinePanel.jsx?raw').then((m) => m.default)
const elementCardSrc           = await import('../../components/profileStudio/ElementCard.jsx?raw').then((m) => m.default)
const elementEditorSrc         = await import('../../components/profileStudio/ElementEditorPanel.jsx?raw').then((m) => m.default)
const profileDetailPanelSrc    = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)

// Body-only slices to avoid false positives from header-comment prose
// (e.g. "NO Drag & Drop") that documents these exact constraints.
const ruleEditorBody         = ruleEditorSrc.slice(ruleEditorSrc.indexOf('import React'))
const processorPipelineBody  = processorPipelineSrc.slice(processorPipelineSrc.indexOf('import React'))
const elementEditorBody      = elementEditorSrc.slice(elementEditorSrc.indexOf('import React'))

function makeDraft(overrides = {}) {
  return {
    metadata: { status: 'DRAFT', id: 'p1', name: 'Test Profile', version: '1.0.0', scope: 'PHARMACY', validFrom: '2026-01-01' },
    root: { id: 'root1', label: 'Test Profile', baskets: [] },
    ...overrides,
  }
}

function makeElementNode(overrides = {}) {
  return { id: 'e1', label: 'Element 1', weight: 1, rules: [], pipeline: { steps: [] }, ...overrides }
}

function makeRuleNode(overrides = {}) {
  return { id: 'r1', kpiKey: 'wasfaty', label: 'Rule 1', metricType: 'count', weight: 1, pipeline: { steps: [] }, ...overrides }
}

function draftWithElement(elementOverrides = {}, statusOverride = 'DRAFT') {
  const element = makeElementNode(elementOverrides)
  return makeDraft({
    metadata: { status: statusOverride },
    root: { id: 'root1', label: 'Test Profile', baskets: [{ id: 'b1', label: 'Basket 1', weight: 1, elements: [element], pipeline: { steps: [] } }] },
  })
}

/** Mirrors ProcessorPipelinePanel's internal adapter for test purposes only. */
function toRichPipeline(steps) {
  return {
    pipelineId: 'adhoc',
    version: '1.0.0',
    steps: (steps ?? []).map((s, idx) => ({
      stepId: `step_${idx}`,
      order: s.order ?? idx,
      enabled: s.config?.enabled !== false,
      config: {
        id: `step_${idx}`,
        version: '1.0.0',
        processorType: s.processorType,
        enabled: s.config?.enabled !== false,
        ...s.config,
      },
    })),
  }
}

// ════════════════════════════════════════════════════════════
// 1. validateRuleForm — unit tests
// ════════════════════════════════════════════════════════════
describe('validateRuleForm — required fields', () => {
  it('passes with valid label, kpiKey, and weight', () => {
    const { valid, errors } = validateRuleForm({ label: 'Wasfaty Rule', kpiKey: 'wasfaty', weight: '1' })
    expect(valid).toBe(true)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('fails when label is missing', () => {
    const { valid, errors } = validateRuleForm({ label: '', kpiKey: 'wasfaty', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('fails when label is only whitespace', () => {
    const { valid, errors } = validateRuleForm({ label: '   ', kpiKey: 'wasfaty', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('fails when label is undefined', () => {
    const { valid, errors } = validateRuleForm({ label: undefined, kpiKey: 'wasfaty', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('fails when kpiKey is missing', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: '', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.kpiKey).toBeTruthy()
  })

  it('fails when kpiKey is only whitespace', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: '   ', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.kpiKey).toBeTruthy()
  })

  it('fails when kpiKey is undefined', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: undefined, weight: '1' })
    expect(valid).toBe(false)
    expect(errors.kpiKey).toBeTruthy()
  })

  it('fails when weight is missing', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('fails when weight is zero', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '0' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('fails when weight is negative', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '-1' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('fails when weight is non-numeric', () => {
    const { valid, errors } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: 'abc' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('accepts fractional weight', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '0.25' })
    expect(valid).toBe(true)
  })

  it('description is optional — empty string is valid', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '1', description: '' })
    expect(valid).toBe(true)
  })

  it('description is optional — undefined is valid', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '1', description: undefined })
    expect(valid).toBe(true)
  })

  it('never throws on null input', () => {
    expect(() => validateRuleForm(null)).not.toThrow()
  })

  it('never throws on undefined input', () => {
    expect(() => validateRuleForm(undefined)).not.toThrow()
  })

  it('never throws on empty object input', () => {
    expect(() => validateRuleForm({})).not.toThrow()
  })

  it('reports all three required-field errors together when all are missing', () => {
    const { valid, errors } = validateRuleForm({ label: '', kpiKey: '', weight: '' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
    expect(errors.kpiKey).toBeTruthy()
    expect(errors.weight).toBeTruthy()
  })

  it('DEFAULT_RULE_FORM_VALUES has the expected shape', () => {
    expect(DEFAULT_RULE_FORM_VALUES).toEqual({ label: '', kpiKey: '', weight: '1', description: '' })
  })
})

// ════════════════════════════════════════════════════════════
// 2. createRuleNode — factory tests
// ════════════════════════════════════════════════════════════
describe('createRuleNode — factory', () => {
  it('creates a rule with the given kpiKey, label, and weight', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Wasfaty Rule', weight: 0.5 })
    expect(rule.kpiKey).toBe('wasfaty')
    expect(rule.label).toBe('Wasfaty Rule')
    expect(rule.weight).toBe(0.5)
  })

  it('defaults metricType to count', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1 })
    expect(rule.metricType).toBe('count')
  })

  it('respects an explicit metricType override', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1, metricType: 'percentage' })
    expect(rule.metricType).toBe('percentage')
  })

  it('starts with an empty processor pipeline', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1 })
    expect(rule.pipeline).toEqual({ steps: [] })
  })

  it('generates a unique id when none is provided', () => {
    const a = createRuleNode({ kpiKey: 'wasfaty', label: 'A', weight: 1 })
    const b = createRuleNode({ kpiKey: 'wasfaty', label: 'B', weight: 1 })
    expect(a.id).not.toBe(b.id)
  })

  it('respects an explicit id override', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1, id: 'custom-id' })
    expect(rule.id).toBe('custom-id')
  })

  it('sets cap when provided', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1, cap: 200 })
    expect(rule.cap).toBe(200)
  })

  it('omits cap when not provided', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1 })
    expect(rule.cap).toBeUndefined()
  })

  it('sets floor when provided', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1, floor: 10 })
    expect(rule.floor).toBe(10)
  })

  it('omits floor when not provided', () => {
    const rule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1 })
    expect(rule.floor).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════
// 3. hierarchy.ts — addRule / canAddRule behavioral tests
// ════════════════════════════════════════════════════════════
describe('addRule — immutable hierarchy mutation', () => {
  it('appends a rule to the target element', () => {
    const draft = draftWithElement()
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'New Rule', weight: 1 })
    const mutated = addRule(draft, 'e1', newRule)
    const element = mutated.root.baskets[0].elements[0]
    expect(element.rules).toHaveLength(1)
    expect(element.rules[0].id).toBe(newRule.id)
  })

  it('does not mutate the original draft', () => {
    const draft = draftWithElement()
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'New Rule', weight: 1 })
    addRule(draft, 'e1', newRule)
    expect(draft.root.baskets[0].elements[0].rules).toHaveLength(0)
  })

  it('does not mutate the original element object', () => {
    const draft = draftWithElement()
    const originalElement = draft.root.baskets[0].elements[0]
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'New Rule', weight: 1 })
    const mutated = addRule(draft, 'e1', newRule)
    expect(mutated.root.baskets[0].elements[0]).not.toBe(originalElement)
  })

  it('preserves existing rules when adding a new one', () => {
    const existingRule = makeRuleNode({ id: 'existing' })
    const draft = draftWithElement({ rules: [existingRule] })
    const newRule = createRuleNode({ kpiKey: 'sales', label: 'New Rule', weight: 1 })
    const mutated = addRule(draft, 'e1', newRule)
    const rules = mutated.root.baskets[0].elements[0].rules
    expect(rules).toHaveLength(2)
    expect(rules.map((r) => r.id)).toContain('existing')
  })

  it('returns profile unchanged when elementId does not exist', () => {
    const draft = draftWithElement()
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'New Rule', weight: 1 })
    const mutated = addRule(draft, 'nope', newRule)
    expect(mutated.root.baskets[0].elements[0].rules).toHaveLength(0)
  })

  it('never throws when elementId does not exist', () => {
    const draft = draftWithElement()
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'New Rule', weight: 1 })
    expect(() => addRule(draft, 'nope', newRule)).not.toThrow()
  })
})

describe('canAddRule — lifecycle gating', () => {
  it('is true for DRAFT status', () => {
    expect(canAddRule(draftWithElement({}, 'DRAFT'), 'e1')).toBe(true)
  })

  it('is true for VALIDATED status', () => {
    expect(canAddRule(draftWithElement({}, 'VALIDATED'), 'e1')).toBe(true)
  })

  it('is true for SIMULATED status', () => {
    expect(canAddRule(draftWithElement({}, 'SIMULATED'), 'e1')).toBe(true)
  })

  it('is false for APPROVED status', () => {
    expect(canAddRule(draftWithElement({}, 'APPROVED'), 'e1')).toBe(false)
  })

  it('is false for PUBLISHED status', () => {
    expect(canAddRule(draftWithElement({}, 'PUBLISHED'), 'e1')).toBe(false)
  })

  it('is false for ARCHIVED status', () => {
    expect(canAddRule(draftWithElement({}, 'ARCHIVED'), 'e1')).toBe(false)
  })

  it('is false for a non-existent element id', () => {
    expect(canAddRule(draftWithElement(), 'nope')).toBe(false)
  })

  it('is false when the target id is a basket, not an element', () => {
    expect(canAddRule(draftWithElement(), 'b1')).toBe(false)
  })

  it('is false when the target id is the root', () => {
    expect(canAddRule(draftWithElement(), 'root1')).toBe(false)
  })

  it('never throws on null profile', () => {
    expect(() => canAddRule(null, 'e1')).not.toThrow()
  })
})

describe('updateNode — applied to a rule', () => {
  it('patches the rule label', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const mutated = updateNode(draft, 'r1', { label: 'Updated Label' })
    expect(mutated.root.baskets[0].elements[0].rules[0].label).toBe('Updated Label')
  })

  it('patches the rule weight', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const mutated = updateNode(draft, 'r1', { weight: 0.75 })
    expect(mutated.root.baskets[0].elements[0].rules[0].weight).toBe(0.75)
  })

  it('patches the rule kpiKey', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const mutated = updateNode(draft, 'r1', { kpiKey: 'sales' })
    expect(mutated.root.baskets[0].elements[0].rules[0].kpiKey).toBe('sales')
  })

  it('patches the rule pipeline', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const newPipeline = { steps: [{ processorType: CEILING_CLAMP, order: 0, config: { enabled: true, ceiling: 150 } }] }
    const mutated = updateNode(draft, 'r1', { pipeline: newPipeline })
    expect(mutated.root.baskets[0].elements[0].rules[0].pipeline.steps).toHaveLength(1)
  })

  it('does not mutate sibling rules', () => {
    const ruleA = makeRuleNode({ id: 'rA', label: 'A' })
    const ruleB = makeRuleNode({ id: 'rB', label: 'B' })
    const draft = draftWithElement({ rules: [ruleA, ruleB] })
    const mutated = updateNode(draft, 'rA', { label: 'A-updated' })
    expect(mutated.root.baskets[0].elements[0].rules[1].label).toBe('B')
  })

  it('returns profile unchanged when ruleId does not exist', () => {
    const draft = draftWithElement({ rules: [makeRuleNode()] })
    const mutated = updateNode(draft, 'nope', { label: 'X' })
    expect(mutated.root.baskets[0].elements[0].rules[0].label).toBe('Rule 1')
  })
})

describe('removeNode — applied to a rule', () => {
  it('removes the target rule', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const mutated = removeNode(draft, 'r1')
    expect(mutated.root.baskets[0].elements[0].rules).toHaveLength(0)
  })

  it('leaves sibling rules intact', () => {
    const ruleA = makeRuleNode({ id: 'rA' })
    const ruleB = makeRuleNode({ id: 'rB' })
    const draft = draftWithElement({ rules: [ruleA, ruleB] })
    const mutated = removeNode(draft, 'rA')
    expect(mutated.root.baskets[0].elements[0].rules).toHaveLength(1)
    expect(mutated.root.baskets[0].elements[0].rules[0].id).toBe('rB')
  })

  it('never throws when ruleId does not exist', () => {
    const draft = draftWithElement({ rules: [makeRuleNode()] })
    expect(() => removeNode(draft, 'nope')).not.toThrow()
  })
})

describe('findNode — resolving a rule by id', () => {
  it('finds a rule node nested under basket > element', () => {
    const rule = makeRuleNode()
    const draft = draftWithElement({ rules: [rule] })
    const found = findNode(draft, 'r1')
    expect(found).not.toBeNull()
    expect(found.kpiKey).toBe('wasfaty')
  })

  it('returns null for an unknown id', () => {
    const draft = draftWithElement({ rules: [makeRuleNode()] })
    expect(findNode(draft, 'nope')).toBeNull()
  })

  it('never throws on a profile with no baskets', () => {
    expect(() => findNode(makeDraft(), 'r1')).not.toThrow()
  })
})

describe('calculateChildWeightSummary / findOverweightNodes / findUnderweightNodes — rule scope', () => {
  it('sums rule weights under an element', () => {
    const draft = draftWithElement({ rules: [makeRuleNode({ id: 'rA', weight: 0.4 }), makeRuleNode({ id: 'rB', weight: 0.6 })] })
    const summary = calculateChildWeightSummary(draft, 'e1')
    expect(summary.sum).toBeCloseTo(1.0)
    expect(summary.isBalanced).toBe(true)
  })

  it('flags an element as overweight when rule weights exceed 1.0', () => {
    const draft = draftWithElement({ rules: [makeRuleNode({ id: 'rA', weight: 0.8 }), makeRuleNode({ id: 'rB', weight: 0.8 })] })
    expect(findOverweightNodes(draft)).toContain('e1')
  })

  it('flags an element as underweight when rule weights are below 1.0', () => {
    const draft = draftWithElement({ rules: [makeRuleNode({ id: 'rA', weight: 0.2 })] })
    expect(findUnderweightNodes(draft)).toContain('e1')
  })
})

// ════════════════════════════════════════════════════════════
// 4. KPI registry — registry-driven selection (Task 3)
// ════════════════════════════════════════════════════════════
describe('KPI registry — registry-driven KPI list', () => {
  it('getActiveKpis returns a non-empty array from the default registry', () => {
    const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    expect(Array.isArray(kpis)).toBe(true)
    expect(kpis.length).toBeGreaterThan(0)
  })

  it('every active KPI exposes label, category, and unit', () => {
    const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    for (const kpi of kpis) {
      expect(typeof kpi.label).toBe('string')
      expect(typeof kpi.category).toBe('string')
      expect(typeof kpi.unit).toBe('string')
    }
  })

  it('includes core KPIs', () => {
    const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    const coreKpis = getCoreKpis(DEFAULT_KPI_REGISTRY)
    expect(coreKpis.length).toBeGreaterThan(0)
    for (const core of coreKpis) {
      expect(kpis.some((k) => k.key === core.key)).toBe(true)
    }
  })

  it('includes at least one non-core active KPI', () => {
    const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    expect(kpis.some((k) => !k.isCore)).toBe(true)
  })

  it('every returned KPI has a non-empty key', () => {
    const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)
    for (const kpi of kpis) {
      expect(kpi.key.length).toBeGreaterThan(0)
    }
  })

  it('RuleEditorPanel imports getActiveKpis from the registry', () => {
    expect(ruleEditorBody).toContain('getActiveKpis')
  })

  it('RuleEditorPanel imports DEFAULT_KPI_REGISTRY from the registry', () => {
    expect(ruleEditorBody).toContain('DEFAULT_KPI_REGISTRY')
  })

  it('RuleEditorPanel imports the KPI registry from the engine module, not a local array', () => {
    expect(ruleEditorBody).toContain("from '../../engine/kpiRegistry'")
  })

  it('RuleForm does not define a hardcoded KPI options array', () => {
    expect(ruleFormSrc).not.toContain('const KPI_OPTIONS')
    expect(ruleFormSrc).not.toContain('const KPIS =')
  })

  it('RuleForm renders kpis via a map, not a static option list', () => {
    expect(ruleFormSrc).toContain('kpis.map')
  })

  it('RuleForm displays label, category, and unit per KPI option', () => {
    expect(ruleFormSrc).toContain('kpi.label')
    expect(ruleFormSrc).toContain('kpi.category')
    expect(ruleFormSrc).toContain('kpi.unit')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Processor registry — all 8 types
// ════════════════════════════════════════════════════════════
const ALL_TYPES = [
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
]

describe('ALL_PROCESSOR_TYPES — exactly the 8 kernel types', () => {
  it('contains exactly 8 entries', () => {
    expect(ALL_PROCESSOR_TYPES).toHaveLength(8)
  })

  it.each(ALL_TYPES)('includes %s', (type) => {
    expect(ALL_PROCESSOR_TYPES).toContain(type)
  })

  it.each(ALL_TYPES)('isSupportedProcessorType recognises %s', (type) => {
    expect(isSupportedProcessorType(type)).toBe(true)
  })

  it('isSupportedProcessorType rejects an unknown type', () => {
    expect(isSupportedProcessorType('NOT_A_TYPE')).toBe(false)
  })

  it('isSupportedProcessorType rejects null/undefined', () => {
    expect(isSupportedProcessorType(null)).toBe(false)
    expect(isSupportedProcessorType(undefined)).toBe(false)
  })

  it.each(ALL_TYPES)('getProcessorDefinition(%s) returns a definition with a label', (type) => {
    const def = getProcessorDefinition(type)
    expect(def).toBeTruthy()
    expect(typeof def.label).toBe('string')
    expect(def.label.length).toBeGreaterThan(0)
  })

  it.each(ALL_TYPES)('getProcessorDefinition(%s) is deterministic: true', (type) => {
    expect(getProcessorDefinition(type).deterministic).toBe(true)
  })

  it('ProcessorPipelinePanel imports ALL_PROCESSOR_TYPES, not a hardcoded list', () => {
    expect(processorPipelineBody).toContain('ALL_PROCESSOR_TYPES')
  })

  it('ProcessorPipelinePanel renders the processor type select via ALL_PROCESSOR_TYPES.map', () => {
    expect(processorPipelineBody).toContain('ALL_PROCESSOR_TYPES.map')
  })
})

// ════════════════════════════════════════════════════════════
// 6. buildProcessorConfig — per-type field exposure (Task 5)
// ════════════════════════════════════════════════════════════
describe('buildProcessorConfig — RATIO_EVALUATOR', () => {
  it('always includes enabled', () => {
    const config = buildProcessorConfig(RATIO_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, enabled: true })
    expect(config.enabled).toBe(true)
  })

  it('includes zeroBehaviour when provided', () => {
    const config = buildProcessorConfig(RATIO_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, zeroBehaviour: 'skip' })
    expect(config.zeroBehaviour).toBe('skip')
  })

  it('omits zeroBehaviour when empty', () => {
    const config = buildProcessorConfig(RATIO_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.zeroBehaviour).toBeUndefined()
  })

  it('does not include ceiling/floor/weight fields', () => {
    const config = buildProcessorConfig(RATIO_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '100', floor: '0', weight: '0.5' })
    expect(config.ceiling).toBeUndefined()
    expect(config.floor).toBeUndefined()
    expect(config.weight).toBeUndefined()
  })
})

describe('buildProcessorConfig — CEILING_CLAMP', () => {
  it('includes ceiling as a number', () => {
    const config = buildProcessorConfig(CEILING_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '150' })
    expect(config.ceiling).toBe(150)
  })

  it('omits ceiling when empty', () => {
    const config = buildProcessorConfig(CEILING_CLAMP, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.ceiling).toBeUndefined()
  })

  it('does not include floor/weight fields', () => {
    const config = buildProcessorConfig(CEILING_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '150', floor: '10', weight: '0.5' })
    expect(config.floor).toBeUndefined()
    expect(config.weight).toBeUndefined()
  })
})

describe('buildProcessorConfig — FLOOR_CLAMP', () => {
  it('includes floor as a number', () => {
    const config = buildProcessorConfig(FLOOR_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, floor: '10' })
    expect(config.floor).toBe(10)
  })

  it('omits floor when empty', () => {
    const config = buildProcessorConfig(FLOOR_CLAMP, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.floor).toBeUndefined()
  })

  it('does not include ceiling/weight fields', () => {
    const config = buildProcessorConfig(FLOOR_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, floor: '10', ceiling: '150', weight: '0.5' })
    expect(config.ceiling).toBeUndefined()
    expect(config.weight).toBeUndefined()
  })
})

describe('buildProcessorConfig — WEIGHT_MULTIPLIER', () => {
  it('includes weight as a number', () => {
    const config = buildProcessorConfig(WEIGHT_MULTIPLIER, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, weight: '0.5' })
    expect(config.weight).toBe(0.5)
  })

  it('omits weight when empty', () => {
    const config = buildProcessorConfig(WEIGHT_MULTIPLIER, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.weight).toBeUndefined()
  })

  it('does not include ceiling/floor fields', () => {
    const config = buildProcessorConfig(WEIGHT_MULTIPLIER, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, weight: '0.5', ceiling: '150', floor: '10' })
    expect(config.ceiling).toBeUndefined()
    expect(config.floor).toBeUndefined()
  })
})

describe('buildProcessorConfig — BAND_EVALUATOR', () => {
  const bands = [{ id: 'b1', label: 'Low', minPct: '0', maxPct: '50', score: '40' }, { id: 'b2', label: 'High', minPct: '50', maxPct: '200', score: '90' }]

  it('includes bands with numeric fields', () => {
    const config = buildProcessorConfig(BAND_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, bands })
    expect(config.bands).toHaveLength(2)
    expect(config.bands[0].minPct).toBe(0)
    expect(config.bands[0].maxPct).toBe(50)
    expect(config.bands[0].score).toBe(40)
  })

  it('includes defaultScore when provided', () => {
    const config = buildProcessorConfig(BAND_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, bands, defaultScore: '0' })
    expect(config.defaultScore).toBe(0)
  })

  it('omits defaultScore when empty', () => {
    const config = buildProcessorConfig(BAND_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, bands })
    expect(config.defaultScore).toBeUndefined()
  })

  it('produces an empty bands array when none provided', () => {
    const config = buildProcessorConfig(BAND_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.bands).toEqual([])
  })
})

describe('buildProcessorConfig — PENALTY_EVALUATOR', () => {
  const penaltyRules = [{ id: 'p1', condition: 'below', threshold: '50', penaltyValue: '5', label: 'Severe miss' }]

  it('includes penaltyRules with numeric fields', () => {
    const config = buildProcessorConfig(PENALTY_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, penaltyRules })
    expect(config.penaltyRules).toHaveLength(1)
    expect(config.penaltyRules[0].threshold).toBe(50)
    expect(config.penaltyRules[0].penaltyValue).toBe(5)
    expect(config.penaltyRules[0].condition).toBe('below')
  })

  it('includes maxPenalty when provided', () => {
    const config = buildProcessorConfig(PENALTY_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, penaltyRules, maxPenalty: '20' })
    expect(config.maxPenalty).toBe(20)
  })

  it('includes penaltyFloor when provided', () => {
    const config = buildProcessorConfig(PENALTY_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, penaltyRules, penaltyFloor: '0' })
    expect(config.penaltyFloor).toBe(0)
  })

  it('produces an empty penaltyRules array when none provided', () => {
    const config = buildProcessorConfig(PENALTY_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.penaltyRules).toEqual([])
  })
})

describe('buildProcessorConfig — NODE_AGGREGATOR', () => {
  it('includes aggregationType when provided', () => {
    const config = buildProcessorConfig(NODE_AGGREGATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, aggregationType: 'weighted_sum' })
    expect(config.aggregationType).toBe('weighted_sum')
  })

  it('omits aggregationType when empty', () => {
    const config = buildProcessorConfig(NODE_AGGREGATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.aggregationType).toBeUndefined()
  })
})

describe('buildProcessorConfig — ZERO_TARGET_GUARD', () => {
  it('includes zeroTargetBehaviour when provided', () => {
    const config = buildProcessorConfig(ZERO_TARGET_GUARD, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, zeroTargetBehaviour: 'skip' })
    expect(config.zeroTargetBehaviour).toBe('skip')
  })

  it('omits zeroTargetBehaviour when empty', () => {
    const config = buildProcessorConfig(ZERO_TARGET_GUARD, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.zeroTargetBehaviour).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════
// 7. validateProcessorStepForm — required-field presence + kernel
//    value validation (delegated to validateProcessorStepConfig)
// ════════════════════════════════════════════════════════════
describe('validateProcessorStepForm — required-field presence', () => {
  it('CEILING_CLAMP fails when ceiling is missing', () => {
    const { valid, errors } = validateProcessorStepForm(CEILING_CLAMP, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.ceiling).toBeTruthy()
  })

  it('CEILING_CLAMP passes with a valid ceiling', () => {
    const { valid } = validateProcessorStepForm(CEILING_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '150' })
    expect(valid).toBe(true)
  })

  it('FLOOR_CLAMP fails when floor is missing', () => {
    const { valid, errors } = validateProcessorStepForm(FLOOR_CLAMP, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.floor).toBeTruthy()
  })

  it('FLOOR_CLAMP passes with a valid floor', () => {
    const { valid } = validateProcessorStepForm(FLOOR_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, floor: '0' })
    expect(valid).toBe(true)
  })

  it('WEIGHT_MULTIPLIER fails when weight is missing', () => {
    const { valid, errors } = validateProcessorStepForm(WEIGHT_MULTIPLIER, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('WEIGHT_MULTIPLIER passes with a valid weight', () => {
    const { valid } = validateProcessorStepForm(WEIGHT_MULTIPLIER, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, weight: '0.5' })
    expect(valid).toBe(true)
  })

  it('BAND_EVALUATOR fails when bands is empty', () => {
    const { valid, errors } = validateProcessorStepForm(BAND_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.bands).toBeTruthy()
  })

  it('BAND_EVALUATOR passes with at least one valid band', () => {
    const { valid } = validateProcessorStepForm(BAND_EVALUATOR, {
      ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
      bands: [{ id: 'b1', label: 'Low', minPct: '0', maxPct: '100', score: '50' }],
    })
    expect(valid).toBe(true)
  })

  it('PENALTY_EVALUATOR fails when penaltyRules is empty', () => {
    const { valid, errors } = validateProcessorStepForm(PENALTY_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.penaltyRules).toBeTruthy()
  })

  it('PENALTY_EVALUATOR passes with at least one valid rule', () => {
    const { valid } = validateProcessorStepForm(PENALTY_EVALUATOR, {
      ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
      penaltyRules: [{ id: 'p1', condition: 'below', threshold: '50', penaltyValue: '5' }],
    })
    expect(valid).toBe(true)
  })

  it('NODE_AGGREGATOR fails when aggregationType is missing', () => {
    const { valid, errors } = validateProcessorStepForm(NODE_AGGREGATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.aggregationType).toBeTruthy()
  })

  it('NODE_AGGREGATOR passes with a valid aggregationType', () => {
    const { valid } = validateProcessorStepForm(NODE_AGGREGATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, aggregationType: 'min' })
    expect(valid).toBe(true)
  })

  it('ZERO_TARGET_GUARD fails when zeroTargetBehaviour is missing', () => {
    const { valid, errors } = validateProcessorStepForm(ZERO_TARGET_GUARD, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(false)
    expect(errors.zeroTargetBehaviour).toBeTruthy()
  })

  it('ZERO_TARGET_GUARD passes with a valid zeroTargetBehaviour', () => {
    const { valid } = validateProcessorStepForm(ZERO_TARGET_GUARD, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, zeroTargetBehaviour: 'skip' })
    expect(valid).toBe(true)
  })

  it('RATIO_EVALUATOR has no required config fields and passes by default', () => {
    const { valid } = validateProcessorStepForm(RATIO_EVALUATOR, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(valid).toBe(true)
  })

  it('fails when order is missing', () => {
    const { valid, errors } = validateProcessorStepForm(RATIO_EVALUATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, order: '' })
    expect(valid).toBe(false)
    expect(errors.order).toBeTruthy()
  })

  it('never throws on null values', () => {
    expect(() => validateProcessorStepForm(RATIO_EVALUATOR, null)).not.toThrow()
  })

  it('never throws on undefined values', () => {
    expect(() => validateProcessorStepForm(CEILING_CLAMP, undefined)).not.toThrow()
  })
})

describe('validateProcessorStepForm — kernel value validation (via validateProcessorStepConfig)', () => {
  it('CEILING_CLAMP rejects a zero ceiling', () => {
    const { valid } = validateProcessorStepForm(CEILING_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '0' })
    expect(valid).toBe(false)
  })

  it('CEILING_CLAMP rejects a negative ceiling', () => {
    const { valid } = validateProcessorStepForm(CEILING_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, ceiling: '-10' })
    expect(valid).toBe(false)
  })

  it('FLOOR_CLAMP rejects a negative floor', () => {
    const { valid } = validateProcessorStepForm(FLOOR_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, floor: '-1' })
    expect(valid).toBe(false)
  })

  it('FLOOR_CLAMP accepts a zero floor', () => {
    const { valid } = validateProcessorStepForm(FLOOR_CLAMP, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, floor: '0' })
    expect(valid).toBe(true)
  })

  it('WEIGHT_MULTIPLIER rejects a weight above 1', () => {
    const { valid } = validateProcessorStepForm(WEIGHT_MULTIPLIER, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, weight: '1.5' })
    expect(valid).toBe(false)
  })

  it('WEIGHT_MULTIPLIER rejects a zero weight', () => {
    const { valid } = validateProcessorStepForm(WEIGHT_MULTIPLIER, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, weight: '0' })
    expect(valid).toBe(false)
  })

  it('BAND_EVALUATOR rejects overlapping bands', () => {
    const { valid } = validateProcessorStepForm(BAND_EVALUATOR, {
      ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
      bands: [
        { id: 'b1', label: 'Low', minPct: '0', maxPct: '60', score: '40' },
        { id: 'b2', label: 'High', minPct: '50', maxPct: '100', score: '90' },
      ],
    })
    expect(valid).toBe(false)
  })

  it('PENALTY_EVALUATOR rejects a negative penaltyValue', () => {
    const { valid } = validateProcessorStepForm(PENALTY_EVALUATOR, {
      ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
      penaltyRules: [{ id: 'p1', condition: 'below', threshold: '50', penaltyValue: '-5' }],
    })
    expect(valid).toBe(false)
  })

  it('NODE_AGGREGATOR rejects an unrecognised aggregationType', () => {
    const { valid } = validateProcessorStepForm(NODE_AGGREGATOR, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, aggregationType: 'median' })
    expect(valid).toBe(false)
  })

  it('ZERO_TARGET_GUARD rejects an unrecognised behaviour', () => {
    const { valid } = validateProcessorStepForm(ZERO_TARGET_GUARD, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, zeroTargetBehaviour: 'bogus' })
    expect(valid).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 8. validateProcessorStepConfig — direct kernel bridge tests
// ════════════════════════════════════════════════════════════
describe('validateProcessorStepConfig — direct kernel calls', () => {
  it('returns no issues for an empty config when no fields are present', () => {
    expect(validateProcessorStepConfig(CEILING_CLAMP, {})).toEqual([])
  })

  it('flags an invalid ceiling value when present', () => {
    const issues = validateProcessorStepConfig(CEILING_CLAMP, { ceiling: -5 })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags an invalid floor value when present', () => {
    const issues = validateProcessorStepConfig(FLOOR_CLAMP, { floor: -1 })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags an invalid weight value when present', () => {
    const issues = validateProcessorStepConfig(WEIGHT_MULTIPLIER, { weight: 2 })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags overlapping bands', () => {
    const issues = validateProcessorStepConfig(BAND_EVALUATOR, {
      bands: [{ minPct: 0, maxPct: 60 }, { minPct: 50, maxPct: 100 }],
    })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags a negative penaltyValue', () => {
    const issues = validateProcessorStepConfig(PENALTY_EVALUATOR, {
      penaltyRules: [{ penaltyValue: -1 }],
    })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags an invalid aggregationType', () => {
    const issues = validateProcessorStepConfig(NODE_AGGREGATOR, { aggregationType: 'unknown' })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('flags an invalid zeroTargetBehaviour', () => {
    const issues = validateProcessorStepConfig(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'unknown' })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('never throws on an empty config object', () => {
    expect(() => validateProcessorStepConfig(RATIO_EVALUATOR, {})).not.toThrow()
  })

  it('never throws on a malformed config', () => {
    expect(() => validateProcessorStepConfig(BAND_EVALUATOR, { bands: 'not-an-array' })).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 9. validatePipeline — pipeline-level ordering (Task 4/6)
// ════════════════════════════════════════════════════════════
describe('validatePipeline — order rules across processor types', () => {
  it('passes for a single RATIO_EVALUATOR step', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: RATIO_EVALUATOR, order: 0, config: { enabled: true } },
    ]))
    expect(result.valid).toBe(true)
  })

  it('flags RATIO_EVALUATOR appearing after WEIGHT_MULTIPLIER', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: WEIGHT_MULTIPLIER, order: 0, config: { enabled: true, weight: 0.5 } },
      { processorType: RATIO_EVALUATOR, order: 1, config: { enabled: true } },
    ]))
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'ORDER_RATIO_BEFORE_WEIGHT')).toBe(true)
  })

  it('passes when RATIO_EVALUATOR precedes WEIGHT_MULTIPLIER', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: RATIO_EVALUATOR, order: 0, config: { enabled: true } },
      { processorType: WEIGHT_MULTIPLIER, order: 1, config: { enabled: true, weight: 0.5 } },
    ]))
    expect(result.valid).toBe(true)
  })

  it('flags CEILING_CLAMP appearing after WEIGHT_MULTIPLIER', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: WEIGHT_MULTIPLIER, order: 0, config: { enabled: true, weight: 0.5 } },
      { processorType: CEILING_CLAMP, order: 1, config: { enabled: true, ceiling: 150 } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_CEILING_BEFORE_WEIGHT')).toBe(true)
  })

  it('flags BAND_EVALUATOR appearing before RATIO_EVALUATOR', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: BAND_EVALUATOR, order: 0, config: { enabled: true, bands: [{ id: 'b1', minPct: 0, maxPct: 100, score: 50 }] } },
      { processorType: RATIO_EVALUATOR, order: 1, config: { enabled: true } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_BAND_AFTER_RATIO')).toBe(true)
  })

  it('flags ZERO_TARGET_GUARD appearing after RATIO_EVALUATOR', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: RATIO_EVALUATOR, order: 0, config: { enabled: true } },
      { processorType: ZERO_TARGET_GUARD, order: 1, config: { enabled: true, zeroTargetBehaviour: 'skip' } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_ZERO_BEFORE_RATIO')).toBe(true)
  })

  it('flags NODE_AGGREGATOR as the first enabled step', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: NODE_AGGREGATOR, order: 0, config: { enabled: true, aggregationType: 'min' } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_AGGREGATOR_NOT_FIRST')).toBe(true)
  })

  it('ignores disabled steps when checking order', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: WEIGHT_MULTIPLIER, order: 0, config: { enabled: false, weight: 0.5 } },
      { processorType: RATIO_EVALUATOR, order: 1, config: { enabled: true } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_RATIO_BEFORE_WEIGHT')).toBe(false)
  })

  it('returns valid:true for an empty pipeline', () => {
    const result = validatePipeline(toRichPipeline([]))
    expect(result.valid).toBe(true)
  })

  it('never throws on a malformed pipeline', () => {
    expect(() => validatePipeline({ steps: null })).not.toThrow()
  })

  it('combines order issues and config issues in one result', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: WEIGHT_MULTIPLIER, order: 0, config: { enabled: true, weight: 5 } },
      { processorType: RATIO_EVALUATOR, order: 1, config: { enabled: true } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_RATIO_BEFORE_WEIGHT')).toBe(true)
    expect(result.issues.some((i) => i.code === 'INVALID_WEIGHT')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 10. RuleEditorPanel / RuleForm / RuleCard — source structure
// ════════════════════════════════════════════════════════════
describe('RuleEditorPanel — wiring', () => {
  it('imports addRule, updateNode, removeNode from hierarchy.ts', () => {
    expect(ruleEditorBody).toContain('addRule')
    expect(ruleEditorBody).toContain('updateNode')
    expect(ruleEditorBody).toContain('removeNode')
  })

  it('imports canAddRule guard', () => {
    expect(ruleEditorBody).toContain('canAddRule')
  })

  it('checks canAddRule before calling addRule on create', () => {
    expect(ruleEditorBody).toContain('if (!canAddRule(draftLike, elementId))')
  })

  it('imports createRuleNode from profileFactory', () => {
    expect(ruleEditorBody).toContain('createRuleNode')
  })

  it('imports updateProfileDocument from the existing Phase 1B service', () => {
    expect(ruleEditorBody).toContain('updateProfileDocument')
  })

  it('imports normalizeError from the store', () => {
    expect(ruleEditorBody).toContain('normalizeError')
  })

  it('nests ProcessorPipelinePanel for the selected rule', () => {
    expect(ruleEditorBody).toContain('ProcessorPipelinePanel')
  })

  it('gates the Add Rule affordance behind canEdit', () => {
    expect(ruleEditorBody).toContain('{canEdit && (')
  })

  it('does not import moveNode (no drag & drop reordering)', () => {
    expect(ruleEditorBody).not.toMatch(/\bmoveNode\b/)
  })

  it('does not import addBasket or addElement (rule scope only)', () => {
    expect(ruleEditorBody).not.toContain('addBasket')
    expect(ruleEditorBody).not.toContain('addElement')
  })

  it('guards double submit with an early return', () => {
    expect(ruleEditorBody).toContain('if (submitting) return')
  })

  it('renders a loading spinner while submitting', () => {
    expect(ruleEditorBody).toContain('Loader2')
    expect(ruleEditorBody).toContain('submitting && <Loader2')
  })

  it('disables the submit button while submitting', () => {
    expect(ruleEditorBody).toContain('disabled={submitting}')
  })

  it('persists via the hierarchy summary, not a new collection', () => {
    expect(ruleEditorBody).toContain('summarizeHierarchy')
    expect(ruleEditorBody).toContain("{ hierarchy: newHierarchy }")
  })
})

describe('RuleForm / RuleCard — source structure', () => {
  it('RuleForm exports validateRuleForm and DEFAULT_RULE_FORM_VALUES', () => {
    expect(ruleFormSrc).toContain('export function validateRuleForm')
    expect(ruleFormSrc).toContain('export const DEFAULT_RULE_FORM_VALUES')
  })

  it('RuleForm has no pipeline/processor configuration fields', () => {
    const body = ruleFormSrc.slice(ruleFormSrc.indexOf('import React'))
    expect(body).not.toContain('processorType')
    expect(body).not.toContain('bands')
    expect(body).not.toContain('penaltyRules')
  })

  it('RuleCard shows the rule label, kpiKey, and weight', () => {
    expect(ruleCardSrc).toContain('rule.label')
    expect(ruleCardSrc).toContain('rule.kpiKey')
    expect(ruleCardSrc).toContain('rule.weight')
  })

  it('RuleCard shows the processor step count without exposing config detail', () => {
    expect(ruleCardSrc).toContain('stepCount')
    expect(ruleCardSrc).not.toContain('penaltyValue')
    expect(ruleCardSrc).not.toContain('aggregationType')
  })

  it('RuleCard edit/delete affordances are gated behind canEdit', () => {
    expect(ruleCardSrc).toContain('{canEdit && (')
  })
})

// ════════════════════════════════════════════════════════════
// 11. ProcessorPipelinePanel / ProcessorConfigForm / ProcessorStepCard
//     — source structure
// ════════════════════════════════════════════════════════════
describe('ProcessorPipelinePanel — wiring', () => {
  it('imports findNode and updateNode from hierarchy.ts', () => {
    expect(processorPipelineBody).toContain('findNode')
    expect(processorPipelineBody).toContain('updateNode')
  })

  it('imports validatePipeline from processorValidation.ts', () => {
    expect(processorPipelineBody).toContain('validatePipeline')
  })

  it('imports getProcessorDefinition from processors.ts', () => {
    expect(processorPipelineBody).toContain('getProcessorDefinition')
  })

  it('imports updateProfileDocument from the existing Phase 1B service', () => {
    expect(processorPipelineBody).toContain('updateProfileDocument')
  })

  it('does not import addBasket, addElement, or addRule (pipeline scope only)', () => {
    expect(processorPipelineBody).not.toContain('addBasket')
    expect(processorPipelineBody).not.toContain('addElement')
    expect(processorPipelineBody).not.toMatch(/\baddRule\b/)
  })

  it('does not import moveNode (no drag & drop reordering)', () => {
    expect(processorPipelineBody).not.toMatch(/\bmoveNode\b/)
  })

  it('reorders by editing the order field only', () => {
    expect(processorPipelineBody).toContain("parseFloat(values.order)")
  })

  it('gates the Add Step affordance behind canEdit', () => {
    expect(processorPipelineBody).toContain('{canEdit && (')
  })

  it('guards double submit with an early return', () => {
    expect(processorPipelineBody).toContain('if (submitting) return')
  })

  it('renders a loading spinner while submitting', () => {
    expect(processorPipelineBody).toContain('Loader2')
  })

  it('disables the submit button while submitting', () => {
    expect(processorPipelineBody).toContain('disabled={submitting}')
  })

  it('renders validation issues inline without throwing', () => {
    expect(processorPipelineBody).toContain('validation.issues')
  })

  it('persists via the hierarchy summary, not a new collection', () => {
    expect(processorPipelineBody).toContain('summarizeHierarchy')
  })

  it('never imports the simulator', () => {
    expect(processorPipelineBody.toLowerCase()).not.toContain('simulator')
  })
})

describe('ProcessorConfigForm — kernel-defined fields only', () => {
  it('imports getProcessorDefinition to derive allowed fields', () => {
    expect(processorConfigFormSrc).toContain('getProcessorDefinition')
  })

  it('imports validateProcessorStepConfig and never duplicates its logic', () => {
    expect(processorConfigFormSrc).toContain('validateProcessorStepConfig')
  })

  it('renders the universal order field', () => {
    expect(processorConfigFormSrc).toContain("Field label=\"Order\"")
  })

  it('renders the universal enabled flag', () => {
    expect(processorConfigFormSrc).toContain('Step is enabled')
  })

  it('exposes ceiling only when allowed by the kernel definition', () => {
    expect(processorConfigFormSrc).toContain("allowed.has('ceiling')")
  })

  it('exposes floor only when allowed by the kernel definition', () => {
    expect(processorConfigFormSrc).toContain("allowed.has('floor')")
  })

  it('exposes weight only when allowed by the kernel definition', () => {
    expect(processorConfigFormSrc).toContain("allowed.has('weight')")
  })

  it('does not define a new processor type', () => {
    expect(processorConfigFormSrc).not.toContain('CUSTOM_PROCESSOR')
  })

  it('does not evaluate formula strings', () => {
    expect(processorConfigFormSrc).not.toContain('eval(')
    expect(processorConfigFormSrc).not.toContain('new Function(')
  })
})

describe('ProcessorStepCard — source structure', () => {
  it('shows the processor order and enabled state', () => {
    expect(processorStepCardSrc).toContain('step.order')
    expect(processorStepCardSrc).toContain('Enabled')
    expect(processorStepCardSrc).toContain('Disabled')
  })

  it('edit/delete affordances are gated behind canEdit', () => {
    expect(processorStepCardSrc).toContain('{canEdit && (')
  })

  it('does not render a draggable attribute', () => {
    expect(processorStepCardSrc).not.toContain('draggable')
  })
})

// ════════════════════════════════════════════════════════════
// 12. ElementEditorPanel / ElementCard — composition growth
// ════════════════════════════════════════════════════════════
describe('ElementEditorPanel — nests RuleEditorPanel', () => {
  it('imports RuleEditorPanel', () => {
    expect(elementEditorBody).toContain('RuleEditorPanel')
  })

  it('tracks a selectedElementId for the nested rule editor', () => {
    expect(elementEditorBody).toContain('selectedElementId')
  })

  it('still imports addElement/updateNode/removeNode for its own scope', () => {
    expect(elementEditorBody).toContain('addElement')
    expect(elementEditorBody).toContain('updateNode')
    expect(elementEditorBody).toContain('removeNode')
  })

  it('does not literally reference addRule (delegated to RuleEditorPanel)', () => {
    expect(elementEditorBody).not.toContain('addRule')
  })
})

describe('ElementCard — Manage Rules affordance', () => {
  it('accepts isSelected and onSelect props', () => {
    expect(elementCardSrc).toContain('isSelected')
    expect(elementCardSrc).toContain('onSelect')
  })

  it('renders a Manage rules button gated behind canEdit', () => {
    expect(elementCardSrc).toContain('Manage rules')
  })

  it('does not render a literal "Add Rule" button (that lives in RuleEditorPanel)', () => {
    expect(elementCardSrc).not.toContain('Add Rule')
  })
})

// ════════════════════════════════════════════════════════════
// 13. Permissions — admin edit, others read-only (Task 9)
// ════════════════════════════════════════════════════════════
describe('Permissions — canEdit propagation', () => {
  it('RuleEditorPanel accepts a canEdit prop', () => {
    expect(ruleEditorSrc).toContain('canEdit')
  })

  it('ProcessorPipelinePanel accepts a canEdit prop', () => {
    expect(processorPipelineSrc).toContain('canEdit')
  })

  it('RuleEditorPanel never imports a role check directly — defers to the canEdit prop', () => {
    expect(ruleEditorBody).not.toContain("role === 'admin'")
  })

  it('RuleEditorPanel re-checks canAddRule independent of the UI flag (defense in depth)', () => {
    expect(ruleEditorBody).toContain('canAddRule(draftLike, elementId)')
  })

  it('ProfileDetailPanel forwards actor and canEdit down through the composition chain', () => {
    expect(profileDetailPanelSrc).toContain('canEdit={!!canEdit}')
  })
})

// ════════════════════════════════════════════════════════════
// 14. GUARDRAILS — excluded scope (Task 7)
// ════════════════════════════════════════════════════════════
const NEW_FILES = [ruleFormSrc, ruleCardSrc, ruleEditorSrc, processorConfigFormSrc, processorStepCardSrc, processorPipelineSrc]

describe('GUARDRAILS — no Drag & Drop', () => {
  it('no react-dnd / dnd-kit imports in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('react-dnd')
      expect(src.toLowerCase()).not.toContain('dnd-kit')
    })
  })

  it('no draggable attribute or drag handlers in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src).not.toContain('draggable')
      expect(src.toLowerCase()).not.toContain('ondragstart')
      expect(src.toLowerCase()).not.toContain('ondrop')
    })
  })

  it('no moveNode usage anywhere in the new files', () => {
    NEW_FILES.forEach((src) => {
      expect(src).not.toMatch(/\bmoveNode\b/)
    })
  })
})

describe('GUARDRAILS — no Simulation execution', () => {
  it('no simulator/runSimulation references in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('runsimulation')
      expect(src.toLowerCase()).not.toContain('simulator')
    })
  })
})

describe('GUARDRAILS — no Publish/Approval/Version/Audit flow', () => {
  it('no publish/approve/archive workflow calls in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src).not.toContain('publishProfile')
      expect(src).not.toContain('approveProfile')
      expect(src).not.toContain('archiveProfile')
    })
  })

  it('no version-history or audit-log references in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('versionhistory')
      expect(src.toLowerCase()).not.toContain('auditlog')
    })
  })
})

describe('GUARDRAILS — no AI', () => {
  it('no AI/LLM/GPT references in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('openai')
      expect(src.toLowerCase()).not.toContain('gpt')
      expect(src.toLowerCase()).not.toContain('anthropic')
    })
  })
})

describe('GUARDRAILS — no Excel/CSV import', () => {
  it('no xlsx/csv/file-upload references in any new file', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('xlsx')
      expect(src.toLowerCase()).not.toContain('.csv')
      expect(src).not.toContain('FileReader')
    })
  })
})

describe('GUARDRAILS — no Evaluation Engine changes', () => {
  it('no evaluationEngine/evaluationPipeline/evaluationRegistry references', () => {
    NEW_FILES.forEach((src) => {
      expect(src).not.toContain('evaluationEngine')
      expect(src).not.toContain('evaluationPipeline')
      expect(src).not.toContain('evaluationRegistry')
    })
  })

  it('no imports from src/engine/evaluationPipeline or evaluationActualsService', () => {
    NEW_FILES.forEach((src) => {
      expect(src).not.toContain('evaluationActualsService')
      expect(src).not.toContain("from '../../engine/evaluationPipeline")
    })
  })
})

describe('GUARDRAILS — no new Firestore collections or snapshots', () => {
  it('every new component file persists exclusively via updateProfileDocument when it writes', () => {
    const writers = [ruleEditorSrc, processorPipelineSrc]
    writers.forEach((src) => {
      expect(src).toContain('updateProfileDocument')
      expect(src).not.toContain('collection(')
      expect(src).not.toContain('addDoc(')
      expect(src).not.toContain('setDoc(')
    })
  })

  it('no snapshot or publish-package references', () => {
    NEW_FILES.forEach((src) => {
      expect(src.toLowerCase()).not.toContain('publishpackage')
      expect(src.toLowerCase()).not.toContain('snapshot(')
    })
  })
})

// ════════════════════════════════════════════════════════════
// 15. Cross-type table-driven coverage — exhaustive sweep
// ════════════════════════════════════════════════════════════
describe('cross-type sweep — buildProcessorConfig always sets enabled correctly', () => {
  it.each(ALL_TYPES)('%s respects enabled: false', (type) => {
    const config = buildProcessorConfig(type, { ...DEFAULT_PROCESSOR_STEP_FORM_VALUES, enabled: false })
    expect(config.enabled).toBe(false)
  })

  it.each(ALL_TYPES)('%s defaults enabled to true when unset', (type) => {
    const config = buildProcessorConfig(type, DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    expect(config.enabled).toBe(true)
  })
})

describe('cross-type sweep — getProcessorDefinition field lists are arrays', () => {
  it.each(ALL_TYPES)('%s requiredConfigFields is an array', (type) => {
    expect(Array.isArray(getProcessorDefinition(type).requiredConfigFields)).toBe(true)
  })

  it.each(ALL_TYPES)('%s optionalConfigFields is an array', (type) => {
    expect(Array.isArray(getProcessorDefinition(type).optionalConfigFields)).toBe(true)
  })
})

describe('cross-type sweep — required fields are a subset of buildProcessorConfig output keys when filled', () => {
  const fullValues = {
    ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
    ceiling: '100', floor: '0', weight: '0.5',
    bands: [{ id: 'b1', label: 'L', minPct: '0', maxPct: '100', score: '50' }],
    penaltyRules: [{ id: 'p1', condition: 'below', threshold: '10', penaltyValue: '5' }],
    aggregationType: 'min',
    zeroTargetBehaviour: 'skip',
  }

  it.each(ALL_TYPES)('%s — all required fields appear in the built config', (type) => {
    const config = buildProcessorConfig(type, fullValues)
    for (const field of getProcessorDefinition(type).requiredConfigFields) {
      expect(config[field]).not.toBeUndefined()
    }
  })
})

// ════════════════════════════════════════════════════════════
// 16. Profile lifecycle × rule weight balance — integration-style
// ════════════════════════════════════════════════════════════
describe('end-to-end style — add, edit, delete a rule through hierarchy.ts', () => {
  it('add then edit then delete leaves the element with zero rules', () => {
    let draft = draftWithElement()
    const newRule = createRuleNode({ kpiKey: 'wasfaty', label: 'Rule', weight: 1 })
    draft = addRule(draft, 'e1', newRule)
    expect(draft.root.baskets[0].elements[0].rules).toHaveLength(1)

    draft = updateNode(draft, newRule.id, { label: 'Renamed Rule' })
    expect(draft.root.baskets[0].elements[0].rules[0].label).toBe('Renamed Rule')

    draft = removeNode(draft, newRule.id)
    expect(draft.root.baskets[0].elements[0].rules).toHaveLength(0)
  })

  it('adding a processor step to a rule pipeline then removing it round-trips cleanly', () => {
    let draft = draftWithElement({ rules: [makeRuleNode()] })
    const stepPipeline = { steps: [{ processorType: CEILING_CLAMP, order: 0, config: { enabled: true, ceiling: 150 } }] }
    draft = updateNode(draft, 'r1', { pipeline: stepPipeline })
    expect(findNode(draft, 'r1').pipeline.steps).toHaveLength(1)

    draft = updateNode(draft, 'r1', { pipeline: { steps: [] } })
    expect(findNode(draft, 'r1').pipeline.steps).toHaveLength(0)
  })

  it('canAddRule transitions to false once the profile moves to APPROVED', () => {
    let draft = draftWithElement({}, 'DRAFT')
    expect(canAddRule(draft, 'e1')).toBe(true)
    draft = { ...draft, metadata: { ...draft.metadata, status: 'APPROVED' } }
    expect(canAddRule(draft, 'e1')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 17. validateRuleForm — additional boundary coverage
// ════════════════════════════════════════════════════════════
describe('validateRuleForm — boundary values', () => {
  it('accepts a very small positive weight', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '0.0001' })
    expect(valid).toBe(true)
  })

  it('accepts a very large weight', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '1000' })
    expect(valid).toBe(true)
  })

  it('rejects a weight of "-0.01"', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '-0.01' })
    expect(valid).toBe(false)
  })

  it('trims label whitespace before checking', () => {
    const { valid } = validateRuleForm({ label: '  Rule  ', kpiKey: 'wasfaty', weight: '1' })
    expect(valid).toBe(true)
  })

  it('trims kpiKey whitespace before checking', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: '  wasfaty  ', weight: '1' })
    expect(valid).toBe(true)
  })

  it('treats a numeric-looking weight with leading/trailing spaces as valid', () => {
    const { valid } = validateRuleForm({ label: 'Rule', kpiKey: 'wasfaty', weight: '  1.5  ' })
    expect(valid).toBe(true)
  })

  it('never throws when values is a number', () => {
    expect(() => validateRuleForm(42)).not.toThrow()
  })

  it('never throws when values is a string', () => {
    expect(() => validateRuleForm('not-an-object')).not.toThrow()
  })

  it('never throws when values is an array', () => {
    expect(() => validateRuleForm([])).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 18. canAddRule — exhaustive status sweep via it.each
// ════════════════════════════════════════════════════════════
const EDITABLE_STATUSES = ['DRAFT', 'VALIDATED', 'SIMULATED']
const LOCKED_STATUSES = ['APPROVED', 'PUBLISHED', 'ARCHIVED']

describe('canAddRule — exhaustive status sweep', () => {
  it.each(EDITABLE_STATUSES)('is true for %s', (status) => {
    expect(canAddRule(draftWithElement({}, status), 'e1')).toBe(true)
  })

  it.each(LOCKED_STATUSES)('is false for %s', (status) => {
    expect(canAddRule(draftWithElement({}, status), 'e1')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 19. validateProcessorStepConfig — valid-case sweep (no issues)
// ════════════════════════════════════════════════════════════
describe('validateProcessorStepConfig — valid configs produce no issues', () => {
  it('CEILING_CLAMP with a positive ceiling', () => {
    expect(validateProcessorStepConfig(CEILING_CLAMP, { ceiling: 150 })).toEqual([])
  })

  it('FLOOR_CLAMP with a zero floor', () => {
    expect(validateProcessorStepConfig(FLOOR_CLAMP, { floor: 0 })).toEqual([])
  })

  it('WEIGHT_MULTIPLIER with weight 1', () => {
    expect(validateProcessorStepConfig(WEIGHT_MULTIPLIER, { weight: 1 })).toEqual([])
  })

  it('WEIGHT_MULTIPLIER with weight 0.01', () => {
    expect(validateProcessorStepConfig(WEIGHT_MULTIPLIER, { weight: 0.01 })).toEqual([])
  })

  it('BAND_EVALUATOR with non-overlapping bands', () => {
    const issues = validateProcessorStepConfig(BAND_EVALUATOR, {
      bands: [{ minPct: 0, maxPct: 50 }, { minPct: 50, maxPct: 100 }],
    })
    expect(issues).toEqual([])
  })

  it('PENALTY_EVALUATOR with a zero penaltyValue', () => {
    const issues = validateProcessorStepConfig(PENALTY_EVALUATOR, { penaltyRules: [{ penaltyValue: 0 }] })
    expect(issues).toEqual([])
  })

  it('NODE_AGGREGATOR with aggregationType "weighted_sum"', () => {
    expect(validateProcessorStepConfig(NODE_AGGREGATOR, { aggregationType: 'weighted_sum' })).toEqual([])
  })

  it('ZERO_TARGET_GUARD with zeroTargetBehaviour "score_full"', () => {
    expect(validateProcessorStepConfig(ZERO_TARGET_GUARD, { zeroTargetBehaviour: 'score_full' })).toEqual([])
  })

  it('RATIO_EVALUATOR config is never checked (no validator branch) and returns no issues', () => {
    expect(validateProcessorStepConfig(RATIO_EVALUATOR, { zeroBehaviour: 'skip' })).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 20. GUARDRAILS — per-file sweep via it.each (Task 7 exhaustive)
// ════════════════════════════════════════════════════════════
const NAMED_NEW_FILES = [
  ['RuleForm', ruleFormSrc],
  ['RuleCard', ruleCardSrc],
  ['RuleEditorPanel', ruleEditorSrc],
  ['ProcessorConfigForm', processorConfigFormSrc],
  ['ProcessorStepCard', processorStepCardSrc],
  ['ProcessorPipelinePanel', processorPipelineSrc],
]

describe('GUARDRAILS — per-file sweep', () => {
  it.each(NAMED_NEW_FILES)('%s has no react-dnd reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('react-dnd')
  })

  it.each(NAMED_NEW_FILES)('%s has no dnd-kit reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('dnd-kit')
  })

  it.each(NAMED_NEW_FILES)('%s has no draggable attribute', (_name, src) => {
    expect(src).not.toContain('draggable')
  })

  it.each(NAMED_NEW_FILES)('%s has no simulator reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('simulator')
  })

  it.each(NAMED_NEW_FILES)('%s has no openai/gpt reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('openai')
    expect(src.toLowerCase()).not.toContain('gpt')
  })

  it.each(NAMED_NEW_FILES)('%s has no xlsx/csv reference', (_name, src) => {
    expect(src.toLowerCase()).not.toContain('xlsx')
    expect(src.toLowerCase()).not.toContain('.csv')
  })

  it.each(NAMED_NEW_FILES)('%s has no publishProfile/approveProfile/archiveProfile reference', (_name, src) => {
    expect(src).not.toContain('publishProfile')
    expect(src).not.toContain('approveProfile')
    expect(src).not.toContain('archiveProfile')
  })

  it.each(NAMED_NEW_FILES)('%s has no evaluationEngine reference', (_name, src) => {
    expect(src).not.toContain('evaluationEngine')
  })

  it.each(NAMED_NEW_FILES)('%s has no eval()/new Function() code execution', (_name, src) => {
    expect(src).not.toContain('eval(')
    expect(src).not.toContain('new Function(')
  })
})

// ════════════════════════════════════════════════════════════
// 21. ProcessorPipelinePanel adapter — additional order-rule sweeps
// ════════════════════════════════════════════════════════════
describe('validatePipeline — additional sweeps via toRichPipeline', () => {
  it('a fully valid 3-step pipeline (ZERO_TARGET_GUARD -> RATIO -> WEIGHT) passes', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: ZERO_TARGET_GUARD, order: 0, config: { enabled: true, zeroTargetBehaviour: 'skip' } },
      { processorType: RATIO_EVALUATOR, order: 1, config: { enabled: true } },
      { processorType: WEIGHT_MULTIPLIER, order: 2, config: { enabled: true, weight: 0.5 } },
    ]))
    expect(result.valid).toBe(true)
  })

  it('NODE_AGGREGATOR after another step is not flagged as first', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: RATIO_EVALUATOR, order: 0, config: { enabled: true } },
      { processorType: NODE_AGGREGATOR, order: 1, config: { enabled: true, aggregationType: 'min' } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_AGGREGATOR_NOT_FIRST')).toBe(false)
  })

  it('a single disabled step never produces order issues', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: NODE_AGGREGATOR, order: 0, config: { enabled: false, aggregationType: 'min' } },
    ]))
    expect(result.issues.some((i) => i.code === 'ORDER_AGGREGATOR_NOT_FIRST')).toBe(false)
  })

  it('accumulates multiple config-level issues across steps', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: CEILING_CLAMP, order: 0, config: { enabled: true, ceiling: -1 } },
      { processorType: FLOOR_CLAMP, order: 1, config: { enabled: true, floor: -1 } },
    ]))
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('a pipeline with only RATIO_EVALUATOR and BAND_EVALUATOR in correct order passes', () => {
    const result = validatePipeline(toRichPipeline([
      { processorType: RATIO_EVALUATOR, order: 0, config: { enabled: true } },
      { processorType: BAND_EVALUATOR, order: 1, config: { enabled: true, bands: [{ id: 'b1', minPct: 0, maxPct: 100, score: 50 }] } },
    ]))
    expect(result.valid).toBe(true)
  })
})
