// ============================================================
// Historical Data Layer V1 — Unit Tests
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest'
import {
  // Daily summary
  generateDailySummary,
  dailySummaryId,

  // Monthly summary
  generateMonthlySummary,
  monthlySummaryId,

  // Forecast snapshot
  generateForecastSnapshot,
  forecastSnapshotId,

  // Risk snapshot
  generateRiskSnapshot,
  riskSnapshotId,

  // Trend engine
  buildTrendSummary7d,
  buildTrendSummary30d,
  buildAllTrends,
  computeAchievementEvolution,
  computeHistoricalPace,

  // Ranking history
  computeRankingHistory,
  rankingHistoryId,

  // Cache
  buildAnalyticsCache,

  // Helpers
  getSummaryWriteTargets,
  monthString,
  todayString,
  HISTORY_COLLECTIONS,
  PERFORMANCE_RULES,

  // Types
  DailySummary,
  MonthlySummary,
  ForecastSnapshot,
  RiskSnapshot,
  RankingHistory,
} from './historyEngine'

import type { KpiEntry, MonthlyTarget } from './kpiAnalyticsEngine'

// ── Fixtures ──────────────────────────────────────────────────
const REF_DATE = new Date(2025, 4, 15)  // May 15, 2025
const DATE     = '2025-05-15'
const MONTH    = '2025-05'
const USER_ID  = 'ph-001'
const BRANCH_ID = 'branch-001'

function makeEntry(date: string, vals: Partial<KpiEntry> = {}): KpiEntry {
  return {
    userId:       USER_ID,
    pharmacyId:   BRANCH_ID,
    date,
    wasfaty:      vals.wasfaty      ?? 5,
    omni:         vals.omni         ?? 3,
    wellness:     vals.wellness     ?? 4,
    basket:       vals.basket       ?? 2,
    crossSelling: vals.crossSelling ?? 2,
    ...vals,
  }
}

function makeTarget(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId:      BRANCH_ID,
    month:           MONTH,
    wasfatyTarget:   200,
    omniTarget:      100,
    wellnessTarget:  120,
    basketTarget:    80,
    crossSellTarget: 60,
    salesTarget:     50000,
    ...overrides,
  }
}

function makeMTDEntries(days = 15, vals?: Partial<KpiEntry>): KpiEntry[] {
  return Array.from({ length: days }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return makeEntry(`2025-05-${d}`, vals)
  })
}

// ── Document ID helpers ───────────────────────────────────────
describe('Document ID helpers', () => {
  it('dailySummaryId format', () => {
    expect(dailySummaryId('u1', 'p1', '2025-05-15')).toBe('u1_p1_2025-05-15')
  })
  it('monthlySummaryId format', () => {
    expect(monthlySummaryId('u1', 'p1', '2025-05')).toBe('u1_p1_2025-05')
  })
  it('forecastSnapshotId format', () => {
    expect(forecastSnapshotId('u1', 'p1', '2025-05-15')).toBe('u1_p1_2025-05-15')
  })
  it('riskSnapshotId format', () => {
    expect(riskSnapshotId('p1', '2025-05-15')).toBe('p1_2025-05-15')
  })
  it('rankingHistoryId format', () => {
    expect(rankingHistoryId('p1', '2025-05')).toBe('p1_2025-05')
  })
})

