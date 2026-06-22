// ============================================================
// AssistantPanel — Read-only assistant shell (Phase 7F, extended in 8G)
//
// Receives an already-built AssistantContext as a prop (the caller
// is responsible for wiring ledger/ranking/benchmark/trend/
// opportunity/recommendation data via the existing kernels — this
// component fetches nothing itself).
//
// The deterministic buildAnswer() kernel is ALWAYS computed first and
// is always the fallback. AI enhancement is strictly optional and
// only ever attempted when aiSettings/usage/actor are supplied and
// AI is enabled:
//   1. checkUsageLimit() — existing Phase 8E kernel
//   2. connectToProvider() — existing Phase 8B kernel (mock-only,
//      never a real network call in this bundle)
//   3. validateAiResponse() — existing Phase 8D kernel
// If any step is unavailable, disabled, over-limit, or fails
// validation, the original deterministic text is shown instead — the
// AI path can only ever replace the displayed text, never the
// grounding behind it.
//
// Read-only. No writes. No Firestore import. No profile mutation.
// No auto-send. No direct provider calls from this component (only
// through the existing connector abstraction).
// ============================================================
import React, { useState } from 'react'
import { Bot } from 'lucide-react'

import AssistantInput from './AssistantInput'
import AssistantAnswerCard from './AssistantAnswerCard'
import SuggestedQuestionCard from './SuggestedQuestionCard'
import ProviderStatusBadge from './ProviderStatusBadge'
import AnswerModeBadge from './AnswerModeBadge'
import SafetyValidationBadge from './SafetyValidationBadge'
import UsageRemainingBadge from './UsageRemainingBadge'

import { buildAnswer } from '../../assistant/answerBuilder'
import { checkUsageLimit } from '../../assistant/aiUsageLimiter'
import { connectToProvider } from '../../assistant/aiProviderConnector'
import { validateAiResponse } from '../../assistant/aiResponseValidator'

const SUGGESTED_QUESTIONS = [
  'Why is the score what it is?',
  'Why did this branch drop?',
  'What is our ranking?',
  'What are the biggest opportunities?',
  'What should we focus on?',
  'What happens if the top KPI improves?',
]

export default function AssistantPanel({ context, aiSettings, usage, actor }) {
  const [inputValue, setInputValue] = useState('')
  const [answers, setAnswers] = useState([])

  const handleAsk = () => {
    const question = inputValue.trim()
    if (!question) return

    const deterministicAnswer = buildAnswer(question, context)

    let mode = 'deterministic'
    let providerStatus = 'disabled'
    let safetyStatus = 'not_applicable'
    let finalText = deterministicAnswer.text
    let remainingDaily
    let remainingMonthly

    if (aiSettings?.enabled && actor) {
      const limitCheck = checkUsageLimit(usage ?? { dailyCount: 0, monthlyCount: 0 }, aiSettings, actor.role)
      remainingDaily = limitCheck.remainingDaily
      remainingMonthly = limitCheck.remainingMonthly

      if (limitCheck.allowed) {
        const connectorResponse = connectToProvider({ settings: aiSettings, question, context })
        providerStatus = connectorResponse.status

        if (connectorResponse.status === 'mocked') {
          const validation = validateAiResponse({ text: connectorResponse.text }, context)
          if (validation.valid) {
            mode = 'ai_enhanced'
            safetyStatus = 'validated'
            finalText = connectorResponse.text
          } else {
            safetyStatus = 'fallback'
          }
        }
      } else {
        providerStatus = 'disabled'
      }
    }

    setAnswers((prev) => [...prev, { ...deterministicAnswer, text: finalText, mode, providerStatus, safetyStatus, remainingDaily, remainingMonthly }])
    setInputValue('')
  }

  const handleSelectSuggestion = (question) => {
    setInputValue(question)
  }

  if (!context) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <Bot style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Assistant
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {SUGGESTED_QUESTIONS.map((q) => (
          <SuggestedQuestionCard key={q} question={q} onSelect={handleSelectSuggestion} />
        ))}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <AssistantInput value={inputValue} onChange={setInputValue} onSubmit={handleAsk} disabled={false} />
      </div>

      {answers.map((answer, idx) => (
        <div key={idx} style={{ marginBottom: '8px' }}>
          <AssistantAnswerCard answer={answer} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
            <ProviderStatusBadge status={answer.providerStatus} />
            <AnswerModeBadge mode={answer.mode} />
            <SafetyValidationBadge status={answer.safetyStatus} />
            <UsageRemainingBadge remainingDaily={answer.remainingDaily} remainingMonthly={answer.remainingMonthly} />
          </div>
        </div>
      ))}
    </div>
  )
}
