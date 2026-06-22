// ============================================================
// Profile Studio — Phase 1C Tests: Hooks + Client Store Layer
//
// 195+ tests covering:
//   profileStudioStore.ts        — state shape, actions, normalizeError
//   useProfileStudioProfiles     — source-level contract
//   useProfileStudioProfile      — source-level contract
//   useProfileStudioSimulationRuns — source-level contract
//   useProfileStudioPermissions  — pure function tests
//
// Pattern: source-text (?raw) inspection for React hooks;
//          direct unit tests for pure functions.
//
// No React Testing Library needed.
// No UI. No pages. No routes. No sidebar. No AI. No engine.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'

// ── Pure imports (no mocks needed) ────────────────────────────
import {
  useProfileStudioStore,
  normalizeError,
} from './profileStudioStore'

import type {
  ProfileStudioError,
  ProfileStudioState,
} from './profileStudioStore'

// ── Raw source imports ─────────────────────────────────────────
const storeSrc              = () => import('./profileStudioStore.ts?raw').then((m) => m.default)
const profilesSrc           = () => import('./hooks/useProfileStudioProfiles.ts?raw').then((m) => m.default)
const profileSrc            = () => import('./hooks/useProfileStudioProfile.ts?raw').then((m) => m.default)
const simRunsSrc            = () => import('./hooks/useProfileStudioSimulationRuns.ts?raw').then((m) => m.default)
const permissionsSrc        = () => import('./hooks/useProfileStudioPermissions.ts?raw').then((m) => m.default)

// ── Permission guards (pure) ───────────────────────────────────
import {
  canCreateProfile,
  canEditProfile,
  canApproveProfile,
  canPublishProfile,
  canArchiveProfile,
  canRunSimulation,
  canReadProfile,
} from './persistenceGuards'

// ════════════════════════════════════════════════════════════
// GROUP 1 — normalizeError: PERMISSION_DENIED
// ════════════════════════════════════════════════════════════

