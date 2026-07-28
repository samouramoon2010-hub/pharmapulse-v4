// ============================================================
// Personal AI (BYOK) — focused tests
//
// Covers: localStorage-only settings round-trip, the real provider
// client's request shaping (via a mocked global.fetch — no real
// network call is ever made in tests), and the connector's status
// mapping (disabled / live / invalid_response / provider_unavailable).
//
// This project's default vitest environment is plain Node (no jsdom),
// so `window` does not exist unless a test defines it — exercised
// directly here, matching the "genuine SSR-equivalent" convention
// used by the rest of this repo's certification suites.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  loadPersonalAiSettings, savePersonalAiSettings, clearPersonalAiSettings,
} from './personalAiKeyStore'
import {
  createEmptyPersonalAiSettings, PERSONAL_AI_PROVIDER_DEFAULT_MODEL, PERSONAL_AI_PROVIDER_LABEL,
} from './personalAiSettingsTypes'
import type { PersonalAiSettings } from './personalAiSettingsTypes'
import {
  callRealAiProvider, buildGeminiGenerateContentUrl, normalizeGeminiModelId,
  listGeminiModels, GEMINI_MODEL_UNAVAILABLE_MESSAGE, extractGeminiText,
} from './realAiProviderClient'
import type { BuiltPrompt } from './promptBuilder'
import { connectToPersonalAi, testPersonalAiConnection } from './personalAiConnector'
import type { AssistantContext } from './assistantTypes'

// ── In-memory localStorage polyfill (no jsdom in this project's default vitest env) ──
function installFakeLocalStorage() {
  const store = new Map<string, string>()
  const fakeStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as any).window = { localStorage: fakeStorage }
  return fakeStorage
}

function uninstallFakeLocalStorage() {
  delete (globalThis as any).window
}

const MINIMAL_CONTEXT: AssistantContext = {
  entityId: 'b1', entityType: 'branch', profileId: 'p1', profileVersion: 'v1',
  periodId: '2026-06', generatedAt: new Date().toISOString(),
} as AssistantContext

describe('personalAiSettingsTypes — defaults', () => {
  it('createEmptyPersonalAiSettings defaults to openai, disabled, empty key', () => {
    const s = createEmptyPersonalAiSettings()
    expect(s).toEqual({ provider: 'openai', model: PERSONAL_AI_PROVIDER_DEFAULT_MODEL.openai, apiKey: '', enabled: false })
  })
  it('createEmptyPersonalAiSettings respects a different default provider', () => {
    const s = createEmptyPersonalAiSettings('gemini')
    expect(s.provider).toBe('gemini')
    expect(s.model).toBe(PERSONAL_AI_PROVIDER_DEFAULT_MODEL.gemini)
  })
  it('every provider has a default model and a label', () => {
    for (const provider of ['openai', 'gemini', 'claude'] as const) {
      expect(typeof PERSONAL_AI_PROVIDER_DEFAULT_MODEL[provider]).toBe('string')
      expect(typeof PERSONAL_AI_PROVIDER_LABEL[provider]).toBe('string')
    }
  })
})

