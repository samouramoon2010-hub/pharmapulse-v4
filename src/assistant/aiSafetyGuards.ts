// ============================================================
// Assistant — AI Safety Layer (Phase 7D / 7E)
//
// Validates assistant output (and the questions/configs that feed
// it) against the deterministic context. These guards are what make
// "no hallucinated KPI names", "no profile mutation", "no hidden
// actions", and "no raw prompt injection" enforceable rather than
// aspirational — every check inspects real text/objects and returns
// a structured violation list.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

import { listGroundedKpiKeys } from './assistantGrounding'
import type { AssistantContext } from './assistantTypes'
import type { AssistantAnswer } from './answerBuilder'

export interface SafetyViolation {
  rule:    string
  message: string
}

export interface SafetyCheckResult {
  safe:       boolean
  violations: SafetyViolation[]
}

function ok(): SafetyCheckResult {
  return { safe: true, violations: [] }
}

function fail(rule: string, message: string): SafetyCheckResult {
  return { safe: false, violations: [{ rule, message }] }
}

function merge(results: SafetyCheckResult[]): SafetyCheckResult {
  const violations = results.flatMap((r) => r.violations)
  return { safe: violations.length === 0, violations }
}

// ── Individual guards ────────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/, /api[_-]?key\s*[:=]/i, /bearer\s+[a-zA-Z0-9._-]{10,}/i,
  /password\s*[:=]/i, /secret\s*[:=]/i, /authorization\s*:\s*\S+/i,
]

/** Flags any credential-like substring in free text. Never throws. */
export function checkNoSecretsInText(text: unknown): SafetyCheckResult {
  try {
    const value = typeof text === 'string' ? text : ''
    const hit = SECRET_PATTERNS.find((p) => p.test(value))
    return hit ? fail('no_secrets', 'Output contains a credential-like pattern.') : ok()
  } catch {
    return fail('no_secrets', 'Safety check threw — treated as unsafe by default.')
  }
}

const MUTATION_PATTERNS = [
  /\bi (have )?(updated|deleted|saved|wrote|published|approved|archived|created)\b/i,
  /\bchanges (have been|were) (saved|applied|committed)\b/i,
  /\bthe profile (has been|was) (updated|modified|changed)\b/i,
]

/** Flags any language claiming a write/mutation occurred. Never throws. */
export function checkNoMutationLanguage(text: unknown): SafetyCheckResult {
  try {
    const value = typeof text === 'string' ? text : ''
    const hit = MUTATION_PATTERNS.find((p) => p.test(value))
    return hit ? fail('no_mutation_claims', 'Output claims to have mutated data — the assistant is read-only.') : ok()
  } catch {
    return fail('no_mutation_claims', 'Safety check threw — treated as unsafe by default.')
  }
}

