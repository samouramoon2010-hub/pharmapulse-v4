// ============================================================
// Pharmacist Performance Page
// Phase 5A: Static KPI_FIELDS replaced with live-registry-
//           driven field list. All .color accesses guarded
//           with safe fallbacks. Custom KPIs render safely.
//
// Engine compatibility:
//   computeKpiStats / sumKpi / computeOverallAchievement still
//   operate on the engine-key subset only (wasfaty/omni/
//   wellness/basket/crossSelling). Custom KPI stats are
//   computed as-available: actual summed from entries, target
//   read from the target doc, achievement clamped safely.
//   This is non-breaking for existing analytics.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Target, Calendar, Award } from 'lucide-react'
import { useAuthStore }            from '../../store/authStore'
import { useKpiStore }             from '../../store/kpiStore'
import { subscribeKpiRegistry }    from '../../services/kpiRegistryService'
import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  getTargetFieldName,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'
import EmptyState                  from '../../components/ui/EmptyState'
import { SkeletonChart, SkeletonStatCard } from '../../components/ui/SkeletonCard'
import {
  getDayProgress, getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, computePace,
  sumKpi, findWeakestKpi, findStrongestKpi,
  computeOverallAchievement, computeKpiStats,
} from '../../engine'

// Safe fallback color — never undefined
const FALLBACK_COLOR = DEFAULT_KPI_UI_CONFIG.defaultColor  // '#a1a1aa'

