// ============================================================
// Personal AI Settings — Types (BYOK)
//
// Each user may connect their OWN AI provider account to their OWN
// browser session. This is a deliberately separate type from
// AiSettings (aiSettingsTypes.ts), which models a credential-free,
// admin-controlled org-wide policy. PersonalAiSettings is the
// opposite: per-user, user-editable, and the ONLY place in this
// codebase that legitimately carries a raw API key — because that
// key is never sent to our backend or Firestore, only stored in the
// user's own browser (localStorage) and used for direct
// browser-to-provider calls billed to the user's own account.
//
// No Firestore. No React. No executable logic. No network calls.
// ============================================================

export type PersonalAiProviderName = 'openai' | 'gemini' | 'claude'

export interface PersonalAiSettings {
  provider: PersonalAiProviderName
  model:    string
  apiKey:   string
  enabled:  boolean
}

export const PERSONAL_AI_PROVIDER_DEFAULT_MODEL: Record<PersonalAiProviderName, string> = {
  openai: 'gpt-4o-mini',
  // gemini-1.5-flash was retired by Google and now returns HTTP 404 —
  // gemini-2.5-flash is the current supported default. The model is
  // still fully user-configurable (see realAiProviderClient.ts's
  // listGeminiModels()), this is only the initial value.
  gemini: 'gemini-2.5-flash',
  claude: 'claude-3-5-haiku-latest',
}

export const PERSONAL_AI_PROVIDER_LABEL: Record<PersonalAiProviderName, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
}

export function createEmptyPersonalAiSettings(provider: PersonalAiProviderName = 'openai'): PersonalAiSettings {
  return { provider, model: PERSONAL_AI_PROVIDER_DEFAULT_MODEL[provider], apiKey: '', enabled: false }
}
