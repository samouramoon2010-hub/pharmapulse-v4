// ============================================================
// Profile Studio — Draft Workflow Engine (Phase 0F)
//
// Governs lifecycle transitions for evaluation profile drafts.
// Every function returns a WorkflowResult — never throws, never
// mutates its inputs.
//
// NO Firestore. NO React. NO UI. NO routes. NO AI. NO scoring engine.
// ============================================================

import type { EvaluationProfileDraft, ProfileStatus } from './types'
import { canTransitionProfileStatus } from './lifecycle'
import { validateProfile } from './validation'
import { validatePublishReadiness } from './advancedValidation'
import { simulateProfile } from './simulator'
import { createEmptyEvaluationProfile } from './profileFactory'
import { generateProfileId } from './profileFactory'
import type { CreateProfileOptions } from './profileFactory'
import type { StudioSimulationResult } from './simulator'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Public types
// ════════════════════════════════════════════════════════════

/** Audit log record attached to every workflow action. */
export interface ProfileAuditRecord {
  profileId:    string
  action:       string
  performedBy?: string
  performedAt:  string
  fromStatus?:  ProfileStatus
  toStatus?:    ProfileStatus
  notes?:       string
}

/** Standard result returned by every workflow function. */
export interface WorkflowResult {
  success:         boolean
  /** Updated profile (only present on success). */
  profile?:        EvaluationProfileDraft
  /** Human-readable issue messages (always present). */
  issues:          string[]
  previousStatus?: ProfileStatus
  newStatus?:      ProfileStatus
  auditRecord?:    ProfileAuditRecord
  /** Simulation result — only present when simulateDraft succeeds. */
  simulationResult?: StudioSimulationResult
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Internal helpers
// ════════════════════════════════════════════════════════════

function nowIso(): string {
  return new Date().toISOString()
}

/** Returns a new profile with the status field updated (immutable). */
function setStatus(
  profile: EvaluationProfileDraft,
  status:  ProfileStatus,
): EvaluationProfileDraft {
  return {
    ...profile,
    metadata: { ...profile.metadata, status, updatedAt: nowIso() },
  }
}

function makeAudit(
  profileId:   string,
  action:      string,
  by?:         string,
  from?:       ProfileStatus,
  to?:         ProfileStatus,
  notes?:      string,
): ProfileAuditRecord {
  return {
    profileId,
    action,
    performedBy: by,
    performedAt: nowIso(),
    fromStatus:  from,
    toStatus:    to,
    notes,
  }
}

function fail(
  issues:         string[],
  previousStatus?: ProfileStatus,
): WorkflowResult {
  return { success: false, issues, previousStatus }
}

function succeed(
  profile:         EvaluationProfileDraft,
  prevStatus:      ProfileStatus | undefined,
  newStatus:       ProfileStatus,
  auditRecord?:    ProfileAuditRecord,
  simResult?:      StudioSimulationResult,
): WorkflowResult {
  return {
    success:           true,
    profile,
    issues:            [],
    previousStatus:    prevStatus,
    newStatus,
    auditRecord,
    simulationResult:  simResult,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Lifecycle workflow functions
// ════════════════════════════════════════════════════════════

/**
 * Creates a new evaluation profile draft.
 *
 * The returned profile is always in DRAFT status.
 * Never throws.
 */
export function createDraft(
  options: CreateProfileOptions,
  by?:     string,
): WorkflowResult {
  try {
    const profile: EvaluationProfileDraft = {
      ...createEmptyEvaluationProfile(options),
    }
    if (by) {
      profile.metadata = { ...profile.metadata, createdBy: by }
    }

    return succeed(
      profile,
      undefined,
      'DRAFT',
      makeAudit(profile.metadata.id, 'CREATE_DRAFT', by, undefined, 'DRAFT'),
    )
  } catch (e) {
    return fail([`createDraft failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Validates a draft profile and transitions it to VALIDATED.
 *
 * Allowed from: DRAFT, VALIDATED (re-validation).
 * On success   → returns profile in VALIDATED status.
 * On failure   → returns the issues, profile status unchanged.
 *
 * Never throws.
 */
export function validateDraft(
  profile: EvaluationProfileDraft,
  by?:     string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    const canGoToValidated = canTransitionProfileStatus(status as ProfileStatus, 'VALIDATED')
    const alreadyValidated = status === 'VALIDATED'

    if (!canGoToValidated && !alreadyValidated) {
      return fail(
        [`Cannot validate profile in status "${status}". Allowed from: DRAFT or VALIDATED.`],
        status,
      )
    }

    const validation = validateProfile(profile)
    if (!validation.valid) {
      const errors = validation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => `${i.code}: ${i.message}`)
      return fail(errors, status)
    }

    const prev       = status as ProfileStatus
    const newProfile = setStatus(profile, 'VALIDATED')
    return succeed(
      newProfile,
      prev,
      'VALIDATED',
      makeAudit(profile.metadata.id, 'VALIDATE', by, prev, 'VALIDATED'),
    )
  } catch (e) {
    return fail([`validateDraft failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Runs the simulation kernel against the profile and transitions it
 * to SIMULATED on success.
 *
 * Allowed from: VALIDATED, SIMULATED (re-simulation).
 * Never throws.
 *
 * @param actuals — KPI actual values (missing keys default to 0)
 * @param targets — KPI target values (missing keys default to 0)
 */
export function simulateDraft(
  profile: EvaluationProfileDraft,
  actuals: Record<string, number> = {},
  targets: Record<string, number> = {},
  by?:     string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    const canTransition = canTransitionProfileStatus(status as ProfileStatus, 'SIMULATED')
    const alreadySimulated = status === 'SIMULATED'

    if (!canTransition && !alreadySimulated) {
      return fail(
        [`Cannot simulate profile in status "${status}". Allowed from: VALIDATED or SIMULATED.`],
        status,
      )
    }

    const simResult = simulateProfile({ profile, actuals, targets })

    if (!simResult.valid) {
      return { success: false, issues: simResult.issues, previousStatus: status, simulationResult: simResult }
    }

    const prev       = status as ProfileStatus
    const newProfile = setStatus(profile, 'SIMULATED')
    return succeed(
      newProfile,
      prev,
      'SIMULATED',
      makeAudit(profile.metadata.id, 'SIMULATE', by, prev, 'SIMULATED'),
      simResult,
    )
  } catch (e) {
    return fail([`simulateDraft failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Approves a simulated profile — transitions SIMULATED → APPROVED.
 * No structural validation is run at this stage (already done in previous steps).
 * Never throws.
 */
export function approveDraft(
  profile: EvaluationProfileDraft,
  by?:     string,
  notes?:  string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    if (!canTransitionProfileStatus(status as ProfileStatus, 'APPROVED')) {
      return fail(
        [`Cannot approve profile in status "${status}". Allowed from: SIMULATED.`],
        status,
      )
    }

    const prev       = status as ProfileStatus
    const newProfile = setStatus(profile, 'APPROVED')
    return succeed(
      newProfile,
      prev,
      'APPROVED',
      makeAudit(profile.metadata.id, 'APPROVE', by, prev, 'APPROVED', notes),
    )
  } catch (e) {
    return fail([`approveDraft failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Validates publish readiness and transitions APPROVED → PUBLISHED.
 *
 * Runs the publish readiness gate before transitioning.
 * Returns issues if the profile is not ready.
 * Never throws.
 */
export function markPublishReady(
  profile: EvaluationProfileDraft,
  by?:     string,
  notes?:  string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    // Run publish readiness gate
    const readiness = validatePublishReadiness(profile)
    if (!readiness.valid) {
      const issues = readiness.issues.map(
        (i) => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`,
      )
      return fail(issues, status)
    }

    if (!canTransitionProfileStatus(status as ProfileStatus, 'PUBLISHED')) {
      return fail(
        [`Cannot publish profile in status "${status}". Allowed from: APPROVED.`],
        status,
      )
    }

    const prev       = status as ProfileStatus
    const newProfile = setStatus(profile, 'PUBLISHED')
    return succeed(
      newProfile,
      prev,
      'PUBLISHED',
      makeAudit(profile.metadata.id, 'PUBLISH', by, prev, 'PUBLISHED', notes),
    )
  } catch (e) {
    return fail([`markPublishReady failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Archives a profile — transitions any non-ARCHIVED status → ARCHIVED.
 * ARCHIVED is a terminal state; calling this on an already-archived
 * profile returns an error.
 * Never throws.
 */
export function archiveProfile(
  profile: EvaluationProfileDraft,
  by?:     string,
  notes?:  string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    if (!canTransitionProfileStatus(status as ProfileStatus, 'ARCHIVED')) {
      return fail(
        [`Cannot archive profile in status "${status}". ARCHIVED is a terminal state and cannot be re-archived.`],
        status,
      )
    }

    const prev       = status as ProfileStatus
    const newProfile = setStatus(profile, 'ARCHIVED')
    return succeed(
      newProfile,
      prev,
      'ARCHIVED',
      makeAudit(profile.metadata.id, 'ARCHIVE', by, prev, 'ARCHIVED', notes),
    )
  } catch (e) {
    return fail([`archiveProfile failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

/**
 * Creates a new DRAFT clone from an archived profile.
 *
 * Because ARCHIVED is a terminal state (no transitions out), restoration
 * creates a new profile with a new ID rather than reviving the original.
 * The source profile is not modified.
 * Never throws.
 */
export function restoreArchivedProfile(
  profile: EvaluationProfileDraft,
  by?:     string,
): WorkflowResult {
  try {
    const status = profile?.metadata?.status as ProfileStatus | undefined

    if (status !== 'ARCHIVED') {
      return fail(
        [`Cannot restore profile in status "${status}". Only ARCHIVED profiles can be restored.`],
        status,
      )
    }

    const newId = generateProfileId('restored')
    const now   = nowIso()

    const restoredProfile: EvaluationProfileDraft = {
      ...profile,
      metadata: {
        ...profile.metadata,
        id:        newId,
        status:    'DRAFT',
        createdBy: by ?? profile.metadata.createdBy,
        createdAt: now,
        updatedAt: now,
      },
    }

    return succeed(
      restoredProfile,
      'ARCHIVED',
      'DRAFT',
      makeAudit(newId, 'RESTORE_FROM_ARCHIVE', by, 'ARCHIVED', 'DRAFT',
        `Restored from archived profile ${profile.metadata.id}`),
    )
  } catch (e) {
    return fail([`restoreArchivedProfile failed: ${e instanceof Error ? e.message : String(e)}`])
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Readiness predicates
// ════════════════════════════════════════════════════════════

/** Returns true when the profile is in DRAFT status. */
export function isDraft(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'DRAFT'
}

/** Returns true when the profile is in VALIDATED status. */
export function isValidated(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'VALIDATED'
}

/** Returns true when the profile is in SIMULATED status. */
export function isSimulated(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'SIMULATED'
}

/** Returns true when the profile is in APPROVED status. */
export function isApproved(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'APPROVED'
}

/** Returns true when the profile is in PUBLISHED status. */
export function isPublished(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'PUBLISHED'
}

/** Returns true when the profile is in ARCHIVED status. */
export function isArchived(profile: EvaluationProfileDraft): boolean {
  return profile?.metadata?.status === 'ARCHIVED'
}

/**
 * Returns true when the profile passes publish readiness checks
 * (status=APPROVED, valid structure, valid weights, valid dates, valid version).
 *
 * Does not perform the transition. Never throws.
 */
export function isPublishReady(profile: EvaluationProfileDraft): boolean {
  try {
    return validatePublishReadiness(profile).valid
  } catch {
    return false
  }
}
