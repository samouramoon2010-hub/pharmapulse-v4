// ============================================================
// PharmaPulse — Heatmap Selectors
// Phase 4B-1B-α: Pure selectors, no React, no Firestore.
//
// Converts RegionalIntelligenceOutput into canonical HeatmapMatrix
// objects that any heatmap renderer can consume without knowing
// the regional engine internals.
//
// Key design decisions:
//   - Custom KPIs not in KpiRollupSummary → NOT_AGGREGATED (not zero)
//   - Null target → ZERO_VALUE (data exists but is 0)
//   - No entries → NO_DATA
//   - KPI not applicable to branch → NOT_APPLICABLE
//   - All sort/filter operations are stable and deterministic
//   - Input objects are never mutated
// ============================================================

import type {
  BranchRollupSummary,
  RegionalIntelligenceOutput,
  KpiRollupSummary,
  RegionalRollupSummary,
} from './regionalTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { KPI_META } from '../kpiAnalyticsEngine'
import type { EmptyCellState } from '../../design/colorScales'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — CANONICAL MATRIX SHAPE
// ══════════════════════════════════════════════════════════════

/**
 * A heatmap cell representing one (row, col) intersection.
 *
 * value:   The numeric value to display (achievement % or raw score).
 *          null means the cell has no computable value (see emptyCellState).
 * status:  Traffic-light status string ('excellent'|'good'|'warning'|'critical').
 *          Empty/null cells carry an emptyCellState instead.
 * emptyCellState: Semantic reason for a null cell (only set when value is null).
 * meta:    Optional pass-through data for tooltips (actual, target, branchId…).
 */
export interface HeatmapCell {
  row:            string
  col:            string
  value:          number | null
  status:         string | null
  emptyCellState: EmptyCellState | null
  meta?:          Record<string, unknown>
}

/**
 * Canonical heatmap matrix — consumed by any heatmap renderer.
 * Rows are typically branches; columns are KPIs, time periods,
 * risk categories, or other dimensions.
 */
