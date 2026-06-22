// ============================================================
// Profile Studio — Hierarchy Builder Kernel (Phase 0B)
//
// Pure functions for reading and mutating the evaluation profile
// node hierarchy. All mutation helpers are immutable (return a
// new profile object; never mutate the input).
//
// No React. No Firestore. No side effects. No UI.
// ============================================================

import type {
  EvaluationProfileDraft,
  EvaluationProfileNode,
  BasketNode,
  ElementNode,
  RuleNode,
} from './types'
import { isEditableStatus } from './lifecycle'

// ── Public types ──────────────────────────────────────────────

/** The role a node plays in the evaluation hierarchy. */
export type NodeType = 'root' | 'basket' | 'element' | 'rule'

/** Union of all node shapes that appear in the hierarchy. */
export type AnyProfileNode =
  | EvaluationProfileNode
  | BasketNode
  | ElementNode
  | RuleNode

/** Flat representation of a single node for traversal output. */
export interface HierarchyNode {
  id:       string
  label:    string
  type:     NodeType
  /** 0=root, 1=basket, 2=element, 3=rule */
  depth:    number
  parentId: string | null
}

/** Summary of children's combined weights under a parent node. */
export interface ChildWeightSummary {
  parentId:   string
  sum:        number
  count:      number
  /** true when |sum − 1.0| ≤ WEIGHT_TOLERANCE and count > 0 */
  isBalanced: boolean
}

const WEIGHT_TOLERANCE = 0.01

// ════════════════════════════════════════════════════════════
// SECTION 1 — Read helpers
// ════════════════════════════════════════════════════════════

/**
 * Returns the NodeType for the given id, or null if not found.
 */
export function getNodeType(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): NodeType | null {
  if (!profile?.root) return null
  const { root } = profile
  if (root.id === nodeId) return 'root'
  for (const basket of (root.baskets ?? [])) {
    if (basket.id === nodeId) return 'basket'
    for (const element of (basket.elements ?? [])) {
      if (element.id === nodeId) return 'element'
      for (const rule of (element.rules ?? [])) {
        if (rule.id === nodeId) return 'rule'
      }
    }
  }
  return null
}

/**
 * Finds a node by id anywhere in the hierarchy.
 * Returns null if not found — never throws.
 */
export function findNode(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): AnyProfileNode | null {
  if (!profile?.root) return null
  const { root } = profile
  if (root.id === nodeId) return root
  for (const basket of (root.baskets ?? [])) {
    if (basket.id === nodeId) return basket
    for (const element of (basket.elements ?? [])) {
      if (element.id === nodeId) return element
      for (const rule of (element.rules ?? [])) {
        if (rule.id === nodeId) return rule
      }
    }
  }
  return null
}

/**
 * Returns the direct parent of the given node, or null if not found
 * or if the node is the root (root has no parent).
 */
export function findParentNode(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): AnyProfileNode | null {
  if (!profile?.root) return null
  const { root } = profile
  if (root.id === nodeId) return null           // root has no parent
  for (const basket of (root.baskets ?? [])) {
    if (basket.id === nodeId) return root
    for (const element of (basket.elements ?? [])) {
      if (element.id === nodeId) return basket
      for (const rule of (element.rules ?? [])) {
        if (rule.id === nodeId) return element
      }
    }
  }
  return null
}

/**
 * Returns the ordered list of node ids from root down to (and including)
 * the target node. Returns [] if the node is not found.
 *
 * @example getNodePath(p, ruleId) → [rootId, basketId, elementId, ruleId]
 */
export function getNodePath(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): string[] {
  if (!profile?.root) return []
  const { root } = profile
  if (root.id === nodeId) return [root.id]
  for (const basket of (root.baskets ?? [])) {
    if (basket.id === nodeId) return [root.id, basket.id]
    for (const element of (basket.elements ?? [])) {
      if (element.id === nodeId) return [root.id, basket.id, element.id]
      for (const rule of (element.rules ?? [])) {
        if (rule.id === nodeId) {
          return [root.id, basket.id, element.id, rule.id]
        }
      }
    }
  }
  return []
}

