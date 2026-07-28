// ============================================================
// useBranchIntelligenceData — thin data-fetching hook
// Phase 5A
//
// Purpose: load raw branch data ONCE (single-fetch strategy per
// Phase 4B), build BranchExecutiveSummary + TeamIntelligenceResult
// (the two date-aware engine calls), compute expectedPace via
// getDayProgress (Phase 4C source), and call
// buildBranchIntelligenceViewModel — the builder remains the
// single source of truth for assembling the view model.
//
// This hook does NOT compute anything itself beyond what's needed
// to satisfy BranchIntelligenceBuilderInput — no new selectors, no
// new calculations, no new Firestore collections.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'

import { fetchKpiEntriesRange, subscribeTargets } from '../../services/kpiService'
import { getUsersByPharmacy } from '../../services/userService'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { getDayProgress, computeKpiStats, computePace, readKpiActual, readKpiTarget } from '../../engine/kpiAnalyticsEngine'
import { generateTeamIntelligence } from '../../engine/teamIntelligence'
import { generateBranchSummary } from '../../engine/executive'
import { computeLiveMomentum } from '../../engine/liveAnalytics/liveMomentumEngine'
import { buildBranchIntelligenceViewModel } from '../../engine/branchIntelligence/branchIntelligenceViewModelBuilder'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface } from '../../engine/kpiRegistry'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import { computeDependencyIntelligence } from '../../engine/teamIntelligence/dependencyIntelligenceEngine'

/**
 * @param {string} branchId — pharmacyId of the branch being viewed
 * @param {string} month    — 'yyyy-MM'
 * @returns {{
 *   viewModel: import('../../engine/branchIntelligence/branchIntelligenceTypes').BranchIntelligenceViewModel | null,
 *   kpiStats: Record<string, any>,
 *   paceMap: Record<string, any>,
 *   loading: boolean,
 *   error: Error | null,
 * }}
 */
