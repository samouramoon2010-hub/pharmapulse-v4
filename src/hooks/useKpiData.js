// ============================================================
// useKpiData — compute KPI stats from entries
// ============================================================
import { useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { getAchievementLevel, ACHIEVEMENT_META } from '../constants'

export function useKpiStats(entries = [], templates = []) {
  return useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const monthEnd   = format(endOfMonth(new Date()),   'yyyy-MM-dd')

    const todayEntries = entries.filter((e) => e.date === today)
    const monthEntries = entries.filter((e) => e.date >= monthStart && e.date <= monthEnd)

    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((s, e) => s + (e.achievement || 0), 0) / arr.length) : 0

    const todayAvg = avg(todayEntries)
    const monthAvg = avg(monthEntries)

    // Per-KPI breakdown
    const kpiBreakdown = templates.filter((t) => t.active && t.type !== 'formula').map((kpi) => {
      const kpiToday = todayEntries.filter((e) => e.kpiId === kpi.id)
      const kpiMonth = monthEntries.filter((e) => e.kpiId === kpi.id)
      const todayAch = avg(kpiToday)
      const totalVal = kpiToday.reduce((s, e) => s + (e.value || 0), 0)
      return {
        ...kpi,
        todayAchievement: todayAch,
        monthAchievement: avg(kpiMonth),
        totalValue: totalVal,
        level: getAchievementLevel(todayAch),
        ...ACHIEVEMENT_META[getAchievementLevel(todayAch)],
      }
    })

    // 30-day trend
    const trend = Array.from({ length: 30 }, (_, i) => {
      const date = format(subDays(new Date(), 29 - i), 'yyyy-MM-dd')
      const dayE  = entries.filter((e) => e.date === date)
      return { date, achievement: avg(dayE), count: dayE.length }
    })

    return { todayAvg, monthAvg, todayEntries, monthEntries, kpiBreakdown, trend }
  }, [entries, templates])
}

export function useBranchRanking(entries = [], branches = []) {
  return useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return branches.map((b) => {
      const be  = entries.filter((e) => e.branchId === b.id && e.date === today)
      const avg = be.length ? Math.round(be.reduce((s, e) => s + (e.achievement || 0), 0) / be.length) : 0
      return { ...b, todayAvg: avg, entryCount: be.length }
    }).sort((a, z) => z.todayAvg - a.todayAvg)
  }, [entries, branches])
}
