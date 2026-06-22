// ============================================================
// Profile Studio — Diff Viewer Kernel (Phase 1 Closure)
//
// Pure structural comparison between two EvaluationProfileDraft
// payloads (typically: current profile vs. a snapshot, or two
// snapshots). Reports added/removed/changed baskets, elements,
// rules, processor steps, weights, caps, and threshold bands.
//
// No production side effects: this module never writes to
// Firestore, never calls the production Evaluation Engine, and
// never mutates its inputs.
// ============================================================

import type {
  EvaluationProfileDraft,
  BasketNode,
  ElementNode,
  RuleNode,
  ProcessorStep,
  ThresholdBand,
} from './types'
import type { ProfileSnapshot } from './exporter'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Result types
// ════════════════════════════════════════════════════════════

export interface NodeChange {
  id:     string
  label?: string
  /** Human-readable list of fields that differ, e.g. "weight: 0.3 → 0.5". */
  changes: string[]
}

export interface ProcessorStepChange {
  /** Dotted path to the owning node, e.g. "basket[b1].element[e1].rule[r1]". */
  nodePath: string
  added:    ProcessorStep[]
  removed:  ProcessorStep[]
  changed:  { processorType: string; changes: string[] }[]
}

export interface ProfileDiffResult {
  basketsAdded:   BasketNode[]
  basketsRemoved: BasketNode[]
  basketsChanged: NodeChange[]

  elementsAdded:   ElementNode[]
  elementsRemoved: ElementNode[]
  elementsChanged: NodeChange[]

  rulesAdded:   RuleNode[]
  rulesRemoved: RuleNode[]
  rulesChanged: NodeChange[]

  processorChanges: ProcessorStepChange[]

