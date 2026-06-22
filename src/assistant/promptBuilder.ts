// ============================================================
// Prompt Builder (Phase 8C)
//
// Builds a structured prompt object that includes ONLY: the fixed
// safety/capabilities preamble, grounded evidence (reused from the
// existing assistantGrounding kernel — never recomputed), the
// sanitized user question, and the model parameters from settings.
//
// Explicitly excludes: secrets (stripped by promptSanitizer), raw
// documents, unrestricted Firestore data, unsupported KPIs (only
// the grounded KPI key allowlist is included), and any hidden
// system action — there is no field for one.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import { extractGroundedFacts, listGroundedKpiKeys } from './assistantGrounding'
import type { GroundedFact } from './assistantGrounding'
import { sanitizeQuestionText } from './promptSanitizer'
import { SYSTEM_PREAMBLE } from './promptTemplates'
import type { AssistantContext } from './assistantTypes'
import type { AiSettings } from './aiSettingsTypes'

export interface BuiltPrompt {
  systemInstructions: string
  groundedEvidence:   GroundedFact[]
  allowedKpiKeys:     string[]
  userQuestion:        string
  maxTokens:           number
  temperature:         number
}

/**
 * Builds a structured, fully grounded prompt. Never throws — missing
 * settings fall back to safe defaults (low token budget, deterministic
 * temperature) rather than an error.
 */
export function buildPrompt(question: unknown, context: AssistantContext, settings?: Partial<AiSettings>): BuiltPrompt {
  try {
    return {
      systemInstructions: SYSTEM_PREAMBLE,
      groundedEvidence:   extractGroundedFacts(context),
      allowedKpiKeys:      listGroundedKpiKeys(context),
      userQuestion:        sanitizeQuestionText(question),
      maxTokens:           typeof settings?.maxTokens === 'number' ? settings.maxTokens : 500,
      temperature:         typeof settings?.temperature === 'number' ? settings.temperature : 0.2,
    }
  } catch {
    return {
      systemInstructions: SYSTEM_PREAMBLE, groundedEvidence: [], allowedKpiKeys: [],
      userQuestion: '', maxTokens: 500, temperature: 0.2,
    }
  }
}
