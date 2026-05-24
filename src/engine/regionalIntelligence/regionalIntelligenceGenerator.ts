// ============================================================
// Regional Intelligence Generator — Unified Orchestrator
// Combines regionalRollupEngine, regionalTrendEngine, and
// regionalRiskEngine into one cohesive intelligence output.
//
// Pure functions only — no Firebase, no React, no AI.
// No business logic is duplicated here — this layer is pure
// orchestration and aggregation of engine outputs.
//
// TODO(future): Persist RegionalIntelligenceOutput to a
//   `regional_intelligence_cache` Firestore document so the
//   executive dashboard can hydrate from cache on load without
//   re-running all engines client-side.
//
// TODO(future): Expose as a server-side Cloud Function endpoint
//   (e.g. `GET /api/regional-intelligence?month=2025-05`) that
//   returns a cached RegionalIntelligenceOutput and triggers
//   background re-computation when stale.
//
// TODO(future): After each scheduled regional aggregation job,
//   write a RegionalIntelligenceSnapshot to the
//   `regional_snapshots` Firestore collection so trend engines
//   have a true historical baseline rather than single-period
//   current vs previous comparison.
//
// TODO(future): Stream RegionalIntelligenceOutput to a BigQuery
//   regional_intelligence table for warehouse-level analysis,
//   quarterly executive reporting, and cross-region benchmarks.
// ============================================================

import { generateRegionalRollups }   from './regionalRollupEngine'
import { analyzeAllRegionalTrends }  from './regionalTrendEngine'
import { assessAllRegionalRisks }    from './regionalRiskEngine'

import type {
  RegionalIntelligenceInput,
  RegionalIntelligenceOutput,
  RegionalRollupSummary,
  RegionalTrendAnalysis,
  RegionalRiskAssessment,
  PortfolioRegionalSummary,
  ExecutiveFocusArea,
  PortfolioDataQualityWarning,
  DataQualityFlag,
} from './regionalTypes'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — PORTFOLIO REGIONAL SUMMARY
// ══════════════════════════════════════════════════════════════

/**
 * Build a cross-regional portfolio overview from the three engine outputs.
 * No business logic here — aggregates already-computed fields.
 */
