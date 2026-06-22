// ============================================================
// Profile Studio — Profile Lifecycle (Phase 0A)
//
// Defines allowed status values and valid transitions between them.
// Mirrors the KPI lifecycle pattern from kpiRegistryTypes.ts but
// adapted for evaluation profiles.
//
// No Firestore. No React. No UI. No engine coupling.
// ============================================================

import type { ProfileStatus } from './types'

// ── Status constants ──────────────────────────────────────────

export const PROFILE_STATUS = {
  DRAFT:     'DRAFT',
  VALIDATED: 'VALIDATED',
  SIMULATED: 'SIMULATED',
  APPROVED:  'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED:  'ARCHIVED',
} as const satisfies Record<string, ProfileStatus>

// ── Allowed transition table ──────────────────────────────────
//
// Forward transitions (allowed):
//   DRAFT      → VALIDATED    (author completes definition)
//   VALIDATED  → SIMULATED    (simulation run requested)
//   SIMULATED  → APPROVED     (QA sign-off)
//   APPROVED   → PUBLISHED    (formal GO/NO-GO)
//   PUBLISHED  → ARCHIVED     (profile sunsetted)
//
// Escape transitions (to ARCHIVED from any pre-published state):
//   DRAFT      → ARCHIVED
//   VALIDATED  → ARCHIVED
//   SIMULATED  → ARCHIVED
//   APPROVED   → ARCHIVED
//
// Blocked:
//   PUBLISHED  → DRAFT        (data integrity risk)
//   PUBLISHED  → VALIDATED    (data integrity risk)
//   PUBLISHED  → SIMULATED    (data integrity risk)
//   PUBLISHED  → APPROVED     (can't demote a live profile)
//   SIMULATED  → PUBLISHED    (must pass APPROVED gate)
//   ARCHIVED   → anything     (terminal state)
//   Same state → same state   (no-op disallowed)

const ALLOWED_TRANSITIONS: Record<ProfileStatus, ProfileStatus[]> = {
  DRAFT:     ['VALIDATED', 'ARCHIVED'],
  VALIDATED: ['SIMULATED', 'ARCHIVED'],
  SIMULATED: ['APPROVED',  'ARCHIVED'],
  APPROVED:  ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED:  [],
}

// ── Public API ────────────────────────────────────────────────

/**
 * Returns true when transitioning from `from` to `to` is permitted.
 *
 * Invariant: same-state transitions are always false (no-ops not allowed).
 */
export function canTransitionProfileStatus(
  from: ProfileStatus,
  to:   ProfileStatus,
): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws a descriptive error when the transition is blocked.
 * Use in write paths to enforce governance.
 */
export function assertProfileStatusTransition(
  from: ProfileStatus,
  to:   ProfileStatus,
): void {
  if (!canTransitionProfileStatus(from, to)) {
    throw new Error(
      `Invalid profile status transition: ${from} → ${to}. ` +
      `Allowed targets from ${from}: [${(ALLOWED_TRANSITIONS[from] ?? []).join(', ') || 'none'}].`,
    )
  }
}

// ── Predicate helpers ─────────────────────────────────────────

/** True when the profile is in a terminal state (no further transitions possible). */
export function isTerminalStatus(status: ProfileStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0
}

/** True when the profile is live and used in official evaluations. */
export function isPublishedStatus(status: ProfileStatus): boolean {
  return status === 'PUBLISHED'
}

/**
 * True when the profile hierarchy may still be mutated.
 * DRAFT, VALIDATED, and SIMULATED are considered editable;
 * APPROVED, PUBLISHED, and ARCHIVED are locked.
 */
export function isEditableStatus(status: ProfileStatus): boolean {
  return status === 'DRAFT' || status === 'VALIDATED' || status === 'SIMULATED'
}
