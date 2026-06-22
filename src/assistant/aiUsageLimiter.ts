// ============================================================
// AI Usage Limiter (Phase 8E)
//
// Pure arithmetic — given current usage counts, the provider-level
// settings, and the caller's role, decides whether another AI call
// is allowed. No billing integration. No Firestore (the caller is
// responsible for sourcing the counts and persisting any increment).
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { ROLE_LIMIT_MULTIPLIER } from './aiUsageTypes'
import type { AiUsageCounts, UsageLimitCheckResult } from './aiUsageTypes'
import type { AiSettings } from './aiSettingsTypes'
import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'

function effectiveLimit(baseLimit: number, role: ProfileStudioRole): number {
  const multiplier = ROLE_LIMIT_MULTIPLIER[role] ?? 1
  return Math.floor(baseLimit * multiplier)
}

/**
 * Checks whether another AI call is allowed for this role given the
 * current usage counts and provider settings. Never throws.
 */
export function checkUsageLimit(usage: AiUsageCounts, settings: AiSettings, role: ProfileStudioRole): UsageLimitCheckResult {
  try {
    if (!settings || !settings.enabled) {
      return { allowed: false, reason: 'AI is disabled.' }
    }

    const dailyLimit = effectiveLimit(settings.dailyLimit, role)
    const monthlyLimit = effectiveLimit(settings.monthlyLimit, role)

    const dailyCount = usage?.dailyCount ?? 0
    const monthlyCount = usage?.monthlyCount ?? 0

    if (dailyLimit > 0 && dailyCount >= dailyLimit) {
      return { allowed: false, reason: 'Daily usage limit reached.', remainingDaily: 0, remainingMonthly: Math.max(0, monthlyLimit - monthlyCount) }
    }
    if (monthlyLimit > 0 && monthlyCount >= monthlyLimit) {
      return { allowed: false, reason: 'Monthly usage limit reached.', remainingDaily: Math.max(0, dailyLimit - dailyCount), remainingMonthly: 0 }
    }

    return {
      allowed: true,
      remainingDaily:   Math.max(0, dailyLimit - dailyCount),
      remainingMonthly: Math.max(0, monthlyLimit - monthlyCount),
    }
  } catch (e) {
    return { allowed: false, reason: `Usage limit check failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}
