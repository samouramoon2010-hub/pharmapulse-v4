// ============================================================
// Assistant — Question Router (Phase 7B)
//
// Deterministic keyword routing — no AI, no external API. A question
// is matched against an ordered table of regex patterns; the first
// intent whose pattern matches wins. Order matters: more specific
// intents are checked before more general ones (e.g. "what if" is
// checked before the general "explain_score" fallback).
//
// If nothing matches, the intent is 'unknown' — never a guess, never
// a default to some other intent.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import type { QuestionIntent, RoutedQuestion } from './questionIntentTypes'

interface IntentRule {
  intent:   QuestionIntent
  patterns: RegExp[]
}

// Order is significant — first match wins.
const INTENT_RULES: IntentRule[] = [
  { intent: 'what_if', patterns: [/\bwhat if\b/i, /\bwhat would happen\b/i, /\bwhat happens if\b/i, /\bscenario\b/i, /\bsimulate\b/i] },
  { intent: 'explain_drop', patterns: [/\bdrop(ped)?\b/i, /\bdeclin(e|ed|ing)\b/i, /\bdecreas(e|ed|ing)\b/i, /\bfell\b/i, /\bworse\b/i] },
  { intent: 'compare_periods', patterns: [/\bcompare\b/i, /\bversus\b/i, /\bvs\.?\b/i, /\bprevious period\b/i, /\blast month\b/i, /\blast period\b/i] },
  { intent: 'explain_ranking', patterns: [/\brank(ing|ed)?\b/i, /\bpercentile\b/i, /\bquartile\b/i, /\bposition\b/i, /\bleaderboard\b/i] },
  { intent: 'explain_recommendations', patterns: [/\brecommend(ation|ations|ed)?\b/i, /\bsuggest(ion|ions|ed)?\b/i, /\bwhat should\b/i, /\baction(s)?\b/i] },
  { intent: 'find_opportunities', patterns: [/\bopportunit(y|ies)\b/i, /\bimprove(ment)?\b/i, /\bfocus on\b/i, /\bheadroom\b/i, /\bweakness(es)?\b/i] },
  { intent: 'profile_explanation', patterns: [/\bprofile\b/i, /\bmethodology\b/i, /\bhow is.*calculated\b/i, /\bbasket(s)?\b/i, /\belement(s)?\b/i, /\bpipeline\b/i] },
  { intent: 'explain_score', patterns: [/\bscore\b/i, /\bwhy.*score(d)?\b/i, /\bhow.*scoring\b/i, /\bperformance\b/i] },
]

/**
 * Routes a free-text question to a deterministic intent. Returns
 * 'unknown' when no pattern matches. Never throws.
 *
 * Resistant to prompt injection by construction: the router only
 * ever checks the raw text against a fixed allowlist of regexes —
 * it never executes, interprets, or follows instructions embedded
 * in the question text.
 */
export function routeQuestion(question: unknown): RoutedQuestion {
  try {
    const text = typeof question === 'string' ? question : ''

    for (const rule of INTENT_RULES) {
      const matched = rule.patterns.filter((p) => p.test(text)).map((p) => p.source)
      if (matched.length > 0) {
        return { intent: rule.intent, rawQuestion: text, matchedKeywords: matched }
      }
    }

    return { intent: 'unknown', rawQuestion: text, matchedKeywords: [] }
  } catch {
    return { intent: 'unknown', rawQuestion: typeof question === 'string' ? question : '', matchedKeywords: [] }
  }
}
