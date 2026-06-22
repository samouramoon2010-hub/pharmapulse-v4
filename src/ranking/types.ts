// ============================================================
// Ranking Types — RF-1A
//
// Pure type definitions only.
// No Firestore. No React. No side effects.
//
// Roadmap position:
//   Evaluation → [RF-0 Classification] → [RF-1A Ranking Ledger] → RF-1B Ranking UI
//
// Non-goals for RF-1A:
//   No Firestore collections, no repository, no UI, no Cloud Functions.
//   Types define the shape; engines produce values; persistence is RF-1B.
// ============================================================

// ── Period ────────────────────────────────────────────────────

/**
 * A ranking period — always a calendar month.
 * Format: 'YYYY-MM'
 *
 * Rankings are generated once per period, after month-close.
 * Mid-month rankings are explicitly out of scope for RF-1A.
 */
export type RankingPeriodId = string   // 'YYYY-MM'

/** Structured period representation for display. */
export interface RankingPeriod {
  /** 'YYYY-MM' */
  periodId:  RankingPeriodId
  /** e.g. 'June 2026' */
  label:     string
  /** e.g. 'يونيو 2026' */
  labelAr?:  string
  year:      number
  month:     number   // 1–12
}

// ── Entity types ──────────────────────────────────────────────

export type RankingEntityType = 'branch' | 'pharmacist'

// ── Cohort ────────────────────────────────────────────────────

/**
 * A cohort is the peer group within which entities are ranked.
 *
 * Branch cohort:    defined by (periodId, profileId, profileVersion, classificationId)
 * Pharmacist cohort: defined by (periodId, profileId, profileVersion, pharmacistCohortId)
 *   where pharmacistCohortId = classificationId of home branch (full-time)
 *   or 'float-pool' for float pharmacists (stub — full implementation in RF-1C)
 */
export interface RankingCohort {
  cohortId:           string            // deterministic key — see ranking-key.ts
  entityType:         RankingEntityType
  periodId:           RankingPeriodId
  profileId:          string
  profileVersion:     number
  classificationId:   string            // for branches; for pharmacists = home branch class or 'float-pool'
  memberCount:        number
}

// ── Input record ──────────────────────────────────────────────

/**
 * A single entity's evaluation output, shaped for ranking consumption.
 * The ranking engines read only these fields — they do not read Firestore.
 *
 * Source: EvaluationResult (from evaluationEngine) or EvaluationLedgerDoc (from Firestore).
 * The caller normalises evaluation output into this shape before passing to the engine.
 */
export interface RankingInputRecord {
  // Identity
  entityId:            string    // pharmacyId (branch) or userId (pharmacist)
  entityName?:         string    // display name
  entityType:          RankingEntityType

  // Period / profile
  periodId:            RankingPeriodId
  profileId:           string
  profileVersion:      number

  // Classification
  classificationId:    string    // resolved via RF-0 for the evaluation period
  pharmacistCohortId?: string    // pharmacists only — overrides classificationId for cohort grouping

  // Scores from evaluation
  cappedScore:         number    // normalizedFinalScorePct ∈ [0, 100] — primary sort key
  uncappedScore:       number    // raw finalScore (1.0–5.0 scale) — first tie-breaker
  achievementPct?:     number    // mean aggregateAchievementPct across baskets — Tie-break 1 (pharmacists)
  kpisAbove100Count?:  number    // count of KPI elements where achievementPct ≥ 100 — Tie-break 2 (pharmacists)
  strategicKpiScore?:  number    // optional — second tie-breaker (e.g. wasfaty achievement%)
  consistencyScore?:   number    // optional — third tie-breaker (higher = more consistent)
  volatilityScore?:    number    // optional — third tie-breaker alt (lower = less volatile)

  // Evaluation provenance
  sourceEvaluationId:  string    // ledger doc ID from evaluation_results collection
  evaluationStatus:    'complete' | 'partial' | 'invalid'

  // Employment type (pharmacists only)
  employmentType?:     'full-time' | 'float' | 'contract'

  // Home branch (pharmacists only — RF-1C)
  pharmacyId?:         string    // home branch pharmacy ID
}

