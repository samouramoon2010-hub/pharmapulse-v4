// ============================================================
// Access Guard
// Client-side authorization layer — supplements Firestore rules.
// Use before any write to catch errors BEFORE network round-trip.
//
// These are ADVISORY guards — Firestore rules are the authority.
// Never rely solely on client-side guards for security.
// ============================================================

export type UserRole = 'admin' | 'manager' | 'pharmacist'

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

// ── Role helpers ──────────────────────────────────────────────

export function isAdmin(ctx: GuardContext):   boolean { return ctx.role === 'admin' }
export function isManager(ctx: GuardContext): boolean { return ctx.role === 'admin' || ctx.role === 'manager' }
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
