// ============================================================
// Prompt Sanitizer (Phase 8C)
//
// Sanitizes the raw user question before it is included in a prompt:
// truncates excessive length (prevents giant injected payloads) and
// redacts any credential-shaped substring, so a secret pasted into
// the question box is never forwarded anywhere.
//
// No Firestore. No React. No UI. No AI. No network calls.
// ============================================================

const MAX_QUESTION_LENGTH = 1000

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/g, /AIza[a-zA-Z0-9_-]{20,}/g,
  /api[_-]?key\s*[:=]\s*\S+/gi, /bearer\s+[a-zA-Z0-9._-]{10,}/gi,
  /password\s*[:=]\s*\S+/gi,
]

/** Redacts credential-shaped substrings from text. Never throws. */
export function redactSecrets(text: unknown): string {
  try {
    let value = typeof text === 'string' ? text : ''
    for (const pattern of SECRET_PATTERNS) value = value.replace(pattern, '[REDACTED]')
    return value
  } catch {
    return ''
  }
}

/** Truncates text to a safe maximum length. Never throws. */
export function truncateText(text: unknown, maxLength: number = MAX_QUESTION_LENGTH): string {
  try {
    const value = typeof text === 'string' ? text : ''
    return value.length > maxLength ? value.slice(0, maxLength) : value
  } catch {
    return ''
  }
}

/** Full sanitization pipeline for a raw user question: truncate, then redact. Never throws. */
export function sanitizeQuestionText(question: unknown): string {
  try {
    return redactSecrets(truncateText(question))
  } catch {
    return ''
  }
}