// ── generateDailySummary ──────────────────────────────────────
describe('generateDailySummary', () => {
  let entries: KpiEntry[]
  let target:  MonthlyTarget

  beforeEach(() => {
    entries = makeMTDEntries(15)
    target  = makeTarget()
  })

  it('returns correct id', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(s.id).toBe(`${USER_ID}_${BRANCH_ID}_${DATE}`)
  })

  it('sets userId and pharmacyId', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(s.userId).toBe(USER_ID)
    expect(s.pharmacyId).toBe(BRANCH_ID)
  })

  it('overallAchievement is a number 0..200', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(s.overallAchievement).toBeGreaterThanOrEqual(0)
    expect(s.overallAchievement).toBeLessThanOrEqual(200)
  })

  it('weakestKpi is a valid KPI key', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(['wasfaty','omni','wellness','basket','crossSelling']).toContain(s.weakestKpi)
  })

  it('strongestKpi is a valid KPI key', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(['wasfaty','omni','wellness','basket','crossSelling']).toContain(s.strongestKpi)
  })

  it('all 5 KPI snapshots are present', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(Object.keys(s.kpis)).toHaveLength(5)
  })

  it('each KPI snapshot has achievementPct', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    Object.values(s.kpis).forEach((kpi) => {
      expect(typeof kpi.achievementPct).toBe('number')
      expect(kpi.achievementPct).toBeGreaterThanOrEqual(0)
    })
  })

  it('month is extracted from date', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(s.month).toBe('2025-05')
  })

  it('snapshotAt is an ISO string', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(new Date(s.snapshotAt).toString()).not.toBe('Invalid Date')
  })

  it('works with null target', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, null, REF_DATE)
    expect(s.overallAchievement).toBe(0)
    expect(s.riskLevel).toBe('HIGH_RISK')
  })

  it('entryCount = entries on that specific date', () => {
    const s = generateDailySummary(USER_ID, BRANCH_ID, DATE, entries, target, REF_DATE)
    expect(s.entryCount).toBe(1) // one entry per day in makeMTDEntries
  })
})

// ── generateMonthlySummary ────────────────────────────────────
describe('generateMonthlySummary', () => {
  it('computes all 5 KPI summaries', () => {
    const entries = makeMTDEntries(30)
    const target  = makeTarget()
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, entries, target, 70, 65)
    expect(Object.keys(ms.kpis)).toHaveLength(5)
  })

  it('activeDays = distinct dates in entries', () => {
    const entries = makeMTDEntries(20)
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, entries, makeTarget())
    expect(ms.activeDays).toBe(20)
  })

  it('submissionRate = activeDays / totalDays × 100', () => {
    const entries = makeMTDEntries(20)
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, entries, makeTarget())
    expect(ms.submissionRate).toBe(Math.round(20 / 31 * 100))
  })

  it('consistencyScore is 0..100', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(15), makeTarget())
    expect(ms.consistencyScore).toBeGreaterThanOrEqual(0)
    expect(ms.consistencyScore).toBeLessThanOrEqual(100)
  })

  it('momentumScore is -100..100', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(30), makeTarget())
    expect(ms.momentumScore).toBeGreaterThanOrEqual(-100)
    expect(ms.momentumScore).toBeLessThanOrEqual(100)
  })

  it('forecastAccuracy = actual - forecast', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(30), makeTarget(), 70, 65)
    expect(ms.forecastAccuracy).toBe(-5)   // 65 - 70 = -5
  })

  it('forecastAccuracy is null when not provided', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(30), makeTarget())
    expect(ms.forecastAccuracy).toBeNull()
  })

  it('recoveryScore is 0..100', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(30), makeTarget())
    expect(ms.recoveryScore).toBeGreaterThanOrEqual(0)
    expect(ms.recoveryScore).toBeLessThanOrEqual(100)
  })

  it('computedAt is set', () => {
    const ms = generateMonthlySummary(USER_ID, BRANCH_ID, MONTH, makeMTDEntries(10), makeTarget())
    expect(new Date(ms.computedAt).toString()).not.toBe('Invalid Date')
  })
})

