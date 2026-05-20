// ============================================================
// Team Management Page - Store Manager view
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, TrendingUp, TrendingDown, Search, Filter,
  ChevronDown, BarChart2, Mail, Phone, Award,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import AchievementCircle from '../../components/charts/AchievementCircle'
import PerformanceChart from '../../components/charts/PerformanceChart'
import { todayStr, formatDateAr, getAchievementColor, currentMonthRange } from '../../utils/helpers'
import { DUMMY_USERS } from '../../data/dummyData'

export default function TeamPage() {
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeEntries, subscribeAllEntries } = useKpiStore()
  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    const unsubT = subscribeTemplates()
    const unsubE = subscribeEntries({ branchId: userProfile?.branchId })
    return () => { unsubT(); unsubE() }
  }, [userProfile?.branchId])

  const today = todayStr()
  const { from: monthFrom, to: monthTo } = currentMonthRange()

  const teamMembers = DUMMY_USERS.filter(
    (u) => u.role === 'pharmacist' &&
      (!userProfile?.branchId || u.branchId === userProfile?.branchId)
  )

  const memberStats = useMemo(() =>
    teamMembers.map((member) => {
      const todayEntries = entries.filter((e) => e.userId === member.uid && e.date === today)
      const monthEntries = entries.filter((e) => e.userId === member.uid && e.date >= monthFrom && e.date <= monthTo)

      const todayAvg = todayEntries.length
        ? Math.round(todayEntries.reduce((s, e) => s + e.achievement, 0) / todayEntries.length) : 0
      const monthAvg = monthEntries.length
        ? Math.round(monthEntries.reduce((s, e) => s + e.achievement, 0) / monthEntries.length) : 0

      const kpiMap = {}
      todayEntries.forEach((e) => { kpiMap[e.kpiId] = e })

      return { ...member, todayAvg, monthAvg, kpiMap, todayEntries, monthEntries }
    }).sort((a, b) => b.todayAvg - a.todayAvg),
    [teamMembers, entries, today, monthFrom, monthTo]
  )

  const filtered = memberStats.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  )

  const selected = selectedMember
    ? memberStats.find((m) => m.uid === selectedMember)
    : null

  // Chart data for selected member
  const memberChartData = useMemo(() => {
    if (!selected) return []
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayEntries = entries.filter((e) => e.userId === selected.uid && e.date === dateStr)
      const avg = dayEntries.length
        ? Math.round(dayEntries.reduce((s, e) => s + e.achievement, 0) / dayEntries.length) : 0
      days.push({
        date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }),
        value: avg,
        target: 80,
      })
    }
    return days
  }, [selected, entries])

  const activeKpis = templates.filter((t) => t.active)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">الفريق</h1>
          <p className="text-sm text-slate-400 mt-0.5">{teamMembers.length} صيدلاني في الفرع</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن صيدلاني..."
          className="pr-9 text-sm"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Team list */}
        <div className="space-y-3 lg:col-span-1">
          {filtered.map((member, idx) => (
            <div
              key={member.uid}
              onClick={() => setSelectedMember(member.uid === selectedMember ? null : member.uid)}
              className={`kpi-card cursor-pointer transition-all ${
                selectedMember === member.uid ? 'border-brand-500/40 bg-brand-500/5' : 'hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Rank badge */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                  idx === 1 ? 'bg-slate-600/30 text-slate-300' :
                  'bg-slate-800 text-slate-500'
                }`}>{idx + 1}</div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {member.displayName?.[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate">{member.displayName}</div>
                  <div className="text-xs text-slate-500 truncate">{member.email}</div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-bold ${getAchievementColor(member.todayAvg)}`}>
                    {member.todayAvg}%
                  </div>
                  <div className="text-xs text-slate-600">اليوم</div>
                </div>
              </div>

              {/* Mini progress */}
              <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1.5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(member.todayAvg, 100)}%`,
                    background: member.todayAvg >= 80 ? '#1a9a7e' : member.todayAvg >= 60 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="kpi-card text-center py-8 text-slate-500">
              لا توجد نتائج
            </div>
          )}
        </div>

        {/* Member detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-4 animate-fade-in">
              {/* Profile card */}
              <div className="kpi-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xl">
                      {selected.displayName?.[0]}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">{selected.displayName}</h2>
                      <p className="text-sm text-slate-400">{selected.email}</p>
                      {selected.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{selected.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <AchievementCircle pct={selected.monthAvg} size={90} label="الشهر" />
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
                  <div className="text-center">
                    <div className={`text-xl font-bold ${getAchievementColor(selected.todayAvg)}`}>
                      {selected.todayAvg}%
                    </div>
                    <div className="text-xs text-slate-500">إنجاز اليوم</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-bold ${getAchievementColor(selected.monthAvg)}`}>
                      {selected.monthAvg}%
                    </div>
                    <div className="text-xs text-slate-500">إنجاز الشهر</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-300">
                      {selected.todayEntries.length}/{activeKpis.length}
                    </div>
                    <div className="text-xs text-slate-500">KPI مكتملة</div>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">الأداء - آخر 14 يوم</h3>
                <PerformanceChart
                  data={memberChartData}
                  dataKey="value"
                  targetKey="target"
                  label="الإنجاز %"
                  color="#1a9a7e"
                  height={200}
                />
              </div>

              {/* Today's KPI breakdown */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">KPIs اليوم</h3>
                <div className="space-y-2.5">
                  {activeKpis.map((kpi) => {
                    const entry = selected.kpiMap[kpi.id]
                    const ach = entry?.achievement ?? null
                    return (
                      <div key={kpi.id} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kpi.color || '#1a9a7e' }} />
                        <span className="text-sm text-slate-400 flex-1">{kpi.name}</span>
                        {entry ? (
                          <>
                            <div className="w-20 bg-slate-800 rounded-full h-1.5">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(ach, 100)}%`,
                                  background: kpi.color || '#1a9a7e',
                                }}
                              />
                            </div>
                            <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(ach)}`}>
                              {ach}%
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-700">لم يُدخل</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="kpi-card flex flex-col items-center justify-center py-20 text-slate-600">
              <Users className="w-10 h-10 mb-3" />
              <p className="text-sm">اختر صيدلانياً لعرض تفاصيله</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
