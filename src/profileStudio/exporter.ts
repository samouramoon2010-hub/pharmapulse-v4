// ============================================================
// Profile Studio — Export Kernel (Phase 0F)
//
// Snapshot creation, profile export / import, and publish packages.
// All operations return plain objects — no files, no Firestore,
// no compression, no network.
//
// No Firestore. No React. No UI. No routes. No AI. No engine.
// ============================================================

import type { EvaluationProfileDraft, ProfileStatus, EvaluationProfileMetadata } from './types'
import { calculateProfileHash } from './integrity'
import { validateProfile } from './validation'
import { validatePublishReadiness } from './advancedValidation'
import type { StudioSimulationResult } from './simulator'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Types
// ════════════════════════════════════════════════════════════

/** A frozen point-in-time copy of a profile with its hash. */
export interface ProfileSnapshot {
  snapshotId:  string
  profileId:   string
  version:     string
  status:      ProfileStatus
  createdAt:   string
  hash:        string
  metadata:    EvaluationProfileMetadata
  /** Full profile payload captured at snapshot time. */
  profile:     EvaluationProfileDraft
  notes?:      string
}

/** Wire format produced by exportProfileJson. */
export interface ProfileExportBundle {
  /** Schema version of this export format (always "1.0"). */
  exportVersion: string
  exportedAt:    string
  hash:          string
  profile:       EvaluationProfileDraft
  /** Profile's semantic version at export time — mirrors profile.metadata.version. */
  profileVersion: string
  /** Mirrors profile.metadata.pipelineId, defaulting to the production resolver's own default. */
  pipelineId:     'legacy-band-score' | 'smarts-weighted-contribution'
  /** Engine compatibility tag — informational only, never executed by Studio. */
  engineCompatibilityVersion: string
}

/** Result of importProfileJson. */
export interface ProfileImportResult {
  success: boolean
  profile?: EvaluationProfileDraft
  errors:  string[]
}

/** Summary fields included in every publish package. */
export interface PublishReadinessSummary {
  valid:         boolean
  issueCount:    number
  criticalCount: number
  warningCount:  number
}

/** Optional simulation summary in publish and simulation packages. */
export interface SimulationSummary {
  score:       number
  valid:       boolean
  basketCount: number
}

/** Full publish package returned by exportPublishPackage. */
export interface PublishPackage {
  packageId:              string
  createdAt:              string
  profileId:              string
  profileVersion:         string
  hash:                   string
  profile:                EvaluationProfileDraft
  metadata:               EvaluationProfileMetadata
  publishReadinessSummary: PublishReadinessSummary
  simulationSummary?:     SimulationSummary
  /** Mirrors profile.metadata.pipelineId, defaulting to the production resolver's own default. */
  pipelineId:             'legacy-band-score' | 'smarts-weighted-contribution'
  /** Engine compatibility tag — informational only, never executed by Studio. */
  engineCompatibilityVersion: string
}

/** Simulation-focused package returned by exportSimulationPackage. */
export interface SimulationPackage {
  packageId:        string
  createdAt:        string
  profileId:        string
  profileVersion:   string
  hash:             string
  profile:          EvaluationProfileDraft
  simulationResult: StudioSimulationResult
  score:            number
  valid:            boolean
}

