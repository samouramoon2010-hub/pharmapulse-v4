// ============================================================
// Profile Studio — Phase 1A Tests: Persistence Architecture
//
// 162+ tests covering:
//   persistenceTypes.ts  — document schema shapes
//   persistenceSchema.ts — permission matrix, storage policy,
//                          version policy, schema validation
//   persistenceGuards.ts — role-based access control
//
// No Firestore SDK. No writes. No React. No UI. No engine.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────
import type {
  ProfileStudioRole,
  ProfileStudioPermission,
  CollectionName,
  ProfileAuditAction,
  ProfileStudioProfileDoc,
  ProfileStudioSnapshotDoc,
  ProfileStudioAuditLogDoc,
  ProfileStudioPublishPackageDoc,
  ProfileStudioSimulationRunDoc,
  ValidationSummaryDoc,
  SimulationSummaryDoc,
  ProfileDocMetadata,
  ProfileDocHierarchy,
  ProfileDocProcessors,
  SimulationRunInput,
  SimulationRunResult,
} from './persistenceTypes'

// ── Schema imports ────────────────────────────────────────────
import {
  PERMISSION_MATRIX,
  COLLECTION_NAMES,
  STORAGE_POLICY,
  VERSION_POLICY,
  REQUIRED_FIELDS,
  validatePersistenceSchema,
  validatePermissionMatrix,
  validateVersionPolicy,
} from './persistenceSchema'

// ── Guard imports ─────────────────────────────────────────────
import {
  hasPermission,
  canCreateProfile,
  canEditProfile,
  canApproveProfile,
  canPublishProfile,
  canArchiveProfile,
  canRunSimulation,
  canReadProfile,
  getPermissionsForRole,
  getRolesWithPermission,
} from './persistenceGuards'

// ════════════════════════════════════════════════════════════
// FACTORIES — build valid document objects for testing
// ════════════════════════════════════════════════════════════

function makeValidationSummary(valid = true): ValidationSummaryDoc {
  return { valid, issueCount: 0, errorCount: 0, warningCount: 0, lastValidatedAt: '2026-01-01T00:00:00.000Z' }
}

function makeSimulationSummary(): SimulationSummaryDoc {
  return { score: 80, valid: true, basketCount: 2, lastSimulatedAt: '2026-01-01T00:00:00.000Z' }
}

function makeMetadata(): ProfileDocMetadata {
  return { scope: 'PHARMACY', validFrom: '2026-01-01' }
}

function makeHierarchy(): ProfileDocHierarchy {
  return { rootId: 'root1', rootLabel: 'Profile', basketCount: 1, elementCount: 1, ruleCount: 1, payload: {} }
}

function makeProcessors(): ProfileDocProcessors {
  return {
    processorTypes: ['RATIO_EVALUATOR'],
    totalStepCount: 1,
    hasZeroTargetGuard: false,
    hasBandEvaluator: false,
    hasPenaltyEvaluator: false,
    hasNodeAggregator: false,
  }
}

function makeProfileDoc(overrides: Partial<ProfileStudioProfileDoc> = {}): ProfileStudioProfileDoc {
  return {
    id:                'prof_001',
    name:              'Test Profile',
    version:           '1.0.0',
    status:            'DRAFT',
    scope:             'PHARMACY',
    metadata:          makeMetadata(),
    hierarchy:         makeHierarchy(),
    processors:        makeProcessors(),
    validationSummary: makeValidationSummary(),
    simulationSummary: null,
    hash:              'abc123',
    createdBy:         'user1',
    approvedBy:        null,
    publishedBy:       null,
    createdAt:         '2026-01-01T00:00:00.000Z',
    updatedAt:         '2026-01-01T00:00:00.000Z',
    publishedAt:       null,
    ...overrides,
  }
}

function makeSnapshotDoc(overrides: Partial<ProfileStudioSnapshotDoc> = {}): ProfileStudioSnapshotDoc {
  return {
    snapshotId: 'snap_001',
    profileId:  'prof_001',
    version:    '1.0.0',
    status:     'DRAFT',
    createdAt:  '2026-01-01T00:00:00.000Z',
    hash:       'abc123',
    payload:    {},
    metadata:   makeMetadata(),
    immutable:  true,
    ...overrides,
  }
}

