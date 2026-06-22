// ============================================================
// Scope Resolver — Phase 2B
//
// Single translation point: role + assignedPharmacyIds cache
// → PharmacyScope (which pharmacies this user may access).
//
// resolveAllowedPharmacyIdsSync():
//   Pure, synchronous. Returns null when a territory-role user's
//   cache is absent — caller must use the async version.
//
// resolveAllowedPharmacyIds():
//   Async. Falls through to computeAssignedPharmacyIdsForUser()
//   on cache miss. Always returns a UserScopeProfile.
//
// PharmacyScope semantics:
//   all    — admin / general_manager: unrestricted
//   none   — role carries no pharmacy scope (unknown role, or
//            single-branch role whose pharmacyId is unset)
//   single — manager / branch_manager / pharmacist: one branch
//   list   — district_supervisor / regional_manager: computed set
//            An empty list (ids: []) means "no pharmacies yet" —
//            it is NEVER promoted to 'all'. Safe-fallback invariant.
//
// Helpers (pure, synchronous — safe to call anywhere):
//   isPharmacyAllowed()     — boolean access check
//   filterAllowedPharmacies() — filters a pharmacy array
//   assertPharmacyAccess()  — throws AccessDeniedError if denied
//
// Rule: callers MUST use these helpers. Never read
// assignedPharmacyIds directly — null semantics differ by role.
//
// Does NOT contain UI. Does NOT change Firestore rules.
// Does NOT change Executive BI or Evaluation Engine.
// ============================================================

import { computeAssignedPharmacyIdsForUser } from './territorySync'

// ── Role categories ───────────────────────────────────────────

const ALL_ACCESS_ROLES    = ['admin', 'general_manager']    as const
const SINGLE_BRANCH_ROLES = ['manager', 'branch_manager', 'pharmacist'] as const
const TERRITORY_ROLES     = ['district_supervisor', 'regional_manager'] as const

// ── Types ─────────────────────────────────────────────────────

export type PharmacyScope =
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'single'; id: string }
  | { type: 'list';   ids: string[] }

export interface UserScopeProfile {
  uid:   string
  role:  string
  scope: PharmacyScope
}

// Input type accepted by both resolver variants
type UserInput = {
  uid:                 string
  role:                string
  pharmacyId?:         string | null
  assignedPharmacyIds?: string[] | null
}

// ── resolveAllowedPharmacyIdsSync ────────────────────────────
// Fast path. Returns null when the cache is absent for a
// territory-role user — the caller must use the async version.

export function resolveAllowedPharmacyIdsSync(
  user: UserInput,
): PharmacyScope | null {
  const { role, pharmacyId, assignedPharmacyIds } = user

  if ((ALL_ACCESS_ROLES as readonly string[]).includes(role)) {
    return { type: 'all' }
  }

  if ((SINGLE_BRANCH_ROLES as readonly string[]).includes(role)) {
    return pharmacyId
      ? { type: 'single', id: pharmacyId }
      : { type: 'none' }
  }

  if ((TERRITORY_ROLES as readonly string[]).includes(role)) {
    // Null / undefined → cache absent; signal async resolve needed
    if (assignedPharmacyIds == null) return null
    return { type: 'list', ids: [...assignedPharmacyIds] }
  }

  // Unrecognised role — deny by default
  return { type: 'none' }
}

// ── resolveAllowedPharmacyIds ─────────────────────────────────
// Async. Calls computeAssignedPharmacyIdsForUser() only on a
// territory-role cache miss; all other paths are synchronous.

export async function resolveAllowedPharmacyIds(
  user: UserInput,
): Promise<UserScopeProfile> {
  const fast = resolveAllowedPharmacyIdsSync(user)
  if (fast !== null) {
    return { uid: user.uid, role: user.role, scope: fast }
  }

  // Territory-role cache miss — compute from hierarchy
  const ids = await computeAssignedPharmacyIdsForUser(user.uid)
  return {
    uid:  user.uid,
    role: user.role,
    scope: { type: 'list', ids: ids ?? [] },
  }
}

// ── isPharmacyAllowed ─────────────────────────────────────────

export function isPharmacyAllowed(
  scope: PharmacyScope,
  pharmacyId: string,
): boolean {
  switch (scope.type) {
    case 'all':    return true
    case 'none':   return false
    case 'single': return scope.id === pharmacyId
    case 'list':   return scope.ids.includes(pharmacyId)
  }
}

// ── filterAllowedPharmacies ───────────────────────────────────

export function filterAllowedPharmacies<T extends { id: string }>(
  scope: PharmacyScope,
  pharmacies: T[],
): T[] {
  switch (scope.type) {
    case 'all':    return pharmacies
    case 'none':   return []
    case 'single': return pharmacies.filter((p) => p.id === scope.id)
    case 'list': {
      const allowed = new Set(scope.ids)
      return pharmacies.filter((p) => allowed.has(p.id))
    }
  }
}

// ── assertPharmacyAccess ──────────────────────────────────────

export class AccessDeniedError extends Error {
  readonly pharmacyId: string
  readonly scope: PharmacyScope

  constructor(pharmacyId: string, scope: PharmacyScope) {
    super(
      `Access denied: pharmacy '${pharmacyId}' is not in scope ` +
      `(type=${scope.type}${scope.type === 'single' ? `, id=${scope.id}` : ''}` +
      `${scope.type === 'list' ? `, ids=[${scope.ids.join(',')}]` : ''})`,
    )
    this.name        = 'AccessDeniedError'
    this.pharmacyId  = pharmacyId
    this.scope       = scope
  }
}

export function assertPharmacyAccess(
  scope: PharmacyScope,
  pharmacyId: string,
): void {
  if (!isPharmacyAllowed(scope, pharmacyId)) {
    throw new AccessDeniedError(pharmacyId, scope)
  }
}
