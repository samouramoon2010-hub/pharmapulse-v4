// ============================================================
// Pharmacist Performance Page
// Shows trends, monthly breakdown, and stats
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import PerformanceChart from '../../components/charts/PerformanceChart'
import AchievementCircle from '../../components/charts/AchievementCircle'
import { todayStr, formatKpiValue, getAchievementColor, currentMonthRange } from '../../utils/helpers'

export default function PharmacistPerformancePage() {
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeEntries, subscribeAllEntries } = useKpiStore()
  const [selectedKpi, setSelectedKpi] = useState(null)

  useEffect(() => {
    const unsubT = subscribeTemplates()
    const unsubE = subscribeEntries({ userId: userProfile?.uid })
    return () => { unsubT(); unsubE() }
  }, [userProfile?.uid])

  const activeKpis = useMemo(() =>
    templates.filter((t) => t.active && (t.visibleTo?.includes('pharmacist') ?? true)),
    [templates]
  )

  useEffect(() => {
    if (activeKpis.length && !selectedKpi) setSelectedKpi(activeKpis[0]?.id)
  }, [activeKpis])

  const { from: monthFrom, to: monthTo } = currentMonthRange()

  // Monthly achievement
  const monthlyAchievement = useMemo(() => {
    const monthEntries = entries.filter(
      (e) => e.userId === userProfile?.uid && e.date >= monthFrom && e.date <= monthTo
    )
    if (!monthEntries.length) return 0
    return Math.round(monthEntries.reduce((s, e) => s + e.achievement, 0) / monthEntries.length)
  }, [entries, userProfile?.uid, monthFrom, monthTo])

  // Chart data for selected KPI (last 30 days)
  const kpiChartData = useMemo(() => {
    if (!selectedKpi) return []
    const kpi = activeKpis.find((k) => k.id === selectedKpi)
    if (!kpi) return []
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const entry = entries.find(
        (e) => e.userId === userProfile?.uid && e.kpiId === selectedKpi && e.date === dateStr
      )
      days.push({
        date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }),
        value: entry?.value ?? null,
        target: kpi.target,
      })
    }
    return days.filter((d) => d.value !== null)
  }, [entries, selectedKpi, activeKpis, userProfile?.uid])

  // Per-KPI monthly stats
  const kpiStats = useMemo(() =>
    activeKpis.map((kpi) => {
      const kpiEntries = entries.filter(
        (e) => e.userId === userProfile?.uid && e.kpiId === kpi.id &&
          e.date >= monthFrom && e.date <= monthTo
      )
      const avg = kpiEntries.length
        ? Math.round(kpiEntries.reduce((s, e) => s + e.achievement, 0) / kpiEntries.length)
        : 0
      const total = kpiEntries.reduce((s, e) => s + e.value, 0)
      return { ...kpi, monthlyAvg: avg, total, days: kpiEntries.length }
    }),
    [activeKpis, entries, userProfile?.uid, monthFrom, monthTo]
  )

  const selectedKpiObj = activeKpis.find((k) => k.id === selectedKpi)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">أدائي</h1>
        <p className="text-sm text-slate-400 mt-0.5">تتبع تقدمك ومؤشرات الأداء الخاصة بك</p>
      </div>

      {/* Monthly circle + summary */}
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="kpi-card flex flex-col items-center justify-center py-8">
          <AchievementCircle pct={monthlyAchievement} size={130} label="إنجاز الشهر" />
        </div>
        <div className="kpi-card lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4 content-center">
          {kpiStats.slice(0, 4).map((kpi) => (
            <div key={kpi.id} className="text-center">
              <div className="text-2xl font-bold text-white" style={{ color: kpi.color }}>
                {kpi.monthlyAvg}%
              </div>
              <div className="text-xs text-slate-400 mt-1">{kpi.name}</div>
              <div className="text-xs text-slate-600 mt-0.5">{kpi.days} يوم</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI selector tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activeKpis.map((kpi) => (
          <button
            key={kpi.id}
            onClick={() => setSelectedKpi(kpi.id)}
            className={`badge flex-shrink-0 transition-all ${
              selectedKpi === kpi.id
                ? 'border-brand-500/40 text-brand-300'
                : 'bg-slate-800/60 text-slate-500 border-slate-700 hover:border-slate-600'
            }`}
            style={selectedKpi === kpi.id ? { background: `${kpi.color}15`, borderColor: `${kpi.color}40`, color: kpi.color } : {}}
          >
            {kpi.name}
          </button>
        ))}
      </div>

      {/* Selected KPI chart */}
      {selectedKpiObj && (
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">{selectedKpiObj.name} - آخر 30 يوم</h3>
            <span className="badge text-xs" style={{
              background: `${selectedKpiObj.color}15`,
              borderColor: `${selectedKpiObj.color}30`,
              color: selectedKpiObj.color,
            }}>
              هدف: {formatKpiValue(selectedKpiObj.target, selectedKpiObj.type, selectedKpiObj.unit)}
            </span>
          </div>
          <PerformanceChart
            data={kpiChartData}
            dataKey="value"
            targetKey="target"
            label={selectedKpiObj.name}
            color={selectedKpiObj.color}
            height={240}
          />
        </div>
      )}

      {/* Monthly breakdown table */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">ملخص الشهر - جميع KPIs</h3>
        <div className="space-y-3">
          {kpiStats.map((kpi) => (
            <div key={kpi.id} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kpi.color }} />
              <span className="text-sm text-slate-300 flex-1">{kpi.name}</span>
              <span className="text-xs text-slate-500">{kpi.days} يوم مُدخل</span>
              <div className="w-24 bg-slate-800 rounded-full h-1.5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(kpi.monthlyAvg, 100)}%`, background: kpi.color }}
                />
              </div>
              <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(kpi.monthlyAvg)}`}>
                {kpi.monthlyAvg}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
