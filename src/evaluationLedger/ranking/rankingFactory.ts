// ============================================================
// Evaluation Ledger — Ranking Factory (Phase 5C)
//
// Builds RankingInput objects from raw evaluation ledger entries.
// Collapses multiple entries per entity (the ledger is append-only,
// so an entity may have been re-evaluated within a period) down to
// the single most recent entry per entity before ranking.
//
// No Firestore. No React. No UI.
// ============================================================

import type { EvaluationLedgerEntry, EvaluationEntityType } from '../evaluationLedgerTypes'
import type { RankingInput } from './rankingTypes'

/**
 * Reduces a list of ledger entries down to the latest entry per entityId.
 * Never throws.
 */
export function latestEntryPerEntity(entries: EvaluationLedgerEntry[]): Record<string, EvaluationLedgerEntry> {
  const latest: Record<string, EvaluationLedgerEntry> = {}
  try {
    for (const entry of entries ?? []) {
      const existing = latest[entry.entityId]
      if (!existing || entry.timestamp > existing.timestamp) {
        latest[entry.entityId] = entry
      }
    }
  } catch {
    return {}
  }
  return latest
}

export interface BuildRankingInputOptions {
  entityType:        EvaluationEntityType
  profileId:         string
  periodId:          string
  entries:           EvaluationLedgerEntry[]
  previousPeriodEntries?: EvaluationLedgerEntry[]
}

/**
 * Builds a RankingInput from raw ledger entries for the current and
 * (optionally) previous period. Never throws.
 */
export function buildRankingInput(options: BuildRankingInputOptions): RankingInput {
  try {
    const currentLatest = latestEntryPerEntity(options.entries)
    const scores = Object.values(currentLatest).map((e) => ({ entityId: e.entityId, score: e.score }))

    let previousScores: Record<string, number> | undefined
    if (options.previousPeriodEntries) {
      const prevLatest = latestEntryPerEntity(options.previousPeriodEntries)
      previousScores = {}
      for (const [entityId, e] of Object.entries(prevLatest)) previousScores[entityId] = e.score
    }

    return {
      entityType: options.entityType,
      profileId:  options.profileId,
      periodId:   options.periodId,
      scores,
      previousScores,
    }
  } catch {
    return {
      entityType: options?.entityType ?? 'branch',
      profileId:  options?.profileId ?? '',
      periodId:   options?.periodId ?? '',
      scores:     [],
    }
  }
}
