// ============================================================
// Profile Studio — Validation Kernel (Phase 0A)
//
// Pure validation functions that check the integrity of a profile
// definition. Never throws for normal validation failures — returns
// a ProfileValidationResult with an issues list instead.
//
// No scoring. No Firestore. No React. No UI.
// ============================================================

import type {
  EvaluationProfileDraft,
  ThresholdBand,
  ProcessorStep,
  ProfileValidationResult,
  ProfileValidationIssue,
} from './types'
import { isSupportedProcessorType, getProcessorDefinition } from './processors'
import { validateEffectiveDates } from './versioning'
import { flattenHierarchy } from './hierarchy'
import { validateProcessorStepConfig } from './processorValidation'

// ── Issue builder helpers ─────────────────────────────────────

function err(code: string, message: string, path?: string): ProfileValidationIssue {
  return { code, message, path, severity: 'error' }
}

function warn(code: string, message: string, path?: string): ProfileValidationIssue {
  return { code, message, path, severity: 'warning' }
}

function result(issues: ProfileValidationIssue[]): ProfileValidationResult {
  return { valid: issues.every((i) => i.severity !== 'error'), issues }
}

// ── Weight tolerance ──────────────────────────────────────────

const WEIGHT_TOLERANCE = 0.01

// ── SECTION 1 — Metadata validation ──────────────────────────

/**
 * Validates required metadata fields and effective date constraints.
 */
export function validateProfileMetadata(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const m = profile.metadata

  if (!m.id   || typeof m.id   !== 'string' || m.id.trim()   === '') {
    issues.push(err('MISSING_ID',      'Profile must have a non-empty id.',      'metadata.id'))
  }
  if (!m.name || typeof m.name !== 'string' || m.name.trim() === '') {
    issues.push(err('MISSING_NAME',    'Profile must have a non-empty name.',    'metadata.name'))
  }
  if (!m.version || typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version)) {
    issues.push(err('INVALID_VERSION', 'Profile version must be in major.minor.patch format.', 'metadata.version'))
  }
  if (!m.status) {
    issues.push(err('MISSING_STATUS',  'Profile must have a status.',            'metadata.status'))
  }
  if (!m.scope) {
    issues.push(err('MISSING_SCOPE',   'Profile must have a scope.',             'metadata.scope'))
  }

  const dateResult = validateEffectiveDates(m.validFrom, m.validTo)
  if (!dateResult.valid) {
    issues.push(err('INVALID_DATES', dateResult.reason ?? 'Effective date validation failed.', 'metadata.validFrom'))
  }

  return result(issues)
}

// ── SECTION 2 — Hierarchy validation ─────────────────────────

/**
 * Validates that the profile root and node hierarchy exist and are well-formed.
 */
export function validateProfileHierarchy(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const root = profile.root

  if (!root) {
    issues.push(err('MISSING_ROOT', 'Profile must have a root node.', 'root'))
    return result(issues)
  }
  if (!root.id || root.id.trim() === '') {
    issues.push(err('ROOT_MISSING_ID', 'Root node must have a non-empty id.', 'root.id'))
  }
  if (!root.baskets || root.baskets.length === 0) {
    issues.push(err('NO_BASKETS', 'Profile root must contain at least one basket.', 'root.baskets'))
    return result(issues)
  }

  for (const basket of root.baskets) {
    const bp = `root.baskets[${basket.id}]`
    if (!basket.id || basket.id.trim() === '') {
      issues.push(err('BASKET_MISSING_ID', 'Each basket must have a non-empty id.', bp))
    }
    if (!basket.label || basket.label.trim() === '') {
      issues.push(err('BASKET_MISSING_LABEL', 'Each basket must have a non-empty label.', `${bp}.label`))
    }
    if (!basket.elements || basket.elements.length === 0) {
      issues.push(warn('BASKET_NO_ELEMENTS', `Basket "${basket.id}" has no elements.`, `${bp}.elements`))
    }

    for (const element of (basket.elements ?? [])) {
      const ep = `${bp}.elements[${element.id}]`
      if (!element.id || element.id.trim() === '') {
        issues.push(err('ELEMENT_MISSING_ID', 'Each element must have a non-empty id.', ep))
      }
      if (!element.rules || element.rules.length === 0) {
        issues.push(warn('ELEMENT_NO_RULES', `Element "${element.id}" has no rules.`, `${ep}.rules`))
      }

      for (const rule of (element.rules ?? [])) {
        const rp = `${ep}.rules[${rule.id}]`
        if (!rule.id || rule.id.trim() === '') {
          issues.push(err('RULE_MISSING_ID', 'Each rule must have a non-empty id.', rp))
        }
        if (!rule.kpiKey || rule.kpiKey.trim() === '') {
          issues.push(err('RULE_MISSING_KPI', `Rule "${rule.id}" must have a kpiKey.`, `${rp}.kpiKey`))
        }
        if (!rule.metricType) {
          issues.push(err('RULE_MISSING_METRIC_TYPE', `Rule "${rule.id}" must have a metricType.`, `${rp}.metricType`))
        }
      }
    }
  }

  return result(issues)
}

