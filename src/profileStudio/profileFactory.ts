// ============================================================
// Profile Studio — Profile Factory (Phase 0A)
//
// Pure factory helpers for creating empty, well-structured
// profile drafts and individual node types.
//
// All factories return objects in DRAFT status with safe defaults.
// No Firestore. No persistence. No React. No UI.
// ============================================================

import type {
  EvaluationProfileDraft,
  EvaluationProfileMetadata,
  EvaluationProfileNode,
  BasketNode,
  ElementNode,
  RuleNode,
  ProcessorPipeline,
  MetricType,
  ProfileScope,
} from './types'
import { PROFILE_STATUS } from './lifecycle'

// ── ID generation ─────────────────────────────────────────────

let _idCounter = 0

/**
 * Generates a unique profile-level ID.
 * Uses a timestamp + counter to avoid collisions within a session.
 *
 * @param prefix - Optional prefix for the generated ID.
 */
export function generateProfileId(prefix = 'prof'): string {
  _idCounter++
  return `${prefix}_${Date.now()}_${_idCounter}`
}

/**
 * Generates a unique node-level ID.
 *
 * @param prefix - Optional prefix ('basket', 'element', 'rule', etc.)
 */
export function generateNodeId(prefix = 'node'): string {
  _idCounter++
  return `${prefix}_${Date.now()}_${_idCounter}`
}

// ── Today's date helper ───────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Empty pipeline ────────────────────────────────────────────

function emptyPipeline(): ProcessorPipeline {
  return { steps: [] }
}

// ── Factory options ───────────────────────────────────────────

export interface CreateProfileOptions {
  name:      string
  scope?:    ProfileScope
  validFrom?: string
  createdBy?: string
  description?: string
}

export interface CreateBasketOptions {
  label:   string
  weight:  number
  id?:     string
}

export interface CreateElementOptions {
  label:   string
  weight:  number
  id?:     string
}

export interface CreateRuleOptions {
  kpiKey:      string
  label:       string
  weight:      number
  metricType?: MetricType
  id?:         string
  cap?:        number
  floor?:      number
}

// ── Factories ─────────────────────────────────────────────────

/**
 * Creates an empty evaluation profile draft with minimal structure.
 *
 * Defaults:
 *   status  = DRAFT
 *   version = 0.1.0
 *   scope   = PHARMACY
 *   validFrom = today (ISO)
 *   root.baskets = []
 */
export function createEmptyEvaluationProfile(
  options: CreateProfileOptions,
): EvaluationProfileDraft {
  const id = generateProfileId()

  const metadata: EvaluationProfileMetadata = {
    id,
    name:        options.name,
    description: options.description,
    version:     '0.1.0',
    status:      PROFILE_STATUS.DRAFT,
    scope:       options.scope ?? 'PHARMACY',
    validFrom:   options.validFrom ?? todayIso(),
    createdBy:   options.createdBy,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  }

  const root: EvaluationProfileNode = {
    id:      generateNodeId('root'),
    label:   options.name,
    baskets: [],
  }

  return { metadata, root }
}

/**
 * Creates a basket node with an empty elements list.
 * Weight must be provided by the caller.
 */
export function createBasketNode(options: CreateBasketOptions): BasketNode {
  return {
    id:       options.id ?? generateNodeId('basket'),
    label:    options.label,
    weight:   options.weight,
    elements: [],
    pipeline: emptyPipeline(),
  }
}

/**
 * Creates an element node with an empty rules list.
 */
export function createElementNode(options: CreateElementOptions): ElementNode {
  return {
    id:       options.id ?? generateNodeId('element'),
    label:    options.label,
    weight:   options.weight,
    rules:    [],
    pipeline: emptyPipeline(),
  }
}

/**
 * Creates a rule node mapped to a KPI.
 *
 * Defaults:
 *   metricType = 'count'
 *   pipeline   = empty
 */
export function createRuleNode(options: CreateRuleOptions): RuleNode {
  const node: RuleNode = {
    id:         options.id ?? generateNodeId('rule'),
    kpiKey:     options.kpiKey,
    label:      options.label,
    metricType: options.metricType ?? 'count',
    weight:     options.weight,
    pipeline:   emptyPipeline(),
  }

  if (options.cap   !== undefined) node.cap   = options.cap
  if (options.floor !== undefined) node.floor = options.floor

  return node
}