/**
 * Returns all nodes in DFS preorder (parent before children).
 * Includes the root node.
 */
export function flattenHierarchy(
  profile: EvaluationProfileDraft,
): HierarchyNode[] {
  if (!profile?.root) return []
  const nodes: HierarchyNode[] = []
  const { root } = profile

  nodes.push({ id: root.id, label: root.label, type: 'root', depth: 0, parentId: null })

  for (const basket of (root.baskets ?? [])) {
    nodes.push({ id: basket.id, label: basket.label, type: 'basket', depth: 1, parentId: root.id })

    for (const element of (basket.elements ?? [])) {
      nodes.push({ id: element.id, label: element.label, type: 'element', depth: 2, parentId: basket.id })

      for (const rule of (element.rules ?? [])) {
        nodes.push({ id: rule.id, label: rule.label, type: 'rule', depth: 3, parentId: element.id })
      }
    }
  }

  return nodes
}

/**
 * Returns the direct children of the given node as an array.
 * Returns [] if the node is not found or has no children (rules).
 */
export function getChildren(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): AnyProfileNode[] {
  if (!profile?.root) return []
  const { root } = profile
  if (root.id === nodeId) return [...(root.baskets ?? [])]
  for (const basket of (root.baskets ?? [])) {
    if (basket.id === nodeId) return [...(basket.elements ?? [])]
    for (const element of (basket.elements ?? [])) {
      if (element.id === nodeId) return [...(element.rules ?? [])]
      for (const rule of (element.rules ?? [])) {
        if (rule.id === nodeId) return []
      }
    }
  }
  return []
}

/** Returns a shallow copy of all basket nodes. */
export function getBasketNodes(profile: EvaluationProfileDraft): BasketNode[] {
  return [...(profile?.root?.baskets ?? [])]
}

/** Returns all element nodes across all baskets. */
export function getElementNodes(profile: EvaluationProfileDraft): ElementNode[] {
  const elements: ElementNode[] = []
  for (const basket of (profile?.root?.baskets ?? [])) {
    elements.push(...(basket.elements ?? []))
  }
  return elements
}

