// ============================================================
// AI Provider Connector — Request Types (Phase 8B)
//
// TypeScript-only data model for a connector-level request. Carries
// settings (never a credential — see aiSettingsTypes.ts), the user's
// question, and the existing AssistantContext. No secrets, ever.
//
// No Firestore. No React. No executable logic. No network calls.
// ============================================================

import type { AiSettings } from './aiSettingsTypes'
import type { AssistantContext } from './assistantTypes'

export interface AiProviderConnectorRequest {
  settings: AiSettings
  question: string
  context:  AssistantContext
}