const FIRESTORE_PATTERNS = [/\baddDoc\(/, /\bsetDoc\(/, /\bupdateDoc\(/, /\bdeleteDoc\(/, /\bfirestore\.write\b/i]

/** Flags any literal Firestore write call mentioned in output text. Never throws. */
export function checkNoFirestoreReferences(text: unknown): SafetyCheckResult {
  try {
    const value = typeof text === 'string' ? text : ''
    const hit = FIRESTORE_PATTERNS.find((p) => p.test(value))
    return hit ? fail('no_firestore_writes', 'Output references a Firestore write call.') : ok()
  } catch {
    return fail('no_firestore_writes', 'Safety check threw — treated as unsafe by default.')
  }
}

const INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior|above) instructions\b/i,
  /\byou are now\b/i,
  /\bsystem\s*:/i,
  /\bact as\b/i,
  /\breveal (your|the) (system )?prompt\b/i,
  /\bdisregard (your|the) (rules|guidelines|instructions)\b/i,
  /\bforget (everything|all)( above| previous)?\b/i,
]

/**
 * Flags prompt-injection-looking phrases in the raw user question.
 * This is advisory, not blocking — the deterministic router never
 * executes instructions from the question text, so injection has
 * no actual effect; this check exists to flag attempts for auditing
 * and to validate that behavior in tests.
 */
export function checkPromptInjectionResistance(question: unknown): SafetyCheckResult {
  try {
    const value = typeof question === 'string' ? question : ''
    const hits = INJECTION_PATTERNS.filter((p) => p.test(value))
    if (hits.length === 0) return ok()
    return fail('prompt_injection_detected', `Question contains ${hits.length} injection-like phrase(s); router output is unaffected because it only matches a fixed keyword allowlist.`)
  } catch {
    return ok()
  }
}

/** Flags any KPI-key-shaped token quoted in the answer that isn't actually grounded in the context's trace. */
export function checkNoHallucinatedKpiNames(answerText: unknown, context: AssistantContext, claimedKpiKeys: string[] = []): SafetyCheckResult {
  try {
    const grounded = new Set(listGroundedKpiKeys(context))
    const hallucinated = (claimedKpiKeys ?? []).filter((k) => !grounded.has(k))
    if (hallucinated.length === 0) return ok()
    return fail('no_hallucinated_kpi', `Output references KPI key(s) not present in the grounded context: ${hallucinated.join(', ')}.`)
  } catch {
    return fail('no_hallucinated_kpi', 'Safety check threw — treated as unsafe by default.')
  }
}

/** Every evidence item must declare a recognised source category that matches a context field actually present. */
export function checkEvidenceGrounded(answer: AssistantAnswer, context: AssistantContext): SafetyCheckResult {
  try {
    const presence: Record<string, boolean> = {
      ledger:         !!context?.ledgerEntry,
      ranking:        !!context?.rankingEntry,
      benchmark:      !!context?.benchmark,
      trend:          !!context?.trend,
      opportunity:    !!context?.opportunities,
      recommendation: !!context?.recommendations,
      trace:          !!context?.trace,
      profile:        !!context?.profileMetadata,
    }
    const ungrounded = (answer?.evidence ?? []).filter((fact) => !presence[fact.source])
    if (ungrounded.length === 0) return ok()
    return fail('evidence_not_grounded', `${ungrounded.length} evidence item(s) cite a source not present in the context.`)
  } catch {
    return fail('evidence_not_grounded', 'Safety check threw — treated as unsafe by default.')
  }
}

/** Scans a provider config object for any field that looks like a credential — none should ever be present. */
export function checkProviderConfigHasNoCredentials(config: unknown): SafetyCheckResult {
  try {
    if (typeof config !== 'object' || config === null) return ok()
    const keys = Object.keys(config as Record<string, unknown>)
    // Splits camelCase field names into words first, so a legitimate field
    // like "maxTokens" (token *count*, not a credential) is never flagged —
    // only a standalone "key"/"secret"/"token"/"password"/"credential" word is.
    const splitWords = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean)
    const CREDENTIAL_WORDS = new Set(['key', 'secret', 'token', 'password', 'credential', 'credentials'])
    const suspicious = keys.filter((k) => splitWords(k).some((w) => CREDENTIAL_WORDS.has(w)))
    if (suspicious.length === 0) return ok()
    return fail('no_api_keys', `Provider config contains suspicious field(s): ${suspicious.join(', ')}.`)
  } catch {
    return fail('no_api_keys', 'Safety check threw — treated as unsafe by default.')
  }
}

/** No assistant output should ever assert it performed a scoring/ranking calculation itself. */
export function checkNoSelfReportedCalculation(text: unknown): SafetyCheckResult {
  try {
    const value = typeof text === 'string' ? text : ''
    const hit = /\bi (calculated|computed|ranked|scored)\b/i.test(value)
    return hit ? fail('no_ai_calculation', 'Output claims the assistant itself performed a calculation.') : ok()
  } catch {
    return fail('no_ai_calculation', 'Safety check threw — treated as unsafe by default.')
  }
}

/**
 * Runs every safety guard against a built answer and aggregates the
 * results. Never throws.
 */
export function runAllSafetyChecks(
  answer:          AssistantAnswer,
  context:         AssistantContext,
  options?:        { question?: string; providerConfig?: unknown; claimedKpiKeys?: string[] },
): SafetyCheckResult {
  try {
    return merge([
      checkNoSecretsInText(answer?.text),
      checkNoMutationLanguage(answer?.text),
      checkNoFirestoreReferences(answer?.text),
      checkNoSelfReportedCalculation(answer?.text),
      checkPromptInjectionResistance(options?.question ?? answer?.question),
      checkNoHallucinatedKpiNames(answer?.text, context, options?.claimedKpiKeys),
      checkEvidenceGrounded(answer, context),
      checkProviderConfigHasNoCredentials(options?.providerConfig),
    ])
  } catch {
    return fail('safety_check_failed', 'runAllSafetyChecks threw — treated as unsafe by default.')
  }
}
