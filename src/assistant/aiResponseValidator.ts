// ============================================================
// AI Response Validator (Phase 8D)
//
// Validates a (mocked, in this bundle) AI response against the same
// deterministic context the prompt was built from, reusing the
// existing Phase 7 safety guards and Phase 8D grounding helpers
// rather than redefining any of that logic.
//
// If validation fails, the caller (AssistantPanel) must fall back to
// the deterministic buildAnswer() output — this module never decides
// to "trust" an ungrounded response itself; it only reports validity.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import {
  checkNoSecretsInText, checkNoMutationLanguage, checkNoFirestoreReferences, checkNoSelfReportedCalculation,
} from './aiSafetyGuards'
import {
  areKpiClaimsGrounded, listUngroundedKpiClaims, areNumericClaimsGrounded, isRankClaimGrounded, isRecommendationClaimGrounded,
} from './aiResponseGrounding'
import type { ClaimedNumber } from './aiResponseGrounding'
import type { AssistantContext } from './assistantTypes'

export interface AiResponseClaims {
  text:                       string
  claimedKpiKeys?:            string[]
  claimedNumbers?:            ClaimedNumber[]
  claimedRank?:               number
  claimedRecommendationTitle?: string
}

export interface AiResponseValidationIssue {
  rule:    string
  message: string
}

export interface AiResponseValidationResult {
  valid:  boolean
  issues: AiResponseValidationIssue[]
}

const HIDDEN_ACTION_PATTERNS = [
  /\bi will now\b/i, /\blet me update\b/i, /\bexecuting (action|command)\b/i,
  /\bi am (going to|about to) (save|write|update|delete)\b/i,
]

/** Flags any phrase implying the AI is about to take a hidden action. Never throws. */
export function checkNoHiddenActionInstructions(text: unknown): boolean {
  try {
    const value = typeof text === 'string' ? text : ''
    return !HIDDEN_ACTION_PATTERNS.some((p) => p.test(value))
  } catch {
    return false
  }
}

/**
 * Validates an AI response's claims against the context. Never throws.
 * Returns { valid: false, issues } whenever the response should be
 * discarded in favor of the deterministic fallback answer.
 */
export function validateAiResponse(response: AiResponseClaims, context: AssistantContext): AiResponseValidationResult {
  const issues: AiResponseValidationIssue[] = []
  try {
    const text = response?.text ?? ''

    if (!checkNoSecretsInText(text).safe) {
      issues.push({ rule: 'no_secrets', message: 'Response contains a credential-like pattern.' })
    }
    if (!checkNoMutationLanguage(text).safe) {
      issues.push({ rule: 'no_profile_mutation_request', message: 'Response claims a mutation occurred.' })
    }
    if (!checkNoFirestoreReferences(text).safe) {
      issues.push({ rule: 'no_firestore_writes', message: 'Response references a Firestore write call.' })
    }
    if (!checkNoSelfReportedCalculation(text).safe) {
      issues.push({ rule: 'no_scoring_duplication', message: 'Response claims the AI itself performed a calculation.' })
    }
    if (!checkNoHiddenActionInstructions(text)) {
      issues.push({ rule: 'no_hidden_actions', message: 'Response implies a hidden action will be taken.' })
    }
    if (!areKpiClaimsGrounded(context, response?.claimedKpiKeys)) {
      issues.push({ rule: 'no_unsupported_kpi', message: `Response references unsupported KPI key(s): ${listUngroundedKpiClaims(context, response?.claimedKpiKeys).join(', ')}.` })
    }
    if (!areNumericClaimsGrounded(context, response?.claimedNumbers)) {
      issues.push({ rule: 'no_unsupported_numeric_claim', message: 'Response makes a numeric claim that does not match the grounded context.' })
    }
    if (!isRankClaimGrounded(context, response?.claimedRank)) {
      issues.push({ rule: 'no_invented_ranking', message: 'Response claims a rank that does not match the grounded ranking.' })
    }
    if (!isRecommendationClaimGrounded(context, response?.claimedRecommendationTitle)) {
      issues.push({ rule: 'no_unsafe_recommendation', message: 'Response references a recommendation that is not present in the grounded context.' })
    }

    return { valid: issues.length === 0, issues }
  } catch (e) {
    return { valid: false, issues: [{ rule: 'validation_threw', message: `Validation failed: ${e instanceof Error ? e.message : String(e)}` }] }
  }
}
