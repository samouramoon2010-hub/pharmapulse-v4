// ============================================================
// Recommendation Engine — Types (Phase 6C)
//
// TypeScript-only data model. Every recommendation must carry an
// explicit `basedOn` pointer back to the opportunity finding that
// produced it — there is no black-box scoring; the chain from
// input data to recommendation is always traceable.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { OpportunityCategory } from './opportunityTypes'

export type RecommendationPriority   = 'high' | 'medium' | 'low'
export type RecommendationDifficulty = 'low' | 'medium' | 'high'

export interface RecommendationItem {
  id:           string
  title:        string
  description:  string
  priority:     RecommendationPriority
  /** Estimated overall-score uplift (points) if this recommendation is acted on. */
  impact:       number
  /** 0–1 — always 1 for a fully data-backed finding (deterministic, not probabilistic guessing). */
  confidence:   number
  difficulty:   RecommendationDifficulty
  expectedGain: number
  basedOn: {
    opportunityCategory: OpportunityCategory
    targetId:            string
  }
}

export interface RecommendationResult {
  entityId:    string
  items:       RecommendationItem[]
  generatedAt: string
}
