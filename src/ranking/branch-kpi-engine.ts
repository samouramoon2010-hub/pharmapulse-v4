// ============================================================
// Branch KPI Scoring Engine — RF-1C-B
//
// Computes branch-level ranking scores from raw KPI data.
// Reuses kpiAnalyticsEngine — no formula duplication.
//
// Business rule (approved RF-1C-B):
//   Branch achievement = Σ(all pharmacist actuals at branch) / branch target
//
// Example:
//   Branch target wasfaty = 100
//   Pharmacist A actual   =  70
//   Pharmacist B actual   =  20
//   Pharmacist C actual   =  10
//   Branch actual         = 100  →  100% achievement ✓
//
// Composite score:
//   Weighted achievement across KPIs using KPI_WEIGHTS from kpiAnalyticsEngine.
//   Capped at ACHIEVEMENT_CAP (200%) per KPI before weighting.
//
// KPI scope:
//   wasfaty, omni, wellness, basket, crossSelling (KPI_KEYS from analytics engine).
//   Extended KPIs (sl, ndf, inbody, sales) are carried in RankingInputRecord
//   as-is but not included in the composite weight calculation in v1.
//
// NO Firestore. NO React. NO side effects. Pure functions only.
// ============================================================

import {
  buildBranchSummary,
  sumKpi,
  safeReadTarget,
  safeReadActual,
  computeAchievementPct,
  KPI_KEYS,
  KPI_WEIGHTS,
  ACHIEVEMENT_CAP,
  getProductionEngineKeys,
} from '../engine/kpiAnalyticsEngine'
import type { KpiEntry, MonthlyTarget, KpiKey } from '../engine/kpiAnalyticsEngine'
import type { RankingInputRecord } from '../ranking/types'
import { UNRANKED_CLASSIFICATION_ID } from '../ranking/constants'

// Protected Engines Migration Phase B — Ranking Engine.
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. The ranking SCORE itself
// (overallAchievementPct, from buildBranchSummary) is never touched by
// this migration — only the supplementary per-KPI kpiBreakdown display
// data below is routed through the Dynamic Reader, gated by proven
// parity, with automatic fallback to the exact legacy computation.
// This guarantees zero score drift: buildBranchSummary's formula is
// completely unchanged.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../engine/kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../engine/kpiRegistry'

// ── Types ─────────────────────────────────────────────────────

/** Firestore target document shape (mirrors `targets/{pharmacyId}_{month}`). */
export interface BranchTargetDoc {
  pharmacyId:         string
  month:              string
  wasfatyTarget?:     number
  omniTarget?:        number
  wellnessTarget?:    number
  basketTarget?:      number
  /** Firestore stores 'crossSellingTarget'; analytics engine uses 'crossSellTarget' */
  crossSellingTarget?: number
  crossSellTarget?:   number
  salesTarget?:       number
  slTarget?:          number
  ndfTarget?:         number
  inbodyTarget?:      number
  [key: string]: unknown
}

/** KPI entry document from Firestore. */
export interface KpiEntryDoc {
  userId:       string
  pharmacyId:   string
  date:         string      // 'YYYY-MM-DD'
  wasfaty?:     number
  omni?:        number
  wellness?:    number
  basket?:      number
  crossSelling?: number
  sales?:       number
  sl?:          number
  ndf?:         number
  inbody?:      number
  [key: string]: unknown
}

export interface BranchKpiScore {
  pharmacyId:           string
  month:                string
  classificationId:     string
  pharmacyName:         string
  /** Overall composite weighted achievement % — cappedScore for ranking */
  overallAchievementPct: number
  /** Per-KPI breakdown */
  kpiBreakdown:          Record<KpiKey, { actual: number; target: number; achievementPct: number }>
  /** Number of pharmacist entry days contributing */
  entryCount:           number
  /** Number of pharmacists who contributed entries */
  pharmacistCount:      number
  /** Whether branch had a target document */
  hasTarget:            boolean
  /** Whether any KPI entries were found */
  hasEntries:           boolean
  /** Exclusion reason if ineligible for ranking */
  exclusionReason?:     string
}

// ── Target field adapter ──────────────────────────────────────

/**
 * Adapt a Firestore targets document to the MonthlyTarget shape
 * expected by kpiAnalyticsEngine.
 *
 * Handles the crossSellingTarget → crossSellTarget rename.
 */
