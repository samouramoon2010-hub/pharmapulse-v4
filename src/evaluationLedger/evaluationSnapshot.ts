// ============================================================
// Evaluation Ledger — Snapshot & Comparison (Phase 5B)
//
// Read-only snapshot/export/comparison helpers over ledger entries
// that are already in memory (e.g. fetched via listLedgerEntries).
// Pure — never reads or writes Firestore itself.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { EvaluationLedgerEntry } from './evaluationLedgerTypes'

export interface LedgerEntrySnapshot {
  snapshotId: string
  createdAt:  string
  entry:      EvaluationLedgerEntry
}

export interface LedgerExportBundle {
  format:     'evaluation-ledger-entry-v1'
  exportedAt: string
  entry:      EvaluationLedgerEntry
}

export interface ScoreMapDelta {
  id:     string
  before: number
  after:  number
  delta:  number
}

export interface LedgerEntryComparison {
  scoreDelta:    number
  basketDeltas:  ScoreMapDelta[]
  elementDeltas: ScoreMapDelta[]
  ruleDeltas:    ScoreMapDelta[]
}

let _counter = 0

/** Wraps a ledger entry in an immutable, deep-copied snapshot envelope. */
export function createLedgerEntrySnapshot(entry: EvaluationLedgerEntry): LedgerEntrySnapshot {
  _counter++
  return {
    snapshotId: `elsnap_${Date.now()}_${_counter}`,
    createdAt:  new Date().toISOString(),
    entry:      JSON.parse(JSON.stringify(entry ?? {})),
  }
}

/** Produces a portable export bundle for a single ledger entry. */
export function exportLedgerEntryJson(entry: EvaluationLedgerEntry): LedgerExportBundle {
  return {
    format:     'evaluation-ledger-entry-v1',
    exportedAt: new Date().toISOString(),
    entry:      JSON.parse(JSON.stringify(entry ?? {})),
  }
}

function diffScoreMap(a: Record<string, number> = {}, b: Record<string, number> = {}): ScoreMapDelta[] {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...ids].map((id) => {
    const before = a[id] ?? 0
    const after  = b[id] ?? 0
    return { id, before, after, delta: after - before }
  })
}

/**
 * Compares two ledger entries for the same entity across periods.
 * Never throws — returns zeroed deltas on malformed input.
 */
export function compareLedgerEntries(
  a: EvaluationLedgerEntry,
  b: EvaluationLedgerEntry,
): LedgerEntryComparison {
  try {
    return {
      scoreDelta:    (b?.score ?? 0) - (a?.score ?? 0),
      basketDeltas:  diffScoreMap(a?.basketScores, b?.basketScores),
      elementDeltas: diffScoreMap(a?.elementScores, b?.elementScores),
      ruleDeltas:    diffScoreMap(a?.ruleScores, b?.ruleScores),
    }
  } catch {
    return { scoreDelta: 0, basketDeltas: [], elementDeltas: [], ruleDeltas: [] }
  }
}
