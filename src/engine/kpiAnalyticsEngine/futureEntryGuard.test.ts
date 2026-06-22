// ============================================================
// Dashboard — Future Entry Guard Regression Tests
//
// Root cause: demo seeder creates entries for all working days
// in the month, including future dates. monthEntries previously
// used date <= monthEnd, counting entries from June 12-30 on
// June 11, inflating actuals by ~2.6×.
//
// Fix: monthCeiling = min(today, monthEnd)
//      monthEntries: date >= monthStart AND date <= monthCeiling
//
// Tests:
//   1.  Future entries excluded from monthEntries on current day
//   2.  Today's entry is included (not excluded as future)
//   3.  Past entries within the month are included
//   4.  Yesterday's entry is included
//   5.  monthCeiling = today when today < monthEnd
//   6.  monthCeiling = monthEnd when today >= monthEnd (last day of month)
//   7.  Source: monthCeiling is defined in DashboardPage
//   8.  Source: monthEntries uses monthCeiling not monthEnd
//   9.  Source: monthEntries dep array includes monthCeiling
//  10.  Forecast no longer inflated: actuals with only elapsed entries
//       produce correct achievement (no 2.6× inflation)
//  11.  monthEnd is still used for monthCeiling computation (not removed)
//  12.  todayEntries unchanged (still date === today)
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeAchievementPct, computeForecast } from '../../engine/kpiAnalyticsEngine'

// ── Helper: simulate monthCeiling logic ──────────────────────

function getMonthCeiling(today: string, monthEnd: string): string {
  return today <= monthEnd ? today : monthEnd
}

/** Simulate the fixed monthEntries filter */
function filterMonthEntries(
  entries: Array<{ date: string; wasfaty: number }>,
  monthStart: string,
  monthCeiling: string,
) {
  return entries.filter(e => e.date >= monthStart && e.date <= monthCeiling)
}

// ── Fixtures ──────────────────────────────────────────────────

/** Simulate demo-seeded entries: one per working day across full month */
function makeDemoEntries(month: string, value: number): Array<{ date: string; wasfaty: number }> {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const entries: Array<{ date: string; wasfaty: number }> = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d)
    if (date.getDay() !== 5) {  // exclude Friday (Saudi weekend, matches demo seeder)
      entries.push({
        date: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
        wasfaty: value,
      })
    }
  }
  return entries
}

const MONTH       = '2026-06'
const MONTH_START = '2026-06-01'
const MONTH_END   = '2026-06-30'
const TODAY       = '2026-06-11'

// ════════════════════════════════════════════════════════════════
// 1–4. Date filter correctness
// ════════════════════════════════════════════════════════════════

describe('Future Entry Guard — date filtering', () => {
  const ceiling = getMonthCeiling(TODAY, MONTH_END)

  it('1: entries after today are excluded', () => {
    const entries = [
      { date: '2026-06-11', wasfaty: 10 },  // today — include
      { date: '2026-06-12', wasfaty: 10 },  // tomorrow — exclude
      { date: '2026-06-25', wasfaty: 10 },  // future — exclude
    ]
    const filtered = filterMonthEntries(entries, MONTH_START, ceiling)
    expect(filtered.map(e => e.date)).toEqual(['2026-06-11'])
  })

  it('2: today\'s entry is included (not treated as future)', () => {
    const entries = [{ date: TODAY, wasfaty: 10 }]
    const filtered = filterMonthEntries(entries, MONTH_START, ceiling)
    expect(filtered).toHaveLength(1)
  })

  it('3: past entries within the month are included', () => {
    const entries = [
      { date: '2026-06-01', wasfaty: 10 },
      { date: '2026-06-05', wasfaty: 10 },
      { date: '2026-06-10', wasfaty: 10 },
      { date: TODAY,         wasfaty: 10 },
    ]
    const filtered = filterMonthEntries(entries, MONTH_START, ceiling)
    expect(filtered).toHaveLength(4)
  })

  it('4: yesterday\'s entry is included', () => {
    const yesterday = '2026-06-10'
    const entries = [{ date: yesterday, wasfaty: 10 }]
    const filtered = filterMonthEntries(entries, MONTH_START, ceiling)
    expect(filtered).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════════
// 5–6. monthCeiling logic
// ════════════════════════════════════════════════════════════════

describe('Future Entry Guard — monthCeiling', () => {
  it('5: monthCeiling = today when today < monthEnd', () => {
    expect(getMonthCeiling('2026-06-11', '2026-06-30')).toBe('2026-06-11')
  })

  it('6: monthCeiling = monthEnd when today is last day of month', () => {
    expect(getMonthCeiling('2026-06-30', '2026-06-30')).toBe('2026-06-30')
  })

  it('6b: monthCeiling = monthEnd when today would be beyond it (safety)', () => {
    // Should never happen in practice but the logic handles it
    expect(getMonthCeiling('2026-07-01', '2026-06-30')).toBe('2026-06-30')
  })
})

// ════════════════════════════════════════════════════════════════
// 7–9. Source guards
// ════════════════════════════════════════════════════════════════

describe('Future Entry Guard — source guards', () => {
  it('7: monthCeiling is defined in DashboardPage', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('monthCeiling')
    expect(src.default).toContain('today <= monthEnd ? today : monthEnd')
  })

  it('8: monthEntries uses monthCeiling (not raw monthEnd)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // Must reference monthCeiling in the filter
    expect(src.default).toContain('e.date <= monthCeiling')
    // Must NOT use raw monthEnd as the upper bound
    expect(src.default).not.toContain('e.date <= monthEnd')
  })

  it('9: monthEntries dep array includes monthCeiling', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('[myEntries, monthStart, monthCeiling]')
  })

  it('11: monthEnd is still used for monthCeiling computation', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // monthEnd must still exist (used in monthCeiling definition)
    expect(src.default).toContain('monthEnd')
    expect(src.default).toContain("format(endOfMonth(new Date()), 'yyyy-MM-dd')")
  })

  it('12: todayEntries still uses date === today (unchanged)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain("e.date === today")
  })
})

