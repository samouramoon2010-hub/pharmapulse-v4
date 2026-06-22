// ============================================================
// Insight Engine (Phase 6B)
//
// Pure, deterministic functions that turn OpportunityItems (already
// computed by opportunityEngine.ts) into human-readable strengths,
// risks, opportunities, and an executive summary. Every sentence is
// template interpolation over real numbers — no AI, no black box.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { OpportunityItem } from './opportunityTypes'
import type { InsightAnalysisInput, InsightItem, ExecutiveSummary } from './insightTypes'

function byCategory(items: OpportunityItem[], category: OpportunityItem['category']): OpportunityItem | undefined {
  return items.find((i) => i.category === category)
}

/** Strengths: highest-contributing KPI, the largest improvement, and momentum (if improving). */
export function deriveStrengths(input: InsightAnalysisInput): InsightItem[] {
  const out: InsightItem[] = []
  try {
    const items = input?.opportunityItems ?? []

    const highest = byCategory(items, 'HIGHEST_CONTRIBUTING_KPI')
    if (highest) {
      out.push({
        category: 'STRENGTH', title: 'Top contributor', metricValue: highest.value, relatedId: highest.targetId,
        description: `${highest.targetLabel} is the strongest contributor to the overall score, adding ${highest.value.toFixed(1)} weighted points.`,
      })
    }

    const improvement = byCategory(items, 'LARGEST_IMPROVEMENT')
    if (improvement) {
      out.push({
        category: 'STRENGTH', title: 'Best improving area', metricValue: improvement.value, relatedId: improvement.targetId,
        description: `${improvement.targetLabel} improved the most since the previous period, up ${improvement.value.toFixed(1)} points.`,
      })
    }

    if (input?.trendDirection === 'improving' && typeof input.momentum === 'number') {
      out.push({
        category: 'STRENGTH', title: 'Positive momentum', metricValue: input.momentum,
        description: `Overall performance is improving, with momentum of +${input.momentum.toFixed(1)} points.`,
      })
    }
  } catch { /* never throw — return whatever was already collected */ }
  return out
}

/** Risks: lowest-contributing KPI, the largest decline, a negative benchmark gap, and regression momentum. */
export function deriveRisks(input: InsightAnalysisInput): InsightItem[] {
  const out: InsightItem[] = []
  try {
    const items = input?.opportunityItems ?? []

    const lowest = byCategory(items, 'LOWEST_CONTRIBUTING_KPI')
    if (lowest) {
      out.push({
        category: 'RISK', title: 'Weak KPI', metricValue: lowest.value, relatedId: lowest.targetId,
        description: `${lowest.targetLabel} contributes the least of any KPI to the overall score (${lowest.value.toFixed(1)} weighted points).`,
      })
    }

    const decline = byCategory(items, 'LARGEST_DECLINE')
    if (decline) {
      out.push({
        category: 'RISK', title: 'Declining trend', metricValue: decline.value, relatedId: decline.targetId,
        description: `${decline.targetLabel} declined by ${Math.abs(decline.value).toFixed(1)} points since the previous period.`,
      })
    }

    const gap = byCategory(items, 'LARGEST_SCORE_GAP')
    if (gap && gap.value < 0) {
      out.push({
        category: 'RISK', title: 'Critical gap vs. peers', metricValue: gap.value, relatedId: gap.targetId,
        description: `${gap.targetLabel} trails the peer-group average by ${Math.abs(gap.value).toFixed(1)} points.`,
      })
    }

    if (input?.trendDirection === 'regressing' && typeof input.momentum === 'number') {
      out.push({
        category: 'RISK', title: 'Negative momentum', metricValue: input.momentum,
        description: `Overall performance is regressing, with momentum of ${input.momentum.toFixed(1)} points.`,
      })
    }
  } catch { /* never throw */ }
  return out
}

/** Opportunities: the biggest weighted headroom and the weakest basket. */
export function deriveOpportunities(input: InsightAnalysisInput): InsightItem[] {
  const out: InsightItem[] = []
  try {
    const items = input?.opportunityItems ?? []

    const opportunity = byCategory(items, 'BIGGEST_OPPORTUNITY')
    if (opportunity) {
      out.push({
        category: 'OPPORTUNITY', title: 'Highest impact improvement', metricValue: opportunity.value, relatedId: opportunity.targetId,
        description: `${opportunity.targetLabel} offers the largest weighted headroom — improving it would have the biggest impact on the overall score.`,
      })
    }

    const weakness = byCategory(items, 'BIGGEST_WEAKNESS')
    if (weakness) {
      out.push({
        category: 'OPPORTUNITY', title: 'Underperforming basket', metricValue: weakness.value, relatedId: weakness.targetId,
        description: `${weakness.targetLabel} is the underperforming basket with the most room to close, currently at ${weakness.value.toFixed(1)}%.`,
      })
    }
  } catch { /* never throw */ }
  return out
}

/**
 * Builds the full executive summary: headline, narrative, and the
 * three insight categories. Never throws.
 */
export function buildExecutiveSummary(input: InsightAnalysisInput): ExecutiveSummary {
  try {
    const strengths = deriveStrengths(input)
    const risks = deriveRisks(input)
    const opportunities = deriveOpportunities(input)

    const weakness = byCategory(input.opportunityItems ?? [], 'BIGGEST_WEAKNESS')
    const headline = `${input.entityId} scored ${input.overallScore.toFixed(1)}%`
      + (weakness ? ` — ${weakness.targetLabel} is the primary drag on performance.` : '.')

    let narrative = headline
    if (weakness && input.overallScore > 0) {
      const gapShare = Math.min(100, Math.max(0, (weakness.value / Math.max(input.overallScore, 1)) * 100))
      narrative = `${weakness.targetLabel} contributes only ${weakness.value.toFixed(1)}% and explains roughly `
        + `${gapShare.toFixed(0)}% of the distance between the current score and a perfect 100%.`
    }

    return {
      entityId: input.entityId, headline, narrative, strengths, risks, opportunities,
      generatedAt: new Date().toISOString(),
    }
  } catch {
    return {
      entityId: input?.entityId ?? '', headline: '', narrative: '',
      strengths: [], risks: [], opportunities: [], generatedAt: new Date().toISOString(),
    }
  }
}
