// ============================================================
// usePharmacistIntelligenceData — thin orchestration hook
// Phase 5C-6 — Self-mode / manager-drilldown data-access split
//
// Two modes:
//
//   SELF MODE (currentUser.role === 'pharmacist' &&
//              currentUser.uid === userId):
//     - Does NOT call useBranchIntelligenceData (no branch-wide reads).
//     - Reads ONLY this user's own data:
//         - own KPI entries (userId-filtered query)
//         - own personal target (fetchMyPersonalTarget)
//         - own branch target (pharmacyId-scoped — allowed for any
//           authenticated user on their own pharmacy per
//           firestore.rules `targets` collection)
//         - own evaluation result (userId-filtered query)
//         - own pharmacy document
//     - contribution/ranking context is unavailable —
//       contributionByKpi/branchPharmacistRanking are null,
//       companyWideRankingSnapshot is null. The view model's
//       contributionContext is [] and rankingContext.branchRank/
//       companyWideRank are null — the page renders the existing
//       "manager view only" / deferred empty states for these.
//     - PharmacistPerformanceSummary is computed directly via
//       computePharmacistPerformance(PharmacistInput) — the SAME
//       per-pharmacist engine function useBranchIntelligenceData
//       uses internally, called with only this user's own entries.
//       No team-wide computation (generateTeamIntelligence) runs.
//
//   MANAGER DRILLDOWN MODE (role is admin/manager/branch_manager):
//     - Unchanged from Phase 5C-3: calls useBranchIntelligenceData,
//       which performs branch-wide reads. Managers/admins are
//       permitted branch-wide reads under firestore.rules
//       (ownsPharmacy() / isMgr() / isAdmin()).
//     - contribution/ranking context fully populated as before.
//
// React hooks cannot be called conditionally, so both
// useSelfPharmacistIntelligenceData and useBranchIntelligenceData are
// always invoked, but each internally no-ops (skips its Firestore
// reads) when its mode is not active — see `enabled` guards below.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'

import { useBranchIntelligenceData } from '../branch/useBranchIntelligenceData'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useAuthStore } from '../../store/authStore'
import { fetchEvaluationResultsForUserMonth } from '../../services/evaluationLedgerService'
import { fetchKpiEntriesRange, subscribeTargets } from '../../services/kpiService'
import { fetchMyPersonalTarget } from '../../services/personalTargetService'
import { getDayProgress } from '../../engine/kpiAnalyticsEngine'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface } from '../../engine/kpiRegistry'
import { computePharmacistPerformance } from '../../engine/teamIntelligence/pharmacistPerformanceEngine'
import { computeAccountabilityInsights } from '../../engine/teamIntelligence/accountabilityEngine'
import { buildPharmacistIntelligenceViewModel } from '../../engine/pharmacistIntelligence/pharmacistIntelligenceViewModelBuilder'

/**
 * SELF MODE — self-scoped data fetching + view model assembly.
 *
 * @param {boolean} enabled — true only when self mode is active
 * @param {string} userId
 * @param {string} branchId — userProfile.pharmacyId (own pharmacy)
 * @param {string} month
 * @param {string|null} focusKpi
 */
