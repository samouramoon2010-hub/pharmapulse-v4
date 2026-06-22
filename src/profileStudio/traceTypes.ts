// ============================================================
// Profile Studio — Trace Types (Phase 0A)
//
// Pure TypeScript interfaces describing the shape of execution
// traces produced when a profile is evaluated against actuals.
//
// No executor. No scoring logic. Shape definitions only.
// No Firestore. No React. No UI.
// ============================================================

// ── Raw value capture ────────────────────────────────────────

/** Captures the raw input values before any processing. */
export interface RawValueTrace {
  nodeId:      string
  kpiKey:      string
  rawActual:   number
  rawTarget:   number
  timestamp:   string
}

// ── Achievement calculation ──────────────────────────────────

/** Captures the achievement ratio before and after capping. */
export interface AchievementTrace {
  nodeId:          string
  kpiKey:          string
  rawActual:       number
  rawTarget:       number
  rawAchievement:  number   // actual / target × 100, before any cap
  targetWasZero:   boolean
}

// ── Cap / clamp application ──────────────────────────────────

/** Records how a ceiling clamp transformed the achievement. */
export interface CapTrace {
  nodeId:             string
  processorType:      'CEILING_CLAMP' | 'FLOOR_CLAMP'
  inputValue:         number
  clampValue:         number
  cappedAchievement:  number
  clampApplied:       boolean
}

// ── Weight application ────────────────────────────────────────

/** Records the weight multiplication step. */
export interface WeightTrace {
  nodeId:         string
  processorType:  'WEIGHT_MULTIPLIER'
  inputValue:     number
  weight:         number
  weightedScore:  number
}

// ── Band evaluation ───────────────────────────────────────────

/** Records how a ratio mapped to a threshold band. */
export interface BandTrace {
  nodeId:         string
  processorType:  'BAND_EVALUATOR'
  inputRatio:     number
  bandLabel:      string
  bandMinPct:     number
  bandMaxPct:     number
  bandScore:      number
}

// ── Penalty application ───────────────────────────────────────

/** Records whether a penalty was applied and by how much. */
export interface PenaltyTrace {
  nodeId:           string
  processorType:    'PENALTY_EVALUATOR'
  inputValue:       number
  penaltyApplied:   boolean
  penaltyAmount:    number
  finalValue:       number
  penaltyRuleId?:   string
}

// ── Node aggregation ──────────────────────────────────────────

/** Records how child scores were combined at a parent node. */
export interface NodeAggregationTrace {
  nodeId:            string
  processorType:     'NODE_AGGREGATOR'
  aggregationType:   'WEIGHTED_SUM' | 'AVERAGE' | 'MIN' | 'MAX'
  childNodeIds:      string[]
  childScores:       number[]
  childWeights:      number[]
  aggregatedScore:   number
}

// ── Full node execution trace ─────────────────────────────────

/**
 * Complete execution trace for a single node, combining all
 * processor steps that ran in sequence.
 */
export interface NodeExecutionTrace {
  nodeId:             string
  nodeLabel:          string
  processorId:        string
  processorType:      string
  timestamp:          string

  // Raw inputs
  rawActual?:         number
  rawTarget?:         number

  // Achievement steps
  rawAchievement?:    number
  cappedAchievement?: number
  weightedScore?:     number

  // Band evaluation
  bandLabel?:         string

  // Penalty
  penaltyApplied?:    boolean

  // Final output of this node
  finalNodeScore:     number

  // Child traces for non-leaf nodes
  children?:          NodeExecutionTrace[]
}

// ── Profile-level execution trace ────────────────────────────

/**
 * Top-level trace for a complete profile execution.
 * Contains all node traces and the overall output.
 */
export interface ProfileExecutionTrace {
  profileId:    string
  pharmacyId:   string
  month:        string
  executedAt:   string

  // Node-level detail
  nodeTraces:   NodeExecutionTrace[]

  // Basket-level summaries
  basketScores: Record<string, number>

  // Overall profile output
  overallScore: number

  // Individual processor step traces (flat list for debugging)
  rawValues?:         RawValueTrace[]
  achievements?:      AchievementTrace[]
  caps?:              CapTrace[]
  weights?:           WeightTrace[]
  bands?:             BandTrace[]
  penalties?:         PenaltyTrace[]
  aggregations?:      NodeAggregationTrace[]
}