/** Structural diff between two snapshots. */
export interface SnapshotComparison {
  profileId:        string
  snapshotA:        string    // snapshotId
  snapshotB:        string
  statusChanged:    boolean
  versionChanged:   boolean
  hashChanged:      boolean
  contentChanged:   boolean   // true when hash changed
  snapshotAStatus:  ProfileStatus
  snapshotBStatus:  ProfileStatus
  snapshotAVersion: string
  snapshotBVersion: string
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Internal helpers
// ════════════════════════════════════════════════════════════

let _snapshotCounter = 0
let _packageCounter  = 0

function nowIso(): string {
  return new Date().toISOString()
}

function generateSnapshotId(): string {
  _snapshotCounter++
  return `snap_${Date.now()}_${_snapshotCounter}`
}

function generatePackageId(): string {
  _packageCounter++
  return `pkg_${Date.now()}_${_packageCounter}`
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Snapshot API
// ════════════════════════════════════════════════════════════

/**
 * Captures a point-in-time snapshot of a profile.
 *
 * The snapshot stores a deep copy of the profile payload so subsequent
 * mutations to the source do not affect the snapshot.
 *
 * @param profile — profile to capture
 * @param notes   — optional human note (e.g. "before Q2 update")
 */
export function createProfileSnapshot(
  profile: EvaluationProfileDraft,
  notes?:  string,
): ProfileSnapshot {
  const hash = calculateProfileHash(profile)
  return {
    snapshotId: generateSnapshotId(),
    profileId:  profile.metadata.id,
    version:    profile.metadata.version,
    status:     profile.metadata.status,
    createdAt:  nowIso(),
    hash,
    metadata:   { ...profile.metadata },
    profile:    JSON.parse(JSON.stringify(profile)) as EvaluationProfileDraft,
    notes,
  }
}

/**
 * Creates a new snapshot from an existing one, assigning a fresh
 * snapshotId and createdAt timestamp.  Profile content is copied.
 */
export function cloneSnapshot(snapshot: ProfileSnapshot): ProfileSnapshot {
  return {
    ...snapshot,
    snapshotId: generateSnapshotId(),
    createdAt:  nowIso(),
    profile:    JSON.parse(JSON.stringify(snapshot.profile)) as EvaluationProfileDraft,
    metadata:   { ...snapshot.metadata },
  }
}

/**
 * Compares two snapshots and identifies structural differences.
 */
export function compareSnapshots(
  a: ProfileSnapshot,
  b: ProfileSnapshot,
): SnapshotComparison {
  const hashChanged    = a.hash    !== b.hash
  const versionChanged = a.version !== b.version
  const statusChanged  = a.status  !== b.status

  return {
    profileId:        a.profileId,
    snapshotA:        a.snapshotId,
    snapshotB:        b.snapshotId,
    statusChanged,
    versionChanged,
    hashChanged,
    contentChanged:   hashChanged,
    snapshotAStatus:  a.status,
    snapshotBStatus:  b.status,
    snapshotAVersion: a.version,
    snapshotBVersion: b.version,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Export / Import API
// ════════════════════════════════════════════════════════════

/**
 * Serialises a profile to a portable export bundle.
 * Returns a plain object — no files, no compression.
 */
export function exportProfileJson(profile: EvaluationProfileDraft): ProfileExportBundle {
  return {
    exportVersion: '1.0',
    exportedAt:    nowIso(),
    hash:          calculateProfileHash(profile),
    profile:       JSON.parse(JSON.stringify(profile)) as EvaluationProfileDraft,
    profileVersion: profile.metadata.version,
    pipelineId:     profile.metadata.pipelineId ?? 'legacy-band-score',
    engineCompatibilityVersion: profile.metadata.engineCompatibilityVersion ?? 'evaluation-pipeline-v2',
  }
}

/**
 * Deserialises a profile from an export bundle.
 *
 * Validation steps:
 *   1. Bundle must be a non-null object.
 *   2. `exportVersion` must be present.
 *   3. `profile` field must be present and have metadata.
 *   4. `validateProfile` must return valid (no errors).
 *
 * Never throws.
 */
export function importProfileJson(data: unknown): ProfileImportResult {
  const errors: string[] = []

  try {
    if (!data || typeof data !== 'object') {
      return { success: false, errors: ['Import data must be a non-null object.'] }
    }

    const bundle = data as Record<string, unknown>

    if (!bundle.exportVersion) {
      errors.push('Missing exportVersion field — this may not be a valid Profile Studio export.')
    }

    if (!bundle.profile || typeof bundle.profile !== 'object') {
      return { success: false, errors: [...errors, 'Missing or invalid profile field in bundle.'] }
    }

    const profile = bundle.profile as EvaluationProfileDraft

    if (!profile.metadata) {
      return { success: false, errors: [...errors, 'Profile is missing metadata.'] }
    }

    // Validate structure
    const validation = validateProfile(profile)
    if (!validation.valid) {
      const errMessages = validation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => `${i.code}: ${i.message}`)
      return { success: false, errors: [...errors, ...errMessages] }
    }

    return {
      success: true,
      profile: JSON.parse(JSON.stringify(profile)) as EvaluationProfileDraft,
      errors:  [],
    }
  } catch (e) {
    return {
      success: false,
      errors:  [`Import failed: ${e instanceof Error ? e.message : String(e)}`],
    }
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Publish & Simulation Packages
// ════════════════════════════════════════════════════════════

/**
 * Builds a publish-ready package containing the full profile, its hash,
 * publish readiness summary, and optional simulation summary.
 *
 * Does NOT write to Firestore or trigger any side effects.
 */
export function exportPublishPackage(
  profile:    EvaluationProfileDraft,
  simResult?: StudioSimulationResult,
): PublishPackage {
  const hash       = calculateProfileHash(profile)
  const readiness  = validatePublishReadiness(profile)

  const readinessSummary: PublishReadinessSummary = {
    valid:         readiness.valid,
    issueCount:    readiness.issues.length,
    criticalCount: readiness.criticalIssues.length,
    warningCount:  readiness.warnings.length,
  }

  const simSummary: SimulationSummary | undefined = simResult
    ? {
        score:       simResult.score,
        valid:       simResult.valid,
        basketCount: Object.keys(simResult.baskets).length,
      }
    : undefined

  return {
    packageId:               generatePackageId(),
    createdAt:               nowIso(),
    profileId:               profile.metadata.id,
    profileVersion:          profile.metadata.version,
    hash,
    profile:                 JSON.parse(JSON.stringify(profile)) as EvaluationProfileDraft,
    metadata:                { ...profile.metadata },
    publishReadinessSummary: readinessSummary,
    simulationSummary:       simSummary,
    pipelineId:               profile.metadata.pipelineId ?? 'legacy-band-score',
    engineCompatibilityVersion: profile.metadata.engineCompatibilityVersion ?? 'evaluation-pipeline-v2',
  }
}

/**
 * Wraps a simulation result and profile into a portable simulation package.
 * Used to share or store simulation outputs alongside the profile version.
 */
export function exportSimulationPackage(
  profile:    EvaluationProfileDraft,
  simResult:  StudioSimulationResult,
): SimulationPackage {
  return {
    packageId:        generatePackageId(),
    createdAt:        nowIso(),
    profileId:        profile.metadata.id,
    profileVersion:   profile.metadata.version,
    hash:             calculateProfileHash(profile),
    profile:          JSON.parse(JSON.stringify(profile)) as EvaluationProfileDraft,
    simulationResult: simResult,
    score:            simResult.score,
    valid:            simResult.valid,
  }
}
