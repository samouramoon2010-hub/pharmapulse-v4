// ============================================================
// Dependency Intelligence Engine
// Sprint 1: Team Dependency Intelligence + Single Performer Risk
//
// SAFETY REQUIREMENTS (consistent with Phase 4A / branchIntelligenceSelectors):
//   - Pure functions only
//   - No Firestore imports
//   - No React imports
//   - No UI imports
//   - No side effects
//   - No mutation of inputs
//   - No date/time dependency
//   - No global state
//
// Input:  contributionByKpi — already computed by branchIntelligenceSelectors
//         and surfaced on BranchIntelligenceViewModel. Zero new Firestore reads.
// Output: DependencyIntelligenceResult consumed by useBranchIntelligenceData.
// ============================================================

import type { KpiKey } from '../kpiAnalyticsEngine'
import type { KpiContributionEntry } from '../branchIntelligence/branchIntelligenceTypes'
import type {
  KpiDependencyEntry,
  DependencyTier,
  DependencyIntelligenceResult,
} from './dependencyIntelligenceTypes'

// ── Severity ordering — used only internally for branch roll-up ──
const TIER_SEVERITY: Record<DependencyTier, number> = {
  healthy:  0,
  moderate: 1,
  high:     2,
  critical: 3,
}

// ══════════════════════════════════════════════════════════════
// computeTier — exported for direct unit testing
// ══════════════════════════════════════════════════════════════

/**
 * Map a contribution percentage to a DependencyTier.
 *
 *   pct < 40  → healthy
 *   pct < 60  → moderate
 *   pct < 80  → high
 *   pct >= 80 → critical
 */
export function computeTier(pct: number): DependencyTier {
  if (pct >= 80) return 'critical'
  if (pct >= 60) return 'high'
  if (pct >= 40) return 'moderate'
  return 'healthy'
}

// ══════════════════════════════════════════════════════════════
// buildSummaryText — internal, template-based
// ══════════════════════════════════════════════════════════════

function buildSummaryText(
  tier: DependencyTier,
  criticalCount: number,
  highCount: number,
  moderateCount: number,
  kpiDeps: KpiDependencyEntry[],
): string {
  if (tier === 'healthy') {
    return 'No concentration risk across all KPIs. Team load is well distributed.'
  }

  // Find the most concentrated contributor name across critical/high KPIs
  const dominantEntry = [...kpiDeps]
    .filter((e) => e.dependencyTier === 'critical' || e.dependencyTier === 'high')
    .sort((a, b) => b.highestContributionPct - a.highestContributionPct)[0]
  const dominantName = dominantEntry?.topContributorName ?? null

  if (tier === 'critical') {
    const kpiText = criticalCount === 1 ? '1 KPI' : `${criticalCount} KPIs`
    return dominantName
      ? `Performance is concentrated around ${dominantName} across ${kpiText}. Consider improving team contribution balance.`
      : `Performance is concentrated on a single pharmacist across ${kpiText}. Consider improving team contribution balance.`
  }

  if (tier === 'high') {
    const n = highCount + criticalCount
    const kpiText = n === 1 ? '1 KPI shows' : `${n} KPIs show`
    return dominantName
      ? `${kpiText} high contribution concentration around ${dominantName}. Consider improving team contribution balance.`
      : `${kpiText} high contribution concentration. Consider improving team contribution balance.`
  }

  // moderate
  return `${moderateCount} KPI${moderateCount > 1 ? 's' : ''} show${moderateCount === 1 ? 's' : ''} moderate contribution concentration. Monitor team load distribution.`
}

// ══════════════════════════════════════════════════════════════
// computeDependencyIntelligence — main export
// ══════════════════════════════════════════════════════════════

/**
 * Compute branch-wide dependency intelligence from the already-computed
 * contributionByKpi map on BranchIntelligenceViewModel.
 *
 * Only processes KPIs with branch total actual > 0 (inactive KPIs
 * with no submissions are excluded to avoid noise).
 *
 * Pure: no side effects, no I/O, deterministic.
 */
export function computeDependencyIntelligence(
  contributionByKpi: Record<KpiKey, KpiContributionEntry[]>,
): DependencyIntelligenceResult {
  const kpiDependencies: KpiDependencyEntry[] = []

  for (const [kpiKey, entries] of Object.entries(contributionByKpi)) {
    if (entries.length === 0) continue

    // Exclude KPIs with no actual contributions this month
    const totalActual = entries.reduce((s, e) => s + e.actual, 0)
    if (totalActual === 0) continue

    const highestContributionPct = Math.max(...entries.map((e) => e.contributionPct))
    const topEntry = entries.find((e) => e.isTopContributor) ?? null

    kpiDependencies.push({
      kpiKey,
      highestContributionPct,
      topContributorId:   topEntry?.pharmacistId   ?? null,
      topContributorName: topEntry?.pharmacistName ?? null,
      dependencyTier:     computeTier(highestContributionPct),
      teamSize:           entries.length,
    })
  }

  // Branch-level roll-up: most severe tier across all active KPIs
  const branchDependencyTier: DependencyTier = kpiDependencies.reduce<DependencyTier>(
    (maxTier, entry) =>
      TIER_SEVERITY[entry.dependencyTier] > TIER_SEVERITY[maxTier]
        ? entry.dependencyTier
        : maxTier,
    'healthy',
  )

  const criticalKpiCount = kpiDependencies.filter((e) => e.dependencyTier === 'critical').length
  const highKpiCount     = kpiDependencies.filter((e) => e.dependencyTier === 'high').length
  const moderateKpiCount = kpiDependencies.filter((e) => e.dependencyTier === 'moderate').length

  return {
    kpiDependencies,
    branchDependencyTier,
    summaryText: buildSummaryText(
      branchDependencyTier,
      criticalKpiCount,
      highKpiCount,
      moderateKpiCount,
      kpiDependencies,
    ),
    criticalKpiCount,
    highKpiCount,
    moderateKpiCount,
  }
}
