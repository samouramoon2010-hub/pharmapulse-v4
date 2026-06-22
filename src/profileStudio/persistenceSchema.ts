// ============================================================
// Profile Studio — Persistence Schema (Phase 1A)
//
// Permission matrix, storage policy, version policy, and
// schema validation helpers.
//
// ARCHITECTURE ONLY — no Firestore writes, no SDK imports,
// no saves, no React, no UI, no engine coupling.
// ============================================================

import type {
  ProfileStudioRole,
  ProfileStudioPermission,
  CollectionName,
} from './persistenceTypes'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Permission matrix
// ════════════════════════════════════════════════════════════

/**
 * Role → permission mapping.
 *
 * admin              : full access to all operations
 * general_manager    : read + approve + publish (cannot edit or simulate)
 * district_supervisor: read + simulate
 * manager            : read + simulate
 * pharmacist         : read only
 */
export const PERMISSION_MATRIX: Readonly<Record<ProfileStudioRole, readonly ProfileStudioPermission[]>> = {
  admin: [
    'profile:create',
    'profile:read',
    'profile:edit',
    'profile:approve',
    'profile:publish',
    'profile:archive',
    'simulation:run',
  ],
  general_manager: [
    'profile:read',
    'profile:approve',
    'profile:publish',
  ],
  district_supervisor: [
    'profile:read',
    'simulation:run',
  ],
  manager: [
    'profile:read',
    'simulation:run',
  ],
  pharmacist: [
    'profile:read',
  ],
} as const

// ════════════════════════════════════════════════════════════
// SECTION 2 — Collection names registry
// ════════════════════════════════════════════════════════════

/** All collection names used by Profile Studio, with their storage policy. */
export const COLLECTION_NAMES: readonly CollectionName[] = [
  'profileStudioProfiles',
  'profileStudioSnapshots',
  'profileStudioAuditLogs',
  'profileStudioPublishPackages',
  'profileStudioSimulationRuns',
] as const

// ════════════════════════════════════════════════════════════
// SECTION 3 — Storage policy
// ════════════════════════════════════════════════════════════

/**
 * Describes the mutability contract for each collection.
 *
 * appendOnly = true  → documents are written once; never updated or deleted.
 * mutable    = true  → documents may be updated over their lifetime.
 *
 * profileStudioProfiles        → mutable   (updated on each transition)
 * profileStudioSnapshots       → append-only (immutable after creation)
 * profileStudioAuditLogs       → append-only (immutable ledger)
 * profileStudioPublishPackages → append-only (each publish = new document)
 * profileStudioSimulationRuns  → append-only (each run = new document)
 */
export interface CollectionStoragePolicy {
  appendOnly: boolean
  mutable:    boolean
  description: string
}

export const STORAGE_POLICY: Readonly<Record<CollectionName, CollectionStoragePolicy>> = {
  profileStudioProfiles: {
    appendOnly:  false,
    mutable:     true,
    description: 'Profile documents are updated on lifecycle transitions and edits.',
  },
  profileStudioSnapshots: {
    appendOnly:  true,
    mutable:     false,
    description: 'Snapshots are written once and never modified (immutable by design).',
  },
  profileStudioAuditLogs: {
    appendOnly:  true,
    mutable:     false,
    description: 'Audit log entries are append-only; past events are never altered.',
  },
  profileStudioPublishPackages: {
    appendOnly:  true,
    mutable:     false,
    description: 'Each publish operation creates a new document; packages are immutable.',
  },
  profileStudioSimulationRuns: {
    appendOnly:  true,
    mutable:     false,
    description: 'Each simulation execution creates a new run document.',
  },
} as const

// ════════════════════════════════════════════════════════════
// SECTION 4 — Version policy
// ════════════════════════════════════════════════════════════

/**
 * Rules governing semantic versioning for profiles.
 *
 * draftChanges     → bump MINOR version on each edit-cycle save
 * approvedPublish  → bump MAJOR version on approved publish
 * archivedImmutable → archived profiles must never be edited
 * snapshotImmutable → snapshot payloads must never be mutated
 * publishedImmutable → published profile structure is locked
 */
export interface VersionPolicy {
  /** Which semver component to bump on draft changes. */
  draftChanges:       'minor'
  /** Which semver component to bump on approved publish. */
  approvedPublish:    'major'
  archivedImmutable:  true
  snapshotImmutable:  true
  publishedImmutable: true
}

export const VERSION_POLICY: Readonly<VersionPolicy> = {
  draftChanges:       'minor',
  approvedPublish:    'major',
  archivedImmutable:  true,
  snapshotImmutable:  true,
  publishedImmutable: true,
} as const

// ════════════════════════════════════════════════════════════
// SECTION 5 — Required field registry per collection
// ════════════════════════════════════════════════════════════

