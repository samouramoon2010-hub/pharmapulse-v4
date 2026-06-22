// ============================================================
// Profile Studio — Zustand Store (Phase 1C)
//
// Central client-side state for Profile Studio.
// No persistence middleware. No localStorage. No subscriptions.
//
// NO pages. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import { create } from 'zustand'

import type {
  ProfileStudioProfileDoc,
  ProfileStudioSimulationRunDoc,
} from './persistenceTypes'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Normalised error type
// ════════════════════════════════════════════════════════════

/** Normalised error surface — never exposes raw Firebase errors. */
export interface ProfileStudioError {
  message:   string
  code:      string
  timestamp: string
  retryable: boolean
}

/**
 * Converts any thrown value into a normalised ProfileStudioError.
 * Raw Firebase errors are mapped to a safe user-facing message.
 */
export function normalizeError(err: unknown): ProfileStudioError {
  const timestamp = new Date().toISOString()

  if (err instanceof Error) {
    // The real Firebase JS SDK (v9 modular) never prefixes its error code
    // with "firestore/" — a genuine FirestoreError carries a bare code
    // like 'permission-denied' or 'unavailable', and its message is the
    // literal native string "Missing or insufficient permissions." (no
    // "firestore"/"Firebase"/"permission-denied" substring anywhere in
    // that text). The original detection below only matched our own
    // hand-thrown `PERMISSION_DENIED: ...` JS-guard errors and missed
    // every genuine SDK rejection, letting the raw native message leak
    // straight to the UI — exactly the "Missing or insufficient
    // permissions" bug. code === 'permission-denied' / 'unavailable' and
    // the literal native message text are added so real SDK errors are
    // caught too, without changing how our own JS-guard errors are
    // detected.
    const code          = (err as { code?: string }).code
    const isFirebase    = err.message.includes('firestore') ||
                          err.message.includes('Firebase') ||
                          err.message.includes('permission-denied') ||
                          code?.startsWith('firestore/')
    const isPermission  = err.message.startsWith('PERMISSION_DENIED') ||
                          err.message.includes('permission-denied') ||
                          err.message.toLowerCase().includes('missing or insufficient permissions') ||
                          code === 'permission-denied'
    const isNetwork     = err.message.includes('unavailable') ||
                          err.message.includes('network') ||
                          err.message.includes('offline') ||
                          code === 'unavailable'

    if (isPermission) {
      return {
        message:   'You do not have permission to perform this action.',
        code:      'PERMISSION_DENIED',
        timestamp,
        retryable: false,
      }
    }
    if (isNetwork) {
      return {
        message:   'Network error — please check your connection and try again.',
        code:      'NETWORK_ERROR',
        timestamp,
        retryable: true,
      }
    }
    if (isFirebase) {
      return {
        message:   'A data service error occurred. Please try again.',
        code:      'SERVICE_ERROR',
        timestamp,
        retryable: true,
      }
    }
    return {
      message:   err.message,
      code:      (err as { code?: string }).code ?? 'UNKNOWN_ERROR',
      timestamp,
      retryable: false,
    }
  }

  return {
    message:   'An unexpected error occurred.',
    code:      'UNKNOWN_ERROR',
    timestamp,
    retryable: false,
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Store shape
// ════════════════════════════════════════════════════════════

export interface ProfileStudioState {
  // ── Data ──────────────────────────────────────────────────
  profiles:          ProfileStudioProfileDoc[]
  currentProfile:    ProfileStudioProfileDoc | null
  simulationRuns:    ProfileStudioSimulationRunDoc[]
  selectedProfileId: string | null

  // ── UI state ──────────────────────────────────────────────
  loading:     boolean
  error:       ProfileStudioError | null
  lastUpdated: string | null
}

export interface ProfileStudioActions {
  setProfiles:          (profiles: ProfileStudioProfileDoc[])                 => void
  setCurrentProfile:    (profile:  ProfileStudioProfileDoc | null)            => void
  setSimulationRuns:    (runs:     ProfileStudioSimulationRunDoc[])           => void
  setLoading:           (loading:  boolean)                                   => void
  setError:             (error:    ProfileStudioError | null)                 => void
  clearError:           ()                                                    => void
  setSelectedProfileId: (id:       string | null)                             => void
  resetStore:           ()                                                    => void
}

export type ProfileStudioStore = ProfileStudioState & ProfileStudioActions

// ════════════════════════════════════════════════════════════
// SECTION 3 — Initial state
// ════════════════════════════════════════════════════════════

const INITIAL_STATE: ProfileStudioState = {
  profiles:          [],
  currentProfile:    null,
  simulationRuns:    [],
  selectedProfileId: null,
  loading:           false,
  error:             null,
  lastUpdated:       null,
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Store definition
// ════════════════════════════════════════════════════════════

export const useProfileStudioStore = create<ProfileStudioStore>((set) => ({
  ...INITIAL_STATE,

  setProfiles: (profiles) =>
    set({ profiles, lastUpdated: new Date().toISOString() }),

  setCurrentProfile: (currentProfile) =>
    set({ currentProfile }),

  setSimulationRuns: (simulationRuns) =>
    set({ simulationRuns, lastUpdated: new Date().toISOString() }),

  setLoading: (loading) =>
    set({ loading }),

  setError: (error) =>
    set({ error }),

  clearError: () =>
    set({ error: null }),

  setSelectedProfileId: (selectedProfileId) =>
    set({ selectedProfileId }),

  resetStore: () =>
    set({ ...INITIAL_STATE }),
}))
