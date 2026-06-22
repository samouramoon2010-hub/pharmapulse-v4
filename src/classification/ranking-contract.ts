// ============================================================
// Ranking Contract — RF-0
//
// Defines ONLY the shape of the future ranking key.
// Contains ZERO ranking logic, ZERO scoring, ZERO sorting.
//
// Purpose:
//   The Ranking Engine (RF-1) will use this contract to build
//   its composite keys. By defining and testing the key shape
//   now, we guarantee:
//     1. The key is deterministic and stable.
//     2. No schema refactor is needed when RF-1 is implemented.
//     3. All consumers (evaluations, leaderboards, history) agree
//        on the key format before any ranking data is written.
//
// Key format:
//   profileId :: profileVersion :: month :: branchClassification
//
// Example:
//   "smarts-2026-v1::1::2026-06::destination"
//
// Separator: "::" (double-colon, URL-safe, human-readable)
// ============================================================

import type { RankingKeyComponents } from './types'
import { isValidMonth } from './resolver'

// ── Separator ─────────────────────────────────────────────────

export const RANKING_KEY_SEPARATOR = '::'

// ── Key builder ───────────────────────────────────────────────

/**
 * Build the stable ranking peer-group key from its components.
 *
 * The key uniquely identifies the peer group:
 *   - profileId + profileVersion: which evaluation model was applied
 *   - month: the evaluation period
 *   - branchClassification: the tier (peer group dimension)
 *
 * Branches with the same key are comparable in rankings.
 * Branches with different keys are in different peer groups and
 * must NOT be ranked against each other.
 *
 * @pure — no I/O, deterministic.
 */
export function buildRankingKey(components: RankingKeyComponents): string {
  const { profileId, profileVersion, month, branchClassification } = components
  validateRankingKeyComponents(components)
  return [profileId, profileVersion, month, branchClassification].join(RANKING_KEY_SEPARATOR)
}

// ── Key parser ────────────────────────────────────────────────

/**
 * Parse a ranking key back into its components.
 * Returns null if the key format is invalid.
 */
export function parseRankingKey(key: string): RankingKeyComponents | null {
  if (!key) return null
  const parts = key.split(RANKING_KEY_SEPARATOR)
  if (parts.length !== 4) return null

  const [profileId, profileVersionStr, month, branchClassification] = parts
  const profileVersion = parseInt(profileVersionStr, 10)

  if (!profileId.trim()) return null
  if (!isFinite(profileVersion) || profileVersion < 1) return null
  if (!isValidMonth(month)) return null
  if (!branchClassification.trim()) return null

  return { profileId, profileVersion, month, branchClassification }
}

// ── Validation ────────────────────────────────────────────────

export interface RankingKeyValidationResult {
  valid:  boolean
  errors: string[]
}

/**
 * Validate ranking key components before building a key.
 * Throws on invalid input so callers fail loudly rather than
 * silently writing malformed keys to Firestore.
 */
export function validateRankingKeyComponents(
  components: RankingKeyComponents,
): void {
  const { profileId, profileVersion, month, branchClassification } = components
  const errors: string[] = []

  if (!profileId?.trim()) {
    errors.push('profileId must be a non-empty string')
  }
  if (!profileVersion || !isFinite(profileVersion) || profileVersion < 1) {
    errors.push('profileVersion must be a positive integer')
  }
  if (!isValidMonth(month)) {
    errors.push(`month must be in YYYY-MM format, got: "${month}"`)
  }
  if (!branchClassification?.trim()) {
    errors.push('branchClassification must be a non-empty string')
  }
  // Separator must not appear in any component (would break parsing)
  const sep = RANKING_KEY_SEPARATOR
  if (profileId?.includes(sep)) errors.push(`profileId must not contain "${sep}"`)
  if (month?.includes(sep))     errors.push(`month must not contain "${sep}"`)
  if (branchClassification?.includes(sep)) {
    errors.push(`branchClassification must not contain "${sep}"`)
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ranking key components:\n${errors.join('\n')}`)
  }
}

/**
 * Safe version of validateRankingKeyComponents — returns a result
 * object instead of throwing. Useful for testing and validation UIs.
 */
export function safeValidateRankingKeyComponents(
  components: Partial<RankingKeyComponents>,
): RankingKeyValidationResult {
  try {
    validateRankingKeyComponents(components as RankingKeyComponents)
    return { valid: true, errors: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      valid:  false,
      errors: message.split('\n').filter(Boolean).slice(1),
    }
  }
}

// ── Peer group equivalence ────────────────────────────────────

/**
 * Returns true if two sets of components belong to the same ranking peer group.
 * Two pharmacies are comparable only when ALL four dimensions match.
 *
 * @pure
 */
export function areSameRankingPeerGroup(
  a: RankingKeyComponents,
  b: RankingKeyComponents,
): boolean {
  return (
    a.profileId            === b.profileId            &&
    a.profileVersion       === b.profileVersion        &&
    a.month                === b.month                 &&
    a.branchClassification === b.branchClassification
  )
}

// ── Guard comments (enforce non-goals) ────────────────────────
//
// SEARCH THIS MODULE FOR "engine" — you will find only this comment.
// NO ranking logic, NO scoring, NO sorting, NO comparisons.
// The Ranking Engine (RF-1) imports these utilities but does NOT live here.
