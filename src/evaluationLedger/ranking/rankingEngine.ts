// ============================================================
// Evaluation Ledger — Ranking Engine (Phase 5C)
//
// Computes rank, percentile, quartile, and trend from a list of
// already-computed scores. Does not recompute scores — those come
// exclusively from simulateProfile() via the evaluation runner.
//
// Deterministic: equal scores tie-break on entityId ascending, so
// the same input always produces the same ranking.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { RankingEntry, RankingInput, RankingResult, RankingQuartile, RankingTrend } from './rankingTypes'

const TREND_EPSILON = 0.01

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Returns the percentile (0–100, higher is better) for a given 1-based
 * rank among n entries.
 */
export function computePercentile(rank: number, n: number): number {
  if (n <= 1) return 100
  const pct = ((n - rank) / (n - 1)) * 100
  return Math.max(0, Math.min(100, pct))
}

/** Maps a percentile (0–100, higher is better) to a quartile (1 = best). */
export function computeQuartile(percentile: number): RankingQuartile {
  if (percentile >= 75) return 1
  if (percentile >= 50) return 2
  if (percentile >= 25) return 3
  return 4
}

/** Determines trend direction from a score delta. */
export function computeTrend(scoreDelta: number, hasPrevious: boolean): RankingTrend {
  if (!hasPrevious) return 'new'
  if (scoreDelta > TREND_EPSILON) return 'up'
  if (scoreDelta < -TREND_EPSILON) return 'down'
  return 'flat'
}

/**
 * Computes a full ranking from raw scores. Never throws — malformed
 * or empty input yields an empty entries array.
 *
 * @pure — never mutates the input arrays/objects.
 */
export function computeRanking(input: RankingInput): RankingResult {
  try {
    const scores = Array.isArray(input?.scores) ? input.scores : []
    const previous = input?.previousScores ?? {}

    const sorted = [...scores].sort((a, b) => {
      const scoreDiff = safeNum(b.score) - safeNum(a.score)
      if (scoreDiff !== 0) return scoreDiff
      return a.entityId.localeCompare(b.entityId)
    })

    const n = sorted.length
    const entries: RankingEntry[] = sorted.map((s, idx) => {
      const rank = idx + 1
      const percentile = computePercentile(rank, n)
      const hasPrevious = Object.prototype.hasOwnProperty.call(previous, s.entityId)
      const prevScore = hasPrevious ? safeNum(previous[s.entityId]) : 0
      const scoreDelta = hasPrevious ? safeNum(s.score) - prevScore : 0

      return {
        entityId:   s.entityId,
        entityType: input.entityType,
        score:      safeNum(s.score),
        rank,
        percentile,
        quartile:   computeQuartile(percentile),
        trend:      computeTrend(scoreDelta, hasPrevious),
        scoreDelta,
      }
    })

    return {
      entityType:  input.entityType,
      profileId:   input.profileId,
      periodId:    input.periodId,
      entries,
      generatedAt: new Date().toISOString(),
    }
  } catch {
    return {
      entityType:  input?.entityType ?? 'branch',
      profileId:   input?.profileId ?? '',
      periodId:    input?.periodId ?? '',
      entries:     [],
      generatedAt: new Date().toISOString(),
    }
  }
}

/** Returns only the top N entries by rank. Never throws. */
export function topPerformers(result: RankingResult, count: number): RankingEntry[] {
  try {
    return result.entries.slice(0, Math.max(0, count))
  } catch {
    return []
  }
}

/** Returns only the bottom N entries by rank. Never throws. */
export function bottomPerformers(result: RankingResult, count: number): RankingEntry[] {
  try {
    const n = Math.max(0, count)
    return result.entries.slice(Math.max(0, result.entries.length - n))
  } catch {
    return []
  }
}
