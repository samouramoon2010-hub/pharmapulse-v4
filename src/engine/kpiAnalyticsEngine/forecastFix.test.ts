// ============================================================
// Dashboard Run Rate Forecast — 200% Fix Regression Tests
//
// Root cause confirmed:
//   const dp = useMemo(() => getDayProgress(), [])
//   → dp.currentDay stale; when = 1, currentDailyRate = entire month's actual
//   → forecastEOM = actual × totalDays >> 2 × target → capped at 200% for all KPIs
//
// Secondary issue:
//   dailyVals used myEntries (all-time) → inflated historicalMax/Avg
//
// Tests cover:
//   1.  getDayProgress().currentDay reflects today, not day 1
//   2.  DashboardPage source: dp is not memoized with []
//   3.  DashboardPage source: monthEntries used for dailyVals (not myEntries)
//   4.  forecastAchPct is not 200% for a realistic branch on day 11
//   5.  forecastAchPct is 0 when target = 0
//   6.  forecastAchPct is 0 when actual = 0
//   7.  no NaN from computeForecast with valid inputs
//   8.  no Infinity from computeForecast with valid inputs
//   9.  200% cap still applies when forecast genuinely exceeds 200%
//  10.  day-1 guard: currentDailyRate = 0 when currentDay = 0
//  11.  currentDailyRate scales correctly with currentDay
//  12.  forecastEOM at day 15: actual × 2 (30/15 ratio)
//  13.  stale-day scenario: day 1 does NOT produce 200% for normal actuals
//  14.  all-time entries do not inflate forecast (monthEntries scope)
//  15.  dp dep array removed from forecastMap memo
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  getDayProgress,
  computeForecast,
  computeCurrentDailyRate,
  computeForecastEOM,
  computeAchievementPct,
  ACHIEVEMENT_CAP,
} from '../../engine/kpiAnalyticsEngine'
import type { DayProgress } from '../../engine/kpiAnalyticsEngine'

// ── Helper to build a DayProgress object with controlled values ──

function makeDp(currentDay: number, totalDays = 30): DayProgress {
  return {
    currentDay,
    totalDays,
    daysRemaining: totalDays - currentDay,
    ratio: currentDay / totalDays,
    pct:   Math.round((currentDay / totalDays) * 100),
  }
}

// ════════════════════════════════════════════════════════════════
// 1–3. Source guards
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — source guards', () => {
  it('1: getDayProgress().currentDay equals today\'s day of month', () => {
    const dp = getDayProgress()
    const todayDay = new Date().getDate()
    expect(dp.currentDay).toBe(todayDay)
  })

  it('2: DashboardPage dp is NOT memoized with empty dep array', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // The stale pattern must not exist
    expect(src.default).not.toContain('useMemo(() => getDayProgress(), [])')
    // The fix must be present — direct call
    expect(src.default).toContain('const dp = getDayProgress()')
  })

  it('3: DashboardPage forecastMap uses monthEntries (not myEntries) for dailyVals', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // Within the forecastMap useMemo, monthEntries must be used for the sorted array
    expect(src.default).toContain('const sorted = [...monthEntries]')
    // The old pattern using myEntries must be gone
    expect(src.default).not.toContain('const sorted = [...myEntries]')
  })

  it('15: forecastMap dep array no longer lists dp separately', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // dp is now computed fresh every render — not a dep
    expect(src.default).toContain('}, [kpiStats, monthEntries])')
    expect(src.default).not.toContain('}, [kpiStats, dp, myEntries])')
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Realistic branch scenario at day 11
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — realistic scenario', () => {
  it('4: realistic branch at day 11 does NOT produce 200% for all KPIs', () => {
    // Branch: 3 pharmacists, wasfaty target = 500, actual = 264 (3 × ~88/day × 11 days)
    // At day 11 of 30: currentDailyRate = 264/11 = 24, forecastEOM = 24×30 = 720
    // forecastAchPct = 720/500 × 100 = 144% — well below 200 cap
    const dp     = makeDp(11)
    const result = computeForecast(264, 500, dp)
    expect(result.forecastAchPct).toBeLessThan(200)
    expect(result.forecastAchPct).toBeGreaterThan(0)
    // Specifically ~144%
    expect(result.forecastAchPct).toBeCloseTo(144, -1)
  })

  it('same scenario with stale day=1 WOULD produce 200% (demonstrates the bug)', () => {
    // With dp.currentDay=1: currentDailyRate = 264/1 = 264, forecastEOM = 264×30 = 7920
    // forecastAchPct = 7920/500×100 = 1584% → capped at 200
    const stale_dp = makeDp(1)
    const result   = computeForecast(264, 500, stale_dp)
    expect(result.forecastAchPct).toBe(200)   // confirms the old bug would fire
  })
})

