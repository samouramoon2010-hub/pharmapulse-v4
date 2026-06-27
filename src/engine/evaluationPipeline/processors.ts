// ============================================================
// Evaluation Pipeline — Processors
//
// Seven approved, tested processors.
// No arbitrary formulas. No eval(). No dynamic code.
//
// Processor contract:
//   - Pure functions — given same context+config → same result
//   - Append trace entries (never modify existing ones)
//   - Return a NEW context (do not mutate input)
//   - Record warnings instead of throwing for data issues
//   - Throw only for configuration/structural problems
//
// Processor implementations:
//   A. ELEMENT_ACHIEVEMENT_CALCULATOR
//   B. ACHIEVEMENT_CAP_APPLIER
//   D. WEIGHTED_AVERAGE_AGGREGATOR   (legacy flow)
//   E. WEIGHT_CONTRIBUTION_APPLIER   (SMARTS flow)
//   F. SUM_AGGREGATOR
//   G. THRESHOLD_BAND_MATCHER
//   H. BASKET_SCORE_AGGREGATOR
// ============================================================

import type {
  EvaluationPipelineContext,
  EvaluationPipelineStep,
  EvaluationProcessor,
  EvaluationProcessorType,
  ProcessorTrace,
  ElementContext,
  BasketContext,
} from './types'
// Import from shared utility — NOT from evaluationEngine.ts.
// This removes the V2 → V1 coupling identified in the Phase 2A audit.
import { matchThresholdBand } from '../evaluationShared/thresholdUtils'
// PR-1I compliance fix: missing-data weight redistribution + final-score
// rounding, shared with evaluationEngine.ts (V1) via evaluationShared/.
import { computeApplicableWeightSum, normalizedElementWeight }
  from '../evaluationShared/weightRedistribution'
import { roundToTwoDecimals } from '../evaluationShared/scoreRounding'

// ── Helpers ───────────────────────────────────────────────────

function now(): number { return Date.now() }

function cloneContext(ctx: EvaluationPipelineContext): EvaluationPipelineContext {
  return {
    ...ctx,
    baskets:  ctx.baskets.map((b) => ({
      ...b,
      elements: b.elements.map((e) => ({ ...e })),
    })),
    warnings: [...ctx.warnings],
  }
}

function makeTrace(
  step:    number,
  type:    EvaluationProcessorType,
  desc:    string,
  inputs:  Record<string, unknown>,
  outputs: Record<string, unknown>,
  summary: string,
  warnings: string[],
  start:   number,
): ProcessorTrace {
  return {
    step, processorType: type, description: desc,
    inputs, outputs, summary, warnings,
    durationMs: Date.now() - start,
  }
}

// ── A. ELEMENT_ACHIEVEMENT_CALCULATOR ─────────────────────────
//
// actual / target × 100 for every element in every basket.
// Writes achievementPct to each ElementContext.
// Also sets cappedAchievementPct = achievementPct (identity — no cap yet).
// Sets dataAvailable and records missing KPIs as warnings.
//
const elementAchievementCalculator: EvaluationProcessor = {
  type: 'ELEMENT_ACHIEVEMENT_CALCULATOR',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const warnings: string[] = []
    const computed: Array<{ kpiKey: string; actual: number; target: number; achievementPct: number }> = []

    for (const basket of out.baskets) {
        for (const el of basket.elements) {
          // Trust pre-resolved actual and target from contextBuilder.
          // The contextBuilder uses getTargetFieldName() which correctly handles
          // KPI aliases (e.g. omnihealth → omniTarget via aliasFor='omni').
          // String concatenation fallbacks (kpiKey + 'Target') are REMOVED because
          // they produce incorrect field names for aliased keys:
          //   omnihealth + Target = 'omniHealthTarget' (wrong) vs 'omniTarget' (correct)
          // If neither pre-resolved value is present, default to 0 safely.
          const actual = (el.actual != null && el.actual > 0)
            ? el.actual
            : (ctx.kpiActuals[el.engineKey] ?? 0)

          const target = (el.target != null && el.target > 0)
            ? el.target
            : 0   // safe default; contextBuilder should always pre-resolve this

          const dataAvailable = actual > 0
            ? true
            : (el.dataAvailable === true)

          const achievementPct = target > 0 ? (actual / target) * 100 : 0

          if (!dataAvailable && el.required) {
            warnings.push(`Required KPI "${el.engineKey}" has no data`)
          }

          el.actual            = actual
          el.target            = target
          el.dataAvailable     = dataAvailable
          el.achievementPct    = achievementPct
          el.cappedAchievementPct = achievementPct  // identity until cap applier runs

          computed.push({ kpiKey: el.kpiKey, actual, target, achievementPct })
        }
      }

    tracing.push(makeTrace(
      tracing.length,
      'ELEMENT_ACHIEVEMENT_CALCULATOR',
      step.description,
      { basketCount: ctx.baskets.length, elementCount: ctx.baskets.reduce((s, b) => s + b.elements.length, 0) },
      { computed },
      `Computed achievement% for ${computed.length} element(s) across ${ctx.baskets.length} basket(s)`,
      warnings, start,
    ))

    out.warnings.push(...warnings)
    return out
  },
}

