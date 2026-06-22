// ============================================================
// Assistant — AI Provider Adapter (Phase 7D)
//
// MOCK-ONLY. Regardless of which provider name is requested, this
// adapter never makes a network call and never reads a credential —
// it always delegates entirely to the existing deterministic
// answerBuilder and labels the response `mocked: true`.
//
// Real provider integration (network calls, BYOK, API keys) is
// explicitly out of scope for this bundle and is deferred to
// Bundle 8, per the spec's guardrails.
//
// No Firestore. No React. No UI. No network calls. No secrets.
// ============================================================

import { buildAnswer } from './answerBuilder'
import type { AiProviderRequest, AiProviderResponse, AiProviderName } from './aiProviderTypes'

const SUPPORTED_PROVIDERS: AiProviderName[] = ['openai', 'gemini', 'claude', 'openrouter', 'byok', 'mock']

/**
 * Returns a mock AI provider response by delegating to the existing
 * deterministic answer builder. Never performs a network call, never
 * reads an API key, and never throws.
 */
export function callAiProvider(request: AiProviderRequest, provider: AiProviderName = 'mock'): AiProviderResponse {
  try {
    const resolvedProvider = SUPPORTED_PROVIDERS.includes(provider) ? provider : 'mock'
    const answer = buildAnswer(request?.prompt, request?.context)
    return { text: answer.text, provider: resolvedProvider, mocked: true }
  } catch {
    return { text: 'Unable to generate a response.', provider: 'mock', mocked: true }
  }
}

/** Lists the provider identifiers this abstraction recognises (none are live yet). */
export function listSupportedProviders(): AiProviderName[] {
  return [...SUPPORTED_PROVIDERS]
}
