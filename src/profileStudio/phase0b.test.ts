// ============================================================
// Profile Studio Phase 0B — Hierarchy Builder Kernel Tests
//
// Covers:
//   Group 1  (1):       File existence
//   Group 2  (2-6):     findNode
//   Group 3  (7-11):    findParentNode
//   Group 4  (12-15):   getNodePath
//   Group 5  (16-21):   flattenHierarchy
//   Group 6  (22-25):   getBasketNodes / getElementNodes / getRuleNodes
//   Group 7  (26-29):   addBasket — immutability
//   Group 8  (30-33):   addElement — immutability
//   Group 9  (34-37):   addRule — immutability
//   Group 10 (38-43):   removeNode — subtree + immutability
//   Group 11 (44-47):   updateNode — target-only patch
//   Group 12 (48-51):   moveNode — valid moves
//   Group 13 (52-54):   moveNode — self-parent / descendant blocked
//   Group 14 (55-57):   Child order preserved after mutations
//   Group 15 (58-61):   newIndex respected
//   Group 16 (62-65):   calculateNodeWeightSum
//   Group 17 (66-68):   calculateBasketWeightSum
//   Group 18 (69-72):   calculateChildWeightSummary
//   Group 19 (73-76):   findOverweightNodes / findUnderweightNodes
//   Group 20 (77-80):   normalizeChildWeights
//   Group 21 (81-84):   canAddBasket / canAddElement / canAddRule
//   Group 22 (85-88):   canMoveNode
//   Group 23 (89-92):   Published / archived not editable
//   Group 24 (93-96):   Draft / validated / simulated editable
//   Group 25 (97-100):  isDescendant
//   Group 26 (101-104): getDepth
//   Group 27 (105-107): countNodes
//   Group 28 (108-110): cloneProfileWithUpdatedHierarchy
//   Group 29 (111-113): validateHierarchyStructure export + combined validator
//   Group 30 (114-116): getChildren
//   Group 31 (117-127): Guardrails — no React / Firestore / UI / routes etc.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Live imports ──────────────────────────────────────────────

import {
  findNode, findParentNode, getNodePath, flattenHierarchy,
  getChildren, getBasketNodes, getElementNodes, getRuleNodes,
  addBasket, addElement, addRule, removeNode, updateNode, moveNode,
  calculateNodeWeightSum, calculateBasketWeightSum, calculateChildWeightSummary,
  findOverweightNodes, findUnderweightNodes, normalizeChildWeights,
  canAddBasket, canAddElement, canAddRule, canMoveNode,
  isDescendant, getDepth, countNodes, cloneProfileWithUpdatedHierarchy,
  getNodeType,
} from './hierarchy'

import {
  validateHierarchyStructure,
  validateProfile,
} from './validation'

import {
  createEmptyEvaluationProfile,
  createBasketNode,
  createElementNode,
  createRuleNode,
} from './profileFactory'

import type { EvaluationProfileDraft } from './types'

// ── Raw source imports (for guardrails) ───────────────────────

const hierarchySrc  = () => import('./hierarchy.ts?raw').then((m) => m.default)
const validationSrc = () => import('./validation.ts?raw').then((m) => m.default)

// ── Fixtures ──────────────────────────────────────────────────

function makeProfile(): EvaluationProfileDraft {
  const p       = createEmptyEvaluationProfile({ name: 'Test', validFrom: '2026-01-01' })
  const basket  = createBasketNode({ label: 'Commercial', weight: 1.0 })
  const element = createElementNode({ label: 'KPI Group', weight: 1.0 })
  const rule    = createRuleNode({ kpiKey: 'wasfaty', label: 'Wasfaty', weight: 1.0 })
  element.rules.push(rule)
  basket.elements.push(element)
  p.root.baskets.push(basket)
  return p
}

function makeTwoBasketProfile(): EvaluationProfileDraft {
  const p  = createEmptyEvaluationProfile({ name: 'Two Basket', validFrom: '2026-01-01' })
  const b1 = createBasketNode({ label: 'Basket A', weight: 0.6 })
  const b2 = createBasketNode({ label: 'Basket B', weight: 0.4 })
  const e1 = createElementNode({ label: 'E1', weight: 0.5 })
  const e2 = createElementNode({ label: 'E2', weight: 0.5 })
  const r1 = createRuleNode({ kpiKey: 'wasfaty', label: 'W', weight: 1.0 })
  const r2 = createRuleNode({ kpiKey: 'omni',    label: 'O', weight: 1.0 })
  e1.rules.push(r1)
  e2.rules.push(r2)
  b1.elements.push(e1)
  b2.elements.push(e2)
  p.root.baskets.push(b1, b2)
  return p
}