export interface HeatmapMatrix {
  /** Ordered row identifiers (e.g. branchId values) */
  rowKeys:    string[]
  /** Ordered row display labels (e.g. branch names) */
  rowLabels:  string[]
  /** Ordered column identifiers (e.g. KPI engine keys) */
  colKeys:    string[]
  /** Ordered column display labels (e.g. KPI short names) */
  colLabels:  string[]
  /** Flat cell array — length = rowKeys.length × colKeys.length */
  cells:      HeatmapCell[]
  /** Recommended color scale for this matrix */
  scale:      'categorical' | 'continuous' | 'diverging'
  /** [min, max] data range — ignores null cells */
  range:      [number, number]
  /** ISO timestamp of the underlying data */
  generatedAt: string
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — SELECTOR OPTIONS
// ══════════════════════════════════════════════════════════════

export type BranchSortKey =
  | 'name'           // alphabetical by branch name
  | 'score'          // descending by branchScore
  | 'achievement'    // descending by overallAchievementPct
  | 'risk'           // ascending by risk level severity
  | 'region'         // alphabetical by region, then name

export type ColumnSortKey =
  | 'default'        // preserve input kpiKeys order
  | 'achievement'    // descending by mean achievement across all branches
  | 'name'           // alphabetical by KPI label

export interface BranchKpiMatrixOptions {
  /** Sort order for rows (branches). Default: 'name' */
  rowSort?:    BranchSortKey
  /** Sort order for columns (KPIs). Default: 'default' */
  colSort?:    ColumnSortKey
  /** Filter to specific region(s). Empty/absent = all regions */
  regions?:    string[]
  /** Recommended color scale. Default: 'categorical' */
  scale?:      'categorical' | 'continuous' | 'diverging'
  /** When true, include only branches with at least 1 entry */
  activeOnly?: boolean
}

export interface RiskMatrixOptions {
  /** Sort order for rows. Default: 'risk' */
  rowSort?:    BranchSortKey
  regions?:    string[]
  activeOnly?: boolean
}

export interface BranchTrendMatrixOptions {
  rowSort?:    BranchSortKey
  regions?:    string[]
  activeOnly?: boolean
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════

/** Risk level → numeric severity (higher = worse, for sorting) */
const RISK_SEVERITY: Record<string, number> = {
  HIGH_RISK:   3,
  MEDIUM_RISK: 2,
  LOW_RISK:    1,
  ON_TRACK:    0,
}

/** Momentum direction → numeric score (higher = better) */
const MOMENTUM_SCORE: Record<string, number> = {
  ACCELERATING:      5,
  IMPROVING:         4,
  STABLE:            3,
  DECLINING:         2,
  DETERIORATING:     1,
  INSUFFICIENT_DATA: 0,
}

/**
 * Stable sort for BranchRollupSummary[].
 * Returns a new array (never mutates input).
 */
function sortBranches(
  branches: readonly BranchRollupSummary[],
  sortKey:  BranchSortKey,
): BranchRollupSummary[] {
  const copy = [...branches]
  copy.sort((a, b) => {
    switch (sortKey) {
      case 'score':
        return (b.branchScore - a.branchScore) || a.branchName.localeCompare(b.branchName)
      case 'achievement':
        return (b.overallAchievementPct - a.overallAchievementPct) || a.branchName.localeCompare(b.branchName)
      case 'risk':
        return ((RISK_SEVERITY[b.riskLevel] ?? 0) - (RISK_SEVERITY[a.riskLevel] ?? 0))
          || a.branchName.localeCompare(b.branchName)
      case 'region':
        return a.region.localeCompare(b.region) || a.branchName.localeCompare(b.branchName)
      case 'name':
      default:
        return a.branchName.localeCompare(b.branchName)
    }
  })
  return copy
}

/**
 * Find a KpiRollupSummary by KPI key from a branch's kpiAchievementSummary.
 * Returns null when the KPI is not aggregated (custom KPI gap).
 */
function findKpiSummary(
  branch:  BranchRollupSummary,
  kpiKey:  string,
): KpiRollupSummary | null {
  return branch.kpiAchievementSummary.find((s) => s.kpiKey === kpiKey) ?? null
}

/**
 * Determine the display label for a KPI key.
 * Uses KPI_META for core keys; falls back to the key itself for custom.
 */
function kpiLabel(key: string): string {
  return (KPI_META as Record<string, { en: string }>)[key]?.en ?? key
}

/**
 * Resolve the numeric cell value and empty-cell state for a
 * branch × KPI intersection.
 */
function resolveKpiCell(
  branch:  BranchRollupSummary,
  kpiKey:  string,
): { value: number | null; status: string | null; emptyCellState: EmptyCellState | null } {
  // Case 1: branch has no entries at all → NO_DATA for every KPI
  if (branch.operationalStatus === 'NO_DATA') {
    return { value: null, status: null, emptyCellState: 'NO_DATA' }
  }

  // Case 2: look up the rollup summary. Presence here means the KPI was
  // aggregated by generateBranchRollup — either a core engine key, or a
  // dynamic/custom KPI that was included because a live KpiRegistry was
  // passed in. Absence means it was never aggregated (custom KPI with no
  // registry supplied, or excluded by registry lifecycle stage) →
  // NOT_AGGREGATED, not a missing-data error.
  const kpiSummary = findKpiSummary(branch, kpiKey)
  if (!kpiSummary) {
    return { value: null, status: null, emptyCellState: 'NOT_AGGREGATED' }
  }

  // Case 4: achievement is 0 — distinguish zero from no-data
  if (kpiSummary.achievementPct === 0 && kpiSummary.actual === 0 && !kpiSummary.hasTarget) {
    // Zero actual + no target → true NO_DATA for this KPI
    return { value: 0, status: 'critical', emptyCellState: 'ZERO_VALUE' }
  }

  if (kpiSummary.achievementPct === 0 && kpiSummary.actual === 0 && kpiSummary.hasTarget) {
    // Zero actual WITH target → ZERO_VALUE (submitted but no output)
    return { value: 0, status: 'critical', emptyCellState: 'ZERO_VALUE' }
  }

  // Case 5: normal value
  return {
    value:          kpiSummary.achievementPct,
    status:         kpiSummary.status,
    emptyCellState: null,
  }
}

/**
 * Compute [min, max] range from cell values (ignores nulls).
 */
function computeRange(cells: HeatmapCell[]): [number, number] {
  const values = cells.map((c) => c.value).filter((v): v is number => v !== null)
  if (!values.length) return [0, 100]
  return [Math.min(...values), Math.max(...values)]
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — BRANCH × KPI MATRIX
// ══════════════════════════════════════════════════════════════

/**
 * Build a Branch × KPI achievement heatmap matrix.
 *
 * Rows  = branches (from branchRollups)
 * Cols  = KPI keys
 *
 * Cell value = achievementPct for core KPIs,
 *              null + NOT_AGGREGATED for custom KPIs,
 *              null + NO_DATA when branch has no entries.
 *
 * @param branchRollups  - Array of branch rollup summaries
 * @param kpiKeys        - Ordered list of KPI keys to include as columns
 * @param options        - Filtering, sorting, and scale options
 */
export function buildBranchKpiMatrix(
  branchRollups: readonly BranchRollupSummary[],
  kpiKeys:       readonly string[],
  options:       BranchKpiMatrixOptions = {},
): HeatmapMatrix {
  const {
    rowSort    = 'name',
    colSort    = 'default',
    regions    = [],
    scale      = 'categorical',
    activeOnly = false,
  } = options

  // ── Filter branches ──────────────────────────────────────
  let filtered: BranchRollupSummary[] = branchRollups.filter((b) => {
    if (regions.length > 0 && !regions.includes(b.region)) return false
    if (activeOnly && b.operationalStatus === 'NO_DATA') return false
    return true
  })

  // ── Sort branches ────────────────────────────────────────
  filtered = sortBranches(filtered, rowSort)

  // ── Resolve column order ──────────────────────────────────
  let colOrder = [...kpiKeys]
  if (colSort === 'name') {
    colOrder = colOrder.slice().sort((a, b) => kpiLabel(a).localeCompare(kpiLabel(b)))
  } else if (colSort === 'achievement') {
    // Sort by mean achievement across all branches (descending)
    colOrder = colOrder.slice().sort((a, b) => {
      const meanA = meanAchievementForKey(filtered, a)
      const meanB = meanAchievementForKey(filtered, b)
      return meanB - meanA
    })
  }

  // ── Build cells ───────────────────────────────────────────
  const cells: HeatmapCell[] = []
  for (const branch of filtered) {
    for (const kpiKey of colOrder) {
      const resolved = resolveKpiCell(branch, kpiKey)
      cells.push({
        row:            branch.branchId,
        col:            kpiKey,
        value:          resolved.value,
        status:         resolved.status,
        emptyCellState: resolved.emptyCellState,
        meta: {
          branchName:    branch.branchName,
          branchCode:    branch.branchCode,
          region:        branch.region,
          branchScore:   branch.branchScore,
          riskLevel:     branch.riskLevel,
          kpiLabel:      kpiLabel(kpiKey),
          actual:        findKpiSummary(branch, kpiKey)?.actual    ?? null,
          target:        findKpiSummary(branch, kpiKey)?.target    ?? null,
          hasTarget:     findKpiSummary(branch, kpiKey)?.hasTarget ?? false,
        },
      })
    }
  }

  return {
    rowKeys:     filtered.map((b) => b.branchId),
    rowLabels:   filtered.map((b) => b.branchName),
    colKeys:     colOrder,
    colLabels:   colOrder.map(kpiLabel),
    cells,
    scale,
    range:       computeRange(cells),
    generatedAt: filtered[0]?.generatedAt ?? new Date().toISOString(),
  }
}

/** Compute mean achievementPct for a given KPI key across branches (ignores nulls) */
function meanAchievementForKey(branches: BranchRollupSummary[], kpiKey: string): number {
  const vals = branches
    .map((b) => findKpiSummary(b, kpiKey)?.achievementPct ?? null)
    .filter((v): v is number => v !== null)
  if (!vals.length) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — RISK MATRIX (Branch × Risk Dimension)
// ══════════════════════════════════════════════════════════════

/** Risk dimension keys for the risk heatmap columns */
export const RISK_DIMENSION_KEYS = [
  'riskLevel',
  'branchScore',
  'submissionRate',
  'dataErrors',
  'momentumDirection',
  'overallAchievement',
] as const

export type RiskDimensionKey = typeof RISK_DIMENSION_KEYS[number]

const RISK_DIMENSION_LABELS: Record<RiskDimensionKey, string> = {
  riskLevel:          'Risk Level',
  branchScore:        'Branch Score',
  submissionRate:     'Submission Rate',
  dataErrors:         'Data Errors',
  momentumDirection:  'Momentum',
  overallAchievement: 'Achievement',
}

/**
 * Map a risk dimension to a cell value and status.
 * All values are normalised to 0..100 for color scale consistency.
 */
function resolveRiskDimensionCell(
  branch: BranchRollupSummary,
  dim:    RiskDimensionKey,
): { value: number | null; status: string | null; emptyCellState: EmptyCellState | null } {
  switch (dim) {
    case 'riskLevel': {
      // Invert: 0 = ON_TRACK (good), 100 = HIGH_RISK (bad)
      const severity = RISK_SEVERITY[branch.riskLevel] ?? 0
      const value    = (severity / 3) * 100  // 0, 33, 66, 100
      const statusMap: Record<string, string> = {
        ON_TRACK:    'excellent',
        LOW_RISK:    'good',
        MEDIUM_RISK: 'warning',
        HIGH_RISK:   'critical',
      }
      return { value, status: statusMap[branch.riskLevel] ?? 'warning', emptyCellState: null }
    }
    case 'branchScore':
      return {
        value:  branch.branchScore,
        status: branch.branchScore >= 80 ? 'excellent'
               : branch.branchScore >= 65 ? 'good'
               : branch.branchScore >= 45 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    case 'submissionRate':
      if (branch.operationalStatus === 'NO_DATA') return { value: 0, status: 'critical', emptyCellState: 'NO_DATA' }
      return {
        value:  branch.submissionRatePct,
        status: branch.submissionRatePct >= 80 ? 'excellent'
               : branch.submissionRatePct >= 60 ? 'good'
               : branch.submissionRatePct >= 40 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    case 'dataErrors':
      return {
        value:  branch.hasDataErrors ? 0 : 100,
        status: branch.hasDataErrors ? 'critical' : 'excellent',
        emptyCellState: null,
      }
    case 'momentumDirection': {
      const score  = MOMENTUM_SCORE[branch.momentumDirection] ?? 0
      const value  = (score / 5) * 100
      const statusMap: Record<number, string> = { 5: 'excellent', 4: 'excellent', 3: 'good', 2: 'warning', 1: 'critical', 0: 'warning' }
      return { value, status: statusMap[score] ?? 'warning', emptyCellState: null }
    }
    case 'overallAchievement':
      return {
        value:  branch.overallAchievementPct,
        status: branch.overallAchievementPct >= 90 ? 'excellent'
               : branch.overallAchievementPct >= 70 ? 'good'
               : branch.overallAchievementPct >= 50 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    default:
      return { value: null, status: null, emptyCellState: 'NOT_APPLICABLE' }
  }
}

/**
 * Build a Branch × Risk Dimension heatmap matrix.
 *
 * Rows  = branches
 * Cols  = fixed risk dimensions (riskLevel, branchScore, submissionRate, …)
 *
 * All values normalised to 0..100 for consistent color mapping.
 */
export function buildRiskMatrix(
  branchRollups: readonly BranchRollupSummary[],
  options:       RiskMatrixOptions = {},
): HeatmapMatrix {
  const { rowSort = 'risk', regions = [], activeOnly = false } = options

  let filtered = branchRollups.filter((b) => {
    if (regions.length > 0 && !regions.includes(b.region)) return false
    if (activeOnly && b.operationalStatus === 'NO_DATA') return false
    return true
  })
  filtered = sortBranches(filtered, rowSort)

  const cols = [...RISK_DIMENSION_KEYS]
  const cells: HeatmapCell[] = []

  for (const branch of filtered) {
    for (const dim of cols) {
      const resolved = resolveRiskDimensionCell(branch, dim)
      cells.push({
        row:            branch.branchId,
        col:            dim,
        value:          resolved.value,
        status:         resolved.status,
        emptyCellState: resolved.emptyCellState,
        meta: {
          branchName:  branch.branchName,
          region:      branch.region,
          riskLevel:   branch.riskLevel,
          momentum:    branch.momentumDirection,
          branchScore: branch.branchScore,
          dimLabel:    RISK_DIMENSION_LABELS[dim],
        },
      })
    }
  }

  return {
    rowKeys:     filtered.map((b) => b.branchId),
    rowLabels:   filtered.map((b) => b.branchName),
    colKeys:     cols,
    colLabels:   cols.map((k) => RISK_DIMENSION_LABELS[k]),
    cells,
    scale:       'categorical',
    range:       computeRange(cells),
    generatedAt: filtered[0]?.generatedAt ?? new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — BRANCH TREND MATRIX (Branch × Trend Dimensions)
// ══════════════════════════════════════════════════════════════

/** Trend dimension keys for the trend heatmap */
export const TREND_DIMENSION_KEYS = [
  'momentum',
  'overallAchievement',
  'branchScore',
  'submissionRate',
  'riskTrend',
] as const

export type TrendDimensionKey = typeof TREND_DIMENSION_KEYS[number]

const TREND_DIMENSION_LABELS: Record<TrendDimensionKey, string> = {
  momentum:           'Momentum',
  overallAchievement: 'Achievement',
  branchScore:        'Branch Score',
  submissionRate:     'Submission',
  riskTrend:          'Risk Trend',
}

function resolveTrendDimensionCell(
  branch: BranchRollupSummary,
  dim:    TrendDimensionKey,
): { value: number | null; status: string | null; emptyCellState: EmptyCellState | null } {
  if (branch.operationalStatus === 'NO_DATA') {
    return { value: null, status: null, emptyCellState: 'NO_DATA' }
  }

  switch (dim) {
    case 'momentum': {
      const score = MOMENTUM_SCORE[branch.momentumDirection] ?? 0
      return {
        value:  (score / 5) * 100,
        status: score >= 4 ? 'excellent' : score >= 3 ? 'good' : score >= 2 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    }
    case 'overallAchievement':
      return {
        value:  branch.overallAchievementPct,
        status: branch.overallAchievementPct >= 90 ? 'excellent'
               : branch.overallAchievementPct >= 70 ? 'good'
               : branch.overallAchievementPct >= 50 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    case 'branchScore':
      return {
        value:  branch.branchScore,
        status: branch.branchScore >= 80 ? 'excellent'
               : branch.branchScore >= 65 ? 'good'
               : branch.branchScore >= 45 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    case 'submissionRate':
      return {
        value:  branch.submissionRatePct,
        status: branch.submissionRatePct >= 80 ? 'excellent'
               : branch.submissionRatePct >= 60 ? 'good'
               : branch.submissionRatePct >= 40 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    case 'riskTrend': {
      // Invert risk: lower risk = higher score
      const sev = RISK_SEVERITY[branch.riskLevel] ?? 0
      const val = (1 - sev / 3) * 100
      return {
        value:  val,
        status: sev === 0 ? 'excellent' : sev === 1 ? 'good' : sev === 2 ? 'warning' : 'critical',
        emptyCellState: null,
      }
    }
    default:
      return { value: null, status: null, emptyCellState: 'NOT_APPLICABLE' }
  }
}

/**
 * Build a Branch × Trend Dimensions heatmap matrix.
 * Useful for spotting where momentum is dying across branches.
 *
 * NOTE: This is the current-period trend snapshot.
 * A week-over-week time-axis trend heatmap requires pre-aggregated
 * history data — deferred to Phase 4B-1B-δ.
 */
export function buildBranchTrendMatrix(
  branchRollups: readonly BranchRollupSummary[],
  options:       BranchTrendMatrixOptions = {},
): HeatmapMatrix {
  const { rowSort = 'score', regions = [], activeOnly = false } = options

  let filtered = branchRollups.filter((b) => {
    if (regions.length > 0 && !regions.includes(b.region)) return false
    if (activeOnly && b.operationalStatus === 'NO_DATA') return false
    return true
  })
  filtered = sortBranches(filtered, rowSort)

  const cols = [...TREND_DIMENSION_KEYS]
  const cells: HeatmapCell[] = []

  for (const branch of filtered) {
    for (const dim of cols) {
      const resolved = resolveTrendDimensionCell(branch, dim)
      cells.push({
        row:            branch.branchId,
        col:            dim,
        value:          resolved.value,
        status:         resolved.status,
        emptyCellState: resolved.emptyCellState,
        meta: {
          branchName:  branch.branchName,
          region:      branch.region,
          momentum:    branch.momentumDirection,
          riskLevel:   branch.riskLevel,
          branchScore: branch.branchScore,
          dimLabel:    TREND_DIMENSION_LABELS[dim],
        },
      })
    }
  }

  return {
    rowKeys:     filtered.map((b) => b.branchId),
    rowLabels:   filtered.map((b) => b.branchName),
    colKeys:     cols,
    colLabels:   cols.map((k) => TREND_DIMENSION_LABELS[k]),
    cells,
    scale:       'diverging',
    range:       computeRange(cells),
    generatedAt: filtered[0]?.generatedAt ?? new Date().toISOString(),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — CONVENIENCE: REGIONAL INTELLIGENCE → MATRIX
// ══════════════════════════════════════════════════════════════

/**
 * Build a Branch × KPI matrix directly from a
 * RegionalIntelligenceOutput. Extracts branchRollups from the
 * regionalSummaries via reconstructed branch data.
 *
 * NOTE: RegionalIntelligenceOutput contains RegionalRollupSummary[]
 * (per-region aggregates), not individual BranchRollupSummary[].
 * To build a branch-level heatmap you need the branchRollups array
 * which is the input to generateRegionalIntelligence, not its output.
 * This helper accepts the branchRollups separately for that reason.
 *
 * @param branchRollups  - The original branch-level inputs
 * @param kpiKeys        - KPI keys to include
 * @param options        - Matrix options
 */
export function buildBranchKpiMatrixFromIntel(
  branchRollups: readonly BranchRollupSummary[],
  _intel:        RegionalIntelligenceOutput,  // reserved for future enrichment
  kpiKeys:       readonly string[],
  options:       BranchKpiMatrixOptions = {},
): HeatmapMatrix {
  return buildBranchKpiMatrix(branchRollups, kpiKeys, options)
}

// ── Convenience re-export for consumers ──────────────────────
export type { EmptyCellState } from '../../design/colorScales'