export function adaptTargetDoc(doc: BranchTargetDoc): MonthlyTarget {
  return {
    // Core KPI Dependency Removal — Stage F: spread first so any
    // registry-driven target field (e.g. 'insuranceConversionTarget') is
    // preserved via MonthlyTarget's index signature. Explicit fields below
    // always win, preserving exact legacy values for the 5 Core keys.
    ...doc,
    pharmacyId:      doc.pharmacyId,
    month:           doc.month,
    wasfatyTarget:   Number(doc.wasfatyTarget  ?? 0),
    omniTarget:      Number(doc.omniTarget      ?? 0),
    wellnessTarget:  Number(doc.wellnessTarget  ?? 0),
    basketTarget:    Number(doc.basketTarget    ?? 0),
    // Firestore stores either spelling; accept both
    crossSellTarget: Number(doc.crossSellTarget ?? doc.crossSellingTarget ?? 0),
    salesTarget:     Number(doc.salesTarget     ?? 0),
  }
}

/**
 * Adapt Firestore KpiEntryDoc[] to KpiEntry[] for the analytics engine.
 */
export function adaptKpiEntries(docs: KpiEntryDoc[]): KpiEntry[] {
  return docs.map((d) => ({
    // Core KPI Dependency Removal — Stage F: spread the raw doc first so
    // any registry-driven KPI field (e.g. an arbitrary new engine key) is
    // preserved via KpiEntry's index signature, instead of being dropped.
    // The explicit fields below are assigned after the spread and always
    // win, preserving the exact legacy values/typing for the 5 Core keys.
    ...d,
    id:          d.id as string | undefined,
    userId:      d.userId,
    pharmacyId:  d.pharmacyId,
    date:        d.date,
    wasfaty:     Number(d.wasfaty      ?? 0),
    omni:        Number(d.omni         ?? 0),
    wellness:    Number(d.wellness     ?? 0),
    basket:      Number(d.basket       ?? 0),
    crossSelling: Number(d.crossSelling ?? 0),
    notes:       d.notes as string | undefined,
  }))
}

// ── Reference date for a month ────────────────────────────────

/**
 * Returns the last day of a given 'YYYY-MM' period as a Date.
 * Used as referenceDate so filterToCurrentMonth() targets the correct month.
 */
export function lastDayOfMonth(periodId: string): Date {
  const [y, m] = periodId.split('-').map(Number)
  return new Date(y, m, 0)   // day=0 of next month = last day of this month
}

// ── Main scorer ───────────────────────────────────────────────

/**
 * Compute the branch KPI score for one branch in one period.
 *
 * Delegates to buildBranchSummary() from kpiAnalyticsEngine — no formula
 * is duplicated here.
 *
 * @param pharmacyId        Firestore pharmacy document ID
 * @param month             'YYYY-MM' ranking period
 * @param classificationId  Branch classification (from RF-0)
 * @param pharmacyName      Display name
 * @param kpiEntries        All KPI entries for ALL pharmacists at this branch, in this month
 * @param targetDoc         Branch monthly target document (nullable)
 */