describe('personalAiKeyStore — localStorage-only persistence', () => {
  afterEach(() => uninstallFakeLocalStorage())

  it('loadPersonalAiSettings returns null when no window/localStorage exists (this project\'s default Node test env)', () => {
    expect(loadPersonalAiSettings()).toBeNull()
  })
  it('savePersonalAiSettings returns false when no window/localStorage exists', () => {
    expect(savePersonalAiSettings(createEmptyPersonalAiSettings())).toBe(false)
  })
  it('clearPersonalAiSettings returns false when no window/localStorage exists', () => {
    expect(clearPersonalAiSettings()).toBe(false)
  })
  it('saves and loads settings round-trip exactly', () => {
    installFakeLocalStorage()
    const settings: PersonalAiSettings = { provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'AIza-test-key', enabled: true }
    expect(savePersonalAiSettings(settings)).toBe(true)
    expect(loadPersonalAiSettings()).toEqual(settings)
  })
  it('clears settings so a subsequent load returns null', () => {
    installFakeLocalStorage()
    savePersonalAiSettings(createEmptyPersonalAiSettings())
    expect(loadPersonalAiSettings()).not.toBeNull()
    expect(clearPersonalAiSettings()).toBe(true)
    expect(loadPersonalAiSettings()).toBeNull()
  })
  it('returns null for malformed stored JSON rather than throwing', () => {
    const fake = installFakeLocalStorage()
    fake.setItem('pharmapulse.personalAiSettings.v1', '{not json')
    expect(loadPersonalAiSettings()).toBeNull()
  })
  it('returns null when the stored object is missing required fields', () => {
    const fake = installFakeLocalStorage()
    fake.setItem('pharmapulse.personalAiSettings.v1', JSON.stringify({ enabled: true }))
    expect(loadPersonalAiSettings()).toBeNull()
  })
  it('defaults apiKey to empty string and enabled to false when those fields are missing', () => {
    const fake = installFakeLocalStorage()
    fake.setItem('pharmapulse.personalAiSettings.v1', JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini' }))
    expect(loadPersonalAiSettings()).toEqual({ provider: 'openai', model: 'gpt-4o-mini', apiKey: '', enabled: false })
  })
})

describe('realAiProviderClient — request shaping (mocked fetch, no real network call)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const PROMPT: BuiltPrompt = {
    systemInstructions: 'sys', groundedEvidence: [{ label: 'Score', value: 91, source: 'ledger' }],
    allowedKpiKeys: ['fillRate'], userQuestion: 'why?', maxTokens: 200, temperature: 0.1,
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    ;(globalThis as any).fetch = fetchMock
  })
  afterEach(() => {
    delete (globalThis as any).fetch
  })

  it('calls the OpenAI chat completions endpoint with the Bearer key and returns the message content', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'hello from openai' } }] }) })
    const result = await callRealAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', prompt: PROMPT })
    expect(result).toEqual({ ok: true, text: 'hello from openai' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.messages[1].content).toContain('why?')
  })

  it('calls the Gemini generateContent endpoint with the key in the query string', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] }) })
    const result = await callRealAiProvider({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'AIza-test', prompt: PROMPT })
    expect(result).toEqual({ ok: true, text: 'hello from gemini' })
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('generativelanguage.googleapis.com')
    expect(url).toContain('key=AIza-test')
  })

  it('calls the Claude messages endpoint with the x-api-key header', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: 'hello from claude' }] }) })
    const result = await callRealAiProvider({ provider: 'claude', model: 'claude-3-5-haiku-latest', apiKey: 'sk-ant-test', prompt: PROMPT })
    expect(result).toEqual({ ok: true, text: 'hello from claude' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
  })

  it('throws when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    await expect(callRealAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'bad', prompt: PROMPT })).rejects.toThrow()
  })

  it('throws when the response body has no text field', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await expect(callRealAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', prompt: PROMPT })).rejects.toThrow()
  })
})

describe('personalAiConnector — status mapping', () => {
  afterEach(() => { delete (globalThis as any).fetch })

  it('reports "disabled" when settings are null', async () => {
    const result = await connectToPersonalAi({ settings: null, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('disabled')
  })
  it('reports "disabled" when enabled is false', async () => {
    const result = await connectToPersonalAi({ settings: { ...createEmptyPersonalAiSettings(), apiKey: 'sk-x', enabled: false }, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('disabled')
  })
  it('reports "disabled" when no apiKey is set, even if enabled is true', async () => {
    const result = await connectToPersonalAi({ settings: { ...createEmptyPersonalAiSettings(), apiKey: '', enabled: true }, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('disabled')
  })
  it('reports "provider_unavailable" when the network call throws', async () => {
    ;(globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await connectToPersonalAi({ settings: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-x', enabled: true }, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('provider_unavailable')
  })
  it('reports "live" with the provider text when the call succeeds and the response is ungrounded-safe', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'A safe grounded-sounding answer.' } }] }) })
    const result = await connectToPersonalAi({ settings: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-x', enabled: true }, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('live')
    expect(result.text).toBe('A safe grounded-sounding answer.')
  })
  it('reports "invalid_response" when the provider response fails grounding validation', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'I will now update the database for you.' } }] }) })
    const result = await connectToPersonalAi({ settings: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-x', enabled: true }, question: 'q', context: MINIMAL_CONTEXT })
    expect(result.status).toBe('invalid_response')
  })
  it('never throws even if context is malformed', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })
    await expect(connectToPersonalAi({ settings: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-x', enabled: true }, question: 'q', context: null as any })).resolves.toBeDefined()
  })
})

