// ============================================================
// Dynamic Executive BI Adapter — Phase 4C-X-0 Foundation
//
// Purpose: Safe compatibility layer between the static 5-core-KPI
// Executive BI and the future Dynamic Executive BI that will work
// with any KPI from the registry.
//
// Design principles:
//   - Pure functions only. No Firestore, no React, no side effects.
//   - Preserves all existing 5-core-KPI behavior identically.
//   - Supports both legacy flat entry shape AND future nested metrics map.
//   - Missing KPI = null (NOT zero) — explicit null means "no data".
//   - Custom KPI without aggregationType = NOT_AGGREGATED.
//   - Never changes existing executive scoring logic.
//
// Deferred (NOT in this phase):
//   - Replacing the existing executiveReportGenerator with a dynamic version.
//   - Changing Firestore schema or existing entry documents.
//   - Migrating existing data.
//   - UI changes.
// ============================================================

import { KPI_KEYS, KPI_WEIGHTS, KPI_META } from '../kpiAnalyticsEngine'
import type { KpiKey, TrafficLightStatus } from '../kpiAnalyticsEngine'
import type { KpiDefinition, KpiRegistry } from '../kpiRegistry/kpiRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — ANALYTICAL METADATA TYPES
// ══════════════════════════════════════════════════════════════

/**
 * How a KPI is aggregated across multiple entries/branches.
 *
 *   SUM           — add up all values (prescriptions, transactions)
 *   AVG           — average across pharmacists (satisfaction scores, NPS)
 *   RATIO         — numerator ÷ denominator (service level %)
 *   NOT_AGGREGATED — KPI exists in registry but not yet scored by executive engine
 */
export type AggregationType = 'SUM' | 'AVG' | 'RATIO' | 'NOT_AGGREGATED'

/**
 * Performance polarity — which direction is "better".
 */
export type Polarity = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER'

/**
 * Analytical metadata for a single KPI in the executive context.
 * This augments the base KpiDefinition with executive-specific fields.
 */
