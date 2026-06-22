// ============================================================
// Profile Studio — Simulation Trace Types & Helpers (Phase 0E)
//
// Defines the trace data shapes produced by the simulator kernel
// and factory helpers for constructing them.
//
// No simulation execution logic here — shape + helpers only.
// No Firestore. No React. No UI. No scoring engine.
// ============================================================

// ════════════════════════════════════════════════════════════
// SECTION 1 — Granular step trace
// ════════════════════════════════════════════════════════════

/** Trace emitted by a single processor step during rule execution. */
export interface SimStepTrace {
  /** Which processor type ran. */
  processorType: string
  /** Value fed INTO this step. */
  input:         number
  /** Value produced BY this step. */
  output:        number
  /** Optional human-readable note (e.g. "clamped", "band matched"). */
  notes?:        string
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Node-level traces
// ════════════════════════════════════════════════════════════

/** Complete trace for a single rule (leaf node) simulation run. */
export interface RuleSimTrace {
  /** Node identifier. */
  ruleId:            string
  /** KPI key used to look up actual / target values. */
  kpiKey:            string

  // Raw KPI inputs
  rawActual:         number
  rawTarget:         number

  // Achievement pipeline outputs
  rawAchievement:    number     // actual / target × 100, before any clamp
  cappedAchievement: number     // after CEILING/FLOOR clamps

  // Optional processor outputs
  weightedScore:     number     // set by WEIGHT_MULTIPLIER (cappedAchievement/100 × w)
  bandLabel?:        string     // set by BAND_EVALUATOR
  penaltyApplied:    number     // total penalty deducted by PENALTY_EVALUATOR

  // Final output
  finalNodeScore:    number     // 0–100

  // Edge-case flags
  zeroTarget:        boolean    // true when target was 0

  // Per-step breakdown
  stepTraces:        SimStepTrace[]

  /** ISO timestamp of when this trace was produced. */
  timestamp:         string
}

/** Trace for an element node — aggregates its child rule traces. */
export interface ElementSimTrace {
  elementId:            string
  label:                string
  score:                number     // 0–100 element score
  weight:               number     // element weight within its basket
  weightedContribution: number     // score × weight
  rules:                RuleSimTrace[]
  timestamp:            string
}

/** Trace for a basket node — aggregates its child element traces. */
export interface BasketSimTrace {
  basketId:             string
  label:                string
  score:                number     // 0–100 basket score
  weight:               number     // basket weight within the profile
  weightedContribution: number     // score × weight
  elements:             ElementSimTrace[]
  timestamp:            string
}

/** Top-level trace for a complete profile simulation run. */
export interface ProfileSimTrace {
  profileId:     string
  profileVersion: string
  overallScore:  number     // 0–100 final profile score
  baskets:       BasketSimTrace[]
  timestamp:     string
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Factory helpers
// ════════════════════════════════════════════════════════════

function nowIso(): string {
  return new Date().toISOString()
}

/** Creates a step trace for a single processor execution. */
export function createProcessorTrace(
  processorType: string,
  input:         number,
  output:        number,
  notes?:        string,
): SimStepTrace {
  return { processorType, input, output, notes }
}

/** Creates a full rule simulation trace from collected state values. */
export function createRuleSimTrace(
  params: Omit<RuleSimTrace, 'timestamp'>,
): RuleSimTrace {
  return { ...params, timestamp: nowIso() }
}

/** Creates an element simulation trace. */
export function createElementSimTrace(
  params: Omit<ElementSimTrace, 'timestamp'>,
): ElementSimTrace {
  return { ...params, timestamp: nowIso() }
}

/** Creates a basket simulation trace. */
export function createBasketSimTrace(
  params: Omit<BasketSimTrace, 'timestamp'>,
): BasketSimTrace {
  return { ...params, timestamp: nowIso() }
}

/** Creates a top-level profile simulation trace. */
export function createProfileSimTrace(
  params: Omit<ProfileSimTrace, 'timestamp'>,
): ProfileSimTrace {
  return { ...params, timestamp: nowIso() }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Flattening utilities
// ════════════════════════════════════════════════════════════

/**
 * Returns a flat list of all rule traces from a profile trace.
 * Traverses basket → element → rule depth-first.
 */
export function flattenSimulationTrace(trace: ProfileSimTrace): RuleSimTrace[] {
  const results: RuleSimTrace[] = []
  for (const basket of (trace.baskets ?? [])) {
    for (const element of (basket.elements ?? [])) {
      results.push(...element.rules)
    }
  }
  return results
}

/**
 * Returns a flat map of { kpiKey → RuleSimTrace } for quick lookup.
 */
export function indexTraceByKpi(trace: ProfileSimTrace): Map<string, RuleSimTrace> {
  const map = new Map<string, RuleSimTrace>()
  for (const rt of flattenSimulationTrace(trace)) {
    map.set(rt.kpiKey, rt)
  }
  return map
}
