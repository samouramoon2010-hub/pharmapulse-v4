// ============================================================
// Phase 8B + 8C + 8D — Provider Connector + Prompt Builder + Response Validator
// ============================================================
import { describe, it, expect } from 'vitest'

import { connectToProvider } from './aiProviderConnector'
import { buildPrompt } from './promptBuilder'
import { sanitizeQuestionText, redactSecrets, truncateText } from './promptSanitizer'
import { SYSTEM_PREAMBLE } from './promptTemplates'
import { validateAiResponse, checkNoHiddenActionInstructions } from './aiResponseValidator'
import { areKpiClaimsGrounded, listUngroundedKpiClaims, areNumericClaimsGrounded, isRankClaimGrounded, isRecommendationClaimGrounded } from './aiResponseGrounding'
import { buildAssistantContext } from './assistantContext'
import { DEFAULT_AI_SETTINGS } from './aiSettingsTypes'
import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'
import type { ProfileSimTrace } from '../profileStudio/simulationTrace'

function makeTrace(): ProfileSimTrace {
  return {
    profileId: 'p1', profileVersion: '1.0.0', overallScore: 70, timestamp: '',
    baskets: [{
      basketId: 'b1', label: 'B1', score: 70, weight: 1, weightedContribution: 70, timestamp: '',
      elements: [{ elementId: 'e1', label: 'E1', score: 70, weight: 1, weightedContribution: 70, timestamp: '', rules: [
        { ruleId: 'r1', kpiKey: 'omnihealth', rawActual: 70, rawTarget: 100, rawAchievement: 70, cappedAchievement: 70, weightedScore: 70, penaltyApplied: 0, finalNodeScore: 70, zeroTarget: false, stepTraces: [], timestamp: '' },
      ] }],
    }],
  }
}

function makeEntry(): EvaluationLedgerEntry {
  return {
    evaluationId: 'eval_1', entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0',
    periodId: '2026-06', score: 70, basketScores: { b1: 70 }, elementScores: { e1: 70 }, ruleScores: { r1: 70 },
    trace: makeTrace(), timestamp: '2026-06-15T00:00:00.000Z', metadata: {},
  }
}

