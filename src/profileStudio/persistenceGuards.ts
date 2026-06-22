// ============================================================
// Profile Studio — Persistence Guards (Phase 1A)
//
// Role-based access control guards for Profile Studio operations.
// All guards are pure functions — they return boolean and never
// throw, read from Firestore, or write to Firestore.
//
// NO Firestore SDK. NO saves. NO React. NO UI. NO AI.
// ============================================================

import type { ProfileStatus }         from './types'
import type { ProfileStudioRole, ProfileStudioPermission } from './persistenceTypes'
import { PERMISSION_MATRIX }           from './persistenceSchema'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Internal permission checker
// ════════════════════════════════════════════════════════════

/**
 * Returns true when the given role holds the requested permission
 * according to the canonical PERMISSION_MATRIX.
 *
 * Returns false for any unrecognised role or permission.
 * Never throws.
 */
export function hasPermission(
  role:       ProfileStudioRole,
  permission: ProfileStudioPermission,
): boolean {
  try {
    return (PERMISSION_MATRIX[role] ?? []).includes(permission)
  } catch {
    return false
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Editable-status helper
// ════════════════════════════════════════════════════════════

/**
 * Statuses that allow structural edits.
 * APPROVED, PUBLISHED, and ARCHIVED are locked.
 */
const EDITABLE_STATUSES: readonly ProfileStatus[] = ['DRAFT', 'VALIDATED', 'SIMULATED']

// ════════════════════════════════════════════════════════════
// SECTION 3 — Guard functions
// ════════════════════════════════════════════════════════════

/**
 * Returns true when the role is allowed to create new profile drafts.
 * Only admin has this permission.
 *
 * Never throws.
 */
export function canCreateProfile(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'profile:create')
  } catch {
    return false
  }
}

/**
 * Returns true when the role is allowed to edit a profile.
 *
 * Two-factor check:
 *   1. Role must have `profile:edit` permission.
 *   2. If a `profileStatus` is supplied, the status must be editable
 *      (DRAFT, VALIDATED, or SIMULATED).
 *
 * When `profileStatus` is omitted, only the role check is applied.
 * Never throws.
 */
export function canEditProfile(
  role:           ProfileStudioRole,
  profileStatus?: ProfileStatus,
): boolean {
  try {
    if (!hasPermission(role, 'profile:edit')) return false
    if (profileStatus !== undefined) {
      return EDITABLE_STATUSES.includes(profileStatus)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Returns true when the role is allowed to approve profiles.
 * admin and general_manager have this permission.
 *
 * Never throws.
 */
export function canApproveProfile(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'profile:approve')
  } catch {
    return false
  }
}

/**
 * Returns true when the role is allowed to publish approved profiles.
 * admin and general_manager have this permission.
 *
 * Never throws.
 */
export function canPublishProfile(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'profile:publish')
  } catch {
    return false
  }
}

/**
 * Returns true when the role is allowed to archive profiles.
 * Only admin has this permission.
 *
 * Never throws.
 */
export function canArchiveProfile(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'profile:archive')
  } catch {
    return false
  }
}

/**
 * Returns true when the role is allowed to run sandbox simulations.
 * admin, district_supervisor, and manager have this permission.
 *
 * Never throws.
 */
export function canRunSimulation(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'simulation:run')
  } catch {
    return false
  }
}

/**
 * Returns true when the role has read access to profile documents.
 * All roles have this permission.
 *
 * Never throws.
 */
export function canReadProfile(role: ProfileStudioRole): boolean {
  try {
    return hasPermission(role, 'profile:read')
  } catch {
    return false
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Composite convenience helpers
// ════════════════════════════════════════════════════════════

/**
 * Returns all permissions held by a given role.
 * Returns an empty array for unrecognised roles.
 * Never throws.
 */
export function getPermissionsForRole(
  role: ProfileStudioRole,
): readonly ProfileStudioPermission[] {
  try {
    return PERMISSION_MATRIX[role] ?? []
  } catch {
    return []
  }
}

/**
 * Returns all roles that hold a specific permission.
 * Never throws.
 */
export function getRolesWithPermission(
  permission: ProfileStudioPermission,
): ProfileStudioRole[] {
  try {
    const ALL_ROLES: ProfileStudioRole[] = [
      'admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist',
    ]
    return ALL_ROLES.filter((r) => hasPermission(r, permission))
  } catch {
    return []
  }
}
