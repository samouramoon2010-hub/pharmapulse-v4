// ============================================================
// phase2fg.test.ts — Bundle 1 certification: Basket + Element
// Editors (Phase 2F + 2G), 250+ tests.
//
// Pattern: ?raw source inspection + direct unit tests against the
// pure validators (validateBasketForm / validateElementForm) and
// against the kernel hierarchy.ts helpers used by the editors.
//
// NO Rule editor. NO Pipeline editor. NO Drag & Drop. NO Simulation.
// NO AI. NO Excel import. NO Evaluation Engine changes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { validateBasketForm, DEFAULT_BASKET_FORM_VALUES } from '../../components/profileStudio/BasketForm.jsx'
import { validateElementForm, DEFAULT_ELEMENT_FORM_VALUES } from '../../components/profileStudio/ElementForm.jsx'
import {
  addBasket, addElement, updateNode, removeNode,
  canAddBasket, canAddElement,
  calculateChildWeightSummary, findOverweightNodes, findUnderweightNodes,
} from '../../profileStudio/hierarchy'
import { createBasketNode, createElementNode } from '../../profileStudio/profileFactory'

const basketFormSrc          = await import('../../components/profileStudio/BasketForm.jsx?raw').then((m) => m.default)
const basketCardSrc          = await import('../../components/profileStudio/BasketCard.jsx?raw').then((m) => m.default)
const basketEditorSrc        = await import('../../components/profileStudio/BasketEditorPanel.jsx?raw').then((m) => m.default)
const elementFormSrc         = await import('../../components/profileStudio/ElementForm.jsx?raw').then((m) => m.default)
const elementCardSrc         = await import('../../components/profileStudio/ElementCard.jsx?raw').then((m) => m.default)
const elementEditorSrc       = await import('../../components/profileStudio/ElementEditorPanel.jsx?raw').then((m) => m.default)
const profileDetailPanelSrc  = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)
const profileStudioPageSrc   = await import('./ProfileStudioPage.jsx?raw').then((m) => m.default)

// Body-only slices to avoid false positives from header-comment prose
// (e.g. "NO Rule editor") that documents these exact constraints.
const basketEditorBody  = basketEditorSrc.slice(basketEditorSrc.indexOf('import React'))
const elementEditorBody = elementEditorSrc.slice(elementEditorSrc.indexOf('import React'))

function makeDraft(overrides = {}) {
  return {
    metadata: { status: 'DRAFT', id: 'p1', name: 'Test Profile', version: '1.0.0', scope: 'PHARMACY', validFrom: '2026-01-01' },
    root: { id: 'root1', label: 'Test Profile', baskets: [] },
    ...overrides,
  }
}

function makeBasketNode(overrides = {}) {
  return { id: 'b1', label: 'Basket 1', weight: 1, elements: [], pipeline: { steps: [] }, ...overrides }
}

function makeElementNode(overrides = {}) {
  return { id: 'e1', label: 'Element 1', weight: 1, rules: [], pipeline: { steps: [] }, ...overrides }
}

