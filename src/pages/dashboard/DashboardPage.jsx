// ============================================================
// Dashboard v4 — Traffic Light + Run Rate + Daily Mission
// + Card Customization + Role-aware content
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Target, TrendingUp, Users, Building2, Activity,
  Award, RefreshCw, Calendar, Zap, ChevronDown, Settings2,
} from 'lucide-react'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useSettingsStore, DASHBOARD_CARDS } from '../../store/settingsStore'
import StatCard from '../../components/ui/StatCard'
import {
  SkeletonStatCard, SkeletonChart, SkeletonFeed, SkeletonInsightsStrip,
} from '../../components/ui/SkeletonCard'
import EmptyState, {
  EmptyTodayEntries, EmptyNoTargets, EmptyNoForecast,
  EmptyNoBranch, EmptyMissionNotReady, ErrorState,
} from '../../components/ui/EmptyState'
// KPI Analytics Engine V1
import {
  getDayProgress,
  getTrafficLight, TRAFFIC_COLORS, computeKpiStats,
  computePace, computeForecast, computeRiskLevel,
  computeOverallAchievement,
  findWeakestKpi, findStrongestKpi,
  buildDailyMission,
  getTargetForKpi,
} from '../../engine'

const KPI_KEYS = ['wasfaty','omni','wellness','basket','crossSelling']
const KPI_COLORS_MAP = {
  wasfaty:'#6366f1', omni:'#ef4444', wellness:'#f59e0b',
  basket:'#22c55e', crossSelling:'#8b5cf6',
}
const KPI_LABELS_MAP = {
  wasfaty:'Wasfaty', omni:'OmniHealth', wellness:'Wellness',
  basket:'Basket', crossSelling:'Cross Sell',
}

