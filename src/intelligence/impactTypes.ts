// ============================================================
// Impact Simulator — Types (Phase 6D)
//
// TypeScript-only data model for "what-if" scenario comparisons.
// All numbers in an ImpactResult come from simulateProfile(),
// computeRanking(), or computeBenchmark() — this module never
// computes a score or rank itself.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { EvaluationProfileDraft } from '../profileStudio/types'
import type { EvaluationEntityType } from '../evaluationLedger/evaluationLedgerTypes'
import type { TrendDirection } from '../evaluationLedger/ranking/trendTypes'

export interface ImpactScenarioInput {
  /** Must be a PUBLISHED profile — the same gate evaluationRunner enforces. */
  profile:          EvaluationProfileDraft
  entityId:         string
  entityType:       EvaluationEntityType
  targets:          Record<string, number>
  baselineActuals:  Record<string, number>
  scenarioActuals:  Record<string, number>
  /** Peer scores (excluding this entity) used to compute rank/percentile impact. */
  peerScores?:      { entityId: string; score: number }[]
  /** This entity's score in the prior period, used to compute trend impact. */
  previousScore?:   number
}

export interface ImpactResult {
  baselineScore:        number
  scenarioScore:        number
  scoreDelta:           number
  baselineRank?:        number
  scenarioRank?:        number
  rankChange?:          number
  baselinePercentile?:  number
  scenarioPercentile?:  number
  percentileChange?:    number
  baselineGapFromAverage?: number
  scenarioGapFromAverage?: number
  gapReduction?:        number
  trendImpact?: {
    baselineMomentum: number
    scenarioMomentum: number
    baselineDirection: TrendDirection
    scenarioDirection: TrendDirection
  }
  issues: string[]
}
