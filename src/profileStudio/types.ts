// ============================================================
// Profile Studio — Core Types (Phase 0A)
//
// TypeScript types and interfaces for the Profile Studio data model.
// Covers the full node hierarchy, metadata, validation results,
// simulation I/O, and calculation traces.
//
// No Firestore. No React. No UI. No executable logic.
// ============================================================

import type { ProcessorTypeConstant } from './processors'
import type { ProfileExecutionTrace }  from './traceTypes'

// ── Metric type ───────────────────────────────────────────────

/**
 * The semantic type of a value measured by a rule node.
 * Controls formatting, unit display, and ratio computation.
 */
export type MetricType =
  | 'currency'    // SAR monetary value
  | 'percentage'  // 0–100 ratio
  | 'count'       // discrete event count
  | 'score'       // derived composite score (0–100)
  | 'ratio'       // dimensionless ratio (e.g. 1.2×)

// ── Profile status ────────────────────────────────────────────

/**
 * Lifecycle stage of an evaluation profile.
 * Transitions are enforced by lifecycle.ts.
 */
export type ProfileStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'SIMULATED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED'

// ── Profile scope ─────────────────────────────────────────────

/** The organisational scope at which a profile is evaluated. */
export type ProfileScope =
  | 'PHARMACY'   // individual branch evaluation
  | 'DISTRICT'   // district-level aggregate
  | 'REGION'     // regional aggregate
  | 'NATIONAL'   // platform-wide aggregate

// ── Supported processor type ──────────────────────────────────

/** Re-export for consumers who only need the union type. */
export type { ProcessorTypeConstant as SupportedProcessorType } from './processors'

// ── Threshold bands ───────────────────────────────────────────

/**
 * A single threshold band for the BAND_EVALUATOR processor.
 * Bands must be ordered such that minPct < maxPct and bands
 * do not overlap within a pipeline.
 *
 * Invariant: healthy >= watch >= risk >= critical (by score).
 */
export interface ThresholdBand {
  /** Display label shown in UI and reports. */
  label:    string
  /** Lower bound of this band (inclusive), as an achievement %. */
  minPct:   number
  /** Upper bound of this band (exclusive, except top band). */
  maxPct:   number
  /** Score awarded when achievement falls in this band (0–100). */
  score:    number
  /** Optional hex color for visual display. */
  color?:   string
}

// ── Processor pipeline ────────────────────────────────────────

/**
 * A single step in a processor pipeline.
 * Steps are executed in ascending order of their `order` field.
 */
export interface ProcessorStep {
  /** Type identifier — must be a recognised ProcessorTypeConstant. */
  processorType: ProcessorTypeConstant
  /** Configuration object for this step (schema varies by type). */
  config:        Record<string, unknown>
  /** Execution order — lower values run first. */
  order:         number
}

/**
 * Ordered list of processor steps applied to a node during evaluation.
 * The pipeline is deterministic — same inputs always produce same outputs.
 */
export interface ProcessorPipeline {
  steps: ProcessorStep[]
}

// ── Node hierarchy ────────────────────────────────────────────

/**
 * Rule node — leaf of the hierarchy.
 * Represents a single KPI measurement within an element.
 */
export interface RuleNode {
  id:              string
  kpiKey:          string
  label:           string
  metricType:      MetricType
  /** Fractional weight within the parent element (0–1). Must be > 0. */
  weight:          number
  /** Achievement cap as a percentage (e.g. 200 = 200% cap). */
  cap?:            number
  /** Minimum achievement floor as a percentage. */
  floor?:          number
  pipeline:        ProcessorPipeline
  thresholdBands?: ThresholdBand[]
}

/**
 * Element node — groups related rules within a basket.
 */
export interface ElementNode {
  id:        string
  label:     string
  /** Fractional weight within the parent basket (0–1). Must be > 0. */
  weight:    number
  rules:     RuleNode[]
  pipeline?: ProcessorPipeline
}

/**
 * Basket node — top-level grouping under the profile root.
 * Corresponds to a major evaluation category (e.g. Commercial, Prescription).
 */