// ── B. ACHIEVEMENT_CAP_APPLIER ────────────────────────────────
//
// Applies element-level or basket-level achievementCapPct.
// Cap precedence: element > basket > none.
// Writes cappedAchievementPct; preserves raw achievementPct.
//
// config:
//   caps: Record<basketId, { basketCap?: number; elementCaps?: Record<kpiKey, number> }>
//
const achievementCapApplier: EvaluationProcessor = {
  type: 'ACHIEVEMENT_CAP_APPLIER',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const caps  = (step.config.caps ?? {}) as Record<string, {
      basketCap?: number
      elementCaps?: Record<string, number>
    }>
    const applied: Array<{ kpiKey: string; raw: number; capped: number; capPct: number; source: string }> = []

    for (const basket of out.baskets) {
      const basketConfig  = caps[basket.basketId] ?? {}
      const basketCapPct  = basketConfig.basketCap
      const elementCapMap = basketConfig.elementCaps ?? {}

      for (const el of basket.elements) {
        const raw = el.achievementPct ?? 0
        // Element cap takes precedence over basket cap
        const elementCap = elementCapMap[el.kpiKey]
        const resolvedCap =
          (typeof elementCap === 'number' && elementCap > 0)  ? elementCap  :
          (typeof basketCapPct === 'number' && basketCapPct > 0) ? basketCapPct :
          null

        if (resolvedCap !== null) {
          const capped = Math.min(raw, resolvedCap)
          if (capped < raw) {
            el.cappedAchievementPct = capped
            el.capApplied = true
            el.capPct = resolvedCap
            const src = typeof elementCap === 'number' && elementCap > 0 ? 'element' : 'basket'
            applied.push({ kpiKey: el.kpiKey, raw, capped, capPct: resolvedCap, source: src })
          } else {
            el.cappedAchievementPct = raw
            el.capApplied = false
            el.capPct = resolvedCap
          }
        } else {
          el.cappedAchievementPct = raw
          el.capApplied = false
          el.capPct = null
        }
      }
    }

    tracing.push(makeTrace(
      tracing.length,
      'ACHIEVEMENT_CAP_APPLIER',
      step.description,
      { capConfig: step.config.caps },
      { capped: applied },
      applied.length > 0
        ? `Applied cap to ${applied.length} element(s): ${applied.map((a) => `${a.kpiKey} ${a.raw.toFixed(1)}%→${a.capped.toFixed(1)}%`).join(', ')}`
        : 'No elements breached their cap',
      [], start,
    ))

    return out
  },
}

