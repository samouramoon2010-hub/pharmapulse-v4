// ============================================================
// Executive Report Generator
// Orchestrates all executive engines → full BranchExecutiveSummary
// and PortfolioExecutiveReport.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META, KPI_WEIGHTS,
  sumKpi, computeAchievementPct, getTrafficLight,
  findWeakestKpi, findStrongestKpi, getDayProgress,
  computeKpiStats, safeReadTarget,
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey } from '../kpiAnalyticsEngine'

import { computeExecutiveScore, scoreToGrade } from './executiveScore'
import { computeBranchTrend }                  from './trendEngine'
import { computeBranchRiskProfile }            from './riskEngine'
import { generateBranchInsights, generatePortfolioInsights } from './insightEngine'
import {
  generateBranchRecommendations,
  generatePortfolioRecommendations,
} from './recommendationEngine'

import type {
  BranchInput,
  ExecutiveReportInput,
  BranchExecutiveSummary,
  ExecutiveReport,
  PortfolioRiskDistribution,
} from './executiveTypes'

// Branch Intelligence Registry Wiring Bundle — registry is optional and
// simply passed through to computeExecutiveScore/computeBranchTrend/
// computeBranchRiskProfile (all already registry-aware since the
// Protected Engines Migration Bundle, Phase C), plus the local
// weakest/strongest kpiStatsMap below, gated by dynamicReaderPilot.
// No call site is required to pass a registry — when omitted, behavior
// is byte-identical to before.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

// ── Single branch summary ─────────────────────────────────────
export function generateBranchSummary(
  branch:     BranchInput,
  reportDate: string,
  reportMonth: string,
  registry?: KpiRegistry,
): BranchExecutiveSummary {
  const dp    = getDayProgress()
  const score = computeExecutiveScore(branch, registry)
  const trend = computeBranchTrend(branch, registry)
  const risk  = computeBranchRiskProfile(branch, registry)

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(branch.mtdEntries[0] ?? null, branch.target ?? null, registry, 'executiveBI')
    : undefined

  // KPI stats map for weakest/strongest detection.
  // Core KPI Dependency Removal — Stage F: widens to every active
  // production_evaluation KPI when a registry is supplied; identical to
  // before (5 Core keys only) when absent.
  const statsKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiStatsMap = Object.fromEntries(
    statsKeys.map((k) => {
      const actual = registry && policy
        ? sumPilotActual(branch.mtdEntries as Record<string, unknown>[], k, registry, policy)
        : sumKpi(branch.mtdEntries, k)
      const legacyTarget = () => branch.target
        ? safeReadTarget(branch.target as any, getKpiMetaForKey(k, registry).targetField)
        : 0
      const target = registry && policy
        ? readPilotTarget(branch.target as Record<string, unknown> | null | undefined, k, registry, policy, legacyTarget)
        : legacyTarget()
      return [k, computeKpiStats(actual, target, dp, k)]
    })
  )

  const weakestKpi   = findWeakestKpi(kpiStatsMap as any, registry)
  const strongestKpi = findStrongestKpi(kpiStatsMap as any, registry)

  // Weighted overall achievement — weight-gated, so KPIs with registry
  // weight 0 (every current non-Core production KPI) contribute 0
  // regardless of achievementPct. Zero-drift today.
  const overallAchPct = Math.round(
    statsKeys.reduce((sum, k) => {
      const s = kpiStatsMap[k]
      const weight = registry ? getKpiWeightForKey(k, registry) : (KPI_WEIGHTS[k] ?? 0.2)
      return sum + (s?.achievementPct ?? 0) * weight
    }, 0)
  )

  const insights        = generateBranchInsights(branch, score, risk, trend)
  const recommendations = generateBranchRecommendations(branch, score, risk, trend)

  return {
    pharmacyId:   branch.pharmacyId,
    pharmacyName: branch.pharmacyName,
    pharmacyCode: branch.pharmacyCode,
    region:       branch.region,
    reportMonth,
    reportDate,
    score,
    weakestKpi,
    strongestKpi,
    overallAchPct,
    riskProfile: risk,
    trend,
    insights,
    recommendations,
    generatedAt: new Date().toISOString(),
  }
}