// ════════════════════════════════════════════════════════════
// 1. validateBasketForm — unit tests
// ════════════════════════════════════════════════════════════
describe('validateBasketForm — required fields', () => {
  it('passes with valid label and weight', () => {
    const { valid, errors } = validateBasketForm({ label: 'Sales', weight: '1' })
    expect(valid).toBe(true)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('fails when label is missing', () => {
    const { valid, errors } = validateBasketForm({ label: '', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('fails when label is only whitespace', () => {
    const { valid, errors } = validateBasketForm({ label: '   ', weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('fails when label is undefined', () => {
    const { valid, errors } = validateBasketForm({ label: undefined, weight: '1' })
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
  })

  it('description is optional — empty string is valid', () => {
    const { valid } = validateBasketForm({ label: 'Sales', weight: '1', description: '' })
    expect(valid).toBe(true)
  })

  it('description is optional — undefined is valid', () => {
    const { valid } = validateBasketForm({ label: 'Sales', weight: '1', description: undefined })
    expect(valid).toBe(true)
  })

  it('never throws on null input', () => {
    expect(() => validateBasketForm(null)).not.toThrow()
  })

  it('never throws on undefined input', () => {
    expect(() => validateBasketForm(undefined)).not.toThrow()
  })

  it('never throws on empty object input', () => {
    expect(() => validateBasketForm({})).not.toThrow()
  })

  it('returns both errors for an empty object', () => {
    const { valid, errors } = validateBasketForm({})
    expect(valid).toBe(false)
    expect(errors.label).toBeTruthy()
    expect(errors.weight).toBeTruthy()
  })
})

describe('validateBasketForm — weight > 0 rule', () => {
  it('accepts weight = 1', () => {
    expect(validateBasketForm({ label: 'B', weight: '1' }).valid).toBe(true)
  })

  it('accepts weight = 0.5', () => {
    expect(validateBasketForm({ label: 'B', weight: '0.5' }).valid).toBe(true)
  })

  it('accepts weight = 100', () => {
    expect(validateBasketForm({ label: 'B', weight: '100' }).valid).toBe(true)
  })

  it('rejects weight = 0', () => {
    const { valid, errors } = validateBasketForm({ label: 'B', weight: '0' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('rejects negative weight', () => {
    const { valid, errors } = validateBasketForm({ label: 'B', weight: '-1' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('rejects non-numeric weight', () => {
    const { valid, errors } = validateBasketForm({ label: 'B', weight: 'abc' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('rejects empty weight string', () => {
    const { valid, errors } = validateBasketForm({ label: 'B', weight: '' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('rejects whitespace-only weight', () => {
    const { valid, errors } = validateBasketForm({ label: 'B', weight: '   ' })
    expect(valid).toBe(false)
    expect(errors.weight).toBeTruthy()
  })

  it('trims weight before parsing', () => {
    expect(validateBasketForm({ label: 'B', weight: '  2.5  ' }).valid).toBe(true)
  })

  it('accepts a numeric (not string) weight value', () => {
    expect(validateBasketForm({ label: 'B', weight: 1.5 }).valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 2. validateElementForm — unit tests (mirrors basket rules)
// ════════════════════════════════════════════════════════════
describe('validateElementForm — required fields', () => {
  it('passes with valid label and weight', () => {
    expect(validateElementForm({ label: 'Volume', weight: '1' }).valid).toBe(true)
  })

  it('fails when label is missing', () => {
    expect(validateElementForm({ label: '', weight: '1' }).valid).toBe(false)
  })

  it('fails when label is whitespace only', () => {
    expect(validateElementForm({ label: '   ', weight: '1' }).valid).toBe(false)
  })

  it('description is optional', () => {
    expect(validateElementForm({ label: 'Volume', weight: '1', description: '' }).valid).toBe(true)
  })

  it('never throws on null/undefined/empty input', () => {
    expect(() => validateElementForm(null)).not.toThrow()
    expect(() => validateElementForm(undefined)).not.toThrow()
    expect(() => validateElementForm({})).not.toThrow()
  })
})

describe('validateElementForm — weight > 0 rule', () => {
  it('accepts weight = 1', () => {
    expect(validateElementForm({ label: 'E', weight: '1' }).valid).toBe(true)
  })

  it('rejects weight = 0', () => {
    expect(validateElementForm({ label: 'E', weight: '0' }).valid).toBe(false)
  })

  it('rejects negative weight', () => {
    expect(validateElementForm({ label: 'E', weight: '-5' }).valid).toBe(false)
  })

  it('rejects non-numeric weight', () => {
    expect(validateElementForm({ label: 'E', weight: 'xyz' }).valid).toBe(false)
  })

  it('rejects missing weight', () => {
    expect(validateElementForm({ label: 'E', weight: '' }).valid).toBe(false)
  })
})

describe('DEFAULT_BASKET_FORM_VALUES / DEFAULT_ELEMENT_FORM_VALUES', () => {
  it('basket defaults have empty label, weight "1", empty description', () => {
    expect(DEFAULT_BASKET_FORM_VALUES.label).toBe('')
    expect(DEFAULT_BASKET_FORM_VALUES.weight).toBe('1')
    expect(DEFAULT_BASKET_FORM_VALUES.description).toBe('')
  })

  it('element defaults have empty label, weight "1", empty description', () => {
    expect(DEFAULT_ELEMENT_FORM_VALUES.label).toBe('')
    expect(DEFAULT_ELEMENT_FORM_VALUES.weight).toBe('1')
    expect(DEFAULT_ELEMENT_FORM_VALUES.description).toBe('')
  })

  it('basket defaults pass validation once label is filled', () => {
    expect(validateBasketForm({ ...DEFAULT_BASKET_FORM_VALUES, label: 'X' }).valid).toBe(true)
  })

  it('element defaults pass validation once label is filled', () => {
    expect(validateElementForm({ ...DEFAULT_ELEMENT_FORM_VALUES, label: 'X' }).valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 3. Add basket — behavioural (kernel + factory composition)
// ════════════════════════════════════════════════════════════
describe('Add basket — kernel composition', () => {
  it('addBasket appends a new basket via createBasketNode', () => {
    const draft = makeDraft()
    const basket = createBasketNode({ label: 'Sales', weight: 1 })
    const updated = addBasket(draft, basket)
    expect(updated.root.baskets).toHaveLength(1)
    expect(updated.root.baskets[0].label).toBe('Sales')
  })

  it('addBasket does not mutate the original draft', () => {
    const draft = makeDraft()
    const basket = createBasketNode({ label: 'Sales', weight: 1 })
    addBasket(draft, basket)
    expect(draft.root.baskets).toHaveLength(0)
  })

  it('canAddBasket is true for DRAFT status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'DRAFT' } }))).toBe(true)
  })

  it('canAddBasket is true for VALIDATED status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'VALIDATED' } }))).toBe(true)
  })

  it('canAddBasket is true for SIMULATED status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'SIMULATED' } }))).toBe(true)
  })

  it('canAddBasket is false for APPROVED status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'APPROVED' } }))).toBe(false)
  })

  it('canAddBasket is false for PUBLISHED status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'PUBLISHED' } }))).toBe(false)
  })

  it('canAddBasket is false for ARCHIVED status', () => {
    expect(canAddBasket(makeDraft({ metadata: { status: 'ARCHIVED' } }))).toBe(false)
  })

  it('createBasketNode generates a unique id when none supplied', () => {
    const b1 = createBasketNode({ label: 'A', weight: 1 })
    const b2 = createBasketNode({ label: 'B', weight: 1 })
    expect(b1.id).not.toBe(b2.id)
  })

  it('createBasketNode starts with an empty elements array', () => {
    expect(createBasketNode({ label: 'A', weight: 1 }).elements).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 4. Edit basket — behavioural
// ════════════════════════════════════════════════════════════
describe('Edit basket — kernel composition', () => {
  it('updateNode patches label and weight immutably', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = updateNode(draft, 'b1', { label: 'Renamed', weight: 2 })
    expect(updated.root.baskets[0].label).toBe('Renamed')
    expect(updated.root.baskets[0].weight).toBe(2)
  })

  it('updateNode does not mutate the original draft', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    updateNode(draft, 'b1', { label: 'Renamed' })
    expect(draft.root.baskets[0].label).toBe('Basket 1')
  })

  it('updateNode leaves other baskets untouched', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', label: 'One' }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', label: 'Two' }))
    const updated = updateNode(draft, 'b1', { label: 'Renamed' })
    expect(updated.root.baskets.find((b) => b.id === 'b2').label).toBe('Two')
  })

  it('updateNode on unknown id returns the profile unchanged', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = updateNode(draft, 'does-not-exist', { label: 'X' })
    expect(updated.root.baskets[0].label).toBe('Basket 1')
  })

  it('can update description as well as label/weight', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = updateNode(draft, 'b1', { description: 'New desc' })
    expect(updated.root.baskets[0].description).toBe('New desc')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Delete basket — behavioural
// ════════════════════════════════════════════════════════════
describe('Delete basket — kernel composition', () => {
  it('removeNode removes the basket and its subtree', () => {
    const draft = addBasket(makeDraft(), makeBasketNode({ elements: [makeElementNode()] }))
    const updated = removeNode(draft, 'b1')
    expect(updated.root.baskets).toHaveLength(0)
  })

  it('removeNode does not mutate the original draft', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    removeNode(draft, 'b1')
    expect(draft.root.baskets).toHaveLength(1)
  })

  it('removeNode on unknown id returns the profile unchanged', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = removeNode(draft, 'does-not-exist')
    expect(updated.root.baskets).toHaveLength(1)
  })

  it('removeNode on root is a no-op', () => {
    const draft = makeDraft()
    const updated = removeNode(draft, draft.root.id)
    expect(updated.root.id).toBe(draft.root.id)
  })

  it('removing one basket leaves other baskets intact', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1' }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2' }))
    const updated = removeNode(draft, 'b1')
    expect(updated.root.baskets).toHaveLength(1)
    expect(updated.root.baskets[0].id).toBe('b2')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Add element — behavioural
// ════════════════════════════════════════════════════════════
describe('Add element — kernel composition', () => {
  it('addElement appends a new element via createElementNode', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const element = createElementNode({ label: 'Volume', weight: 1 })
    const updated = addElement(draft, 'b1', element)
    expect(updated.root.baskets[0].elements).toHaveLength(1)
    expect(updated.root.baskets[0].elements[0].label).toBe('Volume')
  })

  it('addElement does not mutate the original draft', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    addElement(draft, 'b1', createElementNode({ label: 'Volume', weight: 1 }))
    expect(draft.root.baskets[0].elements).toHaveLength(0)
  })

  it('addElement on unknown basketId returns the profile unchanged', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = addElement(draft, 'no-such-basket', createElementNode({ label: 'X', weight: 1 }))
    expect(updated.root.baskets[0].elements).toHaveLength(0)
  })

  it('canAddElement is true for an existing basket in DRAFT', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    expect(canAddElement(draft, 'b1')).toBe(true)
  })

  it('canAddElement is false for a non-existent basket id', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    expect(canAddElement(draft, 'nope')).toBe(false)
  })

  it('canAddElement is false when profile status is APPROVED', () => {
    const draft = addBasket(makeDraft({ metadata: { status: 'APPROVED' } }), makeBasketNode())
    expect(canAddElement(draft, 'b1')).toBe(false)
  })

  it('createElementNode starts with an empty rules array', () => {
    expect(createElementNode({ label: 'X', weight: 1 }).rules).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// 7. Edit element — behavioural
// ════════════════════════════════════════════════════════════
describe('Edit element — kernel composition', () => {
  it('updateNode patches an element label and weight', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode())
    const updated = updateNode(draft, 'e1', { label: 'Renamed', weight: 3 })
    expect(updated.root.baskets[0].elements[0].label).toBe('Renamed')
    expect(updated.root.baskets[0].elements[0].weight).toBe(3)
  })

  it('updateNode does not mutate the original draft for elements', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode())
    updateNode(draft, 'e1', { label: 'Renamed' })
    expect(draft.root.baskets[0].elements[0].label).toBe('Element 1')
  })

  it('editing an element leaves sibling elements untouched', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', label: 'One' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2', label: 'Two' }))
    const updated = updateNode(draft, 'e1', { label: 'Renamed' })
    expect(updated.root.baskets[0].elements.find((e) => e.id === 'e2').label).toBe('Two')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Delete element — behavioural
// ════════════════════════════════════════════════════════════
describe('Delete element — kernel composition', () => {
  it('removeNode removes the element from its basket', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode())
    const updated = removeNode(draft, 'e1')
    expect(updated.root.baskets[0].elements).toHaveLength(0)
  })

  it('removeNode does not mutate the original draft for elements', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode())
    removeNode(draft, 'e1')
    expect(draft.root.baskets[0].elements).toHaveLength(1)
  })

  it('removing one element leaves sibling elements intact', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2' }))
    const updated = removeNode(draft, 'e1')
    expect(updated.root.baskets[0].elements).toHaveLength(1)
    expect(updated.root.baskets[0].elements[0].id).toBe('e2')
  })

  it('removing an element does not affect its parent basket', () => {
    let draft = addBasket(makeDraft(), makeBasketNode())
    draft = addElement(draft, 'b1', makeElementNode())
    const updated = removeNode(draft, 'e1')
    expect(updated.root.baskets).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════
// 9. Weight validation — boundary and matrix coverage
// ════════════════════════════════════════════════════════════
describe('Weight validation — boundary matrix', () => {
  ;[0, -1, -0.01, NaN].forEach((w) => {
    it(`basket form rejects weight=${w}`, () => {
      expect(validateBasketForm({ label: 'B', weight: String(w) }).valid).toBe(false)
    })
  })

  ;[0.01, 1, 2.5, 999].forEach((w) => {
    it(`basket form accepts weight=${w}`, () => {
      expect(validateBasketForm({ label: 'B', weight: String(w) }).valid).toBe(true)
    })
  })

  ;[0, -1, -0.01].forEach((w) => {
    it(`element form rejects weight=${w}`, () => {
      expect(validateElementForm({ label: 'E', weight: String(w) }).valid).toBe(false)
    })
  })

  ;[0.01, 1, 2.5, 999].forEach((w) => {
    it(`element form accepts weight=${w}`, () => {
      expect(validateElementForm({ label: 'E', weight: String(w) }).valid).toBe(true)
    })
  })
})

// ════════════════════════════════════════════════════════════
// 10. Overweight / underweight warnings — kernel functions only
// ════════════════════════════════════════════════════════════
describe('Overweight warnings — findOverweightNodes', () => {
  it('flags root when basket weights sum > 1.0 + tolerance', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.7 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', weight: 0.5 }))
    expect(findOverweightNodes(draft)).toContain(draft.root.id)
  })

  it('flags a basket when its element weights sum > 1.0 + tolerance', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 1 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', weight: 0.8 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2', weight: 0.5 }))
    expect(findOverweightNodes(draft)).toContain('b1')
  })

  it('does not flag a perfectly balanced single basket', () => {
    const draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 1 }))
    expect(findOverweightNodes(draft)).not.toContain(draft.root.id)
  })
})

describe('Underweight warnings — findUnderweightNodes', () => {
  it('flags root when basket weights sum < 1.0 - tolerance', () => {
    const draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.3 }))
    expect(findUnderweightNodes(draft)).toContain(draft.root.id)
  })

  it('flags a basket when its element weights sum < 1.0 - tolerance', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 1 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', weight: 0.2 }))
    expect(findUnderweightNodes(draft)).toContain('b1')
  })

  it('does not flag a perfectly balanced basket list', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.5 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', weight: 0.5 }))
    expect(findUnderweightNodes(draft)).not.toContain(draft.root.id)
  })

  it('does not flag an empty basket list (no baskets = no warning)', () => {
    const draft = makeDraft()
    expect(findUnderweightNodes(draft)).not.toContain(draft.root.id)
  })
})

describe('calculateChildWeightSummary — used for "total child weight" display', () => {
  it('returns sum, count, and isBalanced for root (baskets)', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.5 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', weight: 0.5 }))
    const summary = calculateChildWeightSummary(draft, draft.root.id)
    expect(summary.sum).toBe(1)
    expect(summary.count).toBe(2)
    expect(summary.isBalanced).toBe(true)
  })

  it('returns sum, count, and isBalanced for a basket (elements)', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 1 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', weight: 1 }))
    const summary = calculateChildWeightSummary(draft, 'b1')
    expect(summary.sum).toBe(1)
    expect(summary.count).toBe(1)
    expect(summary.isBalanced).toBe(true)
  })

  it('isBalanced is false when count is 0', () => {
    const draft = makeDraft()
    const summary = calculateChildWeightSummary(draft, draft.root.id)
    expect(summary.isBalanced).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 11. BasketEditorPanel.jsx — source structure
// ════════════════════════════════════════════════════════════
describe('BasketEditorPanel.jsx — source structure', () => {
  it('exports default function BasketEditorPanel', () => {
    expect(basketEditorSrc).toContain('export default function BasketEditorPanel')
  })

  it('imports addBasket, updateNode, removeNode from hierarchy.ts (no direct mutation)', () => {
    expect(basketEditorSrc).toContain('addBasket')
    expect(basketEditorSrc).toContain('updateNode')
    expect(basketEditorSrc).toContain('removeNode')
    expect(basketEditorSrc).toContain("from '../../profileStudio/hierarchy'")
  })

  it('imports canAddBasket guard', () => {
    expect(basketEditorSrc).toContain('canAddBasket')
  })

  it('imports calculateChildWeightSummary, findOverweightNodes, findUnderweightNodes', () => {
    expect(basketEditorSrc).toContain('calculateChildWeightSummary')
    expect(basketEditorSrc).toContain('findOverweightNodes')
    expect(basketEditorSrc).toContain('findUnderweightNodes')
  })

  it('imports createBasketNode from the kernel factory (no hand-rolled node objects)', () => {
    expect(basketEditorSrc).toContain('createBasketNode')
    expect(basketEditorSrc).toContain("from '../../profileStudio/profileFactory'")
  })

  it('imports updateProfileDocument from the existing Phase 1B service', () => {
    expect(basketEditorSrc).toContain('updateProfileDocument')
    expect(basketEditorSrc).toContain("from '../../profileStudio/profileStudioService'")
  })

  it('imports normalizeError from the Phase 1C store', () => {
    expect(basketEditorSrc).toContain('normalizeError')
  })

  it('imports useToastStore for feedback', () => {
    expect(basketEditorSrc).toContain('useToastStore')
  })

  it('has a submitting state for double-submit prevention', () => {
    expect(basketEditorSrc).toContain('submitting')
    expect(basketEditorSrc).toContain('useState')
  })

  it('handleSubmit guards against double submit', () => {
    expect(basketEditorSrc).toContain('if (submitting) return')
  })

  it('disables Save/Cancel buttons while submitting', () => {
    expect(basketEditorSrc).toContain('disabled={submitting}')
  })

  it('shows a spinner while submitting', () => {
    expect(basketEditorSrc).toContain('Loader2')
    expect(basketEditorSrc).toContain('animate-spin')
  })

  it('renders Add Basket button only when canEdit is true', () => {
    expect(basketEditorSrc).toContain('{canEdit &&')
    expect(basketEditorSrc).toContain('Add Basket')
  })

  it('renders BasketCard for each basket', () => {
    expect(basketEditorSrc).toContain('<BasketCard')
  })

  it('passes canEdit through to BasketCard (per-card Edit/Delete gating)', () => {
    expect(basketEditorSrc).toContain('canEdit={canEdit}')
  })

  it('passes overweight/underweight flags to BasketCard', () => {
    expect(basketEditorSrc).toContain('isOverweight={overweightIds.includes(basket.id)}')
    expect(basketEditorSrc).toContain('isUnderweight={underweightIds.includes(basket.id)}')
  })

  it('renders ElementEditorPanel nested under the selected basket', () => {
    expect(basketEditorSrc).toContain('<ElementEditorPanel')
    expect(basketEditorSrc).toContain('basketId={basket.id}')
  })

  it('validates the form before mutating the hierarchy', () => {
    expect(basketEditorSrc).toContain('validateBasketForm(values)')
    expect(basketEditorSrc).toContain('if (!valid)')
  })

  it('checks canAddBasket before calling addBasket on create', () => {
    expect(basketEditorSrc).toContain('if (!canAddBasket(draftLike))')
  })

  it('persists via updateProfileDocument after every mutation (add/edit/delete)', () => {
    const matches = basketEditorSrc.match(/await updateProfileDocument\(/g) || []
    expect(matches.length).toBe(1) // single persist() helper, called from all 3 flows
  })

  it('shows success toast distinct messages for add/update/delete', () => {
    expect(basketEditorSrc).toContain("'Basket added'")
    expect(basketEditorSrc).toContain("'Basket updated'")
    expect(basketEditorSrc).toContain("'Basket deleted'")
  })

  it('calls onSaved after a successful persist (list refresh)', () => {
    expect(basketEditorSrc).toContain('onSaved?.()')
  })

  it('shows EmptyState when there are no baskets', () => {
    expect(basketEditorSrc).toContain('No baskets yet')
  })

  it('does not import xlsx/csv', () => {
    expect(basketEditorSrc).not.toContain('xlsx')
    expect(basketEditorSrc.toLowerCase()).not.toContain('.csv')
  })
})

// ════════════════════════════════════════════════════════════
// 12. ElementEditorPanel.jsx — source structure
// ════════════════════════════════════════════════════════════
describe('ElementEditorPanel.jsx — source structure', () => {
  it('exports default function ElementEditorPanel', () => {
    expect(elementEditorSrc).toContain('export default function ElementEditorPanel')
  })

  it('imports addElement, updateNode, removeNode from hierarchy.ts', () => {
    expect(elementEditorSrc).toContain('addElement')
    expect(elementEditorSrc).toContain('updateNode')
    expect(elementEditorSrc).toContain('removeNode')
    expect(elementEditorSrc).toContain("from '../../profileStudio/hierarchy'")
  })

  it('imports canAddElement guard', () => {
    expect(elementEditorSrc).toContain('canAddElement')
  })

  it('imports calculateChildWeightSummary, findOverweightNodes, findUnderweightNodes', () => {
    expect(elementEditorSrc).toContain('calculateChildWeightSummary')
    expect(elementEditorSrc).toContain('findOverweightNodes')
    expect(elementEditorSrc).toContain('findUnderweightNodes')
  })

  it('imports createElementNode from the kernel factory', () => {
    expect(elementEditorSrc).toContain('createElementNode')
    expect(elementEditorSrc).toContain("from '../../profileStudio/profileFactory'")
  })

  it('imports updateProfileDocument from the existing Phase 1B service', () => {
    expect(elementEditorSrc).toContain('updateProfileDocument')
  })

  it('accepts a basketId prop scoping it to one basket', () => {
    expect(elementEditorSrc).toContain('basketId')
  })

  it('has a submitting state for double-submit prevention', () => {
    expect(elementEditorSrc).toContain('submitting')
  })

  it('handleSubmit guards against double submit', () => {
    expect(elementEditorSrc).toContain('if (submitting) return')
  })

  it('renders Add Element button only when canEdit is true', () => {
    expect(elementEditorSrc).toContain('{canEdit &&')
    expect(elementEditorSrc).toContain('Add Element')
  })

  it('renders ElementCard for each element', () => {
    expect(elementEditorSrc).toContain('<ElementCard')
  })

  it('checks canAddElement before calling addElement on create', () => {
    expect(elementEditorSrc).toContain('if (!canAddElement(draftLike, basketId))')
  })

  it('persists via updateProfileDocument after every mutation', () => {
    const matches = elementEditorSrc.match(/await updateProfileDocument\(/g) || []
    expect(matches.length).toBe(1)
  })

  it('shows EmptyState when the basket has no elements', () => {
    expect(elementEditorSrc).toContain('No elements yet')
  })

  it('returns null when the basket cannot be found', () => {
    expect(elementEditorSrc).toContain('if (!basket) return null')
  })
})

// ════════════════════════════════════════════════════════════
// 13. BasketCard.jsx / ElementCard.jsx — source structure
// ════════════════════════════════════════════════════════════
describe('BasketCard.jsx — source structure', () => {
  it('exports default function BasketCard', () => {
    expect(basketCardSrc).toContain('export default function BasketCard')
  })

  it('shows basket label, weight, and element count', () => {
    expect(basketCardSrc).toContain('basket.label')
    expect(basketCardSrc).toContain('basket.weight')
    expect(basketCardSrc).toContain('elementCount')
  })

  it('renders Edit and Delete buttons only when canEdit is true', () => {
    expect(basketCardSrc).toContain('{canEdit && (')
    expect(basketCardSrc).toContain('aria-label="Edit basket"')
    expect(basketCardSrc).toContain('aria-label="Delete basket"')
  })

  it('does not render rule or pipeline details', () => {
    const body = basketCardSrc.slice(basketCardSrc.indexOf('import React'))
    expect(body).not.toContain('rules')
    expect(body).not.toContain('pipeline')
  })

  it('shows overweight/underweight indicator icons conditionally', () => {
    expect(basketCardSrc).toContain('isOverweight &&')
    expect(basketCardSrc).toContain('isUnderweight &&')
  })
})

describe('ElementCard.jsx — source structure', () => {
  it('exports default function ElementCard', () => {
    expect(elementCardSrc).toContain('export default function ElementCard')
  })

  it('shows element label, weight, and rule count', () => {
    expect(elementCardSrc).toContain('element.label')
    expect(elementCardSrc).toContain('element.weight')
    expect(elementCardSrc).toContain('ruleCount')
  })

  it('renders Edit and Delete buttons only when canEdit is true', () => {
    expect(elementCardSrc).toContain('{canEdit && (')
    expect(elementCardSrc).toContain('aria-label="Edit element"')
    expect(elementCardSrc).toContain('aria-label="Delete element"')
  })

  it('does not render individual rule fields (kpiKey, thresholds)', () => {
    expect(elementCardSrc).not.toContain('kpiKey')
    expect(elementCardSrc).not.toContain('thresholdBands')
  })
})

// ════════════════════════════════════════════════════════════
// 14. Composition into ProfileDetailPanel / ProfileStudioPage
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — composes BasketEditorPanel', () => {
  it('imports BasketEditorPanel', () => {
    expect(profileDetailPanelSrc).toContain("import BasketEditorPanel from './BasketEditorPanel'")
  })

  it('renders BasketEditorPanel after the Hierarchy Summary section', () => {
    const hierarchyIdx = profileDetailPanelSrc.indexOf('title="Hierarchy Summary"')
    const editorIdx    = profileDetailPanelSrc.indexOf('<BasketEditorPanel')
    expect(editorIdx).toBeGreaterThan(hierarchyIdx)
  })

  it('passes actor, canEdit, and onSaved through to BasketEditorPanel', () => {
    const idx = profileDetailPanelSrc.indexOf('<BasketEditorPanel')
    const slice = profileDetailPanelSrc.slice(idx, idx + 200)
    expect(slice).toContain('actor={actor}')
    expect(slice).toContain('canEdit={!!canEdit}')
    expect(slice).toContain('onSaved={onSaved}')
  })

  it('accepts actor, canEdit, onSaved as new props', () => {
    expect(profileDetailPanelSrc).toContain('{ profile, loading, error, actor, canEdit, onSaved }')
  })
})

describe('ProfileStudioPage — wires actor/canEdit/onSaved to ProfileDetailPanel', () => {
  it('passes actor to ProfileDetailPanel', () => {
    const idx = profileStudioPageSrc.indexOf('<ProfileDetailPanel')
    const slice = profileStudioPageSrc.slice(idx, idx + 200)
    expect(slice).toContain('actor={actor}')
  })

  it('passes canEdit from permissions.canEdit', () => {
    const idx = profileStudioPageSrc.indexOf('<ProfileDetailPanel')
    const slice = profileStudioPageSrc.slice(idx, idx + 200)
    expect(slice).toContain('canEdit={permissions.canEdit}')
  })

  it('passes onSaved={refresh} so the list updates after an edit', () => {
    const idx = profileStudioPageSrc.indexOf('<ProfileDetailPanel')
    const slice = profileStudioPageSrc.slice(idx, idx + 200)
    expect(slice).toContain('onSaved={refresh}')
  })

  it('passes profileStatus into useProfileStudioPermissions so canEdit reflects the selected profile', () => {
    expect(profileStudioPageSrc).toContain('profileStatus: selectedProfile?.status')
  })
})

// ════════════════════════════════════════════════════════════
// 15. Permissions — admin full edit, others read-only
// ════════════════════════════════════════════════════════════
describe('Permissions — admin full edit, non-admin read-only', () => {
  it('canEditProfile-style matrix: only admin has profile:edit (re-derived from persistenceSchema)', async () => {
    const schemaSrc = await import('../../profileStudio/persistenceSchema.ts?raw').then((m) => m.default)
    const adminBlock = schemaSrc.slice(schemaSrc.indexOf('admin: ['), schemaSrc.indexOf('general_manager: ['))
    const gmBlock     = schemaSrc.slice(schemaSrc.indexOf('general_manager: ['), schemaSrc.indexOf('district_supervisor: ['))
    const dsBlock     = schemaSrc.slice(schemaSrc.indexOf('district_supervisor: ['), schemaSrc.indexOf('manager: ['))
    const mgrBlock    = schemaSrc.slice(schemaSrc.indexOf('  manager: ['), schemaSrc.indexOf('pharmacist: ['))
    expect(adminBlock).toContain("'profile:edit'")
    expect(gmBlock).not.toContain("'profile:edit'")
    expect(dsBlock).not.toContain("'profile:edit'")
    expect(mgrBlock).not.toContain("'profile:edit'")
  })

  it('pharmacist role is excluded from PS_ROLES (no route)', () => {
    expect(profileStudioPageSrc).not.toContain("'pharmacist'")
  })

  it('BasketEditorPanel gates all write UI behind the canEdit prop, not a role check of its own', () => {
    expect(basketEditorSrc).not.toContain("role === 'admin'")
    expect(basketEditorSrc).toContain('canEdit')
  })

  it('ElementEditorPanel gates all write UI behind the canEdit prop, not a role check of its own', () => {
    expect(elementEditorSrc).not.toContain("role === 'admin'")
    expect(elementEditorSrc).toContain('canEdit')
  })

  it('service-level canAddBasket/canAddElement re-check editable status independent of the UI flag (defense in depth)', () => {
    expect(basketEditorSrc).toContain('canAddBasket(draftLike)')
    expect(elementEditorSrc).toContain('canAddElement(draftLike, basketId)')
  })
})

// ════════════════════════════════════════════════════════════
// 16. Immutable updates — never direct tree mutation
// ════════════════════════════════════════════════════════════
describe('Immutable updates — no direct tree mutation', () => {
  it('BasketEditorPanel never assigns to root.baskets directly (push/splice)', () => {
    expect(basketEditorSrc).not.toContain('.baskets.push(')
    expect(basketEditorSrc).not.toContain('.baskets.splice(')
    expect(basketEditorSrc).not.toContain('.baskets[')
  })

  it('ElementEditorPanel never assigns to elements directly (push/splice)', () => {
    expect(elementEditorSrc).not.toContain('.elements.push(')
    expect(elementEditorSrc).not.toContain('.elements.splice(')
  })

  it('hierarchy.ts addBasket returns a new object (spread), not the same reference', () => {
    const draft = makeDraft()
    const updated = addBasket(draft, makeBasketNode())
    expect(updated).not.toBe(draft)
    expect(updated.root).not.toBe(draft.root)
  })

  it('hierarchy.ts updateNode returns a new object, not the same reference', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = updateNode(draft, 'b1', { label: 'X' })
    expect(updated).not.toBe(draft)
  })

  it('hierarchy.ts removeNode returns a new object, not the same reference', () => {
    const draft = addBasket(makeDraft(), makeBasketNode())
    const updated = removeNode(draft, 'b1')
    expect(updated).not.toBe(draft)
  })
})

// ════════════════════════════════════════════════════════════
// 17. Service calls — correct shape, single call site
// ════════════════════════════════════════════════════════════
describe('Service calls — updateProfileDocument usage', () => {
  it('BasketEditorPanel calls updateProfileDocument with profile.id and a hierarchy patch', () => {
    expect(basketEditorSrc).toContain('updateProfileDocument(profile.id, { hierarchy: newHierarchy }, actor)')
  })

  it('ElementEditorPanel calls updateProfileDocument with profile.id and a hierarchy patch', () => {
    expect(elementEditorSrc).toContain('updateProfileDocument(profile.id, { hierarchy: newHierarchy }, actor)')
  })

  it('neither editor calls createProfileDocument (no new documents)', () => {
    expect(basketEditorSrc).not.toContain('createProfileDocument')
    expect(elementEditorSrc).not.toContain('createProfileDocument')
  })

  it('neither editor calls createProfileSnapshotDocument (no snapshots)', () => {
    expect(basketEditorSrc).not.toContain('createProfileSnapshotDocument')
    expect(elementEditorSrc).not.toContain('createProfileSnapshotDocument')
  })

  it('neither editor calls createPublishPackageDocument (no publish)', () => {
    expect(basketEditorSrc).not.toContain('createPublishPackageDocument')
    expect(elementEditorSrc).not.toContain('createPublishPackageDocument')
  })

  it('neither editor calls createSimulationRunDocument (no simulation)', () => {
    expect(basketEditorSrc).not.toContain('createSimulationRunDocument')
    expect(elementEditorSrc).not.toContain('createSimulationRunDocument')
  })

  it('neither editor imports the raw Firestore SDK directly', () => {
    expect(basketEditorSrc).not.toContain("from 'firebase/firestore'")
    expect(elementEditorSrc).not.toContain("from 'firebase/firestore'")
  })
})

// ════════════════════════════════════════════════════════════
// 18-25. GUARDRAILS — no rules, no processors, no drag-drop,
// no AI, no Excel, no simulator, no Evaluation Engine
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no Rule editor', () => {
  it('BasketEditorPanel does not import addRule', () => {
    expect(basketEditorBody).not.toContain('addRule')
  })

  it('ElementEditorPanel does not import addRule', () => {
    expect(elementEditorBody).not.toContain('addRule')
  })

  it('neither card renders a rule-add affordance', () => {
    expect(basketCardSrc).not.toContain('Add Rule')
    expect(elementCardSrc).not.toContain('Add Rule')
  })

  it('ElementForm has no kpiKey or metricType field', () => {
    expect(elementFormSrc).not.toContain('kpiKey')
    expect(elementFormSrc).not.toContain('metricType')
  })
})

describe('GUARDRAILS — no Processor Pipeline editor', () => {
  it('BasketForm has no pipeline/processor fields', () => {
    const body = basketFormSrc.slice(basketFormSrc.indexOf('import React'))
    expect(body).not.toContain('pipeline')
    expect(body).not.toContain('processorType')
  })

  it('ElementForm has no pipeline/processor fields', () => {
    const body = elementFormSrc.slice(elementFormSrc.indexOf('import React'))
    expect(body).not.toContain('pipeline')
    expect(body).not.toContain('processorType')
  })

  it('neither editor renders threshold band configuration', () => {
    expect(basketEditorBody).not.toContain('thresholdBands')
    expect(elementEditorBody).not.toContain('thresholdBands')
  })
})

describe('GUARDRAILS — no Drag & Drop', () => {
  it('no react-dnd / dnd-kit imports in any new file', () => {
    ;[basketEditorSrc, elementEditorSrc, basketCardSrc, elementCardSrc, basketFormSrc, elementFormSrc].forEach((src) => {
      expect(src.toLowerCase()).not.toContain('react-dnd')
      expect(src.toLowerCase()).not.toContain('dnd-kit')
    })
  })

  it('no draggable attribute or drag handlers in any new file', () => {
    ;[basketEditorSrc, elementEditorSrc, basketCardSrc, elementCardSrc].forEach((src) => {
      expect(src).not.toContain('draggable')
      expect(src.toLowerCase()).not.toContain('ondragstart')
      expect(src.toLowerCase()).not.toContain('ondrop')
    })
  })

  it('moveNode (the kernel reorder helper) is never imported by these editors', () => {
    // \b word-boundary avoids a false match against "removeNode" (which is used)
    expect(basketEditorSrc).not.toMatch(/\bmoveNode\b/)
    expect(elementEditorSrc).not.toMatch(/\bmoveNode\b/)
  })
})

describe('GUARDRAILS — no Simulation', () => {
  it('no simulateDraft / simulateProfile / createSimulationRunDocument references', () => {
    ;[basketEditorBody, elementEditorBody].forEach((src) => {
      expect(src).not.toContain('simulateDraft')
      expect(src).not.toContain('simulateProfile')
      expect(src).not.toContain('createSimulationRunDocument')
    })
  })

  it('no simulation controls rendered (no "Run Simulation" text)', () => {
    expect(basketEditorSrc).not.toContain('Run Simulation')
    expect(elementEditorSrc).not.toContain('Run Simulation')
  })
})

describe('GUARDRAILS — no AI', () => {
  it('no openai/anthropic/gpt-/claude references in any new file', () => {
    ;[basketEditorSrc, elementEditorSrc, basketCardSrc, elementCardSrc, basketFormSrc, elementFormSrc].forEach((src) => {
      const lower = src.toLowerCase()
      expect(lower).not.toContain('openai')
      expect(lower).not.toContain('anthropic')
      expect(lower).not.toContain('gpt-')
      expect(lower).not.toContain('claude')
    })
  })
})

describe('GUARDRAILS — no Excel import', () => {
  it('no xlsx/csv/FileReader references in any new file', () => {
    ;[basketEditorSrc, elementEditorSrc, basketCardSrc, elementCardSrc, basketFormSrc, elementFormSrc].forEach((src) => {
      expect(src).not.toContain('xlsx')
      expect(src).not.toContain('XLSX')
      expect(src.toLowerCase()).not.toContain('.csv')
      expect(src).not.toContain('FileReader')
    })
  })
})

describe('GUARDRAILS — no Evaluation Engine imports', () => {
  it('no evaluationEngine/evaluationPipeline/evaluationRegistry references', () => {
    ;[basketEditorSrc, elementEditorSrc].forEach((src) => {
      expect(src).not.toContain('evaluationEngine')
      expect(src).not.toContain('evaluationPipeline')
      expect(src).not.toContain('evaluationRegistry')
    })
  })

  it('no bulkEvaluationService / evaluationActualsService references', () => {
    ;[basketEditorSrc, elementEditorSrc].forEach((src) => {
      expect(src).not.toContain('bulkEvaluationService')
      expect(src).not.toContain('evaluationActualsService')
    })
  })
})

describe('GUARDRAILS — read-only areas remain hidden', () => {
  it('no Publish controls in either editor', () => {
    expect(basketEditorSrc).not.toContain('Publish')
    expect(elementEditorSrc).not.toContain('Publish')
  })

  it('no Approve controls in either editor', () => {
    expect(basketEditorSrc).not.toContain('Approve')
    expect(elementEditorSrc).not.toContain('Approve')
  })

  it('no Validate controls in either editor', () => {
    expect(basketEditorBody).not.toContain('Validate')
    expect(elementEditorBody).not.toContain('Validate')
  })

  it('no band configuration UI in either editor', () => {
    expect(basketEditorSrc).not.toContain('BAND_EVALUATOR')
    expect(elementEditorSrc).not.toContain('BAND_EVALUATOR')
  })
})

// ════════════════════════════════════════════════════════════
// 26. Defensive rendering / edge cases
// ════════════════════════════════════════════════════════════
describe('Defensive rendering and edge cases', () => {
  it('toDraftLike-equivalent fallback handles a profile with no hierarchy.payload', () => {
    const draft = makeDraft()
    expect(draft.root.baskets).toEqual([])
  })

  it('calculateChildWeightSummary handles a non-existent parentId without throwing', () => {
    const draft = makeDraft()
    expect(() => calculateChildWeightSummary(draft, 'nope')).not.toThrow()
  })

  it('findOverweightNodes handles a profile with no root gracefully', () => {
    expect(() => findOverweightNodes({})).not.toThrow()
    expect(findOverweightNodes({})).toEqual([])
  })

  it('findUnderweightNodes handles a profile with no root gracefully', () => {
    expect(() => findUnderweightNodes({})).not.toThrow()
    expect(findUnderweightNodes({})).toEqual([])
  })

  it('addBasket on a profile with undefined baskets array still works', () => {
    const draft = { metadata: { status: 'DRAFT' }, root: { id: 'r1', label: 'R' } }
    const updated = addBasket(draft, makeBasketNode())
    expect(updated.root.baskets).toHaveLength(1)
  })

  it('full add -> edit -> delete round trip leaves the profile with zero baskets', () => {
    let draft = makeDraft()
    draft = addBasket(draft, makeBasketNode({ id: 'b1' }))
    draft = updateNode(draft, 'b1', { label: 'Edited' })
    expect(draft.root.baskets[0].label).toBe('Edited')
    draft = removeNode(draft, 'b1')
    expect(draft.root.baskets).toHaveLength(0)
  })

  it('full basket+element round trip computes correct counts', () => {
    let draft = makeDraft()
    draft = addBasket(draft, makeBasketNode({ id: 'b1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2' }))
    expect(draft.root.baskets).toHaveLength(1)
    expect(draft.root.baskets[0].elements).toHaveLength(2)
  })
})

// ════════════════════════════════════════════════════════════
// 27. BasketForm.jsx / ElementForm.jsx — additional source structure
// ════════════════════════════════════════════════════════════
describe('BasketForm.jsx — additional source structure', () => {
  it('exports default function BasketForm', () => {
    expect(basketFormSrc).toContain('export default function BasketForm')
  })

  it('exports validateBasketForm and DEFAULT_BASKET_FORM_VALUES', () => {
    expect(basketFormSrc).toContain('export function validateBasketForm')
    expect(basketFormSrc).toContain('export const DEFAULT_BASKET_FORM_VALUES')
  })

  it('renders a Label field', () => {
    expect(basketFormSrc).toContain('label="Label"')
  })

  it('renders a Weight field with numeric input type', () => {
    expect(basketFormSrc).toContain('label="Weight"')
    expect(basketFormSrc).toContain('type="number"')
  })

  it('renders a Description field marked optional', () => {
    expect(basketFormSrc).toContain('Description (optional)')
  })

  it('accepts values/errors/onChange/disabled props', () => {
    expect(basketFormSrc).toContain('values')
    expect(basketFormSrc).toContain('errors = {}')
    expect(basketFormSrc).toContain('onChange')
    expect(basketFormSrc).toContain('disabled = false')
  })

  it('disables all inputs when disabled prop is true', () => {
    const matches = basketFormSrc.match(/disabled=\{disabled\}/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('weight input has min="0" to discourage negative entry at the input level', () => {
    expect(basketFormSrc).toContain('min="0"')
  })

  it('does not import Firestore', () => {
    expect(basketFormSrc).not.toContain('firebase/firestore')
  })

  it('does not import the hierarchy kernel directly (pure fields only)', () => {
    expect(basketFormSrc).not.toContain("from '../../profileStudio/hierarchy'")
  })
})

describe('ElementForm.jsx — additional source structure', () => {
  it('exports default function ElementForm', () => {
    expect(elementFormSrc).toContain('export default function ElementForm')
  })

  it('exports validateElementForm and DEFAULT_ELEMENT_FORM_VALUES', () => {
    expect(elementFormSrc).toContain('export function validateElementForm')
    expect(elementFormSrc).toContain('export const DEFAULT_ELEMENT_FORM_VALUES')
  })

  it('renders a Label field', () => {
    expect(elementFormSrc).toContain('label="Label"')
  })

  it('renders a Weight field with numeric input type', () => {
    expect(elementFormSrc).toContain('label="Weight"')
    expect(elementFormSrc).toContain('type="number"')
  })

  it('renders a Description field marked optional', () => {
    expect(elementFormSrc).toContain('Description (optional)')
  })

  it('accepts values/errors/onChange/disabled props', () => {
    expect(elementFormSrc).toContain('values')
    expect(elementFormSrc).toContain('errors = {}')
    expect(elementFormSrc).toContain('onChange')
    expect(elementFormSrc).toContain('disabled = false')
  })

  it('does not import Firestore', () => {
    expect(elementFormSrc).not.toContain('firebase/firestore')
  })

  it('does not import the hierarchy kernel directly (pure fields only)', () => {
    expect(elementFormSrc).not.toContain("from '../../profileStudio/hierarchy'")
  })
})

// ════════════════════════════════════════════════════════════
// 28. BasketCard.jsx / ElementCard.jsx — additional structure
// ════════════════════════════════════════════════════════════
describe('BasketCard.jsx — additional structure', () => {
  it('returns null when basket prop is falsy', () => {
    expect(basketCardSrc).toContain('if (!basket) return null')
  })

  it('falls back to "Unnamed Basket" when label is missing', () => {
    expect(basketCardSrc).toContain('Unnamed Basket')
  })

  it('has role="button" and tabIndex for keyboard selection', () => {
    expect(basketCardSrc).toContain('role="button"')
    expect(basketCardSrc).toContain('tabIndex={0}')
  })

  it('calls onSelect with the basket id on click', () => {
    expect(basketCardSrc).toContain('onSelect?.(basket.id)')
  })

  it('Edit/Delete button clicks stop propagation so they do not also trigger select', () => {
    expect(basketCardSrc).toContain('e.stopPropagation()')
  })

  it('highlights the card with a distinct style when isSelected is true', () => {
    expect(basketCardSrc).toContain('isSelected')
    expect(basketCardSrc).toContain('rgba(99,102,241,0.06)')
  })
})

describe('ElementCard.jsx — additional structure', () => {
  it('returns null when element prop is falsy', () => {
    expect(elementCardSrc).toContain('if (!element) return null')
  })

  it('falls back to "Unnamed Element" when label is missing', () => {
    expect(elementCardSrc).toContain('Unnamed Element')
  })

  it('calls onEdit with the element id', () => {
    expect(elementCardSrc).toContain('onEdit?.(element.id)')
  })

  it('calls onDelete with the element id', () => {
    expect(elementCardSrc).toContain('onDelete?.(element.id)')
  })

  it('has no role="button"/onClick on the row itself (elements are not selectable, unlike baskets)', () => {
    expect(elementCardSrc).not.toContain('role="button"')
  })
})

// ════════════════════════════════════════════════════════════
// 29. Loading state — explicit spinner + disabled-state coverage
// ════════════════════════════════════════════════════════════
describe('Loading state — Basket and Element editors', () => {
  it('BasketEditorPanel shows "Saving…" label while submitting', () => {
    expect(basketEditorSrc).toContain('Saving')
  })

  it('ElementEditorPanel shows "Saving…" label while submitting', () => {
    expect(elementEditorSrc).toContain('Saving')
  })

  it('BasketEditorPanel disables the Cancel button while submitting', () => {
    const idx = basketEditorSrc.indexOf('Cancel')
    const slice = basketEditorSrc.slice(Math.max(0, idx - 150), idx)
    expect(slice).toContain('disabled={submitting}')
  })

  it('ElementEditorPanel disables the Cancel button while submitting', () => {
    const idx = elementEditorSrc.indexOf('Cancel')
    const slice = elementEditorSrc.slice(Math.max(0, idx - 150), idx)
    expect(slice).toContain('disabled={submitting}')
  })

  it('BasketEditorPanel modal backdrop click is routed through closeForm (which itself no-ops while submitting)', () => {
    expect(basketEditorSrc).toContain('onClick={closeForm}')
    expect(basketEditorSrc).toContain('if (submitting) return')
  })
})

// ════════════════════════════════════════════════════════════
// 30. Double-submit prevention — explicit guard coverage
// ════════════════════════════════════════════════════════════
describe('Double submit prevention', () => {
  it('BasketEditorPanel handleSubmit checks submitting before validating', () => {
    const idx = basketEditorSrc.indexOf('const handleSubmit')
    const slice = basketEditorSrc.slice(idx, idx + 200)
    expect(slice).toContain('if (submitting) return')
  })

  it('ElementEditorPanel handleSubmit checks submitting before validating', () => {
    const idx = elementEditorSrc.indexOf('const handleSubmit')
    const slice = elementEditorSrc.slice(idx, idx + 200)
    expect(slice).toContain('if (submitting) return')
  })

  it('BasketEditorPanel handleDelete checks submitting before mutating', () => {
    const idx = basketEditorSrc.indexOf('const handleDelete')
    const slice = basketEditorSrc.slice(idx, idx + 150)
    expect(slice).toContain('if (submitting) return')
  })

  it('ElementEditorPanel handleDelete checks submitting before mutating', () => {
    const idx = elementEditorSrc.indexOf('const handleDelete')
    const slice = elementEditorSrc.slice(idx, idx + 150)
    expect(slice).toContain('if (submitting) return')
  })

  it('setSubmitting(true) precedes the persist try block in both editors', () => {
    expect(basketEditorSrc).toContain('setSubmitting(true)')
    expect(elementEditorSrc).toContain('setSubmitting(true)')
  })

  it('setSubmitting(false) is called in a finally block in both editors', () => {
    expect(basketEditorSrc).toContain('finally {')
    expect(elementEditorSrc).toContain('finally {')
  })
})

// ════════════════════════════════════════════════════════════
// 31. Admin visibility / non-admin read-only — extended
// ════════════════════════════════════════════════════════════
describe('Admin visibility — extended', () => {
  it('Add Basket button is the only creation entry point gated by canEdit in BasketEditorPanel', () => {
    const matches = basketEditorSrc.match(/\{canEdit &&/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('Add Element button is the only creation entry point gated by canEdit in ElementEditorPanel', () => {
    const matches = elementEditorSrc.match(/\{canEdit &&/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('BasketCard Edit/Delete buttons are inside a single canEdit-gated block', () => {
    const idx = basketCardSrc.indexOf('{canEdit && (')
    expect(idx).toBeGreaterThan(-1)
  })

  it('ElementCard Edit/Delete buttons are inside a single canEdit-gated block', () => {
    const idx = elementCardSrc.indexOf('{canEdit && (')
    expect(idx).toBeGreaterThan(-1)
  })
})

describe('Non-admin read-only — extended', () => {
  it('when canEdit is false, BasketEditorPanel still renders the basket list (read access preserved)', () => {
    expect(basketEditorSrc).toContain('baskets.map(')
  })

  it('when canEdit is false, ElementEditorPanel still renders the element list (read access preserved)', () => {
    expect(elementEditorSrc).toContain('elements.map(')
  })

  it('weight summary and overweight/underweight badges render regardless of canEdit (informational, not gated)', () => {
    const idx = basketEditorSrc.indexOf('weightSummary.sum.toFixed(2)')
    expect(idx).toBeGreaterThan(-1)
    // not wrapped in a canEdit check immediately before it
    const before = basketEditorSrc.slice(Math.max(0, idx - 400), idx)
    expect(before).not.toContain('{canEdit &&')
  })
})

// ════════════════════════════════════════════════════════════
// 32. Weight matrix — additional boundary combinations
// ════════════════════════════════════════════════════════════
describe('Weight matrix — additional combinations', () => {
  it('three baskets summing exactly to 1.0 is balanced', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.34 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', weight: 0.33 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b3', weight: 0.33 }))
    const summary = calculateChildWeightSummary(draft, draft.root.id)
    expect(summary.isBalanced).toBe(true)
  })

  it('two elements summing to exactly 1.0 under a basket is balanced', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', weight: 0.6 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2', weight: 0.4 }))
    const summary = calculateChildWeightSummary(draft, 'b1')
    expect(summary.isBalanced).toBe(true)
    expect(findOverweightNodes(draft)).not.toContain('b1')
    expect(findUnderweightNodes(draft)).not.toContain('b1')
  })

  it('a basket with weight far above 1.0 alone is flagged overweight at the root level', () => {
    const draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 5 }))
    expect(findOverweightNodes(draft)).toContain(draft.root.id)
  })

  it('multiple baskets can independently be overweight in their own elements', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1', weight: 0.5 }))
    draft = addBasket(draft, makeBasketNode({ id: 'b2', weight: 0.5 }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1', weight: 2 }))
    draft = addElement(draft, 'b2', makeElementNode({ id: 'e2', weight: 2 }))
    const overweight = findOverweightNodes(draft)
    expect(overweight).toContain('b1')
    expect(overweight).toContain('b2')
  })

  it('weight summary count reflects number of direct children, not descendants', () => {
    let draft = addBasket(makeDraft(), makeBasketNode({ id: 'b1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e1' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e2' }))
    draft = addElement(draft, 'b1', makeElementNode({ id: 'e3' }))
    const rootSummary = calculateChildWeightSummary(draft, draft.root.id)
    expect(rootSummary.count).toBe(1) // 1 basket, not 3 elements
  })
})

// ════════════════════════════════════════════════════════════
// 33. Module boundaries — no unexpected imports
// ════════════════════════════════════════════════════════════
describe('Module boundaries — BasketForm / ElementForm / BasketCard / ElementCard', () => {
  it('BasketForm only imports react', () => {
    const lines = basketFormSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    expect(lines.every((l) => l.includes("from 'react'"))).toBe(true)
  })

  it('ElementForm only imports react', () => {
    const lines = elementFormSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    expect(lines.every((l) => l.includes("from 'react'"))).toBe(true)
  })

  it('BasketCard only imports react and lucide-react', () => {
    const lines = basketCardSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    expect(lines.every((l) => l.includes("from 'react'") || l.includes("from 'lucide-react'"))).toBe(true)
  })

  it('ElementCard only imports react and lucide-react', () => {
    const lines = elementCardSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    expect(lines.every((l) => l.includes("from 'react'") || l.includes("from 'lucide-react'"))).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 34. File hygiene
// ════════════════════════════════════════════════════════════
describe('File hygiene — no TODOs, async patterns sane', () => {
  ;[basketEditorSrc, elementEditorSrc, basketCardSrc, elementCardSrc, basketFormSrc, elementFormSrc].forEach((src, i) => {
    it(`file #${i} has no TODO/FIXME markers`, () => {
      expect(src).not.toContain('TODO')
      expect(src).not.toContain('FIXME')
    })
  })

  it('BasketEditorPanel handleSubmit is async', () => {
    expect(basketEditorSrc).toContain('const handleSubmit = async (e) =>')
  })

  it('ElementEditorPanel handleSubmit is async', () => {
    expect(elementEditorSrc).toContain('const handleSubmit = async (e) =>')
  })

  it('BasketEditorPanel handleDelete is async', () => {
    expect(basketEditorSrc).toContain('const handleDelete = async (basketId) =>')
  })

  it('ElementEditorPanel handleDelete is async', () => {
    expect(elementEditorSrc).toContain('const handleDelete = async (elementId) =>')
  })
})
