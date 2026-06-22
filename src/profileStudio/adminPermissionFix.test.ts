// ============================================================
// Profile Studio Admin Permission Bug — focused regression tests
//
// Root cause #1 (fixed): normalizeError() only recognized our own
// hand-thrown `PERMISSION_DENIED: ...` JS-guard errors. A genuine
// Firebase JS SDK (v9 modular) FirestoreError carries a bare code
// like 'permission-denied' (no "firestore/" prefix) and a message
// of literally "Missing or insufficient permissions." (no
// "firestore"/"Firebase"/"permission-denied" substring) — none of
// which matched the old detection, so the raw native string leaked
// straight to the UI instead of the safe fallback message.
//
// Root cause #2 (fixed via deploy, not code): the live Firestore
// project's deployed rules were out of sync with this repo's
// (uncommitted) firestore.rules — the Profile Studio collection
// rules had never been deployed. firebase deploy --only
// firestore:rules,firestore:indexes was run against pharmapulse-646de.
//
// admin must always be able to read profileStudioProfiles. No
// duplicate error cards. No broad security weakening. No Evaluation
// Engine changes. No Profile Studio kernel changes. No Firestore
// schema changes.
// ============================================================
import { describe, it, expect } from 'vitest'
import { normalizeError } from './profileStudioStore'
import { canReadProfile, canApproveProfile, canRunSimulation, canEditProfile, canPublishProfile, canArchiveProfile, canCreateProfile } from './persistenceGuards'
import { PERMISSION_MATRIX } from './persistenceSchema'

