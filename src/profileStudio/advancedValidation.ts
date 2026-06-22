// ============================================================
// Profile Studio — Advanced Validation Engine (Phase 0D)
//
// Publication-grade validation covering completeness, weight
// consistency, processor compatibility, effective dating,
// lifecycle readiness, simulation readiness, publish readiness,
// and SMARTS 2026 methodology constraints.
//
// Validation only. No simulation execution. No scoring.
// No Firestore. No React. No UI. No routes. No AI.
// ============================================================

import type {
  EvaluationProfileDraft,
  ProfileStatus,
} from './types'
import {
  RATIO_EVALUATOR, CEILING_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
  isSupportedProcessorType, getProcessorDefinition,
} from './processors'
import {
  validateProfile,
  validateProfileHierarchy,
  validateProfileWeights,
  validateProcessorPipeline,
  validateHierarchyStructure,
  validateProcessorConfigurations,
} from './validation'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Severity and result types
// ════════════════════════════════════════════════════════════

/**
 * Extended severity classification for Phase 0D validators.
 * Superset of the base `ValidationSeverity` from types.ts.
 *
 *   INFO     — informational note; not a problem
 *   WARNING  — potential issue; profile may still be used
 *   ERROR    — definite problem; profile is invalid
 *   CRITICAL — blocking problem; publish or simulation must be halted
 */
export type AdvancedSeverity = 'info' | 'warning' | 'error' | 'critical'

/** A single validation issue produced by an advanced validator. */
export interface AdvancedIssue {
  /** Machine-readable error code. */
  code:     string
  /** Human-readable description of the problem. */
  message:  string
  /** JSON path to the offending field or node (optional). */
  path?:    string
  severity: AdvancedSeverity
  /** Which validator category produced this issue. */
  category: string
}

/**
 * Result returned by validateProfileAdvanced (master validator).
 *
 *   valid          — true when no ERROR or CRITICAL issues exist
 *   issues         — all issues regardless of severity
 *   criticalIssues — subset with severity === 'critical'
 *   warnings       — subset with severity === 'warning' or 'info'
 */
export interface AdvancedValidationResult {
  valid:          boolean
  issues:         AdvancedIssue[]
  criticalIssues: AdvancedIssue[]
  warnings:       AdvancedIssue[]
}

// ── Issue builder helpers ─────────────────────────────────────

const WEIGHT_TOLERANCE = 0.01

function mkIssue(
  severity: AdvancedSeverity,
  category: string,
  code:     string,
  message:  string,
  path?:    string,
): AdvancedIssue {
  return { code, message, path, severity, category }
}

const info     = (cat: string, code: string, msg: string, path?: string) => mkIssue('info',     cat, code, msg, path)
const adWarn   = (cat: string, code: string, msg: string, path?: string) => mkIssue('warning',  cat, code, msg, path)
const adErr    = (cat: string, code: string, msg: string, path?: string) => mkIssue('error',    cat, code, msg, path)
const critical = (cat: string, code: string, msg: string, path?: string) => mkIssue('critical', cat, code, msg, path)

