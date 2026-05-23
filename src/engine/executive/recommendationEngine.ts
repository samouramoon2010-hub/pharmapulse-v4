// ============================================================
// Executive Recommendation Engine
// Generates prioritised, actionable recommendations.
// Rule-based. _aiReady: true — replace body gen with LLM.
// Pure function — no Firebase, no React.
// ============================================================

import type { BranchInput } from './executiveTypes'
import type {
  Recommendation,
  RecommendationAction,
  InsightPriority,
  BranchRiskProfile,
  BranchTrendSummary,
  ExecutiveScore,
} from './executiveTypes'

let _recCounter = 0
function nextRecId(): string {
  return `rec-${Date.now()}-${++_recCounter}`
}

function rec(
  action:      RecommendationAction,
  priority:    InsightPriority,
  title:       string,
  body:        string,
  rationale:   string,
  extras:      Partial<Recommendation> = {},
): Recommendation {
  return {
    id: nextRecId(),
    action,
    priority,
    title,
    body,
    rationale,
    _aiReady: true,
    ...extras,
  }
}

// ── From risk profile ─────────────────────────────────────────
function fromRisk(
  risk:         BranchRiskProfile,
  pharmacyId:   string,
  pharmacyName: string,
): Recommendation[] {
  const recs: Recommendation[] = []

  if (risk.riskLevel === 'HIGH_RISK') {
    recs.push(rec(
      'ESCALATE', 'CRITICAL',
      `Escalate: ${pharmacyName}`,
      `Schedule an urgent performance review with ${pharmacyName} management. Focus on ${risk.flags.filter(f=>f.severity==='HIGH').map(f=>f.kpiKey||f.category).join(', ')}.`,
      `Branch has ${risk.criticalCount} critical flags and risk score ${risk.riskScore}/25.`,
      { pharmacyId, pharmacyName },
    ))
  }

  const submissionFlag = risk.flags.find((f) => f.category === 'SUBMISSION' && f.severity === 'HIGH')
  if (submissionFlag) {
    recs.push(rec(
      'COACH_BRANCH', 'HIGH',
      `Improve Submission Rate: ${pharmacyName}`,
      `Only ${Math.round((submissionFlag.value ?? 0) * 100)}% of pharmacists submitting data. Reinforce daily KPI entry discipline.`,
      'Incomplete data leads to inaccurate forecasts and missed interventions.',
      { pharmacyId, pharmacyName },
    ))
  }

  for (const flag of risk.flags.filter((f) => f.category === 'PACE' && f.severity === 'HIGH')) {
    recs.push(rec(
      'REVIEW_PACE', 'HIGH',
      `Review Pace: ${pharmacyName} — ${flag.kpiKey ?? ''}`,
      `Current pace is critically low. Identify daily barriers and adjust operational focus.`,
      flag.description,
      { pharmacyId, pharmacyName, kpiKey: flag.kpiKey },
    ))
  }

  return recs
}

// ── From score ────────────────────────────────────────────────
function fromScore(
  score:        ExecutiveScore,
  pharmacyId:   string,
  pharmacyName: string,
): Recommendation[] {
  const recs: Recommendation[] = []

  // Worst KPI gets a focus recommendation
  const worst = [...score.kpiBreakdown].sort((a, b) => a.achievementPct - b.achievementPct)[0]
  if (worst && worst.achievementPct < 75) {
    recs.push(rec(
      'FOCUS_KPI', worst.achievementPct < 50 ? 'HIGH' : 'MEDIUM',
      `Focus on ${worst.label}: ${pharmacyName}`,
      `Prioritise ${worst.label} in daily briefings. Target ${100 - worst.achievementPct}% improvement to reach goal.`,
      `${worst.label} is at ${worst.achievementPct}% — the lowest performing KPI for this branch.`,
      { pharmacyId, pharmacyName, kpiKey: worst.kpiKey },
    ))
  }

  // Grade A → recognise
  if (score.grade === 'A') {
    recs.push(rec(
      'RECOGNIZE', 'INFO',
      `Recognise Performance: ${pharmacyName}`,
      `Acknowledge the team's Grade A performance publicly. Use as a benchmark for other branches.`,
      `Composite score ${score.adjusted}/100 — top quartile.`,
      { pharmacyId, pharmacyName },
    ))
  }

  // No targets → set them
  const noTargetKpis = score.kpiBreakdown.filter((k) => k.target === 0)
  if (noTargetKpis.length > 0) {
    recs.push(rec(
      'SET_TARGET', 'HIGH',
      `Set Missing Targets: ${pharmacyName}`,
      `${noTargetKpis.map((k) => k.label).join(', ')} have no targets configured. Set monthly targets to enable tracking.`,
      'KPIs without targets cannot be measured for achievement.',
      { pharmacyId, pharmacyName },
    ))
  }

  return recs
}