describe('testPersonalAiConnection — Settings UI smoke test helper', () => {
  afterEach(() => { delete (globalThis as any).fetch })

  it('returns ok:false immediately when no apiKey is supplied, without calling fetch', async () => {
    const fetchMock = vi.fn()
    ;(globalThis as any).fetch = fetchMock
    const result = await testPersonalAiConnection({ provider: 'openai', model: 'gpt-4o-mini', apiKey: '', enabled: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('returns ok:true with the provider reply when the call succeeds', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'connected' } }] }) })
    const result = await testPersonalAiConnection({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-x', enabled: true })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('connected')
  })
  it('returns ok:false with an error message when the call fails', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    const result = await testPersonalAiConnection({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'bad-key', enabled: true })
    expect(result.ok).toBe(false)
    expect(result.message.length).toBeGreaterThan(0)
  })
})

// ============================================================
// Gemini 404 investigation — gemini-1.5-flash was retired by Google
// and now returns HTTP 404. These tests pin down: the exact request
// URL (before/after the fix), the model-path normalization that
// prevents "models/models/..." duplication, the ListModels-backed
// selector, and the user-facing 404 message.
// ============================================================
describe('Gemini — request URL construction', () => {
  it('the default model is now gemini-2.5-flash, not the retired gemini-1.5-flash', () => {
    expect(PERSONAL_AI_PROVIDER_DEFAULT_MODEL.gemini).toBe('gemini-2.5-flash')
  })

  it('builds the model path exactly once: /v1beta/models/{model}:generateContent', () => {
    const url = buildGeminiGenerateContentUrl('gemini-2.5-flash', 'AIza-test-key')
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza-test-key')
  })

  it('normalizeGeminiModelId strips a single "models/" prefix', () => {
    expect(normalizeGeminiModelId('models/gemini-2.5-flash')).toBe('gemini-2.5-flash')
  })

  it('normalizeGeminiModelId strips a duplicated "models/models/" prefix so the URL is never built with it twice', () => {
    expect(normalizeGeminiModelId('models/models/gemini-2.5-flash')).toBe('gemini-2.5-flash')
    const url = buildGeminiGenerateContentUrl('models/models/gemini-2.5-flash', 'AIza-test-key')
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza-test-key')
    expect(url).not.toContain('models/models/')
  })

  it('normalizeGeminiModelId is a no-op for a bare model id (no prefix to strip)', () => {
    expect(normalizeGeminiModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash')
  })
})

describe('Gemini — valid gemini-2.5-flash request', () => {
  const PROMPT: BuiltPrompt = {
    systemInstructions: 'sys', groundedEvidence: [], allowedKpiKeys: [],
    userQuestion: 'why?', maxTokens: 200, temperature: 0.1,
  }
  afterEach(() => { delete (globalThis as any).fetch })

  it('calls the current model and returns the response text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from gemini 2.5' }] } }] }) })
    ;(globalThis as any).fetch = fetchMock
    const result = await callRealAiProvider({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key', prompt: PROMPT })
    expect(result).toEqual({ ok: true, text: 'hello from gemini 2.5' })
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza-test-key')
  })
})

