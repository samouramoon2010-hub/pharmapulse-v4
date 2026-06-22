// ============================================================
// Evaluation Ledger — Benchmark Types (Phase 5E)
//
// TypeScript-only data model for benchmark statistics computed
// over a group of entity scores.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { RankingQuartile } from './rankingTypes'

export interface DistributionBucket {
  /** Human-readable bucket label, e.g. "70–80". */
  label: string
  min:   number
  max:   number
  count: number
}

export interface BenchmarkGroupStats {
  groupId:           string
  count:             number
  average:           number
  median:            number
  standardDeviation: number
  min:               number
  max:               number
  distribution:      DistributionBucket[]
}

export interface EntityBenchmark {
  entityId:       string
  score:          number
  gapFromAverage: number
  percentile:     number
  quartile:       RankingQuartile
}

export interface BenchmarkResult {
  group:    BenchmarkGroupStats
  entities: EntityBenchmark[]
}

export interface BenchmarkInput {
  groupId: string
  scores:  { entityId: string; score: number }[]
  /** Bucket width for the distribution histogram. Defaults to 10. */
  bucketSize?: number
}