function makeAuditLogDoc(overrides: Partial<ProfileStudioAuditLogDoc> = {}): ProfileStudioAuditLogDoc {
  return {
    auditId:        'audit_001',
    profileId:      'prof_001',
    action:         'CREATE_DRAFT',
    previousStatus: null,
    newStatus:      'DRAFT',
    performedBy:    'user1',
    performedAt:    '2026-01-01T00:00:00.000Z',
    metadata:       {},
    ...overrides,
  }
}

function makePublishPackageDoc(overrides: Partial<ProfileStudioPublishPackageDoc> = {}): ProfileStudioPublishPackageDoc {
  return {
    packageId:         'pkg_001',
    profileId:         'prof_001',
    version:           '1.0.0',
    hash:              'abc123',
    validationSummary: makeValidationSummary(),
    simulationSummary: makeSimulationSummary(),
    exportPayload:     {},
    publishedBy:       'user1',
    publishedAt:       '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSimRunDoc(overrides: Partial<ProfileStudioSimulationRunDoc> = {}): ProfileStudioSimulationRunDoc {
  const input: SimulationRunInput    = { actuals: { sales: 80 }, targets: { sales: 100 } }
  const result: SimulationRunResult  = { valid: true, score: 80, basketCount: 1, issueCount: 0, traceIncluded: false }
  return {
    runId:      'run_001',
    profileId:  'prof_001',
    version:    '1.0.0',
    input,
    result,
    score:      80,
    issues:     [],
    executedBy: 'user1',
    executedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════
// GROUP 1 — ProfileStudioProfileDoc shape
// ════════════════════════════════════════════════════════════

describe('ProfileStudioProfileDoc – shape', () => {
  it('has id field', () => expect(makeProfileDoc().id).toBe('prof_001'))
  it('has name field', () => expect(makeProfileDoc().name).toBe('Test Profile'))
  it('has version field', () => expect(makeProfileDoc().version).toBe('1.0.0'))
  it('has status field', () => expect(makeProfileDoc().status).toBe('DRAFT'))
  it('has scope field', () => expect(makeProfileDoc().scope).toBe('PHARMACY'))
  it('has metadata sub-object', () => expect(makeProfileDoc().metadata).toBeDefined())
  it('has hierarchy sub-object', () => expect(makeProfileDoc().hierarchy).toBeDefined())
  it('has processors sub-object', () => expect(makeProfileDoc().processors).toBeDefined())
  it('has validationSummary', () => expect(makeProfileDoc().validationSummary).toBeDefined())
  it('simulationSummary is null by default', () => expect(makeProfileDoc().simulationSummary).toBeNull())
  it('has hash field', () => expect(typeof makeProfileDoc().hash).toBe('string'))
  it('approvedBy is null when not approved', () => expect(makeProfileDoc().approvedBy).toBeNull())
  it('publishedAt is null when not published', () => expect(makeProfileDoc().publishedAt).toBeNull())
  it('deletedAt is optional (absent on active doc)', () => expect('deletedAt' in makeProfileDoc()).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — ProfileStudioSnapshotDoc shape
// ════════════════════════════════════════════════════════════

describe('ProfileStudioSnapshotDoc – shape', () => {
  it('has snapshotId', () => expect(makeSnapshotDoc().snapshotId).toBe('snap_001'))
  it('has profileId', () => expect(makeSnapshotDoc().profileId).toBe('prof_001'))
  it('has version', () => expect(makeSnapshotDoc().version).toBe('1.0.0'))
  it('has status', () => expect(makeSnapshotDoc().status).toBe('DRAFT'))
  it('has hash', () => expect(typeof makeSnapshotDoc().hash).toBe('string'))
  it('has payload object', () => expect(typeof makeSnapshotDoc().payload).toBe('object'))
  it('has metadata', () => expect(makeSnapshotDoc().metadata).toBeDefined())
  it('immutable is literally true', () => expect(makeSnapshotDoc().immutable).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — ProfileStudioAuditLogDoc shape
// ════════════════════════════════════════════════════════════

describe('ProfileStudioAuditLogDoc – shape', () => {
  it('has auditId', () => expect(makeAuditLogDoc().auditId).toBe('audit_001'))
  it('has profileId', () => expect(makeAuditLogDoc().profileId).toBe('prof_001'))
  it('has action', () => expect(makeAuditLogDoc().action).toBe('CREATE_DRAFT'))
  it('previousStatus is null for initial action', () => expect(makeAuditLogDoc().previousStatus).toBeNull())
  it('newStatus is DRAFT', () => expect(makeAuditLogDoc().newStatus).toBe('DRAFT'))
  it('has performedBy', () => expect(makeAuditLogDoc().performedBy).toBe('user1'))
  it('has performedAt timestamp', () => expect(typeof makeAuditLogDoc().performedAt).toBe('string'))
  it('notes is optional', () => expect(makeAuditLogDoc().notes).toBeUndefined())
  it('metadata is a record', () => expect(typeof makeAuditLogDoc().metadata).toBe('object'))
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — ProfileStudioPublishPackageDoc shape
// ════════════════════════════════════════════════════════════

describe('ProfileStudioPublishPackageDoc – shape', () => {
  it('has packageId', () => expect(makePublishPackageDoc().packageId).toBe('pkg_001'))
  it('has profileId', () => expect(makePublishPackageDoc().profileId).toBe('prof_001'))
  it('has version', () => expect(makePublishPackageDoc().version).toBe('1.0.0'))
  it('has hash', () => expect(typeof makePublishPackageDoc().hash).toBe('string'))
  it('has validationSummary', () => expect(makePublishPackageDoc().validationSummary).toBeDefined())
  it('has simulationSummary', () => expect(makePublishPackageDoc().simulationSummary).toBeDefined())
  it('has exportPayload', () => expect(typeof makePublishPackageDoc().exportPayload).toBe('object'))
  it('has publishedBy', () => expect(makePublishPackageDoc().publishedBy).toBe('user1'))
  it('has publishedAt', () => expect(typeof makePublishPackageDoc().publishedAt).toBe('string'))
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — ProfileStudioSimulationRunDoc shape
// ════════════════════════════════════════════════════════════

describe('ProfileStudioSimulationRunDoc – shape', () => {
  it('has runId', () => expect(makeSimRunDoc().runId).toBe('run_001'))
  it('has profileId', () => expect(makeSimRunDoc().profileId).toBe('prof_001'))
  it('has version', () => expect(makeSimRunDoc().version).toBe('1.0.0'))
  it('has input with actuals and targets', () => {
    const doc = makeSimRunDoc()
    expect(doc.input.actuals).toBeDefined()
    expect(doc.input.targets).toBeDefined()
  })
  it('has result with score', () => expect(makeSimRunDoc().result.score).toBe(80))
  it('score field at root level', () => expect(makeSimRunDoc().score).toBe(80))
  it('issues is an array', () => expect(Array.isArray(makeSimRunDoc().issues)).toBe(true))
  it('has executedBy', () => expect(makeSimRunDoc().executedBy).toBe('user1'))
  it('has executedAt', () => expect(typeof makeSimRunDoc().executedAt).toBe('string'))
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — COLLECTION_NAMES
// ════════════════════════════════════════════════════════════

describe('COLLECTION_NAMES', () => {
  it('contains 5 collection names', () => expect(COLLECTION_NAMES.length).toBe(5))
  it('includes profileStudioProfiles', () => expect(COLLECTION_NAMES).toContain('profileStudioProfiles'))
  it('includes profileStudioSnapshots', () => expect(COLLECTION_NAMES).toContain('profileStudioSnapshots'))
  it('includes profileStudioAuditLogs', () => expect(COLLECTION_NAMES).toContain('profileStudioAuditLogs'))
  it('includes profileStudioPublishPackages', () => expect(COLLECTION_NAMES).toContain('profileStudioPublishPackages'))
  it('includes profileStudioSimulationRuns', () => expect(COLLECTION_NAMES).toContain('profileStudioSimulationRuns'))
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — PERMISSION_MATRIX: admin
// ════════════════════════════════════════════════════════════

describe('PERMISSION_MATRIX – admin', () => {
  const perms = PERMISSION_MATRIX.admin
  it('has profile:create', () => expect(perms).toContain('profile:create'))
  it('has profile:read',   () => expect(perms).toContain('profile:read'))
  it('has profile:edit',   () => expect(perms).toContain('profile:edit'))
  it('has profile:approve',() => expect(perms).toContain('profile:approve'))
  it('has profile:publish',() => expect(perms).toContain('profile:publish'))
  it('has profile:archive',() => expect(perms).toContain('profile:archive'))
  it('has simulation:run', () => expect(perms).toContain('simulation:run'))
  it('has all 7 permissions', () => expect(perms.length).toBe(7))
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — PERMISSION_MATRIX: general_manager
// ════════════════════════════════════════════════════════════

describe('PERMISSION_MATRIX – general_manager', () => {
  const perms = PERMISSION_MATRIX.general_manager
  it('has profile:read',    () => expect(perms).toContain('profile:read'))
  it('has profile:approve', () => expect(perms).toContain('profile:approve'))
  it('has profile:publish', () => expect(perms).toContain('profile:publish'))
  it('does NOT have simulation:run', () => expect(perms).not.toContain('simulation:run'))
  it('does NOT have profile:edit',   () => expect(perms).not.toContain('profile:edit'))
  it('does NOT have profile:create', () => expect(perms).not.toContain('profile:create'))
  it('does NOT have profile:archive',() => expect(perms).not.toContain('profile:archive'))
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — PERMISSION_MATRIX: district_supervisor
// ════════════════════════════════════════════════════════════

describe('PERMISSION_MATRIX – district_supervisor', () => {
  const perms = PERMISSION_MATRIX.district_supervisor
  it('has profile:read',     () => expect(perms).toContain('profile:read'))
  it('has simulation:run',   () => expect(perms).toContain('simulation:run'))
  it('does NOT have profile:create',  () => expect(perms).not.toContain('profile:create'))
  it('does NOT have profile:edit',    () => expect(perms).not.toContain('profile:edit'))
  it('does NOT have profile:approve', () => expect(perms).not.toContain('profile:approve'))
  it('does NOT have profile:publish', () => expect(perms).not.toContain('profile:publish'))
  it('does NOT have profile:archive', () => expect(perms).not.toContain('profile:archive'))
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — PERMISSION_MATRIX: manager
// ════════════════════════════════════════════════════════════

describe('PERMISSION_MATRIX – manager', () => {
  const perms = PERMISSION_MATRIX.manager
  it('has profile:read',   () => expect(perms).toContain('profile:read'))
  it('has simulation:run', () => expect(perms).toContain('simulation:run'))
  it('does NOT have profile:create',  () => expect(perms).not.toContain('profile:create'))
  it('does NOT have profile:approve', () => expect(perms).not.toContain('profile:approve'))
  it('does NOT have profile:publish', () => expect(perms).not.toContain('profile:publish'))
  it('does NOT have profile:archive', () => expect(perms).not.toContain('profile:archive'))
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — PERMISSION_MATRIX: pharmacist
// ════════════════════════════════════════════════════════════

describe('PERMISSION_MATRIX – pharmacist', () => {
  const perms = PERMISSION_MATRIX.pharmacist
  it('has profile:read only', () => expect(perms).toContain('profile:read'))
  it('has exactly 1 permission', () => expect(perms.length).toBe(1))
  it('does NOT have profile:create',  () => expect(perms).not.toContain('profile:create'))
  it('does NOT have simulation:run',  () => expect(perms).not.toContain('simulation:run'))
  it('does NOT have profile:approve', () => expect(perms).not.toContain('profile:approve'))
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — canCreateProfile
// ════════════════════════════════════════════════════════════

describe('canCreateProfile', () => {
  it('admin can create',              () => expect(canCreateProfile('admin')).toBe(true))
  it('general_manager cannot create', () => expect(canCreateProfile('general_manager')).toBe(false))
  it('district_supervisor cannot',    () => expect(canCreateProfile('district_supervisor')).toBe(false))
  it('manager cannot create',         () => expect(canCreateProfile('manager')).toBe(false))
  it('pharmacist cannot create',      () => expect(canCreateProfile('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — canEditProfile (role only)
// ════════════════════════════════════════════════════════════

describe('canEditProfile – role check only', () => {
  it('admin can edit',                () => expect(canEditProfile('admin')).toBe(true))
  it('general_manager cannot edit',   () => expect(canEditProfile('general_manager')).toBe(false))
  it('district_supervisor cannot',    () => expect(canEditProfile('district_supervisor')).toBe(false))
  it('manager cannot edit',           () => expect(canEditProfile('manager')).toBe(false))
  it('pharmacist cannot edit',        () => expect(canEditProfile('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — canEditProfile (with profile status)
// ════════════════════════════════════════════════════════════

describe('canEditProfile – with profile status', () => {
  it('admin + DRAFT = true',       () => expect(canEditProfile('admin', 'DRAFT')).toBe(true))
  it('admin + VALIDATED = true',   () => expect(canEditProfile('admin', 'VALIDATED')).toBe(true))
  it('admin + SIMULATED = true',   () => expect(canEditProfile('admin', 'SIMULATED')).toBe(true))
  it('admin + APPROVED = false',   () => expect(canEditProfile('admin', 'APPROVED')).toBe(false))
  it('admin + PUBLISHED = false',  () => expect(canEditProfile('admin', 'PUBLISHED')).toBe(false))
  it('admin + ARCHIVED = false',   () => expect(canEditProfile('admin', 'ARCHIVED')).toBe(false))
  it('manager + DRAFT = false (no edit permission)', () => expect(canEditProfile('manager', 'DRAFT')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — canApproveProfile
// ════════════════════════════════════════════════════════════

describe('canApproveProfile', () => {
  it('admin can approve',              () => expect(canApproveProfile('admin')).toBe(true))
  it('general_manager can approve',    () => expect(canApproveProfile('general_manager')).toBe(true))
  it('district_supervisor cannot',     () => expect(canApproveProfile('district_supervisor')).toBe(false))
  it('manager cannot approve',         () => expect(canApproveProfile('manager')).toBe(false))
  it('pharmacist cannot approve',      () => expect(canApproveProfile('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — canPublishProfile
// ════════════════════════════════════════════════════════════

describe('canPublishProfile', () => {
  it('admin can publish',              () => expect(canPublishProfile('admin')).toBe(true))
  it('general_manager can publish',    () => expect(canPublishProfile('general_manager')).toBe(true))
  it('district_supervisor cannot',     () => expect(canPublishProfile('district_supervisor')).toBe(false))
  it('manager cannot publish',         () => expect(canPublishProfile('manager')).toBe(false))
  it('pharmacist cannot publish',      () => expect(canPublishProfile('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — canArchiveProfile
// ════════════════════════════════════════════════════════════

describe('canArchiveProfile', () => {
  it('admin can archive',              () => expect(canArchiveProfile('admin')).toBe(true))
  it('general_manager cannot archive', () => expect(canArchiveProfile('general_manager')).toBe(false))
  it('district_supervisor cannot',     () => expect(canArchiveProfile('district_supervisor')).toBe(false))
  it('manager cannot archive',         () => expect(canArchiveProfile('manager')).toBe(false))
  it('pharmacist cannot archive',      () => expect(canArchiveProfile('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — canRunSimulation
// ════════════════════════════════════════════════════════════

describe('canRunSimulation', () => {
  it('admin can simulate',              () => expect(canRunSimulation('admin')).toBe(true))
  it('general_manager cannot simulate', () => expect(canRunSimulation('general_manager')).toBe(false))
  it('district_supervisor can simulate',() => expect(canRunSimulation('district_supervisor')).toBe(true))
  it('manager can simulate',            () => expect(canRunSimulation('manager')).toBe(true))
  it('pharmacist cannot simulate',      () => expect(canRunSimulation('pharmacist')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — STORAGE_POLICY: append-only collections
// ════════════════════════════════════════════════════════════

describe('STORAGE_POLICY – append-only', () => {
  it('snapshots are append-only', () =>
    expect(STORAGE_POLICY.profileStudioSnapshots.appendOnly).toBe(true))
  it('auditLogs are append-only', () =>
    expect(STORAGE_POLICY.profileStudioAuditLogs.appendOnly).toBe(true))
  it('publishPackages are append-only', () =>
    expect(STORAGE_POLICY.profileStudioPublishPackages.appendOnly).toBe(true))
  it('simulationRuns are append-only', () =>
    expect(STORAGE_POLICY.profileStudioSimulationRuns.appendOnly).toBe(true))
  it('snapshots are NOT mutable', () =>
    expect(STORAGE_POLICY.profileStudioSnapshots.mutable).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — STORAGE_POLICY: mutable collections
// ════════════════════════════════════════════════════════════

describe('STORAGE_POLICY – mutable', () => {
  it('profiles are mutable', () =>
    expect(STORAGE_POLICY.profileStudioProfiles.mutable).toBe(true))
  it('profiles are NOT append-only', () =>
    expect(STORAGE_POLICY.profileStudioProfiles.appendOnly).toBe(false))
  it('each collection has a description', () => {
    for (const name of COLLECTION_NAMES) {
      expect(STORAGE_POLICY[name].description.length).toBeGreaterThan(0)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — VERSION_POLICY
// ════════════════════════════════════════════════════════════

describe('VERSION_POLICY', () => {
  it('draftChanges is "minor"',        () => expect(VERSION_POLICY.draftChanges).toBe('minor'))
  it('approvedPublish is "major"',     () => expect(VERSION_POLICY.approvedPublish).toBe('major'))
  it('archivedImmutable is true',      () => expect(VERSION_POLICY.archivedImmutable).toBe(true))
  it('snapshotImmutable is true',      () => expect(VERSION_POLICY.snapshotImmutable).toBe(true))
  it('publishedImmutable is true',     () => expect(VERSION_POLICY.publishedImmutable).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — validatePersistenceSchema: profile doc
// ════════════════════════════════════════════════════════════

describe('validatePersistenceSchema – profileStudioProfiles', () => {
  it('returns valid=true for a complete profile doc', () => {
    const r = validatePersistenceSchema('profileStudioProfiles', makeProfileDoc() as any)
    expect(r.valid).toBe(true)
  })

  it('returns valid=false when id is missing', () => {
    const doc = { ...makeProfileDoc() } as any
    delete doc.id
    const r = validatePersistenceSchema('profileStudioProfiles', doc)
    expect(r.valid).toBe(false)
  })

  it('reports MISSING_FIELD for missing name', () => {
    const doc = { ...makeProfileDoc() } as any
    delete doc.name
    const r = validatePersistenceSchema('profileStudioProfiles', doc)
    expect(r.issues.some((i) => i.code === 'MISSING_FIELD' && i.field === 'name')).toBe(true)
  })

  it('reports INVALID_STATUS for unknown status', () => {
    const doc = { ...makeProfileDoc(), status: 'UNKNOWN_STATE' } as any
    const r = validatePersistenceSchema('profileStudioProfiles', doc)
    expect(r.issues.some((i) => i.code === 'INVALID_STATUS')).toBe(true)
  })

  it('returns valid=false for a non-object input', () => {
    const r = validatePersistenceSchema('profileStudioProfiles', null as any)
    expect(r.valid).toBe(false)
  })

  it('issues array is empty for a complete doc', () => {
    const r = validatePersistenceSchema('profileStudioProfiles', makeProfileDoc() as any)
    expect(r.issues).toHaveLength(0)
  })

  it('detects multiple missing fields', () => {
    const r = validatePersistenceSchema('profileStudioProfiles', {} as any)
    expect(r.issues.length).toBeGreaterThan(3)
  })

  it('reports all missing required fields', () => {
    const required = REQUIRED_FIELDS.profileStudioProfiles
    const r        = validatePersistenceSchema('profileStudioProfiles', {} as any)
    const missingCodes = r.issues.map((i) => i.field)
    for (const field of required) {
      expect(missingCodes).toContain(field)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 23 — validatePersistenceSchema: snapshot doc
// ════════════════════════════════════════════════════════════

describe('validatePersistenceSchema – profileStudioSnapshots', () => {
  it('returns valid=true for a complete snapshot doc', () => {
    const r = validatePersistenceSchema('profileStudioSnapshots', makeSnapshotDoc() as any)
    expect(r.valid).toBe(true)
  })

  it('returns valid=false when snapshotId is missing', () => {
    const doc = { ...makeSnapshotDoc() } as any
    delete doc.snapshotId
    const r = validatePersistenceSchema('profileStudioSnapshots', doc)
    expect(r.valid).toBe(false)
  })

  it('detects immutable !== true', () => {
    const doc = { ...makeSnapshotDoc(), immutable: false as any }
    const r   = validatePersistenceSchema('profileStudioSnapshots', doc)
    expect(r.issues.some((i) => i.code === 'SNAPSHOT_NOT_IMMUTABLE')).toBe(true)
  })

  it('valid=true when immutable is true', () => {
    const r = validatePersistenceSchema('profileStudioSnapshots', makeSnapshotDoc() as any)
    expect(r.valid).toBe(true)
  })

  it('issues is empty for a valid snapshot', () => {
    const r = validatePersistenceSchema('profileStudioSnapshots', makeSnapshotDoc() as any)
    expect(r.issues).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 24 — validatePersistenceSchema: audit log
// ════════════════════════════════════════════════════════════

describe('validatePersistenceSchema – profileStudioAuditLogs', () => {
  it('returns valid=true for a complete audit log doc', () => {
    const r = validatePersistenceSchema('profileStudioAuditLogs', makeAuditLogDoc() as any)
    expect(r.valid).toBe(true)
  })

  it('returns valid=false when auditId is missing', () => {
    const doc = { ...makeAuditLogDoc() } as any
    delete doc.auditId
    expect(validatePersistenceSchema('profileStudioAuditLogs', doc).valid).toBe(false)
  })

  it('returns valid=false when action is missing', () => {
    const doc = { ...makeAuditLogDoc() } as any
    delete doc.action
    expect(validatePersistenceSchema('profileStudioAuditLogs', doc).valid).toBe(false)
  })

  it('valid=true for a SIMULATE action', () => {
    const doc = makeAuditLogDoc({ action: 'SIMULATE', previousStatus: 'VALIDATED', newStatus: 'SIMULATED' })
    const r   = validatePersistenceSchema('profileStudioAuditLogs', doc as any)
    expect(r.valid).toBe(true)
  })

  it('detects missing performedBy', () => {
    const doc = { ...makeAuditLogDoc() } as any
    delete doc.performedBy
    const r = validatePersistenceSchema('profileStudioAuditLogs', doc)
    expect(r.issues.some((i) => i.field === 'performedBy')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 25 — validatePermissionMatrix
// ════════════════════════════════════════════════════════════

describe('validatePermissionMatrix', () => {
  it('returns valid=true for the canonical matrix', () => {
    const r = validatePermissionMatrix()
    expect(r.valid).toBe(true)
  })

  it('issues array is empty for the canonical matrix', () => {
    const r = validatePermissionMatrix()
    expect(r.issues).toHaveLength(0)
  })

  it('never throws', () => {
    expect(() => validatePermissionMatrix()).not.toThrow()
  })

  it('returns a result with valid and issues fields', () => {
    const r = validatePermissionMatrix()
    expect('valid' in r).toBe(true)
    expect('issues' in r).toBe(true)
  })

  it('returns valid=true multiple times (idempotent)', () => {
    expect(validatePermissionMatrix().valid).toBe(true)
    expect(validatePermissionMatrix().valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 26 — validateVersionPolicy
// ════════════════════════════════════════════════════════════

describe('validateVersionPolicy', () => {
  it('returns valid=true for the canonical VERSION_POLICY', () => {
    const r = validateVersionPolicy()
    expect(r.valid).toBe(true)
  })

  it('issues array is empty for the canonical policy', () => {
    const r = validateVersionPolicy()
    expect(r.issues).toHaveLength(0)
  })

  it('never throws', () => {
    expect(() => validateVersionPolicy()).not.toThrow()
  })

  it('returns valid and issues fields', () => {
    const r = validateVersionPolicy()
    expect('valid'  in r).toBe(true)
    expect('issues' in r).toBe(true)
  })

  it('is idempotent (stable across calls)', () => {
    expect(validateVersionPolicy().valid).toBe(true)
    expect(validateVersionPolicy().valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 27 — No-throw edge cases
// ════════════════════════════════════════════════════════════

describe('No-throw edge cases', () => {
  it('validatePersistenceSchema does not throw for null doc', () => {
    expect(() => validatePersistenceSchema('profileStudioProfiles', null as any)).not.toThrow()
  })

  it('canCreateProfile does not throw for undefined role', () => {
    expect(() => canCreateProfile(undefined as any)).not.toThrow()
  })

  it('canEditProfile does not throw for null role and undefined status', () => {
    expect(() => canEditProfile(null as any, undefined)).not.toThrow()
  })

  it('hasPermission returns false for unknown role', () => {
    expect(hasPermission('unknown_role' as any, 'profile:read')).toBe(false)
  })

  it('getPermissionsForRole returns empty array for unknown role', () => {
    expect(getPermissionsForRole('unknown' as any)).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 28 — Helper functions: getPermissionsForRole / getRolesWithPermission
// ════════════════════════════════════════════════════════════

describe('getPermissionsForRole', () => {
  it('admin has 7 permissions', () =>
    expect(getPermissionsForRole('admin').length).toBe(7))
  it('pharmacist has 1 permission', () =>
    expect(getPermissionsForRole('pharmacist').length).toBe(1))
  it('general_manager has 3 permissions', () =>
    expect(getPermissionsForRole('general_manager').length).toBe(3))
})

describe('getRolesWithPermission', () => {
  it('profile:read is held by all 5 roles', () =>
    expect(getRolesWithPermission('profile:read').length).toBe(5))
  it('profile:create is held by only admin', () => {
    const roles = getRolesWithPermission('profile:create')
    expect(roles).toHaveLength(1)
    expect(roles).toContain('admin')
  })
  it('simulation:run is held by admin, district_supervisor, manager', () => {
    const roles = getRolesWithPermission('simulation:run')
    expect(roles).toContain('admin')
    expect(roles).toContain('district_supervisor')
    expect(roles).toContain('manager')
    expect(roles).not.toContain('general_manager')
    expect(roles).not.toContain('pharmacist')
  })
  it('profile:archive is held by only admin', () => {
    const roles = getRolesWithPermission('profile:archive')
    expect(roles).toHaveLength(1)
    expect(roles[0]).toBe('admin')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 29 — canReadProfile
// ════════════════════════════════════════════════════════════

describe('canReadProfile', () => {
  it('admin can read',              () => expect(canReadProfile('admin')).toBe(true))
  it('general_manager can read',    () => expect(canReadProfile('general_manager')).toBe(true))
  it('district_supervisor can read',() => expect(canReadProfile('district_supervisor')).toBe(true))
  it('manager can read',            () => expect(canReadProfile('manager')).toBe(true))
  it('pharmacist can read',         () => expect(canReadProfile('pharmacist')).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 30 — Audit action coverage
// ════════════════════════════════════════════════════════════

describe('ProfileAuditAction type coverage', () => {
  const validActions: ProfileAuditAction[] = [
    'CREATE_DRAFT', 'VALIDATE', 'SIMULATE', 'APPROVE', 'PUBLISH',
    'ARCHIVE', 'RESTORE_FROM_ARCHIVE', 'SNAPSHOT_CREATED', 'EXPORT', 'IMPORT', 'DELETE',
  ]
  it('has at least 10 audit actions', () => expect(validActions.length).toBeGreaterThanOrEqual(10))
  it('includes SIMULATE', () => expect(validActions).toContain('SIMULATE'))
  it('includes APPROVE', () => expect(validActions).toContain('APPROVE'))
  it('includes RESTORE_FROM_ARCHIVE', () => expect(validActions).toContain('RESTORE_FROM_ARCHIVE'))
  it('includes SNAPSHOT_CREATED', () => expect(validActions).toContain('SNAPSHOT_CREATED'))
})

// ════════════════════════════════════════════════════════════
// GROUP 31 — REQUIRED_FIELDS completeness
// ════════════════════════════════════════════════════════════

describe('REQUIRED_FIELDS completeness', () => {
  it('profileStudioProfiles has at least 15 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioProfiles.length).toBeGreaterThanOrEqual(15))
  it('profileStudioSnapshots has at least 8 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioSnapshots.length).toBeGreaterThanOrEqual(8))
  it('profileStudioAuditLogs has at least 7 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioAuditLogs.length).toBeGreaterThanOrEqual(7))
  it('profileStudioPublishPackages has at least 8 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioPublishPackages.length).toBeGreaterThanOrEqual(8))
  it('profileStudioSimulationRuns has at least 8 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioSimulationRuns.length).toBeGreaterThanOrEqual(8))
  it('includes "immutable" in snapshot required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioSnapshots).toContain('immutable'))
})

// ════════════════════════════════════════════════════════════
// GROUP 32 — Simulation score boundary in schema validation
// ════════════════════════════════════════════════════════════

describe('validatePersistenceSchema – simulation run score boundary', () => {
  it('valid for score=0', () => {
    const doc = makeSimRunDoc({ score: 0 })
    const r   = validatePersistenceSchema('profileStudioSimulationRuns', doc as any)
    // No error-severity issues (only possible warning for out-of-range)
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('valid for score=100', () => {
    const doc = makeSimRunDoc({ score: 100 })
    const r   = validatePersistenceSchema('profileStudioSimulationRuns', doc as any)
    expect(r.valid).toBe(true)
  })

  it('warns for score=150 (out of range)', () => {
    const doc = makeSimRunDoc({ score: 150 })
    const r   = validatePersistenceSchema('profileStudioSimulationRuns', doc as any)
    expect(r.issues.some((i) => i.code === 'SCORE_OUT_OF_RANGE')).toBe(true)
  })

  it('warn-level issue does not mark valid=false', () => {
    const doc = makeSimRunDoc({ score: 150 })
    const r   = validatePersistenceSchema('profileStudioSimulationRuns', doc as any)
    // Valid is still true because only warnings, no errors
    expect(r.valid).toBe(true)
  })
})
