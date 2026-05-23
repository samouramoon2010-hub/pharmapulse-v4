// ============================================================
// Executive Insight Engine
// Generates prioritised insights from branch scores/risks/trends.
// Pure function — no Firebase, no React.
// ============================================================

import { KPI_META, sumKpi, getDayProgress, computeAchievementPct } from '../kpiAnalyticsEngine'
import type { BranchInput }           from './executiveTypes'
import type {
  ExecutiveInsight,
  InsightType,
  InsightPriority,
  BranchRiskProfile,
  BranchTrendSummary,
  ExecutiveScore,
} from './executiveTypes'

let _idCounter = 0
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`
}

function insight(
  type:        InsightType,
  priority:    InsightPriority,
  title:       string,
  body:        string,
  extras:      Partial<ExecutiveInsight> = {},
): ExecutiveInsight {
  return { id: nextId(type), type, priority, title, body, ...extras }
}

// ── Score-based insights ──────────────────────────────────────
function scoreInsights(
  score:       ExecutiveScore,
  pharmacyId:  string,
  pharmacyName: string,
): ExecutiveInsight[] {
  const results: ExecutiveInsight[] = []
  const grade = score.grade

  if (grade === 'A') {
    results.push(insight('MILESTONE', 'INFO',
      `${pharmacyName} — Grade A`,
      `Composite score of ${score.adjusted}/100. Consistently outperforming targets.`,
      { pharmacyId, pharmacyName }
    ))
  } else if (grade === 'F') {
    results.push(insight('RISK', 'CRITICAL',
      `${pharmacyName} — Critical Underperformance`,
      `Score ${score.adjusted}/100 (F). Immediate intervention required.`,
      { pharmacyId, pharmacyName }
    ))
  } else if (grade === 'D') {
    results.push(insight('RISK', 'HIGH',
      `${pharmacyName} — Below Standard`,
      `Score ${score.adjusted}/100 (D). Branch needs coaching and performance review.`,
      { pharmacyId, pharmacyName }
    ))
  }

  // Weakest KPI in breakdown
  const worst = [...score.kpiBreakdown].sort((a, b) => a.achievementPct - b.achievementPct)[0]
  if (worst && worst.achievementPct < 70) {
    results.push(insight('ACHIEVEMENT', worst.achievementPct < 50 ? 'HIGH' : 'MEDIUM',
      `${worst.label} — Lowest Performer`,
      `${worst.label} at ${worst.achievementPct}% achievement for ${pharmacyName}.`,
      { pharmacyId, pharmacyName, kpiKey: worst.kpiKey, value: worst.achievementPct, metric: '%' }
    ))
  }

  // Best KPI
  const best = [...score.kpiBreakdown].sort((a, b) => b.achievementPct - a.achievementPct)[0]
  if (best && best.achievementPct >= 100) {
    results.push(insight('MILESTONE', 'INFO',
      `${best.label} — Target Hit`,
      `${best.label} reached ${best.achievementPct}% for ${pharmacyName}.`,
      { pharmacyId, pharmacyName, kpiKey: best.kpiKey, value: best.achievementPct, metric: '%' }
    ))
  }

  return results
}

// ── Trend-based insights ──────────────────────────────────────
function trendInsights(
  trend:       BranchTrendSummary,
  pharmacyId:  string,
  pharmacyName: string,
): ExecutiveInsight[] {
  const results: ExecutiveInsight[] = []

  if (trend.direction === 'ACCELERATING') {
    results.push(insight('TREND', 'INFO',
      `${pharmacyName} — Accelerating`,
      `Momentum +${trend.overallMomentum}% vs previous week. Strong upward trend across KPIs.`,
      { pharmacyId, pharmacyName }
    ))
  } else if (trend.direction === 'DETERIORATING') {
    results.push(insight('TREND', 'HIGH',
      `${pharmacyName} — Deteriorating`,
      `Momentum ${trend.overallMomentum}% vs previous week. Declining across most KPIs.`,
      { pharmacyId, pharmacyName }
    ))
  }

  // KPI-level trend highlights
  for (const kpiTrend of trend.kpiTrends) {
    if (kpiTrend.momentum >= 20) {
      results.push(insight('TREND', 'INFO',
        `${kpiTrend.label} surging`,
        `${kpiTrend.label} up ${kpiTrend.momentum}% week-over-week.`,
        { pharmacyId, pharmacyName, kpiKey: kpiTrend.kpiKey, value: kpiTrend.momentum, metric: '% WoW' }
      ))
    } else if (kpiTrend.momentum <= -20) {
      results.push(insight('TREND', 'MEDIUM',
        `${kpiTrend.label} declining`,
        `${kpiTrend.label} down ${Math.abs(kpiTrend.momentum)}% week-over-week.`,
        { pharmacyId, pharmacyName, kpiKey: kpiTrend.kpiKey, value: kpiTrend.momentum, metric: '% WoW' }
      ))
    }
  }

  return results
}

// ── Risk-based insights ───────────────────────────────────────
function riskInsights(
  risk:        BranchRiskProfile,
  pharmacyId:  string,
  pharmacyName: string,
): ExecutiveInsight[] {
  const results: ExecutiveInsight[] = []

  for (const flag of risk.flags) {
    if (flag.severity !== 'HIGH') continue  // only surface HIGH flags as insights
    results.push(insight('RISK',
      flag.category === 'PERFORMANCE' ? 'HIGH' : 'MEDIUM',
      `${pharmacyName} — ${flag.category}`,
      flag.description,
      { pharmacyId, pharmacyName, kpiKey: flag.kpiKey, value: flag.value, metric: flag.category }
    ))
  }

  return results
}

// ── Opportunity insights (close to target) ───────────────────
function opportunityInsights(
  branch:      BranchInput,
  pharmacyId:  string,
  pharmacyName: string,
): ExecutiveInsight[] {
  const results: ExecutiveInsight[] = []
  const dp = getDayProgress()
  if (!branch.target) return results

  for (const kpiKey of Object.keys(KPI_META) as Array<keyof typeof KPI_META>) {
    const fieldKey = KPI_META[kpiKey].targetField as keyof typeof branch.target
    const target   = (branch.target[fieldKey] as number) ?? 0
    if (!target) continue

    const actual  = sumKpi(branch.mtdEntries, kpiKey)
    const achPct  = computeAchievementPct(actual, target)
    const remaining = target - actual

    // Close to target: 85-99%
    if (achPct >= 85 && achPct < 100 && dp.daysRemaining > 0) {
      const neededPerDay = Math.ceil(remaining / dp.daysRemaining)
      results.push(insight('OPPORTUNITY', 'MEDIUM',
        `${KPI_META[kpiKey].en} — ${achPct}% — Within Reach`,
        `${pharmacyName} needs ${remaining.toLocaleString()} more (${neededPerDay}/day) to hit ${KPI_META[kpiKey].en} target.`,
        { pharmacyId, pharmacyName, kpiKey, value: achPct, metric: '%' }
      ))
    }
  }

  return results
}

// ── Main: generate all branch insights ───────────────────────
export function generateBranchInsights(
  branch:      BranchInput,
  score:       ExecutiveScore,
  risk:        BranchRiskProfile,
  trend:       BranchTrendSummary,
): ExecutiveInsight[] {
  const pid  = branch.pharmacyId
  const name = branch.pharmacyName

  const all = [
    ...scoreInsights(score, pid, name),
    ...trendInsights(trend, pid, name),
    ...riskInsights(risk, pid, name),
    ...opportunityInsights(branch, pid, name),
  ]

  // Sort: CRITICAL > HIGH > MEDIUM > INFO
  const ORDER: Record<string, number> = { CRITICAL:0, HIGH:1, MEDIUM:2, INFO:3 }
  return all.sort((a, b) => (ORDER[a.priority] ?? 4) - (ORDER[b.priority] ?? 4))
}

// ── Portfolio-level insights (across all branches) ────────────
export function generatePortfolioInsights(
  allScores: Array<{ pharmacyId: string; pharmacyName: string; score: ExecutiveScore }>,
  allRisks:  BranchRiskProfile[],
): ExecutiveInsight[] {
  const results: ExecutiveInsight[] = []
  const riskMap = Object.fromEntries(allRisks.map((r) => [r.pharmacyId, r]))

  const highRisk = allRisks.filter((r) => r.riskLevel === 'HIGH_RISK')
  if (highRisk.length > 0) {
    results.push(insight('RISK', 'CRITICAL',
      `${highRisk.length} Branch${highRisk.length > 1 ? 'es' : ''} at High Risk`,
      `Immediate attention required: ${highRisk.map((r) => r.pharmacyId).join(', ')}.`,
    ))
  }

  const failing = allScores.filter((s) => s.score.grade === 'F')
  if (failing.length > 0) {
    results.push(insight('ACHIEVEMENT', 'HIGH',
      `${failing.length} Branch${failing.length > 1 ? 'es' : ''} Failing`,
      `Branches with Grade F: ${failing.map((s) => s.pharmacyName).join(', ')}.`,
    ))
  }

  const top = [...allScores].sort((a, b) => b.score.adjusted - a.score.adjusted)[0]
  if (top && top.score.grade === 'A') {
    results.push(insight('MILESTONE', 'INFO',
      `Top Performer: ${top.pharmacyName}`,
      `Leading with score ${top.score.adjusted}/100 (A).`,
      { pharmacyId: top.pharmacyId, pharmacyName: top.pharmacyName }
    ))
  }

  return results
}
