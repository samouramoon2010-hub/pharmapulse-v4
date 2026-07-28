// ============================================================
// Personal AI Connector (BYOK)
//
// Dispatch boundary between AssistantPanel and the real, user-owned
// AI provider. Mirrors the shape of the existing mock-only
// connectToProvider() (aiProviderConnector.ts) so AssistantPanel can
// treat both paths uniformly, but this one actually calls out to the
// network via realAiProviderClient.ts using the user's own stored
// key (personalAiKeyStore.ts) — never our backend, never Firestore.
//
// The prompt sent to the provider is built exclusively by the
// existing, certified buildPrompt() kernel (promptBuilder.ts), so the
// grounding/sanitization guarantees already enforced for the org-wide
// mock path apply identically here. Any response is then re-validated
// by the existing validateAiResponse() kernel before this module ever
// reports it as usable — an ungrounded or unsafe response is reported
// as a failure, never surfaced as text.
// ============================================================

import { buildPrompt } from './promptBuilder'
import { validateAiResponse } from './aiResponseValidator'
import { callRealAiProvider, GEMINI_MODEL_UNAVAILABLE_MESSAGE } from './realAiProviderClient'
import type { BuiltPrompt } from './promptBuilder'
import type { PersonalAiSettings } from './personalAiSettingsTypes'
import type { AssistantContext } from './assistantTypes'

export type PersonalAiConnectorStatus = 'disabled' | 'live' | 'provider_unavailable' | 'invalid_response' | 'model_unavailable'

export interface PersonalAiConnectorRequest {
  settings: PersonalAiSettings | null | undefined
  question: unknown
  context:  AssistantContext
}

export interface PersonalAiConnectorResponse {
  status:   PersonalAiConnectorStatus
  text:     string
  provider: string
  model:    string
}

/**
 * Connects to the user's own AI provider with the user's own key.
 * Never throws — any failure (missing key, network error, provider
 * error, failed grounding validation) resolves to a status the caller
 * can fall back from, exactly like the mock connector.
 */
export async function connectToPersonalAi(request: PersonalAiConnectorRequest): Promise<PersonalAiConnectorResponse> {
  const settings = request?.settings

  if (!settings || !settings.enabled || !settings.apiKey) {
    return {
      status: 'disabled',
      text: 'Personal AI is not connected. Showing the deterministic answer.',
      provider: settings?.provider ?? '',
      model: settings?.model ?? '',
    }
  }

  try {
    const prompt = buildPrompt(request.question, request.context, { maxTokens: 500, temperature: 0.2 })
    const result = await callRealAiProvider({
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey,
      prompt,
    })

    const validation = validateAiResponse({ text: result.text }, request.context)
    if (!validation.valid) {
      return {
        status: 'invalid_response',
        text: 'Your AI provider returned a response that could not be safely grounded. Showing the deterministic answer.',
        provider: settings.provider,
        model: settings.model,
      }
    }

    return { status: 'live', text: result.text, provider: settings.provider, model: settings.model }
  } catch (e) {
    if (e instanceof Error && e.message === GEMINI_MODEL_UNAVAILABLE_MESSAGE) {
      return { status: 'model_unavailable', text: GEMINI_MODEL_UNAVAILABLE_MESSAGE, provider: settings.provider, model: settings.model }
    }
    return {
      status: 'provider_unavailable',
      text: 'Could not reach your AI provider. Showing the deterministic answer.',
      provider: settings.provider,
      model: settings.model,
    }
  }
}

/**
 * Lightweight credential smoke test used by the Settings UI — sends
 * a trivial, evidence-free prompt (no AssistantContext exists on the
 * Settings page) just to confirm the key/model/provider combination
 * is reachable. Never throws.
 */
export async function testPersonalAiConnection(settings: PersonalAiSettings): Promise<{ ok: boolean; message: string }> {
  if (!settings.apiKey) return { ok: false, message: 'Enter an API key first.' }

  const testPrompt: BuiltPrompt = {
    systemInstructions: 'Reply with the single word: connected.',
    groundedEvidence: [],
    allowedKpiKeys: [],
    userQuestion: 'Reply with the single word: connected.',
    maxTokens: 16,
    temperature: 0,
  }

  try {
    const result = await callRealAiProvider({
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey,
      prompt: testPrompt,
    })
    return { ok: true, message: result.text.trim().slice(0, 120) || 'Connected.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Connection failed.' }
  }
}