// ── Premium Chart Tooltip ─────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--bg-overlay)',
      border:'1px solid var(--border-default)',
      borderRadius:'8px',
      padding:'8px 12px',
      boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
      fontSize:'11px',
      fontFamily:"'Inter', monospace",
    }}>
      <p style={{ color:'var(--text-muted)', marginBottom:'6px', fontWeight:500 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--text-primary)' }}>
          <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span style={{ fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Premium Status Pill ───────────────────────────────────────
function TLBadge({ status }) {
  const cfg = TRAFFIC_COLORS[status] || TRAFFIC_COLORS.good
  return (
    <span className="status-pill" style={{
      color: cfg.color,
      background: cfg.bg,
      borderColor: cfg.border,
    }}>
      {cfg.labelAr}
    </span>
  )
}

// ── Forecast Mini ─────────────────────────────────────────────
function ForecastCard({ kpiKey, label, forecast, target, stats }) {
  // Engine V1: forecast = computeForecast() result
  // forecast.forecastAchPct, forecast.forecastEOM, forecast.recoveryProbability
  // forecast.optimistic, forecast.realistic, forecast.pessimistic
  if (!forecast) return null

  const status = getTrafficLight(forecast.forecastAchPct, 1)  // compare vs full target
  const cfg    = TRAFFIC_COLORS[status]

  return (
    <div className="kpi-card p-4" style={{ borderColor: cfg.border }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color:'var(--text-secondary)' }}>{label}</span>
        <TLBadge status={status} />
      </div>
      {/* Forecast achievement % */}
      <div className="text-xl font-bold tabular-nums" style={{ color: cfg.color }}>
        {forecast.forecastAchPct}%
      </div>
      {/* Projected EOM value */}
      <div className="text-xs mt-1" style={{ color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
        EOM: {forecast.forecastEOM.toLocaleString()} / {(target || 0).toLocaleString()}
      </div>
      {/* Recovery probability from Engine V1 */}
      <div className="text-xs mt-0.5" style={{ color: cfg.color, opacity:0.75 }}>
        Recovery: {Math.round(forecast.recoveryProbability * 100)}%
      </div>
      <div className="progress-track mt-2">
        <div className="progress-fill"
             style={{ width:`${Math.min(forecast.forecastAchPct, 100)}%`, background: cfg.color }} />
      </div>
    </div>
  )
}

// ── Daily Mission Card ────────────────────────────────────────
function DailyMissionCard({ mission }) {
  if (!mission) return null
  // Engine V1: status from getTrafficLight on the focus KPI
  const focusStatus = mission.focusKpi
    ? getTrafficLight(mission.achievementPct, getDayProgress().ratio)
    : 'warning'
  const cfg = TRAFFIC_COLORS[focusStatus] || TRAFFIC_COLORS.warning

  // Engine V1 field names:
  //   mission.achievementPct  (was: mission.achievement)
  //   mission.focusKpi        (was: mission.weakestKpi)
  //   mission.kpiLabel.en/ar  (same)
  //   mission.targetGap       (same)
  //   mission.requiredToday   (new — from Engine V1 pace)
  //   mission.currentRate     (new — from Engine V1 pace)
  //   mission.difficulty      (new — EASY/MODERATE/CHALLENGING/STRETCH)
  //   mission.action          (same)
  //   mission.motivation      (was: mission.message)

  const difficultyColor = {
    EASY:        '#22c55e',
    MODERATE:    '#00d2ad',
    CHALLENGING: '#f59e0b',
    STRETCH:     '#ef4444',
  }[mission.difficulty] || '#00d2ad'

  return (
    <div className="card card-p"
         style={{ borderColor: cfg.border, background:`linear-gradient(135deg, ${cfg.bg}, var(--bg-card))` }}>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5" style={{ color: cfg.color }} />
        <h3 className="section-title text-sm">Daily Mission</h3>
        <TLBadge status={focusStatus} />
        {/* Engine V1 — difficulty badge */}
        <span style={{
          marginRight:'auto', fontSize:'9px', fontWeight:600, letterSpacing:'0.06em',
          textTransform:'uppercase', color: difficultyColor,
          padding:'1px 6px', borderRadius:'99px',
          background:`${difficultyColor}14`, border:`1px solid ${difficultyColor}25`,
        }}>
          {mission.difficulty}
        </span>
      </div>

      <div className="space-y-3">
        {/* Focus KPI — Engine V1 field: achievementPct */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs" style={{ color:'var(--text-muted)' }}>Focus KPI</div>
            <div className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>
              {mission.kpiLabel?.en || mission.focusKpi}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums" style={{ color: cfg.color }}>
              {mission.achievementPct ?? 0}%
            </div>
            <div className="text-xs" style={{ color:'var(--text-muted)' }}>achievement</div>
          </div>
        </div>

        {/* Gap + Required pace — Engine V1 new fields */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px',
        }}>
          <div className="rounded-lg px-3 py-2"
               style={{ background:'var(--bg-hover)', border:'1px solid var(--border-subtle)' }}>
            <div style={{ fontSize:'9px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>Gap</div>
            <div style={{ fontSize:'13px', fontWeight:600, color: cfg.color, fontVariantNumeric:'tabular-nums' }}>
              {(mission.targetGap || 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg px-3 py-2"
               style={{ background:'var(--bg-hover)', border:'1px solid var(--border-subtle)' }}>
            <div style={{ fontSize:'9px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>Required/day</div>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums' }}>
              {(mission.requiredToday || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="text-xs leading-relaxed" style={{ color:'var(--text-secondary)' }}>
          💡 {mission.action}
        </div>

        {/* Motivation — Engine V1 field: motivation (was: message) */}
        <div className="text-xs italic" style={{ color:'var(--text-muted)' }}>
          "{mission.motivation || ''}"
        </div>
      </div>
    </div>
  )
}

// ── Card Customizer ───────────────────────────────────────────
function CardCustomizer({ selectedCards, onToggle, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-2xl p-5"
           style={{ background:'var(--modal-bg)', border:'1px solid var(--border-hover)' }}>
        <h3 className="section-title mb-1">Customize Dashboard</h3>
        <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>
          Select at least 2 cards to display
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {Object.entries(DASHBOARD_CARDS).map(([key, meta]) => {
            const active = selectedCards.includes(key)
            return (
              <button key={key} onClick={() => onToggle(key)}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all text-right"
                style={{
                  background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border)'}`,
                }}>
                <span className="text-sm" style={{ color:'var(--text-primary)' }}>{meta.labelAr}</span>
                <span className="text-xs" style={{ color: active ? 'var(--brand-300)' : 'var(--text-muted)' }}>
                  {meta.label}
                </span>
                <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                  active ? 'bg-brand-500' : 'bg-transparent border border-slate-600'
                }`}>
                  {active && <div className="w-3 h-0.5 bg-white rounded" />}
                </div>
              </button>
            )
          })}
        </div>
        <button onClick={onClose} className="btn btn-primary w-full mt-4">Done</button>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const {
    entries, subscribeMyEntries, subscribePharmacyEntries, subscribeAllEntries,
    targets, subscribeMyTargets, subscribeAllTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subscribePh } = usePharmacyStore()
  const { dashboardCards, setDashboardCards } = useSettingsStore()

  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState(false)
  const [tick,        setTick]        = useState(0)
  const [showCustom,  setShowCustom]  = useState(false)
  const [localCards,  setLocalCards]  = useState(dashboardCards)

  const role      = userProfile?.role
  const isAdmin   = role === 'admin'
  const isManager = ['manager','admin'].includes(role)
  const uid        = userProfile?.uid
  const pharmacyId = userProfile?.pharmacyId
  const noBranch   = !isAdmin && !pharmacyId

  useEffect(() => {
    setFetchError(false)
    const uns = []
    try {
      uns.push(subscribePh())
      if (isAdmin) {
        uns.push(subscribeAllEntries())
        uns.push(subscribeAllTargets())
      } else if (pharmacyId) {
        uns.push(subscribePharmacyEntries(pharmacyId))
        uns.push(subscribeMyTargets(pharmacyId))
      } else if (uid && pharmacyId) {
        uns.push(subscribeMyEntries(uid, pharmacyId))
      }
    } catch (e) {
      console.error('[Dashboard] Subscription error:', e)
      setFetchError(true)
      setLoading(false)
    }
    const t = setTimeout(() => setLoading(false), 500)
    return () => { uns.forEach((u) => u?.()); clearTimeout(t) }
  }, [uid, pharmacyId, role, tick])

  const today      = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonth  = format(new Date(), 'yyyy-MM')
  // daysPassed, totalDays, dayRatio now come from Engine V1 dp above

  const myEntries = useMemo(() => {
    if (isAdmin)   return entries
    if (isManager && pharmacyId) return entries.filter((e) => e.pharmacyId === pharmacyId)
    return entries.filter((e) => e.userId === uid)
  }, [entries, role, uid, pharmacyId])

  const todayEntries = useMemo(() => myEntries.filter((e) => e.date === today),  [myEntries, today])
  const monthEntries = useMemo(() => myEntries.filter((e) => e.date >= monthStart && e.date <= monthEnd), [myEntries])

  const currentTarget = useMemo(() =>
    targets.find((t) => t.pharmacyId === pharmacyId && t.month === thisMonth),
    [targets, pharmacyId]
  )

  // ── KPI Engine V1 — per-KPI stats ────────────────────────────
  const dp = useMemo(() => getDayProgress(), [])
  // alias kept for chart/widget code below
  const daysPassed = dp.currentDay
  const totalDays  = dp.totalDays
  const dayRatio   = dp.ratio

  const kpiStats = useMemo(() => {
    const map = {}
    KPI_KEYS.forEach((k) => {
      const actual = monthEntries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      const target = currentTarget ? getTargetForKpi(currentTarget, k) : 0
      map[k] = {
        ...computeKpiStats(actual, target, dp, k),
        // legacy aliases for existing JSX below
        achPct: computeKpiStats(actual, target, dp, k).achievementPct,
        colors: TRAFFIC_COLORS[computeKpiStats(actual, target, dp, k).status],
      }
    })
    return map
  }, [monthEntries, currentTarget, dp])

  // Today totals (unchanged — used by bar chart)
  const todayTotals = useMemo(() =>
    KPI_KEYS.reduce((acc, k) => {
      acc[k] = todayEntries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      return acc
    }, {}),
    [todayEntries]
  )

  // ── Engine V1 — overall achievement (weighted) ────────────────
  const overallAch = useMemo(() =>
    computeOverallAchievement(kpiStats),
    [kpiStats]
  )
  const overallStatus = getTrafficLight(overallAch, dayRatio)
  const overallColors = TRAFFIC_COLORS[overallStatus]

  // ── Engine V1 — weakest / strongest KPI ──────────────────────
  const weakestKpi  = useMemo(() => findWeakestKpi(kpiStats),   [kpiStats])
  const strongestKpi = useMemo(() => findStrongestKpi(kpiStats), [kpiStats])

  // ── Engine V1 — risk level ────────────────────────────────────
  const riskLevel = useMemo(() => {
    const statuses = KPI_KEYS.map((k) => kpiStats[k]?.status || 'critical')
    return computeRiskLevel(statuses)
  }, [kpiStats])

  // ── Engine V1 — per-KPI pace ──────────────────────────────────
  const paceMap = useMemo(() => {
    const map = {}
    KPI_KEYS.forEach((k) => {
      const actual = kpiStats[k]?.actual || 0
      const target = kpiStats[k]?.target || 0
      map[k] = computePace(actual, target, dp)
    })
    return map
  }, [kpiStats, dp])

  // ── Engine V1 — per-KPI forecast ─────────────────────────────
  const forecastMap = useMemo(() => {
    const map = {}
    KPI_KEYS.forEach((k) => {
      const actual     = kpiStats[k]?.actual || 0
      const target     = kpiStats[k]?.target || 0
      // Build sorted daily values for history-aware recovery probability
      const sorted = [...myEntries]
        .sort((a, b) => a.date.localeCompare(b.date))
      const dailyVals = sorted.map((e) => Number(e[k]) || 0)
      map[k] = computeForecast(actual, target, dp, dailyVals)
    })
    return map
  }, [kpiStats, dp, myEntries])

  // ── Engine V1 — daily mission ─────────────────────────────────
  const mission = useMemo(() => {
    // Build paceMap for mission difficulty classification
    return buildDailyMission(kpiStats, paceMap)
  }, [kpiStats, paceMap])

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

  // Branch ranking (admin)
  const branchRanking = useMemo(() => {
    if (!isAdmin) return []
    return pharmacies.map((p) => {
      const be    = todayEntries.filter((e) => e.pharmacyId === p.id)
      const total = be.reduce((s, e) => KPI_KEYS.reduce((ss, k) => ss + (e[k]||0), s), 0)
      return { ...p, total }
    }).sort((a, z) => z.total - a.total).slice(0, 8)
  }, [pharmacies, todayEntries, isAdmin])

  // Card toggle logic
  const toggleCard = (key) => {
    setLocalCards((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 2) return prev // min 2
        return prev.filter((c) => c !== key)
      }
      return [...prev, key]
    })
  }
  const saveCustomization = () => { setDashboardCards(localCards); setShowCustom(false) }

  // Stat card builder
  const CARD_DATA = {
    overall_achievement: {
      label:'Overall Achievement', value: overallAch, suffix:'%',
      icon: Target, color: overallColors.color,
      sub: overallColors.labelAr,
    },
    today_kpi: {
      label:'Entries Today', value: todayEntries.length,
      icon: Activity, color:'#6366f1',
      sub: todayEntries.length === 0 ? 'Awaiting submissions' : `${todayEntries.length} recorded`,
    },
    wasfaty: {
      label:'Wasfaty (Month)', value: kpiStats.wasfaty?.actual || 0,
      icon: Activity, color: kpiStats.wasfaty?.colors.color || '#6366f1',
      sub: `${kpiStats.wasfaty?.achPct || 0}% achievement`,
    },
    omni: {
      label:'OmniHealth (Month)', value: kpiStats.omni?.actual || 0,
      icon: Activity, color: kpiStats.omni?.colors.color || '#ef4444',
      sub: `${kpiStats.omni?.achPct || 0}% achievement`,
    },
    wellness: {
      label:'Wellness (Month)', value: kpiStats.wellness?.actual || 0,
      icon: Activity, color: kpiStats.wellness?.colors.color || '#f59e0b',
      sub: `${kpiStats.wellness?.achPct || 0}% achievement`,
    },
    cross_selling: {
      label:'Cross Sell (Month)', value: kpiStats.crossSelling?.actual || 0,
      icon: Activity, color: kpiStats.crossSelling?.colors.color || '#8b5cf6',
      sub: `${kpiStats.crossSelling?.achPct || 0}% achievement`,
    },
    branch_rank: {
      label:'Branches Active', value: pharmacies.filter((p) => p.active !== false).length,
      icon: Building2, color:'#22c55e',
    },
    month_progress: {
      label:'Month Progress', value: Math.round(dayRatio * 100), suffix:'%',
      icon: Calendar, color:'#f59e0b',
      sub: `Day ${daysPassed} of ${totalDays}`,
    },
    forecast: {
      // Engine V1: forecastMap[kpi].forecastAchPct (was: getRunRateForecast().projectedAchPct)
      label:'Wasfaty Forecast',
      value: forecastMap.wasfaty?.forecastAchPct ?? 0,
      suffix:'%', icon: TrendingUp, color: TRAFFIC_COLORS[
        getTrafficLight(forecastMap.wasfaty?.forecastAchPct ?? 0, 1)
      ]?.color || '#1a9a7e',
      sub: forecastMap.wasfaty?.forecastAchPct > 0
        ? `Recovery: ${Math.round((forecastMap.wasfaty.recoveryProbability || 0) * 100)}%`
        : currentTarget ? 'Enter data to forecast' : 'No target set',
    },
  }

  // ── No-branch guard ────────────────────────────────────────
  if (!loading && noBranch) {
    return (
      <div style={{ maxWidth:'480px', margin:'80px auto 0', padding:'0 16px' }}>
        <EmptyNoBranch />
      </div>
    )
  }

  // ── Error guard ──────────────────────────────────────────────
  if (!loading && fetchError) {
    return (
      <div style={{ maxWidth:'480px', margin:'80px auto 0', padding:'0 16px' }}>
        <ErrorState
          message="Failed to load dashboard data"
          onRetry={() => { setLoading(true); setTick((t) => t + 1) }}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth:'1600px', margin:'0 auto' }}>

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle" style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span>{format(new Date(), 'MMMM d, yyyy')}</span>
            <span style={{ color:'var(--border-default)' }}>·</span>
            <span>Day {daysPassed}/{totalDays}</span>
            <span style={{ color:'var(--border-default)' }}>·</span>
            <span className="status-dot" style={{ color: overallColors.color }}>
              {overallColors.label}
            </span>
          </div>
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          <button onClick={() => setShowCustom(true)}
            style={{ height:'30px', padding:'0 10px', borderRadius:'7px', fontSize:'11px', fontWeight:500, background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}
            onMouseEnter={(e)=>{e.currentTarget.style.background='var(--bg-overlay)';e.currentTarget.style.color='var(--text-primary)'}}
            onMouseLeave={(e)=>{e.currentTarget.style.background='var(--bg-elevated)';e.currentTarget.style.color='var(--text-secondary)'}}>
            <Settings2 style={{width:12,height:12}}/> Customize
          </button>
          <button onClick={() => { setLoading(true); setTick((t) => t + 1) }}
            style={{ height:'30px', padding:'0 10px', borderRadius:'7px', fontSize:'11px', fontWeight:500, background:'transparent', border:'1px solid transparent', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}
            onMouseEnter={(e)=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-secondary)'}}
            onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)'}}>
            <RefreshCw style={{width:12,height:12}}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Customisable top stat cards ──────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px', marginBottom:'20px' }}
           className="sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          : dashboardCards.slice(0, 4).map((cardKey, i) => {
              const d = CARD_DATA[cardKey]
              if (!d) return null
              return <StatCard key={cardKey} {...d} delay={i*60} loading={loading} animate={!loading} />
            })
        }
      </div>

      {/* ── No-entries banner (non-admin with no data) ────── */}
      {!loading && !isAdmin && monthEntries.length === 0 && !noBranch && (
        <div style={{
          display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px',
          borderRadius:'8px', marginBottom:'16px',
          background:'rgba(0,210,173,0.05)', border:'1px solid rgba(0,210,173,0.15)',
          fontSize:'12px', color:'var(--brand-400)',
        }} className="animate-fade-in">
          <span style={{ fontSize:'14px' }}>📋</span>
          <div>
            <span style={{ fontWeight:500 }}>No entries this month yet.</span>
            {' '}
            <button onClick={() => navigate('/entry')}
              style={{ color:'var(--brand-400)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textDecorationColor:'rgba(0,210,173,0.35)', fontSize:'12px', fontWeight:500 }}>
              Enter today's KPIs →
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Tile Grid — high-density ────────────────────── */}
      <div className="section-divider">
        <span className="section-divider-label">KPI Achievement — {format(new Date(),'MMM yyyy')}</span>
        <div className="section-divider-line" />
        <span style={{ fontSize:'9px', color:'var(--text-muted)', fontFamily:"'Inter',sans-serif", flexShrink:0 }}>
          Day {daysPassed}/{totalDays} · {Math.round(dayRatio*100)}%
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px', marginBottom:'20px' }}
           className="sm:grid-cols-5">
        {loading
          ? Array.from({length:5}).map((_,i) => <SkeletonStatCard key={i} />)
          : KPI_KEYS.map((k, i) => {
              const s   = kpiStats[k]
              const cfg = s?.colors || TRAFFIC_COLORS.critical
              const pace = paceMap[k]
              return (
                <div key={k} className="kpi-tile animate-slide-up" style={{ animationDelay:`${i*40}ms` }}>
                  {/* Label + status */}
                  <div className="kpi-tile-label">
                    <div style={{ width:5, height:5, borderRadius:'50%', background:KPI_COLORS_MAP[k], flexShrink:0 }} />
                    {KPI_LABELS_MAP[k]}
                    <span className="status-dot" style={{ color:cfg.color, marginRight:'auto', fontSize:'9px' }}>
                      {cfg.labelAr}
                    </span>
                  </div>
                  {/* Achievement % — dominant */}
                  <div className="kpi-tile-value value-reveal" style={{
                    color: s?.target > 0 ? cfg.color : 'var(--text-muted)',
                    fontStyle: s?.target > 0 ? 'normal' : 'italic',
                    fontSize: s?.target > 0 ? undefined : '0.9rem',
                  }}>
                    {s?.target > 0 ? `${s?.achievementPct || 0}%` : 'No target'}
                  </div>
                  {/* Actual / target */}
                  <div className="kpi-tile-meta">
                    {s?.target > 0
                      ? <>{(s?.actual||0).toLocaleString()} / {(s?.target||0).toLocaleString()}</>
                      : <span style={{ color:'var(--border-strong)' }}>Set targets to track</span>
                    }
                  </div>
                  {/* Progress */}
                  <div style={{ marginTop:'6px', height:'3px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:'99px', background:cfg.color, width:`${Math.min(s?.achievementPct||0,100)}%`, transition:'width 0.6s ease' }} />
                  </div>
                  {/* Pace status */}
                  {pace && (
                    <div style={{ fontSize:'9px', color:'var(--text-muted)', marginTop:'4px', fontVariantNumeric:'tabular-nums' }}>
                      {pace.currentDailyRate}/d · need {pace.requiredDailyPace}/d
                    </div>
                  )}
                </div>
              )
            })
        }
      </div>

      {/* ── Operational Insights Strip ──────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px', marginBottom:'20px' }}
           className="sm:grid-cols-4 lg:grid-cols-6 stagger">
        {loading ? <SkeletonInsightsStrip count={6} /> : [
          { label:'Run Rate',      value:`${Math.round(dayRatio*100)}%`,     sub:`Day ${daysPassed}/${totalDays}`,    color:'var(--text-secondary)' },
          { label:'Today Entries', value:todayEntries.length,                sub:'submissions',                       color:'var(--brand-400)' },
          { label:'Focus KPI',     value:`${kpiStats[weakestKpi]?.achievementPct||0}%`, sub:KPI_LABELS_MAP[weakestKpi]||'—', color:TRAFFIC_COLORS[kpiStats[weakestKpi]?.status||'critical']?.color },
          { label:'Best KPI',      value:`${kpiStats[strongestKpi]?.achievementPct||0}%`,sub:KPI_LABELS_MAP[strongestKpi]||'—',color:TRAFFIC_COLORS[kpiStats[strongestKpi]?.status||'good']?.color },
          { label:'Required/day',  value:(paceMap[weakestKpi]?.requiredDailyPace||0).toLocaleString(), sub:KPI_LABELS_MAP[weakestKpi],  color:'var(--text-secondary)' },
          { label:'Risk Level',    value:{ ON_TRACK:'✓ OK', LOW_RISK:'Low', MEDIUM_RISK:'Medium', HIGH_RISK:'⚠ High' }[riskLevel]||riskLevel,
            sub:'portfolio risk', color:{ ON_TRACK:'var(--kpi-good)', LOW_RISK:'var(--kpi-good)', MEDIUM_RISK:'var(--kpi-warning)', HIGH_RISK:'var(--kpi-critical)' }[riskLevel] },
        ].map((item, i) => (
          <div key={i} className="kpi-tile animate-slide-up" style={{ animationDelay:`${i*25}ms` }}>
            <div className="kpi-tile-label">{item.label}</div>
            <div className="value-reveal" style={{ fontSize:'1.1rem', fontWeight:600, letterSpacing:'-0.03em', color:item.color, fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif", lineHeight:1 }}>
              {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            </div>
            <div className="kpi-tile-meta">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Main workspace — chart + feed/mission ───────────── */}
      <div className="section-divider">
        <span className="section-divider-label">Analytics</span>
        <div className="section-divider-line" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'16px', marginBottom:'20px' }}
           className="xl:grid-cols-[1fr_300px]">

        {/* Trend chart */}
        <div>
          {loading ? <SkeletonChart /> : (
            <div className="card card-p space-y-3">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div className="section-title" style={{ fontSize:'12px' }}>14-Day Trend</div>
                  <div className="section-subtitle">Daily KPI volume</div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  {['wasfaty','omni','wellness'].map((k) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'9px', color:'var(--text-muted)' }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:KPI_COLORS_MAP[k] }} />
                      {KPI_LABELS_MAP[k]}
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top:5, right:5, bottom:0, left:-20 }}>
                  <defs>
                    {['wasfaty','omni','wellness'].map((k) => (
                      <linearGradient key={k} id={`g_${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={KPI_COLORS_MAP[k]} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={KPI_COLORS_MAP[k]} stopOpacity={0}   />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  {['wasfaty','omni','wellness'].map((k) => (
                    <Area key={k} type="monotone" dataKey={k} name={KPI_LABELS_MAP[k]}
                      stroke={KPI_COLORS_MAP[k]} strokeWidth={1.5} fill={`url(#g_${k})`}
                      dot={false} activeDot={{ r:3, strokeWidth:0 }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Operational feed: Mission + Run rate forecasts */}
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

          {/* Daily Mission */}
          {loading
            ? <SkeletonFeed rows={3} title="Daily Mission" />
            : mission ? (() => {
            const focusStatus = getTrafficLight(mission.achievementPct, dayRatio)
            const cfg         = TRAFFIC_COLORS[focusStatus] || TRAFFIC_COLORS.warning
            const diffColor   = { EASY:'#22c55e', MODERATE:'#00d2ad', CHALLENGING:'#f59e0b', STRETCH:'#ef4444' }[mission.difficulty] || '#00d2ad'
            return (
              <div className="op-feed">
                <div className="op-feed-header">
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <Zap style={{ width:12, height:12, color:cfg.color }} />
                    <span style={{ fontSize:'10px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em', textTransform:'uppercase', fontFamily:"'Inter',sans-serif" }}>
                      Daily Mission
                    </span>
                  </div>
                  <span style={{ fontSize:'9px', fontWeight:600, padding:'1px 6px', borderRadius:'99px', background:`${diffColor}14`, border:`1px solid ${diffColor}22`, color:diffColor, fontFamily:"'Inter',sans-serif" }}>
                    {mission.difficulty}
                  </span>
                </div>

                {/* Focus KPI row */}
                <div className="op-feed-item" style={{ flexDirection:'column', gap:'6px', borderBottom:'none' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)' }}>Focus KPI</div>
                      <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)', marginTop:'1px' }}>
                        {mission.kpiLabel?.en || mission.focusKpi}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'1.1rem', fontWeight:700, color:cfg.color, fontVariantNumeric:'tabular-nums' }}>
                        {mission.achievementPct}%
                      </div>
                      <div style={{ fontSize:'9px', color:'var(--text-muted)' }}>achievement</div>
                    </div>
                  </div>

                  {/* Gap + Required/day */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                    {[
                      { label:'Gap', value:(mission.targetGap||0).toLocaleString() },
                      { label:'Need/day', value:(mission.requiredToday||0).toLocaleString() },
                    ].map((item) => (
                      <div key={item.label} style={{ background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:'6px', padding:'5px 8px' }}>
                        <div style={{ fontSize:'8px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>{item.label}</div>
                        <div style={{ fontSize:'12px', fontWeight:600, color:cfg.color, fontVariantNumeric:'tabular-nums' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Action */}
                  <div style={{ fontSize:'11px', color:'var(--text-secondary)', lineHeight:1.4, paddingTop:'4px', borderTop:'1px solid var(--border-subtle)' }}>
                    💡 {mission.action}
                  </div>
                </div>
              </div>
            )
          })()
          : <EmptyMissionNotReady />
          }

          {/* Forecast feed */}
          {currentTarget ? (
            <div className="op-feed">
              <div className="op-feed-header">
                <span style={{ fontSize:'10px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em', textTransform:'uppercase', fontFamily:"'Inter',sans-serif" }}>
                  Run Rate Forecast
                </span>
                <span className="status-dot" style={{
                  fontSize:'9px', fontFamily:"'Inter',sans-serif",
                  color:{ ON_TRACK:'var(--kpi-good)', LOW_RISK:'var(--kpi-good)', MEDIUM_RISK:'var(--kpi-warning)', HIGH_RISK:'var(--kpi-critical)' }[riskLevel] || 'var(--text-muted)',
                }}>
                  {{ ON_TRACK:'On Track', LOW_RISK:'Low Risk', MEDIUM_RISK:'Monitor', HIGH_RISK:'At Risk' }[riskLevel] || riskLevel}
                </span>
              </div>
              {KPI_KEYS.map((k) => {
                const fc  = forecastMap[k]
                const cfg = fc ? TRAFFIC_COLORS[getTrafficLight(fc.forecastAchPct, 1)] : null
                return (
                  <div key={k} className="op-feed-item">
                    <div className="op-feed-dot" style={{ background: KPI_COLORS_MAP[k] }} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <span style={{ fontSize:'11px', color:'var(--text-secondary)' }}>{KPI_LABELS_MAP[k]}</span>
                        <span style={{ fontSize:'11px', fontWeight:600, color:cfg?.color||'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                          {fc?.forecastAchPct ?? 0}%
                        </span>
                      </div>
                      {fc && (
                        <div style={{ marginTop:'3px', height:'2px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:'99px', background:cfg?.color||KPI_COLORS_MAP[k], width:`${Math.min(fc.forecastAchPct,100)}%`, transition:'width 0.5s ease' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyNoForecast />
          )}
        </div>
      </div>

      {/* ── Branch ranking (admin) or Month vs Target ───────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'20px' }}
           className="lg:grid-cols-2">

        {/* Today bar chart */}
        {!loading && (
          <div className="card card-p space-y-3">
            <div className="section-title" style={{ fontSize:'12px' }}>Today's KPIs</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={KPI_KEYS.map((k) => ({
                name: KPI_LABELS_MAP[k],
                value: todayEntries.reduce((s, e) => s + (e[k]||0), 0),
                color: KPI_COLORS_MAP[k],
              }))} margin={{ top:5, right:5, bottom:0, left:-25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" radius={[4,4,0,0]}>
                  {KPI_KEYS.map((k, i) => (
                    <Cell key={i} fill={KPI_COLORS_MAP[k]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Branch ranking (admin) | Month vs Target (others) */}
        {!loading && (
          isAdmin ? (
            <div className="card card-p">
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px' }}>
                <Award style={{ width:13, height:13, color:'var(--brand-400)' }} strokeWidth={1.75} />
                <span className="section-title" style={{ fontSize:'12px' }}>Branch Ranking</span>
                <span style={{ fontSize:'9px', color:'var(--text-muted)', fontFamily:"'Inter',sans-serif" }}>Today</span>
              </div>
              {branchRanking.length === 0
                ? <EmptyTodayEntries onNavigate={() => navigate('/entry')} />
                : branchRanking.map((b, i) => {
                    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'other'
                    const maxTotal  = branchRanking[0]?.total || 1
                    return (
                      <div key={b.id} className="metric-row">
                        <span className={`rank-badge ${rankClass}`}>{i+1}</span>
                        <span className="metric-row-label" style={{ width:'100px', color:'var(--text-primary)', fontSize:'12px' }}>{b.name}</span>
                        <div className="metric-row-bar">
                          <div className="metric-row-fill" style={{ width:`${Math.round((b.total/maxTotal)*100)}%`, background:'var(--brand-500)' }} />
                        </div>
                        <span className="metric-row-pct" style={{ color:'var(--brand-400)' }}>
                          {b.total.toLocaleString()}
                        </span>
                      </div>
                    )
                  })
              }
            </div>
          ) : (
            <div className="card card-p">
              <div className="section-title" style={{ fontSize:'12px', marginBottom:'12px' }}>Month vs Target</div>
              {KPI_KEYS.map((k) => {
                const s = kpiStats[k]
                const cfg = s?.colors || TRAFFIC_COLORS.critical
                return (
                  <div key={k} className="metric-row">
                    <div style={{ width:5, height:5, borderRadius:'50%', background:KPI_COLORS_MAP[k], flexShrink:0 }} />
                    <span className="metric-row-label">{KPI_LABELS_MAP[k]}</span>
                    <div className="metric-row-bar">
                      <div className="metric-row-fill" style={{ width:`${Math.min(s?.achPct||0,100)}%`, background:cfg.color }} />
                    </div>
                    <span className="metric-row-pct" style={{ color:cfg.color }}>{s?.achPct||0}%</span>
                    <span style={{ fontSize:'9px', color:'var(--text-muted)' }}>{cfg.icon}</span>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Card customizer modal */}
      {showCustom && (
        <CardCustomizer
          selectedCards={localCards}
          onToggle={toggleCard}
          onClose={saveCustomization}
        />
      )}
    </div>
  )
}