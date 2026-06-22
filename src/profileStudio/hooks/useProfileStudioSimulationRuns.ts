// ============================================================
// useProfileStudioSimulationRuns — Simulation runs hook (Phase 1C)
//
// Fetches the simulation run list for a given profile.
// No real-time listeners. Manual refresh only.
//
// NO pages. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'

import { listSimulationRuns } from '../profileStudioService'
import { normalizeError }     from '../profileStudioStore'

import type { ProfileStudioSimulationRunDoc } from '../persistenceTypes'
import type { ProfileStudioRole }             from '../persistenceTypes'
import type { ProfileStudioError }            from '../profileStudioStore'

// ════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════

export interface UseProfileStudioSimulationRunsResult {
  runs:             ProfileStudioSimulationRunDoc[]
  loading:          boolean
  error:            ProfileStudioError | null
  isRefreshing:     boolean
  refreshTimestamp: string | null
  refresh:          () => void
}

export interface UseProfileStudioSimulationRunsOptions {
  profileId: string | null | undefined
  actor:     { uid: string; role: ProfileStudioRole }
}

// ════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════

export function useProfileStudioSimulationRuns(
  options: UseProfileStudioSimulationRunsOptions,
): UseProfileStudioSimulationRunsResult {
  const { profileId, actor } = options

  const [runs,             setRuns]             = useState<ProfileStudioSimulationRunDoc[]>([])
  const [loading,          setLoading]          = useState<boolean>(false)
  const [error,            setError]            = useState<ProfileStudioError | null>(null)
  const [isRefreshing,     setIsRefreshing]     = useState<boolean>(false)
  const [refreshTimestamp, setRefreshTimestamp] = useState<string | null>(null)
  const [refreshKey,       setRefreshKey]       = useState<number>(0)

  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!profileId) {
      setRuns([])
      setLoading(false)
      setError(null)
      return
    }

    cancelledRef.current = false
    const isFirstLoad = refreshKey === 0

    if (isFirstLoad) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    listSimulationRuns(profileId, actor)
      .then((list) => {
        if (cancelledRef.current) return
        setRuns(list)
        setRefreshTimestamp(new Date().toISOString())
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return
        setError(normalizeError(err))
        setRuns([])
      })
      .finally(() => {
        if (cancelledRef.current) return
        setLoading(false)
        setIsRefreshing(false)
      })

    return () => {
      cancelledRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, refreshKey, actor.uid, actor.role])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    runs,
    loading,
    error,
    isRefreshing,
    refreshTimestamp,
    refresh,
  }
}