// ════════════════════════════════════════════════════════════════
// 10. Forecast de-inflation
// ════════════════════════════════════════════════════════════════

describe('Future Entry Guard — forecast de-inflation', () => {
  it('10: with only elapsed entries, achievement matches expected pace', () => {
    // Demo seeded entries for full June (26 working days, 10 wasfaty/day)
    const allDemoEntries = makeDemoEntries(MONTH, 10)
    expect(allDemoEntries.length).toBeGreaterThan(20)  // full month entries exist

    // WITHOUT guard: count all entries regardless of date
    const allActual = allDemoEntries.reduce((s, e) => s + e.wasfaty, 0)

    // WITH guard: only entries through today (June 11)
    const ceiling = getMonthCeiling(TODAY, MONTH_END)
    const guardedEntries = filterMonthEntries(allDemoEntries, MONTH_START, ceiling)
    const guardedActual = guardedEntries.reduce((s, e) => s + e.wasfaty, 0)

    // Guarded actual is substantially less than all-month actual
    expect(guardedActual).toBeLessThan(allActual)

    // Guarded actual: only entries through June 11 (JS: getDay()!==5 excludes Friday)
    // June 2026 working days through June 11: 1,2,3,4,6,7,8,9,10,11 = 10 days
    // (June 5 = Friday in JS getDay()=5, excluded; June 6 = Saturday, included)
    expect(guardedEntries.length).toBe(10)
    expect(guardedActual).toBe(10 * 10)  // 10 days × 10 per day = 100
  })

  it('10b: forecast with guarded entries does not hit 200% cap for normal data', () => {
    // Simulate: 3 pharmacists, 120% pace, guarded to day 11
    const target = 500
    // Only 9 elapsed working days of entries:
    const guardedActual = 3 * 9 * (target / 3 / 25) * 1.20  // 3 pharmacists × 9 days × daily_target × achieve
    const dp = {
      currentDay: 11, totalDays: 30, daysRemaining: 19,
      ratio: 11/30, pct: Math.round(11/30*100),
    }
    const result = computeForecast(guardedActual, target, dp)
    // At realistic day-11 pace: should not cap at 200%
    expect(result.forecastAchPct).toBeLessThan(200)
    expect(result.forecastAchPct).toBeGreaterThan(0)
    // Expected: ~120% pace × (30/11) ÷ something... roughly ~120-150%
    // Actual pace at 9 elapsed working days out of 11 calendar days:
    expect(result.forecastAchPct).toBeLessThan(180)
  })

  it('10c: without guard, same data inflates to cap', () => {
    // Without guard: all 25 seeded days counted but divided by dp.currentDay=11
    const target = 500
    const fullMonthActual = 3 * 25 * (target / 3 / 25) * 1.20  // all 25 days seeded
    const dp = {
      currentDay: 11, totalDays: 30, daysRemaining: 19,
      ratio: 11/30, pct: Math.round(11/30*100),
    }
    const result = computeForecast(fullMonthActual, target, dp)
    // Without guard: inflated → hits 200% cap
    expect(result.forecastAchPct).toBe(200)
  })
})