function useSelfPharmacistIntelligenceData(enabled, userId, branchId, month, focusKpi, userProfile) {
  const [entries, setEntries] = useState([])
  const [personalTarget, setPersonalTarget] = useState(null)
  const [targets, setTargets] = useState([])
  const [evaluationResults, setEvaluationResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Pharmacy document — existing Zustand store ──
  const pharmacySubscribe = usePharmacyStore((s) => s.subscribe)
  const getPharmacyById   = usePharmacyStore((s) => s.getById)
  const pharmacies        = usePharmacyStore((s) => s.pharmacies)
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = pharmacySubscribe()
    return () => unsubscribe?.()
  }, [enabled, pharmacySubscribe])
  const pharmacyDoc = enabled ? getPharmacyById(branchId) : null

  // ── Own KPI entries (userId-filtered) + own target + own personal target + own evaluation result ──
  useEffect(() => {
    if (!enabled || !userId || !branchId || !month) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const mon  = Number(monthStr)
    const monthTo = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`
    const lookbackDate = new Date(year, mon - 1, 1)
    lookbackDate.setDate(lookbackDate.getDate() - 30)
    const lookbackFrom = format(lookbackDate, 'yyyy-MM-dd')

    const entriesPromise = fetchKpiEntriesRange(lookbackFrom, monthTo, { userId })
      .then((rows) => { if (!cancelled) setEntries(rows); return rows })
      .catch((e) => { if (!cancelled) setError(e); return [] })

    const personalTargetPromise = fetchMyPersonalTarget(userId, branchId, month)
      .then((doc) => { if (!cancelled) setPersonalTarget(doc) })
      .catch(() => {
        // Non-fatal — personal target is optional (falls back to branch target)
      })

    const evalPromise = fetchEvaluationResultsForUserMonth(userId, month)
      .then((rows) => { if (!cancelled) setEvaluationResults(rows) })
      .catch(() => {
        // Non-fatal — evaluation result is optional
      })

    const unsubscribe = subscribeTargets(branchId, (rows) => {
      if (!cancelled) setTargets(rows)
    }, (e) => { if (!cancelled) setError(e) })

    Promise.allSettled([entriesPromise, personalTargetPromise, evalPromise])
      .then(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true; unsubscribe?.() }
  }, [enabled, userId, branchId, month])

  const overallLoading = !enabled ? false : (loading || pharmacies.length === 0)

  const viewModel = useMemo(() => {
    if (!enabled || overallLoading || !userId || !branchId || !month) return null

    const now = new Date()
    const dp = getDayProgress(now)
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const mon  = Number(monthStr)
    const monthFrom = `${month}-01`
    const monthTo   = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`

    const mtdEntries = entries.filter((e) => e.date >= monthFrom && e.date <= monthTo)
    const currentTarget = targets.find((t) => t.pharmacyId === branchId && t.month === month) || null

    // ── PharmacistInput — self only, no team data ──
    const actualSubmissionDays   = new Set(mtdEntries.map((e) => e.date)).size
    const expectedSubmissionDays = dp.currentDay

    const pharmacistInput = {
      userId,
      displayName: userProfile?.displayName ?? userId,
      pharmacyId: branchId,
      mtdEntries,
      historicalEntries: entries,
      target: currentTarget,
      personalTarget,
      actualSubmissionDays,
      expectedSubmissionDays,
    }

    // ── PharmacistPerformanceSummary — same per-pharmacist engine
    // function used inside useBranchIntelligenceData, called with
    // only this user's own data. ──
    let summary
    try {
      summary = computePharmacistPerformance(pharmacistInput, now)
    } catch {
      return null
    }

    // ── Accountability — single-element array, no team data ──
    let accountabilityInsight = null
    try {
      const insights = computeAccountabilityInsights([pharmacistInput], month, now)
      accountabilityInsight = insights[0] ?? null
    } catch {
      accountabilityInsight = null
    }

    // ── expectedPace (Phase 4C source) — uniform across KPIs, no team data ──
    const overallExpectedPct = Math.round(dp.ratio * 100)
    const kpiExpectedPct = {}
    getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })
    const expectedPace = { kpiExpectedPct }

    // ── Official V1 evaluation result ──
    const v1Result = evaluationResults.find((r) => (r.engineVersion ?? 'v1') === 'v1')
    const officialEvaluationResult = v1Result ? { finalScore: v1Result.finalScore, rating: v1Result.rating } : null

    const input = {
      user: {
        userId,
        displayName: userProfile?.displayName ?? userId,
        employeeId: userProfile?.employeeId ?? null,
        pharmacyId: branchId,
      },
      pharmacy: pharmacyDoc
        ? { pharmacyId: pharmacyDoc.id, name: pharmacyDoc.name, code: pharmacyDoc.code, region: pharmacyDoc.region ?? null }
        : null,
      summary,
      // ── Self mode: no branch-wide contribution/ranking data. ──
      // Never fabricated — null means "unavailable in self view",
      // surfaced by the page as "available to manager view only" /
      // deferred empty states (Sections 4 & 5).
      contributionByKpi: null,
      branchPharmacistRanking: null,
      accountabilityInsight,
      companyWideRankingSnapshot: null,
      officialEvaluationResult,
      expectedPace,
      focusKpiParam: focusKpi ?? null,
      metadata: {
        branchId,
        month,
        generatedAt: new Date().toISOString(),
        dataAvailability: {
          hasKpiEntries: (summary.kpiSnapshots ?? []).some((s) => s.actual > 0),
          hasTargets: (summary.kpiSnapshots ?? []).some((s) => s.target > 0),
          hasBranchContext: false,
          hasCompanyWideRanking: false,
          hasEvaluationResult: !!officialEvaluationResult,
        },
      },
    }

    return buildPharmacistIntelligenceViewModel(input)
  }, [enabled, overallLoading, userId, branchId, month, focusKpi, entries, targets, personalTarget, evaluationResults, pharmacyDoc, userProfile])

  return { viewModel, loading: overallLoading, error }
}

/**
 * MANAGER DRILLDOWN MODE — unchanged from Phase 5C-3. Uses
 * useBranchIntelligenceData (branch-wide reads, permitted for
 * admin/manager/branch_manager under firestore.rules).
 */
