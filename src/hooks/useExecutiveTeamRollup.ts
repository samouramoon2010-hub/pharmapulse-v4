// ============================================================
// useExecutiveTeamRollup — Phase A.1
//
// Provides Team Intelligence data for the Executive BI's
// Team Rollup section (manager-view only).
//
// Data source: useBranchIntelligenceData(branchId, month)
//   — the same hook that powers TeamPage and BranchIntelligencePage.
//   — reads ONLY the manager's own pharmacy (pharmacyId-scoped).
//   — zero engine code duplication; generateTeamIntelligence() is
//     called inside useBranchIntelligenceData, not here.
//
// When role is NOT 'manager': returns a disabled/null result so the
// Executive BI admin view is completely unaffected.
//
// Security: useBranchIntelligenceData fetches:
//   - fetchKpiEntriesRange(..., { pharmacyId: branchId })  ← own branch only
//   - subscribeTargets(branchId, ...)                      ← own branch only
//   - getUsersByPharmacy(branchId)                         ← own branch only
// No cross-pharmacy reads are introduced by this hook.
// ============================================================

import { format } from 'date-fns'
import { useAuthStore } from '../store/authStore'
import { useBranchIntelligenceData } from '../pages/branch/useBranchIntelligenceData'
import type { TeamIntelligenceResult } from '../engine/teamIntelligence/teamIntelligenceTypes'

export interface UseExecutiveTeamRollupResult {
  /** null when: not manager role, or loading, or no team data */
  teamIntelligence: TeamIntelligenceResult | null
  loading: boolean
  error: Error | null
  /** true when role === 'manager' and this section is active */
  enabled: boolean
  /** the pharmacyId whose data is being shown */
  pharmacyId: string | null
  /** 'yyyy-MM' string used for the rollup */
  month: string
}

export function useExecutiveTeamRollup(): UseExecutiveTeamRollupResult {
  const { userProfile } = useAuthStore()

  const isManager   = userProfile?.role === 'manager'
  const pharmacyId  = isManager ? (userProfile?.pharmacyId ?? null) : null
  const month       = format(new Date(), 'yyyy-MM')

  // useBranchIntelligenceData is always called (React hooks cannot be
  // conditional), but with null/null when not a manager, so it no-ops
  // internally (its useEffect has `if (!branchId || !month) return`).
  const branch = useBranchIntelligenceData(
    isManager ? pharmacyId : null,
    isManager ? month      : null,
  )

  if (!isManager) {
    return {
      teamIntelligence: null,
      loading: false,
      error: null,
      enabled: false,
      pharmacyId: null,
      month,
    }
  }

  return {
    teamIntelligence: branch.teamIntelligence ?? null,
    loading: branch.loading,
    error: branch.error,
    enabled: true,
    pharmacyId,
    month,
  }
}
