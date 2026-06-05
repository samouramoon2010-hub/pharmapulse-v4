// ============================================================
// Region Store — RBAC Phase 1 Territory Infrastructure
// ============================================================
import { create } from 'zustand'
import {
  subscribeToRegions, createRegion,
  updateRegion, deleteRegion,
} from '../services/regionService'
import type { Region } from '../services/territoryTypes'

interface RegionStore {
  regions:  Region[]
  loading:  boolean
  error:    string | null
  subscribe: () => () => void
  create:    (data: Partial<Region>, actorId: string, actorRole: string) => Promise<Region>
  update:    (id: string, data: Partial<Region>, actorId: string, actorRole: string) => Promise<void>
  remove:    (id: string, actorId: string, actorRole: string) => Promise<void>
}

export const useRegionStore = create<RegionStore>((set) => ({
  regions:  [],
  loading:  true,
  error:    null,

  subscribe: () => {
    return subscribeToRegions((list) => set({ regions: list, loading: false }))
  },

  create: async (data, actorId, actorRole) => {
    return createRegion(data, actorId, actorRole)
  },

  update: async (id, data, actorId, actorRole) => {
    return updateRegion(id, data, actorId, actorRole)
  },

  remove: async (id, actorId, actorRole) => {
    return deleteRegion(id, actorId, actorRole)
  },
}))