function buildPortfolioRegionalSummary(
  summaries: RegionalRollupSummary[],
  trends:    RegionalTrendAnalysis[],
  risks:     RegionalRiskAssessment[],
): PortfolioRegionalSummary {
  if (!summaries.length) {
    return {
      totalRegions:         0,
      totalBranches:        0,
      activeBranches:       0,
      inactiveBranches:     0,
      averageRegionalScore: 0,
      highestRiskRegions:   [],
      strongestRegions:     [],
      weakestRegions:       [],
      volatileRegions:      [],
      recoveringRegions:    [],
    }
  }

  // ── Totals ───────────────────────────────────────────────────
  const totalBranches   = summaries.reduce((s, r) => s + r.branchCount, 0)
  const activeBranches  = summaries.reduce((s, r) => s + r.activeBranches, 0)
  const inactiveBranches = summaries.reduce((s, r) => s + r.inactiveBranches, 0)

  // ── Average regional score (weighted by branch count) ────────
  // Weight by branch count so large regions aren't diluted by small ones
  const totalWeight    = summaries.reduce((s, r) => s + Math.max(1, r.activeBranches), 0)
  const weightedScores = summaries.reduce(
    (s, r) => s + r.regionalScore * Math.max(1, r.activeBranches),
    0,
  )
  const averageRegionalScore = totalWeight > 0
    ? Math.round(weightedScores / totalWeight)
    : 0

  // ── Highest-risk regions ──────────────────────────────────────
  // Regions with CRITICAL/ELEVATED warnings OR HIGH_RISK level
  const riskSet = new Set(
    risks
      .filter(
        (r) =>
          r.regionalRiskLevel === 'HIGH_RISK' ||
          r.executiveWarnings.some((w) => w.severity === 'CRITICAL' || w.severity === 'ELEVATED'),
      )
      .map((r) => r.regionName),
  )
  const highestRiskRegions = [...riskSet].sort()

  // ── Strongest regions (top 3 by score) ───────────────────────
  const strongestRegions = [...summaries]
    .sort((a, b) => b.regionalScore - a.regionalScore)
    .slice(0, 3)
    .map((r) => r.regionName)

  // ── Weakest regions (bottom 3 by score, only active regions) ─
  const weakestRegions = [...summaries]
    .filter((r) => r.activeBranches > 0)
    .sort((a, b) => a.regionalScore - b.regionalScore)
    .slice(0, 3)
    .map((r) => r.regionName)

  // ── Volatile and recovering regions (from trend engine) ───────
  const volatileRegions   = trends
    .filter((t) => t.trendDirection === 'VOLATILE')
    .map((t) => t.regionName)
    .sort()

  const recoveringRegions = trends
    .filter((t) => t.trendDirection === 'RECOVERY')
    .map((t) => t.regionName)
    .sort()

  return {
    totalRegions:  summaries.length,
    totalBranches,
    activeBranches,
    inactiveBranches,
    averageRegionalScore,
    highestRiskRegions,
    strongestRegions,
    weakestRegions,
    volatileRegions,
    recoveringRegions,
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — RECOMMENDED EXECUTIVE FOCUS AREAS
// ══════════════════════════════════════════════════════════════

/**
 * Build a prioritised list of regions requiring executive attention.
 *
 * Priority order (first match wins for each region):
 *   1. CRITICAL executive warnings
 *   2. ELEVATED executive warnings
 *   3. High-risk concentration (>= 40% HIGH_RISK)
 *   4. Weak KPI cluster (>= 2 KPIs below 60%)
 *   5. Sustained stress signal
 *   6. Poor data quality (ERROR flags present)
 *
 * Each region appears at most once — the highest-urgency signal wins.
 * Output is sorted: CRITICAL → HIGH → MEDIUM, then alphabetically.
 */
function buildExecutiveFocusAreas(
  risks:   RegionalRiskAssessment[],
  trends:  RegionalTrendAnalysis[],
): ExecutiveFocusArea[] {
  const trendMap = new Map(trends.map((t) => [t.regionName, t]))
  const areas:    ExecutiveFocusArea[] = []
  const seen = new Set<string>()

  // ── 1. CRITICAL warnings ────────────────────────────────────
  for (const risk of risks) {
    const critical = risk.executiveWarnings.find((w) => w.severity === 'CRITICAL')
    if (critical && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'Critical executive warning',
        urgency:    'CRITICAL',
        detail:     critical.description,
      })
      seen.add(risk.regionName)
    }
  }

  // ── 2. ELEVATED warnings ────────────────────────────────────
  for (const risk of risks) {
    const elevated = risk.executiveWarnings.find((w) => w.severity === 'ELEVATED')
    if (elevated && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'Elevated executive warning',
        urgency:    'HIGH',
        detail:     elevated.description,
      })
      seen.add(risk.regionName)
    }
  }

  // ── 3. High-risk concentration ──────────────────────────────
  for (const risk of risks) {
    const reason = risk.riskReasons.find((r) => r.code === 'HIGH_RISK_CONCENTRATION')
    if (reason && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'High-risk branch concentration',
        urgency:    'HIGH',
        detail:     reason.description,
      })
      seen.add(risk.regionName)
    }
  }

  // ── 4. Weak KPI cluster ─────────────────────────────────────
  for (const risk of risks) {
    const reason = risk.riskReasons.find((r) => r.code === 'WEAK_KPI_CLUSTER')
    if (reason && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'Underperforming KPI cluster',
        urgency:    'HIGH',
        detail:     reason.description,
      })
      seen.add(risk.regionName)
    }
  }

  // ── 5. Sustained stress signal ──────────────────────────────
  for (const risk of risks) {
    const trend = trendMap.get(risk.regionName)
    if (trend?.sustainedStressSignal && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'Sustained operational stress',
        urgency:    'HIGH',
        detail:     trend.trendNarrative,
      })
      seen.add(risk.regionName)
    }
  }

  // ── 6. Poor data quality ────────────────────────────────────
  for (const risk of risks) {
    const reason = risk.riskReasons.find((r) => r.code === 'DATA_QUALITY_RISK')
    if (reason && !seen.has(risk.regionName)) {
      areas.push({
        regionName: risk.regionName,
        reason:     'Data quality concerns',
        urgency:    'MEDIUM',
        detail:     reason.description,
      })
      seen.add(risk.regionName)
    }
  }

  // Sort: CRITICAL → HIGH → MEDIUM, then alphabetically within tier
  const urgencyRank: Record<ExecutiveFocusArea['urgency'], number> = {
    CRITICAL: 2, HIGH: 1, MEDIUM: 0,
  }
  return areas.sort(
    (a, b) =>
      urgencyRank[b.urgency] - urgencyRank[a.urgency] ||
      a.regionName.localeCompare(b.regionName),
  )
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — DATA QUALITY WARNINGS
// ══════════════════════════════════════════════════════════════

