// ============================================================
// Profile Studio — Integrity Kernel (Phase 0F)
//
// Deterministic hashing and tamper detection for evaluation profiles.
// All functions are pure and never throw on normal inputs.
//
// No Firestore. No React. No UI. No scoring engine.
// ============================================================

import type { EvaluationProfileDraft } from './types'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Stable serialisation
// ════════════════════════════════════════════════════════════

/**
 * Produces a deterministic JSON string for any value by sorting
 * object keys recursively.  Arrays preserve insertion order (by
 * design — shuffled arrays represent different data).
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).sort()
    const pairs = keys.map(
      (k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]),
    )
    return '{' + pairs.join(',') + '}'
  }
  return JSON.stringify(value)
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — djb2 hash
// ════════════════════════════════════════════════════════════

/**
 * Classic djb2 hash — fast, deterministic, 32-bit output as hex.
 * Suitable for content-identity checks (not cryptographic security).
 */
function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash  // keep 32-bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Hashable payload builder
// ════════════════════════════════════════════════════════════

/**
 * Extracts the content-representative subset of a profile for hashing.
 *
 * Volatile fields (createdAt, updatedAt) are excluded so that equal
 * profiles saved at different times produce equal hashes.
 */
function hashablePayload(profile: EvaluationProfileDraft): unknown {
  const m = profile?.metadata
  return {
    id:          m?.id        ?? null,
    name:        m?.name      ?? null,
    version:     m?.version   ?? null,
    status:      m?.status    ?? null,
    scope:       m?.scope     ?? null,
    validFrom:   m?.validFrom ?? null,
    validTo:     m?.validTo   ?? null,
    description: m?.description ?? null,
    tags:        m?.tags       ?? null,
    root:        profile?.root ?? null,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Public API
// ════════════════════════════════════════════════════════════

/**
 * Calculates a deterministic content hash for an evaluation profile.
 *
 * Rules:
 *   - Two structurally equal profiles always produce the same hash.
 *   - Any change to metadata or hierarchy produces a different hash.
 *   - Volatile fields (createdAt, updatedAt) are excluded.
 *   - Never throws — returns the hash string '00000000' on null input.
 */
export function calculateProfileHash(profile: EvaluationProfileDraft): string {
  try {
    const payload = hashablePayload(profile)
    return djb2Hash(stableStringify(payload))
  } catch {
    return '00000000'
  }
}

/**
 * Verifies that a profile's current content matches an expected hash.
 *
 * @param profile       — profile to verify
 * @param expectedHash  — previously stored hash to compare against
 * @returns true when the hash matches (profile is unmodified)
 */
export function verifyProfileIntegrity(
  profile:      EvaluationProfileDraft,
  expectedHash: string,
): boolean {
  try {
    return calculateProfileHash(profile) === expectedHash
  } catch {
    return false
  }
}

/** Result returned by detectTampering. */
export interface TamperReport {
  /** true when the profile content differs from the recorded snapshot hash. */
  tampered:     boolean
  /** Human-readable reason when tampered; undefined otherwise. */
  reason?:      string
  expectedHash: string
  actualHash:   string
}

/**
 * Compares a profile's current hash against a previously recorded hash
 * (e.g. stored in a snapshot) and reports whether tampering has occurred.
 *
 * @param profile   — profile whose current state is checked
 * @param snapshot  — any object that exposes a `hash` string field
 * @returns TamperReport — never throws
 */
export function detectTampering(
  profile:  EvaluationProfileDraft,
  snapshot: { hash: string },
): TamperReport {
  try {
    const actualHash   = calculateProfileHash(profile)
    const expectedHash = snapshot?.hash ?? ''
    const tampered     = actualHash !== expectedHash

    return {
      tampered,
      reason:       tampered ? 'Profile content differs from recorded snapshot hash.' : undefined,
      expectedHash,
      actualHash,
    }
  } catch (e) {
    return {
      tampered:     true,
      reason:       `Integrity check failed: ${e instanceof Error ? e.message : String(e)}`,
      expectedHash: snapshot?.hash ?? '',
      actualHash:   '00000000',
    }
  }
}