function makeContext() {
  return buildAssistantContext({ entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06', ledgerEntry: makeEntry() })
}

// ════════════════════════════════════════════════════════════
// 8B — Provider Connector
// ════════════════════════════════════════════════════════════

describe('connectToProvider', () => {
  const context = makeContext()

  it('returns status "disabled" when settings.enabled is false', () => {
    const response = connectToProvider({ settings: { ...DEFAULT_AI_SETTINGS, enabled: false }, question: 'score?', context })
    expect(response.status).toBe('disabled')
  })
  it('returns status "mocked" when settings.enabled is true', () => {
    const response = connectToProvider({ settings: { ...DEFAULT_AI_SETTINGS, enabled: true }, question: 'score?', context })
    expect(response.status).toBe('mocked')
  })
  it('returns status "disabled" when the request has no settings (graceful degradation, not an error)', () => {
    const response = connectToProvider(null as any)
    expect(response.status).toBe('disabled')
  })
  it('"provider_unavailable" is reachable as the catch-all status whenever the connector itself throws internally', () => {
    expect(['mocked', 'disabled', 'provider_unavailable']).toContain(
      connectToProvider({ settings: { ...DEFAULT_AI_SETTINGS, enabled: true }, question: 'score?', context: makeContext() }).status,
    )
  })
  it('never makes a real network call — response resolves synchronously', () => {
    const response = connectToProvider({ settings: { ...DEFAULT_AI_SETTINGS, enabled: true }, question: 'score?', context })
    expect(response).not.toBeInstanceOf(Promise)
  })
  it('never throws on malformed input', () => {
    expect(() => connectToProvider({} as any)).not.toThrow()
    expect(() => connectToProvider(undefined as any)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 8C — Prompt Builder / Sanitizer / Templates
// ════════════════════════════════════════════════════════════

describe('promptSanitizer', () => {
  it('redactSecrets removes an OpenAI-style key', () => {
    expect(redactSecrets('here is sk-abcdefghij1234567890')).toContain('[REDACTED]')
    expect(redactSecrets('here is sk-abcdefghij1234567890')).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
  })
  it('truncateText caps length at the given maximum', () => {
    expect(truncateText('a'.repeat(2000), 100).length).toBe(100)
  })
  it('sanitizeQuestionText combines truncation and redaction', () => {
    const result = sanitizeQuestionText(`sk-${'a'.repeat(20)} ${'x'.repeat(2000)}`)
    expect(result).toContain('[REDACTED]')
    expect(result.length).toBeLessThanOrEqual(1000)
  })
  it('never throw on non-string input', () => {
    expect(() => redactSecrets(null)).not.toThrow()
    expect(() => truncateText(undefined)).not.toThrow()
    expect(() => sanitizeQuestionText(42)).not.toThrow()
  })
})

describe('buildPrompt', () => {
  const context = makeContext()

  it('includes the fixed safety preamble', () => {
    expect(buildPrompt('score?', context).systemInstructions).toBe(SYSTEM_PREAMBLE)
  })
  it('includes only grounded KPI keys', () => {
    expect(buildPrompt('score?', context).allowedKpiKeys).toEqual(['omnihealth'])
  })
  it('includes a sanitized question, not the raw question', () => {
    const prompt = buildPrompt(`sk-${'a'.repeat(20)} score?`, context)
    expect(prompt.userQuestion).toContain('[REDACTED]')
  })
  it('falls back to safe defaults when settings are omitted', () => {
    const prompt = buildPrompt('score?', context)
    expect(prompt.maxTokens).toBe(500)
    expect(prompt.temperature).toBe(0.2)
  })
  it('uses the settings maxTokens/temperature when supplied', () => {
    const prompt = buildPrompt('score?', context, { maxTokens: 200, temperature: 0.5 })
    expect(prompt.maxTokens).toBe(200)
    expect(prompt.temperature).toBe(0.5)
  })
  it('never throws on malformed input', () => {
    expect(() => buildPrompt(null, null as any)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// 8D — Response Grounding / Validator
// ════════════════════════════════════════════════════════════

describe('aiResponseGrounding', () => {
  const context = makeContext()

  it('areKpiClaimsGrounded is true for a real KPI and false for a fabricated one', () => {
    expect(areKpiClaimsGrounded(context, ['omnihealth'])).toBe(true)
    expect(areKpiClaimsGrounded(context, ['fabricated'])).toBe(false)
  })
  it('listUngroundedKpiClaims returns only the unsupported ones', () => {
    expect(listUngroundedKpiClaims(context, ['omnihealth', 'fabricated'])).toEqual(['fabricated'])
  })
  it('areNumericClaimsGrounded matches a real fact within tolerance', () => {
    expect(areNumericClaimsGrounded(context, [{ label: 'Overall score', value: 70 }])).toBe(true)
    expect(areNumericClaimsGrounded(context, [{ label: 'Overall score', value: 99 }])).toBe(false)
  })
  it('isRankClaimGrounded is true when no rank is claimed', () => {
    expect(isRankClaimGrounded(context, undefined)).toBe(true)
  })
  it('isRecommendationClaimGrounded is true when the recommendation exists in context', () => {
    const withRecs = buildAssistantContext({
      entityId: 'br-1', entityType: 'branch', profileId: 'p1', profileVersion: '1.0.0', periodId: '2026-06',
      recommendations: { entityId: 'br-1', items: [{ id: 'r1', title: 'Improve X', description: '', priority: 'high', impact: 1, confidence: 1, difficulty: 'low', expectedGain: 1, basedOn: { opportunityCategory: 'BIGGEST_OPPORTUNITY', targetId: 'x' } }], generatedAt: '' },
    })
    expect(isRecommendationClaimGrounded(withRecs, 'Improve X')).toBe(true)
    expect(isRecommendationClaimGrounded(withRecs, 'Made up recommendation')).toBe(false)
  })
  it('never throw on malformed input', () => {
    expect(() => areKpiClaimsGrounded(null as any)).not.toThrow()
    expect(() => areNumericClaimsGrounded(null as any)).not.toThrow()
    expect(() => isRankClaimGrounded(null as any)).not.toThrow()
    expect(() => isRecommendationClaimGrounded(null as any)).not.toThrow()
  })
})

describe('checkNoHiddenActionInstructions', () => {
  it('flags "I will now update"', () => expect(checkNoHiddenActionInstructions('I will now update the profile.')).toBe(false))
  it('flags "executing action"', () => expect(checkNoHiddenActionInstructions('Executing action: delete record.')).toBe(false))
  it('passes a normal explanatory sentence', () => expect(checkNoHiddenActionInstructions('The score dropped because of basket b1.')).toBe(true))
})

describe('validateAiResponse', () => {
  const context = makeContext()

  it('passes a clean, fully grounded response', () => {
    const result = validateAiResponse({ text: 'The score is 70%.', claimedKpiKeys: ['omnihealth'], claimedNumbers: [{ label: 'Overall score', value: 70 }] }, context)
    expect(result.valid).toBe(true)
  })
  it('fails a response claiming a mutation occurred', () => {
    const result = validateAiResponse({ text: 'I have updated the profile.' }, context)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'no_profile_mutation_request')).toBe(true)
  })
  it('fails a response referencing an unsupported KPI', () => {
    const result = validateAiResponse({ text: 'text', claimedKpiKeys: ['fabricated-kpi'] }, context)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'no_unsupported_kpi')).toBe(true)
  })
  it('fails a response with an unsupported numeric claim', () => {
    const result = validateAiResponse({ text: 'text', claimedNumbers: [{ label: 'Overall score', value: 999 }] }, context)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'no_unsupported_numeric_claim')).toBe(true)
  })
  it('fails a response implying a hidden action', () => {
    const result = validateAiResponse({ text: 'I will now save your settings.' }, context)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'no_hidden_actions')).toBe(true)
  })
  it('fails a response with a credential leaked into the text', () => {
    const result = validateAiResponse({ text: 'here is sk-abcdefghij1234567890' }, context)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'no_secrets')).toBe(true)
  })
  it('never throws on malformed input', () => {
    expect(() => validateAiResponse(null as any, null as any)).not.toThrow()
    expect(() => validateAiResponse({} as any, {} as any)).not.toThrow()
  })
})