// ── SECTION 3 — Weight validation ────────────────────────────

/**
 * Validates that weights at every level sum to 1.0 (±WEIGHT_TOLERANCE).
 * Weights must be positive numbers.
 */
export function validateProfileWeights(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const root = profile.root
  if (!root?.baskets?.length) return result(issues)

  // Basket weights must sum to 1.0
  const basketWeightSum = root.baskets.reduce((s, b) => s + (b.weight ?? 0), 0)
  if (Math.abs(basketWeightSum - 1.0) > WEIGHT_TOLERANCE) {
    issues.push(err(
      'BASKET_WEIGHT_SUM',
      `Basket weights must sum to 1.0 (±${WEIGHT_TOLERANCE}). Got ${basketWeightSum.toFixed(4)}.`,
      'root.baskets[*].weight',
    ))
  }

  for (const basket of root.baskets) {
    if (basket.weight <= 0) {
      issues.push(err('NEGATIVE_BASKET_WEIGHT',
        `Basket "${basket.id}" weight must be > 0. Got ${basket.weight}.`,
        `root.baskets[${basket.id}].weight`,
      ))
    }

    if (!basket.elements?.length) continue

    // Element weights within each basket must sum to 1.0
    const elemWeightSum = basket.elements.reduce((s, e) => s + (e.weight ?? 0), 0)
    if (Math.abs(elemWeightSum - 1.0) > WEIGHT_TOLERANCE) {
      issues.push(err(
        'ELEMENT_WEIGHT_SUM',
        `Element weights in basket "${basket.id}" must sum to 1.0. Got ${elemWeightSum.toFixed(4)}.`,
        `root.baskets[${basket.id}].elements[*].weight`,
      ))
    }

    for (const element of basket.elements) {
      if (element.weight <= 0) {
        issues.push(err('NEGATIVE_ELEMENT_WEIGHT',
          `Element "${element.id}" weight must be > 0. Got ${element.weight}.`,
          `root.baskets[${basket.id}].elements[${element.id}].weight`,
        ))
      }

      if (!element.rules?.length) continue

      // Rule weights within each element must sum to 1.0
      const ruleWeightSum = element.rules.reduce((s, r) => s + (r.weight ?? 0), 0)
      if (Math.abs(ruleWeightSum - 1.0) > WEIGHT_TOLERANCE) {
        issues.push(err(
          'RULE_WEIGHT_SUM',
          `Rule weights in element "${element.id}" must sum to 1.0. Got ${ruleWeightSum.toFixed(4)}.`,
          `root.baskets[${basket.id}].elements[${element.id}].rules[*].weight`,
        ))
      }

      for (const rule of element.rules) {
        if (rule.weight <= 0) {
          issues.push(err('NEGATIVE_RULE_WEIGHT',
            `Rule "${rule.id}" weight must be > 0. Got ${rule.weight}.`,
            `...rules[${rule.id}].weight`,
          ))
        }
      }
    }
  }

  return result(issues)
}

// ── SECTION 4 — Duplicate detection ──────────────────────────

/**
 * Checks for duplicate node IDs anywhere in the hierarchy,
 * and for duplicate KPI keys within the same element.
 */
