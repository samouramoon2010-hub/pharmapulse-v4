// ============================================================
// useProfileStudioProfiles — Profile list hook (Phase 1C)
//
// Fetches the list of profile documents for a given actor.
// No subscriptions. No polling. Manual refresh only.
//
// NO pages. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'

import { listProfileDocuments } from '../profileStudioService'
import { normalizeError }       from '../profileStudioStore'

import type { ProfileStudioProfileDoc } from '../persistenceTypes'
import type { ProfileStudioRole }       from '../persistenceTypes'
import type { ProfileStudioError }      from '../profileStudioStore'
import type { ProfileStatus }           from '../types'

// ════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════

export interface UseProfileStudioProfilesResult {
  profiles:         ProfileStudioProfileDoc[]
  loading:          boolean
  error:            ProfileStudioError | null
  isRefreshing:     boolean
  refreshTimestamp: string | null
  refresh:          () => void
}

export interface UseProfileStudioProfilesOptions {
  actor:    { uid: string; role: ProfileStudioRole }
  filters?: { status?: ProfileStatus }
  /** If false the hook will not fetch on mount (default: true). */
  enabled?: boolean
}

// ════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════

export function useProfileStudioProfiles(
  options: UseProfileStudioProfilesOptions,
): UseProfileStudioProfilesResult {
  const { actor, filters, enabled = true } = options

  const [profiles,         setProfiles]         = useState<ProfileStudioProfileDoc[]>([])
  const [loading,          setLoading]          = useState<boolean>(false)
  const [error,            setError]            = useState<ProfileStudioError | null>(null)
  const [isRefreshing,     setIsRefreshing]     = useState<boolean>(false)
  const [refreshTimestamp, setRefreshTimestamp] = useState<string | null>(null)
  const [refreshKey,       setRefreshKey]       = useState<number>(0)

  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    cancelledRef.current = false
    const isFirstLoad = refreshKey === 0

    if (isFirstLoad) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    listProfileDocuments(actor, filters)
      .then((docs) => {
        if (cancelledRef.current) return
        setProfiles(docs)
        setRefreshTimestamp(new Date().toISOString())
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return
        setError(normalizeError(err))
        setProfiles([])
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
  }, [enabled, refreshKey, actor.uid, actor.role, filters?.status])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    profiles,
    loading,
    error,
    isRefreshing,
    refreshTimestamp,
    refresh,
  }
}
