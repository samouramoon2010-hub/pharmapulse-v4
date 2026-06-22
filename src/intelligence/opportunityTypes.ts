// ============================================================
// Opportunity Engine — Types (Phase 6A)
//
// TypeScript-only data model. An "opportunity" is a deterministic
// finding extracted from a ledger entry's trace (and, optionally,
// a benchmark average / previous-period entry) — never a guess,
// never AI-generated.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { EvaluationLedgerEntry, EvaluationEntityType } from '../evaluationLedger/evaluationLedgerTypes'

export type OpportunityCategory =
  | 'BIGGEST_WEAKNESS'
  | 'BIGGEST_OPPORTUNITY'
  | 'LARGEST_SCORE_GAP'
  | 'LOWEST_CONTRIBUTING_KPI'
  | 'HIGHEST_CONTRIBUTING_KPI'
  | 'LARGEST_DECLINE'
  | 'LARGEST_IMPROVEMENT'

/** The structural level a finding refers to. */
export type OpportunityTargetLevel = 'basket' | 'element' | 'rule' | 'profile'

export interface OpportunityItem {
  category:     OpportunityCategory
  level:        OpportunityTargetLevel
  targetId:     string
  targetLabel:  string
  /** The metric value that drove this finding (units vary by category). */
  value:        number
  description:  string
}

export interface OpportunityResult {
  entityId:    string
  entityType:  EvaluationEntityType
  items:       OpportunityItem[]
  generatedAt: string
}

export interface OpportunityAnalysisInput {
  entry:             EvaluationLedgerEntry
  /** Same entity's entry from a prior period, for decline/improvement findings. */
  previousEntry?:    EvaluationLedgerEntry
  /** Peer-group average score, for the score-gap finding. */
  benchmarkAverage?: number
}
