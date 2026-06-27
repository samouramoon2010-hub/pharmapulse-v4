// ============================================================
// Dashboard v4 — Traffic Light + Run Rate + Daily Mission
// + Card Customization + Role-aware content
// ============================================================
import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Target, TrendingUp, TrendingDown, Users, Activity,
  Award, RefreshCw, Calendar, AlertTriangle, Star, ClipboardList,
} from 'lucide-react'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useScopeProfile }         from '../../hooks/useScopeProfile'
import { filterAllowedPharmacies } from '../../services/scopeResolver'
import {
  SkeletonStatCard, SkeletonChart,
} from '../../components/ui/SkeletonCard'
import {
  EmptyTodayEntries, EmptyNoForecast, ErrorState,
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

// Team Intelligence Layer
import { generateTeamIntelligence } from '../../engine/teamIntelligence'
import TeamIntelligenceCard from '../../components/ui/TeamIntelligenceCard'

// Live Analytics Layer
import {
  generateLiveAnalytics, buildLiveInput,
} from '../../engine/liveAnalytics'
import { subscribeKpiRegistry }                              from '../../services/kpiRegistryService'
import { getUsersByPharmacy }                                from '../../services/userService'
import { subscribePublishedPersonalTargetsByBranch }        from '../../services/personalTargetService'
import { mergeRemoteRegistryWithDefaults }                   from '../../services/kpiRegistryLogic'
import { getKpisForSurface }                                  from '../../engine/kpiRegistry'
import { DEFAULT_KPI_REGISTRY, getTargetFieldName }          from '../../engine/kpiRegistry'
import { getPilotTrackingKpis }                              from '../../engine/kpiRegistry/kpiMetaResolver'
// Controlled Cutover Phase 2 — Production Reader Pilot (Dashboard surface)
import { buildPilotPolicy, readPilotActual, readPilotTarget } from '../../engine/kpiRegistry/dynamicReaderPilot'
import TrackingOnlyBadge, { PilotKpiSectionHeader }          from '../../components/ui/TrackingOnlyBadge'
import DailyMissionPanel from '../../components/dashboard/DailyMissionPanel'
import DailyMissionHero from '../../components/dashboard/DailyMissionHero'
import KpiDistributionDonut from '../../components/dashboard/KpiDistributionDonut'
import TopAlertsPanel from '../../components/dashboard/TopAlertsPanel'
import KpiHealthHeatmap from '../../components/dashboard/KpiHealthHeatmap'
import ActivityFeedPanel from '../../components/dashboard/ActivityFeedPanel'
import ExecutiveSummaryPanel from '../../components/executive/ExecutiveSummaryPanel'
import {
  KPI_STATUS_BADGE, enterpriseStatusColor,
  getKpiColor,
}                                                              from '../../components/kpi/kpiVisualHelpers'
import KpiCard from '../../components/kpi/KpiCard'
import { formatNumber } from '../../utils/helpers'

// (color fallback uses getKpiColor from kpiVisualHelpers — Phase 4D-B migration)

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

// ── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()
  const {
    entries, subscribePharmacyEntries,
    subscribeRecentEntries,
    targets, subscribeMyTargets, subscribeRecentTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subscribePh } = usePharmacyStore()

  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState(false)
  const [tick,        setTick]        = useState(0)

  const role       = userProfile?.role
  // uid resolution: userProfile.uid (explicit field) OR userProfile.id (Firestore doc id = Auth uid).
  // _fetchProfile returns { id: snap.id, ...snap.data() } — the doc may not have a 'uid' field
  // in the data(), but snap.id is always the Firebase Auth UID. Use both for safety.
  const uid        = userProfile?.uid ?? userProfile?.id
  const pharmacyId = userProfile?.pharmacyId

  // ── Phase 2G-1: Scope Resolver ───────────────────────────────
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()
  const allowedPharmacies = useMemo(() => {
    if (!scope) return []
    return filterAllowedPharmacies(scope, pharmacies)
  }, [scope, pharmacies])

  useEffect(() => {
    if (!scope) return
    setFetchError(false)
    const uns = []
    try {
      uns.push(subscribePh())
      if (scope.type === 'all' || scope.type === 'list') {
        uns.push(subscribeRecentEntries())
        uns.push(subscribeRecentTargets())
      } else if (scope.type === 'single') {
        uns.push(subscribePharmacyEntries(scope.id))
        uns.push(subscribeMyTargets(scope.id))
      }
      // scope.type === 'none': no subscriptions
    } catch (e) {
      console.error('[Dashboard] Subscription error:', e)
      setFetchError(true)
      setLoading(false)
    }
    const t = setTimeout(() => setLoading(false), 500)
    return () => { uns.forEach((u) => u?.()); clearTimeout(t) }
  }, [scope, tick])

  const today      = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonth  = format(new Date(), 'yyyy-MM')
  // daysPassed, totalDays, dayRatio now come from Engine V1 dp above

  const myEntries = useMemo(() => {
    if (!scope) return []
    if (scope.type === 'all') return entries
    const allowedIds = new Set(allowedPharmacies.map((p) => p.id))
    return entries.filter((e) => allowedIds.has(e.pharmacyId))
  }, [entries, scope, allowedPharmacies])

  // ── Date guards ───────────────────────────────────────────────
  // monthCeiling = min(today, monthEnd).
  // Real pharmacists never submit future-dated entries, so this guard is
  // a no-op in production. For demo data (which pre-seeds entries for dates
  // that have not yet passed), it prevents future entries from inflating:
  //   - kpiStats.actual (→ overallAch, Branch Health)
  //   - forecastMap currentDailyRate (→ Forecast EOM)
  // Using today <= monthEnd avoids a redundant comparison; we just clamp.
  const monthCeiling = today <= monthEnd ? today : monthEnd

  const todayEntries  = useMemo(() => myEntries.filter((e) => e.date === today),           [myEntries, today])
  const monthEntries  = useMemo(() => myEntries.filter((e) => e.date >= monthStart && e.date <= monthCeiling), [myEntries, monthStart, monthCeiling])


  // ── Target lookup — admin aggregates across all branches ─────
  // Admin has no pharmacyId, so targets.find(t => t.pharmacyId === undefined) never matches.
  // Fix: for admin, sum all current-month targets across all pharmacies (mirrors ReportsPage).
  // For manager/pharmacist: find the single target for their pharmacy (existing behavior).
  const currentTarget = useMemo(() => {
    if (!targets.length) return undefined

    // all scope (admin / GM): aggregate all pharmacy targets for this month
    if (scope?.type === 'all') {
      const monthTargets = targets.filter((t) => t.month === thisMonth)
      if (!monthTargets.length) return undefined
      const aggregated = { pharmacyId: 'all', month: thisMonth }
      for (const t of monthTargets) {
        for (const [k, v] of Object.entries(t)) {
          if (!k.endsWith('Target')) continue
          aggregated[k] = (aggregated[k] || 0) + (Number(v) || 0)
        }
      }
      return aggregated
    }

    // list scope (district_supervisor / regional_manager): aggregate assigned branches
    if (scope?.type === 'list') {
      const ids = new Set(scope.ids ?? [])
      const monthTargets = targets.filter((t) => t.month === thisMonth && ids.has(t.pharmacyId))
      if (!monthTargets.length) return undefined
      const aggregated = { pharmacyId: 'list', month: thisMonth }
      for (const t of monthTargets) {
        for (const [k, v] of Object.entries(t)) {
          if (!k.endsWith('Target')) continue
          aggregated[k] = (aggregated[k] || 0) + (Number(v) || 0)
        }
      }
      return aggregated
    }

    // single scope (manager / branch_manager / pharmacist): own pharmacy target
    if (scope?.type === 'single') {
      return targets.find((t) => t.pharmacyId === scope.id && t.month === thisMonth)
    }

    return undefined
  }, [targets, scope, thisMonth])

  // ── Live Registry-driven KPI list ──────────────────────────
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [pharmacyUserMap, setPharmacyUserMap] = useState(null)
  // userId → PersonalTargetDoc for published personal targets this month.
  // Mirrors TeamPage.jsx Sprint B3 pattern so dashboard team intelligence
  // uses correct per-member targets before B1 pace calculations.
  const [personalTargetMap, setPersonalTargetMap] = useState(new Map())

  useEffect(() => {
    if (!pharmacyId) return
    getUsersByPharmacy(pharmacyId)
      .then((users) => {
        const map = new Map()
        users.forEach((u) => map.set(u.id, u.displayName || 'Unknown User'))
        setPharmacyUserMap(map)
      })
      .catch(() => {})
  }, [pharmacyId])

  // Subscribe to published personal targets for team intelligence.
  // Only for managers/admins with a known pharmacyId.
  const currentMonthForPT = format(new Date(), 'yyyy-MM')
  useEffect(() => {
    if (!pharmacyId) { setPersonalTargetMap(new Map()); return }
    const unsub = subscribePublishedPersonalTargetsByBranch(
      pharmacyId, currentMonthForPT,
      (docs) => {
        const map = new Map()
        docs.forEach((d) => map.set(d.userId, d))
        setPersonalTargetMap(map)
      }
    )
    return () => unsub()
  }, [pharmacyId, currentMonthForPT])

  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // KPI configs for dashboard — production_evaluation KPIs only.
  // Filter separates production KPIs from pilot KPIs (pilot section rendered separately).
  // SAFETY: if lifecycleStage is undefined (pre-Milestone-3 Firestore docs), treat as
  //         production_evaluation — do not silently drop KPIs with missing field.
  const registryKpis = useMemo(() => {
    return getKpisForSurface(liveRegistry, 'dashboardEnabled')
      .filter((kpi) => (kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation')
  }, [liveRegistry])

  // Pilot KPIs for dashboard — tracked but not evaluated
  const pilotKpis = useMemo(() => getPilotTrackingKpis(liveRegistry), [liveRegistry])

  // Engine keys only — for reading from kpi_entries
  const KPI_KEYS = useMemo(
    () => registryKpis.map(cfg => cfg.aliasFor ?? cfg.key),
    [registryKpis]
  )
  // ── KPI Engine V1 — per-KPI stats ────────────────────────────
  // dp must NOT be memoized with [] — a stale currentDay causes
  // forecastEOM = (actual / 1) * totalDays which inflates all KPIs
  // to the 200% ACHIEVEMENT_CAP. getDayProgress() is pure and <1ms.
  const dp = getDayProgress()
  // alias kept for chart/widget code below
  const daysPassed = dp.currentDay
  const totalDays  = dp.totalDays
  const dayRatio   = dp.ratio

  // Controlled Cutover Phase 2 — pilot policy decides, per pilot KPI
  // (Smart List/sl, NDF, Wellness Card, OmniHealth, Sales), whether the
  // Dynamic Reader is safe to use as the source. Built from a single real
  // entry+target sample already loaded above — never fabricated. When no
  // sample exists yet, every pilot KPI safely defaults to the Legacy Reader.
  const pilotPolicy = useMemo(
    () => buildPilotPolicy(monthEntries[0] ?? null, currentTarget, liveRegistry),
    [monthEntries, currentTarget, liveRegistry],
  )

  const kpiStats = useMemo(() => {
    const map = {}
    KPI_KEYS.forEach((engineKey) => {
      // Find registry config for this engine key (handles aliases)
      const cfg = registryKpis.find(c => (c.aliasFor ?? c.key) === engineKey)
      const actual = monthEntries.reduce(
        (s, e) => s + readPilotActual(e, engineKey, liveRegistry, pilotPolicy),
        0,
      )
      // Use targetFieldName from registry for dynamic target fields, fall back to engine
      const targetField = cfg ? getTargetFieldName(cfg.key) : null
      const target = currentTarget
        ? readPilotTarget(currentTarget, engineKey, liveRegistry, pilotPolicy, () =>
            targetField && (currentTarget[targetField] != null)
              ? (Number(currentTarget[targetField]) || 0)
              : getTargetForKpi(currentTarget, engineKey))
        : 0
      const stats = computeKpiStats(actual, target, dp, engineKey)
      map[engineKey] = {
        ...stats,
        achPct: stats.achievementPct,
        colors: TRAFFIC_COLORS[stats.status],
        // attach registry metadata for rendering
        _label: cfg?.shortLabel ?? engineKey,
        _color: cfg?.defaultColor ?? getKpiColor(engineKey),
      }
    })
    return map
  }, [monthEntries, currentTarget, dp, KPI_KEYS, registryKpis, liveRegistry, pilotPolicy])

  // Today totals (unchanged — used by bar chart)
  const todayTotals = useMemo(() =>
    KPI_KEYS.reduce((acc, k) => {
      acc[k] = todayEntries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      return acc
    }, {}),
    [todayEntries, KPI_KEYS]
  )

  // ── Engine V1 — overall achievement (weighted) ────────────────
  const overallAch = useMemo(() => {
    const ach = computeOverallAchievement(kpiStats, undefined, import.meta.env.DEV)
    if (import.meta.env.DEV) {
      const keys = Object.keys(kpiStats)
      const lines = keys.map(k => {
        const s = kpiStats[k]
        return s ? `  ${k}: actual=${s.actual} target=${s.target} ach=${s.achievementPct}% capped=${Math.min(s.achievementPct, 200)}%` : `  ${k}: missing`
      }).join('\n')
      console.debug('[DASHBOARD_ACH] overall=' + ach + '%\n' + lines)
      // [AUDIT LOG] Date guard state
      if (import.meta.env.DEV) {
        console.log('[AUDIT] date_guards', {
          today,
          monthStart,
          monthEnd,
          monthCeiling,
          monthEntriesCount: monthEntries.length,
          myEntriesCount: myEntries.length,
        })
        const ws = kpiStats['wasfaty']
        console.log('[AUDIT] wasfaty_kpiStats', {
          wasfatyActual: ws?.actual,
          wasfatyTarget: ws?.target,
          achievementPct: ws?.achievementPct,
          // forecastAchPct logged after forecastMap is initialised (see below)
        })
      }
    }
    return ach
  },
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
      // Build sorted daily values for history-aware recovery probability.
      // Must use monthEntries (not myEntries) — myEntries has no date filter
      // and spans all historical months, inflating historicalMax/Avg.
      const sorted = [...monthEntries]
        .sort((a, b) => a.date.localeCompare(b.date))
      const dailyVals = sorted.map((e) => Number(e[k]) || 0)
      map[k] = computeForecast(actual, target, dp, dailyVals)
    })
    return map
  // dp is no longer in the dep array — it is computed fresh every render,
  // so the closure always sees the current getDayProgress() result.
  }, [kpiStats, monthEntries])

  // [AUDIT LOG] forecastAchPct — placed here so forecastMap is in scope
  if (import.meta.env.DEV && forecastMap) {
    console.log('[AUDIT] wasfaty_forecastAchPct', forecastMap?.wasfaty?.forecastAchPct)
  }

  // ── Engine V1 — daily mission ─────────────────────────────────
  const mission = useMemo(() => {
    // Build paceMap for mission difficulty classification
    return buildDailyMission(kpiStats, paceMap)
  }, [kpiStats, paceMap])

  // ── Daily Mission Hero (UI3.1-C) — reshapes the already-computed
  // kpiStats/paceMap into the item shape DailyMissionPanel.jsx (an
  // existing, previously-unwired component from a prior bundle)
  // already expects. No new calculation — pure data reshaping. ───
  const missionItems = useMemo(() => {
    return KPI_KEYS
      .filter((k) => kpiStats[k]?.actual != null)
      .map((k) => ({
        name: kpiStats[k]?._label ?? k,
        value: kpiStats[k]?.actual ?? null,
        target: kpiStats[k]?.target ?? 0,
        achievement: kpiStats[k]?.achievementPct ?? null,
        gap: kpiStats[k]?.remainingToTarget ?? null,
        requiredDailyPace: paceMap?.[k]?.requiredDailyPace ?? null,
      }))
  }, [kpiStats, paceMap])

  // ── Portfolio-level projected finish (UI3.2-B/D) — same formula
  // already used by the command header's "Forecast" card
  // (reuses computeOverallAchievement, no new calculation logic).
  // Hoisted here so the hero and analytics row can share it. ──────
  const projectedFinishPct = useMemo(() => {
    if (!forecastMap || !KPI_KEYS.some((k) => forecastMap[k])) return 0
    const forecastStatsMap = Object.fromEntries(
      KPI_KEYS
        .filter((k) => (kpiStats[k]?.target ?? 0) > 0)
        .map((k) => [k, {
          achievementPct: forecastMap[k]?.forecastAchPct ?? 0,
          target: kpiStats[k]?.target ?? 0,
        }])
    )
    return computeOverallAchievement(forecastStatsMap)
  }, [forecastMap, kpiStats])

  // ── KPI distribution buckets (UI3.2-D) — groups the already-
  // computed kpiStats[k].status into On Track / Behind Pace /
  // At Risk / No Data counts. Pure grouping, no new scoring. ──────
  const kpiDistributionCounts = useMemo(() => {
    const counts = { onTrack: 0, behindPace: 0, atRisk: 0, noData: 0 }
    for (const k of KPI_KEYS) {
      const s = kpiStats[k]
      if (s?.actual == null) { counts.noData += 1; continue }
      if (s.status === 'excellent' || s.status === 'good') counts.onTrack += 1
      else if (s.status === 'warning') counts.behindPace += 1
      else counts.atRisk += 1
    }
    return counts
  }, [kpiStats])

  // Ref to store previous alerts for cooldown checking
  const prevAlertsRef = React.useRef([])

  // ── Live Analytics Layer ─────────────────────────────────────
  const liveAnalytics = useMemo(() => {
    if (loading || !uid) return null
    try {
      const input = buildLiveInput(
        uid,
        pharmacyId || 'all',
        pharmacies.find((p) => p.id === pharmacyId)?.name || 'Portfolio',
        role,
        myEntries,
        currentTarget,
      )
      const result = generateLiveAnalytics(input, prevAlertsRef.current)
      // Store alerts for next render's cooldown check
      prevAlertsRef.current = result.alerts.slice(0, 20)
      return result
    } catch (e) {
      console.warn('[Dashboard] Live analytics error:', e)
      return null
    }
  }, [uid, pharmacyId, role, myEntries, currentTarget, loading, pharmacies])

  // ── Team Intelligence (single/list scope, no extra Firestore reads) ──
  const teamIntelligence = useMemo(() => {
    if (loading) return null
    // single scope: team intelligence for own branch
    // list scope: team intelligence for first assigned branch
    // all / none: not applicable on dashboard (Exec BI handles multi-branch view)
    let teamPharmacyId = null
    if (scope?.type === 'single') {
      teamPharmacyId = scope.id
    } else if (scope?.type === 'list') {
      teamPharmacyId = allowedPharmacies[0]?.id ?? null
    }
    if (!teamPharmacyId) return null

    try {
      const currentMonth = format(new Date(), 'yyyy-MM')

      // Filter to the team pharmacy — for list scope, myEntries spans all branches
      const branchEntries = myEntries.filter((e) => e.pharmacyId === teamPharmacyId)

      // Group entries by userId — data already loaded, zero extra reads
      const pharmacistMap = {}
      branchEntries.forEach(e => {
        if (!pharmacistMap[e.userId]) pharmacistMap[e.userId] = []
        pharmacistMap[e.userId].push(e)
      })

      const pharmacistInputs = Object.entries(pharmacistMap).map(([userId, userEntries]) => {
        const distinctDays = new Set(userEntries.map(e => e.date)).size
        return {
          userId,
          displayName: pharmacyUserMap?.get(userId) ?? userId,
          pharmacyId:  teamPharmacyId,
          mtdEntries:  userEntries,
          historicalEntries: userEntries,
          target:      currentTarget,
          // PT-2: pass published personal target — mirrors TeamPage Sprint B3.
          personalTarget: personalTargetMap.get(userId) ?? null,
          expectedSubmissionDays: dp?.currentDay ?? 15,
          actualSubmissionDays:   distinctDays,
        }
      })

      if (!pharmacistInputs.length) return null

      return generateTeamIntelligence({ pharmacyId: teamPharmacyId, month: currentMonth, pharmacists: pharmacistInputs })
    } catch (e) {
      console.warn('[Dashboard] Team intelligence error:', e)
      return null
    }
  // pharmacyUserMap: names resolve async — must be a dep so intelligence
  //   recomputes with real names instead of raw userIds.
  // personalTargetMap: per-member targets resolve async — required for
  //   correct performance scores and B1 pace calculations.
  }, [scope, allowedPharmacies, myEntries, currentTarget, loading,
      pharmacyUserMap, personalTargetMap])

  // 14-day trend
  // STB-04 fix: trendData is now registry-driven.
  // KPI_KEYS is derived from the live registry (registryKpis → aliasFor ?? key),
  // so custom KPIs appear automatically and removed KPIs disappear.
  const trendData = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const date  = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
    const label = format(subDays(new Date(), 13 - i), 'dd/MM')
    const de    = myEntries.filter((e) => e.date === date)
    const point = { date: label }
    KPI_KEYS.forEach((k) => {
      point[k] = de.reduce((s, e) => s + (Number(e[k]) || 0), 0)
    })
    return point
  }), [myEntries, KPI_KEYS])

  // Branch ranking (all / list scope — hidden for single)
  const branchRanking = useMemo(() => {
    if (!scope || scope.type === 'single' || scope.type === 'none') return []
    return allowedPharmacies.map((p) => {
      const be    = todayEntries.filter((e) => e.pharmacyId === p.id)
      const total = be.reduce((s, e) => KPI_KEYS.reduce((ss, k) => ss + (e[k]||0), s), 0)
      return { ...p, total }
    }).sort((a, z) => z.total - a.total).slice(0, 8)
  }, [scope, allowedPharmacies, todayEntries, KPI_KEYS])

  // Stat card builder
  // ── Enterprise Status Color System ────────────────────────────
  // 5-tier system, replacing "Neon Green Fatigue" where every KPI >=100%
  // (144%, 178%, 200%) used the same bright #22c55e at full opacity.
  //
  //   Critical          → red     (#ef4444) — severe underperformance
  //   Behind Pace       → amber   (#f59e0b/#f97316) — needs intervention
  //   On Pace           → cyan    (#00d2ad) — healthy trajectory
  //   Exceeding Pace    → green   (#22c55e) — above pace, NOT YET at 100% target
  //   Target Achieved   → muted grey-green (#6b9c84) — done, de-emphasized
  //
  // (KPI_STATUS_BADGE, kpiBadge, enterpriseStatusColor, kpiVsExpected now
  // imported from ../../components/kpi/kpiVisualHelpers — Phase 5A extraction.
  // Call sites below pass explicit kpiStats[k]/paceMap[k]/expectedPct params.)

  // ── Scope loading guard ──────────────────────────────────────
  if (scopeLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading dashboard…
      </div>
    )
  }

  // ── Scope access guard ───────────────────────────────────────
  if (scopeError || scope?.type === 'none') {
    return (
      <div style={{ maxWidth:'480px', margin:'80px auto 0', padding:'0 16px' }}>
        <div style={{
          padding: '24px', borderRadius: '12px',
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171', fontSize: '14px', textAlign: 'center',
        }}>
          Access denied. You do not have permission to view this dashboard.
        </div>
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

      {/* ── Daily Mission Hero — UI3.2-B ───────────────────────
          Strong premium hero per the locked reference image: headline,
          action statement, required-today, critical drifts, projected
          finish, month progress. All values pre-computed above
          (mission/dayRatio/criticalCount/projectedFinishPct) — no new
          calculations live in DailyMissionHero itself.
      ─────────────────────────────────────────────────────── */}
      {!loading && mission && (
        <div style={{ marginBottom: '16px' }}>
          <DailyMissionHero
            mission={mission}
            dayRatio={dayRatio}
            criticalCount={liveAnalytics?.kpiHealth?.filter((h) => h.state === 'critical').length ?? 0}
            projectedFinishPct={projectedFinishPct}
          />
        </div>
      )}

      {/* ── Executive Hero Section ─────────────────────────────
          Phase 1A: Command Center header.
          Data: pharmacy name/code, overallAch, forecastMap, teamIntelligence, riskLevel.
          No new calculations — pure presentation layer over existing memoized values.
      ─────────────────────────────────────────────────────── */}
      {!loading && (() => {
        const currentPharmacy = pharmacies.find((p) => p.id === pharmacyId)
        const pharmName  = currentPharmacy?.name  ??
          (scope?.type === 'all' ? 'All Branches' : scope?.type === 'list' ? 'My Branches' : 'Branch')
        const pharmCode  = currentPharmacy?.code  ?? ''
        const monthLabel = format(new Date(), 'MMMM yyyy')

        // Forecast: weighted overall forecast using same KPI weights as branch health.
        // Building a pseudo-KpiStats map where achievementPct = forecastAchPct.
        // This reuses computeOverallAchievement — no new calculation logic.
        const forecastStatsMap = Object.fromEntries(
          KPI_KEYS
            .filter(k => (kpiStats[k]?.target ?? 0) > 0)
            .map(k => [k, {
              achievementPct: forecastMap[k]?.forecastAchPct ?? 0,
              target: kpiStats[k]?.target ?? 0,
            }])
        )
        const fcVal   = forecastMap && KPI_KEYS.some(k => forecastMap[k])
          ? computeOverallAchievement(forecastStatsMap)
          : 0
        const fcColors = TRAFFIC_COLORS[getTrafficLight(fcVal, 1)]

        // Team status
        // Admin: pharmacyId is undefined → teamIntelligence is null by design.
        //   Admin uses Executive BI for team intelligence, not the branch hero.
        // Manager: teamIntelligence is populated when entries have loaded.
        const teamStatus  = teamIntelligence?.teamHealth?.overallTeamStatus ?? null
        const teamScore   = teamIntelligence?.teamHealth?.teamPerformanceScore ?? null
        const memberCount = teamIntelligence?.teamHealth?.memberCount ?? 0
        // Derive a display-friendly team state for the hero card
        const teamHeroState = (scope?.type === 'all') ? 'admin'
          : !teamIntelligence ? 'loading'
          : 'ready'
        const TEAM_STATUS_CFG = {
          healthy:              { label: 'Healthy',       color: '#1a7a4a' },
          stable:               { label: 'Stable',        color: '#00d2ad' },
          needs_attention:      { label: 'Needs Attention', color: '#f59e0b' },
          critical_operation:   { label: 'Critical',      color: '#ef4444' },
        }
        const teamCfg = TEAM_STATUS_CFG[teamStatus] ?? { label: 'No Data', color: 'var(--text-muted)' }

        // Improved Team Status wording — computed here so no IIFE needed inside JSX
        const teamSummaries    = teamIntelligence?.pharmacistSummaries ?? []
        const teamAtRiskCount  = teamSummaries.filter(s => s.operationalRisk === 'high' || s.coachingPriority === 'immediate').length
        const teamOnTrackCount = teamSummaries.filter(s => s.operationalRisk === 'none' || s.operationalRisk === 'low').length
        const teamStatusWord   = teamAtRiskCount > 0
          ? (teamAtRiskCount >= teamSummaries.length * 0.5 ? 'Critical' : 'Attention Needed')
          : (teamScore !== null && teamScore >= 85 ? 'Excellent' : teamCfg.label)
        const teamStatusSub    = teamAtRiskCount > 0
          ? `${teamAtRiskCount} of ${memberCount} at risk`
          : `${teamOnTrackCount}/${memberCount} on track`
        const teamStatusColor  = teamAtRiskCount > 0 ? '#f59e0b' : teamCfg.color

        // Risk / rank label
        const RISK_CFG = {
          ON_TRACK:    { label: 'On Track',  color: '#1a7a4a' },
          LOW_RISK:    { label: 'Low Risk',  color: '#00d2ad' },
          MEDIUM_RISK: { label: 'Monitor',   color: '#f59e0b' },
          HIGH_RISK:   { label: 'At Risk',   color: '#ef4444' },
        }
        const rlCfg = RISK_CFG[riskLevel] ?? RISK_CFG.ON_TRACK

        // ── Today's Focus: three actionable pillars ──────────────────
        // Deterministic precedence: a member can only appear in ONE slot.
        // atRiskMemberIds takes priority over topPerformerIds to prevent
        // the same person appearing as both risk and opportunity.

        // Pillar 1 — Focus KPI: lowest-achievement KPI with remaining target
        const focusKpiKey   = weakestKpi
        const focusKpiStats = kpiStats[focusKpiKey]
        const focusPillar   = focusKpiStats?.target > 0 ? {
          Icon: TrendingDown, color: '#f59e0b',
          label: focusKpiStats._label ?? focusKpiKey,
          note:  `${focusKpiStats.achievementPct}% — needs ${formatNumber(focusKpiStats.remainingToTarget||0)} more`,
        } : null

        // Pillar 2 — Biggest Risk: member with highest-priority coaching need.
        // Exclude anyone who also appears in topPerformerIds (conflict guard).
        const topPerfSet    = new Set(teamIntelligence?.topPerformerIds ?? [])
        const riskCandidates = teamIntelligence?.atRiskMemberIds?.filter(uid => !topPerfSet.has(uid)) ?? []
        const riskUid       = riskCandidates[0] ?? null
        const riskPillar    = riskUid ? {
          Icon: AlertTriangle, color: '#ef4444',
          label: pharmacyUserMap?.get(riskUid) ?? 'Unknown User',
          note:  'needs immediate support',
        } : null

        // Pillar 3 — Best Opportunity: top performer who is NOT in atRiskMemberIds.
        const atRiskSet     = new Set(teamIntelligence?.atRiskMemberIds ?? [])
        const oppCandidates = teamIntelligence?.topPerformerIds?.filter(uid => !atRiskSet.has(uid)) ?? []
        const oppUid        = oppCandidates[0] ?? null
        const oppPillar     = oppUid ? {
          Icon: Star, color: '#1a7a4a',
          label: pharmacyUserMap?.get(oppUid) ?? 'Unknown User',
          note:  'top performer — leverage',
        } : null

        const priorities = [focusPillar, riskPillar, oppPillar].filter(Boolean)

        return (
          <div style={{
            marginBottom: '24px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
          }}>
            {/* ── Row 1: Identity bar ──
                PR-1E6 — this row's two clusters (name+metadata on the
                left, Month Progress+Refresh on the right) had no wrap
                and no minWidth:0, so together they didn't fit a 375px
                viewport (confirmed via real-browser measurement: this
                row's own scrollWidth exceeded its clientWidth by ~43px).
                flexWrap lets the right cluster drop to its own line
                below the name on narrow phones instead of overflowing. */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '10px',
              padding: '16px 20px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'linear-gradient(135deg, rgba(26,122,74,0.06) 0%, transparent 60%)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:'12px', minWidth: 0 }}>
                {/* Green command stripe */}
                <div style={{
                  width: '4px', height: '36px', borderRadius: '2px',
                  background: 'linear-gradient(180deg, #1a7a4a 0%, #0f5c36 100%)',
                  flexShrink: 0,
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: '18px', fontWeight: 700, lineHeight: 1.2,
                    color: 'var(--text-primary)', letterSpacing: '-0.01em',
                  }}>
                    {pharmName}
                    {pharmCode && (
                      <span style={{
                        fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)',
                        marginLeft: '8px', letterSpacing: '0.02em',
                      }}>
                        {pharmCode}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px', color: 'var(--text-muted)',
                    marginTop: '2px', display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap',
                  }}>
                    <span>{monthLabel}</span>
                    <span style={{ color:'var(--border-default)' }}>·</span>
                    <span>Day {daysPassed} of {totalDays}</span>
                    <span style={{ color:'var(--border-default)' }}>·</span>
                    <span style={{
                      fontSize:'10px', fontWeight:600, padding:'1px 7px',
                      borderRadius:'99px', letterSpacing:'0.04em',
                      background: `${overallColors.color}18`,
                      border: `1px solid ${overallColors.color}40`,
                      color: overallColors.color,
                    }}>
                      {overallColors.label}
                    </span>
                  </div>
                </div>
              </div>
              {/* Right cluster: Month Progress + Customize/Refresh (merged from old page-header) */}
              <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>
                    Month Progress
                  </div>
                  <div style={{
                    width: '120px', height: '4px',
                    background: 'var(--border-subtle)', borderRadius:'99px', overflow:'hidden',
                  }}>
                    <div style={{
                      height:'100%', borderRadius:'99px',
                      width: `${Math.round(dayRatio * 100)}%`,
                      background: 'linear-gradient(90deg, #1a7a4a, #22c55e)',
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                  <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'3px' }}>
                    {Math.round(dayRatio * 100)}% elapsed
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px' }}>
                  <button onClick={() => { setLoading(true); setTick((t) => t + 1) }}
                    style={{ height:'28px', padding:'0 9px', borderRadius:'6px', fontSize:'11px', fontWeight:500, background:'transparent', border:'1px solid transparent', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}
                    onMouseEnter={(e)=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-secondary)'}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)'}}>
                    <RefreshCw style={{width:12,height:12}}/> Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* ── Row 2: Executive KPI cards ──
                PR-1E6 — a fixed repeat(4,1fr) gave each card ~85px at a
                375px viewport after its own 18px*2 padding, too narrow
                for text like "On track to exceed target" (confirmed via
                real-browser measurement: this row's own scrollWidth
                exceeded its clientWidth by ~75px). The exec-kpi-row
                class reflows to 2x2 below sm — same 4 cards, same
                fields, just rearranged, per the locked mobile-blueprint
                rule of reflow-not-drop. */}
            <div className="exec-kpi-row" style={{
              display: 'grid',
              gap: '1px',
              background: 'var(--border-subtle)',
            }}>
              {/* Card 1: Branch Health + Target Gap */}
              {(() => {
                const expectedPct = Math.round(dayRatio * 100)
                const gapPts      = overallAch - expectedPct
                const bhColor     = enterpriseStatusColor(overallAch, expectedPct)
                const isAchievedBH = overallAch >= 100
                const gapLabel    = isAchievedBH
                  ? 'Target achieved'
                  : gapPts >= 0
                    ? `+${gapPts}pts ahead of pace`
                    : `${gapPts}pts behind pace`
                const gapColor    = isAchievedBH ? KPI_STATUS_BADGE.ACHIEVED.color
                  : gapPts >= 0 ? '#22c55e' : '#f59e0b'
                return (
                  <div style={{ background:'var(--bg-elevated)', padding:'16px 18px',
                                opacity: isAchievedBH ? 0.78 : 1, transition:'opacity 0.3s' }}>
                    <div style={{ fontSize:'10px', fontWeight:500, color:'var(--text-muted)',
                      textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px',
                      display:'flex', alignItems:'center', gap:'5px' }}>
                      <Target style={{ width:10, height:10 }} /> Branch Health
                    </div>
                    <div style={{
                      fontSize: '28px', fontWeight: 700, lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: bhColor,
                    }}>
                      {overallAch}<span style={{ fontSize:'14px', fontWeight:500, marginLeft:'2px' }}>%</span>
                    </div>
                    <div style={{ fontSize:'11px', color: gapColor, marginTop:'6px', fontWeight:500 }}>
                      {gapLabel}
                    </div>
                    <div style={{
                      marginTop:'8px', height:'2px', borderRadius:'99px',
                      background: 'var(--border-subtle)', overflow:'hidden',
                    }}>
                      <div style={{
                        height:'100%', borderRadius:'99px',
                        width:`${Math.min(overallAch,100)}%`,
                        background: bhColor,
                        transition:'width 0.8s ease',
                      }} />
                    </div>
                  </div>
                )
              })()}

              {/* Card 2: Forecast — enterprise color tier, muted when forecast >=100% */}
              {(() => {
                const expectedPct = Math.round(dayRatio * 100)
                const fcColor     = enterpriseStatusColor(fcVal, expectedPct)
                const isAchievedFC = fcVal >= 100
                return (
                  <div style={{ background:'var(--bg-elevated)', padding:'16px 18px',
                                opacity: isAchievedFC ? 0.78 : 1, transition:'opacity 0.3s' }}>
                    <div style={{ fontSize:'10px', fontWeight:500, color:'var(--text-muted)',
                      textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px',
                      display:'flex', alignItems:'center', gap:'5px' }}>
                      <TrendingUp style={{ width:10, height:10 }} /> Forecast EOM
                    </div>
                    <div style={{
                      fontSize: '28px', fontWeight: 700, lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: fcColor,
                    }}>
                      {fcVal}<span style={{ fontSize:'14px', fontWeight:500, marginLeft:'2px' }}>%</span>
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'6px' }}>
                      {isAchievedFC ? 'On track to exceed target' : 'Run-rate projection'}
                    </div>
                    <div style={{
                      marginTop:'8px', height:'2px', borderRadius:'99px',
                      background: 'var(--border-subtle)', overflow:'hidden',
                    }}>
                      <div style={{
                        height:'100%', borderRadius:'99px',
                        width:`${Math.min(fcVal,100)}%`,
                        background: fcColor,
                        transition:'width 0.8s ease',
                      }} />
                    </div>
                  </div>
                )
              })()}

              {/* Card 3: Team Status */}
              <div style={{ background:'var(--bg-elevated)', padding:'16px 18px' }}>
                <div style={{ fontSize:'10px', fontWeight:500, color:'var(--text-muted)',
                  textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px',
                  display:'flex', alignItems:'center', gap:'5px' }}>
                  <Users style={{ width:10, height:10 }} /> Team Status
                </div>
                {teamHeroState === 'ready' ? (
                  <>
                    <div style={{
                      fontSize: '20px', fontWeight: 700, lineHeight: 1.1,
                      color: teamStatusColor, marginTop:'2px',
                    }}>
                      {teamStatusWord}
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'6px' }}>
                      {teamStatusSub}
                    </div>
                  </>
                ) : teamHeroState === 'admin' ? (
                  <div style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'4px' }}>
                    See Exec BI
                  </div>
                ) : (
                  <div style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'4px', display:'flex', alignItems:'center', gap:'5px' }}>
                    <span style={{ opacity:0.6 }}>···</span> Loading
                  </div>
                )}

              </div>

              {/* Card 4: Risk Level */}
              <div style={{ background:'var(--bg-elevated)', padding:'16px 18px' }}>
                <div style={{ fontSize:'10px', fontWeight:500, color:'var(--text-muted)',
                  textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px',
                  display:'flex', alignItems:'center', gap:'5px' }}>
                  <Activity style={{ width:10, height:10 }} /> Portfolio Risk
                </div>
                <div style={{
                  fontSize: '22px', fontWeight: 700, lineHeight: 1,
                  color: rlCfg.color, marginBottom:'6px',
                }}>
                  {rlCfg.label}
                </div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                  {overallAch >= 90 ? 'Above target' : overallAch >= 70 ? 'On pace' : 'Below pace'}
                </div>
                <div style={{
                  marginTop:'10px', display:'flex', alignItems:'center', gap:'4px',
                }}>
                  {['ON_TRACK','LOW_RISK','MEDIUM_RISK','HIGH_RISK'].map((lvl) => (
                    <div key={lvl} style={{
                      flex:1, height:'3px', borderRadius:'99px',
                      background: riskLevel === lvl ? RISK_CFG[lvl].color : 'var(--border-subtle)',
                      transition:'background 0.3s',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Row 3: Today's priorities ── */}
            {priorities.length > 0 && (
              <div style={{
                padding: '10px 20px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', gap:'8px', flexWrap:'wrap',
                background: 'rgba(26,122,74,0.02)',
              }}>
                <span style={{
                  fontSize:'10px', fontWeight:600, color:'var(--text-muted)',
                  textTransform:'uppercase', letterSpacing:'0.08em', flexShrink:0,
                }}>
                  Today's Focus
                </span>
                <span style={{ color:'var(--border-default)', flexShrink:0 }}>·</span>
                {priorities.map((p, i) => (
                  <span key={i} style={{
                    display:'inline-flex', alignItems:'center', gap:'5px',
                    fontSize:'11px', fontWeight:500,
                    padding:'3px 10px', borderRadius:'99px',
                    background:`${p.color}12`,
                    border:`1px solid ${p.color}30`,
                    color:'var(--text-secondary)',
                  }}>
                    <p.Icon style={{ width:11, height:11, color:p.color, flexShrink:0 }} />
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{p.label}</span>
                    <span style={{ color:'var(--text-muted)', fontWeight:400 }}>{p.note}</span>
                  </span>
                ))}
              </div>
            )}

            {/* ── Row 4: Remaining This Month ── */}
            {(() => {
              // Top 3 KPIs by remaining units, where target > 0 and remaining > 0
              const remaining = KPI_KEYS
                .map(k => ({
                  key: k,
                  label: kpiStats[k]?._label ?? k,
                  remaining: kpiStats[k]?.remainingToTarget ?? 0,
                  requiredPerDay: paceMap[k]?.requiredDailyPace ?? 0,
                  paceStatus: paceMap[k]?.paceStatus,
                  color: kpiStats[k]?._color ?? 'var(--text-muted)',
                  achPct: kpiStats[k]?.achievementPct ?? 0,
                }))
                .filter(r => r.remaining > 0)
                .sort((a, b) => b.remaining - a.remaining)
                .slice(0, 3)
              if (!remaining.length) return null
              return (
                <div style={{
                  padding: '10px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', gap:'10px', flexWrap:'wrap',
                  background: 'rgba(0,0,0,0.02)',
                }}>
                  <span style={{
                    fontSize:'9px', fontWeight:600, color:'var(--text-muted)',
                    textTransform:'uppercase', letterSpacing:'0.08em', flexShrink:0,
                  }}>Remaining This Month</span>
                  <span style={{ color:'var(--border-default)', flexShrink:0 }}>·</span>
                  {remaining.map(r => (
                    <span key={r.key} style={{
                      display:'inline-flex', alignItems:'center', gap:'4px',
                      fontSize:'11px', fontWeight:500,
                      padding:'2px 9px', borderRadius:'99px',
                      background:`${r.color}12`, border:`1px solid ${r.color}30`,
                    }}>
                      <span style={{ color: r.color, fontWeight:600 }}>{r.label}</span>
                      <span style={{ color:'var(--text-muted)', fontWeight:400 }}>
                        {formatNumber(r.remaining)} left
                        {r.requiredPerDay > 0 && (
                          <> · {formatNumber(r.requiredPerDay, { maximumFractionDigits: 1 })}/day</>
                        )}
                      </span>
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── No-entries banner (non-admin with no data) ────── */}
      {!loading && (scope?.type === 'single' || scope?.type === 'list') && monthEntries.length === 0 && (
        <div style={{
          display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px',
          borderRadius:'8px', marginBottom:'16px',
          background:'rgba(0,210,173,0.05)', border:'1px solid rgba(0,210,173,0.15)',
          fontSize:'12px', color:'var(--brand-400)',
        }} className="animate-fade-in">
          <ClipboardList style={{ width:14, height:14, flexShrink:0 }} />
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

      {/* PR-1E6 — minmax(220px,1fr) is meant to collapse to 1 column
          below ~440px available width, but at a 375px viewport this
          grid still rendered 2 narrower-than-220px tracks, overflowing
          the viewport by ~30px (confirmed via real-browser measurement
          of the resulting tile's own bounding box). className="kpi-tile-grid"
          forces a hard 1-column floor below 480px regardless of the
          auto-fit computation, guaranteeing no overflow on phones. */}
      <div className="kpi-tile-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'10px', marginBottom:'20px' }}>
        {loading
          ? Array.from({length:5}).map((_,i) => <SkeletonStatCard key={i} />)
          : KPI_KEYS.map((k) => {
              const cfg = registryKpis.find((c) => (c.aliasFor ?? c.key) === k)
              const s = kpiStats[k]
              return (
                <KpiCard
                  key={k}
                  kpi={{ name: s?._label ?? k, color: s?._color, unit: cfg?.unit, type: cfg?.valueType }}
                  entry={{ value: s?.actual ?? null, target: s?.target ?? 0, achievement: s?.achievementPct ?? null }}
                  daysRemaining={totalDays - daysPassed}
                />
              )
            })
        }
      </div>

      {/* ── Pilot KPI Section ────────────────────────────────────
          Pilot KPIs are tracked but never affect evaluation, ranking,
          health score, portfolio score, or strongest/weakest logic.
          The Tracking Only badge is always visible. ──────────── */}
      {!loading && pilotKpis.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <PilotKpiSectionHeader />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px' }}
               className="sm:grid-cols-5">
            {pilotKpis.map((kpi, i) => {
              const engineKey = kpi.aliasFor ?? kpi.key
              const actualVal = monthEntries.reduce(
                (s, e) => s + (Number(e.kpiValues?.[kpi.key] ?? e[engineKey]) || 0), 0
              )
              const tgtField = `${kpi.key}Target`
              const targetVal = currentTarget ? (Number(currentTarget[tgtField]) || 0) : 0
              const achPct = targetVal > 0 ? Math.round((actualVal / targetVal) * 100) : 0
              return (
                <div key={kpi.key} className="kpi-tile animate-slide-up"
                     style={{ animationDelay:`${i*40}ms`,
                              border: '1px solid rgba(245,158,11,0.18)',
                              background: 'rgba(245,158,11,0.03)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'4px', marginBottom:'4px' }}>
                    <div className="kpi-tile-label" style={{ color:'var(--text-muted)' }}>
                      {kpi.label || kpi.labelAr}
                    </div>
                    <TrackingOnlyBadge size="sm" />
                  </div>
                  <div style={{ fontSize:'1.4rem', fontWeight:700, color:'var(--text-primary)',
                                fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif",
                                lineHeight:1, letterSpacing:'-0.03em' }}>
                    {formatNumber(actualVal)}
                  </div>
                  <div className="kpi-tile-meta">
                    {targetVal > 0 ? `${achPct}% of ${formatNumber(targetVal)}` : 'No target set'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* ── Analytics Row — UI3.2-D ───────────────────────────
          Left: relocated 14-Day Trend (same AreaChart, same data —
          no chart logic changes). Middle: KPI Distribution donut
          (kpiDistributionCounts, a pure reshape of kpiStats above).
          Right: Smart Alerts (liveAnalytics.alerts, same engine call,
          same data the old inline "Live Priority Alerts" used). */}
      <div className="section-divider">
        <span className="section-divider-label">Analytics</span>
        <div className="section-divider-line" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'20px' }}
           className="xl:grid-cols-[1.4fr_1fr_1fr]">

        {/* Trend chart — PR-1E3: ordered after Smart Alerts on mobile
            (risk/alerts outrank trend charts in the required mobile
            priority order); xl:order-none restores the original
            trend/distribution/alerts left-to-right desktop order. */}
        <div className="order-2 xl:order-none">
          {loading ? <SkeletonChart /> : (
            <div className="card card-p space-y-3">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div className="section-title" style={{ fontSize:'12px' }}>MTD Performance Trend</div>
                  <div className="section-subtitle">Daily KPI volume</div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  {KPI_KEYS.slice(0, 3).map((k) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'9px', color:'var(--text-muted)' }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:(kpiStats[k]?._color ?? getKpiColor(k)) }} />
                      {(kpiStats[k]?._label ?? k)}
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top:5, right:5, bottom:0, left:-20 }}>
                  <defs>
                    {KPI_KEYS.slice(0, 3).map((k) => (
                      <linearGradient key={k} id={`g_${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={(kpiStats[k]?._color ?? getKpiColor(k))} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={(kpiStats[k]?._color ?? getKpiColor(k))} stopOpacity={0}   />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  {KPI_KEYS.slice(0, 3).map((k) => (
                    <Area key={k} type="monotone" dataKey={k} name={(kpiStats[k]?._label ?? k)}
                      stroke={(kpiStats[k]?._color ?? getKpiColor(k))} strokeWidth={1.5} fill={`url(#g_${k})`}
                      dot={false} activeDot={{ r:3, strokeWidth:0 }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* KPI Distribution — secondary insight; ordered after the trend
            chart on mobile (PR-1E3 mobile priority order). */}
        <div className="card card-p order-3 xl:order-none">
          <div className="section-title" style={{ fontSize:'12px', marginBottom:'10px' }}>KPI Distribution</div>
          <KpiDistributionDonut counts={kpiDistributionCounts} />
        </div>

        {/* Smart Alerts — PR-1E3: ordered first on mobile (risk/alerts
            rank above trend/secondary-insight content in the required
            mobile priority order); xl:order-none restores desktop order. */}
        <div className="order-1 xl:order-none">
          <TopAlertsPanel alerts={liveAnalytics?.alerts ?? []} onNavigate={navigate} maxVisible={5} />
        </div>
      </div>

      {/* ── Executive Intelligence Row — UI3.2-E ──────────────
          Left: KPI Health heatmap (liveAnalytics.kpiHealth — the
          scoped equivalent of the multi-branch Heatmap.jsx, reserved
          for Executive/Branch Intelligence pages). Middle: Executive
          Summary, fed by this page's own already-computed overallAch/
          strongest/weakest KPI — no new scoring, mirrors the same
          derivation ExecutiveDashboard.jsx uses for its report-backed
          panel. Right: Today's Activities (liveAnalytics.activityFeed)
          + the existing DailyMissionPanel (biggest-risk/opportunity
          view), distinct purpose from the new Hero above. */}
      <div className="section-divider">
        <span className="section-divider-label">Executive Intelligence</span>
        <div className="section-divider-line" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'20px' }}
           className="xl:grid-cols-3">
        <KpiHealthHeatmap kpiHealth={liveAnalytics?.kpiHealth ?? []} />

        <ExecutiveSummaryPanel
          overallScore={overallAch}
          bestKpi={kpiStats[strongestKpi]?._label ?? strongestKpi}
          focusKpi={kpiStats[weakestKpi]?._label ?? weakestKpi}
          primaryRisk={weakestKpi ? `${kpiStats[weakestKpi]?._label ?? weakestKpi} is behind pace at ${kpiStats[weakestKpi]?.achievementPct ?? 0}%` : undefined}
          topOpportunity={strongestKpi ? `${kpiStats[strongestKpi]?._label ?? strongestKpi} is leading at ${kpiStats[strongestKpi]?.achievementPct ?? 0}%` : undefined}
          narrative={mission?.action}
        />

        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <ActivityFeedPanel items={liveAnalytics?.activityFeed ?? []} maxVisible={5} />
          {missionItems.length > 0 && <DailyMissionPanel items={missionItems} />}
        </div>
      </div>

      {/* ── Run Rate Forecast — compact supplementary ─────────
          Kept (not deleted): existing forecastMap readout per KPI,
          relocated below the locked 7 rows rather than removed. */}
      <div style={{ marginBottom:'20px' }}>
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
                  <div className="op-feed-dot" style={{ background: (kpiStats[k]?._color ?? getKpiColor(k)) }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:'11px', color:'var(--text-secondary)' }}>{(kpiStats[k]?._label ?? k)}</span>
                      <span style={{ fontSize:'11px', fontWeight:600, color:cfg?.color||'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>
                        {fc?.forecastAchPct ?? 0}%
                      </span>
                    </div>
                    {fc && (
                      <div style={{ marginTop:'3px', height:'2px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'99px', background:cfg?.color||(kpiStats[k]?._color ?? getKpiColor(k)), width:`${Math.min(fc.forecastAchPct,100)}%`, transition:'width 0.5s ease' }} />
                      </div>
                    )}
                    {fc && (
                      <div style={{ fontSize:'8px', color:'var(--text-muted)', marginTop:'2px',
                                    letterSpacing:'0.04em', textTransform:'uppercase',
                                    fontFamily:"'Inter',sans-serif", textAlign:'right' }}>
                        Projected EOM
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

      {/* ── Branch ranking (admin) or Month vs Target ───────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'20px' }}
           className="lg:grid-cols-2">

        {/* Team Intelligence Card (single / list scope) */}
        {!loading && teamIntelligence && (scope?.type === 'single' || scope?.type === 'list') && (
          <TeamIntelligenceCard teamResult={teamIntelligence} loading={loading} />
        )}

        {/* Branch ranking (all / list scope) | Month vs Target (single scope) */}
        {!loading && (
          scope?.type !== 'single' ? (
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
                          {formatNumber(b.total)}
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
                    <div style={{ width:5, height:5, borderRadius:'50%', background:(kpiStats[k]?._color ?? getKpiColor(k)), flexShrink:0 }} />
                    <span className="metric-row-label">{(kpiStats[k]?._label ?? k)}</span>
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

    </div>
  )
}