export function validateProfileHierarchyUniqueness(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const allNodeIds = new Set<string>()

  function trackId(id: string, path: string) {
    if (!id) return
    if (allNodeIds.has(id)) {
      issues.push(err('DUPLICATE_NODE_ID', `Duplicate node id "${id}" found.`, path))
    } else {
      allNodeIds.add(id)
    }
  }

  const root = profile.root
  if (!root) return result(issues)

  trackId(root.id, 'root.id')

  for (const basket of (root.baskets ?? [])) {
    trackId(basket.id, `root.baskets[${basket.id}].id`)

    for (const element of (basket.elements ?? [])) {
      trackId(element.id, `root.baskets[${basket.id}].elements[${element.id}].id`)

      // Check for duplicate kpiKey within the same element
      const kpiKeysInElement = new Set<string>()
      for (const rule of (element.rules ?? [])) {
        trackId(rule.id, `...elements[${element.id}].rules[${rule.id}].id`)

        if (rule.kpiKey) {
          if (kpiKeysInElement.has(rule.kpiKey)) {
            issues.push(err(
              'DUPLICATE_KPI_KEY',
              `KPI key "${rule.kpiKey}" appears more than once in element "${element.id}".`,
              `...elements[${element.id}].rules[*].kpiKey`,
            ))
          } else {
            kpiKeysInElement.add(rule.kpiKey)
          }
        }
      }
    }
  }

  return result(issues)
}

// ── SECTION 5 — Processor pipeline validation ─────────────────

/**
 * Validates all processor steps across the profile:
 * - Type must be a recognised SupportedProcessorType
 * - Required config fields must be present
 */
export function validateProcessorPipeline(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []

  function validateSteps(steps: ProcessorStep[], path: string) {
    for (const step of (steps ?? [])) {
      if (!isSupportedProcessorType(step.processorType)) {
        issues.push(err(
          'UNSUPPORTED_PROCESSOR',
          `Unknown processor type "${step.processorType}".`,
          `${path}.processorType`,
        ))
        continue
      }

      const def = getProcessorDefinition(step.processorType)
      for (const required of def.requiredConfigFields) {
        if (step.config == null || !(required in step.config)) {
          issues.push(err(
            'MISSING_PROCESSOR_CONFIG',
            `Processor "${step.processorType}" requires config field "${required}".`,
            `${path}.config.${required}`,
          ))
        }
      }
    }
  }

  const root = profile.root
  if (!root) return result(issues)

  for (const basket of (root.baskets ?? [])) {
    if (basket.pipeline?.steps) {
      validateSteps(basket.pipeline.steps, `baskets[${basket.id}].pipeline`)
    }
    for (const element of (basket.elements ?? [])) {
      if (element.pipeline?.steps) {
        validateSteps(element.pipeline.steps, `elements[${element.id}].pipeline`)
      }
      for (const rule of (element.rules ?? [])) {
        if (rule.pipeline?.steps) {
          validateSteps(rule.pipeline.steps, `rules[${rule.id}].pipeline`)
        }
      }
    }
  }

  return result(issues)
}

// ── SECTION 6 — Threshold band validation ────────────────────

/**
 * Validates threshold bands on all rule nodes:
 * - minPct < maxPct
 * - No negative minPct
 * - Bands do not overlap
 * - Score must be 0–100
 */
