// ============================================================
// Reports Page — connected to current Firestore schema
// Uses: kpiStore entries/targets, pharmacyStore, Engine V1
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText, Download, Calendar, BarChart2,
  TrendingUp, Building2, FileSpreadsheet,
} from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }    from '../../components/ui/Toast'
import EmptyState           from '../../components/ui/EmptyState'
import { SkeletonChart }    from '../../components/ui/SkeletonCard'
import {
  getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, sumKpi, getDayProgress,
  computeOverallAchievement, computeKpiStats,
} from '../../engine'

// Executive Intelligence Layer
import {
  generateBranchSummary,
  GRADE_COLORS, GRADE_BG, GRADE_BORDER,
} from '../../engine/executive'
import { format as dateFnsFormat } from 'date-fns'

// ── Constants ─────────────────────────────────────────────────
const KPI_FIELDS = [
  { key:'wasfaty',      targetKey:'wasfatyTarget',   label:'Wasfaty',      color:'#6366f1' },
  { key:'omni',         targetKey:'omniTarget',       label:'OmniHealth',   color:'#ef4444' },
  { key:'wellness',     targetKey:'wellnessTarget',   label:'Wellness',     color:'#f59e0b' },
  { key:'basket',       targetKey:'basketTarget',     label:'Basket',       color:'#22c55e' },
  { key:'crossSelling', targetKey:'crossSellTarget',  label:'Cross Sell',   color:'#8b5cf6' },
]

const REPORT_TYPES = [
  { id:'daily',   label:'Today',        icon: Calendar   },
  { id:'weekly',  label:'Last 7 days',  icon: BarChart2  },
  { id:'monthly', label:'This Month',   icon: TrendingUp },
]

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function getDateRange(type) {
  const today = new Date()
  switch (type) {
    case 'daily':   return { from: todayStr(), to: todayStr() }
    case 'weekly':  return { from: format(subDays(today, 6), 'yyyy-MM-dd'), to: todayStr() }
    case 'monthly': return {
      from: format(startOfMonth(today), 'yyyy-MM-dd'),
      to:   format(endOfMonth(today),   'yyyy-MM-dd'),
    }
    default: return { from: todayStr(), to: todayStr() }
  }
}