function advResult(issues: AdvancedIssue[]): AdvancedValidationResult {
  return {
    valid:          issues.every((i) => i.severity !== 'error' && i.severity !== 'critical'),
    issues,
    criticalIssues: issues.filter((i) => i.severity === 'critical'),
    warnings:       issues.filter((i) => i.severity === 'warning' || i.severity === 'info'),
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Profile Completeness Validation (Task 2)
// ════════════════════════════════════════════════════════════

const CAT_COMPLETENESS = 'COMPLETENESS'

/**
 * Validates that a profile has all structural fields required to
 * be considered complete. This is a lighter check than full
 * hierarchy validation — it verifies presence, not correctness.
 *
 * Checks:
 *   - profile id, name, version, status, validFrom
 *   - root node exists
 *   - at least one basket
 *   - each basket has at least one element
 *   - each element has a processor pipeline
 */
export function validateProfileCompleteness(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_COMPLETENESS

  try {
    const m = profile?.metadata
    if (!m) {
      issues.push(critical(C, 'MISSING_METADATA', 'Profile metadata is missing entirely.'))
      return advResult(issues)
    }

    if (!m.id || m.id.trim() === '') {
      issues.push(adErr(C, 'MISSING_PROFILE_ID', 'Profile must have a non-empty id.', 'metadata.id'))
    }
    if (!m.name || m.name.trim() === '') {
      issues.push(adErr(C, 'MISSING_PROFILE_NAME', 'Profile must have a non-empty name.', 'metadata.name'))
    }
    if (!m.version || m.version.trim() === '') {
      issues.push(adErr(C, 'MISSING_PROFILE_VERSION', 'Profile must have a version string.', 'metadata.version'))
    }
    if (!m.status) {
      issues.push(critical(C, 'MISSING_PROFILE_STATUS', 'Profile must have a status.', 'metadata.status'))
    }
    if (!m.validFrom || m.validFrom.trim() === '') {
      issues.push(adErr(C, 'MISSING_VALID_FROM', 'Profile must have a validFrom date.', 'metadata.validFrom'))
    }

    const root = profile.root
    if (!root) {
      issues.push(critical(C, 'MISSING_ROOT_NODE', 'Profile must have a root node.', 'root'))
      return advResult(issues)
    }

    if (!root.baskets || root.baskets.length === 0) {
      issues.push(critical(C, 'EMPTY_PROFILE', 'Profile has no baskets — it is empty and cannot be evaluated.', 'root.baskets'))
      return advResult(issues)
    }

    for (const basket of root.baskets) {
      const bp = `root.baskets[${basket.id}]`
      if (!basket.elements || basket.elements.length === 0) {
        issues.push(adErr(C, 'BASKET_MISSING_ELEMENTS',
          `Basket "${basket.id}" has no elements.`, `${bp}.elements`))
        continue
      }
      for (const element of basket.elements) {
        const ep = `${bp}.elements[${element.id}]`
        const hasPipeline = element.pipeline && Array.isArray(element.pipeline.steps)
        if (!hasPipeline) {
          issues.push(adWarn(C, 'ELEMENT_MISSING_PIPELINE',
            `Element "${element.id}" has no processor pipeline defined.`, `${ep}.pipeline`))
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'COMPLETENESS_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Weight Consistency Validation (Task 3)
// ════════════════════════════════════════════════════════════

const CAT_WEIGHTS = 'WEIGHT_CONSISTENCY'

/**
 * Deep weight validation:
 *   - Negative weights are an ERROR
 *   - Zero weights are an ERROR
 *   - Basket weights must sum to 1.0 (CRITICAL — blocks evaluation)
 *   - Element weights per basket must sum to 1.0 (CRITICAL)
 *   - Rule weights per element must sum to 1.0 (ERROR)
 *   - Overweight / underweight detected with specific codes
 *   - Duplicate weights are allowed (not flagged)
 *   - Rule weights are optional — only validated when rules exist
 */
export function validateWeightConsistency(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_WEIGHTS

  try {
    const root = profile?.root
    if (!root?.baskets?.length) return advResult(issues)

    // ── Basket level ──────────────────────────────────────────
    const basketSum = root.baskets.reduce((s, b) => s + (b.weight ?? 0), 0)

    if (basketSum > 1.0 + WEIGHT_TOLERANCE) {
      issues.push(critical(C, 'BASKET_OVERWEIGHT',
        `Basket weights sum to ${basketSum.toFixed(4)}, exceeding 1.0 — evaluation will be inflated.`,
        'root.baskets[*].weight'))
    } else if (basketSum < 1.0 - WEIGHT_TOLERANCE) {
      issues.push(critical(C, 'BASKET_UNDERWEIGHT',
        `Basket weights sum to ${basketSum.toFixed(4)}, below 1.0 — evaluation will be deflated.`,
        'root.baskets[*].weight'))
    }

    for (const basket of root.baskets) {
      const bp = `root.baskets[${basket.id}].weight`
      if (basket.weight < 0) {
        issues.push(adErr(C, 'NEGATIVE_BASKET_WEIGHT',
          `Basket "${basket.id}" has a negative weight (${basket.weight}).`, bp))
      } else if (basket.weight === 0) {
        issues.push(adErr(C, 'ZERO_BASKET_WEIGHT',
          `Basket "${basket.id}" has a zero weight — it will contribute nothing to the score.`, bp))
      }

      if (!basket.elements?.length) continue

      // ── Element level ───────────────────────────────────────
      const elemSum = basket.elements.reduce((s, e) => s + (e.weight ?? 0), 0)

      if (elemSum > 1.0 + WEIGHT_TOLERANCE) {
        issues.push(critical(C, 'ELEMENT_OVERWEIGHT',
          `Element weights in basket "${basket.id}" sum to ${elemSum.toFixed(4)}, exceeding 1.0.`,
          `root.baskets[${basket.id}].elements[*].weight`))
      } else if (elemSum < 1.0 - WEIGHT_TOLERANCE) {
        issues.push(critical(C, 'ELEMENT_UNDERWEIGHT',
          `Element weights in basket "${basket.id}" sum to ${elemSum.toFixed(4)}, below 1.0.`,
          `root.baskets[${basket.id}].elements[*].weight`))
      }

      for (const element of basket.elements) {
        const ep = `root.baskets[${basket.id}].elements[${element.id}].weight`
        if (element.weight < 0) {
          issues.push(adErr(C, 'NEGATIVE_ELEMENT_WEIGHT',
            `Element "${element.id}" has a negative weight (${element.weight}).`, ep))
        } else if (element.weight === 0) {
          issues.push(adErr(C, 'ZERO_ELEMENT_WEIGHT',
            `Element "${element.id}" has a zero weight.`, ep))
        }

        if (!element.rules?.length) continue

        // ── Rule level ────────────────────────────────────────
        const ruleSum = element.rules.reduce((s, r) => s + (r.weight ?? 0), 0)
        if (Math.abs(ruleSum - 1.0) > WEIGHT_TOLERANCE) {
          issues.push(adErr(C, 'RULE_WEIGHT_IMBALANCE',
            `Rule weights in element "${element.id}" sum to ${ruleSum.toFixed(4)}, expected 1.0.`,
            `...elements[${element.id}].rules[*].weight`))
        }

        for (const rule of element.rules) {
          const rp = `...rules[${rule.id}].weight`
          if (rule.weight < 0) {
            issues.push(adErr(C, 'NEGATIVE_RULE_WEIGHT',
              `Rule "${rule.id}" has a negative weight (${rule.weight}).`, rp))
          } else if (rule.weight === 0) {
            issues.push(adErr(C, 'ZERO_RULE_WEIGHT',
              `Rule "${rule.id}" has a zero weight.`, rp))
          }
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'WEIGHT_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Processor Compatibility Validation (Task 4)
// ════════════════════════════════════════════════════════════

const CAT_COMPAT = 'PROCESSOR_COMPATIBILITY'

/**
 * Validates that processor combinations and ordering within each
 * pipeline node are compatible at the methodology level.
 *
 * Rules checked for each pipeline:
 *   - ZERO_TARGET_GUARD must appear before RATIO_EVALUATOR
 *   - RATIO_EVALUATOR must appear before BAND_EVALUATOR
 *   - CEILING_CLAMP must appear before WEIGHT_MULTIPLIER
 *   - NODE_AGGREGATOR cannot be the first enabled step
 *   - PENALTY_EVALUATOR requires penaltyRules in its config
 *   - BAND_EVALUATOR requires bands in its config and bands must be ordered
 *   - Invalid (unrecognised) processor types are flagged as CRITICAL
 */
export function validateProcessorCompatibility(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_COMPAT

  try {
    const root = profile?.root
    if (!root) return advResult(issues)

    function checkPipeline(steps: Array<{ processorType: string; config: Record<string, unknown> }>, path: string) {
      if (!steps?.length) return

      // Validate each step's type
      for (const step of steps) {
        if (!isSupportedProcessorType(step.processorType as any)) {
          issues.push(critical(C, 'UNSUPPORTED_PROCESSOR_TYPE',
            `Unrecognised processor type "${step.processorType}" in pipeline.`,
            `${path}.processorType`))
          return  // can't do ordering checks with unknown types
        }
      }

      // Build sorted position list (all steps, for compatibility checks)
      const sorted = [...steps].sort((a, b) =>
        ((a as any).order ?? 0) - ((b as any).order ?? 0),
      )
      const positions = new Map<string, number[]>()
      sorted.forEach((s, idx) => {
        const arr = positions.get(s.processorType) ?? []
        arr.push(idx)
        positions.set(s.processorType, arr)
      })

      const firstPos = (type: string) => positions.get(type)?.[0] ?? -1
      const lastPos  = (type: string) => {
        const arr = positions.get(type)
        return arr ? arr[arr.length - 1] : -1
      }

      // ZERO_TARGET_GUARD before RATIO_EVALUATOR
      if (lastPos(ZERO_TARGET_GUARD) !== -1 && firstPos(RATIO_EVALUATOR) !== -1) {
        if (lastPos(ZERO_TARGET_GUARD) >= firstPos(RATIO_EVALUATOR)) {
          issues.push(adErr(C, 'COMPAT_ZERO_BEFORE_RATIO',
            `ZERO_TARGET_GUARD must appear before RATIO_EVALUATOR in pipeline at "${path}".`, path))
        }
      }

      // RATIO_EVALUATOR before BAND_EVALUATOR
      if (lastPos(RATIO_EVALUATOR) !== -1 && firstPos(BAND_EVALUATOR) !== -1) {
        if (firstPos(BAND_EVALUATOR) <= lastPos(RATIO_EVALUATOR)) {
          issues.push(adErr(C, 'COMPAT_RATIO_BEFORE_BAND',
            `RATIO_EVALUATOR must appear before BAND_EVALUATOR in pipeline at "${path}".`, path))
        }
      }

      // CEILING_CLAMP before WEIGHT_MULTIPLIER
      if (lastPos(CEILING_CLAMP) !== -1 && firstPos(WEIGHT_MULTIPLIER) !== -1) {
        if (lastPos(CEILING_CLAMP) >= firstPos(WEIGHT_MULTIPLIER)) {
          issues.push(adErr(C, 'COMPAT_CEILING_BEFORE_WEIGHT',
            `CEILING_CLAMP must appear before WEIGHT_MULTIPLIER in pipeline at "${path}".`, path))
        }
      }

      // NODE_AGGREGATOR cannot be first
      if (firstPos(NODE_AGGREGATOR) === 0) {
        issues.push(adErr(C, 'COMPAT_AGGREGATOR_NOT_FIRST',
          `NODE_AGGREGATOR cannot be the first step in pipeline at "${path}".`, path))
      }

      // PENALTY_EVALUATOR requires penaltyRules
      for (const step of steps) {
        if (step.processorType === PENALTY_EVALUATOR) {
          const rules = step.config?.penaltyRules as unknown[] | undefined
          if (!Array.isArray(rules) || rules.length === 0) {
            issues.push(adErr(C, 'COMPAT_PENALTY_MISSING_RULES',
              `PENALTY_EVALUATOR at "${path}" has no penaltyRules configured.`, path))
          }
        }

        // BAND_EVALUATOR requires ordered bands
        if (step.processorType === BAND_EVALUATOR) {
          const bands = step.config?.bands as Array<{ minPct: number; maxPct: number }> | undefined
          if (!Array.isArray(bands) || bands.length === 0) {
            issues.push(adErr(C, 'COMPAT_BAND_MISSING_BANDS',
              `BAND_EVALUATOR at "${path}" has no bands configured.`, path))
          } else {
            const sorted2 = [...bands].sort((a, b) => a.minPct - b.minPct)
            for (let i = 1; i < sorted2.length; i++) {
              if (sorted2[i].minPct < sorted2[i - 1].maxPct) {
                issues.push(adErr(C, 'COMPAT_BAND_UNORDERED',
                  `BAND_EVALUATOR at "${path}" has overlapping or unordered bands.`, path))
                break
              }
            }
          }
        }
      }
    }

    for (const basket of (root.baskets ?? [])) {
      if (basket.pipeline?.steps?.length) {
        checkPipeline(basket.pipeline.steps as any, `baskets[${basket.id}].pipeline`)
      }
      for (const element of (basket.elements ?? [])) {
        if (element.pipeline?.steps?.length) {
          checkPipeline(element.pipeline.steps as any, `elements[${element.id}].pipeline`)
        }
        for (const rule of (element.rules ?? [])) {
          if (rule.pipeline?.steps?.length) {
            checkPipeline(rule.pipeline.steps as any, `rules[${rule.id}].pipeline`)
          }
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'COMPAT_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Effective Dating Validation (Task 5)
// ════════════════════════════════════════════════════════════

const CAT_DATING = 'EFFECTIVE_DATING'

/** Tests whether a string parses to a valid non-NaN Date. */
function isValidDate(s: string | undefined): boolean {
  if (!s) return false
  const d = new Date(s)
  return !isNaN(d.getTime())
}

/**
 * Extended effective date validation:
 *   - validFrom must be present and a valid date
 *   - When validTo is present, validTo > validFrom
 *   - PUBLISHED profiles require validFrom
 *   - ARCHIVED profiles: expired validTo is permitted (no error)
 *   - Future validFrom is allowed (INFO)
 *   - Past validTo on non-ARCHIVED profiles is a WARNING
 */
export function validateEffectiveDatingRules(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_DATING

  try {
    const m      = profile?.metadata
    if (!m) return advResult(issues)

    const status  = m.status as ProfileStatus | undefined
    const from    = m.validFrom
    const to      = m.validTo
    const today   = new Date()

    if (!from || from.trim() === '') {
      if (status === 'PUBLISHED') {
        issues.push(critical(C, 'PUBLISHED_MISSING_VALID_FROM',
          'Published profiles must have a validFrom date.', 'metadata.validFrom'))
      } else {
        issues.push(adErr(C, 'MISSING_VALID_FROM',
          'Profile must have a validFrom date.', 'metadata.validFrom'))
      }
    } else {
      if (!isValidDate(from)) {
        issues.push(adErr(C, 'INVALID_VALID_FROM',
          `validFrom "${from}" is not a valid date.`, 'metadata.validFrom'))
      } else {
        const fromDate = new Date(from)
        if (fromDate > today) {
          issues.push(info(C, 'FUTURE_VALID_FROM',
            `validFrom "${from}" is in the future — the profile will not be active until then.`,
            'metadata.validFrom'))
        }
      }
    }

    if (to !== undefined) {
      if (!isValidDate(to)) {
        issues.push(adErr(C, 'INVALID_VALID_TO',
          `validTo "${to}" is not a valid date.`, 'metadata.validTo'))
      } else if (isValidDate(from)) {
        const fromDate = new Date(from!)
        const toDate   = new Date(to)

        if (toDate <= fromDate) {
          issues.push(adErr(C, 'VALID_TO_BEFORE_FROM',
            `validTo "${to}" must be after validFrom "${from}".`, 'metadata.validTo'))
        }

        const isExpired = toDate < today
        if (isExpired && status !== 'ARCHIVED') {
          issues.push(adWarn(C, 'EXPIRED_VALID_TO',
            `validTo "${to}" is in the past. Profile may need to be archived.`,
            'metadata.validTo'))
        }
        // ARCHIVED profiles with expired validTo — no warning emitted
        if (isExpired && status === 'ARCHIVED') {
          issues.push(info(C, 'ARCHIVED_EXPIRED',
            `Archived profile has an expired validTo "${to}" — this is expected and acceptable.`,
            'metadata.validTo'))
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'DATING_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — Lifecycle Readiness Validation (Task 6)
// ════════════════════════════════════════════════════════════

const CAT_LIFECYCLE = 'LIFECYCLE_READINESS'

/**
 * Validates that the profile's current status matches the expected
 * level of readiness. Each status has minimum requirements.
 *
 *   DRAFT     — minimum checks: id + name
 *   VALIDATED — must pass hierarchy structure validation
 *   SIMULATED — must pass processor pipeline validation
 *   APPROVED  — must pass all base validations
 *   PUBLISHED — must pass publish readiness
 *   ARCHIVED  — skip readiness checks (always fine)
 */
export function validateLifecycleReadiness(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_LIFECYCLE

  try {
    const m      = profile?.metadata
    const status = m?.status as ProfileStatus | undefined

    if (!status) {
      issues.push(critical(C, 'LIFECYCLE_MISSING_STATUS', 'Profile has no status — lifecycle readiness cannot be determined.'))
      return advResult(issues)
    }

    // ARCHIVED: terminal state — skip all readiness checks
    if (status === 'ARCHIVED') {
      issues.push(info(C, 'LIFECYCLE_ARCHIVED',
        'Profile is archived — readiness checks are skipped for archived profiles.'))
      return advResult(issues)
    }

    // DRAFT: just needs id + name
    const hasId   = !!m?.id?.trim()
    const hasName = !!m?.name?.trim()
    if (!hasId) {
      issues.push(adErr(C, 'DRAFT_MISSING_ID',
        'Profile must have an id even in DRAFT status.', 'metadata.id'))
    }
    if (!hasName) {
      issues.push(adErr(C, 'DRAFT_MISSING_NAME',
        'Profile must have a name even in DRAFT status.', 'metadata.name'))
    }

    if (status === 'DRAFT') return advResult(issues)

    // VALIDATED and above: must pass hierarchy structure
    const hierResult = validateHierarchyStructure(profile)
    if (!hierResult.valid) {
      const hierErrors = hierResult.issues.filter((i) => i.severity === 'error')
      for (const issue of hierErrors) {
        issues.push(adErr(C, 'VALIDATED_HIERARCHY_FAILED',
          `Hierarchy structure invalid for VALIDATED status: ${issue.message}`, issue.path))
      }
    }

    const hierBase = validateProfileHierarchy(profile)
    if (!hierBase.valid) {
      const hierErrors = hierBase.issues.filter((i) => i.severity === 'error')
      for (const issue of hierErrors) {
        issues.push(adErr(C, 'VALIDATED_HIERARCHY_BASE_FAILED',
          `Hierarchy validation failed for VALIDATED status: ${issue.message}`, issue.path))
      }
    }

    if (status === 'VALIDATED') return advResult(issues)

    // SIMULATED and above: must pass processor validation
    const procResult = validateProcessorPipeline(profile)
    if (!procResult.valid) {
      const procErrors = procResult.issues.filter((i) => i.severity === 'error')
      for (const issue of procErrors) {
        issues.push(adErr(C, 'SIMULATED_PROCESSOR_FAILED',
          `Processor pipeline invalid for SIMULATED status: ${issue.message}`, issue.path))
      }
    }

    if (status === 'SIMULATED') return advResult(issues)

    // APPROVED and above: must pass all base validations
    const fullResult = validateProfile(profile)
    if (!fullResult.valid) {
      const fullErrors = fullResult.issues.filter((i) => i.severity === 'error')
      for (const issue of fullErrors) {
        issues.push(critical(C, 'APPROVED_FULL_VALIDATION_FAILED',
          `Full validation failed for APPROVED status: ${issue.message}`, issue.path))
      }
    }

    if (status === 'APPROVED') return advResult(issues)

    // PUBLISHED: must also pass publish readiness
    if (status === 'PUBLISHED') {
      const pubResult = validatePublishReadiness(profile)
      if (!pubResult.valid) {
        for (const issue of pubResult.criticalIssues) {
          issues.push(critical(C, 'PUBLISHED_READINESS_FAILED',
            `Publish readiness failed: ${issue.message}`, issue.path))
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'LIFECYCLE_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 7 — Simulation Readiness Validation (Task 7)
// ════════════════════════════════════════════════════════════

const CAT_SIMULATION = 'SIMULATION_READINESS'

/**
 * Pre-simulation gate: verifies the profile can be safely simulated.
 * No execution happens here — pure structural/config checks.
 *
 * Required:
 *   - All processors valid (type recognised + config fields present)
 *   - Weights valid at all levels
 *   - At least one basket and at least one element
 *   - No duplicate node IDs
 *   - effective dates valid (validFrom must be present)
 */
export function validateSimulationReadiness(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_SIMULATION

  try {
    // effective dates — validFrom required
    const from = profile?.metadata?.validFrom
    if (!from || from.trim() === '') {
      issues.push(critical(C, 'SIM_MISSING_VALID_FROM',
        'Simulation requires a validFrom date on the profile.', 'metadata.validFrom'))
    }

    // Must have at least one basket
    const root = profile?.root
    if (!root?.baskets?.length) {
      issues.push(critical(C, 'SIM_NO_BASKETS',
        'Profile must have at least one basket to be simulated.', 'root.baskets'))
      return advResult(issues)
    }

    // Must have at least one element
    const totalElements = root.baskets.reduce((s, b) => s + (b.elements?.length ?? 0), 0)
    if (totalElements === 0) {
      issues.push(critical(C, 'SIM_NO_ELEMENTS',
        'Profile must have at least one element to be simulated.', 'root.baskets[*].elements'))
    }

    // All processors must be valid types
    const procResult = validateProcessorPipeline(profile)
    if (!procResult.valid) {
      for (const issue of procResult.issues.filter((i) => i.severity === 'error')) {
        issues.push(critical(C, 'SIM_INVALID_PROCESSOR',
          `Processor issue blocks simulation: ${issue.message}`, issue.path))
      }
    }

    // Weights must be valid
    const weightResult = validateProfileWeights(profile)
    if (!weightResult.valid) {
      for (const issue of weightResult.issues.filter((i) => i.severity === 'error')) {
        issues.push(critical(C, 'SIM_INVALID_WEIGHTS',
          `Weight issue blocks simulation: ${issue.message}`, issue.path))
      }
    }

    // No duplicate IDs
    const allIds = new Set<string>()
    const dupIds = new Set<string>()
    for (const basket of root.baskets) {
      for (const id of [basket.id, ...(basket.elements?.flatMap((e) => [e.id, ...(e.rules?.map((r) => r.id) ?? [])]) ?? [])]) {
        if (id && allIds.has(id)) dupIds.add(id)
        if (id) allIds.add(id)
      }
    }
    if (dupIds.size > 0) {
      issues.push(critical(C, 'SIM_DUPLICATE_NODE_IDS',
        `Duplicate node IDs found: ${[...dupIds].join(', ')} — simulation results would be ambiguous.`))
    }

    // Processor config value validation
    const configResult = validateProcessorConfigurations(profile)
    if (!configResult.valid) {
      for (const issue of configResult.issues.filter((i) => i.severity === 'error')) {
        issues.push(adErr(C, 'SIM_INVALID_CONFIG_VALUE',
          `Config issue blocks simulation: ${issue.message}`, issue.path))
      }
    }
  } catch (e) {
    issues.push(critical(C, 'SIM_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 8 — Publish Readiness Validation (Task 8)
// ════════════════════════════════════════════════════════════

const CAT_PUBLISH = 'PUBLISH_READINESS'

/**
 * Publication gate: verifies the profile is ready to be published.
 * No publishing happens here — returns issues only.
 *
 * Required:
 *   - status must be APPROVED (not DRAFT, VALIDATED, SIMULATED, or ARCHIVED)
 *   - all base validations must pass (no critical issues)
 *   - profile must not be ARCHIVED
 *   - validFrom must be present
 *   - version must be present and well-formed
 */
export function validatePublishReadiness(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_PUBLISH

  try {
    const m      = profile?.metadata
    const status = m?.status as ProfileStatus | undefined

    if (status === 'ARCHIVED') {
      issues.push(critical(C, 'PUBLISH_ARCHIVED',
        'Archived profiles cannot be published.', 'metadata.status'))
      return advResult(issues)
    }

    if (status !== 'APPROVED') {
      issues.push(critical(C, 'PUBLISH_STATUS_NOT_APPROVED',
        `Profile must be in APPROVED status to publish. Current status: "${status ?? 'unknown'}".`,
        'metadata.status'))
    }

    if (!m?.validFrom || m.validFrom.trim() === '') {
      issues.push(critical(C, 'PUBLISH_MISSING_VALID_FROM',
        'Published profiles require a validFrom date.', 'metadata.validFrom'))
    }

    if (!m?.version || m.version.trim() === '' || !/^\d+\.\d+\.\d+$/.test(m.version)) {
      issues.push(critical(C, 'PUBLISH_INVALID_VERSION',
        'Published profiles require a valid semver version (major.minor.patch).', 'metadata.version'))
    }

    // Run full validation — any error blocks publish
    const fullResult = validateProfile(profile)
    const criticals  = fullResult.issues.filter((i) => i.severity === 'error')
    if (criticals.length > 0) {
      issues.push(critical(C, 'PUBLISH_VALIDATION_ERRORS',
        `${criticals.length} validation error(s) must be resolved before publishing.`))
    }

    // Weight consistency is a publish blocker
    const weightResult = validateWeightConsistency(profile)
    for (const issue of weightResult.criticalIssues) {
      issues.push(critical(C, 'PUBLISH_WEIGHT_CRITICAL',
        `Weight critical issue blocks publish: ${issue.message}`, issue.path))
    }
  } catch (e) {
    issues.push(critical(C, 'PUBLISH_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 9 — SMARTS 2026 Constraint Validation (Task 9)
// ════════════════════════════════════════════════════════════

const CAT_SMARTS = 'SMARTS_CONSTRAINTS'

/**
 * Validates SMARTS 2026 methodology-level constraints.
 * These are rules derived from the scoring methodology, not the
 * data model structure. No KPI names are hardcoded.
 *
 * Rules:
 *   - Core basket weights must be positive (> 0)
 *   - All basket weights must sum to exactly 1.0 (± tolerance)
 *   - Element weights per basket must sum to 1.0 (± tolerance)
 *   - Cap values (when present) should be > 100 — values ≤ 100 are WARNING
 *   - Penalty maxPenalty must be >= 0 (negative is invalid)
 *   - Band ranges within any BAND_EVALUATOR must be ordered (minPct < maxPct)
 *   - All processor types used must be deterministic (checked via definition)
 */
export function validateSmartsConstraints(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  const issues: AdvancedIssue[] = []
  const C = CAT_SMARTS

  try {
    const root = profile?.root
    if (!root) return advResult(issues)

    // ── Basket weight positivity and sum ──────────────────────
    const baskets = root.baskets ?? []
    const bSum    = baskets.reduce((s, b) => s + (b.weight ?? 0), 0)

    if (Math.abs(bSum - 1.0) > WEIGHT_TOLERANCE) {
      issues.push(critical(C, 'SMARTS_BASKET_SUM',
        `SMARTS requires basket weights to sum to 1.0. Got ${bSum.toFixed(4)}.`,
        'root.baskets[*].weight'))
    }

    for (const basket of baskets) {
      if (typeof basket.weight !== 'number' || basket.weight <= 0) {
        issues.push(critical(C, 'SMARTS_BASKET_WEIGHT_POSITIVE',
          `SMARTS requires positive basket weights. Basket "${basket.id}" has weight ${basket.weight}.`,
          `root.baskets[${basket.id}].weight`))
      }

      // Element weight sum per basket
      if (basket.elements?.length) {
        const eSum = basket.elements.reduce((s, e) => s + (e.weight ?? 0), 0)
        if (Math.abs(eSum - 1.0) > WEIGHT_TOLERANCE) {
          issues.push(critical(C, 'SMARTS_ELEMENT_SUM',
            `SMARTS requires element weights in basket "${basket.id}" to sum to 1.0. Got ${eSum.toFixed(4)}.`,
            `root.baskets[${basket.id}].elements[*].weight`))
        }

        for (const element of basket.elements) {
          if (typeof element.weight !== 'number' || element.weight <= 0) {
            issues.push(critical(C, 'SMARTS_ELEMENT_WEIGHT_POSITIVE',
              `SMARTS requires positive element weights. Element "${element.id}" has weight ${element.weight}.`,
              `...elements[${element.id}].weight`))
          }

          for (const rule of (element.rules ?? [])) {
            // Cap validation
            if (rule.cap !== undefined) {
              if (rule.cap <= 0) {
                issues.push(adErr(C, 'SMARTS_INVALID_CAP',
                  `SMARTS cap must be > 0. Rule "${rule.id}" cap = ${rule.cap}.`,
                  `...rules[${rule.id}].cap`))
              } else if (rule.cap <= 100) {
                issues.push(adWarn(C, 'SMARTS_CAP_SUPPRESSES',
                  `SMARTS: cap of ${rule.cap}% on rule "${rule.id}" is ≤ 100% — this suppresses achievement.`,
                  `...rules[${rule.id}].cap`))
              }
            }

            // Penalty maxPenalty validation
            for (const step of (rule.pipeline?.steps ?? [])) {
              if (step.processorType === PENALTY_EVALUATOR) {
                const mp = step.config?.maxPenalty as number | undefined
                if (mp !== undefined && mp < 0) {
                  issues.push(adErr(C, 'SMARTS_NEGATIVE_PENALTY',
                    `SMARTS: PENALTY_EVALUATOR on rule "${rule.id}" has negative maxPenalty ${mp}.`,
                    `...rules[${rule.id}].pipeline`))
                }
              }

              // Band range ordering
              if (step.processorType === BAND_EVALUATOR) {
                const bands = step.config?.bands as Array<{ minPct: number; maxPct: number }> | undefined
                if (Array.isArray(bands)) {
                  for (let i = 0; i < bands.length; i++) {
                    const b = bands[i]
                    if (b.minPct >= b.maxPct) {
                      issues.push(adErr(C, 'SMARTS_BAND_UNORDERED',
                        `SMARTS: band at index ${i} on rule "${rule.id}" has minPct (${b.minPct}) >= maxPct (${b.maxPct}).`,
                        `...rules[${rule.id}].pipeline`))
                    }
                  }
                }
              }

              // Deterministic processors only
              if (isSupportedProcessorType(step.processorType as any)) {
                const def = getProcessorDefinition(step.processorType as any)
                if (!def.deterministic) {
                  issues.push(adWarn(C, 'SMARTS_NON_DETERMINISTIC',
                    `SMARTS: processor "${step.processorType}" on rule "${rule.id}" is non-deterministic — results may vary.`,
                    `...rules[${rule.id}].pipeline`))
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    issues.push(critical(C, 'SMARTS_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return advResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 10 — Master Validator (Task 10)
// ════════════════════════════════════════════════════════════

/**
 * Master advanced validator.
 *
 * Combines all eight advanced validators into a single unified result:
 *   1. validateProfileCompleteness
 *   2. validateWeightConsistency
 *   3. validateProcessorCompatibility
 *   4. validateEffectiveDatingRules
 *   5. validateLifecycleReadiness
 *   6. validateSimulationReadiness
 *   7. validatePublishReadiness
 *   8. validateSmartsConstraints
 *
 * Returns:
 *   valid          — true when no error-or-critical issues found
 *   issues         — all issues across all validators
 *   criticalIssues — subset with severity === 'critical'
 *   warnings       — subset with severity === 'warning' | 'info'
 *
 * Never throws.
 */
export function validateProfileAdvanced(
  profile: EvaluationProfileDraft,
): AdvancedValidationResult {
  try {
    const status = profile?.metadata?.status

    // Publish readiness is only blocking for APPROVED/PUBLISHED profiles.
    // For earlier statuses, include the issues as advisory (info) so they
    // appear in the result without marking the overall profile invalid.
    const rawPubIssues = validatePublishReadiness(profile).issues
    const pubIssues: AdvancedIssue[] =
      status === 'APPROVED' || status === 'PUBLISHED'
        ? rawPubIssues
        : rawPubIssues.map((i) => ({ ...i, severity: 'info' as AdvancedSeverity }))

    // Simulation readiness is only blocking for SIMULATED/APPROVED/PUBLISHED.
    const rawSimIssues = validateSimulationReadiness(profile).issues
    const simIssues: AdvancedIssue[] =
      status === 'SIMULATED' || status === 'APPROVED' || status === 'PUBLISHED'
        ? rawSimIssues
        : rawSimIssues.map((i) => ({ ...i, severity: 'info' as AdvancedSeverity }))

    const allIssues: AdvancedIssue[] = [
      ...validateProfileCompleteness(profile).issues,
      ...validateWeightConsistency(profile).issues,
      ...validateProcessorCompatibility(profile).issues,
      ...validateEffectiveDatingRules(profile).issues,
      ...validateLifecycleReadiness(profile).issues,
      ...simIssues,
      ...pubIssues,
      ...validateSmartsConstraints(profile).issues,
    ]

    return advResult(allIssues)
  } catch (e) {
    const issue = critical('MASTER', 'MASTER_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e))
    return {
      valid:          false,
      issues:         [issue],
      criticalIssues: [issue],
      warnings:       [],
    }
  }
}
