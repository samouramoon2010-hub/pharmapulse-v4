// ============================================================
// Area Manager Dashboard — Phase 2 Enhanced
// ============================================================
import React, { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, BarChart2, TrendingUp, Target, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import { useBranchStore } from '../../store/branchStore'
import { useAlertStore } from '../../store/alertStore'
import { useTeamStore } from '../../store/teamStore'
import StatCard from '../../components/ui/StatCard'
import PerformanceChart from '../../components/charts/PerformanceChart'
import AchievementCircle from '../../components/charts/AchievementCircle'
import EmptyState from '../../components/ui/EmptyState'
import { todayStr, getAchievementColor, currentMonthRange } from '../../utils/helpers'
import { DUMMY_BRANCHES, DUMMY_USERS } from '../../data/dummyData'

export default function AreaDashboard() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeAllEntries } = useKpiStore()
  const { branches, subscribeBranches } = useBranchStore()
  const { members, subscribeAllMembers } = useTeamStore()
  const { alerts, generateAlerts } = useAlertStore()

  useEffect(() => {
    const u1 = subscribeTemplates()
    const u2 = subscribeAllEntries()
    const u3 = subscribeBranches()
    const u4 = subscribeAllMembers()
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  const today = todayStr()
  const { from: monthFrom, to: monthTo } = currentMonthRange()
  const activeBranches = branches.length ? branches : DUMMY_BRANCHES

  // Per-branch stats
  const branchStats = useMemo(() =>
    activeBranches.map((b) => {
      const todayE = entries.filter((e) => e.branchId === b.id && e.date === today)
      const monthE = entries.filter((e) => e.branchId === b.id && e.date >= monthFrom && e.date <= monthTo)
      const todayAvg = todayE.length ? Math.round(todayE.reduce((s,e)=>s+e.achievement,0)/todayE.length) : 0
      const monthAvg = monthE.length ? Math.round(monthE.reduce((s,e)=>s+e.achievement,0)/monthE.length) : 0
      // 7-day trend for sparkline
      const trend = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i)
        const ds = d.toISOString().split('T')[0]
        const de = entries.filter((e) => e.branchId === b.id && e.date === ds)
        trend.push({ date: d.toLocaleDateString('ar-SA',{weekday:'short'}), value: de.length ? Math.round(de.reduce((s,e)=>s+e.achievement,0)/de.length) : 0, target: 80 })
      }
      return { ...b, todayAvg, monthAvg, trend }
    }).sort((a,b)=>b.todayAvg-a.todayAvg),
    [activeBranches, entries, today, monthFrom, monthTo]
  )

  const overallAchievement = useMemo(() => {
    if (!branchStats.length) return 0
    return Math.round(branchStats.reduce((s,b)=>s+b.todayAvg,0)/branchStats.length)
  }, [branchStats])

  const weakBranches   = branchStats.filter((b) => b.todayAvg < 70)
  const bestBranch     = branchStats[0]
  const highAlerts     = alerts.filter((a) => a.priority === 'high' && !a.read)

  // 14-day region trend
  const regionTrend = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i)
      const ds = d.toISOString().split('T')[0]
      const de = entries.filter((e) => e.date === ds)
      const avg = de.length ? Math.round(de.reduce((s,e)=>s+e.achievement,0)/de.length) : 0
      days.push({ date: d.toLocaleDateString('ar-SA',{day:'2-digit',month:'short'}), value: avg, target: 80 })
    }
    return days
  }, [entries])

  useEffect(() => {
    if (templates.length && entries.length) {
      generateAlerts({ entries, templates, users: members.length ? members : DUMMY_USERS, branches: activeBranches, today, approvalOverlay: {} })
    }
  }, [entries, templates, members])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">لوحة مدير المنطقة</h1>
          <p className="text-sm text-slate-400 mt-0.5">{activeBranches.length} فرع · {today}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/area/branches')} className="btn-secondary text-sm"><Building2 className="w-4 h-4" /> الفروع</button>
          <button onClick={() => navigate('/area/reports')}  className="btn-primary text-sm"><BarChart2 className="w-4 h-4" /> التقارير</button>
        </div>
      </div>

      {/* High alerts banner */}
      {highAlerts.length > 0 && (
        <div className="kpi-card border-red-500/20 bg-red-500/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-300">{highAlerts.length} تنبيه يحتاج متابعة</span>
          </div>
          <button onClick={() => navigate('/area/alerts')} className="btn-secondary text-xs gap-1">
            عرض <ArrowLeft className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إنجاز المنطقة اليوم" value={`${overallAchievement}%`}     icon={Target}       color="#1a9a7e" delay={0}   />
        <StatCard label="عدد الفروع"            value={activeBranches.length}        icon={Building2}    color="#6366f1" delay={100} />
        <StatCard label="أفضل فرع"              value={bestBranch?.name?.split(' ').pop() || '—'} icon={TrendingUp} color="#22c55e" delay={200} />
        <StatCard label="فروع دون 70%"          value={weakBranches.length}          icon={AlertTriangle}color="#ef4444" delay={300} />
      </div>

      {/* Overview circle + region trend */}
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="kpi-card flex flex-col items-center justify-center py-8 gap-4">
          <AchievementCircle pct={overallAchievement} size={140} label="إنجاز المنطقة" />
          <div className="w-full space-y-1.5">
            {[
              { label: '≥100%', count: branchStats.filter((b)=>b.todayAvg>=100).length, color:'#22c55e' },
              { label: '80-99%',count: branchStats.filter((b)=>b.todayAvg>=80&&b.todayAvg<100).length, color:'#1a9a7e' },
              { label: '60-79%',count: branchStats.filter((b)=>b.todayAvg>=60&&b.todayAvg<80).length, color:'#eab308' },
              { label: '<60%',  count: branchStats.filter((b)=>b.todayAvg<60).length, color:'#ef4444' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{background:s.color}} />
                  <span className="text-slate-500">{s.label}</span>
                </div>
                <span className="text-slate-300 font-semibold">{s.count} فرع</span>
              </div>
            ))}
          </div>
        </div>
        <div className="kpi-card lg:col-span-3">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">اتجاه المنطقة — آخر 14 يوم</h3>
          <PerformanceChart data={regionTrend} dataKey="value" targetKey="target" color="#1a9a7e" height={220} />
        </div>
      </div>

      {/* Branch comparison table */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">ترتيب الفروع</h3>
          <button onClick={() => navigate('/area/branches')} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            إدارة الفروع <ArrowLeft className="w-3 h-3" />
          </button>
        </div>
        {branchStats.length === 0
          ? <EmptyState icon={Building2} title="لا توجد فروع" />
          : (
            <div className="space-y-3">
              {branchStats.map((b, idx) => (
                <div key={b.id} className="flex items-center gap-4">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    idx===0?'bg-amber-500/20 text-amber-400':idx===1?'bg-slate-500/20 text-slate-300':'bg-slate-800 text-slate-500'
                  }`}>{idx+1}</span>
                  <span className="text-sm text-slate-300 w-28 flex-shrink-0 truncate">{b.name}</span>
                  <div className="flex-1">
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${Math.min(b.todayAvg,100)}%`,
                        background: b.todayAvg>=80?'#1a9a7e':b.todayAvg>=60?'#eab308':'#ef4444',
                        boxShadow: b.todayAvg>=80?'0 0 8px rgba(26,154,126,0.4)':'none',
                      }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 w-16 text-left flex-shrink-0">
                    شهري: <span className={getAchievementColor(b.monthAvg)}>{b.monthAvg}%</span>
                  </span>
                  <span className={`text-sm font-bold w-12 text-left flex-shrink-0 ${getAchievementColor(b.todayAvg)}`}>{b.todayAvg}%</span>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Weak branches alerts */}
      {weakBranches.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />فروع تحتاج متابعة</h3>
          {weakBranches.map((b) => (
            <div key={b.id} className="kpi-card border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-amber-300">{b.name}</span>
                <span className="text-xs text-amber-500/70 mr-2">إنجاز: {b.todayAvg}%</span>
              </div>
              <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">يحتاج تدخل</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
