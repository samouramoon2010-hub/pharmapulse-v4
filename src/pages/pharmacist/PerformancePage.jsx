// ============================================================
// Pharmacist Performance Page
// Connected to: kpiStore (subscribeMyEntries, subscribeAllTargets)
// Engine V1: traffic light, pace, trend
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Target, Calendar, Award } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore }  from '../../store/kpiStore'
import EmptyState       from '../../components/ui/EmptyState'
import { SkeletonChart, SkeletonStatCard } from '../../components/ui/SkeletonCard'
import {
  getDayProgress, getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, computePace,
  sumKpi, findWeakestKpi, findStrongestKpi,
  computeOverallAchievement, computeKpiStats,
  getTargetForKpi,
} from '../../engine'

const KPI_FIELDS = [
  { key:'wasfaty',      targetKey:'wasfatyTarget',   label:'Wasfaty',      color:'#6366f1' },
  { key:'omni',         targetKey:'omniTarget',       label:'OmniHealth',   color:'#ef4444' },
  { key:'wellness',     targetKey:'wellnessTarget',   label:'Wellness',     color:'#f59e0b' },
  { key:'basket',       targetKey:'basketTarget',     label:'Basket',       color:'#22c55e' },
  { key:'crossSelling', targetKey:'crossSellTarget',  label:'Cross Sell',   color:'#8b5cf6' },
]

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--bg-overlay)', border:'1px solid var(--border-default)',
      borderRadius:'7px', padding:'7px 11px', fontSize:'11px',
    }}>
      <p style={{ color:'var(--text-muted)', marginBottom:'3px' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', gap:'5px', color:'var(--text-primary)', fontWeight:600 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:p.color, marginTop:3, flexShrink:0 }} />
          <span style={{ fontVariantNumeric:'tabular-nums' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function PharmacistPerformancePage() {
  const { userProfile }  = useAuthStore()
  const {
    entries,
    targets,
    subscribeMyEntries,
    subscribeMyTargets,
  } = useKpiStore()

  const [loading,    setLoading]    = useState(true)
  const [focusKpi,   setFocusKpi]   = useState(KPI_FIELDS[0].key)

  const uid        = userProfile?.uid
  const pharmacyId = userProfile?.pharmacyId
  const dp         = getDayProgress()
  const currentMonth = format(new Date(), 'yyyy-MM')

  useEffect(() => {
    if (!uid || !pharmacyId) { setLoading(false); return }
    const u1 = subscribeMyEntries(uid, pharmacyId)
    const u2 = subscribeMyTargets(pharmacyId)
    const t  = setTimeout(() => setLoading(false), 500)
    return () => { u1?.(); u2?.(); clearTimeout(t) }
  }, [uid, pharmacyId])

  // Current month entries for this pharmacist
  const monthFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthTo   = format(endOfMonth(new Date()),   'yyyy-MM-dd')

  const myEntries = useMemo(() =>
    entries.filter((e) => e.userId === uid),
    [entries, uid]
  )

  const monthEntries = useMemo(() =>
    myEntries.filter((e) => e.date >= monthFrom && e.date <= monthTo),
    [myEntries, monthFrom, monthTo]
  )

  // Current target
  const myTarget = useMemo(() =>
    targets.find((t) => t.pharmacyId === pharmacyId && t.month === currentMonth),
    [targets, pharmacyId, currentMonth]
  )

  // Per-KPI stats using Engine V1
  const kpiStatsMap = useMemo(() => {
    const map = {}
    KPI_FIELDS.forEach(({ key, targetKey }) => {
      const actual = sumKpi(monthEntries, key)
      const target = myTarget?.[targetKey] || 0
      map[key] = computeKpiStats(actual, target, dp, key)
    })
    return map
  }, [monthEntries, myTarget, dp])

  const overallAch    = useMemo(() => computeOverallAchievement(kpiStatsMap), [kpiStatsMap])
  const overallStatus = getTrafficLight(overallAch, dp.ratio)
  const overallColors = TRAFFIC_COLORS[overallStatus]

  // Pace for focus KPI
  const focusPace = useMemo(() => {
    const s = kpiStatsMap[focusKpi]
    if (!s) return null
    return computePace(s.actual, s.target, dp)
  }, [kpiStatsMap, focusKpi, dp])

  // 30-day trend for focus KPI
  const trendData = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const date  = format(subDays(new Date(), 29 - i), 'yyyy-MM-dd')
      const label = format(subDays(new Date(), 29 - i), 'dd/MM')
      const de    = myEntries.filter((e) => e.date === date)
      const val   = de.reduce((s, e) => s + (Number(e[focusKpi]) || 0), 0)
      return { date: label, value: val }
    }),
    [myEntries, focusKpi]
  )

  // Monthly history: last 6 months overall ach
  const historyData = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d    = subDays(startOfMonth(new Date()), i * 28)
      const mon  = format(d, 'yyyy-MM')
      const mFrom = `${mon}-01`
      const mLast = new Date(+mon.split('-')[0], +mon.split('-')[1], 0).getDate()
      const mTo   = `${mon}-${String(mLast).padStart(2, '0')}`
      const me    = myEntries.filter((e) => e.date >= mFrom && e.date <= mTo)
      const tgt   = targets.find((t) => t.pharmacyId === pharmacyId && t.month === mon)
      if (!tgt) return { month: format(d, 'MMM'), ach: 0 }
      const sm = {}
      KPI_FIELDS.forEach(({ key, targetKey }) => {
        const actual = sumKpi(me, key)
        const target = tgt[targetKey] || 0
        sm[key] = { achievementPct: computeAchievementPct(actual, target) }
      })
      return { month: format(d, 'MMM'), ach: computeOverallAchievement(sm) }
    }).reverse(),
    [myEntries, targets, pharmacyId]
  )

  const CARD = {
    background:'var(--bg-surface)', border:'1px solid var(--border-subtle)',
    borderRadius:'10px', padding:'12px 14px',
    boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
          My Performance
        </h1>
        <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
          {format(new Date(), 'MMMM yyyy')} · Day {dp.currentDay} of {dp.totalDays}
        </p>
      </div>

      {/* Overall stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : [
              {
                label:'Overall Achievement', icon: Target,
                value: `${overallAch}%`,
                color: overallColors.color,
                sub: overallColors.labelAr,
              },
              {
                label:'Entries This Month', icon: Calendar,
                value: monthEntries.length,
                color:'var(--brand-400)',
                sub: `${dp.currentDay} days elapsed`,
              },
              {
                label:'Best KPI', icon: Award,
                value: `${kpiStatsMap[findStrongestKpi(kpiStatsMap)]?.achievementPct || 0}%`,
                color: '#22c55e',
                sub: KPI_FIELDS.find((k) => k.key === findStrongestKpi(kpiStatsMap))?.label || '—',
              },
              {
                label:'Focus KPI', icon: TrendingUp,
                value: `${kpiStatsMap[findWeakestKpi(kpiStatsMap)]?.achievementPct || 0}%`,
                color: TRAFFIC_COLORS[kpiStatsMap[findWeakestKpi(kpiStatsMap)]?.status || 'critical']?.color,
                sub: KPI_FIELDS.find((k) => k.key === findWeakestKpi(kpiStatsMap))?.label || '—',
              },
            ].map((s) => (
              <div key={s.label} style={CARD}>
                <div style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'5px', fontFamily:"'Inter',sans-serif" }}>
                  {s.label}
                </div>
                <div style={{ fontSize:'1.25rem', fontWeight:600, letterSpacing:'-0.03em', color: s.color, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>
                  {s.value}
                </div>
                <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px' }}>{s.sub}</div>
              </div>
            ))
        }
      </div>

      {/* KPI breakdown */}
      <div style={{ ...CARD }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          KPI Monthly Progress
        </div>

        {/* KPI selector */}
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'14px' }}>
          {KPI_FIELDS.map(({ key, label, color }) => {
            const s = kpiStatsMap[key]
            const cfg = s ? TRAFFIC_COLORS[s.status] : null
            return (
              <button key={key} onClick={() => setFocusKpi(key)}
                style={{
                  padding:'4px 10px', borderRadius:'6px', fontSize:'11px', cursor:'pointer', transition:'all 0.12s',
                  background: focusKpi === key ? `${color}14` : 'var(--bg-overlay)',
                  border: `1px solid ${focusKpi === key ? `${color}30` : 'var(--border-subtle)'}`,
                  color: focusKpi === key ? color : 'var(--text-muted)',
                  display:'flex', alignItems:'center', gap:'4px',
                }}>
                {label}
                {s && (
                  <span style={{ fontSize:'9px', fontWeight:700, color: cfg?.color, fontVariantNumeric:'tabular-nums' }}>
                    {s.achievementPct}%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Per-KPI bars */}
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {KPI_FIELDS.map(({ key, label, color }) => {
            const s   = kpiStatsMap[key]
            const cfg = s ? TRAFFIC_COLORS[s.status] : null
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'80px', textAlign:'right', fontSize:'11px', color:'var(--text-secondary)', flexShrink:0 }}>{label}</div>
                <div style={{ flex:1, height:'5px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:'99px', background: cfg?.color || color, width:`${Math.min(s?.achievementPct || 0, 100)}%`, transition:'width 0.6s ease' }} />
                </div>
                <div style={{ width:'36px', textAlign:'left', fontSize:'11px', fontWeight:600, color: cfg?.color || color, fontVariantNumeric:'tabular-nums' }}>
                  {s?.target > 0 ? `${s.achievementPct}%` : '—'}
                </div>
                <div style={{ width:'70px', textAlign:'left', fontSize:'10px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                  {s?.actual?.toLocaleString() || 0} / {s?.target?.toLocaleString() || '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pace info for focus KPI */}
        {focusPace && myTarget && (
          <div style={{ marginTop:'12px', display:'flex', gap:'12px', flexWrap:'wrap' }}>
            {[
              { label:'Current rate/day',  value: focusPace.currentDailyRate.toLocaleString() },
              { label:'Required rate/day', value: focusPace.requiredDailyPace.toLocaleString() },
              { label:'Pace status',       value: focusPace.paceStatus.replace(/_/g,' ') },
            ].map((item) => (
              <div key={item.label} style={{ fontSize:'10px' }}>
                <span style={{ color:'var(--text-muted)' }}>{item.label}: </span>
                <span style={{ color:'var(--text-primary)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 30-day trend for focus KPI */}
      <div style={{ ...CARD }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          30-Day Trend — {KPI_FIELDS.find((k) => k.key === focusKpi)?.label}
        </div>
        {loading ? <SkeletonChart height={180} /> : (
          trendData.some((d) => d.value > 0)
            ? <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top:5, right:0, bottom:0, left:-30 }}>
                  <defs>
                    <linearGradient id="perf_grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={KPI_FIELDS.find((k) => k.key === focusKpi)?.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={KPI_FIELDS.find((k) => k.key === focusKpi)?.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} interval={6} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="value"
                    stroke={KPI_FIELDS.find((k) => k.key === focusKpi)?.color}
                    strokeWidth={1.5} fill="url(#perf_grad)" dot={false}
                    activeDot={{ r:3, strokeWidth:0 }} />
                </AreaChart>
              </ResponsiveContainer>
            : <EmptyState icon={TrendingUp} title="No trend data" description="Enter daily KPIs to see trends" />
        )}
      </div>

      {/* 6-month history */}
      {historyData.some((d) => d.ach > 0) && (
        <div style={{ ...CARD }}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Monthly Achievement History
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={historyData} margin={{ top:0, right:0, bottom:0, left:-30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} domain={[0,100]} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="ach" name="Achievement %" radius={[3,3,0,0]} fill="var(--brand-500)" opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
