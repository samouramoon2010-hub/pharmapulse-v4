// ============================================================
// Assistant — Deterministic Answer Builder (Phase 7C)
//
// Routes a question via the existing questionRouter, then dispatches
// to the matching answerTemplates function. No AI is involved — every
// answer is template interpolation over an already-computed
// AssistantContext.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import { routeQuestion } from './questionRouter'
import {
  explainScoreTemplate, explainDropTemplate, comparePeriodsTemplate, explainRankingTemplate,
  findOpportunitiesTemplate, explainRecommendationsTemplate, whatIfTemplate, profileExplanationTemplate,
  unknownTemplate,
} from './answerTemplates'
import type { TemplateOutput } from './answerTemplates'
import type { AssistantContext } from './assistantTypes'
import type { QuestionIntent } from './questionIntentTypes'
import type { GroundedFact } from './assistantGrounding'

export interface AssistantAnswer {
  question:      string
  intent:        QuestionIntent
  text:          string
  evidence:      GroundedFact[]
  citedTraceRef: string
  generatedAt:   string
}

const TEMPLATE_BY_INTENT: Record<QuestionIntent, (context: AssistantContext) => TemplateOutput> = {
  explain_score:           explainScoreTemplate,
  explain_drop:            explainDropTemplate,
  compare_periods:         comparePeriodsTemplate,
  explain_ranking:         explainRankingTemplate,
  find_opportunities:      findOpportunitiesTemplate,
  explain_recommendations: explainRecommendationsTemplate,
  what_if:                 whatIfTemplate,
  profile_explanation:     profileExplanationTemplate,
  unknown:                 unknownTemplate,
}

/**
 * Builds a fully deterministic answer for a free-text question against
 * a structured AssistantContext. Never throws.
 */
export function buildAnswer(question: unknown, context: AssistantContext): AssistantAnswer {
  try {
    const routed = routeQuestion(question)
    const templateFn = TEMPLATE_BY_INTENT[routed.intent] ?? unknownTemplate
    const { text, evidence } = templateFn(context)

    return {
      question:      routed.rawQuestion,
      intent:        routed.intent,
      text,
      evidence,
      citedTraceRef: `${context?.profileId ?? 'unknown'}@${context?.profileVersion ?? 'unknown'}`,
      generatedAt:   new Date().toISOString(),
    }
  } catch (e) {
    return {
      question:      typeof question === 'string' ? question : '',
      intent:        'unknown',
      text:          'Unable to generate an answer for this question.',
      evidence:      [],
      citedTraceRef: 'unknown@unknown',
      generatedAt:   new Date().toISOString(),
    }
  }
}