// ── C. ELEMENT_BAND_SCORER ────────────────────────────────────
//
// Applies threshold band matching at the ELEMENT level.
// Mirrors V1 scoreElement: band = matchThresholdBand(cappedAchievementPct,
//   el.thresholdOverride ?? basket.thresholdRule)
//
// Writes to each ElementContext:
//   bandLabel, bandLabelAr, bandScore, bandColor, weightedScore
//
// Must run AFTER ACHIEVEMENT_CAP_APPLIER so cappedAchievementPct is set.
// Must run BEFORE WEIGHTED_AVERAGE_AGGREGATOR (legacy) or
//   WEIGHT_CONTRIBUTION_APPLIER (SMARTS) — element bands are independent
//   of aggregation method.
//
// This processor was added to fix the V1/V2 parity gap where V2 always
// produced element.bandScore = 0 because only the basket aggregate was banded.
//
const elementBandScorer: EvaluationProcessor = {
  type: 'ELEMENT_BAND_SCORER',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const results: Array<{ kpiKey: string; cappedAchievementPct: number; bandLabel: string; bandScore: number }> = []

    for (const basket of out.baskets) {
      for (const el of basket.elements) {
        // V1 exact precedence: element thresholdOverride > basket thresholdRule
        const rule = el.thresholdOverride ?? basket.thresholdRule
        const band = matchThresholdBand(el.cappedAchievementPct ?? 0, rule)

        el.bandLabel    = band.label
        el.bandLabelAr  = (band as any).labelAr
        el.bandScore    = band.score
        el.bandColor    = (band as any).color
        el.weightedScore = band.score * el.weight

        results.push({
          kpiKey:              el.kpiKey,
          cappedAchievementPct: el.cappedAchievementPct ?? 0,
          bandLabel:           band.label,
          bandScore:           band.score,
        })
      }
    }

    tracing.push(makeTrace(
      tracing.length,
      'ELEMENT_BAND_SCORER',
      step.description,
      { elementCount: results.length },
      { elementBands: results },
      `Applied element-level bands: ${results.map((r) => `${r.kpiKey} ${r.cappedAchievementPct.toFixed(1)}%→${r.bandLabel}(${r.bandScore})`).join(', ')}`,
      [], start,
    ))

    return out
  },
}

// ── D. WEIGHTED_AVERAGE_AGGREGATOR ────────────────────────────
//
// Legacy flow: Σ (cappedAchievementPct × element.normalizedWeight) per basket.
// Writes aggregateValue to BasketContext.
//
// PR-1I Rule A: an element with no data (dataAvailable=false) is excluded
// from the aggregate AND its weight is excluded from the denominator; the
// remaining applicable elements' weights are renormalized so they still
// sum to the basket's full weight. An element present but genuinely at 0%
// achievement stays applicable (0 !== missing) and is NOT redistributed.
//
const weightedAverageAggregator: EvaluationProcessor = {
  type: 'WEIGHTED_AVERAGE_AGGREGATOR',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const results: Array<{ basketId: string; aggregateValue: number }> = []

    for (const basket of out.baskets) {
      const applicableWeightSum = computeApplicableWeightSum(basket.elements)
      for (const el of basket.elements) {
        el.normalizedWeight = normalizedElementWeight(el.weight, el.dataAvailable, applicableWeightSum)
      }
      // No applicable elements → safe no-data state (never divide by zero,
      // never invent a score) — matches the existing 0-when-no-data contract.
      const agg = applicableWeightSum > 0
        ? basket.elements.reduce(
            (sum, el) => sum + (el.cappedAchievementPct ?? 0) * (el.normalizedWeight ?? 0), 0,
          )
        : 0
      basket.aggregateValue     = agg
      basket.aggregateValueUnit = 'achievement_pct'
      basket.applicableWeightSum = applicableWeightSum
      results.push({ basketId: basket.basketId, aggregateValue: agg })
    }

    tracing.push(makeTrace(
      tracing.length,
      'WEIGHTED_AVERAGE_AGGREGATOR',
      step.description,
      { basketCount: out.baskets.length },
      { basketAggregates: results },
      `Computed weighted-average aggregate for ${out.baskets.length} basket(s)`,
      [], start,
    ))

    return out
  },
}

