// ============================================================
// Evaluation Pipeline — Adapter (Phase 2A)
//
// Maps V2 EvaluationPipelineResult → V1 EvaluationResult.
//
// Purpose:
//   The ledger writer, ranking service, and all downstream consumers
//   expect EvaluationResult (the V1 contract). This adapter is the
//   bridge that allows V2 pipeline output to feed into the unchanged
//   production pipeline.
//
// Design rules:
//   ✓ Pure function — no Firestore, no React, no side effects
//   ✓ Preserves every field the ledger contract requires
//   ✓ Maps aggregateValue → aggregateAchievementPct with unit awareness
//   ✓ Reconstructs cappedKpis trace from element-level cap flags
//   ✓ Derives evaluation status from basket validity flags
//   ✗ Does not write to Firestore
//   ✗ Does not call the V1 engine
//
// aggregateAchievementPct mapping:
//   For 'achievement_pct' baskets (legacy flow): aggregateValue is already %.
//   For 'contribution_sum' baskets (SMARTS flow): aggregateValue is a raw
//   contribution total, NOT a percentage. We store it directly in
//   aggregateAchievementPct for ledger compatibility, but the field name
//   is a misnomer for SMARTS docs. This is documented as a known limitation
//   until a schema version field (pipelineVersion) is added in Phase 2B.
// ============================================================

import type { EvaluationPipelineResult, BasketContext, ElementContext } from './types'
import type {
  EvaluationResult, BasketResult, ElementResult,
  CalculationTrace, CappedKpiTrace, ResultStatus,
} from '../evaluationEngine/evaluationEngineTypes'

// ── Main adapter ──────────────────────────────────────────────

/**
 * Convert a V2 EvaluationPipelineResult into a V1 EvaluationResult.
 *
 * @param pipeline  The result from executePipeline()
 * @param opts      Metadata not carried in the context (status, timestamps)
 */
export function pipelineResultToEvaluationResult(
  pipeline: EvaluationPipelineResult,
  opts: {
    /** ISO timestamp for calculatedAtMs */
    calculatedAt?:     number
    /** Was a personal target used? Read from context if not provided. */
    personalTargetUsed?: boolean
  } = {},
): EvaluationResult {
  const ctx = pipeline.context

  // ── Derive status ─────────────────────────────────────────
  const hasInvalidBasket   = ctx.baskets.some((b) => b.isValid === false)
  const missingKpis        = collectMissingKpis(ctx.baskets)
  const hasMissingOptional = missingKpis.length > 0 && !hasInvalidBasket

  const status: ResultStatus =
    hasInvalidBasket   ? 'invalid' :
    hasMissingOptional ? 'partial' :
    'complete'

  // ── Map baskets ───────────────────────────────────────────
  const basketResults: BasketResult[] = ctx.baskets.map(mapBasket)

  // ── Reconstruct cappedKpis trace ──────────────────────────
  const cappedKpis: CappedKpiTrace[] = collectCappedKpis(ctx.baskets)

  // ── Build trace ───────────────────────────────────────────
  const trace: CalculationTrace = {
    personalTargetUsed:     opts.personalTargetUsed ?? false,
    missingKpis:            [...new Set(missingKpis)],
    cappedKpis,
    profileSnapshotId:      ctx.profileId,
    profileVersion:         ctx.profileVersion,
    calculatedAtMs:         opts.calculatedAt ?? Date.now(),
    normalizedFinalScorePct: ctx.normalizedFinalScorePct,
    integrityWarnings:      [...new Set(ctx.warnings)],
  }

  return {
    userId:         ctx.userId,
    pharmacyId:     ctx.pharmacyId,
    role:           ctx.role,
    month:          ctx.month,
    profileId:      ctx.profileId,
    profileVersion: ctx.profileVersion,
    basketResults,
    finalScore:     ctx.finalScore  ?? 0,
    rating:         ctx.ratingLabel ?? 'Unknown',
    ratingAr:       ctx.ratingLabelAr,
    ratingScore:    ctx.ratingScore ?? 0,
    ratingColor:    ctx.ratingColor,
    status,
    trace,
  }
}

// ── Basket mapper ─────────────────────────────────────────────

function mapBasket(basket: BasketContext): BasketResult {
  const elements: ElementResult[] = basket.elements.map(mapElement)

  return {
    basketId:   basket.basketId,
    basketName: basket.basketName,
    weight:     basket.weight,
    elements,
    // aggregateAchievementPct: store aggregateValue directly.
    // For legacy flow (achievement_pct): this is a true achievement%.
    // For SMARTS flow (contribution_sum): this is a contribution total stored
    // in an achievement% field. The aggregateValueUnit on the basket context
    // documents the real semantics; pipelineVersion on the ledger will clarify
    // this further in Phase 2B.
    aggregateAchievementPct: basket.aggregateValue ?? 0,
    bandLabel:    basket.bandLabel    ?? '',
    bandLabelAr:  basket.bandLabelAr,
    bandScore:    basket.bandScore    ?? 0,
    bandColor:    basket.bandColor,
    weightedScore: basket.weightedScore ?? 0,
    isValid:       basket.isValid      ?? true,
    invalidReason: basket.invalidReason,
  }
}

// ── Element mapper ────────────────────────────────────────────

function mapElement(el: ElementContext): ElementResult {
  return {
    kpiKey:       el.kpiKey,
    engineKey:    el.engineKey,
    label:        el.label,
    weight:       el.weight,
    actual:       el.actual,
    target:       el.target,
    targetSource: el.targetSource,
    achievementPct:       el.achievementPct     ?? 0,
    cappedAchievementPct: el.cappedAchievementPct ?? el.achievementPct ?? 0,
    capApplied:   el.capApplied ?? false,
    capPct:       el.capPct     ?? null,
    bandLabel:    el.bandLabel  ?? '',
    bandLabelAr:  el.bandLabelAr,
    bandScore:    el.bandScore  ?? 0,
    bandColor:    el.bandColor,
    weightedScore: el.weightedScore ?? 0,
    required:     el.required,
    dataAvailable: el.dataAvailable,
  }
}

// ── Helpers ───────────────────────────────────────────────────

function collectMissingKpis(baskets: BasketContext[]): string[] {
  const missing: string[] = []
  for (const basket of baskets) {
    for (const el of basket.elements) {
      if (!el.dataAvailable) missing.push(el.engineKey)
    }
  }
  return missing
}

function collectCappedKpis(baskets: BasketContext[]): CappedKpiTrace[] {
  const capped: CappedKpiTrace[] = []
  for (const basket of baskets) {
    for (const el of basket.elements) {
      if (el.capApplied && el.capPct != null) {
        capped.push({
          kpiKey:               el.kpiKey,
          engineKey:            el.engineKey,
          actualAchievementPct: el.achievementPct    ?? 0,
          cappedAchievementPct: el.cappedAchievementPct ?? 0,
          capPct:               el.capPct,
          // Source is not tracked at element level in the context —
          // the cap applier trace contains this detail.
          // For the ledger, default to 'element'; basket-level caps will be
          // correctly distinguished once Phase 2B adds source to ElementContext.
          source: 'element',
        })
      }
    }
  }
  return capped
}
