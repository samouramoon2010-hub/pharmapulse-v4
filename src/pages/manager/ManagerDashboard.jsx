// ============================================================
// Manager Dashboard — Enhanced Phase 2
// ============================================================
import React, { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Target, TrendingUp, AlertTriangle, BarChart2, ClipboardCheck, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import { useTeamStore } from '../../store/teamStore'
import { useApprovalStore } from '../../store/approvalStore'
import { useAlertStore } from '../../store/alertStore'
import StatCard from '../../components/ui/StatCard'
import PerformanceChart from '../../components/charts/PerformanceChart'
import AchievementCircle from '../../components/charts/AchievementCircle'
import { todayStr, getAchievementColor, currentMonthRange } from '../../utils/helpers'
import { DUMMY_USERS, DUMMY_BRANCHES } from '../../data/dummyData'

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeEntries } = useKpiStore()
  const { members, subscribeMembers } = useTeamStore()
  const { overlay, subscribeOverlay } = useApprovalStore()
  const { alerts, generateAlerts } = useAlertStore()

  useEffect(() => {
    const u1 = subscribeTemplates()
    const u2 = subscribeEntries({ branchId: userProfile?.branchId })
    const u3 = subscribeMembers({ branchId: userProfile?.branchId, role: 'pharmacist' })
    const u4 = subscribeOverlay(userProfile?.branchId)
    return () => { u1(); u2(); u3(); u4() }
  }, [userProfile?.branchId])

  const today = todayStr()
  const { from: monthFrom, to: monthTo } = currentMonthRange()

  const team = useMemo(() =>
    (members.length ? members : DUMMY_USERS).filter(
      (u) => u.role === 'pharmacist' && u.branchId === userProfile?.branchId
    ), [members, userProfile?.branchId])

  const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
  const monthEntries = useMemo(() => entries.filter((e) => e.date >= monthFrom && e.date <= monthTo), [entries, monthFrom, monthTo])

  const branchAchievement = useMemo(() => todayEntries.length ? Math.round(todayEntries.reduce((s,e)=>s+e.achievement,0)/todayEntries.length) : 0, [todayEntries])
  const monthAchievement  = useMemo(() => monthEntries.length  ? Math.round(monthEntries.reduce((s,e)=>s+e.achievement,0)/monthEntries.length)  : 0, [monthEntries])

  const pendingCount = useMemo(() =>
    todayEntries.filter((e) => !overlay[e.id]?.status || overlay[e.id]?.status === 'pending').length,
    [todayEntries, overlay])

  const activeKpis   = templates.filter((t) => t.active && t.type !== 'formula')
  const missingCount = useMemo(() =>
    team.reduce((count, m) => {
      const uid    = m.uid || m.id
      const filled = new Set(todayEntries.filter((e) => e.userId === uid).map((e) => e.kpiId))
      return count + activeKpis.filter((k) => !filled.has(k.id)).length
    }, 0), [team, todayEntries, activeKpis])

  const teamRanking = useMemo(() =>
    team.map((m) => {
      const uid = m.uid || m.id
      const me  = todayEntries.filter((e) => e.userId === uid)
      const avg = me.length ? Math.round(me.reduce((s,e)=>s+e.achievement,0)/me.length) : 0
      return { ...m, todayAvg: avg, kpiMap: Object.fromEntries(me.map((e) => [e.kpiId, e])) }
    }).sort((a,b)=>b.todayAvg-a.todayAvg),
    [team, todayEntries])

  const trendData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i)
      const ds = d.toISOString().split('T')[0]
      const de = entries.filter((e) => e.date === ds)
      const avg = de.length ? Math.round(de.reduce((s,e)=>s+e.achievement,0)/de.length) : 0
      days.push({ date: d.toLocaleDateString('ar-SA',{weekday:'short'}), value: avg, target: 80 })
    }
    return days
  }, [entries])

  useEffect(() => {
    if (templates.length && entries.length) {
      generateAlerts({ entries, templates, users: team.length ? team : DUMMY_USERS, branches: DUMMY_BRANCHES, today, approvalOverlay: overlay })
    }
  }, [entries, templates, team, overlay])

  const highAlerts = alerts.filter((a) => a.priority === 'high' && !a.read)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">لوحة مدير الفرع</h1>
          <p className="text-sm text-slate-400 mt-0.5">{userProfile?.branchId || 'الفرع'} · {today}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pendingCount > 0 && (
            <button onClick={() => navigate('/manager/approval')} className="btn-secondary text-sm gap-2">
              <ClipboardCheck className="w-4 h-4 text-amber-400" />{pendingCount} انتظار اعتماد
            </button>
          )}
          <button onClick={() => navigate('/manager/kpi-builder')} className="btn-primary text-sm">
            <Target className="w-4 h-4" /> KPI Builder
          </button>
        </div>
      </div>

      {highAlerts.length > 0 && (
        <div className="kpi-card border-red-500/20 bg-red-500/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-red-300">{highAlerts.length} تنبيه عالي الأولوية</span>
              <p className="text-xs text-red-400/60 mt-0.5">{highAlerts[0]?.message}</p>
            </div>
          </div>
          <button onClick={() => navigate('/manager/alerts')} className="btn-secondary text-xs gap-1 flex-shrink-0">
            عرض الكل <ArrowLeft className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إنجاز الفرع اليوم"  value={`${branchAchievement}%`} icon={Target}         color="#1a9a7e" delay={0}   />
        <StatCard label="إنجاز الشهر"         value={`${monthAchievement}%`}  icon={TrendingUp}     color="#6366f1" delay={100} />
        <StatCard label="KPI ناقصة"           value={missingCount}             icon={AlertTriangle}  color="#f59e0b" delay={200} />
        <StatCard label="تنتظر الاعتماد"       value={pendingCount}             icon={ClipboardCheck} color="#ef4444" delay={300} />
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="kpi-card flex flex-col items-center justify-center py-8 gap-3">
          <AchievementCircle pct={branchAchievement} size={130} label="إنجاز الفرع اليوم" />
          <div className="text-center text-sm text-slate-400">
            {branchAchievement >= 100 ? '🎉 الهدف محقق!' : branchAchievement >= 80 ? '💪 أداء جيد' : branchAchievement >= 60 ? '📈 على المسار' : '⚠️ يحتاج متابعة'}
          </div>
        </div>
        <div className="kpi-card lg:col-span-3">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">أداء الفرع — آخر 7 أيام</h3>
          <PerformanceChart data={trendData} dataKey="value" targetKey="target" color="#1a9a7e" height={200} type="bar" />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">ترتيب الفريق اليوم</h3>
            <button onClick={() => navigate('/manager/team')} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">عرض الكل <ArrowLeft className="w-3 h-3" /></button>
          </div>
          <div className="space-y-3">
            {teamRanking.length === 0
              ? <p className="text-sm text-slate-600 text-center py-4">لا يوجد فريق</p>
              : teamRanking.map((m, idx) => (
                <div key={m.uid||m.id} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${idx===0?'bg-amber-500/20 text-amber-400':idx===1?'bg-slate-600/30 text-slate-300':'bg-slate-800 text-slate-600'}`}>{idx+1}</span>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.displayName?.[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-300 truncate">{m.displayName}</div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(m.todayAvg,100)}%`, background: m.todayAvg>=80?'#1a9a7e':m.todayAvg>=60?'#eab308':'#ef4444' }} />
                    </div>
                  </div>
                  <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(m.todayAvg)}`}>{m.todayAvg}%</span>
                </div>
              ))
            }
          </div>
        </div>

        <div className="kpi-card overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">KPI اليوم — حسب الفريق</h3>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-right text-slate-500 pb-2 font-medium">الصيدلاني</th>
                {activeKpis.slice(0,3).map((k)=>(
                  <th key={k.id} className="text-center text-slate-500 pb-2 font-medium px-2" style={{color:k.color}}>{k.name.slice(0,7)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamRanking.map((m) => (
                <tr key={m.uid||m.id} className="border-t border-slate-800/60">
                  <td className="py-2 text-slate-300 truncate max-w-[90px]">{m.displayName?.split(' ')[0]}</td>
                  {activeKpis.slice(0,3).map((k) => {
                    const e = m.kpiMap[k.id]
                    return <td key={k.id} className="py-2 text-center px-2">{e?<span className={`font-medium ${getAchievementColor(e.achievement)}`}>{e.achievement}%</span>:<span className="text-slate-700">—</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'الفريق',    icon: Users,          path: '/manager/team',     color: '#6366f1' },
          { label: 'الاعتماد',  icon: ClipboardCheck, path: '/manager/approval', color: '#f59e0b' },
          { label: 'التنبيهات', icon: AlertTriangle,  path: '/manager/alerts',   color: '#ef4444' },
          { label: 'التقارير',  icon: BarChart2,       path: '/manager/reports',  color: '#1a9a7e' },
        ].map((a) => (
          <button key={a.path} onClick={() => navigate(a.path)} className="kpi-card flex flex-col items-center gap-2 py-4 cursor-pointer hover:border-slate-600">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${a.color}20`, border: `1px solid ${a.color}30` }}>
              <a.icon className="w-5 h-5" style={{ color: a.color }} />
            </div>
            <span className="text-xs text-slate-400">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
