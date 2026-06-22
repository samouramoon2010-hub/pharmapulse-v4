// ============================================================
// Assistant — AI Provider Types (Phase 7D)
//
// TypeScript-only data model for a future provider abstraction.
// Deliberately has NO field for an API key or secret — this bundle
// stores no credentials anywhere. BYOK/secret handling is explicitly
// deferred to Bundle 8.
//
// No Firestore. No React. No executable logic. No network calls.
// ============================================================

import type { AssistantContext } from './assistantTypes'

/** Recognised provider identifiers for future integration — none are wired up yet. */
export type AiProviderName = 'openai' | 'gemini' | 'claude' | 'openrouter' | 'byok' | 'mock'

/** Provider selection only — intentionally has no apiKey/secret/token field. */
export interface AiProviderConfig {
  provider: AiProviderName
}

export interface AiProviderRequest {
  prompt:  string
  context: AssistantContext
}

export interface AiProviderResponse {
  text:     string
  provider: AiProviderName
  /** Always true in this bundle — there is no real provider call yet. */
  mocked:   true
}