/** Returns all rule nodes across all baskets and elements. */
export function getRuleNodes(profile: EvaluationProfileDraft): RuleNode[] {
  const rules: RuleNode[] = []
  for (const basket of (profile?.root?.baskets ?? [])) {
    for (const element of (basket.elements ?? [])) {
      rules.push(...(element.rules ?? []))
    }
  }
  return rules
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Tree utilities
// ════════════════════════════════════════════════════════════

/**
 * Returns true if `possibleChildId` is a descendant of `possibleParentId`.
 *
 * A node is NOT a descendant of itself.
 */
export function isDescendant(
  profile:          EvaluationProfileDraft,
  possibleChildId:  string,
  possibleParentId: string,
): boolean {
  if (possibleChildId === possibleParentId) return false
  const path = getNodePath(profile, possibleChildId)
  if (path.length === 0) return false
  const parentIdx = path.indexOf(possibleParentId)
  const childIdx  = path.indexOf(possibleChildId)
  return parentIdx !== -1 && childIdx !== -1 && parentIdx < childIdx
}

/**
 * Returns the depth of the given node (0 = root, 1 = basket, 2 = element, 3 = rule).
 * Returns -1 if the node is not found.
 */
export function getDepth(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): number {
  const path = getNodePath(profile, nodeId)
  return path.length === 0 ? -1 : path.length - 1
}

/**
 * Returns the total number of nodes in the hierarchy (including root).
 */
export function countNodes(profile: EvaluationProfileDraft): number {
  return flattenHierarchy(profile).length
}

/**
 * Returns a new profile with the root replaced by a deep clone of `rootNode`.
 * Metadata is preserved and shallow-copied.
 */
export function cloneProfileWithUpdatedHierarchy(
  profile:  EvaluationProfileDraft,
  rootNode: EvaluationProfileNode,
): EvaluationProfileDraft {
  return {
    ...profile,
    metadata: { ...profile.metadata },
    root:     structuredClone(rootNode),
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Immutable mutation helpers
// ════════════════════════════════════════════════════════════

/**
 * Returns a new profile with `basket` appended to root.baskets.
 * The original profile is never mutated.
 */
export function addBasket(
  profile: EvaluationProfileDraft,
  basket:  BasketNode,
): EvaluationProfileDraft {
  return {
    ...profile,
    metadata: { ...profile.metadata },
    root: {
      ...profile.root,
      baskets: [...(profile.root.baskets ?? []), basket],
    },
  }
}

/**
 * Returns a new profile with `element` appended to the basket identified
 * by `basketId`. If basketId is not found the profile is returned unchanged.
 */
export function addElement(
  profile:  EvaluationProfileDraft,
  basketId: string,
  element:  ElementNode,
): EvaluationProfileDraft {
  return {
    ...profile,
    metadata: { ...profile.metadata },
    root: {
      ...profile.root,
      baskets: (profile.root.baskets ?? []).map((b) =>
        b.id === basketId
          ? { ...b, elements: [...(b.elements ?? []), element] }
          : b,
      ),
    },
  }
}

/**
 * Returns a new profile with `rule` appended to the element identified
 * by `elementId`. If elementId is not found the profile is returned unchanged.
 */
export function addRule(
  profile:   EvaluationProfileDraft,
  elementId: string,
  rule:      RuleNode,
): EvaluationProfileDraft {
  return {
    ...profile,
    metadata: { ...profile.metadata },
    root: {
      ...profile.root,
      baskets: (profile.root.baskets ?? []).map((b) => ({
        ...b,
        elements: (b.elements ?? []).map((e) =>
          e.id === elementId
            ? { ...e, rules: [...(e.rules ?? []), rule] }
            : e,
        ),
      })),
    },
  }
}

/**
 * Returns a new profile with the node (and its entire subtree) removed.
 * Removing the root is a no-op (returns profile unchanged).
 * If `nodeId` is not found the profile is returned unchanged.
 */
export function removeNode(
  profile: EvaluationProfileDraft,
  nodeId:  string,
): EvaluationProfileDraft {
  const type = getNodeType(profile, nodeId)
  if (!type || type === 'root') return profile

  return {
    ...profile,
    metadata: { ...profile.metadata },
    root: {
      ...profile.root,
      baskets:
        type === 'basket'
          ? (profile.root.baskets ?? []).filter((b) => b.id !== nodeId)
          : (profile.root.baskets ?? []).map((b) => {
              if (type === 'element') {
                return { ...b, elements: (b.elements ?? []).filter((e) => e.id !== nodeId) }
              }
              // type === 'rule'
              return {
                ...b,
                elements: (b.elements ?? []).map((e) => ({
                  ...e,
                  rules: (e.rules ?? []).filter((r) => r.id !== nodeId),
                })),
              }
            }),
    },
  }
}

/**
 * Returns a new profile with a shallow patch applied to the node matching
 * `nodeId`. All other nodes are preserved unchanged.
 * If `nodeId` is not found the profile is returned unchanged.
 */
export function updateNode(
  profile: EvaluationProfileDraft,
  nodeId:  string,
  patch:   Record<string, unknown>,
): EvaluationProfileDraft {
  const type = getNodeType(profile, nodeId)
  if (!type) return profile

  if (type === 'root') {
    return {
      ...profile,
      metadata: { ...profile.metadata },
      root: { ...profile.root, ...patch } as EvaluationProfileNode,
    }
  }

  return {
    ...profile,
    metadata: { ...profile.metadata },
    root: {
      ...profile.root,
      baskets: (profile.root.baskets ?? []).map((b) => {
        if (type === 'basket' && b.id === nodeId) {
          return { ...b, ...patch } as BasketNode
        }
        return {
          ...b,
          elements: (b.elements ?? []).map((e) => {
            if (type === 'element' && e.id === nodeId) {
              return { ...e, ...patch } as ElementNode
            }
            return {
              ...e,
              rules: (e.rules ?? []).map((r) =>
                type === 'rule' && r.id === nodeId
                  ? ({ ...r, ...patch } as RuleNode)
                  : r,
              ),
            }
          }),
        }
      }),
    },
  }
}

/**
 * Returns a new profile with the specified node moved to `newParentId`.
 *
 * If `newIndex` is provided the node is inserted at that position among
 * the parent's existing children; otherwise it is appended.
 *
 * Returns the profile unchanged when `canMoveNode` is false.
 */
export function moveNode(
  profile:     EvaluationProfileDraft,
  nodeId:      string,
  newParentId: string,
  newIndex?:   number,
): EvaluationProfileDraft {
  if (!canMoveNode(profile, nodeId, newParentId)) return profile

  const nodeType = getNodeType(profile, nodeId)
  const nodeToMove = findNode(profile, nodeId)
  if (!nodeType || !nodeToMove) return profile

  // Remove from current position
  const withRemoved = removeNode(profile, nodeId)

  const insertAt = (arr: unknown[]): number =>
    newIndex !== undefined ? Math.min(Math.max(0, newIndex), arr.length) : arr.length

  if (nodeType === 'basket') {
    const basket = nodeToMove as BasketNode
    const baskets = [...(withRemoved.root.baskets ?? [])]
    baskets.splice(insertAt(baskets), 0, basket)
    return { ...withRemoved, root: { ...withRemoved.root, baskets } }
  }

  if (nodeType === 'element') {
    const element = nodeToMove as ElementNode
    return {
      ...withRemoved,
      root: {
        ...withRemoved.root,
        baskets: (withRemoved.root.baskets ?? []).map((b) => {
          if (b.id !== newParentId) return b
          const elements = [...(b.elements ?? [])]
          elements.splice(insertAt(elements), 0, element)
          return { ...b, elements }
        }),
      },
    }
  }

  if (nodeType === 'rule') {
    const rule = nodeToMove as RuleNode
    return {
      ...withRemoved,
      root: {
        ...withRemoved.root,
        baskets: (withRemoved.root.baskets ?? []).map((b) => ({
          ...b,
          elements: (b.elements ?? []).map((e) => {
            if (e.id !== newParentId) return e
            const rules = [...(e.rules ?? [])]
            rules.splice(insertAt(rules), 0, rule)
            return { ...e, rules }
          }),
        })),
      },
    }
  }

  return profile
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Weight helpers
// ════════════════════════════════════════════════════════════

/**
 * Returns the sum of direct children's weights for the given node.
 *
 * Accepts root, basket, or element nodes.
 * Returns 0 for rule nodes (leaves have no children).
 */
export function calculateNodeWeightSum(
  node: EvaluationProfileNode | BasketNode | ElementNode | RuleNode,
): number {
  if ('baskets' in node) {
    return ((node as EvaluationProfileNode).baskets ?? []).reduce((s, b) => s + (b.weight ?? 0), 0)
  }
  if ('elements' in node) {
    return ((node as BasketNode).elements ?? []).reduce((s, e) => s + (e.weight ?? 0), 0)
  }
  if ('rules' in node) {
    return ((node as ElementNode).rules ?? []).reduce((s, r) => s + (r.weight ?? 0), 0)
  }
  return 0  // RuleNode leaf
}

/**
 * Returns the sum of all basket weights at the root level.
 */
export function calculateBasketWeightSum(profile: EvaluationProfileDraft): number {
  return (profile?.root?.baskets ?? []).reduce((s, b) => s + (b.weight ?? 0), 0)
}

/**
 * Calculates the combined weight of all direct children under `parentId`.
 */
export function calculateChildWeightSummary(
  profile:  EvaluationProfileDraft,
  parentId: string,
): ChildWeightSummary {
  const type = getNodeType(profile, parentId)
  let sum   = 0
  let count = 0

  if (type === 'root') {
    const baskets = profile.root?.baskets ?? []
    count = baskets.length
    sum   = baskets.reduce((s, b) => s + (b.weight ?? 0), 0)
  } else if (type === 'basket') {
    for (const b of (profile.root?.baskets ?? [])) {
      if (b.id === parentId) {
        count = (b.elements ?? []).length
        sum   = (b.elements ?? []).reduce((s, e) => s + (e.weight ?? 0), 0)
        break
      }
    }
  } else if (type === 'element') {
    outer: for (const b of (profile.root?.baskets ?? [])) {
      for (const e of (b.elements ?? [])) {
        if (e.id === parentId) {
          count = (e.rules ?? []).length
          sum   = (e.rules ?? []).reduce((s, r) => s + (r.weight ?? 0), 0)
          break outer
        }
      }
    }
  }

  return {
    parentId,
    sum,
    count,
    isBalanced: count > 0 && Math.abs(sum - 1.0) <= WEIGHT_TOLERANCE,
  }
}

/**
 * Returns an array of node ids whose direct children weights sum to more
 * than 1.0 + WEIGHT_TOLERANCE.
 */
export function findOverweightNodes(profile: EvaluationProfileDraft): string[] {
  const overweight: string[] = []
  const root = profile?.root
  if (!root) return overweight

  const basketSum = (root.baskets ?? []).reduce((s, b) => s + (b.weight ?? 0), 0)
  if ((root.baskets ?? []).length > 0 && basketSum > 1.0 + WEIGHT_TOLERANCE) {
    overweight.push(root.id)
  }

  for (const basket of (root.baskets ?? [])) {
    const elemSum = (basket.elements ?? []).reduce((s, e) => s + (e.weight ?? 0), 0)
    if ((basket.elements ?? []).length > 0 && elemSum > 1.0 + WEIGHT_TOLERANCE) {
      overweight.push(basket.id)
    }
    for (const element of (basket.elements ?? [])) {
      const ruleSum = (element.rules ?? []).reduce((s, r) => s + (r.weight ?? 0), 0)
      if ((element.rules ?? []).length > 0 && ruleSum > 1.0 + WEIGHT_TOLERANCE) {
        overweight.push(element.id)
      }
    }
  }

  return overweight
}

/**
 * Returns an array of node ids whose direct children weights sum to less
 * than 1.0 − WEIGHT_TOLERANCE.
 */
export function findUnderweightNodes(profile: EvaluationProfileDraft): string[] {
  const underweight: string[] = []
  const root = profile?.root
  if (!root) return underweight

  const basketSum = (root.baskets ?? []).reduce((s, b) => s + (b.weight ?? 0), 0)
  if ((root.baskets ?? []).length > 0 && basketSum < 1.0 - WEIGHT_TOLERANCE) {
    underweight.push(root.id)
  }

  for (const basket of (root.baskets ?? [])) {
    const elemSum = (basket.elements ?? []).reduce((s, e) => s + (e.weight ?? 0), 0)
    if ((basket.elements ?? []).length > 0 && elemSum < 1.0 - WEIGHT_TOLERANCE) {
      underweight.push(basket.id)
    }
    for (const element of (basket.elements ?? [])) {
      const ruleSum = (element.rules ?? []).reduce((s, r) => s + (r.weight ?? 0), 0)
      if ((element.rules ?? []).length > 0 && ruleSum < 1.0 - WEIGHT_TOLERANCE) {
        underweight.push(element.id)
      }
    }
  }

  return underweight
}

/**
 * Returns a new profile where all direct children of `parentId` have their
 * weights set to 1 / n (equal share). Does not recurse into sub-children.
 * If the parent has no children the profile is returned unchanged.
 */
export function normalizeChildWeights(
  profile:  EvaluationProfileDraft,
  parentId: string,
): EvaluationProfileDraft {
  const type = getNodeType(profile, parentId)
  if (!type) return profile

  if (type === 'root') {
    const baskets = profile.root?.baskets ?? []
    if (baskets.length === 0) return profile
    const w = 1.0 / baskets.length
    return {
      ...profile,
      root: { ...profile.root, baskets: baskets.map((b) => ({ ...b, weight: w })) },
    }
  }

  if (type === 'basket') {
    return {
      ...profile,
      root: {
        ...profile.root,
        baskets: (profile.root.baskets ?? []).map((b) => {
          if (b.id !== parentId) return b
          const elements = b.elements ?? []
          if (elements.length === 0) return b
          const w = 1.0 / elements.length
          return { ...b, elements: elements.map((e) => ({ ...e, weight: w })) }
        }),
      },
    }
  }

  if (type === 'element') {
    return {
      ...profile,
      root: {
        ...profile.root,
        baskets: (profile.root.baskets ?? []).map((b) => ({
          ...b,
          elements: (b.elements ?? []).map((e) => {
            if (e.id !== parentId) return e
            const rules = e.rules ?? []
            if (rules.length === 0) return e
            const w = 1.0 / rules.length
            return { ...e, rules: rules.map((r) => ({ ...r, weight: w })) }
          }),
        })),
      },
    }
  }

  return profile
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Structure guards
// ════════════════════════════════════════════════════════════

/**
 * Returns true when a basket can be added to this profile.
 * Requires the profile to be in an editable status (DRAFT, VALIDATED, SIMULATED).
 */
export function canAddBasket(profile: EvaluationProfileDraft): boolean {
  return isEditableStatus(profile?.metadata?.status)
}

/**
 * Returns true when an element can be added under `basketId`.
 * Requires profile to be editable and `basketId` to resolve to a basket node.
 */
export function canAddElement(
  profile:  EvaluationProfileDraft,
  basketId: string,
): boolean {
  if (!isEditableStatus(profile?.metadata?.status)) return false
  return getNodeType(profile, basketId) === 'basket'
}

/**
 * Returns true when a rule can be added under `elementId`.
 * Requires profile to be editable and `elementId` to resolve to an element node.
 */
export function canAddRule(
  profile:   EvaluationProfileDraft,
  elementId: string,
): boolean {
  if (!isEditableStatus(profile?.metadata?.status)) return false
  return getNodeType(profile, elementId) === 'element'
}

/**
 * Returns true when it is valid to move `nodeId` under `newParentId`.
 *
 * Blocked when:
 *   - Profile is not editable (APPROVED, PUBLISHED, ARCHIVED)
 *   - nodeId or newParentId does not exist in the hierarchy
 *   - nodeId === newParentId (move to self)
 *   - nodeId is the root
 *   - newParentId is a descendant of nodeId (would create a cycle)
 *   - Type mismatch (basket → must go under root; element → basket; rule → element)
 */
export function canMoveNode(
  profile:     EvaluationProfileDraft,
  nodeId:      string,
  newParentId: string,
): boolean {
  if (!isEditableStatus(profile?.metadata?.status)) return false

  const nodeType      = getNodeType(profile, nodeId)
  const newParentType = getNodeType(profile, newParentId)

  if (!nodeType || !newParentType) return false
  if (nodeId === newParentId)       return false
  if (nodeType === 'root')          return false

  // Prevent moving into own subtree (cycle prevention)
  if (isDescendant(profile, newParentId, nodeId)) return false

  // Structural type rules
  if (nodeType === 'basket'  && newParentType !== 'root')    return false
  if (nodeType === 'element' && newParentType !== 'basket')  return false
  if (nodeType === 'rule'    && newParentType !== 'element') return false

  return true
}
