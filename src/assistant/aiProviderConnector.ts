// ============================================================
// AI Provider Connector (Phase 8B)
//
// Secure abstraction boundary between the deterministic assistant
// and any future real AI provider. No secure backend exists yet, so
// real calls stay disabled — this connector NEVER makes a network
// request. It only ever:
//   - returns a "disabled" response when settings.enabled is false
//   - returns a "provider_unavailable" response on any internal error
//   - otherwise delegates to the existing Phase 7 callAiProvider()
//     mock adapter and reports status "mocked"
//
// React components must never call a provider directly — this is the
// only module a future caller may import for that purpose, and it is
// designed to be called from a service layer, not from inside a
// component body (components only ever go through AssistantPanel's
// existing deterministic flow in this bundle).
//
// No Firestore. No React. No UI. No secrets. No network calls.
// ============================================================

import { callAiProvider } from './aiProviderAdapter'
import type { AiProviderConnectorRequest } from './aiProviderRequest'
import type { AiProviderConnectorResponse } from './aiProviderResponse'

/**
 * Connects to an AI provider through the mock-only adapter. Never
 * throws, never performs a network call, never reads a credential.
 */
export function connectToProvider(request: AiProviderConnectorRequest): AiProviderConnectorResponse {
  try {
    const settings = request?.settings

    if (!settings || !settings.enabled) {
      return {
        status: 'disabled',
        text: 'AI assistance is currently disabled. Showing the deterministic answer.',
        provider: settings?.provider ?? 'openai',
        model: settings?.model ?? '',
      }
    }

    const mock = callAiProvider({ prompt: request.question, context: request.context }, settings.provider as any)

    return { status: 'mocked', text: mock.text, provider: settings.provider, model: settings.model }
  } catch {
    return {
      status: 'provider_unavailable',
      text: 'The AI provider is currently unavailable. Showing the deterministic answer.',
      provider: request?.settings?.provider ?? 'openai',
      model: request?.settings?.model ?? '',
    }
  }
}
