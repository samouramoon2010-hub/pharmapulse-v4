// ============================================================
// Pharmacist Dashboard
// Main view for pharmacists: KPI cards, charts, summary
// ============================================================

import React, { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, TrendingUp, Target, Calendar, Plus, Zap } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import KpiCard from '../../components/kpi/KpiCard'
import StatCard from '../../components/ui/StatCard'
import AchievementCircle from '../../components/charts/AchievementCircle'
import PerformanceChart from '../../components/charts/PerformanceChart'
import { todayStr, formatDateAr, currentMonthRange } from '../../utils/helpers'

export default function PharmacistDashboard() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeEntries, subscribeAllEntries } = useKpiStore()

  useEffect(() => {
    const unsubT = subscribeTemplates()
    const unsubE = subscribeEntries({ userId: userProfile?.uid })
    return () => { unsubT(); unsubE() }
  }, [userProfile?.uid])

  const today = todayStr()
  const { from: monthFrom, to: monthTo } = currentMonthRange()

  // Today's entries keyed by kpiId
  const todayEntries = useMemo(() => {
    const map = {}
    entries.filter((e) => e.userId === userProfile?.uid && e.date === today)
      .forEach((e) => { map[e.kpiId] = e })
    return map
  }, [entries, userProfile?.uid, today])

  // Active KPIs visible to pharmacist
  const activeKpis = useMemo(() =>
    templates.filter((t) => t.active && (t.visibleTo?.includes('pharmacist') ?? true)),
    [templates]
  )

  // Overall achievement today
  const todayAchievement = useMemo(() => {
    const vals = activeKpis
      .map((kpi) => todayEntries[kpi.id]?.achievement)
      .filter((a) => a !== undefined)
    if (!vals.length) return 0
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
  }, [activeKpis, todayEntries])

  // Monthly chart data (last 14 days)
  const chartData = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayEntries = entries.filter(
        (e) => e.userId === userProfile?.uid && e.date === dateStr
      )
      const avg = dayEntries.length
        ? Math.round(dayEntries.reduce((s, e) => s + e.achievement, 0) / dayEntries.length)
        : 0
      days.push({
        date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }),
        value: avg,
        target: 80,
      })
    }
    return days
  }, [entries, userProfile?.uid])

  // Count filled KPIs today
  const filledCount = Object.keys(todayEntries).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            مرحباً، {userProfile?.displayName?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {formatDateAr(today)} — {filledCount}/{activeKpis.length} KPI تم إدخالها اليوم
          </p>
        </div>
        <button
          onClick={() => navigate('/pharmacist/entry')}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          إدخال KPI اليوم
        </button>
      </div>

      {/* Summary stats + Circle */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إنجاز اليوم"
          value={`${todayAchievement}%`}
          icon={Target}
          color="#1a9a7e"
          delay={0}
        />
        <StatCard
          label="KPI مكتملة"
          value={`${filledCount}/${activeKpis.length}`}
          icon={ClipboardList}
          color="#6366f1"
          delay={100}
        />
        <StatCard
          label="أفضل KPI"
          value={
            activeKpis.length
              ? `${Math.max(...activeKpis.map((k) => todayEntries[k.id]?.achievement ?? 0))}%`
              : '—'
          }
          icon={TrendingUp}
          color="#f59e0b"
          delay={200}
        />
        <StatCard
          label="هدف الشهر"
          value={`${Math.round(todayAchievement * 0.9)}%`}
          icon={Calendar}
          color="#ef4444"
          delay={300}
        />
      </div>

      {/* Achievement circle + chart */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="kpi-card flex flex-col items-center justify-center gap-4 py-8">
          <AchievementCircle pct={todayAchievement} size={140} label="إنجاز اليوم الكلي" />
          <div className="text-center">
            <div className="text-sm text-slate-400">
              {todayAchievement >= 100 ? '🎉 أحسنت! حققت الهدف' :
               todayAchievement >= 80 ? '💪 أداء جيد، استمر' :
               todayAchievement >= 60 ? '📈 على الطريق الصحيح' : '⚡ يحتاج تحسين'}
            </div>
          </div>
        </div>

        <div className="kpi-card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">الأداء - آخر 14 يوم</h3>
            <span className="badge bg-brand-500/10 text-brand-400 border-brand-500/20">%</span>
          </div>
          <PerformanceChart
            data={chartData}
            dataKey="value"
            targetKey="target"
            label="الإنجاز %"
            color="#1a9a7e"
            height={200}
          />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200">KPI اليوم</h2>
          {filledCount < activeKpis.length && (
            <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
              {activeKpis.length - filledCount} غير مكتملة
            </span>
          )}
        </div>

        {activeKpis.length === 0 ? (
          <div className="kpi-card text-center py-12">
            <Zap className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">لا توجد KPI مفعّلة حالياً</p>
            <p className="text-xs text-slate-600 mt-1">تواصل مع مديرك لإضافة KPIs</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeKpis.map((kpi) => (
              <div
                key={kpi.id}
                className="cursor-pointer"
                onClick={() => navigate('/pharmacist/entry', { state: { kpiId: kpi.id } })}
              >
                <KpiCard kpi={kpi} entry={todayEntries[kpi.id]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
