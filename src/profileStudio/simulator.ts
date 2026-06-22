// ============================================================
// Profile Studio — Simulator Kernel (Phase 0E)
//
// Isolated sandbox simulator that executes draft profile pipelines
// against sample input data and produces calculation traces.
//
// IMPORTANT:
//   This simulator is for Profile Studio sandbox only.
//   It does NOT replace or modify Evaluation Engine V2.
//   No production engine imports. No Firestore. No React.
//   No UI. No routes. No AI. No Excel import.
// ============================================================

import type {
  EvaluationProfileDraft,
  ProcessorStep,
  RuleNode,
  ElementNode,
  BasketNode,
} from './types'
import {
  RATIO_EVALUATOR, CEILING_CLAMP, FLOOR_CLAMP, WEIGHT_MULTIPLIER,
  BAND_EVALUATOR, PENALTY_EVALUATOR, NODE_AGGREGATOR, ZERO_TARGET_GUARD,
} from './processors'
import { validateSimulationReadiness } from './advancedValidation'
import {
  createProcessorTrace,
  createRuleSimTrace,
  createElementSimTrace,
  createBasketSimTrace,
  createProfileSimTrace,
} from './simulationTrace'
import type {
  SimStepTrace,
  RuleSimTrace,
  ElementSimTrace,
  BasketSimTrace,
  ProfileSimTrace,
} from './simulationTrace'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Public input / output types
// ════════════════════════════════════════════════════════════

/** Optional runtime context attached to a simulation run. */
export interface StudioSimulationContext {
  month?:       string
  pharmacyId?:  string
  pharmacistId?: string
  /** Fractional day progress (0–1), for partial-month simulations. */
  dayProgress?: number
  metadata?:    Record<string, unknown>
}

/** Input for a Profile Studio sandbox simulation. */
export interface StudioSimulationInput {
  profile:   EvaluationProfileDraft
  /** KPI actual values keyed by kpiKey. Missing keys default to 0. */
  actuals:   Record<string, number>
  /** KPI target values keyed by kpiKey. Missing keys default to 0. */
  targets:   Record<string, number>
  context?:  StudioSimulationContext
}

/** Simulation result for a single rule. */
export interface RuleSimResult {
  ruleId:            string
  kpiKey:            string
  actual:            number
  target:            number
  achievement:       number     // raw % (0–200+ before caps)
  cappedAchievement: number     // after ceiling / floor clamps
  score:             number     // 0–100 rule score
  weightedScore:     number     // cappedAchievement/100 × configuredWeight (trace)
  zeroTarget:        boolean
  bandLabel?:        string
  penaltyApplied:    number
  issues:            string[]
  trace:             RuleSimTrace
}

/** Simulation result for an element node. */
export interface ElementSimResult {
  elementId:            string
  label:                string
  score:                number
  weight:               number
  weightedContribution: number  // score × weight
  rules:                RuleSimResult[]
  issues:               string[]
  trace:                ElementSimTrace
}

/** Simulation result for a basket node. */
export interface BasketSimResult {
  basketId:             string
  label:                string
  score:                number
  weight:               number
  weightedContribution: number
  elements:             ElementSimResult[]
  issues:               string[]
  trace:                BasketSimTrace
}

/** Top-level result returned by simulateProfile. */
export interface StudioSimulationResult {
  profileId:      string
  profileVersion: string
  valid:          boolean
  score:          number    // 0–100 overall profile score
  baskets:        Record<string, BasketSimResult>
  elements:       Record<string, ElementSimResult>
  traces:         ProfileSimTrace
  issues:         string[]
}

/** Comparison result returned by compareSimulationResults. */
export interface BasketDelta {
  basketId: string
  before:   number
  after:    number
  delta:    number
}

export interface ElementDelta {
  elementId: string
  before:    number
  after:     number
  delta:     number
}

export interface BandChange {
  ruleId:    string
  kpiKey:    string
  bandBefore: string | undefined
  bandAfter:  string | undefined
}

