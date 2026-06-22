// ============================================================
// Phase 8E + 8F — Usage Limits + AI Audit Logs
// ============================================================
import { describe, it, expect } from 'vitest'

import { checkUsageLimit } from './aiUsageLimiter'
import { ROLE_LIMIT_MULTIPLIER } from './aiUsageTypes'
import { buildAiAuditLogEntry, hashAssistantContext } from './aiAuditLogger'
import { buildAssistantContext } from './assistantContext'
import { DEFAULT_AI_SETTINGS } from './aiSettingsTypes'

const ROLES = ['admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist'] as const

function enabledSettings(overrides = {}) {
  return { ...DEFAULT_AI_SETTINGS, enabled: true, dailyLimit: 10, monthlyLimit: 100, ...overrides }
}

describe('checkUsageLimit', () => {
  it('disallows when AI is disabled, regardless of usage', () => {
    const result = checkUsageLimit({ dailyCount: 0, monthlyCount: 0 }, { ...DEFAULT_AI_SETTINGS, enabled: false }, 'admin')
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/disabled/i)
  })
  it('allows a fresh admin under the daily/monthly limits', () => {
    const result = checkUsageLimit({ dailyCount: 0, monthlyCount: 0 }, enabledSettings(), 'admin')
    expect(result.allowed).toBe(true)
    expect(result.remainingDaily).toBe(10)
  })
  it('disallows once the daily limit is reached', () => {
    const result = checkUsageLimit({ dailyCount: 10, monthlyCount: 5 }, enabledSettings(), 'admin')
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/daily/i)
  })
  it('disallows once the monthly limit is reached even with daily room left', () => {
    const result = checkUsageLimit({ dailyCount: 1, monthlyCount: 100 }, enabledSettings(), 'admin')
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/monthly/i)
  })
  it.each(ROLES)('%s gets a role-scaled daily limit', (role) => {
    const result = checkUsageLimit({ dailyCount: 0, monthlyCount: 0 }, enabledSettings(), role)
    expect(result.remainingDaily).toBe(Math.floor(10 * ROLE_LIMIT_MULTIPLIER[role]))
  })
  it('pharmacist has a strictly lower limit than admin for the same settings', () => {
    const admin = checkUsageLimit({ dailyCount: 0, monthlyCount: 0 }, enabledSettings(), 'admin')
    const pharmacist = checkUsageLimit({ dailyCount: 0, monthlyCount: 0 }, enabledSettings(), 'pharmacist')
    expect(pharmacist.remainingDaily!).toBeLessThan(admin.remainingDaily!)
  })
  it('never throws on malformed input', () => {
    expect(() => checkUsageLimit(null as any, null as any, 'admin')).not.toThrow()
    expect(() => checkUsageLimit({} as any, {} as any, null as any)).not.toThrow()
  })
})

describe('hashAssistantContext / buildAiAuditLogEntry', () => {
  const context = buildAssistantContext({ entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06' })

  it('hashAssistantContext is deterministic for the same context', () => {
    expect(hashAssistantContext(context)).toBe(hashAssistantContext(context))
  })
  it('hashAssistantContext differs for a different entityId', () => {
    const other = buildAssistantContext({ entityId: 'br-2', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06' })
    expect(hashAssistantContext(context)).not.toBe(hashAssistantContext(other))
  })
  it('never throws on malformed context', () => {
    expect(() => hashAssistantContext(null as any)).not.toThrow()
  })

  it('buildAiAuditLogEntry produces a well-formed entry with no apiKey/secret field', () => {
    const entry = buildAiAuditLogEntry({
      userId: 'u1', role: 'admin', provider: 'openai', model: 'gpt-4o-mini',
      questionIntent: 'explain_score', context, responseStatus: 'validated', groundingStatus: 'grounded',
    })
    expect(entry.userId).toBe('u1')
    expect(entry.contextHash).toBeTruthy()
    expect(Object.keys(entry).some((k) => /key|secret/i.test(k))).toBe(false)
  })
  it('safetyViolations defaults to an empty array, never undefined', () => {
    const entry = buildAiAuditLogEntry({ userId: 'u1', role: 'admin', provider: 'openai', model: 'm', questionIntent: 'unknown', context, responseStatus: 'fallback', groundingStatus: 'not_applicable' })
    expect(entry.safetyViolations).toEqual([])
  })
  it('never throws on malformed input', () => {
    expect(() => buildAiAuditLogEntry(null as any)).not.toThrow()
    expect(() => buildAiAuditLogEntry({} as any)).not.toThrow()
  })
})
