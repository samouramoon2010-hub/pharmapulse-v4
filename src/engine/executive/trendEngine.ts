// ============================================================
// Executive Trend Engine
// Computes per-KPI trend details and branch trend summary.
// Pure function — no Firebase, no React.
// ============================================================

import {
  KPI_KEYS, KPI_META,
  computeTrendDirection, compute7DayRollingAvg,
  computeWeeklyMomentum, extractDailyValues, sumKpi,
} from '../kpiAnalyticsEngine'

import type { BranchInput } from './executiveTypes'
import type {
  KpiTrendDetail,
  BranchTrendSummary,
  TrendDirection,
} from './executiveTypes'

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
export function computeBranchTrend(branch: BranchInput): BranchTrendSummary {
  const src = branch.historicalEntries ?? branch.mtdEntries

  const kpiTrends: KpiTrendDetail[] = KPI_KEYS.map((kpiKey) => {
    const dailyVals = extractDailyValues(src, kpiKey)
    const trend     = computeKpiTrend(dailyVals, kpiKey)
    return {
      kpiKey,
      label: KPI_META[kpiKey].en,
      ...trend,
    }
  })

  const directions    = kpiTrends.map((t) => t.direction)
  const avgMomentum   = Math.round(
    kpiTrends.reduce((s, t) => s + t.momentum, 0) / Math.max(kpiTrends.length, 1)
  )

  return {
    pharmacyId:     branch.pharmacyId,
    overallMomentum: avgMomentum,
    direction:      dominantDirection(directions),
    kpiTrends,
  }
}
