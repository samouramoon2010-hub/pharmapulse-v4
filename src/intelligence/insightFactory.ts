// ============================================================
// Insight Engine — Factory (Phase 6B)
//
// Wires an OpportunityResult plus optional trend output into an
// InsightAnalysisInput. Reuses opportunityEngine's output shape and
// trendEngine's TrendResult — does not recompute either.
//
// No Firestore. No React. No UI.
// ============================================================

import type { OpportunityResult } from './opportunityTypes'
import type { TrendResult } from '../evaluationLedger/ranking/trendTypes'
import type { InsightAnalysisInput } from './insightTypes'

export interface BuildInsightInputOptions {
  overallScore:      number
  opportunityResult: OpportunityResult
  trend?:            TrendResult
  benchmarkAverage?: number
}

/** Builds an InsightAnalysisInput from an OpportunityResult + optional TrendResult. Never throws. */
export function buildInsightInput(options: BuildInsightInputOptions): InsightAnalysisInput {
  try {
    return {
      entityId:          options.opportunityResult.entityId,
      overallScore:      options.overallScore,
      opportunityItems:  options.opportunityResult.items ?? [],
      trendDirection:    options.trend?.direction,
      momentum:          options.trend?.momentum,
      benchmarkAverage:  options.benchmarkAverage,
    }
  } catch {
    return { entityId: '', overallScore: 0, opportunityItems: [] }
  }
}