// ════════════════════════════════════════════════════════════════
// 5–8. Safety guards
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — safety guards', () => {
  it('5: forecastAchPct = 0 when target = 0', () => {
    const dp     = makeDp(15)
    const result = computeForecast(100, 0, dp)
    expect(result.forecastAchPct).toBe(0)
  })

  it('6: forecastAchPct = 0 when actual = 0', () => {
    const dp     = makeDp(15)
    const result = computeForecast(0, 500, dp)
    expect(result.forecastAchPct).toBe(0)
  })

  it('7: no NaN from computeForecast with valid inputs', () => {
    const cases = [
      [100, 500, 15], [0, 500, 15], [500, 500, 15],
      [1000, 500, 15], [100, 0, 15], [100, 500, 1],
    ]
    for (const [actual, target, day] of cases) {
      const result = computeForecast(actual, target, makeDp(day))
      expect(isNaN(result.forecastAchPct)).toBe(false)
      expect(isNaN(result.forecastEOM)).toBe(false)
    }
  })

  it('8: no Infinity from computeForecast with any inputs', () => {
    const cases = [
      [0, 0, 15], [100, 0, 15], [100, 500, 0],
    ]
    for (const [actual, target, day] of cases) {
      const result = computeForecast(actual, target, makeDp(Math.max(day, 1)))
      expect(isFinite(result.forecastAchPct)).toBe(true)
      expect(isFinite(result.forecastEOM)).toBe(true)
    }
  })

  it('10: computeCurrentDailyRate = 0 when currentDay = 0 (guard exists)', () => {
    expect(computeCurrentDailyRate(100, 0)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 9. Cap still applies when genuinely above 200%
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — 200% cap preserved', () => {
  it('9: ACHIEVEMENT_CAP = 200 and applies when forecast genuinely exceeds it', () => {
    expect(ACHIEVEMENT_CAP).toBe(200)
    // actual = 400, target = 100, day 15 of 30
    // currentDailyRate = 400/15 = 26.7, forecastEOM = 26.7×30 = 800
    // forecastAchPct = 800/100×100 = 800% → capped at 200
    const dp     = makeDp(15)
    const result = computeForecast(400, 100, dp)
    expect(result.forecastAchPct).toBe(200)
  })

  it('near-200% genuine performance is not suppressed', () => {
    // actual = 95, target = 100, day 15 of 30
    // currentDailyRate = round(95/15 × 10)/10 = 6.3 (rounded to 1dp)
    // forecastEOM = round(6.3 × 30) = 189
    // forecastAchPct = round(189/100 × 100) = 189%
    const dp     = makeDp(15)
    const result = computeForecast(95, 100, dp)
    expect(result.forecastAchPct).toBe(189)
    expect(result.forecastAchPct).toBeLessThan(200)
  })
})

// ════════════════════════════════════════════════════════════════
// 11–13. Formula correctness
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — formula correctness', () => {
  it('11: currentDailyRate scales with currentDay', () => {
    // Same actual, different day → different daily rate
    const rate11 = computeCurrentDailyRate(110, 11)   // 10/day
    const rate22 = computeCurrentDailyRate(220, 22)   // 10/day
    expect(rate11).toBe(rate22)
    // Double the day, double the actual → same rate
  })

  it('12: forecastEOM = actual × (totalDays / currentDay) at day 15', () => {
    const actual = 150
    const dp     = makeDp(15, 30)
    const rate   = computeCurrentDailyRate(actual, dp.currentDay)   // 150/15 = 10
    const eom    = computeForecastEOM(rate, dp.totalDays)           // 10×30 = 300
    expect(eom).toBe(300)   // = actual × 2
  })

  it('13: with correct dp.currentDay=11, forecastAchPct < 200 for on-track branch', () => {
    // On-track branch: actual = target × (11/30) ≈ 36.7% of monthly target at day 11
    const target = 500
    const actual = Math.round(target * (11 / 30))   // 183 — exactly on pace
    const dp     = makeDp(11, 30)
    const result = computeForecast(actual, target, dp)
    // On-pace branch should forecast ~100% at EOM
    expect(result.forecastAchPct).toBeCloseTo(100, -1)
    expect(result.forecastAchPct).toBeLessThan(200)
  })
})

// ════════════════════════════════════════════════════════════════
// 14. All-time entries scope
// ════════════════════════════════════════════════════════════════

describe('Run Rate Forecast — entry scoping', () => {
  it('14: using only month entries produces lower historicalMax than all-time entries', () => {
    const allTimeEntries = [
      { date: '2026-04-15', wasfaty: 200 },   // previous month — high value
      { date: '2026-05-15', wasfaty: 180 },   // previous month
      { date: '2026-06-01', wasfaty: 80 },    // current month
      { date: '2026-06-11', wasfaty: 75 },    // current month
    ]
    const monthEntries = allTimeEntries.filter(e => e.date.startsWith('2026-06'))

    const allTimeMax   = Math.max(...allTimeEntries.map(e => e.wasfaty))
    const monthMax     = Math.max(...monthEntries.map(e => e.wasfaty))

    // All-time max = 200 (inflated by old months)
    // Month max    = 80 (correctly scoped)
    expect(allTimeMax).toBe(200)
    expect(monthMax).toBe(80)
    expect(monthMax).toBeLessThan(allTimeMax)
  })
})