export function validateThresholdBands(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []

  function validateBands(bands: ThresholdBand[], path: string) {
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]
      const bp = `${path}[${i}]`

      if (b.minPct < 0) {
        issues.push(err('BAND_NEGATIVE_MIN', `Band "${b.label}" minPct must be >= 0. Got ${b.minPct}.`, bp))
      }
      if (b.minPct >= b.maxPct) {
        issues.push(err('BAND_INVALID_RANGE', `Band "${b.label}" minPct (${b.minPct}) must be < maxPct (${b.maxPct}).`, bp))
      }
      if (b.score < 0 || b.score > 100) {
        issues.push(err('BAND_INVALID_SCORE', `Band "${b.label}" score must be 0–100. Got ${b.score}.`, `${bp}.score`))
      }
    }

    // Check for overlapping bands (sorted by minPct)
    const sorted = [...bands].sort((a, b) => a.minPct - b.minPct)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minPct < sorted[i - 1].maxPct) {
        issues.push(err(
          'BAND_OVERLAP',
          `Bands "${sorted[i - 1].label}" and "${sorted[i].label}" overlap.`,
          path,
        ))
      }
    }
  }

  const root = profile.root
  if (!root) return result(issues)

  for (const basket of (root.baskets ?? [])) {
    for (const element of (basket.elements ?? [])) {
      for (const rule of (element.rules ?? [])) {
        if (rule.thresholdBands?.length) {
          validateBands(rule.thresholdBands, `rules[${rule.id}].thresholdBands`)
        }
        // Validate cap and floor values
        if (rule.cap !== undefined) {
          if (rule.cap <= 0) {
            issues.push(err('INVALID_CAP', `Rule "${rule.id}" cap must be > 0. Got ${rule.cap}.`, `rules[${rule.id}].cap`))
          }
          if (rule.cap < 100) {
            issues.push(warn('CAP_BELOW_100', `Rule "${rule.id}" cap is below 100% — this may unintentionally suppress achievement.`, `rules[${rule.id}].cap`))
          }
        }
        if (rule.floor !== undefined && rule.floor < 0) {
          issues.push(err('INVALID_FLOOR', `Rule "${rule.id}" floor must be >= 0. Got ${rule.floor}.`, `rules[${rule.id}].floor`))
        }
        // Validate penalty processor config
        for (const step of (rule.pipeline?.steps ?? [])) {
          if (step.processorType === 'PENALTY_EVALUATOR') {
            const maxPenalty = step.config?.maxPenalty as number | undefined
            if (maxPenalty !== undefined && maxPenalty < 0) {
              issues.push(err('INVALID_PENALTY', `Rule "${rule.id}" PENALTY_EVALUATOR maxPenalty must be >= 0. Got ${maxPenalty}.`, `rules[${rule.id}].pipeline`))
            }
          }
        }
      }
    }
  }

  return result(issues)
}

// ── SECTION 7 — Effective date validation ─────────────────────

/**
 * Validates the effective date range of the profile's metadata.
 */
export function validateEffectiveDating(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const dateResult = validateEffectiveDates(profile.metadata?.validFrom, profile.metadata?.validTo)
  if (!dateResult.valid) {
    issues.push(err('INVALID_EFFECTIVE_DATES', dateResult.reason ?? 'Effective date validation failed.', 'metadata'))
  }
  return result(issues)
}

// ── SECTION 10 — Processor configuration value validation ─────

/**
 * Validates the VALUE correctness of ProcessorStep configs in the profile's
 * node pipelines. This is a deeper check than validateProcessorPipeline, which
 * only checks type presence. This validates field values (e.g. ceiling > 0,
 * overlapping bands, invalid aggregation types).
 *
 * Uses the Record<string, unknown> config format from the hierarchy types.
 */
export function validateProcessorConfigurations(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []
  const root = profile.root
  if (!root) return result(issues)

  function collectStepIssues(
    steps: import('./types').ProcessorStep[],
    path:  string,
  ) {
    for (const step of (steps ?? [])) {
      const stepIssues = validateProcessorStepConfig(step.processorType, step.config, path)
      for (const pi of stepIssues) {
        issues.push({ code: pi.code, message: pi.message, path: pi.stepId ?? path, severity: pi.severity })
      }
    }
  }

  for (const basket of (root.baskets ?? [])) {
    collectStepIssues(basket.pipeline?.steps ?? [], `baskets[${basket.id}].pipeline`)
    for (const element of (basket.elements ?? [])) {
      collectStepIssues(element.pipeline?.steps ?? [], `elements[${element.id}].pipeline`)
      for (const rule of (element.rules ?? [])) {
        collectStepIssues(rule.pipeline?.steps ?? [], `rules[${rule.id}].pipeline`)
      }
    }
  }

  return result(issues)
}

// ── SECTION 9 — Hierarchy structure validation ────────────────

/**
 * Uses the hierarchy kernel to verify structural invariants that go
 * beyond simple field checks:
 *
 *   - Every node appears at the correct depth (basket=1, element=2, rule=3)
 *   - No node id appears more than once in the flattened traversal
 *     (detects orphaned duplicates injected via unsafe casts)
 *   - Parent → child type placement is respected
 *
 * Because the data model is a nested tree (not a graph), true circular
 * references via object pointers would cause stack overflow in the
 * traversal; that case is caught by the try/catch in validateProfile.
 */
