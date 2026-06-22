// ============================================================
// Opportunity Engine — Factory (Phase 6A)
//
// Wires raw ledger entries (current + previous period) and a
// benchmark average into an OpportunityAnalysisInput. Reuses
// rankingFactory's latestEntryPerEntity rather than redefining
// per-entity deduplication.
//
// No Firestore. No React. No UI.
// ============================================================

import { latestEntryPerEntity } from '../evaluationLedger/ranking/rankingFactory'
import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'
import type { OpportunityAnalysisInput } from './opportunityTypes'

export interface BuildOpportunityInputOptions {
  entityId:               string
  currentPeriodEntries:   EvaluationLedgerEntry[]
  previousPeriodEntries?: EvaluationLedgerEntry[]
  benchmarkAverage?:      number
}

/**
 * Builds an OpportunityAnalysisInput for one entity from raw ledger
 * entries. Returns null when no current-period entry exists for the
 * entity. Never throws.
 */
export function buildOpportunityInput(options: BuildOpportunityInputOptions): OpportunityAnalysisInput | null {
  try {
    const current = latestEntryPerEntity(options.currentPeriodEntries)[options.entityId]
    if (!current) return null

    const previous = options.previousPeriodEntries
      ? latestEntryPerEntity(options.previousPeriodEntries)[options.entityId]
      : undefined

    return { entry: current, previousEntry: previous, benchmarkAverage: options.benchmarkAverage }
  } catch {
    return null
  }
}
