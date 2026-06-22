// ============================================================
// Profile Studio — Excel/CSV Import Wizard Kernel (Phase 1 Closure)
//
// Pure functions that turn a flat table of rows (one row per rule,
// already parsed from a .xlsx/.csv file by the caller — this module
// never touches FileReader/XLSX itself) into an EvaluationProfileDraft,
// then run a stricter "import readiness" validation pass on top of
// the existing validateProfile() kernel.
//
// Guided flow enforced by this module's own shape (no auto-import):
//   1. detectImportTemplate(headers)      — "Detect template"
//   2. buildColumnMapping(headers, map)   — "Column mapping"
//   3. buildProfileFromImportRows(...)    — "Parsed profile preview"
//   4. buildImportValidationReport(...)   — "Validation report"
//   5. canSaveImportedProfile(report)     — gate before "Save as Draft"
//
// Hard safety rules:
//   - The resulting profile's metadata.status is ALWAYS 'DRAFT',
//     regardless of any status-like column present in the sheet.
//   - No formula DSL, no executable expressions: threshold bands are
//     parsed from a fixed "label:minPct:maxPct:score" tuple grammar
//     (split on ':' and ';', then Number()) — never passed through any
//     code-evaluation function, never
//     passed through any expression engine.
//   - No AI involved — purely deterministic column → field mapping
//     supplied by the human user in step 2.
//   - This module never writes to Firestore and never imports the
//     production Evaluation Engine. Saving is the caller's job, via
//     the existing createProfileDocument() service, with status
//     forced to DRAFT.
//
// KPI-key validity is checked against DEFAULT_ALL_KPI_KEYS — a static,
// read-only data export from the KPI registry. This is a reference
// lookup only; it does not import or execute any engine/scoring code,
// preserving Profile Studio's existing processor-kernel isolation.
// ============================================================

import type {
  EvaluationProfileDraft,
  EvaluationProfileMetadata,
  EvaluationProfileNode,
  BasketNode,
  ElementNode,
  RuleNode,
  ThresholdBand,
  MetricType,
  ProfileValidationIssue,
  ProfileValidationResult,
} from './types'
import { PROFILE_STATUS } from './lifecycle'
import { validateProfile } from './validation'
import { isSupportedProcessorType } from './processors'
import type { ProcessorTypeConstant } from './processors'
import { generateProfileId, generateNodeId } from './profileFactory'
import { DEFAULT_ALL_KPI_KEYS } from '../engine/kpiRegistry/defaultKpiRegistry'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Canonical column schema
// ════════════════════════════════════════════════════════════

/** Canonical field names the wizard understands. Every row maps to these. */
export const IMPORT_CANONICAL_FIELDS = [
  'basketId', 'basketLabel', 'basketWeight',
  'elementId', 'elementLabel', 'elementWeight',
  'ruleId', 'kpiKey', 'ruleLabel', 'ruleWeight', 'metricType',
  'cap', 'floor', 'processorType', 'thresholdBands',
] as const

export type ImportCanonicalField = typeof IMPORT_CANONICAL_FIELDS[number]

/** Fields that must be mapped to a sheet column for any row to be usable. */
export const IMPORT_REQUIRED_FIELDS: ImportCanonicalField[] = [
  'basketId', 'basketLabel', 'basketWeight',
  'elementId', 'elementLabel', 'elementWeight',
  'ruleId', 'kpiKey', 'ruleLabel', 'ruleWeight',
]

/** Recognised header aliases per canonical field — used only for template detection. */
const HEADER_ALIASES: Record<ImportCanonicalField, string[]> = {
  basketId:       ['basketid', 'basket id', 'basket_id'],
  basketLabel:    ['basketlabel', 'basket label', 'basket name', 'basket_label'],
  basketWeight:   ['basketweight', 'basket weight', 'basket_weight'],
  elementId:      ['elementid', 'element id', 'element_id'],
  elementLabel:   ['elementlabel', 'element label', 'element name', 'element_label'],
  elementWeight:  ['elementweight', 'element weight', 'element_weight'],
  ruleId:         ['ruleid', 'rule id', 'rule_id'],
  kpiKey:         ['kpikey', 'kpi key', 'kpi_key', 'kpi'],
  ruleLabel:      ['rulelabel', 'rule label', 'rule name', 'rule_label'],
  ruleWeight:     ['ruleweight', 'rule weight', 'rule_weight'],
  metricType:     ['metrictype', 'metric type', 'metric_type'],
  cap:            ['cap'],
  floor:          ['floor'],
  processorType:  ['processortype', 'processor type', 'processor_type'],
  thresholdBands: ['thresholdbands', 'threshold bands', 'bands', 'threshold_bands'],
}

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase()
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Step 1: Detect template
// ════════════════════════════════════════════════════════════

