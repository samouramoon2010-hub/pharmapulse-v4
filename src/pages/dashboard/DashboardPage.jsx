// ============================================================
// Dashboard — Dynamic, role-aware, Firestore realtime
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Target, TrendingUp, TrendingDown, Users, Building2,
  AlertTriangle, CheckCircle2, Activity, Award,
  RefreshCw, Calendar, ArrowRight, Flame,
} from 'lucide-react'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import StatCard from '../../components/ui/StatCard'
import { SkeletonStatCard, SkeletonChart } from '../../components/ui/SkeletonCard'
import EmptyState from '../../components/ui/EmptyState'

const KPI_KEYS = ['wasfaty','omni','wellness','basket','crossSelling']
const KPI_LABELS = { wasfaty:'وصفتي', omni:'أومني', wellness:'ويلنس', basket:'السلة', crossSelling:'Cross Sell' }
const KPI_COLORS = { wasfaty:'#6366f1', omni:'#ef4444', wellness:'#f59e0b', basket:'#22c55e', crossSelling:'#8b5cf6' }

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 border border-slate-700 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-white font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function RankItem({ rank, name, value, max = 100 }) {
  const medals = ['🥇','🥈','🥉']
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#1a9a7e' : pct >= 40 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-800/40 last:border-0">
      <span className="text-base w-6 text-center flex-shrink-0">
        {rank <= 3 ? medals[rank-1] : <span className="text-slate-600 text-sm">{rank}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{name}</div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const {
    entries, subscribeMyEntries, subscribePharmacyEntries, subscribeAllEntries,
    targets, subscribeMyTargets, subscribeAllTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subscribePh } = usePharmacyStore()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const role      = userProfile?.role
  const isAdmin   = role === 'admin'
  const isManager = role === 'manager' || role === 'admin'

  const uid        = userProfile?.uid
  const pharmacyId = userProfile?.pharmacyId

  useEffect(() => {
    const uns = [subscribePh()]

    if (isAdmin) {
      uns.push(subscribeAllEntries())
      uns.push(subscribeAllTargets())
    } else if (isManager && pharmacyId) {
      uns.push(subscribePharmacyEntries(pharmacyId))
      uns.push(subscribeMyTargets(pharmacyId))
    } else if (uid && pharmacyId) {
      uns.push(subscribeMyEntries(uid, pharmacyId))
    }

    const t = setTimeout(() => setLoading(false), 600)
    return () => { uns.forEach((u) => u?.()); clearTimeout(t) }
  }, [uid, pharmacyId, role, tick])

  const today      = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonth  = format(new Date(), 'yyyy-MM')

  // Scoped entries
  const myEntries = useMemo(() => {
    if (isAdmin) return entries
    if (isManager && pharmacyId) return entries.filter((e) => e.pharmacyId === pharmacyId)
    return entries.filter((e) => e.userId === uid)
  }, [entries, role, uid, pharmacyId])

  const todayEntries = useMemo(() => myEntries.filter((e) => e.date === today), [myEntries, today])
  const monthEntries = useMemo(() => myEntries.filter((e) => e.date >= monthStart && e.date <= monthEnd), [myEntries])

  // Sum KPIs for today
  const todayTotals = useMemo(() => {
    const totals = {}
    KPI_KEYS.forEach((k) => { totals[k] = todayEntries.reduce((s, e) => s + (e[k] || 0), 0) })
    return totals
  }, [todayEntries])

  // Month targets for this pharmacy
  const currentTarget = useMemo(() =>
    targets.find((t) => t.pharmacyId === pharmacyId && t.month === thisMonth),
    [targets, pharmacyId, thisMonth]
  )

  // Target achievement % (wasfaty as primary metric)
  const wasfatyAch = useMemo(() => {
    if (!currentTarget?.wasfatyTarget) return 0
    const monthTotal = monthEntries.reduce((s, e) => s + (e.wasfaty || 0), 0)
    return Math.round((monthTotal / currentTarget.wasfatyTarget) * 100)
  }, [monthEntries, currentTarget])

  // 14-day trend
  const trendData = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const date  = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
    const label = format(subDays(new Date(), 13 - i), 'dd/MM')
    const de    = myEntries.filter((e) => e.date === date)
    return {
      date: label,
      wasfaty:      de.reduce((s, e) => s + (e.wasfaty      || 0), 0),
      omni:         de.reduce((s, e) => s + (e.omni         || 0), 0),
      wellness:     de.reduce((s, e) => s + (e.wellness     || 0), 0),
      crossSelling: de.reduce((s, e) => s + (e.crossSelling || 0), 0),
    }
  }), [myEntries])

  // Branch ranking (admin only)
  const branchRanking = useMemo(() => {
    if (!isAdmin) return []
    return pharmacies.map((p) => {
      const pe = todayEntries.filter((e) => e.pharmacyId === p.id)
      const total = pe.reduce((s, e) => s + (e.wasfaty || 0) + (e.omni || 0) + (e.wellness || 0), 0)
      return { ...p, total, entryCount: pe.length }
    }).sort((a, z) => z.total - a.total).slice(0, 8)
  }, [pharmacies, todayEntries, isAdmin])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()}، <span className="text-gradient">{userProfile?.displayName?.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />{format(new Date(), 'yyyy/MM/dd')}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setLoading(true); setTick((t) => t+1) }}
            className="btn btn-ghost btn-sm gap-1.5"><RefreshCw className="w-4 h-4" />تحديث</button>
          {!isManager && (
            <button onClick={() => navigate('/entry')} className="btn btn-primary btn-sm">إدخال KPI</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : <>
              <StatCard label="وصفتي اليوم"     value={todayTotals.wasfaty}      icon={Activity}     color="#6366f1" delay={0}   />
              <StatCard label="أومني هيلث اليوم" value={todayTotals.omni}         icon={Flame}        color="#ef4444" delay={100} />
              <StatCard label="ويلنس اليوم"      value={todayTotals.wellness}     icon={Target}       color="#f59e0b" delay={200} />
              <StatCard
                label={isAdmin ? 'إجمالي إدخالات اليوم' : 'إنجاز الشهر'}
                value={isAdmin ? todayEntries.length : `${wasfatyAch}%`}
                icon={isAdmin ? CheckCircle2 : TrendingUp}
                color={isAdmin ? '#22c55e' : '#1a9a7e'} delay={300}
              />
            </>
        }
      </div>

      {/* KPI bar summary */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {KPI_KEYS.map((k) => (
            <div key={k} className="card card-p text-center">
              <div className="text-xl font-bold text-white">{todayTotals[k]}</div>
              <div className="text-xs text-slate-500 mt-0.5">{KPI_LABELS[k]}</div>
              <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${Math.min((todayTotals[k] / 20) * 100, 100)}%`, background: KPI_COLORS[k] }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {loading ? <SkeletonChart /> : (
          <div className="card card-p space-y-4">
            <div>
              <h3 className="section-title text-base">اتجاه وصفتي — آخر 14 يوم</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="wasfaty" name="وصفتي" stroke="#6366f1" strokeWidth={2.5}
                      fill="url(#wGrad)" dot={false} activeDot={{ r:4, fill:'#6366f1', strokeWidth:0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {loading ? <SkeletonChart /> : (
          <div className="card card-p space-y-4">
            <h3 className="section-title text-base">KPIs اليوم — مقارنة</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={KPI_KEYS.map((k) => ({ name: KPI_LABELS[k], value: todayTotals[k], color: KPI_COLORS[k] }))}
                margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill:'#475569', fontSize:9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'#475569', fontSize:10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {KPI_KEYS.map((k, i) => (
                    <Cell key={i} fill={KPI_COLORS[k]}
                          style={{ filter:`drop-shadow(0 2px 6px ${KPI_COLORS[k]}40)` }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Branch ranking (admin) */}
      {isAdmin && (
        <div className="card card-p space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="section-title text-base flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" /> ترتيب الفروع اليوم
            </h3>
            <button onClick={() => navigate('/pharmacies')} className="btn btn-ghost btn-sm text-xs gap-1">
              إدارة الفروع <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">{Array.from({length:5}).map((_,i)=><div key={i} className="skeleton h-10 rounded-xl"/>)}</div>
          ) : branchRanking.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد بيانات اليوم" description="ستظهر الفروع هنا بعد إدخال KPI" />
          ) : (
            branchRanking.map((b, i) => (
              <RankItem key={b.id} rank={i+1} name={b.name}
                value={b.total} max={branchRanking[0]?.total || 1} />
            ))
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ...(!isManager ? [{ label:'إدخال KPI', icon:Activity, path:'/entry', color:'#1a9a7e' }] : []),
          ...(isAdmin ? [{ label:'الفروع', icon:Building2, path:'/pharmacies', color:'#6366f1' }] : []),
          ...(isAdmin ? [{ label:'المستخدمون', icon:Users, path:'/users', color:'#f59e0b' }] : []),
          { label:'التقارير', icon:TrendingUp, path:'/reports', color:'#8b5cf6' },
        ].map((a) => (
          <button key={a.path} onClick={() => navigate(a.path)}
            className="card card-p flex flex-col items-center gap-2.5 py-5 cursor-pointer hover:border-slate-600 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background:`${a.color}18`, border:`1px solid ${a.color}28` }}>
              <a.icon className="w-5 h-5" style={{ color:a.color }} />
            </div>
            <span className="text-xs text-slate-400">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