function useManagerPharmacistIntelligenceData(enabled, userId, branchId, month, focusKpi) {
  // useBranchIntelligenceData is always called (hooks cannot be
  // conditional), but its internal effect already no-ops when
  // !branchId/!month — pass null/undefined when this mode isn't active
  // so it performs no reads.
  const branch = useBranchIntelligenceData(enabled ? branchId : null, enabled ? month : null)

  const pharmacySubscribe = usePharmacyStore((s) => s.subscribe)
  const getPharmacyById   = usePharmacyStore((s) => s.getById)
  const pharmacies        = usePharmacyStore((s) => s.pharmacies)
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = pharmacySubscribe()
    return () => unsubscribe?.()
  }, [enabled, pharmacySubscribe])
  const pharmacyDoc = enabled ? getPharmacyById(branchId) : null

  const [evaluationResults, setEvaluationResults] = useState([])
  const [evalLoading, setEvalLoading] = useState(true)
  const [evalError, setEvalError] = useState(null)
  useEffect(() => {
    if (!enabled || !userId || !month) return
    let cancelled = false
    setEvalLoading(true)
    fetchEvaluationResultsForUserMonth(userId, month, branchId)
      .then((rows) => { if (!cancelled) setEvaluationResults(rows) })
      .catch((e) => { if (!cancelled) setEvalError(e) })
      .finally(() => { if (!cancelled) setEvalLoading(false) })
    return () => { cancelled = true }
  }, [enabled, userId, month, branchId])

  const loading = !enabled ? false : (branch.loading || evalLoading || (pharmacies.length === 0))
  const error = !enabled ? null : (branch.error || evalError)

  const viewModel = useMemo(() => {
    if (!enabled || loading || !userId || !branchId || !month) return null

    const summary = branch.teamIntelligence?.pharmacistSummaries.find((p) => p.userId === userId)
    if (!summary) return null

    const userDoc = branch.users.find((u) => u.id === userId)
    const accountabilityInsight = branch.teamIntelligence?.accountabilityInsights.find((a) => a.userId === userId) ?? null
    const branchPharmacistRanking = branch.viewModel?.pharmacistRanking.map((p) => ({ userId: p.userId, rank: p.rank })) ?? null

    const v1Result = evaluationResults.find((r) => (r.engineVersion ?? 'v1') === 'v1')
    const officialEvaluationResult = v1Result ? { finalScore: v1Result.finalScore, rating: v1Result.rating } : null

    const input = {
      user: {
        userId,
        displayName: userDoc?.displayName ?? summary.displayName ?? userId,
        employeeId: userDoc?.employeeId ?? null,
        pharmacyId: branchId,
      },
      pharmacy: pharmacyDoc
        ? { pharmacyId: pharmacyDoc.id, name: pharmacyDoc.name, code: pharmacyDoc.code, region: pharmacyDoc.region ?? null }
        : null,
      summary,
      contributionByKpi: branch.viewModel?.contributionByKpi ?? null,
      branchPharmacistRanking,
      accountabilityInsight,
      companyWideRankingSnapshot: null,
      officialEvaluationResult,
      expectedPace: branch.expectedPace,
      focusKpiParam: focusKpi ?? null,
      metadata: {
        branchId,
        month,
        generatedAt: new Date().toISOString(),
        dataAvailability: {
          hasKpiEntries: (summary.kpiSnapshots ?? []).some((s) => s.actual > 0),
          hasTargets: (summary.kpiSnapshots ?? []).some((s) => s.target > 0),
          hasBranchContext: !!branch.viewModel,
          hasCompanyWideRanking: false,
          hasEvaluationResult: !!officialEvaluationResult,
        },
      },
    }

    return buildPharmacistIntelligenceViewModel(input)
  }, [enabled, loading, userId, branchId, month, focusKpi, branch.teamIntelligence, branch.users, branch.viewModel, branch.expectedPace, evaluationResults, pharmacyDoc])

  return { viewModel, loading, error }
}

/**
 * @param {string} userId   — the pharmacist being viewed
 * @param {string} branchId — pharmacyId of their branch (from route query param)
 * @param {string} month    — 'yyyy-MM'
 * @param {string|null} focusKpi — optional ?focusKpi= query param (validated KpiKey or null)
 * @returns {{
 *   viewModel: import('../../engine/pharmacistIntelligence/pharmacistIntelligenceTypes').PharmacistIntelligenceViewModel | null,
 *   loading: boolean,
 *   error: Error | null,
 *   mode: 'self' | 'manager',
 * }}
 */
export function usePharmacistIntelligenceData(userId, branchId, month, focusKpi) {
  const { userProfile } = useAuthStore()

  const isSelfMode = userProfile?.role === 'pharmacist' && userProfile?.uid === userId

  const self = useSelfPharmacistIntelligenceData(isSelfMode, userId, branchId, month, focusKpi, userProfile)
  const manager = useManagerPharmacistIntelligenceData(!isSelfMode, userId, branchId, month, focusKpi)

  return isSelfMode
    ? { ...self, mode: 'self' }
    : { ...manager, mode: 'manager' }
}