// ── generateForecastSnapshot ──────────────────────────────────
describe('generateForecastSnapshot', () => {
  it('produces snapshot with all 5 KPIs', () => {
    const snap = generateForecastSnapshot(USER_ID, BRANCH_ID, DATE, makeMTDEntries(15), makeTarget(), REF_DATE)
    expect(Object.keys(snap.kpis)).toHaveLength(5)
  })

  it('overallForecastPct is a number', () => {
    const snap = generateForecastSnapshot(USER_ID, BRANCH_ID, DATE, makeMTDEntries(15), makeTarget(), REF_DATE)
    expect(typeof snap.overallForecastPct).toBe('number')
  })

  it('dayProgress.ratio is ~0.484 on day 15 of May 31', () => {
    const snap = generateForecastSnapshot(USER_ID, BRANCH_ID, DATE, makeMTDEntries(15), makeTarget(), REF_DATE)
    expect(snap.dayProgress.ratio).toBeCloseTo(15 / 31, 1)
  })

  it('each KPI has breakEvenDay (number or null)', () => {
    const snap = generateForecastSnapshot(USER_ID, BRANCH_ID, DATE, makeMTDEntries(15), makeTarget(), REF_DATE)
    Object.values(snap.kpis).forEach((k) => {
      expect(k.breakEvenDay === null || typeof k.breakEvenDay === 'number').toBe(true)
    })
  })
})

// ── generateRiskSnapshot ──────────────────────────────────────
describe('generateRiskSnapshot', () => {
  it('submissionRate = 100 when all pharmacists submitted', () => {
    const today  = [makeEntry(DATE), makeEntry(DATE, { userId:'ph-002' })]
    const mtd    = [...makeMTDEntries(15), ...makeMTDEntries(15).map((e) => ({ ...e, userId:'ph-002' }))]
    const snap = generateRiskSnapshot(BRANCH_ID, DATE, today, mtd, makeTarget(), ['ph-001','ph-002'], REF_DATE)
    expect(snap.submissionRate).toBe(100)
  })

  it('missingPharmacists contains who did not submit', () => {
    const today  = [makeEntry(DATE)]   // only ph-001 submitted
    const snap = generateRiskSnapshot(BRANCH_ID, DATE, today, makeMTDEntries(15), makeTarget(), ['ph-001','ph-002'], REF_DATE)
    expect(snap.missingPharmacists).toContain('ph-002')
    expect(snap.missingPharmacists).not.toContain('ph-001')
  })

  it('riskLevel is a valid enum value', () => {
    const snap = generateRiskSnapshot(BRANCH_ID, DATE, [], [], null, ['ph-001'], REF_DATE)
    expect(['ON_TRACK','LOW_RISK','MEDIUM_RISK','HIGH_RISK']).toContain(snap.riskLevel)
  })

  it('id format is correct', () => {
    const snap = generateRiskSnapshot(BRANCH_ID, DATE, [], [], null, [], REF_DATE)
    expect(snap.id).toBe(`${BRANCH_ID}_${DATE}`)
  })
})