describe('Gemini — obsolete gemini-1.5-flash returns 404', () => {
  const PROMPT: BuiltPrompt = {
    systemInstructions: 'sys', groundedEvidence: [], allowedKpiKeys: [],
    userQuestion: 'why?', maxTokens: 200, temperature: 0.1,
  }
  afterEach(() => { delete (globalThis as any).fetch })

  it('callRealAiProvider throws the exact user-facing message on a 404', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(
      callRealAiProvider({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'AIza-test-key', prompt: PROMPT }),
    ).rejects.toThrow(GEMINI_MODEL_UNAVAILABLE_MESSAGE)
  })

  it('connectToPersonalAi maps the 404 to status "model_unavailable" with the exact message', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await connectToPersonalAi({
      settings: { provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'AIza-test-key', enabled: true },
      question: 'q', context: MINIMAL_CONTEXT,
    })
    expect(result.status).toBe('model_unavailable')
    expect(result.text).toBe('The selected Gemini model is unavailable. Choose another supported model.')
  })

  it('testPersonalAiConnection (Settings UI smoke test) surfaces the same exact message on a 404', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await testPersonalAiConnection({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'AIza-test-key', enabled: true })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('The selected Gemini model is unavailable. Choose another supported model.')
  })
})

describe('Gemini — model listing and selection (ListModels)', () => {
  afterEach(() => { delete (globalThis as any).fetch })

  it('calls GET /v1beta/models with the saved API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })
    ;(globalThis as any).fetch = fetchMock
    await listGeminiModels('AIza-test-key')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test-key')
    expect(init).toBeUndefined()
  })

  it('filters out models that do not support generateContent', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', displayName: 'Embedding 001', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash (retired)', supportedGenerationMethods: [] },
        ],
      }),
    })
    const models = await listGeminiModels('AIza-test-key')
    expect(models).toEqual([{ name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }])
  })

  it('normalizes the "models/" prefix off every returned model id', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] }] }),
    })
    const models = await listGeminiModels('AIza-test-key')
    expect(models[0].name).toBe('gemini-2.5-pro')
    expect(models[0].name).not.toContain('models/')
  })

  it('falls back to the normalized name as displayName when displayName is missing', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }),
    })
    const models = await listGeminiModels('AIza-test-key')
    expect(models).toEqual([{ name: 'gemini-2.5-flash', displayName: 'gemini-2.5-flash' }])
  })

  it('a model selected from the listing round-trips into a working generateContent URL with no duplicated prefix', async () => {
    const selected = { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }
    const url = buildGeminiGenerateContentUrl(selected.name, 'AIza-test-key')
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza-test-key')
  })
})

describe('Gemini — invalid API key', () => {
  afterEach(() => { delete (globalThis as any).fetch })

  it('listGeminiModels throws on a 400/403 (invalid key) response', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    await expect(listGeminiModels('not-a-real-key')).rejects.toThrow()
  })

  it('callRealAiProvider throws a non-404 error for an invalid key, never the model-unavailable message', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    const PROMPT: BuiltPrompt = { systemInstructions: 's', groundedEvidence: [], allowedKpiKeys: [], userQuestion: 'q', maxTokens: 10, temperature: 0 }
    await expect(
      callRealAiProvider({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'not-a-real-key', prompt: PROMPT }),
    ).rejects.toThrow(/Gemini request failed: 403/)
  })

  it('testPersonalAiConnection reports ok:false (not the 404 message) for an invalid key', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    const result = await testPersonalAiConnection({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'not-a-real-key', enabled: true })
    expect(result.ok).toBe(false)
    expect(result.message).not.toBe(GEMINI_MODEL_UNAVAILABLE_MESSAGE)
  })
})