export function useBranchIntelligenceData(branchId, month) {
  const [entries, setEntries] = useState([])
  const [targets, setTargets] = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // ── Live KPI registry (Branch Intelligence Registry Wiring Bundle) ──
  // Mirrors the established Dashboard/Regional Intelligence pattern:
  // subscribe once, default to DEFAULT_KPI_REGISTRY on error/loading.
  // generateTeamIntelligence/generateBranchSummary route reads through
  // this registry only where proven parity holds against a real sample
  // (dynamicReaderPilot) — otherwise they fall back to the exact
  // pre-existing legacy computation, so output is unchanged whenever
  // parity holds (true for all 5 core KPIs by registry convention).
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // ── Pharmacy name resolution via store (zero extra Firestore reads) ──
  // AppLayout subscribes to all pharmacies on mount — the store is already
  // populated by the time any branch page renders. Fall-back hierarchy:
  //   nameAr → name → code → id  (id is last-resort; never shown in normal use)
  const { getById: getPharmacyById } = usePharmacyStore()
  const pharmacy = branchId ? getPharmacyById(branchId) : null
  const resolvedPharmacyName = pharmacy?.nameAr ?? pharmacy?.name ?? pharmacy?.code ?? branchId
  const resolvedPharmacyCode = pharmacy?.code ?? ''

  // ── Fetch 1: KPI entries — 30-day lookback through month-end, this branch only ──
  // ── Fetch 2: Targets (live subscription, mirrors TeamPage pattern) ──
  // ── Fetch 3: Branch roster ──
  // All three fetched once per [branchId, month] — reused across Sections 1 & 2.
  useEffect(() => {
    if (!branchId || !month) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const [yearStr, monthStr] = month.split('-')
    const year  = Number(yearStr)
    const mon   = Number(monthStr) // 1-indexed
    const monthFrom = `${month}-01`
    const lastDay   = new Date(year, mon, 0).getDate()
    const monthTo   = `${month}-${String(lastDay).padStart(2, '0')}`
    // 30-day lookback for historicalEntries / momentum — single extended fetch
    const lookbackDate = new Date(year, mon - 1, 1)
    lookbackDate.setDate(lookbackDate.getDate() - 30)
    const lookbackFrom = format(lookbackDate, 'yyyy-MM-dd')

    const entriesPromise = fetchKpiEntriesRange(lookbackFrom, monthTo, { pharmacyId: branchId })
      .then((rows) => { if (!cancelled) setEntries(rows); return rows })
      .catch((e) => { if (!cancelled) setError(e); return [] })

    const usersPromise = getUsersByPharmacy(branchId)
      .then((rows) => { if (!cancelled) setUsers(rows); return rows })
      .catch((e) => { if (!cancelled) setError(e); return [] })

    const unsubscribe = subscribeTargets(branchId, (rows) => {
      if (!cancelled) setTargets(rows)
    }, (e) => { if (!cancelled) setError(e) })

    // loading completes once entries+users have resolved (targets may be
    // empty for branches with no target configured — that's a valid state,
    // not a loading state).
    Promise.allSettled([entriesPromise, usersPromise])
      .then(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true; unsubscribe?.() }
  }, [branchId, month])

  // ── Derive BranchInput / PharmacistInput[] from the SAME entries array ──
  // Phase 5C-3 addition: also returns `teamIntelligence` and `expectedPace`
  // alongside `viewModel` — additive only, existing destructuring of
  // `{ viewModel, kpiStats, paceMap, loading, error }` is unaffected.
  // This lets usePharmacistIntelligenceData reuse this hook's
  // already-computed TeamIntelligenceResult/expectedPace instead of
  // re-deriving them (avoids a second generateTeamIntelligence call
  // and a second Firestore fetch cycle).
  const branchData = useMemo(() => {
    if (!branchId || !month || loading) return { viewModel: null, teamIntelligence: null, expectedPace: null }

    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const mon  = Number(monthStr)
    const monthFrom = `${month}-01`
    const lastDay   = new Date(year, mon, 0).getDate()
    const monthTo   = `${month}-${String(lastDay).padStart(2, '0')}`

    const now = new Date()
    const dp  = getDayProgress(now)

    const currentTarget = targets.find((t) => t.pharmacyId === branchId && t.month === month) || null

    const userMap = new Map(users.map((u) => [u.id, u.displayName || 'Unknown User']))

    const mtdEntries = entries.filter((e) => e.date >= monthFrom && e.date <= monthTo && e.pharmacyId === branchId)

    // ── PharmacistInput[] — group entries by userId (mirrors TeamPage) ──
    const userGroups = new Map()
    mtdEntries.forEach((e) => {
      if (!userGroups.has(e.userId)) userGroups.set(e.userId, [])
      userGroups.get(e.userId).push(e)
    })
    const pharmacists = Array.from(userGroups.entries()).map(([uid, mtd]) => {
      const actualSubmissionDays   = new Set(mtd.map((e) => e.date)).size
      const expectedSubmissionDays = dp.currentDay
      return {
        userId: uid,
        displayName: userMap.get(uid) ?? 'Unknown User',
        pharmacyId: branchId,
        mtdEntries: mtd,
        historicalEntries: mtd,
        target: currentTarget,
        personalTarget: null, // Phase 5A: personal targets out of scope (no UI for them yet)
        actualSubmissionDays,
        expectedSubmissionDays,
      }
    })

    let teamIntelligence
    try {
      teamIntelligence = generateTeamIntelligence({ pharmacyId: branchId, month, pharmacists }, now, liveRegistry)
    } catch {
      teamIntelligence = null
    }
    if (!teamIntelligence) return { viewModel: null, teamIntelligence: null, expectedPace: null }

    // ── BranchInput — full mtdEntries array (branch aggregate) ──
    const branchInput = {
      pharmacyId: branchId,
      pharmacyName: resolvedPharmacyName,   // from pharmacyStore — never falls back to raw ID
      pharmacyCode: resolvedPharmacyCode,   // from pharmacyStore
      region: pharmacy?.region ?? '—',
      mtdEntries,
      target: currentTarget,
      historicalEntries: entries.filter((e) => e.pharmacyId === branchId),
      pharmacistCount: users.length,
    }

    let branchSummary
    try {
      branchSummary = generateBranchSummary(branchInput, format(now, 'yyyy-MM-dd'), month, liveRegistry)
    } catch {
      branchSummary = null
    }
    if (!branchSummary) return { viewModel: null, teamIntelligence, expectedPace: null }

    // ── Live momentum (Phase 4 — EMA-smoothed, anomaly-aware, per-KPI) ──
    // Day-level signal, distinct from branchSummary.trend (week/month-level).
    // Reads the exact same mtdEntries/target/now already assembled above —
    // no new data fetch, no fabricated history.
    let momentum
    try {
      momentum = computeLiveMomentum({ pharmacyId: branchId, mtdEntries, target: currentTarget, now }, liveRegistry)
    } catch {
      momentum = null
    }
    if (!momentum) return { viewModel: null, teamIntelligence, expectedPace: null }

    // ── expectedPace (Phase 4C) — same source as Dashboard/KPI Analytics ──
    const overallExpectedPct = Math.round(dp.ratio * 100)
    const kpiExpectedPct = {}
    getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })

    const input = {
      branchSummary,
      teamIntelligence,
      teamSize: users.length,
      momentum,
      branchRankSnapshot: null, // Phase 5A: ranking snapshots not wired yet
      expectedPace: { overallExpectedPct, kpiExpectedPct },
      metadata: {
        pharmacyId: branchId,
        month,
        generatedAt: now.toISOString(),
        dataAvailability: {
          hasKpiEntries: mtdEntries.length > 0,
          hasTargets: !!currentTarget,
          hasEvaluationResults: false,
          hasRankingSnapshot: false,
        },
      },
    }

    return { viewModel: buildBranchIntelligenceViewModel(input), teamIntelligence, expectedPace: input.expectedPace }
  }, [branchId, month, entries, targets, users, loading, liveRegistry])

  const { viewModel, teamIntelligence, expectedPace } = branchData

  // ── Dependency Intelligence — derived from viewModel.contributionByKpi ──
  // Pure computation: no Firestore, no new fetches. contributionByKpi is
  // already computed by branchIntelligenceSelectors inside buildBranchIntelligenceViewModel.
  const dependencyIntelligence = useMemo(() => {
    if (!viewModel?.contributionByKpi) return null
    try {
      return computeDependencyIntelligence(viewModel.contributionByKpi)
    } catch {
      return null
    }
  }, [viewModel])

  // ── Section 2: branch-aggregate kpiStats / paceMap ──
  // Same formulas as Dashboard's kpiStats/paceMap (computeKpiStats/computePace),
  // applied to BranchInput.mtdEntries (all pharmacists) instead of the
  // session user's entries — same engine, different aggregation scope.
  const { kpiStats, paceMap } = useMemo(() => {
    if (!branchId || !month || loading) return { kpiStats: {}, paceMap: {} }

    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const mon  = Number(monthStr)
    const monthFrom = `${month}-01`
    const lastDay   = new Date(year, mon, 0).getDate()
    const monthTo   = `${month}-${String(lastDay).padStart(2, '0')}`

    const dp = getDayProgress()
    const currentTarget = targets.find((t) => t.pharmacyId === branchId && t.month === month) || null
    const mtdEntries = entries.filter((e) => e.date >= monthFrom && e.date <= monthTo && e.pharmacyId === branchId)

    const statsMap = {}
    const paceMapOut = {}
    getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => {
      const cfg    = Object.values(DEFAULT_KPI_REGISTRY).find((c) => (c.aliasFor ?? c.key) === k)
      const actual = mtdEntries.reduce((s, e) => s + readKpiActual(e, k, DEFAULT_KPI_REGISTRY), 0)
      const target = readKpiTarget(currentTarget ?? {}, k, DEFAULT_KPI_REGISTRY)
      const stats  = computeKpiStats(actual, target, dp, k)
      statsMap[k] = {
        ...stats,
        _label: cfg?.shortLabel ?? k,
        _color: cfg?.defaultColor ?? undefined,
      }
      paceMapOut[k] = computePace(actual, target, dp)
    })

    return { kpiStats: statsMap, paceMap: paceMapOut }
  }, [branchId, month, entries, targets, loading])

  return { viewModel, kpiStats, paceMap, loading, error, teamIntelligence, expectedPace, users, dependencyIntelligence }
}
