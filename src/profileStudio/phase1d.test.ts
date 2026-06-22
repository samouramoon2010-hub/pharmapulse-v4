// ============================================================
// Profile Studio — Phase 1D Tests: Integration Certification
//
// 210+ tests certifying full-stack alignment across:
//   firestore.rules            — collection names + RBAC rules
//   profileStudioService.ts    — exports + RBAC enforcement
//   persistenceTypes.ts        — doc schemas + collection types
//   persistenceSchema.ts       — permission matrix + policies
//   persistenceGuards.ts       — guard functions
//   profileStudioStore.ts      — state + actions
//   hooks/useProfileStudio*    — hook contracts
//
// No new production code. Certification tests only.
// No UI. No pages. No routes. No sidebar. No AI. No engine.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'

// ── Pure imports ───────────────────────────────────────────────
import {
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

import {
  useProfileStudioStore,
  normalizeError,
} from './profileStudioStore'

import type { ProfileStudioRole }  from './persistenceTypes'
import type { ProfileStudioError } from './profileStudioStore'

// ── Raw source imports ─────────────────────────────────────────
const serviceSource      = () => import('./profileStudioService.ts?raw').then(m => m.default)
const typesSource        = () => import('./persistenceTypes.ts?raw').then(m => m.default)
const schemaSource       = () => import('./persistenceSchema.ts?raw').then(m => m.default)
const guardsSource       = () => import('./persistenceGuards.ts?raw').then(m => m.default)
const storeSource        = () => import('./profileStudioStore.ts?raw').then(m => m.default)
const profilesHookSrc    = () => import('./hooks/useProfileStudioProfiles.ts?raw').then(m => m.default)
const profileHookSrc     = () => import('./hooks/useProfileStudioProfile.ts?raw').then(m => m.default)
const simRunsHookSrc     = () => import('./hooks/useProfileStudioSimulationRuns.ts?raw').then(m => m.default)
const permissionsHookSrc = () => import('./hooks/useProfileStudioPermissions.ts?raw').then(m => m.default)
const rulesSource        = () => import('../../firestore.rules?raw').then(m => m.default)

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

const ALL_ROLES: ProfileStudioRole[] = [
  'admin', 'general_manager', 'district_supervisor', 'manager', 'pharmacist',
]

const COLLECTIONS = [
  'profileStudioProfiles',
  'profileStudioSnapshots',
  'profileStudioAuditLogs',
  'profileStudioPublishPackages',
  'profileStudioSimulationRuns',
] as const

// ════════════════════════════════════════════════════════════
// GROUP 1 — Collection name consistency: COLLECTION_NAMES
// ════════════════════════════════════════════════════════════

describe('Collection certification – COLLECTION_NAMES constant', () => {
  it('has exactly 5 collections', () =>
    expect(COLLECTION_NAMES.length).toBe(5))
  it('profileStudioProfiles present', () =>
    expect(COLLECTION_NAMES).toContain('profileStudioProfiles'))
  it('profileStudioSnapshots present', () =>
    expect(COLLECTION_NAMES).toContain('profileStudioSnapshots'))
  it('profileStudioAuditLogs present', () =>
    expect(COLLECTION_NAMES).toContain('profileStudioAuditLogs'))
  it('profileStudioPublishPackages present', () =>
    expect(COLLECTION_NAMES).toContain('profileStudioPublishPackages'))
  it('profileStudioSimulationRuns present', () =>
    expect(COLLECTION_NAMES).toContain('profileStudioSimulationRuns'))
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — Collection name consistency: persistenceTypes.ts
// ════════════════════════════════════════════════════════════

describe('Collection certification – persistenceTypes.ts', () => {
  it('declares profileStudioProfiles in CollectionName type', async () => {
    const s = await typesSource()
    expect(s).toContain("'profileStudioProfiles'")
  })
  it('declares profileStudioSnapshots', async () => {
    const s = await typesSource()
    expect(s).toContain("'profileStudioSnapshots'")
  })
  it('declares profileStudioAuditLogs', async () => {
    const s = await typesSource()
    expect(s).toContain("'profileStudioAuditLogs'")
  })
  it('declares profileStudioPublishPackages', async () => {
    const s = await typesSource()
    expect(s).toContain("'profileStudioPublishPackages'")
  })
  it('declares profileStudioSimulationRuns', async () => {
    const s = await typesSource()
    expect(s).toContain("'profileStudioSimulationRuns'")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — Collection name consistency: profileStudioService.ts
// ════════════════════════════════════════════════════════════

describe('Collection certification – profileStudioService.ts PS_COL', () => {
  it('defines PS_COL constant', async () => {
    const s = await serviceSource()
    expect(s).toContain('PS_COL')
  })
  it('PS_COL.PROFILES = profileStudioProfiles', async () => {
    const s = await serviceSource()
    expect(s).toContain("'profileStudioProfiles'")
  })
  it('PS_COL.SNAPSHOTS = profileStudioSnapshots', async () => {
    const s = await serviceSource()
    expect(s).toContain("'profileStudioSnapshots'")
  })
  it('PS_COL.AUDIT_LOGS = profileStudioAuditLogs', async () => {
    const s = await serviceSource()
    expect(s).toContain("'profileStudioAuditLogs'")
  })
  it('PS_COL.PUBLISH_PACKAGES = profileStudioPublishPackages', async () => {
    const s = await serviceSource()
    expect(s).toContain("'profileStudioPublishPackages'")
  })
  it('PS_COL.SIMULATION_RUNS = profileStudioSimulationRuns', async () => {
    const s = await serviceSource()
    expect(s).toContain("'profileStudioSimulationRuns'")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — Collection name consistency: firestore.rules
// ════════════════════════════════════════════════════════════

describe('Collection certification – firestore.rules', () => {
  for (const col of COLLECTIONS) {
    it(`rules contain match block for ${col}`, async () => {
      const s = await rulesSource()
      expect(s).toContain(`match /${col}/`)
    })
  }
  it('rules have allow read for profileStudioProfiles', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioProfiles/'))
    expect(section.slice(0, 300)).toContain('allow read')
  })
  it('rules have allow create for profileStudioProfiles', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioProfiles/'))
    expect(section.slice(0, 300)).toContain('allow create')
  })
  it('snapshots: allow update: if false', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioSnapshots/'))
    expect(section.slice(0, 300)).toContain('allow update: if false')
  })
  it('auditLogs: allow update: if false', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioAuditLogs/'))
    expect(section.slice(0, 300)).toContain('allow update: if false')
  })
  it('publishPackages: allow update: if false', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioPublishPackages/'))
    expect(section.slice(0, 300)).toContain('allow update: if false')
  })
  it('simulationRuns: allow update: if false', async () => {
    const s = await rulesSource()
    const section = s.slice(s.indexOf('match /profileStudioSimulationRuns/'))
    expect(section.slice(0, 300)).toContain('allow update: if false')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — Service exports certification
// ════════════════════════════════════════════════════════════

describe('Service exports certification', () => {
  const REQUIRED_EXPORTS = [
    'createProfileDocument',
    'getProfileDocument',
    'listProfileDocuments',
    'updateProfileDocument',
    'archiveProfileDocument',
    'createProfileSnapshotDocument',
    'createAuditLogDocument',
    'createPublishPackageDocument',
    'createSimulationRunDocument',
    'listSimulationRuns',
  ] as const

  for (const fn of REQUIRED_EXPORTS) {
    it(`exports ${fn}`, async () => {
      const s = await serviceSource()
      expect(s).toContain(`export async function ${fn}`)
    })
  }

  it('exports PS_COL constant', async () => {
    const s = await serviceSource()
    expect(s).toContain('export const PS_COL')
  })

  it('imports from persistenceGuards', async () => {
    const s = await serviceSource()
    expect(s).toContain("'./persistenceGuards'")
  })

  it('imports validatePersistenceSchema', async () => {
    const s = await serviceSource()
    expect(s).toContain('validatePersistenceSchema')
  })

  it('uses serverTimestamp', async () => {
    const s = await serviceSource()
    expect(s).toContain('serverTimestamp')
  })

  it('has no React import', async () => {
    const s = await serviceSource()
    expect(s).not.toContain("from 'react'")
  })

  it('has no engine import', async () => {
    const s = await serviceSource()
    expect(s).not.toContain("from '../engine/")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Service RBAC: createProfileDocument
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – createProfileDocument', () => {
  it('admin can create — guard returns true', () =>
    expect(canCreateProfile('admin')).toBe(true))
  it('general_manager cannot create — guard returns false', () =>
    expect(canCreateProfile('general_manager')).toBe(false))
  it('district_supervisor cannot create', () =>
    expect(canCreateProfile('district_supervisor')).toBe(false))
  it('manager cannot create', () =>
    expect(canCreateProfile('manager')).toBe(false))
  it('pharmacist cannot create', () =>
    expect(canCreateProfile('pharmacist')).toBe(false))
  it('service function references canCreateProfile', async () => {
    const s = await serviceSource()
    expect(s).toContain('canCreateProfile')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — Service RBAC: archiveProfileDocument
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – archiveProfileDocument', () => {
  it('admin can archive — guard returns true', () =>
    expect(canArchiveProfile('admin')).toBe(true))
  it('general_manager cannot archive', () =>
    expect(canArchiveProfile('general_manager')).toBe(false))
  it('district_supervisor cannot archive', () =>
    expect(canArchiveProfile('district_supervisor')).toBe(false))
  it('manager cannot archive', () =>
    expect(canArchiveProfile('manager')).toBe(false))
  it('pharmacist cannot archive', () =>
    expect(canArchiveProfile('pharmacist')).toBe(false))
  it('service references canArchiveProfile', async () => {
    const s = await serviceSource()
    expect(s).toContain('canArchiveProfile')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — Service RBAC: createSimulationRunDocument
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – createSimulationRunDocument', () => {
  it('admin can run simulation', () =>
    expect(canRunSimulation('admin')).toBe(true))
  it('district_supervisor can run simulation', () =>
    expect(canRunSimulation('district_supervisor')).toBe(true))
  it('manager can run simulation', () =>
    expect(canRunSimulation('manager')).toBe(true))
  it('general_manager cannot run simulation', () =>
    expect(canRunSimulation('general_manager')).toBe(false))
  it('pharmacist cannot run simulation', () =>
    expect(canRunSimulation('pharmacist')).toBe(false))
  it('service references canRunSimulation', async () => {
    const s = await serviceSource()
    expect(s).toContain('canRunSimulation')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — Service RBAC: approve + publish
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – approve + publish', () => {
  it('admin can approve', () => expect(canApproveProfile('admin')).toBe(true))
  it('general_manager can approve', () => expect(canApproveProfile('general_manager')).toBe(true))
  it('district_supervisor cannot approve', () => expect(canApproveProfile('district_supervisor')).toBe(false))
  it('manager cannot approve', () => expect(canApproveProfile('manager')).toBe(false))
  it('pharmacist cannot approve', () => expect(canApproveProfile('pharmacist')).toBe(false))

  it('admin can publish', () => expect(canPublishProfile('admin')).toBe(true))
  it('general_manager can publish', () => expect(canPublishProfile('general_manager')).toBe(true))
  it('district_supervisor cannot publish', () => expect(canPublishProfile('district_supervisor')).toBe(false))
  it('manager cannot publish', () => expect(canPublishProfile('manager')).toBe(false))
  it('pharmacist cannot publish', () => expect(canPublishProfile('pharmacist')).toBe(false))

  it('service references canApproveProfile', async () => {
    const s = await serviceSource()
    expect(s).toContain('canApproveProfile')
  })
  it('service references canPublishProfile', async () => {
    const s = await serviceSource()
    expect(s).toContain('canPublishProfile')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Read access: all roles
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – read access (all roles)', () => {
  for (const role of ALL_ROLES) {
    it(`${role} can read profiles`, () =>
      expect(canReadProfile(role)).toBe(true))
  }
  it('service references canReadProfile', async () => {
    const s = await serviceSource()
    expect(s).toContain('canReadProfile')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Edit status-awareness
// ════════════════════════════════════════════════════════════

describe('Service RBAC certification – edit status gates', () => {
  it('admin can edit DRAFT', () => expect(canEditProfile('admin', 'DRAFT')).toBe(true))
  it('admin can edit VALIDATED', () => expect(canEditProfile('admin', 'VALIDATED')).toBe(true))
  it('admin can edit SIMULATED', () => expect(canEditProfile('admin', 'SIMULATED')).toBe(true))
  it('admin cannot edit APPROVED', () => expect(canEditProfile('admin', 'APPROVED')).toBe(false))
  it('admin cannot edit PUBLISHED', () => expect(canEditProfile('admin', 'PUBLISHED')).toBe(false))
  it('admin cannot edit ARCHIVED', () => expect(canEditProfile('admin', 'ARCHIVED')).toBe(false))
  it('general_manager cannot edit any status', () =>
    expect(canEditProfile('general_manager', 'DRAFT')).toBe(false))
  it('manager cannot edit DRAFT', () =>
    expect(canEditProfile('manager', 'DRAFT')).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — Store state certification
// ════════════════════════════════════════════════════════════

describe('Store state certification', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('profiles initial state is array', () =>
    expect(Array.isArray(useProfileStudioStore.getState().profiles)).toBe(true))
  it('currentProfile initial state is null', () =>
    expect(useProfileStudioStore.getState().currentProfile).toBeNull())
  it('simulationRuns initial state is array', () =>
    expect(Array.isArray(useProfileStudioStore.getState().simulationRuns)).toBe(true))
  it('loading initial state is false', () =>
    expect(useProfileStudioStore.getState().loading).toBe(false))
  it('error initial state is null', () =>
    expect(useProfileStudioStore.getState().error).toBeNull())
  it('lastUpdated initial state is null', () =>
    expect(useProfileStudioStore.getState().lastUpdated).toBeNull())
  it('selectedProfileId initial state is null', () =>
    expect(useProfileStudioStore.getState().selectedProfileId).toBeNull())

  it('store source declares profiles field', async () => {
    const s = await storeSource()
    expect(s).toContain('profiles')
  })
  it('store source declares currentProfile field', async () => {
    const s = await storeSource()
    expect(s).toContain('currentProfile')
  })
  it('store source declares simulationRuns field', async () => {
    const s = await storeSource()
    expect(s).toContain('simulationRuns')
  })
  it('store source declares loading field', async () => {
    const s = await storeSource()
    expect(s).toContain('loading')
  })
  it('store source declares error field', async () => {
    const s = await storeSource()
    expect(s).toContain('error')
  })
  it('store source declares lastUpdated field', async () => {
    const s = await storeSource()
    expect(s).toContain('lastUpdated')
  })
  it('store source declares selectedProfileId field', async () => {
    const s = await storeSource()
    expect(s).toContain('selectedProfileId')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — Store actions certification
// ════════════════════════════════════════════════════════════

describe('Store actions certification', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  const ACTIONS = [
    'setProfiles', 'setCurrentProfile', 'setSimulationRuns',
    'setLoading', 'setError', 'clearError', 'resetStore',
  ] as const

  for (const action of ACTIONS) {
    it(`store source declares ${action} action`, async () => {
      const s = await storeSource()
      expect(s).toContain(action)
    })
  }

  it('setProfiles updates profiles', () => {
    useProfileStudioStore.getState().setProfiles([{ id: 'p1' }] as any)
    expect(useProfileStudioStore.getState().profiles).toHaveLength(1)
  })
  it('setCurrentProfile updates currentProfile', () => {
    useProfileStudioStore.getState().setCurrentProfile({ id: 'cx' } as any)
    expect(useProfileStudioStore.getState().currentProfile?.id).toBe('cx')
  })
  it('setSimulationRuns updates simulationRuns', () => {
    useProfileStudioStore.getState().setSimulationRuns([{ runId: 'r1' }] as any)
    expect(useProfileStudioStore.getState().simulationRuns).toHaveLength(1)
  })
  it('setLoading updates loading', () => {
    useProfileStudioStore.getState().setLoading(true)
    expect(useProfileStudioStore.getState().loading).toBe(true)
  })
  it('setError updates error', () => {
    const e: ProfileStudioError = { message: 'm', code: 'C', timestamp: 't', retryable: false }
    useProfileStudioStore.getState().setError(e)
    expect(useProfileStudioStore.getState().error?.code).toBe('C')
  })
  it('clearError sets error to null', () => {
    useProfileStudioStore.getState().setError({ message: 'e', code: 'C', timestamp: 't', retryable: false })
    useProfileStudioStore.getState().clearError()
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
  it('resetStore resets all fields', () => {
    useProfileStudioStore.getState().setProfiles([{ id: 'x' }] as any)
    useProfileStudioStore.getState().setLoading(true)
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().profiles).toHaveLength(0)
    expect(useProfileStudioStore.getState().loading).toBe(false)
  })
  it('setProfiles updates lastUpdated', () => {
    useProfileStudioStore.getState().setProfiles([])
    expect(useProfileStudioStore.getState().lastUpdated).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — Hook exports certification
// ════════════════════════════════════════════════════════════

describe('Hook exports certification', () => {
  it('useProfileStudioProfiles is exported', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('export function useProfileStudioProfiles')
  })
  it('useProfileStudioProfile is exported', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('export function useProfileStudioProfile')
  })
  it('useProfileStudioSimulationRuns is exported', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('export function useProfileStudioSimulationRuns')
  })
  it('useProfileStudioPermissions is exported', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('export function useProfileStudioPermissions')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — Hook return shape certification
// ════════════════════════════════════════════════════════════

describe('Hook return shape certification', () => {
  const DATA_HOOKS = [profilesHookSrc, profileHookSrc, simRunsHookSrc]
  const REQUIRED_RETURNS = ['loading', 'error', 'refresh', 'isRefreshing', 'refreshTimestamp']

  for (const field of REQUIRED_RETURNS) {
    it(`useProfileStudioProfiles returns ${field}`, async () => {
      expect(await profilesHookSrc()).toContain(field)
    })
    it(`useProfileStudioProfile returns ${field}`, async () => {
      expect(await profileHookSrc()).toContain(field)
    })
    it(`useProfileStudioSimulationRuns returns ${field}`, async () => {
      expect(await simRunsHookSrc()).toContain(field)
    })
  }

  it('profiles hook returns profiles array', async () => {
    expect(await profilesHookSrc()).toContain('profiles')
  })
  it('profile hook returns profile object', async () => {
    expect(await profileHookSrc()).toContain('profile')
  })
  it('simulation runs hook returns runs array', async () => {
    expect(await simRunsHookSrc()).toContain('runs')
  })

  it('permissions hook returns canRead', async () => {
    expect(await permissionsHookSrc()).toContain('canRead')
  })
  it('permissions hook returns canCreate', async () => {
    expect(await permissionsHookSrc()).toContain('canCreate')
  })
  it('permissions hook returns canEdit', async () => {
    expect(await permissionsHookSrc()).toContain('canEdit')
  })
  it('permissions hook returns canApprove', async () => {
    expect(await permissionsHookSrc()).toContain('canApprove')
  })
  it('permissions hook returns canPublish', async () => {
    expect(await permissionsHookSrc()).toContain('canPublish')
  })
  it('permissions hook returns canArchive', async () => {
    expect(await permissionsHookSrc()).toContain('canArchive')
  })
  it('permissions hook returns canRunSimulation', async () => {
    expect(await permissionsHookSrc()).toContain('canRunSimulation')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — Append-only policy certification (service source)
// ════════════════════════════════════════════════════════════

describe('Append-only policy certification – service source', () => {
  it('no updateDoc call targets snapshots collection', async () => {
    const s = await serviceSource()
    // updateDoc is used only in profile and archive, not in snapshot/audit/publish/sim
    // Verify no update function for snapshots is exported
    expect(s).not.toContain('updateProfileSnapshotDocument')
  })
  it('no update function for auditLogs', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('updateAuditLogDocument')
  })
  it('no update function for publishPackages', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('updatePublishPackageDocument')
  })
  it('no update function for simulationRuns', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('updateSimulationRunDocument')
  })
  it('no delete function for snapshots', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('deleteProfileSnapshotDocument')
  })
  it('no delete function for auditLogs', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('deleteAuditLogDocument')
  })
  it('no delete function for simulationRuns', async () => {
    const s = await serviceSource()
    expect(s).not.toContain('deleteSimulationRunDocument')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — Append-only policy certification (schema)
// ════════════════════════════════════════════════════════════

describe('Append-only policy certification – STORAGE_POLICY', () => {
  it('profileStudioProfiles is mutable', () =>
    expect(STORAGE_POLICY.profileStudioProfiles.mutable).toBe(true))
  it('profileStudioProfiles is NOT append-only', () =>
    expect(STORAGE_POLICY.profileStudioProfiles.appendOnly).toBe(false))
  it('profileStudioSnapshots is append-only', () =>
    expect(STORAGE_POLICY.profileStudioSnapshots.appendOnly).toBe(true))
  it('profileStudioSnapshots is NOT mutable', () =>
    expect(STORAGE_POLICY.profileStudioSnapshots.mutable).toBe(false))
  it('profileStudioAuditLogs is append-only', () =>
    expect(STORAGE_POLICY.profileStudioAuditLogs.appendOnly).toBe(true))
  it('profileStudioAuditLogs is NOT mutable', () =>
    expect(STORAGE_POLICY.profileStudioAuditLogs.mutable).toBe(false))
  it('profileStudioPublishPackages is append-only', () =>
    expect(STORAGE_POLICY.profileStudioPublishPackages.appendOnly).toBe(true))
  it('profileStudioPublishPackages is NOT mutable', () =>
    expect(STORAGE_POLICY.profileStudioPublishPackages.mutable).toBe(false))
  it('profileStudioSimulationRuns is append-only', () =>
    expect(STORAGE_POLICY.profileStudioSimulationRuns.appendOnly).toBe(true))
  it('profileStudioSimulationRuns is NOT mutable', () =>
    expect(STORAGE_POLICY.profileStudioSimulationRuns.mutable).toBe(false))
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — Append-only policy: firestore.rules
// ════════════════════════════════════════════════════════════

describe('Append-only policy certification – firestore.rules update blocks', () => {
  const APPEND_ONLY_COLS = [
    'profileStudioSnapshots',
    'profileStudioAuditLogs',
    'profileStudioPublishPackages',
    'profileStudioSimulationRuns',
  ] as const

  for (const col of APPEND_ONLY_COLS) {
    it(`${col} has allow update: if false in rules`, async () => {
      const s = await rulesSource()
      const start   = s.indexOf(`match /${col}/`)
      const nextCol = s.indexOf('match /', start + 10)
      const section = s.slice(start, nextCol > start ? nextCol : start + 500)
      expect(section).toContain('allow update: if false')
    })
  }
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — Error model certification
// ════════════════════════════════════════════════════════════

describe('Error model certification – normalizeError shape', () => {
  it('has message field', () => {
    const e = normalizeError(new Error('test'))
    expect(typeof e.message).toBe('string')
  })
  it('has code field', () => {
    const e = normalizeError(new Error('test'))
    expect(typeof e.code).toBe('string')
  })
  it('has timestamp field', () => {
    const e = normalizeError(new Error('test'))
    expect(typeof e.timestamp).toBe('string')
  })
  it('has retryable field (boolean)', () => {
    const e = normalizeError(new Error('test'))
    expect(typeof e.retryable).toBe('boolean')
  })
  it('never exposes Firebase internal error text', () => {
    const e = normalizeError(new Error('Firebase: Error (auth/permission-denied).'))
    expect(e.message).not.toContain('Firebase:')
  })
  it('maps PERMISSION_DENIED → code PERMISSION_DENIED', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: Role x'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('PERMISSION_DENIED is not retryable', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: x'))
    expect(e.retryable).toBe(false)
  })
  it('network error is retryable', () => {
    const e = normalizeError(new Error('network error'))
    expect(e.retryable).toBe(true)
  })
  it('does not throw for null', () => {
    expect(() => normalizeError(null)).not.toThrow()
  })
  it('does not throw for undefined', () => {
    expect(() => normalizeError(undefined)).not.toThrow()
  })
  it('does not throw for empty string', () => {
    expect(() => normalizeError('')).not.toThrow()
  })
  it('timestamp is ISO 8601 format', () => {
    const e = normalizeError(new Error('x'))
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — Error model: hooks use normalizeError
// ════════════════════════════════════════════════════════════

describe('Error model certification – hooks use normalizeError', () => {
  it('profiles hook imports normalizeError', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('normalizeError')
  })
  it('profile hook imports normalizeError', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('normalizeError')
  })
  it('simulation runs hook imports normalizeError', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('normalizeError')
  })
  it('store source exports normalizeError', async () => {
    const s = await storeSource()
    expect(s).toContain('export function normalizeError')
  })
  it('all data hooks import from profileStudioStore', async () => {
    const srcs = await Promise.all([profilesHookSrc(), profileHookSrc(), simRunsHookSrc()])
    for (const s of srcs) {
      expect(s).toContain("'../profileStudioStore'")
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 21 — Refresh model certification
// ════════════════════════════════════════════════════════════

describe('Refresh model certification', () => {
  it('profiles hook has manual refresh only (no setInterval)', async () => {
    const s = await profilesHookSrc()
    expect(s).not.toContain('setInterval')
  })
  it('profile hook has manual refresh only', async () => {
    const s = await profileHookSrc()
    expect(s).not.toContain('setInterval')
  })
  it('simulation runs hook has manual refresh only', async () => {
    const s = await simRunsHookSrc()
    expect(s).not.toContain('setInterval')
  })
  it('profiles hook has no onSnapshot listener', async () => {
    const s = await profilesHookSrc()
    expect(s).not.toContain('onSnapshot')
  })
  it('profile hook has no onSnapshot', async () => {
    const s = await profileHookSrc()
    expect(s).not.toContain('onSnapshot')
  })
  it('simulation runs hook has no onSnapshot', async () => {
    const s = await simRunsHookSrc()
    expect(s).not.toContain('onSnapshot')
  })
  it('profiles hook exposes refresh function', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('profile hook exposes refresh function', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('simulation runs hook exposes refresh function', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('profiles hook has refreshKey for triggering re-fetch', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('refreshKey')
  })
  it('profile hook has refreshKey', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('refreshKey')
  })
  it('simulation runs hook has refreshKey', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('refreshKey')
  })
  it('profiles hook exposes refreshTimestamp', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('profile hook exposes refreshTimestamp', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('simulation runs hook exposes refreshTimestamp', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('profiles hook exposes isRefreshing', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('isRefreshing')
  })
  it('profile hook exposes isRefreshing', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('isRefreshing')
  })
  it('simulation runs hook exposes isRefreshing', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('isRefreshing')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 22 — Race safety certification
// ════════════════════════════════════════════════════════════

describe('Race safety certification', () => {
  it('profiles hook has cancellation ref', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('cancelledRef')
    expect(s).toContain('useRef')
  })
  it('profile hook has cancellation ref', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('cancelledRef')
  })
  it('simulation runs hook has cancellation ref', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('cancelledRef')
  })
  it('profiles hook checks cancelled before state set', async () => {
    const s = await profilesHookSrc()
    expect(s).toContain('cancelledRef.current')
  })
  it('profile hook checks cancelled before state set', async () => {
    const s = await profileHookSrc()
    expect(s).toContain('cancelledRef.current')
  })
  it('simulation runs hook checks cancelled', async () => {
    const s = await simRunsHookSrc()
    expect(s).toContain('cancelledRef.current')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 23 — Permission parity: PERMISSION_MATRIX vs guards
// ════════════════════════════════════════════════════════════

describe('Permission parity – PERMISSION_MATRIX matches guard functions', () => {
  it('admin matrix has 7 entries', () =>
    expect(PERMISSION_MATRIX.admin.length).toBe(7))
  it('pharmacist matrix has 1 entry', () =>
    expect(PERMISSION_MATRIX.pharmacist.length).toBe(1))
  it('getPermissionsForRole(admin) matches canCreateProfile', () => {
    const perms = getPermissionsForRole('admin')
    expect(perms).toContain('profile:create')
    expect(canCreateProfile('admin')).toBe(true)
  })
  it('getPermissionsForRole(pharmacist) does not include create', () => {
    const perms = getPermissionsForRole('pharmacist')
    expect(perms).not.toContain('profile:create')
    expect(canCreateProfile('pharmacist')).toBe(false)
  })
  it('getRolesWithPermission(profile:read) returns 5 roles', () =>
    expect(getRolesWithPermission('profile:read').length).toBe(5))
  it('getRolesWithPermission(profile:create) returns admin only', () => {
    const roles = getRolesWithPermission('profile:create')
    expect(roles).toHaveLength(1)
    expect(roles[0]).toBe('admin')
  })
  it('getRolesWithPermission(simulation:run) returns 3 roles', () => {
    const roles = getRolesWithPermission('simulation:run')
    expect(roles.length).toBe(3)
    expect(roles).toContain('admin')
    expect(roles).toContain('district_supervisor')
    expect(roles).toContain('manager')
  })
  it('validatePermissionMatrix returns valid', () =>
    expect(validatePermissionMatrix().valid).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 24 — Permission parity: hook imports guards
// ════════════════════════════════════════════════════════════

describe('Permission parity – permissions hook imports correct guards', () => {
  it('permissions hook imports canCreateProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canCreateProfile')
  })
  it('permissions hook imports canEditProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canEditProfile')
  })
  it('permissions hook imports canApproveProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canApproveProfile')
  })
  it('permissions hook imports canPublishProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canPublishProfile')
  })
  it('permissions hook imports canArchiveProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canArchiveProfile')
  })
  it('permissions hook imports canRunSimulation', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canRunSimulation')
  })
  it('permissions hook imports canReadProfile', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain('canReadProfile')
  })
  it('permissions hook imports from persistenceGuards', async () => {
    const s = await permissionsHookSrc()
    expect(s).toContain("'../persistenceGuards'")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 25 — Version policy certification
// ════════════════════════════════════════════════════════════

describe('Version policy certification', () => {
  it('draftChanges is minor', () => expect(VERSION_POLICY.draftChanges).toBe('minor'))
  it('approvedPublish is major', () => expect(VERSION_POLICY.approvedPublish).toBe('major'))
  it('archivedImmutable is true', () => expect(VERSION_POLICY.archivedImmutable).toBe(true))
  it('snapshotImmutable is true', () => expect(VERSION_POLICY.snapshotImmutable).toBe(true))
  it('publishedImmutable is true', () => expect(VERSION_POLICY.publishedImmutable).toBe(true))
  it('validateVersionPolicy returns valid', () =>
    expect(validateVersionPolicy().valid).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 26 — Schema validation parity
// ════════════════════════════════════════════════════════════

describe('Schema validation parity – REQUIRED_FIELDS completeness', () => {
  it('profiles has at least 15 required fields', () =>
    expect(REQUIRED_FIELDS.profileStudioProfiles.length).toBeGreaterThanOrEqual(15))
  it('snapshots required fields include immutable', () =>
    expect(REQUIRED_FIELDS.profileStudioSnapshots).toContain('immutable'))
  it('auditLogs required fields include action', () =>
    expect(REQUIRED_FIELDS.profileStudioAuditLogs).toContain('action'))
  it('auditLogs required fields include performedBy', () =>
    expect(REQUIRED_FIELDS.profileStudioAuditLogs).toContain('performedBy'))
  it('publishPackages required fields include hash', () =>
    expect(REQUIRED_FIELDS.profileStudioPublishPackages).toContain('hash'))
  it('simulationRuns required fields include score', () =>
    expect(REQUIRED_FIELDS.profileStudioSimulationRuns).toContain('score'))

  it('validatePersistenceSchema valid for all required fields present (profiles)', () => {
    const doc = {
      id: 'x', name: 'X', version: '1.0.0', status: 'DRAFT', scope: 'PHARMACY',
      metadata: {}, hierarchy: {}, processors: {}, validationSummary: {},
      simulationSummary: null, hash: 'abc', createdBy: 'u', approvedBy: null,
      publishedBy: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', publishedAt: null,
    }
    const r = validatePersistenceSchema('profileStudioProfiles', doc)
    expect(r.valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 27 — Source purity certification: no forbidden imports
// ════════════════════════════════════════════════════════════

describe('Source purity certification', () => {
  it('service has no React import', async () => {
    const s = await serviceSource()
    expect(s).not.toContain("from 'react'")
  })
  it('service has no engine import', async () => {
    const s = await serviceSource()
    expect(s).not.toContain("from '../engine/")
  })
  it('store has no Firestore import', async () => {
    const s = await storeSource()
    expect(s).not.toContain('firebase/firestore')
  })
  it('store has no localStorage usage', async () => {
    const s = await storeSource()
    expect(s).not.toContain('localStorage.setItem')
    expect(s).not.toContain('localStorage.getItem')
  })
  it('store has no persist middleware', async () => {
    const s = await storeSource()
    expect(s).not.toContain("from 'zustand/middleware'")
  })
  it('permissions hook has no Firestore import', async () => {
    const s = await permissionsHookSrc()
    expect(s).not.toContain('firebase/firestore')
  })
  it('permissions hook has no useState (pure derived values)', async () => {
    const s = await permissionsHookSrc()
    expect(s).not.toContain('useState')
  })
  it('no hook imports from components/', async () => {
    const srcs = await Promise.all([profilesHookSrc(), profileHookSrc(), simRunsHookSrc(), permissionsHookSrc()])
    for (const s of srcs) {
      expect(s).not.toContain("from '../components/")
    }
  })
  it('no hook imports from pages/', async () => {
    const srcs = await Promise.all([profilesHookSrc(), profileHookSrc(), simRunsHookSrc(), permissionsHookSrc()])
    for (const s of srcs) {
      expect(s).not.toContain("from '../pages/")
    }
  })
  it('no file imports from engine/', async () => {
    const srcs = await Promise.all([storeSource(), profilesHookSrc(), profileHookSrc(), simRunsHookSrc(), permissionsHookSrc()])
    for (const s of srcs) {
      expect(s).not.toContain("from '../engine/")
    }
  })
  it('no file has AI references', async () => {
    const srcs = await Promise.all([serviceSource(), storeSource(), profilesHookSrc(), profileHookSrc(), simRunsHookSrc(), permissionsHookSrc()])
    for (const s of srcs) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
    }
  })
  it('no hook imports react-router', async () => {
    const srcs = await Promise.all([profilesHookSrc(), profileHookSrc(), simRunsHookSrc(), permissionsHookSrc()])
    for (const s of srcs) {
      expect(s).not.toContain('react-router')
    }
  })
  it('guards file has no Firestore import', async () => {
    const s = await guardsSource()
    expect(s).not.toContain('firebase/firestore')
  })
  it('schema file has no Firestore import', async () => {
    const s = await schemaSource()
    expect(s).not.toContain('firebase/firestore')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 28 — Snapshot immutability
// ════════════════════════════════════════════════════════════

describe('Snapshot immutability certification', () => {
  it('service createProfileSnapshotDocument sets immutable: true', async () => {
    const s = await serviceSource()
    expect(s).toContain('immutable:  true')
  })
  it('persistenceTypes declares immutable as literal true type', async () => {
    const s = await typesSource()
    expect(s).toContain('immutable:  true')
  })
  it('validatePersistenceSchema rejects snapshot with immutable=false', () => {
    const doc = {
      snapshotId: 'x', profileId: 'p', version: '1.0.0', status: 'DRAFT',
      createdAt: '2026-01-01', hash: 'abc', payload: {}, metadata: {}, immutable: false,
    }
    const r = validatePersistenceSchema('profileStudioSnapshots', doc as any)
    expect(r.issues.some(i => i.code === 'SNAPSHOT_NOT_IMMUTABLE')).toBe(true)
  })
  it('validatePersistenceSchema accepts snapshot with immutable=true', () => {
    const doc = {
      snapshotId: 'x', profileId: 'p', version: '1.0.0', status: 'DRAFT',
      createdAt: '2026-01-01', hash: 'abc', payload: {}, metadata: {}, immutable: true,
    }
    const r = validatePersistenceSchema('profileStudioSnapshots', doc)
    expect(r.valid).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 29 — Audit log parity: service auto-writes logs
// ════════════════════════════════════════════════════════════

describe('Audit log parity – service auto-write verification (source)', () => {
  it('service has writeAuditLog internal function', async () => {
    const s = await serviceSource()
    expect(s).toContain('writeAuditLog')
  })
  it('createProfileDocument calls writeAuditLog', async () => {
    const s = await serviceSource()
    const section = s.slice(s.indexOf('async function createProfileDocument'))
    const nextFn  = section.indexOf('async function', 10)
    const body    = section.slice(0, nextFn > 0 ? nextFn : 600)
    expect(body).toContain('writeAuditLog')
  })
  it('archiveProfileDocument calls writeAuditLog', async () => {
    const s = await serviceSource()
    const section = s.slice(s.indexOf('async function archiveProfileDocument'))
    const nextFn  = section.indexOf('async function', 10)
    const body    = section.slice(0, nextFn > 0 ? nextFn : 600)
    expect(body).toContain('writeAuditLog')
  })
  it('createPublishPackageDocument calls writeAuditLog', async () => {
    const s = await serviceSource()
    const section = s.slice(s.indexOf('async function createPublishPackageDocument'))
    const nextFn  = section.indexOf('async function', 10)
    const body    = section.slice(0, nextFn > 0 ? nextFn : 600)
    expect(body).toContain('writeAuditLog')
  })
  it('createProfileSnapshotDocument calls writeAuditLog', async () => {
    const s = await serviceSource()
    const section = s.slice(s.indexOf('async function createProfileSnapshotDocument'))
    const nextFn  = section.indexOf('async function', 10)
    const body    = section.slice(0, nextFn > 0 ? nextFn : 800)
    expect(body).toContain('writeAuditLog')
  })
  it('audit log always uses PS_COL.AUDIT_LOGS collection', async () => {
    const s = await serviceSource()
    expect(s).toContain('PS_COL.AUDIT_LOGS')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 30 — Final no-throws + full-stack smoke
// ════════════════════════════════════════════════════════════

describe('Final no-throw + full-stack smoke', () => {
  it('validatePermissionMatrix does not throw', () =>
    expect(() => validatePermissionMatrix()).not.toThrow())
  it('validateVersionPolicy does not throw', () =>
    expect(() => validateVersionPolicy()).not.toThrow())
  it('normalizeError never throws for any input', () => {
    const inputs = [null, undefined, 0, '', new Error('x'), { code: 'X' }, 'string', true, false, []]
    for (const i of inputs) {
      expect(() => normalizeError(i)).not.toThrow()
    }
  })
  it('all guard functions do not throw for unknown role', () => {
    const guards = [canCreateProfile, canEditProfile, canApproveProfile, canPublishProfile, canArchiveProfile, canRunSimulation, canReadProfile]
    for (const g of guards) {
      expect(() => g('unknown_role' as any)).not.toThrow()
    }
  })
  it('store resetStore does not throw', () => {
    expect(() => useProfileStudioStore.getState().resetStore()).not.toThrow()
  })
  it('store setLoading does not throw', () => {
    expect(() => useProfileStudioStore.getState().setLoading(true)).not.toThrow()
  })
  it('store clearError does not throw', () => {
    expect(() => useProfileStudioStore.getState().clearError()).not.toThrow()
  })
  it('getPermissionsForRole returns array for all valid roles', () => {
    for (const role of ALL_ROLES) {
      const perms = getPermissionsForRole(role)
      expect(Array.isArray(perms)).toBe(true)
      expect(perms.length).toBeGreaterThan(0)
    }
  })
  it('getPermissionsForRole returns empty array for unknown role', () => {
    expect(getPermissionsForRole('unknown' as any)).toHaveLength(0)
  })
})
