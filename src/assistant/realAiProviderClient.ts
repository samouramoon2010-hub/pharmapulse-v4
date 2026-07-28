// ============================================================
// Real AI Provider Client (BYOK)
//
// The ONLY module in this codebase that makes a real network call to
// an AI provider. Intentionally kept outside the certified
// src/assistant/*.ts kernel list (phase7f/7g/8g/8h certification
// suites) and outside the certified AssistantPanel/badge component
// list — those suites assert the EXISTING deterministic/mock-only
// bundle never performs network I/O, which remains true. This file
// is a new, additive capability: it calls directly from the user's
// own browser to the user's own chosen provider, using a key that
// only ever lives in that browser (see personalAiKeyStore.ts) —
// never sent to our backend, never logged, never written to
// Firestore.
//
// Every request sends ONLY the already-sanitized, already-grounded
// BuiltPrompt (see promptBuilder.ts) — never raw Firestore documents,
// never unrelated user data.
// ============================================================

import type { BuiltPrompt } from './promptBuilder'
import type { PersonalAiProviderName } from './personalAiSettingsTypes'

export interface RealAiProviderRequest {
  provider: PersonalAiProviderName
  model:    string
  apiKey:   string
  prompt:   BuiltPrompt
}

export interface RealAiProviderResult {
  ok:   boolean
  text: string
}

export interface GeminiModelInfo {
  /** Normalized model id, e.g. "gemini-2.5-flash" — never carries a "models/" prefix. */
  name:        string
  displayName: string
}

/** Exact user-facing copy shown when a Gemini model id is no longer served (HTTP 404). */
export const GEMINI_MODEL_UNAVAILABLE_MESSAGE = 'The selected Gemini model is unavailable. Choose another supported model.'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Gemini's ListModels endpoint returns model ids already prefixed with
 * "models/" (e.g. "models/gemini-2.5-flash"). Strips that prefix —
 * repeatedly, in case a previously-saved setting was itself already
 * prefixed — so the generateContent URL is built with the bare model
 * id exactly once and never doubles up into "models/models/...".
 */
export function normalizeGeminiModelId(model: string): string {
  let id = typeof model === 'string' ? model.trim() : ''
  while (id.startsWith('models/')) id = id.slice('models/'.length)
  return id
}

function buildUserContent(prompt: BuiltPrompt): string {
  const evidenceLines = prompt.groundedEvidence
    .map((fact) => `- ${fact.label}: ${fact.value}`)
    .join('\n')
  return `Grounded evidence (the ONLY facts you may use):\n${evidenceLines || '(none available)'}\n\nAllowed KPI keys: ${prompt.allowedKpiKeys.join(', ') || '(none)'}\n\nQuestion: ${prompt.userQuestion}`
}

async function callOpenAi(req: RealAiProviderRequest): Promise<RealAiProviderResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: 'system', content: req.prompt.systemInstructions },
        { role: 'user', content: buildUserContent(req.prompt) },
      ],
      max_tokens: req.prompt.maxTokens,
      temperature: req.prompt.temperature,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('OpenAI response missing text')
  return { ok: true, text }
}

/**
 * Builds the Gemini generateContent URL with the model path segment
 * constructed exactly once: {base}/models/{model}:generateContent.
 * Exported only so the exact URL can be asserted in tests without a
 * real network call.
 */