export interface BasketNode {
  id:        string
  label:     string
  /** Fractional weight within the root (0–1). All basket weights must sum to 1.0. */
  weight:    number
  elements:  ElementNode[]
  pipeline?: ProcessorPipeline
}

/**
 * Root node — the top of the evaluation hierarchy.
 * Contains all baskets. Its score is the overall profile score.
 */
export interface EvaluationProfileNode {
  id:      string
  label:   string
  baskets: BasketNode[]
}

// ── Profile metadata ──────────────────────────────────────────

/**
 * Metadata for an evaluation profile.
 * Describes identity, versioning, lifecycle, and effective dating.
 */
export interface EvaluationProfileMetadata {
  id:           string
  name:         string
  description?: string
  /** Semantic version string: major.minor.patch (e.g. "1.0.0"). */
  version:      string
  status:       ProfileStatus
  scope:        ProfileScope
  /** ISO date string (yyyy-MM-dd) — required. */
  validFrom:    string
  /** ISO date string — optional. When set, must be after validFrom. */
  validTo?:     string
  createdBy?:   string
  createdAt?:   string
  updatedAt?:   string
  tags?:        string[]
  /**
   * Which production pipeline preset this profile is intended to run
   * under once published — mirrors the production PipelineId union
   * (src/engine/evaluationPipeline/pipelineResolver.ts). Informational
   * only: Profile Studio never resolves or executes this pipeline
   * itself, and setting this field never affects production behavior.
   */
  pipelineId?:               'legacy-band-score' | 'smarts-weighted-contribution'
  /** Free-form tag identifying which engine version this profile was authored against. */
  engineCompatibilityVersion?: string
}

// ── Version ───────────────────────────────────────────────────

/**
 * Parsed representation of a semantic version.
 * Created by versioning.ts helpers.
 */
export interface EvaluationProfileVersion {
  major: number
  minor: number
  patch: number
  /** Full display label: "${baseName} v${major}.${minor}.${patch}" */
  label: string
}

// ── Full profile draft ────────────────────────────────────────

/**
 * A complete evaluation profile in draft or active form.
 * Contains both metadata and the evaluation node hierarchy.
 */
export interface EvaluationProfileDraft {
  metadata: EvaluationProfileMetadata
  root:     EvaluationProfileNode
}

// ── Validation ────────────────────────────────────────────────

/** Severity level for a validation issue. */
export type ValidationSeverity = 'error' | 'warning'

/**
 * A single validation issue found during profile validation.
 */
export interface ProfileValidationIssue {
  /** Machine-readable error code. */
  code:      string
  /** Human-readable description of the problem. */
  message:   string
  /** JSON path to the offending field or node. */
  path?:     string
  severity:  ValidationSeverity
}

/**
 * Result of running validateProfile() or any sub-validator.
 * Never throws for normal validation failures — returns issues instead.
 */
export interface ProfileValidationResult {
  valid:  boolean
  issues: ProfileValidationIssue[]
}

// ── Simulation ────────────────────────────────────────────────

/**
 * Input to a profile simulation run.
 * Actuals and targets are keyed by the engine key (aliasFor ?? kpiKey).
 */
export interface ProfileSimulationInput {
  profileId:  string
  pharmacyId: string
  month:      string
  actuals:    Record<string, number>
  targets:    Record<string, number>
}

/**
 * Output of a profile simulation run.
 * Contains scores and the full execution trace.
 */
export interface ProfileSimulationResult {
  profileId:    string
  pharmacyId:   string
  month:        string
  overallScore: number
  basketScores: Record<string, number>
  trace:        ProfileExecutionTrace
}

/**
 * Lightweight per-node calculation trace.
 * Used for rendering a score breakdown in the UI (future phase).
 */
export interface ProfileCalculationTrace {
  nodeId:           string
  nodeLabel:        string
  rawAchievement:   number
  cappedAchievement:number
  weightedScore:    number
  children?:        ProfileCalculationTrace[]
}
