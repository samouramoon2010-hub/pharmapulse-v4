// ============================================================
// Profile Studio — Persistence Types (Phase 1A)
//
// TypeScript-only interfaces for all Profile Studio Firestore
// document schemas.  This file contains NO Firestore SDK imports,
// NO write logic, and NO runtime code — only type definitions
// and supporting enumerations.
//
// Collection model:
//   profileStudioProfiles        — mutable profile documents
//   profileStudioSnapshots       — append-only frozen copies
//   profileStudioAuditLogs       — append-only event ledger
//   profileStudioPublishPackages — append-only publish records
//   profileStudioSimulationRuns  — append-only simulation records
//
// NO Firestore SDK. NO saves. NO React. NO UI. NO engine.
// ============================================================

import type { ProfileStatus, ProfileScope } from './types'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Enumerations
// ════════════════════════════════════════════════════════════

/** Recognised user roles in Profile Studio. */
export type ProfileStudioRole =
  | 'admin'
  | 'general_manager'
  | 'district_supervisor'
  | 'manager'
  | 'pharmacist'

/** Fine-grained permissions used in the role matrix. */
export type ProfileStudioPermission =
  | 'profile:create'
  | 'profile:read'
  | 'profile:edit'
  | 'profile:approve'
  | 'profile:publish'
  | 'profile:archive'
  | 'simulation:run'

/** Firestore collection names owned by Profile Studio. */
export type CollectionName =
  | 'profileStudioProfiles'
  | 'profileStudioSnapshots'
  | 'profileStudioAuditLogs'
  | 'profileStudioPublishPackages'
  | 'profileStudioSimulationRuns'

/** All audit actions that may appear in the audit log. */
export type ProfileAuditAction =
  | 'CREATE_DRAFT'
  | 'VALIDATE'
  | 'SIMULATE'
  | 'APPROVE'
  | 'PUBLISH'
  | 'ARCHIVE'
  | 'RESTORE_FROM_ARCHIVE'
  | 'SNAPSHOT_CREATED'
  | 'EXPORT'
  | 'IMPORT'
  | 'DELETE'

// ════════════════════════════════════════════════════════════
// SECTION 2 — Shared sub-interfaces
// ════════════════════════════════════════════════════════════

/** Indexed metadata sub-object stored on profile documents. */
export interface ProfileDocMetadata {
  description?: string
  scope:        ProfileScope
  validFrom:    string
  validTo?:     string
  tags?:        string[]
}

/**
 * Hierarchy summary stored on the profile document.
 * Allows server-side queries without deserialising the full payload.
 */
export interface ProfileDocHierarchy {
  rootId:        string
  rootLabel:     string
  basketCount:   number
  elementCount:  number
  ruleCount:     number
  /** Full serialised hierarchy payload for reconstruction. */
  payload:       Record<string, unknown>
}

/** Processor inventory stored on the profile document. */
export interface ProfileDocProcessors {
  /** Distinct processor types used across all pipelines. */
  processorTypes:      string[]
  totalStepCount:      number
  hasZeroTargetGuard:  boolean
  hasBandEvaluator:    boolean
  hasPenaltyEvaluator: boolean
  hasNodeAggregator:   boolean
}

/** Compact validation summary stored on the profile document. */
export interface ValidationSummaryDoc {
  valid:           boolean
  issueCount:      number
  errorCount:      number
  warningCount:    number
  lastValidatedAt: string | null
}

/** Compact simulation summary stored on the profile document. */
export interface SimulationSummaryDoc {
  score:           number
  valid:           boolean
  basketCount:     number
  lastSimulatedAt: string
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Collection 1: profileStudioProfiles
// ════════════════════════════════════════════════════════════

/**
 * Document shape for the `profileStudioProfiles` collection.
 *
 * Mutable — updated on each lifecycle transition and edit.
 * The `hierarchy.payload` field holds the full serialised profile.
 */
export interface ProfileStudioProfileDoc {
  // ── Identity ───────────────────────────────────────────
  id:      string
  name:    string
  version: string
  status:  ProfileStatus
  scope:   ProfileScope

  // ── Nested sub-objects ─────────────────────────────────
  metadata:          ProfileDocMetadata
  hierarchy:         ProfileDocHierarchy
  processors:        ProfileDocProcessors
  validationSummary: ValidationSummaryDoc
  simulationSummary: SimulationSummaryDoc | null

  // ── Integrity ──────────────────────────────────────────
  hash: string

  // ── Audit actors ───────────────────────────────────────
  createdBy:  string
  approvedBy: string | null
  publishedBy: string | null

  // ── Timestamps ─────────────────────────────────────────
  createdAt:   string
  updatedAt:   string
  publishedAt: string | null
  /** Soft-delete timestamp; absent when document is active. */
  deletedAt?:  string
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Collection 2: profileStudioSnapshots
// ════════════════════════════════════════════════════════════

/**
 * Document shape for the `profileStudioSnapshots` collection.
 *
 * Append-only — once written, a snapshot is never modified.
 * The `immutable: true` literal type enforces this at the type level.
 */
export interface ProfileStudioSnapshotDoc {
  snapshotId: string
  profileId:  string
  version:    string
  status:     ProfileStatus
  createdAt:  string
  hash:       string
  /** Full serialised profile payload at the time of snapshot. */
  payload:    Record<string, unknown>
  metadata:   ProfileDocMetadata
  /** Permanently true — snapshots are never mutated after creation. */
  immutable:  true
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Collection 3: profileStudioAuditLogs
// ════════════════════════════════════════════════════════════

/**
 * Document shape for the `profileStudioAuditLogs` collection.
 *
 * Append-only — audit records are written once and never updated.
 */
export interface ProfileStudioAuditLogDoc {
  auditId:        string
  profileId:      string
  action:         ProfileAuditAction
  previousStatus: ProfileStatus | null
  newStatus:      ProfileStatus | null
  performedBy:    string
  performedAt:    string
  notes?:         string
  /** Arbitrary additional context recorded with the event. */
  metadata:       Record<string, unknown>
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — Collection 4: profileStudioPublishPackages
// ════════════════════════════════════════════════════════════

/**
 * Document shape for the `profileStudioPublishPackages` collection.
 *
 * Append-only — each publish operation creates a new package document.
 * Packages are never updated or deleted.
 */
export interface ProfileStudioPublishPackageDoc {
  packageId:         string
  profileId:         string
  version:           string
  hash:              string
  validationSummary: ValidationSummaryDoc
  simulationSummary: SimulationSummaryDoc | null
  /** Full export bundle payload. */
  exportPayload:     Record<string, unknown>
  publishedBy:       string
  publishedAt:       string
}

// ════════════════════════════════════════════════════════════
// SECTION 7 — Collection 5: profileStudioSimulationRuns
// ════════════════════════════════════════════════════════════

/** Input values recorded with a simulation run. */
export interface SimulationRunInput {
  actuals:  Record<string, number>
  targets:  Record<string, number>
  month?:   string
  context?: Record<string, unknown>
}

/** Compact result summary recorded with a simulation run. */
export interface SimulationRunResult {
  valid:         boolean
  score:         number
  basketCount:   number
  issueCount:    number
  traceIncluded: boolean
}

/**
 * Document shape for the `profileStudioSimulationRuns` collection.
 *
 * Append-only — each simulation execution creates a new run document.
 * Profile documents are NOT mutated by simulation runs.
 */
export interface ProfileStudioSimulationRunDoc {
  runId:      string
  profileId:  string
  version:    string
  input:      SimulationRunInput
  result:     SimulationRunResult
  score:      number
  issues:     string[]
  executedBy: string
  executedAt: string
}