// Recharts tooltip
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'var(--bg-overlay)', border:'1px solid var(--border-default)',
      borderRadius:'8px', padding:'8px 12px',
      boxShadow:'0 8px 24px rgba(0,0,0,0.4)', fontSize:'11px',
      fontFamily:"'Inter', monospace",
    }}>
      <p style={{ color:'var(--text-muted)', marginBottom:'4px' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:p.color }} />
          <span style={{ color:'var(--text-primary)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ReportsPage() {
  const { userProfile }  = useAuthStore()
  const {
    entries, targets,
    subscribeAllEntries, subscribePharmacyEntries,
    subscribeAllTargets, subscribeMyTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const toast = useToastStore()

  const [reportType,     setReportType]     = useState('monthly')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const [useCustom,      setUseCustom]      = useState(false)
  const [loading,        setLoading]        = useState(true)

  const role      = userProfile?.role
  const isAdmin   = role === 'admin'
  const isManager = ['admin','manager'].includes(role)
  const pharmacyId = userProfile?.pharmacyId
  const dp = getDayProgress()

  useEffect(() => {
    const u1 = subPh()
    let u2 = () => {}, u3 = () => {}
    if (isAdmin) {
      u2 = subscribeAllEntries()
      u3 = subscribeAllTargets()
    } else if (pharmacyId) {
      u2 = subscribePharmacyEntries(pharmacyId)
      u3 = subscribeMyTargets(pharmacyId)
    }
    const t = setTimeout(() => setLoading(false), 600)
    return () => { u1(); u2?.(); u3?.(); clearTimeout(t) }
  }, [userProfile?.uid])

  const today = todayStr()
  const baseRange = getDateRange(reportType)
  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : baseRange

  // Filter entries to date range + branch
  const rangeEntries = useMemo(() =>
    entries.filter((e) => {
      const inRange  = e.date >= dateRange.from && e.date <= dateRange.to
      const inBranch = selectedBranch === 'all' || e.pharmacyId === selectedBranch
      return inRange && inBranch
    }),
    [entries, dateRange, selectedBranch]
  )

  // Current month for targets
  const currentMonth = format(new Date(), 'yyyy-MM')

  // Per-KPI summary for range
  const kpiSummary = useMemo(() => {
    // Find target for each pharmacy
    const targetMap = {}
    targets.forEach((t) => { if (t.month === currentMonth) targetMap[t.pharmacyId] = t })

    return KPI_FIELDS.map(({ key, targetKey, label, color }) => {
      const total      = rangeEntries.reduce((s, e) => s + (Number(e[key]) || 0), 0)
      const totalTarget = (() => {
        const branches = selectedBranch === 'all'
          ? [...new Set(rangeEntries.map((e) => e.pharmacyId))]
          : [selectedBranch]
        return branches.reduce((s, pid) => s + (targetMap[pid]?.[targetKey] || 0), 0)
      })()
      const achPct   = computeAchievementPct(total, totalTarget)
      const status   = totalTarget > 0 ? getTrafficLight(achPct, dp.ratio) : null
      return { key, label, color, total, totalTarget, achPct, status, entryCount: rangeEntries.length }
    })
  }, [rangeEntries, targets, selectedBranch, currentMonth, dp])

  // Overall achievement
  const overallAch = useMemo(() => {
    const vals = kpiSummary.filter((k) => k.totalTarget > 0).map((k) => k.achPct)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
  }, [kpiSummary])

  // Per-branch summary (admin/manager)
  const branchSummary = useMemo(() => {
    if (!isManager) return []
    const targetMap = {}
    targets.forEach((t) => { if (t.month === currentMonth) targetMap[t.pharmacyId] = t })

    return pharmacies
      .filter((p) => p.active !== false)
      .map((ph) => {
        const be   = rangeEntries.filter((e) => e.pharmacyId === ph.id)
        const kpiStatsMap = {}
        KPI_FIELDS.forEach(({ key, targetKey }) => {
          const actual = be.reduce((s, e) => s + (Number(e[key]) || 0), 0)
          const target = targetMap[ph.id]?.[targetKey] || 0
          kpiStatsMap[key] = { achievementPct: computeAchievementPct(actual, target) }
        })
        const ach = computeOverallAchievement(kpiStatsMap)
        return { ...ph, achievement: ach, entryCount: be.length }
      })
      .sort((a, b) => b.achievement - a.achievement)
  }, [pharmacies, rangeEntries, targets, currentMonth, isManager])

  // 14-day trend
  const trendData = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const date  = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
      const label = format(subDays(new Date(), 13 - i), 'dd/MM')
      const de    = entries.filter((e) =>
        e.date === date && (selectedBranch === 'all' || e.pharmacyId === selectedBranch)
      )
      const total = de.reduce((s, e) =>
        KPI_FIELDS.reduce((ss, { key }) => ss + (Number(e[key]) || 0), s), 0)
      return { date: label, total }
    }),
    [entries, selectedBranch]
  )

  // ── Executive Intelligence Summary ─────────────────────────────
  // For selected branch (or first active branch for admin)
  const executiveSummary = useMemo(() => {
    const today     = new Date().toISOString().split('T')[0]
    const thisMonth = format(new Date(), 'yyyy-MM')

    // Determine which branch to summarise
    const targetPharmacyId = selectedBranch !== 'all'
      ? selectedBranch
      : pharmacies.find((p) => p.active !== false)?.id

    if (!targetPharmacyId) return null

    const pharmacy = pharmacies.find((p) => p.id === targetPharmacyId)
    if (!pharmacy) return null

    const branchTarget = targets.find(
      (t) => t.pharmacyId === targetPharmacyId && t.month === thisMonth
    )

    const from = `${thisMonth}-01`
    const last = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const to   = `${thisMonth}-${String(last).padStart(2,'0')}`
    const branchMTD = entries.filter(
      (e) => e.pharmacyId === targetPharmacyId && e.date >= from && e.date <= to
    )
    const historical = [...entries]
      .filter((e) => e.pharmacyId === targetPharmacyId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60)

    try {
      return generateBranchSummary(
        {
          pharmacyId:   targetPharmacyId,
          pharmacyName: pharmacy.name,
          pharmacyCode: pharmacy.code || '',
          region:       pharmacy.region || '',
          mtdEntries:   branchMTD,
          target:       branchTarget || null,
          historicalEntries: historical,
        },
        today,
        thisMonth,
      )
    } catch {
      return null
    }
  }, [selectedBranch, pharmacies, targets, entries])

  // ── CSV Export ───────────────────────────────────────────────
  const exportCSV = () => {
    const header = 'Date,Pharmacy,Wasfaty,OmniHealth,Wellness,Basket,CrossSelling\n'
    const rows = rangeEntries.map((e) => {
      const ph = pharmacies.find((p) => p.id === e.pharmacyId)
      return `${e.date},${ph?.name || e.pharmacyId},${e.wasfaty||0},${e.omni||0},${e.wellness||0},${e.basket||0},${e.crossSelling||0}`
    }).join('\n')
    const blob = new Blob(['\uFEFF' + header + rows], { type:'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-${reportType}-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const STAT_STYLE = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '12px 16px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px' }}>
        <div>
          <h1 style={{ fontSize:'15px', fontWeight:600, letterSpacing:'-0.02em', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Reports
          </h1>
          <p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
            {rangeEntries.length} entries · {dateRange.from}{dateRange.from !== dateRange.to ? ` → ${dateRange.to}` : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          <button onClick={exportCSV}
            style={{ height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'5px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
            <Download style={{ width:13, height:13 }} /> CSV
          </button>
          <button onClick={() => toast.info('PDF export — coming soon')}
            style={{ height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'5px', opacity:0.6 }}>
            <FileText style={{ width:13, height:13 }} /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'flex-end' }}>
        {/* Report type */}
        <div style={{ display:'flex', gap:'2px', background:'var(--bg-hover)', border:'1px solid var(--border-subtle)', borderRadius:'8px', padding:'2px' }}>
          {REPORT_TYPES.map((rt) => (
            <button key={rt.id} onClick={() => { setReportType(rt.id); setUseCustom(false) }}
              style={{
                height:'28px', padding:'0 10px', borderRadius:'6px', fontSize:'12px', fontWeight:500, cursor:'pointer',
                background: reportType === rt.id && !useCustom ? 'var(--bg-card)' : 'transparent',
                border: `1px solid ${reportType === rt.id && !useCustom ? 'var(--border-default)' : 'transparent'}`,
                color: reportType === rt.id && !useCustom ? 'var(--text-primary)' : 'var(--text-muted)',
                transition:'all 0.15s',
              }}>
              {rt.label}
            </button>
          ))}
        </div>

        {/* Branch selector */}
        {isManager && (
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ height:'34px', fontSize:'12px', minWidth:'140px' }}>
            <option value="all">All Branches</option>
            {pharmacies.filter((p) => p.active !== false).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Custom range */}
        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <input type="date" value={customFrom} max={today} dir="ltr"
            onChange={(e) => { setCustomFrom(e.target.value); if (customTo) setUseCustom(true) }}
            style={{ height:'34px', fontSize:'12px', width:'130px' }} />
          <span style={{ color:'var(--text-muted)', fontSize:'11px' }}>→</span>
          <input type="date" value={customTo} max={today} dir="ltr"
            onChange={(e) => { setCustomTo(e.target.value); if (customFrom) setUseCustom(true) }}
            style={{ height:'34px', fontSize:'12px', width:'130px' }} />
          {useCustom && (
            <button onClick={() => { setUseCustom(false); setCustomFrom(''); setCustomTo('') }}
              style={{ fontSize:'11px', color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:'0 4px' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Executive Intelligence Summary Card ─────────────── */}
      {executiveSummary && (
        <div style={{
          background:'var(--bg-surface)', border:`1px solid ${GRADE_BORDER[executiveSummary.score.grade]}`,
          borderRadius:'10px', padding:'14px 16px',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',
        }} className="animate-fade-in">
          {/* Header row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{
                width:36, height:36, borderRadius:'8px', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: GRADE_BG[executiveSummary.score.grade],
                border:`1px solid ${GRADE_BORDER[executiveSummary.score.grade]}`,
              }}>
                <span style={{
                  fontSize:'16px', fontWeight:700,
                  color: GRADE_COLORS[executiveSummary.score.grade],
                  fontFamily:"'Inter',sans-serif",
                }}>
                  {executiveSummary.score.grade}
                </span>
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                  {executiveSummary.pharmacyName}
                </div>
                <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px', fontFamily:"'Inter',sans-serif" }}>
                  Executive Summary · {executiveSummary.reportMonth}
                </div>
              </div>
            </div>

            {/* Score + Risk badges */}
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {/* Composite score */}
              <div style={{
                padding:'3px 10px', borderRadius:'99px', fontSize:'11px', fontWeight:600,
                fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums',
                background: GRADE_BG[executiveSummary.score.grade],
                border:`1px solid ${GRADE_BORDER[executiveSummary.score.grade]}`,
                color: GRADE_COLORS[executiveSummary.score.grade],
              }}>
                Score {executiveSummary.score.adjusted}/100
              </div>

              {/* Risk badge */}
              {(() => {
                const riskStyle = {
                  ON_TRACK:    { bg:'rgba(0,210,173,0.08)',  border:'rgba(0,210,173,0.2)',  color:'#00d2ad', label:'On Track'  },
                  LOW_RISK:    { bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.2)',  color:'#22c55e', label:'Low Risk'  },
                  MEDIUM_RISK: { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)', color:'#f59e0b', label:'Medium Risk'},
                  HIGH_RISK:   { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.2)',  color:'#ef4444', label:'High Risk' },
                }[executiveSummary.riskProfile.riskLevel] || { bg:'var(--bg-hover)', border:'var(--border-subtle)', color:'var(--text-muted)', label:'Unknown' }
                return (
                  <div style={{
                    display:'flex', alignItems:'center', gap:'4px',
                    padding:'3px 10px', borderRadius:'99px', fontSize:'11px', fontWeight:500,
                    fontFamily:"'Inter',sans-serif",
                    background: riskStyle.bg, border:`1px solid ${riskStyle.border}`, color: riskStyle.color,
                  }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:riskStyle.color, flexShrink:0 }} />
                    {riskStyle.label}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* KPI breakdown row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px', marginBottom:'12px' }}
               className="sm:grid-cols-5">
            {executiveSummary.score.kpiBreakdown.map(({ kpiKey, label, achievementPct, status }) => {
              const cfg = TRAFFIC_COLORS[status]
              const isWeakest  = executiveSummary.weakestKpi   === kpiKey
              const isStrongest = executiveSummary.strongestKpi === kpiKey
              return (
                <div key={kpiKey} style={{
                  background:'var(--bg-overlay)', borderRadius:'7px', padding:'7px 10px',
                  border:`1px solid ${isWeakest ? 'rgba(239,68,68,0.2)' : isStrongest ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)'}`,
                  position:'relative',
                }}>
                  {(isWeakest || isStrongest) && (
                    <div style={{
                      position:'absolute', top:'-6px', right:'6px',
                      fontSize:'8px', fontWeight:600, padding:'0 4px', borderRadius:'3px',
                      fontFamily:"'Inter',sans-serif", letterSpacing:'0.04em',
                      background: isWeakest ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: isWeakest ? '#f87171' : '#4ade80', border:'none',
                    }}>
                      {isWeakest ? '▼ FOCUS' : '▲ BEST'}
                    </div>
                  )}
                  <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'3px', fontFamily:"'Inter',sans-serif", letterSpacing:'0.04em', textTransform:'uppercase' }}>
                    {label}
                  </div>
                  <div style={{ fontSize:'1rem', fontWeight:600, color:cfg.color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.03em' }}>
                    {achievementPct}%
                  </div>
                </div>
              )
            })}
          </div>

          {/* Top recommendations */}
          {executiveSummary.recommendations.length > 0 && (
            <div style={{ borderTop:'1px solid var(--border-subtle)', paddingTop:'10px' }}>
              <div style={{ fontSize:'9px', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'7px', fontFamily:"'Inter',sans-serif" }}>
                Recommendations
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {executiveSummary.recommendations.slice(0, 3).map((r) => {
                  const prioColor = { CRITICAL:'#ef4444', HIGH:'#f59e0b', MEDIUM:'#00d2ad', INFO:'#60a5fa' }[r.priority] || 'var(--text-muted)'
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'flex-start', gap:'8px', fontSize:'11px' }}>
                      <div style={{ width:5, height:5, borderRadius:'50%', background:prioColor, flexShrink:0, marginTop:'5px' }} />
                      <div>
                        <span style={{ fontWeight:500, color:'var(--text-primary)' }}>{r.title}</span>
                        {' '}
                        <span style={{ color:'var(--text-muted)' }}>{r.body}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-4">
        {[
          { label:'Overall Ach.',  value: `${overallAch}%`,        color: TRAFFIC_COLORS[getTrafficLight(overallAch, dp.ratio)]?.color || 'var(--brand-400)' },
          { label:'Total Entries', value: rangeEntries.length,     color:'var(--brand-400)' },
          { label:'Active Branches', value: isAdmin ? branchSummary.filter((b) => b.entryCount > 0).length : '—', color:'#6366f1' },
          { label:'Days in Range',
            value: (() => {
              const d1 = new Date(dateRange.from), d2 = new Date(dateRange.to)
              return Math.round((d2 - d1) / 86400000) + 1
            })(),
            color:'#f59e0b' },
        ].map((s) => (
          <div key={s.label} style={STAT_STYLE}>
            <div style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'5px', fontFamily:"'Inter',sans-serif" }}>
              {s.label}
            </div>
            <div style={{ fontSize:'1.25rem', fontWeight:600, letterSpacing:'-0.03em', fontVariantNumeric:'tabular-nums', color: s.color, fontFamily:"'Inter',sans-serif" }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* KPI achievement summary */}
      <div style={{ ...STAT_STYLE, padding:'16px' }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          KPI Achievement — {useCustom ? 'Custom range' : REPORT_TYPES.find((r) => r.id === reportType)?.label}
        </div>
        {loading ? (
          <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'12px' }}>Loading...</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {kpiSummary.map(({ key, label, color, total, totalTarget, achPct, status }) => {
              const cfg = status ? TRAFFIC_COLORS[status] : null
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'5px', width:'90px', flexShrink:0 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
                    <span style={{ fontSize:'11px', color:'var(--text-secondary)' }}>{label}</span>
                  </div>
                  <div style={{ flex:1, height:'5px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:'99px', background: cfg?.color || color, width:`${Math.min(achPct, 100)}%`, transition:'width 0.6s ease' }} />
                  </div>
                  <div style={{ width:'36px', textAlign:'left', fontSize:'11px', fontWeight:600, fontVariantNumeric:'tabular-nums', color: cfg?.color || color }}>
                    {totalTarget > 0 ? `${achPct}%` : '—'}
                  </div>
                  <div style={{ width:'60px', textAlign:'left', fontSize:'10px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                    {total.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 14-day trend */}
      <div style={{ ...STAT_STYLE, padding:'16px' }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          14-Day Entry Volume
        </div>
        {loading ? <SkeletonChart height={160} /> : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData} margin={{ top:0, right:0, bottom:0, left:-30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="total" radius={[3,3,0,0]} fill="var(--brand-500)" opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Branch breakdown — manager/admin only */}
      {isManager && branchSummary.length > 0 && (
        <div style={{ ...STAT_STYLE, padding:'16px' }}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Branch Performance
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {branchSummary.slice(0, 10).map((b, idx) => {
              const cfg = TRAFFIC_COLORS[getTrafficLight(b.achievement, dp.ratio)]
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'10px', color:'var(--text-muted)', width:'16px', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                    {idx + 1}
                  </span>
                  <Building2 style={{ width:12, height:12, color:'var(--text-muted)', flexShrink:0 }} strokeWidth={1.75} />
                  <span style={{ flex:1, fontSize:'12px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {b.name}
                  </span>
                  <span style={{ fontSize:'10px', color:'var(--text-muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                    {b.entryCount}
                  </span>
                  <div style={{ width:'80px', height:'4px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden', flexShrink:0 }}>
                    <div style={{ height:'100%', borderRadius:'99px', background: cfg.color, width:`${Math.min(b.achievement, 100)}%`, transition:'width 0.6s ease' }} />
                  </div>
                  <span style={{ fontSize:'11px', fontWeight:600, width:'34px', textAlign:'left', fontVariantNumeric:'tabular-nums', color: cfg.color, flexShrink:0 }}>
                    {b.achievement}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {rangeEntries.length === 0 && !loading && (
        <EmptyState icon={FileText}
          title="No entries for this period"
          description="Enter KPI data or adjust the date range" />
      )}
    </div>
  )
}