// ── Registry → performance field list ─────────────────────────
// Each field drives both rendering (buttons, bars) and stats.
// engineKey = aliasFor ?? key; targetFieldName from registry.
function buildPerfFields(registry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => {
    const engineKey     = kpi.aliasFor ?? kpi.key
    const targetField   = getTargetFieldName(kpi.key)
    return {
      key:         engineKey,
      registryKey: kpi.key,
      targetKey:   targetField,
      label:       kpi.shortLabel || kpi.label || engineKey,
      labelAr:     kpi.labelAr   || kpi.label || engineKey,
      // Color: registry KpiDefinition has no .color field →
      // always use FALLBACK_COLOR. Traffic-light color used for
      // achievement rendering instead (cfg?.color).
      color: FALLBACK_COLOR,
    }
  })
}

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
          <div style={{ width:6, height:6, borderRadius:'50%', background: p.color ?? FALLBACK_COLOR, marginTop:3, flexShrink:0 }} />
          <span style={{ fontVariantNumeric:'tabular-nums' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function PharmacistPerformancePage() {
  const { userProfile } = useAuthStore()
  const { entries, targets, subscribeMyEntries, subscribeMyTargets } = useKpiStore()

  const [loading,      setLoading]      = useState(true)
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)

  // ── Live KPI registry ─────────────────────────────────────────
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // ── Registry-driven field list ────────────────────────────────
  const perfFields = useMemo(() => buildPerfFields(liveRegistry), [liveRegistry])

  // Safe initial focusKpi — first field key or '' if no fields yet
  const [focusKpi, setFocusKpi] = useState('')
  useEffect(() => {
    if (!focusKpi && perfFields.length > 0) {
      setFocusKpi(perfFields[0].key)
    }
  }, [perfFields, focusKpi])

  const uid        = userProfile?.uid ?? userProfile?.id
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

  const myTarget = useMemo(() =>
    targets.find((t) => t.pharmacyId === pharmacyId && t.month === currentMonth),
    [targets, pharmacyId, currentMonth]
  )

  // ── Per-KPI stats — registry-driven ──────────────────────────
  // For core KPIs: uses engine computeKpiStats (traffic-light aware).
  // For custom KPIs: computes actual/target directly; no engine weight.
  const kpiStatsMap = useMemo(() => {
    const map = {}
    perfFields.forEach(({ key, targetKey }) => {
      const actual = sumKpi(monthEntries, key)
      const target = myTarget?.[targetKey] || 0
      // computeKpiStats is safe with unknown keys — it returns a
      // stats object based purely on actual/target/pace math.
      map[key] = computeKpiStats(actual, target, dp, key)
    })
    return map
  }, [monthEntries, myTarget, dp, perfFields])

  const overallAch    = useMemo(() => computeOverallAchievement(kpiStatsMap), [kpiStatsMap])
  const overallStatus = getTrafficLight(overallAch, dp.ratio)
  const overallColors = TRAFFIC_COLORS[overallStatus]

  // Pace for focus KPI
  const focusPace = useMemo(() => {
    const s = kpiStatsMap[focusKpi]
    if (!s) return null
    return computePace(s.actual, s.target, dp)
  }, [kpiStatsMap, focusKpi, dp])

  // Focus KPI field descriptor (safe: returns undefined if not found)
  const focusField = perfFields.find((f) => f.key === focusKpi)
  // Safe color for focus KPI — traffic light preferred, then fallback
  const focusColor = (focusKpi && kpiStatsMap[focusKpi]
    ? TRAFFIC_COLORS[kpiStatsMap[focusKpi].status]?.color
    : null) ?? FALLBACK_COLOR

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
      perfFields.forEach(({ key, targetKey }) => {
        const actual = sumKpi(me, key)
        const target = tgt[targetKey] || 0
        sm[key] = { achievementPct: computeAchievementPct(actual, target) }
      })
      return { month: format(d, 'MMM'), ach: computeOverallAchievement(sm) }
    }).reverse(),
    [myEntries, targets, pharmacyId, perfFields]
  )

  // Safe label helpers
  const labelFor   = (key) => perfFields.find((f) => f.key === key)?.label || key
  const weakestKey  = findWeakestKpi(kpiStatsMap)
  const strongestKey = findStrongestKpi(kpiStatsMap)

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
                color: overallColors?.color ?? FALLBACK_COLOR,
                sub: overallColors?.labelAr ?? '—',
              },
              {
                label:'Entries This Month', icon: Calendar,
                value: monthEntries.length,
                color:'var(--brand-400)',
                sub: `${dp.currentDay} days elapsed`,
              },
              {
                label:'Best KPI', icon: Award,
                value: `${kpiStatsMap[strongestKey]?.achievementPct || 0}%`,
                color: '#22c55e',
                sub: labelFor(strongestKey),
              },
              {
                label:'Focus KPI', icon: TrendingUp,
                value: `${kpiStatsMap[weakestKey]?.achievementPct || 0}%`,
                color: TRAFFIC_COLORS[kpiStatsMap[weakestKey]?.status || 'critical']?.color ?? FALLBACK_COLOR,
                sub: labelFor(weakestKey),
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

        {/* KPI selector — registry-driven */}
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'14px' }}>
          {perfFields.map(({ key, label }) => {
            const s     = kpiStatsMap[key]
            const cfg   = s ? TRAFFIC_COLORS[s.status] : null
            const isFocus = focusKpi === key
            // Button accent: traffic-light color preferred; fallback to FALLBACK_COLOR
            const accent = cfg?.color ?? FALLBACK_COLOR
            return (
              <button key={key} onClick={() => setFocusKpi(key)}
                style={{
                  padding:'4px 10px', borderRadius:'6px', fontSize:'11px', cursor:'pointer', transition:'all 0.12s',
                  background: isFocus ? `${accent}14` : 'var(--bg-overlay)',
                  border: `1px solid ${isFocus ? `${accent}30` : 'var(--border-subtle)'}`,
                  color: isFocus ? accent : 'var(--text-muted)',
                  display:'flex', alignItems:'center', gap:'4px',
                }}>
                {label}
                {s && (
                  <span style={{ fontSize:'9px', fontWeight:700, color: cfg?.color ?? FALLBACK_COLOR, fontVariantNumeric:'tabular-nums' }}>
                    {s.achievementPct}%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Per-KPI progress bars — registry-driven */}
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {perfFields.map(({ key, label }) => {
            const s   = kpiStatsMap[key]
            const cfg = s ? TRAFFIC_COLORS[s.status] : null
            // Bar color: traffic-light preferred, then FALLBACK_COLOR
            const barColor = cfg?.color ?? FALLBACK_COLOR
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'80px', textAlign:'right', fontSize:'11px', color:'var(--text-secondary)', flexShrink:0 }}>{label}</div>
                <div style={{ flex:1, height:'5px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:'99px', background: barColor, width:`${Math.min(s?.achievementPct || 0, 100)}%`, transition:'width 0.6s ease' }} />
                </div>
                <div style={{ width:'36px', textAlign:'left', fontSize:'11px', fontWeight:600, color: barColor, fontVariantNumeric:'tabular-nums' }}>
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
          30-Day Trend — {focusField?.label ?? focusKpi ?? '—'}
        </div>
        {loading ? <SkeletonChart height={180} /> : (
          trendData.some((d) => d.value > 0)
            ? <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top:5, right:0, bottom:0, left:-30 }}>
                  <defs>
                    <linearGradient id="perf_grad" x1="0" y1="0" x2="0" y2="1">
                      {/* Safe color: focusColor always defined */}
                      <stop offset="5%"  stopColor={focusColor} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={focusColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} interval={6} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="value"
                    stroke={focusColor}
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
