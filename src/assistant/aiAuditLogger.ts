// ============================================================
// AI Audit Logger (Phase 8F)
//
// Pure builder for AI interaction audit entries. No Firestore I/O —
// persisting an entry is the caller's responsibility via an existing,
// already-permissioned service (this module only shapes the data).
// Never includes a raw API key or secret.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import type { AiAuditLogEntry, AiAuditGroundingStatus } from './aiAuditTypes'
import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'
import type { QuestionIntent } from './questionIntentTypes'
import type { AssistantContext } from './assistantTypes'
import type { AiConnectorStatus } from './aiProviderResponse'

/**
 * Deterministic content-identity hash for correlating an audit entry
 * with the context it was generated from. This is NOT a security
 * hash and is unrelated to the profile-integrity hash kernel — it
 * exists purely so two audit entries can be compared for "same
 * underlying data" without storing the full context. Never throws.
 */
export function hashAssistantContext(context: AssistantContext): string {
  try {
    const payload = JSON.stringify({
      entityId: context?.entityId, profileId: context?.profileId, profileVersion: context?.profileVersion,
      periodId: context?.periodId, score: context?.ledgerEntry?.score,
    })
    let hash = 5381
    for (let i = 0; i < payload.length; i++) {
      hash = ((hash << 5) + hash) + payload.charCodeAt(i)
      hash = hash & hash
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  } catch {
    return '00000000'
  }
}

export interface BuildAiAuditLogEntryInput {
  userId:           string
  role:             ProfileStudioRole
  provider:         string
  model:            string
  questionIntent:   QuestionIntent
  context:          AssistantContext
  responseStatus:   AiConnectorStatus | 'validated' | 'fallback'
  groundingStatus:  AiAuditGroundingStatus
  safetyViolations?: string[]
}

/**
 * Builds a well-formed audit log entry. Never includes an API key or
 * secret field — the input shape has none, and this function adds
 * none. Never throws.
 */
export function buildAiAuditLogEntry(input: BuildAiAuditLogEntryInput): AiAuditLogEntry {
  try {
    return {
      userId:           input.userId,
      role:             input.role,
      provider:         input.provider,
      model:            input.model,
      questionIntent:   input.questionIntent,
      contextHash:      hashAssistantContext(input.context),
      responseStatus:   input.responseStatus,
      groundingStatus:  input.groundingStatus,
      safetyViolations: [...(input.safetyViolations ?? [])],
      timestamp:        new Date().toISOString(),
    }
  } catch {
    return {
      userId: input?.userId ?? '', role: input?.role ?? 'pharmacist', provider: input?.provider ?? '',
      model: input?.model ?? '', questionIntent: 'unknown', contextHash: '00000000',
      responseStatus: 'fallback', groundingStatus: 'not_applicable', safetyViolations: [],
      timestamp: new Date().toISOString(),
    }
  }
}
