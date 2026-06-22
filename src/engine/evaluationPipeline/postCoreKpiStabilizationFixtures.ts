// ============================================================
// PharmaPulse Post-Core-KPI Stabilization & Final Foundation Closure
// Shared fixtures for Phases 1, 2, and 5.
//
// NOT a test file — imported by the stabilization test suites so all
// phases exercise the exact same Registry + EvaluationProfile.
// ============================================================

import {
  buildPipelineContext, executePipeline, pipelineResultToEvaluationResult,
} from './index'
import { resolveEvaluationPipeline } from './pipelineResolver'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry/defaultKpiRegistry'
import type { KpiRegistry, KpiDefinition } from '../kpiRegistry/kpiRegistryTypes'
import type { EvaluationProfile } from '../evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationEngineInput } from '../evaluationEngine/evaluationEngineTypes'

// ── Arbitrary KPI keys (none hardcoded anywhere in non-test source) ──
export const DIGITAL      = 'digitalEngagementScoreStab'   // positive weight, used in profile
export const CONSULT      = 'consultationQualityScoreStab' // positive weight, used in profile
export const LOYALTY      = 'loyaltyEnrollmentRateStab'    // registered, NOT in profile
export const TRAINING     = 'staffTrainingHoursStab'       // in profile, weight = 0
export const NEW_REFERRAL = 'newPatientReferralsStab'      // brand-new arbitrary KPI, positive weight

// Basket-level rule — matches against aggregateAchievementPct (can exceed 100%).
export const FIVE_BAND: any = {
  id: 'five-band', name: 'Five Band',
  bands: [
    { min: 0,   max: 50,  label: 'Critical', score: 1 },
    { min: 50,  max: 80,  label: 'Below',    score: 2 },
    { min: 80,  max: 100, label: 'Meet',     score: 3 },
    { min: 100, max: 120, label: 'Exceed',   score: 4 },
    { min: 120, max: 999, label: 'Outstanding', score: 5 },
  ],
}

// Profile-level (overall rating) rule — matches against normalizedFinalScorePct
// (always scaled 0–100 by BASKET_SCORE_AGGREGATOR).
export const OVERALL_RATING_BAND: any = {
  id: 'overall-rating', name: 'Overall Rating',
  bands: [
    { min: 0,  max: 20, label: 'Critical', score: 1 },
    { min: 20, max: 40, label: 'Below',    score: 2 },
    { min: 40, max: 60, label: 'Meet',     score: 3 },
    { min: 60, max: 80, label: 'Exceed',   score: 4 },
    { min: 80, max: 101, label: 'Outstanding', score: 5 },
  ],
}

function makeDef(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'engagement', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0.1, isCore: false, isActive: true, lifecycleStage: 'production_evaluation',
    actualField: key, targetField: `${key}Target`,
    // Real Firestore-sourced KpiDefinitions always have this populated by
    // docToKpiDefinition()'s safe defaults — mirrored here so this fixture
    // matches a realistic, well-formed registry entry.
    visibility: {
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true,
      regionalEnabled: true, targetInputEnabled: true,
    },
    ...overrides,
  } as any
}

/**
 * Shared 10-KPI registry: 5 historical Core + 5 arbitrary (Stab) KPIs.
 * Registry `weight` here is the LEGACY/Stage-F engine weighting system
 * (Executive BI, Ranking breakdown display, Trend, Risk, Live Analytics,
 * Team/Branch/Regional Intelligence) — structurally separate from the
 * EvaluationProfile basket-element weight V2 evaluation uses (see
 * STAB_PROFILE below). Both are configured to agree directionally for
 * this fixture set so cross-surface comparisons are meaningful.
 */
