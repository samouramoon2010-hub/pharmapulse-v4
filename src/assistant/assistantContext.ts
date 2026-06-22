// ============================================================
// Assistant — Context Builder (Phase 7A)
//
// Pure aggregator: wires already-computed kernel outputs (ledger
// entries, ranking, benchmark, trend, opportunities, recommendations,
// profile metadata) into a single structured AssistantContext.
// Computes nothing — every field is a direct reference or a trivial
// derivation (e.g. pulling this entity's own RankingEntry out of a
// RankingResult that was already computed by computeRanking()).
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { AssistantContext, BuildAssistantContextOptions } from './assistantTypes'

/**
 * Builds a structured AssistantContext from already-computed kernel
 * outputs. Never throws — missing optional inputs simply produce a
 * leaner context, never an error.
 */
export function buildAssistantContext(options: BuildAssistantContextOptions): AssistantContext {
  try {
    const rankingEntry = options.ranking?.entries.find((e) => e.entityId === options.entityId)

    return {
      entityId:             options.entityId,
      entityType:           options.entityType,
      profileId:            options.profileId,
      profileVersion:       options.profileVersion,
      periodId:             options.periodId,
      ledgerEntry:          options.ledgerEntry,
      previousLedgerEntry:  options.previousLedgerEntry,
      ranking:              options.ranking,
      rankingEntry,
      benchmark:            options.benchmark,
      trend:                options.trend,
      opportunities:        options.opportunities,
      recommendations:      options.recommendations,
      trace:                options.ledgerEntry?.trace,
      profileMetadata:      options.profileMetadata,
      generatedAt:          new Date().toISOString(),
    }
  } catch {
    return {
      entityId:       options?.entityId ?? '',
      entityType:     options?.entityType ?? 'branch',
      profileId:      options?.profileId ?? '',
      profileVersion: options?.profileVersion ?? '',
      periodId:       options?.periodId ?? '',
      generatedAt:    new Date().toISOString(),
    }
  }
}