export interface ImportTemplateDetectionResult {
  detected:       boolean
  /** Canonical fields that were auto-matched from the sheet's header row. */
  autoMatched:    Record<ImportCanonicalField, string | null>
  /** Required canonical fields that could NOT be auto-matched. */
  unmatchedRequired: ImportCanonicalField[]
}

/**
 * Inspects a sheet's header row and attempts to auto-match each canonical
 * field to a column header using a fixed alias table. Never guesses beyond
 * exact alias matches — anything unmatched must be mapped manually by the
 * user in the column-mapping step.
 */
export function detectImportTemplate(headers: string[]): ImportTemplateDetectionResult {
  const normalizedHeaders = headers.map(normalizeHeader)
  const autoMatched = {} as Record<ImportCanonicalField, string | null>

  for (const field of IMPORT_CANONICAL_FIELDS) {
    const aliases = HEADER_ALIASES[field]
    const idx = normalizedHeaders.findIndex((h) => aliases.includes(h))
    autoMatched[field] = idx >= 0 ? headers[idx] : null
  }

  const unmatchedRequired = IMPORT_REQUIRED_FIELDS.filter((f) => !autoMatched[f])

  return {
    detected: unmatchedRequired.length === 0,
    autoMatched,
    unmatchedRequired,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Step 2: Column mapping
// ════════════════════════════════════════════════════════════

export type ColumnMapping = Record<ImportCanonicalField, string | null>

/**
 * Builds a final column mapping by overlaying user-supplied overrides on
 * top of the auto-detected mapping. The user mapping always wins — this
 * is the "guided, not automatic" gate: nothing is imported until this
 * mapping is confirmed by a human.
 */
export function buildColumnMapping(
  detected: ImportTemplateDetectionResult,
  userOverrides: Partial<ColumnMapping> = {},
): ColumnMapping {
  const mapping = { ...detected.autoMatched }
  for (const field of IMPORT_CANONICAL_FIELDS) {
    if (userOverrides[field] !== undefined) mapping[field] = userOverrides[field] ?? null
  }
  return mapping
}

/** True only when every required field has a non-null mapped column. */
export function isColumnMappingComplete(mapping: ColumnMapping): boolean {
  return IMPORT_REQUIRED_FIELDS.every((f) => !!mapping[f])
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Step 3: Build profile from mapped rows
// ════════════════════════════════════════════════════════════

export type ImportRow = Record<string, unknown>

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Weight fields must never resolve to NaN — NaN comparisons silently pass
 * validateProfile's `<= 0` and `Math.abs(sum - 1.0) > tolerance` checks
 * (NaN is never `<=` or `>` anything), which would let invalid/missing
 * weights slip past the "reject if weights are invalid" import rule.
 * Missing or non-numeric weight cells resolve to 0, which correctly
 * fails those checks instead of silently passing them.
 */
function toWeight(v: unknown): number {
  const n = toNumber(v)
  return n !== undefined && Number.isFinite(n) ? n : 0
}

/**
 * Parses the fixed, non-executable threshold-band tuple grammar:
 *   "label:minPct:maxPct:score; label:minPct:maxPct:score; ..."
 * Each segment is split on ':' and converted with Number() — never
 * code-evaluated. Malformed segments are dropped and reported by the caller's
 * validation pass (missing thresholdBands on a rule that declared some
 * is caught as INCOMPLETE_THRESHOLDS).
 */
export function parseThresholdBandsCell(cell: unknown): ThresholdBand[] {
  if (!cell || typeof cell !== 'string' || cell.trim() === '') return []
  return cell
    .split(';')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const parts = seg.split(':').map((p) => p.trim())
      const [label, minPct, maxPct, score] = parts
      return {
        label:  label ?? '',
        minPct: Number(minPct),
        maxPct: Number(maxPct),
        score:  Number(score),
      } as ThresholdBand
    })
}

export interface BuildProfileFromRowsOptions {
  name:       string
  scope?:     EvaluationProfileMetadata['scope']
  validFrom?: string
  createdBy?: string
}

export interface BuildProfileFromRowsResult {
  profile: EvaluationProfileDraft
  /** Row-level structural problems found while grouping (not full validation). */
  rowIssues: string[]
}

/**
 * Step 3 — Parsed Profile Preview.
 *
 * Groups mapped rows into basket → element → rule nodes. Always forces
 * metadata.status to DRAFT — any "status" data present in the sheet
 * (there is no such canonical field) is ignored entirely.
 *
 * This is a pure, deterministic transform. It does not validate business
 * rules (weights summing to 1.0, unknown KPI keys, etc.) — that is
 * buildImportValidationReport()'s job, run as the next guided step.
 */
export function buildProfileFromImportRows(
  rows:    ImportRow[],
  mapping: ColumnMapping,
  options: BuildProfileFromRowsOptions,
): BuildProfileFromRowsResult {
  const rowIssues: string[] = []
  const baskets = new Map<string, BasketNode>()
  const elements = new Map<string, ElementNode>()  // keyed by `${basketId}::${elementId}`

  const get = (row: ImportRow, field: ImportCanonicalField): string =>
    String(row[mapping[field] as string] ?? '').trim()

  rows.forEach((row, idx) => {
    const basketId      = get(row, 'basketId')
    const basketLabel   = get(row, 'basketLabel')
    const basketWeight  = toWeight(row[mapping.basketWeight as string])
    const elementId     = get(row, 'elementId')
    const elementLabel  = get(row, 'elementLabel')
    const elementWeight = toWeight(row[mapping.elementWeight as string])
    const ruleId        = get(row, 'ruleId')
    const kpiKey         = get(row, 'kpiKey')
    const ruleLabel      = get(row, 'ruleLabel')
    const ruleWeight     = toWeight(row[mapping.ruleWeight as string])
    const metricTypeCell = mapping.metricType ? get(row, 'metricType') : ''
    const capCell    = mapping.cap   ? toNumber(row[mapping.cap as string])   : undefined
    const floorCell  = mapping.floor ? toNumber(row[mapping.floor as string]) : undefined
    const processorTypeCell = mapping.processorType ? get(row, 'processorType') : ''
    const thresholdCell = mapping.thresholdBands ? row[mapping.thresholdBands as string] : undefined

    if (!basketId || !elementId || !ruleId || !kpiKey) {
      rowIssues.push(`Row ${idx + 2}: missing one of basketId/elementId/ruleId/kpiKey — row skipped.`)
      return
    }

    if (!baskets.has(basketId)) {
      baskets.set(basketId, {
        id:      basketId,
        label:   basketLabel || basketId,
        weight:  basketWeight,
        elements: [],
        pipeline: { steps: [] },
      })
    }

    const elemKey = `${basketId}::${elementId}`
    if (!elements.has(elemKey)) {
      const elementNode: ElementNode = {
        id:      elementId,
        label:   elementLabel || elementId,
        weight:  elementWeight,
        rules:   [],
        pipeline: { steps: [] },
      }
      elements.set(elemKey, elementNode)
      baskets.get(basketId)!.elements.push(elementNode)
    }

    const thresholdBands = parseThresholdBandsCell(thresholdCell)

    const ruleNode: RuleNode = {
      id:         ruleId,
      kpiKey,
      label:      ruleLabel || ruleId,
      metricType: (metricTypeCell || 'count') as MetricType,
      weight:     ruleWeight,
      pipeline:   {
        steps: processorTypeCell
          ? [{ processorType: processorTypeCell as ProcessorTypeConstant, config: {}, order: 0 }]
          : [],
      },
    }
    if (capCell !== undefined)   ruleNode.cap   = capCell
    if (floorCell !== undefined) ruleNode.floor = floorCell
    if (thresholdBands.length)   ruleNode.thresholdBands = thresholdBands

    elements.get(elemKey)!.rules.push(ruleNode)
  })

  const root: EvaluationProfileNode = {
    id:      generateNodeId('root'),
    label:   options.name,
    baskets: [...baskets.values()],
  }

  const profile: EvaluationProfileDraft = {
    metadata: {
      id:        generateProfileId('imported'),
      name:      options.name,
      version:   '0.1.0',
      // Always forced to DRAFT — no sheet column can override this.
      status:    PROFILE_STATUS.DRAFT,
      scope:     options.scope ?? 'PHARMACY',
      validFrom: options.validFrom ?? new Date().toISOString().slice(0, 10),
      createdBy: options.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    root,
  }

  return { profile, rowIssues }
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Step 4: Import-specific validation report
// ════════════════════════════════════════════════════════════

export interface ImportValidationReport extends ProfileValidationResult {
  /** Subset of `issues` with severity 'error' — these block save. */
  blockingIssues: ProfileValidationIssue[]
}

function err(code: string, message: string, path?: string): ProfileValidationIssue {
  return { code, message, path, severity: 'error' }
}

/**
 * Step 4 — Validation Report.
 *
 * Runs the existing validateProfile() kernel (weights, processor types,
 * threshold bands, caps/floors, hierarchy structure) and layers two
 * import-specific, stricter checks on top:
 *
 *   - BASKET_NO_ELEMENTS_IMPORT (error): validateProfile only *warns* on
 *     an empty basket; the import flow must hard-block it per the
 *     "basket has no elements" rejection rule.
 *   - UNKNOWN_KPI_KEY (error): kpiKey not present in DEFAULT_ALL_KPI_KEYS.
 *
 * Never throws. Returns blockingIssues = all severity:'error' issues —
 * any entry there must prevent "Save as Draft".
 */
export function buildImportValidationReport(
  profile: EvaluationProfileDraft,
): ImportValidationReport {
  const base = validateProfile(profile)
  const extra: ProfileValidationIssue[] = []

  for (const basket of profile.root?.baskets ?? []) {
    if (!basket.elements || basket.elements.length === 0) {
      extra.push(err(
        'BASKET_NO_ELEMENTS_IMPORT',
        `Basket "${basket.id}" has no elements — imported baskets must contain at least one element.`,
        `root.baskets[${basket.id}].elements`,
      ))
    }
    for (const element of basket.elements ?? []) {
      for (const rule of element.rules ?? []) {
        if (rule.kpiKey && !DEFAULT_ALL_KPI_KEYS.includes(rule.kpiKey)) {
          extra.push(err(
            'UNKNOWN_KPI_KEY',
            `Rule "${rule.id}" references unknown KPI key "${rule.kpiKey}".`,
            `root.baskets[${basket.id}].elements[${element.id}].rules[${rule.id}].kpiKey`,
          ))
        }
        for (const step of rule.pipeline?.steps ?? []) {
          if (!isSupportedProcessorType(step.processorType)) {
            extra.push(err(
              'UNKNOWN_PROCESSOR_TYPE_IMPORT',
              `Rule "${rule.id}" references unknown processor type "${step.processorType}".`,
              `root.baskets[${basket.id}].elements[${element.id}].rules[${rule.id}].pipeline`,
            ))
          }
        }
        if (rule.cap !== undefined && (!Number.isFinite(rule.cap) || rule.cap <= 0)) {
          extra.push(err(
            'INVALID_CAP_IMPORT',
            `Rule "${rule.id}" has an invalid cap value.`,
            `root.baskets[${basket.id}].elements[${element.id}].rules[${rule.id}].cap`,
          ))
        }
        if (rule.thresholdBands?.length) {
          const incomplete = rule.thresholdBands.some(
            (b) => !b.label || !Number.isFinite(b.minPct) || !Number.isFinite(b.maxPct) || !Number.isFinite(b.score),
          )
          if (incomplete) {
            extra.push(err(
              'INCOMPLETE_THRESHOLDS_IMPORT',
              `Rule "${rule.id}" has one or more incomplete threshold bands.`,
              `root.baskets[${basket.id}].elements[${element.id}].rules[${rule.id}].thresholdBands`,
            ))
          }
        }
      }
    }
  }

  const issues = [...base.issues, ...extra]
  const blockingIssues = issues.filter((i) => i.severity === 'error')

  return { valid: blockingIssues.length === 0, issues, blockingIssues }
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — Step 5: Save gate
// ════════════════════════════════════════════════════════════

/** True only when the import report has zero blocking (error-severity) issues. */
export function canSaveImportedProfile(report: ImportValidationReport): boolean {
  return report.blockingIssues.length === 0
}
