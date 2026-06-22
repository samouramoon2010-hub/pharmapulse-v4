// ============================================================
// AI Response Grounding (Phase 8D)
//
// Checks an AI response's claims against the same deterministic
// AssistantContext the prompt was built from. Reuses
// assistantGrounding's KPI/entity lookups rather than redefining
// them — there is exactly one grounding implementation.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import { isKpiKeyGrounded, extractGroundedFacts } from './assistantGrounding'
import type { AssistantContext } from './assistantTypes'

export interface ClaimedNumber {
  label: string
  value: number
}

/** True when every claimed KPI key is actually grounded in the context. Never throws. */
export function areKpiClaimsGrounded(context: AssistantContext, claimedKpiKeys: string[] = []): boolean {
  try {
    return (claimedKpiKeys ?? []).every((k) => isKpiKeyGrounded(context, k))
  } catch {
    return false
  }
}

/** Returns the subset of claimed KPI keys that are NOT grounded (i.e. hallucinated). Never throws. */
export function listUngroundedKpiClaims(context: AssistantContext, claimedKpiKeys: string[] = []): string[] {
  try {
    return (claimedKpiKeys ?? []).filter((k) => !isKpiKeyGrounded(context, k))
  } catch {
    return [...(claimedKpiKeys ?? [])]
  }
}

/**
 * True when every claimed number matches (within a small tolerance) a
 * real grounded fact with the same label. Never throws.
 */
export function areNumericClaimsGrounded(context: AssistantContext, claimedNumbers: ClaimedNumber[] = [], tolerance = 0.05): boolean {
  try {
    const facts = extractGroundedFacts(context)
    return (claimedNumbers ?? []).every((claim) => {
      const fact = facts.find((f) => f.label === claim.label)
      if (!fact || typeof fact.value !== 'number') return false
      return Math.abs(fact.value - claim.value) <= tolerance
    })
  } catch {
    return false
  }
}

/** True when a claimed rank matches the context's own rankingEntry.rank exactly. Never throws. */
export function isRankClaimGrounded(context: AssistantContext, claimedRank?: number): boolean {
  try {
    if (claimedRank === undefined) return true
    return context?.rankingEntry?.rank === claimedRank
  } catch {
    return false
  }
}

/** True when a claimed recommendation title exists in the context's recommendations. Never throws. */
export function isRecommendationClaimGrounded(context: AssistantContext, claimedTitle?: string): boolean {
  try {
    if (!claimedTitle) return true
    return (context?.recommendations?.items ?? []).some((r) => r.title === claimedTitle)
  } catch {
    return false
  }
}