export interface ExecutiveKpiMeta {
  key:               string
  label:             string
  labelAr:           string
  aggregationType:   AggregationType
  polarity:          Polarity
  portfolioWeight:   number       // 0..1; core KPIs sum to 1.0
  executiveEnabled:  boolean
  isCore:            boolean
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — NORMALIZED METRIC RECORD
// ══════════════════════════════════════════════════════════════

/**
 * A single KPI's normalized data for one branch in one period.
 * The target output shape of the dynamic executive adapter.
 *
 * null means "no data" — explicitly distinct from 0.
 */
export interface NormalizedMetricRecord {
  actual:           number | null
  target:           number | null
  achievementPct:   number | null
  aggregationType:  AggregationType
  polarity:         Polarity
  portfolioWeight:  number
  status:           TrafficLightStatus | null   // null when no data
}

/**
 * Normalized branch metrics — the output shape of the adapter.
 * One record per branch, containing a metric entry per KPI.
 */
export interface NormalizedBranchMetrics {
  branchId:    string
  branchName:  string
  branchCode?: string
  period:      string    // ISO month 'YYYY-MM' or range 'YYYY-MM-DD/YYYY-MM-DD'
  metrics:     Record<string, NormalizedMetricRecord>
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — LEGACY INPUT SHAPE (flat KPI entry / target doc)
// ══════════════════════════════════════════════════════════════

/**
 * Legacy flat KPI entry document shape (from kpi_entries collection).
 * Fields are top-level: { userId, pharmacyId, date, wasfaty, omni, ... }
 */
export interface LegacyKpiEntry {
  userId:      string
  pharmacyId:  string
  date:        string
  // Core KPI values — present on existing documents
  wasfaty?:       number
  omni?:          number
  wellness?:      number
  basket?:        number
  crossSelling?:  number
  // Custom KPI values — dynamic fields, any string key
  [key: string]:  unknown
}

/**
 * Legacy flat target document shape (from targets collection).
 * Fields use the *Target suffix pattern.
 */
export interface LegacyTargetDoc {
  pharmacyId:     string
  month:          string
  wasfatyTarget?:   number
  omniTarget?:      number
  wellnessTarget?:  number
  basketTarget?:    number
  crossSellTarget?: number
  // Dynamic target fields — any string key ending in 'Target'
  [key: string]:  unknown
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — LEGACY CORE KPI ANALYTICAL METADATA
// ══════════════════════════════════════════════════════════════

/**
 * Hard-coded analytical metadata for the 5 core KPIs.
 * This mirrors the current executiveReportGenerator behavior exactly
 * and will remain compatible until dynamic engine promotion.
 */
export const CORE_KPI_EXECUTIVE_META: Record<KpiKey, ExecutiveKpiMeta> = {
  wasfaty: {
    key:              'wasfaty',
    label:            KPI_META.wasfaty.en,
    labelAr:          KPI_META.wasfaty.ar,
    aggregationType:  'SUM',
    polarity:         'HIGHER_IS_BETTER',
    portfolioWeight:  KPI_WEIGHTS.wasfaty,
    executiveEnabled: true,
    isCore:           true,
  },
  omni: {
    key:              'omni',
    label:            KPI_META.omni.en,
    labelAr:          KPI_META.omni.ar,
    aggregationType:  'SUM',
    polarity:         'HIGHER_IS_BETTER',
    portfolioWeight:  KPI_WEIGHTS.omni,
    executiveEnabled: true,
    isCore:           true,
  },
  wellness: {
    key:              'wellness',
    label:            KPI_META.wellness.en,
    labelAr:          KPI_META.wellness.ar,
    aggregationType:  'SUM',
    polarity:         'HIGHER_IS_BETTER',
    portfolioWeight:  KPI_WEIGHTS.wellness,
    executiveEnabled: true,
    isCore:           true,
  },
  basket: {
    key:              'basket',
    label:            KPI_META.basket.en,
    labelAr:          KPI_META.basket.ar,
    aggregationType:  'AVG',          // basket size is an average
    polarity:         'HIGHER_IS_BETTER',
    portfolioWeight:  KPI_WEIGHTS.basket,
    executiveEnabled: true,
    isCore:           true,
  },
  crossSelling: {
    key:              'crossSelling',
    label:            KPI_META.crossSelling.en,
    labelAr:          KPI_META.crossSelling.ar,
    aggregationType:  'SUM',
    polarity:         'HIGHER_IS_BETTER',
    portfolioWeight:  KPI_WEIGHTS.crossSelling,
    executiveEnabled: true,
    isCore:           true,
  },
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — REGISTRY → ExecutiveKpiMeta DERIVATION
// ══════════════════════════════════════════════════════════════

/**
 * Derive AggregationType from a KpiDefinition.
 *
 * Rules:
 *   - Core KPI: use CORE_KPI_EXECUTIVE_META for exact compatibility
 *   - percentage valueType: RATIO
 *   - currency / count / number with higher_is_better: SUM
 *   - lower_is_better: SUM (still summed, but interpreted inversely)
 *   - No executiveEnabled flag: NOT_AGGREGATED
 */
function deriveAggregationType(kpi: KpiDefinition): AggregationType {
  // Not enabled for executive surface → NOT_AGGREGATED
  if (!kpi.visibility.executiveEnabled) return 'NOT_AGGREGATED'

  // Delegate core KPIs to hard-coded metadata
  const engineKey = kpi.aliasFor ?? kpi.key
  if (engineKey in CORE_KPI_EXECUTIVE_META) {
    return CORE_KPI_EXECUTIVE_META[engineKey as KpiKey].aggregationType
  }

  // Derive for custom KPIs
  switch (kpi.valueType) {
    case 'percentage': return 'RATIO'
    case 'currency':   return 'SUM'
    case 'count':      return 'SUM'
    case 'number':     return 'SUM'
    default:           return 'NOT_AGGREGATED'
  }
}

/**
 * Build ExecutiveKpiMeta from a KpiDefinition and optional
 * portfolio weight override. Falls back to core metadata for core KPIs.
 */
export function buildExecutiveKpiMeta(
  kpi:                    KpiDefinition,
  portfolioWeightOverride?: number,
): ExecutiveKpiMeta {
  const engineKey = kpi.aliasFor ?? kpi.key

  // For core KPIs, use exact legacy metadata to guarantee no behavior change
  if (engineKey in CORE_KPI_EXECUTIVE_META) {
    const legacy = CORE_KPI_EXECUTIVE_META[engineKey as KpiKey]
    return {
      ...legacy,
      portfolioWeight: portfolioWeightOverride ?? legacy.portfolioWeight,
    }
  }

  return {
    key:              kpi.key,
    label:            kpi.label,
    labelAr:          kpi.labelAr,
    aggregationType:  deriveAggregationType(kpi),
    polarity:         kpi.direction === 'lower_is_better' ? 'LOWER_IS_BETTER' : 'HIGHER_IS_BETTER',
    portfolioWeight:  portfolioWeightOverride ?? kpi.weight ?? 0,
    executiveEnabled: kpi.visibility.executiveEnabled ?? false,
    isCore:           kpi.isCore,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — METRIC RECORD NORMALIZATION
// ══════════════════════════════════════════════════════════════

/** Derive TrafficLightStatus from an achievement %. */
function deriveStatus(achievementPct: number | null): TrafficLightStatus | null {
  if (achievementPct === null) return null
  if (achievementPct >= 90) return 'excellent'
  if (achievementPct >= 70) return 'good'
  if (achievementPct >= 50) return 'warning'
  return 'critical'
}

/** Safe achievement % calculation — returns null when target is 0 or missing. */
function safeAchievementPct(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null
  return Math.min(200, (actual / target) * 100)
}

/**
 * Normalize a single KPI metric into the canonical NormalizedMetricRecord.
 *
 * Handles both flat legacy shape and the presence of null values.
 * Missing KPI value = null (not zero).
 * NOT_AGGREGATED KPI = null actual + null achievementPct.
 */
export function normalizeExecutiveMetricRecord(
  actualRaw:  unknown,
  targetRaw:  unknown,
  meta:       ExecutiveKpiMeta,
): NormalizedMetricRecord {
  // NOT_AGGREGATED: KPI exists but engine can't score it yet
  if (meta.aggregationType === 'NOT_AGGREGATED') {
    return {
      actual:          null,
      target:          null,
      achievementPct:  null,
      aggregationType: 'NOT_AGGREGATED',
      polarity:         meta.polarity,
      portfolioWeight: meta.portfolioWeight,
      status:          null,
    }
  }

  // Parse actual — null means "no data", distinct from 0
  const actual: number | null = (actualRaw === null || actualRaw === undefined)
    ? null
    : Number(actualRaw)

  // Parse target — null means "no target set"
  const target: number | null = (targetRaw === null || targetRaw === undefined || Number(targetRaw) === 0)
    ? null
    : Number(targetRaw)

  const achievementPct = safeAchievementPct(actual, target)

  return {
    actual,
    target,
    achievementPct,
    aggregationType:  meta.aggregationType,
    polarity:          meta.polarity,
    portfolioWeight:  meta.portfolioWeight,
    status:           deriveStatus(achievementPct),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — FLAT LEGACY SHAPE NORMALIZATION
// ══════════════════════════════════════════════════════════════

/**
 * Normalize a legacy flat entry aggregation + target into the
 * canonical metrics map.
 *
 * Works with the existing 5-core-KPI flat shape:
 *   { wasfaty: 200, omni: 100, ... } + { wasfatyTarget: 800, ... }
 *
 * Also supports arbitrary custom KPI fields found in the entry.
 *
 * @param aggregatedActuals  - Summed/aggregated actuals per KPI key
 * @param targetDoc          - Monthly target document
 * @param metaMap            - Map of KPI key → ExecutiveKpiMeta
 */
export function normalizeLegacyFlatMetrics(
  aggregatedActuals:  Record<string, number | null>,
  targetDoc:          LegacyTargetDoc | null,
  metaMap:            Record<string, ExecutiveKpiMeta>,
): Record<string, NormalizedMetricRecord> {
  const result: Record<string, NormalizedMetricRecord> = {}

  for (const [key, meta] of Object.entries(metaMap)) {
    const engineKey = key   // in this context keys are already engine keys
    const targetFieldName = `${engineKey}Target`

    // Legacy target field lookup: omniTarget, wasfatyTarget, etc.
    // crossSelling uses 'crossSellTarget' (legacy naming inconsistency)
    const legacyTargetKey = engineKey === 'crossSelling' ? 'crossSellTarget' : targetFieldName

    const actualRaw = aggregatedActuals[engineKey] ?? null
    const targetRaw = targetDoc ? (targetDoc[legacyTargetKey] ?? null) : null

    result[key] = normalizeExecutiveMetricRecord(actualRaw, targetRaw, meta)
  }

  return result
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Validate that executive-enabled KPI portfolio weights sum to 1.0 (±0.01).
 *
 * Only checks KPIs where:
 *   - executiveEnabled = true
 *   - aggregationType ≠ NOT_AGGREGATED
 *   - isCore = true (non-core custom KPIs carry weight=0 by design)
 */
export function validateExecutiveKpiWeights(
  metaMap: Record<string, ExecutiveKpiMeta>,
): { valid: boolean; total: number; delta: number } {
  const total = Object.values(metaMap)
    .filter((m) => m.executiveEnabled && m.isCore && m.aggregationType !== 'NOT_AGGREGATED')
    .reduce((sum, m) => sum + m.portfolioWeight, 0)
  const delta = Math.abs(total - 1.0)
  return { valid: delta <= 0.01, total, delta }
}

/**
 * Get all executive-enabled KPIs from a registry.
 * Returns sorted by: core first (by sortOrder), then non-core.
 */
export function getExecutiveEnabledKpis(
  registry: KpiRegistry,
): KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.visibility.executiveEnabled)
    .sort((a, b) => {
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1
      return a.sortOrder - b.sortOrder
    })
}

/**
 * Build the full executive meta map from a registry.
 * Core KPIs get exact legacy metadata; custom KPIs are derived.
 *
 * This is the main entry point for Phase 4C-X-1 (dynamic engine promotion).
 */
export function buildExecutiveMetaMap(
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): Record<string, ExecutiveKpiMeta> {
  const enabledKpis = getExecutiveEnabledKpis(registry)
  const map: Record<string, ExecutiveKpiMeta> = {}
  for (const kpi of enabledKpis) {
    const meta = buildExecutiveKpiMeta(kpi)
    const engineKey = kpi.aliasFor ?? kpi.key
    map[engineKey] = meta
  }
  return map
}

/**
 * Verify the DEFAULT_KPI_REGISTRY produces a valid executive meta map
 * that matches the existing 5-core-KPI weights exactly.
 *
 * Used as a compatibility assertion during engine promotion.
 */
export function assertLegacyCompatibility(
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): boolean {
  const metaMap = buildExecutiveMetaMap(registry)
  for (const key of KPI_KEYS) {
    const meta = metaMap[key]
    if (!meta) return false
    const legacy = CORE_KPI_EXECUTIVE_META[key]
    if (Math.abs(meta.portfolioWeight - legacy.portfolioWeight) > 0.001) return false
    if (meta.aggregationType !== legacy.aggregationType) return false
    if (meta.polarity !== legacy.polarity) return false
  }
  return true
}
