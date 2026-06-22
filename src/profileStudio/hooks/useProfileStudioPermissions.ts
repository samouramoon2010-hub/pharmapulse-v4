// ============================================================
// useProfileStudioPermissions — Role permission hook (Phase 1C)
//
// Returns derived boolean permission flags for a given role.
// Pure derived values — no state, no effects, no Firestore.
//
// NO pages. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import { useMemo } from 'react'

import {
  canCreateProfile,
  canEditProfile,
  canApproveProfile,
  canPublishProfile,
  canArchiveProfile,
  canRunSimulation,
  canReadProfile,
} from '../persistenceGuards'

import type { ProfileStudioRole } from '../persistenceTypes'
import type { ProfileStatus }     from '../types'

// ════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════

export interface ProfileStudioPermissions {
  canRead:          boolean
  canCreate:        boolean
  canEdit:          boolean
  canApprove:       boolean
  canPublish:       boolean
  canArchive:       boolean
  canRunSimulation: boolean
}

export interface UseProfileStudioPermissionsOptions {
  role:           ProfileStudioRole | null | undefined
  profileStatus?: ProfileStatus
}

// ════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════

/**
 * Returns the full permission set for a given Profile Studio role.
 *
 * All returned values are memoised — no re-computation unless
 * `role` or `profileStatus` changes.
 *
 * When `role` is null or undefined, all permissions are false.
 * Never throws.
 */
export function useProfileStudioPermissions(
  options: UseProfileStudioPermissionsOptions,
): ProfileStudioPermissions {
  const { role, profileStatus } = options

  return useMemo<ProfileStudioPermissions>(() => {
    if (!role) {
      return {
        canRead:          false,
        canCreate:        false,
        canEdit:          false,
        canApprove:       false,
        canPublish:       false,
        canArchive:       false,
        canRunSimulation: false,
      }
    }

    return {
      canRead:          canReadProfile(role),
      canCreate:        canCreateProfile(role),
      canEdit:          canEditProfile(role, profileStatus),
      canApprove:       canApproveProfile(role),
      canPublish:       canPublishProfile(role),
      canArchive:       canArchiveProfile(role),
      canRunSimulation: canRunSimulation(role),
    }
  }, [role, profileStatus])
}