export function validateHierarchyStructure(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = []

  try {
    const nodes = flattenHierarchy(profile)

    // Depth / type-placement checks
    for (const node of nodes) {
      if (node.type === 'basket' && node.depth !== 1) {
        issues.push(err(
          'INVALID_DEPTH',
          `Basket node "${node.id}" found at depth ${node.depth}, expected 1.`,
          `node.${node.id}`,
        ))
      }
      if (node.type === 'element' && node.depth !== 2) {
        issues.push(err(
          'INVALID_DEPTH',
          `Element node "${node.id}" found at depth ${node.depth}, expected 2.`,
          `node.${node.id}`,
        ))
      }
      if (node.type === 'rule' && node.depth !== 3) {
        issues.push(err(
          'INVALID_DEPTH',
          `Rule node "${node.id}" found at depth ${node.depth}, expected 3.`,
          `node.${node.id}`,
        ))
      }
    }

    // Orphaned-duplicate detection: an id appearing more than once means the
    // same object was injected at two positions in the tree.
    const seenIds = new Map<string, number>()
    for (const node of nodes) {
      seenIds.set(node.id, (seenIds.get(node.id) ?? 0) + 1)
    }
    for (const [id, count] of seenIds.entries()) {
      if (count > 1) {
        issues.push(err(
          'ORPHANED_DUPLICATE_NODE',
          `Node id "${id}" appears ${count} times in the flattened hierarchy.`,
          `node.${id}`,
        ))
      }
    }

    // Parent–child type placement rules
    for (const node of nodes) {
      if (node.parentId === null) continue  // root
      const parentNode = nodes.find((n) => n.id === node.parentId)
      if (!parentNode) continue  // missing parent caught by uniqueness check

      if (node.type === 'basket' && parentNode.type !== 'root') {
        issues.push(err(
          'INVALID_PARENT_CHILD',
          `Basket "${node.id}" must be a child of root, not "${parentNode.type}".`,
          `node.${node.id}`,
        ))
      }
      if (node.type === 'element' && parentNode.type !== 'basket') {
        issues.push(err(
          'INVALID_PARENT_CHILD',
          `Element "${node.id}" must be a child of a basket, not "${parentNode.type}".`,
          `node.${node.id}`,
        ))
      }
      if (node.type === 'rule' && parentNode.type !== 'element') {
        issues.push(err(
          'INVALID_PARENT_CHILD',
          `Rule "${node.id}" must be a child of an element, not "${parentNode.type}".`,
          `node.${node.id}`,
        ))
      }
    }
  } catch (e) {
    issues.push(err(
      'HIERARCHY_STRUCTURE_ERROR',
      e instanceof Error ? e.message : String(e),
    ))
  }

  return result(issues)
}

// ── SECTION 8 — Combined validator ────────────────────────────

/**
 * Runs all validators and returns a merged result.
 *
 * Never throws for normal validation failures.
 * Returns { valid: false, issues: [...] } when anything fails.
 */
export function validateProfile(
  profile: EvaluationProfileDraft,
): ProfileValidationResult {
  try {
    const allIssues: ProfileValidationIssue[] = [
      ...validateProfileMetadata(profile).issues,
      ...validateProfileHierarchy(profile).issues,
      ...validateProfileHierarchyUniqueness(profile).issues,
      ...validateProfileWeights(profile).issues,
      ...validateProcessorPipeline(profile).issues,
      ...validateThresholdBands(profile).issues,
      ...validateEffectiveDating(profile).issues,
      ...validateHierarchyStructure(profile).issues,
      ...validateProcessorConfigurations(profile).issues,
    ]
    return result(allIssues)
  } catch (e) {
    // Unexpected runtime error — surface as a validation issue, never re-throw
    return {
      valid:  false,
      issues: [{
        code:     'VALIDATION_RUNTIME_ERROR',
        message:  e instanceof Error ? e.message : String(e),
        severity: 'error',
      }],
    }
  }
}
