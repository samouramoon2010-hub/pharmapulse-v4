// ============================================================
// Admin Dashboard - Executive Overview
// ============================================================

import React, { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, Target, TrendingUp, BarChart2,
  Zap, Shield, Settings, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import StatCard from '../../components/ui/StatCard'
import PerformanceChart from '../../components/charts/PerformanceChart'
import AchievementCircle from '../../components/charts/AchievementCircle'
import { todayStr, getAchievementColor } from '../../utils/helpers'
import { DUMMY_USERS, DUMMY_BRANCHES } from '../../data/dummyData'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { templates, entries, subscribeTemplates, subscribeEntries, subscribeAllEntries } = useKpiStore()

  useEffect(() => {
    const unsubT = subscribeTemplates()
    const unsubE = subscribeAllEntries()
    return () => { unsubT(); unsubE() }
  }, [])

  const today = todayStr()

  const totalUsers = DUMMY_USERS.filter((u) => u.role === 'pharmacist').length
  const totalBranches = DUMMY_BRANCHES.length

  // Overall achievement
  const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
  const overallAchievement = useMemo(() => {
    if (!todayEntries.length) return 0
    return Math.round(todayEntries.reduce((s, e) => s + e.achievement, 0) / todayEntries.length)
  }, [todayEntries])

  // Branch stats
  const branchStats = useMemo(() =>
    DUMMY_BRANCHES.map((branch) => {
      const branchEntries = todayEntries.filter((e) => e.branchId === branch.id)
      const avg = branchEntries.length
        ? Math.round(branchEntries.reduce((s, e) => s + e.achievement, 0) / branchEntries.length)
        : 0
      return { ...branch, achievement: avg, entriesCount: branchEntries.length }
    }).sort((a, b) => b.achievement - a.achievement),
    [todayEntries]
  )

  // 30-day trend
  const trendData = useMemo(() => {
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayEntries = entries.filter((e) => e.date === dateStr)
      const avg = dayEntries.length
        ? Math.round(dayEntries.reduce((s, e) => s + e.achievement, 0) / dayEntries.length)
        : 0
      days.push({
        date: i % 5 === 0 ? d.toLocaleDateString('ar-SA', { day: '2-digit', month: 'short' }) : '',
        value: avg,
        target: 80,
      })
    }
    return days
  }, [entries])

  // Per-KPI overview
  const kpiOverview = useMemo(() =>
    templates.filter((t) => t.active).map((kpi) => {
      const kpiEntries = todayEntries.filter((e) => e.kpiId === kpi.id)
      const avg = kpiEntries.length
        ? Math.round(kpiEntries.reduce((s, e) => s + e.achievement, 0) / kpiEntries.length)
        : 0
      return { ...kpi, achievement: avg, count: kpiEntries.length }
    }),
    [templates, todayEntries]
  )

  const quickActions = [
    { icon: Building2, label: 'الفروع', path: '/admin/branches', color: '#6366f1' },
    { icon: Users, label: 'المستخدمون', path: '/admin/users', color: '#f59e0b' },
    { icon: Target, label: 'KPI Builder', path: '/admin/kpi-builder', color: '#1a9a7e' },
    { icon: Zap, label: 'AI Insights', path: '/admin/ai', color: '#ec4899' },
    { icon: BarChart2, label: 'التقارير', path: '/admin/reports', color: '#06b6d4' },
    { icon: Settings, label: 'الإعدادات', path: '/settings', color: '#84cc16' },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">لوحة المدير التنفيذي</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            نظرة شاملة على أداء جميع الفروع والصيادلة
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/kpi-builder')} className="btn-secondary">
            <Target className="w-4 h-4" />
            KPI Builder
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إنجاز اليوم الكلي" value={`${overallAchievement}%`} icon={Target} color="#1a9a7e" delay={0} />
        <StatCard label="إجمالي الفروع" value={totalBranches} icon={Building2} color="#6366f1" delay={100} />
        <StatCard label="إجمالي الصيادلة" value={totalUsers} icon={Users} color="#f59e0b" delay={200} />
        <StatCard label="KPI نشطة" value={templates.filter((t) => t.active).length} icon={BarChart2} color="#ec4899" delay={300} />
      </div>

      {/* Achievement + Trend */}
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="kpi-card flex flex-col items-center justify-center py-8 gap-4">
          <AchievementCircle pct={overallAchievement} size={150} label="الإنجاز الكلي اليوم" />
          <div className="w-full space-y-1.5">
            {[
              { label: 'ممتاز (≥100%)', count: branchStats.filter((b) => b.achievement >= 100).length, color: '#22c55e' },
              { label: 'جيد (80-99%)', count: branchStats.filter((b) => b.achievement >= 80 && b.achievement < 100).length, color: '#1a9a7e' },
              { label: 'متوسط (60-79%)', count: branchStats.filter((b) => b.achievement >= 60 && b.achievement < 80).length, color: '#eab308' },
              { label: 'ضعيف (<60%)', count: branchStats.filter((b) => b.achievement < 60).length, color: '#ef4444' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-slate-500">{s.label}</span>
                </div>
                <span className="text-slate-300 font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="kpi-card lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">الاتجاه العام - آخر 30 يوم</h3>
          </div>
          <PerformanceChart
            data={trendData}
            dataKey="value"
            targetKey="target"
            label="الإنجاز %"
            color="#1a9a7e"
            height={220}
          />
        </div>
      </div>

      {/* Branches ranking */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">ترتيب الفروع اليوم</h3>
            <Building2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="space-y-3">
            {branchStats.map((branch, idx) => (
              <div key={branch.id} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                  idx === 1 ? 'bg-slate-600/30 text-slate-400' :
                  idx === 2 ? 'bg-orange-700/20 text-orange-600' :
                  'bg-slate-800/60 text-slate-600'
                }`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-300">{branch.name}</span>
                    <span className={`text-xs font-bold ${getAchievementColor(branch.achievement)}`}>
                      {branch.achievement}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(branch.achievement, 100)}%`,
                        background: branch.achievement >= 80 ? '#1a9a7e' :
                          branch.achievement >= 60 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI overview */}
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">أداء KPI اليوم</h3>
            <Target className="w-4 h-4 text-slate-500" />
          </div>
          <div className="space-y-2.5">
            {kpiOverview.length === 0 ? (
              <p className="text-sm text-slate-600 text-center py-4">لا توجد KPI مفعّلة</p>
            ) : (
              kpiOverview.map((kpi) => (
                <div key={kpi.id} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: kpi.color ?? '#a1a1aa' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-400 truncate">{kpi.name}</span>
                      <span className={`text-xs font-bold ${getAchievementColor(kpi.achievement)}`}>
                        {kpi.achievement}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(kpi.achievement, 100)}%`,
                          background: kpi.color ?? '#a1a1aa',
                          transition: 'width 0.7s ease-out',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-4">الإجراءات السريعة</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="kpi-card flex flex-col items-center gap-2 py-4 hover:border-slate-600 cursor-pointer"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${action.color}20`, border: `1px solid ${action.color}30` }}
              >
                <action.icon className="w-5 h-5" style={{ color: action.color }} />
              </div>
              <span className="text-xs text-slate-400 text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
