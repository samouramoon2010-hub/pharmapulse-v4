// ============================================================
// Profile Studio — Versioning Helpers (Phase 0A)
//
// Pure functions for semantic version management and effective
// date validation. No state, no Firestore, no React.
//
// Version format: major.minor.patch (e.g. "1.0.0", "0.1.0")
// Version labels: "${baseName} v${major}.${minor}.${patch}"
// ============================================================

import type { EvaluationProfileVersion } from './types'

// ── Version string helpers ────────────────────────────────────

/**
 * Parses a semantic version string into its components.
 * Returns null if the string does not match major.minor.patch.
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const parts = version.split('.')
  if (parts.length !== 3) return null
  const [major, minor, patch] = parts.map(Number)
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null
  if (major < 0 || minor < 0 || patch < 0) return null
  return { major, minor, patch }
}

/**
 * Creates a human-readable version label for a profile.
 *
 * @example
 * createProfileVersionLabel('Pharmacy Standard', 1, 2) → 'Pharmacy Standard v1.2.0'
 */
export function createProfileVersionLabel(
  baseName: string,
  major:    number,
  minor:    number,
  patch = 0,
): string {
  return `${baseName} v${major}.${minor}.${patch}`
}

/**
 * Increments the minor version component, resetting patch to 0.
 * Major version is unchanged.
 *
 * @example
 * incrementMinorVersion('1.2.3') → '1.3.0'
 */
export function incrementMinorVersion(version: string): string {
  const parsed = parseVersion(version)
  if (!parsed) throw new Error(`Invalid version string: "${version}"`)
  return `${parsed.major}.${parsed.minor + 1}.0`
}

/**
 * Increments the major version, resetting minor and patch to 0.
 *
 * @example
 * incrementMajorVersion('1.2.3') → '2.0.0'
 */
export function incrementMajorVersion(version: string): string {
  const parsed = parseVersion(version)
  if (!parsed) throw new Error(`Invalid version string: "${version}"`)
  return `${parsed.major + 1}.0.0`
}

/**
 * Compares two semantic version strings.
 *
 * Returns:
 *  -1 when a < b
 *   0 when a === b
 *  +1 when a > b
 */
export function compareProfileVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) {
    throw new Error(`Cannot compare invalid versions: "${a}" vs "${b}"`)
  }

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] < pb[key]) return -1
    if (pa[key] > pb[key]) return  1
  }
  return 0
}

/**
 * Creates a structured EvaluationProfileVersion from a version string and base name.
 */
export function buildProfileVersion(
  baseName: string,
  version:  string,
): EvaluationProfileVersion {
  const parsed = parseVersion(version)
  if (!parsed) throw new Error(`Invalid version string: "${version}"`)
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    label: createProfileVersionLabel(baseName, parsed.major, parsed.minor, parsed.patch),
  }
}

// ── Effective date validation ─────────────────────────────────

/** Result of effective date validation. */
export interface EffectiveDateValidationResult {
  valid:   boolean
  reason?: string
}

/**
 * Validates the effective date range for a profile version.
 *
 * Rules:
 *   - validFrom is required and must be a non-empty ISO date string.
 *   - validTo is optional.
 *   - When validTo is provided, it must be strictly after validFrom.
 *
 * Does NOT check for overlaps with other versions — that is a
 * registry-level concern handled in a later phase.
 */
export function validateEffectiveDates(
  validFrom: string,
  validTo?:  string,
): EffectiveDateValidationResult {
  if (!validFrom || typeof validFrom !== 'string' || validFrom.trim() === '') {
    return { valid: false, reason: 'validFrom is required and must be a non-empty string.' }
  }

  // Check validFrom is a plausible ISO date (yyyy-MM-dd at minimum)
  if (!/^\d{4}-\d{2}-\d{2}/.test(validFrom)) {
    return { valid: false, reason: `validFrom "${validFrom}" does not look like an ISO date (expected yyyy-MM-dd).` }
  }

  if (validTo !== undefined && validTo !== null && validTo !== '') {
    if (!/^\d{4}-\d{2}-\d{2}/.test(validTo)) {
      return { valid: false, reason: `validTo "${validTo}" does not look like an ISO date (expected yyyy-MM-dd).` }
    }

    if (validTo <= validFrom) {
      return {
        valid:  false,
        reason: `validTo "${validTo}" must be after validFrom "${validFrom}".`,
      }
    }
  }

  return { valid: true }
}
