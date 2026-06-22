// ============================================================
// Evaluation Ledger — Trend Types (Phase 5F)
//
// TypeScript-only data model for score history / momentum analysis
// over an entity's evaluation ledger entries across periods.
//
// No Firestore. No React. No executable logic.
// ============================================================

export interface ScoreHistoryPoint {
  periodId:       string
  score:          number
  profileId:      string
  profileVersion: string
  timestamp:      string
}

export type TrendDirection = 'improving' | 'regressing' | 'stable' | 'insufficient_data'

export interface ProfileVersionChange {
  periodId:       string
  fromVersion:    string
  toVersion:      string
}

export interface TrendResult {
  entityId:              string
  history:                ScoreHistoryPoint[]
  movingAverage:          number[]
  momentum:               number
  direction:              TrendDirection
  profileVersionChanges:  ProfileVersionChange[]
}
