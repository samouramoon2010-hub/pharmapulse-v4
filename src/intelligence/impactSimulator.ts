// ============================================================
// Impact Simulator (Phase 6D)
//
// Compares a baseline scenario against a what-if scenario for the
// same entity/profile. Reuses, never reimplements:
//   - simulateProfile()      for both scenario scores
//   - computeRanking()       for rank/percentile impact
//   - computeBenchmark()     for peer-group gap impact
//   - computeMomentum() /
//     computeTrendDirection() for trend impact
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { simulateProfile } from '../profileStudio/simulator'
import { computeRanking } from '../evaluationLedger/ranking/rankingEngine'
import { computeBenchmark } from '../evaluationLedger/ranking/benchmarkEngine'
import { computeMomentum, computeTrendDirection } from '../evaluationLedger/ranking/trendEngine'
import type { ImpactScenarioInput, ImpactResult } from './impactTypes'

/**
 * Simulates the impact of a what-if scenario vs. a baseline for one
 * entity. Never throws — issues are reported in the result's `issues`
 * array rather than via an exception.
 */
export function simulateImpact(input: ImpactScenarioInput): ImpactResult {
  const issues: string[] = []
  try {
    const profile = input?.profile
    if (profile?.metadata?.status !== 'PUBLISHED') {
      return {
        baselineScore: 0, scenarioScore: 0, scoreDelta: 0,
        issues: [`Profile must be PUBLISHED to run an impact simulation (current status: ${profile?.metadata?.status ?? 'unknown'})`],
      }
    }

    const baseline = simulateProfile({ profile, actuals: input.baselineActuals ?? {}, targets: input.targets ?? {} })
    const scenario = simulateProfile({ profile, actuals: input.scenarioActuals ?? {}, targets: input.targets ?? {} })
    issues.push(...baseline.issues, ...scenario.issues)

    const result: ImpactResult = {
      baselineScore: baseline.score,
      scenarioScore: scenario.score,
      scoreDelta:    scenario.score - baseline.score,
      issues,
    }

    if (input.peerScores && input.peerScores.length > 0) {
      const peers = input.peerScores.filter((p) => p.entityId !== input.entityId)

      const baselineRanking = computeRanking({
        entityType: input.entityType, profileId: profile.metadata.id, periodId: 'baseline',
        scores: [...peers, { entityId: input.entityId, score: baseline.score }],
      })
      const scenarioRanking = computeRanking({
        entityType: input.entityType, profileId: profile.metadata.id, periodId: 'scenario',
        scores: [...peers, { entityId: input.entityId, score: scenario.score }],
      })

      const baselineEntry = baselineRanking.entries.find((e) => e.entityId === input.entityId)
      const scenarioEntry = scenarioRanking.entries.find((e) => e.entityId === input.entityId)

      if (baselineEntry && scenarioEntry) {
        result.baselineRank = baselineEntry.rank
        result.scenarioRank = scenarioEntry.rank
        result.rankChange = baselineEntry.rank - scenarioEntry.rank // positive = improved (moved to a better/lower rank number)
        result.baselinePercentile = baselineEntry.percentile
        result.scenarioPercentile = scenarioEntry.percentile
        result.percentileChange = scenarioEntry.percentile - baselineEntry.percentile // positive = improved
      }

      const baselineBenchmark = computeBenchmark({ groupId: 'impact-baseline', scores: [...peers, { entityId: input.entityId, score: baseline.score }] })
      const scenarioBenchmark = computeBenchmark({ groupId: 'impact-scenario', scores: [...peers, { entityId: input.entityId, score: scenario.score }] })
      const baselineGap = baselineBenchmark.entities.find((e) => e.entityId === input.entityId)?.gapFromAverage
      const scenarioGap = scenarioBenchmark.entities.find((e) => e.entityId === input.entityId)?.gapFromAverage
      if (typeof baselineGap === 'number' && typeof scenarioGap === 'number') {
        result.baselineGapFromAverage = baselineGap
        result.scenarioGapFromAverage = scenarioGap
        result.gapReduction = scenarioGap - baselineGap // positive = gap improved
      }
    }

    if (typeof input.previousScore === 'number') {
      const baselineSeries = [input.previousScore, baseline.score]
      const scenarioSeries = [input.previousScore, scenario.score]
      const baselineMomentum = computeMomentum(baselineSeries)
      const scenarioMomentum = computeMomentum(scenarioSeries)
      result.trendImpact = {
        baselineMomentum,
        scenarioMomentum,
        baselineDirection: computeTrendDirection(baselineMomentum, baselineSeries.length),
        scenarioDirection: computeTrendDirection(scenarioMomentum, scenarioSeries.length),
      }
    }

    return result
  } catch (e) {
    return {
      baselineScore: 0, scenarioScore: 0, scoreDelta: 0,
      issues: [`simulateImpact failed: ${e instanceof Error ? e.message : String(e)}`],
    }
  }
}
