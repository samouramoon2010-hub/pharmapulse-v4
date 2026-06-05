// ============================================================
// Access Guard
// Client-side authorization layer — supplements Firestore rules.
// Use before any write to catch errors BEFORE network round-trip.
//
// These are ADVISORY guards — Firestore rules are the authority.
// Never rely solely on client-side guards for security.
// ============================================================

// ============================================================
// Access Guard
// Client-side authorization layer — supplements Firestore rules.
// Use before any write to catch errors BEFORE network round-trip.
//
// These are ADVISORY guards — Firestore rules are the authority.
// Never rely solely on client-side guards for security.
//
// RBAC Phase 0:
//   - 'manager' is kept as a backward-compatible alias for 'branch_manager'.
//   - 'district_supervisor' and 'regional_manager' are recognised types
//     but have no enforcement logic yet (Phase 1 territory guards).
//   - effectiveRole() normalises the alias for future-facing logic.
// ============================================================

// All roles recognised by the system.
// 'manager' is a backward-compatible alias for 'branch_manager'.
export type UserRole =
  | 'admin'
  | 'manager'             // alias — kept for existing users
  | 'branch_manager'
  | 'district_supervisor' // Phase 0: inert — territory guards in Phase 1
  | 'regional_manager'    // Phase 0: inert — territory guards in Phase 1
  | 'pharmacist'

export interface GuardContext {
  uid:         string
  role:        UserRole
  pharmacyId:  string | null
}

export interface GuardResult {
  allowed:  boolean
  reason?:  string
  code?:    'UNAUTHORIZED' | 'WRONG_BRANCH' | 'WRONG_ROLE' | 'MISSING_FIELD' | 'EXPIRED'
}

const ALLOW:  GuardResult = { allowed: true }
const deny = (reason: string, code: GuardResult['code']): GuardResult =>
  ({ allowed: false, reason, code })

// ── Role normalisation ────────────────────────────────────────

/**
 * Normalises the manager → branch_manager alias.
 * Use in new logic where the canonical name matters.
 * Do NOT mass-replace ctx.role with this in existing guards —
 * adopt gradually to avoid unintended side-effects.
 */
export function effectiveRole(ctx: GuardContext): UserRole {
  return ctx.role === 'manager' ? 'branch_manager' : ctx.role
}

// ── Role helpers ──────────────────────────────────────────────

export function isAdmin(ctx: GuardContext):   boolean {
  return ctx.role === 'admin'
}

/**
 * True for admin, manager (alias), or branch_manager.
 * Used for all existing manager-level gates.
 */
export function isManager(ctx: GuardContext): boolean {
  return ctx.role === 'admin' || ctx.role === 'manager' || ctx.role === 'branch_manager'
}

/**
 * True specifically for branch_manager (or the manager alias).
 * Use when distinguishing branch_manager from supervisor/regional in Phase 1+.
 */
export function isBranchManager(ctx: GuardContext): boolean {
  return ctx.role === 'branch_manager' || ctx.role === 'manager'
}

/**
 * Phase 0: returns true for district_supervisor.
 * No territory enforcement yet — guard logic added in Phase 1.
 */
export function isSupervisor(ctx: GuardContext): boolean {
  return ctx.role === 'district_supervisor'
}

/**
 * Phase 0: returns true for regional_manager.
 * No territory enforcement yet — guard logic added in Phase 1.
 */
export function isRegionalManager(ctx: GuardContext): boolean {
  return ctx.role === 'regional_manager'
}

export function isAny(ctx: GuardContext):     boolean { return !!ctx.uid }

// ── Generic guards ────────────────────────────────────────────

/** Require auth */
export function guardAuth(ctx: GuardContext): GuardResult {
  if (!ctx.uid) return deny('User not authenticated', 'UNAUTHORIZED')
  return ALLOW
}

/** Require admin role */
export function guardAdmin(ctx: GuardContext): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (!isAdmin(ctx)) return deny('Admin role required', 'WRONG_ROLE')
  return ALLOW
}

/** Require manager-or-above role */
export function guardManager(ctx: GuardContext): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (!isManager(ctx)) return deny('Manager role required', 'WRONG_ROLE')
  return ALLOW
}

/** Require caller to own this pharmacyId or be admin */
export function guardPharmacyAccess(ctx: GuardContext, pharmacyId: string): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (isAdmin(ctx)) return ALLOW
  if (!ctx.pharmacyId) return deny('No branch assigned to this user', 'WRONG_BRANCH')
  if (ctx.pharmacyId !== pharmacyId) return deny(`Access denied: branch mismatch`, 'WRONG_BRANCH')
  return ALLOW
}

/** Require userId to match caller — prevents impersonation */
export function guardOwnUserId(ctx: GuardContext, userId: string): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (userId !== ctx.uid && !isAdmin(ctx)) return deny('Cannot write data for another user', 'UNAUTHORIZED')
  return ALLOW
}