export const REQUIRED_FIELDS: Readonly<Record<CollectionName, readonly string[]>> = {
  profileStudioProfiles: [
    'id', 'name', 'version', 'status', 'scope',
    'metadata', 'hierarchy', 'processors',
    'validationSummary', 'simulationSummary',
    'hash',
    'createdBy', 'approvedBy', 'publishedBy',
    'createdAt', 'updatedAt', 'publishedAt',
  ],
  profileStudioSnapshots: [
    'snapshotId', 'profileId', 'version', 'status',
    'createdAt', 'hash', 'payload', 'metadata', 'immutable',
  ],
  profileStudioAuditLogs: [
    'auditId', 'profileId', 'action',
    'previousStatus', 'newStatus',
    'performedBy', 'performedAt', 'metadata',
  ],
  profileStudioPublishPackages: [
    'packageId', 'profileId', 'version', 'hash',
    'validationSummary', 'simulationSummary',
    'exportPayload', 'publishedBy', 'publishedAt',
  ],
  profileStudioSimulationRuns: [
    'runId', 'profileId', 'version',
    'input', 'result', 'score', 'issues',
    'executedBy', 'executedAt',
  ],
} as const

// ════════════════════════════════════════════════════════════
// SECTION 6 — Validation result type
// ════════════════════════════════════════════════════════════

export interface PersistenceSchemaIssue {
  code:     string
  field?:   string
  message:  string
  severity: 'error' | 'warning'
}

export interface PersistenceValidationResult {
  valid:  boolean
  issues: PersistenceSchemaIssue[]
}

function err(code: string, message: string, field?: string): PersistenceSchemaIssue {
  return { code, message, field, severity: 'error' }
}

function warn(code: string, message: string, field?: string): PersistenceSchemaIssue {
  return { code, message, field, severity: 'warning' }
}

function validationResult(issues: PersistenceSchemaIssue[]): PersistenceValidationResult {
  return { valid: issues.every((i) => i.severity !== 'error'), issues }
}

// ════════════════════════════════════════════════════════════
// SECTION 7 — validatePersistenceSchema
// ════════════════════════════════════════════════════════════

/**
 * Validates that a document satisfies the required field contract
 * for its collection type.
 *
 * Checks:
 *   - All required fields are present (not undefined / null for non-nullable fields)
 *   - For snapshots: `immutable` must equal `true`
 *   - For profiles: `status` must be a known ProfileStatus
 *
 * Never throws.
 */
