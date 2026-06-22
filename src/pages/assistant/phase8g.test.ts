// ============================================================
// Phase 8G — UI Integration (extended AssistantPanel + badges)
// ============================================================
import { describe, it, expect } from 'vitest'

import AssistantPanelSrc from '../../components/assistant/AssistantPanel.jsx?raw'
import ProviderStatusBadgeSrc from '../../components/assistant/ProviderStatusBadge.jsx?raw'
import AnswerModeBadgeSrc from '../../components/assistant/AnswerModeBadge.jsx?raw'
import SafetyValidationBadgeSrc from '../../components/assistant/SafetyValidationBadge.jsx?raw'
import UsageRemainingBadgeSrc from '../../components/assistant/UsageRemainingBadge.jsx?raw'

const BADGES: [string, string][] = [
  ['ProviderStatusBadge', ProviderStatusBadgeSrc],
  ['AnswerModeBadge', AnswerModeBadgeSrc],
  ['SafetyValidationBadge', SafetyValidationBadgeSrc],
  ['UsageRemainingBadge', UsageRemainingBadgeSrc],
]

describe('Phase 8G — badges are pure presentational, no Firestore, no writes', () => {
  for (const [name, src] of BADGES) {
    it(`${name} does not import from 'firebase/firestore'`, () => {
      expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/)
    })
    it(`${name} has no useEffect (pure render)`, () => {
      expect(src).not.toMatch(/useEffect/)
    })
    it(`${name} does not call any *Document write function`, () => {
      expect(src).not.toMatch(/create\w*Document\(|update\w*Document\(/)
    })
  }
})

describe('Phase 8G — AssistantPanel extension wires the badges through existing kernels only', () => {
  const body = AssistantPanelSrc.slice(AssistantPanelSrc.indexOf('import React'))

  it('imports all 4 badge components', () => {
    for (const badge of ['ProviderStatusBadge', 'AnswerModeBadge', 'SafetyValidationBadge', 'UsageRemainingBadge']) {
      expect(body).toContain(badge)
    }
  })
  it('imports checkUsageLimit from the existing usage limiter kernel', () => {
    expect(body).toContain('checkUsageLimit')
  })
  it('imports connectToProvider from the existing connector kernel (never aiProviderAdapter directly)', () => {
    expect(body).toContain('connectToProvider')
    expect(body).not.toMatch(/aiProviderAdapter|callAiProvider/)
  })
  it('imports validateAiResponse from the existing response validator kernel', () => {
    expect(body).toContain('validateAiResponse')
  })
  it('still computes the deterministic buildAnswer first, unconditionally', () => {
    const handleAskIdx = body.indexOf('const handleAsk')
    const handleAskBody = body.slice(handleAskIdx, handleAskIdx + 400)
    expect(handleAskBody).toContain('buildAnswer(question, context)')
  })
  it('does not call any *Document write function or addDoc/setDoc/updateDoc/deleteDoc', () => {
    expect(body).not.toMatch(/create\w*Document\(|update\w*Document\(|archive\w*Document\(/)
    expect(body).not.toMatch(/\baddDoc\(|\bsetDoc\(|\bupdateDoc\(|\bdeleteDoc\(/)
  })
  it('still has no useEffect (no auto-fetch, no auto-send)', () => {
    expect(body).not.toMatch(/useEffect/)
  })
  it('does not import from firebase/firestore', () => {
    expect(body).not.toMatch(/from ['"]firebase\/firestore['"]/)
  })
})
