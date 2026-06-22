// ============================================================
// Recommendation Engine (Phase 6C)
//
// Pure, deterministic functions that turn OpportunityItems (already
// computed by opportunityEngine.ts) into actionable recommendations.
// Every recommendation's priority/impact/confidence/difficulty is a
// documented, explainable formula over the opportunity's own value —
// never a black box, never a probabilistic guess.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { OpportunityItem, OpportunityResult, OpportunityCategory } from './opportunityTypes'
import type { RecommendationItem, RecommendationResult, RecommendationPriority, RecommendationDifficulty } from './recommendationTypes'

const RECOMMENDABLE_CATEGORIES: OpportunityCategory[] = [
  'BIGGEST_OPPORTUNITY', 'LOWEST_CONTRIBUTING_KPI', 'LARGEST_SCORE_GAP', 'LARGEST_DECLINE',
]

const TITLE_TEMPLATES: Record<string, (item: OpportunityItem) => string> = {
  BIGGEST_OPPORTUNITY:       (item) => `Improve ${item.targetLabel} contribution`,
  LOWEST_CONTRIBUTING_KPI:   (item) => `Focus on ${item.targetLabel} performance`,
  LARGEST_SCORE_GAP:         (item) => `Close the gap to the peer-group average`,
  LARGEST_DECLINE:           (item) => `Reverse the decline in ${item.targetLabel}`,
}

const DESCRIPTION_TEMPLATES: Record<string, (item: OpportunityItem) => string> = {
  BIGGEST_OPPORTUNITY:     (item) => `Based on the largest opportunity finding: ${item.description}`,
  LOWEST_CONTRIBUTING_KPI: (item) => `Based on the lowest-contributing KPI finding: ${item.description}`,
  LARGEST_SCORE_GAP:       (item) => `Based on the score-gap finding: ${item.description}`,
  LARGEST_DECLINE:         (item) => `Based on the largest-decline finding: ${item.description}`,
}

/** Deterministic priority from the magnitude of the opportunity's value. */
export function derivePriority(value: number): RecommendationPriority {
  const magnitude = Math.abs(value)
  if (magnitude >= 20) return 'high'
  if (magnitude >= 8) return 'medium'
  return 'low'
}

/** Deterministic difficulty from the magnitude of the opportunity's value. */
export function deriveDifficulty(value: number): RecommendationDifficulty {
  const magnitude = Math.abs(value)
  if (magnitude >= 30) return 'high'
  if (magnitude >= 10) return 'medium'
  return 'low'
}

/**
 * Converts a single eligible OpportunityItem into a RecommendationItem.
 * Returns null for non-recommendable categories. Never throws.
 */
export function buildRecommendation(item: OpportunityItem, index: number): RecommendationItem | null {
  try {
    if (!RECOMMENDABLE_CATEGORIES.includes(item.category)) return null
    const titleFn = TITLE_TEMPLATES[item.category]
    const descFn  = DESCRIPTION_TEMPLATES[item.category]
    if (!titleFn || !descFn) return null

    const impact = Math.min(100, Math.abs(item.value))

    return {
      id:           `rec_${index}_${item.targetId}`,
      title:        titleFn(item),
      description:  descFn(item),
      priority:     derivePriority(item.value),
      impact,
      confidence:   1,
      difficulty:   deriveDifficulty(item.value),
      expectedGain: impact,
      basedOn:      { opportunityCategory: item.category, targetId: item.targetId },
    }
  } catch {
    return null
  }
}

/**
 * Generates every eligible recommendation from an OpportunityResult,
 * sorted by impact descending (highest-impact first). Never throws.
 */
export function generateRecommendations(opportunityResult: OpportunityResult): RecommendationResult {
  try {
    const items = (opportunityResult?.items ?? [])
      .map((item, idx) => buildRecommendation(item, idx))
      .filter((r): r is RecommendationItem => r !== null)
      .sort((a, b) => b.impact - a.impact)

    return { entityId: opportunityResult.entityId, items, generatedAt: new Date().toISOString() }
  } catch {
    return { entityId: opportunityResult?.entityId ?? '', items: [], generatedAt: new Date().toISOString() }
  }
}