// ── Trend Engine ──────────────────────────────────────────────
describe('Trend Engine', () => {
  function makeSummaries(n: number, achBase = 50): DailySummary[] {
    return Array.from({ length: n }, (_, i) => {
      const d = String(i + 1).padStart(2, '0')
      const date = `2025-05-${d}`
      const actual = achBase + i  // increasing over time
      return {
        id:          `${USER_ID}_${BRANCH_ID}_${date}`,
        date, userId: USER_ID, pharmacyId: BRANCH_ID, month: MONTH,
        overallAchievement: Math.min(actual, 100),
        weakestKpi: 'omni' as const,
        strongestKpi: 'wasfaty' as const,
        forecastAchievement: 80,
        riskLevel: 'LOW_RISK' as const,
        paceStatus: 'ON_PACE' as const,
        entryCount: 1,
        snapshotAt: new Date().toISOString(),
        kpis: {
          wasfaty:      { actual, target:200, achievementPct:actual/2, status:'good', dailyRate:actual, paceStatus:'ON_PACE', forecastEOMPct:80, recoveryProb:0.7 },
          omni:         { actual:actual-5, target:100, achievementPct:(actual-5), status:'good', dailyRate:actual-5, paceStatus:'ON_PACE', forecastEOMPct:75, recoveryProb:0.6 },
          wellness:     { actual, target:120, achievementPct:actual, status:'good', dailyRate:actual, paceStatus:'ON_PACE', forecastEOMPct:80, recoveryProb:0.7 },
          basket:       { actual, target:80, achievementPct:actual, status:'good', dailyRate:actual, paceStatus:'ON_PACE', forecastEOMPct:82, recoveryProb:0.8 },
          crossSelling: { actual, target:60, achievementPct:actual, status:'good', dailyRate:actual, paceStatus:'ON_PACE', forecastEOMPct:85, recoveryProb:0.75 },
        },
      } as DailySummary
    })
  }

  it('buildTrendSummary7d returns correct period', () => {
    const t = buildTrendSummary7d('wasfaty', makeSummaries(14))
    expect(t.period).toBe('7d')
    expect(t.kpiKey).toBe('wasfaty')
  })

  it('trend direction is ACCELERATING for rising data', () => {
    const t = buildTrendSummary7d('wasfaty', makeSummaries(14, 10))
    // recent avg > previous avg by >5% → ACCELERATING
    expect(['ACCELERATING','IMPROVING']).toContain(t.direction)
  })

  it('buildTrendSummary30d returns correct period', () => {
    const t = buildTrendSummary30d('omni', makeSummaries(30))
    expect(t.period).toBe('30d')
  })

  it('buildAllTrends returns 5 trend summaries', () => {
    const trends = buildAllTrends(makeSummaries(14))
    expect(trends).toHaveLength(5)
  })

  it('computeAchievementEvolution sorted ascending', () => {
    const evo = computeAchievementEvolution(makeSummaries(5))
    expect(evo[0].date).toBe('2025-05-01')
    expect(evo[4].date).toBe('2025-05-05')
  })

  it('computeHistoricalPace returns correct structure', () => {
    const pace = computeHistoricalPace(makeSummaries(5), 'wasfaty')
    expect(pace).toHaveLength(5)
    pace.forEach((p) => {
      expect(p.date).toBeTruthy()
      expect(typeof p.dailyRate).toBe('number')
      expect(['EXCEEDING','ON_PACE','SLIGHTLY_BEHIND','SIGNIFICANTLY_BEHIND','CRITICAL']).toContain(p.paceStatus)
    })
  })
})

// ── computeRankingHistory ─────────────────────────────────────
describe('computeRankingHistory', () => {
  it('ranks pharmacists by overall achievement', () => {
    const profiles = [
      { userId:'ph-1', displayName:'فاطمة', mtdEntries: makeMTDEntries(15, { wasfaty:10, omni:8, wellness:9, basket:5, crossSelling:4 }) },
      { userId:'ph-2', displayName:'علي',   mtdEntries: makeMTDEntries(15, { wasfaty:5,  omni:3, wellness:4, basket:2, crossSelling:2 }) },
      { userId:'ph-3', displayName:'منى',   mtdEntries: makeMTDEntries(15, { wasfaty:15, omni:12,wellness:13,basket:8, crossSelling:7 }) },
    ]
    const result = computeRankingHistory(BRANCH_ID, MONTH, profiles, makeTarget())
    expect(result.rankings[0].userId).toBe('ph-3')   // highest values → rank 1
    expect(result.rankings[2].userId).toBe('ph-2')   // lowest values → rank 3
    expect(result.rankings[0].rank).toBe(1)
  })

  it('percentile is 100 for rank 1 of 3', () => {
    const profiles = [
      { userId:'ph-1', displayName:'A', mtdEntries: makeMTDEntries(10, { wasfaty:10, omni:10, wellness:10, basket:10, crossSelling:10 }) },
      { userId:'ph-2', displayName:'B', mtdEntries: makeMTDEntries(10, { wasfaty:5,  omni:5,  wellness:5,  basket:5,  crossSelling:5  }) },
      { userId:'ph-3', displayName:'C', mtdEntries: makeMTDEntries(10, { wasfaty:1,  omni:1,  wellness:1,  basket:1,  crossSelling:1  }) },
    ]
    const result = computeRankingHistory(BRANCH_ID, MONTH, profiles, makeTarget())
    expect(result.rankings[0].percentile).toBe(100)
    expect(result.rankings[2].percentile).toBe(0)
  })

  it('rankDelta is positive when moved up', () => {
    const profiles = [
      { userId:'ph-1', displayName:'A', mtdEntries: makeMTDEntries(10, { wasfaty:10, omni:10, wellness:10, basket:10, crossSelling:10 }) },
      { userId:'ph-2', displayName:'B', mtdEntries: makeMTDEntries(10, { wasfaty:5,  omni:5,  wellness:5,  basket:5,  crossSelling:5  }) },
    ]
    const prevRankings = [
      { userId:'ph-1', rank:2 } as any,  // was rank 2 last month
      { userId:'ph-2', rank:1 } as any,  // was rank 1 last month
    ]
    const result = computeRankingHistory(BRANCH_ID, MONTH, profiles, makeTarget(), prevRankings)
    const ph1 = result.rankings.find((r) => r.userId === 'ph-1')!
    expect(ph1.rankDelta).toBe(1)   // moved from 2 to 1 → +1
  })
})