export interface SimulationComparison {
  scoreDelta:    number
  basketDeltas:  BasketDelta[]
  elementDeltas: ElementDelta[]
  changedBands:  BandChange[]
  changedIssues: { added: string[]; removed: string[] }
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Internal step state
// ════════════════════════════════════════════════════════════

interface StepState {
  actual:            number
  target:            number
  achievement:       number
  cappedAchievement: number
  score:             number
  weightedScore:     number
  zeroTarget:        boolean
  bandLabel:         string | undefined
  penaltyApplied:    number
  bandRan:           boolean
  penaltyRan:        boolean
  childScores:       number[]
  childWeights:      number[]
  issues:            string[]
  stepTraces:        SimStepTrace[]
}

// ── Safety utilities ──────────────────────────────────────────

/** Returns 0 for NaN or Infinity, otherwise the value unchanged. */
function safeNum(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0
  return n
}

/** Clamps n to [lo, hi], applying safeNum first. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, safeNum(n)))
}

function makeInitialState(
  actual:       number,
  target:       number,
  childScores:  number[],
  childWeights: number[],
): StepState {
  return {
    actual:            safeNum(actual),
    target:            safeNum(target),
    achievement:       0,
    cappedAchievement: 0,
    score:             0,
    weightedScore:     0,
    zeroTarget:        false,
    bandLabel:         undefined,
    penaltyApplied:    0,
    bandRan:           false,
    penaltyRan:        false,
    childScores,
    childWeights,
    issues:            [],
    stepTraces:        [],
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Single processor step executor
// ════════════════════════════════════════════════════════════

/**
 * Executes one processor step against the current state.
 *
 * Rules:
 *   - Steps with `enabled === false` are skipped (no-op).
 *   - Unsupported processor types record an issue and return state unchanged.
 *   - NaN and Infinity never escape via safeNum/clamp guards.
 *   - Division by zero is prevented at the RATIO_EVALUATOR.
 *
 * @internal — exported for testing only; prefer simulateRule for pipeline runs.
 */
export function executeProcessorStep(
  step:  ProcessorStep,
  state: StepState,
): StepState {
  // Disabled step — skip entirely
  if ((step as any).enabled === false) return state

  const cfg  = step.config ?? {}
  const next: StepState = {
    ...state,
    issues:     [...state.issues],
    stepTraces: [...state.stepTraces],
  }

  switch (step.processorType) {

    // ── ZERO_TARGET_GUARD ─────────────────────────────────────
    case ZERO_TARGET_GUARD: {
      if (state.target <= 0) {
        next.zeroTarget = true
        const behaviour = (cfg.zeroTargetBehaviour as string | undefined) ?? 'skip'
        switch (behaviour) {
          case 'score_zero':
            next.achievement = 0; next.cappedAchievement = 0; next.score = 0
            break
          case 'score_full':
            next.achievement = 100; next.cappedAchievement = 100; next.score = 100
            break
          case 'use_fallback': {
            const fb = clamp(safeNum((cfg.fallbackScore as number | undefined) ?? 0), 0, 100)
            next.achievement = 0; next.cappedAchievement = 0; next.score = fb
            break
          }
          default: // 'skip'
            next.achievement = 0; next.cappedAchievement = 0
        }
      }
      next.stepTraces.push(createProcessorTrace(
        ZERO_TARGET_GUARD, state.target, next.achievement,
        next.zeroTarget ? `zero-target: ${cfg.zeroTargetBehaviour ?? 'skip'}` : 'target ok',
      ))
      break
    }

    // ── RATIO_EVALUATOR ───────────────────────────────────────
    case RATIO_EVALUATOR: {
      if (!state.zeroTarget) {
        if (state.target <= 0) {
          // Safety: guard should have run first, but protect anyway
          next.achievement = 0; next.cappedAchievement = 0
        } else {
          const ratio = safeNum(state.actual / state.target * 100)
          next.achievement = ratio
          next.cappedAchievement = ratio
        }
      }
      next.stepTraces.push(createProcessorTrace(
        RATIO_EVALUATOR, state.actual, next.achievement,
        `target=${state.target}`,
      ))
      break
    }

    // ── CEILING_CLAMP ─────────────────────────────────────────
    case CEILING_CLAMP: {
      const ceiling = safeNum((cfg.ceiling as number | undefined) ?? 100)
      const clamped = Math.min(next.cappedAchievement, ceiling)
      const applied = clamped < next.cappedAchievement
      next.cappedAchievement = clamped
      next.achievement       = clamped
      next.stepTraces.push(createProcessorTrace(
        CEILING_CLAMP, state.cappedAchievement, clamped,
        applied ? `clamped to ${ceiling}` : 'no clamp',
      ))
      break
    }

    // ── FLOOR_CLAMP ───────────────────────────────────────────
    case FLOOR_CLAMP: {
      const floor   = safeNum((cfg.floor as number | undefined) ?? 0)
      const clamped = Math.max(next.cappedAchievement, floor)
      const applied = clamped > next.cappedAchievement
      next.cappedAchievement = clamped
      next.achievement       = clamped
      next.stepTraces.push(createProcessorTrace(
        FLOOR_CLAMP, state.cappedAchievement, clamped,
        applied ? `raised to floor ${floor}` : 'no clamp',
      ))
      break
    }

    // ── WEIGHT_MULTIPLIER ─────────────────────────────────────
    case WEIGHT_MULTIPLIER: {
      const weight      = clamp(safeNum((cfg.weight as number | undefined) ?? 1), 0, 1)
      const weighted    = safeNum(next.cappedAchievement / 100 * weight)
      next.weightedScore = weighted
      next.stepTraces.push(createProcessorTrace(
        WEIGHT_MULTIPLIER, next.cappedAchievement, weighted,
        `weight=${weight}`,
      ))
      break
    }

    // ── BAND_EVALUATOR ────────────────────────────────────────
    case BAND_EVALUATOR: {
      type Band = { minPct: number; maxPct: number; score: number; label: string }
      const rawBands = (cfg.bands as Band[] | undefined) ?? []
      // Sort descending by minPct so we match the highest applicable band
      const sorted   = [...rawBands].sort((a, b) => b.minPct - a.minPct)
      const input    = next.cappedAchievement
      let matched    = false

      for (const band of sorted) {
        if (input >= band.minPct) {
          next.score     = clamp(safeNum(band.score), 0, 100)
          next.bandLabel = band.label
          next.bandRan   = true
          matched        = true
          break
        }
      }

      if (!matched) {
        // Below all bands — use defaultScore
        const def  = (cfg.defaultScore as number | undefined)
        next.score = clamp(safeNum(def ?? 0), 0, 100)
        next.bandRan = true
      }

      next.stepTraces.push(createProcessorTrace(
        BAND_EVALUATOR, input, next.score,
        next.bandLabel ? `band="${next.bandLabel}"` : 'no band matched',
      ))
      break
    }

    // ── PENALTY_EVALUATOR ─────────────────────────────────────
    case PENALTY_EVALUATOR: {
      type PRule = { condition: string; threshold: number; penaltyValue: number }
      const rules      = (cfg.penaltyRules as PRule[] | undefined) ?? []
      const maxPenalty = cfg.maxPenalty !== undefined
        ? safeNum(cfg.maxPenalty as number)
        : Infinity
      // Base score: use band score if ran, otherwise derive from achievement
      const base = next.bandRan
        ? next.score
        : clamp(next.cappedAchievement, 0, 100)

      let penalty = 0
      for (const rule of rules) {
        let condMet = false
        switch (rule.condition) {
          case 'below':  condMet = next.cappedAchievement <  rule.threshold; break
          case 'above':  condMet = next.cappedAchievement >  rule.threshold; break
          case 'equals': condMet = next.cappedAchievement === rule.threshold; break
        }
        if (condMet) penalty += safeNum(rule.penaltyValue)
      }

      penalty             = Math.min(penalty, isFinite(maxPenalty) ? maxPenalty : penalty)
      next.penaltyApplied = safeNum(penalty)
      next.score          = Math.max(0, base - next.penaltyApplied)
      next.penaltyRan     = true

      next.stepTraces.push(createProcessorTrace(
        PENALTY_EVALUATOR, base, next.score,
        `penalty=${next.penaltyApplied}`,
      ))
      break
    }

    // ── NODE_AGGREGATOR ───────────────────────────────────────
    case NODE_AGGREGATOR: {
      const aggType = (cfg.aggregationType as string | undefined) ?? 'weighted_sum'
      const scores  = state.childScores
      const weights = state.childWeights

      if (scores.length === 0) {
        next.score = 0
      } else {
        switch (aggType) {
          case 'weighted_sum': {
            const total = scores.reduce(
              (s, sc, i) => s + safeNum(sc) * safeNum(weights[i] ?? 0),
              0,
            )
            next.score = clamp(total, 0, 100)
            break
          }
          case 'simple_average': {
            const avg = scores.reduce((s, sc) => s + safeNum(sc), 0) / scores.length
            next.score = clamp(avg, 0, 100)
            break
          }
          case 'min': {
            next.score = clamp(Math.min(...scores.map(safeNum)), 0, 100)
            break
          }
          case 'max': {
            next.score = clamp(Math.max(...scores.map(safeNum)), 0, 100)
            break
          }
          default: {
            next.issues.push(`NODE_AGGREGATOR: unknown aggregationType "${aggType}"`)
            next.score = 0
          }
        }
      }

      next.stepTraces.push(createProcessorTrace(
        NODE_AGGREGATOR,
        scores.reduce((s, sc) => s + sc, 0),
        next.score,
        `${aggType}, ${scores.length} children`,
      ))
      break
    }

    // ── Unknown processor ─────────────────────────────────────
    default: {
      next.issues.push(
        `Unsupported processor type "${step.processorType}" — step skipped, score unchanged.`,
      )
      break
    }
  }

  return next
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Rule simulation
// ════════════════════════════════════════════════════════════

/**
 * Simulates a single rule node against actuals/targets.
 * Executes all enabled processor steps in ascending order.
 *
 * Safety guarantees:
 *   - Missing actual   → 0
 *   - Missing target   → 0
 *   - Zero target      → protected by ZERO_TARGET_GUARD (or handled internally)
 *   - NaN/Infinity     → 0 via safeNum/clamp
 *   - Negative score   → floored at 0
 */
export function simulateRule(
  rule:    RuleNode,
  actuals: Record<string, number>,
  targets: Record<string, number>,
): RuleSimResult {
  const actual = safeNum(actuals[rule.kpiKey] ?? 0)
  const target = safeNum(targets[rule.kpiKey] ?? 0)

  const steps = [...(rule.pipeline?.steps ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  let state = makeInitialState(actual, target, [], [])

  for (const step of steps) {
    state = executeProcessorStep(step, state)
  }

  // Finalize the node score
  let finalScore: number
  if (state.bandRan) {
    // BAND_EVALUATOR (and optional PENALTY after it) set state.score
    finalScore = state.score
  } else if (state.penaltyRan) {
    // PENALTY_EVALUATOR explicitly set state.score
    finalScore = state.score
  } else if (state.zeroTarget) {
    // ZERO_TARGET_GUARD may have set score explicitly (score_full / score_zero / use_fallback)
    finalScore = state.score
  } else {
    // No score-setting processor ran — derive from capped achievement
    finalScore = clamp(state.cappedAchievement, 0, 100)
  }

  finalScore = clamp(safeNum(finalScore), 0, 100)

  return {
    ruleId:            rule.id,
    kpiKey:            rule.kpiKey,
    actual,
    target,
    achievement:       safeNum(state.achievement),
    cappedAchievement: safeNum(state.cappedAchievement),
    score:             finalScore,
    weightedScore:     safeNum(state.weightedScore),
    zeroTarget:        state.zeroTarget,
    bandLabel:         state.bandLabel,
    penaltyApplied:    safeNum(state.penaltyApplied),
    issues:            state.issues,
    trace: createRuleSimTrace({
      ruleId:            rule.id,
      kpiKey:            rule.kpiKey,
      rawActual:         actual,
      rawTarget:         target,
      rawAchievement:    safeNum(state.achievement),
      cappedAchievement: safeNum(state.cappedAchievement),
      weightedScore:     safeNum(state.weightedScore),
      bandLabel:         state.bandLabel,
      penaltyApplied:    safeNum(state.penaltyApplied),
      finalNodeScore:    finalScore,
      zeroTarget:        state.zeroTarget,
      stepTraces:        state.stepTraces,
    }),
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Element simulation
// ════════════════════════════════════════════════════════════

/**
 * Simulates an element node by running each of its rules.
 *
 * Aggregation:
 *   - If the element's pipeline contains a NODE_AGGREGATOR step,
 *     that aggregation type is applied to the rule scores.
 *   - Otherwise the default is weighted_sum: Σ(rule.score × rule.weight),
 *     where rule weights should sum to 1.0.
 */
export function simulateElement(
  element: ElementNode,
  actuals: Record<string, number>,
  targets: Record<string, number>,
): ElementSimResult {
  const rules       = element.rules ?? []
  const ruleResults = rules.map((r) => simulateRule(r, actuals, targets))

  // Determine aggregation mode from element pipeline
  const elemSteps = [...(element.pipeline?.steps ?? [])]
    .filter((s) => (s as any).enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const aggStep = elemSteps.find((s) => s.processorType === NODE_AGGREGATOR)

  let elementScore: number

  if (aggStep && ruleResults.length > 0) {
    // Let NODE_AGGREGATOR determine the aggregation
    const childScores  = ruleResults.map((r) => r.score)
    const childWeights = rules.map((r) => safeNum(r.weight))
    let aggState       = makeInitialState(0, 0, childScores, childWeights)
    aggState           = executeProcessorStep(aggStep, aggState)
    elementScore       = aggState.score
  } else if (ruleResults.length > 0) {
    // Default: weighted sum (weights should sum to 1.0)
    elementScore = ruleResults.reduce(
      (s, r, i) => s + r.score * safeNum(rules[i]?.weight ?? 0),
      0,
    )
  } else {
    elementScore = 0
  }

  elementScore = clamp(safeNum(elementScore), 0, 100)

  const allIssues = ruleResults.flatMap((r) => r.issues)

  return {
    elementId:            element.id,
    label:                element.label,
    score:                elementScore,
    weight:               element.weight,
    weightedContribution: safeNum(elementScore * element.weight),
    rules:                ruleResults,
    issues:               allIssues,
    trace: createElementSimTrace({
      elementId:            element.id,
      label:                element.label,
      score:                elementScore,
      weight:               element.weight,
      weightedContribution: safeNum(elementScore * element.weight),
      rules:                ruleResults.map((r) => r.trace),
    }),
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — Basket simulation
// ════════════════════════════════════════════════════════════

/**
 * Simulates a basket node by running each of its elements.
 *
 * Aggregation: same pattern as element — uses NODE_AGGREGATOR from
 * basket pipeline if present, otherwise weighted_sum.
 */
export function simulateBasket(
  basket:  BasketNode,
  actuals: Record<string, number>,
  targets: Record<string, number>,
): BasketSimResult {
  const elements       = basket.elements ?? []
  const elementResults = elements.map((e) => simulateElement(e, actuals, targets))

  const basketSteps = [...(basket.pipeline?.steps ?? [])]
    .filter((s) => (s as any).enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const aggStep = basketSteps.find((s) => s.processorType === NODE_AGGREGATOR)

  let basketScore: number

  if (aggStep && elementResults.length > 0) {
    const childScores  = elementResults.map((e) => e.score)
    const childWeights = elements.map((e) => safeNum(e.weight))
    let aggState       = makeInitialState(0, 0, childScores, childWeights)
    aggState           = executeProcessorStep(aggStep, aggState)
    basketScore        = aggState.score
  } else if (elementResults.length > 0) {
    basketScore = elementResults.reduce(
      (s, e, i) => s + e.score * safeNum(elements[i]?.weight ?? 0),
      0,
    )
  } else {
    basketScore = 0
  }

  basketScore = clamp(safeNum(basketScore), 0, 100)

  const allIssues = elementResults.flatMap((e) => e.issues)

  return {
    basketId:             basket.id,
    label:                basket.label,
    score:                basketScore,
    weight:               basket.weight,
    weightedContribution: safeNum(basketScore * basket.weight),
    elements:             elementResults,
    issues:               allIssues,
    trace: createBasketSimTrace({
      basketId:             basket.id,
      label:                basket.label,
      score:                basketScore,
      weight:               basket.weight,
      weightedContribution: safeNum(basketScore * basket.weight),
      elements:             elementResults.map((e) => e.trace),
    }),
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 7 — Profile simulation
// ════════════════════════════════════════════════════════════

/**
 * Full profile simulation.
 *
 * Steps:
 *   1. Run validateSimulationReadiness — if invalid, return valid=false.
 *   2. Simulate all baskets.
 *   3. Compute overall score = Σ(basket.score × basket.weight).
 *   4. Return StudioSimulationResult with traces and issues.
 *
 * Never throws. All numeric outputs are NaN/Infinity-safe.
 */
export function simulateProfile(input: StudioSimulationInput): StudioSimulationResult {
  const { profile, actuals = {}, targets = {} } = input

  // ── Validation gate ───────────────────────────────────────
  const readiness = validateSimulationReadiness(profile)
  if (!readiness.valid) {
    return {
      profileId:      profile?.metadata?.id ?? '',
      profileVersion: profile?.metadata?.version ?? '',
      valid:          false,
      score:          0,
      baskets:        {},
      elements:       {},
      traces:         createProfileSimTrace({
        profileId:      profile?.metadata?.id ?? '',
        profileVersion: profile?.metadata?.version ?? '',
        overallScore:   0,
        baskets:        [],
      }),
      issues: readiness.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`),
    }
  }

  // ── Simulate baskets ──────────────────────────────────────
  const baskets = profile.root.baskets ?? []
  const basketResults = baskets.map((b) => simulateBasket(b, actuals, targets))

  // ── Aggregate overall score ───────────────────────────────
  const overallScore = clamp(
    safeNum(
      basketResults.reduce((s, b, i) => s + b.score * safeNum(baskets[i].weight), 0),
    ),
    0,
    100,
  )

  // ── Build result maps ─────────────────────────────────────
  const basketMap:  Record<string, BasketSimResult>   = {}
  const elementMap: Record<string, ElementSimResult>  = {}

  for (const br of basketResults) {
    basketMap[br.basketId] = br
    for (const er of br.elements) {
      elementMap[er.elementId] = er
    }
  }

  const allIssues = basketResults.flatMap((b) => b.issues)

  return {
    profileId:      profile.metadata.id,
    profileVersion: profile.metadata.version,
    valid:          true,
    score:          overallScore,
    baskets:        basketMap,
    elements:       elementMap,
    traces: createProfileSimTrace({
      profileId:      profile.metadata.id,
      profileVersion: profile.metadata.version,
      overallScore,
      baskets:        basketResults.map((b) => b.trace),
    }),
    issues: allIssues,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 8 — Result comparison
// ════════════════════════════════════════════════════════════

/**
 * Compares two simulation results and identifies what changed.
 *
 * Returns:
 *   scoreDelta    — b.score − a.score
 *   basketDeltas  — per-basket score changes
 *   elementDeltas — per-element score changes
 *   changedBands  — rules where the matched band changed
 *   changedIssues — issues added / removed between a and b
 */
export function compareSimulationResults(
  a: StudioSimulationResult,
  b: StudioSimulationResult,
): SimulationComparison {
  const scoreDelta = safeNum(b.score - a.score)

  // Basket deltas
  const allBasketIds = new Set([...Object.keys(a.baskets), ...Object.keys(b.baskets)])
  const basketDeltas: BasketDelta[] = [...allBasketIds].map((id) => {
    const before = safeNum(a.baskets[id]?.score ?? 0)
    const after  = safeNum(b.baskets[id]?.score ?? 0)
    return { basketId: id, before, after, delta: after - before }
  })

  // Element deltas
  const allElementIds = new Set([...Object.keys(a.elements), ...Object.keys(b.elements)])
  const elementDeltas: ElementDelta[] = [...allElementIds].map((id) => {
    const before = safeNum(a.elements[id]?.score ?? 0)
    const after  = safeNum(b.elements[id]?.score ?? 0)
    return { elementId: id, before, after, delta: after - before }
  })

  // Changed bands: compare rule-level traces from both results
  const changedBands: BandChange[] = []
  const aRules = new Map<string, { ruleId: string; kpiKey: string; bandLabel?: string }>()
  const bRules = new Map<string, { ruleId: string; kpiKey: string; bandLabel?: string }>()

  for (const basket of Object.values(a.baskets)) {
    for (const element of basket.elements) {
      for (const rule of element.rules) {
        aRules.set(rule.ruleId, { ruleId: rule.ruleId, kpiKey: rule.kpiKey, bandLabel: rule.bandLabel })
      }
    }
  }
  for (const basket of Object.values(b.baskets)) {
    for (const element of basket.elements) {
      for (const rule of element.rules) {
        bRules.set(rule.ruleId, { ruleId: rule.ruleId, kpiKey: rule.kpiKey, bandLabel: rule.bandLabel })
      }
    }
  }

  for (const [ruleId, aRule] of aRules) {
    const bRule = bRules.get(ruleId)
    if (bRule && aRule.bandLabel !== bRule.bandLabel) {
      changedBands.push({
        ruleId,
        kpiKey:     aRule.kpiKey,
        bandBefore: aRule.bandLabel,
        bandAfter:  bRule.bandLabel,
      })
    }
  }

  // Changed issues
  const aIssueSet = new Set(a.issues)
  const bIssueSet = new Set(b.issues)
  const changedIssues = {
    added:   b.issues.filter((i) => !aIssueSet.has(i)),
    removed: a.issues.filter((i) => !bIssueSet.has(i)),
  }

  return { scoreDelta, basketDeltas, elementDeltas, changedBands, changedIssues }
}