/** Require date is not in the future */
export function guardNotFutureDate(date: string): GuardResult {
  const today = new Date().toISOString().split('T')[0]
  if (date > today) return deny(`Date ${date} is in the future`, 'EXPIRED')
  return ALLOW
}

/** Require all required fields are present */
export function guardRequiredFields(
  data:     Record<string, unknown>,
  required: string[],
): GuardResult {
  const missing = required.filter((f) => data[f] == null || data[f] === '')
  if (missing.length > 0) {
    return deny(`Missing required fields: ${missing.join(', ')}`, 'MISSING_FIELD')
  }
  return ALLOW
}

// ── Compound guards ───────────────────────────────────────────

/** Guard for writing a KPI entry */
export function guardKpiEntryWrite(
  ctx:     GuardContext,
  payload: { userId: string; pharmacyId: string; date: string },
): GuardResult {
  const checks: GuardResult[] = [
    guardAuth(ctx),
    guardOwnUserId(ctx, payload.userId),
    guardPharmacyAccess(ctx, payload.pharmacyId),
    guardNotFutureDate(payload.date),
    guardRequiredFields(payload, ['userId', 'pharmacyId', 'date']),
  ]
  return checks.find((c) => !c.allowed) ?? ALLOW
}

/** Guard for writing a target */
export function guardTargetWrite(
  ctx:     GuardContext,
  payload: { pharmacyId: string },
): GuardResult {
  const mgr = guardManager(ctx)
  if (!mgr.allowed) return mgr
  return guardPharmacyAccess(ctx, payload.pharmacyId)
}

/** Guard for reading another user's data */
export function guardUserRead(ctx: GuardContext, targetUserId: string): GuardResult {
  if (isManager(ctx)) return ALLOW
  return guardOwnUserId(ctx, targetUserId)
}

// ── Guard combinator: run first failing guard ─────────────────
export function runGuards(...guards: GuardResult[]): GuardResult {
  return guards.find((g) => !g.allowed) ?? ALLOW
}

// ── Throw-on-deny helper (for service layer) ──────────────────
export function assertGuard(result: GuardResult, context?: string): void {
  if (!result.allowed) {
    const prefix = context ? `[${context}] ` : ''
    throw new Error(`${prefix}Access denied: ${result.reason} (${result.code})`)
  }
}

// ── RBAC Phase 1: Territory-aware context ─────────────────────
// Extended context used by territory guards.
// All new fields are optional — existing GuardContext objects remain valid.

export interface TerritoryGuardContext extends GuardContext {
  districtId?:  string | null   // district_supervisor's assigned district
  regionIds?:   string[]        // regional_manager's assigned regions
}

// ── RBAC Phase 1: Territory guard helpers ─────────────────────
// These guards are ADVISORY infrastructure — Firestore rules are the authority.
// Phase 1 defines the guard signatures and logic.
// Phase 2 will wire them into route and service enforcement.

/**
 * Guard for district-level access.
 * Admin passes unconditionally.
 * district_supervisor passes only if they own this district.
 * Other roles are denied (they use branch-level guards instead).
 *
 * Phase 1: Used by district service writes — not yet wired to routes.
 */
export function guardDistrictAccess(
  ctx:        TerritoryGuardContext,
  districtId: string,
): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (isAdmin(ctx)) return ALLOW
  if (!isSupervisor(ctx)) {
    return deny('District access requires district_supervisor or admin role', 'WRONG_ROLE')
  }
  if (!ctx.districtId) {
    return deny('No district assigned to this supervisor', 'WRONG_BRANCH')
  }
  if (ctx.districtId !== districtId) {
    return deny('Access denied: district mismatch', 'WRONG_BRANCH')
  }
  return ALLOW
}

/**
 * Guard for regional-level access.
 * Admin passes unconditionally.
 * regional_manager passes if the given regionId is in their regionIds array.
 * Other roles are denied.
 *
 * Phase 1: Used by region service writes — not yet wired to routes.
 */
export function guardRegionalAccess(
  ctx:      TerritoryGuardContext,
  regionId: string,
): GuardResult {
  const auth = guardAuth(ctx)
  if (!auth.allowed) return auth
  if (isAdmin(ctx)) return ALLOW
  if (!isRegionalManager(ctx)) {
    return deny('Regional access requires regional_manager or admin role', 'WRONG_ROLE')
  }
  const regions = ctx.regionIds || []
  if (regions.length === 0) {
    return deny('No regions assigned to this manager', 'WRONG_BRANCH')
  }
  if (!regions.includes(regionId)) {
    return deny('Access denied: region not in assigned territories', 'WRONG_BRANCH')
  }
  return ALLOW
}
