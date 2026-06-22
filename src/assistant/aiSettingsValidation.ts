// ============================================================
// AI Settings — Validation (Phase 8A)
//
// Pure validation for AiSettings before they are applied/persisted.
// Never throws — returns a structured result instead.
//
// No Firestore. No React. No UI.
// ============================================================

import type { AiSettings, AiSettingsProviderName, AiSafetyMode } from './aiSettingsTypes'

const ALLOWED_PROVIDERS: AiSettingsProviderName[] = ['openai', 'gemini', 'claude', 'openrouter', 'custom']
const ALLOWED_SAFETY_MODES: AiSafetyMode[] = ['strict', 'standard']

export interface AiSettingsValidationIssue {
  code:     string
  field?:   string
  message:  string
  severity: 'error' | 'warning'
}

export interface AiSettingsValidationResult {
  valid:  boolean
  issues: AiSettingsValidationIssue[]
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)
}

/** Validates an AiSettings object. Never throws. */
export function validateAiSettings(input: unknown): AiSettingsValidationResult {
  const issues: AiSettingsValidationIssue[] = []
  try {
    const settings = (input ?? {}) as Partial<AiSettings>

    if (!settings.provider || !ALLOWED_PROVIDERS.includes(settings.provider)) {
      issues.push({ code: 'INVALID_PROVIDER', field: 'provider', message: `provider must be one of: ${ALLOWED_PROVIDERS.join(', ')}`, severity: 'error' })
    }
    if (!settings.model || typeof settings.model !== 'string' || settings.model.trim().length === 0) {
      issues.push({ code: 'MISSING_MODEL', field: 'model', message: 'model is required', severity: 'error' })
    }
    if (typeof settings.enabled !== 'boolean') {
      issues.push({ code: 'INVALID_ENABLED', field: 'enabled', message: 'enabled must be a boolean', severity: 'error' })
    }
    if (!isNonNegativeInt(settings.dailyLimit)) {
      issues.push({ code: 'INVALID_DAILY_LIMIT', field: 'dailyLimit', message: 'dailyLimit must be a non-negative integer', severity: 'error' })
    }
    if (!isNonNegativeInt(settings.monthlyLimit)) {
      issues.push({ code: 'INVALID_MONTHLY_LIMIT', field: 'monthlyLimit', message: 'monthlyLimit must be a non-negative integer', severity: 'error' })
    }
    if (typeof settings.dailyLimit === 'number' && typeof settings.monthlyLimit === 'number' && settings.dailyLimit * 28 > settings.monthlyLimit && settings.monthlyLimit > 0) {
      issues.push({ code: 'DAILY_EXCEEDS_MONTHLY', field: 'dailyLimit', message: 'dailyLimit × 28 exceeds monthlyLimit — the monthly cap may never be reachable as a meaningful constraint', severity: 'warning' })
    }
    if (!isNonNegativeInt(settings.maxTokens) || (settings.maxTokens as number) > 100000) {
      issues.push({ code: 'INVALID_MAX_TOKENS', field: 'maxTokens', message: 'maxTokens must be a non-negative integer no greater than 100000', severity: 'error' })
    }
    if (typeof settings.temperature !== 'number' || !Number.isFinite(settings.temperature) || settings.temperature < 0 || settings.temperature > 2) {
      issues.push({ code: 'INVALID_TEMPERATURE', field: 'temperature', message: 'temperature must be a number between 0 and 2', severity: 'error' })
    }
    if (!settings.safetyMode || !ALLOWED_SAFETY_MODES.includes(settings.safetyMode)) {
      issues.push({ code: 'INVALID_SAFETY_MODE', field: 'safetyMode', message: `safetyMode must be one of: ${ALLOWED_SAFETY_MODES.join(', ')}`, severity: 'error' })
    }
    if (typeof settings.auditEnabled !== 'boolean') {
      issues.push({ code: 'INVALID_AUDIT_ENABLED', field: 'auditEnabled', message: 'auditEnabled must be a boolean', severity: 'error' })
    }

    // Defense-in-depth: explicitly reject any attempt to smuggle a credential into
    // settings. Splits camelCase field names into words first, so a legitimate
    // field like "maxTokens" (token *count*, not a credential) is never flagged —
    // only a standalone "key"/"secret"/"password"/"credential" word is.
    const keys = Object.keys(settings as Record<string, unknown>)
    const splitWords = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean)
    const CREDENTIAL_WORDS = new Set(['key', 'secret', 'password', 'credential', 'credentials'])
    const suspicious = keys.filter((k) => splitWords(k).some((w) => CREDENTIAL_WORDS.has(w)))
    if (suspicious.length > 0) {
      issues.push({ code: 'CREDENTIAL_FIELD_REJECTED', message: `Settings must never carry credential-like fields: ${suspicious.join(', ')}`, severity: 'error' })
    }

    return { valid: issues.every((i) => i.severity !== 'error'), issues }
  } catch (e) {
    return {
      valid: false,
      issues: [{ code: 'VALIDATION_THREW', message: `AI settings validation failed: ${e instanceof Error ? e.message : String(e)}`, severity: 'error' }],
    }
  }
}

/** True when settings have no error-severity issues. Never throws. */
export function isAiSettingsValid(input: unknown): boolean {
  try {
    return validateAiSettings(input).valid
  } catch {
    return false
  }
}
