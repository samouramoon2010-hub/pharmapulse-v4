// ============================================================
// District Store — RBAC Phase 1 Territory Infrastructure
// ============================================================
import { create } from 'zustand'
import {
  subscribeToDistricts, createDistrict,
  updateDistrict, deleteDistrict,
  assignPharmacyToDistrict, removePharmacyFromDistrict,
} from '../services/districtService'
import type { District } from '../services/territoryTypes'

interface DistrictStore {
  districts:  District[]
  loading:    boolean
  error:      string | null
  subscribe:  () => () => void
  create:     (data: Partial<District>, actorId: string, actorRole: string) => Promise<District>
  update:     (id: string, data: Partial<District>, actorId: string, actorRole: string) => Promise<void>
  remove:     (id: string, actorId: string, actorRole: string) => Promise<void>
  assignPharmacy:  (districtId: string, pharmacyId: string, actorId: string, actorRole: string) => Promise<void>
  removePharmacy:  (districtId: string, pharmacyId: string, actorId: string, actorRole: string) => Promise<void>
}

export const useDistrictStore = create<DistrictStore>((set) => ({
  districts:  [],
  loading:    true,
  error:      null,

  subscribe: () => {
    return subscribeToDistricts((list) => set({ districts: list, loading: false }))
  },

  create: async (data, actorId, actorRole) => {
    return createDistrict(data, actorId, actorRole)
  },

  update: async (id, data, actorId, actorRole) => {
    return updateDistrict(id, data, actorId, actorRole)
  },

  remove: async (id, actorId, actorRole) => {
    return deleteDistrict(id, actorId, actorRole)
  },

  assignPharmacy: async (districtId, pharmacyId, actorId, actorRole) => {
    return assignPharmacyToDistrict(districtId, pharmacyId, actorId, actorRole)
  },

  removePharmacy: async (districtId, pharmacyId, actorId, actorRole) => {
    return removePharmacyFromDistrict(districtId, pharmacyId, actorId, actorRole)
  },
}))