// ── From trend ────────────────────────────────────────────────
function fromTrend(
  trend:        BranchTrendSummary,
  pharmacyId:   string,
  pharmacyName: string,
): Recommendation[] {
  const recs: Recommendation[] = []

  if (trend.direction === 'DETERIORATING') {
    recs.push(rec(
      'COACH_BRANCH', 'HIGH',
      `Coaching Required: ${pharmacyName}`,
      `Performance has been declining for multiple days. Schedule a 1-on-1 coaching session to identify root causes.`,
      `Deteriorating trend with momentum ${trend.overallMomentum}%.`,
      { pharmacyId, pharmacyName },
    ))
  }

  if (trend.direction === 'ACCELERATING') {
    recs.push(rec(
      'RECOGNIZE', 'INFO',
      `Momentum Reward: ${pharmacyName}`,
      `Branch is accelerating (+${trend.overallMomentum}% momentum). Maintain current practices.`,
      'Positive momentum deserves reinforcement.',
      { pharmacyId, pharmacyName },
    ))
  }

  return recs
}

// ── Main: branch recommendations ─────────────────────────────
export function generateBranchRecommendations(
  branch:      BranchInput,
  score:       ExecutiveScore,
  risk:        BranchRiskProfile,
  trend:       BranchTrendSummary,
): Recommendation[] {
  const pid  = branch.pharmacyId
  const name = branch.pharmacyName

  const all = [
    ...fromRisk(risk, pid, name),
    ...fromScore(score, pid, name),
    ...fromTrend(trend, pid, name),
  ]

  // Deduplicate by action+kpiKey
  const seen = new Set<string>()
  const ORDER: Record<string, number> = { CRITICAL:0, HIGH:1, MEDIUM:2, INFO:3 }

  return all
    .sort((a, b) => (ORDER[a.priority] ?? 4) - (ORDER[b.priority] ?? 4))
    .filter((r) => {
      const key = `${r.action}:${r.kpiKey ?? r.pharmacyId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// ── Portfolio recommendations ─────────────────────────────────
export function generatePortfolioRecommendations(
  allBranchRecs: Array<{ pharmacyId: string; recs: Recommendation[] }>,
  totalBranches: number,
): Recommendation[] {
  const results: Recommendation[] = []

  const escalatedCount = allBranchRecs.filter((b) =>
    b.recs.some((r) => r.action === 'ESCALATE')
  ).length

  if (escalatedCount > 0) {
    results.push(rec(
      'ESCALATE', 'CRITICAL',
      `${escalatedCount} Branch${escalatedCount > 1 ? 'es' : ''} Require Escalation`,
      `Initiate escalation protocol for underperforming branches immediately.`,
      `${escalatedCount} of ${totalBranches} branches have critical risk flags.`,
    ))
  }

  const noTargetCount = allBranchRecs.filter((b) =>
    b.recs.some((r) => r.action === 'SET_TARGET')
  ).length

  if (noTargetCount > 0) {
    results.push(rec(
      'SET_TARGET', 'HIGH',
      `${noTargetCount} Branch${noTargetCount > 1 ? 'es' : ''} Missing Targets`,
      `Configure monthly KPI targets for all branches to enable complete portfolio tracking.`,
      'Targets are required for achievement calculation and forecasting.',
    ))
  }

  return results
}