// ── Full portfolio report ─────────────────────────────────────
export function generateExecutiveReport(input: ExecutiveReportInput, registry?: KpiRegistry): ExecutiveReport {
  const { branches, reportDate, reportMonth, generatedBy } = input
  const reportId = `exec-${reportDate}-${Date.now()}`

  // Generate per-branch summaries
  const allSummaries = branches.map((b) =>
    generateBranchSummary(b, reportDate, reportMonth, registry)
  )

  // Risk distribution
  const riskDistribution: PortfolioRiskDistribution = {
    onTrack:    allSummaries.filter((s) => s.riskProfile.riskLevel === 'ON_TRACK').length,
    lowRisk:    allSummaries.filter((s) => s.riskProfile.riskLevel === 'LOW_RISK').length,
    mediumRisk: allSummaries.filter((s) => s.riskProfile.riskLevel === 'MEDIUM_RISK').length,
    highRisk:   allSummaries.filter((s) => s.riskProfile.riskLevel === 'HIGH_RISK').length,
  }

  // Portfolio KPI aggregation
  // Enterprise rule: only branches with a valid, positive target for a given KPI
  // contribute BOTH their actual AND their target to the portfolio sum.
  // A branch with no target for KPI X is excluded from KPI X's portfolio calculation
  // entirely — including its actual — to prevent denominator/numerator asymmetry
  // that would produce artificially inflated achievement percentages.
  // Core KPI Dependency Removal — Stage F: widens to every active
  // production_evaluation KPI when a registry is supplied. Each KPI's
  // portfolio aggregate is independent (no shared denominator across
  // KPIs), so widening adds entries without changing any existing one.
  const portfolioAchKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const portfolioAch = Object.fromEntries(
    portfolioAchKeys.map((k) => {
      let totalActual = 0
      let totalTarget = 0

      for (const b of branches) {
        const t = b.target
          ? safeReadTarget(b.target as any, getKpiMetaForKey(k, registry).targetField)
          : 0

        // Only include this branch in the portfolio aggregate when it has
        // a valid, positive target. Including the actual without a matching
        // target inflates the numerator and produces incorrect achievement %.
        if (!t || t <= 0 || !isFinite(t) || isNaN(t)) continue

        totalActual += sumKpi(b.mtdEntries, k)
        totalTarget += t
      }

      const achievementPct = computeAchievementPct(totalActual, totalTarget)
      const status         = getTrafficLight(achievementPct, getDayProgress().ratio)
      return [k, { totalActual, totalTarget, achievementPct, status }]
    })
  ) as ExecutiveReport['portfolioAch']

  // Portfolio score = weighted avg of branch adjusted scores
  const activeBranches = allSummaries.filter(
    (s) => (branches.find((b) => b.pharmacyId === s.pharmacyId)?.mtdEntries.length ?? 0) > 0
  )
  const portfolioScore = activeBranches.length > 0
    ? Math.round(
        activeBranches.reduce((sum, s) => sum + s.score.adjusted, 0) / activeBranches.length
      )
    : 0

  // Rankings
  const ranked       = [...allSummaries].sort((a, b) => b.score.adjusted - a.score.adjusted)
  const topBranches  = ranked.slice(0, 3)
  const bottomBranches = ranked.slice(-3).reverse()

  // Portfolio insights + recommendations
  const portfolioInsights = generatePortfolioInsights(
    allSummaries.map((s) => ({ pharmacyId: s.pharmacyId, pharmacyName: s.pharmacyName, score: s.score })),
    allSummaries.map((s) => s.riskProfile),
  )

  const portfolioRecommendations = generatePortfolioRecommendations(
    allSummaries.map((s) => ({ pharmacyId: s.pharmacyId, recs: s.recommendations })),
    allSummaries.length,
  )

  return {
    reportId,
    reportDate,
    reportMonth,
    generatedBy,
    generatedAt: new Date().toISOString(),
    totalBranches:  allSummaries.length,
    activeBranches: activeBranches.length,
    portfolioScore,
    portfolioGrade: scoreToGrade(portfolioScore),
    portfolioAch,
    riskDistribution,
    topBranches,
    bottomBranches,
    allBranches:  ranked,
    portfolioInsights,
    portfolioRecommendations,
  }
}