export function validatePersistenceSchema(
  collection: CollectionName,
  doc:        Record<string, unknown>,
): PersistenceValidationResult {
  const issues: PersistenceSchemaIssue[] = []

  try {
    if (!doc || typeof doc !== 'object') {
      return validationResult([err('INVALID_DOC', 'Document must be a non-null object.')])
    }

    const required = REQUIRED_FIELDS[collection] ?? []
    for (const field of required) {
      if (!(field in doc)) {
        issues.push(err('MISSING_FIELD', `Required field "${field}" is absent.`, field))
      }
    }

    // Collection-specific extra checks
    if (collection === 'profileStudioSnapshots') {
      if ('immutable' in doc && doc.immutable !== true) {
        issues.push(err('SNAPSHOT_NOT_IMMUTABLE',
          'Snapshot document must have immutable===true.', 'immutable'))
      }
    }

    if (collection === 'profileStudioProfiles') {
      const validStatuses = ['DRAFT', 'VALIDATED', 'SIMULATED', 'APPROVED', 'PUBLISHED', 'ARCHIVED']
      if (doc.status && !validStatuses.includes(doc.status as string)) {
        issues.push(err('INVALID_STATUS',
          `Unknown profile status "${doc.status}".`, 'status'))
      }
      if (doc.id !== undefined && typeof doc.id !== 'string') {
        issues.push(err('INVALID_ID_TYPE', 'Profile id must be a string.', 'id'))
      }
    }

    if (collection === 'profileStudioSimulationRuns') {
      if ('score' in doc && typeof doc.score === 'number') {
        if (doc.score < 0 || doc.score > 100) {
          issues.push(warn('SCORE_OUT_OF_RANGE',
            `Simulation score ${doc.score} is outside [0,100].`, 'score'))
        }
      }
    }
  } catch (e) {
    issues.push(err('VALIDATION_RUNTIME_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return validationResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 8 — validatePermissionMatrix
// ════════════════════════════════════════════════════════════

/**
 * Verifies that the permission matrix is internally consistent:
 *
 *   - All 5 roles are defined.
 *   - admin has every permission.
 *   - pharmacist has only profile:read.
 *   - general_manager does NOT have simulation:run or profile:edit.
 *   - district_supervisor and manager do NOT have approve/publish/archive/create.
 *   - Every role has at least one permission.
 *
 * Never throws.
 */
export function validatePermissionMatrix(): PersistenceValidationResult {
  const issues: PersistenceSchemaIssue[] = []

  try {
    const ALL_ROLES: ProfileStudioRole[] = [
      'admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist',
    ]
    const ALL_PERMISSIONS: ProfileStudioPermission[] = [
      'profile:create', 'profile:read', 'profile:edit',
      'profile:approve', 'profile:publish', 'profile:archive', 'simulation:run',
    ]

    // All roles defined
    for (const role of ALL_ROLES) {
      if (!PERMISSION_MATRIX[role]) {
        issues.push(err('MISSING_ROLE', `Role "${role}" is absent from the permission matrix.`))
      } else if (PERMISSION_MATRIX[role].length === 0) {
        issues.push(err('EMPTY_ROLE', `Role "${role}" has no permissions.`))
      }
    }

    // admin must have all permissions
    const adminPerms = PERMISSION_MATRIX.admin ?? []
    for (const perm of ALL_PERMISSIONS) {
      if (!adminPerms.includes(perm)) {
        issues.push(err('ADMIN_MISSING_PERMISSION',
          `Admin role is missing permission "${perm}".`))
      }
    }

    // pharmacist must have ONLY profile:read
    const pharmacistPerms = PERMISSION_MATRIX.pharmacist ?? []
    if (!pharmacistPerms.includes('profile:read')) {
      issues.push(err('PHARMACIST_MISSING_READ',
        'Pharmacist role must have profile:read.'))
    }
    const forbiddenForPharmacist: ProfileStudioPermission[] = [
      'profile:create', 'profile:edit', 'profile:approve',
      'profile:publish', 'profile:archive', 'simulation:run',
    ]
    for (const perm of forbiddenForPharmacist) {
      if (pharmacistPerms.includes(perm)) {
        issues.push(err('PHARMACIST_EXCESS_PERMISSION',
          `Pharmacist must not have permission "${perm}".`))
      }
    }

    // general_manager must NOT have simulation:run or profile:edit or profile:create
    const gmPerms = PERMISSION_MATRIX.general_manager ?? []
    const forbiddenForGM: ProfileStudioPermission[] = ['simulation:run', 'profile:edit', 'profile:create', 'profile:archive']
    for (const perm of forbiddenForGM) {
      if (gmPerms.includes(perm)) {
        issues.push(err('GM_EXCESS_PERMISSION',
          `general_manager must not have permission "${perm}".`))
      }
    }

    // district_supervisor & manager must NOT have approve/publish/create/archive
    const restrictedRoles: ProfileStudioRole[] = ['district_supervisor', 'manager']
    const forbiddenForRestricted: ProfileStudioPermission[] = [
      'profile:create', 'profile:edit', 'profile:approve', 'profile:publish', 'profile:archive',
    ]
    for (const role of restrictedRoles) {
      const rolePerms = PERMISSION_MATRIX[role] ?? []
      for (const perm of forbiddenForRestricted) {
        if (rolePerms.includes(perm)) {
          issues.push(err('RESTRICTED_ROLE_EXCESS_PERMISSION',
            `Role "${role}" must not have permission "${perm}".`))
        }
      }
    }
  } catch (e) {
    issues.push(err('MATRIX_VALIDATION_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return validationResult(issues)
}

// ════════════════════════════════════════════════════════════
// SECTION 9 — validateVersionPolicy
// ════════════════════════════════════════════════════════════

/**
 * Verifies that the version policy constants are self-consistent:
 *
 *   - draftChanges must be 'minor'
 *   - approvedPublish must be 'major'
 *   - All immutability flags must be true
 *
 * Never throws.
 */
export function validateVersionPolicy(): PersistenceValidationResult {
  const issues: PersistenceSchemaIssue[] = []

  try {
    if (VERSION_POLICY.draftChanges !== 'minor') {
      issues.push(err('WRONG_DRAFT_VERSION_BUMP',
        `draftChanges must be "minor". Got "${VERSION_POLICY.draftChanges}".`,
        'draftChanges'))
    }
    if (VERSION_POLICY.approvedPublish !== 'major') {
      issues.push(err('WRONG_PUBLISH_VERSION_BUMP',
        `approvedPublish must be "major". Got "${VERSION_POLICY.approvedPublish}".`,
        'approvedPublish'))
    }
    if (VERSION_POLICY.archivedImmutable !== true) {
      issues.push(err('ARCHIVED_NOT_IMMUTABLE',
        'archivedImmutable must be true.', 'archivedImmutable'))
    }
    if (VERSION_POLICY.snapshotImmutable !== true) {
      issues.push(err('SNAPSHOT_NOT_IMMUTABLE_POLICY',
        'snapshotImmutable must be true.', 'snapshotImmutable'))
    }
    if (VERSION_POLICY.publishedImmutable !== true) {
      issues.push(err('PUBLISHED_NOT_IMMUTABLE',
        'publishedImmutable must be true.', 'publishedImmutable'))
    }
  } catch (e) {
    issues.push(err('VERSION_POLICY_VALIDATION_ERROR',
      e instanceof Error ? e.message : String(e)))
  }

  return validationResult(issues)
}
