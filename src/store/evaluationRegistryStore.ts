// ============================================================
// Evaluation Registry Store — ER-0
// ============================================================
import { create } from 'zustand'
import {
  subscribeEvaluationProfiles,
  createEvaluationProfile,
  updateEvaluationProfile,
  publishEvaluationProfile,
  archiveEvaluationProfile,
  createNewVersion,
} from '../services/evaluationRegistryService'
import type { EvaluationProfile } from '../engine/evaluationRegistry/evaluationRegistryTypes'

interface EvaluationRegistryStore {
  profiles: EvaluationProfile[]
  loading:  boolean
  error:    string | null

  subscribe:      () => () => void
  create:         (data: Partial<EvaluationProfile>, actorId: string, actorRole: string) => Promise<EvaluationProfile>
  update:         (id: string, data: Partial<EvaluationProfile>, actorId: string, actorRole: string) => Promise<void>
  publish:        (id: string, actorId: string, actorRole: string) => Promise<void>
  archive:        (id: string, actorId: string, actorRole: string) => Promise<void>
  newVersion:     (sourceId: string, actorId: string, actorRole: string) => Promise<EvaluationProfile>
}

export const useEvaluationRegistryStore = create<EvaluationRegistryStore>((set) => ({
  profiles: [],
  loading:  true,
  error:    null,

  subscribe: () => {
    // Reset to loading state before each subscription so that:
    // 1. Re-mounting the page always shows a spinner until data arrives
    // 2. Stale profiles from a previous mount are cleared immediately
    set({ loading: true, profiles: [], error: null })
    return subscribeEvaluationProfiles(
      (list) => set({ profiles: list, loading: false, error: null }),
      (err)  => set({ loading: false, error: err.message }),
    )
  },

  create: (data, actorId, actorRole) =>
    createEvaluationProfile(data, actorId, actorRole),

  update: (id, data, actorId, actorRole) =>
    updateEvaluationProfile(id, data, actorId, actorRole),

  publish: (id, actorId, actorRole) =>
    publishEvaluationProfile(id, actorId, actorRole),

  archive: (id, actorId, actorRole) =>
    archiveEvaluationProfile(id, actorId, actorRole),

  newVersion: (sourceId, actorId, actorRole) =>
    createNewVersion(sourceId, actorId, actorRole),
}))
