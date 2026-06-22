// ============================================================
// useProfileStudioProfile — Single profile hook (Phase 1C)
//
// Fetches a single profile document by ID.
// Reacts to profileId changes — re-fetches automatically.
// No subscriptions. Manual refresh supported.
//
// NO pages. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'

import { getProfileDocument } from '../profileStudioService'
import { normalizeError }     from '../profileStudioStore'

import type { ProfileStudioProfileDoc } from '../persistenceTypes'
import type { ProfileStudioRole }       from '../persistenceTypes'
import type { ProfileStudioError }      from '../profileStudioStore'

// ════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════

export interface UseProfileStudioProfileResult {
  profile:          ProfileStudioProfileDoc | null
  loading:          boolean
  error:            ProfileStudioError | null
  isRefreshing:     boolean
  refreshTimestamp: string | null
  refresh:          () => void
}

export interface UseProfileStudioProfileOptions {
  profileId: string | null | undefined
  actor:     { uid: string; role: ProfileStudioRole }
}

// ════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════

export function useProfileStudioProfile(
  options: UseProfileStudioProfileOptions,
): UseProfileStudioProfileResult {
  const { profileId, actor } = options

  const [profile,          setProfile]          = useState<ProfileStudioProfileDoc | null>(null)
  const [loading,          setLoading]          = useState<boolean>(false)
  const [error,            setError]            = useState<ProfileStudioError | null>(null)
  const [isRefreshing,     setIsRefreshing]     = useState<boolean>(false)
  const [refreshTimestamp, setRefreshTimestamp] = useState<string | null>(null)
  const [refreshKey,       setRefreshKey]       = useState<number>(0)

  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!profileId) {
      // No profile selected — clear state without fetching
      setProfile(null)
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

    getProfileDocument(profileId, actor)
      .then((doc) => {
        if (cancelledRef.current) return
        setProfile(doc)
        setRefreshTimestamp(new Date().toISOString())
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return
        setError(normalizeError(err))
        setProfile(null)
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
    profile,
    loading,
    error,
    isRefreshing,
    refreshTimestamp,
    refresh,
  }
}