// ── Tie-break trace ───────────────────────────────────────────

/** Which tie-break rule resolved the ordering between two entities. */
export type TieBreakRule =
  | 'cappedScore'       // primary — normalizedFinalScorePct DESC
  | 'achievementPct'    // tier 1 (pharmacists) — mean achievement% across baskets DESC
  | 'uncappedScore'     // tier 1/2 — raw finalScore DESC
  | 'kpisAbove100'      // tier 2 (pharmacists) — count of KPI elements ≥ 100% DESC
  | 'strategicKpi'      // tier 2  — strategicKpiScore DESC
  | 'consistency'       // tier 3a — consistencyScore DESC
  | 'volatility'        // tier 3b — volatilityScore ASC
  | 'entityId'          // fallback — entityId ASC (alphabetic, deterministic)
  | 'noTie'             // scores were unequal — no tie-break needed

export interface TieBreakTrace {
  /** Rule that determined this entity's rank relative to its predecessor. */
  rule:         TieBreakRule
  /** Score value used in the deciding comparison. */
  decidingValue: number | string | null
  /** Description in English for debugging. */
  description:  string
}

// ── Ranking snapshot ──────────────────────────────────────────

/**
 * A single entity's rank within its cohort for one period.
 * Immutable once generated — a new snapshot is created for each period.
 *
 * Both BranchRankingSnapshot and PharmacistRankingSnapshot embed this.
 */
export interface RankingSnapshot {
  // Identity
  snapshotId:          string    // deterministic doc ID — see ranking-key.ts
  entityType:          RankingEntityType
  entityId:            string
  entityName?:         string

  // Cohort
  cohortId:            string
  periodId:            RankingPeriodId
  profileId:           string
  profileVersion:      number
  classificationId:    string

  // Rank
  currentRank:         number    // 1-indexed, 1 = best
  previousRank?:       number    // rank in the prior period (if available)
  rankMovement?:       number    // currentRank - previousRank (negative = improved)
  cohortSize:          number    // total ranked members in this cohort

  // Scores (carried through from input for display)
  cappedScore:         number
  uncappedScore:       number
  achievementPct?:     number    // mean achievement% across baskets (pharmacists)
  kpisAbove100Count?:  number    // KPI elements ≥ 100% (pharmacists)
  strategicKpiScore?:  number
  consistencyScore?:   number
  volatilityScore?:    number

  // Tie-break
  tieBreakTrace:       TieBreakTrace

  // Provenance
  sourceEvaluationId:  string
  generatedAt:         string    // ISO timestamp

  // Governance metadata (RF-1C)
  governanceVersion:   number    // increments when ranking rules change
  rankingRuleVersion:  string    // human-readable rule identifier (e.g. 'rf1c-v1')

  // Trend (RF-1C)
  movementDirection?:  'up' | 'down' | 'unchanged' | 'new'
}

// ── Branch-specific snapshot ──────────────────────────────────

export interface BranchRankingSnapshot extends RankingSnapshot {
  entityType:          'branch'
  pharmacyId:          string   // same as entityId, typed explicitly
}

// ── Pharmacist-specific snapshot ──────────────────────────────

export interface PharmacistRankingSnapshot extends RankingSnapshot {
  entityType:         'pharmacist'
  userId:             string    // same as entityId, typed explicitly
  pharmacyId:         string    // home branch (now properly sourced from evaluation ledger)
  pharmacistCohortId: string    // 'company-wide' for RF-1C; 'float-pool' for floats (future)
  employmentType:     'full-time' | 'float' | 'contract'
  achievementPct:     number    // required for pharmacist snapshots (tie-break 1)
  kpisAbove100Count:  number    // required for pharmacist snapshots (tie-break 2)
}

// ── Engine output ─────────────────────────────────────────────

export interface RankingEngineOutput<S extends RankingSnapshot = RankingSnapshot> {
  cohort:     RankingCohort
  snapshots:  S[]
  excluded:   ExcludedRecord[]
}

export interface ExcludedRecord {
  entityId:    string
  entityName?: string
  reason:      string
  detail?:     string
}
