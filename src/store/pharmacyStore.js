// ============================================================
// Pharmacy Store — realtime Firestore
// ============================================================
import { create } from 'zustand'
import {
  subscribeToPharmacies, createPharmacy,
  updatePharmacy, togglePharmacyStatus, deletePharmacy,
} from '../services/pharmacyService'

export const usePharmacyStore = create((set, get) => ({
  pharmacies: [],
  loading:    true,
  error:      null,

  subscribe: () => {
    return subscribeToPharmacies((list) => set({ pharmacies: list, loading: false }))
  },

  create: async (data, actorId, actorRole) => {
    return createPharmacy(data, actorId, actorRole)
  },

  update: async (id, data, actorId, actorRole) => {
    return updatePharmacy(id, data, actorId, actorRole)
  },

  toggle: async (id, actorId, actorRole) => {
    return togglePharmacyStatus(id, actorId, actorRole)
  },

  remove: async (id, actorId, actorRole) => {
    return deletePharmacy(id, actorId, actorRole)
  },

  getById: (id) => get().pharmacies.find((p) => p.id === id),
  getByCode: (code) => get().pharmacies.find((p) => p.code === code),
  getActive: () => get().pharmacies.filter((p) => p.active !== false),

  clearError: () => set({ error: null }),
}))
