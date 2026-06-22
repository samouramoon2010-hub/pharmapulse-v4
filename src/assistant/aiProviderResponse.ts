// ============================================================
// AI Provider Connector — Response Types (Phase 8B)
//
// TypeScript-only data model for a connector-level response. Every
// response carries an explicit status so the UI/caller always knows
// whether it's looking at a mocked answer, a disabled-state message,
// or an unavailable-provider message — never an ambiguous result.
//
// No Firestore. No React. No executable logic. No network calls.
// ============================================================

import type { AiSettingsProviderName } from './aiSettingsTypes'

export type AiConnectorStatus = 'mocked' | 'disabled' | 'provider_unavailable'

export interface AiProviderConnectorResponse {
  status:   AiConnectorStatus
  text:     string
  provider: AiSettingsProviderName
  model:    string
}
