// ============================================================
// Ranking Key Contract — RF-1A
//
// Deterministic key and document-ID builders.
// No Firestore. No React. No side effects.
//
// Branch cohort key:
//   periodId :: profileId :: profileVersion :: classificationId
//
// Branch document ID:
//   periodId#profileId#profileVersion#classificationId#branchId
//
// Pharmacist cohort key:
//   periodId :: profileId :: profileVersion :: pharmacistCohortId
//
// Pharmacist document ID:
//   periodId#profileId#profileVersion#pharmacistCohortId#pharmacistId
// ============================================================

import { RANKING_KEY_SEP, RANKING_DOC_SEP } from './constants'
import type { RankingPeriodId } from './types'

// ── Validation ────────────────────────────────────────────────

export interface RankingKeyValidation {
  valid:  boolean
  errors: string[]
}

function isValidPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p)
}

function noSep(s: string, sep: string): boolean {
  return !s.includes(sep)
}

/** Throw with a clear message if any component is invalid. */
function assertComponents(
  components: Record<string, string | number | undefined | null>,
  sep: string,
): void {
  const errors: string[] = []
  for (const [key, val] of Object.entries(components)) {
    if (val === undefined || val === null || String(val).trim() === '') {
      errors.push(`${key} must be a non-empty value`)
    } else if (typeof val === 'string' && !noSep(val, sep)) {
      errors.push(`${key} must not contain the separator "${sep}"`)
    }
  }
  if (errors.length) throw new Error(`Invalid ranking key:\n${errors.join('\n')}`)
}

// ── Branch cohort key ─────────────────────────────────────────

export interface BranchCohortKeyComponents {
  periodId:         RankingPeriodId
  profileId:        string
  profileVersion:   number
  classificationId: string
}

/**
 * Build a deterministic branch cohort key.
 * All branches with the same key are in the same peer group.
 *
 * @pure
 */
export function buildBranchCohortKey(c: BranchCohortKeyComponents): string {
  assertComponents({
    periodId:         c.periodId,
    profileId:        c.profileId,
    profileVersion:   c.profileVersion,
    classificationId: c.classificationId,
  }, RANKING_KEY_SEP)
  if (!isValidPeriod(c.periodId)) {
    throw new Error(`periodId must be YYYY-MM, got: "${c.periodId}"`)
  }
  return [c.periodId, c.profileId, c.profileVersion, c.classificationId].join(RANKING_KEY_SEP)
}

/**
 * Build a deterministic branch snapshot document ID.
 *
 * @pure
 */
export function buildBranchSnapshotDocId(
  c: BranchCohortKeyComponents & { branchId: string },
): string {
  assertComponents({
    periodId:         c.periodId,
    profileId:        c.profileId,
    profileVersion:   c.profileVersion,
    classificationId: c.classificationId,
    branchId:         c.branchId,
  }, RANKING_DOC_SEP)
  return [c.periodId, c.profileId, c.profileVersion, c.classificationId, c.branchId]
    .join(RANKING_DOC_SEP)
}

// ── Pharmacist cohort key ─────────────────────────────────────

export interface PharmacistCohortKeyComponents {
  periodId:            RankingPeriodId
  profileId:           string
  profileVersion:      number
  /** classificationId of home branch (full-time) or 'float-pool' (float) */
  pharmacistCohortId:  string
}

/**
 * Build a deterministic pharmacist cohort key.
 *
 * @pure
 */
export function buildPharmacistCohortKey(c: PharmacistCohortKeyComponents): string {
  assertComponents({
    periodId:           c.periodId,
    profileId:          c.profileId,
    profileVersion:     c.profileVersion,
    pharmacistCohortId: c.pharmacistCohortId,
  }, RANKING_KEY_SEP)
  if (!isValidPeriod(c.periodId)) {
    throw new Error(`periodId must be YYYY-MM, got: "${c.periodId}"`)
  }
  return [c.periodId, c.profileId, c.profileVersion, c.pharmacistCohortId].join(RANKING_KEY_SEP)
}

/**
 * Build a deterministic pharmacist snapshot document ID.
 *
 * @pure
 */
export function buildPharmacistSnapshotDocId(
  c: PharmacistCohortKeyComponents & { pharmacistId: string },
): string {
  assertComponents({
    periodId:           c.periodId,
    profileId:          c.profileId,
    profileVersion:     c.profileVersion,
    pharmacistCohortId: c.pharmacistCohortId,
    pharmacistId:       c.pharmacistId,
  }, RANKING_DOC_SEP)
  return [c.periodId, c.profileId, c.profileVersion, c.pharmacistCohortId, c.pharmacistId]
    .join(RANKING_DOC_SEP)
}

// ── Parsers ───────────────────────────────────────────────────

/** Parse a branch cohort key. Returns null if malformed. */
export function parseBranchCohortKey(key: string): BranchCohortKeyComponents | null {
  if (!key) return null
  const parts = key.split(RANKING_KEY_SEP)
  if (parts.length !== 4) return null
  const [periodId, profileId, profileVersionStr, classificationId] = parts
  const profileVersion = parseInt(profileVersionStr, 10)
  if (!isValidPeriod(periodId)) return null
  if (!profileId.trim()) return null
  if (!isFinite(profileVersion) || profileVersion < 1) return null
  if (!classificationId.trim()) return null
  return { periodId, profileId, profileVersion, classificationId }
}

/** Parse a pharmacist cohort key. Returns null if malformed. */
export function parsePharmacistCohortKey(key: string): PharmacistCohortKeyComponents | null {
  if (!key) return null
  const parts = key.split(RANKING_KEY_SEP)
  if (parts.length !== 4) return null
  const [periodId, profileId, profileVersionStr, pharmacistCohortId] = parts
  const profileVersion = parseInt(profileVersionStr, 10)
  if (!isValidPeriod(periodId)) return null
  if (!profileId.trim()) return null
  if (!isFinite(profileVersion) || profileVersion < 1) return null
  if (!pharmacistCohortId.trim()) return null
  return { periodId, profileId, profileVersion, pharmacistCohortId }
}

// ── Safe validators ───────────────────────────────────────────

export function safeValidateBranchCohortKey(
  c: Partial<BranchCohortKeyComponents>,
): RankingKeyValidation {
  try {
    buildBranchCohortKey(c as BranchCohortKeyComponents)
    return { valid: true, errors: [] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Don't slice — include all error lines
    return { valid: false, errors: msg.split('\n').filter(Boolean) }
  }
}

export function safeValidatePharmacistCohortKey(
  c: Partial<PharmacistCohortKeyComponents>,
): RankingKeyValidation {
  try {
    buildPharmacistCohortKey(c as PharmacistCohortKeyComponents)
    return { valid: true, errors: [] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { valid: false, errors: msg.split('\n').filter(Boolean) }
  }
}
