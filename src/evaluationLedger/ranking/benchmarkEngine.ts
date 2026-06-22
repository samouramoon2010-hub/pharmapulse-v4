// ============================================================
// Evaluation Ledger — Benchmark Engine (Phase 5E)
//
// Computes group-level statistics (average, median, standard
// deviation, distribution) and per-entity benchmarks (gap from
// average, percentile, quartile) over a set of scores.
//
// Reuses computePercentile()/computeQuartile() from rankingEngine.ts
// rather than redefining percentile/quartile math — there is exactly
// one implementation of that logic in this bundle.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { computePercentile, computeQuartile } from './rankingEngine'
import type { BenchmarkInput, BenchmarkResult, BenchmarkGroupStats, DistributionBucket, EntityBenchmark } from './benchmarkTypes'

const DEFAULT_BUCKET_SIZE = 10

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Arithmetic mean. Returns 0 for an empty array. Never throws. */
export function computeAverage(values: number[]): number {
  if (!values || values.length === 0) return 0
  const sum = values.reduce((acc, v) => acc + safeNum(v), 0)
  return sum / values.length
}

/** Median value. Returns 0 for an empty array. Never throws. */
export function computeMedian(values: number[]): number {
  if (!values || values.length === 0) return 0
  const sorted = [...values].map(safeNum).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Population standard deviation. Returns 0 for an empty/single-value array. Never throws. */
export function computeStandardDeviation(values: number[]): number {
  if (!values || values.length === 0) return 0
  const avg = computeAverage(values)
  const variance = values.reduce((acc, v) => acc + (safeNum(v) - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Builds a histogram of fixed-width buckets over [0, 100]. Never throws. */
export function computeDistribution(values: number[], bucketSize = DEFAULT_BUCKET_SIZE): DistributionBucket[] {
  const size = bucketSize > 0 ? bucketSize : DEFAULT_BUCKET_SIZE
  const buckets: DistributionBucket[] = []
  for (let min = 0; min < 100; min += size) {
    const max = Math.min(min + size, 100)
    buckets.push({ label: `${min}–${max}`, min, max, count: 0 })
  }
  for (const raw of values ?? []) {
    const v = Math.max(0, Math.min(100, safeNum(raw)))
    const bucket = buckets.find((b) => v >= b.min && (v < b.max || (b.max === 100 && v === 100)))
    if (bucket) bucket.count++
  }
  return buckets
}

/**
 * Computes full group statistics plus per-entity benchmarks (gap from
 * average, percentile, quartile). Never throws.
 */
export function computeBenchmark(input: BenchmarkInput): BenchmarkResult {
  try {
    const scores = Array.isArray(input?.scores) ? input.scores : []
    const values = scores.map((s) => safeNum(s.score))

    const group: BenchmarkGroupStats = {
      groupId:           input.groupId,
      count:             scores.length,
      average:           computeAverage(values),
      median:            computeMedian(values),
      standardDeviation: computeStandardDeviation(values),
      min:               values.length ? Math.min(...values) : 0,
      max:               values.length ? Math.max(...values) : 0,
      distribution:      computeDistribution(values, input.bucketSize),
    }

    const sorted = [...scores].sort((a, b) => {
      const diff = safeNum(b.score) - safeNum(a.score)
      return diff !== 0 ? diff : a.entityId.localeCompare(b.entityId)
    })
    const n = sorted.length

    const entities: EntityBenchmark[] = sorted.map((s, idx) => {
      const percentile = computePercentile(idx + 1, n)
      return {
        entityId:       s.entityId,
        score:          safeNum(s.score),
        gapFromAverage: safeNum(s.score) - group.average,
        percentile,
        quartile:       computeQuartile(percentile),
      }
    })

    return { group, entities }
  } catch {
    return {
      group: {
        groupId: input?.groupId ?? '', count: 0, average: 0, median: 0,
        standardDeviation: 0, min: 0, max: 0, distribution: [],
      },
      entities: [],
    }
  }
}
