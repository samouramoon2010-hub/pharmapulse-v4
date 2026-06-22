// ============================================================
// Evaluation Ledger — Trend Engine (Phase 5F)
//
// Builds score history, moving averages, and momentum/direction
// from an entity's evaluation ledger entries across periods.
// Profile-version-aware: flags periods where the published profile
// version changed, since a score jump may reflect a methodology
// change rather than a real performance shift.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { latestEntryPerEntity } from './rankingFactory'
import type { EvaluationLedgerEntry } from '../evaluationLedgerTypes'
import type { ScoreHistoryPoint, TrendResult, TrendDirection, ProfileVersionChange } from './trendTypes'

const DEFAULT_WINDOW = 3
const MOMENTUM_EPSILON = 0.01

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Builds a chronological score history for one entity, deduplicating
 * multiple ledger entries within the same period down to the latest
 * (re-run) entry. Never throws.
 */
export function buildScoreHistory(entries: EvaluationLedgerEntry[], entityId: string): ScoreHistoryPoint[] {
  try {
    const own = (entries ?? []).filter((e) => e.entityId === entityId)
    const byPeriod: Record<string, EvaluationLedgerEntry> = {}
    for (const e of own) {
      const existing = byPeriod[e.periodId]
      if (!existing || e.timestamp > existing.timestamp) byPeriod[e.periodId] = e
    }
    return Object.values(byPeriod)
      .sort((a, b) => a.periodId.localeCompare(b.periodId))
      .map((e) => ({
        periodId:       e.periodId,
        score:          e.score,
        profileId:      e.profileId,
        profileVersion: e.profileVersion,
        timestamp:      e.timestamp,
      }))
  } catch {
    return []
  }
}

/**
 * Simple moving average over a fixed trailing window. The first
 * `window - 1` points use whatever history is available (partial
 * window) rather than being undefined. Never throws.
 */
export function computeMovingAverage(scores: number[], window = DEFAULT_WINDOW): number[] {
  if (!scores || scores.length === 0) return []
  const w = window > 0 ? window : DEFAULT_WINDOW
  return scores.map((_, idx) => {
    const start = Math.max(0, idx - w + 1)
    const slice = scores.slice(start, idx + 1).map(safeNum)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Momentum = most recent score minus the average of the preceding
 * window (excluding the most recent point). Returns 0 when there is
 * not enough history to compare. Never throws.
 */
export function computeMomentum(scores: number[], window = DEFAULT_WINDOW): number {
  if (!scores || scores.length < 2) return 0
  const last = safeNum(scores[scores.length - 1])
  const w = window > 0 ? window : DEFAULT_WINDOW
  const priorStart = Math.max(0, scores.length - 1 - w)
  const prior = scores.slice(priorStart, scores.length - 1).map(safeNum)
  if (prior.length === 0) return 0
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length
  return last - priorAvg
}

/** Classifies momentum into a trend direction. Never throws. */
export function computeTrendDirection(momentum: number, historyLength: number): TrendDirection {
  if (historyLength < 2) return 'insufficient_data'
  if (momentum > MOMENTUM_EPSILON) return 'improving'
  if (momentum < -MOMENTUM_EPSILON) return 'regressing'
  return 'stable'
}

/** Flags periods where the published profile version changed. Never throws. */
export function detectProfileVersionChanges(history: ScoreHistoryPoint[]): ProfileVersionChange[] {
  const changes: ProfileVersionChange[] = []
  try {
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]
      const curr = history[i]
      if (prev.profileVersion !== curr.profileVersion) {
        changes.push({ periodId: curr.periodId, fromVersion: prev.profileVersion, toVersion: curr.profileVersion })
      }
    }
  } catch {
    return []
  }
  return changes
}

/**
 * Computes the full trend result for one entity from raw ledger
 * entries (which may span many entities and periods). Never throws.
 */
export function computeTrend(entries: EvaluationLedgerEntry[], entityId: string, window = DEFAULT_WINDOW): TrendResult {
  try {
    const history = buildScoreHistory(entries, entityId)
    const scores = history.map((h) => h.score)
    const movingAverage = computeMovingAverage(scores, window)
    const momentum = computeMomentum(scores, window)

    return {
      entityId,
      history,
      movingAverage,
      momentum,
      direction: computeTrendDirection(momentum, history.length),
      profileVersionChanges: detectProfileVersionChanges(history),
    }
  } catch {
    return {
      entityId, history: [], movingAverage: [], momentum: 0,
      direction: 'insufficient_data', profileVersionChanges: [],
    }
  }
}

// Re-exported for callers who already have a deduplicated entry list
// (avoids forcing every caller to import rankingFactory separately).
export { latestEntryPerEntity }
