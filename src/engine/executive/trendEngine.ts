// ============================================================
// Executive Trend Engine
// Computes per-KPI trend details and branch trend summary.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META,
  computeTrendDirection, compute7DayRollingAvg,
  computeWeeklyMomentum, extractDailyValues, sumKpi,
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey,
} from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import type {
  KpiTrendDetail,
  BranchTrendSummary,
  TrendDirection,
} from './executiveTypes'

// Protected Engines Migration Phase C — Trend Engine.
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before (extractDailyValues without a
// registry, exactly as today). When supplied, each entry's daily value is
// read via the Dynamic Reader only where proven parity holds against a
// real sample; otherwise it falls back to the exact pre-migration
// per-entry computation. No call site passes a registry yet.
import { buildPilotPolicy, readPilotActual, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

// ── Trend direction rank (for dominant direction) ─────────────
const TREND_RANK: Record<TrendDirection, number> = {
  ACCELERATING:  4,
  IMPROVING:     3,
  STABLE:        2,
  DECLINING:     1,
  DETERIORATING: 0,
}

function dominantDirection(directions: TrendDirection[]): TrendDirection {
  if (!directions.length) return 'STABLE'
  const counts = directions.reduce((acc, d) => {
    acc[d] = (acc[d] || 0) + 1
    return acc
  }, {} as Record<TrendDirection, number>)
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as TrendDirection
}

function changePctVsPrev(current: number[], previous: number[]): number {
  const cur = current.reduce((s, v) => s + v, 0)
  const prv = previous.reduce((s, v) => s + v, 0)
  if (!prv) return 0
  return Math.round(((cur - prv) / prv) * 100)
}

// ── Per-KPI trend detail ──────────────────────────────────────
export function computeKpiTrend(
  allSortedEntries: ReturnType<typeof extractDailyValues>,
  kpiKey: Parameters<typeof extractDailyValues>[1],
): Pick<KpiTrendDetail, 'direction' | 'momentum' | 'rollingAvg7' | 'changePct7d' | 'changePct30d' | 'dataPoints'> {
  const n = allSortedEntries.length

  const direction   = computeTrendDirection(allSortedEntries)
  const rollingAvg7 = compute7DayRollingAvg(allSortedEntries)
  const dataPoints  = n

  const recent7  = allSortedEntries.slice(-7)
  const prev7    = allSortedEntries.slice(-14, -7)
  const recent30 = allSortedEntries.slice(-30)
  const prev30   = allSortedEntries.slice(-60, -30)

  const momentum     = prev7.length   ? computeWeeklyMomentum(recent7, prev7)   : 0
  const changePct7d  = prev7.length   ? changePctVsPrev(recent7, prev7)          : 0
  const changePct30d = prev30.length  ? changePctVsPrev(recent30, prev30)        : 0

  return { direction, momentum, rollingAvg7, changePct7d, changePct30d, dataPoints }
}

// ── Full branch trend summary ─────────────────────────────────
export function computeBranchTrend(branch: BranchInput, registry?: KpiRegistry): BranchTrendSummary {
  const src = branch.historicalEntries ?? branch.mtdEntries

  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(src[0] ?? null, branch.target ?? null, registry, 'trendEngine')
    : undefined

  // Core KPI Dependency Removal — Stage F: kpiTrends widens to every active
  // production_evaluation KPI for display when a registry is supplied.
  const trendKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  const kpiTrends: KpiTrendDetail[] = trendKeys.map((kpiKey) => {
    const dailyVals = registry && policy
      ? src.map((e) => readPilotActual(e as Record<string, unknown>, kpiKey, registry, policy))
      : extractDailyValues(src, kpiKey)
    const trend     = computeKpiTrend(dailyVals, kpiKey)
    return {
      kpiKey,
      label: getKpiMetaForKey(kpiKey, registry).en,
      ...trend,
    }
  })

  // overallMomentum/direction are weight-gated: only KPIs with a nonzero
  // registry weight (i.e. actually promoted into the weighted composite)
  // contribute to the aggregate. Every current production KPI besides the
  // 5 Core keys has weight 0 in the registry, so this is byte-identical to
  // the pre-Stage-F unweighted-mean-of-5 behavior today. A KPI only moves
  // this aggregate once it is genuinely promoted (weight > 0) — the same
  // promotion gate that already protects computeOverallAchievement.
  const weightedTrends = registry
    ? kpiTrends.filter((t) => getKpiWeightForKey(t.kpiKey, registry) > 0)
    : kpiTrends
  const directions    = weightedTrends.map((t) => t.direction)
  const avgMomentum   = Math.round(
    weightedTrends.reduce((s, t) => s + t.momentum, 0) / Math.max(weightedTrends.length, 1)
  )

  return {
    pharmacyId:     branch.pharmacyId,
    overallMomentum: avgMomentum,
    direction:      dominantDirection(directions),
    kpiTrends,
  }
}