export const STAB_REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [DIGITAL]:      makeDef(DIGITAL,      { weight: 0.30, label: 'Digital Engagement (Stab)' }),
  [CONSULT]:      makeDef(CONSULT,      { weight: 0.25, label: 'Consultation Quality (Stab)' }),
  [LOYALTY]:      makeDef(LOYALTY,      { weight: 0.10, label: 'Loyalty Enrollment (Stab)' }),
  [TRAINING]:     makeDef(TRAINING,     { weight: 0.00, label: 'Staff Training Hours (Stab)' }),
  [NEW_REFERRAL]: makeDef(NEW_REFERRAL, { weight: 0.20, label: 'New Patient Referrals (Stab)' }),
}

/**
 * Shared EvaluationProfile (V2). Single basket, weight 1.0. Core KPIs
 * deliberately carry a SMALL total weight (0.25) so a pharmacist cannot
 * coast on historical Core strength. digitalEngagementScoreStab +
 * consultationQualityScoreStab + newPatientReferralsStab carry 0.75 of
 * the weight. staffTrainingHoursStab is an element with weight 0.
 * loyaltyEnrollmentRateStab is registered but NOT a basket element.
 */
export const STAB_PROFILE: EvaluationProfile = {
  id: 'profile-stab', name: 'Stabilization Test Profile', version: 1,
  role: 'pharmacist', effectiveFrom: '2025-01-01', effectiveTo: null,
  status: 'published' as any,
  basketIds: ['b1'],
  baskets: {
    b1: {
      id: 'b1', name: 'Main Basket', weight: 1.0, active: true, sortOrder: 1,
      thresholdRule: FIVE_BAND,
      elements: [
        { kpiKey: 'wasfaty',      weight: 0.05, required: false, achievementCapPct: null },
        { kpiKey: 'omnihealth',   weight: 0.05, required: false, achievementCapPct: null },
        { kpiKey: 'wellnessCard', weight: 0.05, required: false, achievementCapPct: null },
        { kpiKey: 'basket',       weight: 0.05, required: false, achievementCapPct: null },
        { kpiKey: 'crossSelling', weight: 0.05, required: false, achievementCapPct: null },
        { kpiKey: DIGITAL,        weight: 0.30, required: false, achievementCapPct: null },
        { kpiKey: CONSULT,        weight: 0.25, required: false, achievementCapPct: null },
        { kpiKey: TRAINING,       weight: 0.00, required: false, achievementCapPct: null },
        { kpiKey: NEW_REFERRAL,   weight: 0.20, required: false, achievementCapPct: null },
      ],
      achievementCapPct: null,
    },
  },
  defaultThresholdRule: OVERALL_RATING_BAND,
  createdBy: null, createdAt: null, updatedAt: null,
  publishedAt: null, archivedAt: null, previousVersionId: null,
} as any

export const STAB_TARGETS = {
  wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100, basketTarget: 100, crossSellTarget: 100,
  [`${DIGITAL}Target`]: 100, [`${CONSULT}Target`]: 100,
  [`${TRAINING}Target`]: 100, [`${NEW_REFERRAL}Target`]: 100, [`${LOYALTY}Target`]: 100,
}

/** Run the official V2 pipeline (legacy-band-score preset — the V1-parity default) end-to-end. */
export function runV2(
  userId: string, pharmacyId: string, month: string,
  kpiActuals: Record<string, number>, branchTarget: Record<string, number>,
  profile: EvaluationProfile = STAB_PROFILE, registry: KpiRegistry = STAB_REGISTRY,
) {
  const input: EvaluationEngineInput = {
    userId, pharmacyId, month, role: 'pharmacist',
    profile, kpiActuals, branchTarget: branchTarget as any,
    registry, personalTarget: null,
  } as any
  const ctx      = buildPipelineContext(input)
  const resolved = resolveEvaluationPipeline(profile)
  const pipeRes  = executePipeline(ctx, resolved.steps)
  const result   = pipelineResultToEvaluationResult(pipeRes, { calculatedAt: Date.now() })
  return { result, ctx: pipeRes.context, resolved, pipeRes }
}