// ── E. WEIGHT_CONTRIBUTION_APPLIER ────────────────────────────
//
// SMARTS flow: contribution = cappedAchievementPct × element.normalizedWeight
// Writes contribution to each ElementContext.
// Does NOT aggregate — that is SUM_AGGREGATOR's job.
//
// PR-1I Rule A: identical missing-data exclusion + proportional weight
// redistribution as the legacy WEIGHTED_AVERAGE_AGGREGATOR, applied here
// because the SMARTS flow computes contribution per-element rather than
// aggregating in one step.
//
const weightContributionApplier: EvaluationProcessor = {
  type: 'WEIGHT_CONTRIBUTION_APPLIER',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const results: Array<{ kpiKey: string; achievementPct: number; weight: number; contribution: number }> = []

    for (const basket of out.baskets) {
      const applicableWeightSum = computeApplicableWeightSum(basket.elements)
      basket.applicableWeightSum = applicableWeightSum
      for (const el of basket.elements) {
        const normalizedWeight = normalizedElementWeight(el.weight, el.dataAvailable, applicableWeightSum)
        el.normalizedWeight = normalizedWeight
        const contribution = (el.cappedAchievementPct ?? 0) * normalizedWeight
        el.contribution = contribution
        results.push({
          kpiKey: el.kpiKey,
          achievementPct: el.cappedAchievementPct ?? 0,
          weight: el.weight,
          contribution,
        })
      }
    }

    tracing.push(makeTrace(
      tracing.length,
      'WEIGHT_CONTRIBUTION_APPLIER',
      step.description,
      { elementCount: results.length },
      { contributions: results },
      `Computed contribution for ${results.length} element(s): ` +
        results.map((r) => `${r.kpiKey}=${r.achievementPct.toFixed(1)}%×${(r.weight*100).toFixed(0)}%=${r.contribution.toFixed(2)}`).join(', '),
      [], start,
    ))

    return out
  },
}

// ── F. SUM_AGGREGATOR ─────────────────────────────────────────
//
// SMARTS flow: basket total = Σ element.contribution
// Writes aggregateValue to BasketContext.
//
const sumAggregator: EvaluationProcessor = {
  type: 'SUM_AGGREGATOR',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const results: Array<{ basketId: string; total: number }> = []

    for (const basket of out.baskets) {
      const total = basket.elements.reduce(
        (sum, el) => sum + (el.contribution ?? 0), 0,
      )
      basket.aggregateValue     = total
      basket.aggregateValueUnit = 'contribution_sum'
      results.push({ basketId: basket.basketId, total })
    }

    tracing.push(makeTrace(
      tracing.length,
      'SUM_AGGREGATOR',
      step.description,
      { basketCount: out.baskets.length },
      { basketTotals: results },
      `Summed contributions: ${results.map((r) => `basket(${r.basketId})=${r.total.toFixed(2)}`).join(', ')}`,
      [], start,
    ))

    return out
  },
}

// ── G. THRESHOLD_BAND_MATCHER ─────────────────────────────────
//
// Matches basket.aggregateValue against basket.thresholdRule.
// Writes bandLabel, bandScore, bandColor to BasketContext.
// Also sets isValid based on required elements.
//
const thresholdBandMatcher: EvaluationProcessor = {
  type: 'THRESHOLD_BAND_MATCHER',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const results: Array<{ basketId: string; aggregateValue: number; bandLabel: string; bandScore: number }> = []
    const warnings: string[] = []

    for (const basket of out.baskets) {
      const agg   = basket.aggregateValue ?? 0
      const band  = matchThresholdBand(agg, basket.thresholdRule)

      basket.bandLabel   = band.label
      basket.bandLabelAr = (band as any).labelAr
      basket.bandScore   = band.score
      basket.bandColor   = (band as any).color

      // Validity: required elements with no data
      const invalidEl = basket.elements.find((e) => e.required && !e.dataAvailable)
      basket.isValid      = !invalidEl
      basket.invalidReason = invalidEl
        ? `Required KPI "${invalidEl.kpiKey}" has no data`
        : undefined

      if (!basket.isValid) {
        warnings.push(`Basket "${basket.basketName}" invalid: ${basket.invalidReason}`)
      }

      results.push({ basketId: basket.basketId, aggregateValue: agg, bandLabel: band.label, bandScore: band.score })
    }

    tracing.push(makeTrace(
      tracing.length,
      'THRESHOLD_BAND_MATCHER',
      step.description,
      { basketCount: out.baskets.length },
      { bands: results },
      `Matched bands: ${results.map((r) => `basket(${r.basketId}) ${r.aggregateValue.toFixed(1)}→${r.bandLabel}(${r.bandScore})`).join(', ')}`,
      warnings, start,
    ))

    out.warnings.push(...warnings)
    return out
  },
}