export function computeBranchKpiScore(
  pharmacyId:       string,
  month:            string,
  classificationId: string,
  pharmacyName:     string,
  kpiEntries:       KpiEntryDoc[],
  targetDoc:        BranchTargetDoc | null,
  registry?:        KpiRegistry,
): BranchKpiScore {
  // Eligibility checks
  const hasTarget  = targetDoc !== null
  const hasEntries = kpiEntries.length > 0

  if (!hasTarget) {
    return {
      pharmacyId, month, classificationId, pharmacyName,
      overallAchievementPct: 0, kpiBreakdown: {} as any,
      entryCount: 0, pharmacistCount: 0,
      hasTarget: false, hasEntries,
      exclusionReason: 'No branch target document found for this period',
    }
  }

  if (!hasEntries) {
    return {
      pharmacyId, month, classificationId, pharmacyName,
      overallAchievementPct: 0, kpiBreakdown: {} as any,
      entryCount: 0, pharmacistCount: 0,
      hasTarget: true, hasEntries: false,
      exclusionReason: 'No KPI entries found for this branch and period',
    }
  }

  const adaptedTarget  = adaptTargetDoc(targetDoc)
  const adaptedEntries = adaptKpiEntries(kpiEntries)
  const refDate        = lastDayOfMonth(month)

  // Delegate to existing analytics engine — no formula duplication.
  // Core KPI Dependency Removal — Stage F: registry is now threaded into
  // buildBranchSummary so the composite score sums over every active
  // production_evaluation KPI when a registry is supplied, with weight
  // resolved from the registry's own per-KPI `weight` field (Stage G —
  // weights are ordinary registry data). With no registry, the call
  // remains byte-identical to its pre-Stage-F behavior (KPI_KEYS only).
  const summary = buildBranchSummary(pharmacyId, adaptedEntries, adaptedTarget, refDate, registry)

  // Pilot policy for the per-KPI display breakdown only (not the score
  // above). Built once from a real entry+target sample already on hand.
  const policy = registry
    ? buildPilotPolicy(adaptedEntries[0] ?? null, adaptedTarget, registry, 'rankingEngine')
    : undefined

  // Build per-KPI breakdown for UI display.
  // Core KPI Dependency Removal — Stage F: widen to every active
  // production_evaluation KPI when a registry is supplied; identical to
  // before (5 Core keys only) when absent.
  const breakdownKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiBreakdown = {} as Record<KpiKey, { actual: number; target: number; achievementPct: number }>
  for (const key of breakdownKeys) {
    const actual  = registry && policy
      ? sumPilotActual(adaptedEntries as Record<string, unknown>[], key, registry, policy)
      : adaptedEntries.reduce((s, e) => s + (Number(e[key]) || 0), 0)
    const legacyTargetField = `${key === 'crossSelling' ? 'crossSell' : key}Target`
    const target = registry && policy
      ? readPilotTarget(adaptedTarget as Record<string, unknown>, key, registry, policy, () => Number(adaptedTarget[legacyTargetField] || 0))
      : Number(adaptedTarget[legacyTargetField] || 0)
    kpiBreakdown[key] = {
      actual,
      target,
      achievementPct: target > 0 ? Math.min(Math.round(actual / target * 100), ACHIEVEMENT_CAP) : 0,
    }
  }

  const pharmacistCount = new Set(kpiEntries.map((e) => e.userId)).size

  return {
    pharmacyId, month, classificationId, pharmacyName,
    overallAchievementPct: summary.overallAch,
    kpiBreakdown,
    entryCount:    summary.entryCount,
    pharmacistCount,
    hasTarget:     true,
    hasEntries:    true,
  }
}

// ── Batch scorer ──────────────────────────────────────────────

export interface BranchScoringInput {
  pharmacyId:       string
  month:            string
  classificationId: string
  pharmacyName:     string
  kpiEntries:       KpiEntryDoc[]
  targetDoc:        BranchTargetDoc | null
}

/**
 * Score multiple branches in one call.
 * Returns one BranchKpiScore per pharmacy.
 * @pure
 */
export function scoreBranches(inputs: BranchScoringInput[], registry?: KpiRegistry): BranchKpiScore[] {
  return inputs.map((b) =>
    computeBranchKpiScore(
      b.pharmacyId, b.month, b.classificationId, b.pharmacyName,
      b.kpiEntries, b.targetDoc, registry,
    )
  )
}

// ── Transform to RankingInputRecord ──────────────────────────

/**
 * Convert a BranchKpiScore to a RankingInputRecord for the ranking engine.
 * Only eligible (hasTarget && hasEntries && not unclassified) scores are converted.
 *
 * cappedScore  = overallAchievementPct clamped to [0, 100]
 * uncappedScore = raw overallAchievementPct (can exceed 100 if branch exceeds target)
 */
export function branchScoreToRankingInput(
  score:      BranchKpiScore,
  sourceId:   string,   // deterministic source ID (pharmacyId_month used as proxy)
): RankingInputRecord | null {
  if (score.exclusionReason) return null
  if (score.classificationId === UNRANKED_CLASSIFICATION_ID) return null

  return {
    entityId:           score.pharmacyId,
    entityName:         score.pharmacyName,
    entityType:         'branch',
    periodId:           score.month,
    profileId:          'branch-kpi',          // branch KPI scoring uses its own profile label
    profileVersion:     1,
    classificationId:   score.classificationId,
    cappedScore:        Math.min(100, score.overallAchievementPct),
    uncappedScore:      score.overallAchievementPct,
    achievementPct:     score.overallAchievementPct,
    sourceEvaluationId: sourceId,
    evaluationStatus:   'complete',
  }
}