describe('Gemini — network failure', () => {
  afterEach(() => { delete (globalThis as any).fetch })

  it('listGeminiModels propagates a network rejection', async () => {
    ;(globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(listGeminiModels('AIza-test-key')).rejects.toThrow('network down')
  })

  it('connectToPersonalAi reports "provider_unavailable" (not "model_unavailable") on a network failure', async () => {
    ;(globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await connectToPersonalAi({
      settings: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key', enabled: true },
      question: 'q', context: MINIMAL_CONTEXT,
    })
    expect(result.status).toBe('provider_unavailable')
  })
})

// ============================================================
// Gemini "response missing text" investigation — a 200 OK response
// can still carry no usable text (prompt blocked, output withheld
// for safety, or — most commonly with gemini-2.5-* — the thinking
// budget consuming the entire token budget before any answer text
// is produced). extractGeminiText() diagnoses each case instead of
// throwing one generic, unhelpful message every time.
// ============================================================
describe('Gemini — request disables the thinking budget', () => {
  const PROMPT: BuiltPrompt = {
    systemInstructions: 's', groundedEvidence: [], allowedKpiKeys: [], userQuestion: 'q', maxTokens: 200, temperature: 0.1,
  }
  afterEach(() => { delete (globalThis as any).fetch })

  it('sends thinkingConfig.thinkingBudget: 0 so reasoning tokens cannot consume the whole maxOutputTokens budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) })
    ;(globalThis as any).fetch = fetchMock
    await callRealAiProvider({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key', prompt: PROMPT })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })
})

describe('Gemini — extractGeminiText diagnoses every "200 OK with no text" case', () => {
  it('returns the text when a single part has it (the common case)', () => {
    expect(extractGeminiText({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] })).toBe('hello')
  })

  it('concatenates text across multiple parts (some responses split text, or interleave non-text parts)', () => {
    const data = { candidates: [{ content: { parts: [{ text: 'hello ' }, { thought: true }, { text: 'world' }] } }] }
    expect(extractGeminiText(data)).toBe('hello world')
  })

  it('throws a specific message when the prompt itself was blocked', () => {
    expect(() => extractGeminiText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow('Gemini blocked the prompt (SAFETY).')
  })

  it('throws a specific message when the model\'s own output was withheld for safety', () => {
    expect(() => extractGeminiText({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })).toThrow('Gemini withheld the response (SAFETY).')
  })

  it('throws a specific message when the output was withheld for recitation', () => {
    expect(() => extractGeminiText({ candidates: [{ finishReason: 'RECITATION', content: { parts: [] } }] })).toThrow('Gemini withheld the response (RECITATION).')
  })

  it('throws a specific message when MAX_TOKENS was hit before any answer text — the gemini-2.5 thinking-budget gotcha', () => {
    expect(() => extractGeminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }))
      .toThrow('Gemini ran out of output tokens before producing a response. Try a shorter question or a different model.')
  })

  it('still throws the generic message for a genuinely malformed/empty response', () => {
    expect(() => extractGeminiText({})).toThrow('Gemini response missing text')
    expect(() => extractGeminiText({ candidates: [{}] })).toThrow('Gemini response missing text')
  })

  it('prefers actual text over an accompanying finishReason (a finishReason alone is not an error)', () => {
    expect(extractGeminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'fine' }] } }] })).toBe('fine')
  })
})

describe('Gemini — callRealAiProvider end-to-end with the missing-text scenarios', () => {
  const PROMPT: BuiltPrompt = {
    systemInstructions: 's', groundedEvidence: [], allowedKpiKeys: [], userQuestion: 'q', maxTokens: 200, temperature: 0.1,
  }
  afterEach(() => { delete (globalThis as any).fetch })

  it('throws the MAX_TOKENS-specific message on a 200 OK with an exhausted thinking budget', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }),
    })
    await expect(
      callRealAiProvider({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key', prompt: PROMPT }),
    ).rejects.toThrow('Gemini ran out of output tokens')
  })

  it('connectToPersonalAi falls back to "provider_unavailable" (deterministic answer shown) when Gemini returns no text', async () => {
    ;(globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }),
    })
    const result = await connectToPersonalAi({
      settings: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key', enabled: true },
      question: 'q', context: MINIMAL_CONTEXT,
    })
    expect(result.status).toBe('provider_unavailable')
  })
})
