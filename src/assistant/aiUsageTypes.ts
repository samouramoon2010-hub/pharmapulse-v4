// ============================================================
// AI Usage — Types (Phase 8E)
//
// TypeScript-only data model for usage-limit checking. No billing
// integration — this is purely counting and comparison against the
// configured limits.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'

export interface AiUsageCounts {
  dailyCount:   number
  monthlyCount: number
}

export interface UsageLimitCheckResult {
  allowed:          boolean
  reason?:          string
  remainingDaily?:  number
  remainingMonthly?: number
}

/** Per-role usage multiplier applied on top of the provider-level daily/monthly limits. */
export const ROLE_LIMIT_MULTIPLIER: Record<ProfileStudioRole, number> = {
  admin:               1,
  general_manager:     1,
  district_supervisor: 0.5,
  manager:             0.5,
  pharmacist:          0.25,
}
