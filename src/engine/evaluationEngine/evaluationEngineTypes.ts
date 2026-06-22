// ============================================================
// Evaluation Engine Types — ER-2A
//
// Pure type definitions only. No imports from Firestore, React,
// or Zustand. Safe to import from Cloud Functions in future.
//
// Architecture:
//   EvaluationEngineInput  → runEvaluation()  → EvaluationResult
//   EvaluationResult       → ledger write      → EvaluationLedgerDoc
//
// Non-goals for ER-2A:
//   No ranking. No coaching. No percentiles. No batch automation.
// ============================================================

import type { EvaluationProfile, EvaluationBasket, ThresholdBand }
  from '../evaluationRegistry/evaluationRegistryTypes'
import type { MonthlySummary } from '../kpiAnalyticsEngine'
import type { PersonalTargetDoc } from '../../services/personalTargetService'
import type { MonthlyTarget } from '../kpiAnalyticsEngine'
import type { KpiRegistry } from '../kpiRegistry'

// ── Input ─────────────────────────────────────────────────────

export type TargetSource = 'personal' | 'branch' | 'none'
export type ResultStatus = 'complete' | 'partial' | 'invalid'
// complete = all required KPIs have data
// partial  = some optional KPIs missing, result still valid
// invalid  = one or more required KPIs missing

export interface EvaluationEngineInput {
  // Identity
  userId:        string
  pharmacyId:    string
  month:         string    // 'yyyy-MM'
  role:          string

  // Profile — must be published
  profile:       EvaluationProfile

  /**
   * Pre-aggregated KPI actuals for the month, keyed by engineKey.
   * engineKey = kpi.aliasFor ?? kpi.key
   * e.g. { wasfaty: 31000, omni: 420, sales: 98000, ndf: 14 }
   *
   * MonthlySummary only covers the legacy 5 KPI_KEYS.
   * SMARTS profiles need non-core KPIs (sales, sl, ndf, inbody).
   * The caller must aggregate all kpi_entries for the month and
   * provide the full map here. MonthlySummary.kpis can be merged in
   * by the caller, but the engine itself reads only this map.
   */
  kpiActuals:    Record<string, number>

  /**
   * Optional: MonthlySummary from the history layer.
   * The engine does NOT read from this directly.
   * Provided for traceability / future extensions.
   * Use kpiActuals for all actual value resolution.
   */
  monthlySummary?: MonthlySummary | null

  // Targets — personal preferred, branch fallback, 0 if both absent
  personalTarget?: PersonalTargetDoc | null   // published only
  branchTarget?:   MonthlyTarget    | null

  // Live KPI Registry — for alias and target field resolution
  registry:      KpiRegistry
}

// ── Element result ────────────────────────────────────────────

export interface ElementResult {
  kpiKey:         string   // registry key (e.g. 'omnihealth')
  engineKey:      string   // aliasFor ?? key (e.g. 'omni')
  label:          string   // human-readable KPI label
  weight:         number   // element.weight within basket

  actual:         number   // summed value from kpiActuals[engineKey]
  target:         number   // resolved target value
  targetSource:   TargetSource
  achievementPct: number   // actual / target × 100; 0 when target = 0 (RAW — never modified)

  /**
   * Achievement after applying cap.  Equals achievementPct when no cap is active.
   * This is what feeds the basket aggregate and threshold matching.
   * Raw achievementPct is preserved separately for reporting.
   */
  cappedAchievementPct: number

  /** True when achievementPct was clamped. False when no cap or cap not reached. */
  capApplied:     boolean
  /** The cap value that was applied, or null if none. */
  capPct:         number | null

  // Threshold
  bandLabel:      string   // matched ThresholdBand.label
  bandLabelAr?:   string   // matched ThresholdBand.labelAr
  bandScore:      number   // matched ThresholdBand.score (config integer, NOT computed)
  bandColor?:     string   // matched ThresholdBand.color

  // Contribution
  weightedScore:  number   // bandScore × element.weight

  // Quality flags
  required:       boolean
  dataAvailable:  boolean  // false when kpiActuals[engineKey] is null/undefined
}

// ── Basket result ─────────────────────────────────────────────

export interface BasketResult {
  basketId:   string
  basketName: string
  weight:     number   // basket.weight in profile

  elements:   ElementResult[]

  // Aggregate achievement across all elements (weighted avg)
  aggregateAchievementPct: number

  // Threshold applied to aggregateAchievementPct
  bandLabel:     string
  bandLabelAr?:  string
  bandScore:     number
  bandColor?:    string

  // Contribution to final score
  weightedScore: number   // bandScore × basket.weight

  // Validity
  isValid:       boolean   // false if any required element has no data
  invalidReason?: string
}

// ── Capped KPI trace ──────────────────────────────────────────

/**
 * Trace record for a single KPI whose achievement was capped.
 * Stored in CalculationTrace.cappedKpis for auditability.
 */
export interface CappedKpiTrace {
  kpiKey:               string    // profile element key
  engineKey:            string    // aliasFor ?? key
  actualAchievementPct: number    // raw actual / target × 100
  cappedAchievementPct: number    // after cap applied
  capPct:               number    // the cap value from the profile
  /** 'element' = element-level cap; 'basket' = basket-level fallback cap */
  source:               'element' | 'basket'
}

// ── Calculation trace ─────────────────────────────────────────

export interface CalculationTrace {
  personalTargetUsed:  boolean
  missingKpis:         string[]         // engineKeys with no data in kpiActuals
  /**
   * Structured records for every element whose raw achievementPct was clamped
   * by an achievementCapPct from the profile.
   * Empty array when no caps were applied.
   * Replaces the former placeholder string[].
   */
  cappedKpis:          CappedKpiTrace[]
  profileSnapshotId:   string           // = input.profile.id
  profileVersion:      number
  calculatedAtMs:      number           // Date.now() at engine invocation
  /**
   * Normalized final score as a percentage (0–100).
   * Computed as: (finalScore - minScore) / (maxScore - minScore) × 100
   * where minScore / maxScore are derived from the profile's threshold bands.
   * Used for top-level rating threshold matching.
   * Backwards-compatible: absent on ledger docs written before this field was added.
   */
  normalizedFinalScorePct?: number
  /**
   * Profile integrity diagnostics surfaced at evaluation time (unknown KPI,
   * inactive KPI, duplicate weighted element, invalid weight). Populated
   * from the pipeline context's accumulated warnings — never alters
   * finalScore or any band/weight calculation. Empty when the Profile is
   * structurally clean. Backwards-compatible: absent on ledger docs written
   * before this field was added.
   */
  integrityWarnings?: string[]
}

// ── Evaluation result ─────────────────────────────────────────

export interface EvaluationResult {
  // Identity
  userId:         string
  pharmacyId:     string
  role:           string
  month:          string

  // Profile
  profileId:      string
  profileVersion: number

  // Results
  basketResults:  BasketResult[]
  finalScore:     number         // Σ basket.weightedScore
  rating:         string         // band label applied to finalScore
  ratingAr?:      string
  ratingScore:    number         // band score for finalScore
  ratingColor?:   string

  // Status
  status:         ResultStatus

  // Trace
  trace:          CalculationTrace
}
