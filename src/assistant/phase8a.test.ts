// ============================================================
// Phase 8A — BYOK Settings Architecture
// ============================================================
import { describe, it, expect } from 'vitest'

import { DEFAULT_AI_SETTINGS } from './aiSettingsTypes'
import { canViewAiSettings, canEditAiSettings, canUseAiAssistant } from './aiSettingsGuards'
import { validateAiSettings, isAiSettingsValid } from './aiSettingsValidation'

describe('DEFAULT_AI_SETTINGS', () => {
  it('starts disabled by default (no AI without explicit opt-in)', () => {
    expect(DEFAULT_AI_SETTINGS.enabled).toBe(false)
  })
  it('has no apiKey/secret/password/credential field (maxTokens is a legitimate token-count limit, not a credential)', () => {
    expect(Object.keys(DEFAULT_AI_SETTINGS)).not.toContain('apiKey')
    expect(Object.keys(DEFAULT_AI_SETTINGS).some((k) => /\b(key|secret|password|credential)\b/i.test(k.replace(/([a-z])([A-Z])/g, '$1 $2')))).toBe(false)
  })
})

describe('aiSettingsGuards', () => {
  const ROLES = ['admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist'] as const
  it.each(ROLES)('%s can view AI settings (universal read)', (role) => {
    expect(canViewAiSettings(role)).toBe(true)
  })
  it.each(ROLES)('%s can use the assistant (universal, same as the deterministic layer)', (role) => {
    expect(canUseAiAssistant(role)).toBe(true)
  })
  it('only admin can edit AI settings', () => {
    expect(canEditAiSettings('admin')).toBe(true)
    for (const role of ['general_manager', 'district_supervisor', 'manager', 'pharmacist'] as const) {
      expect(canEditAiSettings(role)).toBe(false)
    }
  })
  it('never throw on a null/undefined role', () => {
    expect(() => canViewAiSettings(null as any)).not.toThrow()
    expect(() => canEditAiSettings(undefined as any)).not.toThrow()
    expect(() => canUseAiAssistant(null as any)).not.toThrow()
  })
})

describe('validateAiSettings', () => {
  it('accepts the default settings', () => {
    expect(validateAiSettings(DEFAULT_AI_SETTINGS).valid).toBe(true)
  })
  it.each(['openai', 'gemini', 'claude', 'openrouter', 'custom'])('accepts provider %s', (provider) => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, provider }).valid).toBe(true)
  })
  it('rejects an unsupported provider', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, provider: 'made-up' }).valid).toBe(false)
  })
  it('rejects a missing model', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, model: '' }).valid).toBe(false)
  })
  it('rejects a negative dailyLimit', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, dailyLimit: -1 }).valid).toBe(false)
  })
  it('rejects a non-integer maxTokens', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, maxTokens: 12.5 }).valid).toBe(false)
  })
  it('rejects a temperature outside [0, 2]', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, temperature: 3 }).valid).toBe(false)
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, temperature: -0.5 }).valid).toBe(false)
  })
  it('rejects an invalid safetyMode', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, safetyMode: 'loose' }).valid).toBe(false)
  })
  it('rejects settings carrying an apiKey field, even alongside otherwise-valid fields', () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: 'sk-x' }).valid).toBe(false)
  })
  it('never throws on malformed input', () => {
    expect(() => validateAiSettings(null)).not.toThrow()
    expect(() => validateAiSettings(undefined)).not.toThrow()
    expect(() => validateAiSettings('not-an-object')).not.toThrow()
  })
  it('isAiSettingsValid mirrors validateAiSettings().valid', () => {
    expect(isAiSettingsValid(DEFAULT_AI_SETTINGS)).toBe(true)
    expect(isAiSettingsValid({})).toBe(false)
  })
})