describe('normalizeError – PERMISSION_DENIED', () => {
  it('maps PERMISSION_DENIED error message correctly', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: Role x cannot'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('retryable is false for permission errors', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: Role x'))
    expect(e.retryable).toBe(false)
  })
  it('message is safe user-facing text for permission errors', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: internal detail'))
    expect(e.message).not.toContain('internal detail')
  })
  it('has timestamp string', () => {
    const e = normalizeError(new Error('PERMISSION_DENIED: x'))
    expect(typeof e.timestamp).toBe('string')
    expect(e.timestamp.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — normalizeError: network / Firebase errors
// ════════════════════════════════════════════════════════════

describe('normalizeError – network errors', () => {
  it('marks unavailable error as retryable', () => {
    const e = normalizeError(new Error('firestore: unavailable'))
    expect(e.retryable).toBe(true)
  })
  it('maps network error to NETWORK_ERROR code', () => {
    const e = normalizeError(new Error('network request failed'))
    expect(e.code).toBe('NETWORK_ERROR')
  })
  it('marks offline error as retryable', () => {
    const e = normalizeError(new Error('client is offline'))
    expect(e.retryable).toBe(true)
  })
  it('maps Firebase error to SERVICE_ERROR', () => {
    const e = normalizeError(new Error('Firebase: error'))
    expect(e.code).toBe('SERVICE_ERROR')
  })
  it('SERVICE_ERROR is retryable', () => {
    const e = normalizeError(new Error('Firebase: something broke'))
    expect(e.retryable).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — normalizeError: generic / unknown errors
// ════════════════════════════════════════════════════════════

describe('normalizeError – generic errors', () => {
  it('wraps a plain Error without throwing', () => {
    expect(() => normalizeError(new Error('oops'))).not.toThrow()
  })
  it('wraps a string without throwing', () => {
    expect(() => normalizeError('string error')).not.toThrow()
  })
  it('wraps null without throwing', () => {
    expect(() => normalizeError(null)).not.toThrow()
  })
  it('wraps undefined without throwing', () => {
    expect(() => normalizeError(undefined)).not.toThrow()
  })
  it('unknown error has UNKNOWN_ERROR code', () => {
    const e = normalizeError(null)
    expect(e.code).toBe('UNKNOWN_ERROR')
  })
  it('plain Error message is preserved', () => {
    const e = normalizeError(new Error('specific message'))
    expect(e.message).toBe('specific message')
  })
  it('has message, code, timestamp, retryable fields', () => {
    const e: ProfileStudioError = normalizeError(new Error('x'))
    expect('message'   in e).toBe(true)
    expect('code'      in e).toBe(true)
    expect('timestamp' in e).toBe(true)
    expect('retryable' in e).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — Zustand store: initial state
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – initial state', () => {
  it('profiles starts as empty array', () => {
    const state: ProfileStudioState = useProfileStudioStore.getState()
    expect(Array.isArray(state.profiles)).toBe(true)
  })
  it('currentProfile starts as null', () => {
    expect(useProfileStudioStore.getState().currentProfile).toBeNull()
  })
  it('simulationRuns starts as empty array', () => {
    expect(Array.isArray(useProfileStudioStore.getState().simulationRuns)).toBe(true)
  })
  it('loading starts as false', () => {
    expect(useProfileStudioStore.getState().loading).toBe(false)
  })
  it('error starts as null', () => {
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
  it('lastUpdated starts as null', () => {
    expect(useProfileStudioStore.getState().lastUpdated).toBeNull()
  })
  it('selectedProfileId starts as null', () => {
    expect(useProfileStudioStore.getState().selectedProfileId).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — Zustand store: setProfiles
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – setProfiles', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('sets profiles array', () => {
    const mock = [{ id: 'p1', name: 'P1' }] as any
    useProfileStudioStore.getState().setProfiles(mock)
    expect(useProfileStudioStore.getState().profiles).toHaveLength(1)
  })
  it('updates lastUpdated timestamp', () => {
    useProfileStudioStore.getState().setProfiles([])
    expect(useProfileStudioStore.getState().lastUpdated).not.toBeNull()
  })
  it('replaces existing profiles', () => {
    useProfileStudioStore.getState().setProfiles([{ id: 'a' }] as any)
    useProfileStudioStore.getState().setProfiles([{ id: 'b' }, { id: 'c' }] as any)
    expect(useProfileStudioStore.getState().profiles).toHaveLength(2)
  })
  it('accepts empty array', () => {
    useProfileStudioStore.getState().setProfiles([])
    expect(useProfileStudioStore.getState().profiles).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Zustand store: setCurrentProfile
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – setCurrentProfile', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('sets currentProfile', () => {
    const p = { id: 'prof_x', name: 'X' } as any
    useProfileStudioStore.getState().setCurrentProfile(p)
    expect(useProfileStudioStore.getState().currentProfile?.id).toBe('prof_x')
  })
  it('clears currentProfile with null', () => {
    useProfileStudioStore.getState().setCurrentProfile({ id: 'x' } as any)
    useProfileStudioStore.getState().setCurrentProfile(null)
    expect(useProfileStudioStore.getState().currentProfile).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — Zustand store: setSimulationRuns
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – setSimulationRuns', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('sets simulation runs', () => {
    const runs = [{ runId: 'r1' }, { runId: 'r2' }] as any
    useProfileStudioStore.getState().setSimulationRuns(runs)
    expect(useProfileStudioStore.getState().simulationRuns).toHaveLength(2)
  })
  it('updates lastUpdated', () => {
    useProfileStudioStore.getState().setSimulationRuns([])
    expect(useProfileStudioStore.getState().lastUpdated).not.toBeNull()
  })
  it('accepts empty array', () => {
    useProfileStudioStore.getState().setSimulationRuns([])
    expect(useProfileStudioStore.getState().simulationRuns).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — Zustand store: setLoading / setError / clearError
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – setLoading / setError / clearError', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('setLoading(true) sets loading true', () => {
    useProfileStudioStore.getState().setLoading(true)
    expect(useProfileStudioStore.getState().loading).toBe(true)
  })
  it('setLoading(false) sets loading false', () => {
    useProfileStudioStore.getState().setLoading(true)
    useProfileStudioStore.getState().setLoading(false)
    expect(useProfileStudioStore.getState().loading).toBe(false)
  })
  it('setError stores error object', () => {
    const err: ProfileStudioError = { message: 'bad', code: 'X', timestamp: '2026-01-01', retryable: false }
    useProfileStudioStore.getState().setError(err)
    expect(useProfileStudioStore.getState().error?.code).toBe('X')
  })
  it('setError(null) clears error', () => {
    useProfileStudioStore.getState().setError({ message: 'bad', code: 'X', timestamp: 't', retryable: false })
    useProfileStudioStore.getState().setError(null)
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
  it('clearError sets error to null', () => {
    useProfileStudioStore.getState().setError({ message: 'e', code: 'Y', timestamp: 't', retryable: true })
    useProfileStudioStore.getState().clearError()
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — Zustand store: setSelectedProfileId
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – setSelectedProfileId', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('sets selectedProfileId', () => {
    useProfileStudioStore.getState().setSelectedProfileId('prof_abc')
    expect(useProfileStudioStore.getState().selectedProfileId).toBe('prof_abc')
  })
  it('clears selectedProfileId with null', () => {
    useProfileStudioStore.getState().setSelectedProfileId('x')
    useProfileStudioStore.getState().setSelectedProfileId(null)
    expect(useProfileStudioStore.getState().selectedProfileId).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Zustand store: resetStore
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – resetStore', () => {
  it('clears profiles after set', () => {
    useProfileStudioStore.getState().setProfiles([{ id: 'x' }] as any)
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().profiles).toHaveLength(0)
  })
  it('clears currentProfile', () => {
    useProfileStudioStore.getState().setCurrentProfile({ id: 'x' } as any)
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().currentProfile).toBeNull()
  })
  it('clears error', () => {
    useProfileStudioStore.getState().setError({ message: 'e', code: 'C', timestamp: 't', retryable: false })
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
  it('resets loading to false', () => {
    useProfileStudioStore.getState().setLoading(true)
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().loading).toBe(false)
  })
  it('resets selectedProfileId to null', () => {
    useProfileStudioStore.getState().setSelectedProfileId('prof_1')
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().selectedProfileId).toBeNull()
  })
  it('resets lastUpdated to null', () => {
    useProfileStudioStore.getState().setProfiles([])
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().lastUpdated).toBeNull()
  })
  it('resets simulationRuns to empty array', () => {
    useProfileStudioStore.getState().setSimulationRuns([{ runId: 'r1' }] as any)
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().simulationRuns).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Store source: required exports and imports
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – source contracts', () => {
  it('exports useProfileStudioStore', async () => {
    const s = await storeSrc()
    expect(s).toContain('export const useProfileStudioStore')
  })
  it('exports normalizeError', async () => {
    const s = await storeSrc()
    expect(s).toContain('export function normalizeError')
  })
  it('exports ProfileStudioError interface', async () => {
    const s = await storeSrc()
    expect(s).toContain('ProfileStudioError')
  })
  it('uses create from zustand', async () => {
    const s = await storeSrc()
    expect(s).toContain("from 'zustand'")
    expect(s).toContain('create')
  })
  it('has no localStorage.setItem usage', async () => {
    const s = await storeSrc()
    expect(s).not.toContain('localStorage.setItem')
    expect(s).not.toContain('localStorage.getItem')
  })
  it('has no persist middleware', async () => {
    const s = await storeSrc()
    expect(s).not.toContain("from 'zustand/middleware'")
  })
  it('has no React import', async () => {
    const s = await storeSrc()
    expect(s).not.toContain("from 'react'")
  })
  it('defines all 7 state fields', async () => {
    const s = await storeSrc()
    for (const field of ['profiles', 'currentProfile', 'simulationRuns', 'selectedProfileId', 'loading', 'error', 'lastUpdated']) {
      expect(s).toContain(field)
    }
  })
  it('defines all 7 action names', async () => {
    const s = await storeSrc()
    for (const action of ['setProfiles', 'setCurrentProfile', 'setSimulationRuns', 'setLoading', 'setError', 'clearError', 'resetStore']) {
      expect(s).toContain(action)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — useProfileStudioProfiles: source contracts
// ════════════════════════════════════════════════════════════

describe('useProfileStudioProfiles – source contracts', () => {
  it('exports useProfileStudioProfiles function', async () => {
    const s = await profilesSrc()
    expect(s).toContain('export function useProfileStudioProfiles')
  })
  it('imports listProfileDocuments from service', async () => {
    const s = await profilesSrc()
    expect(s).toContain('listProfileDocuments')
    expect(s).toContain("'../profileStudioService'")
  })
  it('imports normalizeError from store', async () => {
    const s = await profilesSrc()
    expect(s).toContain('normalizeError')
    expect(s).toContain("'../profileStudioStore'")
  })
  it('returns profiles field', async () => {
    const s = await profilesSrc()
    expect(s).toContain('profiles')
  })
  it('returns loading field', async () => {
    const s = await profilesSrc()
    expect(s).toContain('loading')
  })
  it('returns error field', async () => {
    const s = await profilesSrc()
    expect(s).toContain('error')
  })
  it('returns refresh function', async () => {
    const s = await profilesSrc()
    expect(s).toContain('refresh')
  })
  it('returns isRefreshing', async () => {
    const s = await profilesSrc()
    expect(s).toContain('isRefreshing')
  })
  it('returns refreshTimestamp', async () => {
    const s = await profilesSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('uses useState', async () => {
    const s = await profilesSrc()
    expect(s).toContain('useState')
  })
  it('uses useEffect', async () => {
    const s = await profilesSrc()
    expect(s).toContain('useEffect')
  })
  it('uses useCallback for refresh', async () => {
    const s = await profilesSrc()
    expect(s).toContain('useCallback')
  })
  it('uses cancellation pattern (cancelled ref)', async () => {
    const s = await profilesSrc()
    expect(s).toContain('cancelledRef')
  })
  it('has no AI imports', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain('openai')
    expect(s).not.toContain('anthropic')
  })
  it('has no engine imports', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain("from '../engine/")
    expect(s).not.toContain("from '../../engine/")
  })
  it('has no UI component imports', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain("from '../components/")
    expect(s).not.toContain("from '../pages/")
  })
  it('has no route imports', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain('react-router')
  })
  it('handles errors — catch block present', async () => {
    const s = await profilesSrc()
    expect(s).toContain('.catch(')
  })
  it('has no auto-polling / setInterval', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain('setInterval')
  })
  it('has no onSnapshot listener', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain('onSnapshot')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — useProfileStudioProfile: source contracts
// ════════════════════════════════════════════════════════════

describe('useProfileStudioProfile – source contracts', () => {
  it('exports useProfileStudioProfile', async () => {
    const s = await profileSrc()
    expect(s).toContain('export function useProfileStudioProfile')
  })
  it('imports getProfileDocument', async () => {
    const s = await profileSrc()
    expect(s).toContain('getProfileDocument')
  })
  it('returns profile field', async () => {
    const s = await profileSrc()
    expect(s).toContain('profile')
  })
  it('returns loading field', async () => {
    const s = await profileSrc()
    expect(s).toContain('loading')
  })
  it('returns error field', async () => {
    const s = await profileSrc()
    expect(s).toContain('error')
  })
  it('returns refresh function', async () => {
    const s = await profileSrc()
    expect(s).toContain('refresh')
  })
  it('returns isRefreshing', async () => {
    const s = await profileSrc()
    expect(s).toContain('isRefreshing')
  })
  it('returns refreshTimestamp', async () => {
    const s = await profileSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('reacts to profileId in deps array', async () => {
    const s = await profileSrc()
    expect(s).toContain('profileId')
  })
  it('handles null profileId without fetching', async () => {
    const s = await profileSrc()
    expect(s).toContain('if (!profileId)')
  })
  it('uses cancellation pattern', async () => {
    const s = await profileSrc()
    expect(s).toContain('cancelledRef')
  })
  it('normalizes errors', async () => {
    const s = await profileSrc()
    expect(s).toContain('normalizeError')
  })
  it('has no route imports', async () => {
    const s = await profileSrc()
    expect(s).not.toContain('react-router')
  })
  it('has no onSnapshot', async () => {
    const s = await profileSrc()
    expect(s).not.toContain('onSnapshot')
  })
  it('has no setInterval', async () => {
    const s = await profileSrc()
    expect(s).not.toContain('setInterval')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — useProfileStudioSimulationRuns: source contracts
// ════════════════════════════════════════════════════════════

describe('useProfileStudioSimulationRuns – source contracts', () => {
  it('exports useProfileStudioSimulationRuns', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('export function useProfileStudioSimulationRuns')
  })
  it('imports listSimulationRuns', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('listSimulationRuns')
  })
  it('returns runs field', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('runs')
  })
  it('returns loading field', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('loading')
  })
  it('returns error field', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('error')
  })
  it('returns refresh function', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('refresh')
  })
  it('returns isRefreshing', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('isRefreshing')
  })
  it('returns refreshTimestamp', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('handles null profileId', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('if (!profileId)')
  })
  it('uses cancellation pattern', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('cancelledRef')
  })
  it('normalizes errors', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('normalizeError')
  })
  it('has no onSnapshot', async () => {
    const s = await simRunsSrc()
    expect(s).not.toContain('onSnapshot')
  })
  it('has no setInterval', async () => {
    const s = await simRunsSrc()
    expect(s).not.toContain('setInterval')
  })
  it('has no route imports', async () => {
    const s = await simRunsSrc()
    expect(s).not.toContain('react-router')
  })
  it('has no UI component imports', async () => {
    const s = await simRunsSrc()
    expect(s).not.toContain("from '../components/")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 15 — useProfileStudioPermissions: source contracts
// ════════════════════════════════════════════════════════════

describe('useProfileStudioPermissions – source contracts', () => {
  it('exports useProfileStudioPermissions', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('export function useProfileStudioPermissions')
  })
  it('imports persistenceGuards', async () => {
    const s = await permissionsSrc()
    expect(s).toContain("'../persistenceGuards'")
  })
  it('uses useMemo for derived values', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('useMemo')
  })
  it('returns canRead', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canRead')
  })
  it('returns canCreate', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canCreate')
  })
  it('returns canEdit', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canEdit')
  })
  it('returns canApprove', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canApprove')
  })
  it('returns canPublish', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canPublish')
  })
  it('returns canArchive', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canArchive')
  })
  it('returns canRunSimulation', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('canRunSimulation')
  })
  it('handles null role', async () => {
    const s = await permissionsSrc()
    expect(s).toContain('if (!role)')
  })
  it('has no Firestore imports', async () => {
    const s = await permissionsSrc()
    expect(s).not.toContain('firebase/firestore')
  })
  it('has no useState (pure derived)', async () => {
    const s = await permissionsSrc()
    expect(s).not.toContain('useState')
  })
  it('has no useEffect', async () => {
    const s = await permissionsSrc()
    expect(s).not.toContain('useEffect')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 16 — useProfileStudioPermissions: pure function tests
// ════════════════════════════════════════════════════════════

describe('useProfileStudioPermissions – permission logic (via guards)', () => {
  it('admin canRead = true',          () => expect(canReadProfile('admin')).toBe(true))
  it('admin canCreate = true',        () => expect(canCreateProfile('admin')).toBe(true))
  it('admin canEdit DRAFT = true',    () => expect(canEditProfile('admin', 'DRAFT')).toBe(true))
  it('admin canApprove = true',       () => expect(canApproveProfile('admin')).toBe(true))
  it('admin canPublish = true',       () => expect(canPublishProfile('admin')).toBe(true))
  it('admin canArchive = true',       () => expect(canArchiveProfile('admin')).toBe(true))
  it('admin canRunSimulation = true', () => expect(canRunSimulation('admin')).toBe(true))

  it('general_manager canRead = true',          () => expect(canReadProfile('general_manager')).toBe(true))
  it('general_manager canCreate = false',        () => expect(canCreateProfile('general_manager')).toBe(false))
  it('general_manager canEdit = false',          () => expect(canEditProfile('general_manager')).toBe(false))
  it('general_manager canApprove = true',        () => expect(canApproveProfile('general_manager')).toBe(true))
  it('general_manager canPublish = true',        () => expect(canPublishProfile('general_manager')).toBe(true))
  it('general_manager canArchive = false',       () => expect(canArchiveProfile('general_manager')).toBe(false))
  it('general_manager canRunSimulation = false', () => expect(canRunSimulation('general_manager')).toBe(false))

  it('district_supervisor canRead = true',          () => expect(canReadProfile('district_supervisor')).toBe(true))
  it('district_supervisor canCreate = false',        () => expect(canCreateProfile('district_supervisor')).toBe(false))
  it('district_supervisor canRunSimulation = true',  () => expect(canRunSimulation('district_supervisor')).toBe(true))
  it('district_supervisor canApprove = false',       () => expect(canApproveProfile('district_supervisor')).toBe(false))

  it('manager canRead = true',          () => expect(canReadProfile('manager')).toBe(true))
  it('manager canCreate = false',        () => expect(canCreateProfile('manager')).toBe(false))
  it('manager canRunSimulation = true',  () => expect(canRunSimulation('manager')).toBe(true))
  it('manager canApprove = false',       () => expect(canApproveProfile('manager')).toBe(false))

  it('pharmacist canRead = true',          () => expect(canReadProfile('pharmacist')).toBe(true))
  it('pharmacist canCreate = false',        () => expect(canCreateProfile('pharmacist')).toBe(false))
  it('pharmacist canRunSimulation = false', () => expect(canRunSimulation('pharmacist')).toBe(false))
  it('pharmacist canApprove = false',       () => expect(canApproveProfile('pharmacist')).toBe(false))
  it('pharmacist canArchive = false',       () => expect(canArchiveProfile('pharmacist')).toBe(false))

  it('admin cannot edit APPROVED profile', () => expect(canEditProfile('admin', 'APPROVED')).toBe(false))
  it('admin cannot edit PUBLISHED profile',() => expect(canEditProfile('admin', 'PUBLISHED')).toBe(false))
  it('admin cannot edit ARCHIVED profile', () => expect(canEditProfile('admin', 'ARCHIVED')).toBe(false))
  it('admin can edit VALIDATED profile',   () => expect(canEditProfile('admin', 'VALIDATED')).toBe(true))
  it('admin can edit SIMULATED profile',   () => expect(canEditProfile('admin', 'SIMULATED')).toBe(true))
})

// ════════════════════════════════════════════════════════════
// GROUP 17 — No forbidden imports in any Phase 1C file
// ════════════════════════════════════════════════════════════

describe('Phase 1C source purity', () => {
  it('store has no React import', async () => {
    const s = await storeSrc()
    expect(s).not.toContain("from 'react'")
  })
  it('store has no Firestore import', async () => {
    const s = await storeSrc()
    expect(s).not.toContain('firebase/firestore')
  })
  it('permissions hook has no Firestore import', async () => {
    const s = await permissionsSrc()
    expect(s).not.toContain('firebase/firestore')
  })
  it('profiles hook has no route import', async () => {
    const s = await profilesSrc()
    expect(s).not.toContain('react-router')
  })
  it('profile hook has no route import', async () => {
    const s = await profileSrc()
    expect(s).not.toContain('react-router')
  })
  it('simulation runs hook has no route import', async () => {
    const s = await simRunsSrc()
    expect(s).not.toContain('react-router')
  })
  it('no file references App.jsx', async () => {
    const files = await Promise.all([storeSrc(), profilesSrc(), profileSrc(), simRunsSrc(), permissionsSrc()])
    files.forEach((s) => expect(s).not.toContain('App.jsx'))
  })
  it('no file imports from Sidebar', async () => {
    const files = await Promise.all([storeSrc(), profilesSrc(), profileSrc(), simRunsSrc(), permissionsSrc()])
    files.forEach((s) => expect(s).not.toContain('Sidebar'))
  })
  it('no file imports from engine/', async () => {
    const files = await Promise.all([storeSrc(), profilesSrc(), profileSrc(), simRunsSrc(), permissionsSrc()])
    files.forEach((s) => {
      expect(s).not.toContain("from '../engine/")
      expect(s).not.toContain("from '../../engine/")
    })
  })
  it('no file has AI references', async () => {
    const files = await Promise.all([storeSrc(), profilesSrc(), profileSrc(), simRunsSrc(), permissionsSrc()])
    files.forEach((s) => {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
    })
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 18 — Refresh model: source verification
// ════════════════════════════════════════════════════════════

describe('Refresh model – source verification', () => {
  it('profiles hook exposes refresh()', async () => {
    const s = await profilesSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('profile hook exposes refresh()', async () => {
    const s = await profileSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('simulation runs hook exposes refresh()', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('refresh')
    expect(s).toContain('useCallback')
  })
  it('profiles hook has refreshKey state for triggering refresh', async () => {
    const s = await profilesSrc()
    expect(s).toContain('refreshKey')
  })
  it('profile hook has refreshKey state', async () => {
    const s = await profileSrc()
    expect(s).toContain('refreshKey')
  })
  it('simulation runs hook has refreshKey state', async () => {
    const s = await simRunsSrc()
    expect(s).toContain('refreshKey')
  })
  it('profiles hook returns refreshTimestamp', async () => {
    const s = await profilesSrc()
    expect(s).toContain('refreshTimestamp')
  })
  it('no hook uses setInterval (no auto-polling)', async () => {
    const files = await Promise.all([profilesSrc(), profileSrc(), simRunsSrc()])
    files.forEach((s) => expect(s).not.toContain('setInterval'))
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 19 — Error normalization: additional edge cases
// ════════════════════════════════════════════════════════════

describe('normalizeError – additional edge cases', () => {
  it('0 is handled without throwing', () => {
    expect(() => normalizeError(0)).not.toThrow()
  })
  it('empty string is handled without throwing', () => {
    expect(() => normalizeError('')).not.toThrow()
  })
  it('object without message is handled', () => {
    expect(() => normalizeError({ code: 'X' })).not.toThrow()
  })
  it('result always has 4 fields', () => {
    const cases = [null, undefined, 0, '', new Error('x'), { code: 'X' }]
    cases.forEach((c) => {
      const e = normalizeError(c)
      expect('message'   in e).toBe(true)
      expect('code'      in e).toBe(true)
      expect('timestamp' in e).toBe(true)
      expect('retryable' in e).toBe(true)
    })
  })
  it('permission-denied string variant maps to PERMISSION_DENIED', () => {
    const e = normalizeError(new Error('permission-denied'))
    expect(e.code).toBe('PERMISSION_DENIED')
  })
  it('timestamp is a valid ISO string', () => {
    const e = normalizeError(new Error('x'))
    expect(() => new Date(e.timestamp)).not.toThrow()
    expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 20 — Store actions are synchronous
// ════════════════════════════════════════════════════════════

describe('profileStudioStore – actions are synchronous', () => {
  beforeEach(() => useProfileStudioStore.getState().resetStore())

  it('setProfiles is sync', () => {
    useProfileStudioStore.getState().setProfiles([])
    expect(useProfileStudioStore.getState().profiles).toBeDefined()
  })
  it('setLoading is sync', () => {
    useProfileStudioStore.getState().setLoading(true)
    expect(useProfileStudioStore.getState().loading).toBe(true)
  })
  it('clearError is sync', () => {
    useProfileStudioStore.getState().clearError()
    expect(useProfileStudioStore.getState().error).toBeNull()
  })
  it('resetStore is sync', () => {
    useProfileStudioStore.getState().resetStore()
    expect(useProfileStudioStore.getState().profiles).toHaveLength(0)
  })
  it('multiple actions compose correctly', () => {
    const store = useProfileStudioStore.getState()
    store.setProfiles([{ id: 'a' }] as any)
    store.setLoading(true)
    store.setError({ message: 'e', code: 'C', timestamp: 't', retryable: false })
    const s = useProfileStudioStore.getState()
    expect(s.profiles).toHaveLength(1)
    expect(s.loading).toBe(true)
    expect(s.error?.code).toBe('C')
  })
})