// ── buildAnalyticsCache ───────────────────────────────────────
describe('buildAnalyticsCache', () => {
  it('computes mtdByKpi sums', () => {
    const entries = makeMTDEntries(10, { wasfaty:5 })
    const cache   = buildAnalyticsCache(USER_ID, BRANCH_ID, entries, [])
    expect(cache.mtdByKpi.wasfaty).toBe(50)  // 10 days × 5
  })

  it('trends has 5 entries (one per KPI)', () => {
    const cache = buildAnalyticsCache(USER_ID, BRANCH_ID, makeMTDEntries(5), [])
    expect(cache.trends).toHaveLength(5)
  })

  it('cachedAt is an ISO string', () => {
    const cache = buildAnalyticsCache(USER_ID, BRANCH_ID, [], [])
    expect(new Date(cache.cachedAt).toString()).not.toBe('Invalid Date')
  })
})

// ── getSummaryWriteTargets ────────────────────────────────────
describe('getSummaryWriteTargets', () => {
  it('returns all 4 target IDs', () => {
    const t = getSummaryWriteTargets(USER_ID, BRANCH_ID, DATE)
    expect(t.dailySummaryId).toBe(`${USER_ID}_${BRANCH_ID}_${DATE}`)
    expect(t.forecastSnapshotId_).toBe(`${USER_ID}_${BRANCH_ID}_${DATE}`)
    expect(t.riskSnapshotId_).toBe(`${BRANCH_ID}_${DATE}`)
    expect(t.rankingHistoryId_).toBe(`${BRANCH_ID}_2025-05`)
    expect(t.month).toBe('2025-05')
  })
})

// ── HISTORY_COLLECTIONS ───────────────────────────────────────
describe('HISTORY_COLLECTIONS', () => {
  it('contains expected collection names', () => {
    expect(HISTORY_COLLECTIONS.DAILY_SUMMARIES).toBe('daily_summaries')
    expect(HISTORY_COLLECTIONS.MONTHLY_SUMMARIES).toBe('monthly_summaries')
    expect(HISTORY_COLLECTIONS.FORECAST_SNAPSHOTS).toBe('forecast_snapshots')
    expect(HISTORY_COLLECTIONS.RISK_SNAPSHOTS).toBe('risk_snapshots')
    expect(HISTORY_COLLECTIONS.RANKING_HISTORY).toBe('ranking_history')
  })
})

// ── PERFORMANCE_RULES ─────────────────────────────────────────
describe('PERFORMANCE_RULES', () => {
  it('MAX_ENTRIES_PER_QUERY is 500', () => {
    expect(PERFORMANCE_RULES.MAX_ENTRIES_PER_QUERY).toBe(500)
  })
  it('CACHE_TTL_MINUTES is 5', () => {
    expect(PERFORMANCE_RULES.CACHE_TTL_MINUTES).toBe(5)
  })
})
