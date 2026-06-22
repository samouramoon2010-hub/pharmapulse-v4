// ============================================================
// Recommendation Engine — Factory (Phase 6C)
//
// Batch wrapper for generating recommendations across many entities'
// OpportunityResults (e.g. an entire portfolio). Delegates every
// individual generation to generateRecommendations() — never
// reimplements the recommendation logic.
//
// No Firestore. No React. No UI.
// ============================================================

import { generateRecommendations } from './recommendationEngine'
import type { OpportunityResult } from './opportunityTypes'
import type { RecommendationResult } from './recommendationTypes'

/**
 * Generates recommendations for a batch of entities' opportunity
 * results. Never throws — a failure for one entity yields an empty
 * result for that entity rather than aborting the batch.
 */
export function generateRecommendationsBatch(opportunityResults: OpportunityResult[]): RecommendationResult[] {
  const results = Array.isArray(opportunityResults) ? opportunityResults : []
  return results.map((result) => {
    try {
      return generateRecommendations(result)
    } catch {
      return { entityId: result?.entityId ?? '', items: [], generatedAt: new Date().toISOString() }
    }
  })
}