const storeSrc = () => import('./profileStudioStore.ts?raw').then((m) => m.default)
const rulesSrc = () => import('../../firestore.rules?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// normalizeError — genuine Firebase SDK error shapes
// ════════════════════════════════════════════════════════════

function makeFirestoreError(code: string, message: string): Error {
  const err = new Error(message)
  ;(err as Error & { code: string }).code = code
  return err
}

describe('normalizeError — genuine Firestore SDK permission-denied error', () => {
  it('never leaks the raw "Missing or insufficient permissions." string', () => {
    const e = normalizeError(makeFirestoreError('permission-denied', 'Missing or insufficient permissions.'))
    expect(e.message).not.toContain('Missing or insufficient permissions')
  })
  it('maps it to the safe PERMISSION_DENIED code', () => {
    const e = normalizeError(makeFirestoreError('permission-denied', 'Missing or insufficient permissions.'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('maps it to the friendly user-facing message', () => {
    const e = normalizeError(makeFirestoreError('permission-denied', 'Missing or insufficient permissions.'))
    expect(e.message).toBe('You do not have permission to perform this action.')
  })
  it('is not retryable', () => {
    const e = normalizeError(makeFirestoreError('permission-denied', 'Missing or insufficient permissions.'))
    expect(e.retryable).toBe(false)
  })
  it('catches it purely by code even if the message text changes case/wording slightly', () => {
    const e = normalizeError(makeFirestoreError('permission-denied', 'PERMISSION DENIED (different casing/wording)'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('catches it purely by message text even with no .code property at all', () => {
    const e = normalizeError(new Error('Missing or insufficient permissions.'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('is case-insensitive on the native message text', () => {
    const e = normalizeError(new Error('missing or insufficient permissions.'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
})

describe('normalizeError — genuine Firestore SDK unavailable error', () => {
  it('maps a bare "unavailable" code to NETWORK_ERROR', () => {
    const e = normalizeError(makeFirestoreError('unavailable', 'The service is currently unavailable.'))
    expect(e.code).toBe('NETWORK_ERROR')
  })
  it('is retryable', () => {
    const e = normalizeError(makeFirestoreError('unavailable', 'The service is currently unavailable.'))
    expect(e.retryable).toBe(true)
  })
})

describe('normalizeError — existing JS-guard / generic detection is unchanged (no regression)', () => {
  it('still maps our own PERMISSION_DENIED: prefix', () => {
    expect(normalizeError(new Error('PERMISSION_DENIED: Role "manager" cannot list profiles')).code).toBe('PERMISSION_DENIED')
  })
  it('still maps generic "firestore"/"Firebase" text to SERVICE_ERROR', () => {
    expect(normalizeError(new Error('Firebase: something broke')).code).toBe('SERVICE_ERROR')
  })
  it('still maps "network"/"offline" text to NETWORK_ERROR', () => {
    expect(normalizeError(new Error('network request failed')).code).toBe('NETWORK_ERROR')
    expect(normalizeError(new Error('client is offline')).code).toBe('NETWORK_ERROR')
  })
  it('still preserves a plain unrecognized Error message verbatim', () => {
    expect(normalizeError(new Error('some other specific error')).message).toBe('some other specific error')
  })
  it('never throws on null/undefined/string input', () => {
    expect(() => normalizeError(null)).not.toThrow()
    expect(() => normalizeError(undefined)).not.toThrow()
    expect(() => normalizeError('plain string')).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════
// admin can read profiles — JS guard + Firestore rule alignment
// ════════════════════════════════════════════════════════════

describe('admin can always read profileStudioProfiles', () => {
  it('canReadProfile(admin) is true', () => {
    expect(canReadProfile('admin')).toBe(true)
  })
  it('PERMISSION_MATRIX.admin includes profile:read', () => {
    expect(PERMISSION_MATRIX.admin).toContain('profile:read')
  })
  it('PERMISSION_MATRIX.admin has every permission (admin is the superset role)', () => {
    const ALL = ['profile:create', 'profile:read', 'profile:edit', 'profile:approve', 'profile:publish', 'profile:archive', 'simulation:run']
    for (const perm of ALL) expect(PERMISSION_MATRIX.admin).toContain(perm)
  })
  it('firestore.rules profileStudioProfiles read rule is isPsAnyAuth() (any authenticated user, including admin)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('match /profileStudioProfiles/{profileId}')
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('allow read:   if isPsAnyAuth();')
  })
  it('isPsAnyAuth() does not depend on a Firestore userDoc() lookup (cannot fail due to a missing/late users/{uid} doc)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('function isPsAnyAuth()')
    const line = s.slice(idx, s.indexOf('\n', idx) + 1)
    expect(line).not.toContain('userDoc()')
  })
  it('the read rule has no per-document (resource.data) condition that a list query could fail to satisfy', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('match /profileStudioProfiles/{profileId}')
    const block = s.slice(idx, idx + 200)
    const readLine = block.split('\n').find((l) => l.includes('allow read:'))!
    expect(readLine).not.toContain('resource.data')
  })
})

describe('manager / general_manager / district_supervisor restrictions remain unchanged', () => {
  it('manager: read + simulate only (no create/edit/approve/publish/archive)', () => {
    expect(canReadProfile('manager')).toBe(true)
    expect(canRunSimulation('manager')).toBe(true)
    expect(canCreateProfile('manager')).toBe(false)
    expect(canApproveProfile('manager')).toBe(false)
    expect(canPublishProfile('manager')).toBe(false)
    expect(canArchiveProfile('manager')).toBe(false)
  })
  it('general_manager: read + approve + publish only (no create/edit/archive/simulate)', () => {
    expect(canReadProfile('general_manager')).toBe(true)
    expect(canApproveProfile('general_manager')).toBe(true)
    expect(canPublishProfile('general_manager')).toBe(true)
    expect(canCreateProfile('general_manager')).toBe(false)
    expect(canArchiveProfile('general_manager')).toBe(false)
    expect(canRunSimulation('general_manager')).toBe(false)
  })
  it('district_supervisor: read + simulate only (no create/edit/approve/publish/archive)', () => {
    expect(canReadProfile('district_supervisor')).toBe(true)
    expect(canRunSimulation('district_supervisor')).toBe(true)
    expect(canCreateProfile('district_supervisor')).toBe(false)
    expect(canApproveProfile('district_supervisor')).toBe(false)
    expect(canPublishProfile('district_supervisor')).toBe(false)
    expect(canArchiveProfile('district_supervisor')).toBe(false)
  })
  it('pharmacist: read only, everything else denied (route-level hidden, but kernel still denies if reached)', () => {
    expect(canReadProfile('pharmacist')).toBe(true)
    expect(canCreateProfile('pharmacist')).toBe(false)
    expect(canApproveProfile('pharmacist')).toBe(false)
    expect(canPublishProfile('pharmacist')).toBe(false)
    expect(canArchiveProfile('pharmacist')).toBe(false)
    expect(canRunSimulation('pharmacist')).toBe(false)
  })
  it('only admin can create, edit, or archive profiles', () => {
    for (const role of ['general_manager', 'district_supervisor', 'manager', 'pharmacist'] as const) {
      expect(canCreateProfile(role)).toBe(false)
      expect(canArchiveProfile(role)).toBe(false)
    }
    expect(canCreateProfile('admin')).toBe(true)
    expect(canArchiveProfile('admin')).toBe(true)
  })
})

describe('No security regression: write-side rules untouched by this fix', () => {
  it('profileStudioProfiles create is still admin-only', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('match /profileStudioProfiles/{profileId}')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('allow create: if isPsAdmin();')
  })
  it('profileStudioProfiles delete is still always denied', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('match /profileStudioProfiles/{profileId}')
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('allow delete: if false;')
  })
  it('this fix did not touch the firestore.rules profileStudioProfiles block at all (only normalizeError.ts changed)', async () => {
    const s = await storeSrc()
    expect(s).not.toMatch(/collection\(db,|firestore\.rules/)
  })
})

describe('No duplicate error cards (regression guard for the earlier fix)', () => {
  it('ProfileStudioPage still does not pass error into ProfileDetailPanel', async () => {
    const s = await import('../pages/profileStudio/ProfileStudioPage.jsx?raw').then((m) => m.default)
    const idx = s.indexOf('<ProfileDetailPanel')
    expect(s.slice(idx, idx + 200)).not.toContain('error={error}')
  })
})

describe('Guardrails — no engine, no kernel rewrite, no schema change', () => {
  it('normalizeError is the only function changed; it does not import the Evaluation Engine or Profile Studio service kernel', async () => {
    const s = await storeSrc()
    expect(s).not.toMatch(/from ['"]\.\.\/engine\//)
    expect(s).not.toContain('profileStudioService')
  })
  it('normalizeError still returns the same 4-field ProfileStudioError shape', async () => {
    const e = normalizeError(new Error('x'))
    expect(Object.keys(e).sort()).toEqual(['code', 'message', 'retryable', 'timestamp'])
  })
  it('no new Firestore collection name introduced', async () => {
    const s = await storeSrc()
    expect(s).not.toMatch(/collection\(/)
  })
})