function withStatus(p: EvaluationProfileDraft, status: string): EvaluationProfileDraft {
  return { ...p, metadata: { ...p.metadata, status: status as any } }
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — File existence
// ════════════════════════════════════════════════════════════

describe('Phase 0B › File existence', () => {
  it('hierarchy.ts file exists and exports functions (test 1)', async () => {
    const s = await hierarchySrc()
    expect(s.length).toBeGreaterThan(200)
    expect(s).toContain('export function findNode')
    expect(s).toContain('export function addBasket')
    expect(s).toContain('export function moveNode')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — findNode
// ════════════════════════════════════════════════════════════

describe('Phase 0B › findNode', () => {
  it('finds the root node by id (test 2)', () => {
    const p = makeProfile()
    const found = findNode(p, p.root.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(p.root.id)
  })

  it('finds a basket node by id (test 3)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const found  = findNode(p, basket.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(basket.id)
  })

  it('finds an element node by id (test 4)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const found   = findNode(p, element.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(element.id)
  })

  it('finds a rule node by id (test 5)', () => {
    const p    = makeProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    const found = findNode(p, rule.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(rule.id)
  })

  it('returns null for a missing node id (test 6)', () => {
    const p = makeProfile()
    expect(findNode(p, 'non_existent_id')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — findParentNode
// ════════════════════════════════════════════════════════════

describe('Phase 0B › findParentNode', () => {
  it('root has no parent — returns null (test 7)', () => {
    const p = makeProfile()
    expect(findParentNode(p, p.root.id)).toBeNull()
  })

  it('basket parent is root (test 8)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const parent = findParentNode(p, basket.id)
    expect(parent).not.toBeNull()
    expect(parent!.id).toBe(p.root.id)
  })

  it('element parent is basket (test 9)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    const parent  = findParentNode(p, element.id)
    expect(parent).not.toBeNull()
    expect(parent!.id).toBe(basket.id)
  })

  it('rule parent is element (test 10)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const rule    = element.rules[0]
    const parent  = findParentNode(p, rule.id)
    expect(parent).not.toBeNull()
    expect(parent!.id).toBe(element.id)
  })

  it('returns null for missing node id (test 11)', () => {
    const p = makeProfile()
    expect(findParentNode(p, 'ghost_node')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — getNodePath
// ════════════════════════════════════════════════════════════

describe('Phase 0B › getNodePath', () => {
  it('path for root is [rootId] (test 12)', () => {
    const p    = makeProfile()
    const path = getNodePath(p, p.root.id)
    expect(path).toEqual([p.root.id])
  })

  it('path for basket is [rootId, basketId] (test 13)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const path   = getNodePath(p, basket.id)
    expect(path).toEqual([p.root.id, basket.id])
  })

  it('path for rule is [rootId, basketId, elementId, ruleId] (test 14)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    const rule    = element.rules[0]
    const path    = getNodePath(p, rule.id)
    expect(path).toEqual([p.root.id, basket.id, element.id, rule.id])
  })

  it('returns [] for missing node (test 15)', () => {
    const p = makeProfile()
    expect(getNodePath(p, 'nope')).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — flattenHierarchy
// ════════════════════════════════════════════════════════════

describe('Phase 0B › flattenHierarchy', () => {
  it('first node in flat list is root (test 16)', () => {
    const p     = makeProfile()
    const nodes = flattenHierarchy(p)
    expect(nodes[0].id).toBe(p.root.id)
    expect(nodes[0].type).toBe('root')
    expect(nodes[0].depth).toBe(0)
  })

  it('baskets appear at depth 1 (test 17)', () => {
    const p       = makeProfile()
    const baskets = flattenHierarchy(p).filter((n) => n.type === 'basket')
    expect(baskets.every((n) => n.depth === 1)).toBe(true)
  })

  it('elements appear at depth 2 (test 18)', () => {
    const p        = makeProfile()
    const elements = flattenHierarchy(p).filter((n) => n.type === 'element')
    expect(elements.every((n) => n.depth === 2)).toBe(true)
  })

  it('rules appear at depth 3 (test 19)', () => {
    const p     = makeProfile()
    const rules = flattenHierarchy(p).filter((n) => n.type === 'rule')
    expect(rules.every((n) => n.depth === 3)).toBe(true)
  })

  it('parentId is set correctly for all non-root nodes (test 20)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    const rule    = element.rules[0]
    const flat    = flattenHierarchy(p)

    const bNode = flat.find((n) => n.id === basket.id)!
    const eNode = flat.find((n) => n.id === element.id)!
    const rNode = flat.find((n) => n.id === rule.id)!

    expect(bNode.parentId).toBe(p.root.id)
    expect(eNode.parentId).toBe(basket.id)
    expect(rNode.parentId).toBe(element.id)
  })

  it('DFS preorder: basket comes before its elements (test 21)', () => {
    const p       = makeProfile()
    const flat    = flattenHierarchy(p)
    const bIdx    = flat.findIndex((n) => n.id === p.root.baskets[0].id)
    const eIdx    = flat.findIndex((n) => n.id === p.root.baskets[0].elements[0].id)
    expect(bIdx).toBeLessThan(eIdx)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Typed node getters
// ════════════════════════════════════════════════════════════

describe('Phase 0B › getBasketNodes / getElementNodes / getRuleNodes', () => {
  it('getBasketNodes returns all basket nodes (test 22)', () => {
    const p = makeTwoBasketProfile()
    expect(getBasketNodes(p)).toHaveLength(2)
    expect(getBasketNodes(p)[0].label).toBe('Basket A')
  })

  it('getElementNodes returns elements across all baskets (test 23)', () => {
    const p = makeTwoBasketProfile()
    expect(getElementNodes(p)).toHaveLength(2)
  })

  it('getRuleNodes returns rules across all elements (test 24)', () => {
    const p = makeTwoBasketProfile()
    expect(getRuleNodes(p)).toHaveLength(2)
    const keys = getRuleNodes(p).map((r) => r.kpiKey)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
  })

  it('getters return empty arrays for empty profile (test 25)', () => {
    const p = createEmptyEvaluationProfile({ name: 'Empty', validFrom: '2026-01-01' })
    expect(getBasketNodes(p)).toHaveLength(0)
    expect(getElementNodes(p)).toHaveLength(0)
    expect(getRuleNodes(p)).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — addBasket immutability
// ════════════════════════════════════════════════════════════

describe('Phase 0B › addBasket — immutability', () => {
  it('returns a new profile object (test 26)', () => {
    const p        = makeProfile()
    const newBasket = createBasketNode({ label: 'New', weight: 0 })
    const p2        = addBasket(p, newBasket)
    expect(p2).not.toBe(p)
  })

  it('original basket count unchanged after addBasket (test 27)', () => {
    const p         = makeProfile()
    const origCount = p.root.baskets.length
    addBasket(p, createBasketNode({ label: 'X', weight: 0 }))
    expect(p.root.baskets.length).toBe(origCount)
  })

  it('new profile contains added basket (test 28)', () => {
    const p          = makeProfile()
    const newBasket  = createBasketNode({ label: 'Added', weight: 0.5 })
    const p2         = addBasket(p, newBasket)
    expect(p2.root.baskets.some((b) => b.id === newBasket.id)).toBe(true)
  })

  it('metadata is preserved in new profile after addBasket (test 29)', () => {
    const p   = makeProfile()
    const p2  = addBasket(p, createBasketNode({ label: 'Y', weight: 0 }))
    expect(p2.metadata.id).toBe(p.metadata.id)
    expect(p2.metadata.name).toBe(p.metadata.name)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — addElement immutability
// ════════════════════════════════════════════════════════════

describe('Phase 0B › addElement — immutability', () => {
  it('returns a new profile object (test 30)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const p2     = addElement(p, basket.id, createElementNode({ label: 'E', weight: 0 }))
    expect(p2).not.toBe(p)
  })

  it('original element count unchanged after addElement (test 31)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const origCount = basket.elements.length
    addElement(p, basket.id, createElementNode({ label: 'E', weight: 0 }))
    expect(p.root.baskets[0].elements.length).toBe(origCount)
  })

  it('new profile contains added element in correct basket (test 32)', () => {
    const p         = makeProfile()
    const basket    = p.root.baskets[0]
    const newElem   = createElementNode({ label: 'New Elem', weight: 0.5 })
    const p2        = addElement(p, basket.id, newElem)
    const updated   = p2.root.baskets.find((b) => b.id === basket.id)!
    expect(updated.elements.some((e) => e.id === newElem.id)).toBe(true)
  })

  it('addElement to non-existent basket returns profile unchanged (test 33)', () => {
    const p  = makeProfile()
    const p2 = addElement(p, 'ghost_basket', createElementNode({ label: 'X', weight: 0 }))
    expect(getElementNodes(p2).length).toBe(getElementNodes(p).length)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — addRule immutability
// ════════════════════════════════════════════════════════════

describe('Phase 0B › addRule — immutability', () => {
  it('returns a new profile object (test 34)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const p2      = addRule(p, element.id, createRuleNode({ kpiKey: 'omni', label: 'O', weight: 0 }))
    expect(p2).not.toBe(p)
  })

  it('original rule count unchanged after addRule (test 35)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const origCount = element.rules.length
    addRule(p, element.id, createRuleNode({ kpiKey: 'omni', label: 'O', weight: 0 }))
    expect(p.root.baskets[0].elements[0].rules.length).toBe(origCount)
  })

  it('new profile contains added rule in correct element (test 36)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const newRule = createRuleNode({ kpiKey: 'basket', label: 'B', weight: 0.5 })
    const p2      = addRule(p, element.id, newRule)
    const rules   = getRuleNodes(p2)
    expect(rules.some((r) => r.id === newRule.id)).toBe(true)
  })

  it('addRule to non-existent element returns profile unchanged (test 37)', () => {
    const p  = makeProfile()
    const p2 = addRule(p, 'ghost_element', createRuleNode({ kpiKey: 'x', label: 'X', weight: 0 }))
    expect(getRuleNodes(p2).length).toBe(getRuleNodes(p).length)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — removeNode subtree + immutability
// ════════════════════════════════════════════════════════════

describe('Phase 0B › removeNode', () => {
  it('removing a basket removes it and its subtree (test 38)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const p2     = removeNode(p, basket.id)
    expect(p2.root.baskets.some((b) => b.id === basket.id)).toBe(false)
    expect(getElementNodes(p2)).toHaveLength(0)
    expect(getRuleNodes(p2)).toHaveLength(0)
  })

  it('removing an element removes it and its rules (test 39)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const rule    = element.rules[0]
    const p2      = removeNode(p, element.id)
    expect(getElementNodes(p2)).toHaveLength(0)
    expect(getRuleNodes(p2)).toHaveLength(0)
  })

  it('removing a rule removes only that rule (test 40)', () => {
    const p    = makeProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    const p2   = removeNode(p, rule.id)
    expect(getRuleNodes(p2)).toHaveLength(0)
    expect(getElementNodes(p2)).toHaveLength(1)   // element remains
    expect(getBasketNodes(p2)).toHaveLength(1)    // basket remains
  })

  it('original profile is unchanged after removeNode (test 41)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    removeNode(p, basket.id)
    expect(p.root.baskets.some((b) => b.id === basket.id)).toBe(true)
  })

  it('cannot remove root — returns profile unchanged (test 42)', () => {
    const p   = makeProfile()
    const p2  = removeNode(p, p.root.id)
    expect(p2.root.id).toBe(p.root.id)
    expect(p2.root.baskets.length).toBe(p.root.baskets.length)
  })

  it('removeNode with non-existent id returns profile unchanged (test 43)', () => {
    const p  = makeProfile()
    const p2 = removeNode(p, 'does_not_exist')
    expect(countNodes(p2)).toBe(countNodes(p))
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — updateNode patches only target
// ════════════════════════════════════════════════════════════

describe('Phase 0B › updateNode', () => {
  it('updates label of target node (test 44)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    const p2     = updateNode(p, basket.id, { label: 'Updated Label' })
    const found  = p2.root.baskets.find((b) => b.id === basket.id)!
    expect(found.label).toBe('Updated Label')
  })

  it('other nodes are unchanged after updateNode (test 45)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    updateNode(p, p.root.baskets[0].id, { label: 'Changed' })
    // element label should still be original
    expect(getElementNodes(p)[0].label).toBe(element.label)
  })

  it('original profile is unchanged after updateNode (test 46)', () => {
    const p      = makeProfile()
    const origLabel = p.root.baskets[0].label
    updateNode(p, p.root.baskets[0].id, { label: 'New' })
    expect(p.root.baskets[0].label).toBe(origLabel)
  })

  it('updateNode with unknown id returns profile unchanged (test 47)', () => {
    const p  = makeProfile()
    const p2 = updateNode(p, 'ghost', { label: 'X' })
    expect(p2.root.baskets[0].label).toBe(p.root.baskets[0].label)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — moveNode valid moves
// ════════════════════════════════════════════════════════════

describe('Phase 0B › moveNode — valid moves', () => {
  it('moves a basket from one position to another within root (test 48)', () => {
    const p  = makeTwoBasketProfile()
    const b1 = p.root.baskets[0]
    const b2 = p.root.baskets[1]
    // Move b1 to position 1 (after b2)
    const p2 = moveNode(p, b1.id, p.root.id, 1)
    expect(p2.root.baskets[0].id).toBe(b2.id)
    expect(p2.root.baskets[1].id).toBe(b1.id)
  })

  it('moves an element to a different basket (test 49)', () => {
    const p  = makeTwoBasketProfile()
    const b1 = p.root.baskets[0]
    const b2 = p.root.baskets[1]
    const e1 = b1.elements[0]
    const p2 = moveNode(p, e1.id, b2.id)
    const b2After = p2.root.baskets.find((b) => b.id === b2.id)!
    expect(b2After.elements.some((e) => e.id === e1.id)).toBe(true)
    // b1 should now have 0 elements
    const b1After = p2.root.baskets.find((b) => b.id === b1.id)!
    expect(b1After.elements).toHaveLength(0)
  })

  it('moves a rule to a different element (test 50)', () => {
    const p       = makeTwoBasketProfile()
    const e1      = p.root.baskets[0].elements[0]
    const e2      = p.root.baskets[1].elements[0]
    const rule    = e1.rules[0]
    const p2      = moveNode(p, rule.id, e2.id)
    const e2After = getElementNodes(p2).find((e) => e.id === e2.id)!
    expect(e2After.rules.some((r) => r.id === rule.id)).toBe(true)
  })

  it('moveNode returns same profile when canMoveNode is false (test 51)', () => {
    const p        = makeProfile()
    const p2       = moveNode(p, 'non_existent', p.root.id)
    expect(p2.root.baskets.length).toBe(p.root.baskets.length)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — moveNode blocked: self-parent / descendant
// ════════════════════════════════════════════════════════════

describe('Phase 0B › moveNode — blocked moves', () => {
  it('canMoveNode returns false when nodeId === newParentId (test 52)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    expect(canMoveNode(p, basket.id, basket.id)).toBe(false)
  })

  it('canMoveNode returns false when new parent is a descendant of node (test 53)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    // Trying to move basket under its own element (element is a descendant)
    expect(canMoveNode(p, basket.id, element.id)).toBe(false)
  })

  it('canMoveNode returns false when moving a basket under another basket (test 54)', () => {
    const p  = makeTwoBasketProfile()
    const b1 = p.root.baskets[0]
    const b2 = p.root.baskets[1]
    // basket can only go under root
    expect(canMoveNode(p, b1.id, b2.id)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — Child order preserved
// ════════════════════════════════════════════════════════════

describe('Phase 0B › Child order preserved', () => {
  it('addBasket appends to end — existing order preserved (test 55)', () => {
    const p   = makeTwoBasketProfile()
    const b3  = createBasketNode({ label: 'C', weight: 0 })
    const p2  = addBasket(p, b3)
    const ids = p2.root.baskets.map((b) => b.id)
    expect(ids[0]).toBe(p.root.baskets[0].id)
    expect(ids[1]).toBe(p.root.baskets[1].id)
    expect(ids[2]).toBe(b3.id)
  })

  it('removeNode preserves order of remaining siblings (test 56)', () => {
    const p   = makeTwoBasketProfile()
    const b2  = p.root.baskets[1]
    const p2  = removeNode(p, p.root.baskets[0].id)
    expect(p2.root.baskets[0].id).toBe(b2.id)
  })

  it('updateNode preserves sibling order (test 57)', () => {
    const p     = makeTwoBasketProfile()
    const ids   = p.root.baskets.map((b) => b.id)
    const p2    = updateNode(p, ids[0], { label: 'Updated' })
    expect(p2.root.baskets.map((b) => b.id)).toEqual(ids)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — newIndex respected
// ════════════════════════════════════════════════════════════

describe('Phase 0B › newIndex parameter', () => {
  it('moveNode with newIndex=0 places node at start (test 58)', () => {
    const p   = makeTwoBasketProfile()
    const b2  = p.root.baskets[1]
    const p2  = moveNode(p, b2.id, p.root.id, 0)
    expect(p2.root.baskets[0].id).toBe(b2.id)
  })

  it('moveNode with newIndex=1 places node at correct position (test 59)', () => {
    const p  = makeTwoBasketProfile()
    const b1 = p.root.baskets[0]
    const b2 = p.root.baskets[1]
    const b3 = createBasketNode({ label: 'C', weight: 0 })
    const p2 = addBasket(p, b3)
    // Move b3 (currently at index 2) to index 1
    const p3 = moveNode(p2, b3.id, p2.root.id, 1)
    expect(p3.root.baskets[1].id).toBe(b3.id)
  })

  it('moveNode with newIndex out of bounds clamps to end (test 60)', () => {
    const p   = makeTwoBasketProfile()
    const b1  = p.root.baskets[0]
    const p2  = moveNode(p, b1.id, p.root.id, 999)
    expect(p2.root.baskets[p2.root.baskets.length - 1].id).toBe(b1.id)
  })

  it('addElement positions new element at end of basket (test 61)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const origElem = basket.elements[0].id
    const newElem  = createElementNode({ label: 'Last', weight: 0 })
    const p2       = addElement(p, basket.id, newElem)
    const elems    = p2.root.baskets[0].elements
    expect(elems[0].id).toBe(origElem)
    expect(elems[elems.length - 1].id).toBe(newElem.id)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — calculateNodeWeightSum
// ════════════════════════════════════════════════════════════

describe('Phase 0B › calculateNodeWeightSum', () => {
  it('calculateNodeWeightSum for root returns sum of basket weights (test 62)', () => {
    const p = makeTwoBasketProfile()
    expect(calculateNodeWeightSum(p.root)).toBeCloseTo(1.0)
  })

  it('calculateNodeWeightSum for basket returns sum of element weights (test 63)', () => {
    const p      = makeTwoBasketProfile()
    const basket = p.root.baskets[0]  // has e1 with weight 0.5
    expect(calculateNodeWeightSum(basket)).toBeCloseTo(0.5)
  })

  it('calculateNodeWeightSum for element returns sum of rule weights (test 64)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    expect(calculateNodeWeightSum(element)).toBeCloseTo(1.0)
  })

  it('calculateNodeWeightSum for rule (leaf) returns 0 (test 65)', () => {
    const p    = makeProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    expect(calculateNodeWeightSum(rule)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — calculateBasketWeightSum
// ════════════════════════════════════════════════════════════

describe('Phase 0B › calculateBasketWeightSum', () => {
  it('two baskets 0.6 + 0.4 = 1.0 (test 66)', () => {
    const p = makeTwoBasketProfile()
    expect(calculateBasketWeightSum(p)).toBeCloseTo(1.0)
  })

  it('single basket with weight 1.0 sums to 1.0 (test 67)', () => {
    const p = makeProfile()
    expect(calculateBasketWeightSum(p)).toBeCloseTo(1.0)
  })

  it('calculateBasketWeightSum is 0 for empty profile (test 68)', () => {
    const p = createEmptyEvaluationProfile({ name: 'E', validFrom: '2026-01-01' })
    expect(calculateBasketWeightSum(p)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — calculateChildWeightSummary
// ════════════════════════════════════════════════════════════

describe('Phase 0B › calculateChildWeightSummary', () => {
  it('root summary has count = number of baskets (test 69)', () => {
    const p       = makeTwoBasketProfile()
    const summary = calculateChildWeightSummary(p, p.root.id)
    expect(summary.count).toBe(2)
    expect(summary.sum).toBeCloseTo(1.0)
    expect(summary.isBalanced).toBe(true)
  })

  it('basket summary reflects element weights (test 70)', () => {
    const p       = makeTwoBasketProfile()
    const basket  = p.root.baskets[0]
    const summary = calculateChildWeightSummary(p, basket.id)
    expect(summary.count).toBe(1)
    expect(summary.sum).toBeCloseTo(0.5)
    expect(summary.isBalanced).toBe(false)   // 0.5 ≠ 1.0
  })

  it('element summary with single rule weight=1.0 is balanced (test 71)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    const summary = calculateChildWeightSummary(p, element.id)
    expect(summary.count).toBe(1)
    expect(summary.isBalanced).toBe(true)
  })

  it('unknown parentId returns count=0 isBalanced=false (test 72)', () => {
    const p       = makeProfile()
    const summary = calculateChildWeightSummary(p, 'ghost')
    expect(summary.count).toBe(0)
    expect(summary.isBalanced).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — findOverweightNodes / findUnderweightNodes
// ════════════════════════════════════════════════════════════

describe('Phase 0B › findOverweightNodes / findUnderweightNodes', () => {
  it('balanced profile has no overweight nodes (test 73)', () => {
    const p = makeProfile()
    expect(findOverweightNodes(p)).toHaveLength(0)
  })

  it('basket weight sum > 1.0 + tolerance flags root as overweight (test 74)', () => {
    const p  = makeTwoBasketProfile()
    // Change b2 weight to 0.5 → sum = 0.6 + 0.5 = 1.1
    const p2 = updateNode(p, p.root.baskets[1].id, { weight: 0.5 })
    expect(findOverweightNodes(p2)).toContain(p.root.id)
  })

  it('basket weight sum < 1.0 - tolerance flags root as underweight (test 75)', () => {
    const p  = makeTwoBasketProfile()
    // Change b2 weight to 0.1 → sum = 0.7
    const p2 = updateNode(p, p.root.baskets[1].id, { weight: 0.1 })
    expect(findUnderweightNodes(p2)).toContain(p.root.id)
  })

  it('balanced profile has no underweight nodes (test 76)', () => {
    const p = makeProfile()
    expect(findUnderweightNodes(p)).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — normalizeChildWeights
// ════════════════════════════════════════════════════════════

describe('Phase 0B › normalizeChildWeights', () => {
  it('normalizes basket weights at root level to equal shares (test 77)', () => {
    const p  = makeTwoBasketProfile()
    const p2 = normalizeChildWeights(p, p.root.id)
    for (const b of p2.root.baskets) {
      expect(b.weight).toBeCloseTo(0.5)
    }
  })

  it('normalizes element weights within a basket (test 78)', () => {
    const p      = makeTwoBasketProfile()
    // Add another element to b1 with arbitrary weight
    const b1     = p.root.baskets[0]
    const extra  = createElementNode({ label: 'E3', weight: 0.9 })
    const p2     = addElement(p, b1.id, extra)
    const p3     = normalizeChildWeights(p2, b1.id)
    const elems  = p3.root.baskets[0].elements
    expect(elems.length).toBe(2)
    for (const e of elems) {
      expect(e.weight).toBeCloseTo(0.5)
    }
  })

  it('returns profile unchanged for unknown parentId (test 79)', () => {
    const p  = makeProfile()
    const p2 = normalizeChildWeights(p, 'ghost')
    expect(p2.root.baskets[0].weight).toBe(p.root.baskets[0].weight)
  })

  it('original profile is not mutated by normalizeChildWeights (test 80)', () => {
    const p         = makeTwoBasketProfile()
    const origW0    = p.root.baskets[0].weight
    normalizeChildWeights(p, p.root.id)
    expect(p.root.baskets[0].weight).toBe(origW0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — canAddBasket / canAddElement / canAddRule
// ════════════════════════════════════════════════════════════

describe('Phase 0B › Structure guards — canAdd*', () => {
  it('canAddBasket returns true for DRAFT profile (test 81)', () => {
    expect(canAddBasket(makeProfile())).toBe(true)
  })

  it('canAddBasket returns false for PUBLISHED profile (test 82)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'PUBLISHED'))).toBe(false)
  })

  it('canAddElement returns true when target is a basket (test 83)', () => {
    const p = makeProfile()
    expect(canAddElement(p, p.root.baskets[0].id)).toBe(true)
  })

  it('canAddElement returns false for wrong node type (test 84)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    // trying to add element under element (not a basket)
    expect(canAddElement(p, element.id)).toBe(false)
  })

  it('canAddRule returns true when target is an element (test 85)', () => {
    const p       = makeProfile()
    const element = p.root.baskets[0].elements[0]
    expect(canAddRule(p, element.id)).toBe(true)
  })

  it('canAddRule returns false for ARCHIVED profile (test 86)', () => {
    const p = withStatus(makeProfile(), 'ARCHIVED')
    const element = p.root.baskets[0].elements[0]
    expect(canAddRule(p, element.id)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — canMoveNode
// ════════════════════════════════════════════════════════════

describe('Phase 0B › canMoveNode', () => {
  it('canMoveNode basket to root is allowed (test 87)', () => {
    const p = makeTwoBasketProfile()
    expect(canMoveNode(p, p.root.baskets[0].id, p.root.id)).toBe(true)
  })

  it('canMoveNode element to another basket is allowed (test 88)', () => {
    const p = makeTwoBasketProfile()
    const e1 = p.root.baskets[0].elements[0]
    const b2 = p.root.baskets[1]
    expect(canMoveNode(p, e1.id, b2.id)).toBe(true)
  })

  it('canMoveNode rule to another element is allowed (test 89)', () => {
    const p   = makeTwoBasketProfile()
    const r1  = p.root.baskets[0].elements[0].rules[0]
    const e2  = p.root.baskets[1].elements[0]
    expect(canMoveNode(p, r1.id, e2.id)).toBe(true)
  })

  it('canMoveNode returns false when profile is APPROVED (test 90)', () => {
    const p  = withStatus(makeTwoBasketProfile(), 'APPROVED')
    const b1 = p.root.baskets[0]
    expect(canMoveNode(p, b1.id, p.root.id)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 23 — PUBLISHED / ARCHIVED not editable
// ════════════════════════════════════════════════════════════

describe('Phase 0B › PUBLISHED / ARCHIVED not editable', () => {
  it('canAddBasket returns false for PUBLISHED (test 91)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'PUBLISHED'))).toBe(false)
  })

  it('canAddBasket returns false for ARCHIVED (test 92)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'ARCHIVED'))).toBe(false)
  })

  it('canAddElement returns false for APPROVED (test 93)', () => {
    const p  = withStatus(makeProfile(), 'APPROVED')
    expect(canAddElement(p, p.root.baskets[0].id)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 24 — DRAFT / VALIDATED / SIMULATED editable
// ════════════════════════════════════════════════════════════

describe('Phase 0B › DRAFT / VALIDATED / SIMULATED editable', () => {
  it('canAddBasket returns true for DRAFT (test 94)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'DRAFT'))).toBe(true)
  })

  it('canAddBasket returns true for VALIDATED (test 95)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'VALIDATED'))).toBe(true)
  })

  it('canAddBasket returns true for SIMULATED (test 96)', () => {
    expect(canAddBasket(withStatus(makeProfile(), 'SIMULATED'))).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 25 — isDescendant
// ════════════════════════════════════════════════════════════

describe('Phase 0B › isDescendant', () => {
  it('element is a descendant of its basket (test 97)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    expect(isDescendant(p, element.id, basket.id)).toBe(true)
  })

  it('rule is a descendant of root (test 98)', () => {
    const p    = makeProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    expect(isDescendant(p, rule.id, p.root.id)).toBe(true)
  })

  it('basket is NOT a descendant of its own element (test 99)', () => {
    const p       = makeProfile()
    const basket  = p.root.baskets[0]
    const element = basket.elements[0]
    expect(isDescendant(p, basket.id, element.id)).toBe(false)
  })

  it('a node is not a descendant of itself (test 100)', () => {
    const p      = makeProfile()
    const basket = p.root.baskets[0]
    expect(isDescendant(p, basket.id, basket.id)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 26 — getDepth
// ════════════════════════════════════════════════════════════

describe('Phase 0B › getDepth', () => {
  it('root is at depth 0 (test 101)', () => {
    const p = makeProfile()
    expect(getDepth(p, p.root.id)).toBe(0)
  })

  it('basket is at depth 1 (test 102)', () => {
    const p = makeProfile()
    expect(getDepth(p, p.root.baskets[0].id)).toBe(1)
  })

  it('element is at depth 2 (test 103)', () => {
    const p = makeProfile()
    expect(getDepth(p, p.root.baskets[0].elements[0].id)).toBe(2)
  })

  it('rule is at depth 3 (test 104)', () => {
    const p = makeProfile()
    expect(getDepth(p, p.root.baskets[0].elements[0].rules[0].id)).toBe(3)
  })

  it('unknown id returns -1 (test 105)', () => {
    const p = makeProfile()
    expect(getDepth(p, 'ghost')).toBe(-1)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 27 — countNodes
// ════════════════════════════════════════════════════════════

describe('Phase 0B › countNodes', () => {
  it('single-basket profile counts: root+basket+element+rule = 4 (test 106)', () => {
    expect(countNodes(makeProfile())).toBe(4)
  })

  it('two-basket profile counts correct total (test 107)', () => {
    // root + 2 baskets + 2 elements + 2 rules = 7
    expect(countNodes(makeTwoBasketProfile())).toBe(7)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 28 — cloneProfileWithUpdatedHierarchy
// ════════════════════════════════════════════════════════════

describe('Phase 0B › cloneProfileWithUpdatedHierarchy', () => {
  it('returns a new profile object (test 108)', () => {
    const p    = makeProfile()
    const p2   = cloneProfileWithUpdatedHierarchy(p, p.root)
    expect(p2).not.toBe(p)
  })

  it('metadata is preserved (test 109)', () => {
    const p  = makeProfile()
    const p2 = cloneProfileWithUpdatedHierarchy(p, p.root)
    expect(p2.metadata.id).toBe(p.metadata.id)
  })

  it('root node is deep-cloned — mutations to clone do not affect original (test 110)', () => {
    const p       = makeProfile()
    const origLabel = p.root.baskets[0].label
    const p2      = cloneProfileWithUpdatedHierarchy(p, p.root)
    p2.root.baskets[0].label = 'MUTATED'
    expect(p.root.baskets[0].label).toBe(origLabel)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 29 — validateHierarchyStructure + combined validator
// ════════════════════════════════════════════════════════════

describe('Phase 0B › validateHierarchyStructure', () => {
  it('validateHierarchyStructure passes for a valid profile (test 111)', () => {
    const p = makeProfile()
    expect(validateHierarchyStructure(p).valid).toBe(true)
    expect(validateHierarchyStructure(p).issues).toHaveLength(0)
  })

  it('validateHierarchyStructure is included in combined validateProfile (test 112)', async () => {
    const s = await validationSrc()
    expect(s).toContain('validateHierarchyStructure')
    expect(s).toContain('...validateHierarchyStructure(profile).issues')
  })

  it('validateProfile still passes for well-formed profile after hierarchy integration (test 113)', () => {
    const p = makeProfile()
    expect(validateProfile(p).valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 30 — getChildren
// ════════════════════════════════════════════════════════════

describe('Phase 0B › getChildren', () => {
  it('getChildren of root returns baskets (test 114)', () => {
    const p        = makeTwoBasketProfile()
    const children = getChildren(p, p.root.id)
    expect(children).toHaveLength(2)
    expect(children.every((c) => getNodeType(p, c.id) === 'basket')).toBe(true)
  })

  it('getChildren of basket returns elements (test 115)', () => {
    const p        = makeProfile()
    const basket   = p.root.baskets[0]
    const children = getChildren(p, basket.id)
    expect(children).toHaveLength(1)
    expect(getNodeType(p, children[0].id)).toBe('element')
  })

  it('getChildren of rule returns [] (test 116)', () => {
    const p    = makeProfile()
    const rule = p.root.baskets[0].elements[0].rules[0]
    expect(getChildren(p, rule.id)).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 31 — Guardrails
// ════════════════════════════════════════════════════════════

describe('Phase 0B › Guardrails', () => {
  it('no React imports in hierarchy.ts (test 117)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain("from 'react'")
    expect(s).not.toContain('useState')
    expect(s).not.toContain('useEffect')
    expect(s).not.toContain('import React')
  })

  it('no Firestore imports in hierarchy.ts (test 118)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('firebase/firestore')
    expect(s).not.toContain("from 'firebase")
  })

  it('no UI component imports in hierarchy.ts (test 119)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('components/')
    expect(s).not.toContain('pages/')
  })

  it('no route definitions in hierarchy.ts (test 120)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('<Route')
    expect(s).not.toContain("path='/")
  })

  it('no Sidebar references in hierarchy.ts (test 121)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('Sidebar')
    expect(s).not.toContain('NAV_CONFIG')
  })

  it('no AI / LLM imports in hierarchy.ts (test 122)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('openai')
    expect(s).not.toContain('anthropic')
    expect(s).not.toContain('gemini')
  })

  it('no Excel import references in hierarchy.ts (test 123)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('xlsx')
    expect(s).not.toContain('ExcelJS')
    expect(s).not.toContain('sheetjs')
  })

  it('hierarchy.ts does not import from Evaluation Engine production files (test 124)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('kpiAnalyticsEngine')
    expect(s).not.toContain('evaluationEngine')
    expect(s).not.toContain('executiveScore')
  })

  it('validation.ts imports flattenHierarchy from hierarchy (test 125)', async () => {
    const s = await validationSrc()
    expect(s).toContain('flattenHierarchy')
    expect(s).toContain("from './hierarchy'")
  })

  it('validation.ts exports validateHierarchyStructure (test 126)', async () => {
    const s = await validationSrc()
    expect(s).toContain('export function validateHierarchyStructure')
  })

  it('no production Evaluation Engine behavior changes — App.jsx not referenced (test 127)', async () => {
    const s = await hierarchySrc()
    expect(s).not.toContain('App.jsx')
    expect(s).not.toContain('DashboardPage')
    expect(s).not.toContain('ReportsPage')
  })
})
