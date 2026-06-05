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
  achievementPct: number   // actual / target × 100; 0 when target = 0

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

// ── Calculation trace ─────────────────────────────────────────

export interface CalculationTrace {
  personalTargetUsed:  boolean
  missingKpis:         string[]   // engineKeys with no data in kpiActuals
  cappedKpis:          string[]   // not used in ER-2A (future: achievement cap)
  profileSnapshotId:   string     // = input.profile.id
  profileVersion:      number
  calculatedAtMs:      number     // Date.now() at engine invocation
  /**
   * Normalized final score as a percentage (0–100).
   * Computed as: (finalScore - minScore) / (maxScore - minScore) × 100
   * where minScore / maxScore are derived from the profile's threshold bands.
   * Used for top-level rating threshold matching.
   * Backwards-compatible: absent on ledger docs written before this field was added.
   */
  normalizedFinalScorePct?: number
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
