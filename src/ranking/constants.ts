// ============================================================
// Ranking Constants — RF-1A / RF-1C
// ============================================================

/** Cohort ID used for float pharmacists. Full implementation in RF-1D. */
export const FLOAT_POOL_COHORT_ID = 'float-pool'

/**
 * Cohort ID for the company-wide pharmacist ranking pool (RF-1C governance decision).
 * All pharmacists compete in a single pool — no classification sub-grouping.
 */
export const COMPANY_WIDE_COHORT_ID = 'company-wide'

/** Classification that must be excluded from all official branch rankings. */
export const UNRANKED_CLASSIFICATION_ID = 'unclassified'

/** Separator for composite ranking keys and document IDs. */
export const RANKING_KEY_SEP  = '::'
export const RANKING_DOC_SEP  = '#'

/**
 * Current governance version.
 * Increment this when ranking rules change — all snapshots carry this version
 * so consumers can detect rule changes across periods.
 */
export const GOVERNANCE_VERSION = 1

/**
 * Human-readable ranking rule version for this release.
 * Format: rf<phase>-v<revision>
 * Change this alongside GOVERNANCE_VERSION when rules change.
 */
export const RANKING_RULE_VERSION = 'rf1c-v1'

/**
 * Tie-break resolution order (documented as a constant for auditability).
 *
 * Branch ranking:
 *   1. cappedScore DESC
 *   2. uncappedScore DESC
 *   3. strategicKpi DESC (optional)
 *   4. consistency DESC / volatility ASC
 *   5. entityId ASC
 *
 * Pharmacist ranking (company-wide, RF-1C):
 *   1. cappedScore DESC
 *   2. achievementPct DESC    (mean basket achievement%)
 *   3. uncappedScore DESC     (raw finalScore)
 *   4. kpisAbove100 DESC      (count of KPI elements ≥ 100%)
 *   5. entityId ASC
 */
export const TIE_BREAK_ORDER_BRANCH = [
  'cappedScore', 'uncappedScore', 'strategicKpi',
  'consistency', 'volatility', 'entityId',
] as const

export const TIE_BREAK_ORDER_PHARMACIST = [
  'cappedScore', 'achievementPct', 'uncappedScore', 'kpisAbove100', 'entityId',
] as const

/** @deprecated Use TIE_BREAK_ORDER_BRANCH. Kept for backward compatibility. */
export const TIE_BREAK_ORDER = TIE_BREAK_ORDER_BRANCH