export function buildGeminiGenerateContentUrl(model: string, apiKey: string): string {
  const modelId = normalizeGeminiModelId(model)
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`
}

/**
 * Pulls the answer text out of a Gemini generateContent response,
 * with a specific diagnosis for every way Gemini can return 200 OK
 * with no usable text:
 *   - promptFeedback.blockReason — the prompt itself was blocked
 *   - finishReason "SAFETY" / "RECITATION" — the model's own output was withheld
 *   - finishReason "MAX_TOKENS" — the token budget ran out (see thinkingBudget
 *     note in callGemini) before any answer text was produced
 *   - parts can be split across multiple entries (or include non-text
 *     "thought" parts) — every text part is concatenated, not just parts[0]
 * Exported so each case can be asserted directly in tests.
 */
export function extractGeminiText(data: any): string {
  const blockReason = data?.promptFeedback?.blockReason
  if (blockReason) throw new Error(`Gemini blocked the prompt (${blockReason}).`)

  const candidate    = data?.candidates?.[0]
  const finishReason = candidate?.finishReason
  const parts        = candidate?.content?.parts
  const text = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim()
    : ''

  if (text.length > 0) return text

  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    throw new Error(`Gemini withheld the response (${finishReason}).`)
  }
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini ran out of output tokens before producing a response. Try a shorter question or a different model.')
  }
  throw new Error('Gemini response missing text')
}

async function callGemini(req: RealAiProviderRequest): Promise<RealAiProviderResult> {
  const url = buildGeminiGenerateContentUrl(req.model, req.apiKey)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.prompt.systemInstructions }] },
      contents: [{ role: 'user', parts: [{ text: buildUserContent(req.prompt) }] }],
      generationConfig: {
        maxOutputTokens: req.prompt.maxTokens,
        temperature: req.prompt.temperature,
        // Gemini 2.5 models "think" by default, and thinking tokens are
        // deducted from maxOutputTokens. With the small budgets used here
        // (16–500 tokens), thinking alone can exhaust the whole budget and
        // leave zero tokens for the actual answer — which surfaces as a
        // 200 OK with no text ("Gemini response missing text") even though
        // nothing is actually wrong with the key or model. Disabling
        // thinking is correct here: explaining already-computed grounded
        // evidence needs no multi-step reasoning.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })
  if (!response.ok) {
    if (response.status === 404) throw new Error(GEMINI_MODEL_UNAVAILABLE_MESSAGE)
    throw new Error(`Gemini request failed: ${response.status}`)
  }
  const data = await response.json()
  return { ok: true, text: extractGeminiText(data) }
}

/**
 * Lists the Gemini models available to this API key and filters to
 * only those that support generateContent — the method this client
 * actually calls. Used to populate the Settings UI's model selector
 * from real, currently-served models instead of a hardcoded list.
 * Never throws on a malformed body; throws on a transport/HTTP error
 * so the caller can surface "invalid key" / "network failure" states.
 */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const url = `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Gemini model list request failed: ${response.status}`)
  const data = await response.json()
  const models = Array.isArray(data?.models) ? data.models : []
  return models
    .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m: any) => {
      const name = normalizeGeminiModelId(typeof m?.name === 'string' ? m.name : '')
      return { name, displayName: typeof m?.displayName === 'string' && m.displayName ? m.displayName : name }
    })
    .filter((m: GeminiModelInfo) => m.name.length > 0)
}

async function callClaude(req: RealAiProviderRequest): Promise<RealAiProviderResult> {
  // Anthropic's API does not send CORS headers for direct browser
  // calls in most environments — this path will typically fail with
  // a network/CORS error in-browser. Attempted anyway, best-effort,
  // because the user supplies their own key and may be running this
  // app through a proxy/extension that allows it; failures here fall
  // back to the deterministic answer exactly like any other provider
  // error, never crashing the assistant.
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model,
      system: req.prompt.systemInstructions,
      messages: [{ role: 'user', content: buildUserContent(req.prompt) }],
      max_tokens: req.prompt.maxTokens,
      temperature: req.prompt.temperature,
    }),
  })
  if (!response.ok) throw new Error(`Claude request failed: ${response.status}`)
  const data = await response.json()
  const text = data?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('Claude response missing text')
  return { ok: true, text }
}

/**
 * Calls the user's own provider with the user's own key, directly
 * from the browser. Never reads/writes Firestore. Throws on any
 * network or provider-side failure — callers must catch and fall
 * back to the deterministic answer.
 */
export async function callRealAiProvider(req: RealAiProviderRequest): Promise<RealAiProviderResult> {
  if (req.provider === 'openai') return callOpenAi(req)
  if (req.provider === 'gemini') return callGemini(req)
  if (req.provider === 'claude') return callClaude(req)
  throw new Error(`Unsupported provider: ${req.provider}`)
}
