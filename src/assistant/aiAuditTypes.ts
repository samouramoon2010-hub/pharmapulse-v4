// ============================================================
// AI Audit — Types (Phase 8F)
//
// TypeScript-only data model for an AI interaction audit entry. No
// raw API keys, no secrets — only metadata about the interaction.
//
// No Firestore. No React. No executable logic.
// ============================================================

import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'
import type { QuestionIntent } from './questionIntentTypes'
import type { AiConnectorStatus } from './aiProviderResponse'

export type AiAuditGroundingStatus = 'grounded' | 'ungrounded' | 'not_applicable'

export interface AiAuditLogEntry {
  userId:           string
  role:             ProfileStudioRole
  provider:         string
  model:            string
  questionIntent:   QuestionIntent
  contextHash:      string
  responseStatus:   AiConnectorStatus | 'validated' | 'fallback'
  groundingStatus:  AiAuditGroundingStatus
  safetyViolations: string[]
  timestamp:        string
}
