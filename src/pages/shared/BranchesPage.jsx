// ============================================================
// Branches Management Page
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { Building2, TrendingUp, Users, MapPin, Phone, Target } from 'lucide-react'
import { useKpiStore } from '../../store/kpiStore'
import { DUMMY_BRANCHES, DUMMY_USERS } from '../../data/dummyData'
import { todayStr, getAchievementColor } from '../../utils/helpers'
import AchievementCircle from '../../components/charts/AchievementCircle'
import PerformanceChart from '../../components/charts/PerformanceChart'

export default function BranchesPage() {
  const { entries, subscribeAllEntries, subscribeEntries } = useKpiStore()
  const [selected, setSelected] = useState(null)

  useEffect(() => { subscribeAllEntries() }, [])

  const today = todayStr()

  const branchStats = useMemo(() =>
    DUMMY_BRANCHES.map((branch) => {
      const todayEntries = entries.filter((e) => e.branchId === branch.id && e.date === today)
      const monthEntries = entries.filter((e) => e.branchId === branch.id)
      const todayAvg = todayEntries.length
        ? Math.round(todayEntries.reduce((s, e) => s + e.achievement, 0) / todayEntries.length) : 0
      const monthAvg = monthEntries.length
        ? Math.round(monthEntries.reduce((s, e) => s + e.achievement, 0) / monthEntries.length) : 0
      const staff = DUMMY_USERS.filter((u) => u.branchId === branch.id)
      return { ...branch, todayAvg, monthAvg, staff, todayEntries, totalEntries: monthEntries.length }
    }).sort((a, b) => b.todayAvg - a.todayAvg),
    [entries, today]
  )

  const selectedBranch = selected ? branchStats.find((b) => b.id === selected) : null

  // Chart data for selected branch
  const branchChartData = useMemo(() => {
    if (!selectedBranch) return []
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayEntries = entries.filter((e) => e.branchId === selectedBranch.id && e.date === dateStr)
      const avg = dayEntries.length
        ? Math.round(dayEntries.reduce((s, e) => s + e.achievement, 0) / dayEntries.length) : 0
      days.push({
        date: d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }),
        value: avg,
        target: 80,
      })
    }
    return days
  }, [selectedBranch, entries])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">الفروع</h1>
        <p className="text-sm text-slate-400 mt-0.5">{DUMMY_BRANCHES.length} فروع نشطة</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Branch cards */}
        <div className="space-y-3 lg:col-span-1">
          {branchStats.map((branch, idx) => (
            <div
              key={branch.id}
              onClick={() => setSelected(branch.id === selected ? null : branch.id)}
              className={`kpi-card cursor-pointer transition-all ${
                selected === branch.id ? 'border-brand-500/40 bg-brand-500/5' : 'hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                    idx === 1 ? 'bg-slate-600/30 text-slate-300' : 'bg-slate-800 text-slate-500'
                  }`}>{idx + 1}</div>
                  <h3 className="text-sm font-semibold text-slate-200">{branch.name}</h3>
                </div>
                <span className={`text-sm font-bold ${getAchievementColor(branch.todayAvg)}`}>
                  {branch.todayAvg}%
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{branch.staff.length} صيدلاني</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{branch.region}</span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(branch.todayAvg, 100)}%`,
                  background: branch.todayAvg >= 80 ? '#1a9a7e' : branch.todayAvg >= 60 ? '#eab308' : '#ef4444',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Branch detail */}
        <div className="lg:col-span-2">
          {selectedBranch ? (
            <div className="space-y-4 animate-fade-in">
              {/* Header */}
              <div className="kpi-card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedBranch.name}</h2>
                    <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />{selectedBranch.address}
                    </p>
                    {selectedBranch.phone && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />{selectedBranch.phone}
                      </p>
                    )}
                  </div>
                  <span className={`badge text-sm font-bold ${selectedBranch.active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {selectedBranch.active ? 'نشط' : 'غير نشط'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/60">
                  <div className="text-center">
                    <AchievementCircle pct={selectedBranch.todayAvg} size={90} label="اليوم" />
                  </div>
                  <div className="text-center flex flex-col justify-center">
                    <div className={`text-2xl font-bold ${getAchievementColor(selectedBranch.monthAvg)}`}>
                      {selectedBranch.monthAvg}%
                    </div>
                    <div className="text-xs text-slate-500">الشهر</div>
                  </div>
                  <div className="text-center flex flex-col justify-center">
                    <div className="text-2xl font-bold text-slate-300">{selectedBranch.staff.length}</div>
                    <div className="text-xs text-slate-500">صيادلة</div>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">الأداء - آخر 14 يوم</h3>
                <PerformanceChart
                  data={branchChartData}
                  dataKey="value"
                  targetKey="target"
                  label="الإنجاز %"
                  color="#1a9a7e"
                  height={200}
                  type="bar"
                />
              </div>

              {/* Staff list */}
              <div className="kpi-card">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">الفريق</h3>
                <div className="space-y-2">
                  {selectedBranch.staff.length === 0 ? (
                    <p className="text-sm text-slate-600">لا يوجد فريق مرتبط بهذا الفرع</p>
                  ) : (
                    selectedBranch.staff.map((member) => {
                      const memberTodayEntries = selectedBranch.todayEntries.filter((e) => e.userId === member.uid)
                      const avg = memberTodayEntries.length
                        ? Math.round(memberTodayEntries.reduce((s, e) => s + e.achievement, 0) / memberTodayEntries.length) : 0
                      return (
                        <div key={member.uid} className="flex items-center gap-3 py-1">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
                            {member.displayName?.[0]}
                          </div>
                          <span className="flex-1 text-sm text-slate-300">{member.displayName}</span>
                          <span className={`text-xs font-bold ${getAchievementColor(avg)}`}>{avg}%</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="kpi-card flex flex-col items-center justify-center py-20 text-slate-600">
              <Building2 className="w-10 h-10 mb-3" />
              <p className="text-sm">اختر فرعاً لعرض تفاصيله</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
