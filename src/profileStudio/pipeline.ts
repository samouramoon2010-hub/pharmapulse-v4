// ============================================================
// Profile Studio — Pipeline Structure and Utilities (Phase 0C)
//
// Defines ProcessorPipelineDefinition (richer than the lean
// ProcessorPipeline in types.ts) and provides factory helpers,
// immutable utilities, and guards for pipeline composition.
//
// No execution. No scoring. No Firestore. No React. No UI.
// ============================================================

import type { AnyProcessorConfig } from './processorConfig'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Pipeline types
// ════════════════════════════════════════════════════════════

/** A single step in a Profile Studio pipeline definition. */
export interface ProcessorStepDefinition {
  /** Unique identifier for this step within the pipeline. */
  stepId:  string
  /** Execution order — lower values run first. */
  order:   number
  /** When false this step is skipped during evaluation. */
  enabled: boolean
  /** Typed processor configuration. */
  config:  AnyProcessorConfig
}

/** Rich pipeline definition used by Profile Studio tooling. */
export interface ProcessorPipelineDefinition {
  pipelineId: string
  label?:     string
  steps:      ProcessorStepDefinition[]
  /** Schema version for this pipeline definition. */
  version:    string
  createdAt?: string
  updatedAt?: string
}

/** A single validation issue found in a pipeline. */
export interface PipelineIssue {
  code:     string
  message:  string
  stepId?:  string
  severity: 'error' | 'warning'
}

/** Result of running any pipeline validator. */
export interface PipelineValidationResult {
  valid:  boolean
  issues: PipelineIssue[]
}

// ── ID generation ─────────────────────────────────────────────

let _pipelineIdCounter = 0

function generatePipelineId(prefix = 'pipe'): string {
  _pipelineIdCounter++
  return `${prefix}_${Date.now()}_${_pipelineIdCounter}`
}

function generateStepId(prefix = 'step'): string {
  _pipelineIdCounter++
  return `${prefix}_${Date.now()}_${_pipelineIdCounter}`
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Factory helpers
// ════════════════════════════════════════════════════════════

/**
 * Creates an empty pipeline with no steps.
 */
export function createEmptyPipeline(
  options?: { pipelineId?: string; label?: string; version?: string },
): ProcessorPipelineDefinition {
  return {
    pipelineId: options?.pipelineId ?? generatePipelineId(),
    label:      options?.label,
    steps:      [],
    version:    options?.version ?? '1.0.0',
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  }
}

/**
 * Creates a pipeline step wrapping the given config.
 * The step's enabled state defaults to `config.enabled`.
 */
export function createPipelineStep(
  config:   AnyProcessorConfig,
  order:    number,
  options?: { stepId?: string; enabled?: boolean },
): ProcessorStepDefinition {
  return {
    stepId:  options?.stepId ?? generateStepId(),
    order,
    enabled: options?.enabled ?? config.enabled,
    config,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Utility functions (all immutable)
// ════════════════════════════════════════════════════════════

/**
 * Finds the step with the given stepId.
 * Returns null if not found — never throws.
 */
export function findStep(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): ProcessorStepDefinition | null {
  return pipeline.steps.find((s) => s.stepId === stepId) ?? null
}

/**
 * Returns the array index of the step with `stepId`, or -1 if not found.
 */
export function getStepIndex(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): number {
  return pipeline.steps.findIndex((s) => s.stepId === stepId)
}

/**
 * Returns all steps sorted ascending by `order` (execution order).
 * Returns a new array — the pipeline is not mutated.
 */
export function flattenPipeline(
  pipeline: ProcessorPipelineDefinition,
): ProcessorStepDefinition[] {
  return [...pipeline.steps].sort((a, b) => a.order - b.order)
}

/** Returns the count of steps where `enabled === true`. */
export function countEnabledSteps(pipeline: ProcessorPipelineDefinition): number {
  return pipeline.steps.filter((s) => s.enabled).length
}

/**
 * Returns a new pipeline with the step moved to `newIndex` in sorted order.
 * `order` values are reassigned 0, 1, 2… to maintain consistency.
 * Returns pipeline unchanged when `stepId` is not found.
 */
export function moveStep(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
  newIndex: number,
): ProcessorPipelineDefinition {
  const sorted  = flattenPipeline(pipeline)
  const currIdx = sorted.findIndex((s) => s.stepId === stepId)
  if (currIdx === -1) return pipeline

  const step    = sorted[currIdx]
  sorted.splice(currIdx, 1)
  const clamped = Math.min(Math.max(0, newIndex), sorted.length)
  sorted.splice(clamped, 0, step)

  // Reassign sequential order values
  const reordered = sorted.map((s, idx) => ({ ...s, order: idx }))
  return { ...pipeline, steps: reordered }
}

/**
 * Returns a new pipeline with the step removed.
 * Returns pipeline unchanged when `stepId` is not found.
 */
export function removeStep(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): ProcessorPipelineDefinition {
  return { ...pipeline, steps: pipeline.steps.filter((s) => s.stepId !== stepId) }
}

/**
 * Returns a new pipeline with the step's `enabled` flag toggled.
 * Returns pipeline unchanged when `stepId` is not found.
 */
export function toggleStep(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): ProcessorPipelineDefinition {
  return {
    ...pipeline,
    steps: pipeline.steps.map((s) =>
      s.stepId === stepId ? { ...s, enabled: !s.enabled } : s,
    ),
  }
}

/**
 * Returns a deep clone of the pipeline.
 * All steps and configs are new objects.
 */
export function clonePipeline(
  pipeline: ProcessorPipelineDefinition,
): ProcessorPipelineDefinition {
  return structuredClone(pipeline)
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Guards
// ════════════════════════════════════════════════════════════

/**
 * Returns true when adding `config` to the pipeline is valid.
 * Blocked when a step with the same config.id already exists.
 */
export function canAddProcessor(
  pipeline: ProcessorPipelineDefinition,
  config:   AnyProcessorConfig,
): boolean {
  return !pipeline.steps.some((s) => s.config.id === config.id)
}

/**
 * Returns true when the step exists in the pipeline and may be removed.
 */
export function canRemoveProcessor(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): boolean {
  return pipeline.steps.some((s) => s.stepId === stepId)
}

/**
 * Returns true when the step exists and `newIndex` is a valid, different position.
 */
export function canMoveProcessor(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
  newIndex: number,
): boolean {
  const sorted  = flattenPipeline(pipeline)
  const currIdx = sorted.findIndex((s) => s.stepId === stepId)
  if (currIdx === -1) return false
  if (newIndex < 0 || newIndex >= sorted.length) return false
  return currIdx !== newIndex
}

/**
 * Returns true when the step exists and is currently enabled.
 */
export function canDisableProcessor(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): boolean {
  const step = findStep(pipeline, stepId)
  return step !== null && step.enabled
}

/**
 * Returns true when the step exists and is currently disabled.
 */
export function canEnableProcessor(
  pipeline: ProcessorPipelineDefinition,
  stepId:   string,
): boolean {
  const step = findStep(pipeline, stepId)
  return step !== null && !step.enabled
}
