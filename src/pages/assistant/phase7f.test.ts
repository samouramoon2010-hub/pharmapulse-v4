// ============================================================
// Phase 7F — Assistant UI Shell Components
//
// Source-inspection tests for AssistantPanel, AssistantInput,
// AssistantAnswerCard, EvidenceList, SuggestedQuestionCard.
// Verifies read-only behavior, no Firestore, no auto-send, no
// network calls, and that AssistantPanel uses ONLY the deterministic
// answer builder (never aiProviderAdapter) in this bundle.
// ============================================================
import { describe, it, expect } from 'vitest'

import AssistantPanelSrc from '../../components/assistant/AssistantPanel.jsx?raw'
import AssistantInputSrc from '../../components/assistant/AssistantInput.jsx?raw'
import AssistantAnswerCardSrc from '../../components/assistant/AssistantAnswerCard.jsx?raw'
import EvidenceListSrc from '../../components/assistant/EvidenceList.jsx?raw'
import SuggestedQuestionCardSrc from '../../components/assistant/SuggestedQuestionCard.jsx?raw'

const ALL: [string, string][] = [
  ['AssistantPanel', AssistantPanelSrc],
  ['AssistantInput', AssistantInputSrc],
  ['AssistantAnswerCard', AssistantAnswerCardSrc],
  ['EvidenceList', EvidenceListSrc],
  ['SuggestedQuestionCard', SuggestedQuestionCardSrc],
]

describe('Phase 7F — no direct Firestore access anywhere in the assistant UI', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not import from 'firebase/firestore'`, () => {
      expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/)
    })
    it(`${name} does not import the Firestore-backed evaluationLedgerService`, () => {
      expect(src).not.toMatch(/evaluationLedgerService/)
    })
  }
})

describe('Phase 7F — read-only (no write calls anywhere)', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not call any *Document write function`, () => {
      expect(src).not.toMatch(/create\w*Document\(|update\w*Document\(|archive\w*Document\(/)
    })
    it(`${name} does not call addDoc/setDoc/updateDoc/deleteDoc`, () => {
      expect(src).not.toMatch(/\baddDoc\(|\bsetDoc\(|\bupdateDoc\(|\bdeleteDoc\(/)
    })
  }
})

describe('Phase 7F — no network calls anywhere in the assistant UI', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not call fetch()`, () => expect(src).not.toMatch(/\bfetch\(/))
    it(`${name} does not reference XMLHttpRequest`, () => expect(src).not.toMatch(/XMLHttpRequest/))
    it(`${name} does not import axios`, () => expect(src).not.toMatch(/from ['"]axios['"]/))
  }
})

describe('Phase 7F — no profile mutation, no aiProviderAdapter in this bundle', () => {
  it('AssistantPanel uses ONLY the deterministic buildAnswer kernel', () => {
    const body = AssistantPanelSrc.slice(AssistantPanelSrc.indexOf('import React'))
    expect(body).toContain('buildAnswer')
    expect(body).not.toMatch(/aiProviderAdapter|callAiProvider/)
  })
  it('AssistantPanel does not import any Profile Studio write function', () => {
    expect(AssistantPanelSrc).not.toMatch(/markPublishReady|approveDraft|archiveProfile/)
  })
})

describe('Phase 7F — no auto-send anywhere in the input/panel', () => {
  it('AssistantInput has no useEffect (no mount-time auto-submission)', () => {
    expect(AssistantInputSrc).not.toMatch(/useEffect/)
  })
  it('AssistantPanel has no useEffect (no mount-time auto-submission)', () => {
    expect(AssistantPanelSrc).not.toMatch(/useEffect/)
  })
  it('AssistantInput only submits from an explicit onClick or Enter keydown handler', () => {
    expect(AssistantInputSrc).toMatch(/onClick=\{onSubmit\}/)
    expect(AssistantInputSrc).toMatch(/onKeyDown=/)
  })
  it('SuggestedQuestionCard only fills the input via onSelect — it never calls onSubmit itself', () => {
    expect(SuggestedQuestionCardSrc).not.toMatch(/onSubmit/)
  })
  it('AssistantPanel has no setInterval/setTimeout that could trigger an automatic ask', () => {
    expect(AssistantPanelSrc).not.toMatch(/setInterval\(|setTimeout\(/)
  })
})

describe('Phase 7F — presentational components take only their documented prop(s)', () => {
  it('AssistantAnswerCard takes only an "answer" prop', () => expect(AssistantAnswerCardSrc).toMatch(/function AssistantAnswerCard\(\{ answer \}\)/))
  it('EvidenceList takes only an "evidence" prop', () => expect(EvidenceListSrc).toMatch(/function EvidenceList\(\{ evidence \}\)/))
  it('SuggestedQuestionCard takes "question" and "onSelect" props', () => expect(SuggestedQuestionCardSrc).toMatch(/function SuggestedQuestionCard\(\{ question, onSelect \}\)/))
  for (const [name, src] of ALL.filter(([n]) => n !== 'AssistantPanel')) {
    it(`${name} has no useEffect (pure render, no data fetching)`, () => {
      expect(src).not.toMatch(/useEffect/)
    })
  }
})

describe('Phase 7F — no drag-and-drop, no AI provider wiring', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not implement drag-and-drop`, () => {
      expect(src).not.toMatch(/onDragStart=|onDrop=|draggable=\{true\}/)
    })
    it(`${name} does not reference any real provider name as a literal API endpoint`, () => {
      expect(src).not.toMatch(/api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|openrouter\.ai\/api/)
    })
  }
})
