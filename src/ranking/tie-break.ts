// ============================================================
// Tie-Break Engine — RF-1A / RF-1C
//
// compareRecords() is used by BOTH branch and pharmacist engines.
//
// Branch tie-break order:
//   1. cappedScore DESC
//   2. uncappedScore DESC
//   3. strategicKpiScore DESC
//   4. consistencyScore DESC / volatilityScore ASC
//   5. entityId ASC
//
// Pharmacist tie-break order (RF-1C):
//   1. cappedScore DESC
//   2. achievementPct DESC   ← NEW: mean basket achievement%
//   3. uncappedScore DESC
//   4. kpisAbove100 DESC     ← NEW: count of elements ≥ 100%
//   5. entityId ASC
//
// The pharmacist-specific rules fire only when the corresponding
// fields are present on both records, so the same compareRecords
// function handles both entity types without branching on entityType.
//
// Input immutability:
//   sort() is called on a spread copy: [...records].sort(...)
//   The original array is never modified.
// ============================================================

import type { RankingInputRecord, TieBreakTrace, TieBreakRule } from './types'

// ── Single comparison ─────────────────────────────────────────

/**
 * Compare two records for ranking order.
 * Returns { order: number, trace: TieBreakTrace }
 *   order < 0 → a ranks higher than b
 *   order > 0 → b ranks higher than a
 *   order = 0 → impossible (entityId fallback always resolves)
 *
 * @pure — does not mutate either record
 */
export function compareRecords(
  a: RankingInputRecord,
  b: RankingInputRecord,
): { order: number; trace: TieBreakTrace } {
  // ── 1. cappedScore DESC ──────────────────────────────────────
  if (a.cappedScore !== b.cappedScore) {
    return {
      order: b.cappedScore - a.cappedScore,
      trace: {
        rule:          'cappedScore',
        decidingValue: a.cappedScore,
        description:   `cappedScore ${a.cappedScore} vs ${b.cappedScore} — ${a.cappedScore > b.cappedScore ? 'a wins' : 'b wins'}`,
      },
    }
  }

  // ── 2. achievementPct DESC (pharmacists — RF-1C) ─────────────
  // Fires only when both records carry achievementPct (pharmacist ranking).
  // Skipped silently for branch records where the field is absent.
  if (
    a.achievementPct !== undefined &&
    b.achievementPct !== undefined &&
    a.achievementPct !== b.achievementPct
  ) {
    return {
      order: b.achievementPct - a.achievementPct,
      trace: {
        rule:          'achievementPct',
        decidingValue: a.achievementPct,
        description:   `cappedScore tied; achievementPct ${a.achievementPct.toFixed(1)}% vs ${b.achievementPct.toFixed(1)}%`,
      },
    }
  }

  // ── 3. uncappedScore DESC ────────────────────────────────────
  if (a.uncappedScore !== b.uncappedScore) {
    return {
      order: b.uncappedScore - a.uncappedScore,
      trace: {
        rule:          'uncappedScore',
        decidingValue: a.uncappedScore,
        description:   `cappedScore/achievementPct tied; uncappedScore ${a.uncappedScore} vs ${b.uncappedScore}`,
      },
    }
  }

  // ── 4. kpisAbove100Count DESC (pharmacists — RF-1C) ──────────
  if (
    a.kpisAbove100Count !== undefined &&
    b.kpisAbove100Count !== undefined &&
    a.kpisAbove100Count !== b.kpisAbove100Count
  ) {
    return {
      order: b.kpisAbove100Count - a.kpisAbove100Count,
      trace: {
        rule:          'kpisAbove100',
        decidingValue: a.kpisAbove100Count,
        description:   `uncappedScore tied; kpisAbove100Count ${a.kpisAbove100Count} vs ${b.kpisAbove100Count}`,
      },
    }
  }

  // ── 5. strategicKpiScore DESC (if present) ───────────────────
  if (
    a.strategicKpiScore !== undefined &&
    b.strategicKpiScore !== undefined &&
    a.strategicKpiScore !== b.strategicKpiScore
  ) {
    return {
      order: b.strategicKpiScore - a.strategicKpiScore,
      trace: {
        rule:          'strategicKpi',
        decidingValue: a.strategicKpiScore,
        description:   `uncappedScore tied; strategicKpiScore ${a.strategicKpiScore} vs ${b.strategicKpiScore}`,
      },
    }
  }

  // ── 4a. consistencyScore DESC (preferred over volatility) ────
  if (
    a.consistencyScore !== undefined &&
    b.consistencyScore !== undefined &&
    a.consistencyScore !== b.consistencyScore
  ) {
    return {
      order: b.consistencyScore - a.consistencyScore,
      trace: {
        rule:          'consistency',
        decidingValue: a.consistencyScore,
        description:   `strategicKpi tied or absent; consistencyScore ${a.consistencyScore} vs ${b.consistencyScore}`,
      },
    }
  }

  // ── 4b. volatilityScore ASC (used when consistency absent) ───
  if (
    a.volatilityScore !== undefined &&
    b.volatilityScore !== undefined &&
    a.volatilityScore !== b.volatilityScore
  ) {
    return {
      order: a.volatilityScore - b.volatilityScore,
      trace: {
        rule:          'volatility',
        decidingValue: a.volatilityScore,
        description:   `consistencyScore absent/tied; volatilityScore ${a.volatilityScore} vs ${b.volatilityScore} (lower wins)`,
      },
    }
  }

  // ── 5. entityId ASC (alphabetic fallback) ────────────────────
  const idCmp = a.entityId.localeCompare(b.entityId, 'en', { sensitivity: 'base' })
  return {
    order: idCmp,
    trace: {
      rule:          'entityId',
      decidingValue: a.entityId,
      description:   `all scores identical; entityId "${a.entityId}" vs "${b.entityId}" — alphabetic order`,
    },
  }
}

// ── Sort with traces ──────────────────────────────────────────

export interface SortedRecord {
  record:         RankingInputRecord
  tieBreakTrace:  TieBreakTrace
}

/**
 * Sort a list of ranking input records into ranking order.
 * Returns a NEW array — the original is never mutated.
 * Each entry carries the tie-break trace used to resolve its position.
 *
 * @pure — input arrays not modified
 */
export function sortWithTieBreak(records: RankingInputRecord[]): SortedRecord[] {
  if (records.length === 0) return []
  if (records.length === 1) {
    return [{
      record:        records[0],
      tieBreakTrace: {
        rule:          'noTie',
        decidingValue: records[0].cappedScore,
        description:   'Only one record in cohort — no comparison needed',
      },
    }]
  }

  // Build (record, tieBreakTrace) pairs.
  // The trace for each record records the comparison against the record that
  // "beat" it in the sort — i.e. why it is ranked after the previous entry.
  const indexed = records.map((record, i) => ({ record, originalIndex: i }))

  // Sort a spread copy — original `records` array untouched.
  const sorted = [...indexed].sort((a, b) => {
    const { order } = compareRecords(a.record, b.record)
    return order
  })

  return sorted.map((item, rank) => {
    if (rank === 0) {
      return {
        record:        item.record,
        tieBreakTrace: {
          rule:          'noTie' as TieBreakRule,
          decidingValue: item.record.cappedScore,
          description:   'Ranked #1 — best score in cohort',
        },
      }
    }
    const { trace } = compareRecords(sorted[rank - 1].record, item.record)
    return { record: item.record, tieBreakTrace: trace }
  })
}
