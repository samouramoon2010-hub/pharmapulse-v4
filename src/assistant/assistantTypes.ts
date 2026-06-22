// ============================================================
// Assistant — Context Types (Phase 7A)
//
// TypeScript-only data model for the structured context packet the
// assistant reasons over. Every field is a reference to an
// already-computed deterministic kernel output — this module
// computes nothing itself.
//
// No Firestore. No React. No executable logic. No AI.
// ============================================================

import type { EvaluationLedgerEntry, EvaluationEntityType } from '../evaluationLedger/evaluationLedgerTypes'
import type { RankingResult, RankingEntry } from '../evaluationLedger/ranking/rankingTypes'
import type { BenchmarkResult } from '../evaluationLedger/ranking/benchmarkTypes'
import type { TrendResult } from '../evaluationLedger/ranking/trendTypes'
import type { OpportunityResult } from '../intelligence/opportunityTypes'
import type { RecommendationResult } from '../intelligence/recommendationTypes'
import type { ProfileSimTrace } from '../profileStudio/simulationTrace'

export interface AssistantProfileMetadata {
  id:        string
  name:      string
  version:   string
  status:    string
  scope?:    string
  validFrom?: string
}

export interface AssistantContext {
  entityId:             string
  entityType:           EvaluationEntityType
  profileId:            string
  profileVersion:       string
  periodId:             string
  ledgerEntry?:          EvaluationLedgerEntry
  previousLedgerEntry?: EvaluationLedgerEntry
  ranking?:             RankingResult
  rankingEntry?:        RankingEntry
  benchmark?:           BenchmarkResult
  trend?:               TrendResult
  opportunities?:       OpportunityResult
  recommendations?:     RecommendationResult
  trace?:               ProfileSimTrace
  profileMetadata?:     AssistantProfileMetadata
  generatedAt:          string
}

export interface BuildAssistantContextOptions {
  entityId:             string
  entityType:           EvaluationEntityType
  profileId:            string
  profileVersion:       string
  periodId:             string
  ledgerEntry?:          EvaluationLedgerEntry
  previousLedgerEntry?: EvaluationLedgerEntry
  ranking?:             RankingResult
  benchmark?:           BenchmarkResult
  trend?:               TrendResult
  opportunities?:       OpportunityResult
  recommendations?:     RecommendationResult
  profileMetadata?:     AssistantProfileMetadata
}