/**
 * Collect all regional-level data quality flags into a flat list.
 * Covers: inactive concentration, no-target concentration,
 * high-risk flags, and low data quality flags.
 *
 * Sorted: ERROR first, then WARNING, then INFO; within tier alphabetically.
 */
function collectDataQualityWarnings(
  summaries: RegionalRollupSummary[],
): PortfolioDataQualityWarning[] {
  const warnings: PortfolioDataQualityWarning[] = []

  for (const region of summaries) {
    for (const flag of region.dataQualityFlags) {
      warnings.push({
        regionName:  region.regionName,
        code:        flag.code,
        severity:    flag.severity,
        description: flag.description,
        value:       flag.value,
      })
    }
  }

  const severityOrder: Record<PortfolioDataQualityWarning['severity'], number> = {
    ERROR: 0, WARNING: 1, INFO: 2,
  }

  return warnings.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      a.regionName.localeCompare(b.regionName),
  )
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Generate the unified regional intelligence output for a portfolio.
 *
 * Orchestrates three existing engines in sequence:
 *   1. generateRegionalRollups()     → regional aggregations
 *   2. analyzeAllRegionalTrends()    → trend analysis per region
 *   3. assessAllRegionalRisks()      → risk assessment per region
 *
 * Then derives:
 *   4. portfolioRegionalSummary      → cross-regional overview
 *   5. recommendedExecutiveFocusAreas → prioritised attention list
 *   6. dataQualityWarnings           → aggregated quality flags
 *
 * @param input - Branch rollups + optional previous rollups + period
 * @returns     RegionalIntelligenceOutput — safe for empty input, never throws
 *
 * @example
 * const intel = generateRegionalIntelligence({ branchRollups })
 * // → intel.portfolioRegionalSummary.totalRegions
 * // → intel.regionalTrends[0].trendDirection
 * // → intel.recommendedExecutiveFocusAreas[0].urgency
 * // → intel.dataQualityWarnings
 */
export function generateRegionalIntelligence(
  input: RegionalIntelligenceInput,
): RegionalIntelligenceOutput {
  const { branchRollups, previousRegionalRollups } = input

  // ── Step 1: Regional rollup aggregation ──────────────────────
  const regionalSummaries = generateRegionalRollups(branchRollups)

  // ── Step 2: Trend analysis ────────────────────────────────────
  const regionalTrends = analyzeAllRegionalTrends(
    regionalSummaries,
    previousRegionalRollups,
  )

  // ── Step 3: Risk assessment ───────────────────────────────────
  const regionalRisks = assessAllRegionalRisks(regionalSummaries, regionalTrends)

  // ── Step 4: Portfolio summary ─────────────────────────────────
  const portfolioRegionalSummary = buildPortfolioRegionalSummary(
    regionalSummaries,
    regionalTrends,
    regionalRisks,
  )

  // ── Step 5: Executive focus areas ─────────────────────────────
  const recommendedExecutiveFocusAreas = buildExecutiveFocusAreas(
    regionalRisks,
    regionalTrends,
  )

  // ── Step 6: Data quality warnings ────────────────────────────
  const dataQualityWarnings = collectDataQualityWarnings(regionalSummaries)

  return {
    regionalSummaries,
    regionalTrends,
    regionalRisks,
    portfolioRegionalSummary,
    recommendedExecutiveFocusAreas,
    dataQualityWarnings,
    generatedAt: new Date().toISOString(),
  }
}