  /** True when nothing differs structurally between the two profiles. */
  identical: boolean
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Helpers
// ════════════════════════════════════════════════════════════

function numEq(a: number | undefined, b: number | undefined): boolean {
  const an = a ?? 0
  const bn = b ?? 0
  return Math.abs(an - bn) < 1e-9
}

function bandsEqual(a: ThresholdBand[] = [], b: ThresholdBand[] = []): boolean {
  if (a.length !== b.length) return false
  return a.every((band, i) => {
    const other = b[i]
    return band.label === other.label
      && numEq(band.minPct, other.minPct)
      && numEq(band.maxPct, other.maxPct)
      && numEq(band.score, other.score)
  })
}

function stepsEqual(a: ProcessorStep, b: ProcessorStep): boolean {
  return a.processorType === b.processorType
    && (a.order ?? 0) === (b.order ?? 0)
    && JSON.stringify(a.config ?? {}) === JSON.stringify(b.config ?? {})
}

function diffSteps(nodePath: string, before: ProcessorStep[] = [], after: ProcessorStep[] = []): ProcessorStepChange | null {
  const beforeByType = new Map(before.map((s) => [`${s.processorType}#${s.order ?? 0}`, s]))
  const afterByType  = new Map(after.map((s) => [`${s.processorType}#${s.order ?? 0}`, s]))

  const added   = [...afterByType.entries()].filter(([k]) => !beforeByType.has(k)).map(([, s]) => s)
  const removed = [...beforeByType.entries()].filter(([k]) => !afterByType.has(k)).map(([, s]) => s)
  const changed: { processorType: string; changes: string[] }[] = []

  for (const [key, beforeStep] of beforeByType) {
    const afterStep = afterByType.get(key)
    if (afterStep && !stepsEqual(beforeStep, afterStep)) {
      changed.push({
        processorType: beforeStep.processorType,
        changes: [`config: ${JSON.stringify(beforeStep.config ?? {})} → ${JSON.stringify(afterStep.config ?? {})}`],
      })
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null
  return { nodePath, added, removed, changed }
}

function diffRule(before: RuleNode, after: RuleNode, nodePath: string, processorChanges: ProcessorStepChange[]): string[] {
  const changes: string[] = []
  if (before.kpiKey !== after.kpiKey) changes.push(`kpiKey: ${before.kpiKey} → ${after.kpiKey}`)
  if (before.label !== after.label) changes.push(`label: ${before.label} → ${after.label}`)
  if (before.metricType !== after.metricType) changes.push(`metricType: ${before.metricType} → ${after.metricType}`)
  if (!numEq(before.weight, after.weight)) changes.push(`weight: ${before.weight} → ${after.weight}`)
  if (!numEq(before.cap, after.cap)) changes.push(`cap: ${before.cap ?? '—'} → ${after.cap ?? '—'}`)
  if (!numEq(before.floor, after.floor)) changes.push(`floor: ${before.floor ?? '—'} → ${after.floor ?? '—'}`)
  if (!bandsEqual(before.thresholdBands, after.thresholdBands)) {
    changes.push(`thresholdBands: ${(before.thresholdBands ?? []).length} band(s) → ${(after.thresholdBands ?? []).length} band(s)`)
  }
  const stepDiff = diffSteps(nodePath, before.pipeline?.steps, after.pipeline?.steps)
  if (stepDiff) processorChanges.push(stepDiff)
  return changes
}

function diffElement(before: ElementNode, after: ElementNode, nodePath: string, result: ProfileDiffResult): string[] {
  const changes: string[] = []
  if (before.label !== after.label) changes.push(`label: ${before.label} → ${after.label}`)
  if (!numEq(before.weight, after.weight)) changes.push(`weight: ${before.weight} → ${after.weight}`)

  const stepDiff = diffSteps(nodePath, before.pipeline?.steps, after.pipeline?.steps)
  if (stepDiff) result.processorChanges.push(stepDiff)

  const beforeRules = new Map((before.rules ?? []).map((r) => [r.id, r]))
  const afterRules  = new Map((after.rules ?? []).map((r) => [r.id, r]))

  for (const [id, rule] of afterRules) {
    if (!beforeRules.has(id)) result.rulesAdded.push(rule)
  }
  for (const [id, rule] of beforeRules) {
    if (!afterRules.has(id)) result.rulesRemoved.push(rule)
  }
  for (const [id, beforeRule] of beforeRules) {
    const afterRule = afterRules.get(id)
    if (!afterRule) continue
    const ruleChanges = diffRule(beforeRule, afterRule, `${nodePath}.rule[${id}]`, result.processorChanges)
    if (ruleChanges.length) result.rulesChanged.push({ id, label: afterRule.label, changes: ruleChanges })
  }

  return changes
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Public API
// ════════════════════════════════════════════════════════════

/**
 * Compares two profile payloads and reports every added, removed, and
 * changed basket/element/rule/processor/weight/cap/threshold. Pure
 * function — no Firestore reads/writes, no engine calls.
 */
export function diffProfiles(
  before: EvaluationProfileDraft,
  after:  EvaluationProfileDraft,
): ProfileDiffResult {
  const result: ProfileDiffResult = {
    basketsAdded: [], basketsRemoved: [], basketsChanged: [],
    elementsAdded: [], elementsRemoved: [], elementsChanged: [],
    rulesAdded: [], rulesRemoved: [], rulesChanged: [],
    processorChanges: [],
    identical: true,
  }

  const beforeBaskets = new Map((before.root?.baskets ?? []).map((b) => [b.id, b]))
  const afterBaskets  = new Map((after.root?.baskets ?? []).map((b) => [b.id, b]))

  for (const [id, basket] of afterBaskets) {
    if (!beforeBaskets.has(id)) result.basketsAdded.push(basket)
  }
  for (const [id, basket] of beforeBaskets) {
    if (!afterBaskets.has(id)) result.basketsRemoved.push(basket)
  }

  for (const [id, beforeBasket] of beforeBaskets) {
    const afterBasket = afterBaskets.get(id)
    if (!afterBasket) continue

    const basketChanges: string[] = []
    if (beforeBasket.label !== afterBasket.label) basketChanges.push(`label: ${beforeBasket.label} → ${afterBasket.label}`)
    if (!numEq(beforeBasket.weight, afterBasket.weight)) basketChanges.push(`weight: ${beforeBasket.weight} → ${afterBasket.weight}`)

    const stepDiff = diffSteps(`basket[${id}]`, beforeBasket.pipeline?.steps, afterBasket.pipeline?.steps)
    if (stepDiff) result.processorChanges.push(stepDiff)

    if (basketChanges.length) result.basketsChanged.push({ id, label: afterBasket.label, changes: basketChanges })

    const beforeElements = new Map((beforeBasket.elements ?? []).map((e) => [e.id, e]))
    const afterElements  = new Map((afterBasket.elements ?? []).map((e) => [e.id, e]))

    for (const [eid, element] of afterElements) {
      if (!beforeElements.has(eid)) result.elementsAdded.push(element)
    }
    for (const [eid, element] of beforeElements) {
      if (!afterElements.has(eid)) result.elementsRemoved.push(element)
    }
    for (const [eid, beforeElement] of beforeElements) {
      const afterElement = afterElements.get(eid)
      if (!afterElement) continue
      const elementChanges = diffElement(beforeElement, afterElement, `basket[${id}].element[${eid}]`, result)
      if (elementChanges.length) result.elementsChanged.push({ id: eid, label: afterElement.label, changes: elementChanges })
    }
  }

  result.identical =
    result.basketsAdded.length === 0 && result.basketsRemoved.length === 0 && result.basketsChanged.length === 0 &&
    result.elementsAdded.length === 0 && result.elementsRemoved.length === 0 && result.elementsChanged.length === 0 &&
    result.rulesAdded.length === 0 && result.rulesRemoved.length === 0 && result.rulesChanged.length === 0 &&
    result.processorChanges.length === 0

  return result
}

/** Convenience wrapper for comparing two snapshots by their captured profile payload. */
export function diffSnapshots(a: ProfileSnapshot, b: ProfileSnapshot): ProfileDiffResult {
  return diffProfiles(a.profile, b.profile)
}
