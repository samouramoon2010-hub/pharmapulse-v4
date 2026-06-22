// ============================================================
// AI Settings — Types (Phase 8A)
//
// TypeScript-only data model for BYOK provider settings. Deliberately
// has NO field for an API key, secret, or token — raw credentials
// are not stored in Firestore in this phase (deferred to a future
// secure-backend bundle).
//
// No Firestore. No React. No executable logic. No network calls.
// ============================================================

export type AiSettingsProviderName = 'openai' | 'gemini' | 'claude' | 'openrouter' | 'custom'
export type AiSafetyMode = 'strict' | 'standard'

/** Provider/usage configuration only — never a credential. */
export interface AiSettings {
  provider:      AiSettingsProviderName
  model:         string
  enabled:       boolean
  dailyLimit:    number
  monthlyLimit:  number
  maxTokens:     number
  temperature:   number
  safetyMode:    AiSafetyMode
  auditEnabled:  boolean
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider:     'openai',
  model:        'gpt-4o-mini',
  enabled:      false,
  dailyLimit:   50,
  monthlyLimit: 1000,
  maxTokens:    500,
  temperature:  0.2,
  safetyMode:   'strict',
  auditEnabled: true,
}
