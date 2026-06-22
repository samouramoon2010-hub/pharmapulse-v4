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
import { formatNumber }     from '../../utils/helpers'
import {
  getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, sumKpi, getDayProgress,
  computeOverallAchievement, computeKpiStats,
} from '../../engine'
import { subscribeKpiRegistry }                    from '../../services/kpiRegistryService'
import { DEFAULT_KPI_REGISTRY, getTargetFieldName,
         getKpisForSurface, DEFAULT_KPI_UI_CONFIG } from '../../engine/kpiRegistry'

// Executive Intelligence Layer
import {
  generateBranchSummary,
  GRADE_COLORS, GRADE_BG, GRADE_BORDER,
} from '../../engine/executive'
import { format as dateFnsFormat } from 'date-fns'

// ── Constants ─────────────────────────────────────────────────
// KPI_FIELDS is now registry-driven — see useMemo inside the component
// Phase 1B: colors read from registry resolver — no local hardcoded map.
import { getKpiColor, DEFAULT_KPI_COLOR as DEFAULT_KPI_COLOR_REPORTS, getPilotTrackingKpis } from '../../engine/kpiRegistry/kpiMetaResolver'
import TrackingOnlyBadge, { PilotKpiSectionHeader } from '../../components/ui/TrackingOnlyBadge'
import { useScopeProfile }                              from '../../hooks/useScopeProfile'
import { filterAllowedPharmacies, isPharmacyAllowed } from '../../services/scopeResolver'

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
    targets,
    fetchEntriesRange,
    subscribeRecentTargets, subscribeMyTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const toast = useToastStore()

  const [reportType,     setReportType]     = useState('monthly')
  // Admin starts on 'all'; non-admin is locked to own pharmacy from mount.
  // This ensures calculations that use selectedBranch are correct even if
  // the selector is hidden (rangeEntries filter, kpiSummary, executiveSummary).
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const [useCustom,      setUseCustom]      = useState(false)
  const [loading,        setLoading]        = useState(true)

  // ── Fetched entries (local state — not global Zustand store) ─
  // Populated by fetchEntriesRange on every dateRange / role change.
  // Admin: all branches. Manager/pharmacist: own branch only.
  // Effective fetch window = max(dateRange, 60 days) so that
  // trendData (14-day) and executiveSummary (60-day historical)
  // are always within the fetched window regardless of dateRange.
  const [fetchedEntries,  setFetchedEntries]  = useState([])
  const [fetchLoading,    setFetchLoading]    = useState(false)
  const [fetchError,      setFetchError]      = useState(null)

  // ── Live registry-driven KPI list ─────────────────────────
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)

  // ── Scope Resolver — Phase 2F-2 ───────────────────────────────
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()

  const allowedPharmacies = scope ? filterAllowedPharmacies(scope, pharmacies) : []

  // Scope-driven selectedBranch initialization (UI state only — fetch scope added in Phase 2F-3)
  useEffect(() => {
    if (!scope) return
    if (scope.type === 'single') {
      setSelectedBranch(scope.id)
    } else if (scope.type === 'all') {
      setSelectedBranch((prev) => prev ?? 'all')
    } else if (scope.type === 'list') {
      setSelectedBranch((prev) => prev ?? 'all')
    }
    // scope.type === 'none': leave null — access denied guard handles it
  }, [scope])

  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // KPI configs: production_evaluation KPIs only — for main report table
  const KPI_FIELDS = useMemo(() => {
    return getKpisForSurface(liveRegistry, 'dashboardEnabled')
      .filter((cfg) => cfg.lifecycleStage === 'production_evaluation')
      .map(cfg => ({
        key:       cfg.aliasFor ?? cfg.key,
        registryKey: cfg.key,
        targetKey: getTargetFieldName(cfg.key),
        label:     cfg.shortLabel,
        color:     cfg.defaultColor ?? getKpiColor(cfg.aliasFor ?? cfg.key),
      }))
  }, [liveRegistry])

  // Pilot KPI configs — tracked only, separate section in reports
  const PILOT_KPI_FIELDS = useMemo(() => {
    return getPilotTrackingKpis(liveRegistry).map(cfg => ({
      key:         cfg.aliasFor ?? cfg.key,
      registryKey: cfg.key,
      targetKey:   `${cfg.key}Target`,
      label:       cfg.shortLabel || cfg.label,
      labelAr:     cfg.labelAr,
      color:       '#b45309',  // amber — consistent with tracking badge
    }))
  }, [liveRegistry])

  const role      = userProfile?.role
  const isAdmin   = role === 'admin'
  const isManager = ['admin', 'manager', 'branch_manager'].includes(role)
  const pharmacyId = userProfile?.pharmacyId
  const dp = getDayProgress()

  // ── Pharmacies + targets: real-time subscriptions (unchanged) ─
  useEffect(() => {
    const u1 = subPh()
    let u2 = () => {}
    if (isAdmin) {
      u2 = subscribeRecentTargets()
    } else if (pharmacyId) {
      u2 = subscribeMyTargets(pharmacyId)
    }
    const t = setTimeout(() => setLoading(false), 600)
    return () => { u1(); u2?.(); clearTimeout(t) }
  }, [userProfile?.uid])

  const today = todayStr()
  const baseRange = getDateRange(reportType)
  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : baseRange

  // ── On-demand entry fetch triggered by dateRange or scope change ─
  // Fetches an effective window = max(dateRange, 60 days) so that
  // trendData (last 14 days) and executiveSummary (last 60 days)
  // are always covered regardless of the selected report range.
  // Scope-driven: all → no filter, single → pharmacyId, list → pharmacyIds[].
  // Does NOT write to the global Zustand store.
  useEffect(() => {
    // Don't fetch until auth and scope are resolved
    if (!userProfile?.uid) return
    if (!scope) return

    // Determine fetch options from scope (Phase 2F-3)
    let fetchOptions
    if (scope.type === 'all') {
      fetchOptions = {}
    } else if (scope.type === 'single') {
      fetchOptions = { pharmacyId: scope.id }
    } else if (scope.type === 'list') {
      fetchOptions = { pharmacyIds: scope.ids ?? [] }
    } else {
      // none — no access
      setFetchedEntries([])
      setFetchLoading(false)
      return
    }

    let cancelled = false
    setFetchLoading(true)
    setFetchError(null)

    // Effective from-date: earlier of dateRange.from and 60 days ago
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0]
    const effectiveFrom = dateRange.from < sixtyDaysAgoStr
      ? dateRange.from
      : sixtyDaysAgoStr
    const effectiveTo = todayStr()

    fetchEntriesRange(effectiveFrom, effectiveTo, fetchOptions, liveRegistry)
      .then((rows) => {
        if (!cancelled) {
          setFetchedEntries(rows)
          setFetchLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[ReportsPage] fetchEntriesRange failed:', err)
          setFetchError(err.message || 'Failed to load report data')
          setFetchLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [userProfile?.uid, scope, dateRange.from, dateRange.to, liveRegistry])

  // Filter fetched entries to the exact report date range + selected branch.
  // fetchedEntries may span a wider window (up to 60 days) to support
  // trendData and executiveSummary — the dateRange filter here scopes the
  // report body to exactly what the user selected.
  const rangeEntries = useMemo(() =>
    fetchedEntries.filter((e) => {
      const inRange  = e.date >= dateRange.from && e.date <= dateRange.to
      const inBranch = selectedBranch !== 'all'
        ? e.pharmacyId === selectedBranch
        : (scope ? isPharmacyAllowed(scope, e.pharmacyId) : false)
      return inRange && inBranch
    }),
    [fetchedEntries, dateRange, selectedBranch, scope]
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
  }, [rangeEntries, targets, selectedBranch, currentMonth, dp, KPI_FIELDS])

  // Overall achievement
  const overallAch = useMemo(() => {
    const vals = kpiSummary.filter((k) => k.totalTarget > 0).map((k) => k.achPct)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
  }, [kpiSummary])

  // Per-branch summary (admin/manager/branch_manager)
  //
  // RBAC scoping rules:
  //   admin          → all active pharmacies
  //   manager        → own pharmacy only (pharmacyId from profile)
  //   branch_manager → own pharmacy only (pharmacyId from profile)
  //   pharmacist     → not shown (isManager gate returns [])
  //
  // Entry data and target data are already pre-scoped at the Firestore query level
  // for non-admins. The pharmacy list must match the same scope — otherwise other
  // branches appear with actual=0 and target=0, producing misleading 0% rows.
  const branchSummary = useMemo(() => {
    if (!scope || scope.type === 'single' || scope.type === 'none') return []
    const targetMap = {}
    targets.forEach((t) => { if (t.month === currentMonth) targetMap[t.pharmacyId] = t })

    const visiblePharmacies = scope
      ? filterAllowedPharmacies(scope, pharmacies).filter((p) => p.active !== false)
      : []

    return visiblePharmacies
      .map((ph) => {
        const be   = rangeEntries.filter((e) => e.pharmacyId === ph.id)
        const kpiStatsMap = {}
        KPI_FIELDS.forEach(({ key, targetKey }) => {
          const actual = be.reduce((s, e) => s + (Number(e[key]) || 0), 0)
          const target = targetMap[ph.id]?.[targetKey] || 0
          kpiStatsMap[key] = {
            achievementPct: computeAchievementPct(actual, target),
            target,   // required by computeOverallAchievement's exclusion guard
            actual,   // included for KpiStats consistency
          }
        })
        const ach = computeOverallAchievement(kpiStatsMap)
        const totalActual = KPI_FIELDS.reduce((s, { key }) => s + (kpiStatsMap[key]?.actual || 0), 0)
        const totalTarget = KPI_FIELDS.reduce((s, { key }) => s + (kpiStatsMap[key]?.target || 0), 0)
        const gap = Math.max(0, totalTarget - totalActual)
        return { ...ph, achievement: ach, entryCount: be.length, totalActual, totalTarget, gap }
      })
      .sort((a, b) => b.achievement - a.achievement)
  }, [pharmacies, rangeEntries, targets, currentMonth, scope, KPI_FIELDS])

  // MTD trend — current month vs same-day period in previous month
  const mtdTrend = useMemo(() => {
    const now = new Date()
    const yr = now.getFullYear(), mo = now.getMonth()
    const day = now.getDate()
    const currFrom = format(new Date(yr, mo, 1), 'yyyy-MM-dd')
    const currTo   = format(now, 'yyyy-MM-dd')
    const prevYr = mo === 0 ? yr - 1 : yr
    const prevMo = mo === 0 ? 11 : mo - 1
    const prevFrom = format(new Date(prevYr, prevMo, 1), 'yyyy-MM-dd')
    const lastPrev = new Date(prevYr, prevMo + 1, 0).getDate()
    const prevTo = format(new Date(prevYr, prevMo, Math.min(day, lastPrev)), 'yyyy-MM-dd')
    const inScope = (e) => scope ? isPharmacyAllowed(scope, e.pharmacyId) : false
    const sum = (arr) => arr.reduce((s, e) =>
      KPI_FIELDS.reduce((ss, { key }) => ss + (Number(e[key]) || 0), s), 0)
    const currTotal = sum(fetchedEntries.filter((e) => e.date >= currFrom && e.date <= currTo && inScope(e)))
    const prevTotal = sum(fetchedEntries.filter((e) => e.date >= prevFrom && e.date <= prevTo && inScope(e)))
    const diff = currTotal - prevTotal
    const trend = diff > 0 ? 'improving' : diff < 0 ? 'declining' : 'neutral'
    const prevMonth = format(new Date(prevYr, prevMo, 1), 'yyyy-MM')
    const currMonth2 = format(new Date(yr, mo, 1), 'yyyy-MM')
    return { currTotal, prevTotal, diff, trend, currMonth: currMonth2, prevMonth }
  }, [fetchedEntries, scope, KPI_FIELDS])

  // Territory summary — list scope only
  const territorySummary = useMemo(() => {
    if (!scope || scope.type !== 'list') return null
    if (branchSummary.length === 0) return null
    const totalGap = branchSummary.reduce((s, b) => s + (b.gap || 0), 0)
    const avgAchievement = Math.round(branchSummary.reduce((s, b) => s + b.achievement, 0) / branchSummary.length)
    return {
      count: branchSummary.length,
      avgAchievement,
      bestBranch: branchSummary[0],
      worstBranch: branchSummary[branchSummary.length - 1],
      totalGap,
    }
  }, [scope, branchSummary])

  // 14-day trend
  const trendData = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const date  = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
      const label = format(subDays(new Date(), 13 - i), 'dd/MM')
      const de    = fetchedEntries.filter((e) =>
        e.date === date && (selectedBranch === 'all' || e.pharmacyId === selectedBranch)
      )
      const total = de.reduce((s, e) =>
        KPI_FIELDS.reduce((ss, { key }) => ss + (Number(e[key]) || 0), s), 0)
      return { date: label, total }
    }),
    [fetchedEntries, selectedBranch]
  )

  // ── Executive Intelligence Summary ─────────────────────────────
  // For selected branch (or first active branch for admin)
  const executiveSummary = useMemo(() => {
    const today     = new Date().toISOString().split('T')[0]
    const thisMonth = format(new Date(), 'yyyy-MM')

    // Determine which branch to summarise (scope-scoped fallback for 'all')
    const targetPharmacyId = selectedBranch !== 'all'
      ? selectedBranch
      : (scope ? filterAllowedPharmacies(scope, pharmacies) : pharmacies)
          .find((p) => p.active !== false)?.id

    if (!targetPharmacyId) return null

    const pharmacy = pharmacies.find((p) => p.id === targetPharmacyId)
    if (!pharmacy) return null

    const branchTarget = targets.find(
      (t) => t.pharmacyId === targetPharmacyId && t.month === thisMonth
    )

    const from = `${thisMonth}-01`
    const last = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const to   = `${thisMonth}-${String(last).padStart(2,'0')}`
    const branchMTD = fetchedEntries.filter(
      (e) => e.pharmacyId === targetPharmacyId && e.date >= from && e.date <= to
    )
    const historical = [...fetchedEntries]
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
  }, [selectedBranch, scope, pharmacies, targets, fetchedEntries])

  // ── CSV Export — registry-driven ─────────────────────────
  // Headers and row values built from live KPI_FIELDS (same source
  // as the report table) so custom KPIs always get named columns.
  const exportCSV = () => {
    // Build header: fixed metadata columns + one per active KPI
    const kpiHeaders = KPI_FIELDS.map((f) => f.label ?? f.key)
    const header = ['Date', 'Pharmacy', ...kpiHeaders].join(',') + '\n'

    const rows = rangeEntries.map((e) => {
      const ph    = pharmacies.find((p) => p.id === e.pharmacyId)
      const kpis  = KPI_FIELDS.map((f) => e[f.key] ?? 0)
      return [e.date, ph?.name || e.pharmacyId, ...kpis].join(',')
    }).join('\n')

    const blob = new Blob(['\uFEFF' + header + rows], { type:'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-${reportType}-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const exportExcel = () => {
    const dataRows = branchSummary.map((b) =>
      `<tr><td>${b.name}</td><td>${b.achievement}%</td><td>${formatNumber(b.totalActual||0)}</td><td>${formatNumber(b.totalTarget||0)}</td><td>${formatNumber(b.gap||0)}</td></tr>`
    ).join('')
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1"><tr><th>Branch</th><th>Achievement %</th><th>Actual</th><th>Target</th><th>Gap</th></tr>${dataRows}</table></body></html>`
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-${reportType}-${today}.xls`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel exported')
  }

  const exportReportPack = () => {
    const lines = ['PHARMAPULSE SUPERVISOR REPORT PACK', `Generated: ${today}`, `Range: ${dateRange.from} to ${dateRange.to}`, '']
    lines.push('=== SUMMARY ===')
    lines.push(`Overall Achievement: ${overallAch}%`)
    lines.push(`Total Entries: ${rangeEntries.length}`)
    lines.push(`Active Branches: ${branchSummary.filter((b) => b.entryCount > 0).length}`)
    lines.push('')
    lines.push('=== BRANCH RANKING ===')
    lines.push('Rank,Branch,Achievement%,Actual,Target,Gap')
    branchSummary.forEach((b, i) => {
      lines.push(`${i + 1},${b.name},${b.achievement}%,${b.totalActual||0},${b.totalTarget||0},${b.gap||0}`)
    })
    lines.push('')
    lines.push('=== TOP 5 BRANCHES ===')
    branchSummary.slice(0, 5).forEach((b, i) => lines.push(`${i + 1},${b.name},${b.achievement}%`))
    lines.push('')
    lines.push('=== BOTTOM 5 BRANCHES ===')
    ;[...branchSummary].slice(-5).reverse().forEach((b, i) => lines.push(`${i + 1},${b.name},${b.achievement}%`))
    lines.push('')
    lines.push('=== MTD TREND ===')
    lines.push('Current MTD,Previous MTD,Difference,Trend')
    lines.push(`${mtdTrend.currTotal},${mtdTrend.prevTotal},${mtdTrend.diff},${mtdTrend.trend}`)
    lines.push('')
    lines.push('=== GAP ANALYSIS ===')
    lines.push('Branch,Gap')
    branchSummary.filter((b) => (b.gap||0) > 0)
      .sort((a, b) => (b.gap||0) - (a.gap||0))
      .forEach((b) => lines.push(`${b.name},${b.gap||0}`))
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-report-pack-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Report pack exported')
  }

  const STAT_STYLE = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '12px 16px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  }

  // ── Scope guards — Phase 2F-2 ─────────────────────────────────
  if (scopeLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading reports…
      </div>
    )
  }
  if (scopeError || scope?.type === 'none') {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          padding: '16px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          color: '#ef4444', fontSize: '13px',
        }}>
          Access denied. You do not have permission to view reports.
        </div>
      </div>
    )
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
          <button onClick={exportExcel}
            style={{ height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'5px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
            <FileSpreadsheet style={{ width:13, height:13 }} /> Excel
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

        {/* Branch selector — shown for all/list scope types (Phase 2F-2) */}
        {(scope?.type === 'all' || scope?.type === 'list') && (
          <select value={selectedBranch ?? 'all'} onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ height:'34px', fontSize:'12px', minWidth:'140px' }}>
            <option value="all">{scope?.type === 'list' ? 'All My Branches' : 'All Branches'}</option>
            {allowedPharmacies.filter((p) => p.active !== false).map((p) => (
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
          { label:'Active Branches', value: branchSummary.length > 0 ? branchSummary.filter((b) => b.entryCount > 0).length : '—', color:'#6366f1' },
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
              {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* KPI achievement summary */}
      <div style={{ ...STAT_STYLE, padding:'16px' }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          KPI Achievement — {useCustom ? 'Custom range' : REPORT_TYPES.find((r) => r.id === reportType)?.label}
        </div>
        {(loading || fetchLoading) ? (
          <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'12px' }}>Loading...</div>
        ) : fetchError ? (
          <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'#f87171', fontSize:'12px' }}>
            Failed to load data — {fetchError}
          </div>
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
                    {formatNumber(total)}
                  </div>
                </div>
              )
            })}

            {/* ── Pilot KPI Report Section ───────────────────────────
                Pilot KPIs appear separately. Not included in weighted
                score, evaluation contribution, or ranking.         */}
            {PILOT_KPI_FIELDS.length > 0 && (
              <>
                <PilotKpiSectionHeader style={{ margin: '8px 0 4px' }} />
                {PILOT_KPI_FIELDS.map(({ key, registryKey, targetKey, label, labelAr }) => {
                  const total = rangeEntries.reduce(
                    (s, e) => s + (Number(e.kpiValues?.[registryKey] ?? e[key]) || 0), 0
                  )
                  const tgt = targets.reduce((s, t) => s + (Number(t[targetKey]) || 0), 0)
                  const ach = tgt > 0 ? Math.round((total / tgt) * 100) : 0
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center', gap:'10px', opacity:0.9 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'5px', width:'90px', flexShrink:0 }}>
                        <div style={{ width:6, height:6, borderRadius:'50%', background:'rgba(245,158,11,0.6)', flexShrink:0 }} />
                        <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{labelAr || label}</span>
                      </div>
                      <div style={{ flex:1, height:'5px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'99px', background:'rgba(245,158,11,0.5)', width:`${Math.min(ach, 100)}%`, transition:'width 0.6s ease' }} />
                      </div>
                      <div style={{ width:'36px', textAlign:'left', fontSize:'11px', fontWeight:600, fontVariantNumeric:'tabular-nums', color:'#b45309' }}>
                        {tgt > 0 ? `${ach}%` : '—'}
                      </div>
                      <div style={{ width:'60px', textAlign:'left', fontSize:'10px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                        {formatNumber(total)}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* 14-day trend */}
      <div style={{ ...STAT_STYLE, padding:'16px' }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
          14-Day Entry Volume
        </div>
        {(loading || fetchLoading) ? <SkeletonChart height={160} /> : (
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
      {branchSummary.length > 0 && (
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

      {/* ── Territory Summary Card — list scope only ──────────── */}
      {territorySummary && (
        <div style={{ ...STAT_STYLE, padding:'16px' }} className="animate-fade-in">
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Territory Summary
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-5">
            {[
              { label:'Branches',        value: territorySummary.count,                  color:'#6366f1' },
              { label:'Avg Achievement', value: `${territorySummary.avgAchievement}%`,   color: TRAFFIC_COLORS[getTrafficLight(territorySummary.avgAchievement, dp.ratio)]?.color || 'var(--brand-400)' },
              { label:'Best Branch',     value: territorySummary.bestBranch?.name || '—', color:'#22c55e' },
              { label:'Worst Branch',    value: territorySummary.worstBranch?.name || '—', color:'#ef4444' },
              { label:'Total Gap',       value: formatNumber(territorySummary.totalGap), color:'#f59e0b' },
            ].map((s) => (
              <div key={s.label} style={{ background:'var(--bg-overlay)', borderRadius:'8px', padding:'10px 12px' }}>
                <div style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'4px', fontFamily:"'Inter',sans-serif" }}>{s.label}</div>
                <div style={{ fontSize:'13px', fontWeight:600, color: s.color, fontVariantNumeric:'tabular-nums', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top / Bottom 5 Branches — multi-branch only ──────── */}
      {branchSummary.length > 1 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
          <div style={{ ...STAT_STYLE, padding:'14px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'#22c55e', marginBottom:'10px', fontFamily:"'Inter',sans-serif" }}>
              Top 5 Branches
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {branchSummary.slice(0, 5).map((b, i) => (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontSize:'10px', color:'#22c55e', width:'14px', flexShrink:0, fontWeight:600 }}>{i + 1}</span>
                  <span style={{ flex:1, fontSize:'11px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.name}</span>
                  <span style={{ fontSize:'11px', fontWeight:600, color:'#22c55e', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{b.achievement}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...STAT_STYLE, padding:'14px' }}>
            <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'#ef4444', marginBottom:'10px', fontFamily:"'Inter',sans-serif" }}>
              Bottom 5 Branches
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {[...branchSummary].slice(-5).reverse().map((b, i) => (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontSize:'10px', color:'#ef4444', width:'14px', flexShrink:0, fontWeight:600 }}>{i + 1}</span>
                  <span style={{ flex:1, fontSize:'11px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.name}</span>
                  <span style={{ fontSize:'11px', fontWeight:600, color:'#ef4444', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{b.achievement}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Branch Comparison Table — scope-aware, sorted desc ── */}
      {branchSummary.length > 0 && (
        <div style={{ ...STAT_STYLE, padding:'16px' }}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Branch Comparison
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  {['#', 'Branch', 'Achievement %', 'Actual', 'Target', 'Gap'].map((h) => (
                    <th key={h} style={{ padding:'4px 8px', textAlign:'left', fontSize:'9px', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', fontFamily:"'Inter',sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branchSummary.map((b, idx) => {
                  const cfg = TRAFFIC_COLORS[getTrafficLight(b.achievement, dp.ratio)]
                  return (
                    <tr key={b.id} style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                      <td style={{ padding:'5px 8px', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums', width:'24px' }}>{idx + 1}</td>
                      <td style={{ padding:'5px 8px', color:'var(--text-primary)', fontWeight:500 }}>{b.name}</td>
                      <td style={{ padding:'5px 8px', color: cfg.color, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{b.achievement}%</td>
                      <td style={{ padding:'5px 8px', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums' }}>{formatNumber(b.totalActual||0)}</td>
                      <td style={{ padding:'5px 8px', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums' }}>{formatNumber(b.totalTarget||0)}</td>
                      <td style={{ padding:'5px 8px', color:(b.gap||0) > 0 ? '#f59e0b' : 'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>{formatNumber(b.gap||0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MTD Trend Analysis ─────────────────────────────────── */}
      {(mtdTrend.currTotal > 0 || mtdTrend.prevTotal > 0) && (
        <div style={{ ...STAT_STYLE, padding:'16px' }}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            MTD Trend Analysis
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-4">
            {[
              { label:'Current MTD',                       value: formatNumber(mtdTrend.currTotal),  color:'var(--brand-400)' },
              { label:`Previous MTD (${mtdTrend.prevMonth})`, value: formatNumber(mtdTrend.prevTotal), color:'var(--text-secondary)' },
              { label:'Difference', value: (mtdTrend.diff >= 0 ? '+' : '') + formatNumber(mtdTrend.diff), color: mtdTrend.diff >= 0 ? '#22c55e' : '#ef4444' },
              { label:'Trend',      value: mtdTrend.trend === 'improving' ? '▲ Improving' : mtdTrend.trend === 'declining' ? '▼ Declining' : '— Neutral', color: mtdTrend.trend === 'improving' ? '#22c55e' : mtdTrend.trend === 'declining' ? '#ef4444' : 'var(--text-muted)' },
            ].map((s) => (
              <div key={s.label} style={{ background:'var(--bg-overlay)', borderRadius:'8px', padding:'10px 12px' }}>
                <div style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'4px', fontFamily:"'Inter',sans-serif" }}>{s.label}</div>
                <div style={{ fontSize:'14px', fontWeight:600, color: s.color, fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Export Center ──────────────────────────────────────── */}
      <div style={{ ...STAT_STYLE, padding:'14px' }}>
        <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'10px', fontFamily:"'Inter',sans-serif" }}>
          Export Center
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          <button onClick={exportCSV}
            style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'5px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
            <Download style={{ width:13, height:13 }} /> CSV
          </button>
          <button onClick={exportExcel}
            style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'5px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
            <FileSpreadsheet style={{ width:13, height:13 }} /> Excel
          </button>
          <button onClick={() => toast.info('PDF export — coming soon')}
            style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'5px', opacity:0.6 }}>
            <FileText style={{ width:13, height:13 }} /> PDF
          </button>
          {branchSummary.length > 0 && (
            <button onClick={exportReportPack}
              style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.25)', color:'#818cf8', display:'flex', alignItems:'center', gap:'5px' }}
              onMouseEnter={(e) => { e.currentTarget.style.background='rgba(99,102,241,0.15)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background='rgba(99,102,241,0.08)' }}>
              <FileText style={{ width:13, height:13 }} /> Report Pack
            </button>
          )}
        </div>
      </div>

      {rangeEntries.length === 0 && !loading && !fetchLoading && !fetchError && (
        <EmptyState icon={FileText}
          title="No entries for this period"
          description="Enter KPI data or adjust the date range" />
      )}
    </div>
  )
}
