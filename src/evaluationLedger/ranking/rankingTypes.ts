// ============================================================
// Evaluation Ledger — Ranking Types (Phase 5C)
//
// TypeScript-only data model for the ranking layer that sits on
// top of the evaluation ledger. Operates purely on already-computed
// scores — it never recomputes a score itself (scoring stays the
// exclusive responsibility of Profile Studio's simulateProfile()).
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { EvaluationEntityType } from '../evaluationLedgerTypes'

export type RankingTrend = 'up' | 'down' | 'flat' | 'new'
export type RankingQuartile = 1 | 2 | 3 | 4

/** One entity's position within a ranking. */
export interface RankingEntry {
  entityId:   string
  entityType: EvaluationEntityType
  score:      number
  rank:       number
  /** 0–100, higher is better (100 = top performer). */
  percentile: number
  /** 1 = top 25%, 4 = bottom 25%. */
  quartile:   RankingQuartile
  trend:      RankingTrend
  scoreDelta: number
}

/** A single entity's raw score input to the ranking engine. */
export interface RankingScoreInput {
  entityId: string
  score:    number
}

/** Input to computeRanking(). */
export interface RankingInput {
  entityType:      EvaluationEntityType
  profileId:       string
  periodId:        string
  scores:          RankingScoreInput[]
  /** entityId → previous period's score, for trend computation. */
  previousScores?: Record<string, number>
}

/** Output of computeRanking(). */
export interface RankingResult {
  entityType:  EvaluationEntityType
  profileId:   string
  periodId:    string
  entries:     RankingEntry[]
  generatedAt: string
}