// ── H. BASKET_SCORE_AGGREGATOR ────────────────────────────────
//
// Combines basket band scores into a final score.
// finalScore = Σ (bandScore × basket.weight)
// Normalizes to [0, 100] using min/max band scores from thresholdRules.
// Applies profile.defaultThresholdRule to get the top-level rating.
//
// config:
//   defaultThresholdRule: ThresholdRule (for final rating)
//
const basketScoreAggregator: EvaluationProcessor = {
  type: 'BASKET_SCORE_AGGREGATOR',
  execute(ctx, step, tracing) {
    const start = now()
    const out   = cloneContext(ctx)
    const warnings: string[] = []

    // Weighted basket scores
    for (const basket of out.baskets) {
      basket.weightedScore = (basket.bandScore ?? 0) * basket.weight
    }

    // PR-1I Rule B: raw precision preserved for the normalization math and
    // for traceability; the OFFICIAL finalScore is rounded once, here, at
    // the final boundary.
    const rawFinalScore = out.baskets.reduce((s, b) => s + (b.weightedScore ?? 0), 0)

    // Normalization: (finalScore - minScore) / (maxScore - minScore) × 100
    const minScore = out.baskets.reduce((s, b) => {
      const scores = b.thresholdRule?.bands?.map((bd) => bd.score) ?? [1]
      return s + Math.min(...scores) * b.weight
    }, 0)
    const maxScore = out.baskets.reduce((s, b) => {
      const scores = b.thresholdRule?.bands?.map((bd) => bd.score) ?? [5]
      return s + Math.max(...scores) * b.weight
    }, 0)

    const scoreRange = maxScore - minScore
    const rawNormalizedFinalScorePct = scoreRange > 0
      ? Math.max(0, Math.min(100, ((rawFinalScore - minScore) / scoreRange) * 100))
      : 0

    const finalScore              = roundToTwoDecimals(rawFinalScore)
    const normalizedFinalScorePct = roundToTwoDecimals(rawNormalizedFinalScorePct)

    // Top-level rating — matched against the rounded official value.
    const defaultRule = step.config.defaultThresholdRule as any
    const ratingBand  = defaultRule
      ? matchThresholdBand(normalizedFinalScorePct, defaultRule)
      : null

    out.finalScore              = finalScore
    out.normalizedFinalScorePct = normalizedFinalScorePct
    out.rawFinalScore              = rawFinalScore
    out.rawNormalizedFinalScorePct = rawNormalizedFinalScorePct
    out.ratingLabel             = ratingBand?.label ?? 'Unknown'
    out.ratingLabelAr           = ratingBand?.labelAr
    out.ratingScore             = ratingBand?.score ?? 0
    out.ratingColor             = ratingBand?.color

    if (!defaultRule) {
      warnings.push('No defaultThresholdRule configured — rating is Unknown')
      out.warnings.push(...warnings)
    }

    tracing.push(makeTrace(
      tracing.length,
      'BASKET_SCORE_AGGREGATOR',
      step.description,
      {
        basketScores: out.baskets.map((b) => ({
          basketId: b.basketId,
          bandScore: b.bandScore,
          weight: b.weight,
          weightedScore: b.weightedScore,
        })),
        minScore, maxScore,
      },
      { finalScore, normalizedFinalScorePct, rating: out.ratingLabel, ratingScore: out.ratingScore },
      `finalScore=${finalScore.toFixed(3)}, normalized=${normalizedFinalScorePct.toFixed(1)}%, ` +
        `rating="${out.ratingLabel}" (score=${out.ratingScore})`,
      warnings, start,
    ))

    return out
  },
}

// ── Processor registry ────────────────────────────────────────

export const PROCESSOR_REGISTRY: Record<EvaluationProcessorType, EvaluationProcessor> = {
  ELEMENT_ACHIEVEMENT_CALCULATOR: elementAchievementCalculator,
  ACHIEVEMENT_CAP_APPLIER:        achievementCapApplier,
  ELEMENT_BAND_SCORER:            elementBandScorer,
  WEIGHTED_AVERAGE_AGGREGATOR:    weightedAverageAggregator,
  WEIGHT_CONTRIBUTION_APPLIER:    weightContributionApplier,
  SUM_AGGREGATOR:                 sumAggregator,
  THRESHOLD_BAND_MATCHER:         thresholdBandMatcher,
  BASKET_SCORE_AGGREGATOR:        basketScoreAggregator,
}
